import { type StoreCart, type UnavailableItem, deepLinksFor } from "@ftc/shared";
import { storeClient } from "../../services/storeClient";
import type { ScanStateT, ScanUpdate } from "../state";

/**
 * Checks the agent's cart against the missing list, so the result never depends on the model
 * being perfect: removes off-list products, adds anything it skipped that is in stock, and gives
 * everything else a Blinkit/Zepto link. Every missing item ends up in the cart or `unavailable`.
 */
export async function finalizeCart(state: ScanStateT): Promise<ScanUpdate> {
  if (!state.cartId) throw new Error("finalizeCart ran without a cart");
  const cartId = state.cartId;
  const wanted = new Set(state.missing.map((m) => m.canonicalId));
  let cart: StoreCart = await storeClient.getCart(cartId);

  const offList = cart.items.filter((i) => !wanted.has(i.canonicalId));
  for (const item of offList) cart = await storeClient.setItem(cartId, item.productId, 0, `final:remove:${item.productId}`);

  const unavailable: UnavailableItem[] = [];
  const repaired: string[] = [];
  for (const m of state.missing) {
    if (cart.items.some((i) => i.canonicalId === m.canonicalId)) continue;
    const product = (await storeClient.search(m.name)).find((p) => p.canonicalId === m.canonicalId);
    if (!product || product.stock <= 0) {
      unavailable.push({ canonicalId: m.canonicalId, name: m.name, reason: product ? "out_of_stock" : "not_found", deepLinks: deepLinksFor(m.name) });
      continue;
    }
    cart = await storeClient.setItem(cartId, product.id, 1, `final:add:${product.id}`);
    repaired.push(m.canonicalId);
  }

  console.log(
    JSON.stringify({
      evt: "cart",
      scanId: state.scanId,
      agentSteps: state.agentSteps,
      missing: state.missing.length,
      inCart: cart.items.length,
      unavailable: unavailable.length,
      repaired,
      removedOffList: offList.map((i) => i.canonicalId),
    }),
  );
  return { cart: { ...cart, unavailable } };
}
