import { END, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "../env";
import { detectItems } from "./nodes/detectItems";
import { normalize } from "./nodes/normalize";
import { ScanState } from "./state";

// M1: START → detectItems → normalize → END.
// humanReview and the rest of the pipeline are wired in from M2; strong-model routing in M4.
export function buildGraph(checkpointer: PostgresSaver) {
  return new StateGraph(ScanState)
    .addNode("detectItems", detectItems)
    .addNode("normalize", normalize)
    .addEdge(START, "detectItems")
    .addEdge("detectItems", "normalize")
    .addEdge("normalize", END)
    .compile({ checkpointer });
}

export type ScanGraph = ReturnType<typeof buildGraph>;

let graph: ScanGraph | null = null;

/** Graph with a Postgres checkpointer; thread_id = scanId. */
export async function getGraph(): Promise<ScanGraph> {
  if (graph) return graph;
  const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL);
  await checkpointer.setup();
  graph = buildGraph(checkpointer);
  return graph;
}

export const threadOf = (scanId: string) => ({ configurable: { thread_id: scanId } });
