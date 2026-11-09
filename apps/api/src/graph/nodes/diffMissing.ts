import type { Ingredient } from "@ftc/shared";
import { loadCanonTags } from "../../services/normalizer";
import type { ScanStateT, ScanUpdate } from "../state";

/** Set diff by canonicalId: the chosen recipe's ingredients − what the user has − staples. No LLM. */
export async function diffMissing(state: ScanStateT): Promise<ScanUpdate> {
  const recipe = state.recipes.find((r) => r.id === state.selectedRecipeId);
  if (!recipe) throw new Error(`Selected recipe ${state.selectedRecipeId} not found`);
  const tags = await loadCanonTags();
  const have = new Set(state.confirmed.map((i) => i.canonicalId));

  const missing = new Map<string, Ingredient>();
  for (const i of recipe.ingredients) {
    if (have.has(i.canonicalId) || tags.get(i.canonicalId)?.includes("staple")) continue;
    if (!missing.has(i.canonicalId)) missing.set(i.canonicalId, i);
  }
  return { missing: [...missing.values()] };
}
