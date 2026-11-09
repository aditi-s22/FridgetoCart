import { prisma } from "./db";
import { env } from "./env";
import { embed } from "./services/llm";

const VECTOR_TABLES = ["IngredientCanon", "RecipeDoc"];

/**
 * Fails fast if the vector(N) columns or the embedding model disagree with EMBED_DIM,
 * instead of failing later on the first insert or similarity query.
 */
export async function checkEmbeddingDims(): Promise<void> {
  // pgvector stores a column's dimension in atttypmod.
  const rows = await prisma.$queryRaw<{ table: string; dims: number }[]>`
    SELECT c.relname AS "table", a.atttypmod AS dims
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attname = 'embedding' AND t.typname = 'vector' AND NOT a.attisdropped
      AND c.relname = ANY(${VECTOR_TABLES})`;

  const found = new Map(rows.map((r) => [r.table, Number(r.dims)]));
  const missing = VECTOR_TABLES.filter((t) => !found.has(t));
  if (missing.length) throw new Error(`No embedding column on ${missing.join(", ")}. Run \`pnpm db:push\`.`);

  const wrong = [...found].filter(([, dims]) => dims !== env.EMBED_DIM);
  if (wrong.length) {
    const cols = wrong.map(([t, d]) => `${t}.embedding is vector(${d})`).join(", ");
    throw new Error(`EMBED_DIM=${env.EMBED_DIM} but ${cols}. Run \`pnpm db:push\` (re-embed any existing rows).`);
  }

  await embed("startupCheck", ["dimension check"]); // throws if the model returns another size
  console.log(`embeddings ok: ${env.EMBED_MODEL} → vector(${env.EMBED_DIM})`);
}
