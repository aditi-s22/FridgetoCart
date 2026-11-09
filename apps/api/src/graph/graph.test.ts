import { Command, MemorySaver } from "@langchain/langgraph";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_STATE, DOCS, LEXICON, TAGS } from "./testFixtures";

vi.mock("../services/llm", () => ({ structured: vi.fn(), embed: vi.fn(async () => [[0.1, 0.2]]), modelOf: (r: string) => r }));
vi.mock("../services/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/cache")>()),
  getCachedRecipes: vi.fn(async () => null),
  setCachedRecipes: vi.fn(async () => undefined),
}));
vi.mock("../services/storage", () => ({ readImageAsDataUrl: vi.fn(async () => "data:image/jpeg;base64,AAAA") }));
vi.mock("../services/normalizer", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/normalizer")>();
  return {
    ...real,
    loadLexicon: vi.fn(async () => LEXICON),
    loadCanonTags: vi.fn(async () => TAGS),
    nearestByEmbedding: vi.fn(async (names: string[]) => names.map(() => null)),
  };
});
vi.mock("../services/recipes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/recipes")>();
  return { ...real, searchRecipeDocs: vi.fn(async () => DOCS) };
});

const { structured } = await import("../services/llm");
const { buildGraph } = await import("./build");
const { progressOf } = await import("./progress");

const thread = { configurable: { thread_id: "s1" } };
const detection = { items: [{ rawName: "tamatar", qty: "3", confidence: 0.9 }, { rawName: "paneer", qty: "1 packet", confidence: 0.5 }] };
const goodPicks = {
  recipes: [
    { sourceDocId: "ds3", title: "Paneer Bhurji", ingredientIds: ["paneer", "onion"], note: null },
    { sourceDocId: "ds2", title: "Tomato Onion Sabzi", ingredientIds: ["tomato", "onion"], note: null },
    { sourceDocId: "ds1", title: "Matar Paneer", ingredientIds: ["paneer", "peas", "tomato"], note: null },
  ],
};
const edited = [
  { canonicalId: "tomato", name: "Tomato", qty: 3, unit: null },
  { canonicalId: "paneer", name: "Paneer", qty: 1, unit: "packet" },
  { canonicalId: "unknown:pyaaz", name: "pyaaz", qty: 2, unit: null }, // user-added, resolved via synonyms
];

beforeEach(() => vi.clearAllMocks());

describe("scan graph", () => {
  it("pauses for review, survives a restart, generates recipes, pauses for a pick", async () => {
    vi.mocked(structured).mockResolvedValueOnce(detection).mockResolvedValueOnce(goodPicks);
    const saver = new MemorySaver();

    await buildGraph(saver).invoke({ ...BASE_STATE }, thread);
    // A fresh graph on the same checkpointer = the API restarted mid-review.
    const restarted = buildGraph(saver);
    const atReview = await progressOf(restarted, "s1");
    expect(atReview.pending?.type).toBe("review_items");
    expect(atReview.values.items?.map((i) => i.canonicalId)).toEqual(["tomato", "paneer"]);

    await restarted.invoke(new Command({ resume: edited }), thread);
    const atPick = await progressOf(restarted, "s1");
    expect(atPick.pending?.type).toBe("pick_recipe");
    expect(atPick.values.confirmed?.map((i) => i.canonicalId)).toEqual(["tomato", "paneer", "onion"]);
    const recipes = atPick.values.recipes ?? [];
    expect(recipes.map((r) => r.sourceDocId)).toEqual(["ds3", "ds2", "ds1"]);
    expect(recipes[2]?.missing).toEqual(["peas"]);

    await restarted.invoke(new Command({ resume: "ds2" }), thread);
    const done = await progressOf(restarted, "s1");
    expect(done.pending).toBeNull();
    expect(done.values.selectedRecipeId).toBe("ds2");
  });

  it("retries once on invalid picks, then falls back to the retrieved docs", async () => {
    const bad = { recipes: [{ sourceDocId: "ds9", title: "Made up", ingredientIds: ["tomato"], note: null }] };
    vi.mocked(structured).mockResolvedValueOnce(detection).mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);
    const graph = buildGraph(new MemorySaver());

    await graph.invoke({ ...BASE_STATE }, thread);
    await graph.invoke(new Command({ resume: edited }), thread);

    const second = vi.mocked(structured).mock.calls[2]?.[0];
    expect(String(second?.messages[1]?.content)).toMatch(/previous answer was rejected: .*ds9 is not one of the provided docs/);
    const p = await progressOf(graph, "s1");
    expect(p.pending?.type).toBe("pick_recipe");
    // Unadapted fallback in reranked order (owned ingredients first), still grounded in docs.
    expect(p.values.recipes?.map((r) => r.id)).toEqual(["ds3", "ds2", "ds1", "ds4"]);
  });
});
