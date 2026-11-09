import { Redis } from "@upstash/redis";
import { env } from "../env";

// Upstash over REST. Used for the recipe cache and rate limiting (M4).
let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to use Redis");
  }
  client = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return client;
}
