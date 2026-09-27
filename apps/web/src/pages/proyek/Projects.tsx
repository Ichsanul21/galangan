import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Anchor, Wallet, TrendingUp, Clock, ChevronLeft, ChevronRight } from "lucide-react";
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
  usePager,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { useT } from "../../i18n/LanguageContext";
import { n_prj } from "../../i18n/n_prj";
import { fmtMiliar, sparkProjects, activeProjectTrend, contractValueTrend, avgProgressTrend } from "../../data";
import { todayISO } from "../../utils/format";
import { canonPrioritas } from "../../utils/scope";
import ClientModal from "../../components/ClientModal";
import { FilterPopover } from "../../components/FilterPopover";
import { AlertBannerView, notifRowId, useModuleAlert } from "../../components/AlertBanner";

export const TAHAP = ["Inquiry", "Quotation", "Kontrak", "Desain", "Produksi", "Trial", "Handover"];
export const PRIORITAS = ["Rendah", "Sedang", "Tinggi"];

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
};

const emptyForm = {
  vessel: "",
  type: "New Build",
  client: "",
  branch: "Samarinda",
  start: "",
  end: "",
  budget: "",
  manager: "",
  status: "Dalam Proses",
  tahap: "Inquiry",
  prioritas: "Sedang",
  vesselLoa: "",
  vesselType: "",
  vesselImo: "",
};

