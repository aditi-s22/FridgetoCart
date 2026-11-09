import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { GeneratedRecipes } from "@ftc/shared";
import { recipeCacheKey, setCachedRecipes } from "../../services/cache";
import { structured } from "../../services/llm";
import { loadCanonTags, loadLexicon, matchName } from "../../services/normalizer";
import type { ScanStateT, ScanUpdate } from "../state";
import { type BuildCtx, buildFromPicks, fallbackRecipes, isStaple, validatePicks } from "./recipeBuild";

export const RECIPES_PROMPT = [
  "You help students and young professionals in Indian cities cook with what is already in their fridge.",
  "Use ONLY the provided recipe docs as a base; you may adapt them. Respect diet/avoid/maxTime strictly.",
  "Prefer recipes that maximize `have` (ingredients marked ✓). Return 3–5, each from a different doc.",
  "For each pick:",
  "- sourceDocId: the doc id in square brackets.",
  "- ingredientIds: the non-staple ingredient ids your version uses. Each must come from that doc, or be a",
  "  sensible swap taken from the user's list (use the user's id). Keep at least two thirds of the doc's",
  "  ingredients (swaps count). Never drop a core ingredient to make a dish look easier: missing (✗) ones",
  "  simply go on the user's shopping list. Only garnishes or truly optional items may be dropped.",
  "- title: the doc title, or a lightly adapted one if you swapped something.",
  "- note: one short sentence on a swap or a dropped garnish, or null if you changed nothing.",
  "  Don't mention missing ingredients in the note; the app already lists them.",
  "Staples (salt, oil, spices, …) are assumed available; don't list them.",
].join("\n");

async function makeCtx(state: ScanStateT): Promise<BuildCtx> {
  const [lex, tags] = await Promise.all([loadLexicon(), loadCanonTags()]);
  const avoidIds = new Set(state.prefs.avoid.flatMap((a) => matchName(lex, a)?.canonicalId ?? []));
  return { docs: state.retrieved, confirmed: state.confirmed, prefs: state.prefs, tags, avoidIds };
}

function userPrompt(state: ScanStateT, ctx: BuildCtx): string {
  const userIds = new Set(state.confirmed.map((i) => i.canonicalId));
  const { diet, avoid, maxTimeMins } = state.prefs;
  const lines = [
    `Diet: ${diet}. Avoid: ${avoid.length ? avoid.join(", ") : "nothing"}. Max time: ${maxTimeMins} min.`,
    `User has: ${state.confirmed.filter((i) => !isStaple(ctx, i.canonicalId)).map((i) => `${i.name} (${i.canonicalId})`).join(", ") || "nothing"}`,
    "",
    "Recipe docs:",
    ...ctx.docs.map((d) => {
      const main = d.ingredients.filter((i) => !isStaple(ctx, i.canonicalId));
      const list = main.map((i) => `${userIds.has(i.canonicalId) ? "✓" : "✗"} ${i.name} (${i.canonicalId})`).join(", ");
      return `[${d.id}] ${d.title} · ${d.timeMins} min · ${list}`;
    }),
  ];
  if (state.recipeIssue) lines.push("", `Your previous answer was rejected: ${state.recipeIssue}. Fix these problems.`);
  return lines.join("\n");
}

/** Picks/adapts 3–5 of the retrieved docs. One retry on invalid picks, then unadapted docs. */
export async function generateRecipes(state: ScanStateT): Promise<ScanUpdate> {
  if (state.retrieved.length === 0) return { recipes: [], recipeIssue: null };
  const ctx = await makeCtx(state);
  const attempt = state.genAttempts + 1;

  let picks: GeneratedRecipes["recipes"];
  try {
    picks = (
      await structured({
        role: "text",
        node: "generateRecipes",
        schema: GeneratedRecipes,
        messages: [new SystemMessage(RECIPES_PROMPT), new HumanMessage(userPrompt(state, ctx))],
        timeoutMs: 45_000,
      })
    ).recipes;
  } catch (err) {
    console.warn("[generateRecipes] model failed, using retrieved docs:", (err as Error).message);
    return { recipes: fallbackRecipes(ctx), recipeIssue: null, genAttempts: attempt };
  }

  const issues = validatePicks(picks, ctx);
  if (issues.length === 0) {
    const recipes = buildFromPicks(picks, ctx);
    // Only validated model output is cached; the fallback is a degraded answer worth retrying later.
    await setCachedRecipes(recipeCacheKey(state.confirmed, state.prefs), recipes);
    return { recipes, recipeIssue: null, genAttempts: attempt };
  }
  if (attempt < 2) return { recipeIssue: issues.join("; "), genAttempts: attempt };
  console.warn("[generateRecipes] invalid picks twice, using retrieved docs:", issues.join("; "));
  return { recipes: fallbackRecipes(ctx), recipeIssue: null, genAttempts: attempt };
}
