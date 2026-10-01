import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Eye,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  Legend,
  ComposedChart,
  Area,
} from "recharts";
import {
  Card,
  CardHeader,
  KpiCard,
  PageHeader,
  Tabs,
  ProgressBar,
  Badge,
  ChartTooltip,
  Donut,
  SortTh,
  toggleSort,
  sortRows,
  toast,
  useBusy,
} from "../components/ui";
import type { SortState } from "../components/ui";
import { useStore } from "../data/store";
import type { CollectionKey } from "../data/store";
import { useModuleSync } from "../data/useModuleSync";
import { getSetting } from "../utils/settings";
import { chartAnim, exportExcelSheets, exportPDF } from "../utils/export";
import { fmtTanggal, fmtMiliar, fmtRupiah, todayISO } from "../utils/format";
import { useT } from "../i18n/LanguageContext";
import { n_misc } from "../i18n/n_misc";
import {
  revenueSeries,
  sparkRevenue,
  sparkMargin,
  sparkProjects,
  ncrTrend,
  lowStockTrend,
  slotTrend,
  activeProjectTrend,
  marginSeries,
  inspectionTrend,
} from "../data";

const MON_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

/* Label sumbu "Mon YYYY" + putar series agar bulan berjalan jadi titik terakhir.
   SEED TIDAK DIUBAH - transformasi murni untuk tampilan. */
function withMonthLabels<T extends { month: string }>(arr: T[]): (T & { bln: string })[] {
  const now = new Date();
  const cur = now.getMonth(); // 0 = Jan
  const pos = arr.findIndex((d) => d.month === MON_ID[cur]);
  const rot = pos >= 0 ? [...arr.slice(pos + 1), ...arr.slice(0, pos + 1)] : [...arr];
  const y = now.getFullYear();
  return rot.map((d) => {
    const mi = MON_ID.indexOf(d.month);
    const yy = mi < 0 ? y : mi <= cur ? y : y - 1;
    return { ...d, bln: `${d.month} ${yy}` };
  });
}

/* Label "Mon YYYY" untuk k bulan ke depan dari bulan berjalan. */
function futureLabel(k: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + k);
  return `${MON_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface Scenario { name: string; growth: number; costAdj: number; progAdj: number }

function loadScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem("isms.scenario");
    const arr = raw ? JSON.parse(raw) as Scenario[] : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function loadNotes(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem("isms.notes");
    const obj = raw ? JSON.parse(raw) as Record<string, string[]> : {};
    return typeof obj === "object" && obj !== null ? obj : {};
  } catch { return {}; }
}

function miscLocale(): "id" | "en" {
  try {
    return localStorage.getItem("isms.locale") === "en" ? "en" : "id";
  } catch { return "id"; }
}

function exportChartPNG(chartId: string, filename: string): void {
  const S0 = n_misc[miscLocale()];
  try {
    const wrap = document.getElementById(chartId);
    const svg = wrap?.querySelector("svg");
    if (!svg) { toast(S0.tChartNotReady, "info"); return; }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = svg.clientWidth * 2 || 1200;
        canvas.height = svg.clientHeight * 2 || 600;
        const ctx = canvas.getContext("2d");
        if (!ctx) { toast(S0.tCanvasUnsupported, "info"); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${filename}.png`;
        a.click();
        toast(S0.tChartPngDownloaded);
      } catch { toast(S0.tChartExportFailed, "info"); }
    };
    img.onerror = () => toast(S0.tChartExportFailed, "info");
    img.src = url;
  } catch { toast(S0.tChartExportFailed, "info"); }
}

/* Batch koleksi modul Analytics untuk useModuleSync (pengganti resync penuh). */
const AN_COLS: CollectionKey[] = ["activities", "bookings", "calibrations", "changeOrders", "dockSlots", "equipment", "incidents", "inspections", "inventory", "invoices", "ncr", "payables", "projects", "quotations", "settings", "vendors"];

