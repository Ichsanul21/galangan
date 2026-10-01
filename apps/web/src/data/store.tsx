import { idbAvailable, idbGetAll, idbPut, lsClearAll, lsGet, lsPut, type Row } from "./idb";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { newId as newPrefixedId } from "../services/ids";
import { ApiError, apiFetch, getJwt, isBackendConfigured } from "../services/http";
import { remoteRepository } from "../services/repositories";
import {
  projects as seedProjects,
  vessels as seedVessels,
  drydocks as seedDrydocks,
  dockSlots as seedDockSlots,
  inventory as seedInventory,
  equipment as seedEquipment,
  subcontractors as seedSubcontractors,
  employees as seedEmployees,
  ncrList as seedNcr,
  incidents as seedIncidents,
  purchaseOrders as seedPO,
  quotations as seedQuotations,
  clients as seedClients,
  inventoryMovement as seedMovements,
  surveyTimeline as seedSurveys,
  activities as seedActivities,
  services as seedServices,
  spareparts as seedSpareparts,
  seedBoq as seedBoq,
} from "./index";
import { COA_EXCEL, JU_PENYESUAIAN_EXCEL, ASET_EXCEL } from "./financeExcel";
import {
  seedWorkOrders, seedTermins, seedVendors, seedRequisitions, seedInspections,
  seedBookings, seedPayables, seedInvoices, seedDocuments, seedBranches,
  seedAttendance, seedPayroll, seedTaxPeriods, seedRfqs, seedChangeOrders,
  seedRisks, seedLeaves, seedTrainings, seedTimesheets, seedDrawings,
  seedToolbox, seedCalibrations, seedCommunications, seedContracts, seedBast,
  seedTrials, seedRequests, seedClientPos,
} from "./seeds";

/* ============ TIPE ============ */

export interface StoreItem {
  id: string;
  [key: string]: any;
}

export interface WbsItem {
  task: string;
  start: string;
  end: string;
  progress: number;
  weight: number;
  actualHours?: number;
  materialUsed?: string;
  completedBy?: string;
  completionDate?: string;
  status?: "Sedang" | "Selesai";
  station?: string;
  photoNote?: string;
  photoUrl?: string;
  dft?: number;
}

export interface StoreShape {
  projects: StoreItem[];
  vessels: StoreItem[];
  drydocks: StoreItem[];
  dockSlots: StoreItem[];
  inventory: StoreItem[];
  movements: StoreItem[];
  equipment: StoreItem[];
  bookings: StoreItem[];
  subcontractors: StoreItem[];
  workOrders: StoreItem[];
  termins: StoreItem[];
  employees: StoreItem[];
  invoices: StoreItem[];
  payables: StoreItem[];
  ncr: StoreItem[];
  incidents: StoreItem[];
  inspections: StoreItem[];
  purchaseOrders: StoreItem[];
  requisitions: StoreItem[];
  vendors: StoreItem[];
  quotations: StoreItem[];
  clients: StoreItem[];
  documents: StoreItem[];
  surveys: StoreItem[];
  activities: StoreItem[];
  services: StoreItem[];
  spareparts: StoreItem[];
  boq: StoreItem[];
  branches: StoreItem[];
  attendance: StoreItem[];
  payroll: StoreItem[];
  taxPeriods: StoreItem[];
  rfqs: StoreItem[];
  changeOrders: StoreItem[];
  risks: StoreItem[];
  leaves: StoreItem[];
  trainings: StoreItem[];
  timesheets: StoreItem[];
  drawings: StoreItem[];
  toolbox: StoreItem[];
  warranties: StoreItem[];
  calibrations: StoreItem[];
  communications: StoreItem[];
  contracts: StoreItem[];
  bast: StoreItem[];
  trials: StoreItem[];
  requests: StoreItem[];
  clientPos: StoreItem[];
  walks: StoreItem[];
  auditPlans: StoreItem[];
  settings: StoreItem[];
  coa: StoreItem[];
  journals: StoreItem[];
  assets: StoreItem[];
  wbsByProject: Record<string, WbsItem[]>;
  teamByProject: Record<string, string[]>;
}


/* Seed dari docs/RawData/DataPencatatanFinance.xlsx - sheet Akun (98 akun). */
const seedCoa: StoreItem[] = COA_EXCEL.map((c) => ({
  id: `COA-${c.kode}`,
  kode: c.kode,
  nama: c.nama,
  dk: c.dk,
  nrlr: c.nrlr,
}));

/* Seed dari sheet JU - jurnal penyesuaian Agustus 2026 (sudah posted, berimbang). */
const seedJournals: StoreItem[] = JU_PENYESUAIAN_EXCEL.map((j, i) => ({
  id: `JU-EX-${String(i + 1).padStart(2, "0")}`,
  date: j.tgl,
  kodePembantu: "",
  dokumen: "JUM-0831",
  uraian: j.uraian,
  db: j.db,
  kr: j.kr,
  amount: j.dbAmt || j.krAmt,
  sumber: "JU",
  status: "Posted",
}));

/* Seed dari sheet Aset - ringkasan fiskal 2025 per golongan, metode garis lurus (GL). */
const seedAssets: StoreItem[] = ASET_EXCEL.map((a, i) => ({
  id: `AST-EX-0${i + 1}`,
  nama: a.gol,
  kelompok: a.gol === "Bangunan" ? "BP" : a.gol.includes("Inventaris") ? "1" : "2",
  bulan: "-",
  tahun: "2025",
  nilai: a.perolehan,
  sisaAwal: a.sisaAwal,
  susutTahun: a.susut,
  metode: "GL",
}));

/* Konstanta bisnis terpusat - semua rumus baca dari sini via utils/settings.
   Ubah lewat halaman Pengaturan; kalibrasi saat dokumen client datang. */
