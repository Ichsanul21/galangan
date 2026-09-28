import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Download } from "lucide-react";
import {
  Badge,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  KpiCard,
  PageHeader,
  SortTh,
  StatusBadge,
  Tabs,
  sortRows,
  toast,
  toggleSort,
  usePager,
  NumInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { FilterPopover } from "../../components/FilterPopover";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtJumlah, fmtTanggal, todayISO } from "../../utils/format";
import { useT } from "../../i18n/LanguageContext";
import { n_misc } from "../../i18n/n_misc";
import { exportExcel } from "../../utils/export";

const SHIFTS = ["Pagi", "Siang", "Malam"];
const STATUS = ["Hadir", "Izin", "Sakit", "Cuti", "Alpa"];

interface CatatRow {
  status: string;
  checkIn: string;
  checkOut: string;
  overtime: string;
}

const defaultRow = (): CatatRow => ({ status: "Hadir", checkIn: "08:00", checkOut: "17:00", overtime: "0" });

/* StoreItem ber-index-signature sehingga tidak memenuhi constraint generik inBranch;
   intersection ini mempertahankan field sekaligus memuaskan constraint. */
type Branchable = StoreItem & { branch?: string };

function isLate(checkIn: string): boolean {
  return !!checkIn && checkIn > "08:00";
}

/* Persetujuan lembur: baris lembur>0 default "Diajukan"; Payroll hanya menghitung yang "Disetujui". */
function otStatusOf(a: StoreItem): string {
  const raw = String(a.otStatus ?? "").trim();
  if (raw) return raw;
  return Number(a.overtime || 0) > 0 ? "Diajukan" : "-";
}

