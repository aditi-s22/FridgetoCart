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
  have: z.array(z.string()),
  missing: z.array(z.string()),
});
export type Recipe = z.infer<typeof Recipe>;

export const CartItem = z.object({
  productId: z.string(),
  name: z.string(),
  qty: z.number().int().positive(),
  price: z.number().nonnegative(),
  deepLinks: z.object({ blinkit: z.string().url(), zepto: z.string().url() }),
});
export type CartItem = z.infer<typeof CartItem>;

export const Cart = z.object({
  id: z.string(),
  items: z.array(CartItem),
  total: z.number().nonnegative(),
});
export type Cart = z.infer<typeof Cart>;

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
