import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { storeClient } from "../../services/storeClient";

export const searchProduct = tool(
  async ({ query }) => {
    const products = await storeClient.search(query);
    if (products.length === 0) return `No products found for "${query}".`;
    return JSON.stringify(products.slice(0, 3).map(({ stock: _stock, ...p }) => p));
  },
  {
    name: "searchProduct",
    description: "Search the grocery store by ingredient name (English or Hindi). Returns up to 3 products with id, name, pack unit and price in ₹.",
    schema: z.object({ query: z.string().describe("Ingredient name, e.g. 'green peas' or 'matar'") }),
  },
);
