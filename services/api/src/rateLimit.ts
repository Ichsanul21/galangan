import type { FastifyRequest } from "fastify";

export interface RateLimitCheck {
  allowed: boolean;
  retryAfterSec: number;
}

/** Sliding-window counter per key (IP) — in-memory, cukup untuk satu instans. */
export function createRateLimiter(limit: number, windowMs: number): (key: string) => RateLimitCheck {
  const hits = new Map<string, { count: number; resetAt: number }>();
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

export function getClientIp(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.ip ?? "unknown";
}
