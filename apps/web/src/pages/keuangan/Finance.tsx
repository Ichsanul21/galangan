import { useState } from "react";
import {
  Wallet,
  ArrowDownToLine,
  FileText,
  Receipt,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardHeader,
  PageHeader,
  KpiCard,
  Tabs,
  StatusBadge,
  ChartTooltip,
  Donut,
} from "../../components/ui";
import {
  invoices,
  fmtRupiah,
  fmtMiliar,
  cashflowSeries,
  agingBuckets,
  plSummary,
  sparkRevenue,
} from "../../data";

export default function Finance() {
  const [tab, setTab] = useState("Piutang (AR)");

  const arTotal = invoices
    .filter((i) => i.status !== "Lunas" && i.status !== "Draft")
    .reduce((s, i) => s + i.amount, 0);

  return (
    <div>
      <PageHeader
        title="Keuangan & Billing"
        subtitle="Piutang, hutang, invoice, dan profitabilitas proyek"
        icon={<Wallet className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><FileText className="h-4 w-4" /> Buat Invoice</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Piutang (AR)" value={fmtMiliar(arTotal)} delta="2 telat" deltaDirection="down" icon={<Wallet className="h-5 w-5" />} chip="rose" spark={sparkRevenue} />
        <KpiCard label="Total Hutang (AP)" value="Rp 8,9 M" hint="Kepada vendor" icon={<Wallet className="h-5 w-5" />} chip="navy" />
        <KpiCard label="Cashflow Masuk (Ags)" value="Rp 10,1 M" delta="+11% vs bulan lalu" deltaDirection="up" icon={<ArrowDownToLine className="h-5 w-5" />} chip="teal" />
        <KpiCard label="EBITDA Kuartalan" value="Rp 13,0 M" delta="+22% QoQ" deltaDirection="up" icon={<TrendingUp className="h-5 w-5" />} chip="violet" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Piutang (AR)", "Hutang (AP)", "Invoice", "Project P&L"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Piutang (AR)" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CardHeader title="Daftar Invoice" subtitle="Status & jatuh tempo" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr><th className="th">Invoice</th><th className="th">Proyek</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface">
                          <td className="td">
                            <p className="font-medium text-navy-900 font-mono">{inv.id}</p>
                            <p className="text-xs text-steel-500">{inv.client}</p>
                          </td>
                          <td className="td text-steel-600 font-mono text-xs">{inv.project}</td>
                          <td className="td font-semibold text-navy-900">{fmtRupiah(inv.amount)}</td>
                          <td className="td text-steel-600">{inv.due}</td>
                          <td className="td"><StatusBadge status={inv.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <CardHeader title="Aging Piutang" subtitle="Nilai dalam milyar Rupiah" />
                  <div className="flex items-center gap-4 p-1">
                    <Donut
                      data={agingBuckets}
                      colors={agingBuckets.map((a) => a.color)}
                      size={140}
                      thickness={18}
                      centerValue="19.3"
                      centerLabel="M"
                    />
                    <div className="flex-1 space-y-2">
                      {agingBuckets.map((a) => (
                        <div key={a.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: a.color }} />
                          <span className="text-steel-600">{a.name}</span>
                          <span className="ml-auto font-semibold text-navy-900">{a.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Receipt className="h-3.5 w-3.5" /> 1 invoice {'>'} 60 hari senilai Rp 2,1 M
                </p>
              </div>
            </div>
          )}

          {tab === "Hutang (AP)" && (
            <div className="space-y-5">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Vendor</th><th className="th">PO</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">PPh 23</th><th className="th">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {[
                      { v: "PT Bahana Baja", po: "PO-2026-114", amt: 4120000000, due: "2026-09-01", pph: "2%", st: "Belum Dibayar" },
                      { v: "PT Indo Diesel", po: "PO-2026-115", amt: 1700000000, due: "2026-08-10", pph: "2%", st: "Belum Dibayar" },
                      { v: "PT Jotun Indonesia", po: "PO-2026-116", amt: 480000000, due: "2026-08-15", pph: "2%", st: "Draft" },
                    ].map((a) => (
                      <tr key={a.po} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900">{a.v}</td>
                        <td className="td font-mono text-xs text-steel-600">{a.po}</td>
                        <td className="td font-semibold">{fmtRupiah(a.amt)}</td>
                        <td className="td text-steel-600">{a.due}</td>
                        <td className="td text-steel-600">{a.pph}</td>
                        <td className="td"><StatusBadge status={a.st} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Card>
                <CardHeader title="Arus Kas Bulanan" subtitle="Masuk vs keluar (milyar Rupiah)" />
                <div className="h-56 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="masuk" name="Masuk" stroke="#0d9488" strokeWidth={2.5} fill="url(#cp)" />
                      <Area type="monotone" dataKey="keluar" name="Keluar" stroke="#e11d48" strokeWidth={2} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}

          {tab === "Invoice" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <CardHeader title="Pergerakan Invoice" subtitle="Penerbitan & status koleksi" />
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="masuk" name="Diterbitkan" stroke="#0b3a63" strokeWidth={2.5} fill="#8cc9e8" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title="Dokumen Invoice" />
                <p className="text-sm text-steel-600">
                  Dokumen invoice per proyek & termin — preview PDF, tanda tangan digital, dan pengiriman otomatis ke klien melalui email.
                </p>
                <button className="btn-secondary mt-4 w-full justify-center">Lihat Template</button>
              </Card>
            </div>
          )}

          {tab === "Project P&L" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {[
                  { p: "NB-2025-012", name: "TB Samudra Jaya 07", rev: 30600, cost: 29600, margin: 1000 },
                  { p: "RP-2026-003", name: "TB Karya Bahari 12", rev: 3500, cost: 3310, margin: 190 },
                  { p: "RF-2026-001", name: "TB Karya Bahari 15", rev: 8900, cost: 8420, margin: 480 },
                ].map((r) => (
                  <Card key={r.p} className="card-hover p-4">
                    <p className="text-xs text-steel-500 font-mono">{r.p} · {r.name}</p>
                    <p className="mt-1 text-sm font-semibold text-navy-900">Margin {fmtMiliar(r.margin)}</p>
                    <div className="mt-2 text-xs text-steel-500">
                      <p>Revenue {fmtMiliar(r.rev)} · Cost {fmtMiliar(r.cost)}</p>
                      <p className="mt-1 font-medium text-emerald-600">Margin {Math.round((r.margin / r.rev) * 100)}%</p>
                    </div>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader title="Rekap Kuartalan" subtitle="Revenue, biaya, laba kotor & EBITDA (milyar Rupiah)" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr><th className="th">Periode</th><th className="th">Revenue</th><th className="th">Biaya</th><th className="th">Gross</th><th className="th">EBITDA</th><th className="th">Margin</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {plSummary.map((p) => (
                        <tr key={p.month} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{p.month}</td>
                          <td className="td">{fmtMiliar(p.revenue)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.cost)}</td>
                          <td className="td font-semibold text-emerald-600">{fmtMiliar(p.gross)}</td>
                          <td className="td font-semibold">{fmtMiliar(p.ebitda)}</td>
                          <td className="td"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{Math.round((p.gross / p.revenue) * 100)}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
