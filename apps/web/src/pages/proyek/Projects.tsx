import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Anchor, Wallet, TrendingUp, Clock, LayoutTemplate, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Card,
  PageHeader,
  StatusBadge,
  ProgressBar,
  Badge,
  KpiCard,
  Modal,
  Field,
  FormGrid,
  toast,
  SortTh,
  toggleSort,
  sortRows,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem, WbsItem } from "../../data/store";
import { fmtMiliar, sparkProjects, activeProjectTrend, contractValueTrend, avgProgressTrend } from "../../data";
import { todayISO } from "../../utils/format";
import { AlertBannerView, notifRowId, useModuleAlert } from "../../components/AlertBanner";

export const TAHAP = ["Inquiry", "Quotation", "Kontrak", "Desain", "Produksi", "Trial", "Handover"];
export const PRIORITAS = ["Rendah", "Sedang", "Tinggi", "Kritis"];

export function tahapOf(p: StoreItem): string {
  return TAHAP.includes(p.tahap) ? p.tahap : "Produksi";
}

const filters = ["Semua", "New Build", "Repair", "Retrofit"];
const statusOptions = ["Semua", "Dalam Proses", "Sedang Berjalan", "Terlambat", "Selesai", "Tertunda"];
const branchOptions = ["Samarinda", "Balikpapan", "Banjarmasin"];
const PREFIX_TIPE: Record<string, string> = { "New Build": "NB", Repair: "RP", Retrofit: "RF" };
const prioritasTone: Record<string, "gray" | "blue" | "amber" | "red"> = {
  Rendah: "gray",
  Sedang: "blue",
  Tinggi: "amber",
  Kritis: "red",
};

interface TemplateTask {
  task: string;
  weight: number;
}

interface TemplateDef {
  key: string;
  label: string;
  desc: string;
  type: string;
  scope: string[];
  tasks: TemplateTask[];
}

const TEMPLATES: TemplateDef[] = [
  {
    key: "tug",
    label: "New Build Tug",
    desc: "Pembangunan tugboat baru dari desain hingga serah terima",
    type: "New Build",
    scope: ["Desain & Class Approval", "Fabrikasi Baja", "Hull Assembly", "Outfitting Machinery", "Outfitting Piping", "Outfitting Electrical", "Outfitting Nav & Comm", "Outfitting Accommodation", "Painting", "Commissioning", "Sea Trial"],
    tasks: [
      { task: "Desain & Persetujuan Class", weight: 8 },
      { task: "Pengadaan Material", weight: 10 },
      { task: "Fabrikasi Baja", weight: 12 },
      { task: "Hull Assembly", weight: 12 },
      { task: "Outfitting — Machinery", weight: 8 },
      { task: "Outfitting — Piping", weight: 7 },
      { task: "Outfitting — Electrical", weight: 7 },
      { task: "Outfitting — Nav & Comm", weight: 5 },
      { task: "Outfitting — Accommodation", weight: 5 },
      { task: "Painting — Surface Prep", weight: 5 },
      { task: "Painting — Priming", weight: 4 },
      { task: "Painting — Topcoat", weight: 4 },
      { task: "Painting — Final Inspection", weight: 3 },
      { task: "Commissioning", weight: 6 },
      { task: "Sea Trial & Handover", weight: 4 },
    ],
  },
  {
    key: "docking",
    label: "Repair Docking",
    desc: "Perbaikan dan docking kapal yang sedang beroperasi",
    type: "Repair",
    scope: ["Survey & Docking Preparation", "Hull Cleaning & Blasting", "Perbaikan Pelat", "Overhaul Mesin", "Coating", "Undocking & Trial"],
    tasks: [
      { task: "Persiapan Docking & Survey", weight: 10 },
      { task: "Pembersihan & Blasting Lambung", weight: 15 },
      { task: "Perbaikan Pelat & Struktur", weight: 25 },
      { task: "Overhaul Mesin & Pompa", weight: 20 },
      { task: "Coating & Antifouling", weight: 20 },
      { task: "Undocking & Trial", weight: 10 },
    ],
  },
  {
    key: "retrofit",
    label: "Retrofit",
    desc: "Modernisasi sistem dan peralatan kapal eksisting",
    type: "Retrofit",
    scope: ["Survey & Engineering", "Pengadaan Peralatan", "Demolition", "Instalasi Sistem Baru", "Commissioning", "Trial & Handover"],
    tasks: [
      { task: "Survey & Engineering", weight: 10 },
      { task: "Pengadaan Peralatan", weight: 20 },
      { task: "Demolition & Preparasi", weight: 15 },
      { task: "Instalasi Sistem Baru", weight: 30 },
      { task: "Commissioning", weight: 15 },
      { task: "Trial & Handover", weight: 10 },
    ],
  },
];

