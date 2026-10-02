import type { FastifyRequest } from "fastify";
import { verifyToken } from "./auth.js";

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

/**
 * Kunci pembatas untuk rute tulis: identitas user bila ada, IP sebagai cadangan.
 *
 * ALASAN PERUBAHAN: pembatas tulis lama memakai IP. Di galangan semua tablet
 * dan ponsel satu Wi-Fi berada di balik satu IP publik (NAT), jadi seluruh
 * perangkat berbagi satu bucket 300/menit. Satu antrean offline yang besar -
 * misalnya setelah sinyal shaky di pinggir dermaga - lalu memblokir SEMUA
 * perangkat lain di kapal: gejala yang dilaporkan "perubahan status gagal di
 * perangkat saya tapi berhasil di device lain".
 *
 * Keyed per user, satu orang tidak bisa memblokir rekannya, dan perangkat
 * yang sama dipakai dua orang tetap punya batas sendiri masing-masing. IP tetap
 * dipakai sebagai cadangan agar request tanpa token (mis. POST login) dibatasi.
 *
 * Token dibaca DI SINI, bukan dari `req.user`: hook onRequest berjalan
 * SEBELUM preHandler requireAuth, jadi req.user belum pernah diisi pada titik
 * ini. Verifikasi HMAC itu murah (satu hash) dan tidak mengubah status auth -
 * request tetap ditolak 401 oleh requireAuth kalau tokennya benar-benar salah.
 */
export function getWriteRateKey(req: FastifyRequest): string {
  if (req.user?.id) return `u:${req.user.id}`;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const claims = verifyToken(header.slice("Bearer ".length)) as { id?: string; username?: string };
      if (claims?.id) return `u:${claims.id}`;
      if (claims?.username) return `u:${claims.username}`;
    } catch {
      /* token rusak/kedaluwarsa -> pakai IP; requireAuth yang akan menolak */
    }
  }
  return `ip:${getClientIp(req)}`;
}
