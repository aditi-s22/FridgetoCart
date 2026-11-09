# PRD — FridgeToCart

> Snap your fridge → get meals you can cook now → one-tap cart for whatever's missing.

This doc is the source of truth for Claude Code. Build milestone by milestone, in order. Don't skip acceptance criteria.

---

## 1. Problem
People open the fridge, see random leftovers, can't decide what to cook, and either waste food or order in. Existing recipe apps need you to type ingredients one by one. Nobody connects "what I have" → "what I can cook" → "what I need to buy" in one flow.

## 2. Goals
| # | Goal | Metric |
|---|---|---|
| G1 | Detect fridge items from one photo | Item-level precision ≥ 0.80, recall ≥ 0.70 on eval set |
| G2 | Suggest 3–5 cookable recipes grounded in real recipes | ≥ 90% of suggested recipes exist in / adapt from retrieved docs |
| G3 | Build a cart for missing items | 100% of missing items mapped to a product or deep link |
| G4 | Fast | p95 photo → recipes < 12s |
| G5 | Cheap | Avg LLM cost per scan < ₹2 |

## 3. Non-goals (MVP)
- No real Blinkit/Zepto/Instamart cart integration (no public API — use mock store + search deep links).
- No payments, no delivery tracking.
- No native mobile app (responsive web only).
- No nutrition/calorie tracking.

## 4. Users & user stories
Primary user: hostel students / working professionals in Indian cities who cook at home.

| ID | As a user I want to… | So that… |
|---|---|---|
| US1 | upload or click a photo of my fridge | I don't type ingredients |
| US2 | see detected items and fix wrong ones | recipes are based on what I actually have |
| US3 | set diet prefs (veg / non-veg / Jain / eggetarian), ingredients to avoid, max cook time | suggestions fit me |
| US4 | see 3–5 recipe cards with what I have vs what's missing | I pick the easiest option |
| US5 | get a cart of missing items with prices | I can order in one go |
| US6 | open a Blinkit/Zepto search link for any item | I can actually buy it today |
| US7 | come back to a past scan | I don't redo it |

## 5. Core flow
```
Upload photo → Detect items (vision LLM) → Normalize names
→ [PAUSE] User reviews/edits items
→ Retrieve similar recipes (pgvector) → Generate 3–5 recipes
→ [PAUSE] User picks a recipe
→ Diff missing ingredients → Cart agent calls store tools → Cart + deep links
```

## 6. Tech stack
| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces |
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind, shadcn/ui |
| API | Node.js + Express + TypeScript |
| Orchestration | LangGraph.js + `@langchain/langgraph-checkpoint-postgres` |
| LLM/RAG | LangChain.js (`@langchain/openai` or `@langchain/google-genai`, `@langchain/anthropic`), `PGVectorStore` |
| Validation | Zod (shared package) |
| DB | PostgreSQL (Neon) + pgvector, Prisma ORM |
| Cache / rate limit | Redis (Upstash) |
| Image storage | S3 or Cloudinary (presigned upload) |
| Auth | NextAuth (Google) — can be stubbed in M1 |
| Tracing | LangSmith or Langfuse |
| Deploy | Vercel (web), Render/Railway (api + store) |

Model routing:
- `VISION_MODEL_FAST` — cheap multimodal (Gemini Flash / GPT-4o-mini class)
- `VISION_MODEL_STRONG` — fallback for low-confidence scans
- `TEXT_MODEL` — recipe generation + cart agent
- `EMBED_MODEL` — embeddings for ingredients + recipes

