import { type Diet, type Ingredient, dietTagsFor } from "@ftc/shared";
import { type Lexicon, buildLexicon, matchName } from "../../apps/api/src/services/normalizer";
import { readCsvRecords } from "./csv";
import type { ParsedLine } from "./ingredientLine";
import type { SourceRecipe } from "./recipeSource";

export type CanonRow = { canonicalId: string; name: string; synonyms: string[]; tags: string[] };

export function readCanon(csvText: string): CanonRow[] {
  return readCsvRecords(csvText).map((r) => ({
    canonicalId: r.canonicalId ?? "",
    name: r.name ?? "",
    synonyms: (r.synonyms ?? "").split("|").filter(Boolean),
    tags: (r.tags ?? "").split("|").filter(Boolean),
  }));
}

export type MappedRecipe = {
  source: SourceRecipe;
  ingredients: Ingredient[];
  dietTags: Diet[];
  mainCount: number; // non-staple ingredients
};

function matchLine(lex: Lexicon, line: ParsedLine) {
  for (const candidate of [line.name, ...line.aliases, `${line.name} ${line.aliases.join(" ")}`]) {
    const hit = matchName(lex, candidate);
    if (hit) return hit;
  }
  return null;
}

const LABEL: Record<string, Diet> = { "Non Vegeterian": "nonveg", "High Protein Non Vegetarian": "nonveg", Eggetarian: "egg" };

/** Maps every line to a canonical ingredient; null if any line is unknown or the diet label disagrees. */
export function mapRecipe(canon: CanonRow[], lex: Lexicon, r: SourceRecipe): MappedRecipe | null {
  const tagsById = new Map(canon.map((c) => [c.canonicalId, c.tags]));
  const byId = new Map<string, Ingredient>();
  for (const line of r.lines) {
    const hit = matchLine(lex, line);
    if (!hit) return null;
    if (!byId.has(hit.canonicalId)) byId.set(hit.canonicalId, { ...hit, qty: line.qty, unit: line.unit });
  }
  const ingredients = [...byId.values()];
  const tags = new Set(ingredients.flatMap((i) => tagsById.get(i.canonicalId) ?? []));
  const dietTags = dietTagsFor(tags);
  const labelled = LABEL[r.diet];
  // A dish labelled non-veg/egg whose ingredients look vegetarian has something we failed to map.
  if (labelled && dietTags[0] !== labelled) return null;
  const mainCount = ingredients.filter((i) => !tagsById.get(i.canonicalId)?.includes("staple")).length;
  return { source: r, ingredients, dietTags, mainCount };
}

export function lexiconOf(canon: CanonRow[]): Lexicon {
  return buildLexicon(canon);
}

/** "Heat oil.Add jeera. Serve hot." → steps of at most ~240 chars. */
export function splitSteps(instructions: string): string[] {
  const sentences = instructions
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s*(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const steps: string[] = [];
  for (const s of sentences) {
    const last = steps[steps.length - 1];
    if (last && last.length + s.length < 240) steps[steps.length - 1] = `${last} ${s}`;
    else steps.push(s);
  }
  return steps;
}
