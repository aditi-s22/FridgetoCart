import type { Recipe } from "@ftc/shared";
import { Command, MemorySaver } from "@langchain/langgraph";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../http";
import { recipeCacheKey } from "../services/cache";
import { BASE_STATE, DOCS, LEXICON, PREFS, TAGS } from "./testFixtures";

const cache = new Map<string, Recipe[]>();
vi.mock("../services/cache", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/cache")>();
  return {
    ...real,
    getCachedRecipes: vi.fn(async (k: string) => cache.get(k) ?? null),
    setCachedRecipes: vi.fn(async (k: string, r: Recipe[]) => void cache.set(k, r)),
  };
});
vi.mock("../services/llm", () => ({ structured: vi.fn(), embed: vi.fn(async () => [[0.1, 0.2]]), modelOf: (r: string) => r }));
vi.mock("../services/storage", () => ({ readImageAsDataUrl: vi.fn(async () => "data:image/jpeg;base64,AAAA") }));
vi.mock("../services/normalizer", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/normalizer")>();
  return { ...real, loadLexicon: vi.fn(async () => LEXICON), loadCanonTags: vi.fn(async () => TAGS), nearestByEmbedding: vi.fn(async (n: string[]) => n.map(() => null)) };
});
vi.mock("../services/recipes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/recipes")>();
  return { ...real, searchRecipeDocs: vi.fn(async () => DOCS) };
});

const { structured, embed } = await import("../services/llm");
const { buildGraph } = await import("./build");
const { progressOf } = await import("./progress");

const thread = { configurable: { thread_id: "s1" } };
const item = (rawName: string, confidence: number) => ({ rawName, qty: "1", confidence });

beforeEach(() => {
  vi.clearAllMocks();
  cache.clear();
});

describe("confidence routing", () => {
  it("keeps the fast model's items when it is confident", async () => {
    vi.mocked(structured).mockResolvedValueOnce({ items: [item("tamatar", 0.9), item("paneer", 0.8)] });
    const g = buildGraph(new MemorySaver());
    await g.invoke({ ...BASE_STATE }, thread);
    const p = await progressOf(g, "s1");
    expect(vi.mocked(structured).mock.calls.map((c) => c[0].role)).toEqual(["visionFast"]);
    expect(p.values.detectedBy).toBe("visionFast");
  });

  it("re-detects with the strong model when average confidence is below 0.6", async () => {
    vi.mocked(structured)
      .mockResolvedValueOnce({ items: [item("tamatar", 0.4), item("something", 0.3)] })
      .mockResolvedValueOnce({ items: [item("tamatar", 0.9), item("paneer", 0.85)] });
    const g = buildGraph(new MemorySaver());
    await g.invoke({ ...BASE_STATE }, thread);
    const p = await progressOf(g, "s1");
    expect(vi.mocked(structured).mock.calls.map((c) => c[0].role)).toEqual(["visionFast", "visionStrong"]);
    expect(p.values.detectedBy).toBe("visionStrong");
    expect(p.values.items?.map((i) => i.canonicalId)).toEqual(["tomato", "paneer"]);
  });

  it("falls back to the fast items if the strong model fails", async () => {
    vi.mocked(structured)
      .mockResolvedValueOnce({ items: [item("tamatar", 0.4)] })
      .mockRejectedValueOnce(new AppError(502, "llm_unavailable", "down"));
    const g = buildGraph(new MemorySaver());
    await g.invoke({ ...BASE_STATE }, thread);
    const p = await progressOf(g, "s1");
    expect(p.pending?.type).toBe("review_items");
    expect(p.values.detectedBy).toBe("visionFast");
  });
});

describe("recipe cache", () => {
  const edited = [
    { canonicalId: "tomato", name: "Tomato", qty: 3, unit: null },
    { canonicalId: "paneer", name: "Paneer", qty: 1, unit: null },
    { canonicalId: "onion", name: "Onion", qty: 2, unit: null },
  ];
  const picks = {
    recipes: [
      { sourceDocId: "ds3", title: "Paneer Bhurji", ingredientIds: ["paneer", "onion"], note: null },
      { sourceDocId: "ds2", title: "Tomato Onion Sabzi", ingredientIds: ["tomato", "onion"], note: null },
      { sourceDocId: "ds1", title: "Matar Paneer", ingredientIds: ["paneer", "peas", "tomato"], note: null },
    ],
  };

  async function scanAndReview(thread_id: string) {
    const g = buildGraph(new MemorySaver());
    const t = { configurable: { thread_id } };
    await g.invoke({ ...BASE_STATE, scanId: thread_id }, t);
    await g.invoke(new Command({ resume: edited }), t);
    return progressOf(g, thread_id);
  }

  it("serves a repeat scan with the same items and prefs from cache, skipping retrieval and the LLM", async () => {
    vi.mocked(structured)
      .mockResolvedValueOnce({ items: [item("tamatar", 0.9)] })
      .mockResolvedValueOnce(picks)
      .mockResolvedValueOnce({ items: [item("tamatar", 0.9)] });

    const first = await scanAndReview("a");
    expect(first.values.recipesCached).toBe(false);
    const second = await scanAndReview("b");

    expect(second.values.recipesCached).toBe(true);
    expect(second.values.recipes).toEqual(first.values.recipes);
    expect(vi.mocked(structured).mock.calls.map((c) => c[0].node)).toEqual(["detectItems", "generateRecipes", "detectItems"]);
    expect(embed).toHaveBeenCalledTimes(1); // only the first scan's retrieval
  });

  it("keys on sorted canonical ids and prefs", () => {
    const k = recipeCacheKey(edited, PREFS);
    expect(recipeCacheKey([...edited].reverse(), PREFS)).toBe(k);
    expect(recipeCacheKey(edited, { ...PREFS, avoid: ["Onion"] })).not.toBe(k);
    expect(recipeCacheKey(edited.slice(1), PREFS)).not.toBe(k);
  });
});
