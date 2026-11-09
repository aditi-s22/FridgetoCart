import { describe, expect, it } from "vitest";
import { rerank } from "../../services/recipes";
import { CONFIRMED, DOCS, PREFS, TAGS } from "../testFixtures";
import { type BuildCtx, buildRecipe, fallbackRecipes, validatePicks } from "./recipeBuild";

const ctx: BuildCtx = { docs: DOCS, confirmed: CONFIRMED, prefs: PREFS, tags: TAGS, avoidIds: new Set() };
const pick = (sourceDocId: string, ingredientIds: string[], note: string | null = null) => ({
  sourceDocId,
  title: sourceDocId,
  ingredientIds,
  note,
});

describe("validatePicks", () => {
  it("accepts picks grounded in the docs, including swaps from the user's items", () => {
    const picks = [pick("ds1", ["paneer", "peas", "tomato"]), pick("ds2", ["tomato", "onion"]), pick("ds4", ["peas", "paneer"], "Add paneer")];
    expect(validatePicks(picks, ctx)).toEqual([]);
  });

  it("rejects unknown docs, duplicates, foreign ingredients, diet breaks and too few picks", () => {
    const issues = validatePicks([pick("ds9", ["tomato"]), pick("ds2", ["tomato", "chicken"]), pick("ds2", ["tomato"])], ctx);
    expect(issues.join(" | ")).toMatch(/ds9 is not one of the provided docs/);
    expect(issues.join(" | ")).toMatch(/ds2 uses ingredients from neither the doc nor the user: chicken/);
    expect(issues.join(" | ")).toMatch(/ds2 breaks the veg diet/);
    expect(issues.join(" | ")).toMatch(/ds2 is used twice/);
    expect(validatePicks([pick("ds1", ["paneer"])], ctx)).toContain("return at least 3 recipes");
  });

  it("rejects picks that drop more than a third of the doc's main ingredients", () => {
    // ds1 has paneer, peas, tomato, onion: keeping 2 of 4 is too few, 3 of 4 (or 2 + a swap) is fine.
    const one = (ids: string[]) => validatePicks([pick("ds1", ids)], { ...ctx, docs: [DOCS[0]!] });
    expect(one(["paneer", "tomato"])).toEqual(["ds1 drops too many ingredients: keep or swap at least 3 of paneer, peas, tomato, onion"]);
    expect(one(["paneer", "tomato", "onion"])).toEqual([]);
  });

  it("rejects avoided ingredients", () => {
    const issues = validatePicks([pick("ds1", ["paneer", "tomato", "onion"])], { ...ctx, docs: [DOCS[0]!], avoidIds: new Set(["onion"]) });
    expect(issues).toEqual(["ds1 uses avoided ingredients: onion"]);
  });
});

describe("buildRecipe", () => {
  it("computes have/missing over non-staples and keeps the doc's staples", () => {
    const r = buildRecipe(DOCS[0]!, ["paneer", "peas", "tomato", "onion", "salt"], ctx, "Matar Paneer", null);
    expect(r.have).toEqual(["paneer", "tomato", "onion"]);
    expect(r.missing).toEqual(["peas"]);
    expect(r.ingredients.map((i) => i.canonicalId)).toEqual(["paneer", "peas", "tomato", "onion", "salt", "turmeric"]);
    expect(r.sourceDocId).toBe("ds1");
    expect(r.dietTags).toEqual(["veg", "egg", "nonveg"]); // onion → not Jain
  });

  it("falls back to the top docs unadapted", () => {
    const recipes = fallbackRecipes(ctx, 3);
    expect(recipes.map((r) => r.id)).toEqual(["ds1", "ds2", "ds3"]);
    expect(recipes.every((r) => r.note === null && r.sourceDocId)).toBe(true);
  });
});

describe("rerank", () => {
  it("puts recipes the user can mostly cook first", () => {
    const have = new Set(CONFIRMED.map((i) => i.canonicalId));
    const staple = (id: string) => TAGS.get(id)?.includes("staple") ?? false;
    // ds3/ds2 (everything owned) beat ds1 (most similar, but peas missing); ds4 (nothing owned) is last.
    expect(rerank(DOCS, have, staple, 4).map((d) => d.id)).toEqual(["ds3", "ds2", "ds1", "ds4"]);
  });
});
