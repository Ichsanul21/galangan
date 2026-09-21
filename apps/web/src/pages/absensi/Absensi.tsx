import { useMemo, useState } from "react";
import { CalendarCheck, Download } from "lucide-react";
import {
  Badge,
  Card,
  ConfirmModal,
  EmptyState,
  KpiCard,
  PageHeader,
  StatusBadge,
  Tabs,
  toast,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtJumlah, fmtTanggal, todayISO } from "../../utils/format";
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

export default function Absensi() {
  const { data, add, update, log, branch, setBranch, inBranch } = useStore();
  const [tab, setTab] = useState("Catat");

  /* ---------- catat ---------- */
  const [date, setDate] = useState(todayISO());
  const [shift, setShift] = useState("Pagi");
  const [rows, setRows] = useState<Record<string, CatatRow>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dupeCount, setDupeCount] = useState(0);

  /* ---------- rekap ---------- */
  const [month, setMonth] = useState(todayISO().slice(0, 7));

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
    toast(`${activeEmps.length} karyawan ditandai hadir`);
  };

  const validateRows = (): boolean => {
    for (const e of activeEmps) {
      const r = rowFor(e.id);
      if (r.status === "Hadir" && (!r.checkIn || !r.checkOut)) {
        toast(`Jam masuk/keluar ${e.name} wajib diisi`, "info");
        return false;
      }
      const ot = Number(r.overtime || 0);
      if (r.status === "Hadir" && (Number.isNaN(ot) || ot < 0 || ot > 8)) {
        toast(`Lembur ${e.name} harus 0–8 jam`, "info");
        return false;
      }
    }
    return true;
  };

  const persist = (overwrite: boolean) => {
    let created = 0;
    let updated = 0;
    activeEmps.forEach((e) => {
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
      };
      const existing = data.attendance.find((a) => a.employeeId === e.id && a.date === date && a.shift === shift);
      if (existing) {
        if (overwrite) {
          update("attendance", existing.id, payload);
          updated += 1;
        }
      } else {
        add("attendance", payload, undefined);
        created += 1;
      }
    });
    if (created + updated > 0) {
      log("mencatat absensi", `${date} shift ${shift} · ${created + updated} orang`, "Absensi");
      toast(`Absensi tersimpan — ${created} baru, ${updated} diperbarui`);
    } else {
      toast("Tidak ada data baru — semua sudah tercatat", "info");
    }
    setConfirmOpen(false);
  };

  const saveAll = () => {
    if (!date) {
      toast("Tanggal wajib diisi", "info");
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
    persist(false);
  };

  /* ---------- rekap ---------- */
  const monthRecords = useMemo(
    () => data.attendance.filter((a) => String(a.date).startsWith(month)),
    [data.attendance, month],
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
    toast("Rekap absensi diunduh");
  };

  const empNameOf = (id: string): string => data.employees.find((e) => e.id === id)?.name ?? id;

  const detailRecords = useMemo(
    () => [...monthRecords].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [monthRecords],
  );

  return (
    <div>
      <PageHeader
        title="Absensi"
        subtitle="Pencatatan harian per shift dan rekap bulanan"
        icon={<CalendarCheck className="h-5 w-5" />}
        actions={
          tab === "Catat" ? (
            <>
              <button className="btn-secondary" onClick={markAllPresent}>Tandai semua hadir</button>
              <button className="btn-primary-gradient" onClick={saveAll}>Simpan Absensi</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={exportRekap}>
              <Download className="h-4 w-4" /> Export Excel
            </button>
          )
        }
      />

      <div className="card">
        <Tabs tabs={["Catat", "Rekap"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Catat" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  Tanggal
                  <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  Shift
                  <select className="input w-auto" value={shift} onChange={(e) => setShift(e.target.value)}>
                    {SHIFTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <select className="input w-auto" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter cabang">
                  <option value="SEMUA">Semua Cabang</option>
                  {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <Card>
                <div className="overflow-x-auto p-2">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <th className="th">Karyawan</th>
                        <th className="th">Status</th>
                        <th className="th">Masuk</th>
                        <th className="th">Keluar</th>
                        <th className="th">Lembur (jam)</th>
                        <th className="th">Ket.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {activeEmps.map((e: StoreItem) => {
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
                              <input type="number" min="0" max="8" step="0.5" className="input w-24 py-1.5 text-sm" value={r.overtime} disabled={!hadir} onChange={(ev) => setRow(e.id, { overtime: ev.target.value })} />
                            </td>
                            <td className="td">
                              {hadir && isLate(r.checkIn) ? <Badge tone="red">Telat</Badge> : <span className="text-xs text-steel-400">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {activeEmps.length === 0 && <EmptyState title="Tidak ada karyawan aktif" subtitle="Ubah filter cabang." />}
                </div>
              </Card>
              <p className="mt-3 text-xs text-steel-500">
                Aturan lembur (dipakai Payroll): jam ke-1–2 = 1,5x · jam ke-3–4 = 2x · jam ke-5+ = 3x dari tarif per jam (gaji pokok / 173). Telat = masuk setelah 08:00.
              </p>
            </div>
          )}

          {tab === "Rekap" && (
            <div>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Tingkat Kehadiran" value={`${kpiPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} hint={`Bulan ${month}`} chip="teal" />
                <KpiCard label="Total Hadir" value={fmtJumlah(kpiHadir)} hint={`${fmtJumlah(monthRecords.length)} catatan`} chip="navy" />
                <KpiCard label="Keterlambatan" value={fmtJumlah(kpiTelat)} hint="Masuk setelah 08:00" chip="rose" />
                <KpiCard label="Total Lembur" value={`${fmtJumlah(Math.round(kpiLembur * 10) / 10)} jam`} hint="Akumulasi bulan berjalan" chip="amber" />
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  Bulan
                  <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
                </label>
                <select className="input w-auto" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter cabang">
                  <option value="SEMUA">Semua Cabang</option>
                  {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <Card>
                <div className="overflow-x-auto p-2">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <th className="th">Karyawan</th>
                        <th className="th">H</th>
                        <th className="th">I</th>
                        <th className="th">S</th>
                        <th className="th">C</th>
                        <th className="th">A</th>
                        <th className="th">Lembur</th>
                        <th className="th">Telat</th>
                        <th className="th">Kehadiran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {summary.map((r) => (
                        <tr key={r.emp.id} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{r.emp.name}</td>
                          <td className="td font-semibold text-emerald-600">{r.h}</td>
                          <td className="td">{r.i}</td>
                          <td className="td">{r.s}</td>
                          <td className="td">{r.c}</td>
                          <td className="td text-rose-600">{r.a}</td>
                          <td className="td">{fmtJumlah(Math.round(r.lembur * 10) / 10)} jam</td>
                          <td className="td">{r.telat > 0 ? <Badge tone="red">{r.telat}x Telat</Badge> : <span className="text-xs text-steel-400">—</span>}</td>
                          <td className="td font-semibold">{r.pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.length === 0 && <EmptyState title="Tidak ada karyawan" subtitle="Ubah filter cabang." />}
                </div>
              </Card>

              <h3 className="mb-2 mt-5 text-sm font-semibold text-navy-900">Rincian catatan bulan berjalan</h3>
              <Card>
                <div className="overflow-x-auto p-2">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <th className="th">Tanggal</th>
                        <th className="th">Karyawan</th>
                        <th className="th">Shift</th>
                        <th className="th">Status</th>
                        <th className="th">Jam</th>
                        <th className="th">Ket.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {detailRecords.slice(0, 100).map((a) => (
                        <tr key={a.id} className="hover:bg-surface">
                          <td className="td text-steel-600">{fmtTanggal(a.date)}</td>
                          <td className="td text-navy-900">{empNameOf(String(a.employeeId))}</td>
                          <td className="td"><Badge tone="gray">{a.shift}</Badge></td>
                          <td className="td"><StatusBadge status={String(a.status)} /></td>
                          <td className="td text-steel-600">{a.checkIn && a.checkOut ? `${a.checkIn}–${a.checkOut}` : "—"}</td>
                          <td className="td">
                            {a.status === "Hadir" && isLate(String(a.checkIn)) ? <Badge tone="red">Telat</Badge> : <span className="text-xs text-steel-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detailRecords.length === 0 && <EmptyState title="Belum ada catatan bulan ini" subtitle="Isi lewat tab Catat." />}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Perbarui catatan duplikat?"
        desc={`${dupeCount} karyawan sudah tercatat pada ${fmtTanggal(date)} shift ${shift}. Lanjutkan untuk memperbarui catatan tersebut?`}
        confirmLabel="Ya, perbarui"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => persist(true)}
      />
    </div>
  );
}
