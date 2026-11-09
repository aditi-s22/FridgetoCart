import { type Canon, loadLexicon, matchName, nearestByEmbedding } from "../../services/normalizer";

/** Names → canonical ingredients: exact synonym match, then embedding nearest, else null. */
export async function resolveNames(names: string[]): Promise<(Canon | null)[]> {
  const lex = await loadLexicon();
  const matches = names.map((n) => matchName(lex, n));
  const misses = names.filter((_, i) => !matches[i]);
  const nearest = await nearestByEmbedding(misses);
  let m = 0;
  return matches.map((hit) => hit ?? nearest[m++] ?? null);
}
