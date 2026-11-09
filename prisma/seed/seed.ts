import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

function readCsv(file: string): string[][] {
  const lines = readFileSync(join(here, file), "utf8").trim().split(/\r?\n/);
  return lines.slice(1).map((line) => line.split(","));
}

async function seedIngredients(): Promise<number> {
  const rows = readCsv("ingredients.csv");
  for (const [canonicalId, name, synonyms] of rows) {
    if (!canonicalId || !name) continue;
    const data = { name, synonyms: (synonyms ?? "").split("|").filter(Boolean) };
    await prisma.ingredientCanon.upsert({
      where: { canonicalId },
      create: { canonicalId, ...data },
      update: data,
    });
  }
  return rows.length;
}

async function main(): Promise<void> {
  const n = await seedIngredients();
  console.log(`seeded ${n} ingredients`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
