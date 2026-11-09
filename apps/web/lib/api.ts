import { ApiError } from "@ftc/shared";
import type {
  Cart,
  CreateScanResponse,
  Ingredient,
  PickResponse,
  PresignRequest,
  PresignResponse,
  ReviewResponse,
  ScanView,
  UserPrefs,
} from "@ftc/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiError.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  presign: (contentType: PresignRequest["contentType"]) =>
    call<PresignResponse>("/uploads/presign", { method: "POST", body: JSON.stringify({ contentType }) }),
  createScan: (imageUrl: string) =>
    call<CreateScanResponse>("/scans", { method: "POST", body: JSON.stringify({ imageUrl }) }),
  getScan: (id: string) => call<ScanView>(`/scans/${encodeURIComponent(id)}`),
  review: (id: string, items: Ingredient[]) =>
    call<ReviewResponse>(`/scans/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ items }) }),
  pick: (id: string, recipeId: string) =>
    call<PickResponse>(`/scans/${encodeURIComponent(id)}/pick`, { method: "POST", body: JSON.stringify({ recipeId }) }),
  setCartQty: (id: string, productId: string, qty: number) =>
    call<Cart>(`/scans/${encodeURIComponent(id)}/cart/items/${encodeURIComponent(productId)}`, {
      method: "PUT",
      body: JSON.stringify({ qty }),
    }),
  getPrefs: () => call<UserPrefs>("/prefs"),
  putPrefs: (prefs: UserPrefs) => call<UserPrefs>("/prefs", { method: "PUT", body: JSON.stringify(prefs) }),
};

/** The screen a scan should be shown on, so reopening a scan lands on its saved step. */
export function screenFor(scan: ScanView): "review" | "recipes" | "cart" {
  if (scan.status === "awaiting_review" || scan.status === "detecting") return "review";
  if (scan.selectedRecipeId && (scan.status === "done" || scan.status === "building_cart")) return "cart";
  return "recipes";
}

export async function uploadImage(blob: Blob): Promise<string> {
  const { uploadUrl, imageUrl } = await api.presign("image/jpeg");
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return imageUrl;
}
