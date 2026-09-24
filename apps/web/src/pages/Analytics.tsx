import { useState } from "react";
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
} from "../components/ui";
import type { SortState } from "../components/ui";
import { useStore } from "../data/store";
import { getSetting } from "../utils/settings";
import { exportExcel } from "../utils/export";
import { fmtTanggal, fmtMiliar, fmtRupiah, todayISO } from "../utils/format";
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

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

function exportChartPNG(chartId: string, filename: string): void {
  try {
    const wrap = document.getElementById(chartId);
    const svg = wrap?.querySelector("svg");
    if (!svg) { toast("Chart belum siap diekspor", "info"); return; }
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
        if (!ctx) { toast("Canvas tidak didukung", "info"); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${filename}.png`;
        a.click();
        toast("Chart PNG diunduh");
      } catch { toast("Gagal mengekspor chart", "info"); }
    };
    img.onerror = () => toast("Gagal mengekspor chart", "info");
    img.src = url;
  } catch { toast("Gagal mengekspor chart", "info"); }
}

export default function Analytics() {
  const [tab, setTab] = useState("Deskriptif");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const { data, update } = useStore();
  /* What-if dikendalikan dari Pengaturan (grup Analytics) — otomatis dipakai forecast. */
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

  const totalRevenue = revenueSeries.reduce((s, d) => s + d.revenue, 0);
  const avgRevenue = revenueSeries.length ? totalRevenue / revenueSeries.length : 0;
  const lastRevPoint = revenueSeries[revenueSeries.length - 1];
  const prevRevPoint = revenueSeries[revenueSeries.length - 2];
  const revGrowth = prevRevPoint && prevRevPoint.revenue ? ((lastRevPoint.revenue - prevRevPoint.revenue) / prevRevPoint.revenue) * 100 : 0;
  const avgMargin = marginSeries.length ? marginSeries.reduce((s, d) => s + d.margin, 0) / marginSeries.length : 0;
  const lastMarginPoint = marginSeries[marginSeries.length - 1];
  const prevMarginPoint = marginSeries[marginSeries.length - 2];
  const marginDiff = lastMarginPoint && prevMarginPoint ? lastMarginPoint.margin - prevMarginPoint.margin : 0;

  const last3 = revenueSeries.slice(-3);
  const ma3 = last3.length ? last3.reduce((s, d) => s + d.revenue, 0) / last3.length : 0;
  const lastMonthIdx = MONTHS.indexOf(lastRevPoint.month);
  const forecast = [
    { name: lastRevPoint.month, actual: round1(lastRevPoint.revenue), forecast: round1(lastRevPoint.revenue) },
    ...[1, 2, 3, 4].map((k) => ({
      name: MONTHS[(lastMonthIdx + k + MONTHS.length) % MONTHS.length],
      actual: null as number | null,
      forecast: round1(ma3),
    })),
  ];
  const forecastAnnual = Math.round(ma3 * 12);

  const variance = revenueSeries.map((d) => ({ n: d.month, v: Math.round((d.revenue - avgRevenue) * 1000) }));

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
  const topNcrType = drilldown[0]?.factor ?? "—";
  const failedInspections = data.inspections.filter((i) => i.status === "NCR");
  const worstVendor = [...data.vendors].sort((a, b) => Number(a.onTime || 100) - Number(b.onTime || 100))[0];
  const maintEquip = data.equipment.filter((e) => e.status === "Maintenance");
  const fishbones: { tulang: string; sebab: string[] }[] = [
    { tulang: "Manusia", sebab: [`Insiden terbanyak: ${topIncident ? `${topIncident[0]} (${topIncident[1]} kejadian)` : "nihil"}`, `NCR ${topNcrType} butuh welder/inspector bersertifikat`] },
    { tulang: "Metode", sebab: [`${failedInspections.length} titik inspeksi berstatus NCR perlu ITP ulang`, `${openNcr} NCR terbuka menumpuk di ${drilldown.length} kategori`] },
    { tulang: "Material", sebab: [`${lowStock.length} item di bawah minimum (${lowStock.slice(0, 2).map((i) => String(i.name)).join("; ") || "—"})`, `Vendor on-time terendah: ${worstVendor ? `${worstVendor.name} (${worstVendor.onTime}%)` : "—"}`] },
    { tulang: "Mesin", sebab: [`${maintEquip.length} equipment dalam maintenance (${maintEquip.slice(0, 2).map((e) => String(e.name)).join("; ") || "—"})`, `${data.calibrations.filter((c) => c.status !== "Selesai").length} kalibrasi belum selesai`] },
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
    if (!scName.trim()) { toast("Nama skenario wajib diisi", "info"); return; }
    const sc: Scenario = { name: scName.trim(), growth, costAdj, progAdj };
    const next = [sc, ...scenarios.filter((s) => s.name !== sc.name)].slice(0, 20);
    setScenarios(next);
    try { localStorage.setItem("isms.scenario", JSON.stringify(next)); } catch { /* abaikan */ }
    toast(`Skenario ${sc.name} disimpan`);
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
    toast(`Skenario ${name} diterapkan ke Pengaturan`);
  };

  const delScenario = (name: string) => {
    const next = scenarios.filter((s) => s.name !== name);
    setScenarios(next);
    try { localStorage.setItem("isms.scenario", JSON.stringify(next)); } catch { /* abaikan */ }
    toast(`Skenario ${name} dihapus`, "info");
  };

  const saveNote = () => {
    if (!noteInput.trim()) { toast("Catatan kosong", "info"); return; }
    const next = { ...notes, [tab]: [...(notes[tab] ?? []), noteInput.trim()].slice(0, 20) };
    setNotes(next);
    try { localStorage.setItem("isms.notes", JSON.stringify(next)); } catch { /* abaikan */ }
    setNoteInput("");
    toast("Catatan insight disimpan");
  };

  const delNote = (idx: number) => {
    const next = { ...notes, [tab]: (notes[tab] ?? []).filter((_, i) => i !== idx) };
    setNotes(next);
    try { localStorage.setItem("isms.notes", JSON.stringify(next)); } catch { /* abaikan */ }
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

  const exportReport = () => {
    const rows: (string | number)[][] = [
      ["Bulan", "Pendapatan (M Rp)", "Biaya (M Rp)"],
      ...revenueSeries.map((d) => [d.month, d.revenue, d.cost]),
    ];
    exportExcel(rows, "Laporan Analytics");
    toast("Laporan analytics diekspor ke Excel");
  };

  return (
    <div>
      <PageHeader
        title="Analytics #ISMS"
        subtitle="Analisis 4 level — dari 'apa yang terjadi' hingga 'harus berbuat apa'"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <button className="btn-primary-gradient" onClick={exportReport}>Export Laporan</button>
        }
      />

      <Tabs tabs={["Deskriptif", "Diagnostik", "Prediktif", "Preskriptif", "Profitabilitas"]} active={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === "Deskriptif" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Revenue YTD" value={`Rp ${totalRevenue.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`} delta={`${revGrowth >= 0 ? "+" : ""}${revGrowth.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% vs bulan lalu`} deltaDirection={revGrowth > 0 ? "up" : revGrowth < 0 ? "down" : "flat"} icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
              <KpiCard label="Margin Rata-rata" value={`${avgMargin.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} delta={`${marginDiff >= 0 ? "+" : ""}${marginDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })}pt vs bulan lalu`} deltaDirection={marginDiff > 0 ? "up" : marginDiff < 0 ? "down" : "flat"} icon={<Eye className="h-5 w-5" />} chip="teal" spark={sparkMargin} />
              <KpiCard label="Rata-rata Progres" value={`${avgProgress}%`} delta={`${data.projects.length} proyek aktif`} deltaDirection="flat" icon={<Clock className="h-5 w-5" />} chip="violet" spark={sparkProjects} />
              <KpiCard label="NCR Terbuka" value={String(openNcr)} delta="Terhubung modul QC" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={ncrTrend} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Pendapatan vs Biaya" subtitle="12 bulan terakhir (milyar Rupiah)" action={<button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-rev", "pendapatan-vs-biaya")}>Export PNG</button>} />
                <div id="chart-rev" className="h-60 p-4 pt-0 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" name="Pendapatan" fill="#0b3a63" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="cost" name="Biaya" fill="#8cc9e8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title="Komposisi Jenis Pekerjaan" subtitle="Distribusi portofolio (live)" />
                <div className="flex flex-col items-center gap-3 p-4">
                  <Donut
                    data={typeDist}
                    colors={typeDist.map((d) => d.color)}
                    size={150}
                    thickness={20}
                    centerValue={String(typeDist.reduce((s, d) => s + d.value, 0))}
                    centerLabel="total"
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
              <CardHeader title="Margin Bruto & Volume Inspeksi" subtitle="Tren margin + aktivitas QC (inspeksi per bulan)" />
              <div className="grid grid-cols-1 gap-4 p-4 pt-0 lg:grid-cols-2">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={marginSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis domain={[15, 35]} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                      <Line type="monotone" dataKey="margin" name="Margin" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={inspectionTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="inspeksi" name="Inspeksi" stroke="#2e9ad4" fill="#8cc9e8" fillOpacity={0.4} isAnimationActive={false} />
                      <Line type="monotone" dataKey="lulus" name="Lulus" stroke="#1f9d55" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === "Diagnostik" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Temuan NCR per Kategori" subtitle="Terhubung modul QC — live" action={<Badge tone="red">{`${drilldown.length} kategori`}</Badge>} />
                <div className="p-5 space-y-4 pt-2">
                  {drilldown.map((d, i) => (
                    <div key={d.factor} className="flex items-center gap-4">
                      <span className={`w-7 text-center text-sm font-bold ${i < 2 ? "text-rose-600" : "text-steel-400"}`}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-steel-700">{d.factor}</span>
                          <span className="font-semibold text-navy-900">{d.impact}% impact</span>
                        </div>
                        <ProgressBar value={d.impact} tone="red" />
                        <p className="mt-0.5 text-xs text-steel-500">{d.count} kejadian tercatat</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Variance Anggaran Bulanan" subtitle="Deviasi pendapatan vs rata-rata (juta Rupiah)" />
                <div className="h-64 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={variance} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="n" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v} juta`} />} />
                      <ReferenceLine y={0} stroke="#dc2626" />
                      <Bar dataKey="v" fill="#2e9ad4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Pareto NCR per Kategori" subtitle="Bar jumlah + garis kumulatif % — live" action={<Badge tone="red">Pareto</Badge>} />
                <div className="h-64 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={pareto} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis yAxisId="kiri" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis yAxisId="kanan" orientation="right" domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v, n) => (n === "kum" ? `${v}%` : `${v} kejadian`)} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="kiri" dataKey="count" name="Kejadian" fill="#0b3a63" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="kanan" type="monotone" dataKey="kum" name="Kumulatif" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title="Fishbone Penyebab Keterlambatan" subtitle={`Top delay: NCR ${topNcrType} per ${fmtTanggal(todayISO())}`} action={<Badge tone="amber">4M</Badge>} />
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
              <CardHeader title="Drill-down NCR" subtitle={`Rincian per kategori per ${fmtTanggal(todayISO())}`} />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><SortTh label="Kategori" sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Kejadian" sortKey="kejadian" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Dampak" sortKey="dampak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">Tren</th></tr>
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
              <CardHeader title="Pendapatan per Cabang" subtitle="Nilai kontrak proyek per cabang — live" />
              <div className="space-y-3 p-5 pt-2">
                {branchRows.map(([branch, value]) => {
                  const maxBranch = branchRows.length ? branchRows[0][1] : 1;
                  return (
                    <div key={branch}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-steel-700">{branch} ({data.projects.filter((p) => p.branch === branch).length} proyek)</span>
                        <span className="font-semibold text-navy-900">Rp {(value / 1000000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M</span>
                      </div>
                      <ProgressBar value={maxBranch ? (value / maxBranch) * 100 : 0} tone="navy" />
                    </div>
                  );
                })}
                {branchRows.length === 0 && <p className="text-sm text-steel-400">Belum ada data proyek.</p>}
              </div>
            </Card>
          </div>
        )}

        {tab === "Prediktif" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Forecast Revenue 2026" value={`Rp ${forecastAnnualAdj.toLocaleString("id-ID")} M`} delta={`What-if ${growth >= 0 ? "+" : ""}${growth}%`} deltaDirection={growth > 0 ? "up" : growth < 0 ? "down" : "flat"} icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={forecastAdj.map((f) => ({ name: f.name, v: f.forecast ?? 0 }))} />
              <KpiCard label="Konflik Drydock" value={dockConflict ? `${dockConflict} slot` : "Aman"} delta={dockConflict ? "Perlu atasi" : "Tidak ada tumpang tindih"} deltaDirection={dockConflict ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={slotTrend} />
              <KpiCard label="Stok Kritis" value={`${lowStock.length} item`} delta={lowStock.slice(0, 2).map((i) => i.name.split(" ").slice(0, 2).join(" ")).join(" · ") || "Semua aman"} deltaDirection={lowStock.length ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="amber" spark={lowStockTrend} />
              <KpiCard label="Proyek Berisiko" value={`${atRisk} proyek`} delta="Terlambat / over-budget" deltaDirection={atRisk ? "down" : "up"} icon={<Clock className="h-5 w-5" />} chip="violet" spark={activeProjectTrend} />
            </div>
            <Card>
              <CardHeader title="What-if Pertumbuhan" subtitle={`Baseline Rp ${forecastAnnual.toLocaleString("id-ID")} M (MA3 × 12) — diatur di Pengaturan, otomatis dipakai`} action={<Badge tone="violet">{`${growth >= 0 ? "+" : ""}${growth}%`}</Badge>} />
              <div className="flex flex-col gap-3 p-5 pt-2">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[11px] text-steel-400">Pertumbuhan pasar</p><p className="font-bold text-navy-900">{growth}%</p></div>
                  <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[11px] text-steel-400">Biaya (±, menekan margin)</p><p className="font-bold text-navy-900">{costAdj}%</p></div>
                  <div className="rounded-xl bg-surface px-3 py-2"><p className="text-[11px] text-steel-400">Progres (±, menggeser forecast)</p><p className="font-bold text-navy-900">{progAdj}%</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to="/pengaturan" className="btn-secondary text-xs">Ubah di Pengaturan</Link>
                </div>
                <p className="text-sm text-steel-600">Forecast tahunan tersimulasi: <span className="font-bold text-navy-900">Rp {forecastAnnualAdj.toLocaleString("id-ID")} M</span> · margin live {marginLive.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% per {fmtTanggal(todayISO())}</p>
                <p className="text-xs text-steel-400">Asumsi: progres +/− menggeser revenue secara proporsional; biaya +1% menekan margin 0,3 poin; pita ±15%.</p>
              </div>
            </Card>
            <Card>
              <CardHeader title="Skenario Tersimpan" subtitle="Simpan set What-if Pengaturan + bandingkan 2 skenario" />
              <div className="flex flex-wrap gap-2 p-5 pt-2">
                <input className="input w-48" placeholder="Nama skenario…" value={scName} onChange={(e) => setScName(e.target.value)} />
                <button className="btn-secondary text-xs" onClick={saveScenario}>Simpan Skenario</button>
              </div>
              <div className="space-y-1.5 px-5 pb-2 text-sm">
                {scenarios.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                    <span className="font-semibold text-navy-900">{s.name}</span>
                    <span className="text-xs text-steel-500">+{s.growth}% / biaya {s.costAdj}% / prog {s.progAdj}% · Rp {annualFor(s).toLocaleString("id-ID")} M</span>
                    <span className="ml-auto flex gap-1.5">
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => loadScenario(s.name)}>Terapkan</button>
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => delScenario(s.name)}>Hapus</button>
                    </span>
                  </div>
                ))}
                {scenarios.length === 0 && <p className="text-xs text-steel-400">Belum ada skenario.</p>}
              </div>
              {scenarios.length >= 1 && (
                <div className="space-y-2 px-5 pb-5 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <select className="input w-44" value={cmpA} onChange={(e) => setCmpA(e.target.value)}>
                      <option value="">Skenario A…</option>
                      {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                    <select className="input w-44" value={cmpB} onChange={(e) => setCmpB(e.target.value)}>
                      <option value="">Skenario B…</option>
                      {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  {cmpA && cmpB && (() => {
                    const a = scenarios.find((s) => s.name === cmpA);
                    const b = scenarios.find((s) => s.name === cmpB);
                    if (!a || !b) return null;
                    return (
                      <table className="w-full text-xs">
                        <thead className="bg-surface"><tr><SortTh label="Param" sortKey="param" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={a.name} sortKey="a" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={b.name} sortKey="b" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /></tr></thead>
                        <tbody className="divide-y divide-steel-100">
                          {sortRows(
                            [
                              { param: "Growth", av: Number(a.growth), bv: Number(b.growth), unit: "%" },
                              { param: "Biaya", av: Number(a.costAdj), bv: Number(b.costAdj), unit: "%" },
                              { param: "Progres", av: Number(a.progAdj), bv: Number(b.progAdj), unit: "%" },
                              { param: "Forecast/thn", av: annualFor(a), bv: annualFor(b), unit: "Rp" },
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
              <CardHeader title="Forecast Pendapatan" subtitle="Aktual + forecast MA3 dengan pita kepercayaan ±15% (miliar Rupiah)" action={<span className="flex gap-1.5"><Badge tone="blue">AI Forecast</Badge><button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-forecast", "forecast-pendapatan")}>Export PNG</button></span>} />
              <div id="chart-forecast" className="h-60 p-4 pt-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={forecastAdj} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                    <XAxis dataKey="name" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="high" name="Batas atas" stroke="none" fill="#8cc9e8" fillOpacity={0.35} connectNulls />
                    <Area type="monotone" dataKey="low" name="Batas bawah" stroke="none" fill="#ffffff" fillOpacity={0.9} connectNulls />
                    <Line type="monotone" dataKey="actual" name="Aktual" stroke="#dc2626" strokeWidth={2} connectNulls dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#2e9ad4" strokeDasharray="6 3" strokeWidth={2} dot={{ r: 4 }} />
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
                { icon: Lightbulb, tone: "bg-navy-50 text-navy-700", title: "Alokasi Drydock", desc: "Geser slot yang bertabrakan ke minggu berikutnya; gunakan berth 1 untuk assembly.", to: "/drydock", cta: "Buka Drydock" },
                { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600", title: "Reorder Material", desc: `${lowStock.length} item di bawah minimum. Terbitkan PO sekarang dengan lead time 3 minggu.`, to: "/procurement", cta: "Buka Procurement" },
                { icon: Lightbulb, tone: "bg-amber-50 text-amber-600", title: "Prioritas Proyek", desc: `${atRisk} proyek terlambat/over-budget. Alokasikan tim las tambahan & tinjau WBS.`, to: "/proyek", cta: "Buka Proyek" },
                { icon: CheckCircle2, tone: "bg-violet-50 text-violet-700", title: "Tindak Lanjut NCR", desc: `${openNcr} NCR masih terbuka. Selesaikan temuan critical terlebih dahulu.`, to: "/qc-safety", cta: "Buka QC" },
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
              <KpiCard label="Total Profit Portofolio" value={fmtMiliar(profitByType.reduce((s, d) => s + d.profit * 1000000000, 0))} delta={`${data.projects.length} proyek`} deltaDirection="flat" icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
              <KpiCard label="Biaya Rework" value={fmtRupiah(reworkCost)} delta="Estimasi berjalan" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={ncrTrend} />
              <KpiCard label="Utilisasi vs Target" value={`${lastUtil}% / ${utilTarget}%`} delta={lastUtil >= utilTarget ? "Target tercapai" : "Di bawah target"} deltaDirection={lastUtil >= utilTarget ? "up" : "down"} icon={<Clock className="h-5 w-5" />} chip="teal" spark={sparkProjects} />
              <KpiCard label="Tipe Paling Profitabel" value={profitByType.length ? [...profitByType].sort((a, b) => b.profit - a.profit)[0].name : "—"} delta={profitByType.length ? fmtMiliar([...profitByType].sort((a, b) => b.profit - a.profit)[0].profit * 1000000000) : "—"} deltaDirection="flat" icon={<Eye className="h-5 w-5" />} chip="violet" spark={sparkMargin} />
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Profit per Tipe Proyek" subtitle={`Budget − aktual per ${fmtTanggal(todayISO())} (miliar Rp)`} action={<button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-profittype", "profit-tipe")}>Export PNG</button>} />
                <div id="chart-profittype" className="h-60 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitByType} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Bar dataKey="profit" name="Profit" fill="#0b3a63" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title="Profit per Cabang" subtitle={`Budget − aktual per ${fmtTanggal(todayISO())} (miliar Rp)`} action={<button className="btn-secondary px-2 py-1 text-xs" onClick={() => exportChartPNG("chart-profitbranch", "profit-cabang")}>Export PNG</button>} />
                <div id="chart-profitbranch" className="h-60 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitByBranch} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Bar dataKey="profit" name="Profit" fill="#2e9ad4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Utilisasi vs Target" subtitle={`Rata-rata progres ${avgProgress}% terhadap target ${utilTarget}%`} />
                <div className="space-y-3 p-5 pt-2">
                  <ProgressBar value={utilTarget ? (lastUtil / utilTarget) * 100 : 0} tone={lastUtil >= utilTarget ? "green" : "amber"} />
                  <p className="text-xs text-steel-500">{lastUtil}% dari target {utilTarget}% — dihitung dari rata-rata progres {data.projects.length} proyek.</p>
                </div>
              </Card>
              <Card>
                <CardHeader title="Biaya Rework" subtitle="Rumus: Σ change order dampak negatif + estimasi NCR 2% dari budget proyek ber-NCR terbuka" />
                <div className="space-y-2 p-5 pt-2 text-sm">
                  <div className="flex justify-between"><span className="text-steel-600">Change order negatif</span><span className="font-semibold text-navy-900">{fmtRupiah(negCo)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-600">Estimasi NCR ({openNcrProjects.size} proyek, 2%)</span><span className="font-semibold text-navy-900">{fmtRupiah(Math.round(ncrEstimate))}</span></div>
                  <div className="flex justify-between border-t border-steel-100 pt-2"><span className="font-semibold text-navy-900">Total rework</span><span className="font-bold text-rose-600">{fmtRupiah(reworkCost)}</span></div>
                </div>
              </Card>
            </div>
          </div>
        )}
        <Card className="mt-5">
          <CardHeader title={`Anotasi Insight · ${tab}`} subtitle="Catatan per tab — tersimpan per perangkat" />
          <div className="flex flex-col gap-2 p-5 pt-2">
            <textarea className="input" rows={2} value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder={`Tulis insight untuk tab ${tab}…`} />
            <div><button className="btn-secondary text-xs" onClick={saveNote}>Simpan Catatan</button></div>
            <div className="space-y-1.5">
              {(notes[tab] ?? []).map((n, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-sm text-steel-700">
                  <span className="flex-1">{n}</span>
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => delNote(i)}>Hapus</button>
                </div>
              ))}
              {(notes[tab] ?? []).length === 0 && <p className="text-xs text-steel-400">Belum ada catatan untuk tab ini.</p>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
