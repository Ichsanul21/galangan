/* Agregasi laporan - fungsi MURNI atas baris DB, tanpa menyentuh database.
 *
 * Kenapa file ini ada dan kenapa harus murni:
 *
 *   1. FE punya angkanya sendiri (dipakai untuk layar), server perlu angkanya
 *      sendiri (dipakai untuk PDF). Kalau aggregasinya ditulis dua kali dalam
 *      dua bahasa, keduanya akan menyimpang dalam hitungan minggu - dan
 *      laporan yang dicetak akan berbeda dari layar yang dibaca. Fungsi ini
 *      dipakai server, dan probe membandingkannya dengan hasil hitungan FE
 *      atas data yang sama.
 *   2. Murni berarti bisa diuji tanpa DB: `npm run probe:pdf` mengetes
 *      output-nya dengan baris buatan, `probe:pdf-db` mengetesnya dengan
 *      baris nyata.
 *
 * Semua fungsi menerima baris SUDAH di-load (hasil `loadMany`) dan
 * mengembalikan model JSON biasa, supaya model itu bisa disimpan sebagai
 * snapshot dan dirakit ulang.
 *
 * Konvensi nama field mengikuti modul FE (sumber kebenaran), termasuk yang
 * tidak simetris: `payables.st` bukan `.status`, tunjangan payroll berupa
 * daftar `{label, amount}`, dan nilai invoice ada dua (`amount` = bersih,
 * `grandTotal` = termasuk retensi).
 */
import { arr, num, str, type Locale } from "./documents/shared.js";

export type Row = Record<string, unknown>;

