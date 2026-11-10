import type { StoreCart, StoreProduct } from "@ftc/shared";
import { AIMessage } from "@langchain/core/messages";
import { Command, MemorySaver } from "@langchain/langgraph";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../http";
import { BASE_STATE, DOCS, LEXICON, TAGS } from "./testFixtures";

// In-memory stand-in for apps/store with the same semantics: set-qty upserts + idempotency keys.
const PRODUCTS: StoreProduct[] = [
  { id: "p_paneer", canonicalId: "paneer", name: "Fresh Paneer", unit: "200 g", price: 90, stock: 10 },
  { id: "p_peas", canonicalId: "peas", name: "Green Peas", unit: "500 g", price: 85, stock: 0 },
  { id: "p_onion", canonicalId: "onion", name: "Onion", unit: "1 kg", price: 42, stock: 50 },
];
const fake = { lines: new Map<string, number>(), keys: new Set<string>() };
function cartView(): StoreCart {
  const items = [...fake.lines].map(([productId, qty]) => {
    const p = PRODUCTS.find((x) => x.id === productId)!;
    return { productId, canonicalId: p.canonicalId, name: p.name, unit: p.unit, qty, price: p.price, deepLinks: { blinkit: "https://b.x", zepto: "https://z.x" } };
  });
  return { id: "c1", items, total: items.reduce((s, i) => s + i.qty * i.price, 0) };
}

vi.mock("../services/storeClient", () => ({
  storeClient: {
    search: vi.fn(async (q: string) => PRODUCTS.filter((p) => p.name.toLowerCase().includes(q.toLowerCase().split(" ").pop()!))),
    stock: vi.fn(async (id: string) => {
      const p = PRODUCTS.find((x) => x.id === id)!;
      return { productId: id, stock: p.stock, inStock: p.stock > 0 };
    }),
    createCart: vi.fn(async () => cartView()),
    getCart: vi.fn(async () => cartView()),
    setItem: vi.fn(async (_cartId: string, productId: string, qty: number, key: string) => {
      if (!fake.keys.has(key)) {
        fake.keys.add(key);
        if (qty === 0) fake.lines.delete(productId);
        else fake.lines.set(productId, qty);
      }
      return cartView();
    }),
  },
}));
vi.mock("../services/llm", () => ({ structured: vi.fn(), embed: vi.fn(async () => [[0.1, 0.2]]), agentStep: vi.fn(), modelOf: (r: string) => r }));
vi.mock("../services/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/cache")>()),
  getCachedRecipes: vi.fn(async () => null),
  setCachedRecipes: vi.fn(async () => undefined),
}));
vi.mock("../services/storage", () => ({ readImageAsDataUrl: vi.fn(async () => "data:image/jpeg;base64,AAAA") }));
vi.mock("../services/normalizer", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/normalizer")>();
  return { ...real, loadLexicon: vi.fn(async () => LEXICON), loadCanonTags: vi.fn(async () => TAGS), nearestByEmbedding: vi.fn(async (n: string[]) => n.map(() => null)) };
});
vi.mock("../services/recipes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/recipes")>();
  return { ...real, searchRecipeDocs: vi.fn(async () => DOCS) };
});

const { structured, agentStep } = await import("../services/llm");
const { buildGraph } = await import("./build");
const { progressOf, isStalledAfterPick } = await import("./progress");
const { restartPick } = await import("./restartPick");
const { storeClient } = await import("../services/storeClient");

const thread = { configurable: { thread_id: "s1" } };
let n = 0;
const calls = (...c: [string, Record<string, unknown>][]) =>
  new AIMessage({ content: "", tool_calls: c.map(([name, args]) => ({ name, args, id: `t${n++}`, type: "tool_call" as const })) });

/** Runs a scan up to the recipe pick: the user only has tomato and onion. */
async function scanToPick() {
  vi.mocked(structured)
    .mockResolvedValueOnce({ items: [{ rawName: "tamatar", qty: "3", confidence: 0.9 }] })
    .mockResolvedValueOnce({
      recipes: [
        { sourceDocId: "ds1", title: "Matar Paneer", ingredientIds: ["paneer", "peas", "tomato", "onion"], note: null },
        { sourceDocId: "ds2", title: "Tomato Onion Sabzi", ingredientIds: ["tomato", "onion"], note: null },
        { sourceDocId: "ds3", title: "Paneer Bhurji", ingredientIds: ["paneer", "onion"], note: null },
      ],
    });
  const graph = buildGraph(new MemorySaver());
  await graph.invoke({ ...BASE_STATE }, thread);
  await graph.invoke(new Command({ resume: [{ canonicalId: "tomato", name: "Tomato", qty: 3, unit: null }, { canonicalId: "onion", name: "Onion", qty: 2, unit: null }] }), thread);
  return graph;
}

/** ...then picks "Matar Paneer" (ds1), which needs paneer and peas. */
async function scanAndPickDs1() {
  const graph = await scanToPick();
  await graph.invoke(new Command({ resume: "ds1" }), thread);
  return progressOf(graph, "s1");
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.lines.clear();
  fake.keys.clear();
});

