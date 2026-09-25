// Skema notifikasi per modul — SATU SUMBER untuk badge sidebar dan
// highlight di dalam modul. Badge = item pemicu yang belum dibaca
// (read-state di utils/notifRead, persist per perangkat); highlight di
// halaman berbasis KONDISI (tetap tampil walau badge sudah 0).
// Predikat di sini WAJIB sama dengan yang dipakai halaman highlight.
import type { StoreShape, StoreItem } from "../data/store";
import { computeAlerts } from "./alerts";
import { getSetting } from "./settings";

export type ModuleAlertKey =
  | "proyek" | "drydock" | "inventori" | "equipment" | "subkontraktor"
  | "qc" | "crm" | "procurement" | "keuangan" | "sdm" | "payroll"
  | "kapal" | "dokumen";

export interface ModuleAlertItem {
  /** id stabil untuk read-state (mod-<modul>-...; proyek reuse alert-<id>). */
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

export function buildModuleAlertItems(data: StoreShape): Record<ModuleAlertKey, ModuleAlertItem[]> {
  const items = data as unknown as Record<string, StoreItem[] | undefined>;
  const list = (k: string): StoreItem[] => (Array.isArray(items[k]) ? (items[k] as StoreItem[]) : []);
  const out: Record<ModuleAlertKey, ModuleAlertItem[]> = {
    proyek: [], drydock: [], inventori: [], equipment: [], subkontraktor: [],
    qc: [], crm: [], procurement: [], keuangan: [], sdm: [], payroll: [],
    kapal: [], dokumen: [],
  };

  // Proyek: reuse engine alerts yang mengarah ke /proyek* (bell ikut turun).
  // rowId = id proyek (untuk highlight baris), kecuali agregat monitoring.
  for (const al of computeAlerts(data)) {
    if (!al.to.startsWith("/proyek")) continue;
    const m = /^\/proyek\/([^/]+)$/.exec(al.to);
    out.proyek.push({ id: `alert-${al.id}`, rowId: m ? m[1] : "", label: al.text, detail: `Tujuan: ${al.to}` });
  }

  // Drydock: slot konflik (sama dengan engine #7, per slot).
  const slots = list("dockSlots");
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
    out.drydock.push({
      id: `mod-dock-${s.id}`, rowId: String(s.id),
      label: `Slot ${s.id} konflik di ${s.dockId ?? "-"}`,
      detail: `${s.vessel ?? "-"} · ${s.from}→${s.to}`,
    });
  }

  // Inventori: stok ≤ minimum (sama dengan badge lama).
  for (const i of list("inventory")) {
    if (Number(i.stock) > Number(i.minStock)) continue;
    out.inventori.push({
      id: `mod-inv-${i.id}`, rowId: String(i.id),
      label: `${i.name ?? i.id} menipis (${num(i.stock)} ${i.unit ?? ""} ≤ min ${num(i.minStock)})`,
      detail: `Gudang: ${i.warehouse ?? "-"}`,
    });
  }

  // Equipment: servis ≤ 14 hari atau status Maintenance.
  const today = todayISO();
  for (const e of list("equipment")) {
    const due = daysUntil(String(e.nextService ?? ""));
    if (String(e.status ?? "") === "Maintenance") {
      out.equipment.push({
        id: `mod-eq-${e.id}`, rowId: String(e.id),
        label: `${e.name ?? e.id} dalam maintenance`, detail: String(e.maintenanceNote ?? e.code ?? ""),
      });
    } else if (due !== null && due >= 0 && due <= 14) {
      out.equipment.push({
        id: `mod-eq-${e.id}`, rowId: String(e.id),
        label: `${e.name ?? e.id} servis H-${due}`, detail: `Jadwal: ${e.nextService}`,
      });
    }
  }

  // Subkontraktor: termin Diajukan (butuh persetujuan).
  for (const t of list("termins")) {
    if (String(t.status ?? "") !== "Diajukan") continue;
    out.subkontraktor.push({
      id: `mod-sub-${t.id}`, rowId: String(t.id),
      label: `Termin ${t.id} menunggu persetujuan (${t.sub ?? "-"})`,
      detail: `${t.milestone ?? ""} · ${num(t.amount)}`,
    });
  }

  // QC: NCR terbuka + insiden (unread-based: badge sekali, highlight kondisi).
  for (const n of list("ncr")) {
    if (String(n.status ?? "") === "Tertutup") continue;
    out.qc.push({
      id: `mod-qc-${n.id}`, rowId: String(n.id),
      label: `NCR ${n.id} terbuka (${n.severity ?? "-"})`,
      detail: String(n.issue ?? n.project ?? ""),
    });
  }
  for (const i of list("incidents")) {
    out.qc.push({
      id: `mod-qc-${i.id}`, rowId: String(i.id),
      label: `Insiden: ${i.desc ?? i.type ?? i.id}`,
      detail: `${i.date ?? ""} · ${i.location ?? ""}`,
    });
  }

