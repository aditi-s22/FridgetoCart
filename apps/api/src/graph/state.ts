import { Annotation } from "@langchain/langgraph";
import type { DetectedItem, ReviewItem } from "@ftc/shared";

const replace = <T>(fallback: () => T) => Annotation<T>({ reducer: (_prev, next) => next, default: fallback });

// Fields for later nodes (prefs, recipes, cart, …) are added in the milestone that needs them.
export const ScanState = Annotation.Root({
  scanId: Annotation<string>,
  userId: Annotation<string>,
  imageUrl: Annotation<string>,
  detected: replace<DetectedItem[]>(() => []),
  /** Normalized detections shown on the review screen. */
  items: replace<ReviewItem[]>(() => []),
  attempts: replace<number>(() => 0),
});

export type ScanStateT = typeof ScanState.State;
export type ScanUpdate = typeof ScanState.Update;
