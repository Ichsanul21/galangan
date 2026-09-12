import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  projects as seedProjects,
  vessels as seedVessels,
  drydocks as seedDrydocks,
  dockSlots as seedDockSlots,
  inventory as seedInventory,
  equipment as seedEquipment,
  subcontractors as seedSubcontractors,
  employees as seedEmployees,
  invoices as seedInvoices,
  ncrList as seedNcr,
  incidents as seedIncidents,
  purchaseOrders as seedPO,
  quotations as seedQuotations,
  clients as seedClients,
  inventoryMovement as seedMovements,
  surveyTimeline as seedSurveys,
  activities as seedActivities,
} from "./index";

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
  wbsByProject: Record<string, WbsItem[]>;
  teamByProject: Record<string, string[]>;
}

/* ============ SEED TAMBAHAN (pindahan inline page + data baru) ============ */

const seedWorkOrders: StoreItem[] = [
  { id: "WO-2026-041", sub: "PT Baja Utama Steel", project: "NB-2025-012", scope: "Fabrikasi & blasting section 4-7", progress: 70, status: "Dalam Proses" },
  { id: "WO-2026-042", sub: "CV Pengecatan Marine", project: "RP-2026-003", scope: "Coating lambung & deck", progress: 55, status: "Dalam Proses" },
  { id: "WO-2026-043", sub: "PT Mesinindo Perkasa", project: "RP-2026-005", scope: "Overhaul main engine", progress: 40, status: "Dalam Proses" },
  { id: "WO-2026-044", sub: "CV Scaffold Aman", project: "NB-2025-012", scope: "Perancah hull assembly", progress: 100, status: "Selesai" },
  { id: "WO-2026-045", sub: "PT Kelistrikan Bahari", project: "RF-2026-001", scope: "Instalasi panel & cabling", progress: 25, status: "Dalam Proses" },
];

const seedTermins: StoreItem[] = [
  { id: "TRM-001", sub: "PT Baja Utama Steel", progress: "WO-041 (70%)", amount: 2100000000, pph23: "2%", retention: "5%", status: "Belum Dibayar" },
  { id: "TRM-002", sub: "PT Mesinindo Perkasa", progress: "WO-043 (40%)", amount: 1568000000, pph23: "2%", retention: "5%", status: "Disetujui" },
  { id: "TRM-003", sub: "CV Scaffold Aman", progress: "WO-044 (100%)", amount: 450000000, pph23: "2%", retention: "5%", status: "Lunas" },
  { id: "TRM-004", sub: "CV Pengecatan Marine", progress: "WO-042 (55%)", amount: 940000000, pph23: "2%", retention: "5%", status: "Belum Dibayar" },
];

const seedVendors: StoreItem[] = [
  { id: "V-001", name: "PT Bahana Baja", cat: "Baja & Struktur", onTime: 92, quality: 95, po: 12, status: "Aktif" },
  { id: "V-002", name: "PT Indo Diesel", cat: "Mesin & Engine", onTime: 96, quality: 90, po: 5, status: "Aktif" },
  { id: "V-003", name: "PT Jotun Indonesia", cat: "Cat & Coating", onTime: 88, quality: 93, po: 8, status: "Aktif" },
  { id: "V-004", name: "PT Steel Rig", cat: "Rigging & Wire", onTime: 84, quality: 87, po: 6, status: "Aktif" },
  { id: "V-005", name: "PT Primabaja", cat: "Baja & Struktur", onTime: 81, quality: 86, po: 3, status: "Kualifikasi" },
];

const seedRequisitions: StoreItem[] = [
  { id: "PR-2026-201", item: "Aux Engine MAK", by: "Budi Santoso", amount: 1700000000, status: "Sudah PO" },
  { id: "PR-2026-203", item: "Pelat Baja AH36", by: "Fajar N.", amount: 4120000000, status: "Sudah PO" },
  { id: "PR-2026-207", item: "Cat Epoxy", by: "Rudi H.", amount: 480000000, status: "Menunggu Approval" },
  { id: "PR-2026-209", item: "Wire Rope", by: "Sari W.", amount: 210000000, status: "RFQ" },
  { id: "PR-2026-211", item: "Anoda Zink", by: "Agus S.", amount: 94000000, status: "Menunggu Approval" },
];

