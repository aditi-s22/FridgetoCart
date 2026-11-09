/**
 * Parses dataset ingredient lines such as
 *   "1-1/2 cups Whole Wheat Flour (atta) - sifted"  →  qty 1.5, unit "cup", name "whole wheat flour", aliases ["atta"]
 */
export type ParsedLine = { qty: number | null; unit: string | null; name: string; aliases: string[] };

const UNITS: Record<string, string> = {
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g", kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  cup: "cup", cups: "cup", tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp",
  sprig: "sprig", sprigs: "sprig", inch: "inch", inches: "inch", pinch: "pinch", pinches: "pinch",
  bunch: "bunch", bunches: "bunch", handful: "handful", handfuls: "handful", piece: "piece", pieces: "piece",
  packet: "packet", packets: "packet", can: "can", cans: "can", slice: "slice", slices: "slice",
  stalk: "stalk", stalks: "stalk", pod: "pod", pods: "pod", clove: "clove", cloves: "clove", leaves: "leaf",
};
const SIZES = new Set(["small", "medium", "large", "big", "whole", "fresh", "few", "some", "spoon", "spoons"]);
const QTY = /^(\d+)\s*-\s*(\d+)\/(\d+)\s+|^(\d+)\s+(\d+)\/(\d+)\s+|^(\d+)\/(\d+)\s+|^(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\s+/;

function takeQty(s: string): { qty: number | null; rest: string } {
  const m = QTY.exec(s);
  if (!m) return { qty: null, rest: s };
  const n = (i: number) => Number(m[i]);
  let qty: number;
  if (m[1]) qty = n(1) + n(2) / n(3);
  else if (m[4]) qty = n(4) + n(5) / n(6);
  else if (m[7]) qty = n(7) / n(8);
  else qty = n(9);
  return { qty: Math.round(qty * 1000) / 1000, rest: s.slice(m[0].length) };
}

export function parseIngredientLine(raw: string): ParsedLine | null {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.split(/\s+-\s+|\s+-$/)[0]?.trim() ?? s; // drop " - finely chopped"
  const { qty, rest } = takeQty(s);
  s = rest;

  let unit: string | null = null;
  const [first = "", ...others] = s.split(" ");
  const u = UNITS[first.toLowerCase()];
  // "4 Cloves (Laung)" is the spice, not a unit: only treat it as a unit if a real name follows.
  if (u && others.length && !others[0]?.startsWith("(")) {
    unit = u;
    s = others.join(" ");
  }
  while (SIZES.has(s.split(" ")[0]?.toLowerCase() ?? "") && s.includes(" ")) s = s.slice(s.indexOf(" ") + 1);

  const aliases = [...s.matchAll(/\(([^)]*)\)/g)].flatMap((m) => (m[1] ?? "").split(/[/,]/)).map((a) => a.trim()).filter(Boolean);
  const name = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!name && aliases.length === 0) return null;
  return { qty, unit, name: name || (aliases[0] ?? "").toLowerCase(), aliases: aliases.map((a) => a.toLowerCase()) };
}

/** Lines are comma separated, but commas inside brackets belong to the alias list. */
export function splitIngredientLines(field: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of field) {
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
