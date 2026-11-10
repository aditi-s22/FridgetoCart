import { describe, expect, it } from "vitest";
import { type Progress, isStalledAfterPick } from "./progress";

const progress = (over: Partial<Progress> & { selected?: string | null }): Progress => ({
  values: { selectedRecipeId: over.selected ?? null },
  pending: over.pending ?? null,
  next: over.next ?? [],
});

describe("isStalledAfterPick", () => {
  it("is true when a recipe is selected, no pause is pending and nodes are still queued", () => {
    expect(isStalledAfterPick(progress({ selected: "r1", next: ["cartAgent"] }))).toBe(true);
  });
  it("is false for a finished run", () => {
    expect(isStalledAfterPick(progress({ selected: "r1", next: [] }))).toBe(false);
  });
  it("is false while the recipe-pick pause is pending (the normal path)", () => {
    const pending = { type: "pick_recipe" as const, recipes: [] };
    expect(isStalledAfterPick(progress({ selected: null, pending, next: ["pickRecipe"] }))).toBe(false);
  });
  it("is false when no recipe was selected yet", () => {
    expect(isStalledAfterPick(progress({ selected: null, next: ["retrieveRecipes"] }))).toBe(false);
  });
});
