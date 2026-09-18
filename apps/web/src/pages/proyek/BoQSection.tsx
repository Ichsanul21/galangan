import { useState, useMemo } from "react";
import { useStore } from "../../data/store";
import { Card, Modal, Field, FormGrid, toast, EmptyState, StatusBadge } from "../../components/ui";
import { Plus, FileDown } from "lucide-react";
import { exportExcel, fmtRupiah } from "../../utils/export";
import type { BoQItem } from "../../data";

const STATUS_FLOW: Record<string, string[]> = {
  Draft: ["Pending"],
  Pending: ["Approved", "Rejected"],
  Approved: ["Completed"],
  Completed: [],
};
interface Props {
  projectId: string;
}

export default function BoQSection({ projectId }: Props) {
  const { data, update, add, log } = useStore();
  const items = ((data.boq ?? []) as BoQItem[]).filter((b) => b.projectId === projectId);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", quantity: "", unit: "pcs", unitPrice: "", category: "Mechanical", status: "Draft" as BoQItem["status"] });

  const totalBoq = useMemo(() => items.reduce((s, b) => s + b.totalPrice, 0), [items]);
  const totalApproved = useMemo(() => items.filter((b) => ["Approved", "Completed"].includes(b.status)).reduce((s, b) => s + b.totalPrice, 0), [items]);
  const totalCompleted = useMemo(() => items.filter((b) => b.status === "Completed").reduce((s, b) => s + b.totalPrice, 0), [items]);
  const progress = totalBoq > 0 ? Math.round((totalCompleted / totalBoq) * 100) : 0;

  const nextStatus = (current: string): string[] => STATUS_FLOW[current] ?? [];

  const saveBoq = () => {
    if (!form.name.trim()) { toast("Nama item wajib diisi", "info"); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast("Quantity tidak valid", "info"); return; }
    if (!form.unitPrice || Number(form.unitPrice) <= 0) { toast("Harga satuan tidak valid", "info"); return; }
    const total = Number(form.quantity) * Number(form.unitPrice);
    add("boq", {
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

  const changeStatus = (id: string, newStatus: string) => {
    update("boq", id, { status: newStatus as BoQItem["status"] });
    log(`mengubah status BoQ → ${newStatus}`, `${id}`, "BoQ");
    toast(`Status ${id} → ${newStatus}`);
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface">
                <tr>
                  <th className="th">No</th>
                  <th className="th">Nama Item</th>
                  <th className="th">Deskripsi</th>
                  <th className="th">Qty</th>
                  <th className="th">Unit</th>
                  <th className="th">Harga Satuan</th>
                  <th className="th">Total</th>
                  <th className="th">Status</th>
                  <th className="th">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {items.map((b) => (
                  <tr key={b.id}>
                    <td className="td font-mono text-xs">{b.id}</td>
                    <td className="td font-medium text-navy-900">{b.name}</td>
                    <td className="td text-sm text-steel-600">{b.description}</td>
                    <td className="td">{b.quantity}</td>
                    <td className="td">{b.unit}</td>
                    <td className="td font-mono text-sm">{fmtRupiah(b.unitPrice)}</td>
                    <td className="td font-mono text-sm font-semibold">{fmtRupiah(b.totalPrice)}</td>
                    <td className="td"><StatusBadge status={b.status} /></td>
                    <td className="td">
                      <div className="flex gap-1">
                        {nextStatus(b.status).map((ns) => (
                          <button
                            key={ns}
                            className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                              ns === "Approved" ? "bg-green-100 text-green-700 hover:bg-green-200" :
                              ns === "Rejected" ? "bg-rose-100 text-rose-700 hover:bg-rose-200" :
                              ns === "Completed" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" :
                              "bg-steel-100 text-steel-600 hover:bg-steel-200"
                            }`}
                            onClick={() => changeStatus(b.id, ns)}
                          >
                            {ns === "Approved" ? "Setujui" : ns === "Rejected" ? "Tolak" : ns}
                          </button>
                        ))}
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
              {["pcs", "set", "ton", "m²", "m", "liter", "package", "jam"].map((u) => <option key={u}>{u}</option>)}
            </select></Field>
          </FormGrid>
          <FormGrid>
            <Field label="Harga Satuan"><input type="number" className="input" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></Field>
            <Field label="Kategori"><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {["Mechanical", "Paint", "Survey", "Fabrikasi", "Electrical", "Piping", "Rigging"].map((c) => <option key={c}>{c}</option>)}
            </select></Field>
          </FormGrid>
        </div>
      </Modal>
    </div>
  );
}
