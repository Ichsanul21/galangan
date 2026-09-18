import { useState } from "react";
import { Plus, Factory, ShoppingCart, ClipboardList, Check, X, Undo2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, ConfirmModal, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtRupiah, fmtJumlah, fmtTanggal, todayISO } from "../../utils/format";
import { spendByCategory, procurementTrend, poCountTrend, poValueTrend, prPendingTrend, vendorTrend } from "../../data";

/* Status kanonis PO + pemetaan status seed lama. */
const PO_NEXT: Record<string, string[]> = {
  Draft: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Dikirim"],
  Dikirim: ["Diterima Sebagian", "Diterima"],
  "Diterima Sebagian": ["Diterima"],
  Diterima: [],
  Ditolak: [],
};

function normPo(s: string): string {
  if (s === "Menunggu Persetujuan") return "Diajukan";
  if (s === "Dalam Pengiriman") return "Dikirim";
  return s;
}

const poNext = (s: string): string[] => PO_NEXT[normPo(s)] ?? [];

const poStatus: Record<string, "green" | "amber" | "blue" | "gray"> = {
  Diajukan: "gray",
  "Menunggu Persetujuan": "gray",
  Disetujui: "blue",
  Dikirim: "amber",
  "Dalam Pengiriman": "amber",
  "Diterima Sebagian": "blue",
  Diterima: "green",
  Ditolak: "gray",
  Draft: "gray",
};

const PR_PENDING = ["Menunggu Approval", "RFQ", "Diajukan"];