const emptyForm = {
  vessel: "",
  type: "New Build",
  client: "",
  branch: "Samarinda",
  start: "",
  end: "",
  budget: "",
  manager: "",
  scope: "",
  status: "Dalam Proses",
  tahap: "Inquiry",
  prioritas: "Sedang",
  vesselLoa: "",
  vesselType: "",
  vesselImo: "",
};

const TPL_KEY = "isms.templates";

const loadCustomTemplates = (): TemplateDef[] => {
  try {
    const raw = localStorage.getItem(TPL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as TemplateDef[]) : [];
  } catch {
    return [];
  }
};

const persistCustomTemplates = (tpls: TemplateDef[]) => {
  try {
    localStorage.setItem(TPL_KEY, JSON.stringify(tpls));
  } catch {
    /* penyimpanan penuh/privat — abaikan */
  }
};

export default function Projects() {
  const { data, add, update, log, setWbs, wbsFor, inBranch } = useStore();
  const modAlert = useModuleAlert("proyek");
  const navigate = useNavigate();
  const projects = data.projects;
  const [filter, setFilter] = useState("Semua");
  const [statusFilter, setStatusFilter] = useState("Semua");
  const [tahapFilter, setTahapFilter] = useState("Semua");
  const [branchFilter, setBranchFilter] = useState("Semua");
  const [prioritasFilter, setPrioritasFilter] = useState("Semua");
  const [pmFilter, setPmFilter] = useState("Semua");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [showAdd, setShowAdd] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pendingWbs, setPendingWbs] = useState<TemplateTask[] | null>(null);
  const [mundurFor, setMundurFor] = useState<StoreItem | null>(null);
  const [mundurReason, setMundurReason] = useState("");
  const [customTpls, setCustomTpls] = useState<TemplateDef[]>(loadCustomTemplates);
  const [tplName, setTplName] = useState("");
  const [tplFromProject, setTplFromProject] = useState("");

  const pmOptions = [...new Set(projects.map((p) => String(p.manager ?? "")).filter(Boolean))].sort();
  const hasActiveFilter = filter !== "Semua" || statusFilter !== "Semua" || tahapFilter !== "Semua" || branchFilter !== "Semua" || prioritasFilter !== "Semua" || pmFilter !== "Semua" || q.trim() !== "";
  const resetFilters = () => { setFilter("Semua"); setStatusFilter("Semua"); setTahapFilter("Semua"); setBranchFilter("Semua"); setPrioritasFilter("Semua"); setPmFilter("Semua"); setQ(""); };

  const list = inBranch(projects).filter((p) => {
    const matchType = filter === "Semua" || p.type === filter;
    const matchStatus = statusFilter === "Semua" || p.status === statusFilter;
    const matchTahap = tahapFilter === "Semua" || tahapOf(p) === tahapFilter;
    const matchBranch = branchFilter === "Semua" || p.branch === branchFilter;
    const matchPrioritas = prioritasFilter === "Semua" || String(p.prioritas ?? "Sedang") === prioritasFilter;
    const matchPm = pmFilter === "Semua" || String(p.manager ?? "") === pmFilter;
    const matchQ = `${p.vessel} ${p.id} ${p.client} ${p.manager ?? ""}`.toLowerCase().includes(q.toLowerCase());
    return matchType && matchStatus && matchTahap && matchBranch && matchPrioritas && matchPm && matchQ;
  });

  const totalBudget = list.reduce((s, p) => s + Number(p.budget || 0), 0);
  const inProgress = list.filter((p) => p.status !== "Selesai").length;
  const delayed = list.filter((p) => p.status === "Terlambat").length;
  const avgProgress = list.length ? Math.round(list.reduce((s, p) => s + Number(p.progress || 0), 0) / list.length) : 0;

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const vesselExists = data.vessels.some((v) => v.name.toLowerCase() === form.vessel.trim().toLowerCase());

  const nextProjectCode = (type: string, start: string): string => {
    const prefix = PREFIX_TIPE[type] ?? "PRJ";
    const year = start.match(/^(\d{4})/)?.[1] ?? String(new Date().getFullYear());
    let max = 0;
    for (const p of projects) {
      const m = String(p.id).match(new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`));
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
  };

  const codePreview = nextProjectCode(form.type, form.start);

  const majuTahap = async (p: StoreItem) => {
    const idx = TAHAP.indexOf(tahapOf(p));
    if (idx < 0 || idx >= TAHAP.length - 1) return;
    const from = TAHAP[idx];
    const to = TAHAP[idx + 1];
    // E1 gate: Desain → Produksi butuh Class Approval Disetujui.
    if (from === "Desain" && to === "Produksi") {
      const stages = (p.designStages ?? []) as { name: string; status: string }[];
      const ca = stages.find((s) => s.name === "Class Approval");
      if (!ca || ca.status !== "Disetujui") {
        toast("Class Approval belum Disetujui — lengkapi sub-stage desain dulu", "info");
        return;
      }
    }
    await update("projects", p.id, {
      tahap: to,
      tahapLog: [...(p.tahapLog ?? []), { from: tahapOf(p), to, date: todayISO(), by: "Anda", reason: "" }],
    });
    log("memajukan tahap", `${p.id} → ${to}`, "Proyek");
    toast(`Tahap ${p.id} menjadi ${to}`);
  };

  const confirmMundur = async () => {
    if (!mundurFor) return;
    if (!mundurReason.trim()) { toast("Alasan penarikan tahap wajib diisi", "info"); return; }
    const idx = TAHAP.indexOf(tahapOf(mundurFor));
    if (idx <= 0) { setMundurFor(null); return; }
    const to = TAHAP[idx - 1];
    await update("projects", mundurFor.id, {
      tahap: to,
      tahapLog: [...(mundurFor.tahapLog ?? []), { from: tahapOf(mundurFor), to, date: todayISO(), by: "Anda", reason: mundurReason.trim() }],
    });
    log("menurunkan tahap", `${mundurFor.id} → ${to} (alasan: ${mundurReason.trim()})`, "Proyek");
    toast(`Tahap ${mundurFor.id} ditarik ke ${to}`);
    setMundurFor(null);
    setMundurReason("");
  };

  const pickTemplate = (t: TemplateDef) => {
    setForm((f) => ({ ...f, type: t.type, scope: t.scope.join(", "), tahap: "Inquiry" }));
    setPendingWbs(t.tasks);
    setShowTemplate(false);
    setShowAdd(true);
    toast(`Template "${t.label}" dimuat — lengkapi data & nilai kontrak`);
  };

  const storeCustomTemplate = (tpl: TemplateDef) => {
    const next = [...customTpls, tpl];
    setCustomTpls(next);
    persistCustomTemplates(next);
    log("menyimpan template proyek", tpl.label, "Proyek");
    toast(`Template "${tpl.label}" tersimpan`);
  };

  const saveFormAsTemplate = () => {
    if (!tplName.trim()) { toast("Isi nama template dulu", "info"); return; }
    const scope = form.scope.split(",").map((s) => s.trim()).filter(Boolean);
    if (scope.length === 0 && !pendingWbs) { toast("Isi lingkup atau muat template dulu", "info"); return; }
    storeCustomTemplate({
      key: `custom-${Date.now()}`,
      label: tplName.trim(),
      desc: "Template kustom dari form proyek",
      type: form.type,
      scope,
      tasks: (pendingWbs ?? []).map((t) => ({ task: t.task, weight: t.weight })),
    });
    setTplName("");
  };

  const saveProjectAsTemplate = () => {
    if (!tplName.trim()) { toast("Isi nama template dulu", "info"); return; }
    const src = data.projects.find((p) => p.id === tplFromProject);
    if (!src) { toast("Pilih proyek sumber dulu", "info"); return; }
    const wbs = wbsFor(src.id).map((w) => ({ task: w.task, weight: Number(w.weight) || 0 })).filter((t) => t.task && t.weight > 0);
    if (wbs.length === 0) { toast("Proyek sumber belum punya WBS", "info"); return; }
    storeCustomTemplate({
      key: `custom-${Date.now()}`,
      label: tplName.trim(),
      desc: `Template kustom dari ${src.id} · ${src.vessel}`,
      type: String(src.type),
      scope: [...(src.scope ?? [])],
      tasks: wbs,
    });
    setTplName("");
  };

  const deleteCustomTemplate = (key: string) => {
    const tpl = customTpls.find((t) => t.key === key);
    const next = customTpls.filter((t) => t.key !== key);
    setCustomTpls(next);
    persistCustomTemplates(next);
    log("menghapus template proyek", tpl?.label ?? key, "Proyek");
    toast(`Template "${tpl?.label ?? key}" dihapus`, "info");
  };

  const save = async () => {
    if (!form.vessel.trim() || !form.client.trim()) { toast("Nama kapal & klien wajib diisi", "info"); return; }
    if (!form.branch.trim()) { toast("Cabang wajib dipilih", "info"); return; }
    if (!branchOptions.includes(form.branch)) { toast("Cabang tidak dikenal", "info"); return; }
    const scopeItems = form.scope.split(",").map((s) => s.trim()).filter(Boolean);
    if (scopeItems.length === 0) { toast("Ruang lingkup minimal 1 item (pisahkan koma)", "info"); return; }
    if (!form.start || !form.end) { toast("Tanggal mulai & selesai rencana wajib diisi", "info"); return; }
    if (form.end < form.start) { toast("Tanggal selesai tidak boleh sebelum tanggal mulai", "info"); return; }
    const budget = Number(form.budget);
    if (!Number.isFinite(budget) || budget <= 0) { toast("Nilai kontrak harus lebih dari 0", "info"); return; }
    if (!form.manager) { toast("Pilih project manager", "info"); return; }
    if (form.type === "New Build" && projects.some((p) => String(p.vessel ?? "").trim().toLowerCase() === form.vessel.trim().toLowerCase() && String(p.type) === "New Build")) {
      toast("Kapal ini sudah punya proyek New Build — duplikat ditolak (Repair/Retrofit boleh berulang)", "info");
      return;
    }
    if (!vesselExists) {
      const loa = Number(form.vesselLoa);
      if (!Number.isFinite(loa) || loa <= 0) { toast("Kapal belum terdaftar: LOA kapal baru wajib diisi (> 0)", "info"); return; }
      if (!form.vesselType.trim()) { toast("Kapal belum terdaftar: tipe kapal wajib diisi", "info"); return; }
      const imoRaw = form.vesselImo.trim();
      if (!imoRaw || imoRaw === "-" || imoRaw.toUpperCase() === "IMO" || imoRaw.toUpperCase() === "IMO -") {
        toast("Kapal baru: IMO wajib diisi — real IMO (cth IMO 1234567) atau TBD-... bila menyusul", "info");
        return;
      }
    }
    const code = nextProjectCode(form.type, form.start);
    const created: StoreItem = await add(
      "projects",
      {
        id: code,
        vessel: form.vessel.trim(),
        type: form.type,
        client: form.client,
        status: form.status,
        tahap: form.tahap,
        prioritas: form.prioritas,
        tahapLog: [{ from: "-", to: form.tahap, date: todayISO(), by: "Anda", reason: "Proyek dibuat" }],
        branch: form.branch,
        start: form.start,
        end: form.end,
        progress: 0,
        budget,
        actual: 0,
        manager: form.manager,
        scope: scopeItems,
      },
      { action: "membuat proyek", module: "Proyek" }
    );
    if (pendingWbs) {
      const wbs: WbsItem[] = pendingWbs.map((t) => ({
        task: t.task,
        start: form.start.slice(0, 7) || "-",
        end: form.end.slice(0, 7) || "-",
        progress: 0,
        weight: t.weight,
      }));
      await setWbs(created.id, wbs);
      setPendingWbs(null);
    }
    if (!vesselExists) {
      await add("vessels", {
        name: form.vessel.trim(),
        imo: form.vesselImo.trim(),
        type: form.vesselType.trim(),
        class: "BKI",
        flag: "Indonesia",
        built: new Date().getFullYear(),
        owner: form.client,
        loa: Number(form.vesselLoa), beam: 0, draft: 0, bollard: 0,
        status: form.type === "New Build" ? "Dalam Pembangunan" : "Dalam Docking",
        certificates: [],
        history: [{ date: form.start, event: "Proyek dibuat", type: "Kontrak" }],
      }, { action: "mendaftarkan kapal", target: form.vessel.trim(), module: "Kapal" });
      toast(`Proyek ${created.id} dibuat; kapal baru terdaftar (${form.vesselImo.trim()})`);
    } else {
      toast(`Proyek ${created.id} dibuat & terhubung ke kapal`);
    }
    setForm(emptyForm);
    setShowAdd(false);
  };

  return (
    <div>
      <PageHeader
        title="Manajemen Proyek"
        subtitle="New Build, Repair & Maintenance, Retrofit"
        icon={<Anchor className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowTemplate(true)}><LayoutTemplate className="h-4 w-4" /> Dari Template</button>
            <button className="btn-primary-gradient" onClick={() => { setPendingWbs(null); setShowAdd(true); }}><Plus className="h-4 w-4" /> Proyek Baru</button>
          </>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onClose={modAlert.dismiss} />}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Proyek" value={String(projects.length)} hint="Seluruh portofolio" icon={<Anchor className="h-5 w-5" />} chip="navy" spark={sparkProjects} />
        <KpiCard label="Sedang Berjalan" value={String(inProgress)} delta={`${delayed} terlambat`} deltaDirection="down" icon={<Clock className="h-5 w-5" />} chip="amber" spark={activeProjectTrend} />
        <KpiCard label="Nilai Kontrak" value={fmtMiliar(totalBudget)} delta="Portofolio total" deltaDirection="up" icon={<Wallet className="h-5 w-5" />} chip="teal" spark={contractValueTrend} />
        <KpiCard label="Rata-rata Progres" value={`${avgProgress}%`} delta="Penyelesaian umum" deltaDirection="flat" icon={<TrendingUp className="h-5 w-5" />} chip="violet" spark={avgProgressTrend} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input
            className="input pl-9 w-full sm:w-64"
            placeholder="Cari kapal / kode proyek..."
            aria-label="Cari proyek"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? "bg-navy-700 text-white" : "bg-white border border-steel-200 text-steel-600 hover:bg-steel-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <select className="input w-auto py-1.5 text-sm" aria-label="Filter tahap" value={tahapFilter} onChange={(e) => setTahapFilter(e.target.value)}>
          <option value="Semua">Semua tahap</option>
          {TAHAP.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input w-auto py-1.5 text-sm" aria-label="Filter cabang" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="Semua">Semua cabang</option>
          {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input w-auto py-1.5 text-sm" aria-label="Filter status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="Semua">Semua status</option>
          {statusOptions.filter((s) => s !== "Semua").map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-auto py-1.5 text-sm" aria-label="Filter prioritas" value={prioritasFilter} onChange={(e) => setPrioritasFilter(e.target.value)}>
          <option value="Semua">Semua prioritas</option>
          {PRIORITAS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="input w-auto py-1.5 text-sm" aria-label="Filter PM" value={pmFilter} onChange={(e) => setPmFilter(e.target.value)}>
          <option value="Semua">Semua PM</option>
          {pmOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {hasActiveFilter && (
          <button className="btn-secondary py-1.5 text-xs" onClick={resetFilters}>Reset</button>
        )}
        <span className="ml-auto text-xs text-steel-400">{list.length} proyek</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <SortTh label="Proyek" sortKey="vessel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Klien" sortKey="client" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Jenis" sortKey="type" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Tahap" sortKey="tahap" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Prioritas" sortKey="prioritas" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Progres" sortKey="progress" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Anggaran" sortKey="budget" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="Realisasi" sortKey="actual" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label="PM" sortKey="manager" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {sortRows(list, sort, (p: StoreItem, k) => k === "budget" ? Number(p.budget) : k === "actual" ? Number(p.actual) : k === "progress" ? Number(p.progress) : k === "tahap" ? String(tahapOf(p)) : String((p as StoreItem)[k] ?? "")).map((p) => {
                const tahapIdx = TAHAP.indexOf(tahapOf(p));
                return (
                  <tr
                    key={p.id}
                    id={notifRowId(String(p.id))}
                    className={`cursor-pointer transition-colors hover:bg-surface ${modAlert.highlight.has(String(p.id)) ? "notif-hl" : ""}`}
                    onClick={() => navigate(`/proyek/${p.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/proyek/${p.id}`); }}
                    tabIndex={0}
                    title={`Buka ${p.id}`}
                  >
                    <td className="td">
                      <span className="block">
                        <p className="font-semibold text-navy-900">{p.vessel}</p>
                        <p className="font-mono text-xs text-steel-500">{p.id}</p>
                      </span>
                    </td>
                    <td className="td text-steel-600">{p.client}</td>
                    <td className="td">
                      <Badge tone={p.type === "New Build" ? "navy" : p.type === "Repair" ? "cyan" : "violet"}>
                        {p.type}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        <Badge tone="navy">{tahapOf(p)}</Badge>
                        <button
                          className="rounded p-1 text-steel-400 hover:bg-steel-100 hover:text-navy-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Mundur satu tahap (perlu alasan)"
                          disabled={tahapIdx <= 0}
                          onClick={(e) => { e.stopPropagation(); setMundurFor(p); }}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-steel-400 hover:bg-steel-100 hover:text-navy-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Maju satu tahap"
                          disabled={tahapIdx < 0 || tahapIdx >= TAHAP.length - 1}
                          onClick={(e) => { e.stopPropagation(); majuTahap(p); }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={prioritasTone[p.prioritas ?? "Sedang"] ?? "blue"}>{p.prioritas ?? "Sedang"}</Badge>
                    </td>
                    <td className="td"><StatusBadge status={p.status} /></td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={p.progress} className="w-20" tone={p.status === "Terlambat" ? "red" : "navy"} />
                        <span className="text-xs font-medium text-steel-600">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="td font-medium text-navy-900">{fmtMiliar(p.budget)}</td>
                    <td className="td text-steel-600">{fmtMiliar(p.actual)}</td>
                    <td className="td text-steel-600">{p.manager}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">Tidak ada proyek yang cocok.</p>}
        </div>
      </Card>

      <Modal
        open={showTemplate}
        onClose={() => setShowTemplate(false)}
        title="Buat dari Template"
        subtitle="Preset ruang lingkup + WBS otomatis — nilai kontrak wajib diisi"
      >
        <div className="space-y-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => pickTemplate(t)}
              className="block w-full rounded-xl border border-steel-200 p-3 text-left transition-colors hover:border-ocean-400 hover:bg-surface"
            >
              <p className="text-sm font-semibold text-navy-900">{t.label} <Badge tone={t.type === "New Build" ? "navy" : t.type === "Repair" ? "cyan" : "violet"}>{t.type}</Badge></p>
              <p className="mt-0.5 text-xs text-steel-500">{t.desc}</p>
              <p className="mt-1 text-xs text-steel-500">{t.tasks.length} tahapan WBS · {t.scope.join(" · ")}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 border-t border-steel-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-navy-900">Template tersimpan ({customTpls.length})</p>
          {customTpls.length === 0 ? (
            <p className="text-xs text-steel-400">Belum ada template kustom. Simpan dari form proyek atau dari proyek berjalan di bawah.</p>
          ) : (
            <div className="space-y-2">
              {customTpls.map((t) => (
                <div key={t.key} className="flex items-center gap-2 rounded-xl border border-dashed border-steel-200 p-3">
                  <button onClick={() => pickTemplate(t)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-navy-900">{t.label} <Badge tone="teal">Kustom</Badge></p>
                    <p className="mt-0.5 truncate text-xs text-steel-500">{t.tasks.length} tahapan WBS · {t.scope.join(" · ") || "tanpa lingkup"}</p>
                  </button>
                  <button className="btn-secondary shrink-0 text-xs" onClick={() => deleteCustomTemplate(t.key)}>Hapus</button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-xl bg-surface p-3">
            <p className="mb-2 text-xs font-semibold text-navy-900">Simpan dari proyek berjalan</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select className="input flex-1" value={tplFromProject} onChange={(e) => setTplFromProject(e.target.value)} aria-label="Proyek sumber template">
                <option value="">Pilih proyek…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
              <input className="input flex-1" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Nama template…" aria-label="Nama template" />
              <button className="btn-secondary shrink-0 text-xs" onClick={saveProjectAsTemplate}>Simpan sebagai Template</button>
            </div>
            <p className="mt-1 text-[11px] text-steel-500">Menyimpan nama template + lingkup + WBS proyek saat ini ke penyimpanan lokal.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); setPendingWbs(null); }}
        title="Proyek Baru"
        subtitle="Kapal baru otomatis terdaftar di Rekam Jejak Kapal"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setPendingWbs(null); }}>Batal</button>
            <button className="btn-primary" onClick={save}>Simpan Proyek</button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-steel-500">
            Kode proyek otomatis: <span className="font-mono font-semibold text-navy-900">{codePreview}</span>
            {pendingWbs && <span className="ml-2">· WBS template {pendingWbs.length} tahapan akan dibuat</span>}
          </p>
          <FormGrid>
            <Field label="Nama kapal">
              <input className="input" list="vessel-list" placeholder="cth: TB Samudra Jaya 08" value={form.vessel} onChange={(e) => setF("vessel", e.target.value)} />
              <datalist id="vessel-list">
                {data.vessels.map((v) => <option key={v.id} value={v.name} />)}
              </datalist>
            </Field>
            <Field label="Klien">
              <select className="input" value={form.client} onChange={(e) => setF("client", e.target.value)}>
                <option value="">Pilih klien…</option>
                {data.clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Jenis proyek">
              <select className="input" value={form.type} onChange={(e) => setF("type", e.target.value)}>
                <option>New Build</option>
                <option>Repair</option>
                <option>Retrofit</option>
              </select>
            </Field>
            <Field label="Status awal">
              <select className="input" value={form.status} onChange={(e) => setF("status", e.target.value)}>
                <option>Dalam Proses</option>
                <option>Sedang Berjalan</option>
                <option>Tertunda</option>
              </select>
            </Field>
            <Field label="Tahap awal (E2E)">
              <select className="input" value={form.tahap} onChange={(e) => setF("tahap", e.target.value)}>
                {TAHAP.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Prioritas">
              <select className="input" value={form.prioritas} onChange={(e) => setF("prioritas", e.target.value)}>
                {PRIORITAS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Cabang">
              <select className="input" value={form.branch} onChange={(e) => setF("branch", e.target.value)}>
                {branchOptions.map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Project manager">
              <select className="input" value={form.manager} onChange={(e) => setF("manager", e.target.value)}>
                <option value="">Pilih PM…</option>
                {data.employees.filter((e) => e.dept === "Proyek" || e.role.includes("Manager")).map((e) => (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Mulai"><input type="date" className="input" value={form.start} onChange={(e) => setF("start", e.target.value)} /></Field>
            <Field label="Selesai (rencana)"><input type="date" className="input" value={form.end} onChange={(e) => setF("end", e.target.value)} /></Field>
          </FormGrid>
          {!vesselExists && form.vessel.trim() && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-800">Kapal belum terdaftar — lengkapi data kapal baru:</p>
              <FormGrid>
                <Field label="LOA kapal baru (m)"><input type="number" min={0} step={0.1} className="input" value={form.vesselLoa} onChange={(e) => setF("vesselLoa", e.target.value)} placeholder="cth: 32" /></Field>
                <Field label="Tipe kapal baru"><input className="input" value={form.vesselType} onChange={(e) => setF("vesselType", e.target.value)} placeholder="cth: Tugboat ASD 2x1600 HP" /></Field>
              </FormGrid>
              <div className="mt-2">
                <Field label="IMO kapal baru" hint='Wajib — real IMO (cth IMO 1234567) atau TBD-... bila menyusul. Placeholder "IMO -" ditolak.'>
                  <input className="input font-mono" value={form.vesselImo} onChange={(e) => setF("vesselImo", e.target.value)} placeholder="IMO 1234567 atau TBD-NB-01" />
                </Field>
              </div>
            </div>
          )}
          <Field label="Nilai kontrak (Rp)">
            <input type="number" className="input" min={0} value={form.budget} onChange={(e) => setF("budget", e.target.value)} placeholder="cth: 10000000000" />
          </Field>
          <Field label="Ruang lingkup (pisahkan koma)" hint="cth: Desain, Fabrikasi Baja, Sea Trial">
            <input className="input" value={form.scope} onChange={(e) => setF("scope", e.target.value)} />
          </Field>
          <div className="rounded-xl bg-surface p-3">
            <p className="mb-2 text-xs font-semibold text-navy-900">Simpan form ini sebagai template</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="input flex-1" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Nama template…" aria-label="Nama template" />
              <button className="btn-secondary shrink-0 text-xs" onClick={saveFormAsTemplate}>Simpan sebagai Template</button>
            </div>
            <p className="mt-1 text-[11px] text-steel-500">Menyimpan tipe + lingkup + WBS template yang sedang dimuat{pendingWbs ? ` (${pendingWbs.length} tahapan)` : ""}.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={mundurFor !== null}
        onClose={() => { setMundurFor(null); setMundurReason(""); }}
        title={`Tarik tahap: ${mundurFor?.vessel ?? ""}`}
        subtitle={mundurFor ? `${mundurFor.id} · dari ${tahapOf(mundurFor)} ke ${TAHAP[TAHAP.indexOf(tahapOf(mundurFor)) - 1] ?? "-"}` : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setMundurFor(null); setMundurReason(""); }}>Batal</button>
            <button className="btn-primary" onClick={confirmMundur}>Tarik Tahap</button>
          </>
        }
      >
        <Field label="Alasan penarikan tahap" hint="Wajib diisi — tercatat di log aktivitas proyek">
          <textarea className="input" rows={3} value={mundurReason} onChange={(e) => setMundurReason(e.target.value)} placeholder="cth: Desain revisi class belum disetujui" />
        </Field>
      </Modal>
    </div>
  );
}