export default function Projects() {
  const { locale } = useT();
  const S = n_prj[locale];
  const { data, add, update, log, inBranch } = useStore();
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
  const [form, setForm] = useState(emptyForm);
  const [scopeRows, setScopeRows] = useState([{ service: "", lokasi: "", deskripsi: "" }]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [mundurFor, setMundurFor] = useState<StoreItem | null>(null);
  const [mundurReason, setMundurReason] = useState("");

  const pmOptions = [...new Set(projects.map((p) => String(p.manager ?? "")).filter(Boolean))].sort();
  const resetFilters = () => { setFilter("Semua"); setStatusFilter("Semua"); setTahapFilter("Semua"); setBranchFilter("Semua"); setPrioritasFilter("Semua"); setPmFilter("Semua"); setQ(""); };

  const list = inBranch(projects).filter((p) => {
    const matchType = filter === "Semua" || p.type === filter;
    const matchStatus = statusFilter === "Semua" || p.status === statusFilter;
    const matchTahap = tahapFilter === "Semua" || tahapOf(p) === tahapFilter;
    const matchBranch = branchFilter === "Semua" || p.branch === branchFilter;
    const matchPrioritas = prioritasFilter === "Semua" || canonPrioritas(p.prioritas) === prioritasFilter;
    const matchPm = pmFilter === "Semua" || String(p.manager ?? "") === pmFilter;
    const matchQ = `${p.vessel} ${p.id} ${p.client} ${p.manager ?? ""}`.toLowerCase().includes(q.toLowerCase());
    return matchType && matchStatus && matchTahap && matchBranch && matchPrioritas && matchPm && matchQ;
  });

  const totalBudget = list.reduce((s, p) => s + Number(p.budget || 0), 0);
  const inProgress = list.filter((p) => p.status !== "Selesai").length;
  const delayed = list.filter((p) => p.status === "Terlambat").length;
  const avgProgress = list.length ? Math.round(list.reduce((s, p) => s + Number(p.progress || 0), 0) / list.length) : 0;
  const sorted = useMemo(() => sortRows(list, sort, (p: StoreItem, k) => k === "budget" ? Number(p.budget) : k === "actual" ? Number(p.actual) : k === "progress" ? Number(p.progress) : k === "tahap" ? String(tahapOf(p)) : String((p as StoreItem)[k] ?? "")), [list, sort]);
  const pager = usePager(list.length);
  useEffect(() => {
    pager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, statusFilter, tahapFilter, branchFilter, prioritasFilter, pmFilter, q]);

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
        toast(S.prjToastGate, "info");
        return;
      }
    }
    await update("projects", p.id, {
      tahap: to,
      tahapLog: [...(p.tahapLog ?? []), { from: tahapOf(p), to, date: todayISO(), by: "Anda", reason: "" }],
    });
    log("memajukan tahap", `${p.id} → ${to}`, "Proyek");
    toast(S.prjToastAdvance.replace("{a}", p.id).replace("{b}", to));
  };

  const confirmMundur = async () => {
    if (!mundurFor) return;
    if (!mundurReason.trim()) { toast(S.prjToastReasonReq, "info"); return; }
    const idx = TAHAP.indexOf(tahapOf(mundurFor));
    if (idx <= 0) { setMundurFor(null); return; }
    const to = TAHAP[idx - 1];
    await update("projects", mundurFor.id, {
      tahap: to,
      tahapLog: [...(mundurFor.tahapLog ?? []), { from: tahapOf(mundurFor), to, date: todayISO(), by: "Anda", reason: mundurReason.trim() }],
    });
    log("menurunkan tahap", `${mundurFor.id} → ${to} (alasan: ${mundurReason.trim()})`, "Proyek");
    toast(S.prjToastPulled.replace("{a}", mundurFor.id).replace("{b}", to));
    setMundurFor(null);
    setMundurReason("");
  };

  const save = async () => {
    if (!form.vessel.trim() || !form.client.trim()) { toast(S.prjToastVesselClient, "info"); return; }
    if (!form.branch.trim()) { toast(S.prjToastBranchReq, "info"); return; }
    if (!branchOptions.includes(form.branch)) { toast(S.prjToastBranchUnknown, "info"); return; }
    const scopeItems = scopeRows
      .map((r) => ({
        service: r.service.trim(),
        ...(r.lokasi.trim() ? { lokasi: r.lokasi.trim() } : {}),
        ...(r.deskripsi.trim() ? { deskripsi: r.deskripsi.trim() } : {}),
      }))
      .filter((r) => r.service);
    if (scopeItems.length === 0) { toast(S.prjToastScopeMin, "info"); return; }
    if (!form.start || !form.end) { toast(S.prjToastDatesReq, "info"); return; }
    if (form.end < form.start) { toast(S.prjToastDateOrder, "info"); return; }
    const budget = Number(form.budget);
    if (!Number.isFinite(budget) || budget <= 0) { toast(S.prjToastBudget, "info"); return; }
    if (!form.manager) { toast(S.prjToastPm, "info"); return; }
    if (form.type === "New Build" && projects.some((p) => String(p.vessel ?? "").trim().toLowerCase() === form.vessel.trim().toLowerCase() && String(p.type) === "New Build")) {
      toast(S.prjToastDup, "info");
      return;
    }
    if (!vesselExists) {
      const loa = Number(form.vesselLoa);
      if (!Number.isFinite(loa) || loa <= 0) { toast(S.prjToastLoa, "info"); return; }
      if (!form.vesselType.trim()) { toast(S.prjToastVType, "info"); return; }
      const imoRaw = form.vesselImo.trim();
      if (!imoRaw || imoRaw === "-" || imoRaw.toUpperCase() === "IMO" || imoRaw.toUpperCase() === "IMO -") {
        toast(S.prjToastImo, "info");
        return;
      }
    }
    const code = nextProjectCode(form.type, form.start);
    try {
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
        toast(S.prjToastCreatedVessel.replace("{a}", created.id).replace("{b}", form.vesselImo.trim()));
      } else {
        toast(S.prjToastCreated.replace("{a}", created.id));
      }
      setForm(emptyForm);
      setScopeRows([{ service: "", lokasi: "", deskripsi: "" }]);
      setShowAdd(false);
    } catch {
      toast(S.prjToastSaveFail.replace("{a}", code), "info");
    }
  };

  return (
    <div>
      <PageHeader
        title={S.prjTitle}
        subtitle={S.prjSubtitle}
        icon={<Anchor className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-primary-gradient" onClick={() => { setForm(emptyForm); setScopeRows([{ service: "", lokasi: "", deskripsi: "" }]); setShowAdd(true); }}><Plus className="h-4 w-4" /> {S.prjNew}</button>
          </>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={modAlert.scrollTo} />}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.prjKpiTotal} value={String(projects.length)} hint={S.prjKpiTotalHint} icon={<Anchor className="h-5 w-5" />} chip="navy" spark={sparkProjects} />
        <KpiCard label={S.prjKpiActive} value={String(inProgress)} delta={S.prjKpiLate.replace("{n}", String(delayed))} deltaDirection="down" icon={<Clock className="h-5 w-5" />} chip="amber" spark={activeProjectTrend} />
        <KpiCard label={S.prjKpiContract} value={fmtMiliar(totalBudget)} delta={S.prjKpiContractHint} deltaDirection="up" icon={<Wallet className="h-5 w-5" />} chip="teal" spark={contractValueTrend} />
        <KpiCard label={S.prjKpiAvg} value={`${avgProgress}%`} delta={S.prjKpiAvgHint} deltaDirection="flat" icon={<TrendingUp className="h-5 w-5" />} chip="violet" spark={avgProgressTrend} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input
            className="input pl-9 w-full"
            placeholder={S.searchProjectPh}
            aria-label={S.searchProjectAria}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <FilterPopover
          activeCount={[
            filter !== "Semua",
            tahapFilter !== "Semua",
            branchFilter !== "Semua",
            statusFilter !== "Semua",
            prioritasFilter !== "Semua",
            pmFilter !== "Semua",
          ].filter(Boolean).length}
          initial={{ type: filter, tahap: tahapFilter, branch: branchFilter, status: statusFilter, prioritas: prioritasFilter, pm: pmFilter }}
          onReset={resetFilters}
          onApply={(d) => {
            setFilter(d.type);
            setTahapFilter(d.tahap);
            setBranchFilter(d.branch);
            setStatusFilter(d.status);
            setPrioritasFilter(d.prioritas);
            setPmFilter(d.pm);
          }}
        >
          {(draft, setDraft) => (
            <div className="space-y-3">
              <div className="flex gap-1">
                {filters.map((f) => (
                  <button
                    key={f}
                    onClick={() => setDraft({ ...draft, type: f })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      draft.type === f ? "bg-navy-700 text-white" : "bg-white border border-steel-200 text-steel-600 hover:bg-steel-100"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <Field label={S.prjFieldTahap}>
                <select className="input w-full py-1.5 text-sm" aria-label={S.prjFilterTahapAria} value={draft.tahap} onChange={(e) => setDraft({ ...draft, tahap: e.target.value })}>
                  <option value="Semua">{S.prjAllTahap}</option>
                  {TAHAP.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label={S.branchLabel}>
                <select className="input w-full py-1.5 text-sm" aria-label={S.prjFilterCabangAria} value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })}>
                  <option value="Semua">{S.prjAllCabang}</option>
                  {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label={S.statusLabel}>
                <select className="input w-full py-1.5 text-sm" aria-label={S.prjFilterStatusAria} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="Semua">{S.prjAllStatus}</option>
                  {statusOptions.filter((s) => s !== "Semua").map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label={S.prjFieldPrioritas}>
                <select className="input w-full py-1.5 text-sm" aria-label={S.prjFilterPrioritasAria} value={draft.prioritas} onChange={(e) => setDraft({ ...draft, prioritas: e.target.value })}>
                  <option value="Semua">{S.prjAllPrioritas}</option>
                  {PRIORITAS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label={S.prjFieldPm}>
                <select className="input w-full py-1.5 text-sm" aria-label={S.prjFilterPmAria} value={draft.pm} onChange={(e) => setDraft({ ...draft, pm: e.target.value })}>
                  <option value="Semua">{S.prjAllPm}</option>
                  {pmOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
          )}
        </FilterPopover>
        <span className="ml-auto text-xs text-steel-400">{S.prjCount.replace("{n}", String(list.length))}</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <SortTh label={S.colProject} sortKey="vessel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.colClient} sortKey="client" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.colType} sortKey="type" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.prjFieldTahap} sortKey="tahap" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.prjFieldPrioritas} sortKey="prioritas" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.statusLabel} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.progLabel} sortKey="progress" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.colBudget} sortKey="budget" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.colActual} sortKey="actual" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.colPm} sortKey="manager" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {pager.slice(sorted).map((p) => {
                const tahapIdx = TAHAP.indexOf(tahapOf(p));
                return (
                  <tr
                    key={p.id}
                    id={notifRowId(String(p.id))}
                    className={`cursor-pointer transition-colors hover:bg-surface ${modAlert.highlight.has(String(p.id)) ? "notif-hl" : ""}`}
                    onClick={() => navigate(`/proyek/${p.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/proyek/${p.id}`); }}
                    tabIndex={0}
                    title={S.prjOpenRow.replace("{a}", p.id)}
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
                           title={S.prjStepBackTitle}
                          disabled={tahapIdx <= 0}
                          onClick={(e) => { e.stopPropagation(); setMundurFor(p); }}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-steel-400 hover:bg-steel-100 hover:text-navy-700 disabled:opacity-30 disabled:hover:bg-transparent"
                           title={S.prjStepNextTitle}
                          disabled={tahapIdx < 0 || tahapIdx >= TAHAP.length - 1}
                          onClick={(e) => { e.stopPropagation(); majuTahap(p); }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={prioritasTone[canonPrioritas(p.prioritas)] ?? "blue"}>{canonPrioritas(p.prioritas)}</Badge>
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
          {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">{S.prjEmpty}</p>}
          {pager.bar}
        </div>
      </Card>


      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={S.prjNew}
        subtitle={S.prjModalSub}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>{S.cancelBtn}</button>
            <button className="btn-primary" onClick={save}>{S.prjSave}</button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-steel-500">
            {S.prjCodeAuto}<span className="font-mono font-semibold text-navy-900">{codePreview}</span>
          </p>
          <FormGrid>
            <Field label={S.prjVesselName}>
              <input className="input" list="vessel-list" placeholder={S.prjVesselPh} value={form.vessel} onChange={(e) => setF("vessel", e.target.value)} />
              <datalist id="vessel-list">
                {data.vessels.map((v) => <option key={v.id} value={v.name} />)}
              </datalist>
            </Field>
            <Field label={S.colClient}>
              <div className="flex gap-2">
                <select className="input flex-1" value={form.client} onChange={(e) => {
                  if (e.target.value === "__baru__") { setShowClientModal(true); return; }
                  setF("client", e.target.value);
                }}>
                  <option value="">{S.prjPickClient}</option>
                  {data.clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  <option value="__baru__">{S.prjAddClient}</option>
                </select>
              </div>
            </Field>
            <Field label={S.prjType}>
              <select className="input" value={form.type} onChange={(e) => setF("type", e.target.value)}>
                <option>New Build</option>
                <option>Repair</option>
                <option>Retrofit</option>
              </select>
            </Field>
            <Field label={S.prjInitStage}>
              <select className="input" value={form.tahap} onChange={(e) => setF("tahap", e.target.value)}>
                {TAHAP.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.prjStatusField}>
              <select className="input" value={form.status} onChange={(e) => setF("status", e.target.value)}>
                <option>Dalam Proses</option>
                <option>Sedang Berjalan</option>
                <option>Tertunda</option>
              </select>
            </Field>
            <Field label={S.prjFieldPrioritas}>
              <select className="input" value={form.prioritas} onChange={(e) => setF("prioritas", e.target.value)}>
                {PRIORITAS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={S.branchLabel}>
              <select className="input" value={form.branch} onChange={(e) => setF("branch", e.target.value)}>
                {branchOptions.map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label={S.prjFieldPm}>
              <select className="input" value={form.manager} onChange={(e) => setF("manager", e.target.value)}>
                <option value="">{S.prjPickPm}</option>
                {data.employees.filter((e) => e.dept === "Proyek" || e.role.includes("Manager")).map((e) => (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ))}
              </select>
            </Field>
            <Field label={S.prjStart}><input type="date" className="input" value={form.start} onChange={(e) => setF("start", e.target.value)} /></Field>
            <Field label={S.prjEnd}><input type="date" className="input" value={form.end} onChange={(e) => setF("end", e.target.value)} /></Field>
          </FormGrid>
          {!vesselExists && form.vessel.trim() && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-800">{S.prjNewVesselNote}</p>
              <FormGrid>
                <Field label={S.prjLoa}><input type="number" min={0} step={0.1} className="input" value={form.vesselLoa} onChange={(e) => setF("vesselLoa", e.target.value)} placeholder={S.prjLoaPh} /></Field>
                <Field label={S.prjVesselType}><input className="input" value={form.vesselType} onChange={(e) => setF("vesselType", e.target.value)} placeholder={S.prjVesselTypePh} /></Field>
              </FormGrid>
              <div className="mt-2">
                <Field label={S.prjImo} hint={S.prjImoHint}>
                  <input className="input font-mono" value={form.vesselImo} onChange={(e) => setF("vesselImo", e.target.value)} placeholder={S.prjImoPh} />
                </Field>
              </div>
            </div>
          )}
          <Field label={S.prjBudget}>
            <input type="number" className="input" min={0} value={form.budget} onChange={(e) => setF("budget", e.target.value)} placeholder={S.prjBudgetPh} />
          </Field>
          <div className="rounded-xl border border-steel-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-navy-900">{S.prjScope}</p>
              <button
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => setScopeRows((s) => [...s, { service: "", lokasi: "", deskripsi: "" }])}
              >
                {S.prjAddScope}
              </button>
            </div>
            <div className="space-y-2">
              {scopeRows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg bg-surface p-2 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <Field label={S.prjScopeType}>
                      <input className="input" value={r.service} onChange={(e) => setScopeRows((s) => s.map((x, i) => (i === idx ? { ...x, service: e.target.value } : x)))} placeholder={S.prjScopeTypePh} />
                    </Field>
                  </div>
                  <div className="sm:col-span-3">
                    <Field label={S.prjScopeLoc}>
                      <input className="input" value={r.lokasi} onChange={(e) => setScopeRows((s) => s.map((x, i) => (i === idx ? { ...x, lokasi: e.target.value } : x)))} placeholder={S.prjScopeLocPh} />
                    </Field>
                  </div>
                  <div className="sm:col-span-4">
                    <Field label={S.prjScopeDesc}>
                      <input className="input" value={r.deskripsi} onChange={(e) => setScopeRows((s) => s.map((x, i) => (i === idx ? { ...x, deskripsi: e.target.value } : x)))} placeholder={S.prjScopeDescPh} />
                    </Field>
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <button
                      className="btn-secondary w-full px-2 py-2 text-xs text-rose-600"
                      aria-label={S.prjDelScopeAria.replace("{n}", String(idx + 1))}
                      disabled={scopeRows.length <= 1}
                      onClick={() => setScopeRows((s) => s.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ClientModal
        open={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSaved={(name) => setF("client", name)}
      />

      <Modal
        open={mundurFor !== null}
        onClose={() => { setMundurFor(null); setMundurReason(""); }}
        title={S.prjPullTitle.replace("{a}", mundurFor?.vessel ?? "")}
        subtitle={mundurFor ? S.prjPullSub.replace("{a}", mundurFor.id).replace("{b}", tahapOf(mundurFor)).replace("{c}", TAHAP[TAHAP.indexOf(tahapOf(mundurFor)) - 1] ?? "-") : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setMundurFor(null); setMundurReason(""); }}>{S.cancelBtn}</button>
            <button className="btn-primary" onClick={confirmMundur}>{S.prjPullBtn}</button>
          </>
        }
      >
        <Field label={S.prjPullReason} hint={S.prjPullReasonHint}>
          <textarea className="input" rows={3} value={mundurReason} onChange={(e) => setMundurReason(e.target.value)} placeholder={S.prjPullReasonPh} />
        </Field>
      </Modal>
    </div>
  );
}
