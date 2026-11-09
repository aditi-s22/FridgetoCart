/** Rewrites every vector(N) column in schema.prisma to EMBED_DIM. Runs before db:push and db:generate. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const raw = process.env.EMBED_DIM || "1536"; // same default as apps/api/src/env.ts
const dim = Number(raw);
if (!Number.isInteger(dim) || dim < 1 || dim > 2000) {
  console.error(`EMBED_DIM must be an integer from 1 to 2000, got "${raw}"`);
  process.exit(1);
}

const file = join(root, "prisma", "schema.prisma");
const before = readFileSync(file, "utf8");
const after = before.replace(/vector\(\d+\)/g, `vector(${dim})`);
if (after !== before) {
  writeFileSync(file, after);
  console.log(`schema.prisma: vector columns set to vector(${dim})`);
}
