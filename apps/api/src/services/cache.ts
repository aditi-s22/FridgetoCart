import { createHash } from "node:crypto";
import { type Ingredient, Recipe, type UserPrefs } from "@ftc/shared";
import { z } from "zod";
import { redis } from "../lib/redis";

const TTL_SECONDS = 24 * 60 * 60;
const VERSION = "v1"; // bump when the Recipe shape or generation logic changes

// In-process layer in front of Redis: a Redis round trip from India to Upstash is ~300 ms, which
// alone would blow the "< 1 s cached recipes" budget. Redis stays the shared cache across instances.
const LOCAL_MAX = 500;
const local = new Map<string, { recipes: Recipe[]; expires: number }>();

function remember(key: string, recipes: Recipe[], ttlMs = TTL_SECONDS * 1000): void {
  local.delete(key);
  local.set(key, { recipes, expires: Date.now() + ttlMs });
  if (local.size > LOCAL_MAX) local.delete(local.keys().next().value as string); // oldest first
}

/** hash(sorted canonicalIds + prefs): the same items and prefs always get the same recipes. */
export function recipeCacheKey(confirmed: Ingredient[], prefs: UserPrefs): string {
  const ids = [...new Set(confirmed.map((i) => i.canonicalId))].sort();
  const avoid = [...new Set(prefs.avoid.map((a) => a.trim().toLowerCase()))].sort();
  const payload = JSON.stringify({ ids, diet: prefs.diet, avoid, maxTimeMins: prefs.maxTimeMins });
  return `ftc:recipes:${VERSION}:${createHash("sha256").update(payload).digest("hex").slice(0, 32)}`;
}

/** Cache failures are logged and treated as a miss; they never fail a scan. */
export async function getCachedRecipes(key: string): Promise<Recipe[] | null> {
  const mem = local.get(key);
  if (mem && mem.expires > Date.now()) return mem.recipes;
  const r = redis();
  if (!r) return null;
  try {
    const [value, ttl] = await Promise.all([r.get(key), r.ttl(key)]);
    const hit = z.array(Recipe).safeParse(value);
    if (!hit.success) return null;
    if (ttl > 0) remember(key, hit.data, ttl * 1000);
    return hit.data;
  } catch (err) {
    console.warn("[cache] get failed:", (err as Error).message);
    return null;
  }
}

export async function setCachedRecipes(key: string, recipes: Recipe[]): Promise<void> {
  if (recipes.length === 0) return;
  remember(key, recipes);
  const r = redis();
  if (!r) return;
  try {
    await r.set(key, recipes, { ex: TTL_SECONDS });
  } catch (err) {
    console.warn("[cache] set failed:", (err as Error).message);
  }
}
