import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { exec } from "./db.js";

export interface AuditInput {
  actor: string;
  action: string;
  table: string;
  rowId: string;
  diff: unknown;
  ip: string;
}

export function newAuditId(): string {
  return `AUD-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

let auditErrorCount = 0;

export function getAuditErrorCount(): number {
  return auditErrorCount;
}

/** Best-effort: audit failures must never break the main operation. */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const id = newAuditId();
    const createdAt = new Date().toISOString();
    const diffText = typeof input.diff === "string" ? input.diff : JSON.stringify(input.diff ?? {});
    await exec(
      "INSERT INTO audit_log (id, actor, action, table_name, row_id, diff, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, input.actor, input.action, input.table, input.rowId, diffText, input.ip, createdAt],
    );
  } catch (err) {
    /* audit_log missing (pre-002 DB) or write failed — count it, log, keep going */
    auditErrorCount += 1;
    console.error("[audit] write failed:", err);
  }
}

export function requestActor(req: FastifyRequest): string {
  const u = req.user as { username?: string; id?: string } | undefined;
  return u?.username ?? u?.id ?? "anonymous";
}

export function requestIp(req: FastifyRequest): string {
  // Mirror rateLimit: only trust x-forwarded-for when TRUST_PROXY is set.
  const trust = (process.env.TRUST_PROXY ?? "").toLowerCase().trim();
  if (trust === "true" || trust === "1") {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]?.trim() ?? "unknown";
  }
  return req.ip ?? "unknown";
}

/** Shallow diff of two flat records: { key: { before, after } } for changed keys. */
export function shallowDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) out[k] = { before: b ?? null, after: a ?? null };
  }
  return out;
}
