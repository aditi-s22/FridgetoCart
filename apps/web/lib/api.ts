import { ApiError } from "@ftc/shared";
import type { CreateScanResponse, PresignRequest, PresignResponse, ScanView } from "@ftc/shared";

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
};

export async function uploadImage(blob: Blob): Promise<string> {
  const { uploadUrl, imageUrl } = await api.presign("image/jpeg");
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return imageUrl;
}
