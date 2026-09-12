import { useState } from "react";
import { Plus, Factory, ShoppingCart, ClipboardList, Check } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtRupiah, spendByCategory, procurementTrend, sparkRevenue } from "../../data";

const poStatus: Record<string, "green" | "amber" | "blue" | "gray"> = {
  Diterima: "green",
  "Dalam Pengiriman": "blue",
  Dikirim: "amber",
  "Menunggu Persetujuan": "gray",
};

export default function Procurement() {
  const { data, add, update } = useStore();
  const purchaseOrders = data.purchaseOrders;
  const requisitions = data.requisitions;
  const vendors = data.vendors;

  const [tab, setTab] = useState("Purchase Order");
  const [showPo, setShowPo] = useState(false);
  const [poForm, setPoForm] = useState({ item: "", vendor: "", req: "", amount: "" });
  const [showPr, setShowPr] = useState(false);
  const [prForm, setPrForm] = useState({ item: "", by: "", amount: "" });
  const [showVendor, setShowVendor] = useState(false);
  const [vForm, setVForm] = useState({ name: "", cat: "Baja & Struktur" });

  const openPo = purchaseOrders.filter((p) => p.status !== "Diterima").reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingPr = requisitions.filter((r) => r.status === "Menunggu Approval" || r.status === "RFQ").length;

  const savePo = () => {
    if (!poForm.item.trim() || !poForm.vendor) { toast("Item & vendor wajib diisi", "info"); return; }
    const created = add("purchaseOrders", {
      item: poForm.item.trim(), vendor: poForm.vendor, req: poForm.req.trim() || "-",
      amount: Number(poForm.amount) || 0, status: "Menunggu Persetujuan", date: new Date().toISOString().slice(0, 10),
    }, { action: "membuat PO", module: "Procurement" });
    toast(`PO ${created.id} dibuat`);
    setShowPo(false);
    setPoForm({ item: "", vendor: "", req: "", amount: "" });
  };

  const approvePo = (po: StoreItem) => {
    update("purchaseOrders", po.id, { status: "Dalam Pengiriman" });
    toast(`${po.id} disetujui → dalam pengiriman`);
  };

  const receivePo = (po: StoreItem) => {
    update("purchaseOrders", po.id, { status: "Diterima" });
    // Integrasi: terima barang → catat GR + tambah stok item yang cocok
    const match = data.inventory.find((i) => po.item.toLowerCase().includes(i.name.split(" ")[0].toLowerCase()) || i.name.toLowerCase().includes(po.item.split(" ")[0].toLowerCase()));
    add("movements", {
      item: po.item, type: "Penerimaan", qty: 1, by: po.id, date: new Date().toISOString().slice(0, 10), tone: "in",
    }, { action: "menerima barang", target: `${po.item} (${po.id})`, module: "Procurement" });
    if (match) update("inventory", match.id, { stock: Number(match.stock) + 1 });
    toast(`${po.id} diterima — GR tercatat${match ? ` & stok ${match.name} +1` : ""}`);
  };

  const prToPo = (r: StoreItem) => {
    update("requisitions", r.id, { status: "Sudah PO" });
    add("purchaseOrders", {
      item: r.item, vendor: vendors[0]?.name ?? "-", req: r.id,
      amount: Number(r.amount) || 0, status: "Menunggu Persetujuan", date: new Date().toISOString().slice(0, 10),
    }, { action: "mengkonversi PR ke PO", target: r.id, module: "Procurement" });
    toast(`${r.id} dikonversi menjadi PO`);
  };

  return (
    <div>
      <PageHeader
        title="Procurement & Purchasing"
        subtitle="Permintaan, penawaran, PO, dan manajemen vendor"
        icon={<ShoppingCart className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowPo(true)}><Plus className="h-4 w-4" /> Buat PO</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="PO Aktif" value={String(purchaseOrders.length)} icon={<ShoppingCart className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Sedang berjalan" />
        <KpiCard label="Nilai PO Terbuka" value={fmtRupiah(openPo)} hint="Belum diterima penuh" icon={<ShoppingCart className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Permintaan Menunggu" value={`${pendingPr} PR`} hint="Perlu approval" icon={<ClipboardList className="h-5 w-5" />} chip="amber" />
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
                    <tr><th className="th">PO</th><th className="th">Item</th><th className="th">Vendor</th><th className="th">Nilai</th><th className="th">Tanggal</th><th className="th">Status</th><th className="th">Aksi</th></tr>
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
                        <td className="td">
                          <div className="flex gap-1.5">
                            {po.status === "Menunggu Persetujuan" && (
                              <button className="btn-secondary text-xs" onClick={() => approvePo(po)}><Check className="h-3.5 w-3.5" /> Setujui</button>
                            )}
                            {(po.status === "Dalam Pengiriman" || po.status === "Dikirim") && (
                              <button className="btn-primary text-xs" onClick={() => receivePo(po)}>Terima</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Permintaan (PR)" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowPr(true)}><Plus className="h-3.5 w-3.5" /> Buat PR</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">PR</th><th className="th">Item</th><th className="th">Oleh</th><th className="th">Nilai</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {requisitions.map((r) => (
                      <tr key={r.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{r.id}</td>
                        <td className="td text-steel-600">{r.item}</td>
                        <td className="td text-steel-600">{r.by}</td>
                        <td className="td font-semibold">{fmtRupiah(r.amount)}</td>
                        <td className="td"><StatusBadge status={r.status} /></td>
                        <td className="td">
                          {r.status !== "Sudah PO" && (
                            <button className="btn-secondary text-xs" onClick={() => prToPo(r)}>Jadikan PO</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <button className="btn-primary mt-4" onClick={() => { setPoForm({ item: "Pelat Baja AH36", vendor: "PT Bahana Baja", req: "RFQ-2026-09", amount: "4120000000" }); setShowPo(true); }}>Pilih & Konversi ke PO</button>
              </Card>
            </div>
          )}

          {tab === "Vendor" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowVendor(true)}><Plus className="h-3.5 w-3.5" /> Tambah Vendor</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {vendors.map((v) => (
                  <Card key={v.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{v.name}</p>
                        <p className="text-xs text-steel-500">{v.cat}</p>
                      </div>
                      <Badge tone={v.status === "Aktif" ? "green" : "amber"}>{v.status ?? "Aktif"}</Badge>
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
            </div>
          )}
        </div>
      </div>

      {/* Modal PO */}
      <Modal open={showPo} onClose={() => setShowPo(false)} title="Buat Purchase Order" subtitle="Masuk status Menunggu Persetujuan"
        footer={<><button className="btn-secondary" onClick={() => setShowPo(false)}>Batal</button><button className="btn-primary" onClick={savePo}>Simpan PO</button></>}>
        <div className="space-y-3">
          <Field label="Item"><input className="input" value={poForm.item} onChange={(e) => setPoForm({ ...poForm, item: e.target.value })} placeholder="cth: Anoda Zink" /></Field>
          <FormGrid>
            <Field label="Vendor">
              <select className="input" value={poForm.vendor} onChange={(e) => setPoForm({ ...poForm, vendor: e.target.value })}>
                <option value="">Pilih vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Referensi PR"><input className="input font-mono" value={poForm.req} onChange={(e) => setPoForm({ ...poForm, req: e.target.value })} placeholder="cth: PR-2026-211" /></Field>
          </FormGrid>
          <Field label="Nilai (Rp)"><input type="number" className="input" value={poForm.amount} onChange={(e) => setPoForm({ ...poForm, amount: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal PR */}
      <Modal open={showPr} onClose={() => setShowPr(false)} title="Buat Purchase Requisition"
        footer={<><button className="btn-secondary" onClick={() => setShowPr(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!prForm.item.trim()) { toast("Item wajib diisi", "info"); return; }
          const created = add("requisitions", { item: prForm.item.trim(), by: prForm.by.trim() || "Anda", amount: Number(prForm.amount) || 0, status: "Menunggu Approval" },
            { action: "mengajukan PR", module: "Procurement" });
          toast(`PR ${created.id} diajukan`); setShowPr(false); setPrForm({ item: "", by: "", amount: "" });
        }}>Ajukan</button></>}>
        <div className="space-y-3">
          <Field label="Item dibutuhkan"><input className="input" value={prForm.item} onChange={(e) => setPrForm({ ...prForm, item: e.target.value })} /></Field>
          <FormGrid>
            <Field label="Pemohon"><input className="input" value={prForm.by} onChange={(e) => setPrForm({ ...prForm, by: e.target.value })} placeholder="cth: Rudi H." /></Field>
            <Field label="Estimasi nilai (Rp)"><input type="number" className="input" value={prForm.amount} onChange={(e) => setPrForm({ ...prForm, amount: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal vendor */}
      <Modal open={showVendor} onClose={() => setShowVendor(false)} title="Tambah Vendor"
        footer={<><button className="btn-secondary" onClick={() => setShowVendor(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!vForm.name.trim()) { toast("Nama vendor wajib diisi", "info"); return; }
          const created = add("vendors", { name: vForm.name.trim(), cat: vForm.cat, onTime: 100, quality: 100, po: 0, status: "Kualifikasi" },
            { action: "mendaftarkan vendor", module: "Procurement" });
          toast(`Vendor ${created.id} ditambahkan`); setShowVendor(false); setVForm({ name: "", cat: "Baja & Struktur" });
        }}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama vendor"><input className="input" value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} /></Field>
          <Field label="Kategori">
            <select className="input" value={vForm.cat} onChange={(e) => setVForm({ ...vForm, cat: e.target.value })}>
              {["Baja & Struktur", "Mesin & Engine", "Cat & Coating", "Rigging & Wire", "Listrik", "Jasa"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
