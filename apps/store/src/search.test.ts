import { describe, expect, it } from "vitest";
import { type IndexedProduct, norm, search } from "./search";

const p = (canonicalId: string, name: string, synonyms: string[], price = 10): IndexedProduct => ({
  id: `p_${canonicalId}`,
  canonicalId,
  name,
  unit: "1 pc",
  price,
  stock: 10,
  terms: [name, canonicalId.replace(/_/g, " "), ...synonyms].map(norm),
});

const products = [
  p("onion", "Onion", ["pyaaz", "kanda"]),
  p("spring_onion", "Spring Onion", ["hara pyaaz"]),
  p("peas", "Green Peas (Frozen)", ["matar"]),
  p("coriander_leaves", "Coriander Leaves", ["dhaniya"]),
  p("coriander_powder", "Coriander Powder", ["dhania powder"]),
];

describe("product search", () => {
  it.each([
    ["onion", "onion"],
    ["Pyaaz", "onion"],
    ["green peas", "peas"],
    ["matar", "peas"],
    ["dhaniya", "coriander_leaves"],
    ["coriander powder", "coriander_powder"],
    ["corriander leaves", "coriander_leaves"], // typo
  ])("%s → %s", (q, id) => {
    expect(search(products, q)[0]?.canonicalId).toBe(id);
  });

  it("returns nothing for unrelated queries", () => {
    expect(search(products, "chocolate")).toEqual([]);
  });
});
