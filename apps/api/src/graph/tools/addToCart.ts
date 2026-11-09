import { tool } from "@langchain/core/tools";
import { getCurrentTaskInput } from "@langchain/langgraph";
import { z } from "zod";
import { AppError } from "../../http";
import { storeClient } from "../../services/storeClient";
import type { ScanStateT } from "../state";

export const addToCart = tool(
  async ({ productId, qty }) => {
    const { cartId } = getCurrentTaskInput<ScanStateT>();
    if (!cartId) return "Error: no cart exists for this scan.";
    try {
      // Deterministic key: a retried or replayed tool call can never add the item twice.
      const cart = await storeClient.setItem(cartId, productId, qty, `agent:${productId}:${qty}`);
      return JSON.stringify({ ok: true, lines: cart.items.length, total: cart.total });
    } catch (err) {
      if (err instanceof AppError && err.code === "out_of_stock") return `Error: ${err.message}. Skip this item.`;
      throw err;
    }
  },
  {
    name: "addToCart",
    description: "Put a product in the user's cart. qty is the number of packs (usually 1). Calling it again sets the quantity; it never duplicates.",
    schema: z.object({
      productId: z.string().describe("Product id from searchProduct"),
      qty: z.number().int().min(1).max(5).describe("Number of packs"),
    }),
  },
);
