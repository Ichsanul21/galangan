// Skema notifikasi per modul — SATU SUMBER untuk banner + highlight.
// Badge sidebar DIHAPUS (per 2026-09-26): yang stay hanya banner + highlight
// per halaman modul, murni ikut KONDISI data (tanpa read-state).
// Builder per modul agar hook halaman hanya hitung 1 modul (murah) —
// buildModuleAlertItems (semua) dipertahankan untuk kompatibilitas.
import type { StoreShape, StoreItem } from "../data/store";
import { computeAlerts } from "./alerts";
import { getSetting } from "./settings";

export type ModuleAlertKey =
  | "proyek" | "drydock" | "inventori" | "equipment" | "subkontraktor"
  | "qc" | "crm" | "procurement" | "keuangan" | "sdm" | "payroll"
  | "kapal" | "dokumen";

export interface ModuleAlertItem {
  /** id stabil per baris kondisi (dipakai highlight + key React). */
  id: string;
  /** id baris di koleksi (untuk highlight). */
  rowId: string;
  label: string;
  detail: string;
}

export const MODULE_ALERT_TO: Record<ModuleAlertKey, string> = {
  proyek: "/proyek",
  drydock: "/drydock",
  inventori: "/inventori",
  equipment: "/equipment",
  subkontraktor: "/subkontraktor",
  qc: "/qc-safety",
  crm: "/crm",
  procurement: "/procurement",
  keuangan: "/keuangan",
  sdm: "/sdm",
  payroll: "/payroll",
  kapal: "/kapal",
  dokumen: "/dokumen",
};

const num = (v: unknown): number => Number(v) || 0;

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Ctx = {
  data: StoreShape;
  list: (k: string) => StoreItem[];
  today: string;
};

function buildProyek(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  // Reuse engine alerts yang mengarah ke /proyek* (bell ikut turun).
  // rowId = id proyek (untuk highlight baris), kecuali agregat monitoring.
  for (const al of computeAlerts(ctx.data)) {
    if (!al.to.startsWith("/proyek")) continue;
    const m = /^\/proyek\/([^/]+)$/.exec(al.to);
    out.push({ id: `alert-${al.id}`, rowId: m ? m[1] : "", label: al.text, detail: `Tujuan: ${al.to}` });
  }
  return out;
}

function buildDrydock(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  // Slot konflik (sama dengan engine #7, per slot).
  const slots = ctx.list("dockSlots");
  const conflicted = new Set<string>();
  for (const s of slots) {
    const clash = slots.some(
      (o) => String(o.id) !== String(s.id) && String(o.dockId) === String(s.dockId) &&
        Number(s.from) < Number(o.to) && Number(o.from) < Number(s.to),
    );
    if (clash) conflicted.add(String(s.id));
  }
  for (const s of slots) {
    if (!conflicted.has(String(s.id))) continue;
    out.push({
      id: `mod-dock-${s.id}`, rowId: String(s.id),
      label: `Slot ${s.id} konflik di ${s.dockId ?? "-"}`,
      detail: `${s.vessel ?? "-"} · ${s.from}→${s.to}`,
    });
  }
  return out;
}

function buildInventori(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const i of ctx.list("inventory")) {
    if (Number(i.stock) > Number(i.minStock)) continue;
    out.push({
      id: `mod-inv-${i.id}`, rowId: String(i.id),
      label: `${i.name ?? i.id} menipis (${num(i.stock)} ${i.unit ?? ""} ≤ min ${num(i.minStock)})`,
      detail: `Gudang: ${i.warehouse ?? "-"}`,
    });
  }
  return out;
}

function buildEquipment(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const e of ctx.list("equipment")) {
    const due = daysUntil(String(e.nextService ?? ""));
    if (String(e.status ?? "") === "Maintenance") {
      out.push({
        id: `mod-eq-${e.id}`, rowId: String(e.id),
        label: `${e.name ?? e.id} dalam maintenance`, detail: String(e.maintenanceNote ?? e.code ?? ""),
      });
    } else if (due !== null && due >= 0 && due <= 14) {
      out.push({
        id: `mod-eq-${e.id}`, rowId: String(e.id),
        label: `${e.name ?? e.id} servis H-${due}`, detail: `Jadwal: ${e.nextService}`,
      });
    }
  }
  return out;
}

