import { type Ingredient, applySubstitutions } from "@ftc/shared";
import { loadCanonTags } from "../../services/normalizer";
import type { ScanStateT, ScanUpdate } from "../state";

/**
 * Set diff by canonicalId: the chosen recipe's ingredients − what the user has − staples. No LLM.
 * Accepted substitutions are applied first (the stored recipe stays original), so a swapped-out
 * ingredient is not missing; a substitute the user must buy is.
 */
export async function diffMissing(state: ScanStateT): Promise<ScanUpdate> {
  const original = state.recipes.find((r) => r.id === state.selectedRecipeId);
  if (!original) throw new Error(`Selected recipe ${state.selectedRecipeId} not found`);
  const tags = await loadCanonTags();
  const have = new Set(state.confirmed.map((i) => i.canonicalId));
  const recipe = applySubstitutions(original, state.substitutions, have);

  const missing = new Map<string, Ingredient>();
  for (const i of recipe.ingredients) {
    if (have.has(i.canonicalId) || tags.get(i.canonicalId)?.includes("staple")) continue;
    if (!missing.has(i.canonicalId)) missing.set(i.canonicalId, i);
  }
  return { missing: [...missing.values()] };
}