const seedSettings: StoreItem[] = [
  { id: "SET-PPN", key: "PPN_RATE", value: 12, label: "PPN Keluaran/Masukan hutang-belanja (%)", group: "Pajak" },
  { id: "SET-PPNINV", key: "PPN_INVOICE_RATE", value: 12, label: "PPN invoice jasa+material, DPP=TOTAL×11/12 (%)", group: "Pajak" },
  { id: "SET-PPHJASA", key: "PPH_JASA_RATE", value: 2, label: "PPh invoice (% dari jasa)", group: "Pajak" },
  { id: "SET-PPHSUB", key: "PPH_SUBKON_DEFAULT", value: 0.5, label: "PPh subkontraktor default (0.5/2)", group: "Pajak" },
  { id: "SET-PPH23", key: "PPH23_RATE", value: 2, label: "PPh 23 jasa (%)", group: "Pajak" },
  { id: "SET-PPH21-1", key: "PPH21_T1_RATE", value: 5, label: "PPh21 lapis 1 (%)", group: "Payroll" },
  { id: "SET-PPH21-1B", key: "PPH21_T1_MAX", value: 60000000, label: "PPh21 batas lapis 1 (Rp/thn)", group: "Payroll" },
  { id: "SET-PPH21-2", key: "PPH21_T2_RATE", value: 15, label: "PPh21 lapis 2 (%)", group: "Payroll" },
  { id: "SET-PPH21-2B", key: "PPH21_T2_MAX", value: 250000000, label: "PPh21 batas lapis 2 (Rp/thn)", group: "Payroll" },
  { id: "SET-PPH21-3", key: "PPH21_T3_RATE", value: 25, label: "PPh21 lapis 3 (%)", group: "Payroll" },
  { id: "SET-PPH21-3B", key: "PPH21_T3_MAX", value: 500000000, label: "PPh21 batas lapis 3 (Rp/thn)", group: "Payroll" },
  { id: "SET-PPH21-4", key: "PPH21_T4_RATE", value: 30, label: "PPh21 lapis 4 (%)", group: "Payroll" },
  { id: "SET-PTKP0", key: "PTKP_TK0", value: 54000000, label: "PTKP TK/0 (Rp/thn)", group: "Payroll" },
  { id: "SET-PTKP1", key: "PTKP_K0", value: 58500000, label: "PTKP K/0 (Rp/thn)", group: "Payroll" },
  { id: "SET-PTKPT", key: "PTKP_TANGGUNGAN", value: 4500000, label: "PTKP per tanggungan (Rp/thn, maks 3)", group: "Payroll" },
  { id: "SET-BPJSK", key: "BPJS_KES_KAR", value: 1, label: "BPJS Kes karyawan (%)", group: "Payroll" },
  { id: "SET-BPJSP", key: "BPJS_KES_PER", value: 4, label: "BPJS Kes perusahaan (%)", group: "Payroll" },
  { id: "SET-BPJSTK", key: "BPJS_TK_KAR", value: 2, label: "BPJS TK karyawan JHT (%)", group: "Payroll" },
  { id: "SET-OT", key: "OVERTIME_DIV", value: 173, label: "Pembagi tarif lembur", group: "Payroll" },
  { id: "SET-POKECIL", key: "PO_KECIL_LIMIT", value: 50000000, label: "Batas PO Kecil (Rp)", group: "Procurement" },
  /* Kapasitas per gudang. Tanpa baris ini tabel "Gudang & Kapasitas" di
     Pengaturan kosong dan progress bar kapasitas di Inventori tidak pernah
     muncul - fiturnya mati_total meski pembacanya sudah siap. Nilai JSONObject
     {namaGudang: kapasitas}; Inventory menjumlahkan stock per gudang lalu
     membandingkan dengan angka ini (satuan dicampur, jadi ini pembatas
     perkiraan, bukan hitungan volume riil). */
  { id: "SET-WHCAP", key: "WAREHOUSE_CAP", value: '{"Gudang Baja A":8000,"Gudang B":2000,"Gudang Listrik":1800,"Gudang Pipa":60,"Gudang Rig":40,"Gudang Mesin":30,"Gudang Santi":40}', label: "Kapasitas gudang (JSON {gudang: kapasitas})", group: "Gudang" },
  { id: "SET-APPINV", key: "APPROVE_INVOICE", value: 5000000, label: "Ambang Director invoice (Rp)", group: "Approval" },
  { id: "SET-APPTERM", key: "APPROVE_TERMIN", value: 2000000, label: "Ambang Director termin (Rp)", group: "Approval" },
  { id: "SET-APPPO", key: "APPROVE_PO", value: 1000000, label: "Ambang Director PO (Rp)", group: "Approval" },
  { id: "SET-ALBUD", key: "ALERT_BUDGET_PCT", value: 80, label: "Alert serapan budget (%)", group: "Alert" },
  { id: "SET-ALOVR", key: "ALERT_OVERRUN_PCT", value: 10, label: "Alert overrun di atas (%)", group: "Alert" },
  { id: "SET-ALCERT", key: "ALERT_CERT_DAYS", value: 90, label: "Alert sertifikat H- (hari)", group: "Alert" },
  { id: "SET-ALCERT60", key: "ALERT_CERT_60", value: 60, label: "Alert sertifikat warning H- (hari)", group: "Alert" },
  { id: "SET-ALCERT30", key: "ALERT_CERT_30", value: 30, label: "Alert sertifikat critical H- (hari)", group: "Alert" },
  { id: "SET-ALMS", key: "ALERT_MILESTONE_DAYS", value: 7, label: "Alert milestone H- (hari)", group: "Alert" },
  { id: "SET-ALCP", key: "ALERT_CP_DAYS", value: 3, label: "Alert critical-path delay > (hari)", group: "Alert" },
  { id: "SET-CUTI", key: "CUTI_JATAH", value: 12, label: "Jatah cuti tahunan (hari)", group: "HR" },
  { id: "SET-WHATIF-G", key: "WHATIF_GROWTH", value: 0, label: "What-if pertumbuhan pasar (%)", group: "Analytics" },
  { id: "SET-WHATIF-C", key: "WHATIF_COST", value: 0, label: "What-if biaya, menekan margin (%)", group: "Analytics" },
  { id: "SET-WHATIF-P", key: "WHATIF_PROG", value: 0, label: "What-if progres, menggeser forecast (%)", group: "Analytics" },
  { id: "SET-3D-PROJ", key: "SHOW_3D_PROJECT", value: 0, label: "Tampilkan 3D Viewer di modul Proyek (0/1)", group: "Modul" },
  { id: "SET-3D-VES", key: "SHOW_3D_VESSEL", value: 0, label: "Tampilkan 3D Viewer di modul Kapal (0/1)", group: "Modul" },
];

export const wbsTemplate: WbsItem[] = [
  // Migrasi E3/E4: template New Build dipecah (Outfitting per sistem + Painting per tahap)
  // + Commissioning. Total bobot tetap 100. WBS proyek lama (seed/wbsByProject)
  // TIDAK dimigrasi - hanya template untuk proyek baru.
  { task: "Desain & Persetujuan Class", start: "2026-01", end: "2026-03", progress: 100, weight: 8 },
  { task: "Pengadaan Material", start: "2026-02", end: "2026-05", progress: 85, weight: 10 },
  { task: "Fabrikasi Baja", start: "2026-03", end: "2026-07", progress: 70, weight: 12 },
  { task: "Hull Assembly", start: "2026-05", end: "2026-08", progress: 45, weight: 12 },
  { task: "Outfitting - Machinery", start: "2026-07", end: "2026-09", progress: 20, weight: 8 },
  { task: "Outfitting - Piping", start: "2026-07", end: "2026-09", progress: 20, weight: 7 },
  { task: "Outfitting - Electrical", start: "2026-07", end: "2026-09", progress: 20, weight: 7 },
  { task: "Outfitting - Nav & Comm", start: "2026-07", end: "2026-09", progress: 20, weight: 5 },
  { task: "Outfitting - Accommodation", start: "2026-07", end: "2026-09", progress: 20, weight: 5 },
  { task: "Painting - Surface Prep", start: "2026-08", end: "2026-09", progress: 5, weight: 5 },
  { task: "Painting - Priming", start: "2026-08", end: "2026-09", progress: 5, weight: 4 },
  { task: "Painting - Topcoat", start: "2026-08", end: "2026-09", progress: 5, weight: 4 },
  { task: "Painting - Final Inspection", start: "2026-08", end: "2026-09", progress: 5, weight: 3 },
  { task: "Commissioning", start: "2026-09", end: "2026-09", progress: 0, weight: 6 },
  { task: "Sea Trial & Delivery", start: "2026-09", end: "2026-09", progress: 0, weight: 4 },
];

