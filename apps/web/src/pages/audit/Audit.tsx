import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, History, Search } from "lucide-react";
import { Badge, Card, EmptyState, Field, KpiCard, PageHeader, SortTh, toggleSort, sortRows, toast, usePager } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { FilterPopover } from "../../components/FilterPopover";
import { useStore } from "../../data/store";
import { apiFetch, isBackendConfigured } from "../../services/http";
import { useT } from "../../i18n/LanguageContext";
import { n_misc } from "../../i18n/n_misc";
import { exportExcel } from "../../utils/export";

/** Ambil YYYY-MM-DD dari string waktu bila bisa diparse; abaikan "baru saja" dan teks relatif. */
function toISODateOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s === "-" || s.toLowerCase() === "baru saja") return null;
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

interface ServerAuditRow {
  id?: unknown;
  actor?: unknown;
  action?: unknown;
  table_name?: unknown;
  row_id?: unknown;
  created_at?: unknown;
}

interface StoreItemLike {
  id: string;
  time?: unknown;
  actor?: unknown;
  action?: unknown;
  target?: unknown;
  module?: unknown;
}

export default function Audit() {
  const { data } = useStore();
  const { t, locale } = useT();
  const S = n_misc[locale];
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get("actor") ?? "");
  const [modul, setModul] = useState("SEMUA");
  const [tanggal, setTanggal] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sumber, setSumber] = useState(() => (params.get("actor") && isBackendConfigured() ? "Server" : "Perangkat"));
  const [serverRows, setServerRows] = useState<StoreItemLike[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const remote = isBackendConfigured();

  useEffect(() => {
    if (!remote || sumber !== "Server") return;
    let cancelled = false;
    setServerLoading(true);
    void (async () => {
      try {
        const res = await apiFetch<{ rows: ServerAuditRow[] } | ServerAuditRow[]>("/api/audit?limit=200");
        const list = Array.isArray(res) ? res : (res.rows ?? []);
        if (!cancelled) {
          setServerRows(
            list.map((r) => ({
              id: String(r.id ?? ""),
              time: String(r.created_at ?? "-"),
              actor: String(r.actor ?? "-"),
              action: String(r.action ?? "-"),
              target: String(r.row_id ?? "-"),
              module: String(r.table_name ?? "-"),
            })),
          );
        }
      } catch {
        if (!cancelled) setServerRows([]);
      } finally {
        if (!cancelled) setServerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [remote, sumber]);

  const base = sumber === "Server" && remote ? serverRows : (data.activities ?? []);

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const a of base ?? []) {
      if (a.module) set.add(String(a.module));
    }
    return [...set].sort();
  }, [base]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (base ?? []).filter((a) => {
      if (modul !== "SEMUA" && String(a.module ?? "") !== modul) return false;
      if (tanggal) {
        const iso = toISODateOrNull(a.time);
        if (iso !== tanggal) return false;
      }
      if (!query) return true;
      const hay = `${a.actor ?? ""} ${a.action ?? ""} ${a.target ?? ""} ${a.module ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [base, q, modul, tanggal]);
  const sortedAudits = useMemo(() => sortRows(rows, sort, (a, key) =>
    key === "waktu" ? String(a.time ?? "") : key === "aktor" ? String(a.actor ?? "") : key === "aksi" ? String(a.action ?? "") : key === "target" ? String(a.target ?? "") : String(a.module ?? "")
  ), [rows, sort]);
  const auditPager = usePager(rows.length);
  useEffect(() => {
    auditPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, modul, tanggal, sumber]);

  const actors = useMemo(() => {
    const set = new Set<string>();
    for (const a of base ?? []) {
      if (a.actor) set.add(String(a.actor));
    }
    return set.size;
  }, [base]);

  const doExport = () => {
    const head = ["Waktu", "Aktor", "Aksi", "Target", "Modul"];
    const body = rows.map((a) => [
      String(a.time ?? "-"),
      String(a.actor ?? "-"),
      String(a.action ?? "-"),
      String(a.target ?? "-"),
      String(a.module ?? "-"),
    ]);
    void exportExcel([head, ...body], "jejak-audit", "Audit").then(() =>
      toast(S.tAuditExported)
    );
  };

  return (
    <div>
      <PageHeader
        title={t.nav.audit}
        subtitle={sumber === "Server" && remote ? S.auSubtitleServer : S.auSubtitleLocal}
        icon={<History className="h-5 w-5" />}
        actions={
          <button className="btn-secondary text-xs" onClick={doExport}>
            <Download className="h-4 w-4" /> {S.exportExcelBtn}
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label={S.auTotalTrails} value={String((base ?? []).length)} hint={S.auTotalHint} chip="navy" icon={<History className="h-5 w-5" />} />
        <KpiCard label={S.auFilterResult} value={String(rows.length)} hint={S.auFilterHint} chip="teal" icon={<History className="h-5 w-5" />} />
        <KpiCard label={S.auUniqueActors} value={String(actors)} hint={S.auActorsHint} chip="violet" icon={<History className="h-5 w-5" />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input
            className="input pl-9 w-full"
            placeholder={S.auSearchPh}
            aria-label={S.auSearchAria}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <FilterPopover
          activeCount={[modul !== "SEMUA", tanggal !== "", sumber !== "Perangkat"].filter(Boolean).length}
          initial={{ modul, tanggal, sumber }}
          onReset={() => { setQ(""); setModul("SEMUA"); setTanggal(""); setSumber("Perangkat"); }}
          onApply={(d) => { setModul(d.modul); setTanggal(d.tanggal); setSumber(d.sumber); }}
        >
          {(draft, setDraft) => (
            <div className="space-y-3">
              <Field label={S.auModuleLabel}>
                <select className="input w-full" value={draft.modul} onChange={(e) => setDraft({ ...draft, modul: e.target.value })}>
                  <option value="SEMUA">{S.auAllModules}</option>
                  {modules.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label={S.auDateLabel} hint={S.auDateHint}>
                <input
                  type="date"
                  className="input w-full"
                  value={draft.tanggal}
                  onChange={(e) => setDraft({ ...draft, tanggal: e.target.value })}
                />
              </Field>
              {remote && (
                <Field label={S.auSourceLabel}>
                  <select className="input w-full" value={draft.sumber} onChange={(e) => setDraft({ ...draft, sumber: e.target.value })}>
                    <option value="Perangkat">Perangkat</option>
                    <option value="Server">Server</option>
                  </select>
                </Field>
              )}
            </div>
          )}
        </FilterPopover>
      </div>

      <Card>
        {serverLoading && sumber === "Server" && (
          <p className="px-5 pt-4 text-xs text-steel-400">{S.auLoadingServer}</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-steel-100 text-left text-xs uppercase tracking-wide text-steel-400">
                <SortTh label={S.auSortTime} sortKey="waktu" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.auSortActor} sortKey="aktor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.auSortAction} sortKey="aksi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.auSortTarget} sortKey="target" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.auModuleLabel} sortKey="modul" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {auditPager.slice(sortedAudits).map((a) => (
                <tr key={String(a.id)} className="hover:bg-surface">
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-steel-500">{String(a.time ?? "-")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-navy-900">{String(a.actor ?? "-")}</td>
                  <td className="px-3 py-2.5 text-steel-700">{String(a.action ?? "-")}</td>
                  <td className="px-3 py-2.5 font-medium text-navy-800">{String(a.target ?? "-")}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone="navy">{String(a.module ?? "-")}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title={S.auEmptyTitle}
              subtitle={S.auEmptySub}
            />
          )}
          {auditPager.bar}
        </div>
      </Card>
    </div>
  );
}
