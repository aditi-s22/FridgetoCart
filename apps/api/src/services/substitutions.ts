import {
  type AppliedSubstitution,
  GeneratedSubstitutions,
  type Ingredient,
  type Recipe,
  type SubstitutionOption,
  type SubstitutionSuggestion,
  type UserPrefs,
  dietTagsFor,
} from "@ftc/shared";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { structured } from "./llm";
import { type CanonTags, loadCanonTags, loadLexicon, matchName } from "./normalizer";

export const SUBSTITUTION_PROMPT = [
  "You suggest ingredient substitutions for an Indian home cook who is missing some ingredients of a recipe.",
  "For each missing ingredient return up to 3 options, best first. Rules:",
  "- substituteId MUST be an id from the candidate list; never invent ids.",
  "- Only suggest a substitute that genuinely works in THIS dish (e.g. thick curd for fresh cream in a gravy).",
  "  If nothing suitable exists, return an empty options list. Never suggest something just because it is available.",
  "- Prefer candidates marked (have): the user already owns them. Otherwise prefer common, affordable Indian ingredients.",
  "- qty/unit: how much to use for this recipe (null if unsure). reason: one short sentence on why it works.",
  "- flavorImpact: the expected taste/texture difference, one short sentence.",
  "- stepChanges: method changes the swap needs, such as whisking the curd and adding it off the heat; empty if none.",
].join("\n");

export type SubCtx = {
  names: Map<string, string>;
  tags: CanonTags;
  prefs: UserPrefs;
  avoidIds: Set<string>;
  haveIds: Set<string>;
};

export async function makeSubCtx(prefs: UserPrefs, confirmed: Ingredient[]): Promise<SubCtx> {
  const [lex, tags] = await Promise.all([loadLexicon(), loadCanonTags()]);
  const names = new Map([...lex.values()].map((c) => [c.canonicalId, c.name]));
  const avoidIds = new Set(prefs.avoid.flatMap((a) => matchName(lex, a)?.canonicalId ?? []));
  return { names, tags, prefs, avoidIds, haveIds: new Set(confirmed.map((i) => i.canonicalId)) };
}

const isStaple = (ctx: SubCtx, id: string) => ctx.tags.get(id)?.includes("staple") ?? false;

/** Why a substitute id can't be used for this recipe, or null if it is fine. */
export function substituteProblem(id: string, recipe: Recipe, ctx: SubCtx): string | null {
  if (!ctx.names.has(id)) return "unknown ingredient";
  if (recipe.ingredients.some((i) => i.canonicalId === id)) return "already in the recipe";
  if (ctx.avoidIds.has(id)) return "on the avoid list";
  if (!dietTagsFor(ctx.tags.get(id) ?? []).includes(ctx.prefs.diet)) return `breaks the ${ctx.prefs.diet} diet`;
  return null;
}

const isAvailable = (ctx: SubCtx, id: string) => ctx.haveIds.has(id) || isStaple(ctx, id);

function userPrompt(recipe: Recipe, ctx: SubCtx): string {
  const missing = recipe.missing.map((id) => {
    const ing = recipe.ingredients.find((i) => i.canonicalId === id);
    const use = ing?.qty != null ? ` (recipe uses ${ing.qty}${ing.unit ? ` ${ing.unit}` : ""})` : "";
    return `- ${ing?.name ?? id} [${id}]${use}`;
  });
  // Only ingredients allowed by diet/avoid and not already in the recipe are offered to the model.
  const cands = [...ctx.names]
    .filter(([id]) => !substituteProblem(id, recipe, ctx))
    .map(([id, name]) => `${id}=${name}${isAvailable(ctx, id) ? " (have)" : ""}`);
  return [
    `Recipe: ${recipe.title}`,
    `Ingredients: ${recipe.ingredients.map((i) => i.name).join(", ")}`,
    `Diet: ${ctx.prefs.diet}. Avoid: ${ctx.prefs.avoid.join(", ") || "nothing"}.`,
    "",
    "Missing ingredients:",
    ...missing,
    "",
    `Candidates (id=name): ${cands.join("; ")}`,
  ].join("\n");
}

/** Keeps only valid options (everything is re-checked here), pantry items first, max 3 per ingredient. */
export function vetSuggestions(raw: GeneratedSubstitutions, recipe: Recipe, ctx: SubCtx): SubstitutionSuggestion[] {
  const out: SubstitutionSuggestion[] = [];
  for (const s of raw.suggestions) {
    if (!recipe.missing.includes(s.originalId) || out.some((o) => o.originalId === s.originalId)) continue;
    const seen = new Set<string>();
    const options: SubstitutionOption[] = [];
    for (const o of s.options) {
      if (seen.has(o.substituteId) || substituteProblem(o.substituteId, recipe, ctx)) continue;
      seen.add(o.substituteId);
      options.push({
        substituteId: o.substituteId,
        substituteName: ctx.names.get(o.substituteId) ?? o.substituteId,
        qty: o.qty,
        unit: o.unit,
        availability: isAvailable(ctx, o.substituteId) ? "in_fridge" : "must_buy",
        reason: o.reason,
        flavorImpact: o.flavorImpact,
        stepChanges: o.stepChanges,
      });
    }
    // Sort is stable: the model's order is kept within each availability group.
    options.sort((a, b) => Number(b.availability === "in_fridge") - Number(a.availability === "in_fridge"));
    if (options.length > 0) {
      const originalName = recipe.ingredients.find((i) => i.canonicalId === s.originalId)?.name ?? s.originalId;
      out.push({ originalId: s.originalId, originalName, options: options.slice(0, 3) });
    }
  }
  return out;
}

/** LLM substitutes for the recipe's missing ingredients; unusable options are dropped, so the result may be empty. */
export async function suggestSubstitutions(recipe: Recipe, prefs: UserPrefs, confirmed: Ingredient[]): Promise<SubstitutionSuggestion[]> {
  if (recipe.missing.length === 0) return [];
  const ctx = await makeSubCtx(prefs, confirmed);
  const raw = await structured({
    role: "text",
    node: "suggestSubstitutions",
    schema: GeneratedSubstitutions,
    messages: [new SystemMessage(SUBSTITUTION_PROMPT), new HumanMessage(userPrompt(recipe, ctx))],
  });
  return vetSuggestions(raw, recipe, ctx);
}

/** Re-checks substitutions sent by the client; names come from the canon, never the client. Throws on an invalid one. */
export function vetAccepted(subs: AppliedSubstitution[], recipe: Recipe, ctx: SubCtx): AppliedSubstitution[] {
  const seen = new Set<string>();
  return subs.map((s) => {
    if (!recipe.missing.includes(s.originalId)) throw new Error(`${s.originalId} is not a missing ingredient of this recipe`);
    if (seen.has(s.originalId)) throw new Error(`${s.originalId} is substituted twice`);
    seen.add(s.originalId);
    const problem = substituteProblem(s.substituteId, recipe, ctx);
    if (problem) throw new Error(`${s.substituteId}: ${problem}`);
    return { ...s, substituteName: ctx.names.get(s.substituteId) ?? s.substituteName };
  });
}
