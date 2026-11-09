import { Diet, PickRequest, ReviewRequest } from "@ftc/shared";
import type { PickResponse, ReviewResponse } from "@ftc/shared";
import { Command } from "@langchain/langgraph";
import { Router } from "express";
import { userIdOf } from "../auth";
import { prisma } from "../db";
import { getGraph, runOf } from "../graph/build";
import { interruptOf, progressOf } from "../graph/progress";
import type { ScanStateT } from "../graph/state";
import { AppError, parse } from "../http";
import { makeSubCtx, vetAccepted } from "../services/substitutions";
import { withScan } from "../services/trace";

/**
 * Resuming the two human-in-the-loop pauses. Each request is a handful of round trips: one query
 * for scan + user, one checkpoint read, the run itself (one checkpoint write, at the next pause),
 * and one status update. A crash mid-run leaves the scan at its pause; repeating the request is safe.
 */
export const scanSteps = Router();

async function ownScanWithUser(id: string, userId: string) {
  const scan = await prisma.scan.findFirst({ where: { id, userId }, include: { user: true } });
  if (!scan) throw new AppError(404, "not_found", "Scan not found");
  return scan;
}

scanSteps.post("/:id/review", async (req, res) => {
  const t0 = performance.now();
  const scan = await ownScanWithUser(req.params.id, userIdOf(res.locals));
  const { items } = parse(ReviewRequest, req.body);
  const graph = await getGraph();
  const t1 = performance.now();
  // The stored status is written right after each pause, so it is a cheap gate; only when it
  // disagrees (e.g. a crash before the write) do we pay for a checkpoint read.
  if (scan.status !== "awaiting_review" && (await progressOf(graph, scan.id)).pending?.type !== "review_items") {
    throw new AppError(409, "not_awaiting_review", "This scan is not waiting for an item review");
  }

  const started = Date.now();
  const t2 = performance.now();
  // Prefs may have changed since the scan started; recipes should use the current ones.
  const prefs = { diet: Diet.parse(scan.user.diet), avoid: scan.user.avoid, maxTimeMins: scan.user.maxTimeMins };
  const out = await withScan(scan.id, () => graph.invoke(new Command({ resume: items, update: { prefs } }), runOf(scan.id)));
  const pending = interruptOf(out);
  if (pending?.type !== "pick_recipe") throw new AppError(500, "unexpected_state", "Recipes were not generated");
  const t3 = performance.now();

  // Not awaited: the screens read status from the checkpoint; only History uses this column.
  prisma.scan.update({ where: { id: scan.id }, data: { status: "awaiting_pick" } }).catch((err: unknown) => {
    console.warn(`[scan ${scan.id}] status write failed:`, (err as Error).message);
  });
  const ms = (a: number, b: number) => Math.round(b - a);
  const spans = { loadScan: ms(t0, t1), gate: ms(t1, t2), run: ms(t2, t3) };
  console.log(JSON.stringify({ evt: "scan", scanId: scan.id, stage: "recipes", latencyMs: Date.now() - started, spans }));
  const body: ReviewResponse = { status: "awaiting_pick", recipes: pending.recipes };
  res.json(body);
});

scanSteps.post("/:id/pick", async (req, res) => {
  const scan = await ownScanWithUser(req.params.id, userIdOf(res.locals));
  const { recipeId, substitutions } = parse(PickRequest, req.body);
  const graph = await getGraph();
  const before = await progressOf(graph, scan.id);
  if (before.pending?.type !== "pick_recipe") throw new AppError(409, "not_awaiting_pick", "This scan is not waiting for a recipe pick");
  const recipe = before.pending.recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new AppError(400, "bad_recipe", "Unknown recipe for this scan");
  // The client is untrusted: re-check every accepted substitution against the stored recipe, diet and avoid list.
  let accepted = substitutions;
  if (substitutions.length > 0) {
    const prefs = { diet: Diet.parse(scan.user.diet), avoid: scan.user.avoid, maxTimeMins: scan.user.maxTimeMins };
    try {
      accepted = vetAccepted(substitutions, recipe, await makeSubCtx(prefs, before.values.confirmed ?? []));
    } catch (err) {
      throw new AppError(400, "bad_substitution", (err as Error).message);
    }
  }

  const started = Date.now();
  const out = (await withScan(scan.id, () => graph.invoke(new Command({ resume: recipeId, update: { substitutions: accepted } }), runOf(scan.id)))) as Partial<ScanStateT>;
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "done", selectedRecipeId: recipeId } });
  console.log(JSON.stringify({ evt: "scan", scanId: scan.id, stage: "cart", latencyMs: Date.now() - started }));
  const body: PickResponse = { status: "done", cart: out.cart ?? null };
  res.json(body);
});