const seedTeamByProject: Record<string, string[]> = {
  "NB-2025-012": ["EMP-002", "EMP-004", "EMP-006"],
  "NB-2025-014": ["EMP-003", "EMP-005"],
  "RP-2026-003": ["EMP-004", "EMP-006"],
  "RP-2026-005": ["EMP-005"],
  "RF-2026-001": ["EMP-002", "EMP-006"],
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function buildSeeds(): StoreShape {
  return {
    projects: clone(seedProjects) as StoreItem[],
    vessels: clone(seedVessels) as StoreItem[],
    drydocks: clone(seedDrydocks) as StoreItem[],
    dockSlots: clone(seedDockSlots) as StoreItem[],
    inventory: clone(seedInventory) as StoreItem[],
    movements: clone(seedMovements) as StoreItem[],
    equipment: clone(seedEquipment) as StoreItem[],
    bookings: clone(seedBookings),
    subcontractors: clone(seedSubcontractors) as StoreItem[],
    workOrders: clone(seedWorkOrders),
    termins: clone(seedTermins),
    employees: clone(seedEmployees) as StoreItem[],
    invoices: clone(seedInvoices) as StoreItem[],
    payables: clone(seedPayables),
    ncr: clone(seedNcr) as StoreItem[],
    incidents: clone(seedIncidents) as StoreItem[],
    inspections: clone(seedInspections),
    purchaseOrders: clone(seedPO) as StoreItem[],
    requisitions: clone(seedRequisitions),
    vendors: clone(seedVendors),
    quotations: clone(seedQuotations) as StoreItem[],
    clients: clone(seedClients) as StoreItem[],
    documents: clone(seedDocuments),
     surveys: clone(seedSurveys) as StoreItem[],
     activities: clone(seedActivities) as StoreItem[],
     services: clone(seedServices) as StoreItem[],
     spareparts: clone(seedSpareparts) as StoreItem[],
     boq: clone(seedBoq) as StoreItem[],
     branches: clone(seedBranches),
     attendance: clone(seedAttendance),
     payroll: clone(seedPayroll),
     taxPeriods: clone(seedTaxPeriods),
     rfqs: clone(seedRfqs),
     changeOrders: clone(seedChangeOrders),
     risks: clone(seedRisks),
     leaves: clone(seedLeaves),
     trainings: clone(seedTrainings),
     timesheets: clone(seedTimesheets),
     drawings: clone(seedDrawings),
     toolbox: clone(seedToolbox),
     warranties: [],
     calibrations: clone(seedCalibrations),
       communications: clone(seedCommunications),
        contracts: clone(seedContracts),
        bast: clone(seedBast),
        trials: clone(seedTrials),
        requests: clone(seedRequests),
        clientPos: clone(seedClientPos),
        walks: [],
        auditPlans: [],
        settings: clone(seedSettings),
      coa: clone(seedCoa),
      journals: clone(seedJournals),
      assets: clone(seedAssets),
     wbsByProject: {},
     teamByProject: clone(seedTeamByProject),
  };
}

/* ============ CONTEXT ============ */

const STORE_KEY = "isms.store.v4";
const LEGACY_KEYS = ["isms.store.v3", "isms.store.v2", "isms.store.v1"];
const BRANCH_KEY = "isms.branch";
/* Sinkronisasi offline yang diperkeras: dirty set + tombstone delete dipersist
   agar selamat dari reload.
   PENTING: tidak ada TTL. Dulu entri yang "diam" > 7 hari dihapus, sehingga
   resync menimpa edit offline secara permanen. Dirty set hanya berisi nama
   koleksi (maks 54) jadi tidak perlu kedaluwarsa sama sekali. */
const DIRTY_KEY = "isms.dirty";
const TOMBSTONES_KEY = "isms.tombstones";
/* Cap tombstone PER KOLEKSI (bukan global) supaya satu koleksi besar tidak
   membuang seluruh koleksi lain. */
const TOMBSTONE_CAP_PER_COL = 500;
/* Cap konsisten untuk log aktivitas (dulu 30 di tulis vs 100 di resync ->
   resync mengisi 100 lalu add pertama memotong balik jadi 30). */
const ACTIVITIES_CAP = 100;

function loadDirtyPersisted(): string[] {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!parsed || typeof parsed !== "object") return [];
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return entries.filter((e): e is string => typeof e === "string");
  } catch {
    return [];
  }
}

function saveDirtyPersisted(cols: string[]): void {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify({ savedAt: Date.now(), entries: cols }));
  } catch {
    notifyStorageFull("Antrean sinkronisasi gagal disimpan (penyimpanan penuh)");
  }
}

function loadTombstonesPersisted(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!parsed || typeof parsed !== "object") return map;
    const rec = (parsed.entries ?? {}) as Record<string, unknown>;
    for (const [col, ids] of Object.entries(rec)) {
      if (!Array.isArray(ids)) continue;
      /* Cap per koleksi: ambil N terakhir (paling baru), bukan N pertama. */
      const valid = ids.filter((id): id is string => typeof id === "string");
      if (valid.length === 0) continue;
      map.set(col, new Set(valid.slice(-TOMBSTONE_CAP_PER_COL)));
    }
  } catch {
    /* abaikan - mulai kosong */
  }
  return map;
}

function saveTombstonesPersisted(map: Map<string, Set<string>>): void {
  try {
    const entries: Record<string, string[]> = {};
    for (const [col, set] of map) {
      const ids = [...set];
      if (ids.length > 0) entries[col] = ids.slice(-TOMBSTONE_CAP_PER_COL);
    }
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify({ savedAt: Date.now(), entries }));
  } catch {
    notifyStorageFull("Antrean hapus offline gagal disimpan (penyimpanan penuh)");
  }
}

/* saveBackup (isms.backup.<col>) DIHAPUS.
   Komentarnya mengklaim "dipakai pemulihan manual bila BE menimpa", tapi
   dicek ulang: tidak ada satu pun pembaca isms.backup.* di seluruh src.
   Jadi fungsi ini cuma menulis salinan penuh setiap koleksi ke localStorage
   - membakar kuota (yang justru penyebab toast "penyimpanan penuh") demi
   kemampuan pemulihan yang tidak pernah dipakai. Persistensi offline yang
   sebenarnya sekarang handled hydrateFromOfflineStore/persistCollections
   lewat IndexedDB. */
const PREFIX: Record<string, string> = {
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
    settings: "SET",
    coa: "COA",
    journals: "JU",
    assets: "AST",
 };

const ARRAY_KEYS: (keyof StoreShape)[] = [
  "projects", "vessels", "drydocks", "dockSlots", "inventory", "movements",
  "equipment", "bookings", "subcontractors", "workOrders", "termins",
  "employees", "invoices", "payables", "ncr", "incidents", "inspections",
  "purchaseOrders", "requisitions", "vendors", "quotations", "clients",
  "documents", "surveys", "activities", "services", "spareparts", "boq",
  "branches", "attendance", "payroll", "taxPeriods", "rfqs", "changeOrders",
  "risks", "leaves", "trainings", "timesheets", "drawings", "toolbox",
  "warranties",
  "calibrations", "communications", "contracts", "bast", "trials", "requests", "clientPos", "walks", "auditPlans", "settings", "coa", "journals", "assets",
];

function sanitizeStore(parsed: Partial<StoreShape>): StoreShape {
  const seeds = buildSeeds();
  const merged = { ...seeds, ...parsed } as StoreShape;
  for (const k of ARRAY_KEYS) {
    const rec = merged as unknown as Record<string, unknown>;
    if (!Array.isArray(rec[k as string])) {
      rec[k as string] = seeds[k];
    }
  }
  if (!merged.wbsByProject || typeof merged.wbsByProject !== "object") merged.wbsByProject = {};
  if (!merged.teamByProject || typeof merged.teamByProject !== "object") merged.teamByProject = seeds.teamByProject;
  return merged;
}

function loadStore(): StoreShape {
  // Persistensi localStorage (migrasi dari sessionStorage: kunci sama, baca sesi lama sekali).
  // CATATAN: kunci ini sudah TIDAK ditulis lagi (lihat persistEffect di bawah) -
  // movements saja ~6 MB sedangkan kuota localStorage 5 MB, jadi tulisannya
  // selalu gagal. Dibaca sekali untuk migrasi, lalu dihapus biar kuota bebas.
  const read = (storage: Storage, key: string): Partial<StoreShape> | null => {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoreShape>;
        if (parsed && Array.isArray(parsed.projects)) return parsed;
      }
    } catch {
      /* abaikan, coba key berikutnya */
    }
    return null;
  };
  const candidates = [STORE_KEY, ...LEGACY_KEYS];
  for (const key of candidates) {
    const parsed = read(localStorage, key);
    if (parsed) return sanitizeStore(parsed);
  }
  for (const key of candidates) {
    const parsed = read(sessionStorage, key);
    if (parsed) return sanitizeStore(parsed);
  }
  return buildSeeds();
}

export type CollectionKey = Exclude<keyof StoreShape, "wbsByProject" | "teamByProject">;

export type BackendMode = "local" | "remote";

interface StoreCtx {
  data: StoreShape;
  backendMode: BackendMode;
  backendError: string | null;
  pendingSync: string[];
  pushPending: () => Promise<void>;
  add: (col: CollectionKey, item: Omit<StoreItem, "id"> & { id?: string }, activity?: { action: string; target?: string; module: string }) => Promise<StoreItem>;
  update: (col: CollectionKey, id: string, patch: Record<string, any>) => Promise<void>;
  remove: (col: CollectionKey, id: string) => Promise<void>;
  log: (action: string, target: string, module: string) => void;
  reset: () => void;
  resync: () => Promise<void>;
  /** Tarik batch koleksi tertentu saja (pola per modul/tab - useModuleSync). */
  resyncCollections: (cols: CollectionKey[]) => Promise<void>;
  wbsFor: (projectId: string) => WbsItem[];
  setWbs: (projectId: string, wbs: WbsItem[]) => Promise<void>;
  teamFor: (projectId: string) => string[];
  setTeam: (projectId: string, ids: string[]) => Promise<void>;
  branch: string;
  setBranch: (b: string) => void;
  inBranch: (rows: StoreItem[]) => StoreItem[];
}

