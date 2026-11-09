import { z } from "zod";
import { ReviewItem, ScanStatus } from "./domain";

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

export const ScanView = z.object({
  scanId: z.string(),
  status: ScanStatus,
  imageUrl: z.string(),
  createdAt: z.string(),
  items: z.array(ReviewItem),
});
export type ScanView = z.infer<typeof ScanView>;
