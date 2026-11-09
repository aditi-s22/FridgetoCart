import { getCachedRecipes, recipeCacheKey } from "../../services/cache";
import { embed } from "../../services/llm";
import { loadCanonTags, loadLexicon, matchName } from "../../services/normalizer";
import { ingredientsQueryText } from "../../services/recipeText";
import { rerank, searchRecipeDocs } from "../../services/recipes";
import type { ScanStateT, ScanUpdate } from "../state";

const CANDIDATES = 30;
const TOP = 10;

/**
 * Cache first (same items + prefs → same recipes). On a miss: embed the confirmed ingredients →
 * pgvector search with diet/avoid/time filters → re-rank → top 10.
 */
export async function retrieveRecipes(state: ScanStateT): Promise<ScanUpdate> {
  const cached = await getCachedRecipes(recipeCacheKey(state.confirmed, state.prefs));
  if (cached) return { recipes: cached, recipesCached: true, retrieved: [], recipeIssue: null };

  const [lex, tags] = await Promise.all([loadLexicon(), loadCanonTags()]);
  const isStaple = (id: string) => tags.get(id)?.includes("staple") ?? false;

  const main = state.confirmed.filter((i) => !isStaple(i.canonicalId));
  const [vector] = await embed("retrieveRecipes", [ingredientsQueryText(main.map((i) => i.name))]);
  if (!vector) throw new Error("embedding returned no vector");

  // Avoid terms are free text ("baingan", "mushrooms"); unknown ones can't filter anything.
  const avoidIds = state.prefs.avoid.map((a) => matchName(lex, a)?.canonicalId).filter((id): id is string => !!id);
  const docs = await searchRecipeDocs({
    vector,
    diet: state.prefs.diet,
    maxTimeMins: state.prefs.maxTimeMins,
    avoidIds,
    limit: CANDIDATES,
  });
  const have = new Set(state.confirmed.map((i) => i.canonicalId));
  return { retrieved: rerank(docs, have, isStaple, TOP), recipesCached: false, genAttempts: 0, recipeIssue: null };
}
