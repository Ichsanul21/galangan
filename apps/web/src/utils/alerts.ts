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

function wbsDaysUntil(end: string | null | undefined): number | null {
  if (!end || end === "-") return null;
  const s = String(end);
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  let t: number;
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    // YYYY-MM (tanpa tanggal) = akhir bulan, konsisten dengan Dashboard/Monitoring.
    t = m[3]
      ? new Date(y, mo - 1, Number(m[3])).getTime()
      : new Date(y, mo, 0).getTime();
  } else {
    t = new Date(`${s}T00:00:00`).getTime();
  }
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
  const cert60 = getSetting(data, "ALERT_CERT_60", 60);
  const cert30 = getSetting(data, "ALERT_CERT_30", 30);
  const msDays = getSetting(data, "ALERT_MILESTONE_DAYS", 7);
  const cpDays = getSetting(data, "ALERT_CP_DAYS", 3);

  // 1. Serapan anggaran & overrun
  for (const p of data.projects ?? []) {
    const pct = Number(p.budget) > 0 ? (Number(p.actual || 0) / Number(p.budget)) * 100 : 0;
    if (pct > 100 + overPct) out.push({ id: `ov-${p.id}`, tone: "red", text: `${p.vessel} lewat anggaran ${Math.round(pct)}%`, to: `/proyek/${p.id}` });
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
    out.push({ id: `inv-${i.id}`, tone: age >= 30 ? "red" : "amber", text: `${i.id} terlambat ${bucket} hari`, to: "/keuangan" });
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

  // 9. Milestone H-7 — task WBS progress==0 yang berakhir dalam msDays hari.
  // Aproksimasi milestone: task belum mulai. YYYY-MM dihitung akhir bulan.
  const msTasks: { pid: string; vessel: string; task: string; d: number }[] = [];
  for (const p of data.projects ?? []) {
    const wbs = data.wbsByProject?.[String(p.id)] ?? [];
    for (const w of wbs) {
      if (Number(w.progress ?? 0) !== 0) continue;
      const d = wbsDaysUntil(w.end);
      if (d !== null && d >= 0 && d <= msDays) msTasks.push({ pid: String(p.id), vessel: String(p.vessel ?? p.id), task: String(w.task), d });
    }
  }
  for (const t of msTasks.slice(0, 5)) {
    out.push({ id: `ms-${t.pid}-${t.task}`, tone: "amber", text: `${t.vessel} · ${t.task} H-${t.d}`, to: `/proyek/${t.pid}` });
  }
  if (msTasks.length > 5) out.push({ id: "ms-more", tone: "amber", text: `${msTasks.length - 5} milestone lain ≤ ${msDays} hari`, to: "/proyek/monitoring" });

  // 10. Sertifikat tiers 90/60/30 — tiga bucket terpisah (di samping alert `cert` lama).
  // kritis ≤30 (termasuk kedaluwarsa d<0) → red; warning (30,60] → amber; info (60,90] → blue.
  let certCrit = 0;
  let certWarn = 0;
  let certInfo = 0;
  for (const v of data.vessels ?? []) {
    for (const c of (v.certificates ?? []) as { expires?: string }[]) {
      const raw = String(c.expires ?? "");
      // Sertifikat memakai YYYY-MM: hitung akhir bulan agar konsisten dengan Dashboard.
      const d = /^\d{4}-\d{2}$/.test(raw) ? wbsDaysUntil(raw) : daysUntil(raw);
      if (d === null || d > certDays) continue;
      if (d <= cert30) certCrit++;
      else if (d <= cert60) certWarn++;
      else certInfo++;
    }
  }
  if (certCrit > 0) out.push({ id: "cert-crit", tone: "red", text: `${certCrit} sertifikat kedaluwarsa/kritis ≤ ${cert30} hari`, to: "/kapal" });
  if (certWarn > 0) out.push({ id: "cert-warn", tone: "amber", text: `${certWarn} sertifikat warning ≤ ${cert60} hari`, to: "/kapal" });
  if (certInfo > 0) out.push({ id: "cert-info", tone: "blue", text: `${certInfo} sertifikat info ≤ ${certDays} hari`, to: "/kapal" });

  // 11. Critical-path delay > cpDays — aproksimasi: task progress==0 yang
  // sudah lewat end-nya lebih dari cpDays (tanpa graf predecessor eksplisit di WBS).
  for (const p of data.projects ?? []) {
    const wbs = data.wbsByProject?.[String(p.id)] ?? [];
    let worst = 0;
    let worstTask = "";
    for (const w of wbs) {
      if (Number(w.progress ?? 0) !== 0) continue;
      const d = wbsDaysUntil(w.end);
      if (d !== null && d < 0 && -d > cpDays && -d > worst) {
        worst = -d;
        worstTask = String(w.task);
      }
    }
    if (worst > cpDays) out.push({ id: `cp-${p.id}`, tone: "red", text: `${p.vessel} jalur kritis tertunda ${worst} hari (${worstTask})`, to: `/proyek/${p.id}` });
  }

  return out;
}
