import type { Diet, Ingredient } from "@ftc/shared";
import { prisma } from "../db";

export type RetrievedDoc = {
  id: string;
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  timeMins: number;
  dietTags: string[];
  sourceUrl: string;
  similarity: number;
};

/**
 * Nearest recipe docs by cosine similarity, hard-filtered by diet, max time and avoided
 * ingredients. Raw SQL rather than PGVectorStore: the table is Prisma-managed and the
 * filters are on array columns.
 */
export async function searchRecipeDocs(opts: {
  vector: number[];
  diet: Diet;
  maxTimeMins: number;
  avoidIds: string[];
  limit: number;
}): Promise<RetrievedDoc[]> {
  const vec = `[${opts.vector.join(",")}]`;
  return prisma.$queryRaw<RetrievedDoc[]>`
    SELECT id, title, ingredients, steps, "timeMins", "dietTags", "sourceUrl",
           1 - (embedding <=> ${vec}::vector) AS similarity
    FROM "RecipeDoc"
    WHERE embedding IS NOT NULL
      AND ${opts.diet} = ANY("dietTags")
      AND "timeMins" <= ${opts.maxTimeMins}
      AND NOT ("ingredientIds" && ${opts.avoidIds}::text[])
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${opts.limit}`;
}

/** Share of a doc's non-staple ingredients the user already has. */
export function coverage(doc: RetrievedDoc, have: Set<string>, isStaple: (id: string) => boolean): number {
  const main = doc.ingredients.filter((i) => !isStaple(i.canonicalId));
  if (main.length === 0) return 0;
  return main.filter((i) => have.has(i.canonicalId)).length / main.length;
}

/** Re-rank vector hits so recipes the user can mostly cook already come first. */
export function rerank(docs: RetrievedDoc[], have: Set<string>, isStaple: (id: string) => boolean, top: number) {
  return docs
    .map((d) => ({ d, score: 0.6 * coverage(d, have, isStaple) + 0.4 * d.similarity }))
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map((x) => x.d);
}
