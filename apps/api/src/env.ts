import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optional = z.preprocess(blankToUndefined, z.string().optional());

const Env = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  STORE_BASE_URL: z.string().url().default("http://localhost:4100"),
  /** Shared with apps/web, which signs the API tokens. */
  API_JWT_SECRET: z.string().min(32, "API_JWT_SECRET must be at least 32 characters"),
  VISION_MODEL_FAST: z.string().default("google:gemini-3.5-flash-lite"),
  VISION_MODEL_STRONG: z.string().default("google:gemini-3.5-flash"),
  TEXT_MODEL: z.string().default("google:gemini-3.5-flash-lite"),
  EMBED_MODEL: z.string().default("google:gemini-embedding-2"),
  // Must match the vector(N) columns; `pnpm db:push` syncs schema.prisma to it.
  // Capped at 2000, pgvector's limit for HNSW/IVFFlat indexes.
  EMBED_DIM: z.coerce.number().int().positive().max(2000).default(1536),
  USD_INR: z.coerce.number().positive().default(88),
  UPSTASH_REDIS_REST_URL: optional,
  UPSTASH_REDIS_REST_TOKEN: optional,
  S3_BUCKET: optional,
  S3_REGION: z.string().default("ap-south-1"),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;
