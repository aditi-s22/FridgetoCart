import { type BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DetectionResult, LOW_CONFIDENCE } from "@ftc/shared";
import { modelOf, structured } from "../../services/llm";
import { readImageAsDataUrl } from "../../services/storage";
import type { ScanStateT, ScanUpdate } from "../state";

export const DETECT_PROMPT = [
  "You are looking at a photo of the inside of a fridge or a kitchen shelf in an Indian home.",
  "List every distinct food item visible. Use common Indian names where natural (e.g. paneer, dahi, dhaniya).",
  "Give qty as seen ('3', 'half bowl', '1 packet'), or null if you cannot tell.",
  "Give a confidence of 0–1 for each item. Don't guess hidden items. Return JSON only.",
].join("\n");

/** The detection prompt for one image, shared with scripts/compare-vision.ts. */
export function detectionMessages(imageDataUrl: string): BaseMessage[] {
  return [
    new SystemMessage(DETECT_PROMPT),
    new HumanMessage({
      content: [
        { type: "text", text: "Detect the food items in this photo." },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    }),
  ];
}

export function avgConfidence(state: Pick<ScanStateT, "detected">): number {
  const items = state.detected;
  return items.length ? items.reduce((s, i) => s + i.confidence, 0) / items.length : 0;
}

/** Edge after detectItems: a blurry/dark photo (low average confidence, or nothing found) goes to the strong model. */
export function needsStrong(state: ScanStateT): "detectStrong" | "normalize" {
  return avgConfidence(state) < LOW_CONFIDENCE && state.attempts < 2 ? "detectStrong" : "normalize";
}

export async function detectItems(state: ScanStateT): Promise<ScanUpdate> {
  const image = await readImageAsDataUrl(state.imageUrl);
  const result = await structured({
    role: "visionFast",
    node: "detectItems",
    schema: DetectionResult,
    messages: detectionMessages(image),
  });
  return { detected: result.items, attempts: state.attempts + 1, detectedBy: modelOf("visionFast") };
}
