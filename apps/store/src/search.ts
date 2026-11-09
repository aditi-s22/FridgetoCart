/** Fuzzy product search over product names plus ingredient names and synonyms. */
export type IndexedProduct = {
  id: string;
  canonicalId: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  terms: string[];
};

const MIN_SCORE = 0.5;

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** 1 = exact, 0.85 = all query words present, else word overlap or typo similarity. */
export function scoreTerm(query: string, term: string): number {
  if (!query || !term) return 0;
  if (query === term) return 1;
  const q = query.split(" ");
  const t = new Set(term.split(" "));
  if (q.every((w) => t.has(w))) return 0.85;
  const overlap = (q.filter((w) => t.has(w)).length / q.length) * 0.7;
  const typo = 1 - levenshtein(query, term) / Math.max(query.length, term.length);
  return Math.max(overlap, typo >= 0.75 ? typo * 0.8 : 0);
}

export function search(products: IndexedProduct[], rawQuery: string, limit = 5): (IndexedProduct & { score: number })[] {
  const query = norm(rawQuery);
  return products
    .map((p) => ({ ...p, score: Math.max(...p.terms.map((t) => scoreTerm(query, t))) }))
    .filter((p) => p.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.price - b.price)
    .slice(0, limit);
}