## 7. Repo structure
```
fridgetocart/
├─ apps/
│  ├─ web/            # Next.js UI
│  ├─ api/            # Express + LangGraph
│  │  └─ src/
│  │     ├─ graph/
│  │     │  ├─ state.ts
│  │     │  ├─ build.ts
│  │     │  ├─ nodes/  # detectItems, detectStrong, normalize, humanReview,
│  │     │  │          # retrieveRecipes, generateRecipes, pickRecipe,
│  │     │  │          # diffMissing, cartAgent
│  │     │  └─ tools/  # searchProduct, checkStock, addToCart
│  │     ├─ routes/    # scans.ts, uploads.ts, prefs.ts
│  │     ├─ services/  # normalizer.ts, storeClient.ts, llm.ts, cache.ts
│  │     └─ index.ts
│  └─ store/          # Mock grocery service (Express)
├─ packages/
│  └─ shared/         # Zod schemas + TS types used by all apps
├─ prisma/
│  ├─ schema.prisma
│  └─ seed/           # ingredients.csv, recipes.csv, products.csv
├─ eval/
│  ├─ images/         # labeled fridge photos
│  ├─ labels.json
│  └─ run.ts          # precision/recall report
├─ docker-compose.yml # postgres+pgvector, redis (local dev)
└─ PRD.md
```

## 8. Shared schemas (`packages/shared`)
```ts
DetectedItem   = { rawName: string; qty: string | null; confidence: number /*0-1*/ }
Ingredient     = { canonicalId: string; name: string; qty: number | null; unit: string | null }
UserPrefs      = { diet: "veg"|"nonveg"|"jain"|"egg"; avoid: string[]; maxTimeMins: number }
Recipe         = { id: string; title: string; sourceDocId: string | null;
                   ingredients: Ingredient[]; steps: string[]; timeMins: number;
                   dietTags: string[]; have: string[]; missing: string[] }
CartItem       = { productId: string; name: string; qty: number; price: number; deepLinks: { blinkit: string; zepto: string } }
Cart           = { id: string; items: CartItem[]; total: number }
ScanStatus     = "detecting"|"awaiting_review"|"generating"|"awaiting_pick"|"building_cart"|"done"|"failed"
```

## 9. Data model (Prisma, summary)
| Model | Fields |
|---|---|
| `User` | id, email, diet, avoid String[], maxTimeMins |
| `Scan` | id, userId, imageUrl, status ScanStatus, selectedRecipeId?, createdAt |
| `IngredientCanon` | canonicalId (PK), name, synonyms String[], embedding vector(1536) |
| `RecipeDoc` | id, title, ingredients Json, steps Json, timeMins, dietTags String[], embedding vector(1536) |
| `Product` | id, canonicalId → IngredientCanon, name, unit, price, stock |
| `Cart` | id, scanId (unique), total |
| `CartItem` | id, cartId, productId, qty, price — unique(cartId, productId) |

LangGraph checkpoint tables are auto-created by `PostgresSaver.setup()`.

Seed data:
- ~300 common Indian kitchen ingredients with Hindi/Hinglish synonyms (tamatar, pyaaz, aloo, dhaniya, paneer…)
- ~500 recipes from an open Indian recipes dataset (CSV) → embed on seed
- ~300 products mapped 1:1 to canonical ingredients with realistic INR prices

## 10. LangGraph spec
**State:** `scanId, userId, imageUrl, prefs, detected[], confirmed[], retrieved[], recipes[], selectedRecipeId, missing[], cart, messages[], attempts`

| Node | Does | Notes |
|---|---|---|
| `detectItems` | Vision LLM → `DetectedItem[]` (structured output) | Fast model; `attempts++` |
| `detectStrong` | Same with strong model | Only if avg confidence < 0.6 |
| `normalize` | rawName → canonical: exact synonym match → embedding nearest (cos ≥ 0.85) → else keep as `unknown:<name>` | No LLM |
| `humanReview` | `interrupt({type:"review_items", items})` → resume with edited `Ingredient[]` | status `awaiting_review` |
| `retrieveRecipes` | Embed confirmed ingredient list → pgvector top-10, filter by diet + avoid + maxTime | LangChain retriever |
| `generateRecipes` | LLM picks/adapts 3–5 from retrieved docs, returns `Recipe[]` with `have`/`missing` | Must cite `sourceDocId`; retry once on invalid output |
| `pickRecipe` | `interrupt({type:"pick_recipe", recipes})` → resume with recipeId | status `awaiting_pick` |
| `diffMissing` | Set diff by canonicalId (ignore pantry staples: salt, water, oil, haldi) | No LLM |
| `cartAgent` | LLM bound to store tools; builds the cart | Max 10 tool iterations |
| `tools` | `ToolNode([searchProduct, checkStock, addToCart])` | |