describe("cart", () => {
  it("agent fills the cart; duplicate adds don't duplicate; out-of-stock items get deep links", async () => {
    vi.mocked(agentStep)
      .mockResolvedValueOnce(calls(["searchProduct", { query: "paneer" }], ["searchProduct", { query: "green peas" }]))
      .mockResolvedValueOnce(calls(["checkStock", { productId: "p_paneer" }], ["checkStock", { productId: "p_peas" }]))
      .mockResolvedValueOnce(calls(["addToCart", { productId: "p_paneer", qty: 1 }], ["addToCart", { productId: "p_paneer", qty: 1 }]))
      .mockResolvedValueOnce(new AIMessage("Added paneer; peas are out of stock."));

    const p = await scanAndPickDs1();

    expect(p.values.missing?.map((m) => m.canonicalId)).toEqual(["paneer", "peas"]);
    expect(p.values.cart?.items.map((i) => [i.productId, i.qty])).toEqual([["p_paneer", 1]]);
    expect(p.values.cart?.total).toBe(90);
    expect(p.values.cart?.unavailable).toEqual([
      expect.objectContaining({ canonicalId: "peas", reason: "out_of_stock", deepLinks: expect.objectContaining({ blinkit: expect.stringContaining("blinkit.com") }) }),
    ]);
    expect(agentStep).toHaveBeenCalledTimes(4);
  });

  it("removes off-list products the agent added", async () => {
    vi.mocked(agentStep)
      .mockResolvedValueOnce(calls(["addToCart", { productId: "p_paneer", qty: 1 }], ["addToCart", { productId: "p_onion", qty: 1 }]))
      .mockResolvedValueOnce(new AIMessage("Done."));
    const p = await scanAndPickDs1();
    expect(p.values.cart?.items.map((i) => i.canonicalId)).toEqual(["paneer"]); // onion was already at home
  });

  it("still builds the cart when the model is down", async () => {
    vi.mocked(agentStep).mockRejectedValue(new AppError(502, "llm_unavailable", "down"));
    const p = await scanAndPickDs1();
    expect(p.values.cart?.items.map((i) => [i.canonicalId, i.qty])).toEqual([["paneer", 1]]);
    expect(p.values.cart?.unavailable.map((u) => u.canonicalId)).toEqual(["peas"]);
  });

  it("stops the agent after 10 turns", async () => {
    vi.mocked(agentStep).mockImplementation(async () => calls(["searchProduct", { query: "paneer" }]));
    const p = await scanAndPickDs1();
    expect(agentStep).toHaveBeenCalledTimes(10);
    expect(p.values.cart?.items.map((i) => i.canonicalId)).toEqual(["paneer"]); // finalizeCart repaired it
  });
});

describe("a pick that fails while building the cart", () => {
  it("leaves a stalled scan that can be picked again with a different recipe", async () => {
    const graph = await scanToPick();
    // The store is down when the cart agent starts.
    vi.mocked(storeClient.createCart).mockRejectedValueOnce(new AppError(502, "store_unavailable", "Store is unreachable"));
    await expect(graph.invoke(new Command({ resume: "ds1" }), thread)).rejects.toMatchObject({ code: "store_unavailable" });

    const stalled = await progressOf(graph, "s1");
    expect(stalled.pending).toBeNull();
    expect(stalled.values.selectedRecipeId).toBe("ds1");
    expect(isStalledAfterPick(stalled)).toBe(true);

    // The user picks another recipe that has missing items (Paneer Bhurji needs paneer): they go to the cart.
    vi.mocked(agentStep).mockResolvedValueOnce(calls(["addToCart", { productId: "p_paneer", qty: 1 }])).mockResolvedValueOnce(new AIMessage("Done."));
    await restartPick(graph, "s1", "ds3", []);

    const done = await progressOf(graph, "s1");
    expect(isStalledAfterPick(done)).toBe(false);
    expect(done.values.selectedRecipeId).toBe("ds3");
    expect(done.values.missing?.map((m) => m.canonicalId)).toEqual(["paneer"]);
    expect(done.values.cart?.items.map((i) => i.canonicalId)).toEqual(["paneer"]);
  });

  it("can also retry the same recipe once the store is back", async () => {
    const graph = await scanToPick();
    vi.mocked(storeClient.createCart).mockRejectedValueOnce(new AppError(502, "store_unavailable", "down"));
    await expect(graph.invoke(new Command({ resume: "ds1" }), thread)).rejects.toBeTruthy();

    vi.mocked(agentStep).mockResolvedValueOnce(calls(["addToCart", { productId: "p_paneer", qty: 1 }])).mockResolvedValueOnce(new AIMessage("Done."));
    await restartPick(graph, "s1", "ds1", []);

    const done = await progressOf(graph, "s1");
    expect(done.values.missing?.map((m) => m.canonicalId)).toEqual(["paneer", "peas"]);
    expect(done.values.cart?.items.map((i) => i.canonicalId)).toEqual(["paneer"]);
    expect(done.values.cart?.unavailable.map((u) => u.canonicalId)).toEqual(["peas"]); // out of stock → deep links
  });
});
