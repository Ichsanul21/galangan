import type { FastifyRequest } from "fastify";

export interface RateLimitCheck {
  allowed: boolean;
  retryAfterSec: number;
}

/** Sliding-window counter per key (IP) — in-memory, cukup untuk satu instans. */
export function createRateLimiter(limit: number, windowMs: number): (key: string) => RateLimitCheck {
  const hits = new Map<string, { count: number; resetAt: number }>();
  // Periodic sweep of expired buckets so the map cannot grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, 60_000);
  sweep.unref?.();
  return (key: string): RateLimitCheck => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count <= limit) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  };
}

export function isTrustedProxy(): boolean {
  const raw = (process.env.TRUST_PROXY ?? "").toLowerCase().trim();
  return raw === "true" || raw === "1";
}

export function getClientIp(req: FastifyRequest): string {
  // Only trust x-forwarded-for behind an explicit TRUST_PROXY=true;
  // otherwise a client can spoof the header and dodge per-IP limits.
  if (isTrustedProxy()) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.ip ?? "unknown";
}
