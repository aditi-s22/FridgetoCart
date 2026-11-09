# FridgeToCart

Snap your fridge → get meals you can cook now → one-tap cart for whatever's missing.
See [PRD.md](PRD.md) for the full spec. **Status: M2 (recipes + human-in-the-loop).**

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js UI (upload, review, recipes screens) on :3000 |
| `apps/api` | Express + LangGraph on :4000 |
| `apps/store` | Mock grocery service on :4100 (placeholder until M3) |
| `packages/shared` | Zod schemas + types shared by every app |
| `prisma/` | Schema and seed data (241 ingredients, 500 recipes) |
| `scripts/` | `prepare-recipes` (dataset → `recipes.csv`), `compare-vision` |

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
detectItems → normalize → humanReview ⏸ → retrieveRecipes → generateRecipes (↺ once) → pickRecipe ⏸
```

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

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/uploads/presign` | `{contentType}` → `{uploadUrl, imageUrl}` |
| POST | `/scans` | `{imageUrl}` → `{scanId, status, items}`; runs to the review pause |
| POST | `/scans/:id/review` | `{items: Ingredient[]}` → `{status, recipes}`; runs to the pick pause |
| POST | `/scans/:id/pick` | `{recipeId}` → `{status, cart}` (`cart` is null until M3) |
| GET | `/scans/:id` | items, confirmed items, recipes and status from the checkpoint |
| GET | `/scans` | the user's past scans |
| GET/PUT | `/prefs` | `{diet, avoid, maxTimeMins}` |

Errors are `{error: {code, message}}`. Auth is stubbed with a fixed `demo-user`.
