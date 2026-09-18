import { useState, useMemo, useRef, useEffect } from "react";
import { useStore } from "../../data/store";
import { Card, StatusBadge, Modal, Field, FormGrid, toast, EmptyState, Badge } from "../../components/ui";
import { Plus, Wrench, Package, Box, RotateCcw } from "lucide-react";
import { fmtRupiah } from "../../utils/export";
import type { ServiceRecord, Sparepart } from "../../data";

export type SparepartServiceView = "3d" | "service" | "sparepart" | "all";

const STS = ["Semua", "Akan", "Sedang", "Selesai"];
const ST_LABEL: Record<string, string> = {
  Semua: "Semua",
  Akan: "Akan diperbaiki",
  Sedang: "Sedang diperbaiki",
  Selesai: "Sudah diperbaiki",
};

interface Props {
  projectId?: string;
  vesselId?: string;
  view?: SparepartServiceView;
}

export default function SparepartServiceSection({ projectId, vesselId, view = "all" }: Props) {
  const { data, add } = useStore();
  const [spTab, setSpTab] = useState("Semua");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", partNumber: "", category: "Mechanical", status: "Akan" as "Akan" | "Sedang" | "Selesai", cost: "", notes: "" });

  const [showAddSvc, setShowAddSvc] = useState(false);
  const [svcForm, setSvcForm] = useState({ type: "Repair" as ServiceRecord["type"], description: "", date: new Date().toISOString().slice(0, 10), technician: "", cost: "", status: "Scheduled" as ServiceRecord["status"] });

  const show3d = view === "3d" || view === "all";
  const showSparepart = view === "sparepart" || view === "all";
  const showService = view === "service" || view === "all";

  const allSpareparts = useMemo(() => {
    let list = ((data.spareparts ?? []) as Sparepart[]);
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (vesselId) list = list.filter((s) => s.vesselId === vesselId);
    return list;
  }, [data.spareparts, projectId, vesselId]);

  const items = useMemo(() => {
    if (spTab === "Semua") return allSpareparts;
    return allSpareparts.filter((s) => s.status === spTab);
  }, [allSpareparts, spTab]);

  const svcItems = useMemo(() => {
    let list = ((data.services ?? []) as ServiceRecord[]);
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (vesselId) list = list.filter((s) => s.vesselId === vesselId);
    return list;
  }, [data.services, projectId, vesselId]);

  const counts = useMemo(() => {
    return {
      Semua: allSpareparts.length,
      Akan: allSpareparts.filter((s) => s.status === "Akan").length,
      Sedang: allSpareparts.filter((s) => s.status === "Sedang").length,
      Selesai: allSpareparts.filter((s) => s.status === "Selesai").length,
    };
  }, [allSpareparts]);

  const modelSrc = "/models/tug_boat.glb";
  const wmRef = useRef<HTMLDivElement>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelKey, setModelKey] = useState(0);

  useEffect(() => {
    if (!show3d) return;
    const el = wmRef.current;
    if (!el) return;
    el.innerHTML = "";
    setModelError(null);
    setModelLoading(true);
    if (typeof customElements !== "undefined" && !customElements.get("model-viewer")) {
      setModelLoading(false);
      setModelError("Komponen viewer 3D belum termuat. Muat ulang halaman lalu coba lagi.");
      return;
    }
    const mv = document.createElement("model-viewer") as any;
    mv.src = modelSrc;
    mv.alt = "Tug Boat Model";
    mv.setAttribute("camera-controls", "");
    mv.setAttribute("auto-rotate", "");
    mv.setAttribute("auto-rotate-delay", "2000");
    mv.setAttribute("ar", "");
    mv.setAttribute("ar-modes", "webxr quick-look");
    mv.setAttribute("camera-orbit", "45deg 55deg 22m");
    mv.setAttribute("camera-target", "0 1 0");
    mv.setAttribute("min-camera-orbit", "auto auto 8m");
    mv.setAttribute("max-camera-orbit", "auto auto 60m");
    mv.setAttribute("shadow-intensity", "1");
    mv.style.width = "100%";
    mv.style.height = "340px";
    mv.style.display = "block";
    mv.style.background = "#f8fafc";
    const onLoad = () => setModelLoading(false);
    const onError = () => {
      setModelLoading(false);
      setModelError("Gagal memuat model /models/tug_boat.glb. Pastikan file ada di public/models lalu muat ulang.");
    };
    mv.addEventListener("load", onLoad);
    mv.addEventListener("error", onError);
    el.appendChild(mv);
    const timer = window.setTimeout(() => setModelLoading((v) => (el.children.length > 0 ? false : v)), 8000);
    return () => {
      window.clearTimeout(timer);
      mv.removeEventListener("load", onLoad);
      mv.removeEventListener("error", onError);
      el.innerHTML = "";
    };
  }, [modelSrc, show3d, modelKey, vesselId]);

  const saveSparepart = () => {
    if (!form.name.trim()) { toast("Nama sparepart wajib diisi", "info"); return; }
    if (!projectId) { toast("Sparepart harus ditambah dari halaman proyek", "info"); return; }
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

  const saveService = () => {
    if (!svcForm.description.trim()) { toast("Deskripsi service wajib diisi", "info"); return; }
    if (!projectId) { toast("Service harus ditambah dari halaman proyek", "info"); return; }
    add("services", {
      projectId,
      vesselId,
      date: svcForm.date,
      type: svcForm.type,
      description: svcForm.description.trim(),
      status: svcForm.status,
      technician: svcForm.technician.trim() || "Belum ditentukan",
      cost: Number(svcForm.cost) || 0,
    }, { action: "menambahkan service", module: "Service" });
    toast("Service ditambahkan");
    setShowAddSvc(false);
    setSvcForm({ type: "Repair", description: "", date: new Date().toISOString().slice(0, 10), technician: "", cost: "", status: "Scheduled" });
  };

  const modelCard = show3d ? (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Box className="h-4 w-4" /> Model 3D Kapal</h3>
        {modelError && (
          <button className="btn-secondary text-xs" onClick={() => setModelKey((k) => k + 1)}><RotateCcw className="h-3.5 w-3.5" /> Muat ulang</button>
        )}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-steel-100 bg-surface" style={{ minHeight: 340 }}>
        <div ref={wmRef} style={{ minHeight: 340 }} />
        {modelLoading && !modelError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-full bg-white/80 px-4 py-1.5 text-xs font-medium text-steel-500">Memuat model 3D…</p>
          </div>
        )}
        {modelError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-navy-900">Model 3D tidak dapat ditampilkan</p>
            <p className="max-w-sm text-xs text-steel-500">{modelError}</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-steel-500">Drag untuk rotasi, scroll untuk zoom. Mendukung AR di perangkat kompatibel.</p>
    </Card>
  ) : null;

  const sparepartCard = showSparepart ? (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Package className="h-4 w-4" /> Daftar Sparepart ({items.length}{spTab !== "Semua" ? ` / ${allSpareparts.length}` : ""})</h3>
        <button className="btn-secondary text-xs" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Tambah</button>
      </div>
      <div className="flex gap-1 flex-wrap mb-3">
        {STS.map((s) => (
          <button key={s} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${spTab === s ? "bg-navy-800 text-white" : "bg-steel-100 text-steel-600 hover:bg-steel-200"}`} onClick={() => setSpTab(s)}>
            {ST_LABEL[s]} ({(counts[s as keyof typeof counts] ?? 0)})
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="Tidak ada sparepart" subtitle={allSpareparts.length === 0 ? "Belum ada sparepart untuk proyek/kapal ini. Klik Tambah untuk mencatat." : `Tidak ada sparepart dengan status "${ST_LABEL[spTab]}". Pilih tab Semua.`} />
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
  ) : null;

  const serviceCard = showService ? (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Wrench className="h-4 w-4" /> Riwayat Service ({svcItems.length})</h3>
        <button className="btn-secondary text-xs" onClick={() => setShowAddSvc(true)}><Plus className="h-3.5 w-3.5" /> Tambah Service</button>
      </div>
      {svcItems.length === 0 ? (
        <EmptyState icon={<Wrench className="h-6 w-6" />} title="Belum ada riwayat service" subtitle="Klik Tambah Service untuk mencatat pekerjaan pertama." />
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
  ) : null;

  return (
    <div className="space-y-5">
      {view === "all" ? (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {modelCard}
            {sparepartCard}
          </div>
          {serviceCard}
        </>
      ) : (
        <>
          {modelCard}
          {sparepartCard}
          {serviceCard}
        </>
      )}

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
                {["Akan", "Sedang", "Selesai"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Harga (Rp)"><input type="number" className="input" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Catatan"><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="cth: Untuk section 3" /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showAddSvc} onClose={() => setShowAddSvc(false)} title="Tambah Service"
        footer={<><button className="btn-secondary" onClick={() => setShowAddSvc(false)}>Batal</button><button className="btn-primary" onClick={saveService}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tipe">
              <select className="input" value={svcForm.type} onChange={(e) => setSvcForm({ ...svcForm, type: e.target.value as ServiceRecord["type"] })}>
                {["Overhaul", "Inspection", "Repair", "Drydock", "Survey"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={svcForm.status} onChange={(e) => setSvcForm({ ...svcForm, status: e.target.value as ServiceRecord["status"] })}>
                <option value="Scheduled">Dijadwalkan</option>
                <option value="In Progress">Sedang</option>
                <option value="Done">Selesai</option>
              </select>
            </Field>
          </FormGrid>
          <Field label="Deskripsi"><input className="input" value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} placeholder="cth: Overhaul main engine" /></Field>
          <FormGrid>
            <Field label="Tanggal"><input type="date" className="input" value={svcForm.date} onChange={(e) => setSvcForm({ ...svcForm, date: e.target.value })} /></Field>
            <Field label="Teknisi"><input className="input" value={svcForm.technician} onChange={(e) => setSvcForm({ ...svcForm, technician: e.target.value })} placeholder="cth: Agus Setiawan" /></Field>
          </FormGrid>
          <Field label="Biaya (Rp)"><input type="number" className="input" value={svcForm.cost} onChange={(e) => setSvcForm({ ...svcForm, cost: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
