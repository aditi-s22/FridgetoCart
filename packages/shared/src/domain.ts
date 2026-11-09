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
