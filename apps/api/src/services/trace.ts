import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "../db";

/**
 * Per-scan trace. Routes run the graph inside `withScan`, and llm.ts records every model call
 * against the current scan, without threading scanId through each node.
 */
const scope = new AsyncLocalStorage<{ scanId: string }>();

export function withScan<T>(scanId: string, fn: () => Promise<T>): Promise<T> {
  return scope.run({ scanId }, fn);
}

export type CallRecord = {
  node: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costInr: number;
  latencyMs: number;
  ok: boolean;
};

/** Fire-and-forget: tracing must never slow down or fail a scan. */
export function recordCall(call: CallRecord): void {
  const scanId = scope.getStore()?.scanId;
  if (!scanId) return;
  prisma.llmCall.create({ data: { scanId, ...call, latencyMs: Math.round(call.latencyMs) } }).catch((err: unknown) => {
    console.warn("[trace] could not record call:", (err as Error).message);
  });
}
