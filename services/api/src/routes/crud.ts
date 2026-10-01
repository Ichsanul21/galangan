import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { requestActor, requestIp, shallowDiff, writeAudit } from "../audit.js";
import { requireCollectionWrite, requireSettingsWrite } from "../rbac.js";
import { exec, getDialect, q } from "../db.js";
import { checkRefs, findUsages } from "../refs.js";
import { fail, ok } from "../envelope.js";

// ID prefix per collection — disalin dari apps/web/src/data/store.tsx PREFIX
// (wajib sama; newId dipakai dua sisi). inventory=STK agar tak tabrakan
// dengan invoices=INV; vendors=VND beda dari vessels=V.
export const PREFIX: Record<string, string> = {
  projects: "PRJ",
  vessels: "V",
  drydocks: "DD",
  dockSlots: "DS",
  inventory: "STK",
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
  walks: "SW",
  auditPlans: "AUD",
  warehouses: "GDG",
  maintenances: "MTE",
  letters: "SRT",
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
  "trials", "requests", "clientPos", "walks", "auditPlans", "warehouses", "maintenances", "letters", "settings", "coa", "journals", "assets",
];

// Tulis settings/coa dibatasi di registerCrud (requireSettingsWrite).
// "users" bukan koleksi envelope — diatur routes/users.ts.
const CreateSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  branch: z.string().max(64).optional(),
  data: z.record(z.unknown()),
});

const PatchSchema = z.object({
  branch: z.string().max(64).optional(),
  data: z.record(z.unknown()).refine((v) => Object.keys(v).length > 0, {
    message: "data kosong tidak mengubah apa pun",
  }).optional(),
  baseUpdatedAt: z.string().optional(),
}).refine((v) => v.branch !== undefined || v.data !== undefined, {
  message: "Nothing to update",
});

// Validasi domain minimal saat CREATE (422, bukan 400, agar FE melempar
// bukan menyimpan lokal): data harus objek + field kunci koleksi kritis.
// PATCH parsial tidak divalidasi isi (sengaja).
const REQUIRED_DATA: Record<string, string[]> = {
  projects: ["vessel", "client"],
  vessels: ["name"],
  invoices: ["client"],
  payables: ["v", "amt"],
  purchaseOrders: ["vendor"],
  requisitions: ["item"],
  employees: ["name"],
  payroll: ["employeeId", "period"],
  inventory: ["name"],
  vendors: ["name"],
  clients: ["name"],
  quotations: ["client", "vessel"],
  /* Koleksi batch terakhir. Wajib isi nama/tanggal supaya baris yang lolos
     validasi tetap punya isi meaningful di UI (label kartu, sorting tanggal). */
  warehouses: ["name"],
  maintenances: ["equipmentId", "tanggal"],
  letters: ["employeeId", "jenis", "tanggal"],
};

function assertDomain(table: string, data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "data harus objek";
  }
  const need = REQUIRED_DATA[table] ?? [];
  const rec = data as Record<string, unknown>;
  const missing = need.filter((k) => {
    const v = rec[k];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
  if (missing.length > 0) return `field wajib kosong: ${missing.join(", ")}`;
  return null;
}

interface Row {
  id: string;
  branch: string;
  data: string;
  updated_at: string;
}

/* Koleksi yang field "name"-nya jadi kunci relasi (inventory.warehouse,
   movements.fromWh/toWh masih menyimpan NAMA, bukan id). Kalau dua gudang
   boleh bernama sama, kartu "Stok per Gudang" menggabung keduanya dan kolom
   "Dari Gudang" di mutasi menunjuk entri yang ambigu.
   taxPeriods masuk daftar serupa dengan field "period": kolom "Bulan" di
   laporan PPN menampilkan satu baris per nilai, dan periode ganda membuat
   total PPN terhitung dua kali. */
const UNIQUE_FIELD: Record<string, { field: string; label: string }> = {
  warehouses: { field: "name", label: "nama" },
  taxPeriods: { field: "period", label: "periode" },
};

/* Field unik ini hidup di dalam kolom `data` (TEXT berisi JSON), bukan sebagai
   kolom nyata. Versi lama menulis "SELECT id FROM warehouses WHERE LOWER(name)
   = ?". Kolom `name` tidak pernah ada di tabel mana pun - 001_init.sql dan
   006_batch_akhir.sql sama-sama hanya punya id/branch/data/updated_at - jadi
   MySQL selalu melempar Unknown column, dan catch lama menelan errornya lalu
   mengembalikan null. Guard gudang itu karena itu tidak pernah menolak apa pun
   di server; hanya pemeriksaan di FE yang bekerja, dan FE bisa dilewati lewat
   API langsung.

   Perbandingan sekarang dilakukan di JS dari `data` yang sudah di-parse, jadi
   benar-benar bekerja pada MySQL maupun sqlite. Hanya untuk koleksi kecil
   (gudang, periode pajak) - bukan untuk movements atau payroll yang berisi
   ribuan baris. */
async function checkUniqueField(
  table: string,
  field: string,
  label: string,
  value: string,
  selfId: string | null,
): Promise<string | null> {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const target = trimmed.toLowerCase();
  try {
    const rows = await q<Row>(`SELECT id, branch, data, updated_at FROM ${table}`);
    for (const r of rows) {
      if (String(r.id) === String(selfId ?? "")) continue;
      const parsed = toJson(r).data;
      if (typeof parsed !== "object" || parsed === null) continue;
      const current = String((parsed as Record<string, unknown>)[field] ?? "")
        .trim()
        .toLowerCase();
      if (current === target) return `${label} "${trimmed}" sudah dipakai`;
    }
  } catch (e) {
    /* Gagal membaca tabel tidak boleh memblokir penulisan. Aturan ini
       safety net, bukan sumber kebenaran. */
    console.error("[crud] unique check gagal:", e);
  }
  return null;
}

function toJson(row: Row): { id: string; branch: string; data: unknown; updated_at: string } {
  let data: unknown = {};
  try {
    data = JSON.parse(row.data) as unknown;
  } catch {
    // Satu baris korup tidak boleh menumbangkan seluruh halaman (RAGU-28).
    data = { _corrupt: true, _raw: String(row.data ?? "").slice(0, 200) };
  }
  return { id: row.id, branch: row.branch, data, updated_at: row.updated_at };
}

function newId(table: string): string {
  const prefix = PREFIX[table] ?? "X";
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function parseLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 200;
  // Cap 5000: sync awal FE menarik tabel besar (movements ±19k) — halaman
  // 1000 berarti 19 round-trip; 5000 memangkas jadi 4x tanpa beban berarti.
  return Math.min(5000, Math.max(1, n));
}

function parseOffset(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, n);
}

