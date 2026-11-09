import { type BaseCheckpointSaver, END, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "../env";
import { detectItems } from "./nodes/detectItems";
import { generateRecipes } from "./nodes/generateRecipes";
import { humanReview } from "./nodes/humanReview";
import { normalize } from "./nodes/normalize";
import { pickRecipe } from "./nodes/pickRecipe";
import { retrieveRecipes } from "./nodes/retrieveRecipes";
import { ScanState, type ScanStateT } from "./state";

// START → detectItems → normalize → humanReview ⏸ → retrieveRecipes → generateRecipes (↺ once) → pickRecipe ⏸ → END
// Strong-model routing lands in M4; diffMissing/cartAgent in M3.
export function buildGraph(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(ScanState)
    .addNode("detectItems", detectItems)
    .addNode("normalize", normalize)
    .addNode("humanReview", humanReview)
    .addNode("retrieveRecipes", retrieveRecipes)
    .addNode("generateRecipes", generateRecipes)
    .addNode("pickRecipe", pickRecipe)
    .addEdge(START, "detectItems")
    .addEdge("detectItems", "normalize")
    .addEdge("normalize", "humanReview")
    .addEdge("humanReview", "retrieveRecipes")
    .addEdge("retrieveRecipes", "generateRecipes")
    // generateRecipes only sets recipeIssue on its first attempt, so this loops at most once.
    .addConditionalEdges("generateRecipes", (s: ScanStateT) => (s.recipeIssue ? "generateRecipes" : "pickRecipe"), [
      "generateRecipes",
      "pickRecipe",
    ])
    .addEdge("pickRecipe", END)
    .compile({ checkpointer });
}

export type ScanGraph = ReturnType<typeof buildGraph>;

let graph: ScanGraph | null = null;

/** Graph with a Postgres checkpointer; thread_id = scanId. */
export async function getGraph(): Promise<ScanGraph> {
  if (graph) return graph;
  // Own schema, so `prisma db push` (which manages "public") never sees or drops these tables.
  const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL, { schema: "langgraph" });
  await checkpointer.setup();
  graph = buildGraph(checkpointer);
  return graph;
}

export const threadOf = (scanId: string) => ({ configurable: { thread_id: scanId } });
