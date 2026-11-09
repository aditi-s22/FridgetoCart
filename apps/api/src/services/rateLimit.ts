import { Ratelimit } from "@upstash/ratelimit";
import { AppError } from "../http";
import { redis } from "../lib/redis";

const SCANS_PER_HOUR = 10;
let limiter: Ratelimit | null | undefined;

function scanLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;
  const r = redis();
  limiter = r ? new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(SCANS_PER_HOUR, "1 h"), prefix: "ftc:rl:scans" }) : null;
  return limiter;
}

/** 10 scans per user per hour. Throws a 429 AppError when exceeded; fails open if Redis is down. */
export async function enforceScanLimit(userId: string): Promise<void> {
  const l = scanLimiter();
  if (!l) return;
  let result: Awaited<ReturnType<Ratelimit["limit"]>>;
  try {
    result = await l.limit(userId);
  } catch (err) {
    console.warn("[rateLimit] check failed, allowing:", (err as Error).message);
    return;
  }
  if (!result.success) {
    const mins = Math.max(1, Math.ceil((result.reset - Date.now()) / 60_000));
    throw new AppError(429, "rate_limited", `You've used your ${SCANS_PER_HOUR} scans for this hour. Try again in ${mins} min.`);
  }
}
