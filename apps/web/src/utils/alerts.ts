// Alert engine: 8 ambang docs-13, dihitung dari data store.
// Dipakai AppShell (bell) + Dashboard (strip Perlu Perhatian).

import type { StoreShape } from "../data/store";
import { getSetting } from "./settings";

export interface Alert {
  id: string;
  tone: "red" | "amber" | "blue";
  text: string;
  to: string;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

export function computeAlerts(data: StoreShape): Alert[] {
  const out: Alert[] = [];
  const budgetPct = getSetting(data, "ALERT_BUDGET_PCT", 80);
  const overPct = getSetting(data, "ALERT_OVERRUN_PCT", 10);
  const certDays = getSetting(data, "ALERT_CERT_DAYS", 90);

  // 1. Serapan anggaran & overrun
  for (const p of data.projects ?? []) {
    const pct = Number(p.budget) > 0 ? (Number(p.actual || 0) / Number(p.budget)) * 100 : 0;
    if (pct > 100 + overPct) out.push({ id: `ov-${p.id}`, tone: "red", text: `${p.vessel} over-budget ${Math.round(pct)}%`, to: `/proyek/${p.id}` });
    else if (pct > budgetPct) out.push({ id: `bd-${p.id}`, tone: "amber", text: `${p.vessel} serapan ${Math.round(pct)}%`, to: `/proyek/${p.id}` });
    if (p.status === "Terlambat") out.push({ id: `dl-${p.id}`, tone: "red", text: `${p.vessel} terlambat dari jadwal`, to: `/proyek/${p.id}` });
  }

  // 2. Stok di bawah minimum
  const low = (data.inventory ?? []).filter((i) => Number(i.stock) <= Number(i.minStock));
  if (low.length > 0) out.push({ id: "stock", tone: "amber", text: `${low.length} material di bawah minimum`, to: "/inventori" });

  // 3. Sertifikat ≤ ambang hari
  let certN = 0;
  for (const v of data.vessels ?? []) {
    for (const c of (v.certificates ?? []) as { expires?: string }[]) {
      const d = daysUntil(c.expires);
      if (d !== null && d <= certDays) certN++;
    }
  }
  if (certN > 0) out.push({ id: "cert", tone: "amber", text: `${certN} sertifikat ≤ ${certDays} hari`, to: "/kapal" });

  // 4. Invoice overdue 7/14/30 hari
  const overdue = (data.invoices ?? []).filter((i) => {
    if (i.status === "Lunas" || i.status === "Draft" || !i.due || i.due === "-") return false;
    const d = daysUntil(String(i.due));
    return d !== null && d < 0;
  });
  for (const i of overdue.slice(0, 5)) {
    const age = -(daysUntil(String(i.due)) ?? 0);
    const bucket = age >= 30 ? "30+" : age >= 14 ? "14" : "7";
    out.push({ id: `inv-${i.id}`, tone: age >= 30 ? "red" : "amber", text: `${i.id} overdue ${bucket} hari`, to: "/keuangan" });
  }

  // 5. Insiden terbaru (7 hari)
  const recent = (data.incidents ?? []).filter((i) => {
    const d = daysUntil(String(i.date));
    return d !== null && d >= -7 && d <= 0;
  });
  if (recent.length > 0) out.push({ id: "inc", tone: "red", text: `${recent.length} insiden 7 hari terakhir`, to: "/qc-safety" });

  // 6. NCR critical terbuka
  const crit = (data.ncr ?? []).filter((n) => n.severity === "Critical" && n.status !== "Tertutup").length;
  if (crit > 0) out.push({ id: "ncr", tone: "red", text: `${crit} NCR critical terbuka`, to: "/qc-safety" });

  // 7. Slot dock konflik
  const slots = data.dockSlots ?? [];
  const conflict = slots.filter((s) => slots.some((o) => o.dockId === s.dockId && o.id !== s.id && Number(s.from) < Number(o.to) && Number(o.from) < Number(s.to))).length;
  if (conflict > 0) out.push({ id: "dock", tone: "red", text: `${conflict} slot docking konflik`, to: "/drydock" });

  // 8. Cuti menunggu + servis ≤ 14 hari
  const leaveN = (data.leaves ?? []).filter((l) => l.status === "Diajukan").length;
  if (leaveN > 0) out.push({ id: "cuti", tone: "blue", text: `${leaveN} pengajuan cuti menunggu`, to: "/sdm" });

  return out;
}
