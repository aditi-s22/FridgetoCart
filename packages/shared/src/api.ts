import { z } from "zod";
import { Cart, Ingredient, Recipe, ReviewItem, ScanStatus } from "./domain";

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;

export const PresignRequest = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
export type PresignRequest = z.infer<typeof PresignRequest>;

export const PresignResponse = z.object({
  uploadUrl: z.string().url(),
  imageUrl: z.string().url(),
});
export type PresignResponse = z.infer<typeof PresignResponse>;

export const CreateScanRequest = z.object({ imageUrl: z.string().url() });
export type CreateScanRequest = z.infer<typeof CreateScanRequest>;

export const CreateScanResponse = z.object({
  scanId: z.string(),
  status: ScanStatus,
  items: z.array(ReviewItem),
});
export type CreateScanResponse = z.infer<typeof CreateScanResponse>;

export const ReviewRequest = z.object({ items: z.array(Ingredient).max(100) });
export type ReviewRequest = z.infer<typeof ReviewRequest>;

export const ReviewResponse = z.object({ status: ScanStatus, recipes: z.array(Recipe) });
export type ReviewResponse = z.infer<typeof ReviewResponse>;

export const PickRequest = z.object({ recipeId: z.string().min(1) });
export type PickRequest = z.infer<typeof PickRequest>;

export const PickResponse = z.object({ status: ScanStatus, cart: Cart.nullable() });
export type PickResponse = z.infer<typeof PickResponse>;

export const ScanView = z.object({
  scanId: z.string(),
  status: ScanStatus,
  imageUrl: z.string(),
  createdAt: z.string(),
  /** Detected + normalized items (input to review) */
  items: z.array(ReviewItem),
  /** Items the user confirmed on the review screen */
  confirmed: z.array(Ingredient),
  recipes: z.array(Recipe),
  selectedRecipeId: z.string().nullable(),
  cart: Cart.nullable(),
});
export type ScanView = z.infer<typeof ScanView>;

export const SetCartQtyRequest = z.object({ qty: z.number().int().min(0).max(20) });
export type SetCartQtyRequest = z.infer<typeof SetCartQtyRequest>;

/** Store API bodies */
export const CreateCartRequest = z.object({ scanId: z.string().min(1) });
export const AddCartItemRequest = z.object({ productId: z.string().min(1), qty: z.number().int().min(0).max(20) });
export type AddCartItemRequest = z.infer<typeof AddCartItemRequest>;

/** Claims of the short-lived token the web app mints for the API (HS256, shared secret). */
export const API_TOKEN_ISSUER = "fridgetocart-web";
export const API_TOKEN_AUDIENCE = "fridgetocart-api";
export const ApiTokenClaims = z.object({ sub: z.string().min(1), email: z.string().email(), name: z.string().optional() });
export type ApiTokenClaims = z.infer<typeof ApiTokenClaims>;

export const ScanSummary = z.object({
  scanId: z.string(),
  status: ScanStatus,
  imageUrl: z.string(),
  createdAt: z.string(),
  selectedRecipeId: z.string().nullable(),
  /** Title of the picked recipe's source doc, if a recipe was picked. */
  recipeTitle: z.string().nullable(),
});
export type ScanSummary = z.infer<typeof ScanSummary>;
