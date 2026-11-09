import type { SuggestSubstitutionsResponse } from "@ftc/shared";
import { Router } from "express";
import { userIdOf } from "../auth";
import { getGraph } from "../graph/build";
import { progressOf } from "../graph/progress";
import { AppError } from "../http";
import { suggestSubstitutions } from "../services/substitutions";
import { prefsOf } from "./prefs";
import { ownScan } from "./scans";

export const substitutionRoutes = Router();

/** AI substitution suggestions for a recipe's missing ingredients. Read-only: nothing is saved. */
substitutionRoutes.post("/:id/recipes/:recipeId/substitutions", async (req, res) => {
  const userId = userIdOf(res.locals);
  const scan = await ownScan(req.params.id, userId);
  const p = await progressOf(await getGraph(), scan.id);
  if (p.pending?.type !== "pick_recipe") throw new AppError(409, "not_awaiting_pick", "This scan is not waiting for a recipe pick");
  const recipe = p.pending.recipes.find((r) => r.id === req.params.recipeId);
  if (!recipe) throw new AppError(404, "bad_recipe", "Unknown recipe for this scan");
  const suggestions = await suggestSubstitutions(recipe, await prefsOf(userId), p.values.confirmed ?? []);
  const body: SuggestSubstitutionsResponse = { suggestions };
  res.json(body);
});