function buildSubkontraktor(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const t of ctx.list("termins")) {
    if (String(t.status ?? "") !== "Diajukan") continue;
    out.push({
      id: `mod-sub-${t.id}`, rowId: String(t.id),
      label: `Termin ${t.id} menunggu persetujuan (${t.sub ?? "-"})`,
      detail: `${t.milestone ?? ""} · ${num(t.amount)}`,
    });
  }
  return out;
}

function buildQc(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const n of ctx.list("ncr")) {
    if (String(n.status ?? "") === "Tertutup") continue;
    out.push({
      id: `mod-qc-${n.id}`, rowId: String(n.id),
      label: `NCR ${n.id} terbuka (${n.severity ?? "-"})`,
      detail: String(n.issue ?? n.project ?? ""),
    });
  }
  for (const i of ctx.list("incidents")) {
    out.push({
      id: `mod-qc-${i.id}`, rowId: String(i.id),
      label: `Insiden: ${i.desc ?? i.type ?? i.id}`,
      detail: `${i.date ?? ""} · ${i.location ?? ""}`,
    });
  }
  return out;
}

function buildCrm(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const r of ctx.list("requests")) {
    if (!["Baru", "Disurvei"].includes(String(r.status ?? ""))) continue;
    out.push({
      id: `mod-crm-${r.id}`, rowId: String(r.id),
      label: `Request ${r.id} ${r.status} (${r.vessel ?? "-"})`,
      detail: String(r.client ?? ""),
    });
  }
  return out;
}

function buildProcurement(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const r of ctx.list("requisitions")) {
    const st = String(r.status ?? "");
    if (!st.toLowerCase().includes("menunggu") && st.toUpperCase() !== "RFQ") continue;
    out.push({
      id: `mod-proc-${r.id}`, rowId: String(r.id),
      label: `PR ${r.id} ${st} (${r.item ?? "-"})`,
      detail: String(r.by ?? ""),
    });
  }
  for (const p of ctx.list("purchaseOrders")) {
    const st = String(p.status ?? "");
    const canon = st === "Menunggu Persetujuan" ? "Diajukan" : st;
    if (canon !== "Diajukan") continue;
    out.push({
      id: `mod-proc-${p.id}`, rowId: String(p.id),
      label: `PO ${p.id} menunggu persetujuan (${p.vendor ?? "-"})`,
      detail: String(p.item ?? ""),
    });
  }
  return out;
}

function buildKeuangan(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const i of ctx.list("invoices")) {
    if (!["Belum Dibayar", "Terlambat"].includes(String(i.status ?? ""))) continue;
    out.push({
      id: `mod-fin-${i.id}`, rowId: String(i.id),
      label: `Invoice ${i.id} ${i.status} (${i.client ?? "-"})`,
      detail: `Jatuh tempo: ${i.due ?? "-"} · ${num(i.grandTotal || i.amount)}`,
    });
  }
  for (const a of ctx.list("payables")) {
    if (String(a.st ?? "") === "Lunas") continue;
    const due = String(a.due ?? "");
    if (!due || due >= ctx.today) continue;
    out.push({
      id: `mod-fin-${a.id}`, rowId: String(a.id),
      label: `Hutang ${a.po ?? a.id} jatuh tempo (${a.v ?? "-"})`,
      detail: `Jatuh tempo: ${due}`,
    });
  }
  return out;
}

function buildSdm(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const l of ctx.list("leaves")) {
    if (String(l.status ?? "") !== "Diajukan") continue;
    out.push({
      id: `mod-sdm-${l.id}`, rowId: String(l.id),
      label: `Cuti ${l.employeeId ?? "-"} menunggu (${l.type ?? "-"})`,
      detail: `${l.from ?? ""}→${l.to ?? ""} · ${l.days ?? "?"} hari`,
    });
  }
  return out;
}

