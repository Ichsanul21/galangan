import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Eye,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
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
  toast,
} from "../components/ui";
import { useStore } from "../data/store";
import { exportExcel } from "../utils/export";
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

export default function Analytics() {
  const [tab, setTab] = useState("Deskriptif");
  const { data } = useStore();

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
          <>
            <button className="btn-secondary" onClick={() => toast("Mode jelajah data (demo)", "info")}>
              <Search className="h-4 w-4" /> Jelajah
            </button>
            <button className="btn-primary-gradient" onClick={exportReport}>Export Laporan</button>
          </>
        }
      />

      <Tabs tabs={["Deskriptif", "Diagnostik", "Prediktif", "Preskriptif"]} active={tab} onChange={setTab} />

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
                <CardHeader title="Pendapatan vs Biaya" subtitle="12 bulan terakhir (milyar Rupiah)" />
                <div className="h-60 p-4 pt-0 sm:h-72">
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
              <KpiCard label="Forecast Revenue 2026" value={`Rp ${forecastAnnual.toLocaleString("id-ID")} M`} hint="Rata-rata bergerak 3 bulan × 12" icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={forecast.map((f) => ({ name: f.name, v: f.forecast ?? 0 }))} />
              <KpiCard label="Konflik Drydock" value={dockConflict ? `${dockConflict} slot` : "Aman"} delta={dockConflict ? "Perlu atasi" : "Tidak ada tumpang tindih"} deltaDirection={dockConflict ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={slotTrend} />
              <KpiCard label="Stok Kritis" value={`${lowStock.length} item`} delta={lowStock.slice(0, 2).map((i) => i.name.split(" ").slice(0, 2).join(" ")).join(" · ") || "Semua aman"} deltaDirection={lowStock.length ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="amber" spark={lowStockTrend} />
              <KpiCard label="Proyek Berisiko" value={`${atRisk} proyek`} delta="Terlambat / over-budget" deltaDirection={atRisk ? "down" : "up"} icon={<Clock className="h-5 w-5" />} chip="violet" spark={activeProjectTrend} />
            </div>
            <Card>
              <CardHeader title="Forecast Pendapatan" subtitle="Aktual + rata-rata bergerak 3 bulan (milyar Rupiah)" action={<Badge tone="blue">AI Forecast</Badge>} />
              <div className="h-60 p-4 pt-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecast} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                    <XAxis dataKey="name" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="actual" name="Aktual" stroke="#dc2626" strokeWidth={2} connectNulls dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#2e9ad4" strokeDasharray="6 3" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
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
      </div>
    </div>
  );
}
