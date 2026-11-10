import type { AppliedSubstitution } from "@ftc/shared";
import { RemoveMessage } from "@langchain/core/messages";
import { REMOVE_ALL_MESSAGES } from "@langchain/langgraph";
import { type ScanGraph, runOf, threadOf } from "./build";

/**
 * Runs the cart build again for a scan whose earlier pick failed after the recipe was chosen
 * (store or model down). The state is rewound to just after `pickRecipe` with the new choice, and
 * the failed attempt's cart progress is cleared; the run then continues with diffMissing → cart.
 * The store keeps one cart per scan and finalizeCart removes off-list items, so a retry with a
 * different recipe never leaves the old recipe's products behind.
 */
export async function restartPick(graph: ScanGraph, scanId: string, recipeId: string, substitutions: AppliedSubstitution[]) {
  await graph.updateState(
    threadOf(scanId),
    {
      selectedRecipeId: recipeId,
      substitutions,
      missing: [],
      cartId: null,
      cart: null,
      agentSteps: 0,
      messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES })],
    },
    "pickRecipe",
  );
  return graph.invoke(null, runOf(scanId));
}
