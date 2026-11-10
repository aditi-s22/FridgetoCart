import { describe, expect, it } from "vitest";
import { type Progress, canResumePick } from "./progress";

const progress = (over: Partial<Progress> & { selected?: string | null }): Progress => ({
  values: { selectedRecipeId: over.selected ?? null },
  pending: over.pending ?? null,
  next: over.next ?? [],
});

describe("canResumePick", () => {
  it("resumes a pick that stopped before the cart was built (same recipe, nodes still queued)", () => {
    expect(canResumePick(progress({ selected: "r1", next: ["cartAgent"] }), "r1")).toBe(true);
  });
  it("does not resume for a different recipe", () => {
    expect(canResumePick(progress({ selected: "r1", next: ["cartAgent"] }), "r2")).toBe(false);
  });
  it("does not resume a finished run", () => {
    expect(canResumePick(progress({ selected: "r1", next: [] }), "r1")).toBe(false);
  });
  it("does not resume while a pause is pending (the normal pick path handles that)", () => {
    const pending = { type: "pick_recipe" as const, recipes: [] };
    expect(canResumePick(progress({ selected: null, pending, next: ["pickRecipe"] }), "r1")).toBe(false);
  });
});
