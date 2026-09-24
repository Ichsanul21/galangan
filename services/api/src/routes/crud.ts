import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { requestActor, requestIp, shallowDiff, writeAudit } from "../audit.js";
import { exec, getDialect, q } from "../db.js";
import { fail, ok } from "../envelope.js";

// ID prefix per collection — copied from apps/web/src/data/store.tsx PREFIX,
// plus DD/DS for drydocks/dockSlots (missing in the FE map).
export const PREFIX: Record<string, string> = {
  projects: "PRJ",
  vessels: "V",
  drydocks: "DD",
  dockSlots: "DS",
  inventory: "INV",
  movements: "M",
  equipment: "EQ",
  bookings: "BK",
  subcontractors: "SUB",
  workOrders: "WO",
  termins: "TRM",
  employees: "EMP",
  invoices: "INV",
  payables: "AP",
  ncr: "NCR",
  incidents: "INC",
  inspections: "INS",
  purchaseOrders: "PO",
  requisitions: "PR",
  vendors: "VND",
  quotations: "QT",
  clients: "C",
  documents: "DOC",
  surveys: "S",
  activities: "A",
  services: "SRV",
  spareparts: "SP",
  boq: "BQ",
  branches: "BR",
  attendance: "ABS",
  payroll: "PAY",
  taxPeriods: "TAX",
  rfqs: "RFQ",
  changeOrders: "CO",
  risks: "RSK",
  leaves: "CUT",
  trainings: "TRN",
  timesheets: "TS",
  drawings: "DRW",
  toolbox: "TBM",
  warranties: "WRT",
  calibrations: "CAL",
  communications: "COM",
  contracts: "KTR",
  bast: "BAST",
  trials: "STL",
  requests: "REQ",
  clientPos: "CPO",
  settings: "SET",
  coa: "COA",
  journals: "JU",
  assets: "AST",
};

// Every envelope table from migrations/001_init.sql except users
// (different schema: id/username/pass_hash/...) and the wbs/team side tables.
export const COLLECTIONS: string[] = [
  "projects", "vessels", "drydocks", "dockSlots", "inventory", "movements",
  "equipment", "bookings", "subcontractors", "workOrders", "termins",
  "employees", "invoices", "payables", "ncr", "incidents", "inspections",
  "purchaseOrders", "requisitions", "vendors", "quotations", "clients",
  "documents", "surveys", "activities", "services", "spareparts", "boq",
  "branches", "attendance", "payroll", "taxPeriods", "rfqs", "changeOrders",
  "risks", "leaves", "trainings", "timesheets", "drawings", "toolbox",
  "warranties", "calibrations", "communications", "contracts", "bast",
  "trials", "requests", "clientPos", "settings", "coa", "journals", "assets",
];

// Writes to these tables are restricted. Role names are matched in both
// casings because seed roles are lowercase ("direktur") while callers may
// pass title case ("Direktur").
const RESTRICTED_TABLES = new Set(["settings", "coa", "users"]);
const PRIVILEGED_ROLES = ["direktur", "developer", "Direktur", "Developer"];

export interface CrudOpts {
  writeRoles?: string[];
}

const CreateSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  branch: z.string().max(64).optional(),
  data: z.record(z.unknown()),
});

const PatchSchema = z.object({
  branch: z.string().max(64).optional(),
  data: z.record(z.unknown()).optional(),
}).refine((v) => v.branch !== undefined || v.data !== undefined, {
  message: "Nothing to update",
});

interface Row {
  id: string;
  branch: string;
  data: string;
  updated_at: string;
}

function toJson(row: Row): { id: string; branch: string; data: unknown; updated_at: string } {
  return { id: row.id, branch: row.branch, data: JSON.parse(row.data) as unknown, updated_at: row.updated_at };
}

function newId(table: string): string {
  const prefix = PREFIX[table] ?? "X";
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function parseLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 200;
  return Math.min(1000, Math.max(1, n));
}

function parseOffset(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, n);
}

