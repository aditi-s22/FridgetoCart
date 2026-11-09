import { describe, expect, it } from "vitest";
import { buildLexicon, matchName, parseQty } from "./normalizer";

const lex = buildLexicon([
  { canonicalId: "tomato", name: "Tomato", synonyms: ["tamatar"] },
  { canonicalId: "coriander_leaves", name: "Coriander Leaves", synonyms: ["dhaniya", "cilantro"] },
  { canonicalId: "paneer", name: "Paneer", synonyms: ["cottage cheese"] },
]);

describe("matchName", () => {
  it.each([
    ["Tamatar", "tomato"],
    ["tomatoes", "tomato"],
    ["Fresh Dhaniya", "coriander_leaves"],
    ["coriander leaves", "coriander_leaves"],
    ["packet of paneer", "paneer"],
    ["Cottage-Cheese", "paneer"],
  ])("%s → %s", (raw, id) => {
    expect(matchName(lex, raw)?.canonicalId).toBe(id);
  });

  it("returns null for unknown items", () => {
    expect(matchName(lex, "dragon fruit")).toBeNull();
  });
});

describe("parseQty", () => {
  it.each([
    [null, null, null],
    ["3", 3, null],
    ["half bowl", 0.5, "bowl"],
    ["500g", 500, "g"],
    ["2 packets", 2, "packet"],
    ["1/2 kg", 0.5, "kg"],
    ["a dozen", 12, null],
    ["a few", null, null],
  ])("%s → %s %s", (raw, qty, unit) => {
    expect(parseQty(raw)).toEqual({ qty, unit });
  });
});
