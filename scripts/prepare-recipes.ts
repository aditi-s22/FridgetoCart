/**
 * Builds prisma/seed/recipes.csv from the "6000+ Indian Food Recipes Dataset"
 * (Kanishka Jain, Mendeley Data, CC BY 4.0, doi:10.17632/xsphgmmh7b.1).
 *
 *   pnpm prepare:recipes <path/to/IndianFoodDatasetCSV.csv>
 *
 * Keeps quick Indian recipes whose every ingredient maps to prisma/seed/ingredients.csv.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "./lib/csv";
import { type MappedRecipe, lexiconOf, mapRecipe, readCanon, splitSteps } from "./lib/recipeMapping";
import { loadSourceRecipes } from "./lib/recipeSource";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = 500;
// Max recipes per course group, so the set isn't dominated by sides and chutneys.
const CAPS: Record<string, number> = { main: 260, breakfast: 90, side: 90, snack: 60 };
const GROUP: Record<string, string> = {
  Lunch: "main", Dinner: "main", "Main Course": "main", "One Pot Dish": "main",
  "South Indian Breakfast": "breakfast", "North Indian Breakfast": "breakfast", "Indian Breakfast": "breakfast",
  "Side Dish": "side", Snack: "snack",
};

// Simpler first: fewer non-staple ingredients, then quicker.
const score = (m: MappedRecipe) => m.mainCount + m.source.timeMins / 15;

function select(pool: MappedRecipe[]): MappedRecipe[] {
  const seen = new Set<string>();
  const unique = pool
    .filter((m) => m.mainCount >= 2 && m.mainCount <= 9 && splitSteps(m.source.instructions).length >= 2)
    .sort((a, b) => score(a) - score(b) || Number(a.source.srno) - Number(b.source.srno))
    .filter((m) => {
      const key = m.source.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Every non-veg and egg dish (they're scarce); veg dishes fill the rest within course caps.
  const picked = unique.filter((m) => m.dietTags[0] === "nonveg" || m.dietTags[0] === "egg");
  const used: Record<string, number> = {};
  for (const m of unique) {
    if (picked.length >= TARGET) break;
    if (m.dietTags[0] === "nonveg" || m.dietTags[0] === "egg") continue;
    const group = GROUP[m.source.course] ?? "main";
    if ((used[group] ?? 0) >= (CAPS[group] ?? 0)) continue;
    used[group] = (used[group] ?? 0) + 1;
    picked.push(m);
  }
  return picked.sort((a, b) => Number(a.source.srno) - Number(b.source.srno));
}

function main(): void {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: pnpm prepare:recipes <path/to/IndianFoodDatasetCSV.csv>");
    process.exit(1);
  }
  const canon = readCanon(readFileSync(join(root, "prisma/seed/ingredients.csv"), "utf8"));
  const lex = lexiconOf(canon);
  const pool = loadSourceRecipes(src)
    .map((r) => mapRecipe(canon, lex, r))
    .filter((m): m is MappedRecipe => m !== null);
  const picked = select(pool);

  const rows = picked.map((m) => [
    `ds${m.source.srno}`,
    m.source.title,
    String(m.source.timeMins),
    m.dietTags.join("|"),
    m.source.course,
    JSON.stringify(m.ingredients),
    JSON.stringify(splitSteps(m.source.instructions)),
    m.source.url,
  ]);
  const header = ["id", "title", "timeMins", "dietTags", "course", "ingredients", "steps", "sourceUrl"];
  writeFileSync(join(root, "prisma/seed/recipes.csv"), toCsv(header, rows));

  const count = (f: (m: MappedRecipe) => string) =>
    Object.entries(picked.reduce((a: Record<string, number>, m) => ((a[f(m)] = (a[f(m)] ?? 0) + 1), a), {}));
  console.log(`pool ${pool.length} → wrote ${picked.length} recipes to prisma/seed/recipes.csv`);
  console.log("by diet:", JSON.stringify(count((m) => m.dietTags[0] ?? "")));
  console.log("by course group:", JSON.stringify(count((m) => GROUP[m.source.course] ?? "main")));
}

main();
