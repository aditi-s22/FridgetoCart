import { type GeneratedRecipes, type Ingredient, type Recipe, type UserPrefs, dietTagsFor } from "@ftc/shared";
import type { CanonTags } from "../../services/normalizer";
import type { RetrievedDoc } from "../../services/recipes";

type Pick = GeneratedRecipes["recipes"][number];

export type BuildCtx = {
  docs: RetrievedDoc[];
  confirmed: Ingredient[];
  prefs: UserPrefs;
  tags: CanonTags;
  avoidIds: Set<string>;
};

export const isStaple = (ctx: BuildCtx, id: string) => ctx.tags.get(id)?.includes("staple") ?? false;
const nonStaple = (ctx: BuildCtx, ids: string[]) => [...new Set(ids)].filter((id) => !isStaple(ctx, id));
const dietOf = (ctx: BuildCtx, ids: string[]) => dietTagsFor(ids.flatMap((id) => ctx.tags.get(id) ?? []));

/** Everything wrong with the model's picks; empty means they can be used as-is. */
export function validatePicks(picks: Pick[], ctx: BuildCtx): string[] {
  const issues: string[] = [];
  const want = Math.min(3, ctx.docs.length);
  if (picks.length < want) issues.push(`return at least ${want} recipes`);
  const userIds = new Set(ctx.confirmed.map((i) => i.canonicalId));
  const seen = new Set<string>();

  for (const p of picks) {
    const doc = ctx.docs.find((d) => d.id === p.sourceDocId);
    if (!doc) {
      issues.push(`${p.sourceDocId} is not one of the provided docs`);
      continue;
    }
    if (seen.has(doc.id)) issues.push(`${doc.id} is used twice`);
    seen.add(doc.id);
    const docIds = new Set(doc.ingredients.map((i) => i.canonicalId));
    const foreign = p.ingredientIds.filter((id) => !docIds.has(id) && !userIds.has(id));
    if (foreign.length) issues.push(`${doc.id} uses ingredients from neither the doc nor the user: ${foreign.join(", ")}`);
    const avoided = p.ingredientIds.filter((id) => ctx.avoidIds.has(id));
    if (avoided.length) issues.push(`${doc.id} uses avoided ingredients: ${avoided.join(", ")}`);
    if (!dietOf(ctx, p.ingredientIds).includes(ctx.prefs.diet)) issues.push(`${doc.id} breaks the ${ctx.prefs.diet} diet`);
    const chosen = nonStaple(ctx, p.ingredientIds);
    if (chosen.length === 0) issues.push(`${doc.id} lists no main ingredients`);
    // Dropping core ingredients makes a dish look cookable when it isn't (poha dosa without poha).
    const docMain = nonStaple(ctx, [...docIds]);
    const need = Math.ceil((docMain.length * 2) / 3);
    if (chosen.length > 0 && chosen.length < need) {
      issues.push(`${doc.id} drops too many ingredients: keep or swap at least ${need} of ${docMain.join(", ")}`);
    }
  }
  return issues;
}

/** A Recipe from a doc and the non-staple ingredients chosen for it (doc staples are kept). */
export function buildRecipe(doc: RetrievedDoc, chosenIds: string[], ctx: BuildCtx, title: string, note: string | null): Recipe {
  const userIds = new Set(ctx.confirmed.map((i) => i.canonicalId));
  const main = nonStaple(ctx, chosenIds);
  const find = (id: string): Ingredient =>
    doc.ingredients.find((i) => i.canonicalId === id) ??
    ctx.confirmed.find((i) => i.canonicalId === id) ?? { canonicalId: id, name: id, qty: null, unit: null };
  const staples = doc.ingredients.filter((i) => isStaple(ctx, i.canonicalId));
  return {
    id: doc.id,
    title,
    sourceDocId: doc.id,
    ingredients: [...main.map(find), ...staples],
    steps: doc.steps,
    timeMins: doc.timeMins,
    dietTags: dietOf(ctx, [...main, ...staples.map((s) => s.canonicalId)]),
    have: main.filter((id) => userIds.has(id)),
    missing: main.filter((id) => !userIds.has(id)),
    note,
    sourceUrl: doc.sourceUrl || null,
  };
}

export function buildFromPicks(picks: Pick[], ctx: BuildCtx): Recipe[] {
  return picks.flatMap((p) => {
    const doc = ctx.docs.find((d) => d.id === p.sourceDocId);
    return doc ? [buildRecipe(doc, p.ingredientIds, ctx, p.title, p.note)] : [];
  });
}

/** Used when the model fails twice: the best retrieved docs, unadapted. */
export function fallbackRecipes(ctx: BuildCtx, count = 5): Recipe[] {
  return ctx.docs
    .slice(0, count)
    .map((d) => buildRecipe(d, d.ingredients.map((i) => i.canonicalId), ctx, d.title, null));
}
