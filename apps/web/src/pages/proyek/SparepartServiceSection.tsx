import { useState, useMemo, useRef, useEffect } from "react";
import { useStore } from "../../data/store";
import { Card, StatusBadge, Modal, Field, FormGrid, toast, EmptyState, Badge } from "../../components/ui";
import { Plus, Wrench, Package, Box } from "lucide-react";
import type { ServiceRecord, Sparepart } from "../../data";

const STS = ["Akan", "Sedang", "Selesai"];
const ST = ["Akan diperbaiki", "Sedang diperbaiki", "Sudah diperbaiki"];

interface Props {
  projectId?: string;
  vesselId?: string;
}

export default function SparepartServiceSection({ projectId, vesselId }: Props) {
  const { data, add } = useStore();
  const [spTab, setSpTab] = useState("Akan");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", partNumber: "", category: "Mechanical", status: "Akan" as "Akan" | "Sedang" | "Selesai", cost: "", notes: "" });

  const items = useMemo(() => {
    let list = data.spareparts as Sparepart[];
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (vesselId) list = list.filter((s) => s.vesselId === vesselId);
    if (spTab !== "Semua") list = list.filter((s) => s.status === spTab);
    return list;
  }, [data.spareparts, projectId, vesselId, spTab]);

  const svcItems = useMemo(() => {
    let list = data.services as ServiceRecord[];
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (vesselId) list = list.filter((s) => s.vesselId === vesselId);
    return list;
  }, [data.services, projectId, vesselId]);

  const counts = useMemo(() => {
    let list = data.spareparts as Sparepart[];
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (vesselId) list = list.filter((s) => s.vesselId === vesselId);
    return { Akan: list.filter((s) => s.status === "Akan").length, Sedang: list.filter((s) => s.status === "Sedang").length, Selesai: list.filter((s) => s.status === "Selesai").length };
  }, [data.spareparts, projectId, vesselId]);

  const modelSrc = vesselId ? "/models/tug_boat.glb" : "/models/tug_boat.glb";

  const wmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wmRef.current;
    if (!el || el.children.length > 0) return;
    const mv = document.createElement("model-viewer") as any;
    mv.src = modelSrc;
    mv.alt = "Tug Boat Model";
    mv.setAttribute("camera-controls", "");
    mv.setAttribute("auto-rotate", "");
    mv.setAttribute("auto-rotate-delay", "2000");
    mv.setAttribute("ar", "");
    mv.setAttribute("ar-modes", "webxr quick-query");
    mv.setAttribute("camera-orbit", "45deg 45deg");
    mv.setAttribute("camera-target", "0 0.5 0");
    mv.style.width = "100%";
    mv.style.height = "340px";
    mv.style.display = "block";
    mv.style.background = "#f8fafc";
    el.appendChild(mv);
  }, [modelSrc]);

  const saveSparepart = () => {
    if (!form.name.trim()) { toast("Nama sparepart wajib diisi", "info"); return; }
    if (!projectId) { toast("Pilih proyek dulu", "info"); return; }
    add("spareparts", {
      name: form.name.trim(),
      partNumber: form.partNumber.trim() || "-",
      category: form.category,
      projectId,
      vesselId,
      status: form.status,
      requestDate: new Date().toISOString().slice(0, 10),
      cost: Number(form.cost) || 0,
      notes: form.notes.trim(),
    }, { action: "menambahkan sparepart", module: "Sparepart" });
    toast("Sparepart ditambahkan");
    setShowAdd(false);
    setForm({ name: "", partNumber: "", category: "Mechanical", status: "Akan", cost: "", notes: "" });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-navy-900 flex items-center gap-2"><Box className="h-4 w-4" /> Model 3D</h3>
          <div className="overflow-hidden rounded-xl border border-steel-100 bg-surface" style={{ minHeight: 340 }} ref={wmRef}>
          </div>
          <p className="mt-2 text-xs text-steel-500">Drag untuk rotasi, scroll untuk zoom. Mendukung AR.</p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Package className="h-4 w-4" /> Daftar Sparepart ({items.length})</h3>
            <button className="btn-secondary text-xs" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Tambah</button>
          </div>
          <div className="flex gap-1 flex-wrap mb-3">
            {STS.map((s, i) => (
              <button key={s} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${spTab === s ? "bg-navy-800 text-white" : "bg-steel-100 text-steel-600 hover:bg-steel-200"}`} onClick={() => setSpTab(s)}>
                {ST[i]} ({(counts[s as keyof typeof counts] ?? 0)})
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title="Tidak ada sparepart" subtitle={`Tidak ada sparepart dengan status "${ST[STS.indexOf(spTab)]}"`} />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {items.map((sp) => (
                <div key={sp.id} className="flex items-center justify-between rounded-lg border border-steel-100 p-3 text-sm">
                  <div>
                    <p className="font-medium text-navy-900">{sp.name}</p>
                    <p className="text-xs text-steel-500">{sp.partNumber} · {sp.category} · req {sp.requestDate}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={sp.status === "Akan" ? "Tertunda" : sp.status === "Sedang" ? "Dalam Proses" : "Selesai"} />
                    <p className="text-xs text-steel-500 mt-1">{fmtRupiah(sp.cost)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Wrench className="h-4 w-4" /> Riwayat Service ({svcItems.length})</h3>
        </div>
        {svcItems.length === 0 ? (
          <EmptyState icon={<Wrench className="h-6 w-6" />} title="Belum ada riwayat service" subtitle="Tambahkan service record dari modul ini" />
        ) : (
          <div className="relative space-y-0">
            {svcItems.map((s, i, arr) => (
              <div key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className={`h-3 w-3 rounded-full ${s.status === "Done" ? "bg-teal-500" : s.status === "In Progress" ? "bg-ocean-500" : "bg-steel-300"}`} />
                  {i < arr.length - 1 && <span className="w-px flex-1 bg-steel-200" />}
                </div>
                <div className="pb-1 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy-900">{s.type}: {s.description}</p>
                    <Badge tone={s.status === "Done" ? "green" : s.status === "In Progress" ? "blue" : "gray"}>{s.status === "Done" ? "Selesai" : s.status === "In Progress" ? "Sedang" : "Dijadwalkan"}</Badge>
                  </div>
                  <p className="text-xs text-steel-500">{s.date} · {s.technician} · {fmtRupiah(s.cost)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Sparepart"
        footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn-primary" onClick={saveSparepart}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama sparepart"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Bearing Hub ASW-22" /></Field>
          <Field label="Part Number"><input className="input" value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} /></Field>
          <FormGrid>
            <Field label="Kategori">
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["Mechanical", "Hydraulic", "Electrical", "Insulation", "Paint", "Rigging", "Piping"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "Akan" | "Sedang" | "Selesai" })}>
                {STS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Harga (Rp)"><input type="number" className="input" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Catatan"><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="cth: Untuk section 3" /></Field>
          </FormGrid>
        </div>
      </Modal>
    </div>
  );
}

function fmtRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}
