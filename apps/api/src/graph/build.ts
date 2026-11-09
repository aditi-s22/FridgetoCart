import { AIMessage } from "@langchain/core/messages";
import { type BaseCheckpointSaver, END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { env } from "../env";
import { FastPostgresSaver } from "./fastSaver";
import { MAX_AGENT_STEPS, cartAgent } from "./nodes/cartAgent";
import { detectItems, needsStrong } from "./nodes/detectItems";
import { detectStrong } from "./nodes/detectStrong";
import { diffMissing } from "./nodes/diffMissing";
import { finalizeCart } from "./nodes/finalizeCart";
import { generateRecipes } from "./nodes/generateRecipes";
import { humanReview } from "./nodes/humanReview";
import { normalize } from "./nodes/normalize";
import { pickRecipe } from "./nodes/pickRecipe";
import { retrieveRecipes } from "./nodes/retrieveRecipes";
import { ScanState, type ScanStateT, type ScanUpdate } from "./state";
import { CART_TOOLS } from "./tools";

/** Records the node in `path` for the trace and logs how long it took. */
const step =
  (name: string, fn: (s: ScanStateT) => Promise<ScanUpdate>) =>
  async (s: ScanStateT): Promise<ScanUpdate> => {
    const started = performance.now();
    const update = await fn(s);
    console.log(JSON.stringify({ evt: "node", scanId: s.scanId, node: name, ms: Math.round(performance.now() - started) }));
    return { ...update, path: [name] };
  };

function afterAgent(s: ScanStateT): "tools" | "finalizeCart" {
  const last = s.messages.at(-1);
  const wantsTools = AIMessage.isInstance(last) && (last.tool_calls?.length ?? 0) > 0;
  return wantsTools && s.agentSteps < MAX_AGENT_STEPS ? "tools" : "finalizeCart";
}

// START → detectItems → (low confidence ? detectStrong) → normalize → humanReview ⏸
//   → retrieveRecipes → (cache hit ? pickRecipe : generateRecipes (↺ once) → pickRecipe ⏸)
//   → diffMissing → (missing ? cartAgent ⇄ tools (≤ 10 turns) → finalizeCart : END)
export function buildGraph(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(ScanState)
    .addNode("detectItems", step("detectItems", detectItems))
    .addNode("detectStrong", step("detectStrong", detectStrong))
    .addNode("normalize", step("normalize", normalize))
    .addNode("humanReview", step("humanReview", humanReview))
    .addNode("retrieveRecipes", step("retrieveRecipes", retrieveRecipes))
    .addNode("generateRecipes", step("generateRecipes", generateRecipes))
    .addNode("pickRecipe", step("pickRecipe", pickRecipe))
    .addNode("diffMissing", step("diffMissing", diffMissing))
    .addNode("cartAgent", step("cartAgent", cartAgent))
    .addNode("tools", new ToolNode(CART_TOOLS))
    .addNode("finalizeCart", step("finalizeCart", finalizeCart))
    .addEdge(START, "detectItems")
    .addConditionalEdges("detectItems", needsStrong, ["detectStrong", "normalize"])
    .addEdge("detectStrong", "normalize")
    .addEdge("normalize", "humanReview")
    .addEdge("humanReview", "retrieveRecipes")
    .addConditionalEdges("retrieveRecipes", (s: ScanStateT) => (s.recipesCached ? "pickRecipe" : "generateRecipes"), [
      "pickRecipe",
      "generateRecipes",
    ])
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
  const checkpointer = new FastPostgresSaver(env.DATABASE_URL, "langgraph");
  await checkpointer.setup();
  graph = buildGraph(checkpointer);
  return graph;
}

/** thread_id = scanId; runName/metadata group the run in LangSmith when tracing is on. */
export const threadOf = (scanId: string) => ({
  configurable: { thread_id: scanId },
  runName: "scan",
  metadata: { scanId },
});

/**
 * Config for running the graph. Checkpoints are written once, when the run pauses or ends, not
 * after every node: each one costs several Neon round trips (~100 ms each). A crash mid-run leaves
 * the scan at its last pause, and retrying the request re-runs from there (cart writes are idempotent).
 */
export const runOf = (scanId: string) => ({ ...threadOf(scanId), durability: "exit" as const });
