import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, History } from "lucide-react";
import { Badge, Card, EmptyState, Field, KpiCard, PageHeader, SortTh, toggleSort, sortRows, toast, usePager, useServerPager, AsyncButton, SearchBox, rowMatches } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { FilterPopover } from "../../components/FilterPopover";
import { useStore } from "../../data/store";
import { apiFetch, isBackendConfigured } from "../../services/http";
import { useT } from "../../i18n/LanguageContext";
import { n_misc } from "../../i18n/n_misc";
import { exportExcel } from "../../utils/export";
import { fmtTanggal } from "../../utils/format";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";

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
  [key: string]: unknown;
  time?: unknown;
  actor?: unknown;
  action?: unknown;
  target?: unknown;
  module?: unknown;
  createdAt?: unknown;
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
  const remote = isBackendConfigured();
  const isServer = remote && sumber === "Server";

  /* Debounce kata kunci untuk mode Server (satu request per jeda ketik). */
  const [qDeb, setQDeb] = useState(q);
  useEffect(() => {
    const t = window.setTimeout(() => setQDeb(q), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  function mapAuditRow(r: ServerAuditRow): StoreItemLike {
    return {
      id: String(r.id ?? ""),
      time: String(r.created_at ?? "-"),
      actor: String(r.actor ?? "-"),
      action: String(r.action ?? "-"),
      target: String(r.row_id ?? "-"),
      module: String(r.table_name ?? "-"),
      /* Jejak audit tidak pernah diedit, jadi `created_at` miliknya sendiri
         yang jadi "dibuat" - tanpa ini kolom kosong di mode Server. */
      createdAt: String(r.created_at ?? ""),
    };
  }

  function auditParams(page: number, size: number): string {
    const sp = new URLSearchParams();
    sp.set("limit", String(size));
    sp.set("offset", String((page - 1) * size));
    if (modul !== "SEMUA") sp.set("table", modul);
    if (qDeb.trim()) sp.set("q", qDeb.trim());
    if (tanggal) sp.set("date", tanggal);
    return sp.toString();
  }

  /* Mode Server: filter (modul/tanggal/kata kunci) + paging dikerjakan backend
     (total akurat, tak lagi mentok 200 baris). Mode Perangkat: seperti semula. */
  const auditServer = useServerPager<StoreItemLike>(async (page, size) => {
    const res = await apiFetch<{ rows: ServerAuditRow[]; total?: number } | ServerAuditRow[]>(`/api/audit?${auditParams(page, size)}`);
    const list = Array.isArray(res) ? res : (res.rows ?? []);
    const total = Array.isArray(res) ? list.length : (typeof res.total === "number" ? res.total : list.length);
    const rows = list.map(mapAuditRow);
    return { rows, total, page, size, pages: Math.max(1, Math.ceil(total / size)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, JSON.stringify([modul, tanggal, qDeb.trim(), sumber]), 25, isServer);

  const localBase = data.activities ?? [];

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const a of localBase ?? []) {
      if (a.module) set.add(String(a.module));
    }
    for (const m of ["Equipment", "Inventori", "Subkontraktor", "QC", "Proyek"]) set.add(m);
    return [...set].sort();
  }, [localBase]);

  const localRows = useMemo(() => {
    return (localBase ?? []).filter((a) => {
      if (modul !== "SEMUA" && String(a.module ?? "") !== modul) return false;
      if (tanggal) {
        const iso = toISODateOrNull(a.time);
        if (iso !== tanggal) return false;
      }
      return rowMatches(a, q, ["actor", "action", "target", "module"]);
    });
  }, [localBase, q, modul, tanggal]);
  /* Mode Server sudah terfilter dari backend; mode Perangkat disaring lokal. */
  const displayRows = isServer ? auditServer.rows : localRows;
  const sortedAudits = useMemo(() => sortRows(displayRows, sort, (a, key) =>
    key === "waktu" ? String(a.time ?? "") : key === "aktor" ? String(a.actor ?? "") : key === "aksi" ? String(a.action ?? "") : key === "target" ? String(a.target ?? "") : key === "createdAt" ? createdAtOf(a) ?? "" : key === "updatedAt" ? lastTouchedAt(a) ?? "" : String(a.module ?? "")
  ), [displayRows, sort]);
  const auditPager = usePager(localRows.length);
  useEffect(() => {
    auditPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, modul, tanggal, sumber]);

  const totalTrails = isServer ? auditServer.total : (localBase ?? []).length;
  const filterCount = isServer ? auditServer.total : localRows.length;

  const actors = useMemo(() => {
    const set = new Set<string>();
    for (const a of displayRows ?? []) {
      if (a.actor) set.add(String(a.actor));
    }
    return set.size;
  }, [displayRows]);

  const doExport = async () => {
    const head = ["Waktu", "Aktor", "Aksi", "Target", "Modul"];
    const toRow = (a: StoreItemLike): (string | number)[] => [
      String(a.time ?? "-"),
      String(a.actor ?? "-"),
      String(a.action ?? "-"),
      String(a.target ?? "-"),
      String(a.module ?? "-"),
    ];
    try {
      let body: (string | number)[][];
      if (isServer) {
        /* Ekspor SELURUH hasil filter, bukan cuma halaman tampil (loop 1000). */
        const all: StoreItemLike[] = [];
        const size = 1000;
        for (;;) {
          const params = new URLSearchParams();
          params.set("limit", String(size));
          params.set("offset", String(all.length));
          if (modul !== "SEMUA") params.set("table", modul);
          if (qDeb.trim()) params.set("q", qDeb.trim());
          if (tanggal) params.set("date", tanggal);
          const res = await apiFetch<{ rows: ServerAuditRow[]; total?: number } | ServerAuditRow[]>(`/api/audit?${params.toString()}`);
          const list = Array.isArray(res) ? res : (res.rows ?? []);
          if (list.length === 0) break;
          const total = Array.isArray(res) ? list.length : (typeof res.total === "number" ? res.total : all.length + list.length);
          for (const r of list) all.push(mapAuditRow(r));
          if (all.length >= total) break;
        }
        body = all.map(toRow);
      } else {
        body = localRows.map(toRow);
      }
      await exportExcel([head, ...body], "jejak-audit", "Audit");
      toast(S.tAuditExported);
    } catch {
      toast(locale === "en" ? "Export failed" : "Ekspor gagal", "info");
    }
  };

  return (
    <div>
      <PageHeader
        title={t.nav.audit}
        subtitle={sumber === "Server" && remote ? S.auSubtitleServer : S.auSubtitleLocal}
        icon={<History className="h-5 w-5" />}
        actions={
          <AsyncButton className="btn-secondary text-xs" onAction={doExport}>
            <Download className="h-4 w-4" /> {S.exportExcelBtn}
          </AsyncButton>
        }
      />

      <p className="mb-4 text-xs text-steel-500">Mencatat create/edit/delete/gagal-hapus. Aksi localStorage (skenario/template) tetap dicatat.</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label={S.auTotalTrails} value={String(totalTrails)} hint={S.auTotalHint} chip="navy" icon={<History className="h-5 w-5" />} />
        <KpiCard label={S.auFilterResult} value={String(filterCount)} hint={S.auFilterHint} chip="teal" icon={<History className="h-5 w-5" />} />
        <KpiCard label={S.auUniqueActors} value={String(actors)} hint={S.auActorsHint} chip="violet" icon={<History className="h-5 w-5" />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={S.auSearchPh}
          ariaLabel={S.auSearchAria}
          className="min-w-52 flex-1 sm:max-w-xs"
        />
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
        {isServer && auditServer.loading && (
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
                <SortTh label={S.colCreated} sortKey="createdAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.colUpdated} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {(isServer ? sortedAudits : auditPager.slice(sortedAudits)).map((a) => (
                <tr key={String(a.id)} className="hover:bg-surface">
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-steel-500">{String(a.time ?? "-")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-navy-900">{String(a.actor ?? "-")}</td>
                  <td className="px-3 py-2.5 text-steel-700">{String(a.action ?? "-")}</td>
                  <td className="px-3 py-2.5 font-medium text-navy-800">{String(a.target ?? "-")}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone="navy">{String(a.module ?? "-")}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-steel-600">{createdAtOf(a) !== null ? fmtTanggal(createdAtOf(a)) : <span className="text-steel-400">-</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-steel-600">{lastTouchedAt(a) !== null ? fmtTanggal(lastTouchedAt(a)) : <span className="text-steel-400">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(isServer ? (auditServer.total === 0 && !auditServer.loading) : localRows.length === 0) && (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title={S.auEmptyTitle}
              subtitle={S.auEmptySub}
            />
          )}
          {isServer ? auditServer.bar : auditPager.bar}
        </div>
      </Card>
    </div>
  );
}
