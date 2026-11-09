import { PickRequest, ReviewRequest } from "@ftc/shared";
import type { PickResponse, ReviewResponse } from "@ftc/shared";
import { Command } from "@langchain/langgraph";
import { Router } from "express";
import { userIdOf } from "../auth";
import { prisma } from "../db";
import { getGraph, threadOf } from "../graph/build";
import { progressOf } from "../graph/progress";
import { AppError, parse } from "../http";
import { prefsOf } from "./prefs";
import { ownScan } from "./scans";

/** Resuming the two human-in-the-loop pauses. */
export const scanSteps = Router();

scanSteps.post("/:id/review", async (req, res) => {
  const scan = await ownScan(req.params.id, userIdOf(res.locals));
  const { items } = parse(ReviewRequest, req.body);
  const graph = await getGraph();
  const before = await progressOf(graph, scan.id);
  const started = Date.now();

  if (before.pending?.type === "review_items") {
    await prisma.scan.update({ where: { id: scan.id }, data: { status: "generating" } });
    // Prefs may have changed since the scan started; recipes should use the current ones.
    const prefs = await prefsOf(scan.userId);
    await graph.invoke(new Command({ resume: items, update: { prefs } }), threadOf(scan.id));
  } else if (!before.pending && before.next.length > 0 && scan.status === "generating") {
    // The API died after the review was accepted; finish the run from the last checkpoint.
    await graph.invoke(null, threadOf(scan.id));
  } else {
    throw new AppError(409, "not_awaiting_review", "This scan is not waiting for an item review");
  }

  const after = await progressOf(graph, scan.id);
  if (after.pending?.type !== "pick_recipe") throw new AppError(500, "unexpected_state", "Recipes were not generated");
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "awaiting_pick" } });
  console.log(JSON.stringify({ evt: "scan", scanId: scan.id, stage: "recipes", latencyMs: Date.now() - started }));
  const body: ReviewResponse = { status: "awaiting_pick", recipes: after.pending.recipes };
  res.json(body);
});

scanSteps.post("/:id/pick", async (req, res) => {
  const scan = await ownScan(req.params.id, userIdOf(res.locals));
  const { recipeId } = parse(PickRequest, req.body);
  const graph = await getGraph();
  const before = await progressOf(graph, scan.id);
  if (before.pending?.type !== "pick_recipe") throw new AppError(409, "not_awaiting_pick", "This scan is not waiting for a recipe pick");
  if (!before.pending.recipes.some((r) => r.id === recipeId)) throw new AppError(400, "bad_recipe", "Unknown recipe for this scan");

  await graph.invoke(new Command({ resume: recipeId }), threadOf(scan.id));
  // M2 ends here; the cart (status building_cart) arrives in M3.
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "done", selectedRecipeId: recipeId } });
  const body: PickResponse = { status: "done", cart: null };
  res.json(body);
});