export default function Analytics() {
  const busy = useBusy();
  const { locale } = useT();
  const S = n_misc[locale];
  const [tab, setTab] = useState("Deskriptif");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const { data, update, log } = useStore();
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(AN_COLS);
  /* What-if dikendalikan dari Pengaturan (grup Analytics) - otomatis dipakai forecast. */
  const growth = getSetting(data, "WHATIF_GROWTH", 0);
  const costAdj = getSetting(data, "WHATIF_COST", 0);
  const progAdj = getSetting(data, "WHATIF_PROG", 0);
  const [scName, setScName] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios());
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [notes, setNotes] = useState<Record<string, string[]>>(() => loadNotes());

  const avgProgress = data.projects.length
    ? Math.round(data.projects.reduce((s, p) => s + Number(p.progress || 0), 0) / data.projects.length)
    : 0;
  const openNcr = data.ncr.filter((n) => n.status !== "Tertutup").length;
  const openNcrCritical = data.ncr.filter((n) => n.status !== "Tertutup" && n.severity === "Critical").length;
  const lowStock = data.inventory.filter((i) => i.stock <= i.minStock);
  const atRisk = data.projects.filter((p) => p.status === "Terlambat" || Number(p.actual || 0) > Number(p.budget || 0)).length;
  const dockConflict = (() => {
    const slots = data.dockSlots;
    return slots.filter((s) => slots.some((o) => o.dockId === s.dockId && o.id !== s.id && s.from < o.to && o.from < s.to)).length;
  })();
  const typeDist = (["New Build", "Repair", "Retrofit"] as const).map((t, i) => ({
    name: t,
    value: data.projects.filter((p) => p.type === t).length,
    color: ["#0b3a63", "#2e9ad4", "#22c55e"][i],
  }));

  /* Series tampilan: label "Mon YYYY", bulan berjalan di posisi terakhir. */
  const revDisp = useMemo(() => withMonthLabels(revenueSeries), []);
  const marDisp = useMemo(() => withMonthLabels(marginSeries), []);
  const inspDisp = useMemo(() => withMonthLabels(inspectionTrend), []);

  const totalRevenue = revDisp.reduce((s, d) => s + d.revenue, 0);
  const avgRevenue = revDisp.length ? totalRevenue / revDisp.length : 0;
  const lastRevPoint = revDisp[revDisp.length - 1];
  const prevRevPoint = revDisp[revDisp.length - 2];
  const revGrowth = prevRevPoint && prevRevPoint.revenue ? ((lastRevPoint.revenue - prevRevPoint.revenue) / prevRevPoint.revenue) * 100 : 0;
  const avgMargin = marDisp.length ? marDisp.reduce((s, d) => s + d.margin, 0) / marDisp.length : 0;
  const lastMarginPoint = marDisp[marDisp.length - 1];
  const prevMarginPoint = marDisp[marDisp.length - 2];
  const marginDiff = lastMarginPoint && prevMarginPoint ? lastMarginPoint.margin - prevMarginPoint.margin : 0;

  const last3 = revDisp.slice(-3);
  const ma3 = last3.length ? last3.reduce((s, d) => s + d.revenue, 0) / last3.length : 0;
  const forecast = [
    { name: lastRevPoint.bln, actual: round1(lastRevPoint.revenue), forecast: round1(lastRevPoint.revenue) },
    ...[1, 2, 3, 4].map((k) => ({
      name: futureLabel(k),
      actual: null as number | null,
      forecast: round1(ma3),
    })),
  ];
  const forecastAnnual = Math.round(ma3 * 12);

  const variance = revDisp.map((d) => ({ n: d.bln, v: Math.round((d.revenue - avgRevenue) * 1000) }));

  /* ===== Portfolio dari data nyata =====
     Semua angka di bawah dihitung dari koleksi store (projects, invoices,
     payables), bukan dari deret mock. Label bulan dibangun dari tanggal
     data sehingga tidak bisa bergeser seperti label hardcode. */

  const numOf = (v: unknown): number => Number(v) || 0;

  /* 1. Komposisi tipe proyek (New Build / Repair / Retrofit). */
  const projectTypeDistReal = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data.projects) {
      const k = String(p.type ?? "-").trim() || "-";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    const C = ["#0b3a63", "#2e9ad4", "#22c55e", "#f59e0b", "#8b5cf6"];
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: C[i % C.length] }));
  }, [data.projects]);

  /* 2. Pendapatan per cabang: invoice dikelompokkan lewat project -> branch,
        jadi angka mengikuti cabang yang benar-benar ada di data. */
  const branchOfProject = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of data.projects) m.set(String(p.id), String(p.branch ?? "-"));
    return m;
  }, [data.projects]);
  const revenueByBranchReal = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of data.invoices) {
      const b = branchOfProject.get(String(i.project ?? "")) ?? "-";
      m.set(b, (m.get(b) ?? 0) + numOf(i.amount));
    }
    const C = ["#0b3a63", "#2e9ad4", "#0d9488", "#f59e0b", "#8b5cf6", "#f43f5e"];
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: C[i % C.length] }));
  }, [data.invoices, branchOfProject]);

  /* 3. Tren 12 bulan: pendapatan, AP, dan kas masuk dari dokumen nyata. */
  const monthlyReal = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    const buckets = new Map<string, { rev: number; ap: number; cash: number }>();
    for (let k = 11; k >= 0; k -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      keys.push(key);
      buckets.set(key, { rev: 0, ap: 0, cash: 0 });
    }
    for (const i of data.invoices) {
      const b = buckets.get(String(i.date ?? "").slice(0, 7));
      if (b) b.rev += numOf(i.amount);
    }
    for (const a of data.payables) {
      const b = buckets.get(String(a.due ?? "").slice(0, 7));
      if (b) b.ap += numOf(a.amt);
    }
    for (const i of data.invoices) {
      const b = buckets.get(String(i.paidAt ?? "").slice(0, 7));
      if (b && String(i.status ?? "") === "Lunas") b.cash += numOf(i.amount);
    }
    const MON = locale === "en"
      ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      : ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
    return keys.map((key) => {
      const v = buckets.get(key) ?? { rev: 0, ap: 0, cash: 0 };
      const d = new Date(`${key}-01T00:00:00`);
      return {
        bln: `${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        revenue: round1(v.rev / 1e9),
        ap: round1(v.ap / 1e9),
        cash: round1(v.cash / 1e9),
      };
    });
  }, [data.invoices, data.payables, locale]);
  const monthlyHasData = monthlyReal.some((d) => d.revenue > 0 || d.ap > 0 || d.cash > 0);

  /* 4. Pipeline per kuartal: won = quotation stage Menang/Terkonversi,
        pipeline = masih berjalan, target = total per kuartal. */
  const projectPipelineReal = useMemo(() => {
    const q = (d: Date): number => Math.floor(d.getMonth() / 3) + 1;
    const m = new Map<number, { won: number; pipeline: number; wonVal: number; pipeVal: number }>();
    for (const x of data.quotations) {
      const d = new Date(String(x.date ?? "").slice(0, 10) + "T00:00:00");
      if (Number.isNaN(d.getTime())) continue;
      const k = q(d);
      const cur = m.get(k) ?? { won: 0, pipeline: 0, wonVal: 0, pipeVal: 0 };
      const st = String(x.stage ?? "");
      if (st === "Menang" || st === "Terkonversi") { cur.won += 1; cur.wonVal += numOf(x.value); }
      else { cur.pipeline += 1; cur.pipeVal += numOf(x.value); }
      m.set(k, cur);
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([quarter, v]) => ({
        name: `Q${quarter}`,
        won: v.won,
        pipeline: v.pipeline,
        target: v.won + v.pipeline,
        wonVal: v.wonVal,
        pipeVal: v.pipeVal,
      }));
  }, [data.quotations]);

  const ncrTotal = data.ncr.length || 1;
  const ncrByType = new Map<string, number>();
  for (const n of data.ncr) {
    const key = String(n.type || "Lainnya");
    ncrByType.set(key, (ncrByType.get(key) ?? 0) + 1);
  }
  const drilldown = [...ncrByType.entries()]
    .map(([factor, count]) => ({ factor, count, impact: Math.round((count / ncrTotal) * 100) }))
    .sort((a, b) => b.count - a.count);

  const branchRevenue = data.projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.branch] = (acc[p.branch] ?? 0) + Number(p.budget || 0);
    return acc;
  }, {});
  const branchRows = Object.entries(branchRevenue).sort((a, b) => b[1] - a[1]);

  let paretoCum = 0;
  const pareto = drilldown.map((d) => {
    paretoCum += d.count;
    return { name: d.factor, count: d.count, kum: ncrTotal ? Math.round((paretoCum / ncrTotal) * 100) : 0 };
  });

  const incidentByType = new Map<string, number>();
  for (const i of data.incidents) incidentByType.set(String(i.type || "Lainnya"), (incidentByType.get(String(i.type || "Lainnya")) ?? 0) + 1);
  const topIncident = [...incidentByType.entries()].sort((a, b) => b[1] - a[1])[0];
  const topNcrType = drilldown[0]?.factor ?? "-";
  const failedInspections = data.inspections.filter((i) => i.status === "NCR");
  const worstVendor = [...data.vendors].sort((a, b) => Number(a.onTime || 100) - Number(b.onTime || 100))[0];
  const maintEquip = data.equipment.filter((e) => e.status === "Maintenance");
  const fishbones: { tulang: string; sebab: string[] }[] = [
    { tulang: S.boneMan, sebab: [topIncident ? S.fishTopIncident.replace("{a}", `${topIncident[0]} (${topIncident[1]} kejadian)`) : S.fishTopIncidentEmpty, S.fishNcrNeed.replace("{n}", topNcrType)] },
    { tulang: S.boneMethod, sebab: [S.fishFailedInspection.replace("{n}", String(failedInspections.length)), S.fishOpenNcr.replace("{n}", String(openNcr)).replace("{a}", String(drilldown.length))] },
    { tulang: S.boneMaterial, sebab: [lowStock.slice(0, 2).map((i) => String(i.name)).join("; ") ? S.fishLowStock.replace("{n}", String(lowStock.length)).replace("{a}", lowStock.slice(0, 2).map((i) => String(i.name)).join("; ")) : S.fishLowStockEmpty.replace("{n}", String(lowStock.length)), worstVendor ? S.fishWorstVendor.replace("{a}", `${worstVendor.name} (${worstVendor.onTime}%)`) : S.fishWorstVendorEmpty] },
    { tulang: S.boneMachine, sebab: [maintEquip.slice(0, 2).map((e) => String(e.name)).join("; ") ? S.fishMaintenance.replace("{n}", String(maintEquip.length)).replace("{a}", maintEquip.slice(0, 2).map((e) => String(e.name)).join("; ")) : S.fishMaintenanceEmpty.replace("{n}", String(maintEquip.length)), S.fishCalibration.replace("{n}", String(data.calibrations.filter((c) => c.status !== "Selesai").length))] },
  ];

  const revFactor = (1 + growth / 100) * (1 + progAdj / 100);
  const marginAdjPts = -(costAdj * 0.3);
  const forecastAdj = forecast.map((f) => ({
    name: f.name,
    actual: f.actual,
    forecast: f.forecast === null ? null : round1(f.forecast * revFactor),
    low: f.forecast === null ? null : round1(f.forecast * revFactor * 0.85),
    high: f.forecast === null ? null : round1(f.forecast * revFactor * 1.15),
  }));
  const forecastAnnualAdj = Math.round(ma3 * revFactor * 12);
  const marginLive = avgMargin + marginAdjPts;

  const annualFor = (s: Scenario): number => Math.round(ma3 * (1 + s.growth / 100) * (1 + s.progAdj / 100) * 12);

  const saveScenario = () => {
    if (!scName.trim()) { toast(S.tScenarioNameRequired, "info"); return; }
    const sc: Scenario = { name: scName.trim(), growth, costAdj, progAdj };
    const next = [sc, ...scenarios.filter((s) => s.name !== sc.name)].slice(0, 20);
    setScenarios(next);
    try { localStorage.setItem("isms.scenario", JSON.stringify(next)); } catch { /* abaikan */ }
    log("menyimpan skenario what-if", `${sc.name} (growth ${sc.growth} · biaya ${sc.costAdj} · progres ${sc.progAdj})`, "Analytics");
    toast(S.tScenarioSaved.replace("{n}", sc.name));
    setScName("");
  };

  const loadScenario = (name: string) => {
    const sc = scenarios.find((s) => s.name === name);
    if (!sc) return;
    const apply = (key: string, val: number) => {
      const row = (data.settings ?? []).find((s) => String(s.key) === key);
      if (row) update("settings", String(row.id), { value: val });
    };
    apply("WHATIF_GROWTH", sc.growth);
    apply("WHATIF_COST", sc.costAdj);
    apply("WHATIF_PROG", sc.progAdj);
    log("menerapkan skenario what-if", `${name} (g:${sc.growth} c:${sc.costAdj} p:${sc.progAdj})`, "Analytics");
    toast(S.tScenarioApplied.replace("{n}", name));
  };

  const delScenario = (name: string) => {
    const next = scenarios.filter((s) => s.name !== name);
    setScenarios(next);
    try { localStorage.setItem("isms.scenario", JSON.stringify(next)); } catch { /* abaikan */ }
    log("menghapus skenario what-if", name, "Analytics");
    toast(S.tScenarioDeleted.replace("{n}", name), "info");
  };

  const saveNote = () => {
    if (!noteInput.trim()) { toast(S.tNoteEmpty, "info"); return; }
    const next = { ...notes, [tab]: [...(notes[tab] ?? []), noteInput.trim()].slice(0, 20) };
    setNotes(next);
    try { localStorage.setItem("isms.notes", JSON.stringify(next)); } catch { /* abaikan */ }
    log("menyimpan catatan insight", `${tab}: ${noteInput.trim().slice(0, 80)}`, "Analytics");
    setNoteInput("");
    toast(S.tInsightSaved);
  };

  const delNote = (idx: number) => {
    const teks = (notes[tab] ?? [])[idx] ?? "";
    const next = { ...notes, [tab]: (notes[tab] ?? []).filter((_, i) => i !== idx) };
    setNotes(next);
    try { localStorage.setItem("isms.notes", JSON.stringify(next)); } catch { /* abaikan */ }
    log("menghapus catatan insight", `${tab}: ${teks.slice(0, 80)}`, "Analytics");
  };

  const profitByType = (["New Build", "Repair", "Retrofit"] as const).map((t) => {
    const rows = data.projects.filter((p) => p.type === t);
    const budget = rows.reduce((s, p) => s + Number(p.budget || 0), 0);
    const actual = rows.reduce((s, p) => s + Number(p.actual || 0), 0);
    return { name: t, profit: Math.round((budget - actual) / 1000000000), count: rows.length };
  });
  const profitBranchMap = new Map<string, { budget: number; actual: number; count: number }>();
  for (const p of data.projects) {
    const cur = profitBranchMap.get(p.branch) ?? { budget: 0, actual: 0, count: 0 };
    cur.budget += Number(p.budget || 0);
    cur.actual += Number(p.actual || 0);
    cur.count += 1;
    profitBranchMap.set(p.branch, cur);
  }
  const profitByBranch = [...profitBranchMap.entries()].map(([name, r]) => ({
    name,
    profit: Math.round((r.budget - r.actual) / 1000000000),
    count: r.count,
  }));
  const negCo = data.changeOrders
    .filter((c) => Number(c.impact || 0) < 0)
    .reduce((s, c) => s + Math.abs(Number(c.impact || 0)), 0);
  const openNcrProjects = new Set(data.ncr.filter((n) => n.status !== "Tertutup").map((n) => String(n.project)));
  const ncrEstimate = data.projects
    .filter((p) => openNcrProjects.has(p.id))
    .reduce((s, p) => s + Number(p.budget || 0) * 0.02, 0);
  const reworkCost = Math.round(negCo + ncrEstimate);
  const lastUtil = data.projects.length ? avgProgress : 0;
  const utilTarget = 85;

  /* Ekspor LENGKAP satu workbook: KPI + drilldown + forecast + skenario + profit. */
  const exportReport = async () => {
    try {
      const kpi: (string | number)[][] = [
        ["Indikator", "Nilai"],
        ["Pendapatan YTD (M Rp)", round1(totalRevenue)],
        ["Rata-rata margin (%)", round1(avgMargin)],
        ["Rata-rata progres (%)", avgProgress],
        ["NCR terbuka", openNcr],
        ["Forecast tahunan adj (M Rp)", forecastAnnualAdj],
        ["Margin berjalan (%)", round1(marginLive)],
        ["Slot konflik", dockConflict],
        ["Stok kritis (item)", lowStock.length],
        ["Proyek berisiko", atRisk],
        ["Laba portofolio (M Rp)", profitByType.reduce((s, d) => s + d.profit, 0)],
        ["Biaya rework (Rp)", reworkCost],
      ];
      const drill: (string | number)[][] = [
        ["Kategori NCR", "Kejadian", "Dampak (%)"],
        ...drilldown.map((d) => [d.factor, d.count, d.impact] as (string | number)[]),
        [],
        ["Cabang", "Pendapatan (M Rp)"],
        ...branchRows.map(([b, v]) => [b, round1(v / 1000000000)] as (string | number)[]),
      ];
      const fc: (string | number)[][] = [
        ["Bulan", "Aktual", "Forecast", "Batas bawah", "Batas atas"],
        ...forecastAdj.map((f) => [f.name, f.actual ?? "-", f.forecast ?? "-", f.low ?? "-", f.high ?? ""] as (string | number)[]),
      ];
      const sc: (string | number)[][] = [
        ["Skenario", "Growth %", "Cost %", "Prog %", "Forecast/thn (M Rp)"],
        ...scenarios.map((s) => [s.name, s.growth, s.costAdj, s.progAdj, annualFor(s)] as (string | number)[]),
      ];
      const pf: (string | number)[][] = [
        ["Tipe proyek", "Laba (M Rp)", "Jumlah proyek"],
        ...profitByType.map((r) => [r.name, r.profit, r.count] as (string | number)[]),
        [],
        ["Cabang", "Laba (M Rp)", "Jumlah proyek"],
        ...profitByBranch.map((r) => [r.name, r.profit, r.count] as (string | number)[]),
        [],
        ["Komponen rework", "Nilai (Rp)"],
        ["Change order negatif", Math.round(negCo)],
        [`Estimasi NCR (${openNcrProjects.size} proyek)`, Math.round(ncrEstimate)],
        ["Total rework", reworkCost],
      ];
      /* Sheet Preskriptif = 4 rekomendasi yang tampil di tab Preskriptif. */
      const rx: (string | number)[][] = [
        ["Rekomendasi", "Detail", "Tindak lanjut"],
        [S.allocDrydock, S.allocDrydockDesc, "/drydock"],
        [S.reorderMaterial, S.reorderDesc.replace("{n}", String(lowStock.length)), "/procurement"],
        [S.projectPriority, S.projectPriorityDesc.replace("{n}", String(atRisk)), "/proyek"],
        [S.followUpNcr, S.followUpNcrDesc.replace("{n}", String(openNcr)), "/qc-safety"],
      ];
      /* Sheet Utilisasi: gabungan equipment (jam operasi + %) + jam booking bila ada. */
      const bookingJamByEquip = new Map<string, string>();
      for (const b of data.bookings ?? []) {
        const key = String(b.equip ?? b.equipment ?? b.name ?? "");
        const jam = String(b.jam ?? b.hours ?? b.jadwal ?? "");
        if (key && jam && !bookingJamByEquip.has(key)) bookingJamByEquip.set(key, jam);
      }
      const util: (string | number)[][] = [
        ["Nama Alat", "Jam Operasi", "Utilisasi (%)", "Jadwal Booking"],
        ...(data.equipment ?? []).map((e) => {
          const name = String(e.name ?? e.id ?? "-");
          const jam = Number(e.lastHours ?? e.hours ?? 0);
          const pct = Number(e.util ?? e.utilisasi ?? 0);
          return [name, jam, pct, bookingJamByEquip.get(name) ?? "-"] as (string | number)[];
        }),
      ];
      /* Sheet Inventory: stok + nilai persediaan. */
      const inv: (string | number)[][] = [
        ["Nama Barang", "Stok", "Satuan", "Nilai (Rp)"],
        ...(data.inventory ?? []).map((i) => {
          const stock = Number(i.stock ?? 0);
          const cost = Number(i.cost ?? i.unitPrice ?? 0);
          return [String(i.name ?? i.id ?? "-"), stock, String(i.unit ?? "-"), Math.round(stock * cost)] as (string | number)[];
        }),
      ];
      /* Lewat util terpusat: sanitasi formula + lebar kolom otomatis + header menempel. */
      await exportExcelSheets([
        { name: "KPI", rows: kpi },
        { name: "Drilldown", rows: drill },
        { name: "Forecast", rows: fc },
        { name: "Skenario", rows: sc },
        { name: "Profit", rows: pf },
        { name: "Preskriptif", rows: rx },
        { name: "Utilisasi", rows: util },
        { name: "Inventory", rows: inv },
      ], `Laporan-Analytics-${todayISO()}`);
      toast(S.tAnalyticsExported);
    } catch {
      toast(S.tChartExportFailed, "info");
    }
  };

  const exportPdfReport = () => {
    void busy.run("export", async () => {
      try {
        await exportPDF("analytics-pdf", `Laporan-Analytics-${todayISO()}`);
        toast(S.tAnalyticsPdfExported);
      } catch {
        toast(S.tChartExportFailed, "info");
      }
    });
  };

  // Style print-friendly untuk section PDF tersembunyi (tabel polos, tanpa chart).
  const pdfTh: CSSProperties = { border: "1px solid #999", padding: "4px 6px", background: "#eee", textAlign: "left", fontSize: 11 };
  const pdfTd: CSSProperties = { border: "1px solid #999", padding: "4px 6px", fontSize: 11 };
  const pdfTable: CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 6, marginBottom: 12 };

  return (
    <div>
      <PageHeader
        title="Analitik"
        subtitle={S.anSubtitle}
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary-gradient" disabled={busy.isBusy("export")} onClick={() => void busy.run("export", exportReport)}>{S.exportReportBtn}</button>
            <button className="btn-secondary" disabled={busy.isBusy("export")} onClick={exportPdfReport}>{S.pdfReportBtn}</button>
          </span>
        }
      />

      <Tabs tabs={["Deskriptif", "Diagnostik", "Prediktif", "Preskriptif", "Profitabilitas"]} active={tab} onChange={setTab} labels={{ Deskriptif: S.tabDescriptive, Diagnostik: S.tabDiagnostic, Prediktif: S.tabPredictive, Preskriptif: S.tabPrescriptive, Profitabilitas: S.tabProfitability }} />

      <div className="mt-5">
        {tab === "Deskriptif" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label={S.kpiRevenueYtd} value={`Rp ${totalRevenue.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`} delta={S.deltaPctVsMonth.replace("{n}", `${revGrowth >= 0 ? "+" : ""}${revGrowth.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`)} deltaDirection={revGrowth > 0 ? "up" : revGrowth < 0 ? "down" : "flat"} icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
              <KpiCard label={S.kpiAvgMargin} value={`${avgMargin.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} delta={S.deltaPtVsMonth.replace("{n}", `${marginDiff >= 0 ? "+" : ""}${marginDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`)} deltaDirection={marginDiff > 0 ? "up" : marginDiff < 0 ? "down" : "flat"} icon={<Eye className="h-5 w-5" />} chip="teal" spark={sparkMargin} />
              <KpiCard label={S.kpiAvgProgress} value={`${avgProgress}%`} delta={S.activeProjectsCount.replace("{n}", String(data.projects.length))} deltaDirection="flat" icon={<Clock className="h-5 w-5" />} chip="violet" spark={sparkProjects} />
              <KpiCard label={S.kpiOpenNcr} value={String(openNcr)} delta={openNcrCritical > 0 ? S.criticalCount.replace("{n}", String(openNcrCritical)) : S.nihilCritical} deltaDirection={openNcrCritical > 0 ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={ncrTrend} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title={S.revenueVsCost} subtitle={`${S.last12Months} · Bulan berjalan paling kanan`} action={<button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-rev", "pendapatan-vs-biaya")}>{S.exportPngBtn}</button>} />
                <div id="chart-rev" className="h-60 p-4 pt-0 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revDisp} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="bln" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" name={S.legendRevenue} fill="#0b3a63" radius={[4, 4, 0, 0]} isAnimationActive={chartAnim()} />
                      <Bar dataKey="cost" name={S.legendCost} fill="#8cc9e8" radius={[4, 4, 0, 0]} isAnimationActive={chartAnim()} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title={S.jobComposition} subtitle={S.portfolioDistLive} />
                <div className="flex flex-col items-center gap-3 p-4">
                  <Donut
                    data={typeDist}
                    colors={typeDist.map((d) => d.color)}
                    size={150}
                    thickness={20}
                    centerValue={String(typeDist.reduce((s, d) => s + d.value, 0))}
                    centerLabel={S.donutTotal}
                  />
                  <div className="grid w-full grid-cols-1 gap-1.5">
                    {typeDist.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="text-steel-600">{d.name}</span>
                        <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader title={S.marginVsInspection} subtitle={`${S.marginQcTrend} · Bulan berjalan paling kanan`} />
              <div className="grid grid-cols-1 gap-4 p-4 pt-0 lg:grid-cols-2">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={marDisp} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="bln" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis domain={[15, 35]} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                      <Line type="monotone" dataKey="margin" name={S.legendMargin} stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={chartAnim()} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={inspDisp} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="bln" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="inspeksi" name={S.legendInspection} stroke="#2e9ad4" fill="#8cc9e8" fillOpacity={0.4} isAnimationActive={chartAnim()} />
                      <Line type="monotone" dataKey="lulus" name={S.legendPassed} stroke="#1f9d55" strokeWidth={2} dot={false} isAnimationActive={chartAnim()} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            {/* ===== Portfolio: semua dihitung dari data store nyata ===== */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title={locale === "en" ? "Project mix by type" : "Komposisi Proyek per Tipe"}
                  subtitle={locale === "en"
                    ? "Counted from real project records (p.type)"
                    : "Dihitung dari baris proyek nyata (p.type)"}
                />
                <div className="flex flex-wrap items-center gap-5 p-4 pt-0">
                  <Donut
                    data={projectTypeDistReal}
                    colors={projectTypeDistReal.map((d) => d.color)}
                    size={150}
                    thickness={20}
                    centerValue={String(data.projects.length)}
                    centerLabel={locale === "en" ? "Projects" : "Proyek"}
                  />
                  <div className="min-w-40 flex-1 space-y-1.5">
                    {projectTypeDistReal.length === 0 && (
                      <p className="text-sm text-steel-400">{locale === "en" ? "No project yet." : "Belum ada proyek."}</p>
                    )}
                    {projectTypeDistReal.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="truncate text-steel-600">{d.name}</span>
                        <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title={locale === "en" ? "Revenue by branch" : "Pendapatan per Cabang"}
                  subtitle={locale === "en"
                    ? "Invoices grouped through project to branch, from real records"
                    : "Invoice dikelompokkan lewat project ke cabang, dari data nyata"}
                />
                <div className="flex flex-wrap items-center gap-5 p-4 pt-0">
                  <Donut
                    data={revenueByBranchReal}
                    colors={revenueByBranchReal.map((d) => d.color)}
                    size={150}
                    thickness={20}
                    centerValue={`Rp ${round1(revenueByBranchReal.reduce((s, d) => s + d.value, 0) / 1e9)}`}
                    centerLabel="M"
                  />
                  <div className="min-w-40 flex-1 space-y-1.5">
                    {revenueByBranchReal.length === 0 && (
                      <p className="text-sm text-steel-400">{locale === "en" ? "No invoice yet." : "Belum ada invoice."}</p>
                    )}
                    {revenueByBranchReal.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="truncate text-steel-600">{d.name}</span>
                        <span className="ml-auto font-semibold text-navy-900">{fmtMiliar(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {monthlyHasData && (
              <Card>
                <CardHeader
                  title={locale === "en" ? "Revenue / AP / cash-in (12 months)" : "Pendapatan / AP / Kas Masuk (12 bulan)"}
                  subtitle={locale === "en"
                    ? "From real invoices and payables, in billions of rupiah"
                    : "Dari invoice dan payable nyata, dalam miliar rupiah"}
                  action={<button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-real", "revenue-ap-cash")}>{S.exportPngBtn}</button>}
                />
                <div id="chart-real" className="h-64 p-4 pt-0 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyReal} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="bln" tick={{ fontSize: 11 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} stroke="#8aa2b6" axisLine={false} tickLine={false} unit=" M" />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" name={locale === "en" ? "Revenue" : "Pendapatan"} fill="#0b3a63" radius={[4, 4, 0, 0]} isAnimationActive={chartAnim()} />
                      <Bar dataKey="ap" name="AP" fill="#8cc9e8" radius={[4, 4, 0, 0]} isAnimationActive={chartAnim()} />
                      <Line type="monotone" dataKey="cash" name={locale === "en" ? "Cash in" : "Kas masuk"} stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={chartAnim()} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {projectPipelineReal.length > 0 && (
              <Card>
                <CardHeader
                  title={locale === "en" ? "Pipeline per quarter" : "Pipeline per Kuartal"}
                  subtitle={locale === "en"
                    ? "Won vs open quotations from real records, in billions"
                    : "Menang vs masih berjalan dari quotation nyata, dalam miliar"}
                />
                <div className="space-y-2.5 p-4 pt-0">
                  {projectPipelineReal.map((q) => {
                    const max = Math.max(...projectPipelineReal.map((x) => x.target), 1);
                    return (
                      <div key={q.name} className="flex items-center gap-2.5 text-sm">
                        <span className="w-9 shrink-0 font-semibold text-navy-900">{q.name}</span>
                        <span className="flex h-5 w-full max-w-md overflow-hidden rounded bg-steel-100">
                          <span className="h-full bg-ocean-600" style={{ width: `${(q.won / max) * 100}%` }} title={`${q.won} won`} />
                          <span className="h-full bg-ocean-200" style={{ width: `${(q.pipeline / max) * 100}%` }} title={`${q.pipeline} open`} />
                        </span>
                        <span className="ml-auto w-40 text-right text-xs text-steel-500">
                          {locale === "en" ? "won" : "menang"} {q.won} · {locale === "en" ? "open" : "jalan"} {q.pipeline} · {fmtMiliar(q.wonVal + q.pipeVal)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "Diagnostik" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title={S.ncrByCategory} subtitle={S.connectedQcLive} action={<Badge tone="red">{S.categoryCount.replace("{n}", String(drilldown.length))}</Badge>} />
                <div className="p-5 space-y-4 pt-2">
                  {drilldown.map((d, i) => (
                    <div key={d.factor} className="flex items-center gap-4">
                      <span className={`w-7 text-center text-sm font-bold ${i < 2 ? "text-rose-600" : "text-steel-400"}`}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-steel-700">{d.factor}</span>
                          <span className="font-semibold text-navy-900">{S.impactPct.replace("{n}", String(d.impact))}</span>
                        </div>
                        <ProgressBar value={d.impact} tone="red" />
                        <p className="mt-0.5 text-xs text-steel-500">{S.incidentsRecorded.replace("{n}", String(d.count))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title={S.monthlyBudgetVariance} subtitle={`${S.varianceVsAvg} · Bulan berjalan paling kanan`} />
                <div className="h-64 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={variance} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="n" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => S.millionSuffix.replace("{n}", String(v))} />} />
                      <ReferenceLine y={0} stroke="#dc2626" />
                      <Bar dataKey="v" fill="#2e9ad4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title={S.paretoNcr} subtitle={S.paretoBarLine} action={<Badge tone="red">Pareto</Badge>} />
                <div className="h-64 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={pareto} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis yAxisId="kiri" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis yAxisId="kanan" orientation="right" domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v, n) => (n === "kum" ? `${v}%` : `${v} kejadian`)} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="kiri" dataKey="count" name={S.legendIncidents} fill="#0b3a63" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="kanan" type="monotone" dataKey="kum" name={S.legendCumulative} stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title={S.fishboneTitle} subtitle={S.fishboneSub.replace("{a}", topNcrType).replace("{b}", fmtTanggal(todayISO()))} action={<Badge tone="amber">4M</Badge>} />
                <div className="grid grid-cols-1 gap-2.5 p-5 pt-2 sm:grid-cols-2">
                  {fishbones.map((f) => (
                    <div key={f.tulang} className="rounded-xl border border-steel-100 bg-surface p-3">
                      <p className="text-sm font-semibold text-navy-900">{f.tulang}</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-steel-600">
                        {f.sebab.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <Card>
              <CardHeader title={S.drilldownNcr} subtitle={S.drilldownSub.replace("{n}", fmtTanggal(todayISO()))} />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><SortTh label={S.sortCategory} sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortIncidents} sortKey="kejadian" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortImpact} sortKey="dampak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.sortTrend}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(drilldown, sort, (d, key) =>
                      key === "kejadian" ? Number(d.count ?? 0) : key === "dampak" ? Number(d.impact ?? 0) : String(d.factor ?? "")
                    ).map((d) => (
                      <tr key={d.factor} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900">{d.factor}</td>
                        <td className="td text-steel-600">{d.count}</td>
                        <td className="td text-steel-600">{d.impact}%</td>
                        <td className="td"><div className="w-32"><ProgressBar value={d.impact} tone="red" /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <CardHeader title={S.revenuePerBranch} subtitle={S.contractPerBranchLive} />
              <div className="space-y-3 p-5 pt-2">
                {branchRows.map(([branch, value]) => {
                  const maxBranch = branchRows.length ? branchRows[0][1] : 1;
                  return (
                    <div key={branch}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-steel-700">{branch} {S.projectCountParen.replace("{n}", String(data.projects.filter((p) => p.branch === branch).length))}</span>
                        <span className="font-semibold text-navy-900">Rp {(value / 1000000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M</span>
                      </div>
                      <ProgressBar value={maxBranch ? (value / maxBranch) * 100 : 0} tone="navy" />
                    </div>
                  );
                })}
                {branchRows.length === 0 && <p className="text-sm text-steel-400">{S.noProjectData}</p>}
              </div>
            </Card>
          </div>
        )}

        {tab === "Prediktif" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label={S.forecastAnnual} value={`Rp ${forecastAnnualAdj.toLocaleString("id-ID")} M`} delta={S.whatifDelta.replace("{n}", `${growth >= 0 ? "+" : ""}${growth}`)} deltaDirection={growth > 0 ? "up" : growth < 0 ? "down" : "flat"} icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={forecastAdj.map((f) => ({ name: f.name, v: f.forecast ?? 0 }))} />
              <KpiCard label={S.drydockConflict} value={dockConflict ? S.slotCount.replace("{n}", String(dockConflict)) : S.safeLabel} delta={dockConflict ? S.needFix : S.noOverlap} deltaDirection={dockConflict ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={slotTrend} />
              <KpiCard label={S.criticalStock} value={S.itemCount.replace("{n}", String(lowStock.length))} delta={lowStock.slice(0, 2).map((i) => i.name.split(" ").slice(0, 2).join(" ")).join(" · ") || S.allSafe} deltaDirection={lowStock.length ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="amber" spark={lowStockTrend} />
              <KpiCard label={S.riskyProjects} value={S.riskyCount.replace("{n}", String(atRisk))} delta={S.lateOverBudget} deltaDirection={atRisk ? "down" : "up"} icon={<Clock className="h-5 w-5" />} chip="violet" spark={activeProjectTrend} />
            </div>
            <Card>
              <CardHeader title={S.whatifGrowth} subtitle={S.whatifBaseline.replace("{n}", forecastAnnual.toLocaleString("id-ID"))} action={<Badge tone="violet">{`${growth >= 0 ? "+" : ""}${growth}%`}</Badge>} />
              <div className="flex flex-col gap-3 p-5 pt-2">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[11px] text-steel-400">{S.marketGrowth}</p><p className="font-bold text-navy-900">{growth}%</p></div>
                  <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[11px] text-steel-400">{S.costSuppress}</p><p className="font-bold text-navy-900">{costAdj}%</p></div>
                  <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[11px] text-steel-400">{S.progressShift}</p><p className="font-bold text-navy-900">{progAdj}%</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to="/pengaturan" className="btn-secondary text-xs">{S.changeInSettings}</Link>
                </div>
                <p className="text-sm text-steel-600">{S.forecastSimulated.replace("{a}", `Rp ${forecastAnnualAdj.toLocaleString("id-ID")} M`).replace("{b}", marginLive.toLocaleString("id-ID", { maximumFractionDigits: 1 })).replace("{c}", fmtTanggal(todayISO()))}</p>
                <p className="text-xs text-steel-400">{S.whatifAssumption}</p>
              </div>
            </Card>
            <Card>
              <CardHeader title={S.savedScenarios} subtitle={S.savedScenariosSub} />
              <div className="flex flex-wrap gap-2 p-5 pt-2">
                <input className="input w-48" placeholder={S.scenarioNamePh} value={scName} onChange={(e) => setScName(e.target.value)} />
                <button className="btn-secondary text-xs" onClick={saveScenario}>{S.saveScenarioBtn}</button>
              </div>
              <div className="space-y-1.5 px-5 pb-2 text-sm">
                {scenarios.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                    <span className="font-semibold text-navy-900">{s.name}</span>
                    <span className="text-xs text-steel-500">{S.scenarioMeta.replace("{a}", String(s.growth)).replace("{b}", String(s.costAdj)).replace("{c}", String(s.progAdj)).replace("{n}", annualFor(s).toLocaleString("id-ID"))}</span>
                    <span className="ml-auto flex gap-1.5">
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => loadScenario(s.name)}>{S.applyBtn}</button>
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => delScenario(s.name)}>{S.deleteBtn}</button>
                    </span>
                  </div>
                ))}
                {scenarios.length === 0 && <p className="text-xs text-steel-400">{S.noScenarios}</p>}
              </div>
              {scenarios.length >= 1 && (
                <div className="space-y-2 px-5 pb-5 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <select className="input w-44" value={cmpA} onChange={(e) => setCmpA(e.target.value)}>
                      <option value="">{S.scenarioA}</option>
                      {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                    <select className="input w-44" value={cmpB} onChange={(e) => setCmpB(e.target.value)}>
                      <option value="">{S.scenarioB}</option>
                      {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  {cmpA && cmpB && (() => {
                    const a = scenarios.find((s) => s.name === cmpA);
                    const b = scenarios.find((s) => s.name === cmpB);
                    if (!a || !b) return null;
                    return (
                      <table className="w-full text-xs">
                        <thead className="bg-surface"><tr><SortTh label={S.paramLabel} sortKey="param" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={a.name} sortKey="a" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={b.name} sortKey="b" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /></tr></thead>
                        <tbody className="divide-y divide-steel-100">
                          {sortRows(
                            [
                              { param: S.paramGrowth, av: Number(a.growth), bv: Number(b.growth), unit: "%" },
                              { param: S.paramCost, av: Number(a.costAdj), bv: Number(b.costAdj), unit: "%" },
                              { param: S.paramProgress, av: Number(a.progAdj), bv: Number(b.progAdj), unit: "%" },
                              { param: S.paramForecastYear, av: annualFor(a), bv: annualFor(b), unit: "Rp" },
                            ],
                            sort2,
                            (r, key) => key === "a" ? Number(r.av) : key === "b" ? Number(r.bv) : String(r.param)
                          ).map((r) => (
                            <tr key={r.param}>
                              <td className={r.param === "Forecast/thn" ? "td font-semibold" : "td"}>{r.param}</td>
                              <td className={r.param === "Forecast/thn" ? "td font-semibold" : "td"}>{r.unit === "Rp" ? `Rp ${Number(r.av).toLocaleString("id-ID")} M` : `${r.av}%`}</td>
                              <td className={r.param === "Forecast/thn" ? "td font-semibold" : "td"}>{r.unit === "Rp" ? `Rp ${Number(r.bv).toLocaleString("id-ID")} M` : `${r.bv}%`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title={S.forecastRevenue} subtitle={`${S.forecastBand} · Bulan berjalan paling kanan`} action={<span className="flex gap-1.5"><Badge tone="blue">{S.aiPrediction}</Badge><button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-forecast", "forecast-pendapatan")}>{S.exportPngBtn}</button></span>} />
              <div id="chart-forecast" className="h-60 p-4 pt-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={forecastAdj} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                    <XAxis dataKey="name" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="high" name={S.limitTop} stroke="none" fill="#8cc9e8" fillOpacity={0.35} connectNulls />
                    <Area type="monotone" dataKey="low" name={S.limitBottom} stroke="none" fill="#ffffff" fillOpacity={0.9} connectNulls />
                    <Line type="monotone" dataKey="actual" name={S.legendActual} stroke="#dc2626" strokeWidth={2} connectNulls dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="forecast" name={S.legendForecast} stroke="#2e9ad4" strokeDasharray="6 3" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {tab === "Preskriptif" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { icon: Lightbulb, tone: "bg-navy-50 text-navy-700", title: S.allocDrydock, desc: S.allocDrydockDesc, to: "/drydock", cta: S.openDrydock },
                { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600", title: S.reorderMaterial, desc: S.reorderDesc.replace("{n}", String(lowStock.length)), to: "/procurement", cta: S.openProcurement },
                { icon: Lightbulb, tone: "bg-amber-50 text-amber-600", title: S.projectPriority, desc: S.projectPriorityDesc.replace("{n}", String(atRisk)), to: "/proyek", cta: S.openProjects },
                { icon: CheckCircle2, tone: "bg-violet-50 text-violet-700", title: S.followUpNcr, desc: S.followUpNcrDesc.replace("{n}", String(openNcr)), to: "/qc-safety", cta: S.openQc },
              ].map((r) => (
                <Card key={r.title} className="card-hover p-5">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2 ${r.tone}`}><r.icon className="h-5 w-5" /></div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-navy-900">{r.title}</h3>
                      <p className="mt-1 text-sm text-steel-600">{r.desc}</p>
                      <Link to={r.to} className="mt-2 inline-flex text-sm font-semibold text-ocean-600 hover:underline">{r.cta} →</Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === "Profitabilitas" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label={S.totalPortfolioProfit} value={fmtMiliar(profitByType.reduce((s, d) => s + d.profit * 1000000000, 0))} delta={`${data.projects.length} proyek`} deltaDirection="flat" icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
              <KpiCard label={S.reworkCost} value={fmtRupiah(reworkCost)} delta={S.runningEstimate} deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={ncrTrend} />
              <KpiCard label={S.utilVsTarget} value={`${lastUtil}% / ${utilTarget}%`} delta={lastUtil >= utilTarget ? S.targetReached : S.belowTarget} deltaDirection={lastUtil >= utilTarget ? "up" : "down"} icon={<Clock className="h-5 w-5" />} chip="teal" spark={sparkProjects} />
              <KpiCard label={S.mostProfitableType} value={profitByType.length ? [...profitByType].sort((a, b) => b.profit - a.profit)[0].name : "-"} delta={profitByType.length ? fmtMiliar([...profitByType].sort((a, b) => b.profit - a.profit)[0].profit * 1000000000) : "-"} deltaDirection="flat" icon={<Eye className="h-5 w-5" />} chip="violet" spark={sparkMargin} />
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title={S.profitPerType} subtitle={S.budgetActualPer.replace("{n}", fmtTanggal(todayISO()))} action={<button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-profittype", "profit-tipe")}>{S.exportPngBtn}</button>} />
                <div id="chart-profittype" className="h-60 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitByType} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Bar dataKey="profit" name={S.profitLabel} fill="#0b3a63" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title={S.profitPerBranch} subtitle={S.budgetActualPer.replace("{n}", fmtTanggal(todayISO()))} action={<button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-profitbranch", "profit-cabang")}>{S.exportPngBtn}</button>} />
                <div id="chart-profitbranch" className="h-60 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitByBranch} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Bar dataKey="profit" name={S.profitLabel} fill="#2e9ad4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Utilisasi vs Target" subtitle={S.avgProgressVsTarget.replace("{a}", String(avgProgress)).replace("{b}", String(utilTarget))} />
                <div className="space-y-3 p-5 pt-2">
                  <ProgressBar value={utilTarget ? (lastUtil / utilTarget) * 100 : 0} tone={lastUtil >= utilTarget ? "green" : "amber"} />
                  <p className="text-xs text-steel-500">{S.utilFromTarget.replace("{a}", String(lastUtil)).replace("{b}", String(utilTarget)).replace("{n}", String(data.projects.length))}</p>
                </div>
              </Card>
              <Card>
                <CardHeader title={S.reworkCost} subtitle={S.reworkFormula} />
                <div className="space-y-2 p-5 pt-2 text-sm">
                  <div className="flex justify-between"><span className="text-steel-600">{S.negativeChangeOrder}</span><span className="font-semibold text-navy-900">{fmtRupiah(negCo)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-600">{S.ncrEstimateLabel.replace("{n}", String(openNcrProjects.size))}</span><span className="font-semibold text-navy-900">{fmtRupiah(Math.round(ncrEstimate))}</span></div>
                  <div className="flex justify-between border-t border-steel-100 pt-2"><span className="font-semibold text-navy-900">{S.totalRework}</span><span className="font-bold text-rose-600">{fmtRupiah(reworkCost)}</span></div>
                </div>
              </Card>
            </div>
          </div>
        )}
        <Card className="mt-5">
          <CardHeader title={S.annotationTitle.replace("{n}", tab)} subtitle={S.notesPerTab} />
          <div className="flex flex-col gap-2 p-5 pt-2">
            <textarea className="input" rows={2} value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder={S.insightPh.replace("{n}", tab)} />
            <div><button className="btn-secondary text-xs" onClick={saveNote}>{S.saveNoteBtn}</button></div>
            <div className="space-y-1.5">
              {(notes[tab] ?? []).map((n, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-sm text-steel-700">
                  <span className="flex-1">{n}</span>
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => delNote(i)}>{S.deleteBtn}</button>
                </div>
              ))}
              {(notes[tab] ?? []).length === 0 && <p className="text-xs text-steel-400">{S.noNotesForTab}</p>}
            </div>
          </div>
        </Card>
      </div>

      {/* Section cetak PDF tersembunyi: TANPA chart/grafik — SVG recharts berisiko
          blank saat di-raster oleh html2canvas, jadi hanya KPI + tabel + list teks. */}
      <div id="analytics-pdf" style={{ position: "absolute", left: -9999, top: 0, width: 1000, background: "#ffffff", padding: 24, fontSize: 12, color: "#000" }}>
        <div style={{ textAlign: "center", borderBottom: "3px solid #0B3A63", paddingBottom: 12, marginBottom: 12, breakInside: "avoid", pageBreakInside: "avoid" }}>
          <p style={{ fontWeight: 800, fontSize: 18, color: "#0B3A63", margin: 0 }}>PT. SYUKUR BERSAUDARA</p>
          <p style={{ fontSize: 11, color: "#33475B", margin: 0 }}>PERUSAHAAN GALANGAN DAN INDUSTRI KAPAL</p>
          <p style={{ fontSize: 10, color: "#52697C", margin: 0 }}>KANTOR PUSAT SAMARINDA - KALIMANTAN TIMUR</p>
        </div>
        <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>ISMS Galangan - Laporan Analitik</h1>
          <p style={{ fontSize: 11 }}>{fmtTanggal(todayISO())}</p>
        </div>

        <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 16 }}>{S.tabDescriptive}</h2>
          <p style={{ fontSize: 11 }}>
            {S.kpiRevenueYtd}: Rp {totalRevenue.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M
            ({revGrowth >= 0 ? "+" : ""}{revGrowth.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%) ·{" "}
            {S.kpiAvgMargin}: {avgMargin.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
            ({marginDiff >= 0 ? "+" : ""}{marginDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })}pt) ·{" "}
            {S.kpiAvgProgress}: {avgProgress}% · {S.kpiOpenNcr}: {openNcr}
          </p>
        </div>
        <table style={pdfTable}>
          <thead><tr><th style={pdfTh}>Bulan</th><th style={pdfTh}>Pendapatan (M Rp)</th><th style={pdfTh}>Biaya (M Rp)</th></tr></thead>
          <tbody>
            {revDisp.map((d) => (
              <tr key={d.bln}><td style={pdfTd}>{d.bln}</td><td style={pdfTd}>{d.revenue}</td><td style={pdfTd}>{d.cost}</td></tr>
            ))}
          </tbody>
        </table>

        {/* Grafik untuk PDF: exportPDF meraster SVG -> PNG, jadi chart ikut terbawa. */}
        <div style={{ breakInside: "avoid", pageBreakInside: "avoid", marginTop: 8 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>Grafik pendapatan & margin per bulan (bulan berjalan paling kanan)</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revDisp} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                <XAxis dataKey="bln" tick={{ fontSize: 9 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                <Bar dataKey="revenue" name="Pendapatan (M Rp)" fill="#0b3a63" barSize={14} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="cost" name="Biaya (M Rp)" stroke="#f59e0b" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ breakInside: "avoid", pageBreakInside: "avoid", marginTop: 8 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>Grafik margin (%) & inspeksi lulus</h3>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marDisp} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                <XAxis dataKey="bln" tick={{ fontSize: 9 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                <Line type="monotone" dataKey="margin" name="Margin (%)" stroke="#1f9d55" strokeWidth={2} dot={false} />
                <ReferenceLine y={0} stroke="#cbd5e1" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 16, breakAfter: "avoid", pageBreakAfter: "avoid" }}>{S.tabDiagnostic}</h2>
        <table style={pdfTable}>
          <thead><tr><th style={pdfTh}>{S.sortCategory}</th><th style={pdfTh}>{S.sortIncidents}</th><th style={pdfTh}>{S.sortImpact}</th></tr></thead>
          <tbody>
            {drilldown.map((d) => (
              <tr key={d.factor}><td style={pdfTd}>{d.factor}</td><td style={pdfTd}>{d.count}</td><td style={pdfTd}>{d.impact}%</td></tr>
            ))}
          </tbody>
        </table>
        <table style={pdfTable}>
          <thead><tr><th style={pdfTh}>{S.sortCategory}</th><th style={pdfTh}>{S.sortIncidents}</th><th style={pdfTh}>{S.legendCumulative} %</th></tr></thead>
          <tbody>
            {pareto.map((p) => (
              <tr key={p.name}><td style={pdfTd}>{p.name}</td><td style={pdfTd}>{p.count}</td><td style={pdfTd}>{p.kum}%</td></tr>
            ))}
          </tbody>
        </table>
        <ul style={{ fontSize: 11, paddingLeft: 16, breakInside: "avoid", pageBreakInside: "avoid" }}>
          {fishbones.map((f) => (
            <li key={f.tulang}><strong>{f.tulang}:</strong> {f.sebab.join("; ")}</li>
          ))}
        </ul>
        <table style={pdfTable}>
          <thead><tr><th style={pdfTh}>{S.branchLabel}</th><th style={pdfTh}>{S.revenueLabel}</th></tr></thead>
          <tbody>
            {branchRows.map(([branch, value]) => (
              <tr key={branch}><td style={pdfTd}>{branch}</td><td style={pdfTd}>Rp {(value / 1000000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M</td></tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 16, breakAfter: "avoid", pageBreakAfter: "avoid" }}>{S.tabPredictive}</h2>
        <p style={{ fontSize: 11, breakInside: "avoid", pageBreakInside: "avoid" }}>
          {S.forecastAnnual}: Rp {forecastAnnualAdj.toLocaleString("id-ID")} M · {S.kpiAvgMargin}: {marginLive.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% ·{" "}
          {S.drydockConflict}: {dockConflict} · {S.criticalStock}: {lowStock.length} · {S.riskyProjects}: {atRisk}
        </p>
        <table style={pdfTable}>
          <thead><tr><th style={pdfTh}>Bulan</th><th style={pdfTh}>{S.legendActual}</th><th style={pdfTh}>{S.legendForecast}</th><th style={pdfTh}>{S.limitBottom}</th><th style={pdfTh}>{S.limitTop}</th></tr></thead>
          <tbody>
            {forecastAdj.map((f) => (
              <tr key={f.name}><td style={pdfTd}>{f.name}</td><td style={pdfTd}>{f.actual ?? "-"}</td><td style={pdfTd}>{f.forecast ?? "-"}</td><td style={pdfTd}>{f.low ?? "-"}</td><td style={pdfTd}>{f.high ?? "-"}</td></tr>
            ))}
          </tbody>
        </table>
        {scenarios.length > 0 && (
          <table style={pdfTable}>
            <thead><tr><th style={pdfTh}>{S.savedScenarios}</th><th style={pdfTh}>{S.paramForecastYear}</th></tr></thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.name}><td style={pdfTd}>{s.name} (+{s.growth}% / {s.costAdj}% / {s.progAdj}%)</td><td style={pdfTd}>Rp {annualFor(s).toLocaleString("id-ID")} M</td></tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 16 }}>{S.tabPrescriptive}</h2>
          <ol style={{ fontSize: 11, paddingLeft: 16 }}>
            <li><strong>{S.allocDrydock}:</strong> {S.allocDrydockDesc}</li>
            <li><strong>{S.reorderMaterial}:</strong> {S.reorderDesc.replace("{n}", String(lowStock.length))}</li>
            <li><strong>{S.projectPriority}:</strong> {S.projectPriorityDesc.replace("{n}", String(atRisk))}</li>
            <li><strong>{S.followUpNcr}:</strong> {S.followUpNcrDesc.replace("{n}", String(openNcr))}</li>
          </ol>
        </div>

        <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 16 }}>{S.tabProfitability}</h2>
          <p style={{ fontSize: 11 }}>
            {S.totalPortfolioProfit}: {fmtMiliar(profitByType.reduce((s, d) => s + d.profit * 1000000000, 0))} ·{" "}
            {S.reworkCost}: {fmtRupiah(reworkCost)} · {S.utilVsTarget}: {lastUtil}% / {utilTarget}%
          </p>
        </div>
        <table style={pdfTable}>
          <thead><tr><th style={pdfTh}>{S.projectLabel}</th><th style={pdfTh}>{S.profitLabel} (M Rp)</th><th style={pdfTh}>{S.itemCountSuffix.replace("{n}", "")}</th></tr></thead>
          <tbody>
            {profitByType.map((r) => (
              <tr key={r.name}><td style={pdfTd}>{r.name}</td><td style={pdfTd}>{r.profit}</td><td style={pdfTd}>{r.count}</td></tr>
            ))}
          </tbody>
        </table>
        <table style={pdfTable}>
          <thead><tr><th style={pdfTh}>{S.branchLabel}</th><th style={pdfTh}>{S.profitLabel} (M Rp)</th><th style={pdfTh}>{S.itemCountSuffix.replace("{n}", "")}</th></tr></thead>
          <tbody>
            {profitByBranch.map((r) => (
              <tr key={r.name}><td style={pdfTd}>{r.name}</td><td style={pdfTd}>{r.profit}</td><td style={pdfTd}>{r.count}</td></tr>
            ))}
          </tbody>
        </table>
        <table style={pdfTable}>
          <tbody>
            <tr><td style={pdfTd}>{S.negativeChangeOrder}</td><td style={pdfTd}>{fmtRupiah(negCo)}</td></tr>
            <tr><td style={pdfTd}>{S.ncrEstimateLabel.replace("{n}", String(openNcrProjects.size))}</td><td style={pdfTd}>{fmtRupiah(Math.round(ncrEstimate))}</td></tr>
            <tr><td style={pdfTd}><strong>{S.totalRework}</strong></td><td style={pdfTd}><strong>{fmtRupiah(reworkCost)}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
