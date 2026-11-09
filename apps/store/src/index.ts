import { AddCartItemRequest, CreateCartRequest, type StockInfo } from "@ftc/shared";
import express, { type ErrorRequestHandler, type Response } from "express";
import { cartView, catalog, refreshTotal } from "./catalog";
import { prisma } from "./db";
import { search } from "./search";

/** Mock grocery store: product search, stock, and carts with idempotent item writes. */
const port = Number(process.env.STORE_PORT ?? 4100);
const app = express();
app.use(express.json());

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/products", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return fail(res, 400, "bad_request", "q is required");
  const hits = search(await catalog(), q);
  res.json({ products: hits.map(({ terms: _terms, ...p }) => p) });
});

app.get("/products/:id/stock", async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true, stock: true } });
  if (!p) return fail(res, 404, "not_found", "Unknown product");
  const body: StockInfo = { productId: p.id, stock: p.stock, inStock: p.stock > 0 };
  res.json(body);
});

app.post("/carts", async (req, res) => {
  const parsed = CreateCartRequest.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "bad_request", "scanId is required");
  // One cart per scan: creating it again returns the same cart.
  const cart = await prisma.cart.upsert({ where: { scanId: parsed.data.scanId }, create: { scanId: parsed.data.scanId }, update: {} });
  res.status(201).json(await cartView(cart.id));
});

app.get("/carts/:id", async (req, res) => {
  const cart = await cartView(req.params.id);
  return cart ? res.json(cart) : fail(res, 404, "not_found", "Unknown cart");
});

/** Sets an item's quantity (0 removes it). Upserts on (cartId, productId), so retries never duplicate. */
app.post("/carts/:id/items", async (req, res) => {
  const cartId = req.params.id;
  const header = req.get("Idempotency-Key");
  const key = header ? `${cartId}:${header}` : null;
  if (key) {
    const seen = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (seen) return res.json(seen.response);
  }

  const parsed = AddCartItemRequest.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "bad_request", "Expected {productId, qty} with qty 0–20");
  const { productId, qty } = parsed.data;
  const [cart, product] = await Promise.all([
    prisma.cart.findUnique({ where: { id: cartId }, select: { id: true } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!cart) return fail(res, 404, "not_found", "Unknown cart");
  if (!product) return fail(res, 404, "not_found", "Unknown product");
  if (qty > product.stock) return fail(res, 409, "out_of_stock", `Only ${product.stock} of ${product.name} in stock`);

  if (qty === 0) await prisma.cartItem.deleteMany({ where: { cartId, productId } });
  else {
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: { cartId, productId, qty, price: product.price },
      update: { qty, price: product.price },
    });
  }
  await refreshTotal(cartId);
  const body = await cartView(cartId);
  if (key) await prisma.idempotencyKey.create({ data: { key, response: body ?? {} } }).catch(() => undefined); // a concurrent twin already stored it
  res.json(body);
});

const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  console.error(err);
  fail(res, 500, "internal", "Something went wrong");
};
app.use(errorHandler);

app.listen(port, () => console.log(`store listening on :${port}`));
