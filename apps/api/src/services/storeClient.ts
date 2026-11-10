import { ApiError, StockInfo, StoreCart, StoreProduct } from "@ftc/shared";
import { z } from "zod";
import { env } from "../env";
import { AppError } from "../http";

// A sleeping free-tier host (e.g. Render) holds the first request for 30-60 s while it wakes up, so the
// timeout is generous and one retry covers a dropped connection. Every store call is safe to repeat:
// reads are reads, POST /carts is an upsert and setItem carries an Idempotency-Key.
const TIMEOUT_MS = 45_000;
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${env.STORE_BASE_URL}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // 502/503/504 come from a proxy in front of a store that is still starting.
      if (![502, 503, 504].includes(res.status) || attempt === ATTEMPTS) return res;
      lastError = new Error(`store returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  throw lastError;
}

/** Typed client for apps/store. Every response is validated with the shared schemas. */
async function call<T extends z.ZodTypeAny>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await fetchWithRetry(path, init);
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
  /** Fire-and-forget ping so a sleeping store is awake by the time the cart is built. Never throws. */
  wake: async (): Promise<void> => {
    await fetch(`${env.STORE_BASE_URL}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => undefined);
  },
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
