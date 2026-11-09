import { Router } from "express";
import { userIdOf } from "../auth";
import { prisma } from "../db";
import { getGraph } from "../graph/build";
import { progressOf, statusOf } from "../graph/progress";
import { ownScan } from "./scans";

/** The built-in trace: which nodes ran, which models were called, and what it cost. */
export const traceRoutes = Router();

traceRoutes.get("/:id/trace", async (req, res) => {
  const scan = await ownScan(req.params.id, userIdOf(res.locals));
  const graph = await getGraph();

  const [p, calls] = await Promise.all([
    progressOf(graph, scan.id),
    prisma.llmCall.findMany({ where: { scanId: scan.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const sum = (f: (c: (typeof calls)[number]) => number) => calls.reduce((s, c) => s + f(c), 0);
  res.json({
    scanId: scan.id,
    status: statusOf(p, scan.status),
    // Nodes that ran, then the pause it is waiting at (if any).
    path: [...(p.values.path ?? []), ...(p.pending ? [p.next[0] ?? ""] : [])].filter(Boolean),
    detectedBy: p.values.detectedBy ?? null,
    recipesCached: p.values.recipesCached ?? false,
    calls: calls.map(({ node, model, inputTokens, outputTokens, costInr, latencyMs, ok, createdAt }) => ({
      node, model, inputTokens, outputTokens, costInr: Number(costInr.toFixed(4)), latencyMs, ok, at: createdAt.toISOString(),
    })),
    totals: {
      calls: calls.length,
      costInr: Number(sum((c) => c.costInr).toFixed(4)),
      inputTokens: sum((c) => c.inputTokens),
      outputTokens: sum((c) => c.outputTokens),
      llmLatencyMs: sum((c) => c.latencyMs),
    },
  });
});