export function registerCrud(app: FastifyInstance, table: string): void {
  if (!COLLECTIONS.includes(table)) throw new Error(`Unknown collection: ${table}`);
  const base = `/api/${table}`;
  // Tulis settings/coa: direktur/developer/admin. Koleksi lain ikut
  // kebijakan RBAC (rbac.ts); baca tetap requireAuth untuk semua peran.
  const writeGuards =
    table === "settings" || table === "coa"
      ? [requireAuth, requireSettingsWrite()]
      : [requireAuth, requireCollectionWrite(table)];

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
    const domainError = assertDomain(table, parsed.data.data);
    if (domainError) return reply.status(422).send(fail(domainError, "UNPROCESSABLE"));
    const uniq = UNIQUE_FIELD[table];
    if (uniq) {
      const fieldError = await checkUniqueField(
        table, uniq.field, uniq.label, String((parsed.data.data as Record<string, unknown>)[uniq.field] ?? ""), null,
      );
      if (fieldError) return reply.status(409).send(fail(fieldError, "CONFLICT"));
    }
    const refError = await checkRefs(table, parsed.data.data as Record<string, unknown>);
    if (refError) return reply.status(422).send(fail(refError, "UNPROCESSABLE"));
    await exec(`INSERT INTO ${table} (id, branch, data, updated_at) VALUES (?, ?, ?, ?)`, [
      id, branch, JSON.stringify(parsed.data.data), now,
    ]);
    await writeAudit({
      actor: requestActor(req),
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
    if (parsed.data.baseUpdatedAt !== undefined && parsed.data.baseUpdatedAt !== current.updated_at) {
      return reply.status(409).send({
        ok: false,
        error: { message: "Stale data: row was modified by another user", code: "STALE" },
        data: toJson(current),
      });
    }
    const oldData = (() => {
      try {
        return JSON.parse(current.data) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    const merged = parsed.data.data ? { ...oldData, ...parsed.data.data } : oldData;
    const branch = parsed.data.branch ?? current.branch;
    const now = new Date().toISOString();
    /* PATCH juga wajib menjaga field kunci. checkRefs() sengaja MENGLEWATI
       nilai kosong/null (kolom opsional boleh kosong), jadi tanpa baris ini
       PATCH {vessel:""} pada sebuah proyek lolos begitu saja dan barisnya
       jadi tidak valid - padahal POST kekotak yang sama ditolak 422. */
    const domainError = assertDomain(table, merged);
    if (domainError) return reply.status(422).send(fail(domainError, "UNPROCESSABLE"));
    const uniq = UNIQUE_FIELD[table];
    if (uniq) {
      const fieldError = await checkUniqueField(
        table, uniq.field, uniq.label, String((merged as Record<string, unknown>)[uniq.field] ?? ""), id,
      );
      if (fieldError) return reply.status(409).send(fail(fieldError, "CONFLICT"));
    }
    const refError = await checkRefs(table, merged);
    if (refError) return reply.status(422).send(fail(refError, "UNPROCESSABLE"));
    await exec(`UPDATE ${table} SET branch = ?, data = ?, updated_at = ? WHERE id = ?`, [
      branch, JSON.stringify(merged), now, id,
    ]);
    await writeAudit({
      actor: requestActor(req),
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
    const usages = await findUsages(table, id);
    if (usages.length > 0) {
      return reply
        .status(409)
        .send(fail(`Tidak dapat menghapus: masih dipakai oleh ${usages.join(", ")}`, "REFERENCED"));
    }
    await exec(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await writeAudit({
      actor: requestActor(req),
      action: "delete",
      table,
      rowId: id,
      /* Baris sudah terhapus sebelum audit ditulis; JSON.parse tanpa
         try/catch di sini membuat DELETE kelihatan gagal (500) padahal
         datanya SUDAH hilang, lalu FE mencoba ulang dan mendapat 404.
         toJson() sudah menangani JSON korup - pakai helper yang sama. */
      diff: { branch: doomed.branch, data: toJson(doomed).data },
      ip: requestIp(req),
    });
    return ok({ id, deleted: true });
  });
}
