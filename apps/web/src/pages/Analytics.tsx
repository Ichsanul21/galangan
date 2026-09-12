import { useState } from "react";
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
} from "../components/ui";
import {
  revenueSeries,
  sparkRevenue,
  sparkMargin,
  sparkProjects,
  sparkUtil,
  marginSeries,
  projectTypeDist,
  inspectionTrend,
} from "../data";

const drilldown = [
  { factor: "Material terlambat datang", count: 6, impact: 31 },
  { factor: "Rework / defect las", count: 4, impact: 22 },
  { factor: "Kurang tenaga kerja", count: 3, impact: 18 },
  { factor: "Cuaca buruk", count: 2, impact: 11 },
  { factor: "Perubahan scope klien", count: 2, impact: 7 },
];

const forecast = [
  { name: "Ags", actual: 9.8, forecast: 10.2 },
  { name: "Sep", actual: null, forecast: 10.8 },
  { name: "Okt", actual: null, forecast: 11.2 },
  { name: "Nov", actual: null, forecast: 11.8 },
  { name: "Des", actual: null, forecast: 12.6 },
];

const variance = [
  { n: "Mar", v: 42 },
  { n: "Apr", v: -12 },
  { n: "Mei", v: 33 },
  { n: "Jun", v: 21 },
  { n: "Jul", v: 18 },
  { n: "Ags", v: 26 },
  { n: "Sep", v: -8 },
];

export default function Analytics() {
  const [tab, setTab] = useState("Deskriptif");

  return (
    <div>
      <PageHeader
        title="Analytics #ISMS"
        subtitle="Analisis 4 level — dari 'apa yang terjadi' hingga 'harus berbuat apa'"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-secondary">
              <Search className="h-4 w-4" /> Jelajah
            </button>
            <button className="btn-primary-gradient">Export Laporan</button>
          </>
        }
      />

      <Tabs tabs={["Deskriptif", "Diagnostik", "Prediktif", "Preskriptif"]} active={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === "Deskriptif" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Revenue YTD" value="Rp 84,2 M" delta="+16% vs tahun lalu" deltaDirection="up" icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
              <KpiCard label="Margin Rata-rata" value="26,4%" delta="+1,2pt" deltaDirection="up" icon={<Eye className="h-5 w-5" />} chip="teal" spark={sparkMargin} />
              <KpiCard label="Rata-rata Progres" value="63%" delta="Sesuai jadwal" deltaDirection="flat" icon={<Clock className="h-5 w-5" />} chip="violet" spark={sparkProjects} />
              <KpiCard label="NCR bulan ini" value="12" delta="+2 vs bulan lalu" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={sparkUtil} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Pendapatan vs Biaya" subtitle="12 bulan terakhir (milyar Rupiah)" />
                <div className="h-72 p-4 pt-0">
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
                <CardHeader title="Komposisi Jenis Pekerjaan" subtitle="Distribusi portofolio" />
                <div className="flex flex-col items-center gap-3 p-4">
                  <Donut
                    data={projectTypeDist}
                    colors={projectTypeDist.map((d) => d.color)}
                    size={150}
                    thickness={20}
                    centerValue="20"
                    centerLabel="total"
                  />
                  <div className="grid w-full grid-cols-1 gap-1.5">
                    {projectTypeDist.map((d) => (
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
                <CardHeader title="Root Cause Keterlambatan" subtitle="Kontribusi terhadap total delay" action={<Badge tone="red">Top 5 faktor</Badge>} />
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
                <CardHeader title="Variance Anggaran Bulanan" subtitle="Deviasi biaya aktual vs rencana (juta Rupiah)" />
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
          </div>
        )}

        {tab === "Prediktif" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Forecast Revenue 2026" value="Rp 112 M" delta="+9% target" deltaDirection="up" icon={<TrendingUp className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
              <KpiCard label="Konflik Drydock" value="2 terjadwal" delta="Agu & Okt" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" />
              <KpiCard label="Forecast Stok Kritis" value="3 item" delta="Sebelum Okt" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="amber" />
              <KpiCard label="Proyek Berisiko" value="2 proyek" delta="EAC di atas anggaran" deltaDirection="down" icon={<Clock className="h-5 w-5" />} chip="violet" />
            </div>
            <Card>
              <CardHeader title="Forecast Pendapatan" subtitle="Aktual + prediksi 5 bulan (milyar Rupiah) · ETO/EAC" action={<Badge tone="blue">AI Forecast</Badge>} />
              <div className="h-72 p-4 pt-0">
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
                { icon: Lightbulb, tone: "bg-navy-50 text-navy-700", title: "Alokasi Drydock", desc: "Geser TB Laut Timur 01 ke Okt untuk hindari konflik slot dengan NB-014; gunakan berth 1 untuk assembly." },
                { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600", title: "Reorder Material", desc: "Pipa S40 6 inch & Baut M20 akan kritis sebelum Okt. Terbitkan PO sekarang dengan lead time 3 minggu." },
                { icon: Lightbulb, tone: "bg-amber-50 text-amber-600", title: "Prioritas Proyek", desc: "Tingkatkan prioritas RP-2026-005 sebelum kehilangan 2% penalty/day. Alokasikan tim las tambahan." },
                { icon: CheckCircle2, tone: "bg-violet-50 text-violet-700", title: "Efisiensi Vendor", desc: "PT Indo Diesel punya ketepatan kirim tertinggi (96%). Alokasikan 20% volume mesin tambahan ke vendor ini." },
              ].map((r) => (
                <Card key={r.title} className="card-hover p-5">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2 ${r.tone}`}><r.icon className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-sm font-semibold text-navy-900">{r.title}</h3>
                      <p className="mt-1 text-sm text-steel-600">{r.desc}</p>
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
