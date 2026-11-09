import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { Cart, DetectedItem, Ingredient, Recipe, ReviewItem, UserPrefs } from "@ftc/shared";
import type { RetrievedDoc } from "../services/recipes";

const replace = <T>(fallback: () => T) => Annotation<T>({ reducer: (_prev, next) => next, default: fallback });

export const ScanState = Annotation.Root({
  scanId: Annotation<string>,
  userId: Annotation<string>,
  imageUrl: Annotation<string>,
  prefs: Annotation<UserPrefs>,
  detected: replace<DetectedItem[]>(() => []),
  /** Normalized detections shown on the review screen. */
  items: replace<ReviewItem[]>(() => []),
  /** What the user confirmed after editing. */
  confirmed: replace<Ingredient[]>(() => []),
  retrieved: replace<RetrievedDoc[]>(() => []),
  recipes: replace<Recipe[]>(() => []),
  /** Why the last generateRecipes answer was rejected; drives the single retry. */
  recipeIssue: replace<string | null>(() => null),
  selectedRecipeId: replace<string | null>(() => null),
  /** Non-staple ingredients of the chosen recipe the user doesn't have. */
  missing: replace<Ingredient[]>(() => []),
  cartId: replace<string | null>(() => null),
  cart: replace<Cart | null>(() => null),
  /** Cart agent conversation (system/human/AI/tool messages). */
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  agentSteps: replace<number>(() => 0),
  attempts: replace<number>(() => 0),
  genAttempts: replace<number>(() => 0),
});

export type ScanStateT = typeof ScanState.State;
export type ScanUpdate = typeof ScanState.Update;

/** Payloads of the two human-in-the-loop pauses. */
export type ReviewInterrupt = { type: "review_items"; items: ReviewItem[] };
export type PickInterrupt = { type: "pick_recipe"; recipes: Recipe[] };
export type ScanInterrupt = ReviewInterrupt | PickInterrupt;
