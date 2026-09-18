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
  ClipboardCheck,
  Repeat,
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
import { fmtJumlah, fmtRupiah, fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { stockTrend, itemTrend, lowStockTrend, stockValueTrend, warehouseTrend } from "../../data";

const emptyForm = { name: "", category: "Baja", sku: "", warehouse: "Gudang Baja A", stock: "0", minStock: "0", unit: "pcs", cost: "0", location: "" };

/* Kebutuhan BOM TB Samudra Jaya 07 — dicocokkan ke data inventori aktual. */
const BOM_NEEDS = [
  { key: "Pelat Baja", need: 82000, unit: "kg" },
  { key: "Mesin Bantu", need: 2, unit: "unit" },
  { key: "Cat Epoxy", need: 1200, unit: "liter" },
  { key: "Pipa Schedule", need: 240, unit: "batang" },
  { key: "Kabel", need: 3500, unit: "meter" },
  { key: "Anoda", need: 86, unit: "pcs" },
];

function moveLabel(type: string): string {
  if (type === "Penerimaan") return "GR";
  if (type === "Pengeluaran") return "GI";
  if (type === "Selisih Opname") return "Opname";
  if (type === "Transfer") return "Transfer";
  if (type === "Retur") return "Retur";
  return type;
}

function moveTone(type: string, tone: string): "green" | "amber" | "blue" | "navy" | "red" | "gray" {
  if (type === "Penerimaan") return "green";
  if (type === "Pengeluaran") return "amber";
  if (type === "Selisih Opname") return "blue";
  if (type === "Transfer") return "navy";
  if (type === "Retur") return "red";
  return tone === "in" ? "green" : "gray";
}

export default function Inventory() {
  const { data, add, update, log } = useStore();
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

  const [showOpname, setShowOpname] = useState(false);
  const [opItem, setOpItem] = useState("");
  const [opCount, setOpCount] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [trItem, setTrItem] = useState("");
  const [trQty, setTrQty] = useState("");
  const [trDest, setTrDest] = useState("");

  const list = inventory.filter((i) => {
    const matchQ = `${i.name} ${i.sku}`.toLowerCase().includes(q.toLowerCase());
    const matchCat = cat === "Semua" || i.category === cat;
    return matchQ && matchCat;
  });

  const lowStock = inventory.filter((i) => i.stock <= i.minStock);
  const categories = ["Semua", ...Array.from(new Set(inventory.map((i) => i.category)))];
  const totalValue = inventory.reduce((s, i) => s + Number(i.stock || 0) * Number(i.cost || 0), 0);
  const warehouses = Array.from(new Set(inventory.map((i) => i.warehouse)));

  const bomRows = BOM_NEEDS.map((b) => {
    const item = inventory.find((i) => i.name.toLowerCase().includes(b.key.toLowerCase()));
    const stock = item ? Number(item.stock) : 0;
    return { ...b, item, stock, ok: stock >= b.need };
  });

  const opTarget = inventory.find((i) => i.id === opItem) ?? null;
  const opSelisih = opTarget && opCount !== "" ? Number(opCount) - Number(opTarget.stock) : null;
  const trTarget = inventory.find((i) => i.id === trItem) ?? null;

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openEdit = (i: StoreItem) => {
    setEditing(i);
    setForm({ name: i.name, category: i.category, sku: i.sku, warehouse: i.warehouse, stock: String(i.stock), minStock: String(i.minStock), unit: i.unit, cost: String(i.cost), location: i.location });
  };

  const save = () => {
    if (!form.name.trim() || !form.sku.trim()) { toast("Nama & SKU wajib diisi", "info"); return; }
    const dupe = inventory.some((i) => i.sku.toLowerCase() === form.sku.trim().toLowerCase() && i.id !== editing?.id);
    if (dupe) { toast("SKU sudah dipakai item lain", "info"); return; }
    if (editing) {
      /* Stok read-only di form edit — hanya field non-stok yang disimpan. */
      update("inventory", editing.id, {
        name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
        minStock: Number(form.minStock) || 0, unit: form.unit, cost: Number(form.cost) || 0, location: form.location,
      });
      toast(`${editing.id} diperbarui`);
      setEditing(null);
    } else {
      const created = add("inventory", {
        name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
        stock: Number(form.stock) || 0, minStock: Number(form.minStock) || 0, unit: form.unit,
        cost: Number(form.cost) || 0, location: form.location,
      }, { action: "mendaftarkan material", module: "Inventori" });
      toast(`Material ${created.id} ditambahkan`);
      setShowAdd(false);
    }
    setForm(emptyForm);
  };

  const saveMove = () => {
    if (!moveTarget) return;
    const qty = Number(moveQty);
    if (!qty || qty <= 0) { toast("Jumlah harus lebih dari 0", "info"); return; }
    if (moveKind === "out" && qty > Number(moveTarget.stock)) { toast(`Stok tidak cukup (tersedia ${fmtJumlah(Number(moveTarget.stock))})`, "info"); return; }
    const next = moveKind === "in" ? Number(moveTarget.stock) + qty : Number(moveTarget.stock) - qty;
    update("inventory", moveTarget.id, { stock: next });
    add("movements", {
      item: moveTarget.name, itemId: moveTarget.id,
      type: moveKind === "in" ? "Penerimaan" : "Pengeluaran",
      qty,
      by: moveRef.trim() || (moveKind === "in" ? "GR manual" : "GI manual"),
      date: todayISO(),
      tone: moveKind,
    }, { action: moveKind === "in" ? "menerima barang" : "mengeluarkan barang", target: `${moveTarget.name} × ${qty}`, module: "Inventori" });
    toast(`${moveKind === "in" ? "GR" : "GI"} ${moveTarget.name} × ${qty} tersimpan`);
    setMoveTarget(null);
    setMoveQty("");
    setMoveRef("");
  };

  const saveOpname = () => {
    if (!opTarget) { toast("Pilih item dulu", "info"); return; }
    if (opCount === "" || Number.isNaN(Number(opCount)) || Number(opCount) < 0) { toast("Stok hasil hitung tidak valid", "info"); return; }
    const selisih = Number(opCount) - Number(opTarget.stock);
    if (selisih === 0) { toast("Tidak ada selisih — stok sudah sama", "info"); return; }
    update("inventory", opTarget.id, { stock: Number(opCount) });
    add("movements", {
      item: opTarget.name, itemId: opTarget.id, type: "Selisih Opname", qty: selisih,
      by: `Opname ${todayISO()}`, date: todayISO(), tone: selisih > 0 ? "in" : "out",
    }, { action: "stok opname", target: `${opTarget.name}: selisih ${selisih > 0 ? "+" : ""}${selisih}`, module: "Inventori" });
    log("stok opname", `${opTarget.name}: tercatat ${Number(opCount)}, selisih ${selisih > 0 ? "+" : ""}${selisih}`, "Inventori");
    toast(`Opname ${opTarget.name} — selisih ${selisih > 0 ? "+" : ""}${selisih} tersimpan`);
    setShowOpname(false);
    setOpItem("");
    setOpCount("");
  };

  const saveTransfer = () => {
    if (!trTarget) { toast("Pilih item dulu", "info"); return; }
    const qty = Number(trQty);
    if (!qty || qty <= 0) { toast("Qty harus lebih dari 0", "info"); return; }
    if (qty > Number(trTarget.stock)) { toast(`Stok tidak cukup (tersedia ${fmtJumlah(Number(trTarget.stock))})`, "info"); return; }
    if (!trDest) { toast("Gudang tujuan wajib dipilih", "info"); return; }
    if (trDest === trTarget.warehouse) { toast("Gudang tujuan sama dengan gudang asal", "info"); return; }
    const from = trTarget.warehouse;
    update("inventory", trTarget.id, { warehouse: trDest });
    add("movements", {
      item: trTarget.name, itemId: trTarget.id, type: "Transfer", qty,
      by: `${from} → ${trDest}`, date: todayISO(), tone: "in",
    }, { action: "transfer gudang", target: `${trTarget.name} × ${qty}: ${from} → ${trDest}`, module: "Inventori" });
    log("transfer gudang", `${trTarget.name} × ${qty}: ${from} → ${trDest}`, "Inventori");
    toast(`Transfer ${trTarget.name} × ${qty} ke ${trDest}`);
    setShowTransfer(false);
    setTrItem("");
    setTrQty("");
    setTrDest("");
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
        <KpiCard label="Total Item Aktif" value={String(inventory.length)} icon={<Package className="h-5 w-5" />} chip="navy" spark={itemTrend} hint="Katalog keseluruhan" />
        <KpiCard label="Item Stok Menipis" value={String(lowStock.length)} delta="Perlu reorder" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={lowStockTrend} />
        <KpiCard label="Nilai Stok" value={fmtMiliar(totalValue)} hint="Cost basis total" icon={<Package className="h-5 w-5" />} chip="teal" spark={stockValueTrend} />
        <KpiCard label="Gudang" value={`${warehouses.length} lokasi`} hint={warehouses.slice(0, 3).join(", ")} chip="violet" spark={warehouseTrend} />
      </div>

      <div className="card">
        <Tabs tabs={["Katalog", "Stok per Gudang", "BOM", "Pergerakan"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Katalog" && (
            <>
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full sm:w-64" placeholder="Cari material / SKU..." value={q} onChange={(e) => setQ(e.target.value)} />
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
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Material</th><th className="th">Kategori</th><th className="th">Stok</th><th className="th">Min</th><th className="th">Satuan</th><th className="th">Status</th><th className="th">Lokasi</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {list.map((i) => {
                      const low = i.stock <= i.minStock;
                      return (
                        <tr key={i.id} className="hover:bg-surface">
                          <td className="td">
                            <p className="font-medium text-navy-900 truncate" title={String(i.name)}>{i.name}</p>
                            <p className="text-xs text-steel-500 font-mono">{i.sku}</p>
                          </td>
                          <td className="td"><Badge tone="gray">{i.category}</Badge></td>
                          <td className="td font-semibold text-navy-900">{fmtJumlah(Number(i.stock))}</td>
                          <td className="td text-steel-500">{fmtJumlah(Number(i.minStock))}</td>
                          <td className="td text-steel-600">{i.unit}</td>
                          <td className="td">
                            <Badge tone={low ? "red" : "green"}>{low ? "Menipis" : "Aman"}</Badge>
                          </td>
                          <td className="td text-steel-600 font-mono text-xs truncate" title={String(i.location)}>{i.location}</td>
                          <td className="td">
                            <div className="flex gap-1">
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Detail" aria-label={`Detail ${i.name}`} onClick={() => setDetail(i)}><Eye className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Ubah" aria-label={`Ubah ${i.name}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="GR/GI" aria-label={`GR atau GI ${i.name}`} onClick={() => setMoveTarget(i)}><ArrowDownToLine className="h-4 w-4" /></button>
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
                    <h3 className="mb-2 text-sm font-semibold text-navy-900 truncate" title={w}>{w}</h3>
                    <p className="text-xs text-steel-500">{items.length} item · {fmtJumlah(items.reduce((s, i) => s + Number(i.stock || 0), 0))} unit</p>
                    <div className="mt-3 space-y-1.5">
                      {items.map((i) => (
                        <div key={i.id} className="flex justify-between gap-2 text-sm">
                          <span className="text-steel-600 truncate" title={String(i.name)}>{i.name}</span>
                          <span className="font-medium shrink-0">{fmtJumlah(Number(i.stock))}</span>
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
                <CardHeader title="Bill of Materials — TB Samudra Jaya 07" subtitle="Kebutuhan vs stok aktual inventori" />
                <div className="mt-3 space-y-2">
                  {bomRows.map((b) => (
                    <div key={b.key} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-steel-700 truncate" title={b.item ? `${b.key} → ${b.item.name}` : b.key}>{b.key}</p>
                        <p className="text-xs text-steel-400 truncate" title={b.item ? String(b.item.name) : "Belum ada item cocok"}>
                          {b.item ? b.item.name : "Belum ada item cocok"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-navy-900">Butuh {fmtJumlah(b.need)} {b.unit} · Stok {fmtJumlah(b.stock)}</p>
                        <p className="mt-0.5 flex items-center justify-end gap-2 text-xs text-steel-500">
                          {b.item ? fmtRupiah(b.need * Number(b.item.cost || 0)) : "—"}
                          <Badge tone={b.ok ? "green" : "red"}>{b.ok ? "Cukup" : "Kurang"}</Badge>
                        </p>
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
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowTransfer(true)}><Repeat className="h-4 w-4" /> Transfer Antar Gudang</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowOpname(true)}><ClipboardCheck className="h-4 w-4" /> Stok Opname</button>
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
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Transaksi</th><th className="th">Item</th><th className="th">Tipe</th><th className="th">Jumlah</th><th className="th">Referensi</th><th className="th">Tanggal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {movements.map((m) => (
                      <tr key={m.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{m.id}</td>
                        <td className="td text-steel-600 truncate" title={String(m.item)}>{m.item}</td>
                        <td className="td">
                          <Badge tone={moveTone(m.type, m.tone)}>
                            {moveLabel(m.type)}
                          </Badge>
                        </td>
                        <td className="td font-semibold">{fmtJumlah(Number(m.qty))}</td>
                        <td className="td font-mono text-xs text-steel-600 truncate" title={String(m.by)}>{m.by}</td>
                        <td className="td text-steel-600">{fmtTanggal(m.date)}</td>
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
            {editing ? (
              <Field label="Stok saat ini" hint="Stok hanya berubah lewat GR/GI, opname, atau penerimaan PO">
                <input className="input bg-steel-50" value={fmtJumlah(Number(editing.stock))} disabled readOnly />
              </Field>
            ) : (
              <Field label="Stok awal"><input type="number" min={0} className="input" value={form.stock} onChange={(e) => setF("stock", e.target.value)} /></Field>
            )}
            <Field label="Stok minimum"><input type="number" min={0} className="input" value={form.minStock} onChange={(e) => setF("minStock", e.target.value)} /></Field>
            <Field label="Satuan">
              <select className="input" value={form.unit} onChange={(e) => setF("unit", e.target.value)}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Harga satuan (Rp)"><input type="number" min={0} className="input" value={form.cost} onChange={(e) => setF("cost", e.target.value)} /></Field>
          </FormGrid>
          <Field label="Lokasi rak"><input className="input font-mono" value={form.location} onChange={(e) => setF("location", e.target.value)} placeholder="cth: A1-02" /></Field>
        </div>
      </Modal>

      {/* Modal GR/GI */}
      <Modal open={moveTarget !== null} onClose={() => setMoveTarget(null)} title={`${moveKind === "in" ? "Terima Barang (GR)" : "Keluar Barang (GI)"} — ${moveTarget?.name ?? ""}`}
        subtitle={`Stok saat ini: ${moveTarget ? fmtJumlah(Number(moveTarget.stock)) : "0"} ${moveTarget?.unit ?? ""}`}
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

      {/* Modal opname */}
      <Modal open={showOpname} onClose={() => setShowOpname(false)} title="Stok Opname" subtitle="Hasil hitung fisik → selisih tercatat sebagai movement"
        footer={<><button className="btn-secondary" onClick={() => setShowOpname(false)}>Batal</button><button className="btn-primary" onClick={saveOpname}>Simpan Opname</button></>}>
        <div className="space-y-3">
          <Field label="Item">
            <select className="input" value={opItem} onChange={(e) => setOpItem(e.target.value)}>
              <option value="">Pilih item…</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <Field label="Stok hasil hitung" hint={opTarget ? `Stok tercatat: ${fmtJumlah(Number(opTarget.stock))} ${opTarget.unit}` : undefined}>
            <input type="number" min={0} className="input" value={opCount} onChange={(e) => setOpCount(e.target.value)} />
          </Field>
          {opSelisih !== null && opSelisih !== 0 && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              Selisih {opSelisih > 0 ? "+" : ""}{fmtJumlah(opSelisih)} akan tercatat sebagai movement “Selisih Opname”.
            </p>
          )}
        </div>
      </Modal>

      {/* Modal transfer gudang */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Antar Gudang" subtitle="Pindahkan item ke gudang lain"
        footer={<><button className="btn-secondary" onClick={() => setShowTransfer(false)}>Batal</button><button className="btn-primary" onClick={saveTransfer}>Simpan Transfer</button></>}>
        <div className="space-y-3">
          <Field label="Item">
            <select className="input" value={trItem} onChange={(e) => setTrItem(e.target.value)}>
              <option value="">Pilih item…</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.warehouse}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label="Qty" hint={trTarget ? `Tersedia ${fmtJumlah(Number(trTarget.stock))} ${trTarget.unit}` : undefined}>
              <input type="number" min={1} className="input" value={trQty} onChange={(e) => setTrQty(e.target.value)} />
            </Field>
            <Field label="Gudang tujuan">
              <select className="input" value={trDest} onChange={(e) => setTrDest(e.target.value)}>
                <option value="">Pilih gudang…</option>
                {warehouses.map((w) => <option key={w}>{w}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? ""} subtitle={detail ? `${detail.id} · ${detail.sku}` : ""}>
        {detail && (
          <dl className="space-y-2.5 text-sm">
            {[["Kategori", detail.category], ["Gudang", detail.warehouse], ["Lokasi", detail.location],
              ["Stok", `${fmtJumlah(Number(detail.stock))} ${detail.unit}`],
              ["Minimum", fmtJumlah(Number(detail.minStock))],
              ["Harga satuan", fmtRupiah(Number(detail.cost))],
              ["Nilai total", fmtRupiah(Number(detail.stock) * Number(detail.cost))],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900">{v}</dd></div>
            ))}
          </dl>
        )}
      </Modal>
    </div>
  );
}
