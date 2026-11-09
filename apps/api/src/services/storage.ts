import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignRequest, PresignResponse } from "@ftc/shared";
import { env } from "../env";
import { AppError } from "../http";

/**
 * Images go to S3 when S3_BUCKET is set, else to a local folder (dev only).
 * The 7-day retention rule is an S3 lifecycle rule on the "scans/" prefix (see README).
 */
const EXT: Record<PresignRequest["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const LOCAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../.uploads");
export const LOCAL_KEY = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const LOCAL_PREFIX = `${env.API_BASE_URL}/uploads/local/`;

const bucket = env.S3_BUCKET;
const s3 = bucket ? new S3Client({ region: env.S3_REGION }) : null;
const s3Prefix = bucket ? `https://${bucket}.s3.${env.S3_REGION}.amazonaws.com/` : "";

export const usesLocalStorage = s3 === null;

export async function presign(contentType: PresignRequest["contentType"]): Promise<PresignResponse> {
  const name = `${randomUUID()}.${EXT[contentType]}`;
  if (s3) {
    const key = `scans/${name}`;
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    return { uploadUrl, imageUrl: s3Prefix + key };
  }
  return { uploadUrl: LOCAL_PREFIX + name, imageUrl: LOCAL_PREFIX + name };
}

/** Only URLs we issued are accepted, so the API never fetches arbitrary hosts. */
export function isOwnImageUrl(url: string): boolean {
  if (s3) return url.startsWith(s3Prefix + "scans/");
  return url.startsWith(LOCAL_PREFIX) && LOCAL_KEY.test(url.slice(LOCAL_PREFIX.length));
}

export async function saveLocal(key: string, body: Buffer): Promise<void> {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(join(LOCAL_DIR, key), body);
}

/** Loads an image we stored, as a data URL the vision model can take directly. */
export async function readImageAsDataUrl(imageUrl: string): Promise<string> {
  if (!isOwnImageUrl(imageUrl)) throw new AppError(400, "bad_image_url", "Image URL was not issued by this API");
  const notFound = new AppError(404, "image_not_found", "Uploaded image not found");
  let bytes: Uint8Array;
  let mime: string;
  if (s3) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: imageUrl.slice(s3Prefix.length) }));
    if (!obj.Body) throw notFound;
    bytes = await obj.Body.transformToByteArray();
    mime = obj.ContentType ?? "image/jpeg";
  } else {
    const key = imageUrl.slice(LOCAL_PREFIX.length);
    bytes = await readFile(join(LOCAL_DIR, key)).catch(() => {
      throw notFound;
    });
    mime = MIME_BY_EXT[key.split(".").pop() ?? ""] ?? "image/jpeg";
  }
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
