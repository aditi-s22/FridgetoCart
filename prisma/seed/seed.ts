/**
 * Seeds canonical ingredients and recipe docs, then embeds anything new or changed.
 * Recipes come from scripts/prepare-recipes.ts (dataset: CC BY 4.0, see README).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ingredient } from "@ftc/shared";
import { PrismaClient } from "@prisma/client";
import { ingredientCanonText, recipeDocText } from "../../apps/api/src/services/recipeText";
import { readCsvRecords } from "../../scripts/lib/csv";
import { readCanon } from "../../scripts/lib/recipeMapping";
import { embedRows } from "./embedRows";

const here = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const CHUNK = 100;

async function inChunks<T>(items: T[], fn: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK) await fn(items.slice(i, i + CHUNK));
}

async function seedIngredients(): Promise<Set<string>> {
  const rows = readCanon(readFileSync(join(here, "ingredients.csv"), "utf8")).filter((r) => r.canonicalId && r.name);
  await inChunks(rows, (chunk) =>
    prisma.$transaction(
      chunk.map(({ canonicalId, name, synonyms, tags }) =>
        prisma.ingredientCanon.upsert({
          where: { canonicalId },
          create: { canonicalId, name, synonyms, tags },
          update: { name, synonyms, tags },
        }),
      ),
    ),
  );
  console.log(`ingredients: ${rows.length} upserted`);
  const n = await embedRows(prisma, "IngredientCanon", rows.map((r) => ({ id: r.canonicalId, text: ingredientCanonText(r.name, r.synonyms) })));
  console.log(`ingredients: ${n} (re)embedded`);
  return new Set(rows.filter((r) => r.tags.includes("staple")).map((r) => r.canonicalId));
}

async function seedRecipes(staples: Set<string>): Promise<void> {
  const rows = readCsvRecords(readFileSync(join(here, "recipes.csv"), "utf8")).map((r) => {
    const ingredients = JSON.parse(r.ingredients ?? "[]") as Ingredient[];
    return {
      id: r.id ?? "",
      title: r.title ?? "",
      ingredients,
      ingredientIds: ingredients.map((i) => i.canonicalId),
      steps: JSON.parse(r.steps ?? "[]") as string[],
      timeMins: Number(r.timeMins),
      dietTags: (r.dietTags ?? "").split("|").filter(Boolean),
      course: r.course ?? "",
      sourceUrl: r.sourceUrl ?? "",
    };
  });
  await inChunks(rows, (chunk) =>
    prisma.$transaction(
      chunk.map(({ id, ...data }) => prisma.recipeDoc.upsert({ where: { id }, create: { id, ...data }, update: data })),
    ),
  );
  const removed = await prisma.recipeDoc.deleteMany({ where: { id: { notIn: rows.map((r) => r.id) } } });
  console.log(`recipes: ${rows.length} upserted, ${removed.count} removed`);

  const texts = rows.map((r) => ({
    id: r.id,
    text: recipeDocText(r.title, r.ingredients.filter((i) => !staples.has(i.canonicalId)).map((i) => i.name)),
  }));
  const n = await embedRows(prisma, "RecipeDoc", texts);
  console.log(`recipes: ${n} (re)embedded`);
}

async function main(): Promise<void> {
  const staples = await seedIngredients();
  await seedRecipes(staples);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
