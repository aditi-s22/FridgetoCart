import type { Ingredient, UserPrefs } from "@ftc/shared";
import { buildLexicon } from "../services/normalizer";
import type { RetrievedDoc } from "../services/recipes";
import type { ScanStateT } from "./state";

// Shared fixtures for the graph/node tests.
export const CANON = [
  { canonicalId: "tomato", name: "Tomato", synonyms: ["tamatar"], tags: [] },
  { canonicalId: "onion", name: "Onion", synonyms: ["pyaaz"], tags: ["nojain"] },
  { canonicalId: "paneer", name: "Paneer", synonyms: [], tags: [] },
  { canonicalId: "peas", name: "Green Peas", synonyms: ["matar"], tags: [] },
  { canonicalId: "egg", name: "Egg", synonyms: ["anda"], tags: ["egg"] },
  { canonicalId: "chicken", name: "Chicken", synonyms: [], tags: ["nonveg"] },
  { canonicalId: "salt", name: "Salt", synonyms: [], tags: ["staple"] },
  { canonicalId: "turmeric", name: "Turmeric", synonyms: ["haldi"], tags: ["staple"] },
];
export const LEXICON = buildLexicon(CANON);
export const TAGS = new Map(CANON.map((c) => [c.canonicalId, c.tags]));

const ing = (canonicalId: string, name: string, qty: number | null = null): Ingredient => ({ canonicalId, name, qty, unit: null });

function doc(id: string, title: string, ids: [string, string][], similarity = 0.8): RetrievedDoc {
  return {
    id,
    title,
    ingredients: [...ids.map(([cid, name]) => ing(cid, name)), ing("salt", "Salt"), ing("turmeric", "Turmeric")],
    steps: [`Cook ${title}.`, "Serve hot."],
    timeMins: 25,
    dietTags: ["veg", "egg", "nonveg"],
    sourceUrl: `https://example.com/${id}`,
    similarity,
  };
}

export const DOCS: RetrievedDoc[] = [
  doc("ds1", "Matar Paneer", [["paneer", "Paneer"], ["peas", "Green Peas"], ["tomato", "Tomato"], ["onion", "Onion"]]),
  doc("ds2", "Tomato Onion Sabzi", [["tomato", "Tomato"], ["onion", "Onion"]], 0.7),
  doc("ds3", "Paneer Bhurji", [["paneer", "Paneer"], ["onion", "Onion"]], 0.75),
  doc("ds4", "Peas Pulao", [["peas", "Green Peas"]], 0.6),
];

export const PREFS: UserPrefs = { diet: "veg", avoid: [], maxTimeMins: 30 };
export const CONFIRMED: Ingredient[] = [ing("tomato", "Tomato", 3), ing("onion", "Onion", 2), ing("paneer", "Paneer", 1)];

export const BASE_STATE: ScanStateT = {
  scanId: "s1",
  userId: "u1",
  imageUrl: "x",
  prefs: PREFS,
  detected: [],
  detectedBy: null,
  items: [],
  confirmed: [],
  retrieved: [],
  recipes: [],
  recipesCached: false,
  recipeIssue: null,
  selectedRecipeId: null,
  substitutions: [],
  missing: [],
  cartId: null,
  cart: null,
  messages: [],
  agentSteps: 0,
  attempts: 0,
  genAttempts: 0,
  path: [],
};
