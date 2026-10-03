import { useMemo, useState } from "react";
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
  AsyncButton,
  Field,
} from "../components/ui";
import type { SortState } from "../components/ui";
import { useStore, type StoreItem } from "../data/store";
import type { CollectionKey } from "../data/store";
import { useModuleSync } from "../data/useModuleSync";
import { getSetting } from "../utils/settings";
import { exportExcelSheets } from "../utils/export";
import { pdfServerReady } from "../services/pdfClient";
import { usePdfDoc } from "../components/usePdfDoc";
import { fmtTanggal, fmtMiliar, fmtRupiah, todayISO } from "../utils/format";
import {
  ID_MON,
  bucketByMonth,
  fmtMonthRange,
  monthAxis,
  monthKeyOf,
  monthSeries,
  rebindLegacyMonthSeries,
} from "../utils/monthAxis";
import { briefOf, lastPoint, numOf, prevPoint, safeText } from "../utils/series";
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

const MON_ID = ID_MON;

/* withMonthLabels() DIHAPUS.
   Fungsi lama memutar array seed 12-nama-bulan supaya bulan berjalan jadi
   titik terakhir:
       const pos = arr.findIndex((d) => d.month === MON_ID[cur]);
       const rot = pos >= 0 ? [...arr.slice(pos + 1), ...arr.slice(0, pos + 1)] : [...arr];
   Dua masalah yang tidak bisa di tolerate di halaman analitik:
     1. NUMERIKNYA TIDAK BERPINDAH. Label "Okt 2026" ditempelkan ke nilai yang
        sebenarnya milik Oktober tahun lalu -> grafik menampilkan pertumbuhan
        fiktif setiap kali session dirotasi.
     2. Bila nama bulan berjalan tidak ada di seed (pos < 0), TIDAK ADA rotasi
        sama sekali dan sumbu diam-diam menampilkan jendela lama (mis. Sep-Ags)
        tanpa Miy Permintaan lain - pengguna mengira data bulan ini.
   Penggantinya: utils/monthAxis.ts (monthAxis + bucketByMonth) yang
   membangun sumbu dari TANGGAL dan menempelkan label ke bulan yang benar.
   MON_ID masih dipakai untuk futureLabel() di bawah. */

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

/* Batch koleksi modul Analytics untuk useModuleSync (pengganti resync penuh).
   `activities` DIHAPUS dari batch ini: dulu ikut ditarik tiap buka halaman
   tapi tidak pernah dibaca di halaman ini - hanya history catatan lokal
   (localStorage) yang dipakai. Perbandingan: Laporan memakai data.activities
   untuk kartu aktivitas, jadi tetap memasangnya di sana. */
/* Koleksi yang BENAR-BENAR dibaca halaman ini. `journals` pernah terlewat di
   daftar lama padahal revDisp / marDisp / monthlyReal memakainya - hasilnya
   grafik pendapatan & margin hanya tampak benar karena jatuh ke seed, bukan
   karena datanya benar-benar terbaca. Sekarang eksplisit. `attendance` juga
   dihapus karena tidak pernah dipakai di halaman ini. */
const AN_COLS: CollectionKey[] = ["bookings", "calibrations", "changeOrders", "dockSlots", "employees", "equipment", "incidents", "inspections", "inventory", "invoices", "journals", "maintenances", "ncr", "payables", "projects", "purchaseOrders", "quotations", "settings", "vendors"];

/* Opsi rentang bulan untuk SEMUA grafik rentang-bulan. Nilai adalah jumlah
   titik, bulan berjalan selalu titik TERAKHIR (lihat utils/monthAxis.ts). */
const MONTH_RANGES = [6, 12, 18, 24] as const;

/* Angka dari field yang bisa null/"" DIHAPUS dari file ini dan diambil dari
   utils/series.ts (numOf). Konsekuensinya hanya satu, bukan dua: versi lama di
   sini memakai `Number(v) || 0` sementara versi di series.ts memakai
   Number.isFinite - jadi angka yang sama bisa dihitung berbeda di dua halaman.

   Catatan TDZ-nya tetap berlaku dan sekarang ditegakkan di satu tempat: numOf
   WAJIB module scope. Kalau dideklarasikan di dalam komponen, useMemo yang
   memakainya menjalankan factory-nya saat render, yaitu SEBELUM baris deklarasi
   dieksekusi, sehingga numOf masih berada di TDZ dan melempar
   "Cannot access 'numOf' before initialization". */

