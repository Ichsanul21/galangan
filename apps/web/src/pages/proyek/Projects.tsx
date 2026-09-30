import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Plus, Search, Anchor, Wallet, TrendingUp, Clock } from "lucide-react";
import {
  Card,
  PageHeader,
  StatusBadge,
  ProgressBar,
  Badge,
  KpiCard,
  Field,
  SortTh,
  toggleSort,
  sortRows,
  usePager,
  ConfirmModal,
  toast,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import { findUsages } from "../../utils/usages";
import type { StoreItem } from "../../data/store";
import { useT } from "../../i18n/LanguageContext";
import { n_prj } from "../../i18n/n_prj";
import { fmtMiliar, sparkProjects, activeProjectTrend, contractValueTrend, avgProgressTrend } from "../../data";
import { todayISO } from "../../utils/format";
import { canonPrioritas } from "../../utils/scope";
import ProjectAddModal from "../../components/ProjectAddModal";
import { FilterPopover } from "../../components/FilterPopover";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";

export const TAHAP = ["Inquiry", "Quotation", "Kontrak", "Desain", "Produksi", "Trial", "Handover"];
export const PRIORITAS = ["Rendah", "Sedang", "Tinggi"];

export function tahapOf(p: StoreItem): string {
  return TAHAP.includes(p.tahap) ? p.tahap : "Produksi";
}

// Kontrak wajib terisi sebelum proyek hasil konversi bisa jalan: tahap awal
// (Inquiry/Quotation/Kontrak) dikunci bila belum ada kontrak untuk quotationId itu.
export function hasContract(p: StoreItem, contracts: StoreItem[]): boolean {
  if (!p.quotationId) return true;
  return contracts.some(
    (c) => String(c.quotationId ?? "") === String(p.quotationId) || String(c.projectId ?? "") === String(p.id)
  );
}

export function isOverdue(p: StoreItem, today: string): boolean {
  if (!p.end || p.end === "-") return false;
  if (String(p.status) === "Selesai") return false;
  if (Number(p.progress || 0) >= 100) return false;
  return String(p.end) < today;
}

const filters = ["Semua", "New Build", "Repair", "Retrofit"];
/* Label tampilan tipe proyek (ID); value backend tetap EN. */
const TYPE_ID: Record<string, string> = { "New Build": "Bangun Baru", Repair: "Reparasi", Retrofit: "Retrofit / Modifikasi" };
const statusOptions = ["Semua", "Sedang Berjalan", "Tertunda", "Batal", "Terlambat", "Selesai"];
const branchOptions = ["Samarinda", "Balikpapan", "Banjarmasin"];
const prioritasTone: Record<string, "gray" | "blue" | "amber" | "red"> = {
  Rendah: "gray",
  Sedang: "blue",
  Tinggi: "amber",
};

export default function Projects() {
  const { locale } = useT();
  const S = n_prj[locale];
  const { data, add, update, remove, inBranch, resync } = useStore();
  const modAlert = useModuleAlert("proyek");
  const flash = useNotifFlash();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
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
  // Hapus proyek via ConfirmModal + daftar pemakai (blokir bila dirujuk PO/invoice/WBS).
  const [delProject, setDelProject] = useState<StoreItem | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => { void resync().catch(() => undefined); }, [resync]);

  // Alur dari Dashboard: /proyek?create=1 langsung buka form tambah proyek.
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowAdd(true);
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Edit tahap HANYA via detail (stepper + modal alasan di ProjectDetail).

  // Terlambat otomatis dari due (menggantikan flag manual): proyek berjalan yang
  // lewat tanggal selesai & progres < 100% otomatis berstatus Terlambat.
  useEffect(() => {
    const today = todayISO();
    for (const p of projects) {
      if (
        (p.status === "Dalam Proses" || p.status === "Sedang Berjalan" || p.status === "Tertunda") &&
        isOverdue(p, today)
      ) {
        void update("projects", p.id, { status: "Terlambat" }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

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

  const pickNotif = (rowId: string) => {
    const idx = sorted.findIndex((r) => String(r.id) === rowId);
    if (idx >= 0) { flash.pick(rowId, idx, pager.go, pager.size); return; }
    flash.pick(rowId, -1, () => {}, 100);
  };

  return (
    <div>
      <PageHeader
        title={S.prjTitle}
        subtitle={S.prjSubtitle}
        icon={<Anchor className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> {S.prjNew}</button>
          </>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

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
              <div className="flex flex-wrap gap-1">
                {filters.map((f) => (
                  <button
                    key={f}
                    onClick={() => setDraft({ ...draft, type: f })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      draft.type === f ? "bg-navy-700 text-white" : "bg-white border border-steel-200 text-steel-600 hover:bg-steel-100"
                    }`}
                  >
                    {f === "Semua" ? "Semua tipe" : TYPE_ID[f] ?? f}
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
                <th className="th">{S.actionTh}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {pager.slice(sorted).map((p) => {
                const tahapIdx = TAHAP.indexOf(tahapOf(p));
                return (
                  <tr
                    key={p.id}
                    id={notifRowId(String(p.id))}
                    className={`cursor-pointer transition-colors hover:bg-surface ${flash.flashId === String(p.id) ? "notif-hl notif-flash" : (notified.has(String(p.id)) ? "notif-hl" : "")}`}
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
                        {TYPE_ID[String(p.type)] ?? p.type}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1" title="Edit hanya di detail">
                        <Badge tone="navy">{tahapOf(p)}</Badge>
                        <span className="text-[11px] text-steel-400">{tahapIdx + 1}/{TAHAP.length}</span>
                        <span className="cursor-not-allowed text-[11px] text-steel-400" title="Edit hanya di detail" aria-disabled="true">Edit hanya di detail</span>
                        <Link
                          to={`/proyek/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1 whitespace-nowrap text-xs font-semibold text-ocean-600 hover:underline"
                        >
                          {locale === "en" ? "Manage in detail" : "Kelola di detail"}
                        </Link>
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
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-xs font-semibold text-rose-600 hover:underline"
                        aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${p.id}`}
                        onClick={() => setDelProject(p)}
                      >
                        {locale === "en" ? "Delete" : "Hapus"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">{S.prjEmpty}</p>}
          {pager.bar}
        </div>
      </Card>


      <ProjectAddModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        S={S}
        projects={projects}
        vessels={data.vessels}
        clients={data.clients}
        employees={data.employees}
        add={add}
      />

      <ConfirmModal
        open={delProject !== null}
        title={delProject ? (locale === "en" ? `Delete project ${delProject.id}?` : `Hapus proyek ${delProject.id}?`) : ""}
        desc={(() => {
          if (!delProject) return "";
          const used = findUsages(data, "projects", String(delProject.id));
          const base = locale === "en"
            ? `Project ${delProject.id} (${String(delProject.vessel)}) will be permanently deleted.`
            : `Proyek ${delProject.id} (${String(delProject.vessel)}) akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Referenced in: ${used.join(", ")}. Deletion blocked.` : `${base} Dirujuk di: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delProject && findUsages(data, "projects", String(delProject.id)).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : (locale === "en" ? "Delete" : "Hapus")}
        danger
        confirmDisabled={delProject ? findUsages(data, "projects", String(delProject.id)).length > 0 : false}
        onCancel={() => setDelProject(null)}
        onConfirm={async () => {
          if (!delProject) return;
          const usedBy = findUsages(data, "projects", String(delProject.id));
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked - referenced in: ${usedBy.join(", ")}` : `Hapus diblokir - dirujuk di: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("projects", String(delProject.id));
            toast(locale === "en" ? `Project ${delProject.id} deleted` : `Proyek ${delProject.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : (locale === "en" ? "Delete failed" : "Gagal menghapus"), "info"); }
          setDelProject(null);
        }}
      />
    </div>
  );
}
