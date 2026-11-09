import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import type { PickInterrupt, ScanStateT, ScanUpdate } from "../state";

/** Pauses until the user picks one of the recipes; resumes with its id. */
export async function pickRecipe(state: ScanStateT): Promise<ScanUpdate> {
  const payload: PickInterrupt = { type: "pick_recipe", recipes: state.recipes };
  const recipeId = z.string().parse(interrupt(payload));
  if (!state.recipes.some((r) => r.id === recipeId)) throw new Error(`Unknown recipe ${recipeId}`);
  return { selectedRecipeId: recipeId };
}