const Ctx = createContext<StoreCtx | null>(null);

function newId(col: CollectionKey): string {
  const p = PREFIX[col] ?? "X";
  return newPrefixedId(p);
}

/* Koleksi global-by-design: jangan disuntik branch fallback di add(). */
const SKIP_BRANCH_COLLECTIONS: ReadonlySet<string> = new Set(["settings", "coa", "branches"]);

const ACTOR_TONE: Record<string, "navy" | "teal" | "rose" | "violet" | "amber"> = {
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
   Laporan: "teal",
   Monitoring: "violet",
 };

/* Toast tanpa mengimpor ui (hindari sirkular): <Toaster/> di ui.tsx mendengarkan event ini. */
function notifyBackendFallback(): void {
  try {
    window.dispatchEvent(
      new CustomEvent("isms:toast", { detail: { message: "Backend tak terjangkau - mode lokal", tone: "info" } }),
    );
  } catch {
    /* abaikan */
  }
}

/* Toast alasan penolakan backend (mis. 403 "Butuh peran Direktur") - tiap kejadian. */
function notifyForbidden(reason: string): void {
  try {
    window.dispatchEvent(new CustomEvent("isms:toast", { detail: { message: reason, tone: "info" } }));
  } catch {
    /* abaikan */
  }
}

/* Toast konflik tulis (409 STALE/REFERENCED/VALIDATION): data server menang. */
function notifyConflict(message: string): void {
  try {
    window.dispatchEvent(new CustomEvent("isms:toast", { detail: { message, tone: "info" } }));
  } catch {
    /* abaikan */
  }
}

/* Toast penyimpanan penuh. Dulu diam-diam (try/catch kosong) - padahal justru
   saat kuota localStorage habis-lah data lokal hilang tanpa jejak. */
let storageFullToasted = false;
const storageFullKeys = new Set<string>();
function notifyStorageFull(message: string): void {
  /* Dedup per kunci: resync jalan di setiap buka halaman, jadi tanpa dedup
     user dibanjiri toast yang sama berulang. Flag lama hanya ditulis tapi
     tidak pernah dibaca - itu bug. */
  const key = message.slice(0, 60);
  if (storageFullKeys.has(key) && storageFullToasted) return;
  storageFullKeys.add(key);
  try {
    window.dispatchEvent(new CustomEvent("isms:toast", { detail: { message, tone: "info" } }));
    storageFullToasted = true;
  } catch {
    /* abaikan */
  }
}

/* Tulis koleksi ke IndexedDB; bila tidak tersedia, jatuh ke localStorage
   dengan batas baris. Integritas > kelengkapan: lebih baik menyimpan 400
   baris terakhir daripada diam-diam menyimpan nol. */
async function persistCollections(src: Record<string, unknown>, cols: string[]): Promise<void> {
  const useIdb = await idbAvailable();
  let gagal = 0;
  for (const col of cols) {
    const rows = src[col];
    if (!Array.isArray(rows)) continue;
    const ok = useIdb ? await idbPut(col, rows as Row[]) : lsPut(col, rows as Row[]);
    if (!ok) gagal += 1;
  }
  if (gagal > 0) {
    notifyStorageFull(
      `Penyimpanan browser gagal menyimpan ${gagal} koleksi - data offline bisa hilang saat reload`,
    );
  }
}

/* Koleksi yang dipersistensi. wbsByProject/teamByProject bukan array (object)
   jadi ditangani terpisah. */
const OFFLINE_COLLECTIONS: string[] = [
  "projects", "vessels", "drydocks", "dockSlots", "inventory", "movements",
  "equipment", "bookings", "subcontractors", "workOrders", "termins",
  "employees", "invoices", "payables", "ncr", "incidents", "inspections",
  "purchaseOrders", "requisitions", "vendors", "quotations", "clients",
  "documents", "surveys", "activities", "services", "spareparts", "boq",
  "branches", "attendance", "payroll", "taxPeriods", "rfqs", "changeOrders",
  "risks", "leaves", "trainings", "timesheets", "drawings", "toolbox",
  "warranties", "calibrations", "communications", "contracts", "bast",
  "trials", "requests", "clientPos", "walks", "auditPlans", "settings", "coa", "journals", "assets",
];

/* Hidrasi cache offline dari IndexedDB saat boot. Berjalan sebelum resync
   supaya server menimpa cache yang bersih, sementara koleksi dirty (yang
   menyimpan edit offline) tetap aman karena resync melewatinya. */
async function hydrateFromOfflineStore(apply: (rows: Record<string, Row[]>) => void): Promise<void> {
  const all = await idbGetAll();
  if (all && Object.keys(all).length > 0) {
    apply(all);
    return;
  }
  // Fallback: localStorage (dipakai hanya bila IndexedDB tidak tersedia)
  const partial: Record<string, Row[]> = {};
  for (const col of OFFLINE_COLLECTIONS) {
    const rows = lsGet(col);
    if (rows && rows.length > 0) partial[col] = rows;
  }
  if (Object.keys(partial).length > 0) apply(partial);
}

/* Remote dipakai bila backend dikonfigurasi DAN ada JWT - seluruh CRUD BE wajib
   auth. Tanpa JWT (belum login) operasi berjalan lokal senyap, tanpa semburan 401. */
function remoteActive(): boolean {
  return isBackendConfigured() && getJwt() !== null;
}

/* Contract version: cocok dengan services/api GET /api/version.
   Minor-tolerant - sinkronisasi diblokir bila MAJOR berbeda atau web minor
   di bawah minWeb server. */
const EXPECTED_API_MAJOR = 0;
const EXPECTED_API_MINOR = 2;

function majorOf(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.trim().split(".")[0];
  if (m === undefined || m === "") return null;
  const n = Number.parseInt(m, 10);
  return Number.isInteger(n) ? n : null;
}

function minorOf(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const parts = v.trim().split(".");
  if (parts.length < 2 || parts[1] === undefined || parts[1] === "") return null;
  const n = Number.parseInt(parts[1], 10);
  return Number.isInteger(n) ? n : null;
}

function notifyVersionBlocked(serverApi: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent("isms:toast", {
        detail: {
          message: `Versi backend tak kompatibel (server ${serverApi}) - sinkronisasi dibatalkan. Perbarui aplikasi.`,
          tone: "info",
        },
      }),
    );
  } catch {
    /* abaikan */
  }
}

/* Fetch /api/version sebelum sync; false = major mismatch → skip sync.
   Gagal fetch (offline/backend lama tanpa endpoint) → true agar fallback
   normal tetap berjalan. */
