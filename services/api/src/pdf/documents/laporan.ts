/* Laporan periodik dan analitik - dirakit dari agregasi server.
 *
 * Berbeda dengan dokumen resmi, laporan TIDAK punya satu baris DB sebagai
 * sumber tunggal: isinya dirakit dari belasan koleksi (invoice, jurnal,
 * proyek, AP, payroll, NCR, dan lain-lain) untuk satu periode. Karena itu
 * modelnya lebih besar dan isinya hidup - snapshot tetap disimpan supaya
 * cetakan yang diarsipkan bisa direproduksi, tapi nilainya bukan angka
 * permanen seperti kwitansi.
 *
 * Yang dipakai di sini:
 *   - `reports.ts` untuk semua hitungan (satu-satunya tempat angka dihitung)
 *   - blok & chart vektor yang sama dengan dokumen resmi
 */
import { Document, type DocOptions } from "../document.js";
import { callout, chartBlock, divider, keyValue, metricGrid, paragraph, sectionBlock, signatures, spacer, table } from "../blocks.js";
import { COLOR, TYPE } from "../theme.js";
import { companyKop, docTitle, longDate, money, rupiah, L, type Locale } from "./shared.js";
import {
  monthLabelLong,
  monthLabel,
  lt,
  type Collections,
  type MonthPoint,
  type NcrBucket,
  type PayrollRecap,
  type PeriodCash,
  type PortfolioKpi,
  type ProjectReport,
  type ProfitRow,
  type ThrRecap,
} from "../reports.js";

/* ==========================================================================
   Model
   ========================================================================== */

export interface Finding {
  kind: "NCR" | "Insiden" | "K3";
  id: string;
  status: string;
  date: string;
  text: string;
  severity: string;
}

export interface CashReportModel {
  mode: "Mingguan" | "Bulanan";
  periodLabel: string;
  from: string;
  to: string;
  cash: PeriodCash;
  prev: PeriodCash | null;
  kpi: Array<{ label: string; value: string; hint: string }>;
  compare: Array<{ label: string; value: string }>;
  projects: Array<{ id: string; vessel: string; progress: number; status: string }>;
  findings: Finding[];
  composition: Array<{ label: string; value: number }>;
  signature: { name: string; role: string; date: string };
  locale: Locale;
}

export interface ProjectReportModel {
  report: ProjectReport;
  wbs: Array<{ task: string; progress: number; status: string }>;
  boq: Array<{ name: string; qty: string; total: number; status: string }>;
  invoices: Array<{ id: string; amount: number; status: string; due: string }>;
  workOrders: Array<{ id: string; sub: string; progress: number }>;
  findings: Finding[];
  activity: Array<{ actor: string; action: string; target: string; date: string }>;
  locale: Locale;
}

export interface AnalyticModel {
  scope: "Dashboard" | "Analytics";
  periodLabel: string;
  series: MonthPoint[];
  kpi: PortfolioKpi;
  growth: { revenue: number; margin: number };
  ncrPareto: NcrBucket[];
  profitByType: ProfitRow[];
  profitByBranch: ProfitRow[];
  rework: { negativeCo: number; ncrEstimate: number; total: number };
  risk: {
    dockConflicts: number;
    lowStock: Array<{ name: string; stock: number; minStock: number }>;
    atRiskProjects: Array<{ id: string; vessel: string; status: string }>;
    openNcr: number;
    maintenancePending: number;
    calibrationPending: number;
    worstVendor: { name: string; onTime: number };
  };
  projectStatus: Array<{ label: string; value: number }>;
  locale: Locale;
}

export interface PayrollReportModel {
  mode: "Rekap" | "THR";
  period: string;
  recap: PayrollRecap;
  thr: ThrRecap;
  locale: Locale;
}

/* ==========================================================================
   Pembantu
   ========================================================================== */

/** Angka ringkas untuk KPI: enak dibaca, bukan "1234567". */
function short(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1e6) return `${Math.round(v / 1e6).toLocaleString("id-ID")} jt`;
  return money(v);
}

function pct(v: number): string {
  return `${Number.isFinite(v) ? v.toFixed(1) : "0"}%`;
}