function buildPayroll(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const p of ctx.list("payroll")) {
    if (String(p.status ?? "") !== "Draft") continue;
    out.push({
      id: `mod-pay-${p.id}`, rowId: String(p.id),
      label: `Payroll ${p.employeeId ?? "-"} ${p.period ?? ""} masih Draft`,
      detail: String(p.type ?? "Gaji"),
    });
  }
  return out;
}

function buildKapal(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  // Sertifikat kritis/warning ≤ 60 hari.
  const warnDays = getSetting(ctx.data, "ALERT_CERT_60", 60);
  for (const v of ctx.list("vessels")) {
    const certs = Array.isArray(v.certificates) ? (v.certificates as { name?: unknown; expires?: unknown }[]) : [];
    for (const c of certs) {
      const d = daysUntil(String(c.expires ?? ""));
      if (d === null || d > warnDays) continue;
      out.push({
        id: `mod-vsl-${v.id}-${String(c.name ?? "cert")}`,
        rowId: String(v.id),
        label: `${v.name ?? v.id}: ${c.name ?? "sertifikat"} ${d < 0 ? `lewat ${-d} hari` : `sisa ${d} hari`}`,
        detail: `Berlaku hingga: ${c.expires ?? "-"}`,
      });
    }
  }
  return out;
}

function buildDokumen(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const d of ctx.list("documents")) {
    const st = String(d.status ?? "");
    const needAppr = st === "Diajukan" || st === "Draft" || st === "Menunggu Approval";
    if (st === "Kedaluwarsa") {
      out.push({
        id: `mod-doc-${d.id}`, rowId: String(d.id),
        label: `Dokumen ${d.id} kedaluwarsa`,
        detail: String(d.title ?? d.type ?? ""),
      });
    } else if (needAppr) {
      out.push({
        id: `mod-doc-${d.id}`, rowId: String(d.id),
        label: `Dokumen ${d.id} perlu approval (${st})`,
        detail: String(d.title ?? d.type ?? ""),
      });
    }
  }
  return out;
}

const BUILDERS: Record<ModuleAlertKey, (ctx: Ctx) => ModuleAlertItem[]> = {
  proyek: buildProyek,
  drydock: buildDrydock,
  inventori: buildInventori,
  equipment: buildEquipment,
  subkontraktor: buildSubkontraktor,
  qc: buildQc,
  crm: buildCrm,
  procurement: buildProcurement,
  keuangan: buildKeuangan,
  sdm: buildSdm,
  payroll: buildPayroll,
  kapal: buildKapal,
  dokumen: buildDokumen,
};

function makeCtx(data: StoreShape): Ctx {
  const items = data as unknown as Record<string, StoreItem[] | undefined>;
  return {
    data,
    list: (k: string): StoreItem[] => (Array.isArray(items[k]) ? (items[k] as StoreItem[]) : []),
    today: todayISO(),
  };
}

/** Hitung 1 modul saja (murah) — dipakai hook halaman. */
export function buildModuleAlertItemsFor(data: StoreShape, key: ModuleAlertKey): ModuleAlertItem[] {
  return BUILDERS[key](makeCtx(data));
}

export function buildModuleAlertItems(data: StoreShape): Record<ModuleAlertKey, ModuleAlertItem[]> {
  const ctx = makeCtx(data);
  return {
    proyek: buildProyek(ctx),
    drydock: buildDrydock(ctx),
    inventori: buildInventori(ctx),
    equipment: buildEquipment(ctx),
    subkontraktor: buildSubkontraktor(ctx),
    qc: buildQc(ctx),
    crm: buildCrm(ctx),
    procurement: buildProcurement(ctx),
    keuangan: buildKeuangan(ctx),
    sdm: buildSdm(ctx),
    payroll: buildPayroll(ctx),
    kapal: buildKapal(ctx),
    dokumen: buildDokumen(ctx),
  };
}
