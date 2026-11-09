import { join } from "node:path";
import { PresignRequest } from "@ftc/shared";
import express, { Router } from "express";
import { requireUser } from "../auth";
import { AppError, parse } from "../http";
import { LOCAL_DIR, LOCAL_KEY, presign, saveLocal, usesLocalStorage } from "../services/storage";

export const uploads = Router();

uploads.post("/presign", requireUser, async (req, res) => {
  const { contentType } = parse(PresignRequest, req.body);
  res.json(await presign(contentType));
});

// Local-disk stand-in for S3, used only when S3_BUCKET is unset.
function localKey(key: string): string {
  if (!usesLocalStorage) throw new AppError(404, "not_found", "Local uploads are disabled");
  if (!LOCAL_KEY.test(key)) throw new AppError(400, "bad_key", "Invalid upload key");
  return key;
}

uploads.put("/local/:key", express.raw({ type: "image/*", limit: "10mb" }), async (req, res) => {
  const key = localKey(req.params.key);
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, "empty_upload", "Send the image bytes with an image/* content type");
  }
  await saveLocal(key, req.body);
  res.status(204).end();
});

uploads.get("/local/:key", (req, res) => {
  res.sendFile(join(LOCAL_DIR, localKey(req.params.key)));
});