function reportHeader(d: Document, title: string, subtitle: string, locale: Locale): void {
  d.add(companyKop());
  d.add(docTitle({ title, ref: subtitle }));
}

function signOff(d: Document, sig: { name: string; role: string; date: string }, locale: Locale): void {
  d.add(divider());
  d.add(
    paragraph({
      text: lt(locale, "Mengetahui,", "Approved by,"),
      size: TYPE.base,
    }),
  );
  d.add(spacer(6));
  d.add(signatures([{ role: sig.role || lt(locale, "Penanggung Jawab", "Responsible"), name: sig.name || "-", rows: 4 }]));
  d.add(
    paragraph({
      text: `${sig.name || "-"}\n${sig.role || "-"}\n${sig.date ? longDate(sig.date) : ""}`,
      size: TYPE.base - 1,
      align: "right",
    }),
  );
}

/* ==========================================================================
   Laporan kas mingguan / bulanan
   ========================================================================== */

export function cashReport(input: CashReportModel, opts: DocOptions = {}): Document {
  const locale = input.locale;
  const d = new Document({
    title: `Laporan ${input.mode} ${input.periodLabel}`,
    subject: `Laporan ${input.mode.toLowerCase()} - ${input.periodLabel}`,
    orientation: "portrait",
    ...opts,
  });

  reportHeader(
    d,
    lt(locale, `LAPORAN ${input.mode.toUpperCase()}`, `${input.mode.toUpperCase()} REPORT`),
    `${input.periodLabel} · ${longDate(input.from)} - ${longDate(input.to)}`,
    locale,
  );

  d.add(metricGrid(input.kpi.map((k) => ({ label: k.label, value: k.value })), { cols: 4 }));
  if (input.kpi.some((k) => k.hint !== "")) {
    d.add(
      paragraph({
        text: input.kpi.filter((k) => k.hint !== "").map((k) => `${k.label}: ${k.hint}`).join("  ·  "),
        size: TYPE.base - 2,
        color: COLOR.steel,
      }),
    );
  }

  if (input.compare.length > 0) {
    d.add(sectionBlock(lt(locale, "Perbandingan periode lalu", "Versus previous period")));
    d.add(keyValue({ labelW: 55, pairs: input.compare }));
  }

  d.add(sectionBlock(lt(locale, "Ringkasan kas", "Cash summary")));
  d.add(
    keyValue({
      labelW: 55,
      pairs: [
        { label: lt(locale, "Invoice terbit", "Invoices issued"), value: `${rupiah(input.cash.invoiceIssued)} (${input.cash.invoiceIssuedCount})`, bold: true },
        { label: lt(locale, "Invoice lunas", "Invoices paid"), value: `${rupiah(input.cash.invoicePaid)} (${input.cash.invoicePaidCount})`, bold: true },
        { label: lt(locale, "PO terbit", "PO issued"), value: `${rupiah(input.cash.poIssued)} (${input.cash.poCount})` },
        { label: lt(locale, "AP lunas", "Payables paid"), value: rupiah(input.cash.apPaid) },
        { label: lt(locale, "Payroll dibayar", "Payroll paid"), value: `${rupiah(input.cash.payrollPaid)} (${input.cash.payrollCount})` },
        { label: lt(locale, "Laba periode", "Period profit"), value: rupiah(input.cash.profit), bold: true },
        { label: lt(locale, "PPh 21", "Income tax (PPh 21)"), value: rupiah(input.cash.pph21) },
        { label: lt(locale, "Kehadiran", "Attendance"), value: `${pct(input.cash.attendancePct)} (${input.cash.attendancePresent}/${input.cash.attendanceTotal})` },
      ],
    }),
  );
  d.add(
    paragraph({
      text: lt(
        locale,
        "Catatan: laba dihitung dari kas masuk (invoice lunas) dikurangi AP lunas dan payroll yang sudah dibayar.",
        "Note: profit is cash received (settled invoices) minus settled payables and paid payroll.",
      ),
      size: TYPE.base - 2,
      color: COLOR.steel,
    }),
  );

  if (input.composition.length > 0) {
    d.add(
      chartBlock({
        title: lt(locale, "Komposisi dokumen", "Document composition"),
        slices: input.composition,
        showValues: true,
      }),
    );
  }

  if (input.projects.length > 0) {
    d.add(sectionBlock(lt(locale, "Proyek berjalan", "Active projects"), `${input.projects.length} proyek`));
    d.add(
      table({
        head: [lt(locale, "ID", "ID"), lt(locale, "Kapal", "Vessel"), lt(locale, "Progres %", "Progress %"), lt(locale, "Status", "Status")],
        widths: [26, "auto", 22, 26],
        align: ["left", "left", "right", "left"],
        rows: input.projects.map((p) => [p.id, p.vessel, `${p.progress}%`, p.status]),
      }),
    );
  }

  if (input.findings.length > 0) {
    d.add(sectionBlock(lt(locale, "Temuan mutu & K3", "Quality & HSE findings"), `${input.findings.length} temuan`));
    d.add(
      table({
        head: [lt(locale, "Jenis", "Type"), lt(locale, "ID", "ID"), lt(locale, "Uraian", "Description"), lt(locale, "Status", "Status"), lt(locale, "Tanggal", "Date")],
        widths: [18, 24, "auto", 24, 22],
        align: ["left", "left", "left", "left", "left"],
        rows: input.findings.map((f) => [f.kind, f.id, f.text, f.status, longDate(f.date)]),
      }),
    );
  }

  signOff(d, input.signature, locale);
  return d;
}

