import type { PrismaClient } from "@prisma/client";
import { embed } from "../../apps/api/src/services/llm";

const BATCH = 50;
const MAX_RETRIES = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Embeds with backoff: free-tier Gemini keys hit 429s quickly on bulk embedding. */
async function embedWithRetry(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embed("seed", texts);
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt >= MAX_RETRIES || !/429|quota|rate|503|unavailable/i.test(msg)) throw err;
      const wait = 15_000 * attempt;
      console.log(`  rate limited, retrying in ${wait / 1000}s (${attempt}/${MAX_RETRIES - 1})`);
      await sleep(wait);
    }
  }
}

type Table = "IngredientCanon" | "RecipeDoc";
const KEY: Record<Table, string> = { IngredientCanon: "canonicalId", RecipeDoc: "id" };

/** Embeds rows whose text changed since the last run (or that were never embedded). */
export async function embedRows(prisma: PrismaClient, table: Table, rows: { id: string; text: string }[]): Promise<number> {
  const current = await prisma.$queryRawUnsafe<{ id: string; text: string | null; has: boolean }[]>(
    `SELECT "${KEY[table]}" AS id, "embeddedText" AS text, embedding IS NOT NULL AS has FROM "${table}"`,
  );
  const done = new Map(current.map((r) => [r.id, r.has ? r.text : null]));
  const todo = rows.filter((r) => done.get(r.id) !== r.text);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const vectors = await embedWithRetry(batch.map((r) => r.text));
    await prisma.$transaction(
      batch.map((r, j) =>
        prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET embedding = $1::vector, "embeddedText" = $2 WHERE "${KEY[table]}" = $3`,
          `[${(vectors[j] ?? []).join(",")}]`,
          r.text,
          r.id,
        ),
      ),
    );
    console.log(`  ${table}: embedded ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  return todo.length;
}