const seedInspections: StoreItem[] = [
  { id: "INS-2026-118", project: "NB-2025-012", point: "Welding seam section 4", itp: "ITP-012", status: "Lulus", date: "2026-07-20" },
  { id: "INS-2026-119", project: "RP-2026-003", point: "Ketebalan cat lambung", itp: "ITP-003", status: "NCR", date: "2026-07-22" },
  { id: "INS-2026-120", project: "RF-2026-001", point: "Anoda & hull survey", itp: "ITP-001", status: "Dalam Proses", date: "2026-07-26" },
  { id: "INS-2026-121", project: "NB-2025-014", point: "Pemeriksaan prop shaft", itp: "ITP-014", status: "Terjadwal", date: "2026-08-02" },
  { id: "INS-2026-122", project: "RP-2026-005", point: "Toleransi bearing overhaul", itp: "ITP-005", status: "NCR", date: "2026-07-25" },
];

const seedBookings: StoreItem[] = [
  { equip: "Mobile Crane 100T", proyek: "NB-2025-012", jam: "08:00–17:00", status: "Terpakai", id: "BK-001", date: "2026-08-02" },
  { equip: "Mesin Las MIG-12", proyek: "RP-2026-003", jam: "07:00–16:00", status: "Terpakai", id: "BK-002", date: "2026-08-02" },
  { equip: "Forklift 10T", proyek: "RP-2026-005", jam: "09:00–15:00", status: "Terpakai", id: "BK-003", date: "2026-08-02" },
  { equip: "Gantry Crane 50T", proyek: "NB-2025-014", jam: "08:00–12:00", status: "Terjadwal", id: "BK-004", date: "2026-08-03" },
];

const seedPayables: StoreItem[] = [
  { id: "AP-001", v: "PT Bahana Baja", po: "PO-2026-114", amt: 4120000000, due: "2026-09-01", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-002", v: "PT Indo Diesel", po: "PO-2026-115", amt: 1700000000, due: "2026-08-10", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-003", v: "PT Jotun Indonesia", po: "PO-2026-116", amt: 480000000, due: "2026-08-15", pph: "2%", st: "Draft" },
  { id: "AP-004", v: "PT Steel Rig", po: "PO-2026-117", amt: 210000000, due: "2026-08-20", pph: "2%", st: "Belum Dibayar" },
];

