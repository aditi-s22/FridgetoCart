import type { ReviewItem } from "@ftc/shared";
import { keyOf, loadLexicon, matchName, nearestByEmbedding, parseQty } from "../../services/normalizer";
import type { Canon } from "../../services/normalizer";
import type { ScanStateT, ScanUpdate } from "../state";

/** rawName → canonical: exact synonym match → embedding nearest → `unknown:<name>`. No LLM. */
export async function normalize(state: ScanStateT): Promise<ScanUpdate> {
  const lex = await loadLexicon();
  const matches: (Canon | null)[] = state.detected.map((d) => matchName(lex, d.rawName));

  const misses = state.detected.filter((_, i) => !matches[i]);
  const nearest = await nearestByEmbedding(misses.map((d) => d.rawName));
  let m = 0;
  for (let i = 0; i < matches.length; i++) {
    if (!matches[i]) matches[i] = nearest[m++] ?? null;
  }

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