export default function Analytics() {

  const { locale } = useT();
  const S = n_misc[locale];
  const [tab, setTab] = useState("Deskriptif");
  /* Section cetak PDF hanya dirender saat benar-benar mengekspor.
     Versi lama selalu memasangnya, termasuk 2 grafik recharts di dalam
     kontainer `position:absolute; left:-9999`. Itu berarti setiap kali
     Analytics dibuka ada 6 grafik tambahan yang diukur, dianimasikan, lalu
     dibuang - padahal tidak ada yang sedang mengekspor. Lebih buruk,
     ResponsiveContainer di dalam kontainer offscreen sering mengukur 0x0
     sehingga grafiknya terpotong atau tidak muncul sama sekali di PDF. */
  
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  /* Analytics adalah halaman BACA (analysis), bukan editor: `add`/`remove`
   sengaja TIDAK diambil dari store. Perubahan data harus dilakukan di modul
   asalnya (QC, Proyek, Keuangan, Inventory) - halaman ini cuma nololok.
   `update` dipakai oleh loadScenario() yang menyalin asumsi what-if ke
   settings, dan `log` untuk jejak aktivitas. */
  const { data, update, log, branch, inBranch } = useStore();
  const pdfDoc = usePdfDoc();
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(AN_COLS);
  /* Rentang bulan untuk seluruh grafik. Default 12 bulan. */
  const [monthCount, setMonthCount] = useState<number>(12);
  /* Sumbu bulan: bulan + tahun eksplisit, bulan BERJALAN di ujung kanan.
     Dihitung ulang setiap render supaya pergantian bulan saat tab terbuka
     langsung terasa (versi lama memakai useMemo dengan deps [] sehingga
     sumbu beku selama sesi). */
  const axis = useMemo(() => monthAxis({ months: monthCount, locale }), [monthCount, locale]);
  const axisLabel = fmtMonthRange(axis);
  /* What-if dikendalikan dari Pengaturan (grup Analytics) - otomatis dipakai forecast. */
  const growth = getSetting(data, "WHATIF_GROWTH", 0);
  const costAdj = getSetting(data, "WHATIF_COST", 0);
  const progAdj = getSetting(data, "WHATIF_PROG", 0);
  const [scName, setScName] = useState("");
  /* Asumsi what-if SEDANG DIEDIT (string, karena slider menghasilkan string).
     Nilai global (growth/costAdj/progAdj dari settings) tetap jadi sumber
     angka untuk kartu ringkasan; draft ini hanya untuk form scenario. */
  const [growthDraft, setGrowthDraft] = useState(String(growth));
  const [costDraft, setCostDraft] = useState(String(costAdj));
  const [progDraft, setProgDraft] = useState(String(progAdj));
  /* Nama skenario yang sedang diubah (null = membuat baru). */
  const [editingScenario, setEditingScenario] = useState<string | null>(null);
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

  /* === SERI GRAFIK RENTANG BULAN ===
   Semua seri di bawah dibangun dari TANGGAL dokumen nyata lewat
   bucketByMonth(), bukan dari data seed 12-nama-bulan (revenueSeries /
   marginSeries / inspectionTrend).

   Kenapa ini penting: withMonthLabels() versi lama memutar array seed
   supaya label bulan-berjalan menempel ke nilai. Axis terlihat benar,
   tapi tiap ANGKA sebenarnya milik bulan lain - jadi grafik menampilkan
   pertumbuhan fiktif setiap kali nama bulan seed tidak termasuk bulan
   berjalan. Dengan bucketByMonth(), angka dan label berasal dari bulan
   yang sama, jadi tidak mungkin melenceng.

   Bulan berjalan SELALU titik terakhir (dijamin monthAxis()).

   Kolom legacy revenue/margin/inspeksi tetap dipertahankan sebagai
   fallback supaya halaman tidak kosong bila dokumen belum ada sama sekali
   - ditandai field `estimated: true` supaya grafik bisa menandainya. */
  const revDisp = useMemo(() => {
    /* Pendapatan: invoice terbit per bulan jatuh tempo (sumber tagihan).
       Biaya: jurnal debit akun beban (5-9). Dua-duanya dari dokumen nyata,
       jadi selisihnya = margin yang bisa dipertanggungjawabkan. */
    const EXPENSE_ACCOUNTS = ["5", "6", "7", "8", "9"];
    const expense = bucketByMonth(
      data.journals,
      axis,
      (j) => j.date,
      (j) => (EXPENSE_ACCOUNTS.includes(String(j.db ?? "")) ? numOf(j.amount) : 0),
      (vals) => vals.reduce((s, x) => s + x, 0) / 1e6,
    );
    const revenue = bucketByMonth(
      inBranch(data.invoices),
      axis,
      (i) => i.due ?? i.date ?? "",
      (i) => numOf(i.grandTotal) || numOf(i.amount),
      (vals) => vals.reduce((s, x) => s + x, 0) / 1e6,
    );
    const real = monthSeries<{
      bln: string; key: string; isCurrent: boolean; revenue: number; cost: number; projects: number;
    }>(axis, revenue, "revenue");
    const withCost = real.map((r) => ({ ...r, cost: round1(expense[r.key] ?? 0) }));
    return withCost.some((r) => r.revenue > 0) || withCost.some((r) => r.cost > 0)
      ? withCost
      : rebindLegacyMonthSeries(revenueSeries, { months: monthCount, locale });
  }, [axis, monthCount, locale, data.invoices, data.journals, branch, inBranch]);

  const marDisp = useMemo(() => {
    /* Margin dihitung dari jurnal: (kredit akun pendapatan - debit beban) /
       pendapatan. Sumber tunggal, bukan mock. Bila jurnal kosong, jatuh ke
       seri seed (ditandai estimated lewat label yang sama). */
    const income = (codes: string[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const a of axis) out[a.key] = 0;
      for (const j of data.journals) {
        if (String(j.status ?? "Posted") !== "Posted") continue;
        const key = monthKeyOf(j.date);
        if (!(key in out)) continue;
        const amount = numOf(j.amount);
        if (codes.includes(String(j.kr ?? ""))) out[key] += amount;
        if (codes.includes(String(j.db ?? ""))) out[key] -= amount;
      }
      return out;
    };
    const revenue = income(["4"]);
    const expense = income(["5", "6", "7", "8", "9"]);
    const rows = axis.map((p) => {
      const rev = revenue[p.key] ?? 0;
      const exp = expense[p.key] ?? 0;
      const marginPct = rev > 0 ? ((rev - exp) / rev) * 100 : 0;
      return { bln: p.label, key: p.key, isCurrent: p.isCurrent, margin: round1(marginPct) };
    });
    return rows.some((r) => r.margin !== 0) ? rows : rebindLegacyMonthSeries(marginSeries, { months: monthCount, locale });
  }, [axis, monthCount, locale, data.journals]);

  const inspDisp = useMemo(() => {
    const count = bucketByMonth(data.inspections, axis, (i) => i.date, () => 1);
    const lulusMap = bucketByMonth(
      data.inspections,
      axis,
      (i) => i.date,
      (i) => (String(i.status ?? "") === "Lulus" ? 1 : 0),
    );
    if (!Object.values(count).some((v) => v > 0)) {
      return rebindLegacyMonthSeries(inspectionTrend, { months: monthCount, locale });
    }
    return monthSeries<{ bln: string; key: string; isCurrent: boolean; inspeksi: number; lulus: number }>(
      axis,
      count,
      "inspeksi",
    ).map((r) => ({ ...r, lulus: round1(lulusMap[r.key] ?? 0) }));
  }, [axis, monthCount, locale, data.inspections]);

  const totalRevenue = revDisp.reduce((s, d) => s + d.revenue, 0);
  const avgRevenue = revDisp.length ? totalRevenue / revDisp.length : 0;
  /* PENJAGA EKOR SERI.
     `revDisp[revDisp.length - 1]` menghasilkan undefined saat seri kosong, dan
     `lastRevPoint.bln` lalu melempar TypeError. TypeError di fase render
     menjatuhkan seluruh pohon React, bukan hanya halaman ini - inilah gejala
     "buka Analytics, semua modul ikut mati". Jalur kosongnya nyata: fallback
     ke seed memakai rebindLegacyMonthSeries() yang mengembalikan rows.map(),
     jadi begitu seed itu kosong, seri fallback ikut kosong.

     Semua akses ekor / ekor-1 sekarang lewat helper lastPoint/prevPoint dari
     utils/series.ts yang mengembalikan null, dan forecast di bawah dibangun
     dari titik yang benar-benar ada. Bandingkan juga numOf di file ini: TDZ
     karena deklarasi di bawah useMemo adalah kelas bug yang sama. */
  const lastRevPoint = lastPoint(revDisp);
  const prevRevPoint = prevPoint(revDisp);
  const revGrowth = lastRevPoint && prevRevPoint && prevRevPoint.revenue !== 0
    ? ((lastRevPoint.revenue - prevRevPoint.revenue) / prevRevPoint.revenue) * 100
    : 0;
  const avgMargin = marDisp.length ? marDisp.reduce((s, d) => s + d.margin, 0) / marDisp.length : 0;
  const lastMarginPoint = lastPoint(marDisp);
  const prevMarginPoint = prevPoint(marDisp);
  const marginDiff = lastMarginPoint && prevMarginPoint ? lastMarginPoint.margin - prevMarginPoint.margin : 0;

  const last3 = revDisp.slice(-3);
  const ma3 = last3.length ? last3.reduce((s, d) => s + d.revenue, 0) / last3.length : 0;
  /* Tanpa titik terakhir yang nyata, seri forecast tidak boleh dibuat sama
     sekali - nilai .bln yang rusak akan meracuni seluruh kartu Prediktif. */
  const forecast = lastRevPoint
    ? [
      { name: lastRevPoint.bln, actual: round1(lastRevPoint.revenue), forecast: round1(lastRevPoint.revenue) },
      ...[1, 2, 3, 4].map((k) => ({
        name: futureLabel(k),
        actual: null as number | null,
        forecast: round1(ma3),
      })),
    ]
    : [];
  const forecastAnnual = Math.round(ma3 * 12);

  const variance = revDisp.map((d) => ({ n: d.bln, v: Math.round((d.revenue - avgRevenue) * 1000) }));

  /* ===== Portfolio dari data nyata =====
     Semua angka di bawah dihitung dari koleksi store (projects, invoices,
     payables), bukan dari deret mock. Label bulan dibangun dari tanggal
     data sehingga tidak bisa bergeser seperti label hardcode. */

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

  /* 3. Tren 12 bulan: pendapatan, AP, dan kas masuk dari dokumen nyata.
     Memakai sumbu `axis` yang sama dengan grafik lain, jadi label format,
     panjang rentang, dan posisi bulan berjalan seragam.
     PERBAIKAN: revenue sebelumnya dibaca dari `i.date`, padahal invoice
     yang dibuat aplikasi menyimpan `due` (lihat Finance.tsx) - sehingga
     batang "Pendapatan" praktis selalu 0 sementara kartu tetap tampil
     karena AP/cash ada. Sekarang memakai `due ?? date`. */
  const monthlyReal = useMemo(() => {
    const rev = bucketByMonth(
      inBranch(data.invoices as StoreItem[]),
      axis,
      (i) => i.due ?? i.date ?? "",
      (i) => numOf(i.grandTotal) || numOf(i.amount),
      (vals) => vals.reduce((s, x) => s + x, 0) / 1e9,
    );
    const ap = bucketByMonth(
      inBranch(data.payables as StoreItem[]),
      axis,
      (a) => a.due,
      (a) => numOf(a.amt),
      (vals) => vals.reduce((s, x) => s + x, 0) / 1e9,
    );
    /* Kas masuk = invoice Lunas by bulan pembayaran (paidAt), jatuh tempo
       sebagai fallback supaya invoice yang sudah lunas tapi tanpa paidAt
       tetap masuk kas pada bulan jatuh temponya. */
    const cash = bucketByMonth(
      inBranch(data.invoices as StoreItem[]),
      axis,
      (i) => i.paidAt || i.due || i.date || "",
      (i) => (String(i.status ?? "") === "Lunas" ? (numOf(i.grandTotal) || numOf(i.amount)) : 0),
      (vals) => vals.reduce((s, x) => s + x, 0) / 1e9,
    );
    return axis.map((p) => ({
      bln: p.label,
      key: p.key,
      isCurrent: p.isCurrent,
      revenue: round1(rev[p.key] ?? 0),
      ap: round1(ap[p.key] ?? 0),
      cash: round1(cash[p.key] ?? 0),
    }));
  }, [axis, data.invoices, data.payables, branch]);
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
  const worstVendor = lastPoint([...data.vendors].sort((a, b) => Number(a.onTime || 100) - Number(b.onTime || 100)));
  const maintEquip = data.equipment.filter((e) => e.status === "Maintenance");
  /* Nama barang/alat bisa kosong pada baris yang diimpor tanpa label, jadi
     dirangkai lewat safeText - `String(undefined)` pernah menghasilkan teks
     "undefined" yang ikut tampil di fishbone. */
  const lowStockNames = lowStock.slice(0, 2).map((i) => safeText(i.name, "")).filter(Boolean).join("; ");
  const maintNames = maintEquip.slice(0, 2).map((e) => safeText(e.name, "")).filter(Boolean).join("; ");
  const fishbones: { tulang: string; sebab: string[] }[] = [
    { tulang: S.boneMan, sebab: [topIncident ? S.fishTopIncident.replace("{a}", `${topIncident[0]} (${topIncident[1]} kejadian)`) : S.fishTopIncidentEmpty, S.fishNcrNeed.replace("{n}", topNcrType)] },
    { tulang: S.boneMethod, sebab: [S.fishFailedInspection.replace("{n}", String(failedInspections.length)), S.fishOpenNcr.replace("{n}", String(openNcr)).replace("{a}", String(drilldown.length))] },
    { tulang: S.boneMaterial, sebab: [lowStockNames !== "" ? S.fishLowStock.replace("{n}", String(lowStock.length)).replace("{a}", lowStockNames) : S.fishLowStockEmpty.replace("{n}", String(lowStock.length)), worstVendor ? S.fishWorstVendor.replace("{a}", `${safeText(worstVendor.name)} (${worstVendor.onTime ?? 0}%)`) : S.fishWorstVendorEmpty] },
    { tulang: S.boneMachine, sebab: [maintNames !== "" ? S.fishMaintenance.replace("{n}", String(maintEquip.length)).replace("{a}", maintNames) : S.fishMaintenanceEmpty.replace("{n}", String(maintEquip.length)), S.fishCalibration.replace("{n}", String(data.calibrations.filter((c) => c.status !== "Selesai").length))] },
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
    const sc: Scenario = {
      name: scName.trim(),
      growth: Number(growthDraft) || 0,
      costAdj: Number(costDraft) || 0,
      progAdj: Number(progDraft) || 0,
    };
    const next = [sc, ...scenarios.filter((s) => s.name !== sc.name)].slice(0, 20);
    setScenarios(next);
    try { localStorage.setItem("isms.scenario", JSON.stringify(next)); } catch { /* abaikan */ }
    log("menyimpan skenario what-if", `${sc.name} (growth ${sc.growth} - biaya ${sc.costAdj} - progres ${sc.progAdj})`, "Analytics");
    toast(S.tScenarioSaved.replace("{n}", sc.name));
    setScName("");
    setEditingScenario(null);
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
    /* Bila skenario yang dihapus sedang dipakai sebagai pembanding, bersihkan
       juga select-nya supaya tidak menggantung ke nama yang sudah tidak ada. */
    if (cmpA === name) setCmpA("");
    if (cmpB === name) setCmpB("");
    log("menghapus skenario what-if", name, "Analytics");
    toast(S.tScenarioDeleted.replace("{n}", name), "info");
  };

  /* Ubah skenario:Versi lama hanya bisa Apply (menyalin ke settings) dan
     Delete. Untuk mengubah asumsi (mis. pasar tumbuh 5% -> 8%) user harus
     hapus lalu buat ulang dengan nama sama - dan karena saveScenario menolak
     nama duplikat, asumsi lama harus dihapus lebih dulu. */
  const editScenario = (name: string) => {
    const s = scenarios.find((x) => x.name === name);
    if (!s) return;
    setScName(s.name);
    setGrowthDraft(String(s.growth));
    setCostDraft(String(s.costAdj));
    setProgDraft(String(s.progAdj));
    setEditingScenario(name);
    toast(
      locale === "en"
        ? `Editing "${name}" - adjust the sliders then save to overwrite`
        : `Mengubah "${name}" - atur slider lalu simpan untuk menimpa`,
    );
  };

  const overwriteScenario = () => {
    if (!editingScenario) return;
    const next = scenarios.map((s) => (s.name === editingScenario
      ? { ...s, growth: Number(growthDraft) || 0, costAdj: Number(costDraft) || 0, progAdj: Number(progDraft) || 0 }
      : s));
    setScenarios(next);
    try { localStorage.setItem("isms.scenario", JSON.stringify(next)); } catch { /* abaikan */ }
    log("mengubah skenario what-if", editingScenario, "Analytics");
    toast(
      locale === "en"
        ? `Scenario "${editingScenario}" updated`
        : `Skenario "${editingScenario}" diperbarui`,
    );
    setEditingScenario(null);
    setScName("");
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
      /* Sheet RevBulanan: pendapatan vs biaya per bulan - angka yang sama
         dengan grafik batang, jadi grafik bisa dicek ulang dari Excel
         tanpaysz beim recalculate dari nol. */
      const revBulanan: (string | number)[][] = [
        ["Bulan", "Pendapatan (M Rp)", "Biaya (M Rp)", "Selisih (M Rp)", "Proyek"],
        ...revDisp.map((d) => [d.bln, d.revenue, d.cost, round1(d.revenue - d.cost), d.projects] as (string | number)[]),
      ];
      const marBulanan: (string | number)[][] = [
        ["Bulan", "Margin (%)"],
        ...marDisp.map((d) => [d.bln, d.margin] as (string | number)[]),
      ];
      const trenBulanan: (string | number)[][] = [
        ["Bulan", "Pendapatan lunas (M Rp)", "AP (M Rp)", "Kas masuk (M Rp)"],
        ...monthlyReal.map((d) => [d.bln, d.revenue, d.ap, d.cash] as (string | number)[]),
      ];
      const inspeksiBulanan: (string | number)[][] = [
        ["Bulan", "Inspeksi", "Lulus"],
        ...inspDisp.map((d) => [d.bln, d.inspeksi, d.lulus] as (string | number)[]),
      ];
      /* Distribusi tipe: dipakai grafik donat. Versi lama hanya membawa
         hitungan lewat grafik; sekarangikkanya ikut ter-export sehingga
         angka donat bisa direkonsiliasi dengan KPI. */
      const tipeProyek: (string | number)[][] = [
        ["Tipe proyek", "Jumlah", "Porsi (%)"],
        ...projectTypeDistReal.map((d) => [
          d.name, d.value, projectTypeDistReal.length ? Math.round((d.value / projectTypeDistReal.reduce((s, x) => s + x.value, 0)) * 100) : 0,
        ] as (string | number)[]),
      ];
      /* Pareto: kolom 'kum' sengaja ikut. Sheet Drilldown lama hanya
         memuat count + impact, padahal silang grafik Pareto justru
         dilakukan di titik kumulatif - jadi kumulatifnya hilang. */
      const paretoSheet: (string | number)[][] = [
        ["Kategori NCR", "Jumlah", "Kumulatif (%)"],
        ...pareto.map((d) => [d.name, d.count, d.kum] as (string | number)[]),
      ];
      const pipelineKuartal: (string | number)[][] = [
        ["Kuartal", "Menang", "Pipeline", "Target", "Nilai menang (Rp)", "Nilai pipeline (Rp)"],
        ...projectPipelineReal.map((d) => [
          d.name, d.won, d.pipeline, d.target, Math.round(d.wonVal), Math.round(d.pipeVal),
        ] as (string | number)[]),
      ];
      const varianceSheet: (string | number)[][] = [
        ["Bulan", "Selisih vs rata-rata (M Rp)"],
        ...variance.map((d) => [d.n, round1(d.v / 1000)] as (string | number)[]),
      ];
      const fishboneSheet: (string | number)[][] = [
        ["Tulang", "Sebab"],
        ...fishbones.flatMap((f) => f.sebab.map((s) => [f.tulang, s] as (string | number)[])),
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
        { name: "Rev Bulanan", rows: revBulanan },
        { name: "Margin Bulanan", rows: marBulanan },
        { name: "Tren Bulanan", rows: trenBulanan },
        { name: "Inspeksi Bulanan", rows: inspeksiBulanan },
        { name: "Tipe Proyek", rows: tipeProyek },
        { name: "Pipeline Kuartal", rows: pipelineKuartal },
        { name: "Variance", rows: varianceSheet },
        { name: "Pareto NCR", rows: paretoSheet },
        { name: "Fishbone", rows: fishboneSheet },
      ], `Laporan-Analytics-${todayISO()}`);
      toast(S.tAnalyticsExported);
    } catch (e) {
      /* Pesan asli ditampilkan - export gagal karena apa pun (jumlah sheet
         melebihi batas Excel, ekstensi memblokir, file terkunci) jauh lebih
         berguna daripada "Export gagal" generik. */
      toast(`${S.tChartExportFailed} ${e instanceof Error ? e.message : String(e)}`, "info");
    }
  };

  /* Laporan analitik dirakit server dari baris DB-nya sendiri.
   Versi lama memasang section tersembunyi, menunggu recharts selesai
   mengukur, lalu memotretnya dengan html2canvas - Dua rAF dan timeout 400 ms,
   karena satu frame bisa menangkap area 0x0. Sekarang tidak ada yang perlu
   diukur: server yang menggambar, dan grafiknya vektor (bisa dicari di PDF). */