const seedDocuments: StoreItem[] = [
  { id: "DOC-001", title: "Kontrak NB-2025-012 — TB Samudra Jaya 07", type: "Kontrak", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v3.0", status: "Berlaku", updated: "2026-07-28", owner: "Andi Darman" },
  { id: "DOC-002", title: "General Arrangement Drawing", type: "Drawing", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "Rev C", status: "Disetujui", updated: "2026-07-20", owner: "Hendra Wijaya" },
  { id: "DOC-003", title: "ITP-012 Welding Procedure", type: "Prosedur", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.2", status: "Berlaku", updated: "2026-07-15", owner: "Sari Wulandari" },
  { id: "DOC-004", title: "Certificate of Class — TB Karya Bahari 12", type: "Sertifikat", project: "RP-2026-003", vessel: "TB Karya Bahari 12", version: "2023", status: "Kedaluwarsa", updated: "2023-08-15", owner: "Sari Wulandari" },
  { id: "DOC-005", title: "Docking Report RP-2026-003", type: "Laporan", project: "RP-2026-003", vessel: "TB Karya Bahari 12", version: "v1.0", status: "Draft", updated: "2026-08-01", owner: "Rudi Hartono" },
  { id: "DOC-006", title: "Kontrak NB-2025-014 — TB Nusantara 22", type: "Kontrak", project: "NB-2025-014", vessel: "TB Nusantara 22", version: "v2.0", status: "Berlaku", updated: "2026-06-30", owner: "Andi Darman" },
  { id: "DOC-007", title: "Sea Trial Procedure NB-2025-012", type: "Prosedur", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.0", status: "Menunggu Approval", updated: "2026-08-02", owner: "Budi Santoso" },
  { id: "DOC-008", title: "Invoice INV-2607 (Milestone 3)", type: "Invoice", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.0", status: "Terkirim", updated: "2026-07-29", owner: "Dewi Lestari" },
  { id: "DOC-009", title: "NCR-2026-031 Corrective Action", type: "NCR", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.1", status: "Dalam Proses", updated: "2026-07-25", owner: "Sari Wulandari" },
  { id: "DOC-010", title: "Stability Booklet — TB Nusantara 22", type: "Drawing", project: "NB-2025-014", vessel: "TB Nusantara 22", version: "Rev A", status: "Disetujui", updated: "2026-07-10", owner: "Hendra Wijaya" },
  { id: "DOC-011", title: "HSE Plan 2026", type: "Prosedur", project: "-", vessel: "-", version: "v4.0", status: "Berlaku", updated: "2026-01-05", owner: "Sari Wulandari" },
  { id: "DOC-012", title: "Quotation QT-2026-052", type: "Penawaran", project: "-", vessel: "TB Baru RJ-03", version: "v2.0", status: "Negosiasi", updated: "2026-07-20", owner: "Hendra Wijaya" },
];

export const wbsTemplate: WbsItem[] = [
  { task: "Desain & Persetujuan Class", start: "2026-01", end: "2026-03", progress: 100, weight: 10 },
  { task: "Pengadaan Material", start: "2026-02", end: "2026-05", progress: 85, weight: 15 },
  { task: "Fabrikasi Baja", start: "2026-03", end: "2026-07", progress: 70, weight: 20 },
  { task: "Hull Assembly", start: "2026-05", end: "2026-08", progress: 45, weight: 20 },
  { task: "Mesin & Kelistrikan", start: "2026-07", end: "2026-09", progress: 20, weight: 20 },
  { task: "Pengecatan & Outfitting", start: "2026-08", end: "2026-09", progress: 5, weight: 8 },
  { task: "Sea Trial & Delivery", start: "2026-09", end: "2026-09", progress: 0, weight: 7 },
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
    wbsByProject: {},
    teamByProject: clone(seedTeamByProject),
  };
}

/* ============ CONTEXT ============ */

const STORE_KEY = "isms.store.v1";
const PREFIX: Record<string, string> = {
  projects: "PRJ",
  vessels: "V",
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
};

function loadStore(): StoreShape {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreShape;
      if (parsed && Array.isArray(parsed.projects)) return parsed;
    }
  } catch {
    /* abaikan, pakai seed */
  }
  return buildSeeds();
}

export type CollectionKey = Exclude<keyof StoreShape, "wbsByProject" | "teamByProject">;

interface StoreCtx {
  data: StoreShape;
  add: (col: CollectionKey, item: Omit<StoreItem, "id"> & { id?: string }, activity?: { action: string; target?: string; module: string }) => StoreItem;
  update: (col: CollectionKey, id: string, patch: Record<string, any>) => void;
  remove: (col: CollectionKey, id: string) => void;
  log: (action: string, target: string, module: string) => void;
  reset: () => void;
  wbsFor: (projectId: string) => WbsItem[];
  setWbs: (projectId: string, wbs: WbsItem[]) => void;
  teamFor: (projectId: string) => string[];
  setTeam: (projectId: string, ids: string[]) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

function newId(col: CollectionKey): string {
  const p = PREFIX[col] ?? "X";
  return `${p}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

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
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreShape>(() => loadStore());

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch {
      /* storage penuh — abaikan */
    }
  }, [data]);

  const api = useMemo<StoreCtx>(() => {
    const pushActivity = (prev: StoreShape, action: string, target: string, module: string): StoreItem[] => {
      const entry: StoreItem = {
        id: `A-${Date.now().toString(36).toUpperCase()}`,
        actor: "Anda",
        action,
        target,
        module,
        time: "baru saja",
        tone: ACTOR_TONE[module] ?? "navy",
      };
      return [entry, ...prev.activities].slice(0, 30);
    };

    return {
      data,
      add: (col, item, activity) => {
        const full: StoreItem = { ...item, id: item.id || newId(col) };
        setData((prev) => ({
          ...prev,
          [col]: [full, ...(prev[col] as StoreItem[])],
          activities: activity ? pushActivity(prev, activity.action, activity.target ?? full.id, activity.module) : prev.activities,
        }));
        return full;
      },
      update: (col, id, patch) => {
        setData((prev) => ({
          ...prev,
          [col]: (prev[col] as StoreItem[]).map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      },
      remove: (col, id) => {
        setData((prev) => ({
          ...prev,
          [col]: (prev[col] as StoreItem[]).filter((r) => r.id !== id),
        }));
      },
      log: (action, target, module) => {
        setData((prev) => ({ ...prev, activities: pushActivity(prev, action, target, module) }));
      },
      reset: () => {
        setData(buildSeeds());
      },
      wbsFor: (projectId) => data.wbsByProject[projectId] ?? clone(wbsTemplate),
      setWbs: (projectId, wbs) => {
        setData((prev) => ({ ...prev, wbsByProject: { ...prev.wbsByProject, [projectId]: wbs } }));
      },
      teamFor: (projectId) => data.teamByProject[projectId] ?? [],
      setTeam: (projectId, ids) => {
        setData((prev) => ({ ...prev, teamByProject: { ...prev.teamByProject, [projectId]: ids } }));
      },
    };
  }, [data]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore harus dipakai di dalam <StoreProvider>");
  return ctx;
}
