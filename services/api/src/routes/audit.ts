import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth.js";
import { q } from "../db.js";
import { ok } from "../envelope.js";

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  table_name: string;
  row_id: string;
  diff: string;
  ip: string;
  created_at: string;
}

function parseLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 100;
  return Math.min(1000, Math.max(1, n));
}

function parseOffset(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, n);
}

function parseDiff(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function registerAuditRoutes(app: FastifyInstance): void {
  app.get("/api/audit", { preHandler: [requireAuth] }, async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.table !== undefined && query.table !== "") {
      where.push("table_name = ?");
      params.push(query.table);
    }
    const limit = parseLimit(query.limit);
    const offset = parseOffset(query.offset);
    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const countRows = await q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM audit_log${whereSql}`, params);
    const total = Number((countRows[0] as { cnt: number } | undefined)?.cnt ?? 0);
    const rows = await q<AuditRow>(
      `SELECT id, actor, action, table_name, row_id, diff, ip, created_at FROM audit_log${whereSql}` +
        " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
      [...params, limit, offset],
    );
    return ok({
      rows: rows.map((r) => ({ ...r, diff: parseDiff(r.diff) })),
      total,
      limit,
      offset,
    });
  });
}
