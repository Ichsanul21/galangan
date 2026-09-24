import { useState, useMemo, useRef, useEffect } from "react";
import { useStore } from "../../data/store";
import { Card, StatusBadge, Modal, Field, FormGrid, toast, EmptyState, Badge } from "../../components/ui";
import { Plus, Wrench, Package, Box, RotateCcw, FileDown } from "lucide-react";
import { exportExcel, fmtRupiah } from "../../utils/export";
import type { ServiceRecord, Sparepart } from "../../data";

export type SparepartServiceView = "3d" | "service" | "sparepart" | "all";

type SvcExt = Omit<ServiceRecord, "status"> & { status: ServiceRecord["status"] | "Batal"; cancelReason?: string };
type SpExt = Sparepart & { usedDate?: string; warrantyUntil?: string };

const SVC_FILTER = ["Semua", "Scheduled", "In Progress", "Done", "Batal"] as const;
const SVC_LABEL: Record<string, string> = {
  Semua: "Semua",
  Scheduled: "Dijadwalkan",
  "In Progress": "Sedang",
  Done: "Selesai",
  Batal: "Batal",
};

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
  const { data, add, update, log } = useStore();
  const [spTab, setSpTab] = useState("Semua");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", partNumber: "", category: "Mechanical", status: "Akan" as "Akan" | "Sedang" | "Selesai", cost: "", notes: "", technician: "", usedDate: "", warrantyUntil: "" });

  const [showAddSvc, setShowAddSvc] = useState(false);
  const [svcForm, setSvcForm] = useState({ type: "Repair" as ServiceRecord["type"], description: "", date: new Date().toISOString().slice(0, 10), technician: "", cost: "", status: "Scheduled" as ServiceRecord["status"] });
  const [svcStatus, setSvcStatus] = useState<string>("Semua");
  const [svcQ, setSvcQ] = useState("");
  const [cancelFor, setCancelFor] = useState<SvcExt | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [modelPick, setModelPick] = useState("Tugboat");

  const show3d = view === "3d" || view === "all";
  const showSparepart = view === "sparepart" || view === "all";
  const showService = view === "service" || view === "all";

  const allSpareparts = useMemo(() => {
    let list = ((data.spareparts ?? []) as SpExt[]);
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (vesselId) list = list.filter((s) => s.vesselId === vesselId);
    return list;
  }, [data.spareparts, projectId, vesselId]);

  const items = useMemo(() => {
    if (spTab === "Semua") return allSpareparts;
    return allSpareparts.filter((s) => s.status === spTab);
  }, [allSpareparts, spTab]);

  const svcItems = useMemo(() => {
    let list = ((data.services ?? []) as SvcExt[]);
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (vesselId) list = list.filter((s) => s.vesselId === vesselId);
    return list;
  }, [data.services, projectId, vesselId]);

  const svcFiltered = useMemo(() => {
    return svcItems.filter((s) => {
      const matchSt = svcStatus === "Semua" || s.status === svcStatus;
      const matchQ = `${s.description} ${s.type} ${s.technician}`.toLowerCase().includes(svcQ.toLowerCase());
      return matchSt && matchQ;
    });
  }, [svcItems, svcStatus, svcQ]);

  const counts = useMemo(() => {
    return {
      Semua: allSpareparts.length,
      Akan: allSpareparts.filter((s) => s.status === "Akan").length,
      Sedang: allSpareparts.filter((s) => s.status === "Sedang").length,
      Selesai: allSpareparts.filter((s) => s.status === "Selesai").length,
    };
  }, [allSpareparts]);

  const advanceService = async (s: SvcExt, next: SvcExt["status"]) => {
    await update("services", s.id, { status: next });
    log("mengubah status service", `${s.id} → ${next}`, "Service");
    toast(`Service ${next === "Done" ? "diselesaikan" : "dimulai"}`);
  };

  const confirmCancel = async () => {
    if (!cancelFor) return;
    if (!cancelReason.trim()) { toast("Alasan pembatalan wajib diisi", "info"); return; }
    await update("services", cancelFor.id, { status: "Batal", cancelReason: cancelReason.trim() });
    log("membatalkan service", `${cancelFor.id} (alasan: ${cancelReason.trim()})`, "Service");
    toast("Service dibatalkan", "info");
    setCancelFor(null);
    setCancelReason("");
  };

  const exportSvc = () => {
    const rows: unknown[][] = [
      ["ID", "Tanggal", "Tipe", "Deskripsi", "Status", "Teknisi", "Biaya (Rp)"],
      ...svcFiltered.map((s) => [s.id, s.date, s.type, s.description, SVC_LABEL[s.status] ?? s.status, s.technician, s.cost]),
    ];
    void exportExcel(rows, `service-${projectId ?? vesselId ?? "riwayat"}`, "Service").then(() => toast("Riwayat service diekspor ke Excel"));
  };

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
    let cancelled = false;
    /* Muat @google/model-viewer on-demand agar bundle awal tetap ringan saat tab 3D disembunyikan. */
    void import("@google/model-viewer").then(() => {
      if (cancelled) return;
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
      (el as unknown as { __t?: number }).__t = timer;
    }).catch(() => {
      if (!cancelled) {
        setModelLoading(false);
        setModelError("Gagal memuat pustaka 3D. Periksa koneksi lalu coba lagi.");
      }
    });
    return () => {
      cancelled = true;
      const t = (el as unknown as { __t?: number }).__t;
      if (t) window.clearTimeout(t);
      el.innerHTML = "";
    };
  }, [modelSrc, show3d, modelKey, vesselId]);

  const saveSparepart = async () => {
    if (!form.name.trim()) { toast("Nama sparepart wajib diisi", "info"); return; }
    if (!projectId) { toast("Sparepart harus ditambah dari halaman proyek", "info"); return; }
    await add("spareparts", {
      name: form.name.trim(),
      partNumber: form.partNumber.trim() || "-",
      category: form.category,
      projectId,
      vesselId,
      status: form.status,
      requestDate: new Date().toISOString().slice(0, 10),
      cost: Number(form.cost) || 0,
      notes: form.notes.trim(),
      technician: form.technician.trim() || "-",
      usedDate: form.usedDate || "-",
      warrantyUntil: form.warrantyUntil || "-",
    }, { action: "menambahkan sparepart", module: "Sparepart" });
    toast("Sparepart ditambahkan");
    setShowAdd(false);
    setForm({ name: "", partNumber: "", category: "Mechanical", status: "Akan", cost: "", notes: "", technician: "", usedDate: "", warrantyUntil: "" });
  };

  const saveService = async () => {
    if (!svcForm.description.trim()) { toast("Deskripsi service wajib diisi", "info"); return; }
    if (!projectId) { toast("Service harus ditambah dari halaman proyek", "info"); return; }
    await add("services", {
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Box className="h-4 w-4" /> Model 3D Kapal</h3>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-1.5 text-xs" aria-label="Pilih model kapal" value={modelPick} onChange={(e) => setModelPick(e.target.value)}>
            <option value="Tugboat">Tugboat</option>
            <option value="Kapal Kecil">Kapal Kecil</option>
          </select>
          {modelError && (
            <button className="btn-secondary text-xs" onClick={() => setModelKey((k) => k + 1)}><RotateCcw className="h-3.5 w-3.5" /> Muat ulang</button>
          )}
        </div>
      </div>
      {modelPick !== "Tugboat" && (
        <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          Model generik — tipe kapal ini memakai model tugboat sebagai representasi.
        </p>
      )}
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
                <p className="text-xs text-steel-500">
                  dipakai: {sp.usedDate && sp.usedDate !== "-" ? sp.usedDate : "—"} · teknisi: {sp.technician || "—"} · garansi s.d. {sp.warrantyUntil && sp.warrantyUntil !== "-" ? sp.warrantyUntil : "—"}
                </p>
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Wrench className="h-4 w-4" /> Riwayat Service ({svcFiltered.length}{svcFiltered.length !== svcItems.length ? ` / ${svcItems.length}` : ""})</h3>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={exportSvc}><FileDown className="h-3.5 w-3.5" /> Export Excel</button>
          <button className="btn-secondary text-xs" onClick={() => setShowAddSvc(true)}><Plus className="h-3.5 w-3.5" /> Tambah Service</button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input w-full sm:w-52"
          placeholder="Cari deskripsi / teknisi..."
          aria-label="Cari service"
          value={svcQ}
          onChange={(e) => setSvcQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {SVC_FILTER.map((s) => (
            <button key={s} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${svcStatus === s ? "bg-navy-800 text-white" : "bg-steel-100 text-steel-600 hover:bg-steel-200"}`} onClick={() => setSvcStatus(s)}>
              {SVC_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {svcFiltered.length === 0 ? (
        <EmptyState icon={<Wrench className="h-6 w-6" />} title="Tidak ada service" subtitle={svcItems.length === 0 ? "Klik Tambah Service untuk mencatat pekerjaan pertama." : "Tidak cocok dengan filter/pencarian. Pilih Semua."} />
      ) : (
        <div className="relative space-y-0">
          {svcFiltered.map((s, i, arr) => (
            <div key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
              <div className="flex flex-col items-center">
                <span className={`h-3 w-3 rounded-full ${s.status === "Done" ? "bg-teal-500" : s.status === "In Progress" ? "bg-ocean-500" : s.status === "Batal" ? "bg-rose-500" : "bg-steel-300"}`} />
                {i < arr.length - 1 && <span className="w-px flex-1 bg-steel-200" />}
              </div>
              <div className="pb-1 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-900">{s.type}: {s.description}</p>
                  <Badge tone={s.status === "Done" ? "green" : s.status === "In Progress" ? "blue" : s.status === "Batal" ? "red" : "gray"}>{SVC_LABEL[s.status] ?? s.status}</Badge>
                </div>
                <p className="text-xs text-steel-500">{s.date} · {s.technician} · {fmtRupiah(s.cost)}</p>
                {s.status === "Batal" && s.cancelReason && (
                  <p className="mt-1 text-xs text-rose-600">Alasan batal: {s.cancelReason}</p>
                )}
                {s.status !== "Done" && s.status !== "Batal" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.status === "Scheduled" && (
                      <button className="rounded bg-ocean-100 px-2 py-0.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-200" onClick={() => advanceService(s, "In Progress")}>Mulai</button>
                    )}
                    {s.status === "In Progress" && (
                      <button className="rounded bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700 hover:bg-teal-200" onClick={() => advanceService(s, "Done")}>Selesaikan</button>
                    )}
                    <button className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-200" onClick={() => { setCancelFor(s); setCancelReason(""); }}>Batalkan</button>
                  </div>
                )}
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
          <FormGrid>
            <Field label="Teknisi (opsional)"><input className="input" value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} placeholder="cth: Agus Setiawan" /></Field>
            <Field label="Tanggal pakai (opsional)"><input type="date" className="input" value={form.usedDate} onChange={(e) => setForm({ ...form, usedDate: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Garansi s.d. (opsional)"><input type="date" className="input" value={form.warrantyUntil} onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })} /></Field>
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

      <Modal open={cancelFor !== null} onClose={() => setCancelFor(null)} title={`Batalkan service: ${cancelFor?.description ?? ""}`} subtitle={cancelFor?.id}
        footer={<><button className="btn-secondary" onClick={() => setCancelFor(null)}>Kembali</button><button className="btn-primary" onClick={confirmCancel}>Batalkan Service</button></>}>
        <Field label="Alasan pembatalan" hint="Wajib diisi — tercatat di riwayat service">
          <textarea className="input" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="cth: Pekerjaan dialihkan ke subkontraktor" />
        </Field>
      </Modal>
    </div>
  );
}
