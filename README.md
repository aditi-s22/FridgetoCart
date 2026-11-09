# FridgeToCart

Snap your fridge → get meals you can cook now → one-tap cart for whatever's missing.
See [PRD.md](PRD.md) for the full spec. **Status: M4 (hardening: routing, cache, rate limit, tracing, auth, history, prefs).**

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js UI (sign-in, upload, review, recipes, cart, history, prefs) on :3000 |
| `apps/api` | Express + LangGraph on :4000 |
| `apps/store` | Mock grocery store on :4100: product search, stock, idempotent carts |
| `packages/shared` | Zod schemas + types shared by every app |
| `prisma/` | Schema and seed data (241 ingredients, 500 recipes, 237 products) |
| `scripts/` | `prepare-recipes` (dataset → `recipes.csv`), `compare-vision`, `dev-token` |

## Run locally

Prereqs: Node 20+, pnpm 9, and Docker (or a Neon Postgres with pgvector + any Redis).

```bash
pnpm install
cp .env.example .env          # set GOOGLE_API_KEY (all default models are Gemini)
pnpm db:up                    # postgres+pgvector, redis via docker compose
pnpm db:generate && pnpm db:push && pnpm db:seed
pnpm dev                      # web + api + store
```

Open http://localhost:3000, sign in, take or pick a photo, and press **Scan**.

### Sign-in

The web app signs users in with NextAuth (v5), then trades the session for a 15-minute HS256 token
(`/api/token`) that the API verifies with the shared `API_JWT_SECRET`. User ids are stable:
`google:<sub>` or `dev:<email>`.

- **Google**: create an OAuth client (type "Web application") at
  https://console.cloud.google.com/apis/credentials with redirect URI
  `http://localhost:3000/api/auth/callback/google`, then set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- **Dev login**: with `AUTH_DEV_LOGIN=true`, `/signin` also offers email-only sign-in (no password).
  It is always off when `NODE_ENV=production`.
- **curl**: `curl -H "Authorization: Bearer $(pnpm -s dev:token you@example.com)" localhost:4000/scans`

- Models are routed with `"<provider>:<model>"` specs (`google`, `openai`, `anthropic`). Defaults:

  | Role | Model |
  |---|---|
  | `VISION_MODEL_FAST` | `google:gemini-3.5-flash-lite` |
  | `VISION_MODEL_STRONG` | `google:gemini-3.5-flash` |
  | `TEXT_MODEL` | `google:gemini-3.5-flash-lite` (flash took ~40s for recipes; lite ~3s) |
  | `EMBED_MODEL` | `google:gemini-embedding-2` |

- `EMBED_DIM` (default 1536, max 2000) sets the size of every `vector(N)` column. `pnpm db:push`
  and `pnpm db:generate` first rewrite `schema.prisma` to match it. The API checks the DB columns
  and the embedding model against it on startup and refuses to start on a mismatch.
- `USD_INR` converts the per-call USD cost to ₹ in the logs.
- With `S3_BUCKET` empty, uploads go to `apps/api/.uploads` (dev only). With S3, add a
  lifecycle rule expiring the `scans/` prefix after 7 days, plus a CORS rule allowing `PUT` from the web origin.
- Each LLM call logs a JSON line: `{evt:"llm", node, model, inputTokens, outputTokens, latencyMs, costInr}`.
- LangGraph checkpoints live in their own Postgres schema, `langgraph`, so `prisma db push` (which
  manages `public`) never touches them. Never run `db push --accept-data-loss` to "fix" a warning about them.

## How a scan flows

```
detectItems → (avg confidence < 0.6 → detectStrong) → normalize → humanReview ⏸
  → retrieveRecipes → (cache hit → pickRecipe) → generateRecipes (↺ once) → pickRecipe ⏸
  → diffMissing → (nothing missing → END)
                → cartAgent ⇄ tools (searchProduct, checkStock, addToCart; ≤ 10 turns) → finalizeCart → END
```

- **Confidence routing**: if the fast vision model's average confidence is below 0.6 (or it finds
  nothing, as with a blurry photo), `detectStrong` re-runs detection with `VISION_MODEL_STRONG`. If the
  strong model fails, the scan continues with the fast result.
- **Recipe cache**: `hash(sorted canonicalIds + prefs)` → recipes in Redis for 24h, with an
  in-process layer in front (a round trip to Upstash costs ~300 ms from India). A hit skips
  embedding, vector search and the LLM. Only validated LLM output is cached, never the fallback.
- **Rate limit**: 10 scans per user per hour (Upstash sliding window) → `429 rate_limited`. Cache
  and rate limit are skipped, not fatal, when Upstash isn't configured or is unreachable.
- **Pauses** are LangGraph `interrupt()`s saved by the Postgres checkpointer (`thread_id = scanId`),
  so a scan resumes at the same step after an API restart. `GET /scans/:id` derives the status from
  the pending pause.
- **Retrieval** embeds the confirmed (non-staple) ingredients, takes the 30 nearest recipe docs that
  fit the user's diet, max time and avoid list, then re-ranks by how many of each recipe's ingredients
  the user already has (60%) and similarity (40%) and keeps 10.
- **Generation**: the LLM only picks 3–5 of those docs and says which ingredients its version uses
  (it may swap in something the user has). Every pick is checked: it must use a provided doc and
  only that doc's or the user's ingredients, and respect diet and avoid. `have`/`missing` are
  computed in code, never taken from the model. Invalid picks get one retry with the reasons; after
  that, or if the model is down, the top retrieved docs are returned unadapted.
