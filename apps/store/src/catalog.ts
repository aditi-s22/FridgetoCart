import { type StoreCart, deepLinksFor } from "@ftc/shared";
import { prisma } from "./db";
import { type IndexedProduct, norm } from "./search";

const TTL_MS = 60_000;
let cache: { at: number; products: Promise<IndexedProduct[]> } | null = null;

/** Products with their ingredient's name and synonyms as search terms; refreshed every minute. */
export function catalog(): Promise<IndexedProduct[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.products;
  const products = prisma.product
    .findMany({ include: { ingredient: { select: { name: true, synonyms: true } } } })
    .then((rows) =>
      rows.map(({ ingredient, ...p }) => ({
        ...p,
        terms: [...new Set([p.name, ingredient.name, p.canonicalId.replace(/_/g, " "), ...ingredient.synonyms].map(norm))],
      })),
    );
  cache = { at: Date.now(), products };
  products.catch(() => (cache = null));
  return products;
}

export async function cartView(cartId: string): Promise<StoreCart | null> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: { items: { orderBy: { id: "asc" }, include: { product: { include: { ingredient: { select: { name: true } } } } } } },
  });
  if (!cart) return null;
  return {
    id: cart.id,
    total: cart.total,
    items: cart.items.map((i) => ({
      productId: i.productId,
      canonicalId: i.product.canonicalId,
      name: i.product.name,
      unit: i.product.unit,
      qty: i.qty,
      price: i.price,
      deepLinks: deepLinksFor(i.product.ingredient.name),
    })),
  };
}

/** Recomputes the stored total from line items (₹, 2 decimals). */
export async function refreshTotal(cartId: string): Promise<void> {
  const items = await prisma.cartItem.findMany({ where: { cartId }, select: { qty: true, price: true } });
  const total = Math.round(items.reduce((s, i) => s + i.qty * i.price, 0) * 100) / 100;
  await prisma.cart.update({ where: { id: cartId }, data: { total } });
}
