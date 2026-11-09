# Deployment guide

**Status: nothing is deployed.** This guide was written from the code and config, not from a
completed deployment, so treat each step as untested until you run it. Where the code limits your
options, it says so.

Target layout (no new infrastructure beyond what the app already uses):

| Piece | Where | Notes |
|---|---|---|
| Web (`apps/web`) | Vercel | Next.js 16 |
| API (`apps/api`) | Render or Railway | Long-running Node process (`tsx src/index.ts`) |
| Mock store (`apps/store`) | Render or Railway | Separate service |
| Database | Neon PostgreSQL + pgvector | Already used |
| Cache / rate limit | Upstash Redis | Optional; the app skips both without it |
| Uploaded photos | S3 (or local disk) | See [Image storage](#3-image-storage) |

## Cost reality check

- Vercel Hobby, Neon Free and Upstash Free have free tiers. Render's free web service and Railway's
  trial/credit model change over time; check their current pricing pages before you sign up, and do
  not enter a card unless you intend to pay.
- Gemini is billed per call once you leave the free quota. Every scan calls the API, and
  seeding embeds all recipes. Set a quota or billing alert in Google AI Studio.
- Render's free web services sleep when idle (slow first request) and have an **ephemeral disk**.
- A public deployment lets other people spend your Gemini quota. Keep Google sign-in on, leave
  `AUTH_DEV_LOGIN` off, and keep the built-in limit of 10 scans per user per hour (needs Redis).

## 0. Generate secrets

```bash
openssl rand -base64 48   # NEXTAUTH_SECRET
openssl rand -base64 48   # API_JWT_SECRET (>= 32 chars; the API refuses to start otherwise)
```

Use different values from local development. Never commit them; `.env` is git-ignored and only
`.env.example` files are tracked.

## 1. Neon (database)

1. Create a project and enable pgvector (`CREATE EXTENSION vector;` is handled by `prisma db push`, which declares the extension).
2. Copy the **pooled** connection string as `DATABASE_URL` and the **direct** one as `DATABASE_URL_UNPOOLED`.
3. From your machine, with those two values in `.env` (and `GOOGLE_API_KEY` for embeddings):

   ```bash
   pnpm install
   pnpm db:generate && pnpm db:push    # schema
   pnpm db:seed                        # 241 ingredients, 500 recipes, 237 products; embeds with Gemini
   ```

   `db:seed` calls the embedding API and is the only deployment step that needs Gemini. If you
   already seeded the database you will use, skip it. Do not run `db push --accept-data-loss`.
4. The API creates its LangGraph checkpoint tables in the `langgraph` schema on first start.

There is no separate migrations folder; the project uses `prisma db push`.

## 2. Upstash (optional)

Create a Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` on the API. Without them the recipe cache and rate limit are silently skipped.

## 3. Image storage

The API stores uploads in one of two ways (`apps/api/src/services/storage.ts`):

- **S3** when `S3_BUCKET` is set (presigned `PUT`). Also set `S3_REGION`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`. Add a CORS rule on the bucket allowing `PUT` from your web origin and,
  optionally, a lifecycle rule expiring the `scans/` prefix after 7 days. S3 is not free forever.
- **Local disk** when `S3_BUCKET` is empty (`apps/api/.uploads`). On Render/Railway the disk is
  wiped on redeploy and not shared between instances, so scans' photos would disappear. Fine for
  a short demo; not for real use.

Cloudinary is mentioned in the PRD but is **not implemented**. Using another store means code changes.
Creating AWS resources is your decision; this repo does not do it for you.

## 4. API service (Render or Railway)

- Root directory: repository root (pnpm workspace).
- Build: `pnpm install --frozen-lockfile && pnpm exec prisma generate`
- Start: `pnpm --filter @ftc/api start`
- Health check path: `/health`
- Node 20+ (CI uses 22).

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL |
| `API_JWT_SECRET` | the secret from step 0 (same value as the web app) |
| `GOOGLE_API_KEY` | your Gemini key |
| `WEB_ORIGIN` | the exact web origin, e.g. `https://your-app.vercel.app` (no trailing slash, no path). CORS allows **only** this one origin. |
| `API_BASE_URL` | the API's own public URL |
| `STORE_BASE_URL` | the store service's URL |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | optional |
| `S3_BUCKET`, `S3_REGION`, `AWS_*` | if using S3 |
| `NODE_ENV` | `production` |
| `PORT` | many hosts inject `PORT`, but the API reads `API_PORT` (default 4000). Set `API_PORT` to the port your host expects, or confirm the platform routes to 4000. |

Optional: `VISION_MODEL_*`, `TEXT_MODEL`, `EMBED_MODEL`, `EMBED_DIM` (must match the seeded
database), `USD_INR`, `LANGSMITH_*`.

On startup the API checks the database vector dimensions against `EMBED_DIM` and refuses to start
on a mismatch; that error appears in the service logs.

## 5. Store service

- Build: same as the API.
- Start: `pnpm --filter @ftc/store start`
- Health check: `/health`
- Variables: `DATABASE_URL` and `STORE_PORT` (default 4100; same `PORT` caveat as above).

The store has **no authentication** and is meant to be reached by the API. On Render use a private
service / internal URL if available; on Railway use its private networking. If it must be public,
note that anyone can create carts in your demo catalogue.

## 6. Web on Vercel

- Import the repository, **Root Directory** `apps/web`, framework Next.js. Make sure the install runs at the workspace level (Vercel detects pnpm workspaces and installs from the repo root); `@ftc/shared` is transpiled via `transpilePackages`.
- Environment variables:

  | Variable | Value |
  |---|---|
  | `NEXT_PUBLIC_API_URL` | the API's public URL (used by the browser) |
  | `NEXTAUTH_SECRET` | secret from step 0 |
  | `API_JWT_SECRET` | same value as the API |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client |
  | `AUTH_TRUST_HOST` | `true` if sign-in complains about the host |

  Do **not** set `AUTH_DEV_LOGIN` (it is ignored in production anyway).
- `next.config.ts` also tries to load a root `.env`; on Vercel that file does not exist, which is fine because the variables come from the project settings.

## 7. Google sign-in callback

In Google Cloud Console → Credentials → your OAuth client (type *Web application*):

- Authorized JavaScript origin: `https://your-app.vercel.app`
- Authorized redirect URI: `https://your-app.vercel.app/api/auth/callback/google`

Keep the localhost entries if you also develop locally. While the OAuth consent screen is in
*Testing*, only listed test users can sign in.

## 8. Production smoke test

Replace the URLs and run:

```bash
curl -s https://YOUR-API/health                  # {"ok":true}
curl -s https://YOUR-STORE/health                # {"ok":true}
curl -si https://YOUR-API/scans | head -1        # expect 401 (routes are authenticated)
curl -si -H "Origin: https://evil.example" https://YOUR-API/health | grep -i access-control   # expect no allow-origin for another origin
```

Then, in a browser: sign in with Google → upload a photo → review → recipes → (optionally) substitutions → pick → cart → open a Blinkit/Zepto link → History → Preferences → sign out. Each scan makes paid Gemini calls, so use a few photos, not many. A manual checklist is in [docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md).

## Security checklist

- [ ] No secrets in Git (`git ls-files | grep -i env` should list only `.env.example` files).
- [ ] Production secrets differ from development ones.
- [ ] `WEB_ORIGIN` is the real web origin, not `*`.
- [ ] `AUTH_DEV_LOGIN` unset.
- [ ] Store service not exposed more widely than needed.
- [ ] Gemini quota or billing alert configured.
- [ ] Error responses are generic (`{"error":{"code":"internal","message":"Something went wrong"}}`); stack traces go only to server logs.
- [ ] Every `/scans` route resolves the scan through `ownScan` or an equivalent `userId` filter, so users only see their own scans.

## Known gaps

- Not deployed, so none of the above has been verified in production.
- No Dockerfile, `render.yaml` or `vercel.json` is provided; settings are entered in each platform's UI.
- No Cloudinary support; S3 or ephemeral local disk only.
- The API reads `API_PORT`, not `PORT`.
