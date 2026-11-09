import { Redis } from "@upstash/redis";
import { env } from "../env";

// Upstash over REST. Used for the recipe cache and rate limiting; both are optional.
let client: Redis | null | undefined;

/** The Redis client, or null when Upstash isn't configured. */
export function redis(): Redis | null {
  if (client !== undefined) return client;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;
  client = url && token ? new Redis({ url, token }) : null;
  if (!client) console.warn("[redis] UPSTASH_REDIS_REST_URL/TOKEN not set: no recipe cache, no rate limit");
  return client;
}
