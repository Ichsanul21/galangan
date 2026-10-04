import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth.js";
import { getDialect, q } from "../db.js";
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
    /* `action` dipakai untuk mengisolasi satu jenis kejadian - "kapan baris ini
       DIHAPUS" butuh action=delete, bukan campur dengan create/update yang
      happened pada hari yang sama. */
    if (query.action !== undefined && query.action !== "") {
      where.push("action = ?");
      params.push(query.action);
    }
    /* `rowId` tepat. `q` di bawah tetap substring karena untuk kotak pencarian
       umum itu memang yang diinginkan; untuk mengisi kolom "dihapus" pada satu
       baris, substring berisiko salah: "INV-001" ikut cocok "INV-0012". */
    if (query.rowId !== undefined && query.rowId !== "") {
      where.push("row_id = ?");
      params.push(query.rowId);
    }
    /* Cari substring di aktor/aksi/row_id (pola sama seperti crud q). */
    if (query.q !== undefined && query.q !== "") {
      where.push(
        getDialect() === "mysql"
          ? "(LOCATE(?, actor) > 0 OR LOCATE(?, action) > 0 OR LOCATE(?, row_id) > 0)"
          : "(instr(actor, ?) > 0 OR instr(action, ?) > 0 OR instr(row_id, ?) > 0)",
      );
      params.push(query.q, query.q, query.q);
    }
    /* created_at ISO (YYYY-MM-DDTHH:…) - cocokkan 10 karakter pertama. */
    if (query.date !== undefined && query.date !== "") {
      where.push(getDialect() === "mysql" ? "LEFT(created_at, 10) = ?" : "substr(created_at, 1, 10) = ?");
      params.push(query.date);
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
