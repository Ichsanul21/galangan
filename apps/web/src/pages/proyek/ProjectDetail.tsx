import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Plus, Trash2 } from "lucide-react";
import {
  Card,
  PageHeader,
  StatusBadge,
  ProgressBar,
  Tabs,
  KpiCard,
  Modal,
  Field,
  FormGrid,
  ConfirmModal,
  Badge,
  toast,
  Avatar,
} from "../../components/ui";
import BoQSection from "./BoQSection";
import ReportSection from "./ReportSection";
import SparepartServiceSection from "./SparepartServiceSection";
import { useStore } from "../../data/store";
import { fmtMiliar } from "../../data";

const STATUS = ["Dalam Proses", "Sedang Berjalan", "Terlambat", "Tertunda", "Selesai"];

export default function ProjectDetail() {
  const { id } = useParams();
  const { data, update, add, wbsFor, setWbs, teamFor, setTeam, log } = useStore();
  const project = data.projects.find((p) => p.id === id) ?? data.projects[0];
  const [tab, setTab] = useState("Overview");

  const [showScope, setShowScope] = useState(false);
  const [scopeVal, setScopeVal] = useState("");
  const [showDoc, setShowDoc] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("Laporan");
  const [delScope, setDelScope] = useState<string | null>(null);
  const [showWbs, setShowWbs] = useState(false);
  const [wbsForm, setWbsForm] = useState({ task: "", start: "", end: "", weight: "10", progress: "0" });
  const [showTeam, setShowTeam] = useState(false);
  const [teamPick, setTeamPick] = useState("");
  const [wbsTaskUpdate, setWbsTaskUpdate] = useState<string | null>(null);
  const [wbsUpdateForm, setWbsUpdateForm] = useState({ hours: "", material: "", status: "Sedang" as "Sedang" | "Selesai" });
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ docId: "", to: "" });

  useEffect(() => {
    if (!project) return;
    const wbs = wbsFor(project.id);
    const total = wbs.length;
    const completed = wbs.filter((w) => w.status === "Selesai").length;
    const newProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (newProgress !== project.progress) {
      update("projects", project.id, { progress: newProgress });
    }
  }, [data.projects]);

  if (!project) return <p className="text-sm text-steel-500">Proyek tidak ditemukan.</p>;
  const pid = project.id;

  const wbs = wbsFor(pid);
  const teamIds = teamFor(pid);
  const team = data.employees.filter((e) => teamIds.includes(e.id));
  const vessel = data.vessels.find((v) => v.name === project.vessel);
  const invoices = data.invoices.filter((i) => i.project === pid);
  const ncrs = data.ncr.filter((n) => n.project === pid);
  const slots = data.dockSlots.filter((s) => s.project === pid);
  const docs = data.documents.filter((d) => d.project === pid);
  const wos = data.workOrders.filter((w) => w.project === pid);

  const saveScope = () => {
    if (!scopeVal.trim()) { toast("Isi lingkup dulu", "info"); return; }
    update("projects", pid, { scope: [...(project.scope ?? []), scopeVal.trim()] });
    log("menambah lingkup", `${pid} · ${scopeVal.trim()}`, "Proyek");
    toast("Lingkup ditambahkan");
    setScopeVal("");
    setShowScope(false);
  };

  const saveWbsTask = () => {
    if (!wbsTaskUpdate) return;
    const hours = Number(wbsUpdateForm.hours) || 0;
    const updated = wbs.map((w) =>
      w.task === wbsTaskUpdate
        ? { ...w, actualHours: hours, materialUsed: wbsUpdateForm.material, status: wbsUpdateForm.status, progress: wbsUpdateForm.status === "Selesai" ? 100 : Math.min(hours * 10, 100) }
        : w
    );
    setWbs(pid, updated);
    const completed = updated.filter((w) => w.status === "Selesai").length;
    const newProgress = updated.length > 0 ? Math.round((completed / updated.length) * 100) : 0;
    update("projects", pid, { progress: newProgress });
    log("mengupdate progres WBS", `${wbsTaskUpdate} → ${wbsUpdateForm.status}`, "Proyek");
    toast("Progres tugas diperbarui");
    setWbsTaskUpdate(null);
    setWbsUpdateForm({ hours: "", material: "", status: "Sedang" });
  };

  const saveWbs = () => {
    if (!wbsForm.task.trim()) { toast("Nama tahapan wajib diisi", "info"); return; }
    setWbs(pid, [...wbs, { task: wbsForm.task.trim(), start: wbsForm.start || "-", end: wbsForm.end || "-", progress: Number(wbsForm.progress) || 0, weight: Number(wbsForm.weight) || 0 }]);
    log("menambah tahapan WBS", `${pid} · ${wbsForm.task.trim()}`, "Proyek");
    toast("Tahapan ditambahkan");
    setShowWbs(false);
    setWbsForm({ task: "", start: "", end: "", weight: "10", progress: "0" });
  };

  return (
    <div>
      <Link to="/proyek" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Proyek
      </Link>
      <PageHeader
        title={project.vessel}
        subtitle={`${project.id} · ${project.type} · ${project.client}`}
        actions={
          <div className="flex items-center gap-2">
            <select
              className="input w-auto py-1.5 text-sm"
              value={project.status}
              onChange={(e) => { update("projects", pid, { status: e.target.value }); log("mengubah status", `${pid} → ${e.target.value}`, "Proyek"); toast(`Status menjadi ${e.target.value}`); }}
            >
              {STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <StatusBadge status={project.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Anggaran" value={fmtMiliar(project.budget)} hint="Total kontrak proyek" icon={<Calendar className="h-5 w-5" />} />
        <KpiCard label="Realisasi" value={fmtMiliar(project.actual)} delta={`${project.budget ? Math.round((project.actual / project.budget) * 100) : 0}% terpakai`} deltaDirection={project.actual > project.budget ? "down" : "flat"} hint="Biaya aktual" />
        <KpiCard label="Progres" value={`${project.progress}%`} delta={project.status === "Terlambat" ? "Terlambat dari jadwal" : "Sesuai jadwal"} deltaDirection={project.status === "Terlambat" ? "down" : "up"} hint="Dihitung dari penyelesaian WBS" />
        <KpiCard label="Periode" value={`${String(project.start).slice(5)} → ${String(project.end).slice(5)}`} hint={project.branch} icon={<MapPin className="h-5 w-5" />} />
      </div>

      <div className="mt-5 card">
        <Tabs tabs={["Overview", "WBS", "Anggaran", "Tim", "Dokumen", "Terkait", "BoQ", "Laporan", "3D Viewer", "Service", "Sparepart"]} active={tab} onChange={setTab} />
        <div className="p-5">
          {tab === "Overview" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Ruang Lingkup Pekerjaan</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowScope(true)}><Plus className="h-3.5 w-3.5" /> Tambah</button>
                </div>
                <ul className="space-y-2">
                  {(project.scope ?? []).map((s: string, i: number) => (
                    <li key={`${s}-${i}`} className="group flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-50 text-xs font-bold text-navy-700">{i + 1}</span>
                      <span className="flex-1 text-sm text-steel-700">{s}</span>
                      <button className="hidden rounded p-1 text-rose-400 hover:bg-rose-50 group-hover:block" onClick={() => setDelScope(s)} title="Hapus"><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                  {(project.scope ?? []).length === 0 && <p className="text-sm text-steel-400">Belum ada lingkup.</p>}
                </ul>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy-900">Progres Keseluruhan</h3>
                    <span className="text-xs text-steel-500">Dihitung dari penyelesaian WBS</span>
                  </div>
                  <ProgressBar value={project.progress} tone={project.status === "Terlambat" ? "red" : "navy"} />
                  <p className="mt-1 text-xs text-steel-500">{project.progress}% selesai · target penyelesaian {project.end}</p>
                </div>
                {vessel && (
                  <div className="mt-6 rounded-xl border border-steel-100 bg-surface p-3 text-sm">
                    <span className="text-steel-500">Kapal terkait: </span>
                    <Link to={`/kapal/${vessel.id}`} className="font-semibold text-ocean-600 hover:underline">{vessel.name} ({vessel.imo})</Link>
                  </div>
                )}
              </div>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">Informasi Proyek</h3>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-steel-500">Manajer</dt><dd className="font-medium">{project.manager}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Cabang</dt><dd className="font-medium">{project.branch}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Mulai</dt><dd className="font-medium">{project.start}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Selesai</dt><dd className="font-medium">{project.end}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={project.status} /></dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Invoice</dt><dd className="font-medium">{invoices.length} dokumen</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">NCR terbuka</dt><dd className="font-medium">{ncrs.filter((n) => n.status !== "Tertutup").length}</dd></div>
                </dl>
              </Card>
            </div>
          )}

          {tab === "WBS" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowWbs(true)}><Plus className="h-3.5 w-3.5" /> Tambah Tahapan</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Tahapan</th><th className="th">Mulai</th><th className="th">Selesai</th><th className="th">Bobot</th><th className="th">Progres</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {wbs.map((w) => (
                      <tr key={w.task}>
                        <td className="td font-medium text-navy-900">{w.task}</td>
                        <td className="td font-mono text-xs text-steel-500">{w.start}</td>
                        <td className="td font-mono text-xs text-steel-500">{w.end}</td>
                        <td className="td">{w.weight}%</td>
                        <td className="td">
                          <div className="flex items-center gap-3">
                            <ProgressBar value={w.progress} className="w-32" tone={w.progress >= 100 ? "green" : "navy"} />
                            <span className="text-xs font-medium">{w.progress}%</span>
                          </div>
                        </td>
                        <td className="td">
                          <button className="btn-secondary text-xs" onClick={() => { setWbsTaskUpdate(w.task); setWbsUpdateForm({ hours: "", material: "", status: w.status === "Selesai" ? "Selesai" : "Sedang" }); }}>Update</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Anggaran" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Budget vs Actual</h3>
                  <button className="btn-secondary text-xs" onClick={() => toast("Update via BoQ section")}>Catat Realisasi</button>
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <p className="text-2xl font-bold text-navy-900">{fmtMiliar(project.actual)}</p>
                    <p className="text-xs text-steel-500">Realisasi dari {fmtMiliar(project.budget)}</p>
                  </div>
                  <Badge tone={project.actual > project.budget ? "red" : "green"}>
                    {project.budget ? Math.round((project.actual / project.budget) * 100) : 0}%
                  </Badge>
                </div>
                <ProgressBar value={project.budget ? (project.actual / project.budget) * 100 : 0} tone="ocean" className="mt-3" />
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Proyeksi (EAC)</h3>
                <p className="text-sm text-steel-600">
                  Estimasi biaya akhir diproyeksikan <span className="font-semibold text-amber-600">{fmtMiliar(Math.round(project.actual / 0.62))}</span> berdasarkan
                  CPI saat ini {project.budget ? Math.round((project.actual / project.budget) * 100) : 0}% — perlu pengawasan agar tidak overrun.
                </p>
                <h3 className="mb-2 mt-4 text-sm font-semibold text-navy-900">Invoice proyek ini ({invoices.length})</h3>
                <div className="space-y-1.5">
                  {invoices.map((i) => (
                    <div key={i.id} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-navy-900">{i.id}</span>
                      <span className="text-steel-600">{fmtMiliar(i.amount)}</span>
                      <StatusBadge status={i.status} />
                    </div>
                  ))}
                  {invoices.length === 0 && <p className="text-xs text-steel-400">Belum ada invoice. Buat dari modul Keuangan.</p>}
                </div>
              </Card>
            </div>
          )}

          {tab === "Tim" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowTeam(true)}><Plus className="h-3.5 w-3.5" /> Tambah Anggota</button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {team.map((e) => (
                  <Card key={e.id} className="flex items-center gap-3 p-4">
                    <Avatar name={e.name} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-900">{e.name}</p>
                      <p className="text-xs text-steel-500">{e.role} · {e.dept}</p>
                    </div>
                    <button className="rounded p-1 text-rose-400 hover:bg-rose-50" title="Keluarkan" onClick={() => { setTeam(pid, teamIds.filter((t) => t !== e.id)); toast(`${e.name} dikeluarkan dari tim`, "info"); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Card>
                ))}
                {team.length === 0 && <p className="text-sm text-steel-400">Belum ada anggota tim.</p>}
              </div>
            </div>
          )}

          {tab === "Dokumen" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowDoc(true)}><Plus className="h-3.5 w-3.5" /> Tambah Dokumen</button>
              </div>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-xl border border-steel-100 p-3 text-sm">
                    <div>
                      <p className="font-medium text-navy-900">{d.title}</p>
                      <p className="text-xs text-steel-500">{d.id} · {d.type} · {d.version} · {d.updated}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary text-xs" onClick={() => { /* export PDF */ }}>📄</button>
                      <Badge tone="navy">{d.status}</Badge>
                    </div>
                  </div>
                ))}
                {docs.length === 0 && <p className="text-sm text-steel-400">Belum ada dokumen untuk proyek ini.</p>}
              </div>
            </div>
          )}

          {tab === "Terkait" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Slot Docking ({slots.length})</h3>
                {slots.map((s) => <p key={s.id} className="py-1 text-sm text-steel-600">{s.dockId} · hari {s.from}–{s.to}</p>)}
                {slots.length === 0 && <p className="text-xs text-steel-400">Belum ada slot. Booking dari modul Drydock.</p>}
              </Card>
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Work Order ({wos.length})</h3>
                {wos.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-steel-600">{w.id} · {w.sub}</span>
                    <Badge tone={w.status === "Selesai" ? "green" : "blue"}>{w.progress}%</Badge>
                  </div>
                ))}
                {wos.length === 0 && <p className="text-xs text-steel-400">Belum ada WO. Buat dari modul Subkontraktor.</p>}
              </Card>
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">NCR ({ncrs.length})</h3>
                {ncrs.map((n) => (
                  <div key={n.id} className="flex items-center justify-between py-1 text-sm">
                    <span className="font-mono text-navy-900">{n.id}</span>
                    <StatusBadge status={n.status} />
                  </div>
                ))}
                {ncrs.length === 0 && <p className="text-xs text-steel-400">Tidak ada NCR. Catat dari modul QC.</p>}
              </Card>
            </div>
          )}
          {tab === "BoQ" && <BoQSection projectId={pid} />}
          {tab === "Laporan" && <ReportSection projectId={pid} />}
          {tab === "3D Viewer" && <SparepartServiceSection projectId={pid} />}
          {tab === "Service" && <SparepartServiceSection projectId={pid} />}
          {tab === "Sparepart" && <SparepartServiceSection projectId={pid} />}
        </div>
      </div>

      {/* Modal share */}
      <Modal open={showShare} onClose={() => setShowShare(false)} title="Bagikan Laporan ke Atasan"
        footer={<><button className="btn-secondary" onClick={() => setShowShare(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!shareForm.docId || !shareForm.to) { toast("Pilih dokumen dan tujuan", "info"); return; }
          const doc = docs.find((d: any) => d.id === shareForm.docId);
          update("documents", shareForm.docId, { sharedWith: [...(doc?.sharedWith ?? []), shareForm.to] });
          log("berbagi dokumen dengan atasan", `${shareForm.docId} → ${shareForm.to}`, "Dokumen");
          toast(`Dokumen dibagikan ke ${shareForm.to}`);
          setShowShare(false);
          setShareForm({ docId: "", to: "" });
        }}>Kirim</button></>}>
        <FormGrid>
          <Field label="Dokumen">
            <select className="input" value={shareForm.docId} onChange={(e) => setShareForm({ ...shareForm, docId: e.target.value })}>
              <option value="">Pilih…</option>
              {docs.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
          <Field label="Ditujukan ke"><input className="input" value={shareForm.to} onChange={(e) => setShareForm({ ...shareForm, to: e.target.value })} placeholder="cth: Atasan/Nama" /></Field>
        </FormGrid>
      </Modal>

      {/* Modal update WBS task */}
      <Modal open={wbsTaskUpdate !== null} onClose={() => setWbsTaskUpdate(null)} title={`Update Progress: ${wbsTaskUpdate ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setWbsTaskUpdate(null)}>Batal</button><button className="btn-primary" onClick={saveWbsTask}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Jam Kerja Aktual"><input type="number" className="input" value={wbsUpdateForm.hours} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, hours: e.target.value })} placeholder="cth: 8" /></Field>
          <Field label="Material Dipakai"><input className="input" value={wbsUpdateForm.material} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, material: e.target.value })} placeholder="cth: Baja AH36 50kg" /></Field>
          <Field label="Status">
            <select className="input" value={wbsUpdateForm.status} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, status: e.target.value as "Sedang" | "Selesai" })}>
              <option value="Sedang">Sedang Dikerjakan</option>
              <option value="Selesai">Selesai</option>
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal WBS */}
      <Modal open={showWbs} onClose={() => setShowWbs(false)} title="Tambah Tahapan WBS"
        footer={<><button className="btn-secondary" onClick={() => setShowWbs(false)}>Batal</button><button className="btn-primary" onClick={saveWbs}>Tambah</button></>}>
        <div className="space-y-3">
          <Field label="Nama tahapan"><input className="input" value={wbsForm.task} onChange={(e) => setWbsForm({ ...wbsForm, task: e.target.value })} /></Field>
          <FormGrid>
            <Field label="Mulai"><input className="input" placeholder="2026-08" value={wbsForm.start} onChange={(e) => setWbsForm({ ...wbsForm, start: e.target.value })} /></Field>
            <Field label="Selesai"><input className="input" placeholder="2026-09" value={wbsForm.end} onChange={(e) => setWbsForm({ ...wbsForm, end: e.target.value })} /></Field>
            <Field label="Bobot (%)"><input type="number" className="input" value={wbsForm.weight} onChange={(e) => setWbsForm({ ...wbsForm, weight: e.target.value })} /></Field>
            <Field label="Progres (%)"><input type="number" className="input" value={wbsForm.progress} onChange={(e) => setWbsForm({ ...wbsForm, progress: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal tim */}
      <Modal open={showTeam} onClose={() => setShowTeam(false)} title="Tambah Anggota Tim"
        footer={<><button className="btn-secondary" onClick={() => setShowTeam(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!teamPick) { toast("Pilih karyawan dulu", "info"); return; }
          if (teamIds.includes(teamPick)) { toast("Sudah menjadi anggota", "info"); return; }
          setTeam(pid, [...teamIds, teamPick]);
          log("menambah anggota tim", `${pid} · ${data.employees.find((e) => e.id === teamPick)?.name}`, "Proyek");
          toast("Anggota ditambahkan"); setShowTeam(false); setTeamPick("");
        }}>Tambah</button></>}>
        <Field label="Karyawan">
          <select className="input" value={teamPick} onChange={(e) => setTeamPick(e.target.value)}>
            <option value="">Pilih karyawan…</option>
            {data.employees.filter((e) => !teamIds.includes(e.id)).map((e) => (
              <option key={e.id} value={e.id}>{e.name} · {e.role}</option>
            ))}
          </select>
        </Field>
      </Modal>

      {/* Modal dokumen proyek */}
      <Modal open={showDoc} onClose={() => setShowDoc(false)} title="Tambah Dokumen Proyek" subtitle={pid}
        footer={<><button className="btn-secondary" onClick={() => setShowDoc(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!docTitle.trim()) { toast("Judul wajib diisi", "info"); return; }
          add("documents", { title: docTitle.trim(), type: docType, project: pid, vessel: project.vessel, version: "v1.0", status: "Draft", updated: new Date().toISOString().slice(0, 10), owner: "Anda", sharedWith: [], approvalStatus: "Draft" },
            { action: "mengarsipkan dokumen", module: "Dokumen" });
          toast("Dokumen ditambahkan"); setShowDoc(false); setDocTitle("");
        }}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Judul dokumen"><input className="input" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} /></Field>
          <Field label="Tipe">
            <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {["Laporan", "Kontrak", "Drawing", "Prosedur", "Sertifikat", "Invoice", "NCR"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal scope */}
      <Modal open={showScope} onClose={() => setShowScope(false)} title="Tambah Lingkup Pekerjaan"
        footer={<><button className="btn-secondary" onClick={() => setShowScope(false)}>Batal</button><button className="btn-primary" onClick={saveScope}>Tambah</button></>}>
        <Field label="Nama lingkup">
          <input className="input" placeholder="cth: Sea Trial" value={scopeVal} onChange={(e) => setScopeVal(e.target.value)} />
        </Field>
      </Modal>
      <ConfirmModal open={delScope !== null} title="Hapus lingkup?" desc={`"${delScope}" akan dihapus dari ruang lingkup.`}
        confirmLabel="Ya, hapus" danger onCancel={() => setDelScope(null)}
        onConfirm={() => { if (delScope) update("projects", pid, { scope: (project.scope ?? []).filter((s: string) => s !== delScope) }); setDelScope(null); }} />
    </div>
  );
}