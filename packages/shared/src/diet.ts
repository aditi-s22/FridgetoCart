import type { Diet } from "./domain";

/**
 * Diets that can eat a dish, from its ingredients' tags (nonveg | egg | nojain).
 * Used to tag seed recipes and to re-check LLM swaps.
 */
export function dietTagsFor(tags: Iterable<string>): Diet[] {
  const t = new Set(tags);
  if (t.has("nonveg")) return ["nonveg"];
  if (t.has("egg")) return ["egg", "nonveg"];
  if (t.has("nojain")) return ["veg", "egg", "nonveg"];
  return ["jain", "veg", "egg", "nonveg"];
}