/* ==========================================================================
   Laporan per proyek
   ========================================================================== */

export function projectReport(input: ProjectReportModel, opts: DocOptions = {}): Document {
  const locale = input.locale;
  const r = input.report;
  const d = new Document({
    title: `Report Summary ${r.id}`,
    subject: `Laporan proyek ${r.vessel}`,
    orientation: "portrait",
    ...opts,
  });

  reportHeader(d, lt(locale, "RINGKASAN LAPORAN PROYEK", "PROJECT REPORT SUMMARY"), `${r.id} · ${r.vessel} · ${r.client}`, locale);

  d.add(
    keyValue({
      labelW: 34,
      pairs: [
        { label: lt(locale, "Client", "Client"), value: r.client, bold: true },
        { label: lt(locale, "Project Manager", "Project manager"), value: r.manager },
        { label: lt(locale, "Jenis", "Type"), value: r.type },
        { label: lt(locale, "Periode", "Period"), value: `${longDate(r.start)} - ${longDate(r.end)}` },
        { label: lt(locale, "Status", "Status"), value: r.status, bold: true },
      ],
    }),
  );

  d.add(
    metricGrid([
      { label: lt(locale, "Anggaran", "Budget"), value: rupiah(r.budget) },
      { label: lt(locale, "Realisasi", "Realized"), value: rupiah(r.actual) },
      { label: lt(locale, "% Terpakai", "% Used"), value: pct(r.budgetPct) },
      { label: lt(locale, "Progres", "Progress"), value: pct(r.progress) },
    ], { cols: 4 }),
  );

  d.add(
    keyValue({
      labelW: 34,
      pairs: [
        { label: lt(locale, "Total BoQ", "BoQ total"), value: `${rupiah(r.boqTotal)} (${r.boqCount} item)`, bold: true },
        { label: lt(locale, "BoQ approved/completed", "BoQ approved/completed"), value: rupiah(r.boqApproved) },
        { label: lt(locale, "Invoice", "Invoices"), value: `${rupiah(r.invoiceTotal)} (${r.invoiceUnpaid} belum lunas)` },
        { label: lt(locale, "NCR terbuka", "Open NCR"), value: `${r.openNcr} (${r.criticalNcr} critical)`, bold: true },
        { label: lt(locale, "WBS selesai", "WBS done"), value: `${r.wbsDone}/${r.wbsCount}` },
        { label: lt(locale, "Work order", "Work orders"), value: `${r.woCount}` },
        { label: lt(locale, "Biaya equipment", "Equipment cost"), value: `${rupiah(r.equipmentRental + r.equipmentMaintenance + r.equipmentFuel)}` },
        { label: lt(locale, "Service / sparepart", "Service / sparepart"), value: `${r.serviceCount} / ${r.spareDone} selesai` },
      ],
    }),
  );

  if (input.wbs.length > 0) {
    d.add(sectionBlock(lt(locale, "Progres WBS", "WBS progress"), `${r.wbsDone}/${r.wbsCount} selesai`));
    d.add(
      chartBlock({
        title: lt(locale, "Progres WBS", "WBS progress"),
        kind: "bar",
        categories: input.wbs.map((w) => w.task),
        series: [{ key: "progress", label: lt(locale, "Progres %", "Progress %") }],
        values: { progress: input.wbs.map((w) => w.progress) },
        format: (v) => `${Math.round(v)}%`,
      }),
    );
  }

  if (input.boq.length > 0) {
    d.add(sectionBlock(lt(locale, "BoQ", "Bill of quantities"), `${r.boqCount} item`));
    /* Baris total adalah baris biasa yang diberi indeks `totalRow` - mesin
       tabel menebalkannya. Menulisnya sebagai baris terpisah (bukan opsi
       `totalRow: [...]`) karena `totalRow` berisi indeks, bukan isi. */
    const rows = [
      ...input.boq.map((b) => [b.name, b.qty, rupiah(b.total), b.status]),
      [`${lt(locale, "TOTAL", "TOTAL")} (${r.boqCount})`, "", rupiah(r.boqTotal), ""],
    ];
    d.add(
      table({
        head: [lt(locale, "Item", "Item"), lt(locale, "Qty", "Qty"), lt(locale, "Total", "Total"), lt(locale, "Status", "Status")],
        widths: ["auto", 26, 30, 24],
        align: ["left", "right", "right", "left"],
        rows,
        totalRow: rows.length - 1,
      }),
    );
  }

  if (input.invoices.length > 0) {
    d.add(sectionBlock(lt(locale, "Invoice", "Invoices"), `${r.invoiceUnpaid} belum lunas`));
    const rows = [
      ...input.invoices.map((i) => [i.id, rupiah(i.amount), i.status, longDate(i.due)]),
      [lt(locale, "TOTAL", "TOTAL"), rupiah(r.invoiceTotal), "", ""],
    ];
    d.add(
      table({
        head: [lt(locale, "ID", "ID"), lt(locale, "Nilai", "Amount"), lt(locale, "Status", "Status"), lt(locale, "Jatuh tempo", "Due")],
        widths: [26, "auto", 26, 26],
        align: ["left", "right", "left", "left"],
        rows,
        totalRow: rows.length - 1,
      }),
    );
  }

  if (input.findings.length > 0) {
    d.add(sectionBlock(lt(locale, "NCR & insiden", "NCR & incidents"), `${input.findings.length} temuan`));
    d.add(
      table({
        head: [lt(locale, "Jenis", "Type"), lt(locale, "ID", "ID"), lt(locale, "Uraian", "Description"), lt(locale, "Status", "Status"), lt(locale, "Tanggal", "Date")],
        widths: [18, 24, "auto", 24, 22],
        align: ["left", "left", "left", "left", "left"],
        rows: input.findings.map((f) => [f.kind, f.id, f.text, f.status, longDate(f.date)]),
      }),
    );
  }

  if (input.workOrders.length > 0) {
    d.add(sectionBlock(lt(locale, "Work order subkontraktor", "Subcontractor work orders"), `${input.workOrders.length} WO`));
    d.add(
      table({
        head: [lt(locale, "ID", "ID"), lt(locale, "Subkontraktor", "Subcontractor"), lt(locale, "Progres %", "Progress %")],
        widths: [26, "auto", 24],
        align: ["left", "left", "right"],
        rows: input.workOrders.map((w) => [w.id, w.sub, `${w.progress}%`]),
      }),
    );
  }

  if (input.activity.length > 0) {
    d.add(sectionBlock(lt(locale, "Aktivitas terakhir", "Recent activity")));
    d.add(
      table({
        head: [lt(locale, "Pelaku", "Actor"), lt(locale, "Aktivitas", "Activity"), lt(locale, "Tanggal", "Date")],
        widths: [30, "auto", 24],
        align: ["left", "left", "left"],
        rows: input.activity.map((a) => [a.actor, `${a.action} ${a.target}`, longDate(a.date)]),
      }),
    );
  }

  return d;
}

