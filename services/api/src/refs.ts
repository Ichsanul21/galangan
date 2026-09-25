// Integritas referensi antar koleksi (ala Odoo many2one, versi generik).
// Semua relasi tersimpan sebagai string di kolom JSON `data` — peta ini
// mendeklarasikan field mana yang merujuk id tabel mana, dipakai untuk:
// - validasi tulis (422 bila target tidak ada),
// - delete-guard (409 + daftar pemakai bila baris masih dirujuk).
import { getDialect, q } from "./db.js";

export interface RefDef {
  /** tabel yang dirujuk (harus ada di COLLECTIONS atau tabel khusus). */
  target: string;
  /** nilai yang dikecualikan (sentinel sah: saldo awal, arsip umum, tanpa PR). */
  allow?: string[];
}

// field data → definisi referensi, per tabel sumber.
// Join NAMA (sub, vendor, vessel, owner) sengaja TIDAK ditegakkan
// (perbandingan case/trim di FE via helper sameName).
// Sentinel sah (saldo awal "", arsip "-", tanpa PR) didaftarkan per field.
export const REFS: Record<string, Record<string, RefDef>> = {
  invoices: { project: { target: "projects", allow: ["", "-"] } },
  movements: { itemId: { target: "inventory" } },
  termins: { woId: { target: "workOrders" } },
  purchaseOrders: { req: { target: "requisitions", allow: ["-"] } },
  services: { projectId: { target: "projects" }, vesselId: { target: "vessels" } },
  spareparts: { projectId: { target: "projects" }, vesselId: { target: "vessels" } },
  quotations: { requestId: { target: "requests" } },
  contracts: { quotationId: { target: "quotations" }, projectId: { target: "projects" } },
  communications: { quotationId: { target: "quotations" } },
  surveys: { linkedTrial: { target: "trials" } },
  timesheets: { woId: { target: "workOrders" }, employeeId: { target: "employees" } },
  calibrations: { equipmentId: { target: "equipment" } },
  dockSlots: { project: { target: "projects" }, dockId: { target: "drydocks" } },
  documents: { project: { target: "projects", allow: ["-"] } },
  payroll: { employeeId: { target: "employees" } },
  attendance: { employeeId: { target: "employees" } },
  leaves: { employeeId: { target: "employees" } },
  projects: {},
  vessels: {},
  drydocks: {},
  inventory: {},
  equipment: {},
  bookings: {},
  subcontractors: {},
  workOrders: { project: { target: "projects" }, sub: { target: "__name__" } },
  employees: {},
  payables: {},
  ncr: { project: { target: "projects" } },
  incidents: {},
  inspections: { project: { target: "projects" } },
  requisitions: {},
  vendors: {},
  clients: {},
  activities: {},
  boq: { projectId: { target: "projects" } },
  branches: {},
  taxPeriods: {},
  rfqs: { prId: { target: "requisitions" } },
  changeOrders: { project: { target: "projects" } },
  risks: { project: { target: "projects" } },
  trainings: {},
  toolbox: { project: { target: "projects" } },
  drawings: { project: { target: "projects" } },
  warranties: { projectId: { target: "projects" } },
  bast: { projectId: { target: "projects" } },
  trials: { projectId: { target: "projects" } },
  requests: {},
  clientPos: { contractId: { target: "contracts" }, projectId: { target: "projects" } },
  settings: {},
  coa: {},
  journals: {},
  assets: {},
};

// Tabel yang dikecualikan dari delete-guard (tabel konfigurasi/admin).
const NO_DELETE_GUARD = new Set(["settings", "coa", "branches", "activities", "users"]);

function idColumn(table: string): string {
  return table === "wbs_by_project" || table === "team_by_project" ? "project_id" : "id";
}

function jsonEq(field: string): string {
  // MySQL JSON_EXTRACT mengembalikan string ber-quote → UNQUOTE dulu.
  // SQLite json_extract mengembalikan teks polos.
  if (getDialect() === "mysql") return `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${field}')) = ?`;
  return `json_extract(data, '$.${field}') = ?`;
}

/** Validasi referensi data baris. Return pesan error atau null bila OK. */
export async function checkRefs(table: string, data: Record<string, unknown>): Promise<string | null> {
  const defs = REFS[table];
  if (!defs) return null;
  for (const [field, def] of Object.entries(defs)) {
    if (def.target === "__name__") continue; // join nama — tidak ditegakkan
    const raw = data[field];
    if (raw === undefined || raw === null) continue;
    const value = String(raw);
    if (value === "" || (def.allow ?? []).includes(value)) continue;
    let rows: unknown[];
    try {
      rows = await q(`SELECT ${idColumn(def.target)} FROM ${def.target} WHERE ${idColumn(def.target)} = ?`, [value]);
    } catch {
      continue; // tabel target belum ada (DB lama) — jangan blokir tulis
    }
    if (rows.length === 0) {
      return `${field} "${value}" tidak ada di ${def.target}`;
    }
  }
  // Jurnal: akun db/kr wajib terdaftar di CoA (id COA-<kode>).
  if (table === "journals") {
    for (const side of ["db", "kr"] as const) {
      const kode = String(data[side] ?? "");
      if (kode === "") continue;
      let rows: unknown[];
      try {
        rows = await q("SELECT id FROM coa WHERE id = ?", [`COA-${kode}`]);
      } catch {
        continue;
      }
      if (rows.length === 0) return `akun ${side} "${kode}" tidak ada di CoA`;
    }
  }
  return null;
}

/** Cari pemakai baris (table:id) di koleksi lain. Max 5 label "Tabel ID". */
export async function findUsages(table: string, id: string): Promise<string[]> {
  if (NO_DELETE_GUARD.has(table)) return [];
  const out: string[] = [];
  for (const [src, defs] of Object.entries(REFS)) {
    if (src === table) continue;
    for (const [field, def] of Object.entries(defs)) {
      if (def.target !== table || def.target === "__name__") continue;
      try {
        const rows = await q<{ id: string }>(`SELECT id FROM ${src} WHERE ${jsonEq(field)}`, [id]);
        for (const r of rows) {
          out.push(`${src} ${r.id}`);
          if (out.length >= 5) return out;
        }
      } catch {
        // tabel/kolom belum ada — abaikan
      }
    }
  }
  // WBS/team memakai project_id kolom (bukan JSON) — cek khusus proyek.
  if (table === "projects") {
    for (const t of ["wbs_by_project", "team_by_project"] as const) {
      try {
        const rows = await q<{ project_id: string }>(`SELECT project_id FROM ${t} WHERE project_id = ?`, [id]);
        for (const r of rows) {
          out.push(`${t} ${r.project_id}`);
          if (out.length >= 5) return out;
        }
      } catch {
        // abaikan
      }
    }
  }
  return out;
}
