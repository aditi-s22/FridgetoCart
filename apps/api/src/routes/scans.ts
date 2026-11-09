import { CreateScanRequest } from "@ftc/shared";
import type { CreateScanResponse, ScanView } from "@ftc/shared";
import { Router } from "express";
import { userIdOf } from "../auth";
import { prisma } from "../db";
import { getGraph, threadOf } from "../graph/build";
import type { ScanStateT } from "../graph/state";
import { AppError, parse } from "../http";
import { isOwnImageUrl } from "../services/storage";

export const scans = Router();

scans.post("/", async (req, res) => {
  const userId = userIdOf(res.locals);
  const { imageUrl } = parse(CreateScanRequest, req.body);
  if (!isOwnImageUrl(imageUrl)) throw new AppError(400, "bad_image_url", "Upload the image via /uploads/presign first");

  const scan = await prisma.scan.create({ data: { userId, imageUrl, status: "detecting" } });
  const graph = await getGraph();
  const started = Date.now();
  try {
    const out = await graph.invoke({ scanId: scan.id, userId, imageUrl }, threadOf(scan.id));
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
  const scan = await prisma.scan.findFirst({ where: { id: req.params.id, userId: userIdOf(res.locals) } });
  if (!scan) throw new AppError(404, "not_found", "Scan not found");

  const graph = await getGraph();
  const snapshot = await graph.getState(threadOf(scan.id));
  const values = snapshot.values as Partial<ScanStateT>;
  const body: ScanView = {
    scanId: scan.id,
    status: scan.status,
    imageUrl: scan.imageUrl,
    createdAt: scan.createdAt.toISOString(),
    items: values.items ?? [],
  };
  res.json(body);
});