/* ==========================================================================
   Laporan analitik / dashboard
   ========================================================================== */

export function analyticReport(input: AnalyticModel, opts: DocOptions = {}): Document {
  const locale = input.locale;
  const k = input.kpi;
  const d = new Document({
    title: input.scope === "Dashboard" ? "Ringkasan Portofolio" : "Laporan Analitik",
    subject: `${input.scope} - ${input.periodLabel}`,
    orientation: "landscape",
    ...opts,
  });

  reportHeader(
    d,
    input.scope === "Dashboard" ? lt(locale, "RINGKASAN PORTOFOLIO", "PORTFOLIO SUMMARY") : lt(locale, "LAPORAN ANALITIK", "ANALYTICS REPORT"),
    input.periodLabel,
    locale,
  );

  d.add(
    metricGrid(
      [
        { label: lt(locale, "Proyek", "Projects"), value: `${k.activeProjects}/${k.totalProjects}` },
        { label: lt(locale, "Anggaran", "Budget"), value: short(k.totalBudget) },
        { label: lt(locale, "Realisasi", "Realized"), value: short(k.totalActual) },
        { label: lt(locale, "Progres rata-rata", "Avg progress"), value: pct(k.avgProgress) },
        { label: lt(locale, "Pendapatan (YTD)", "Revenue (YTD)"), value: short(k.revenueYtd) },
        { label: lt(locale, "Margin rata-rata", "Avg margin"), value: pct(k.marginAvg) },
        { label: lt(locale, "NCR terbuka", "Open NCR"), value: String(k.openNcr) },
        { label: lt(locale, "Karyawan aktif", "Active staff"), value: String(k.activeEmployees) },
      ],
      { cols: 4 },
    ),
  );

  d.add(
    chartBlock({
      title: lt(locale, "Pendapatan dan biaya", "Revenue and cost"),
      subtitle: lt(locale, "dalam juta rupiah", "in million rupiah"),
      kind: "groupedBar",
      categories: input.series.map((p) => p.label),
      series: [
        { key: "revenue", label: lt(locale, "Pendapatan", "Revenue"), color: COLOR.navy },
        { key: "cost", label: lt(locale, "Biaya", "Cost"), color: COLOR.series[1] ?? COLOR.navy },
      ],
      values: {
        revenue: input.series.map((p) => p.revenue),
        cost: input.series.map((p) => p.cost),
      },
    }),
  );

  d.add(
    chartBlock({
      title: lt(locale, "Margin bulanan", "Monthly margin"),
      categories: input.series.map((p) => p.label),
      series: [{ key: "margin", label: "%", color: COLOR.series[1] ?? COLOR.navy }],
      values: { margin: input.series.map((p) => p.margin) },
      emphasizeZero: true,
      format: (v) => `${v.toFixed(0)}%`,
    }),
  );

  if (input.projectStatus.some((s) => s.value > 0)) {
    d.add(
      chartBlock({
        title: lt(locale, "Status proyek", "Project status"),
        slices: input.projectStatus.filter((s) => s.value > 0),
        showValues: true,
      }),
    );
  }

  if (input.ncrPareto.length > 0) {
    d.add(
      chartBlock({
        title: lt(locale, "Pareto NCR", "NCR pareto"),
        categories: input.ncrPareto.map((b) => b.factor),
        values: input.ncrPareto.map((b) => b.count),
      }),
    );
  }

  if (input.profitByType.length > 0) {
    d.add(sectionBlock(lt(locale, "Profitabilitas per jenis proyek", "Profitability by project type")));
    d.add(profitTable(input.profitByType, locale));
  }

  if (input.profitByBranch.length > 0) {
    d.add(sectionBlock(lt(locale, "Profitabilitas per cabang", "Profitability by branch")));
    d.add(profitTable(input.profitByBranch, locale));
  }

  d.add(sectionBlock(lt(locale, "Risiko & rekomendasi", "Risk & recommendations")));
  const risk = input.risk;
  d.add(
    keyValue({
      labelW: 52,
      pairs: [
        { label: lt(locale, "Proyek berisiko", "At-risk projects"), value: `${risk.atRiskProjects.length} ${risk.atRiskProjects.map((p) => p.id).join(", ")}`, bold: risk.atRiskProjects.length > 0 },
        { label: lt(locale, "NCR terbuka", "Open NCR"), value: `${risk.openNcr}` },
        { label: lt(locale, "Konflik jadwal drydock", "Drydock schedule conflicts"), value: `${risk.dockConflicts}` },
        { label: lt(locale, "Stok di bawah minimum", "Stock below minimum"), value: `${risk.lowStock.length} ${risk.lowStock.map((i) => i.name).join(", ")}` },
        { label: lt(locale, "Maintenance berjalan", "Maintenance in progress"), value: `${risk.maintenancePending}` },
        { label: lt(locale, "Kalibrasi belum selesai", "Calibration not closed"), value: `${risk.calibrationPending}` },
        { label: lt(locale, "Vendor paling sering telat", "Worst on-time vendor"), value: `${risk.worstVendor.name} (${risk.worstVendor.onTime}%)` },
        { label: lt(locale, "Perkiraan biaya rework", "Estimated rework cost"), value: rupiah(input.rework.total), bold: true },
      ],
    }),
  );

  if (input.rework.total > 0) {
    d.add(
      callout([
        lt(
          locale,
          `Rework diestimasi ${rupiah(input.rework.total)} = change order bernilai negatif ${rupiah(input.rework.negativeCo)} + 2% anggaran proyek dengan NCR terbuka ${rupiah(input.rework.ncrEstimate)}.`,
          `Rework estimated at ${rupiah(input.rework.total)} = negative change orders ${rupiah(input.rework.negativeCo)} + 2% of budget for projects with open NCR ${rupiah(input.rework.ncrEstimate)}.`,
        ),
      ], { fill: COLOR.softFill, border: COLOR.hair }),
    );
  }

  return d;
}

