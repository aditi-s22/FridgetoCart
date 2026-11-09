import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCAL_DIR, saveLocal } from "../services/storage";
import { uploads } from "./uploads";

// Regression: LOCAL_DIR lives in a dot-directory (.uploads), and sendFile on an absolute path
// through one answered every image request with an error, so previews never displayed.
const key = `${randomUUID()}.jpg`;
const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
let base = "";
let close: () => void = () => {};

beforeAll(async () => {
  await saveLocal(key, bytes);
  const app = express().use("/uploads", uploads);
  const server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/uploads/local`;
  close = () => server.close();
});

afterAll(async () => {
  close();
  await rm(join(LOCAL_DIR, key), { force: true });
});

describe("GET /uploads/local/:key", () => {
  it("serves a stored image from the .uploads directory", async () => {
    const res = await fetch(`${base}/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
  });

  it("returns 404 for a well-formed key that does not exist", async () => {
    expect((await fetch(`${base}/${randomUUID()}.jpg`)).status).toBe(404);
  });

  it("rejects keys that are not issued uuid names", async () => {
    expect((await fetch(`${base}/..%2F..%2Fpackage.json`)).status).not.toBe(200);
    expect((await fetch(`${base}/not-a-key.jpg`)).status).toBe(400);
  });
});