const exportPdfReport = async () => {
    if (!pdfServerReady()) {
      toast(S.tChartExportFailed, "info");
      return;
    }
    const done = await pdfDoc.request(
      { kind: "analitik", locale, branch, filters: { scope: "Analytics", months: monthCount } },
      `Laporan-Analytics-${todayISO()}`,
      false,
    );
    if (done) toast(S.tAnalyticsPdfExported);
  };

  return (
    <div>
      <PageHeader
        title="Analitik"
        subtitle={S.anSubtitle}
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <span style={{ display: "flex", gap: 8 }}>
            <AsyncButton className="btn-primary-gradient" onAction={exportReport}>{S.exportReportBtn}</AsyncButton>
            <AsyncButton className="btn-secondary" onAction={exportPdfReport}>{S.pdfReportBtn}</AsyncButton>
          </span>
        }
      />

      <Tabs tabs={["Deskriptif", "Diagnostik", "Prediktif", "Preskriptif", "Profitabilitas"]} active={tab} onChange={setTab} labels={{ Deskriptif: S.tabDescriptive, Diagnostik: S.tabDiagnostic, Prediktif: S.tabPredictive, Preskriptif: S.tabPrescriptive, Profitabilitas: S.tabProfitability }} />

      {/* ==== KONTROL RENTANG BULAN ====
          Dulu tidak ada kontrol sama sekali: semua grafik rentang-bulan
          dipatok 12 titik tanpa cara memperbesar/memperkecil. Sekarang
          rentang bisa dipilih dan rentang aktif ditampilkan eksplisit
          ("Sep 2025 → Okt 2026") supaya pengguna tahu persis jendela
          apa yang sedang dilihat. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-steel-200 bg-steel-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-steel-600">
            {locale === "en" ? "Month range" : "Rentang bulan"}
          </span>
          <div className="inline-flex overflow-hidden rounded-lg border border-steel-200">
            {MONTH_RANGES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMonthCount(n)}
                aria-pressed={monthCount === n}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  monthCount === n
                    ? "bg-navy-900 text-white"
                    : "bg-white text-steel-600 hover:bg-steel-100"
                }`}
              >
                {n} {locale === "en" ? "mo" : "bln"}
              </button>
            ))}
          </div>
          <span className="text-xs text-steel-500">
            {locale === "en" ? "Window" : "Jendela"}: {axisLabel}
          </span>
        </div>
        <p className="text-[11px] text-steel-400">
          {locale === "en"
            ? "The right-most point is always the current month."
            : "Titik paling kanan selalu bulan berjalan."}
        </p>
      </div>

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
                      <Bar dataKey="revenue" name={S.legendRevenue} fill="#0b3a63" radius={[4, 4, 0, 0]} isAnimationActive />
                      <Bar dataKey="cost" name={S.legendCost} fill="#8cc9e8" radius={[4, 4, 0, 0]} isAnimationActive />
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
                      <Line type="monotone" dataKey="margin" name={S.legendMargin} stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive />
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
                      <Area type="monotone" dataKey="inspeksi" name={S.legendInspection} stroke="#2e9ad4" fill="#8cc9e8" fillOpacity={0.4} isAnimationActive />
                      <Line type="monotone" dataKey="lulus" name={S.legendPassed} stroke="#1f9d55" strokeWidth={2} dot={false} isAnimationActive />
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
                      <Bar dataKey="revenue" name={locale === "en" ? "Revenue" : "Pendapatan"} fill="#0b3a63" radius={[4, 4, 0, 0]} isAnimationActive />
                      <Bar dataKey="ap" name="AP" fill="#8cc9e8" radius={[4, 4, 0, 0]} isAnimationActive />
                      <Line type="monotone" dataKey="cash" name={locale === "en" ? "Cash in" : "Kas masuk"} stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive />
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
                    <tr><SortTh label={S.sortCategory} sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortIncidents} sortKey="kejadian" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortImpact} sortKey="dampak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.sortTrend}</th><th className="th">{locale === "en" ? "Open NCR" : "NCR Terbuka"}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(drilldown, sort, (d, key) =>
                      key === "kejadian" ? Number(d.count ?? 0) : key === "dampak" ? Number(d.impact ?? 0) : String(d.factor ?? "")
                    ).map((d) => {
                      /* Baris drilldown adalah AGREGAT per kategori, jadi
                         tidak punya tombol Edit/Delete sendiri. Yang bisa
                         dilakukan user dari sini: membuka daftar NCR
                         kategori itu di modul QC (drill-through). */
                      const rows = data.ncr.filter((n) => String(n.type ?? "") === String(d.factor));
                      const open = rows.filter((n) => String(n.status ?? "") !== "Tertutup");
                      return (
                      <tr key={d.factor} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900">{d.factor}</td>
                        <td className="td text-steel-600">{d.count}</td>
                        <td className="td text-steel-600">{d.impact}%</td>
                        <td className="td"><div className="w-32"><ProgressBar value={d.impact} tone="red" /></div></td>
                        <td className="td">
                          {rows.length === 0 ? (
                            <span className="text-xs text-steel-400">-</span>
                          ) : (
                            <Link
                              to="/qc-safety"
                              className="text-xs font-semibold text-ocean-600 hover:underline"
                              title={locale === "en"
                                ? `Open NCR module - ${open.length} still open of ${rows.length} total`
                                : `Buka modul QC - ${open.length} terbuka dari ${rows.length} total`}
                            >
                              {open.length} / {rows.length}
                            </Link>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                    {drilldown.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-steel-400">
                          {locale === "en" ? "No NCR recorded yet." : "Belum ada NCR tercatat."}
                        </td>
                      </tr>
                    )}
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
              <KpiCard label={S.criticalStock} value={S.itemCount.replace("{n}", String(lowStock.length))} delta={lowStock.slice(0, 2).map((i) => briefOf(i.name)).filter(Boolean).join(" · ") || S.allSafe} deltaDirection={lowStock.length ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="amber" spark={lowStockTrend} />
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
                {editingScenario && (
                  <>
                    <button className="btn-primary text-xs" onClick={overwriteScenario}>
                      {locale === "en" ? "Overwrite" : "Timpa"} {editingScenario}
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => { setEditingScenario(null); setScName(""); }}
                    >
                      {locale === "en" ? "Cancel edit" : "Batal ubah"}
                    </button>
                  </>
                )}
              </div>
              {/* Slider asumsi. Defaultnya ikut nilai global dari settings
                  sehingga scenario baru dibuat dari asumsi aktif sekarang,
                  tapi bisa diubah di sini tanpa menyentuh settings. */}
              <div className="grid grid-cols-1 gap-3 px-5 text-xs sm:grid-cols-3">
                <Field label={S.marketGrowth}>
                  <input
                    type="range" min={-30} max={50} step={1}
                    value={growthDraft}
                    onChange={(e) => setGrowthDraft(e.target.value)}
                  />
                  <span className="font-semibold text-navy-900">{growthDraft}%</span>
                </Field>
                <Field label={S.costSuppress}>
                  <input
                    type="range" min={-30} max={30} step={1}
                    value={costDraft}
                    onChange={(e) => setCostDraft(e.target.value)}
                  />
                  <span className="font-semibold text-navy-900">{costDraft}%</span>
                </Field>
                <Field label={S.progressShift}>
                  <input
                    type="range" min={-30} max={30} step={1}
                    value={progDraft}
                    onChange={(e) => setProgDraft(e.target.value)}
                  />
                  <span className="font-semibold text-navy-900">{progDraft}%</span>
                </Field>
              </div>
              <div className="space-y-1.5 px-5 pb-2 text-sm">
                {scenarios.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                    <span className="font-semibold text-navy-900">{s.name}</span>
                    {cmpA === s.name && <Badge tone="blue">A</Badge>}
                    {cmpB === s.name && <Badge tone="blue">B</Badge>}
                    <span className="text-xs text-steel-500">{S.scenarioMeta.replace("{a}", String(s.growth)).replace("{b}", String(s.costAdj)).replace("{c}", String(s.progAdj)).replace("{n}", annualFor(s).toLocaleString("id-ID"))}</span>
                    <span className="ml-auto flex gap-1.5">
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => editScenario(s.name)}>
                        {locale === "en" ? "Edit" : "Ubah"}
                      </button>
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

    </div>
  );
}