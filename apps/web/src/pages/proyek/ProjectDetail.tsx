import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Plus, Trash2, FileDown } from "lucide-react";
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
  SortTh,
  toggleSort,
  sortRows,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import BoQSection from "./BoQSection";
import ReportSection from "./ReportSection";
import SparepartServiceSection from "./SparepartServiceSection";
import { useStore } from "../../data/store";
import type { StoreItem, WbsItem } from "../../data/store";
import { fmtMiliar, fmtTanggal, fmtRentang, fmtBulan } from "../../data";
import { fmtRupiah, todayISO } from "../../utils/format";
import { getSetting } from "../../utils/settings";
import { exportExcel } from "../../utils/export";

const STATUS = ["Dalam Proses", "Sedang Berjalan", "Terlambat", "Tertunda", "Selesai"];
const CO_FLOW = ["Diajukan", "Disetujui", "Ditolak", "Diterapkan"];
const RISK_LEVEL = ["Rendah", "Sedang", "Tinggi"];
const RISK_STATUS = ["Aktif", "Dipantau", "Tertutup"];

type WbsExt = WbsItem & { predecessor?: string };
interface WbsBaseline { at: string; wbs: WbsExt[]; }

export default function ProjectDetail() {
  const { id } = useParams();
  const { data, update, add, wbsFor, setWbs, teamFor, setTeam, log } = useStore();
  const project = data.projects.find((p) => p.id === id) ?? data.projects[0];
  const [tab, setTab] = useState("Ringkasan");

  const [showScope, setShowScope] = useState(false);
  const [scopeVal, setScopeVal] = useState("");
  const [showDoc, setShowDoc] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("Laporan");
  const [delScope, setDelScope] = useState<string | null>(null);
  const [showWbs, setShowWbs] = useState(false);
  const [wbsForm, setWbsForm] = useState({ task: "", start: "", end: "", weight: "10", progress: "0", predecessor: "" });
  const [showTeam, setShowTeam] = useState(false);
  const [teamPick, setTeamPick] = useState("");
  const [wbsTaskUpdate, setWbsTaskUpdate] = useState<string | null>(null);
  const [wbsUpdateForm, setWbsUpdateForm] = useState({ hours: "", material: "", status: "Sedang" as "Sedang" | "Selesai", progress: "", predecessor: "" });
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ docId: "", to: "" });
  const [showCo, setShowCo] = useState(false);
  const [coForm, setCoForm] = useState({ title: "", impact: "", requestedBy: "", date: "" });
  const [showRisk, setShowRisk] = useState(false);
  const [riskEditId, setRiskEditId] = useState<string | null>(null);
  const [riskForm, setRiskForm] = useState({ title: "", likelihood: "Sedang", impact: "Sedang", mitigation: "", status: "Aktif" });
  const [docFile, setDocFile] = useState("");
  const [showDelBaseline, setShowDelBaseline] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  const weightedProgress = (items: { progress: number; weight: number }[]): number => {
    const totalW = items.reduce((s, w) => s + Number(w.weight || 0), 0);
    if (totalW <= 0) return 0;
    return Math.round(items.reduce((s, w) => s + (Number(w.progress || 0) * Number(w.weight || 0)), 0) / totalW);
  };

  const createsCycle = (items: WbsExt[], task: string, pred: string): boolean => {
    const map = new Map(items.map((w) => [String(w.task), String(w.predecessor ?? "")]));
    let cur = pred;
    const seen = new Set<string>();
    while (cur) {
      if (cur === task) return true;
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = map.get(cur) ?? "";
    }
    return false;
  };

  const parseYM = (v: string): { y: number; m: number } | null => {
    const m = String(v ?? "").match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]) };
  };

  const monthEndDate = (v: string): Date | null => {
    const m = String(v ?? "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return null;
    return m[3] ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(Number(m[1]), Number(m[2]), 0);
  };

  useEffect(() => {
    if (!project) return;
    const wbs = wbsFor(project.id);
    const newProgress = weightedProgress(wbs);
    if (newProgress !== project.progress) {
      update("projects", project.id, { progress: newProgress });
    }
  }, [data.projects]);

  if (!project) return <p className="text-sm text-steel-500">Proyek tidak ditemukan.</p>;
  const pid = project.id;

  const wbs = wbsFor(pid) as WbsExt[];
  const teamIds = teamFor(pid);
  const team = data.employees.filter((e) => teamIds.includes(e.id));
  const vessel = data.vessels.find((v) => v.name === project.vessel);
  const invoices = data.invoices.filter((i) => i.project === pid);
  const ncrs = data.ncr.filter((n) => n.project === pid);
  const slots = data.dockSlots.filter((s) => s.project === pid);
  const docs = data.documents.filter((d) => d.project === pid);
  const wos = data.workOrders.filter((w) => w.project === pid);
  const coList = data.changeOrders.filter((c) => c.project === pid);
  const riskList = data.risks.filter((r) => r.project === pid);
  const coApproved = coList.filter((c) => c.status === "Disetujui" || c.status === "Diterapkan");
  const coApprovedImpact = coApproved.reduce((s, c) => s + Number(c.impact || 0), 0);

  const riskScore = (r: StoreItem): number =>
    (RISK_LEVEL.indexOf(String(r.likelihood ?? "")) + 1) * (RISK_LEVEL.indexOf(String(r.impact ?? "")) + 1);
  const riskTone = (score: number): "green" | "amber" | "red" => (score >= 6 ? "red" : score >= 3 ? "amber" : "green");

  const ganttRange = (() => {
    const pts = wbs.flatMap((w) => [parseYM(w.start), parseYM(w.end)]).filter((p): p is { y: number; m: number } => p !== null);
    if (pts.length === 0) return null;
    let min = pts[0];
    let max = pts[0];
    for (const p of pts) {
      if (p.y * 12 + p.m < min.y * 12 + min.m) min = p;
      if (p.y * 12 + p.m > max.y * 12 + max.m) max = p;
    }
    return { min, max, total: max.y * 12 + max.m - (min.y * 12 + min.m) + 1 };
  })();

  const ganttBar = (start: string, end: string): { left: number; width: number } | null => {
    if (!ganttRange) return null;
    const s = parseYM(start) ?? ganttRange.min;
    const e = parseYM(end) ?? s;
    const base = ganttRange.min.y * 12 + ganttRange.min.m;
    const left = ((s.y * 12 + s.m - base) / ganttRange.total) * 100;
    const width = Math.max(((e.y * 12 + e.m - (s.y * 12 + s.m) + 1) / ganttRange.total) * 100, 3);
    return { left, width };
  };

  const milestoneDays = getSetting(data, "ALERT_MILESTONE_DAYS", 7);
  const milestonesNear = wbs.filter((w) => {
    const d = monthEndDate(w.end);
    if (!d || Number(w.progress) >= 100) return false;
    const diff = Math.round((d.getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000);
    return diff >= 0 && diff <= milestoneDays;
  });

  const baseline = (project.wbsBaseline ?? null) as WbsBaseline | null;

  const snapshotBaseline = () => {
    update("projects", pid, { wbsBaseline: { at: todayISO(), wbs: JSON.parse(JSON.stringify(wbs)) as WbsExt[] } });
    log("membuat baseline WBS", `${pid} · ${wbs.length} tahapan`, "Proyek");
    toast("Baseline WBS tersimpan");
  };

  const saveCo = () => {
    if (!coForm.title.trim()) { toast("Judul perubahan wajib diisi", "info"); return; }
    if (coForm.impact === "" || !Number.isFinite(Number(coForm.impact))) { toast("Dampak biaya wajib diisi (boleh negatif)", "info"); return; }
    if (!coForm.requestedBy.trim()) { toast("Pemohon wajib diisi", "info"); return; }
    add("changeOrders", {
      project: pid, title: coForm.title.trim(), impact: Number(coForm.impact),
      status: "Diajukan", requestedBy: coForm.requestedBy.trim(), date: coForm.date || todayISO(),
    }, { action: "mengajukan change order", module: "Proyek" });
    toast("Change order diajukan");
    setCoForm({ title: "", impact: "", requestedBy: "", date: "" });
    setShowCo(false);
  };

  const setCoStatus = (id: string, status: string) => {
    update("changeOrders", id, { status });
    log("mengubah change order", `${id} → ${status}`, "Proyek");
    toast(`Change order ${status.toLowerCase()}`);
  };

  const openRiskNew = () => {
    setRiskEditId(null);
    setRiskForm({ title: "", likelihood: "Sedang", impact: "Sedang", mitigation: "", status: "Aktif" });
    setShowRisk(true);
  };

  const openRiskEdit = (r: StoreItem) => {
    setRiskEditId(String(r.id));
    setRiskForm({ title: String(r.title ?? ""), likelihood: String(r.likelihood ?? "Sedang"), impact: String(r.impact ?? "Sedang"), mitigation: String(r.mitigation ?? ""), status: String(r.status ?? "Aktif") });
    setShowRisk(true);
  };

  const saveRisk = () => {
    if (!riskForm.title.trim()) { toast("Judul risiko wajib diisi", "info"); return; }
    if (riskEditId) {
      update("risks", riskEditId, { title: riskForm.title.trim(), likelihood: riskForm.likelihood, impact: riskForm.impact, mitigation: riskForm.mitigation.trim(), status: riskForm.status });
      log("memperbarui risiko", `${riskEditId} · ${riskForm.title.trim()}`, "Proyek");
      toast("Risiko diperbarui");
    } else {
      add("risks", {
        project: pid, title: riskForm.title.trim(), likelihood: riskForm.likelihood,
        impact: riskForm.impact, mitigation: riskForm.mitigation.trim(), status: riskForm.status,
      }, { action: "mencatat risiko", module: "Proyek" });
      toast("Risiko ditambahkan");
    }
    setShowRisk(false);
    setRiskEditId(null);
  };

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
    const prog = Math.max(0, Math.min(100, Number(wbsUpdateForm.progress)));
    if (wbsUpdateForm.progress === "" || Number.isNaN(prog)) { toast("Isi progres 0–100", "info"); return; }
    const pred = wbsUpdateForm.predecessor || "";
    if (pred && pred !== wbsTaskUpdate && createsCycle(wbs, wbsTaskUpdate, pred)) { toast("Dependensi menciptakan siklus — ditolak", "info"); return; }
    const status = prog >= 100 ? "Selesai" : wbsUpdateForm.status === "Selesai" && prog < 100 ? "Sedang" : wbsUpdateForm.status;
    const updated = wbs.map((w) =>
      w.task === wbsTaskUpdate
        ? { ...w, actualHours: hours, materialUsed: wbsUpdateForm.material, status, progress: prog, predecessor: pred || undefined }
        : w
    );
    setWbs(pid, updated);
    update("projects", pid, { progress: weightedProgress(updated) });
    log("mengupdate progres WBS", `${wbsTaskUpdate} → ${prog}% (${status})`, "Proyek");
    toast("Progres tugas diperbarui");
    setWbsTaskUpdate(null);
    setWbsUpdateForm({ hours: "", material: "", status: "Sedang", progress: "", predecessor: "" });
  };

  const saveWbs = () => {
    if (!wbsForm.task.trim()) { toast("Nama tahapan wajib diisi", "info"); return; }
    if (wbs.some((w) => w.task === wbsForm.task.trim())) { toast("Nama tahapan sudah ada", "info"); return; }
    const weight = Number(wbsForm.weight) || 0;
    if (weight <= 0) { toast("Bobot harus lebih dari 0", "info"); return; }
    const pred = wbsForm.predecessor || "";
    if (pred && !wbs.some((w) => w.task === pred)) { toast("Predecessor tidak dikenal", "info"); return; }
    const next = [...wbs, { task: wbsForm.task.trim(), start: wbsForm.start || "-", end: wbsForm.end || "-", progress: Number(wbsForm.progress) || 0, weight, ...(pred ? { predecessor: pred } : {}) }];
    const totalW = next.reduce((s, w) => s + Number(w.weight || 0), 0);
    if (totalW !== 100) { toast(`Total bobot menjadi ${totalW}% — harus tepat 100%`, "info"); return; }
    setWbs(pid, next);
    update("projects", pid, { progress: weightedProgress(next) });
    log("menambah tahapan WBS", `${pid} · ${wbsForm.task.trim()}`, "Proyek");
    toast("Tahapan ditambahkan");
    setShowWbs(false);
    setWbsForm({ task: "", start: "", end: "", weight: "10", progress: "0", predecessor: "" });
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
        <KpiCard label="Progres" value={`${project.progress}%`} delta={project.status === "Terlambat" ? "Terlambat dari jadwal" : "Sesuai jadwal"} deltaDirection={project.status === "Terlambat" ? "down" : "up"} hint="Rata-rata berbobot WBS" />
        <KpiCard label="Periode" value={fmtRentang(project.start, project.end)} hint={project.branch} icon={<MapPin className="h-5 w-5" />} />
      </div>

      <div className="mt-5 card">
        <Tabs tabs={["Ringkasan", "WBS & Anggaran", "BoQ", "Dokumen & Laporan", "Perubahan & Risiko", "Terkait", ...(getSetting(data, "SHOW_3D_PROJECT", 0) === 1 ? ["3D Viewer"] : []), "Service", "Sparepart", "Tim"]} active={tab} onChange={setTab} />
        <div className="p-5">
          {tab === "Ringkasan" && (
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
                    <span className="text-xs text-steel-500">Rata-rata berbobot WBS</span>
                  </div>
                   <ProgressBar value={project.progress} tone={project.status === "Terlambat" ? "red" : "navy"} />
                    <p className="mt-1 text-xs text-steel-500">{project.progress}% selesai · target penyelesaian {fmtTanggal(project.end)}</p>
                </div>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy-900">Milestone Dekat (H-{milestoneDays})</h3>
                    <Link to="/proyek/monitoring" className="text-xs font-medium text-ocean-600 hover:underline">Monitoring</Link>
                  </div>
                  {milestonesNear.length === 0 ? (
                    <p className="text-xs text-steel-400">Tidak ada milestone dalam {milestoneDays} hari ke depan.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {milestonesNear.map((w) => (
                        <div key={w.task} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm">
                          <span className="font-medium text-navy-900">{w.task}</span>
                          <span className="text-xs text-steel-500">{w.progress}% · berakhir {fmtBulan(w.end)}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                   <div className="flex justify-between"><dt className="text-steel-500">Mulai</dt><dd className="font-medium">{fmtTanggal(project.start)}</dd></div>
                   <div className="flex justify-between"><dt className="text-steel-500">Selesai</dt><dd className="font-medium">{fmtTanggal(project.end)}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={project.status} /></dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Invoice</dt><dd className="font-medium">{invoices.length} dokumen</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">NCR terbuka</dt><dd className="font-medium">{ncrs.filter((n) => n.status !== "Tertutup").length}</dd></div>
                </dl>
              </Card>
            </div>
          )}

          {tab === "WBS & Anggaran" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-navy-900">Work Breakdown Structure</h3>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowWbs(true)}><Plus className="h-3.5 w-3.5" /> Tambah Tahapan</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><SortTh label="Tahapan" sortKey="task" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Mulai" sortKey="start" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Selesai" sortKey="end" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Bobot" sortKey="weight" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Pred" sortKey="predecessor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Progres" sortKey="progress" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(wbs, sort, (w: WbsExt, k) => k === "weight" ? Number(w.weight) : k === "progress" ? Number(w.progress) : String((w as unknown as Record<string, unknown>)[k] ?? "")).map((w) => (
                      <tr key={w.task}>
                         <td className="td font-medium text-navy-900">{w.task}</td>
                         <td className="td font-mono text-xs text-steel-500">{fmtBulan(w.start)}</td>
                         <td className="td font-mono text-xs text-steel-500">{fmtBulan(w.end)}</td>
                        <td className="td">{w.weight}%</td>
                        <td className="td text-xs text-steel-500">{w.predecessor || "—"}</td>
                        <td className="td">
                          <div className="flex items-center gap-3">
                            <ProgressBar value={w.progress} className="w-32" tone={w.progress >= 100 ? "green" : "navy"} />
                            <span className="text-xs font-medium">{w.progress}%</span>
                          </div>
                        </td>
                        <td className="td">
                           <button className="btn-secondary text-xs" onClick={() => { setWbsTaskUpdate(w.task); setWbsUpdateForm({ hours: String(w.actualHours ?? ""), material: w.materialUsed ?? "", status: w.status === "Selesai" ? "Selesai" : "Sedang", progress: String(w.progress ?? 0), predecessor: w.predecessor ?? "" }); }}>Perbarui</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ganttRange && wbs.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-navy-900">Gantt Mini</h4>
                    <span className="text-[11px] text-steel-500">{fmtBulan(`${ganttRange.min.y}-${String(ganttRange.min.m).padStart(2, "0")}`)} → {fmtBulan(`${ganttRange.max.y}-${String(ganttRange.max.m).padStart(2, "0")}`)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {wbs.map((w) => {
                      const bar = ganttBar(w.start, w.end);
                      if (!bar) return null;
                      return (
                        <div key={`gantt-${w.task}`} className="flex items-center gap-2">
                          <span className="w-40 truncate text-[11px] text-steel-600">{w.task}</span>
                          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-steel-100">
                            <div className="absolute top-0 h-full rounded-full bg-ocean-300" style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
                            <div className="absolute top-0 h-full rounded-full bg-navy-700" style={{ left: `${bar.left}%`, width: `${(bar.width * Math.max(0, Math.min(100, Number(w.progress) || 0))) / 100}%` }} />
                          </div>
                          <span className="w-9 text-right text-[11px] font-medium text-steel-600">{w.progress}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 rounded-xl border border-steel-100 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-navy-900">
                    Baseline WBS{baseline ? ` · snapshot ${fmtTanggal(baseline.at)}` : " · belum ada snapshot"}
                  </h4>
                  <div className="flex gap-2">
                    <button className="btn-secondary text-xs" onClick={snapshotBaseline}>Snapshot Baseline</button>
                    {baseline && <button className="btn-secondary text-xs" onClick={() => setShowDelBaseline(true)}>Hapus Baseline</button>}
                  </div>
                </div>
                {!baseline ? (
                  <p className="text-xs text-steel-400">Belum ada baseline. Ambil snapshot untuk membandingkan rencana vs aktual.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface">
                        <tr><SortTh label="Tahapan" sortKey="task" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Rencana (baseline)" sortKey="planned" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Aktual" sortKey="actual" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Deviasi" sortKey="dev" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(wbs, sort2, (w: WbsExt, k) => { const base = baseline?.wbs.find((b) => b.task === w.task); const planned = base ? Number(base.progress) || 0 : 0; const actual = Number(w.progress) || 0; if (k === "planned") return planned; if (k === "actual") return actual; if (k === "dev") return actual - planned; return String(w.task); }).map((w) => {
                          const base = baseline.wbs.find((b) => b.task === w.task);
                          const planned = base ? Number(base.progress) || 0 : 0;
                          const actual = Number(w.progress) || 0;
                          const dev = actual - planned;
                          return (
                            <tr key={`base-${w.task}`}>
                              <td className="td font-medium text-navy-900">{w.task}</td>
                              <td className="td text-xs text-steel-500">{base ? `${planned}% · ${fmtTanggal(baseline.at)}` : "baru (di luar baseline)"}</td>
                              <td className="td text-xs font-medium">{actual}%</td>
                              <td className={`td text-xs font-semibold ${dev < 0 ? "text-rose-600" : dev > 0 ? "text-emerald-600" : "text-steel-500"}`}>
                                {dev > 0 ? `+${dev}%` : `${dev}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "WBS & Anggaran" && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-navy-900">Anggaran & Nilai Hasil</h3>
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
                <p className="mt-3 text-xs text-steel-500">
                  Dampak CO disetujui/diterapkan: <span className="font-semibold text-navy-900">{fmtRupiah(coApprovedImpact)}</span> ({coApproved.length} CO) — kelola di tab Perubahan &amp; Risiko.
                </p>
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Nilai Hasil (EVM)</h3>
                {(() => {
                  const pv = project.budget;
                  const ev = Math.round((project.budget * project.progress) / 100);
                  const ac = project.actual;
                  const spi = pv > 0 ? ev / pv : 0;
                  const cpi = ac > 0 ? ev / ac : 0;
                  const eac = cpi > 0 ? Math.round(ac / cpi) : ac;
                  return (
                    <>
                      <dl className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><dt className="text-steel-500">PV (anggaran × 100%)</dt><dd className="font-medium">{fmtMiliar(pv)}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">EV (anggaran × progres)</dt><dd className="font-medium">{fmtMiliar(ev)}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">AC (realisasi)</dt><dd className="font-medium">{fmtMiliar(ac)}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">SPI / CPI</dt><dd className="font-medium">{spi.toFixed(2)} / {cpi.toFixed(2)}</dd></div>
                      </dl>
                      <p className="mt-3 text-sm text-steel-600">
                        Estimasi biaya akhir (EAC) <span className="font-semibold text-amber-600">{fmtMiliar(eac)}</span>{" "}
                        {cpi < 1 && ac > 0 ? "— di atas anggaran, perlu pengendalian biaya." : cpi >= 1 ? "— dalam kendali anggaran." : "— belum ada realisasi tercatat."}
                      </p>
                    </>
                  );
                })()}
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

          {tab === "Dokumen & Laporan" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-navy-900">Dokumen Proyek</h3>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowDoc(true)}><Plus className="h-3.5 w-3.5" /> Tambah Dokumen</button>
              </div>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-xl border border-steel-100 p-3 text-sm">
                    <div>
                      <p className="font-medium text-navy-900">{d.title}</p>
                      <p className="text-xs text-steel-500">{d.id} · {d.type} · {d.version} · {d.updated}{d.fileName ? ` · lampiran: ${d.fileName}` : ""}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary text-xs" aria-label={`Ekspor ${d.title} ke Excel`} onClick={() => {
                        exportExcel([["Field", "Value"], ["ID", d.id], ["Judul", d.title], ["Tipe", d.type], ["Proyek", pid], ["Versi", d.version], ["Status", d.status], ["Diperbarui", d.updated], ["Owner", d.owner]], `${d.id}-ringkasan`);
                        toast(`${d.id} diekspor ke Excel`);
                      }}><FileDown className="h-3.5 w-3.5" /> Excel</button>
                      <StatusBadge status={d.status} />
                    </div>
                  </div>
                ))}
                {docs.length === 0 && <p className="text-sm text-steel-400">Belum ada dokumen untuk proyek ini.</p>}
              </div>
            </div>
          )}

          {tab === "Perubahan & Risiko" && (
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Change Orders ({coList.length})</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowCo(true)}><Plus className="h-3.5 w-3.5" /> Ajukan CO</button>
                </div>
                <div className="mb-3 rounded-xl border border-steel-100 bg-surface p-3 text-sm">
                  <span className="text-steel-500">Total dampak disetujui/diterapkan: </span>
                  <span className="font-semibold text-navy-900">{fmtRupiah(coApprovedImpact)}</span>
                  <span className="text-steel-500"> dari {coApproved.length} CO</span>
                </div>
                <div className="space-y-2">
                  {coList.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-navy-900">{c.title}</p>
                        <p className="text-xs text-steel-500">{c.id} · {fmtTanggal(c.date)} · pemohon: {c.requestedBy} · dampak: <span className={`font-semibold ${Number(c.impact) < 0 ? "text-emerald-600" : "text-navy-900"}`}>{fmtRupiah(Number(c.impact))}</span></p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        {c.status === "Diajukan" && (
                          <>
                            <button className="btn-secondary text-xs" onClick={() => setCoStatus(c.id, "Disetujui")}>Setujui</button>
                            <button className="btn-secondary text-xs" onClick={() => setCoStatus(c.id, "Ditolak")}>Tolak</button>
                          </>
                        )}
                        {c.status === "Disetujui" && (
                          <button className="btn-secondary text-xs" onClick={() => setCoStatus(c.id, "Diterapkan")}>Terapkan</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {coList.length === 0 && <p className="text-sm text-steel-400">Belum ada change order.</p>}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Risiko ({riskList.length})</h3>
                  <button className="btn-secondary text-xs" onClick={openRiskNew}><Plus className="h-3.5 w-3.5" /> Tambah Risiko</button>
                </div>
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full text-center text-xs">
                    <thead>
                      <tr>
                        <SortTh label="Kemungkinan \ Dampak" sortKey="level" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        {RISK_LEVEL.map((l) => <SortTh key={l} label={l} sortKey={l} sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(RISK_LEVEL, sort3, (lh, k) => k === "level" ? String(lh) : Number(riskList.filter((r) => String(r.likelihood) === String(lh) && String(r.impact) === String(k) && String(r.status) !== "Tertutup").length)).map((lh) => (
                        <tr key={lh}>
                          <td className="td text-left font-medium text-navy-900">{lh}</td>
                          {RISK_LEVEL.map((im) => {
                            const n = riskList.filter((r) => r.likelihood === lh && r.impact === im && r.status !== "Tertutup").length;
                            const score = (RISK_LEVEL.indexOf(lh) + 1) * (RISK_LEVEL.indexOf(im) + 1);
                            return (
                              <td key={im} className="td">
                                <Badge tone={n > 0 ? riskTone(score) : "gray"}>{n} risiko</Badge>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2">
                  {riskList.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-navy-900">{r.title}</p>
                        <p className="text-xs text-steel-500">{r.id} · mitigasi: {r.mitigation || "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={riskTone(riskScore(r))}>{r.likelihood} × {r.impact}</Badge>
                        <StatusBadge status={r.status} />
                        <button className="btn-secondary text-xs" onClick={() => openRiskEdit(r)}>Ubah</button>
                      </div>
                    </div>
                  ))}
                  {riskList.length === 0 && <p className="text-sm text-steel-400">Belum ada risiko tercatat.</p>}
                </div>
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
          {tab === "Dokumen & Laporan" && <div className="mt-6"><ReportSection projectId={pid} /></div>}
          {tab === "3D Viewer" && getSetting(data, "SHOW_3D_PROJECT", 0) === 1 && <SparepartServiceSection projectId={pid} view="3d" />}
          {tab === "Service" && <SparepartServiceSection projectId={pid} view="service" />}
          {tab === "Sparepart" && <SparepartServiceSection projectId={pid} view="sparepart" />}
        </div>
      </div>

      {/* Modal change order */}
      <Modal open={showCo} onClose={() => setShowCo(false)} title="Ajukan Change Order" subtitle={pid}
        footer={<><button className="btn-secondary" onClick={() => setShowCo(false)}>Batal</button><button className="btn-primary" onClick={saveCo}>Ajukan</button></>}>
        <div className="space-y-3">
          <Field label="Judul perubahan"><input className="input" value={coForm.title} onChange={(e) => setCoForm({ ...coForm, title: e.target.value })} placeholder="cth: Tambah Fi-Fi system deck" /></Field>
          <FormGrid>
            <Field label="Dampak biaya (Rp)" hint="Boleh negatif untuk pengurangan scope"><input type="number" className="input" value={coForm.impact} onChange={(e) => setCoForm({ ...coForm, impact: e.target.value })} placeholder="cth: 1850000000 atau -120000000" /></Field>
            <Field label="Tanggal"><input type="date" className="input" value={coForm.date} onChange={(e) => setCoForm({ ...coForm, date: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Pemohon"><input className="input" value={coForm.requestedBy} onChange={(e) => setCoForm({ ...coForm, requestedBy: e.target.value })} placeholder="cth: Budi Santoso" /></Field>
          <p className="text-xs text-steel-500">Alur: {CO_FLOW.join(" → ")} — CO baru berstatus Diajukan.</p>
        </div>
      </Modal>

      {/* Modal risiko */}
      <Modal open={showRisk} onClose={() => setShowRisk(false)} title={riskEditId ? "Ubah Risiko" : "Tambah Risiko"} subtitle={pid}
        footer={<><button className="btn-secondary" onClick={() => setShowRisk(false)}>Batal</button><button className="btn-primary" onClick={saveRisk}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Judul risiko"><input className="input" value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} placeholder="cth: Keterlambatan baja AH36" /></Field>
          <FormGrid>
            <Field label="Kemungkinan">
              <select className="input" value={riskForm.likelihood} onChange={(e) => setRiskForm({ ...riskForm, likelihood: e.target.value })}>
                {RISK_LEVEL.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Dampak">
              <select className="input" value={riskForm.impact} onChange={(e) => setRiskForm({ ...riskForm, impact: e.target.value })}>
                {RISK_LEVEL.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Mitigasi"><input className="input" value={riskForm.mitigation} onChange={(e) => setRiskForm({ ...riskForm, mitigation: e.target.value })} placeholder="cth: Dual vendor + buffer 2 minggu" /></Field>
          <Field label="Status">
            <select className="input" value={riskForm.status} onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })}>
              {RISK_STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

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
          <Field label="Progres (%)" hint="0–100, diisi manual berdasarkan capaian nyata"><input type="number" min={0} max={100} className="input" value={wbsUpdateForm.progress} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, progress: e.target.value })} placeholder="cth: 70" /></Field>
          <Field label="Jam Kerja Aktual"><input type="number" className="input" value={wbsUpdateForm.hours} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, hours: e.target.value })} placeholder="cth: 8" /></Field>
          <Field label="Material Dipakai"><input className="input" value={wbsUpdateForm.material} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, material: e.target.value })} placeholder="cth: Baja AH36 50kg" /></Field>
          <Field label="Status">
            <select className="input" value={wbsUpdateForm.status} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, status: e.target.value as "Sedang" | "Selesai" })}>
              <option value="Sedang">Sedang Dikerjakan</option>
              <option value="Selesai">Selesai</option>
            </select>
          </Field>
          <Field label="Predecessor (opsional)" hint="Tugas pendahulu — ditolak bila membentuk siklus">
            <select className="input" value={wbsUpdateForm.predecessor} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, predecessor: e.target.value })}>
              <option value="">Tanpa predecessor</option>
              {wbs.filter((w) => w.task !== wbsTaskUpdate).map((w) => <option key={w.task} value={w.task}>{w.task}</option>)}
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
          <Field label="Predecessor (opsional)" hint="Tugas pendahulu — ditolak bila membentuk siklus">
            <select className="input" value={wbsForm.predecessor} onChange={(e) => setWbsForm({ ...wbsForm, predecessor: e.target.value })}>
              <option value="">Tanpa predecessor</option>
              {wbs.map((w) => <option key={w.task} value={w.task}>{w.task}</option>)}
            </select>
          </Field>
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
          add("documents", { title: docTitle.trim(), type: docType, project: pid, vessel: project.vessel, version: "v1.0", status: "Draft", updated: new Date().toISOString().slice(0, 10), owner: "Anda", sharedWith: [], approvalStatus: "Draft", fileName: docFile.trim() || "-" },
            { action: "mengarsipkan dokumen", module: "Dokumen" });
          toast("Dokumen ditambahkan"); setShowDoc(false); setDocTitle(""); setDocFile("");
        }}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Judul dokumen"><input className="input" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} /></Field>
          <Field label="Tipe">
            <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {["Laporan", "Kontrak", "Kontrak Kerja", "Drawing", "Prosedur", "Sertifikat", "Invoice", "NCR"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Lampiran (nama file)" hint="Metadata nama file — upload fisik menyusul via backend">
            <input className="input" value={docFile} onChange={(e) => setDocFile(e.target.value)} placeholder="cth: kontrak-kerja-NB-2025-012.pdf" />
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
      <ConfirmModal open={showDelBaseline} title="Hapus baseline?" desc="Snapshot baseline WBS proyek ini akan dihapus dan tabel perbandingan disembunyikan."
        confirmLabel="Ya, hapus" danger onCancel={() => setShowDelBaseline(false)}
        onConfirm={() => { update("projects", pid, { wbsBaseline: undefined }); log("menghapus baseline WBS", pid, "Proyek"); toast("Baseline dihapus", "info"); setShowDelBaseline(false); }} />
    </div>
  );
}