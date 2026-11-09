import { AIMessage } from "@langchain/core/messages";
import { type BaseCheckpointSaver, END, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { env } from "../env";
import { MAX_AGENT_STEPS, cartAgent } from "./nodes/cartAgent";
import { detectItems } from "./nodes/detectItems";
import { diffMissing } from "./nodes/diffMissing";
import { finalizeCart } from "./nodes/finalizeCart";
import { generateRecipes } from "./nodes/generateRecipes";
import { humanReview } from "./nodes/humanReview";
import { normalize } from "./nodes/normalize";
import { pickRecipe } from "./nodes/pickRecipe";
import { retrieveRecipes } from "./nodes/retrieveRecipes";
import { ScanState, type ScanStateT } from "./state";
import { CART_TOOLS } from "./tools";

function afterAgent(s: ScanStateT): "tools" | "finalizeCart" {
  const last = s.messages.at(-1);
  const wantsTools = AIMessage.isInstance(last) && (last.tool_calls?.length ?? 0) > 0;
  return wantsTools && s.agentSteps < MAX_AGENT_STEPS ? "tools" : "finalizeCart";
}

// START → detectItems → normalize → humanReview ⏸ → retrieveRecipes → generateRecipes (↺ once) → pickRecipe ⏸
//   → diffMissing → (missing ? cartAgent ⇄ tools (≤ 10 turns) → finalizeCart : END)
// Strong-model routing lands in M4.
export function buildGraph(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(ScanState)
    .addNode("detectItems", detectItems)
    .addNode("normalize", normalize)
    .addNode("humanReview", humanReview)
    .addNode("retrieveRecipes", retrieveRecipes)
    .addNode("generateRecipes", generateRecipes)
    .addNode("pickRecipe", pickRecipe)
    .addNode("diffMissing", diffMissing)
    .addNode("cartAgent", cartAgent)
    .addNode("tools", new ToolNode(CART_TOOLS))
    .addNode("finalizeCart", finalizeCart)
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
    .addEdge("pickRecipe", "diffMissing")
    .addConditionalEdges("diffMissing", (s: ScanStateT) => (s.missing.length ? "cartAgent" : END), ["cartAgent", END])
    .addConditionalEdges("cartAgent", afterAgent, ["tools", "finalizeCart"])
    .addEdge("tools", "cartAgent")
    .addEdge("finalizeCart", END)
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
