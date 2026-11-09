import { z } from "zod";

export const DetectedItem = z.object({
  rawName: z.string().min(1),
  qty: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type DetectedItem = z.infer<typeof DetectedItem>;

/** What the vision model must return (wrapped in an object for structured output). */
export const DetectionResult = z.object({ items: z.array(DetectedItem) });
export type DetectionResult = z.infer<typeof DetectionResult>;

export const Ingredient = z.object({
  canonicalId: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
});
export type Ingredient = z.infer<typeof Ingredient>;

/** An ingredient on the review screen, carrying the detector's confidence. */
export const ReviewItem = Ingredient.extend({ confidence: z.number().min(0).max(1) });
export type ReviewItem = z.infer<typeof ReviewItem>;

export const Diet = z.enum(["veg", "nonveg", "jain", "egg"]);
export type Diet = z.infer<typeof Diet>;

export const UserPrefs = z.object({
  diet: Diet,
  avoid: z.array(z.string()),
  maxTimeMins: z.number().int().positive(),
});
export type UserPrefs = z.infer<typeof UserPrefs>;

export const Recipe = z.object({
  id: z.string(),
  title: z.string(),
  sourceDocId: z.string().nullable(),
  ingredients: z.array(Ingredient),
  steps: z.array(z.string()),
  timeMins: z.number().int().positive(),
  dietTags: z.array(z.string()),
  /** canonicalIds of non-staple ingredients the user has / lacks */
  have: z.array(z.string()),
  missing: z.array(z.string()),
  /** One-line adaptation from the source recipe, e.g. a swap. */
  note: z.string().nullable(),
  /** Attribution link for the source recipe (dataset is CC BY 4.0). */
  sourceUrl: z.string().nullable(),
});
export type Recipe = z.infer<typeof Recipe>;

/** What the recipe LLM returns: picks from the retrieved docs, not free-form recipes. */
export const GeneratedRecipes = z.object({
  recipes: z
    .array(
      z.object({
        sourceDocId: z.string(),
        title: z.string().min(1),
        /** Non-staple ingredients this version uses: from the doc, or swaps from the user's list. */
        ingredientIds: z.array(z.string()).min(1),
        note: z.string().nullable(),
      }),
    )
    .min(1)
    .max(5),
});
export type GeneratedRecipes = z.infer<typeof GeneratedRecipes>;

export const DeepLinks = z.object({ blinkit: z.string().url(), zepto: z.string().url() });
export type DeepLinks = z.infer<typeof DeepLinks>;

export const CartItem = z.object({
  productId: z.string(),
  canonicalId: z.string(),
  name: z.string(),
  /** Pack size, e.g. "500 g" */
  unit: z.string(),
  /** Number of packs */
  qty: z.number().int().positive(),
  /** Price per pack, ₹ */
  price: z.number().nonnegative(),
  deepLinks: DeepLinks,
});
export type CartItem = z.infer<typeof CartItem>;

/** A cart as the store returns it. */
export const StoreCart = z.object({
  id: z.string(),
  items: z.array(CartItem),
  total: z.number().nonnegative(),
});
export type StoreCart = z.infer<typeof StoreCart>;

/** A missing ingredient the store couldn't supply; the user can still buy it via deep links. */
export const UnavailableItem = z.object({
  canonicalId: z.string(),
  name: z.string(),
  reason: z.enum(["out_of_stock", "not_found"]),
  deepLinks: DeepLinks,
});
export type UnavailableItem = z.infer<typeof UnavailableItem>;

export const Cart = StoreCart.extend({ unavailable: z.array(UnavailableItem) });
export type Cart = z.infer<typeof Cart>;

export const StoreProduct = z.object({
  id: z.string(),
  canonicalId: z.string(),
  name: z.string(),
  unit: z.string(),
  price: z.number(),
  stock: z.number().int(),
});
export type StoreProduct = z.infer<typeof StoreProduct>;

export const StockInfo = z.object({ productId: z.string(), stock: z.number().int(), inStock: z.boolean() });
export type StockInfo = z.infer<typeof StockInfo>;

/** Search deep links (generated, not scraped). */
export function deepLinksFor(name: string): DeepLinks {
  const q = encodeURIComponent(name);
  return { blinkit: `https://blinkit.com/s/?q=${q}`, zepto: `https://www.zeptonow.com/search?query=${q}` };
}

export const ScanStatus = z.enum([
  "detecting",
  "awaiting_review",
  "generating",
  "awaiting_pick",
  "building_cart",
  "done",
  "failed",
]);
export type ScanStatus = z.infer<typeof ScanStatus>;

/** Items below this confidence are highlighted on the review screen. */
export const LOW_CONFIDENCE = 0.6;

/** A substitution the user accepted for one missing ingredient of a recipe. */
export const AppliedSubstitution = z.object({
  originalId: z.string().min(1),
  substituteId: z.string().min(1),
  substituteName: z.string().min(1),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  /** Cooking-method changes the swap needs; appended to the recipe's steps. */
  stepChanges: z.array(z.string()),
});
export type AppliedSubstitution = z.infer<typeof AppliedSubstitution>;

export const SubstitutionOption = AppliedSubstitution.omit({ originalId: true }).extend({
  /** Derived by the server from the scan, never taken from the model. */
  availability: z.enum(["in_fridge", "must_buy"]),
  reason: z.string(),
  flavorImpact: z.string(),
});
export type SubstitutionOption = z.infer<typeof SubstitutionOption>;

/** Options for one missing ingredient: the first is the best, the rest are alternatives. */
export const SubstitutionSuggestion = z.object({
  originalId: z.string(),
  originalName: z.string(),
  options: z.array(SubstitutionOption).min(1),
});
export type SubstitutionSuggestion = z.infer<typeof SubstitutionSuggestion>;

/** What the LLM returns; ids are checked against the canon and the user's diet afterwards. */
export const GeneratedSubstitutions = z.object({
  suggestions: z.array(
    z.object({
      originalId: z.string(),
      options: z
        .array(
          z.object({
            substituteId: z.string(),
            qty: z.number().nullable(),
            unit: z.string().nullable(),
            reason: z.string().min(1),
            flavorImpact: z.string(),
            stepChanges: z.array(z.string()),
          }),
        )
        .max(3),
    }),
  ),
});
export type GeneratedSubstitutions = z.infer<typeof GeneratedSubstitutions>;

/**
 * The recipe as the user will cook it: the original plus accepted swaps. Pure; the original is
 * never mutated. `haveIds` are the canonical ids the user has, used to recompute have/missing.
 */
export function applySubstitutions(recipe: Recipe, subs: AppliedSubstitution[], haveIds: ReadonlySet<string>): Recipe {
  const active = subs.filter((s) => recipe.missing.includes(s.originalId));
  if (active.length === 0) return recipe;
  const byOriginal = new Map(active.map((s) => [s.originalId, s]));
  const ingredients = recipe.ingredients.map((i) => {
    const s = byOriginal.get(i.canonicalId);
    return s ? { canonicalId: s.substituteId, name: s.substituteName, qty: s.qty, unit: s.unit } : i;
  });
  const have = [...recipe.have];
  const missing: string[] = [];
  for (const id of recipe.missing) {
    const s = byOriginal.get(id);
    const next = s ? s.substituteId : id;
    if (haveIds.has(next)) have.push(next);
    else if (!missing.includes(next)) missing.push(next);
  }
  const steps = [...recipe.steps, ...active.flatMap((s) => s.stepChanges.map((c) => `Substitution (${s.substituteName}): ${c}`))];
  return { ...recipe, ingredients, have, missing, steps };
}