**Edges**
```
START → detectItems
detectItems → (lowConf && attempts<2) ? detectStrong : normalize
detectStrong → normalize → humanReview → retrieveRecipes → generateRecipes
generateRecipes → (invalid && attempts<2) ? generateRecipes : pickRecipe
pickRecipe → diffMissing → (missing.length ? cartAgent : END)
cartAgent → (toolCalls ? tools : END);  tools → cartAgent
```
`thread_id = scanId`. Checkpointer = PostgresSaver.

## 11. API (apps/api)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/uploads/presign` | `{contentType}` | `{uploadUrl, imageUrl}` |
| POST | `/scans` | `{imageUrl}` | `{scanId, status, items}` (runs until 1st interrupt) |
| POST | `/scans/:id/review` | `{items: Ingredient[]}` | `{status, recipes}` (runs until 2nd interrupt) |
| POST | `/scans/:id/pick` | `{recipeId}` | `{status, cart}` |
| GET | `/scans/:id` | — | full scan state (from checkpoint) |
| GET | `/scans` | — | user's past scans |
| GET/PUT | `/prefs` | `UserPrefs` | `UserPrefs` |

Errors: `{error: {code, message}}`. Rate limit: 10 scans/user/hour (Redis).

## 12. Mock store (apps/store)
| Method | Path | Notes |
|---|---|---|
| GET | `/products?q=` | fuzzy search by name/synonym |
| GET | `/products/:id/stock` | |
| POST | `/carts` | `{scanId}` → cart |
| POST | `/carts/:id/items` | `{productId, qty}`; header `Idempotency-Key`; upsert on (cartId, productId) |
| GET | `/carts/:id` | |

Deep links (generated, not scraped):
- Blinkit: `https://blinkit.com/s/?q=<item>`
- Zepto: `https://www.zeptonow.com/search?query=<item>`

## 13. Frontend screens (apps/web)
1. **Home / Upload** — camera or file picker, client-side compress to ≤ 1280px, presigned upload, "Scan" button.
2. **Review items** — editable chips (rename, qty, delete, add), low-confidence items highlighted.
3. **Recipes** — 3–5 cards: title, time, diet tag, "You have 6/8", missing items in red, expandable steps.
4. **Cart** — items, qty steppers, prices, total, per-item Blinkit/Zepto buttons.
5. **History** — past scans list → reopen at the saved step.
6. **Prefs** — diet, ingredients to avoid, max time.

Show a step progress bar driven by `ScanStatus`. Mobile-first.

## 14. Prompts (rules)
- **Detect:** "List every distinct food item visible. Use common Indian names where natural. Give qty as seen ('3', 'half bowl'). Give a confidence of 0–1. Don't guess hidden items. Return JSON only."
- **Recipes:** "Use ONLY the provided recipe docs as a base; you may adapt them. Respect diet/avoid/maxTime strictly. Prefer recipes that maximize `have`. Return 3–5."
- **Cart agent:** "For each missing ingredient: searchProduct → checkStock → addToCart with a sensible qty. Skip pantry staples. Stop when all items are handled."

## 15. Non-functional requirements
- All LLM outputs validated with Zod; one retry, then a graceful error.
- Cache: `hash(sorted canonicalIds + prefs)` → recipes in Redis, TTL 24h.
- Log tokens, cost, latency per node (LangSmith/Langfuse).
- Secrets only via env; `.env.example` committed.
- No user images kept past 7 days (lifecycle rule).

## 16. Env vars
```
DATABASE_URL, REDIS_URL,
OPENAI_API_KEY | GOOGLE_API_KEY, ANTHROPIC_API_KEY,
VISION_MODEL_FAST, VISION_MODEL_STRONG, TEXT_MODEL, EMBED_MODEL,
S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
STORE_BASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
LANGSMITH_API_KEY (optional)
```