export default function Absensi() {
  const { data, add, update, log, branch, setBranch, inBranch } = useStore();
  const { locale } = useT();
  const S = n_misc[locale];
  const [tab, setTab] = useState("Catat");

  /* ---------- catat ---------- */
  const [date, setDate] = useState(todayISO());
  const [shift, setShift] = useState("Pagi");
  const [rows, setRows] = useState<Record<string, CatatRow>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dupeCount, setDupeCount] = useState(0);

  /* ---------- rekap ---------- */
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  const branchCities = useMemo(() => data.branches.map((b) => String(b.city)), [data.branches]);
  const activeEmps = useMemo(
    () => inBranch(data.employees as Branchable[]).filter((e) => e.status === "Aktif"),
    [data.employees, inBranch],
  );

  const rowFor = (id: string): CatatRow => rows[id] ?? defaultRow();
  const setRow = (id: string, patch: Partial<CatatRow>) =>
    setRows((prev) => ({ ...prev, [id]: { ...rowFor(id), ...patch } }));

  const markAllPresent = () => {
    const next: Record<string, CatatRow> = {};
    activeEmps.forEach((e) => {
      next[e.id] = defaultRow();
    });
    setRows(next);
    toast(S.tMarkedPresent.replace("{n}", String(activeEmps.length)));
  };

  const validateRows = (): boolean => {
    for (const e of activeEmps) {
      const r = rowFor(e.id);
      if (r.status === "Hadir" && (!r.checkIn || !r.checkOut)) {
        toast(S.tTimeRequired.replace("{n}", String(e.name)), "info");
        return false;
      }
      const ot = Number(r.overtime || 0);
      if (r.status === "Hadir" && (Number.isNaN(ot) || ot < 0 || ot > 8)) {
        toast(S.tOvertimeRange.replace("{n}", String(e.name)), "info");
        return false;
      }
    }
    return true;
  };

  const persist = async (overwrite: boolean) => {
    let created = 0;
    let updated = 0;
    for (const e of activeEmps) {
      try {
        const r = rowFor(e.id);
        const ot = r.status === "Hadir" ? Number(r.overtime || 0) : 0;
        const payload = {
          employeeId: e.id,
          date,
          shift,
          status: r.status,
          checkIn: r.status === "Hadir" ? r.checkIn : "",
          checkOut: r.status === "Hadir" ? r.checkOut : "",
          overtime: ot,
          branch: String(e.branch ?? ""),
        };
        const existing = data.attendance.find((a) => a.employeeId === e.id && a.date === date && a.shift === shift);
        if (existing) {
          if (overwrite) {
            await update("attendance", existing.id, {
              ...payload,
              otStatus: ot > 0 ? String(existing.otStatus ?? "") || "Diajukan" : "",
            });
            updated += 1;
          }
        } else {
          await add("attendance", { ...payload, otStatus: ot > 0 ? "Diajukan" : "" }, undefined);
          created += 1;
        }
      } catch (err) {
        toast(S.tSaveFailed.replace("{a}", String(e.name)).replace("{b}", err instanceof Error ? err.message : "backend tak terjangkau"), "info");
      }
    }
    if (created + updated > 0) {
      log("mencatat absensi", `${date} shift ${shift} · ${created + updated} orang`, "Absensi");
      toast(S.tAttendanceSaved.replace("{a}", String(created)).replace("{b}", String(updated)));
    } else {
      toast(S.tNoNewData, "info");
    }
    setConfirmOpen(false);
  };

  const saveAll = () => {
    if (!date) {
      toast(S.tDateRequired, "info");
      return;
    }
    if (!validateRows()) return;
    const dupes = data.attendance.filter(
      (a) => a.date === date && a.shift === shift && activeEmps.some((e) => e.id === a.employeeId),
    );
    if (dupes.length > 0) {
      setDupeCount(dupes.length);
      setConfirmOpen(true);
      return;
    }
    void persist(false);
  }; /* persist async, errors toast internal */

  /* ---------- rekap ---------- */
  const monthRecords = useMemo(
    () => inBranch(data.attendance.filter((a) => String(a.date).startsWith(month))),
    [data.attendance, month, inBranch],
  );

  const summary = useMemo(
    () =>
      activeEmps.map((e) => {
        const recs = monthRecords.filter((a) => a.employeeId === e.id);
        const count = (s: string) => recs.filter((a) => a.status === s).length;
        const lembur = recs.reduce((s, a) => s + Number(a.overtime || 0), 0);
        const telat = recs.filter((a) => a.status === "Hadir" && isLate(String(a.checkIn))).length;
        const hadir = count("Hadir");
        const pct = recs.length > 0 ? (hadir / recs.length) * 100 : 0;
        return { emp: e, h: hadir, i: count("Izin"), s: count("Sakit"), c: count("Cuti"), a: count("Alpa"), lembur, telat, pct, total: recs.length };
      }),
    [activeEmps, monthRecords],
  );
  const sortedRekap = useMemo(() => sortRows(summary, sort2, (row, k) => {
    const r = row as { emp: StoreItem; h: number; i: number; s: number; c: number; a: number; lembur: number; telat: number; pct: number };
    switch (k) {
      case "emp": return String(r.emp.name ?? "");
      case "h": return Number(r.h);
      case "i": return Number(r.i);
      case "s": return Number(r.s);
      case "c": return Number(r.c);
      case "a": return Number(r.a);
      case "lembur": return Number(r.lembur);
      case "telat": return Number(r.telat);
      case "pct": return Number(r.pct);
      default: return "";
    }
  }), [summary, sort2]);
  const rekapPager = usePager(summary.length);
  useEffect(() => {
    rekapPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, branch, tab]);

  const kpiHadir = monthRecords.filter((a) => a.status === "Hadir").length;
  const kpiTelat = monthRecords.filter((a) => a.status === "Hadir" && isLate(String(a.checkIn))).length;
  const kpiLembur = monthRecords.reduce((s, a) => s + Number(a.overtime || 0), 0);
  const kpiPct = monthRecords.length > 0 ? (kpiHadir / monthRecords.length) * 100 : 0;

  const exportRekap = () => {
    const head = ["Karyawan", "Hadir", "Izin", "Sakit", "Cuti", "Alpa", "Lembur (jam)", "Telat", "Kehadiran %"];
    const body = summary.map((r) => [
      String(r.emp.name),
      r.h,
      r.i,
      r.s,
      r.c,
      r.a,
      Math.round(r.lembur * 10) / 10,
      r.telat,
      Math.round(r.pct * 10) / 10,
    ]);
    void exportExcel([head, ...body], `rekap-absensi-${month}`, "Rekap");
    toast(S.tRekapDownloaded);
  };

  const empNameOf = (id: string): string => data.employees.find((e) => e.id === id)?.name ?? id;

  /* ---------- persetujuan lembur ---------- */
  const approveOT = async (a: StoreItem) => {
    try {
    await update("attendance", a.id, { otStatus: "Disetujui" });
    log("menyetujui lembur", `${a.id} · ${empNameOf(String(a.employeeId))} · ${Number(a.overtime || 0)} jam`, "Absensi");
    toast(S.tOtApproved.replace("{n}", String(a.id)));
    } catch (e) { toast(e instanceof Error ? e.message : S.tOtApproveFailed.replace("{a}", String(a.id)).replace("{b}", "backend tak terjangkau"), "info"); }
  };

  const rejectOT = async (a: StoreItem) => {
    try {
    await update("attendance", a.id, { otStatus: "Ditolak" });
    log("menolak lembur", `${a.id} · ${empNameOf(String(a.employeeId))}`, "Absensi");
    toast(S.tOtRejected.replace("{n}", String(a.id)));
    } catch (e) { toast(e instanceof Error ? e.message : S.tSaveFailed.replace("{a}", String(a.id)).replace("{b}", "backend tak terjangkau"), "info"); }
  };

  const approveAllOT = async () => {
    const pending = detailRecords.filter((a) => otStatusOf(a) === "Diajukan");
    if (pending.length === 0) {
      toast(S.tNoPendingOt, "info");
      return;
    }
    let ok = 0;
    for (const a of pending) {
      try {
        await update("attendance", a.id, { otStatus: "Disetujui" });
        ok += 1;
      } catch (err) {
        toast(S.tOtApproveFailed.replace("{a}", String(a.id)).replace("{b}", err instanceof Error ? err.message : "backend tak terjangkau"), "info");
      }
    }
    log("menyetujui lembur massal", `${month} · ${ok} baris`, "Absensi");
    toast(S.tOtBulkApproved.replace("{n}", String(ok)));
  };

  const detailRecords = useMemo(
    () => [...monthRecords].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [monthRecords],
  );

  return (
    <div>
      <PageHeader
        title={S.abTitle}
        subtitle={S.abSubtitle}
        icon={<CalendarCheck className="h-5 w-5" />}
        actions={
          tab === "Catat" ? (
            <>
              <button className="btn-secondary" onClick={markAllPresent}>{S.markAllPresentBtn}</button>
              <button className="btn-primary-gradient" onClick={saveAll}>{S.saveAttendanceBtn}</button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={approveAllOT}>{S.approveAllOtBtn}</button>
              <button className="btn-secondary" onClick={exportRekap}>
                <Download className="h-4 w-4" /> {S.exportExcelBtn}
              </button>
            </div>
          )
        }
      />

      <div className="card">
        <Tabs tabs={["Catat", "Rekap"]} active={tab} onChange={setTab} labels={{ Catat: S.tabRecord, Rekap: S.tabRecap }} />
        <div className="p-4">
          {tab === "Catat" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  {S.dateFieldLabel}
                  <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  {S.shiftLabel}
                  <select className="input w-auto" value={shift} onChange={(e) => setShift(e.target.value)}>
                    {SHIFTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <select className="input w-auto" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={S.branchFilterShortAria}>
                  <option value="SEMUA">{S.allBranches}</option>
                  {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <Card>
                <div className="overflow-x-auto p-2">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.sortEmployee} sortKey="emp" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortIn} sortKey="in" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortOut} sortKey="out" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortOvertime} sortKey="ot" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortNote} sortKey="ket" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(activeEmps, sort, (row, k) => {
                        const e = row as StoreItem;
                        const r = rowFor(String(e.id));
                        switch (k) {
                          case "emp": return String(e.name ?? "");
                          case "status": return String(r.status ?? "");
                          case "in": return String(r.checkIn ?? "");
                          case "out": return String(r.checkOut ?? "");
                          case "ot": return Number(r.overtime ?? 0);
                          case "ket": return String(r.status) === "Hadir" && isLate(String(r.checkIn ?? "")) ? "Telat" : "";
                          default: return "";
                        }
                      }).map((e: StoreItem) => {
                        const r = rowFor(e.id);
                        const hadir = r.status === "Hadir";
                        return (
                          <tr key={e.id} className="hover:bg-surface">
                            <td className="td">
                              <p className="font-medium text-navy-900">{e.name}</p>
                              <p className="text-xs text-steel-500 font-mono">{e.id} · {e.branch}</p>
                            </td>
                            <td className="td">
                              <select className="input w-auto py-1.5 text-sm" value={r.status} onChange={(ev) => setRow(e.id, { status: ev.target.value })}>
                                {STATUS.map((s) => <option key={s}>{s}</option>)}
                              </select>
                            </td>
                            <td className="td">
                              <input type="time" className="input w-auto py-1.5 text-sm" value={r.checkIn} disabled={!hadir} onChange={(ev) => setRow(e.id, { checkIn: ev.target.value })} />
                            </td>
                            <td className="td">
                              <input type="time" className="input w-auto py-1.5 text-sm" value={r.checkOut} disabled={!hadir} onChange={(ev) => setRow(e.id, { checkOut: ev.target.value })} />
                            </td>
                            <td className="td">
                              <NumInput min="0" max="8" step="0.5" className="input w-24 py-1.5 text-sm" value={r.overtime} disabled={!hadir} onChange={(ev) => setRow(e.id, { overtime: ev.target.value })} />
                            </td>
                            <td className="td">
                              {hadir && isLate(r.checkIn) ? <Badge tone="red">{S.lateBadge}</Badge> : <span className="text-xs text-steel-400">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {activeEmps.length === 0 && <EmptyState title={S.emptyActiveEmployees} subtitle={S.changeBranchFilter} />}
                </div>
              </Card>
              <p className="mt-3 text-xs text-steel-500">
                {S.overtimeRule}
              </p>
            </div>
          )}

          {tab === "Rekap" && (
            <div>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label={S.kpiAttendanceRate} value={`${kpiPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} hint={S.monthHint.replace("{n}", month)} chip="teal" />
                <KpiCard label={S.kpiTotalPresent} value={fmtJumlah(kpiHadir)} hint={S.recordsHint.replace("{n}", fmtJumlah(monthRecords.length))} chip="navy" />
                <KpiCard label={S.kpiLateCount} value={fmtJumlah(kpiTelat)} hint={S.lateHint} chip="rose" />
                <KpiCard label={S.kpiTotalOvertime} value={`${fmtJumlah(Math.round(kpiLembur * 10) / 10)} jam`} hint={S.approvedOnlyPayroll} chip="amber" />
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <FilterPopover
                  activeCount={[month !== todayISO().slice(0, 7), branch !== "SEMUA"].filter(Boolean).length}
                  initial={{ month, branch }}
                  onReset={() => { setMonth(todayISO().slice(0, 7)); setBranch("SEMUA"); }}
                  onApply={(d) => { setMonth(d.month); setBranch(d.branch); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.monthFilterLabel}>
                        <input type="month" className="input w-full" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
                      </Field>
                      <Field label={S.branchLabel}>
                        <select className="input w-full" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} aria-label={S.branchFilterShortAria}>
                          <option value="SEMUA">{S.allBranches}</option>
                          {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                </FilterPopover>
              </div>

              <Card>
                <div className="overflow-x-auto p-2">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.sortEmployee} sortKey="emp" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label="H" sortKey="h" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label="I" sortKey="i" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label="S" sortKey="s" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label="C" sortKey="c" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label="A" sortKey="a" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortOvertimeShort} sortKey="lembur" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortLate} sortKey="telat" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortAttendance} sortKey="pct" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {rekapPager.slice(sortedRekap).map((r) => (
                        <tr key={r.emp.id} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{r.emp.name}</td>
                          <td className="td font-semibold text-emerald-600">{r.h}</td>
                          <td className="td">{r.i}</td>
                          <td className="td">{r.s}</td>
                          <td className="td">{r.c}</td>
                          <td className="td text-rose-600">{r.a}</td>
                          <td className="td">{S.hoursSuffix.replace("{n}", fmtJumlah(Math.round(r.lembur * 10) / 10))}</td>
                          <td className="td">{r.telat > 0 ? <Badge tone="red">{S.lateTimesBadge.replace("{n}", String(r.telat))}</Badge> : <span className="text-xs text-steel-400">-</span>}</td>
                          <td className="td font-semibold">{r.pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.length === 0 && <EmptyState title={S.emptyEmployees} subtitle={S.changeBranchFilter} />}
                  {rekapPager.bar}
                </div>
              </Card>

              <h3 className="mb-2 mt-5 text-sm font-semibold text-navy-900">{S.detailCurrentMonth}</h3>
              <Card>
                <div className="overflow-x-auto p-2">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.sortDate} sortKey="date" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortEmployee} sortKey="emp" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortShift} sortKey="shift" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortStatus} sortKey="status" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortTime} sortKey="jam" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortOvertimeShort} sortKey="lembur" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortApproval} sortKey="ot" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={S.sortNote} sortKey="ket" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(detailRecords, sort3, (row, k) => {
                        const a = row as StoreItem;
                        switch (k) {
                          case "date": return String(a.date ?? "");
                          case "emp": return String(empNameOf(String(a.employeeId ?? "")));
                          case "shift": return String(a.shift ?? "");
                          case "status": return String(a.status ?? "");
                          case "jam": return String(a.checkIn ?? "") + "-" + String(a.checkOut ?? "");
                          case "lembur": return Number(a.overtime ?? 0);
                          case "ot": return String(otStatusOf(a));
                          case "ket": return String(a.status) === "Hadir" && isLate(String(a.checkIn ?? "")) ? "Telat" : "";
                          default: return "";
                        }
                      }).slice(0, 100).map((a) => (
                        <tr key={a.id} className="hover:bg-surface">
                          <td className="td text-steel-600">{fmtTanggal(a.date)}</td>
                          <td className="td text-navy-900">{empNameOf(String(a.employeeId))}</td>
                          <td className="td"><Badge tone="gray">{a.shift}</Badge></td>
                          <td className="td"><StatusBadge status={String(a.status)} /></td>
                          <td className="td text-steel-600">{a.checkIn && a.checkOut ? `${a.checkIn}-${a.checkOut}` : "-"}</td>
                          <td className="td text-steel-600">{Number(a.overtime || 0) > 0 ? S.hoursSuffix.replace("{n}", fmtJumlah(Number(a.overtime))) : "-"}</td>
                          <td className="td">
                            {Number(a.overtime || 0) > 0 ? (
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <StatusBadge status={otStatusOf(a)} />
                                {otStatusOf(a) === "Diajukan" && (
                                  <>
                                    <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => approveOT(a)}>{S.approveBtn}</button>
                                    <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => rejectOT(a)}>{S.rejectBtn}</button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-steel-400">-</span>
                            )}
                          </td>
                          <td className="td">
                            {a.status === "Hadir" && isLate(String(a.checkIn)) ? <Badge tone="red">{S.lateBadge}</Badge> : <span className="text-xs text-steel-400">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detailRecords.length === 0 && <EmptyState title={S.emptyMonthRecords} subtitle={S.fillViaRecord} />}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={S.dupeTitle}
        desc={S.dupeDesc.replace("{n}", String(dupeCount)).replace("{a}", fmtTanggal(date)).replace("{b}", shift)}
        confirmLabel={S.confirmUpdate}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void persist(true)}
      />
    </div>
  );
}