- **Staples** (`tags` contains `staple`: salt, water, oil, sugar, haldi and dry spices) are assumed to
  be in the kitchen: never shown as missing, never added to the cart. A fridge photo can't see the
  spice shelf. The review screen offers one-tap chips for cupboard items like rice and atta.
- **Cart**: `diffMissing` takes the chosen recipe's ingredients minus what the user has, minus
  staples (no LLM). `cartAgent` is the LLM bound to the three store tools; it creates the cart on its
  first turn, and works in parallel (all searches, then all stock checks, then all adds), so a cart
  usually takes 3–4 turns. `finalizeCart` then checks the store's cart against the missing list:
  it removes off-list products, adds anything the agent skipped that is in stock, and puts
  out-of-stock or unknown items in `cart.unavailable` with Blinkit/Zepto search links. So every
  missing item is either in the cart or has a link, even if the model is down.
- **No duplicates**: the store *sets* a line's quantity (upsert on `(cartId, productId)`) and replays
  the stored response for a repeated `Idempotency-Key`. The agent's key is deterministic
  (`agent:<productId>:<qty>`), so a retried tool call, or a run resumed after a crash, never adds twice.
- **Diets** come from ingredient tags (`nonveg`, `egg`, `nojain`). Each recipe stores every diet that
  can eat it, e.g. a dish with onion is `veg|egg|nonveg` but not `jain`.

## Recipe data

`prisma/seed/recipes.csv` holds 500 recipes adapted from the
[6000+ Indian Food Recipes Dataset](https://data.mendeley.com/datasets/xsphgmmh7b/1) by Kanishka Jain
(Mendeley Data, doi:10.17632/xsphgmmh7b.1), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The recipes originally come from
Archana's Kitchen; each row keeps its source URL, and the app links to it.

Changes made: kept quick (≤ 60 min) Indian mains, sides, breakfasts and snacks in English; mapped
every ingredient to a canonical ingredient (recipes with any unmapped ingredient were dropped);
split instructions into steps; fixed machine-translated titles; derived diet tags from ingredients.
To rebuild it (the 24 MB source CSV is not committed):

```bash
pnpm prepare:recipes path/to/IndianFoodDatasetCSV.csv
pnpm db:seed     # upserts and embeds only new or changed rows
```

## Checks

```bash
pnpm typecheck
pnpm test        # Vitest; graph runs against mocked LLMs and an in-memory checkpointer, no DB needed
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

## Tracing

- `GET /scans/:id/trace` is the built-in trace: the path the graph took, which model's detections
  were used, whether recipes came from cache, and every LLM/embedding call with tokens, ₹ cost and
  latency (stored in the `LlmCall` table, also used for eval cost per scan).
- Every node logs `{evt:"node", node, ms}`; `POST /review` logs a per-phase `spans` breakdown.
- With `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY`, full runs show up in LangSmith, named
  `scan` with `metadata.scanId`.

## Performance notes

Neon (Singapore) costs ~100 ms per round trip and Upstash ~130–300 ms from India, so round trips,
not models, dominated latency. What keeps it down:

- Checkpoints are written once per request, when the run pauses or ends (`durability: "exit"`).
  A crash mid-run leaves the scan at its last pause; repeating the request is safe.
- `FastPostgresSaver` writes all of a checkpoint's channel blobs in one multi-row statement (the
  stock saver issues one query per channel inside a transaction: ~12 round trips → 2).
- `normalize` resolves all unknown names in one pgvector query; scan + user load in one JOIN.

Measured (cache hit, same items as an earlier scan): `POST /review` 0.77–0.85 s end to end
(was 3.4 s). Photo → recipes on a miss: ~9–12 s, most of it the two model calls.

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/uploads/presign` | `{contentType}` → `{uploadUrl, imageUrl}` |
| POST | `/scans` | `{imageUrl}` → `{scanId, status, items}`; runs to the review pause |
| POST | `/scans/:id/review` | `{items: Ingredient[]}` → `{status, recipes}`; runs to the pick pause |
| POST | `/scans/:id/pick` | `{recipeId}` → `{status, cart}`; builds the cart (`cart` is null if nothing is missing) |
| PUT | `/scans/:id/cart/items/:productId` | `{qty}` (0–20, 0 removes) → cart; the qty stepper |
| GET | `/scans/:id` | items, confirmed items, recipes, status (from the checkpoint) and the live cart |
| GET | `/scans/:id/trace` | path, models, calls, cost (see Tracing) |
| GET | `/scans` | the user's past scans |
| GET/PUT | `/prefs` | `{diet, avoid, maxTimeMins}` |

All routes except `/health` and the local upload PUT/GET need `Authorization: Bearer <token>`.
Errors are `{error: {code, message}}`. If the API dies mid-run, the scan stays at its last pause;
repeating `POST /review` or `POST /pick` is safe.

## Store API (apps/store)

| Method | Path | Notes |
|---|---|---|
| GET | `/products?q=` | fuzzy search over product names and ingredient names/synonyms (Hindi too) |
| GET | `/products/:id/stock` | `{productId, stock, inStock}` |
| POST | `/carts` | `{scanId}` → cart; one cart per scan |
| POST | `/carts/:id/items` | `{productId, qty}` + `Idempotency-Key` header; sets qty (0 removes), 409 if out of stock |
| GET | `/carts/:id` | items with deep links, total |

Products are a demo catalogue with realistic quick-commerce prices (`prisma/seed/products.csv`);
five niche items start out of stock to exercise the fallback links. There is no checkout.