function profitTable(rows: ProfitRow[], locale: Locale) {
  const body = [
    ...rows.map((r) => [r.key, rupiah(r.budget), rupiah(r.actual), rupiah(r.profit), String(r.count)]),
    [
      lt(locale, "TOTAL", "TOTAL"),
      rupiah(rows.reduce((s, r) => s + r.budget, 0)),
      rupiah(rows.reduce((s, r) => s + r.actual, 0)),
      rupiah(rows.reduce((s, r) => s + r.profit, 0)),
      String(rows.reduce((s, r) => s + r.count, 0)),
    ],
  ];
  return table({
    head: [lt(locale, "Kategori", "Category"), lt(locale, "Anggaran", "Budget"), lt(locale, "Realisasi", "Realized"), lt(locale, "Selisih", "Variance"), lt(locale, "Proyek", "Projects")],
    widths: ["auto", 30, 30, 30, 20],
    align: ["left", "right", "right", "right", "right"],
    rows: body,
    totalRow: body.length - 1,
  });
}

/* ==========================================================================
   Rekap payroll & THR
   ========================================================================== */

export function payrollReport(input: PayrollReportModel, opts: DocOptions = {}): Document {
  const locale = input.locale;
  const isThr = input.mode === "THR";
  const d = new Document({
    title: isThr ? `Rekap THR & Bonus ${input.period}` : `Rekap Gaji ${input.period}`,
    subject: isThr ? `Rekap THR & Bonus ${input.period}` : `Rekap gaji ${input.period}`,
    orientation: "landscape",
    ...opts,
  });

  reportHeader(
    d,
    isThr ? lt(locale, "REKAP THR & BONUS", "THR & BONUS RECAP") : lt(locale, "REKAP GAJI", "PAYROLL RECAP"),
    monthLabelLong(input.period),
    locale,
  );

  if (isThr) {
    const t = input.thr;
    d.add(
      metricGrid([
        { label: lt(locale, "THR", "THR"), value: rupiah(t.totalThr) },
        { label: lt(locale, "Bonus", "Bonus"), value: rupiah(t.totalBonus) },
        { label: lt(locale, "Total diterima", "Total paid"), value: rupiah(t.totalNet) },
        { label: lt(locale, "Jumlah baris", "Rows"), value: String(t.rows.length) },
      ], { cols: 4 }),
    );
    if (t.rows.length > 0) {
      const rows = [
        ...t.rows.map((r) => [r.id, r.employee, r.type, rupiah(r.amount), r.note, r.status]),
        [lt(locale, "TOTAL", "TOTAL"), "", "", rupiah(t.totalNet), "", ""],
      ];
      d.add(
        table({
          head: [lt(locale, "ID", "ID"), lt(locale, "Karyawan", "Employee"), lt(locale, "Tipe", "Type"), lt(locale, "Nominal", "Amount"), lt(locale, "Keterangan", "Note"), lt(locale, "Status", "Status")],
          widths: [26, 42, 16, 32, "auto", 24],
          align: ["left", "left", "left", "right", "left", "left"],
          rows,
          totalRow: rows.length - 1,
        }),
      );
    } else {
      d.add(callout([lt(locale, "Belum ada THR atau bonus pada periode ini.", "No THR or bonus rows for this period.")]));
    }
    return d;
  }

  const recap = input.recap;
  d.add(
    metricGrid([
      { label: lt(locale, "Gaji pokok", "Basic"), value: rupiah(recap.totals.basic) },
      { label: lt(locale, "Tunjangan", "Allowances"), value: rupiah(recap.totals.allowances) },
      { label: lt(locale, "Lembur", "Overtime"), value: rupiah(recap.totals.overtime) },
      { label: lt(locale, "Potongan", "Deductions"), value: rupiah(-recap.totals.deduction) },
      { label: lt(locale, "BPJS", "BPJS"), value: rupiah(-recap.totals.bpjs) },
      { label: lt(locale, "PPh 21", "PPh 21"), value: rupiah(-recap.totals.pph21) },
      { label: lt(locale, "Total dibayar", "Total paid"), value: rupiah(recap.totals.net) },
      { label: lt(locale, "Karyawan", "Employees"), value: String(recap.rows.length) },
    ], { cols: 4 }),
  );

  if (recap.rows.length > 0) {
    d.add(
      table({
        head: [
          lt(locale, "ID", "ID"),
          lt(locale, "Karyawan", "Employee"),
          lt(locale, "Pokok", "Basic"),
          lt(locale, "Tunjangan", "Allow."),
          lt(locale, "Lembur", "Overtime"),
          lt(locale, "Kasbon", "Loan"),
          lt(locale, "Potongan", "Deduct."),
          lt(locale, "PPh 21", "PPh 21"),
          lt(locale, "BPJS Kes", "BPJS Kes"),
          lt(locale, "BPJS TK", "BPJS TK"),
          lt(locale, "Net", "Net"),
          lt(locale, "Status", "Status"),
        ],
        widths: [22, 34, 22, 20, 18, 18, 18, 18, 20, 20, 24, 18],
        align: ["left", "left", "right", "right", "right", "right", "right", "right", "right", "right", "right", "left"],
        rows: [
          ...recap.rows.map((r) => [
            r.id,
            r.employee,
            money(r.basic),
            money(r.allowances),
            money(r.overtime),
            r.loan > 0 ? `-${money(r.loan)}` : "-",
            r.otherDeduction > 0 ? `-${money(r.otherDeduction)}` : "-",
            r.pph21 > 0 ? `-${money(r.pph21)}` : "-",
            r.bpjsKes > 0 ? `-${money(r.bpjsKes)}` : "-",
            r.bpjsTk > 0 ? `-${money(r.bpjsTk)}` : "-",
            money(r.net),
            r.status,
          ]),
          [
            lt(locale, "TOTAL", "TOTAL"),
            `${recap.rows.length} ${lt(locale, "karyawan", "employees")}`,
            money(recap.totals.basic),
            money(recap.totals.allowances),
            money(recap.totals.overtime),
            "-",
            "-",
            `-${money(recap.totals.pph21)}`,
            "-",
            "-",
            money(recap.totals.net),
            "",
          ],
        ],
        totalRow: recap.rows.length,
      }),
    );
  } else {
    d.add(callout([lt(locale, "Belum ada data gaji pada periode ini.", "No payroll rows for this period.")]));
  }
  return d;
}

export { monthLabel, monthLabelLong, lt, type Collections };