import { CreateScanRequest } from "@ftc/shared";
import type { CreateScanResponse, ScanView } from "@ftc/shared";
import { Router } from "express";
import { userIdOf } from "../auth";
import { prisma } from "../db";
import { getGraph, threadOf } from "../graph/build";
import { progressOf, statusOf } from "../graph/progress";
import { AppError, parse } from "../http";
import { isOwnImageUrl } from "../services/storage";
import { liveCart } from "./cart";
import { prefsOf } from "./prefs";

export const scans = Router();

export async function ownScan(id: string, userId: string) {
  const scan = await prisma.scan.findFirst({ where: { id, userId } });
  if (!scan) throw new AppError(404, "not_found", "Scan not found");
  return scan;
}

scans.post("/", async (req, res) => {
  const userId = userIdOf(res.locals);
  const { imageUrl } = parse(CreateScanRequest, req.body);
  if (!isOwnImageUrl(imageUrl)) throw new AppError(400, "bad_image_url", "Upload the image via /uploads/presign first");

  const prefs = await prefsOf(userId);
  const scan = await prisma.scan.create({ data: { userId, imageUrl, status: "detecting" } });
  const graph = await getGraph();
  const started = Date.now();
  try {
    // Runs until the first pause (humanReview).
    const out = await graph.invoke({ scanId: scan.id, userId, imageUrl, prefs }, threadOf(scan.id));
    await prisma.scan.update({ where: { id: scan.id }, data: { status: "awaiting_review" } });
    console.log(JSON.stringify({ evt: "scan", scanId: scan.id, stage: "detect", latencyMs: Date.now() - started }));
    const body: CreateScanResponse = { scanId: scan.id, status: "awaiting_review", items: out.items };
    res.status(201).json(body);
  } catch (err) {
    await prisma.scan.update({ where: { id: scan.id }, data: { status: "failed" } });
    throw err;
  }
});

scans.get("/", async (_req, res) => {
  const rows = await prisma.scan.findMany({
    where: { userId: userIdOf(res.locals) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, status: true, imageUrl: true, createdAt: true },
  });
  res.json({ scans: rows.map(({ id, ...r }) => ({ scanId: id, ...r, createdAt: r.createdAt.toISOString() })) });
});

scans.get("/:id", async (req, res) => {
  const scan = await ownScan(req.params.id, userIdOf(res.locals));
  const p = await progressOf(await getGraph(), scan.id);
  const body: ScanView = {
    scanId: scan.id,
    status: statusOf(p, scan.status),
    imageUrl: scan.imageUrl,
    createdAt: scan.createdAt.toISOString(),
    items: p.values.items ?? [],
    confirmed: p.values.confirmed ?? [],
    recipes: p.values.recipes ?? [],
    selectedRecipeId: p.values.selectedRecipeId ?? null,
    cart: await liveCart(p),
  };
  res.json(body);
});
