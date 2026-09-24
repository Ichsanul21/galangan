import { useState, useMemo } from "react";
import { useStore } from "../../data/store";
import { useAuth, canSetTarget } from "../../auth/auth";
import { Card, Modal, Field, FormGrid, toast, EmptyState, StatusBadge, Badge, SortTh, toggleSort, sortRows } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { Plus, FileDown } from "lucide-react";
import { exportExcel, fmtRupiah } from "../../utils/export";
import { SATUAN, STATUS_BOQ_ID } from "../../utils/format";
import { todayISO } from "../../utils/format";
import type { BoQItem } from "../../data";

const STATUS_FLOW: Record<string, string[]> = {
  Draft: ["Pending"],
  Pending: ["Approved", "Rejected"],
  Approved: ["Completed"],
  Completed: [],
};

interface PriceHist { old: number; new: number; reason: string; date: string; by: string; }
type BoQExt = BoQItem & { priceHistory?: PriceHist[] };

const CATEGORIES = ["Mechanical", "Paint", "Survey", "Fabrikasi", "Electrical", "Piping", "Rigging"];

const PRESET: Record<string, { name: string; unit: string; price: number }[]> = {
  Mechanical: [
    { name: "Overhaul Pompa Sentrifugal", unit: "unit", price: 120000000 },
    { name: "Penggantian Bearing Set", unit: "set", price: 45000000 },
    { name: "Alignment Poros Propulsi", unit: "service", price: 85000000 },
  ],
  Paint: [
    { name: "Epoxy Primer", unit: "liter", price: 350000 },
    { name: "Antifouling Topcoat", unit: "liter", price: 520000 },
    { name: "Blasting Grit", unit: "kg", price: 18000 },
  ],
  Survey: [
    { name: "Inspeksi Class Tahunan", unit: "service", price: 150000000 },
    { name: "NDT Thickness Gauging", unit: "service", price: 95000000 },
    { name: "Stability Test", unit: "service", price: 75000000 },
  ],
  Fabrikasi: [
    { name: "Pelat Baja AH36", unit: "ton", price: 12000000 },
    { name: "Profil L-Bar", unit: "batang", price: 850000 },
    { name: "Elektroda Las", unit: "kg", price: 95000 },
  ],
  Electrical: [
    { name: "Kabel Marine 3x95", unit: "m", price: 780000 },
    { name: "Panel MCCB 3P", unit: "unit", price: 24000000 },
    { name: "Lampu Navigasi LED", unit: "pcs", price: 3500000 },
  ],
  Piping: [
    { name: "Pipa Galvanis 4in", unit: "batang", price: 1200000 },
    { name: "Valve Gate 4in", unit: "pcs", price: 4500000 },
    { name: "Fitting Elbow Set", unit: "set", price: 2800000 },
  ],
  Rigging: [
    { name: "Wire Rope 12mm", unit: "m", price: 185000 },
    { name: "Shackle 4.75T", unit: "pcs", price: 950000 },
    { name: "Chain Block 5T", unit: "unit", price: 12500000 },
  ],
};
interface Props {
  projectId: string;
}

