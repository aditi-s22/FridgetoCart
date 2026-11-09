import type { AppliedSubstitution, Recipe } from "@ftc/shared";
import { applySubstitutions } from "@ftc/shared";
import { describe, expect, it, vi } from "vitest";
import { BASE_STATE, TAGS } from "../graph/testFixtures";

vi.mock("./llm", () => ({ structured: vi.fn(), embed: vi.fn(), modelOf: (r: string) => r }));
vi.mock("./normalizer", async (importOriginal) => ({ ...(await importOriginal<typeof import("./normalizer")>()), loadCanonTags: vi.fn(async () => TAGS) }));

const { vetAccepted, vetSuggestions } = await import("./substitutions");
const { diffMissing } = await import("../graph/nodes/diffMissing");

const names = new Map([
  ["paneer", "Paneer"],
  ["tomato", "Tomato"],
  ["curd", "Curd"],
  ["cream", "Fresh Cream"],
  ["chicken", "Chicken"],
  ["egg", "Egg"],
  ["onion", "Onion"],
  ["salt", "Salt"],
]);
const tags = new Map([...TAGS, ["curd", []], ["cream", []]]);
const ctx = (over: Partial<{ diet: "veg" | "jain"; avoid: string[]; have: string[] }> = {}) => ({
  names,
  tags,
  prefs: { diet: over.diet ?? "veg", avoid: [], maxTimeMins: 30 },
  avoidIds: new Set(over.avoid ?? []),
  haveIds: new Set(over.have ?? ["curd"]),
});

const recipe: Recipe = {
  id: "r1",
  title: "Paneer Butter Masala",
  sourceDocId: "r1",
  ingredients: [
    { canonicalId: "paneer", name: "Paneer", qty: 200, unit: "g" },
    { canonicalId: "cream", name: "Fresh Cream", qty: 50, unit: "ml" },
    { canonicalId: "salt", name: "Salt", qty: null, unit: null },
  ],
  steps: ["Cook gravy.", "Add cream."],
  timeMins: 30,
  dietTags: ["veg"],
  have: ["paneer"],
  missing: ["cream"],
  note: null,
  sourceUrl: null,
};
const opt = (substituteId: string) => ({ substituteId, qty: 50, unit: "g", reason: "r", flavorImpact: "tangier", stepChanges: ["Add off the heat."] });
const raw = (...ids: string[]) => ({ suggestions: [{ originalId: "cream", options: ids.map(opt) }] });

describe("vetSuggestions", () => {
  it("drops unknown, in-recipe, diet-breaking and avoided substitutes", () => {
    const out = vetSuggestions(raw("made_up", "paneer", "chicken", "egg", "onion"), recipe, ctx({ avoid: ["onion"] }));
    expect(out).toEqual([]);
  });

  it("drops substitutes for ingredients that are not missing", () => {
    const out = vetSuggestions({ suggestions: [{ originalId: "paneer", options: [opt("curd")] }] }, recipe, ctx());
    expect(out).toEqual([]);
  });

  it("marks availability from the scan and lists pantry items first", () => {
    const [s] = vetSuggestions(raw("tomato", "curd"), recipe, ctx());
    expect(s?.options.map((o) => [o.substituteId, o.availability])).toEqual([
      ["curd", "in_fridge"],
      ["tomato", "must_buy"],
    ]);
    expect(s?.options[0]?.substituteName).toBe("Curd");
  });

  it("applies the jain restriction (nojain tags)", () => {
    expect(vetSuggestions(raw("onion"), recipe, ctx({ diet: "jain" }))).toEqual([]);
  });
});

describe("vetAccepted", () => {
  const sub: AppliedSubstitution = { originalId: "cream", substituteId: "curd", substituteName: "hacked", qty: 50, unit: "g", stepChanges: [] };
  it("takes the name from the canon", () => {
    expect(vetAccepted([sub], recipe, ctx())[0]?.substituteName).toBe("Curd");
  });
  it("rejects invalid substitutions", () => {
    expect(() => vetAccepted([{ ...sub, substituteId: "chicken" }], recipe, ctx())).toThrow(/diet/);
    expect(() => vetAccepted([{ ...sub, originalId: "paneer" }], recipe, ctx())).toThrow(/not a missing/);
  });
});

describe("applySubstitutions", () => {
  const sub: AppliedSubstitution = { originalId: "cream", substituteId: "curd", substituteName: "Curd", qty: 50, unit: "g", stepChanges: ["Add off the heat."] };
  it("returns a new effective recipe and leaves the original untouched", () => {
    const before = structuredClone(recipe);
    const eff = applySubstitutions(recipe, [sub], new Set(["paneer", "curd"]));
    expect(recipe).toEqual(before);
    expect(eff.missing).toEqual([]);
    expect(eff.have).toEqual(["paneer", "curd"]);
    expect(eff.ingredients.map((i) => i.canonicalId)).toEqual(["paneer", "curd", "salt"]);
    expect(eff.steps.at(-1)).toContain("Add off the heat.");
  });
  it("keeps a bought substitute as missing", () => {
    expect(applySubstitutions(recipe, [sub], new Set(["paneer"])).missing).toEqual(["curd"]);
  });
});

describe("diffMissing with substitutions", () => {
  const state = { ...BASE_STATE, recipes: [recipe], selectedRecipeId: "r1", confirmed: [{ canonicalId: "paneer", name: "Paneer", qty: 1, unit: null }, { canonicalId: "curd", name: "Curd", qty: 1, unit: null }] };
  it("still reports the original missing ingredient without substitutions", async () => {
    expect(await diffMissing(state)).toMatchObject({ missing: [{ canonicalId: "cream" }] });
  });
  it("excludes an accepted substitution from the cart list", async () => {
    const sub: AppliedSubstitution = { originalId: "cream", substituteId: "curd", substituteName: "Curd", qty: 50, unit: "g", stepChanges: [] };
    expect((await diffMissing({ ...state, substitutions: [sub] })).missing).toEqual([]);
  });
});
