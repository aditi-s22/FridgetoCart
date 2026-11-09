import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { storeClient } from "../../services/storeClient";

export const checkStock = tool(async ({ productId }) => JSON.stringify(await storeClient.stock(productId)), {
  name: "checkStock",
  description: "Check how many packs of a product are in stock.",
  schema: z.object({ productId: z.string().describe("Product id from searchProduct") }),
});