export function registerCrud(app: FastifyInstance, table: string, opts: CrudOpts = {}): void {
  if (!COLLECTIONS.includes(table)) throw new Error(`Unknown collection: ${table}`);
  const base = `/api/${table}`;
  const writeRoles = opts.writeRoles ?? (RESTRICTED_TABLES.has(table) ? PRIVILEGED_ROLES : undefined);
  const writeGuards = writeRoles ? [requireAuth, requireRole(...writeRoles)] : [requireAuth];

  app.get(base, { preHandler: [requireAuth] }, async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.branch !== undefined && query.branch !== "") {
      where.push("branch = ?");
      params.push(query.branch);
    }
    if (query.q !== undefined && query.q !== "") {
      where.push(getDialect() === "mysql" ? "LOCATE(?, data) > 0" : "instr(data, ?) > 0");
      params.push(query.q);
    }
    const limit = parseLimit(query.limit);
    const offset = parseOffset(query.offset);
    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const countRows = await q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM ${table}${whereSql}`, params);
    const total = Number((countRows[0] as { cnt: number } | undefined)?.cnt ?? 0);
    const sql = `SELECT id, branch, data, updated_at FROM ${table}${whereSql}` +
      " ORDER BY id ASC LIMIT ? OFFSET ?";
    const rows = await q<Row>(sql, [...params, limit, offset]);
    return ok({ rows: rows.map(toJson), total, limit, offset });
  });

  app.get(`${base}/:id`, { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await q<Row>(`SELECT id, branch, data, updated_at FROM ${table} WHERE id = ?`, [id]);
    if (rows.length === 0) return reply.status(404).send(fail("Not found", "NOT_FOUND"));
    return ok(toJson(rows[0] as Row));
  });

  app.post(base, { preHandler: writeGuards }, async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    let id = parsed.data.id;
    if (id) {
      const dup = await q<Row>(`SELECT id FROM ${table} WHERE id = ?`, [id]);
      if (dup.length > 0) return reply.status(409).send(fail(`Duplicate id: ${id}`, "CONFLICT"));
    } else {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = newId(table);
        const dup = await q<Row>(`SELECT id FROM ${table} WHERE id = ?`, [candidate]);
        if (dup.length === 0) { id = candidate; break; }
      }
      if (!id) return reply.status(500).send(fail("Could not generate unique id", "INTERNAL_ERROR"));
    }
    const branch = parsed.data.branch ?? "";
    const now = new Date().toISOString();
    await exec(`INSERT INTO ${table} (id, branch, data, updated_at) VALUES (?, ?, ?, ?)`, [
      id, branch, JSON.stringify(parsed.data.data), now,
    ]);
    await writeAudit({
      user: requestActor(req),
      action: "create",
      table,
      rowId: id as string,
      diff: { branch, data: parsed.data.data },
      ip: requestIp(req),
    });
    return reply.status(201).send(ok({ id, branch, data: parsed.data.data, updated_at: now }));
  });

  app.patch(`${base}/:id`, { preHandler: writeGuards }, async (req, reply) => {
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    const { id } = req.params as { id: string };
    const rows = await q<Row>(`SELECT id, branch, data, updated_at FROM ${table} WHERE id = ?`, [id]);
    if (rows.length === 0) return reply.status(404).send(fail("Not found", "NOT_FOUND"));
    const current = rows[0] as Row;
    const oldData = JSON.parse(current.data) as Record<string, unknown>;
    const merged = parsed.data.data ? { ...oldData, ...parsed.data.data } : oldData;
    const branch = parsed.data.branch ?? current.branch;
    const now = new Date().toISOString();
    await exec(`UPDATE ${table} SET branch = ?, data = ?, updated_at = ? WHERE id = ?`, [
      branch, JSON.stringify(merged), now, id,
    ]);
    await writeAudit({
      user: requestActor(req),
      action: "update",
      table,
      rowId: id,
      diff: {
        ...(current.branch !== branch ? { branch: { before: current.branch, after: branch } } : {}),
        ...shallowDiff(oldData, merged),
      },
      ip: requestIp(req),
    });
    return ok({ id, branch, data: merged, updated_at: now });
  });

  app.delete(`${base}/:id`, { preHandler: writeGuards }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await q<Row>(`SELECT id, branch, data, updated_at FROM ${table} WHERE id = ?`, [id]);
    if (rows.length === 0) return reply.status(404).send(fail("Not found", "NOT_FOUND"));
    const doomed = rows[0] as Row;
    await exec(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await writeAudit({
      user: requestActor(req),
      action: "delete",
      table,
      rowId: id,
      diff: { branch: doomed.branch, data: JSON.parse(doomed.data) as unknown },
      ip: requestIp(req),
    });
    return ok({ id, deleted: true });
  });
}
