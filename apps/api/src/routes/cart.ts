import { randomUUID } from "node:crypto";
import { type Cart, SetCartQtyRequest } from "@ftc/shared";
import { Router } from "express";
import { userIdOf } from "../auth";
import { getGraph } from "../graph/build";
import { type Progress, progressOf } from "../graph/progress";
import { AppError, parse } from "../http";
import { storeClient } from "../services/storeClient";
import { ownScan } from "./scans";

/**
 * The cart as it is now: line items live in the store (the user can change quantities after the
 * agent is done); the unavailable list comes from the graph run.
 */
export async function liveCart(p: Progress): Promise<Cart | null> {
  const { cartId, cart } = p.values;
  if (!cartId || !cart) return null;
  try {
    return { ...(await storeClient.getCart(cartId)), unavailable: cart.unavailable };
  } catch {
    return cart; // store down: last known cart
  }
}

export const cartRoutes = Router();

/** Qty stepper: sets a cart line's quantity; 0 removes it. */
cartRoutes.put("/:id/cart/items/:productId", async (req, res) => {
  const scan = await ownScan(req.params.id, userIdOf(res.locals));
  const { qty } = parse(SetCartQtyRequest, req.body);
  const p = await progressOf(await getGraph(), scan.id);
  const { cartId, cart } = p.values;
  if (!cartId || !cart) throw new AppError(409, "no_cart", "This scan has no cart yet");
  const updated = await storeClient.setItem(cartId, req.params.productId, qty, randomUUID());
  const body: Cart = { ...updated, unavailable: cart.unavailable };
  res.json(body);
});
