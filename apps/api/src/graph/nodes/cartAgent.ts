import { type BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AppError } from "../../http";
import { agentStep } from "../../services/llm";
import { storeClient } from "../../services/storeClient";
import type { ScanStateT, ScanUpdate } from "../state";
import { CART_TOOLS } from "../tools";

export const MAX_AGENT_STEPS = 10;

export const CART_PROMPT = [
  "You build a grocery cart for an Indian home cook from a list of missing ingredients.",
  "For each missing ingredient: searchProduct → checkStock → addToCart with a sensible qty. Skip pantry staples.",
  "Stop when all items are handled.",
  "- Pick the product that is the same ingredient (not a dish or sauce made from it).",
  "- qty is a number of packs: 1 is right almost always; more only if one pack clearly can't cover the recipe.",
  "- If an item is out of stock or not found, skip it; the app will offer an online search link instead.",
  "- Work in parallel: search for all items in one turn, check stock for all in the next, then add them all.",
  "- When everything is handled, reply with a one-line summary and no tool calls.",
].join("\n");

function missingList(state: ScanStateT): string {
  return state.missing
    .map((i) => `- ${i.name} (recipe uses ${i.qty !== null ? `${i.qty}${i.unit ? ` ${i.unit}` : ""}` : "some"})`)
    .join("\n");
}

/** One agent turn. Creates the cart on the first turn; the tools read cartId from state. */
export async function cartAgent(state: ScanStateT): Promise<ScanUpdate> {
  const cartId = state.cartId ?? (await storeClient.createCart(state.scanId)).id;
  const seed: BaseMessage[] =
    state.messages.length > 0
      ? []
      : [new SystemMessage(CART_PROMPT), new HumanMessage(`Missing ingredients:\n${missingList(state)}`)];
  try {
    const ai = await agentStep({ role: "text", node: "cartAgent", tools: CART_TOOLS, messages: [...state.messages, ...seed] });
    return { cartId, messages: [...seed, ai], agentSteps: state.agentSteps + 1 };
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    // The model is down: stop the loop; finalizeCart fills the cart deterministically.
    return { cartId, messages: seed, agentSteps: MAX_AGENT_STEPS };
  }
}
