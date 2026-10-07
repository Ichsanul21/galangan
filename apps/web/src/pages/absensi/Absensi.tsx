import { useEffect, useMemo, useState } from "react";
import { ID_MON } from "../../utils/monthAxis";
import { CalendarCheck, Download, CircleCheck, Trash2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Badge,
  Card,
  CardHeader,
  ChartTooltip,
  ConfirmModal,
  EmptyState,
  Field,
  KpiCard,
  PageHeader,
  SortTh,
  StatusBadge,
  Tabs,
  sortRows,
  SearchBox,
  rowMatches,
  toast,
  toggleSort,
  usePager,
  NumInput,
  AsyncButton,
  RowAction,
  TimeInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { FilterPopover } from "../../components/FilterPopover";
import { useStore } from "../../data/store";
import { findUsages } from "../../utils/usages";
import type { StoreItem } from "../../data/store";
import { fmtJumlah, fmtTanggal, todayISO } from "../../utils/format";
import { attendanceSeries } from "../../data";
import { useT } from "../../i18n/LanguageContext";
import { n_misc } from "../../i18n/n_misc";
import { exportExcel } from "../../utils/export";
import { cmpJam, fmtJam24, norm24, toMinutes } from "../../utils/time24";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";

const STATUS = ["Hadir", "Izin", "Sakit", "Cuti", "Alpa"];

/* Jam masuk acuan per shift untuk hitung telat (bukan hardcoded 08:00).
   T6-ABS4: UI tidak lagi menampilkan select shift; nilai internal "Pagi". */
const SHIFT_START: Record<string, string> = {
  Pagi: "08:00",
  Siang: "14:00",
  Malam: "20:00",
};

interface CatatRow {
  status: string;
  checkIn: string;
  checkOut: string;
  overtime: string;
}

const defaultRow = (shift = "Pagi"): CatatRow => ({
  status: "Hadir",
  checkIn: SHIFT_START[shift] ?? "08:00",
  checkOut: "17:00",
  overtime: "0",
});

/* StoreItem ber-index-signature sehingga tidak memenuhi constraint generik inBranch;
   intersection ini mempertahankan field sekaligus memuaskan constraint. */
type Branchable = StoreItem & { branch?: string };

/* Jam telat: banding jam, bukan banding string. Versi lama menulis
   checkIn > "08:00" yang hanya benar selama kedua sisi sudah dipadatkan
   2 digit - "8:05 AM" lolos ke store apa adanya lalu terbaca "tidak
   telat" karena "8" > "0" secara leksikal. norm24() di input menjaga
   data baru tetap 24H; cmpJam() menoleransi data warisan. */
function isLate(checkIn: unknown, shift = "Pagi"): boolean {
  const start = SHIFT_START[shift] ?? "08:00";
  return (cmpJam(checkIn, start) ?? -1) > 0;
}

/* Persetujuan lembur: baris lembur>0 default "Diajukan"; Payroll hanya menghitung yang "Disetujui". */
function otStatusOf(a: StoreItem): string {
  const raw = String(a.otStatus ?? "").trim();
  if (raw) return raw;
  return Number(a.overtime || 0) > 0 ? "Diajukan" : "-";
}

export default function Absensi() {
  const { data, add, update, remove, log, branch, setBranch, inBranch } = useStore();
  const { locale } = useT();
  const S = n_misc[locale];
  const [tab, setTab] = useState("Catat");

  /* ---------- catat ---------- */
  const [date, setDate] = useState(todayISO());
  const [shift] = useState("Pagi");
  const [rows, setRows] = useState<Record<string, CatatRow>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dupeCount, setDupeCount] = useState(0);
  // Hapus baris absensi via ConfirmModal + daftar pemakai.
  const [delAtt, setDelAtt] = useState<StoreItem | null>(null);
  /* Target hapus dari grid harian (beda dari delAtt yang dipakai tab Rekap). */
  const [delAttDay, setDelAttDay] = useState<StoreItem | null>(null);

  /* ---------- rekap ---------- */
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });
  /* Search per tabel (A2). Ketiganya bisa panjang sebanyak jumlah karyawan
     atau jumlah hari absensi, dan tanpa pencarian satu-satunya cara menemukan
     satu baris adalah menggulir. */
  const [catatQ, setCatatQ] = useState("");
  const [rekapQ, setRekapQ] = useState("");
  const [detailQ, setDetailQ] = useState("");

  const branchCities = useMemo(() => data.branches.map((b) => String(b.city)), [data.branches]);
  const activeEmps = useMemo(
    () => inBranch(data.employees as Branchable[]).filter((e) => e.status === "Aktif"),
    [data.employees, inBranch],
  );

  const rowFor = (id: string): CatatRow => rows[id] ?? defaultRow(shift);
  const setRow = (id: string, patch: Partial<CatatRow>) =>
    setRows((prev) => {
      const next = { ...prev, [id]: { ...rowFor(id), ...patch } };
      /* T6-ABS5: lembur otomatis bila jam kerja melewati 8 jam.
         User masih bisa menimpa manual (maks 12 jam). */
      const r = next[id];
      if (r.status === "Hadir" && r.checkIn && r.checkOut) {
        const cin = toMinutes(r.checkIn);
        const cout = toMinutes(r.checkOut);
        if (cin !== null && cout !== null) {
          const worked = (cout - cin + (cout < cin ? 24 * 60 : 0)) / 60;
          const autoOt = Math.max(0, Math.round((worked - 8) * 2) / 2);
          if (autoOt > 0 && (patch.overtime === undefined || Number(patch.overtime) === 0)) {
            next[id] = { ...next[id], overtime: String(Math.min(12, autoOt)) };
          }
        }
      }
      return next;
    });

  const markAllPresent = () => {
    const next: Record<string, CatatRow> = {};
    activeEmps.forEach((e) => {
      next[e.id] = defaultRow(shift);
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

  /* Simpan SATU karyawan, bukan seluruh shift. validateRows() memvalidasi
     semua baris, jadi di sini validasinya diulang hanya untuk karyawan itu -
     kalau tidak, satu baris lain yang belum lengkap akan memblokir koreksi. */
  const saveRow = async (e: StoreItem) => {
    if (!date) { toast(S.tDateRequired, "info"); return; }
    const r = rowFor(String(e.id));
    if (r.status === "Hadir" && (!r.checkIn || !r.checkOut)) {
      toast(S.tTimeRequired.replace("{n}", String(e.name)), "info");
      return;
    }
    const ot = r.status === "Hadir" ? Number(r.overtime || 0) : 0;
    if (r.status === "Hadir" && (Number.isNaN(ot) || ot < 0 || ot > 8)) {
      toast(S.tOvertimeRange.replace("{n}", String(e.name)), "info");
      return;
    }
    try {
      const payload = {
        employeeId: String(e.id),
        date,
        shift,
        status: r.status,
        checkIn: r.status === "Hadir" ? r.checkIn : "",
        checkOut: r.status === "Hadir" ? r.checkOut : "",
        overtime: ot,
        branch: String(e.branch ?? ""),
      };
      const existing = data.attendance.find((a) => String(a.employeeId) === String(e.id) && a.date === date && a.shift === shift);
      if (existing) {
        await update("attendance", String(existing.id), {
          ...payload,
          otStatus: ot > 0 ? String(existing.otStatus ?? "") || "Diajukan" : "",
        });
      } else {
        await add("attendance", { ...payload, otStatus: ot > 0 ? "Diajukan" : "" }, undefined);
      }
      log("mencatat absensi (per baris)", `${date} shift ${shift} - ${String(e.name)}`, "Absensi");
      toast(S.tAttendanceSaved.replace("{a}", existing ? "0" : "1").replace("{b}", existing ? "1" : "0"));
    } catch (err) {
      toast(S.tSaveFailed.replace("{a}", String(e.name)).replace("{b}", err instanceof Error ? err.message : "backend tak terjangkau"), "info");
    }
  };

  /* Hapus record absensi satu karyawan pada tanggal+shift ini. Berbeda dari
     hapus di tab Rekap: targetnya baris `attendance` yang sedang diedit. */
  const confirmDelAttDay = async () => {
    if (!delAttDay) return;
    const emp = delAttDay;
    const existing = data.attendance.find(
      (a) => String(a.employeeId) === String(emp.id) && a.date === date && a.shift === shift,
    );
    if (!existing) {
      toast(
        locale === "en"
          ? "No saved record for this employee on the selected date - nothing to delete."
          : "Belum ada record tersimpan untuk karyawan ini di tanggal terpilih - tidak ada yang dihapus.",
        "info",
      );
      setDelAttDay(null);
      return;
    }
    try {
      await remove("attendance", String(existing.id));
      /* Buang juga draft lokal supaya baris tidak muncul lagi sebagai
         "belum tersimpan" padahal sudah dihapus. */
      setRows((prev) => {
        const next = { ...prev };
        delete next[String(emp.id)];
        return next;
      });
      log("menghapus absensi", `${date} shift ${shift} - ${String(emp.name)}`, "Absensi");
      toast(locale === "en" ? `Attendance for ${String(emp.name)} deleted` : `Absensi ${String(emp.name)} dihapus`);
      setDelAttDay(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.tSaveFailed.replace("{a}", String(delAttDay?.name ?? "-")).replace("{b}", "-"), "info"); }
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
  /* T6-ABS3: filter bulan + tahun. */
  const [rekapYear, setRekapYear] = useState(() => String(new Date().getFullYear()));
  const monthRecords = useMemo(
    () => inBranch(data.attendance.filter((a) => {
      const d = String(a.date ?? "");
      if (!d.startsWith(month)) return false;
      if (rekapYear !== "" && !d.startsWith(rekapYear)) return false;
      return true;
    })),
    [data.attendance, month, rekapYear, inBranch],
  );

  const summary = useMemo(
    () =>
      activeEmps.map((e) => {
        const recs = monthRecords.filter((a) => a.employeeId === e.id);
        const count = (s: string) => recs.filter((a) => a.status === s).length;
        const lembur = recs.reduce((s, a) => s + Number(a.overtime || 0), 0);
        const telat = recs.filter((a) => a.status === "Hadir" && isLate(String(a.checkIn), String(a.shift ?? ""))).length;
        const hadir = count("Hadir");
        const pct = recs.length > 0 ? (hadir / recs.length) * 100 : 0;
        return { emp: e, h: hadir, i: count("Izin"), s: count("Sakit"), c: count("Cuti"), a: count("Alpa"), lembur, telat, pct, total: recs.length };
      }),
    [activeEmps, monthRecords],
  );
  const sortedRekap = useMemo(() => sortRows(
    summary.filter((row) => rowMatches(
      { name: String(row.emp.name ?? ""), id: String(row.emp.id ?? ""), branch: String(row.emp.branch ?? "") } as unknown as Record<string, unknown>,
      rekapQ,
      ["name", "id", "branch"],
    )),
    sort2,
    (row, k) => {
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
  const kpiTelat = monthRecords.filter((a) => a.status === "Hadir" && isLate(String(a.checkIn), String(a.shift ?? ""))).length;
  const kpiLembur = monthRecords.reduce((s, a) => s + Number(a.overtime || 0), 0);
  const kpiPct = monthRecords.length > 0 ? (kpiHadir / monthRecords.length) * 100 : 0;

  /* Tren kehadiran 12 bulan terakhir, dihitung dari baris absensi nyata
     (bukan data mock). Tingkat = hadir / total catatan pada bulan itu;
     bulan tanpa catatan sengaja dikosongkan (bukan 0) supaya garis tidak
     turun menggeqap dan tidak memunculkan titik palsu. Label bulan
     dihitung dari data, jadi tidak pernah bergeser seperti label hardcode. */
  const attendanceTrend = useMemo(() => {
    const now = new Date();
    const buckets = new Map<string, { hadir: number; total: number }>();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, { hadir: 0, total: 0 });
    }
    for (const a of data.attendance) {
      const key = String(a.date ?? "").slice(0, 7);
      const b = buckets.get(key);
      if (!b) continue;
      b.total += 1;
      if (a.status === "Hadir") b.hadir += 1;
    }
    const M = locale === "en" ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
                              : ID_MON;
    return [...buckets.entries()].map(([key, v]) => {
      const d = new Date(`${key}-01T00:00:00`);
      return {
        month: `${M[d.getMonth()]} ${d.getFullYear()}`,
        tingkat: v.total > 0 ? Math.round((v.hadir / v.total) * 1000) / 10 : null,
        catatan: v.total,
      };
    });
  }, [data.attendance, locale]);
  const trenValid = attendanceTrend.some((d) => d.tingkat !== null);
  /* Fallback ke data contoh HANYA saat belum ada satu pun catatan absensi
     (mis. instalasi baru / demo). Fallback diberi penanda supaya UI bisa
     menampilkannya sebagai data contoh - bukan menyamar sebagai angka asli. */
  const trenSample = !trenValid && attendanceSeries.length > 0;
  const trenShown = trenValid
    ? attendanceTrend
    : attendanceSeries.map((d) => ({ month: String(d.month), tingkat: Number(d.tingkat), catatan: 0 }));

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
    () => [...monthRecords]
      .filter((a) => rowMatches(
        {
          id: String(a.id ?? ""), employeeId: String(a.employeeId ?? ""),
          employee: String(data.employees.find((e) => String(e.id) === String(a.employeeId))?.name ?? ""),
          date: String(a.date ?? ""), shift: String(a.shift ?? ""), status: String(a.status ?? ""),
          checkIn: String(a.checkIn ?? ""), checkOut: String(a.checkOut ?? ""),
        } as unknown as Record<string, unknown>,
        detailQ,
        ["id", "employeeId", "employee", "date", "shift", "status", "checkIn", "checkOut"],
      ))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [monthRecords, detailQ, data.employees],
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
              <AsyncButton className="btn-secondary" onAction={markAllPresent}>{S.markAllPresentBtn}</AsyncButton>
              <AsyncButton className="btn-primary-gradient" onAction={saveAll}>{S.saveAttendanceBtn}</AsyncButton>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <AsyncButton className="btn-secondary" onAction={approveAllOT}>{S.approveAllOtBtn}</AsyncButton>
              <AsyncButton className="btn-secondary" onAction={exportRekap}>
                <Download className="h-4 w-4" /> {S.exportExcelBtn}
              </AsyncButton>
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
                {/* T6-ABS4: select shift dihapus dari UI (notes2).
                    Nilai internal tetap "Pagi" agar skema telat/lembur lama
                    tidak berubah. */}
                <span className="text-xs text-steel-400">{S.shiftLabel}: Pagi · {SHIFT_START["Pagi"] ?? "08:00"}</span>
                <select className="input w-auto" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={S.branchFilterShortAria}>
                  <option value="SEMUA">{S.allBranches}</option>
                  {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Search per tabel (A2). Ketiganya bisa panjang sebanyak jumlah
                  karyawan atau jumlah hari absensi, dan tanpa pencarian
                  satu-satunya cara menemukan satu baris adalah menggulir. */}
              <div className="mb-2 flex justify-end px-2">
                <SearchBox value={catatQ} onChange={setCatatQ} className="w-full max-w-xs" placeholder={locale === "en" ? "Search employees..." : "Cari karyawan..."} ariaLabel={locale === "en" ? "Search employees" : "Cari karyawan"} />
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
                        <SortTh label={S.colCreated} sortKey="createdAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colUpdated} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                        <th className="th">{locale === "en" ? "Actions" : "Aksi"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(activeEmps.filter((e) => rowMatches(
                        { name: String(e.name ?? ""), id: String(e.id ?? ""), branch: String(e.branch ?? ""), role: String(e.role ?? "") } as unknown as Record<string, unknown>,
                        catatQ,
                        ["name", "id", "branch", "role"],
                      )), sort, (row, k) => {
                        const e = row as StoreItem;
                        const r = rowFor(String(e.id));
                        switch (k) {
                          case "emp": return String(e.name ?? "");
                          case "status": return String(r.status ?? "");
                          case "in": return fmtJam24(r.checkIn);
                          case "out": return fmtJam24(r.checkOut);
                          case "ot": return Number(r.overtime ?? 0);
                          case "ket": return String(r.status) === "Hadir" && isLate(String(r.checkIn ?? ""), shift) ? "Telat" : "";
                          case "createdAt": return createdAtOf(e) ?? "";
                          case "updatedAt": return lastTouchedAt(e) ?? "";
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
                              <TimeInput className="w-auto py-1.5 text-sm" value={norm24(r.checkIn)} disabled={!hadir} ariaLabel={`${S.sortIn} ${e.name}`} onChange={(v) => setRow(e.id, { checkIn: v })} />
                            </td>
                            <td className="td">
                              <TimeInput className="w-auto py-1.5 text-sm" value={norm24(r.checkOut)} disabled={!hadir} ariaLabel={`${S.sortOut} ${e.name}`} onChange={(v) => setRow(e.id, { checkOut: v })} />
                            </td>
                            <td className="td">
                              <NumInput min="0" max="12" step="0.5" className="input w-24 py-1.5 text-sm" value={r.overtime} disabled={!hadir} onChange={(ev) => setRow(e.id, { overtime: ev.target.value })} title={locale === "en" ? "Auto after 8h work; max 12h manual" : "Otomatis setelah 8 jam kerja; maks manual 12 jam"} />
                            </td>
                            <td className="td">
                              {hadir && isLate(r.checkIn, shift) ? <Badge tone="red">{S.lateBadge}</Badge> : <span className="text-xs text-steel-400">-</span>}
                            </td>
                            <td className="td text-xs text-steel-600">{createdAtOf(e) !== null ? fmtTanggal(createdAtOf(e)) : <span className="text-steel-400">-</span>}</td>
                            <td className="td text-xs text-steel-600">{lastTouchedAt(e) !== null ? fmtTanggal(lastTouchedAt(e)) : <span className="text-steel-400">-</span>}</td>
                            {/* Aksi per baris. Dulu grid ini hanya punya editor inline + tombol
                                Simpan SEMUA, jadi satu karyawan yang absennya
                                keliru harus mengoreksi seluruh absensi shift
                                itu, dan baris yang sudah tercatat tidak bisa
                                dihapus dari sini (hanya dari tab Rekap). */}
                            <td className="td">
                              <div className="flex flex-wrap gap-1">
                                <RowAction
                                  icon={CircleCheck}
                                  tone="success"
                                  label={locale === "en" ? "Save this employee only" : "Simpan karyawan ini saja"}
                                  onClick={() => void saveRow(e)}
                                />
                                <RowAction
                                  icon={Trash2}
                                  tone="danger"
                                  label={locale === "en" ? "Delete this record" : "Hapus record ini"}
                                  onClick={() => setDelAttDay(e)}
                                />
                              </div>
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

              {/* T6-ABS6: tren kehadiran dihapus dari UI (notes2). */}
              {false && (trenValid || trenSample) && (
                <Card className="mb-4 p-5" data-export-hide>
                  <CardHeader
                    title={locale === "en" ? "Attendance trend (12 months)" : "Tren Kehadiran (12 bulan)"}
                    subtitle={trenSample
                      ? (locale === "en"
                        ? "SAMPLE DATA - no attendance record yet, showing reference figures"
                        : "DATA CONTOH - belum ada catatan absensi, menampilkan angka referensi")
                      : (locale === "en"
                        ? "Attendance rate per month from real attendance records, not hardcoded"
                        : "Tingkat kehadiran per bulan dari baris absensi nyata, bukan angka hardcode")}
                  />
                  <div className="mt-3 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trenShown} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip
                          content={
                            <ChartTooltip
                              formatter={(v) => `${fmtJumlah(Number(v ?? 0))}%`}
                              labelFormatter={(l) => {
                                const row = trenShown.find((d) => d.month === l);
                                const n = row?.catatan ?? 0;
                                return n > 0 ? `${l} · ${fmtJumlah(n)} ${locale === "en" ? "records" : "catatan"}` : l;
                              }}
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="tingkat"
                          stroke="#0d9488"
                          strokeWidth={2.5}
                          fill="url(#attGrad)"
                          connectNulls
                          dot={{ r: 3 }}
                          isAnimationActive
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <FilterPopover
                  activeCount={[month !== todayISO().slice(0, 7) || rekapYear !== String(new Date().getFullYear()), branch !== "SEMUA"].filter(Boolean).length}
                  initial={{ month, year: rekapYear, branch }}
                  onReset={() => { setMonth(todayISO().slice(0, 7)); setRekapYear(String(new Date().getFullYear())); setBranch("SEMUA"); }}
                  onApply={(d) => { setMonth(d.month); setRekapYear(d.year || String(new Date().getFullYear())); setBranch(d.branch); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      {/* T6-ABS3: filter bulan + tahun. */}
                      <Field label={S.monthFilterLabel}>
                        <input type="month" className="input w-full" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
                      </Field>
                      <Field label={locale === "en" ? "Year" : "Tahun"}>
                        <select className="input w-full" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })}>
                          {["", ...Array.from(new Set(data.attendance.map((a) => String(a.date ?? "").slice(0, 4)).filter(Boolean))).sort().reverse()].map((y) => (
                            <option key={y || "all"} value={y}>{y || (locale === "en" ? "All years" : "Semua tahun")}</option>
                          ))}
                        </select>
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
              <div className="mb-2 flex justify-end px-2">
                <SearchBox value={rekapQ} onChange={setRekapQ} className="w-full max-w-xs" placeholder={locale === "en" ? "Search recap..." : "Cari rekap..."} ariaLabel={locale === "en" ? "Search recap" : "Cari rekap"} />
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
              <div className="mb-2 flex justify-end px-2">
                <SearchBox value={detailQ} onChange={setDetailQ} className="w-full max-w-xs" placeholder={locale === "en" ? "Search records..." : "Cari catatan..."} ariaLabel={locale === "en" ? "Search attendance records" : "Cari catatan absensi"} />
              </div>
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
                        <th className="th">{locale === "en" ? "Actions" : "Aksi"}</th>
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
                          case "jam": return [fmtJam24(a.checkIn), fmtJam24(a.checkOut)].join("-");
                          case "lembur": return Number(a.overtime ?? 0);
                          case "ot": return String(otStatusOf(a));
                          case "ket": return String(a.status) === "Hadir" && isLate(String(a.checkIn ?? ""), String(a.shift ?? "")) ? "Telat" : "";
                          default: return "";
                        }
                      }).map((a) => (
                        <tr key={a.id} className="hover:bg-surface">
                          <td className="td text-steel-600">{fmtTanggal(a.date)}</td>
                          <td className="td text-navy-900">{empNameOf(String(a.employeeId))}</td>
                          <td className="td"><Badge tone="gray">{a.shift}</Badge></td>
                          <td className="td"><StatusBadge status={String(a.status)} /></td>
                          <td className="td text-steel-600 font-mono text-xs">{a.checkIn && a.checkOut ? `${fmtJam24(a.checkIn)}-${fmtJam24(a.checkOut)}` : "-"}</td>
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
                            {a.status === "Hadir" && isLate(String(a.checkIn), String(a.shift ?? "")) ? <Badge tone="red">{S.lateBadge}</Badge> : <span className="text-xs text-steel-400">-</span>}
                          </td>
                          <td className="td">
                            <RowAction
                              icon={Trash2}
                              tone="danger"
                              label={`${locale === "en" ? "Delete" : "Hapus"} ${empNameOf(String(a.employeeId))} ${fmtTanggal(a.date)}`}
                              onClick={() => setDelAtt(a)}
                            />
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
      <ConfirmModal
        open={delAttDay !== null}
        title={delAttDay
          ? (locale === "en"
            ? `Delete attendance for ${String(delAttDay.name)}?`
            : `Hapus absensi ${String(delAttDay.name)}?`)
          : ""}
        desc={delAttDay
          ? (locale === "en"
            ? `The record for ${date} / shift ${shift} will be permanently deleted. The row goes back to "not saved" in this grid.`
            : `Record ${date} / shift ${shift} akan dihapus permanen. Baris kembali menjadi "belum tersimpan" di grid ini.`)
          : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelAttDay(null)}
        onConfirm={confirmDelAttDay}
      />

      <ConfirmModal
        open={delAtt !== null}
        title={delAtt ? (locale === "en" ? `Delete attendance ${delAtt.id}?` : `Hapus absensi ${delAtt.id}?`) : ""}
        desc={(() => {
          if (!delAtt) return "";
          const used = findUsages(data, "attendance", String(delAtt.id));
          const base = locale === "en"
            ? `Attendance ${empNameOf(String(delAtt.employeeId))} · ${fmtTanggal(String(delAtt.date))} · ${String(delAtt.shift)} (${String(delAtt.status)}) will be permanently deleted.`
            : `Absensi ${empNameOf(String(delAtt.employeeId))} · ${fmtTanggal(String(delAtt.date))} · ${String(delAtt.shift)} (${String(delAtt.status)}) akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Used in: ${used.join(", ")}. Deletion blocked.` : `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delAtt && findUsages(data, "attendance", String(delAtt.id)).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : (locale === "en" ? "Delete" : "Hapus")}
        danger
        confirmDisabled={delAtt ? findUsages(data, "attendance", String(delAtt.id)).length > 0 : false}
        onCancel={() => setDelAtt(null)}
        onConfirm={async () => {
          if (!delAtt) return;
          const usedBy = findUsages(data, "attendance", String(delAtt.id));
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked - used in: ${usedBy.join(", ")}` : `Hapus diblokir - dipakai di: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("attendance", String(delAtt.id));
            log("menghapus absensi", `${delAtt.id}`, "Absensi");
            toast(locale === "en" ? `Attendance ${delAtt.id} deleted` : `Absensi ${delAtt.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : (locale === "en" ? "Delete failed" : "Gagal menghapus"), "info"); }
          setDelAtt(null);
        }}
      />
    </div>
  );
}