async function isApiCompatible(): Promise<boolean> {
  try {
    const ver = await apiFetch<{ api: string; minWeb: string }>("/api/version");
    const serverMajor = majorOf(ver?.api);
    if (serverMajor === null) return true;
    if (serverMajor !== EXPECTED_API_MAJOR) {
      notifyVersionBlocked(String(ver.api));
      return false;
    }
    // Kontrak minWeb: web minor harus >= minWeb minor (FE 0.2.x vs min 0.2.0).
    const minMinor = minorOf(ver?.minWeb);
    if (minMinor !== null && EXPECTED_API_MINOR < minMinor) {
      notifyVersionBlocked(`${String(ver.api)} (butuh web ≥ ${String(ver.minWeb)})`);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreShape>(() => loadStore());
  const [backendMode] = useState<BackendMode>(() => (isBackendConfigured() ? "remote" : "local"));
  const [backendError, setBackendError] = useState<string | null>(null);
  const fallbackToasted = useRef(false);
  /* Anti-clobber: koleksi yang diubah lokal saat fallback tidak boleh ditimpa resync.
     Dipersist ke localStorage (isms.dirty) agar selamat dari reload; TTL 7 hari. */
  const dirtyRef = useRef<Set<string>>(new Set<string>(loadDirtyPersisted()));
  /* Generasi per koleksi: naik setiap markDirty. Dipakai pushPending untuk
     KNOW bahwa flag dirty masih milik perubahan yang sudah dikirim, bukan
     milik edit yang terjadi SAAH push berjalan. Tanpa ini, edit kedua pada
     koleksi yang sama ikut terhapus => lost update. */
  const dirtyGenRef = useRef<Map<string, number>>(new Map());
  const [pendingSync, setPendingSync] = useState<string[]>(() => [...dirtyRef.current]);
  const dataRef = useRef(data);
  dataRef.current = data;
  /* Re-entrancy guard pushPending: tanpa ini tombol "Sinkronkan" + interval
     bisa menjalankan dua push bersamaan dan saling menghapus flag. */
  const pushingRef = useRef(false);
  /* Posisi jendela baris per koleksi untuk pushPending (lihat pushPending). */
  const pushCursorRef = useRef<Map<string, number>>(new Map());

  const markDirty = useCallback((col: string) => {
    if (!isBackendConfigured()) return;
    dirtyGenRef.current.set(col, (dirtyGenRef.current.get(col) ?? 0) + 1);
    if (!dirtyRef.current.has(col)) {
      dirtyRef.current.add(col);
      setPendingSync([...dirtyRef.current]);
    }
    saveDirtyPersisted([...dirtyRef.current]);
  }, []);

  /* Bersihkan flag HANYA bila generasi tidak berubah sejak snapshot push.
     Versi lama menerima Set<nama koleksi> yang isinya sudah dirty saat push
     dimulai, sehingga check "!sentSnapshot.has(col)" selalu SALAH untuk
     koleksi yang sedang dikirim dan edit kedua ikut terhapus. */
  const clearDirty = useCallback((col: string, sentGen?: number) => {
    if (sentGen !== undefined && (dirtyGenRef.current.get(col) ?? 0) !== sentGen) {
      return;
    }
    if (dirtyRef.current.delete(col)) {
      setPendingSync([...dirtyRef.current]);
      saveDirtyPersisted([...dirtyRef.current]);
    }
  }, []);
  /* Tombstone delete: col → Set<id> yang dihapus lokal saat fallback.
     Dipakai pushPending untuk memancarkan DELETE sebelum POST/PATCH.
     Dipersist ke localStorage (isms.tombstones), cap per koleksi (tanpa TTL). */
  const tombstonesRef = useRef<Map<string, Set<string>>>(loadTombstonesPersisted());
  const clearTombstones = useCallback((col: string, sentSnapshot?: Set<string>) => {
    const set = tombstonesRef.current.get(col);
    /* Hapus hanya id yang benar-benar terkirim; id baru yang masuk saat push
       berjalan harus tetap tersimpan agar DELETE-nya tidak hilang. */
    if (set) {
      if (sentSnapshot) {
        for (const id of [...set]) if (sentSnapshot.has(id)) set.delete(id);
      } else {
        set.clear();
      }
      if (set.size === 0) tombstonesRef.current.delete(col);
    }
    saveTombstonesPersisted(tombstonesRef.current);
  }, []);
  const [branch, setBranchState] = useState<string>(() => {
    // Cabang global di localStorage (migrasi dari sessionStorage, kunci sama).
    try {
      return localStorage.getItem(BRANCH_KEY) ?? sessionStorage.getItem(BRANCH_KEY) ?? "SEMUA";
    } catch {
      return "SEMUA";
    }
  });
  const branchRef = useRef(branch);
  branchRef.current = branch;

  const setBranch = (b: string) => {
    setBranchState(b);
    try {
      localStorage.setItem(BRANCH_KEY, b);
    } catch {
      /* abaikan */
    }
  };

  const inBranch = (rows: StoreItem[]): StoreItem[] =>
    branch === "SEMUA" ? rows : rows.filter((r) => !r.branch || r.branch === branch);

  /* Persistensi cache offline ke IndexedDB, bukan localStorage.
     Alasannya terukur: movements produksi 18.937 baris (~6,02 MB JSON) dan
     kuota localStorage hanya 5 MB - jadi satu koleksi saja tidak muat dan
     SELURUH cache store tak pernah berhasil ditulis (error-nya ditelan
     diam-diam). Akibatnya edit offline hilang saat reload, padahal antrean
     dirty hanya menyimpan NAMA koleksi, bukan isi baris - jadi isinya benar
     - benar satu-satunya tempat aman.
     Ditulis per koleksi yang berubah saja (bandingkan identitas referensi),
     dengan debounce supaya tidak menulis 6 MB tiap ketikan. */
  const prevDataRef = useRef<StoreShape | null>(null);
  useEffect(() => {
    const prev = prevDataRef.current;
    prevDataRef.current = data;
    if (prev === null) return; // boot, bukan perubahan
    const cur = data as unknown as Record<string, unknown>;
    const old = prev as unknown as Record<string, unknown>;
    const changed: string[] = [];
    for (const k of Object.keys(cur)) {
      if (cur[k] !== old[k]) changed.push(k);
    }
    if (changed.length === 0) return;
    const t = window.setTimeout(() => {
      void persistCollections(cur, changed);
    }, 700);
    return () => window.clearTimeout(t);
  }, [data]);

  /* Buang kunci store lama dari localStorage sekaliXE saja: tidak ditulis
     lagi, dan sebaliknya memakan kuota yang dibutuhkan antrean dirty,
     tombstone, dan preferensi UI. */
  const legacyClearedRef = useRef(false);
  useEffect(() => {
    if (legacyClearedRef.current) return;
    legacyClearedRef.current = true;
    let freed = 0;
    for (const k of [STORE_KEY, ...LEGACY_KEYS]) {
      try {
        if (localStorage.getItem(k) !== null) freed += 1;
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch {
        /* abaikan */
      }
    }
    if (freed > 0) lsClearAll();
  }, []);

  /* Tarik ulang semua koleksi + WBS/team dari backend (dipakai saat boot dan
     tepat setelah login berhasil, karena JWT baru tersedia saat itu).
     Koleksi kotor (dirty) dilewati agar perubahan lokal tidak tertimpa.
     Koleksi bersih di-backup dulu (isms.backup.<col>, last 1); activities
     di-merge (union by id, lokal dulu + server-only, cap 100) bukan replace. */
  const resync = useCallback(async (): Promise<void> => {
    if (!remoteActive()) return;
    if (!(await isApiCompatible())) return;
    const dirty = dirtyRef.current;
    const pulled: Partial<Record<CollectionKey, StoreItem[]>> = {};
    await Promise.all(
      ARRAY_KEYS.map(async (key) => {
        if (key === "wbsByProject" || key === "teamByProject") return;
        if (dirty.has(key as string)) return;
        try {
          pulled[key] = await remoteRepository(key).list();
        } catch {
          /* koleksi ini tetap memakai seed lokal */
        }
      }),
    );
    const serverActivities = (pulled as Partial<Record<string, StoreItem[]>>).activities;
    if (serverActivities !== undefined) delete (pulled as Partial<Record<string, StoreItem[]>>).activities;
    /* Tidak ada lagi saveBackup di sini: cache offline yang benar sekarang
       ditulis ke IndexedDB oleh persistCollections setiap kali data berubah,
       jadi tidak perlu menyalin ulang sebelum resync - dan tidak ada lagi
       salinan penuh yang menghabiskan kuota localStorage. */
    setData((prev) => {
      const next = { ...prev, ...pulled };
      if (serverActivities !== undefined) {
        const local = prev.activities ?? [];
        const seen = new Set(local.map((r) => r.id));
        next.activities = [...local, ...serverActivities.filter((r) => !seen.has(r.id))].slice(0, ACTIVITIES_CAP);
      }
      /* Buang wbs/team yatim: proyek dihapus di server tidak boleh meninggalkan
         cache selamanya (versi lama hanya menambah, tidak pernah menghapus). */
      const liveProjects = new Set(((pulled.projects as StoreItem[] | undefined) ?? []).map((p) => String(p.id)));
      if (liveProjects.size > 0 && pulled.projects !== undefined) {
        const wbsNext: Record<string, WbsItem[]> = {};
        for (const [pid, rows] of Object.entries(prev.wbsByProject ?? {})) {
          if (liveProjects.has(pid) || dirty.has(`wbs:${pid}`) || dirty.has("wbsByProject")) wbsNext[pid] = rows;
        }
        next.wbsByProject = wbsNext;
        const teamNext: Record<string, string[]> = {};
        for (const [pid, ids] of Object.entries(prev.teamByProject ?? {})) {
          if (liveProjects.has(pid) || dirty.has(`team:${pid}`) || dirty.has("teamByProject")) teamNext[pid] = ids;
        }
        next.teamByProject = teamNext;
      }
      return next;
    });
    const projectIds = ((pulled.projects as StoreItem[] | undefined) ?? []).map((p) => p.id);
    const wbsDirty = dirty.has("wbsByProject");
    const teamDirty = dirty.has("teamByProject");
    await Promise.all(
      projectIds.map(async (projectId) => {
        if (dirty.has(`wbs:${projectId}`) || wbsDirty) return;
        try {
          const wbs = await apiFetch<{ projectId: string; wbs: WbsItem[] }>(
            `/api/projects/${encodeURIComponent(projectId)}/wbs`,
          );
          if (Array.isArray(wbs.wbs)) {
            const rows = wbs.wbs;
            setData((prev) => ({ ...prev, wbsByProject: { ...prev.wbsByProject, [projectId]: rows } }));
          }
        } catch {
          /* cache lokal/template tetap dipakai */
        }
        if (dirty.has(`team:${projectId}`) || teamDirty) return;
        try {
          const team = await apiFetch<{ projectId: string; memberIds: string[] }>(
            `/api/projects/${encodeURIComponent(projectId)}/team`,
          );
          if (Array.isArray(team.memberIds)) {
            const ids = team.memberIds;
            setData((prev) => ({ ...prev, teamByProject: { ...prev.teamByProject, [projectId]: ids } }));
          }
        } catch {
          /* cache lokal tetap dipakai */
        }
      }),
    );
  }, []);

  /* Pola standar fetch per-batch saat pindah modul/tab (lihat useModuleSync):
     hanya koleksi yang dibutuhkan modul aktif yang ditarik, paralel - data
     selalu segar tanpa memuat ulang 50+ koleksi seperti resync() penuh.
     Koleksi dirty tetap dilewati agar edit offline tidak tertimpa, dan
     activities di-merge (bukan replace) seperti pada resync. */
  const resyncCollections = useCallback(async (cols: CollectionKey[]): Promise<void> => {
    if (!remoteActive()) return;
    if (cols.length === 0) return;
    if (!(await isApiCompatible())) return;
    const dirty = dirtyRef.current;
    const pulled: Partial<Record<CollectionKey, StoreItem[]>> = {};
    await Promise.all(
      cols.map(async (key) => {
        if (dirty.has(key as string)) return;
        try {
          pulled[key] = await remoteRepository(key).list();
        } catch {
          /* koleksi ini tetap memakai cache lokal */
        }
      }),
    );
    const serverActivities = pulled.activities;
    if (serverActivities !== undefined) delete pulled.activities;
    setData((prev) => {
      const next = { ...prev, ...pulled };
      if (serverActivities !== undefined) {
        const local = prev.activities ?? [];
        const seen = new Set(local.map((r) => r.id));
        next.activities = [...local, ...serverActivities.filter((r) => !seen.has(r.id))].slice(0, ACTIVITIES_CAP);
      }
      return next;
    });
  }, []);

  /* Dorong perubahan lokal yang tertunda ke backend: DELETE tombstone dulu,
     lalu tiap baris coba POST, bila 409 (sudah ada) coba PATCH.
     Bersihkan tombstones+dirty per koleksi bila sukses.

     Dua pengaman data-loss:
     1) Batas BARIS_PER_RUN. Dulu seluruh koleksi di-POST; koleksi >300 baris
        kena rate-limit 300/menit, retry menumpuk, koleksi tidak pernah keluar
        dari dirty. Sekarang dipotong dan sisanya dilanjutkan run berikutnya.
     2) Snapshot tombstone per run: id yang masuk SETELAH run dimulai tidak
        ikut dihapus, jadi DELETE baru tidak hilang. */
  const PUSH_ROWS_PER_RUN = 200;
  const pushPending = useCallback(async (): Promise<void> => {
    if (!remoteActive()) return;
    if (!(await isApiCompatible())) return;
    if (pushingRef.current) return;
    pushingRef.current = true;
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const cols = [...dirtyRef.current];
    try {
    /* Generasi dirty per koleksi di-SAAT push dimulai. clearDirty hanya
       membersihkan bila generasi masih sama, jadi edit yang masuk saat loop
       push berjalan tetap tersimpan untuk push berikutnya. */
    const sentGen = new Map<string, number>();
    for (const col of cols) sentGen.set(col, dirtyGenRef.current.get(col) ?? 0);
    for (const col of cols) {
      try {
        if (col === "wbsByProject" || col.startsWith("wbs:")) {
          const entries = Object.entries(dataRef.current.wbsByProject ?? {});
          const targets =
            col === "wbsByProject"
              ? entries
              : entries.filter(([pid]) => col === `wbs:${pid}`);
          for (const [projectId, wbs] of targets) {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/wbs`, {
              method: "PUT",
              body: JSON.stringify({ wbs }),
            });
          }
          clearDirty(col, sentGen.get(col));
          setBackendError(null);
          continue;
        }
        if (col === "teamByProject" || col.startsWith("team:")) {
          const entries = Object.entries(dataRef.current.teamByProject ?? {});
          const targets =
            col === "teamByProject"
              ? entries
              : entries.filter(([pid]) => col === `team:${pid}`);
          for (const [projectId, memberIds] of targets) {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/team`, {
              method: "PUT",
              body: JSON.stringify({ memberIds }),
            });
          }
          clearDirty(col, sentGen.get(col));
          setBackendError(null);
          continue;
        }
        let ok = true;
        /* DELETEs dulu agar hapus lokal terpropagasi sebelum upsert survivor.
           Snapshot id di awal run: id yang masuk setelah ini TIDAK ikut
           dihapus (memakai set terpisah), agar DELETE baru tidak hilang. */
        const tombstones = tombstonesRef.current.get(col);
        const sentTombstones = new Set<string>();
        if (tombstones && tombstones.size > 0) {
          for (const id of [...tombstones]) {
            try {
              await remoteRepository(col).remove(id);
            } catch (err) {
              /* 404 = sudah hilang di BE -> anggap sukses; selain itu gagal. */
              if (err instanceof ApiError && err.status === 404) {
                tombstones.delete(id);
                sentTombstones.add(id);
                continue;
              }
              // 409 REFERENCED = server menang (masih dipakai) - lepas
              // tombstone agar tidak retry selamanya; baris akan kembali
              // saat resync berikutnya setelah koleksi bersih.
              if (err instanceof ApiError && err.status === 409) {
                notifyConflict(err.message);
                tombstones.delete(id);
                sentTombstones.add(id);
                continue;
              }
              ok = false;
              break;
            }
            tombstones.delete(id);
            sentTombstones.add(id);
          }
          saveTombstonesPersisted(tombstonesRef.current);
          if (!ok) continue;
        }
        const allRows = ((dataRef.current as unknown as Record<string, StoreItem[]>)[col] ?? []) as StoreItem[];
        /* Batasi baris per run. Koleksi besar (>300 baris) akan kena rate-limit
           300/menit; versi lama mengirim SELURUH koleksi lalu retry menumpuk
           sehingga koleksi tidak pernah keluar dari dirty.
           Jendela BERJALAN lewat cursor per koleksi: versi lama selalu
           slice(0, N) sehingga baris setelah N tidak pernah terkirim sama sekali
           dan koleksi tersebut macet permanen. Cursor dilepas setelah satu
           putaran penuh, lalu koleksi boleh dibersihkan. */
        const start = pushCursorRef.current.get(col) ?? 0;
        const rows = allRows.slice(start, start + PUSH_ROWS_PER_RUN);
        const truncated = start + rows.length < allRows.length;
        for (const row of rows) {
          const attemptCreate = async (retried: boolean): Promise<"ok" | "stale" | "fail"> => {
            try {
              await remoteRepository(col).create(row);
              return "ok";
            } catch (err) {
              if (err instanceof ApiError && err.status === 409) {
                try {
                  // Kirim baseUpdatedAt agar STALE terdeteksi, bukan timpa buta.
                  const base = typeof row.updated_at === "string" ? row.updated_at : undefined;
                  await remoteRepository(col).patch(
                    row.id,
                    (base ? { ...row, baseUpdatedAt: base } : row) as Record<string, unknown>,
                  );
                  return "ok";
                } catch (perr) {
                  if (perr instanceof ApiError && perr.status === 409 && perr.code === "STALE") return "stale";
                  return "fail";
                }
              }
              // 429: hormati Retry-After sekali, lalu coba ulang sekali.
              if (err instanceof ApiError && err.status === 429 && !retried) {
                const waitMs = Math.min(Math.max(err.retryAfterSec ?? 5, 1), 30) * 1000;
                setBackendError(`Terlalu banyak permintaan - jeda ${Math.round(waitMs / 1000)} dtk lalu coba lagi`);
                await sleep(waitMs);
                return attemptCreate(true);
              }
              return "fail";
            }
          };
          const res = await attemptCreate(false);
          if (res === "stale") {
            // Server menang - tarik versi server gantikan lokal.
            try {
              const server = await apiFetch<{ id: string; branch: string; data: Record<string, unknown>; updated_at: string }>(
                `/api/${col}/${encodeURIComponent(row.id)}`,
              );
              setData((prev) => ({
                ...prev,
                [col]: (((prev as unknown as Record<string, StoreItem[]>)[col] ?? []) as StoreItem[]).map((r) =>
                  r.id === row.id ? { ...(server.data ?? {}), id: server.id, branch: server.branch, updated_at: server.updated_at } : r,
                ),
              }));
            } catch {
              ok = false;
              break;
            }
            notifyConflict("Data server lebih baru - versi server dipakai. Ulangi perubahan Anda bila perlu.");
            continue;
          }
          if (res !== "ok") {
            ok = false;
            break;
          }
        }
        if (ok) {
          clearTombstones(col, sentTombstones);
          /* Koleksi terpotong tetap dirty agar sisa baris dikirim run berikutnya. */
          if (truncated) {
            pushCursorRef.current.set(col, start + rows.length);
          } else {
            pushCursorRef.current.delete(col);
            clearDirty(col, sentGen.get(col));
            setBackendError(null);
          }
        }
      } catch {
        /* koleksi ini tetap dirty - coba lagi nanti */
      }
    }
    } finally {
      pushingRef.current = false;
    }
  }, [clearDirty, clearTombstones]);

  /* Boot backend-first: bila backend dikonfigurasi dan sudah login (JWT),
     tarik semua koleksi dari BE; tiap koleksi yang gagal → biarkan seed lokal.
    Jwala boot: coba sinkronkan antrean offline, lalu interval berkala.
     Dulu hanya tombol manual di AppShell - antrean bisa mengendap lalu hilang. */
  useEffect(() => {
    /* Hidrasi cache offline DULU, baru resync dari server. Urutannya penting:
       server harus menimpa cache yang bersih, sementara koleksi yang dirty
       (pemegang edit offline) tetap aman karena resync melewatinya. */
    void hydrateFromOfflineStore((cached) => {
      setData((prev) => {
        const next = { ...prev } as unknown as Record<string, unknown>;
        let changed = false;
        for (const [col, rows] of Object.entries(cached)) {
          if (Array.isArray(rows) && rows.length > 0) {
            next[col] = rows;
            changed = true;
          }
        }
        return changed ? sanitizeStore(next as unknown as Partial<StoreShape>) : prev;
      });
    }).then(() => resync());
  }, [resync]);

  useEffect(() => {
    if (backendMode !== "remote") return;
    if (dirtyRef.current.size === 0) return;
    /* Jangan tumbles bootstrap: tunggu agar resync awal selesai dulu. */
    const boot = window.setTimeout(() => { void pushPending(); }, 2500);
    const onOnline = () => { void pushPending(); };
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => {
      if (dirtyRef.current.size === 0) return;
      if (document.hidden) return;
      void pushPending();
    }, 45000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [backendMode, pushPending]);

  const api = useMemo<StoreCtx>(() => {
    const buildActivity = (action: string, target: string, module: string): StoreItem => ({
      id: newId("activities"),
      actor: "Anda",
      action,
      target,
      module,
      time: "baru saja",
      tone: ACTOR_TONE[module] ?? "navy",
    });

    const pushEntry = (prev: StoreShape, entry: StoreItem): StoreItem[] =>
      [entry, ...prev.activities].slice(0, ACTIVITIES_CAP);

    /* Gagal remote → fallback lokal + tandai error + toast sekali per sesi.
       Khusus 403 (mis. butuh peran Direktur): JANGAN tulis lokal / tandai dirty,
       cukup toast alasan dari backend. Kembalikan true bila 403. */
    /* Klasifikasi error backend.
       - "recoverable" (false): error jaringan/401/429 →ezi ditulis lokal, nanti disinkron.
       - "permanent" (true): 403/400/409/422 → TIDAK BOLEH ditulis lokal, dan pemanggil
         harus diberi tahu (throw) supaya tidak menampilkan "sukses" palsu. */
    const degrade = (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 403) {
        const reason = err.message || "Akses ditolak - butuh peran yang sesuai";
        setBackendError(reason);
        notifyForbidden(reason);
        return true;
      }
      /* 400/409/422 = validasi/ konstrain/referensi: permanen. Menulis lokal hanya
         akan menghasilkan data rusak yang memblokir sinkronisasi selamanya. */
      if (err instanceof ApiError && (err.status === 400 || err.status === 409 || err.status === 422)) {
        setBackendError(err.message || "Data ditolak server");
        notifyConflict(err.message || "Data ditolak server");
        return true;
      }
      if (err instanceof ApiError && err.status === 401) {
        setBackendError("Sesi berakhir - login ulang; perubahan ditahan untuk sinkronisasi");
        if (!fallbackToasted.current) {
          fallbackToasted.current = true;
          notifyBackendFallback();
        }
        return false;
      }
      if (err instanceof ApiError && err.status === 429) {
        const wait = err.retryAfterSec ? ` (coba lagi ${err.retryAfterSec} dtk)` : "";
        setBackendError(`Terlalu banyak permintaan${wait} - perubahan ditahan`);
        if (!fallbackToasted.current) {
          fallbackToasted.current = true;
          notifyBackendFallback();
        }
        return false;
      }
      setBackendError(err instanceof Error && err.message ? err.message : "Backend tak terjangkau - mode lokal");
      if (!fallbackToasted.current) {
        fallbackToasted.current = true;
        notifyBackendFallback();
      }
      return false;
    };

    return {
      data,
      backendMode,
      backendError,
      pendingSync,
      pushPending,
      add: async (col, item, activity) => {
        const full: StoreItem = { ...item, id: item.id || newId(col) };
        /* Branch fallback terpusat: baris baru tanpa branch mewarisi cabang global.
           "SEMUA" = semua cabang → biarkan kosong (terlihat di semua filter).
           Koleksi global-by-design (settings/coa/branches) disentuh tidak. */
        if (!SKIP_BRANCH_COLLECTIONS.has(col as string)) {
          const cur = full.branch;
          if (cur === undefined || cur === null || String(cur).trim() === "") {
            const g = branchRef.current ?? branch;
            if (g && g !== "SEMUA") full.branch = g;
          }
        }
        if (remoteActive()) {
          try {
            const saved = await remoteRepository(col).create(full);
            const finalItem = saved && saved.id ? saved : full;
            const entry = activity
              ? buildActivity(activity.action, activity.target ?? finalItem.id, activity.module)
              : null;
            setData((prev) => ({
              ...prev,
              [col]: [finalItem, ...((prev[col] as StoreItem[] | undefined) ?? [])],
              activities: entry ? pushEntry(prev, entry) : prev.activities,
            }));
            if (entry) {
              /* Mirror aktivitas best-effort tanpa rekursi (langsung HTTP, bukan add()).
                 Gagal → tandai dirty agar pushPending/resync tidak menghilangkannya. */
              remoteRepository("activities").create(entry).catch(() => markDirty("activities"));
            }
            setBackendError(null);
            return finalItem;
          } catch (err) {
            // 400/409/422 ber-code (VALIDATION/CONFLICT/REFERENCED/UNPROCESSABLE):
            // jangan tulis lokal - lempar agar caller toast gagal, bukan sukses.
            // (400 validasi masuk sini agar data invalid tak tersimpan lokal.)
            if (err instanceof ApiError && (err.status === 400 || err.status === 409 || err.status === 422)) {
              notifyConflict(err.message);
              throw err;
            }
            if (degrade(err)) throw err;
          }
        }
        markDirty(col as string);
        const fallbackEntry = activity
          ? buildActivity(activity.action, activity.target ?? full.id, activity.module)
          : null;
        if (fallbackEntry) markDirty("activities");
        setData((prev) => ({
          ...prev,
          [col]: [full, ...((prev[col] as StoreItem[] | undefined) ?? [])],
          activities: fallbackEntry ? pushEntry(prev, fallbackEntry) : prev.activities,
        }));
        return full;
      },
      update: async (col, id, patch) => {
        if (remoteActive()) {
          try {
            /* Optimistic concurrency: kirim updated_at terakhir sebagai
               baseUpdatedAt; BE 409 STALE bila sudah diubah pengguna lain. */
            const current = ((dataRef.current as unknown as Record<string, StoreItem[]>)[col as string] ?? []).find(
              (r) => r.id === id,
            );
            const base = current?.updated_at;
            const body = typeof base === "string" && base !== "" ? { ...patch, baseUpdatedAt: base } : patch;
            const saved = await remoteRepository(col).patch(id, body);
            setData((prev) => ({
              ...prev,
              [col]: ((prev[col] as StoreItem[] | undefined) ?? []).map((r) => (r.id === id ? saved : r)),
            }));
            setBackendError(null);
            return;
          } catch (err) {
            // STALE: server menang - muat versi server + beri tahu eksplisit.
            if (err instanceof ApiError && err.status === 409 && err.code === "STALE") {
              const server = (err.data ?? {}) as { data?: Record<string, unknown>; branch?: string; updated_at?: string };
              setData((prev) => ({
                ...prev,
                [col]: ((prev[col] as StoreItem[] | undefined) ?? []).map((r) =>
                  r.id === id
                    ? {
                        ...r,
                        ...(typeof server.data === "object" && server.data !== null ? server.data : {}),
                        ...(typeof server.branch === "string" ? { branch: server.branch } : {}),
                        ...(typeof server.updated_at === "string" ? { updated_at: server.updated_at } : {}),
                      }
                    : r,
                ),
              }));
              setBackendError(null);
              notifyConflict("Data sudah diubah pengguna lain - versi server dimuat ulang. Ulangi perubahan Anda.");
              return;
            }
            // REFERENCED/VALIDATION/UNPROCESSABLE (+400 validasi): tampilkan
            // alasan BE apa adanya + lempar agar caller toast gagal.
            if (err instanceof ApiError && (err.status === 400 || err.status === 409 || err.status === 422)) {
              notifyConflict(err.message);
              throw err;
            }
            /* 403 = permanen (hak akses). Lempar juga: tanpa ini update() diam-diam
               kembali tanpa menulis, sementara caller menampilkan "sukses". */
            if (degrade(err)) throw err;
          }
        }
        markDirty(col as string);
        setData((prev) => ({
          ...prev,
          [col]: ((prev[col] as StoreItem[] | undefined) ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      },
      remove: async (col, id) => {
        if (remoteActive()) {
          try {
            await remoteRepository(col).remove(id);
            setData((prev) => ({
              ...prev,
              [col]: ((prev[col] as StoreItem[] | undefined) ?? []).filter((r) => r.id !== id),
            }));
            setBackendError(null);
            return;
          } catch (err) {
            // REFERENCED (masih dipakai modul lain) + 400/422: tampilkan +
            // lempar, jangan hapus lokal.
            if (err instanceof ApiError && (err.status === 400 || err.status === 409 || err.status === 422)) {
              notifyConflict(err.message);
              throw err;
            }
            /* 403 = permanen. Lempar agar caller tidak menampilkan "hapus berhasil". */
            if (degrade(err)) throw err;
          }
        }
        /* Fallback lokal: catat tombstone agar DELETE terpropagasi via pushPending. */
        const set = tombstonesRef.current.get(col as string) ?? new Set<string>();
        set.add(id);
        tombstonesRef.current.set(col as string, set);
        saveTombstonesPersisted(tombstonesRef.current);
        markDirty(col as string);
        setData((prev) => ({
          ...prev,
          [col]: ((prev[col] as StoreItem[] | undefined) ?? []).filter((r) => r.id !== id),
        }));
      },
      log: (action, target, module) => {
        const entry = buildActivity(action, target, module);
        setData((prev) => ({ ...prev, activities: [entry, ...prev.activities].slice(0, ACTIVITIES_CAP) }));
        if (remoteActive()) {
          // Best-effort mirror tanpa await - langsung via HTTP (bukan add())
          // agar tidak terjadi rekursi; gagal → tandai dirty agar tidak ter-wipe resync.
          remoteRepository("activities").create(entry).catch(() => markDirty("activities"));
        } else {
          /* Offline/fallback: tandai dirty agar resync melewati koleksi activities. */
          markDirty("activities");
        }
      },
      reset: () => {
        setData(buildSeeds());
      },
      resync,
      resyncCollections,
      wbsFor: (projectId) => data.wbsByProject[projectId] ?? clone(wbsTemplate),
      setWbs: async (projectId, wbs) => {
        const prevWbs = dataRef.current.wbsByProject[projectId];
        setData((prev) => ({ ...prev, wbsByProject: { ...prev.wbsByProject, [projectId]: wbs } }));
        if (remoteActive()) {
          try {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/wbs`, {
              method: "PUT",
              body: JSON.stringify({ wbs }),
            });
            setBackendError(null);
            return;
          } catch (err) {
            if (degrade(err)) {
              // 403: kembalikan optimistik, jangan tandai dirty.
              setData((prev) => {
                const next = { ...prev.wbsByProject };
                if (prevWbs === undefined) delete next[projectId];
                else next[projectId] = prevWbs;
                return { ...prev, wbsByProject: next };
              });
              return;
            }
          }
        }
        markDirty("wbsByProject");
        markDirty(`wbs:${projectId}`);
      },
      teamFor: (projectId) => data.teamByProject[projectId] ?? [],
      setTeam: async (projectId, ids) => {
        const prevTeam = dataRef.current.teamByProject[projectId];
        setData((prev) => ({ ...prev, teamByProject: { ...prev.teamByProject, [projectId]: ids } }));
        if (remoteActive()) {
          try {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/team`, {
              method: "PUT",
              body: JSON.stringify({ memberIds: ids }),
            });
            setBackendError(null);
            return;
          } catch (err) {
            if (degrade(err)) {
              // 403: kembalikan optimistik, jangan tandai dirty.
              setData((prev) => {
                const next = { ...prev.teamByProject };
                if (prevTeam === undefined) delete next[projectId];
                else next[projectId] = prevTeam;
                return { ...prev, teamByProject: next };
              });
              return;
            }
          }
        }
        markDirty("teamByProject");
        markDirty(`team:${projectId}`);
      },
      branch,
      setBranch,
      inBranch,
    };
  }, [data, branch, inBranch, backendMode, backendError, resync, resyncCollections, pendingSync, pushPending, markDirty]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore harus dipakai di dalam <StoreProvider>");
  return ctx;
}
