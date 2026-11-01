// Rate limiting for public write endpoints.
// Uses Upstash Redis (distributed, accurate) when UPSTASH_REDIS_REST_URL/TOKEN are set;
// otherwise falls back to a best-effort per-instance in-memory sliding window.

const memory = new Map<string, number[]>();

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    memory.set(key, hits);
    return false;
  }
  hits.push(now);
  memory.set(key, hits);
  // Opportunistic cleanup so the map can't grow without bound
  if (memory.size > 5000) {
    for (const [k, v] of memory) {
      if (v.every((t) => now - t >= windowMs)) memory.delete(k);
    }
  }
  return true;
}

let upstashLimiters: Map<string, { limit: (id: string) => Promise<{ success: boolean }> }> | null = null;

/** Returns true if the request is allowed, false if the caller is over the limit. */
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const key = `${bucket}:${identifier}`;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      if (!upstashLimiters) upstashLimiters = new Map();
      const limiterKey = `${bucket}:${limit}:${windowSeconds}`;
      let limiter = upstashLimiters.get(limiterKey);
      if (!limiter) {
        const [{ Ratelimit }, { Redis }] = await Promise.all([
          import("@upstash/ratelimit"),
          import("@upstash/redis"),
        ]);
        limiter = new Ratelimit({
          redis: Redis.fromEnv(),
          limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
          prefix: `lv:${bucket}`,
        });
        upstashLimiters.set(limiterKey, limiter);
      }
      const { success } = await limiter.limit(identifier);
      return success;
    } catch {
      // Redis unavailable → degrade to in-memory instead of failing open entirely
    }
  }

  return memoryLimit(key, limit, windowSeconds * 1000);
}

/** Best-effort client IP from standard proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