export default function BoQSection({ projectId }: Props) {
  const { data, update, add, log } = useStore();
  const { user } = useAuth();
  const items = ((data.boq ?? []) as BoQExt[]).filter((b) => b.projectId === projectId);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", quantity: "", unit: "pcs", unitPrice: "", category: "Mechanical", status: "Draft" as BoQItem["status"] });
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState("Semua");
  const [stF, setStF] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [revisiFor, setRevisiFor] = useState<BoQExt | null>(null);
  const [revisiPrice, setRevisiPrice] = useState("");
  const [revisiReason, setRevisiReason] = useState("");
  const [histFor, setHistFor] = useState<BoQExt | null>(null);
  const [presetCat, setPresetCat] = useState("Mechanical");
  const [presetIdx, setPresetIdx] = useState("0");

  const filtered = useMemo(() => {
    const list = items.filter((b) => {
      const matchQ = `${b.name} ${b.description}`.toLowerCase().includes(q.toLowerCase());
      const matchCat = catF === "Semua" || b.category === catF;
      const matchSt = stF === "Semua" || b.status === stF;
      return matchQ && matchCat && matchSt;
    });
    return list;
  }, [items, q, catF, stF]);

  const totalBoq = useMemo(() => items.reduce((s, b) => s + b.totalPrice, 0), [items]);
  const totalApproved = useMemo(() => items.filter((b) => ["Approved", "Completed"].includes(b.status)).reduce((s, b) => s + b.totalPrice, 0), [items]);
  const totalCompleted = useMemo(() => items.filter((b) => b.status === "Completed").reduce((s, b) => s + b.totalPrice, 0), [items]);
  const progress = totalBoq > 0 ? Math.round((totalCompleted / totalBoq) * 100) : 0;

  const nextStatus = (current: string): string[] => STATUS_FLOW[current] ?? [];

  const saveBoq = async () => {
    if (!form.name.trim()) { toast("Nama item wajib diisi", "info"); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast("Quantity tidak valid", "info"); return; }
    if (!form.unitPrice || Number(form.unitPrice) <= 0) { toast("Harga satuan tidak valid", "info"); return; }
    const total = Number(form.quantity) * Number(form.unitPrice);
    await add("boq", {
      projectId,
      name: form.name.trim(),
      description: form.description.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      unitPrice: Number(form.unitPrice),
      totalPrice: total,
      category: form.category,
      status: "Draft",
      requestedBy: "Anda",
    }, { action: "menambahkan BoQ item", module: "BoQ" });
    toast("BoQ item ditambahkan");
    setShowAdd(false);
    setForm({ name: "", description: "", quantity: "", unit: "pcs", unitPrice: "", category: "Mechanical", status: "Draft" });
  };

  const changeStatus = async (id: string, newStatus: string) => {
    if (newStatus === "Approved" && !canSetTarget(user?.role)) {
      toast("Hanya Direktur/Manager", "info");
      return;
    }
    await update("boq", id, { status: newStatus as BoQItem["status"] });
    log(`mengubah status BoQ → ${newStatus}`, `${id}`, "BoQ");
    toast(`Status ${id} → ${newStatus}`);
  };

  const saveRevisi = async () => {
    if (!revisiFor) return;
    const next = Number(revisiPrice);
    if (!Number.isFinite(next) || next <= 0) { toast("Harga satuan baru tidak valid", "info"); return; }
    if (!revisiReason.trim()) { toast("Alasan revisi wajib diisi", "info"); return; }
    const hist: PriceHist[] = [...(revisiFor.priceHistory ?? []), { old: revisiFor.unitPrice, new: next, reason: revisiReason.trim(), date: todayISO(), by: "Anda" }];
    await update("boq", revisiFor.id, { unitPrice: next, totalPrice: Number(revisiFor.quantity) * next, priceHistory: hist });
    log("merevisi harga BoQ", `${revisiFor.id} · ${fmtRupiah(revisiFor.unitPrice)} → ${fmtRupiah(next)} (${revisiReason.trim()})`, "BoQ");
    toast(`Harga ${revisiFor.id} direvisi`);
    setRevisiFor(null);
    setRevisiPrice("");
    setRevisiReason("");
  };

  const importPreset = async () => {
    const list = PRESET[presetCat] ?? [];
    const item = list[Number(presetIdx)];
    if (!item) { toast("Pilih item preset dulu", "info"); return; }
    await add("boq", {
      projectId,
      name: item.name,
      description: `Impor preset ${presetCat}`,
      quantity: 1,
      unit: item.unit,
      unitPrice: item.price,
      totalPrice: item.price,
      category: presetCat,
      status: "Draft",
      requestedBy: "Anda",
    }, { action: "mengimpor BoQ preset", module: "BoQ" });
    toast(`${item.name} ditambahkan sebagai Draft`);
  };

  const handleExport = () => {
    const rows = [["No", "Nama Item", "Deskripsi", "Qty", "Unit", "Harga Satuan", "Total", "Status"]];
    items.forEach((b, i) => rows.push([String(i + 1), b.name, b.description, String(b.quantity), b.unit, String(b.unitPrice), String(b.totalPrice), b.status]));
    rows.push(["", "TOTAL", "", "", "", "", String(totalBoq), ""]);
    exportExcel(rows, `BoQ-${projectId}`);
    toast("BoQ diekspor ke Excel");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><FileDown className="h-4 w-4" /> Daftar BoQ ({items.length})</h3>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={handleExport}><FileDown className="h-3.5 w-3.5" /> Export Excel</button>
            <button className="btn-primary text-xs" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Tambah BoQ</button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            className="input w-full sm:w-52"
            placeholder="Cari item / deskripsi..."
            aria-label="Cari BoQ"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="input w-auto py-1.5 text-sm" aria-label="Filter kategori" value={catF} onChange={(e) => setCatF(e.target.value)}>
            <option value="Semua">Semua kategori</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input w-auto py-1.5 text-sm" aria-label="Filter status" value={stF} onChange={(e) => setStF(e.target.value)}>
            <option value="Semua">Semua status</option>
            {["Draft", "Pending", "Approved", "Completed", "Rejected"].map((s) => <option key={s} value={s}>{STATUS_BOQ_ID[s] ?? s}</option>)}
          </select>
          <span className="ml-auto text-xs text-steel-500">{filtered.length} dari {items.length} item</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-2.5">
          <span className="text-xs font-semibold text-navy-900">Impor dari preset:</span>
          <select className="input w-auto py-1.5 text-sm" aria-label="Kategori preset" value={presetCat} onChange={(e) => { setPresetCat(e.target.value); setPresetIdx("0"); }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input w-auto max-w-64 py-1.5 text-sm" aria-label="Item preset" value={presetIdx} onChange={(e) => setPresetIdx(e.target.value)}>
            {(PRESET[presetCat] ?? []).map((p, i) => <option key={p.name} value={String(i)}>{p.name} · {p.unit} · {fmtRupiah(p.price)}</option>)}
          </select>
          <button className="btn-secondary text-xs" onClick={importPreset}><Plus className="h-3.5 w-3.5" /> Tambah sebagai Draft</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">Total BoQ</p>
            <p className="text-sm font-bold text-navy-900">{fmtRupiah(totalBoq)}</p>
          </div>
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">Approved</p>
            <p className="text-sm font-bold text-blue-600">{fmtRupiah(totalApproved)}</p>
          </div>
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">Completed</p>
            <p className="text-sm font-bold text-green-600">{fmtRupiah(totalCompleted)}</p>
          </div>
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">Progress</p>
            <p className="text-sm font-bold text-navy-900">{progress}%</p>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={<FileDown className="h-6 w-6" />} title="Belum ada BoQ" subtitle="Tambah item BoQ untuk memulai" />
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel-400">Tidak ada item yang cocok dengan pencarian/filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface">
                <tr>
                  <SortTh label="No" sortKey="id" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Nama Item" sortKey="name" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Deskripsi" sortKey="description" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Qty" sortKey="quantity" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Unit" sortKey="unit" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Harga Satuan" sortKey="unitPrice" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Total" sortKey="totalPrice" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label="Revisi" sortKey="revised" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <th className="th">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {sortRows(filtered, sort, (b: BoQExt, k) => k === "quantity" ? Number(b.quantity) : k === "unitPrice" ? Number(b.unitPrice) : k === "totalPrice" ? Number(b.totalPrice) : k === "revised" ? Number((b.priceHistory ?? []).length) : String((b as unknown as Record<string, unknown>)[k] ?? "")).map((b) => (
                  <tr key={b.id}>
                    <td className="td font-mono text-xs">{b.id}</td>
                    <td className="td font-medium text-navy-900">{b.name}</td>
                    <td className="td text-sm text-steel-600">{b.description}</td>
                    <td className="td">{b.quantity}</td>
                    <td className="td">{b.unit}</td>
                    <td className="td font-mono text-sm">{fmtRupiah(b.unitPrice)}</td>
                    <td className="td font-mono text-sm font-semibold">{fmtRupiah(b.totalPrice)}</td>
                    <td className="td"><StatusBadge status={b.status} label={STATUS_BOQ_ID[b.status] ?? b.status} /></td>
                    <td className="td">
                      {(b.priceHistory ?? []).length > 0 ? (
                        <button className="btn-secondary text-xs" onClick={() => setHistFor(b)}>
                          <Badge tone="amber">{(b.priceHistory ?? []).length}x</Badge> Riwayat
                        </button>
                      ) : (
                        <span className="text-xs text-steel-400">—</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {nextStatus(b.status).map((ns) => (
                          <button
                            key={ns}
                            aria-label={`Ubah ${b.name} menjadi ${STATUS_BOQ_ID[ns] ?? ns}`}
                            className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                              ns === "Approved" ? "bg-green-100 text-green-700 hover:bg-green-200" :
                              ns === "Rejected" ? "bg-rose-100 text-rose-700 hover:bg-rose-200" :
                              ns === "Completed" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" :
                              "bg-steel-100 text-steel-600 hover:bg-steel-200"
                            }`}
                            onClick={() => changeStatus(b.id, ns)}
                          >
                            {ns === "Approved" ? "Setujui" : ns === "Rejected" ? "Tolak" : ns === "Completed" ? "Selesaikan" : "Ajukan"}
                          </button>
                        ))}
                        <button
                          aria-label={`Revisi harga ${b.name}`}
                          className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-200"
                          onClick={() => { setRevisiFor(b); setRevisiPrice(String(b.unitPrice)); setRevisiReason(""); }}
                        >
                          Revisi Harga
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah BoQ Item"
        footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn-primary" onClick={saveBoq}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama item"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Overhaul Main Engine" /></Field>
          <Field label="Deskripsi"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <FormGrid>
            <Field label="Quantity"><input type="number" className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Unit"><select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {SATUAN.map((u) => <option key={u} value={u}>{u}</option>)}
            </select></Field>
          </FormGrid>
          <FormGrid>
            <Field label="Harga Satuan"><input type="number" className="input" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></Field>
            <Field label="Kategori"><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={revisiFor !== null} onClose={() => setRevisiFor(null)} title={`Revisi Harga: ${revisiFor?.name ?? ""}`} subtitle={revisiFor?.id}
        footer={<><button className="btn-secondary" onClick={() => setRevisiFor(null)}>Batal</button><button className="btn-primary" onClick={saveRevisi}>Simpan Revisi</button></>}>
        <div className="space-y-3">
          <p className="text-xs text-steel-500">Harga saat ini: <span className="font-semibold text-navy-900">{revisiFor ? fmtRupiah(revisiFor.unitPrice) : ""}</span> · total {revisiFor ? fmtRupiah(revisiFor.totalPrice) : ""} (qty {revisiFor?.quantity}). Riwayat tersimpan: {(revisiFor?.priceHistory ?? []).length}x.</p>
          <Field label="Harga satuan baru (Rp)"><input type="number" min={0} className="input" value={revisiPrice} onChange={(e) => setRevisiPrice(e.target.value)} placeholder="cth: 500000000" /></Field>
          <Field label="Alasan revisi" hint="Wajib diisi — tercatat di riwayat harga"><textarea className="input" rows={3} value={revisiReason} onChange={(e) => setRevisiReason(e.target.value)} placeholder="cth: Penyesuaian kurs vendor +10%" /></Field>
        </div>
      </Modal>

      <Modal open={histFor !== null} onClose={() => setHistFor(null)} title={`Riwayat Harga: ${histFor?.name ?? ""}`} subtitle={histFor?.id}>
        <div className="space-y-2">
          {(histFor?.priceHistory ?? []).map((h, i) => (
            <div key={i} className="rounded-xl border border-steel-100 p-2.5 text-sm">
              <p className="font-medium text-navy-900">{fmtRupiah(h.old)} → {fmtRupiah(h.new)}</p>
              <p className="text-xs text-steel-500">{h.date} · {h.by} · {h.reason}</p>
            </div>
          ))}
          {(histFor?.priceHistory ?? []).length === 0 && <p className="text-sm text-steel-400">Belum ada riwayat revisi.</p>}
        </div>
      </Modal>
    </div>
  );
}
