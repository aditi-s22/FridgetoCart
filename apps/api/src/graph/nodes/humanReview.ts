import { Ingredient } from "@ftc/shared";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { keyOf } from "../../services/normalizer";
import type { ReviewInterrupt, ScanStateT, ScanUpdate } from "../state";
import { resolveNames } from "./resolve";

/**
 * Pauses until the user confirms the item list. Items the user renamed or added arrive as
 * `unknown:<name>` and are resolved to canonical ingredients here.
 */
export async function humanReview(state: ScanStateT): Promise<ScanUpdate> {
  const payload: ReviewInterrupt = { type: "review_items", items: state.items };
  const edited = z.array(Ingredient).parse(interrupt(payload));

  const unknown = edited.filter((i) => i.canonicalId.startsWith("unknown:"));
  const resolved = await resolveNames(unknown.map((i) => i.name));
  const fixed = new Map(unknown.map((item, k) => [item, resolved[k]]));

  const byId = new Map<string, Ingredient>();
  for (const item of edited) {
    let next = item;
    const canon = fixed.get(item);
    if (canon) next = { ...item, ...canon };
    else if (item.canonicalId.startsWith("unknown:")) next = { ...item, canonicalId: `unknown:${keyOf(item.name)}` };
    if (!byId.has(next.canonicalId)) byId.set(next.canonicalId, next);
  }
  return { confirmed: [...byId.values()] };
}
