import { describe, expect, it } from "vitest";
import { mean, percentile, pool, scoreSets } from "./metrics";

describe("scoreSets", () => {
  it("counts TP/FP/FN on canonical ids and dedupes", () => {
    const s = scoreSets(["tomato", "tomato", "onion", "kiwi"], ["tomato", "onion", "paneer"]);
    expect(s).toMatchObject({ tp: 2, fp: 1, fn: 1 });
    expect(s.precision).toBeCloseTo(2 / 3);
    expect(s.recall).toBeCloseTo(2 / 3);
    expect(s.f1).toBeCloseTo(2 / 3);
  });
  it("handles empty sets without NaN", () => {
    expect(scoreSets([], [])).toMatchObject({ precision: 0, recall: 0, f1: 0 });
  });
});

describe("pool / percentile / mean", () => {
  it("micro-averages", () => {
    const p = pool([scoreSets(["a"], ["a"]), scoreSets(["b", "c"], ["d"])]);
    expect(p).toMatchObject({ tp: 1, fp: 2, fn: 1 });
  });
  it("nearest-rank percentile", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 95)).toBeNaN();
    expect(mean([2, 4])).toBe(3);
  });
});
