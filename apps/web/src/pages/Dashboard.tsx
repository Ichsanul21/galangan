import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Anchor,
  Wallet,
  TrendingUp,
  ArrowRight,
  Boxes,
  Sparkles,
  Cpu,
  Plus,
  Download,
  Calendar,
} from "lucide-react";
import {
  AreaChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Tooltip,
} from "recharts";
import {
  Card,
  CardHeader,
  KpiCard,
  PageHeader,
  RadialGauge,
  Donut,
  ChartTooltip,
  Stagger,
  StaggerItem,
  GlowCard,
  Badge,
  ProgressBar,
  Avatar,
  toast,
} from "../components/ui";
import { useStore } from "../data/store";
import { exportExcel } from "../utils/export";
import {
  revenueSeries,
  sparkRevenue,
  sparkMargin,
  sparkProjects,
  sparkUtil,
  utilSeries,
  marginSeries,
  drydockLoad,
  insights,
  fmtMiliar,
} from "../data";

const RANGES = ["6B", "12B"] as const;

export default function Dashboard() {
  const { data } = useStore();
  const navigate = useNavigate();
  const projects = data.projects;
  const activities = data.activities;
  const [range, setRange] = useState<(typeof RANGES)[number]>("12B");
  const totalActive = projects.filter((p) => p.status !== "Selesai").length;
  const delayed = projects.filter((p) => p.status === "Terlambat").length;
  const activeContracts = projects
    .filter((p) => p.status !== "Selesai")
    .reduce((s, p) => s + Number(p.budget || 0), 0);
  const drydocks = data.drydocks;
  const openNcr = data.ncr.filter((n) => n.status !== "Tertutup").length;
  const arOutstanding = data.invoices
    .filter((i) => i.status !== "Lunas" && i.status !== "Draft")
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  const lowStock = data.inventory.filter((i) => i.stock <= i.minStock);
  const stockValue = data.inventory.reduce((s, i) => s + Number(i.stock || 0) * Number(i.cost || 0), 0);
  const wonQuotes = data.quotations.filter((x) => x.stage === "Menang").reduce((s, x) => s + Number(x.value || 0), 0);
  const utilDrydock =
    Math.round((drydocks.filter((d) => d.status === "Terpakai").length / drydocks.length) * 100);
  const utilEquipment = Math.round(utilSeries[utilSeries.length - 1].equipment);

  const chartData =
    range === "12B" ? revenueSeries : revenueSeries.slice(-6);

  const lastRev = revenueSeries[revenueSeries.length - 1];
  const prevRev = revenueSeries[revenueSeries.length - 2];
  const revGrowth = prevRev && prevRev.revenue ? ((lastRev.revenue - prevRev.revenue) / prevRev.revenue) * 100 : 0;
  const lastMargin = marginSeries[marginSeries.length - 1];
  const prevMargin = marginSeries[marginSeries.length - 2];
  const marginDiff = lastMargin && prevMargin ? lastMargin.margin - prevMargin.margin : 0;
  const lastUtil = utilSeries[utilSeries.length - 1];
  const prevUtil = utilSeries[utilSeries.length - 2];
  const utilDiff = lastUtil && prevUtil ? lastUtil.equipment - prevUtil.equipment : 0;
  const activeEmployees = data.employees.filter((e) => e.status === "Aktif").length;
  const seaTrialVessel =
    projects.find((p) => p.status !== "Selesai" && (p.scope ?? []).includes("Sea Trial"))?.vessel ?? "—";

  const exportSummary = () => {
    const rows: (string | number)[][] = [
      ["ID Proyek", "Kapal", "Progres (%)", "Anggaran (Rp)", "Realisasi (Rp)"],
      ...projects.map((p) => [p.id, p.vessel, Number(p.progress || 0), Number(p.budget || 0), Number(p.actual || 0)]),
    ];
    exportExcel(rows, "Ringkasan Portofolio");
    toast("Ringkasan portofolio diekspor ke Excel");
  };

  const totalRevenue = revenueSeries.reduce((s, d) => s + d.revenue, 0);
  const totalRevenueLabel = `Rp ${totalRevenue.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  const typeDist = (["New Build", "Repair", "Retrofit"] as const).map((t, i) => ({
    name: t,
    value: projects.filter((p) => p.type === t).length,
    color: ["#0b3a63", "#2e9ad4", "#22c55e"][i],
  }));
  const pipelineActive = data.quotations
    .filter((x) => x.stage !== "Menang")
    .reduce((s, x) => s + Number(x.value || 0), 0);

  return (
    <Stagger className="space-y-5">
      <StaggerItem>
        <PageHeader
          title="Dashboard Eksekutif"
          subtitle="Pusat kendali operasional galangan — Samarinda, real-time"
          icon={<TrendingUp className="h-5 w-5" />}
          actions={
            <>
              <button className="btn-secondary" onClick={exportSummary}>
                <Download className="h-4 w-4" /> Ekspor
              </button>
              <button className="btn-primary-gradient" onClick={() => navigate("/proyek")}>
                <Plus className="h-4 w-4" /> Proyek Baru
              </button>
            </>
          }
        />
      </StaggerItem>

      {/* HERO GLOW BANNER */}
      <StaggerItem>
        <GlowCard gradient="gradient-hero">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-steel-300">Total Nilai Portofolio Berjalan</p>
                <p className="text-3xl font-bold tracking-tight">{fmtMiliar(activeContracts)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="teal" className="bg-white/15 border-white/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sistem Operasional
              </Badge>
              <span className="px-3 py-1.5 rounded-lg bg-white/15 text-sm font-medium">
                {activeEmployees} pekerja aktif
              </span>
            </div>
          </div>
        </GlowCard>
      </StaggerItem>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <KpiCard
            label="Proyek Aktif"
            value={String(totalActive)}
            delta={`${delayed} terlambat`}
            deltaDirection="down"
            icon={<Anchor className="h-5 w-5" />}
            chip="navy"
            spark={sparkProjects}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Pendapatan 12 Bulan"
            value={totalRevenueLabel}
            delta={`${revGrowth >= 0 ? "+" : ""}${revGrowth.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% vs bulan lalu`}
            deltaDirection={revGrowth > 0 ? "up" : revGrowth < 0 ? "down" : "flat"}
            icon={<Wallet className="h-5 w-5" />}
            chip="teal"
            spark={sparkRevenue}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Margin Bruto"
            value={`${lastMargin.margin.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
            delta={`${marginDiff >= 0 ? "+" : ""}${marginDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin vs bulan lalu`}
            deltaDirection={marginDiff > 0 ? "up" : marginDiff < 0 ? "down" : "flat"}
            icon={<TrendingUp className="h-5 w-5" />}
            chip="violet"
            spark={sparkMargin}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Utilitas Equipment"
            value={`${utilEquipment}%`}
            delta={`${utilDiff >= 0 ? "+" : ""}${utilDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin vs bulan lalu`}
            deltaDirection={utilDiff > 0 ? "up" : utilDiff < 0 ? "down" : "flat"}
            icon={<Cpu className="h-5 w-5" />}
            chip="amber"
            spark={sparkUtil}
          />
        </StaggerItem>
      </div>

      {/* MAIN CHARTS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Pendapatan & Volume Proyek"
              subtitle="Tren 12 bulan terakhir (dalam miliar Rupiah)"
              action={
                <div className="flex items-center gap-1 rounded-lg border border-steel-200 bg-surface p-0.5">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        range === r ? "bg-white text-navy-800 shadow-sm" : "text-steel-500 hover:text-navy-700"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="h-64 p-4 pt-0 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0b3a63" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0b3a63" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <YAxis yAxisId="proj" orientation="right" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v) => (typeof v === "number" ? `Rp ${v} M` : v)} />} />
                  <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Pendapatan" stroke="#0b3a63" strokeWidth={2.5} fill="url(#revGrad)" />
                  <Bar yAxisId="proj" dataKey="projects" name="Jumlah Proyek" fill="#8cc9e8" radius={[4, 4, 0, 0]} barSize={16} />
                  <Line yAxisId="rev" type="monotone" dataKey="cost" name="Biaya" stroke="#e11d48" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Komposisi Proyek" subtitle="Berdasarkan jenis pekerjaan" />
            <div className="flex flex-col items-center gap-4 p-4">
              <Donut
                data={typeDist}
                colors={typeDist.map((d) => d.color)}
                size={170}
                thickness={22}
                centerValue={String(typeDist.reduce((s, d) => s + d.value, 0))}
                centerLabel="proyek"
              />
              <div className="grid w-full grid-cols-2 gap-2">
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
        </StaggerItem>
      </div>

      {/* GAUGES + HEATMAP + INSIGHTS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <StaggerItem className="lg:col-span-2">
          <Card>
            <CardHeader title="Utilisasi Kapasitas" subtitle="Drydock, slipway & berth" />
            <div className="p-4">
              <div className="mb-3 flex items-end gap-2">
                <span className="text-3xl font-bold text-navy-900">{utilDrydock}%</span>
                <span className="pb-1 text-xs text-steel-500">dari {drydocks.length} fasilitas terpasang</span>
              </div>
              <div className="space-y-3">
                {drydockLoad.map((d) => (
                  <div key={d.dock}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-steel-600">{d.dock}</span>
                      <span className="font-semibold text-navy-800">{d.kapasitas}%</span>
                    </div>
                    <ProgressBar value={d.kapasitas} tone={d.kapasitas > 85 ? "red" : d.kapasitas > 70 ? "amber" : "navy"} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Produksi & Utilisasi" subtitle="Tren drydock vs equipment" />
            <div className="flex items-center justify-center gap-6 p-4">
              <RadialGauge value={utilDrydock} label="Drydock" color="#0b3a63" />
              <RadialGauge value={utilEquipment} label="Equipment" color="#2e9ad4" />
            </div>
            <div className="mt-2 -mb-1 h-16 px-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={utilSeries} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2e9ad4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2e9ad4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="equipment" stroke="#2e9ad4" strokeWidth={2} fill="url(#utilGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Wawasan Cerdas" subtitle="Rekomendasi otomatis" />
            <div className="space-y-2.5 p-4 pt-0">
              {insights.map((i) => {
                const dot =
                  i.tone === "rose" ? "bg-rose-500" : i.tone === "teal" ? "bg-teal-500" : i.tone === "violet" ? "bg-violet-500" : "bg-ocean-500";
                return (
                  <div key={i.id} className="rounded-xl border border-steel-100 bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      <p className="text-sm font-semibold text-navy-900">{i.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-steel-500 leading-relaxed">{i.desc}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </StaggerItem>
      </div>

      {/* STATUS + ACTIVITY */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StaggerItem>
          <Card>
            <CardHeader
              title="Status Proyek Aktif"
              subtitle="Progres terbaru"
              action={
                <Link to="/proyek" className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-600 hover:text-ocean-500">
                  Lihat semua <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="divide-y divide-steel-100">
              {projects.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  to={`/proyek/${p.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy-900 truncate" title={p.vessel}>{p.vessel}</p>
                    <p className="text-xs text-steel-500">{p.id} · {p.client}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <ProgressBar value={p.progress} tone={p.status === "Terlambat" ? "red" : "navy"} />
                      <p className="mt-1 text-right text-[11px] text-steel-500">{p.progress}%</p>
                    </div>
                    <Badge tone={p.status === "Terlambat" ? "red" : p.status === "Selesai" ? "green" : "blue"}>
                      {p.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Aktivitas Terkini" subtitle="Log real-time di seluruh modul" />
            <div className="space-y-1 p-3">
              {activities.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface">
                  <Avatar name={a.actor} className="h-8 w-8 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-steel-700" title={`${a.actor} ${a.action} ${a.target}`}>
                      <span className="font-semibold text-navy-900">{a.actor}</span> {a.action}{" "}
                      <span className="font-medium text-navy-800">{a.target}</span>
                    </p>
                    <p className="text-[11px] text-steel-400">{a.module} · {a.time}</p>
                  </div>
                  <Badge tone={a.tone as never}>{a.module}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>
      </div>

      {/* MINI STRIP */}
      <StaggerItem>
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
                <Boxes className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">Nilai Stok {lowStock.length > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{lowStock.length} menipis</span>}</p>
                <Link to="/inventori" className="text-lg font-bold text-gradient-navy hover:underline">{fmtMiliar(stockValue)}</Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Calendar className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">Sea Trial Terjadwal</p>
                <p className="text-lg font-bold text-gradient-navy">{seaTrialVessel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Anchor className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">Quotation Aktif</p>
                <Link to="/crm" className="text-lg font-bold text-gradient-navy hover:underline">{fmtMiliar(pipelineActive)}</Link>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 border-t border-steel-100 pt-3 sm:grid-cols-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel-500">NCR terbuka</span>
              <Link to="/qc-safety" className="font-bold text-rose-600 hover:underline">{openNcr} kasus</Link>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel-500">Piutang tertagih</span>
              <Link to="/keuangan" className="font-bold text-navy-900 hover:underline">{fmtMiliar(arOutstanding)}</Link>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel-500">Kontrak menang (CRM)</span>
              <Link to="/crm" className="font-bold text-navy-900 hover:underline">{fmtMiliar(wonQuotes)}</Link>
            </div>
          </div>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