/* ==========================================================================
   Util
   ========================================================================== */

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANUH = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-10" -> "Okt 2026". */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "2026-10" -> "Oktober 2026". */
export function monthLabelLong(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${BULAN_PANUH[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Kunci bulan dari tanggal apa pun yang mungkin dipakai modul FE. */
export function monthKeyOf(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : "";
}

/** Geser "YYYY-MM" sebesar delta bulan. */
export function shiftMonth(key: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Deret kunci bulan berakhir di bulan ini. */
export function monthAxis(months: number, ref = new Date()): string[] {
  const end = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) out.push(shiftMonth(end, -i));
  return out;
}

/** Tanggal ISO -> "2 Oktober 2026". */
export function longDate(iso: unknown): string {
  const s = String(iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s === "" ? "-" : s;
  return `${Number(m[3])} ${BULAN_PANUH[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "2026-10-02" -> "20261002", untuk nomor dokumen. */
export function stamp(iso: string): string {
  return iso.replaceAll("-", "");
}

export function inRange(value: unknown, from: string, to: string): boolean {
  const s = String(value ?? "").slice(0, 10);
  return s !== "" && s >= from && s <= to;
}

/** Nilai invoice sesuai konteks: bersih (amount) atau termasuk retensi. */
export function invoiceValue(r: Row, preferGrand = false): number {
  if (preferGrand) {
    const g = Number(r.grandTotal);
    if (Number.isFinite(g) && g > 0) return g;
  }
  return Number(r.amount) || 0;
}

/** Net payroll: field `net`, atau dihitung ulang kalau belum ada. */
export function payrollNet(r: Row): number {
  const n = Number(r.net);
  if (Number.isFinite(n) && n !== 0) return n;
  return num(r, "basic") + allowanceTotal(r.allowances) + num(r, "overtimePay") - num(r, "deductions");
}

export function allowanceTotal(v: unknown): number {
  const list = arr({ a: v }, "a");
  if (list.length > 0) return list.reduce((s, r) => s + Number(r.amount ?? r.value ?? 0), 0);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Status AP: modul FE menulis `st`; `status` dibaca untuk impor/seed lama. */
export function apStatus(r: Row): string {
  return str(r, "st", "status");
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/* ==========================================================================
   Laporan keuangan bulanan (deskriptif)
   ========================================================================== */

/** Akun beban pada jurnal: 5..9 (kode akuntansi di modul FE). */
const EXPENSE_ACCOUNTS = new Set(["5", "6", "7", "8", "9"]);

export interface MonthPoint {
  key: string;
  label: string;
  /** Pendapatan (invoice) - juta rupiah, bulat. */
  revenue: number;
  /** Biaya dari jurnal akun 5..9 - juta rupiah, bulat. */
  cost: number;
  /** Margin persen dari jurnal posted. */
  margin: number;
  /** Jumlah proyek berbeda dengan invoice di bulan itu. */
  projects: number;
}

export interface Collections {
  invoices?: Row[];
  journals?: Row[];
  projects?: Row[];
  ncr?: Row[];
  incidents?: Row[];
  inspections?: Row[];
  inventory?: Row[];
  vendors?: Row[];
  equipment?: Row[];
  calibrations?: Row[];
  dockSlots?: Row[];
  changeOrders?: Row[];
  payables?: Row[];
  employees?: Row[];
  payroll?: Row[];
  purchaseOrders?: Row[];
  attendance?: Row[];
  boq?: Row[];
  workOrders?: Row[];
  maintenances?: Row[];
  bookings?: Row[];
  services?: Row[];
  spareparts?: Row[];
  activities?: Row[];
}

/** Deret pendapatan/biaya/margin per bulan. */
export function monthlyFinance(cols: Collections, months: string[]): MonthPoint[] {
  const invoices = cols.invoices ?? [];
  /* Jurnal tanpa `status` dianggap Posted - itulah default modul FE
     (`String(j.status ?? "Posted")`), dan membacanya berbeda akan membuat
     biaya bulan ini kosong untukjournals lama yang belum punya status. */
  const posted = (cols.journals ?? []).filter((j) => str(j, "status") === "Posted");
  return months.map((key) => {
    const monthInvoices = invoices.filter((i) => monthKeyOf(i.paidAt ?? i.date ?? i.due) === key);
    const monthJournals = posted.filter((j) => monthKeyOf(j.date) === key);
    const expAcc = monthJournals.filter((j) => EXPENSE_ACCOUNTS.has(String(j.db ?? ""))).reduce((s, j) => s + num(j, "amount"), 0);
    const revAcc = monthJournals.filter((j) => String(j.kr ?? "") === "4").reduce((s, j) => s + num(j, "amount"), 0);
    const projects = new Set(monthInvoices.map((i) => str(i, "project", "vessel"))).size;
    return {
      key,
      label: monthLabel(key),
      revenue: Math.round(monthInvoices.reduce((s, i) => s + invoiceValue(i, true), 0) / 1e6),
      cost: Math.round(expAcc / 1e6),
      margin: revAcc > 0 ? round1(((revAcc - expAcc) / revAcc) * 100) : 0,
      projects,
    };
  });
}

export interface PortfolioKpi {
  totalProjects: number;
  activeProjects: number;
  lateProjects: number;
  totalBudget: number;
  totalActual: number;
  avgProgress: number;
  revenueYtd: number;
  marginAvg: number;
  openNcr: number;
  criticalNcr: number;
  activeEmployees: number;
  equipmentBusy: number;
  equipmentTotal: number;
  drydockUsed: number;
  drydockTotal: number;
  lowStock: number;
  unpaidInvoices: number;
  unpaidPayables: number;
}

export function portfolioKpi(cols: Collections, series: MonthPoint[]): PortfolioKpi {
  const projects = cols.projects ?? [];
  const ncrs = cols.ncr ?? [];
  const invoices = cols.invoices ?? [];
  const aps = cols.payables ?? [];
  const equip = cols.equipment ?? [];
  const docks = cols.dockSlots ?? [];
  const margins = series.filter((p) => p.margin !== 0).map((p) => p.margin);
  return {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => str(p, "status") !== "Selesai").length,
    lateProjects: projects.filter((p) => str(p, "status") === "Terlambat").length,
    totalBudget: projects.reduce((s, p) => s + num(p, "budget"), 0),
    totalActual: projects.reduce((s, p) => s + num(p, "actual"), 0),
    avgProgress: projects.length === 0 ? 0 : Math.round(projects.reduce((s, p) => s + num(p, "progress"), 0) / projects.length),
    revenueYtd: series.reduce((s, p) => s + p.revenue, 0),
    marginAvg: margins.length === 0 ? 0 : round1(margins.reduce((s, m) => s + m, 0) / margins.length),
    openNcr: ncrs.filter((n) => str(n, "status") !== "Tertutup").length,
    criticalNcr: ncrs.filter((n) => str(n, "status") !== "Tertutup" && str(n, "severity") === "Critical").length,
    activeEmployees: (cols.employees ?? []).filter((e) => str(e, "status") === "Aktif").length,
    equipmentBusy: equip.filter((e) => ["Dipakai", "Dipinjam", "Maintenance"].includes(str(e, "status"))).length,
    equipmentTotal: equip.length,
    drydockUsed: docks.filter((d) => str(d, "status") === "Terpakai").length,
    drydockTotal: docks.length,
    lowStock: (cols.inventory ?? []).filter((i) => num(i, "stock") <= num(i, "minStock")).length,
    unpaidInvoices: invoices.filter((i) => str(i, "status") !== "Lunas").length,
    unpaidPayables: aps.filter((a) => apStatus(a) !== "Lunas").length,
  };
}

/** Pertumbuhan persen bulan terakhir dibanding sebelumnya. */
export function growthPct(series: MonthPoint[], key: "revenue" | "cost" | "margin"): number {
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (!last || !prev || prev[key] === 0) return 0;
  return round1(((last[key] - prev[key]) / Math.abs(prev[key])) * 100);
}

/* ==========================================================================
   Laporan kas mingguan / bulanan
   ========================================================================== */

export interface PeriodCash {
  from: string;
  to: string;
  /** Invoice terbit di periode (amount bersih). */
  invoiceIssued: number;
  invoiceIssuedCount: number;
  /** Invoice lunas di periode = pendapatan kas. */
  invoicePaid: number;
  invoicePaidCount: number;
  /** PO terbit = Belanja Operasional. */
  poIssued: number;
  poCount: number;
  /** AP lunas di periode. */
  apPaid: number;
  /** Payroll dibayar di periode. */
  payrollPaid: number;
  payrollCount: number;
  /** Laba = pendapatan kas - (AP lunas + payroll dibayar). */
  profit: number;
  /** PPh 21 dari payroll dibayar. */
  pph21: number;
  pph23: number;
  /** Kehadiran pada periode (tanggalattendance ada). */
  attendanceTotal: number;
  attendancePresent: number;
  attendancePct: number;
}

export function periodCash(
  cols: Collections,
  from: string,
  to: string,
): PeriodCash {
  const invoices = (cols.invoices ?? []).filter((i) => inRange(i.due ?? i.date, from, to));
  const paid = invoices.filter((i) => str(i, "status") === "Lunas" && inRange(i.paidAt ?? i.due, from, to));
  const pos = (cols.purchaseOrders ?? []).filter((p) => inRange(p.date, from, to));
  const apPaid = (cols.payables ?? []).filter((a) => apStatus(a) === "Lunas" && inRange(a.paidAt ?? a.due, from, to)).reduce((s, a) => s + num(a, "amt"), 0);
  const payrollRows = (cols.payroll ?? []).filter((p) => str(p, "status") === "Dibayar" && inRange(p.paidAt, from, to));
  const payrollPaid = payrollRows.reduce((s, p) => s + payrollNet(p), 0);
  const att = (cols.attendance ?? []).filter((a) => inRange(a.date, from, to));
  const present = att.filter((a) => str(a, "status") === "Hadir").length;
  return {
    from,
    to,
    invoiceIssued: invoices.reduce((s, i) => s + invoiceValue(i), 0),
    invoiceIssuedCount: invoices.length,
    invoicePaid: paid.reduce((s, i) => s + invoiceValue(i), 0),
    invoicePaidCount: paid.length,
    poIssued: pos.reduce((s, p) => s + num(p, "amount"), 0),
    poCount: pos.length,
    apPaid,
    payrollPaid,
    payrollCount: payrollRows.length,
    profit: paid.reduce((s, i) => s + invoiceValue(i), 0) - apPaid - payrollPaid,
    pph21: payrollRows.reduce((s, p) => s + num(p, "pph21"), 0),
    pph23: 0,
    attendanceTotal: att.length,
    attendancePresent: present,
    attendancePct: att.length === 0 ? 0 : Math.round((present / att.length) * 100),
  };
}

/* ==========================================================================
   Laporan per proyek
   ========================================================================== */

export interface ProjectReport {
  id: string;
  vessel: string;
  client: string;
  manager: string;
  type: string;
  status: string;
  start: string;
  end: string;
  budget: number;
  actual: number;
  progress: number;
  budgetPct: number;
  boqTotal: number;
  boqApproved: number;
  boqCount: number;
  invoiceTotal: number;
  invoiceUnpaid: number;
  openNcr: number;
  criticalNcr: number;
  woCount: number;
  wbsDone: number;
  wbsCount: number;
  /** Komposisiequipment yang membebankan HPP proyek. */
  equipmentRental: number;
  equipmentMaintenance: number;
  equipmentFuel: number;
  serviceCount: number;
  spareDone: number;
}

export function projectReport(cols: Collections & { wbs?: Row[] }, projectId: string): ProjectReport | null {
  const p = (cols.projects ?? []).find((x) => str(x, "id") === projectId);
  if (!p) return null;
  const boq = (cols.boq ?? []).filter((b) => str(b, "projectId", "project") === projectId);
  const boqTotal = boq.reduce((s, b) => s + (num(b, "totalPrice") || num(b, "quantity") * num(b, "unitPrice")), 0);
  const inv = (cols.invoices ?? []).filter((i) => str(i, "project") === projectId);
  const ncrs = (cols.ncr ?? []).filter((n) => str(n, "project") === projectId);
  const wbs = cols.wbs ?? [];
  const equipCost = equipmentCost(cols, projectId);
  const svc = (cols.services ?? []).filter((s) => str(s, "projectId") === projectId);
  const spare = (cols.spareparts ?? []).filter((s) => str(s, "projectId") === projectId);
  const budget = num(p, "budget");
  const actual = num(p, "actual");
  return {
    id: projectId,
    vessel: str(p, "vessel"),
    client: str(p, "client"),
    manager: str(p, "manager"),
    type: str(p, "type"),
    status: str(p, "status"),
    start: str(p, "start"),
    end: str(p, "end"),
    budget,
    actual,
    progress: num(p, "progress"),
    budgetPct: budget > 0 ? Math.round((actual / budget) * 100) : 0,
    boqTotal,
    boqApproved: boq.filter((b) => ["Approved", "Completed"].includes(str(b, "status"))).reduce((s, b) => s + (num(b, "totalPrice") || num(b, "quantity") * num(b, "unitPrice")), 0),
    boqCount: boq.length,
    invoiceTotal: inv.reduce((s, i) => s + invoiceValue(i), 0),
    invoiceUnpaid: inv.filter((i) => str(i, "status") !== "Lunas").length,
    openNcr: ncrs.filter((n) => str(n, "status") !== "Tertutup").length,
    criticalNcr: ncrs.filter((n) => str(n, "status") !== "Tertutup" && str(n, "severity") === "Critical").length,
    woCount: (cols.workOrders ?? []).filter((w) => str(w, "project") === projectId).length,
    wbsDone: wbs.filter((w) => str(w, "status") === "Selesai" || num(w, "progress") >= 100).length,
    wbsCount: wbs.length,
    equipmentRental: equipCost.rental,
    equipmentMaintenance: equipCost.maintenance,
    equipmentFuel: equipCost.fuel,
    serviceCount: svc.length,
    spareDone: spare.filter((s) => str(s, "status") === "Selesai").length,
  };
}

export interface EquipmentCost {
  rental: number;
  fuel: number;
  maintenance: number;
  total: number;
}

/**
 * Biaya equipment yang membebankan HPP proyek.
 *
 * Aturannya harus sama dengan `equipmentCostSummary` di FE
 * (utils/projectCost.ts): booking berstatus Selesai/Terpakai dihitung penuh,
 * maintenance Selesai memakai bahan + tenaga. Kalau angka ini melenceng,
 * HPP proyek yang tampil di layar dan yang tercetak di laporan berbeda.
 */
export function equipmentCost(cols: Collections, projectId: string): EquipmentCost {
  const equip = cols.equipment ?? [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const e of equip) {
    const key = str(e, "code", "name");
    byKey.set(key.toLowerCase(), e);
    byKey.set(str(e, "name").toLowerCase(), e);
    byKey.set(str(e, "code").toLowerCase(), e);
  }
  const resolve = (row: Row): Record<string, unknown> => {
    for (const k of [str(row, "equip"), str(row, "equipment"), str(row, "code"), str(row, "namaAlat")]) {
      const hit = byKey.get(k.toLowerCase());
      if (hit) return hit;
    }
    return {};
  };
  let rental = 0;
  let fuel = 0;
  for (const b of cols.bookings ?? []) {
    if (str(b, "proyek", "project") !== projectId) continue;
    if (!["Selesai", "Terpakai"].includes(str(b, "status"))) continue;
    const e = resolve(b);
    const stored = Number(b.costTotal ?? b.cost);
    const hours = num(b, "hours");
    rental += Number.isFinite(stored) && stored !== 0 ? stored : hours * num(e, "rate");
    const litres = num(b, "fuelLiters");
    fuel += litres * num(e, "fuelPrice");
  }
  let maintenance = 0;
  for (const m of cols.maintenances ?? []) {
    if (str(m, "projectId", "project") !== projectId) continue;
    if (str(m, "status") === "Dibatalkan") continue;
    if (str(m, "status") !== "Selesai") continue;
    const materials = arr(m, "materials").reduce((s, r) => s + num(r, "qty") * num(r, "cost"), 0);
    maintenance += materials + num(m, "laborCost");
  }
  return { rental, fuel, maintenance, total: rental + fuel + maintenance };
}

/* ==========================================================================
   Rekap payroll & THR
   ========================================================================== */

export interface PayrollRecap {
  period: string;
  rows: Array<{
    id: string;
    employee: string;
    basic: number;
    allowances: number;
    overtime: number;
    loan: number;
    otherDeduction: number;
    pph21: number;
    bpjsKes: number;
    bpjsTk: number;
    net: number;
    status: string;
  }>;
  totals: { basic: number; allowances: number; overtime: number; deduction: number; pph21: number; bpjs: number; net: number };
}

export function payrollRecap(cols: Collections, period: string, kind: "Gaji" | "THR" | "Bonus" = "Gaji"): PayrollRecap {
  /* `type` tidak selalu ada: baris seed lama hanya punya periode dan nominal.
     Modul Payroll memakai default "Gaji" (`String(p.type ?? "Gaji")`), jadi
     rekap harus memakai default yang sama - kalau tidak, seluruh payroll lama
     hilang dari rekap tanpa satu pun galat. */
  const empName = new Map<string, string>();
  for (const e of cols.employees ?? []) empName.set(str(e, "id"), str(e, "name"));
  const rows = (cols.payroll ?? [])
    .filter((p) => str(p, "period") === period && (str(p, "type") === kind || (str(p, "type") === "-" && kind === "Gaji")))
    .map((p) => {
      const allowances = allowanceTotal(p.allowances);
      const loan = num(p, "kasbonPot");
      return {
        id: str(p, "id"),
        employee: empName.get(str(p, "employeeId")) ?? str(p, "employeeName"),
        basic: num(p, "basic"),
        allowances,
        overtime: num(p, "overtimePay"),
        loan,
        otherDeduction: Math.max(0, num(p, "deductions") - loan),
        pph21: num(p, "pph21"),
        bpjsKes: num(p, "bpjsKesKar", "bpjsKes"),
        bpjsTk: num(p, "bpjsTkKar", "bpjsTk"),
        net: payrollNet(p),
        status: str(p, "status"),
      };
    });
  return {
    period,
    rows,
    totals: {
      basic: rows.reduce((s, r) => s + r.basic, 0),
      allowances: rows.reduce((s, r) => s + r.allowances, 0),
      overtime: rows.reduce((s, r) => s + r.overtime, 0),
      deduction: rows.reduce((s, r) => s + r.loan + r.otherDeduction, 0),
      pph21: rows.reduce((s, r) => s + r.pph21, 0),
      bpjs: rows.reduce((s, r) => s + r.bpjsKes + r.bpjsTk, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
    },
  };
}

export interface ThrRecap {
  period: string;
  rows: Array<{ id: string; employee: string; type: string; amount: number; note: string; status: string }>;
  totalThr: number;
  totalBonus: number;
  totalNet: number;
}

export function thrRecap(cols: Collections, period: string): ThrRecap {
  const empName = new Map<string, string>();
  for (const e of cols.employees ?? []) empName.set(str(e, "id"), str(e, "name"));
  const rows = (cols.payroll ?? [])
    .filter((p) => str(p, "period") === period && ["THR", "Bonus"].includes(str(p, "type")))
    .map((p) => {
      const type = str(p, "type");
      return {
        id: str(p, "id"),
        employee: empName.get(str(p, "employeeId")) ?? str(p, "employeeName"),
        type,
        amount: payrollNet(p),
        note:
          type === "THR"
            ? `Basis ${Math.round(num(p, "thrBase"))} x ${num(p, "masaBulan")}/12 bulan`
            : str(p, "bonusNote"),
        status: str(p, "status"),
      };
    });
  return {
    period,
    rows,
    totalThr: rows.filter((r) => r.type === "THR").reduce((s, r) => s + r.amount, 0),
    totalBonus: rows.filter((r) => r.type === "Bonus").reduce((s, r) => s + r.amount, 0),
    totalNet: rows.reduce((s, r) => s + r.amount, 0),
  };
}

/* ==========================================================================
   Diagnostik (dipakai laporan analitik)
   ========================================================================== */

export interface NcrBucket {
  factor: string;
  count: number;
  /** Persen dari total NCR. */
  impact: number;
  /** Akumulasi persen - kolom pareto. */
  cumulative: number;
}

export function ncrPareto(cols: Collections): NcrBucket[] {
  const ncrs = cols.ncr ?? [];
  const map = new Map<string, number>();
  for (const n of ncrs) {
    const key = str(n, "type") === "-" ? "Lainnya" : str(n, "type");
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = ncrs.length || 1;
  let run = 0;
  return Array.from(map.entries())
    .map(([factor, count]) => ({ factor, count, impact: Math.round((count / total) * 100), cumulative: 0 }))
    .sort((a, b) => b.count - a.count)
    .map((b) => {
      run += b.impact;
      return { ...b, cumulative: Math.min(100, run) };
    });
}

export interface ProfitRow {
  key: string;
  budget: number;
  actual: number;
  profit: number;
  count: number;
}

export function profitBy(cols: Collections, field: "type" | "branch"): ProfitRow[] {
  const map = new Map<string, { budget: number; actual: number; count: number }>();
  for (const p of cols.projects ?? []) {
    const key = str(p, field) === "-" ? "-" : str(p, field);
    const cur = map.get(key) ?? { budget: 0, actual: 0, count: 0 };
    cur.budget += num(p, "budget");
    cur.actual += num(p, "actual");
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, budget: v.budget, actual: v.actual, profit: v.budget - v.actual, count: v.count }))
    .sort((a, b) => b.budget - a.budget);
}

/** Estimasi biaya rework: change order negatif + 2% anggaran proyek dengan NCR. */
export function reworkCost(cols: Collections): { negativeCo: number; ncrEstimate: number; total: number } {
  const negativeCo = (cols.changeOrders ?? [])
    .filter((c) => num(c, "impact") < 0)
    .reduce((s, c) => s + Math.abs(num(c, "impact")), 0);
  const openProjects = new Set(
    (cols.ncr ?? []).filter((n) => str(n, "status") !== "Tertutup").map((n) => str(n, "project")),
  );
  const ncrEstimate = (cols.projects ?? [])
    .filter((p) => openProjects.has(str(p, "id")))
    .reduce((s, p) => s + num(p, "budget") * 0.02, 0);
  return { negativeCo, ncrEstimate, total: Math.round(negativeCo + ncrEstimate) };
}

/** Konflik jadwal drydock: dua slot tumpang tindih di dock yang sama. */
export function dockConflicts(cols: Collections): number {
  const slots = cols.dockSlots ?? [];
  let n = 0;
  for (const s of slots) {
    const from = str(s, "from");
    const to = str(s, "to");
    const dock = str(s, "dockId");
    const clash = slots.some(
      (o) => str(o, "id") !== str(s, "id") && str(o, "dockId") === dock && from < str(o, "to") && str(o, "from") < to,
    );
    if (clash) n += 1;
  }
  return n;
}

/** Vendor paling sering telat. */
export function worstVendor(cols: Collections): { name: string; onTime: number } {
  const list = (cols.vendors ?? []).filter((v) => str(v, "name") !== "-");
  if (list.length === 0) return { name: "-", onTime: 100 };
  const worst = list.reduce((a, b) => (num(b, "onTime") < num(a, "onTime") ? b : a));
  return { name: str(worst, "name"), onTime: num(worst, "onTime") };
}

/** Item paling kritis: jumlah barang di bawah minimum. */
export function lowStockItems(cols: Collections, limit = 5): Array<{ name: string; stock: number; minStock: number }> {
  return (cols.inventory ?? [])
    .filter((i) => num(i, "stock") <= num(i, "minStock"))
    .slice(0, limit)
    .map((i) => ({ name: str(i, "name"), stock: num(i, "stock"), minStock: num(i, "minStock") }));
}

/** Label locale untuk isi laporan. */
export function lt(locale: Locale, id: string, en: string): string {
  return locale === "en" ? en : id;
}