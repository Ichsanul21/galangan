import { useState } from "react";
import {
  Plus,
  Search,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Warehouse,
  Eye,
  Pencil,
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
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ChartTooltip, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { stockTrend, sparkRevenue } from "../../data";

const emptyForm = { name: "", category: "Baja", sku: "", warehouse: "Gudang Baja A", stock: "0", minStock: "0", unit: "pcs", cost: "0", location: "" };

export default function Inventory() {
  const { data, add, update } = useStore();
  const inventory = data.inventory;
  const movements = data.movements;
  const [tab, setTab] = useState("Katalog");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Semua");

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [detail, setDetail] = useState<StoreItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<StoreItem | null>(null);
  const [moveKind, setMoveKind] = useState<"in" | "out">("in");
  const [moveQty, setMoveQty] = useState("");
  const [moveRef, setMoveRef] = useState("");

  const list = inventory.filter((i) => {
    const matchQ = `${i.name} ${i.sku}`.toLowerCase().includes(q.toLowerCase());
    const matchCat = cat === "Semua" || i.category === cat;
    return matchQ && matchCat;
  });

  const lowStock = inventory.filter((i) => i.stock <= i.minStock);
  const categories = ["Semua", ...Array.from(new Set(inventory.map((i) => i.category)))];
  const totalValue = inventory.reduce((s, i) => s + i.stock * i.cost, 0);
  const warehouses = Array.from(new Set(inventory.map((i) => i.warehouse)));

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openEdit = (i: StoreItem) => {
    setEditing(i);
    setForm({ name: i.name, category: i.category, sku: i.sku, warehouse: i.warehouse, stock: String(i.stock), minStock: String(i.minStock), unit: i.unit, cost: String(i.cost), location: i.location });
  };

  const save = () => {
    if (!form.name.trim() || !form.sku.trim()) { toast("Nama & SKU wajib diisi", "info"); return; }
    const payload = { name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse, stock: Number(form.stock) || 0, minStock: Number(form.minStock) || 0, unit: form.unit, cost: Number(form.cost) || 0, location: form.location };
    if (editing) {
      update("inventory", editing.id, payload);
      toast(`${editing.id} diperbarui`);
      setEditing(null);
    } else {
      const created = add("inventory", payload, { action: "mendaftarkan material", module: "Inventori" });
      toast(`Material ${created.id} ditambahkan`);
      setShowAdd(false);
    }
    setForm(emptyForm);
  };

  const saveMove = () => {
    if (!moveTarget) return;
    const qty = Number(moveQty);
    if (!qty || qty <= 0) { toast("Jumlah tidak valid", "info"); return; }
    if (moveKind === "out" && qty > moveTarget.stock) { toast("Stok tidak cukup", "info"); return; }
    const next = moveKind === "in" ? moveTarget.stock + qty : moveTarget.stock - qty;
    update("inventory", moveTarget.id, { stock: next });
    add("movements", {
      item: moveTarget.name,
      type: moveKind === "in" ? "Penerimaan" : "Pengeluaran",
      qty,
      by: moveRef.trim() || (moveKind === "in" ? "GR manual" : "GI manual"),
      date: new Date().toISOString().slice(0, 10),
      tone: moveKind,
    }, { action: moveKind === "in" ? "menerima barang" : "mengeluarkan barang", target: `${moveTarget.name} × ${qty}`, module: "Inventori" });
    toast(`${moveKind === "in" ? "GR" : "GI"} ${moveTarget.name} × ${qty} tersimpan`);
    setMoveTarget(null);
    setMoveQty("");
    setMoveRef("");
  };

  return (
    <div>
      <PageHeader
        title="Inventori & Material"
        subtitle="Katalog, stok, BOM, dan pergerakan material"
        icon={<Warehouse className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => { setForm(emptyForm); setShowAdd(true); }}><Plus className="h-4 w-4" /> Material Baru</button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Item Aktif" value={String(inventory.length)} icon={<Package className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Katalog keseluruhan" />
        <KpiCard label="Item Stok Menipis" value={String(lowStock.length)} delta="Perlu reorder" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" />
        <KpiCard label="Nilai Stok" value={`Rp ${(totalValue / 1_000_000_000).toFixed(2).replace(".", ",")} M`} hint="Cost basis total" icon={<Package className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Gudang" value={`${warehouses.length} lokasi`} hint={warehouses.slice(0, 3).join(", ")} chip="violet" />
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
                    <tr><th className="th">Material</th><th className="th">Kategori</th><th className="th">Stok</th><th className="th">Min</th><th className="th">Satuan</th><th className="th">Status</th><th className="th">Lokasi</th><th className="th">Aksi</th></tr>
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
                          <td className="td font-semibold text-navy-900">{Number(i.stock).toLocaleString()}</td>
                          <td className="td text-steel-500">{Number(i.minStock).toLocaleString()}</td>
                          <td className="td text-steel-600">{i.unit}</td>
                          <td className="td">
                            <Badge tone={low ? "red" : "green"}>{low ? "Menipis" : "Aman"}</Badge>
                          </td>
                          <td className="td text-steel-600 font-mono text-xs">{i.location}</td>
                          <td className="td">
                            <div className="flex gap-1">
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Detail" onClick={() => setDetail(i)}><Eye className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Ubah" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="GR/GI" onClick={() => setMoveTarget(i)}><ArrowDownToLine className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">Tidak ada material yang cocok.</p>}
              </div>
            </>
          )}

          {tab === "Stok per Gudang" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {warehouses.map((w) => {
                const items = inventory.filter((i) => i.warehouse === w);
                return (
                  <Card key={w} className="p-4">
                    <h3 className="mb-2 text-sm font-semibold text-navy-900">{w}</h3>
                    <p className="text-xs text-steel-500">{items.length} item · {items.reduce((s, i) => s + Number(i.stock || 0), 0).toLocaleString()} unit</p>
                    <div className="mt-3 space-y-1.5">
                      {items.map((i) => (
                        <div key={i.id} className="flex justify-between text-sm">
                          <span className="text-steel-600 truncate">{i.name}</span>
                          <span className="font-medium">{Number(i.stock).toLocaleString()}</span>
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
                  <button className="btn-primary w-full justify-center" onClick={() => { const first = lowStock[0] ?? inventory[0]; if (first) { setMoveTarget(first); setMoveKind("in"); } }}><ArrowDownToLine className="h-4 w-4" /> Terima Barang (GR)</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => { const first = inventory[0]; if (first) { setMoveTarget(first); setMoveKind("out"); } }}><ArrowUpFromLine className="h-4 w-4" /> Keluar Barang (GI)</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => toast("Transfer antar gudang (demo)", "info")}>Transfer Antar Gudang</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => toast("Stok opname dijadwalkan (demo)", "info")}>Stok Opname</button>
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
                    {movements.map((m) => (
                      <tr key={m.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{m.id}</td>
                        <td className="td text-steel-600">{m.item}</td>
                        <td className="td">
                          <Badge tone={m.tone === "in" ? "green" : "amber"}>
                            {m.type === "Penerimaan" ? "GR" : "GI"}
                          </Badge>
                        </td>
                        <td className="td font-semibold">{Number(m.qty).toLocaleString()}</td>
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

      {/* Modal tambah/ubah material */}
      <Modal open={showAdd || editing !== null} onClose={() => { setShowAdd(false); setEditing(null); }}
        title={editing ? `Ubah ${editing.id}` : "Material Baru"} subtitle="Tersimpan di sesi browser"
        wide footer={<><button className="btn-secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>Batal</button><button className="btn-primary" onClick={save}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama material"><input className="input" value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="cth: Pelat Baja AH36 15mm" /></Field>
            <Field label="SKU"><input className="input font-mono" value={form.sku} onChange={(e) => setF("sku", e.target.value)} placeholder="cth: AH36-15" /></Field>
            <Field label="Kategori">
              <select className="input" value={form.category} onChange={(e) => setF("category", e.target.value)}>
                {["Baja", "Mesin", "Pipa", "Listrik", "Cat", "Fastener", "Rigging", "Perlindungan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Gudang">
              <select className="input" value={form.warehouse} onChange={(e) => setF("warehouse", e.target.value)}>
                {["Gudang Baja A", "Gudang Mesin", "Gudang Pipa", "Gudang Listrik", "Gudang B", "Gudang Rig"].map((w) => <option key={w}>{w}</option>)}
              </select>
            </Field>
            <Field label="Stok awal"><input type="number" className="input" value={form.stock} onChange={(e) => setF("stock", e.target.value)} /></Field>
            <Field label="Stok minimum"><input type="number" className="input" value={form.minStock} onChange={(e) => setF("minStock", e.target.value)} /></Field>
            <Field label="Satuan">
              <select className="input" value={form.unit} onChange={(e) => setF("unit", e.target.value)}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Harga satuan (Rp)"><input type="number" className="input" value={form.cost} onChange={(e) => setF("cost", e.target.value)} /></Field>
          </FormGrid>
          <Field label="Lokasi rak"><input className="input font-mono" value={form.location} onChange={(e) => setF("location", e.target.value)} placeholder="cth: A1-02" /></Field>
        </div>
      </Modal>

      {/* Modal GR/GI */}
      <Modal open={moveTarget !== null} onClose={() => setMoveTarget(null)} title={`${moveKind === "in" ? "Terima Barang (GR)" : "Keluar Barang (GI)"} — ${moveTarget?.name}`}
        subtitle={`Stok saat ini: ${moveTarget ? Number(moveTarget.stock).toLocaleString() : 0} ${moveTarget?.unit ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setMoveTarget(null)}>Batal</button><button className="btn-primary" onClick={saveMove}>Simpan Transaksi</button></>}>
        <div className="space-y-3">
          <Field label="Jenis transaksi">
            <div className="flex gap-2">
              {(["in", "out"] as const).map((k) => (
                <button key={k} onClick={() => setMoveKind(k)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${moveKind === k ? "border-navy-700 bg-navy-700 text-white" : "border-steel-200 text-steel-600"}`}>
                  {k === "in" ? "Penerimaan (GR)" : "Pengeluaran (GI)"}
                </button>
              ))}
            </div>
          </Field>
          <FormGrid>
            <Field label="Jumlah"><input type="number" min={1} className="input" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} /></Field>
            <Field label="Referensi (PO / Proyek)" hint="cth: PO-2026-120 atau NB-2025-012">
              <input className="input font-mono" value={moveRef} onChange={(e) => setMoveRef(e.target.value)} />
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? ""} subtitle={detail ? `${detail.id} · ${detail.sku}` : ""}>
        {detail && (
          <dl className="space-y-2.5 text-sm">
            {[["Kategori", detail.category], ["Gudang", detail.warehouse], ["Lokasi", detail.location],
              ["Stok", `${Number(detail.stock).toLocaleString()} ${detail.unit}`],
              ["Minimum", Number(detail.minStock).toLocaleString()],
              ["Harga satuan", `Rp ${Number(detail.cost).toLocaleString("id-ID")}`],
              ["Nilai total", `Rp ${(Number(detail.stock) * Number(detail.cost)).toLocaleString("id-ID")}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900">{v}</dd></div>
            ))}
          </dl>
        )}
      </Modal>
    </div>
  );
}
