import type { ScanStatus } from "@ftc/shared";
import { type ScanGraph, threadOf } from "./build";
import type { ScanInterrupt, ScanStateT } from "./state";

export type Progress = {
  values: Partial<ScanStateT>;
  /** The human-in-the-loop pause the scan is waiting at, if any. */
  pending: ScanInterrupt | null;
  /** Nodes still to run (non-empty while paused or after a crash mid-run). */
  next: string[];
};

/** Reads a scan's position from its checkpoint, so it survives API restarts. */
export async function progressOf(graph: ScanGraph, scanId: string): Promise<Progress> {
  const snap = await graph.getState(threadOf(scanId));
  const pending = snap.tasks.flatMap((t) => t.interrupts).map((i) => i.value as ScanInterrupt)[0] ?? null;
  return { values: snap.values as Partial<ScanStateT>, pending, next: [...snap.next] };
}

/** A pending pause is the source of truth; otherwise fall back to the status stored on the Scan row. */
export function statusOf(p: Progress, stored: ScanStatus): ScanStatus {
  if (p.pending?.type === "review_items") return "awaiting_review";
  if (p.pending?.type === "pick_recipe") return "awaiting_pick";
  return stored;
}
