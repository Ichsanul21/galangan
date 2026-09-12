import { useState } from "react";
import {
  Plus,
  Search,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Warehouse,
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
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ChartTooltip } from "../../components/ui";
import { inventory, inventoryMovement, stockTrend, sparkRevenue } from "../../data";

export default function Inventory() {
  const [tab, setTab] = useState("Katalog");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Semua");

  const list = inventory.filter((i) => {
    const matchQ = i.name.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase());
    const matchCat = cat === "Semua" || i.category === cat;
    return matchQ && matchCat;
  });

  const lowStock = inventory.filter((i) => i.stock <= i.minStock);
  const categories = ["Semua", ...Array.from(new Set(inventory.map((i) => i.category)))];
  const totalValue = inventory.reduce((s, i) => s + i.stock * i.cost, 0);
  const warehouses = Array.from(new Set(inventory.map((i) => i.warehouse))).length;

  return (
    <div>
      <PageHeader
        title="Inventori & Material"
        subtitle="Katalog, stok, BOM, dan pergerakan material"
        icon={<Warehouse className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Material Baru</button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Item Aktif" value={String(inventory.length)} icon={<Package className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Katalog keseluruhan" />
        <KpiCard label="Item Stok Menipis" value={String(lowStock.length)} delta="Perlu reorder" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" />
        <KpiCard label="Nilai Stok" value={`Rp ${(totalValue / 1_000_000_000).toFixed(2).replace(".", ",")} M`} hint="Cost basis total" icon={<Package className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Gudang" value={`${warehouses} lokasi`} hint="Baja, Mesin, Pipa, Listrik, Cat" chip="violet" />
      </div>

      <div className="card">
        <Tabs tabs={["Katalog", "Stok per Gudang", "BOM", "Pergerakan"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Katalog" && (
            <>
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-64" placeholder="Cari material / SKU..." value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {categories.map((c) => (
                    <button key={c} onClick={() => setCat(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${cat === c ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Material</th><th className="th">Kategori</th><th className="th">Stok</th><th className="th">Min</th><th className="th">Satuan</th><th className="th">Status</th><th className="th">Lokasi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {list.map((i) => {
                      const low = i.stock <= i.minStock;
                      return (
                        <tr key={i.id} className="hover:bg-surface">
                          <td className="td">
                            <p className="font-medium text-navy-900">{i.name}</p>
                            <p className="text-xs text-steel-500 font-mono">{i.sku}</p>
                          </td>
                          <td className="td"><Badge tone="gray">{i.category}</Badge></td>
                          <td className="td font-semibold text-navy-900">{i.stock.toLocaleString()}</td>
                          <td className="td text-steel-500">{i.minStock.toLocaleString()}</td>
                          <td className="td text-steel-600">{i.unit}</td>
                          <td className="td">
                            <Badge tone={low ? "red" : "green"}>{low ? "Menipis" : "Aman"}</Badge>
                          </td>
                          <td className="td text-steel-600 font-mono text-xs">{i.location}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "Stok per Gudang" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {["Gudang Baja A", "Gudang Mesin", "Gudang Pipa", "Gudang Listrik", "Gudang B"].map((w) => {
                const items = inventory.filter((i) => i.warehouse === w);
                return (
                  <Card key={w} className="p-4">
                    <h3 className="mb-2 text-sm font-semibold text-navy-900">{w}</h3>
                    <p className="text-xs text-steel-500">{items.length} item · {items.reduce((s, i) => s + i.stock, 0).toLocaleString()} unit</p>
                    <div className="mt-3 space-y-1.5">
                      {items.map((i) => (
                        <div key={i.id} className="flex justify-between text-sm">
                          <span className="text-steel-600 truncate">{i.name}</span>
                          <span className="font-medium">{i.stock.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {tab === "BOM" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <CardHeader title="Bill of Materials — TB Samudra Jaya 07" subtitle="Bahan baku utama untuk 1 unit tugboat ASD" />
                <div className="mt-3 space-y-2">
                  {[
                    { m: "Pelat Baja AH36", q: "82.000 kg", v: "Rp 1,19 M" },
                    { m: "Aux Engine MAK", q: "2 unit", v: "Rp 1,70 M" },
                    { m: "Cat Epoxy total", q: "1.200 liter", v: "Rp 114 M" },
                    { m: "Pipa Schedule 40", q: "240 batang", v: "Rp 187 M" },
                    { m: "Kabel Marine", q: "3.500 m", v: "Rp 648 M" },
                    { m: "Anoda Zink", q: "86 pcs", v: "Rp 18 M" },
                  ].map((b) => (
                    <div key={b.m} className="flex items-center justify-between border-b border-steel-100 py-2 text-sm">
                      <span className="text-steel-700">{b.m}</span>
                      <div className="text-right">
                        <p className="font-medium text-navy-900">{b.q}</p>
                        <p className="text-xs text-steel-500">{b.v}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title="Aksi Material" subtitle="Goods Receipt / Issue" />
                <div className="mt-4 space-y-3">
                  <button className="btn-primary w-full justify-center"><ArrowDownToLine className="h-4 w-4" /> Terima Barang (GR)</button>
                  <button className="btn-secondary w-full justify-center"><ArrowUpFromLine className="h-4 w-4" /> Keluar Barang (GI)</button>
                  <button className="btn-secondary w-full justify-center">Transfer Antar Gudang</button>
                  <button className="btn-secondary w-full justify-center">Stok Opname</button>
                </div>
              </Card>
            </div>
          )}

          {tab === "Pergerakan" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Tren Nilai Stok" subtitle="Total nilai persediaan (milyar Rupiah)" />
                <div className="h-44 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stockTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs><linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0b3a63" stopOpacity={0.3} /><stop offset="95%" stopColor="#0b3a63" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="nilai" stroke="#0b3a63" strokeWidth={2.5} fill="url(#invGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Transaksi</th><th className="th">Item</th><th className="th">Tipe</th><th className="th">Jumlah</th><th className="th">Referensi</th><th className="th">Tanggal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {inventoryMovement.map((m) => (
                      <tr key={m.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{m.id}</td>
                        <td className="td text-steel-600">{m.item}</td>
                        <td className="td">
                          <Badge tone={m.tone === "in" ? "green" : "amber"}>
                            {m.type === "Penerimaan" ? "GR" : "GI"}
                          </Badge>
                        </td>
                        <td className="td font-semibold">{m.qty.toLocaleString()}</td>
                        <td className="td font-mono text-xs text-steel-600">{m.by}</td>
                        <td className="td text-steel-600">{m.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