  // CRM: request Baru/Disurvei (butuh tindak lanjut).
  for (const r of list("requests")) {
    if (!["Baru", "Disurvei"].includes(String(r.status ?? ""))) continue;
    out.crm.push({
      id: `mod-crm-${r.id}`, rowId: String(r.id),
      label: `Request ${r.id} ${r.status} (${r.vessel ?? "-"})`,
      detail: String(r.client ?? ""),
    });
  }

  // Procurement: requisition menunggu/RFQ + PO menunggu persetujuan.
  for (const r of list("requisitions")) {
    const st = String(r.status ?? "");
    if (!st.toLowerCase().includes("menunggu") && st.toUpperCase() !== "RFQ") continue;
    out.procurement.push({
      id: `mod-proc-${r.id}`, rowId: String(r.id),
      label: `PR ${r.id} ${st} (${r.item ?? "-"})`,
      detail: String(r.by ?? ""),
    });
  }
  for (const p of list("purchaseOrders")) {
    const st = String(p.status ?? "");
    const canon = st === "Menunggu Persetujuan" ? "Diajukan" : st;
    if (canon !== "Diajukan") continue;
    out.procurement.push({
      id: `mod-proc-${p.id}`, rowId: String(p.id),
      label: `PO ${p.id} menunggu persetujuan (${p.vendor ?? "-"})`,
      detail: String(p.item ?? ""),
    });
  }

  // Keuangan: invoice Belum Dibayar/Terlambat + hutang jatuh tempo.
  for (const i of list("invoices")) {
    if (!["Belum Dibayar", "Terlambat"].includes(String(i.status ?? ""))) continue;
    out.keuangan.push({
      id: `mod-fin-${i.id}`, rowId: String(i.id),
      label: `Invoice ${i.id} ${i.status} (${i.client ?? "-"})`,
      detail: `Jatuh tempo: ${i.due ?? "-"} · ${num(i.grandTotal || i.amount)}`,
    });
  }
  for (const a of list("payables")) {
    if (String(a.st ?? "") === "Lunas") continue;
    const due = String(a.due ?? "");
    if (!due || due >= today) continue;
    out.keuangan.push({
      id: `mod-fin-${a.id}`, rowId: String(a.id),
      label: `Hutang ${a.po ?? a.id} jatuh tempo (${a.v ?? "-"})`,
      detail: `Jatuh tempo: ${due}`,
    });
  }

  // SDM: cuti Diajukan.
  for (const l of list("leaves")) {
    if (String(l.status ?? "") !== "Diajukan") continue;
    out.sdm.push({
      id: `mod-sdm-${l.id}`, rowId: String(l.id),
      label: `Cuti ${l.employeeId ?? "-"} menunggu (${l.type ?? "-"})`,
      detail: `${l.from ?? ""}→${l.to ?? ""} · ${l.days ?? "?"} hari`,
    });
  }

  // Payroll: slip Draft.
  for (const p of list("payroll")) {
    if (String(p.status ?? "") !== "Draft") continue;
    out.payroll.push({
      id: `mod-pay-${p.id}`, rowId: String(p.id),
      label: `Payroll ${p.employeeId ?? "-"} ${p.period ?? ""} masih Draft`,
      detail: String(p.type ?? "Gaji"),
    });
  }

  // Kapal: sertifikat kritis/warning ≤ 60 hari.
  const warnDays = getSetting(data, "ALERT_CERT_60", 60);
  for (const v of list("vessels")) {
    const certs = Array.isArray(v.certificates) ? (v.certificates as { name?: unknown; expires?: unknown }[]) : [];
    for (const c of certs) {
      const d = daysUntil(String(c.expires ?? ""));
      if (d === null || d > warnDays) continue;
      out.kapal.push({
        id: `mod-vsl-${v.id}-${String(c.name ?? "cert")}`,
        rowId: String(v.id),
        label: `${v.name ?? v.id}: ${c.name ?? "sertifikat"} ${d < 0 ? `lewat ${-d} hari` : `sisa ${d} hari`}`,
        detail: `Berlaku hingga: ${c.expires ?? "-"}`,
      });
    }
  }

  // Dokumen: kedaluwarsa + perlu approval.
  for (const d of list("documents")) {
    const st = String(d.status ?? "");
    const needAppr = st === "Diajukan" || st === "Draft" || st === "Menunggu Approval";
    if (st === "Kedaluwarsa") {
      out.dokumen.push({
        id: `mod-doc-${d.id}`, rowId: String(d.id),
        label: `Dokumen ${d.id} kedaluwarsa`,
        detail: String(d.title ?? d.type ?? ""),
      });
    } else if (needAppr) {
      out.dokumen.push({
        id: `mod-doc-${d.id}`, rowId: String(d.id),
        label: `Dokumen ${d.id} perlu approval (${st})`,
        detail: String(d.title ?? d.type ?? ""),
      });
    }
  }

  return out;
}
