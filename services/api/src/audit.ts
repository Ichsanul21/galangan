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

/* Proyeksi feed aktivitas UI dari jejak audit.
 *
 * Standar: SATU penulis untuk jejak audit. Client tidak boleh POST activities
 * untuk tiap aksi (dual-write = amplifikasi tulis, 409 race saat retry, dan
 * 429 rate-limit yang memblokir push bisnis). writeAudit sudah jalan di setiap
 * CRUD server; di sini kita tulang-gabungkan ke tabel `activities` yang memang
 * dipakai UI (Dashboard/Notifikasi/detail proyek).
 *
 * Tabel `activities` sendiri tidak diaudit (hindari rekursi). */
const MODULE_BY_TABLE: Record<string, string> = {
  projects: "Proyek",
  vessels: "Kapal",
  drydocks: "Drydock",
  dockSlots: "Drydock",
  inventory: "Inventori",
  movements: "Inventori",
  warehouses: "Inventori",
  equipment: "Equipment",
  bookings: "Equipment",
  maintenances: "Equipment",
  calibrations: "Equipment",
  subcontractors: "Subkontraktor",
  workOrders: "Subkontraktor",
  termins: "Subkontraktor",
  employees: "SDM",
  leaves: "SDM",
  trainings: "SDM",
  letters: "SDM",
  attendance: "Absensi",
  payroll: "Payroll",
  invoices: "Keuangan",
  payables: "Keuangan",
  journals: "Keuangan",
  assets: "Keuangan",
  taxPeriods: "Pajak",
  ncr: "QC",
  inspections: "QC",
  drawings: "QC",
  incidents: "Safety",
  toolbox: "Safety",
  walks: "Safety",
  purchaseOrders: "Procurement",
  requisitions: "Procurement",
  rfqs: "Procurement",
  vendors: "Procurement",
  quotations: "CRM",
  clients: "CRM",
  contracts: "CRM",
  requests: "CRM",
  communications: "CRM",
  documents: "Dokumen",
  surveys: "Proyek",
  boq: "BoQ",
  services: "Service",
  spareparts: "Sparepart",
  changeOrders: "Proyek",
  risks: "Proyek",
  trials: "Proyek",
  warranties: "Proyek",
  bast: "Proyek",
};

const ACTION_LABEL: Record<string, string> = {
  create: "menambah",
  update: "memperbarui",
  delete: "menghapus",
};

const TONE_BY_MODULE: Record<string, string> = {
  Proyek: "violet",
  Keuangan: "amber",
  QC: "teal",
  Safety: "rose",
  Procurement: "navy",
  CRM: "navy",
  Drydock: "teal",
  Equipment: "amber",
  Inventori: "navy",
  SDM: "violet",
  Kapal: "teal",
  Dokumen: "navy",
  Subkontraktor: "amber",
  Service: "teal",
  Sparepart: "amber",
  BoQ: "navy",
  Absensi: "violet",
  Payroll: "amber",
  Pajak: "navy",
};

async function projectActivity(input: AuditInput, createdAt: string): Promise<void> {
  if (input.table === "activities") return;
  const module = MODULE_BY_TABLE[input.table] ?? "Laporan";
  const action = ACTION_LABEL[input.action] ?? input.action;
  const id = `A-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const data = {
    id,
    actor: input.actor,
    action,
    target: String(input.rowId ?? ""),
    module,
    time: createdAt,
    tone: TONE_BY_MODULE[module] ?? "navy",
  };
  await exec("INSERT INTO activities (id, branch, data, updated_at) VALUES (?, ?, ?, ?)", [
    id, "", JSON.stringify(data), createdAt,
  ]);
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
    return;
  }
  /* Feed aktivitas UI: proyeksi server-side (single writer). Gagal tidak
     membatalkan operasi bisnis - audit_log tetap sumber kebenaran. */
  try {
    await projectActivity(input, new Date().toISOString());
  } catch (err) {
    auditErrorCount += 1;
    console.error("[audit] activity projection failed:", err);
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
