/** Pure scoring helpers for the eval harness (no I/O, unit-tested). */

export type Prf = { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number };

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

/** Compares detected vs labelled canonical ids as sets, so synonyms mapping to one id count once. */
export function scoreSets(detected: Iterable<string>, truth: Iterable<string>): Prf {
  const d = new Set(detected);
  const t = new Set(truth);
  const tp = [...d].filter((x) => t.has(x)).length;
  const fp = d.size - tp;
  const fn = t.size - tp;
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  return { tp, fp, fn, precision, recall, f1: ratio(2 * precision * recall, precision + recall) };
}

/** Micro-average: pool the counts over all images, then compute the ratios. */
export function pool(scores: Prf[]): Prf {
  const tp = scores.reduce((s, x) => s + x.tp, 0);
  const fp = scores.reduce((s, x) => s + x.fp, 0);
  const fn = scores.reduce((s, x) => s + x.fn, 0);
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  return { tp, fp, fn, precision, recall, f1: ratio(2 * precision * recall, precision + recall) };
}

/** Nearest-rank percentile (p in 0..100); NaN for an empty sample. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] as number;
}

export const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : Number.NaN);
