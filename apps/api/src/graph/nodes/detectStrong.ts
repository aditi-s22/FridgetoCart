import { DetectionResult } from "@ftc/shared";
import { AppError } from "../../http";
import { modelOf, structured } from "../../services/llm";
import { readImageAsDataUrl } from "../../services/storage";
import type { ScanStateT, ScanUpdate } from "../state";
import { avgConfidence, detectionMessages } from "./detectItems";

/** Re-runs detection with the strong model when the fast one was unsure. Keeps the fast result if it fails. */
export async function detectStrong(state: ScanStateT): Promise<ScanUpdate> {
  const image = await readImageAsDataUrl(state.imageUrl);
  try {
    const result = await structured({
      role: "visionStrong",
      node: "detectStrong",
      schema: DetectionResult,
      messages: detectionMessages(image),
      timeoutMs: 60_000, // the strong model is slow; this path is the exception, not the rule
    });
    console.log(
      JSON.stringify({
        evt: "detectStrong",
        scanId: state.scanId,
        fastAvgConfidence: Number(avgConfidence(state).toFixed(2)),
        strongAvgConfidence: Number(avgConfidence({ detected: result.items }).toFixed(2)),
      }),
    );
    return { detected: result.items, attempts: state.attempts + 1, detectedBy: modelOf("visionStrong") };
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    console.warn("[detectStrong] strong model failed, keeping the fast model's items:", err.message);
    return { attempts: state.attempts + 1 };
  }
}
