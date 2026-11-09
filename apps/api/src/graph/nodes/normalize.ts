import type { ReviewItem } from "@ftc/shared";
import { keyOf, parseQty } from "../../services/normalizer";
import type { ScanStateT, ScanUpdate } from "../state";
import { resolveNames } from "./resolve";

/** rawName → canonical: exact synonym match → embedding nearest → `unknown:<name>`. No LLM. */
export async function normalize(state: ScanStateT): Promise<ScanUpdate> {
  const matches = await resolveNames(state.detected.map((d) => d.rawName));

  // One entry per canonical ingredient; the most confident detection wins.
  const byId = new Map<string, ReviewItem>();
  state.detected.forEach((d, i) => {
    const canon = matches[i] ?? { canonicalId: `unknown:${keyOf(d.rawName)}`, name: d.rawName.trim() };
    const item: ReviewItem = { ...canon, ...parseQty(d.qty), confidence: d.confidence };
    const prev = byId.get(item.canonicalId);
    if (!prev || prev.confidence < item.confidence) byId.set(item.canonicalId, item);
  });

  return { items: [...byId.values()] };
}
