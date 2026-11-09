# FridgeToCart

Snap your fridge → get meals you can cook now → one-tap cart for whatever's missing.
See [PRD.md](PRD.md) for the full spec. **Status: M1 (skeleton + detection).**

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js UI (upload + review screens) on :3000 |
| `apps/api` | Express + LangGraph on :4000 |
| `apps/store` | Mock grocery service on :4100 (placeholder until M3) |
| `packages/shared` | Zod schemas + types shared by every app |
| `prisma/` | Schema and seed data |

## Run locally

Prereqs: Node 20+, pnpm 9, and Docker (or a Neon Postgres with pgvector + any Redis).

```bash
pnpm install
cp .env.example .env          # set GOOGLE_API_KEY (all default models are Gemini)
pnpm db:up                    # postgres+pgvector, redis via docker compose
pnpm db:generate && pnpm db:push && pnpm db:seed
pnpm dev                      # web + api + store
```

Open http://localhost:3000, take or pick a photo, and press **Scan**.

- Models are routed with `"<provider>:<model>"` specs (`google`, `openai`, `anthropic`). Defaults:

  | Role | Model |
  |---|---|
  | `VISION_MODEL_FAST` | `google:gemini-3.5-flash-lite` |
  | `VISION_MODEL_STRONG` | `google:gemini-3.5-flash` |
  | `TEXT_MODEL` | `google:gemini-3.5-flash` |
  | `EMBED_MODEL` | `google:gemini-embedding-2` |

- `EMBED_DIM` (default 1536, max 2000) sets the size of every `vector(N)` column. `pnpm db:push`
  and `pnpm db:generate` first rewrite `schema.prisma` to match it. The API checks the DB columns
  and the embedding model against it on startup and refuses to start on a mismatch.
- `USD_INR` converts the per-call USD cost to ₹ in the logs.
- With `S3_BUCKET` empty, uploads go to `apps/api/.uploads` (dev only). With S3, add a
  lifecycle rule expiring the `scans/` prefix after 7 days, plus a CORS rule allowing `PUT` from the web origin.
- Each LLM call logs a JSON line: `{evt:"llm", node, model, inputTokens, outputTokens, latencyMs, costInr}`.

## Checks

```bash
pnpm typecheck
pnpm test        # Vitest; nodes run against mocked LLMs, no DB needed
```

### Compare vision models

Put fridge photos (`.jpg`, `.png`, `.webp`) in `eval/images/`, then:

```bash
pnpm compare:vision
```

For each photo it runs the fast and strong models with the app's detection prompt and prints both
item lists side by side with latency, tokens and ₹ cost, then averages per model. It calls the real
APIs (a few paise per photo) and needs no database. The app sends JPEGs downscaled to ≤ 1280px, so
resize large originals first if you want costs that match production.

## API (M1)

| Method | Path | Notes |
|---|---|---|
| POST | `/uploads/presign` | `{contentType}` → `{uploadUrl, imageUrl}` |
| POST | `/scans` | `{imageUrl}` → `{scanId, status, items}` |
| GET | `/scans/:id` | scan state from the LangGraph checkpoint |
| GET | `/scans` | the user's past scans |

Errors are `{error: {code, message}}`. Auth is stubbed with a fixed `demo-user`.
