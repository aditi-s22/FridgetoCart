import { ApiError, StockInfo, StoreCart, StoreProduct } from "@ftc/shared";
import { z } from "zod";
import { env } from "../env";
import { AppError } from "../http";

/** Typed client for apps/store. Every response is validated with the shared schemas. */
async function call<T extends z.ZodTypeAny>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await fetch(`${env.STORE_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError(502, "store_unavailable", `Store is unreachable: ${(err as Error).message}`);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = ApiError.safeParse(body);
    throw new AppError(res.status, e.success ? e.data.error.code : "store_error", e.success ? e.data.error.message : `Store returned ${res.status}`);
  }
  return schema.parse(body);
}

export const storeClient = {
  search: async (q: string) =>
    (await call(z.object({ products: z.array(StoreProduct) }), `/products?q=${encodeURIComponent(q)}`)).products,
  stock: (productId: string) => call(StockInfo, `/products/${encodeURIComponent(productId)}/stock`),
  createCart: (scanId: string) => call(StoreCart, "/carts", { method: "POST", body: JSON.stringify({ scanId }) }),
  getCart: (cartId: string) => call(StoreCart, `/carts/${encodeURIComponent(cartId)}`),
  /** Sets a line's quantity (0 removes it). The same idempotency key never applies twice. */
  setItem: (cartId: string, productId: string, qty: number, idempotencyKey: string) =>
    call(StoreCart, `/carts/${encodeURIComponent(cartId)}/items`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ productId, qty }),
    }),
};
