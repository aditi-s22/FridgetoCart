/**
 * The text that gets embedded for recipes and for a user's ingredient list. Both sides use the
 * same shape so cosine similarity is driven by shared ingredients. Staples are left out.
 */
export function recipeDocText(title: string, mainIngredientNames: string[]): string {
  return `${title}. Ingredients: ${mainIngredientNames.join(", ")}`;
}

export function ingredientsQueryText(names: string[]): string {
  return `Ingredients: ${names.join(", ")}`;
}

export function ingredientCanonText(name: string, synonyms: string[]): string {
  return synonyms.length ? `${name} (${synonyms.join(", ")})` : name;
}