export default function Procurement() {
  const { data, add, update, log } = useStore();
  const purchaseOrders = data.purchaseOrders;
  const requisitions = data.requisitions;
  const vendors = data.vendors;

  const [tab, setTab] = useState("Purchase Order");
  const [showPo, setShowPo] = useState(false);
  const [poForm, setPoForm] = useState({ itemId: "", vendor: "", req: "", amount: "", qty: "" });
  const [showPr, setShowPr] = useState(false);
  const [prForm, setPrForm] = useState({ item: "", by: "", amount: "" });
  const [showVendor, setShowVendor] = useState(false);
  const [vForm, setVForm] = useState({ name: "", cat: "Baja & Struktur" });

  const [confirmApprove, setConfirmApprove] = useState<StoreItem | null>(null);
  const [confirmRejectPo, setConfirmRejectPo] = useState<StoreItem | null>(null);
  const [recvPo, setRecvPo] = useState<StoreItem | null>(null);
  const [recvItem, setRecvItem] = useState("");
  const [recvQty, setRecvQty] = useState("");
  const [retPo, setRetPo] = useState<StoreItem | null>(null);
  const [retQty, setRetQty] = useState("");
  const [retNote, setRetNote] = useState("");
  const [convPr, setConvPr] = useState<StoreItem | null>(null);
  const [convVendor, setConvVendor] = useState("");

  const openPo = purchaseOrders.filter((p) => normPo(p.status) !== "Diterima").reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingPr = requisitions.filter((r) => PR_PENDING.includes(r.status)).length;

  const savePo = () => {
    const invItem = data.inventory.find((i) => i.id === poForm.itemId);
    if (!invItem) { toast("Pilih item inventori dari daftar", "info"); return; }
    if (!poForm.vendor) { toast("Vendor wajib dipilih", "info"); return; }
    const amount = Number(poForm.amount);
    if (!amount || amount <= 0) { toast("Nilai PO harus lebih dari 0", "info"); return; }
    const qty = Number(poForm.qty);
    if (!qty || qty <= 0) { toast("Qty harus lebih dari 0", "info"); return; }
    const created = add("purchaseOrders", {
      item: invItem.name, itemId: invItem.id, vendor: poForm.vendor, req: poForm.req.trim() || "-",
      amount, qty, receivedQty: 0, returnedQty: 0, status: "Diajukan", date: todayISO(),
    }, { action: "membuat PO", module: "Procurement" });
    toast(`PO ${created.id} dibuat (Diajukan)`);
    setShowPo(false);
    setPoForm({ itemId: "", vendor: "", req: "", amount: "", qty: "" });
  };

  const doPoStatus = (po: StoreItem, next: string) => {
    update("purchaseOrders", po.id, { status: next });
    toast(`${po.id} → ${next}`);
  };

  const openRecv = (po: StoreItem) => {
    setRecvPo(po);
    setRecvItem(po.itemId ?? "");
    setRecvQty(po.qty ? String(po.qty) : "");
  };

  /* Penerimaan menulis qty PERSIS ke item terlink + movement yang sama. */
  const confirmRecv = (mode: "penuh" | "sebagian") => {
    if (!recvPo) return;
    const invItem = data.inventory.find((i) => i.id === recvItem);
    if (!invItem) { toast("Pilih item inventori tujuan", "info"); return; }
    const qty = Number(recvQty);
    if (!qty || qty <= 0) { toast("Qty terima harus lebih dari 0", "info"); return; }
    update("inventory", invItem.id, { stock: Number(invItem.stock) + qty });
    add("movements", {
      item: invItem.name, itemId: invItem.id, type: "Penerimaan", qty, by: recvPo.id, date: todayISO(), tone: "in",
    }, { action: "menerima barang", target: `${invItem.name} × ${qty} (${recvPo.id})`, module: "Procurement" });
    update("purchaseOrders", recvPo.id, {
      itemId: invItem.id, item: invItem.name,
      qty: recvPo.qty ?? qty,
      receivedQty: Number(recvPo.receivedQty || 0) + qty,
      status: mode === "penuh" ? "Diterima" : "Diterima Sebagian",
    });
    toast(`${recvPo.id} ${mode === "penuh" ? "diterima" : "diterima sebagian"} — stok ${invItem.name} +${qty}`);
    setRecvPo(null);
    setRecvItem("");
    setRecvQty("");
  };

  const maxRet = (po: StoreItem): number =>
    Math.max(0, Number(po.receivedQty ?? po.qty ?? 0) - Number(po.returnedQty ?? 0));

  const confirmRetur = () => {
    if (!retPo) return;
    const qty = Number(retQty);
    if (!qty || qty <= 0) { toast("Qty retur harus lebih dari 0", "info"); return; }
    if (qty > maxRet(retPo)) { toast(`Qty retur melebihi qty diterima (maks ${maxRet(retPo)})`, "info"); return; }
    if (!retNote.trim()) { toast("Alasan retur wajib diisi", "info"); return; }
    const invItem = data.inventory.find((i) => i.id === retPo.itemId);
    if (!invItem) { toast("PO ini belum terlink ke item inventori", "info"); return; }
    if (Number(invItem.stock) < qty) { toast("Stok tidak cukup untuk retur", "info"); return; }
    update("inventory", invItem.id, { stock: Number(invItem.stock) - qty });
    add("movements", {
      item: invItem.name, itemId: invItem.id, type: "Retur", qty, by: `${retPo.id} — ${retNote.trim()}`, date: todayISO(), tone: "out",
    }, { action: "meretur barang", target: `${invItem.name} × ${qty} (${retPo.id})`, module: "Procurement" });
    update("purchaseOrders", retPo.id, { returnedQty: Number(retPo.returnedQty || 0) + qty });
    log("meretur barang", `${invItem.name} × ${qty} (${retPo.id}): ${retNote.trim()}`, "Procurement");
    toast(`Retur ${retPo.id} × ${qty} tersimpan`);
    setRetPo(null);
    setRetQty("");
    setRetNote("");
  };

  const approvePr = (r: StoreItem, ok: boolean) => {
    update("requisitions", r.id, { status: ok ? "Disetujui" : "Ditolak" });
    toast(`${r.id} ${ok ? "disetujui" : "ditolak"}`);
  };

  /* PR hanya bisa dikonversi setelah Disetujui; vendor dipilih eksplisit. */
  const confirmConvPr = () => {
    if (!convPr) return;
    if (convPr.status !== "Disetujui") { toast("PR harus Disetujui dulu sebelum jadi PO", "info"); return; }
    if (!convVendor) { toast("Vendor wajib dipilih", "info"); return; }
    const amount = Number(convPr.amount);
    if (!amount || amount <= 0) { toast("Nilai PR harus lebih dari 0", "info"); return; }
    const created = add("purchaseOrders", {
      item: convPr.item, vendor: convVendor, req: convPr.id,
      amount, status: "Diajukan", date: todayISO(),
    }, { action: "mengkonversi PR ke PO", target: convPr.id, module: "Procurement" });
    update("requisitions", convPr.id, { status: "Sudah PO" });
    toast(`${convPr.id} dikonversi menjadi ${created.id}`);
    setConvPr(null);
    setConvVendor("");
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
        <KpiCard label="PO Aktif" value={String(purchaseOrders.length)} icon={<ShoppingCart className="h-5 w-5" />} chip="navy" spark={poCountTrend} hint="Sedang berjalan" />
        <KpiCard label="Nilai PO Terbuka" value={fmtRupiah(openPo)} hint="Belum diterima penuh" icon={<ShoppingCart className="h-5 w-5" />} chip="teal" spark={poValueTrend} />
        <KpiCard label="Permintaan Menunggu" value={`${pendingPr} PR`} hint="Perlu approval" icon={<ClipboardList className="h-5 w-5" />} chip="amber" spark={prPendingTrend} />
        <KpiCard label="Vendor Terdaftar" value={String(vendors.length)} icon={<Factory className="h-5 w-5" />} chip="violet" hint="Rating & evaluasi" spark={vendorTrend} />
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
                          <span className="truncate text-steel-600" title={d.name}>{d.name}</span>
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
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">PO</th><th className="th">Item</th><th className="th">Vendor</th><th className="th">Nilai</th><th className="th">Tanggal</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {purchaseOrders.map((po) => {
                      const st = normPo(po.status);
                      return (
                        <tr key={po.id} className="hover:bg-surface">
                          <td className="td font-mono font-medium text-navy-900">{po.id}</td>
                          <td className="td text-steel-600">
                            <p className="truncate" title={String(po.item)}>{po.item}</p>
                            {(po.qty || po.receivedQty) && (
                              <p className="text-xs text-steel-400">
                                Qty {po.qty ? fmtJumlah(Number(po.qty)) : "—"} · Diterima {fmtJumlah(Number(po.receivedQty || 0))}
                                {Number(po.returnedQty || 0) > 0 && ` · Retur ${fmtJumlah(Number(po.returnedQty))}`}
                              </p>
                            )}
                          </td>
                          <td className="td text-steel-600 truncate" title={String(po.vendor)}>{po.vendor}</td>
                          <td className="td font-semibold">{fmtRupiah(po.amount)}</td>
                          <td className="td text-steel-600">{fmtTanggal(po.date)}</td>
                          <td className="td"><Badge tone={poStatus[po.status] ?? poStatus[st] ?? "gray"}>{st}</Badge></td>
                          <td className="td">
                            <div className="flex flex-wrap gap-1.5">
                              {st === "Diajukan" && (
                                <>
                                  <button className="btn-secondary text-xs" onClick={() => setConfirmApprove(po)}><Check className="h-3.5 w-3.5" /> Setujui</button>
                                  <button className="btn-secondary text-xs text-rose-600" aria-label={`Tolak ${po.id}`} onClick={() => setConfirmRejectPo(po)}><X className="h-3.5 w-3.5" /> Tolak</button>
                                </>
                              )}
                              {st === "Draft" && (
                                <button className="btn-secondary text-xs" onClick={() => doPoStatus(po, "Diajukan")}>Ajukan</button>
                              )}
                              {st === "Disetujui" && (
                                <button className="btn-secondary text-xs" onClick={() => doPoStatus(po, "Dikirim")}>Kirim</button>
                              )}
                              {(st === "Dikirim" || st === "Diterima Sebagian") && (
                                <>
                                  <button className="btn-primary text-xs" onClick={() => openRecv(po)}>Terima</button>
                                  {st === "Dikirim" && (
                                    <button className="btn-secondary text-xs" onClick={() => openRecv(po)}>Terima Sebagian</button>
                                  )}
                                </>
                              )}
                              {st === "Diterima" && (
                                <button className="btn-secondary text-xs" aria-label={`Retur ${po.id}`} onClick={() => { setRetPo(po); setRetQty(""); setRetNote(""); }}>
                                  <Undo2 className="h-3.5 w-3.5" /> Retur
                                </button>
                              )}
                              {poNext(po.status).length === 0 && st !== "Diterima" && <span className="text-xs text-steel-400">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">PR</th><th className="th">Item</th><th className="th">Oleh</th><th className="th">Nilai</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {requisitions.map((r) => (
                      <tr key={r.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{r.id}</td>
                        <td className="td text-steel-600 truncate" title={String(r.item)}>{r.item}</td>
                        <td className="td text-steel-600">{r.by}</td>
                        <td className="td font-semibold">{fmtRupiah(r.amount)}</td>
                        <td className="td"><StatusBadge status={r.status} /></td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {PR_PENDING.includes(r.status) && (
                              <>
                                <button className="btn-secondary text-xs" onClick={() => approvePr(r, true)}><Check className="h-3.5 w-3.5" /> Setujui</button>
                                <button className="btn-secondary text-xs text-rose-600" aria-label={`Tolak ${r.id}`} onClick={() => approvePr(r, false)}><X className="h-3.5 w-3.5" /> Tolak</button>
                              </>
                            )}
                            {r.status === "Disetujui" && (
                              <button className="btn-primary text-xs" onClick={() => { setConvPr(r); setConvVendor(""); }}>Jadikan PO</button>
                            )}
                            {r.status === "Ditolak" && (
                              <button className="btn-secondary text-xs" onClick={() => update("requisitions", r.id, { status: "Menunggu Approval" })}>Ajukan Ulang</button>
                            )}
                            {(r.status === "Sudah PO") && <span className="text-xs text-steel-400">—</span>}
                          </div>
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
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Vendor</th><th className="th">Harga</th><th className="th">Lead</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    <tr><td className="td">PT Bahana Baja</td><td className="td font-semibold text-emerald-600">Rp 14.250 /kg</td><td className="td">3 minggu</td></tr>
                    <tr><td className="td">PT Steelindo</td><td className="td">Rp 14.900 /kg</td><td className="td">4 minggu</td></tr>
                    <tr><td className="td">PT Primabaja</td><td className="td">Rp 15.400 /kg</td><td className="td">5 minggu</td></tr>
                  </tbody>
                </table>
                <button className="btn-primary mt-4" onClick={() => {
                  const match = data.inventory.find((i) => i.name.toLowerCase().includes("pelat baja"));
                  setPoForm({ itemId: match?.id ?? "", vendor: "PT Bahana Baja", req: "RFQ-2026-09", amount: "4120000000", qty: "" });
                  setShowPo(true);
                }}>Pilih & Konversi ke PO</button>
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
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy-900 truncate" title={String(v.name)}>{v.name}</p>
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
      <Modal open={showPo} onClose={() => setShowPo(false)} title="Buat Purchase Order" subtitle="Masuk status Diajukan"
        footer={<><button className="btn-secondary" onClick={() => setShowPo(false)}>Batal</button><button className="btn-primary" onClick={savePo}>Simpan PO</button></>}>
        <div className="space-y-3">
          <Field label="Item inventori" hint="Wajib — penerimaan menambah stok item ini persis sebesar qty">
            <select className="input" value={poForm.itemId} onChange={(e) => setPoForm({ ...poForm, itemId: e.target.value })}>
              <option value="">Pilih item…</option>
              {data.inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label="Vendor">
              <select className="input" value={poForm.vendor} onChange={(e) => setPoForm({ ...poForm, vendor: e.target.value })}>
                <option value="">Pilih vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Referensi PR"><input className="input font-mono" value={poForm.req} onChange={(e) => setPoForm({ ...poForm, req: e.target.value })} placeholder="cth: PR-2026-211" /></Field>
          </FormGrid>
          <FormGrid>
            <Field label="Nilai (Rp)"><input type="number" min={0} className="input" value={poForm.amount} onChange={(e) => setPoForm({ ...poForm, amount: e.target.value })} /></Field>
            <Field label="Qty"><input type="number" min={0} className="input" value={poForm.qty} onChange={(e) => setPoForm({ ...poForm, qty: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Konfirmasi setujui / tolak PO */}
      <ConfirmModal
        open={confirmApprove !== null}
        title={`Setujui ${confirmApprove?.id ?? ""}?`}
        desc="PO yang disetujui berlanjut ke tahap pengiriman."
        confirmLabel="Ya, setujui"
        onCancel={() => setConfirmApprove(null)}
        onConfirm={() => { if (confirmApprove) doPoStatus(confirmApprove, "Disetujui"); setConfirmApprove(null); }}
      />
      <ConfirmModal
        open={confirmRejectPo !== null}
        title={`Tolak ${confirmRejectPo?.id ?? ""}?`}
        desc="PO yang ditolak berhenti di tahap pengajuan."
        confirmLabel="Ya, tolak"
        onCancel={() => setConfirmRejectPo(null)}
        onConfirm={() => { if (confirmRejectPo) doPoStatus(confirmRejectPo, "Ditolak"); setConfirmRejectPo(null); }}
      />

      {/* Modal terima barang */}
      <Modal open={recvPo !== null} onClose={() => setRecvPo(null)} title={`Terima ${recvPo?.id ?? ""}`} subtitle="Stok bertambah persis sebesar qty yang diterima"
        footer={<>
          <button className="btn-secondary" onClick={() => setRecvPo(null)}>Batal</button>
          <button className="btn-secondary" onClick={() => confirmRecv("sebagian")}>Terima Sebagian</button>
          <button className="btn-primary" onClick={() => confirmRecv("penuh")}>Terima Penuh</button>
        </>}>
        <div className="space-y-3">
          <Field label="Item inventori tujuan">
            <select className="input" value={recvItem} onChange={(e) => setRecvItem(e.target.value)}>
              <option value="">Pilih item…</option>
              {data.inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <Field label="Qty diterima"><input type="number" min={0} className="input" value={recvQty} onChange={(e) => setRecvQty(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* Modal retur */}
      <Modal open={retPo !== null} onClose={() => setRetPo(null)} title={`Retur ${retPo?.id ?? ""}`} subtitle={retPo ? `Maksimal ${fmtJumlah(maxRet(retPo))} (diterima dikurangi yang sudah diretur)` : ""}
        footer={<><button className="btn-secondary" onClick={() => setRetPo(null)}>Batal</button><button className="btn-primary" onClick={confirmRetur}>Simpan Retur</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Qty retur"><input type="number" min={0} className="input" value={retQty} onChange={(e) => setRetQty(e.target.value)} /></Field>
            <Field label="Alasan"><input className="input" value={retNote} onChange={(e) => setRetNote(e.target.value)} placeholder="cth: Rusak saat kirim" /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal konversi PR → PO */}
      <Modal open={convPr !== null} onClose={() => setConvPr(null)} title={`Jadikan PO — ${convPr?.id ?? ""}`} subtitle={`${convPr?.item ?? ""} · ${fmtRupiah(convPr?.amount ?? 0)}`}
        footer={<><button className="btn-secondary" onClick={() => setConvPr(null)}>Batal</button><button className="btn-primary" onClick={confirmConvPr}>Buat PO</button></>}>
        <Field label="Vendor">
          <select className="input" value={convVendor} onChange={(e) => setConvVendor(e.target.value)}>
            <option value="">Pilih vendor…</option>
            {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
        </Field>
      </Modal>

      {/* Modal PR */}
      <Modal open={showPr} onClose={() => setShowPr(false)} title="Buat Purchase Requisition"
        footer={<><button className="btn-secondary" onClick={() => setShowPr(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!prForm.item.trim()) { toast("Item wajib diisi", "info"); return; }
          if (!Number(prForm.amount) || Number(prForm.amount) <= 0) { toast("Estimasi nilai harus lebih dari 0", "info"); return; }
          const created = add("requisitions", { item: prForm.item.trim(), by: prForm.by.trim() || "Anda", amount: Number(prForm.amount), status: "Menunggu Approval" },
            { action: "mengajukan PR", module: "Procurement" });
          toast(`PR ${created.id} diajukan`); setShowPr(false); setPrForm({ item: "", by: "", amount: "" });
        }}>Ajukan</button></>}>
        <div className="space-y-3">
          <Field label="Item dibutuhkan"><input className="input" value={prForm.item} onChange={(e) => setPrForm({ ...prForm, item: e.target.value })} /></Field>
          <FormGrid>
            <Field label="Pemohon"><input className="input" value={prForm.by} onChange={(e) => setPrForm({ ...prForm, by: e.target.value })} placeholder="cth: Rudi H." /></Field>
            <Field label="Estimasi nilai (Rp)"><input type="number" min={0} className="input" value={prForm.amount} onChange={(e) => setPrForm({ ...prForm, amount: e.target.value })} /></Field>
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
