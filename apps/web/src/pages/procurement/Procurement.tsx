import { useState } from "react";
import { Plus, Factory, ShoppingCart, ClipboardList } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip } from "../../components/ui";
import { purchaseOrders, fmtRupiah, spendByCategory, procurementTrend, sparkRevenue } from "../../data";

const vendors = [
  { id: "V-001", name: "PT Bahana Baja", cat: "Baja & Struktur", onTime: 92, quality: 95, po: 12 },
  { id: "V-002", name: "PT Indo Diesel", cat: "Mesin & Engine", onTime: 96, quality: 90, po: 5 },
  { id: "V-003", name: "PT Jotun Indonesia", cat: "Cat & Coating", onTime: 88, quality: 93, po: 8 },
  { id: "V-004", name: "PT Steel Rig", cat: "Rigging & Wire", onTime: 84, quality: 87, po: 6 },
];

const requisitions = [
  { id: "PR-2026-201", item: "Aux Engine MAK", by: "Budi Santoso", amount: 1700000000, status: "Sudah PO" },
  { id: "PR-2026-203", item: "Pelat Baja AH36", by: "Fajar N.", amount: 4120000000, status: "Sudah PO" },
  { id: "PR-2026-207", item: "Cat Epoxy", by: "Rudi H.", amount: 480000000, status: "Menunggu Approval" },
  { id: "PR-2026-209", item: "Wire Rope", by: "Sari W.", amount: 210000000, status: "RFQ" },
];

const poStatus: Record<string, "green" | "amber" | "blue" | "gray"> = {
  Diterima: "green",
  "Dalam Pengiriman": "blue",
  Dikirim: "amber",
  "Menunggu Persetujuan": "gray",
};

export default function Procurement() {
  const [tab, setTab] = useState("Purchase Order");

  return (
    <div>
      <PageHeader
        title="Procurement & Purchasing"
        subtitle="Permintaan, penawaran, PO, dan manajemen vendor"
        icon={<ShoppingCart className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Buat PO</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="PO Aktif" value={String(purchaseOrders.length)} icon={<ShoppingCart className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Sedang berjalan" />
        <KpiCard label="Nilai PO Terbuka" value="Rp 6,5 M" hint="Belum diterima penuh" icon={<ShoppingCart className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Permintaan Menunggu" value="2 PR" hint="Perlu approval" icon={<ClipboardList className="h-5 w-5" />} chip="amber" />
        <KpiCard label="Vendor Terdaftar" value={String(vendors.length)} icon={<Factory className="h-5 w-5" />} chip="violet" hint="Rating & evaluasi" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Purchase Order", "Permintaan (PR)", "Penawaran (RFQ)", "Vendor"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Purchase Order" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="Belanja per Kategori" subtitle="Persentase total pengeluaran" />
                  <div className="flex items-center gap-4 p-4 pt-0">
                    <Donut data={spendByCategory} colors={spendByCategory.map((d) => d.color)} size={130} thickness={18} centerValue="100" centerLabel="%" />
                    <div className="flex-1 space-y-1.5">
                      {spendByCategory.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                          <span className="truncate text-steel-600">{d.name}</span>
                          <span className="ml-auto font-semibold text-navy-900">{d.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title="Tren Pengadaan" subtitle="Jumlah PO & nilai pengeluaran (milyar Rupiah)" />
                  <div className="h-44 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={procurementTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs><linearGradient id="procGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} /><stop offset="95%" stopColor="#0d9488" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip formatter={(v) => (typeof v === "number" ? `Rp ${v} M` : v)} />} />
                        <Area type="monotone" dataKey="pengeluaran" name="Pengeluaran" stroke="#0d9488" strokeWidth={2.5} fill="url(#procGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">PO</th><th className="th">Item</th><th className="th">Vendor</th><th className="th">Nilai</th><th className="th">Tanggal</th><th className="th">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {purchaseOrders.map((po) => (
                      <tr key={po.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{po.id}</td>
                        <td className="td text-steel-600">{po.item}</td>
                        <td className="td text-steel-600">{po.vendor}</td>
                        <td className="td font-semibold">{fmtRupiah(po.amount)}</td>
                        <td className="td text-steel-600">{po.date}</td>
                        <td className="td"><Badge tone={poStatus[po.status] ?? "gray"}>{po.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Permintaan (PR)" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface">
                  <tr><th className="th">PR</th><th className="th">Item</th><th className="th">Oleh</th><th className="th">Nilai</th><th className="th">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {requisitions.map((r) => (
                    <tr key={r.id} className="hover:bg-surface">
                      <td className="td font-mono font-medium text-navy-900">{r.id}</td>
                      <td className="td text-steel-600">{r.item}</td>
                      <td className="td text-steel-600">{r.by}</td>
                      <td className="td font-semibold">{fmtRupiah(r.amount)}</td>
                      <td className="td"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "Penawaran (RFQ)" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">Perbandingan Vendor — Pelat Baja AH36</h3>
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Vendor</th><th className="th">Harga</th><th className="th">Lead</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    <tr><td className="td">PT Bahana Baja</td><td className="td font-semibold text-emerald-600">Rp 14.250 /kg</td><td className="td">3 minggu</td></tr>
                    <tr><td className="td">PT Steelindo</td><td className="td">Rp 14.900 /kg</td><td className="td">4 minggu</td></tr>
                    <tr><td className="td">PT Primabaja</td><td className="td">Rp 15.400 /kg</td><td className="td">5 minggu</td></tr>
                  </tbody>
                </table>
                <button className="btn-primary mt-4">Pilih & Konversi ke PO</button>
              </Card>
            </div>
          )}

          {tab === "Vendor" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {vendors.map((v) => (
                <Card key={v.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{v.name}</p>
                      <p className="text-xs text-steel-500">{v.cat}</p>
                    </div>
                    <Badge tone="green">Aktif</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">On-time</p>
                      <p className="font-semibold text-navy-900">{v.onTime}%</p>
                    </div>
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">Kualitas</p>
                      <p className="font-semibold text-navy-900">{v.quality}%</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-steel-500">{v.po} PO ditangani</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
