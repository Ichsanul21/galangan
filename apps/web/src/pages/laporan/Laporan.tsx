import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Card, CardHeader, PageHeader, StatusBadge, Badge, KpiCard, EmptyState, ProgressBar, Donut, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { fmtTanggal, fmtRupiah, fmtMiliar, fmtJumlah, todayISO } from "../../utils/format";
import { exportExcel, exportPDF } from "../../utils/export";

type Mode = "Mingguan" | "Bulanan" | "Per Proyek";

const num = (v: unknown): number => Number(v) || 0;
const inRange = (d: string, a: string, b: string): boolean => d >= a && d <= b;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export default function Laporan() {
  const { data, branch, inBranch, wbsFor } = useStore();
  const [mode, setMode] = useState<Mode>("Mingguan");
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [projectId, setProjectId] = useState("");

  const projectById: Record<string, boolean> = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const p of inBranch(data.projects ?? [])) m[String(p.id)] = true;
    return m;
  }, [data.projects, branch]);

  const matchProject = (pid: string): boolean => {
    if (branch === "SEMUA") return true;
    if (!pid) return true;
    return !!projectById[pid];
  };

  const week0 = mondayOf(weekStart || todayISO());
  const week1 = addDays(week0, 6);

  const weekly = useMemo(() => {
    const projects = inBranch(data.projects ?? []).filter((p) => p.status !== "Selesai");
    const avgProgress = projects.length > 0 ? projects.reduce((s, p) => s + num(p.progress), 0) / projects.length : 0;
    const invTerbit = (data.invoices ?? []).filter((i) => inRange(String(i.due ?? ""), week0, week1) && matchProject(String(i.project ?? "")));
    const invLunas = (data.invoices ?? []).filter((i) => i.status === "Lunas" && inRange(String(i.paidAt ?? i.due ?? ""), week0, week1) && matchProject(String(i.project ?? "")));
    const po = (data.purchaseOrders ?? []).filter((p) => inRange(String(p.date ?? ""), week0, week1));
    const ncr = (data.ncr ?? []).filter((n) => inRange(String(n.raised ?? ""), week0, week1) && matchProject(String(n.project ?? "")));
    const att = (data.attendance ?? []).filter((a) => inRange(String(a.date ?? ""), week0, week1));
    const hadir = att.filter((a) => a.status === "Hadir").length;
    const hadirPct = att.length > 0 ? (hadir / att.length) * 100 : 0;
    const incidents = (data.incidents ?? []).filter((x) => inRange(String(x.date ?? ""), week0, week1));
    return {
      projects, avgProgress,
      invTerbit, invTerbitVal: invTerbit.reduce((s, i) => s + num(i.amount), 0),
      invLunas, invLunasVal: invLunas.reduce((s, i) => s + num(i.amount), 0),
      po, poVal: po.reduce((s, p) => s + num(p.amount), 0),
      ncr, att, hadir, hadirPct, incidents,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, week0, week1, branch]);

  const monthly = useMemo(() => {
    const inv = (data.invoices ?? []).filter((i) => String(i.due ?? "").slice(0, 7) === month && matchProject(String(i.project ?? "")));
    const invLunas = (data.invoices ?? []).filter((i) => i.status === "Lunas" && String(i.paidAt ?? i.due ?? "").slice(0, 7) === month && matchProject(String(i.project ?? "")));
    const apLunas = (data.payables ?? []).filter((a) => a.st === "Lunas" && String(a.paidAt ?? a.due ?? "").slice(0, 7) === month);
    const payRows = (data.payroll ?? []).filter((p) => String(p.period ?? "") === month);
    const revenue = invLunas.reduce((s, i) => s + num(i.amount), 0);
    const apCost = apLunas.reduce((s, a) => s + num(a.amt), 0);
    const payrollTotal = payRows.reduce((s, p) => s + (num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions)), 0);
    const cost = apCost + payrollTotal;
    const laba = revenue - cost;
    const ppnKeluar = Math.round(revenue * 0.11);
    const ppnMasuk = Math.round(apLunas.reduce((s, a) => s + num(a.amt), 0) * 0.11);
    const pph23 = Math.round(apLunas.reduce((s, a) => s + num(a.amt), 0) * 0.02);
    const pph21 = payRows.reduce((s, p) => s + num(p.pph21), 0);
    const taxRow = (data.taxPeriods ?? []).find((t) => String(t.period) === month);
    return { inv, invLunas, revenue, apLunas, payRows, payrollTotal, cost, laba, ppnKeluar, ppnMasuk, pph23, pph21, taxRow };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, month, branch]);

  const projectsVisible = useMemo(() => inBranch(data.projects ?? []), [data.projects, branch]);
  const activeProjectId = projectId || projectsVisible[0]?.id || "";
  const project = projectsVisible.find((p) => p.id === activeProjectId);
  const wbsTop = project ? wbsFor(project.id).slice(0, 5) : [];
  const boqRows = (data.boq ?? []).filter((b) => String(b.projectId ?? b.project ?? "") === activeProjectId);
  const boqTotal = boqRows.reduce((s, b) => s + (num(b.totalPrice) || num(b.quantity) * num(b.unitPrice)), 0);
  const projInvoices = (data.invoices ?? []).filter((i) => String(i.project) === activeProjectId);
  const projInvTotal = projInvoices.reduce((s, i) => s + num(i.amount), 0);
  const projNcr = (data.ncr ?? []).filter((n) => String(n.project) === activeProjectId);
  const projActivities = (data.activities ?? []).filter((a) => String(a.target ?? "").includes(activeProjectId)).slice(0, 5);

  const exportWeek = () => {
    const rows: unknown[][] = [
      [`Laporan Mingguan ${fmtTanggal(week0)} - ${fmtTanggal(week1)}`],
      ["Indikator", "Nilai"],
      ["Proyek aktif", fmtJumlah(weekly.projects.length)],
      ["Rata-rata progres (%)", Math.round(weekly.avgProgress)],
      ["Invoice terbit", `${fmtJumlah(weekly.invTerbit.length)} · ${fmtRupiah(weekly.invTerbitVal)}`],
      ["Invoice lunas", `${fmtJumlah(weekly.invLunas.length)} · ${fmtRupiah(weekly.invLunasVal)}`],
      ["PO terbit", `${fmtJumlah(weekly.po.length)} · ${fmtRupiah(weekly.poVal)}`],
      ["NCR baru", fmtJumlah(weekly.ncr.length)],
      ["Kehadiran", `${fmtJumlah(weekly.hadir)}/${fmtJumlah(weekly.att.length)} (${Math.round(weekly.hadirPct)}%)`],
      ["Insiden", fmtJumlah(weekly.incidents.length)],
    ];
    void exportExcel(rows, `Laporan-Mingguan-${week0}`);
    toast("Excel mingguan diunduh");
  };

  const exportMonth = () => {
    const rows: unknown[][] = [
      [`Laporan Bulanan ${month}`],
      ["Indikator", "Nilai"],
      ["Invoice terbit", `${fmtJumlah(monthly.inv.length)}`],
      ["Pendapatan (Lunas)", monthly.revenue],
      ["Biaya (AP + payroll)", monthly.cost],
      ["Laba", monthly.laba],
      ["Payroll total", monthly.payrollTotal],
      ["PPN Keluaran 11%", monthly.ppnKeluar],
      ["PPN Masukan 11%", monthly.ppnMasuk],
      ["PPh 23 2%", monthly.pph23],
      ["PPh 21", monthly.pph21],
    ];
    void exportExcel(rows, `Laporan-Bulanan-${month}`);
    toast("Excel bulanan diunduh");
  };

  const exportProject = () => {
    if (!project) { toast("Pilih proyek dulu", "info"); return; }
    const rows: unknown[][] = [
      [`Laporan Proyek ${project.id} · ${String(project.vessel ?? "")}`],
      ["Indikator", "Nilai"],
      ["Budget", num(project.budget)],
      ["Aktual", num(project.actual)],
      ["Progres", `${num(project.progress)}%`],
      ["BoQ total", boqTotal],
      ["Invoice", `${fmtJumlah(projInvoices.length)} · ${fmtRupiah(projInvTotal)}`],
      ["NCR", fmtJumlah(projNcr.length)],
    ];
    void exportExcel(rows, `Laporan-${project.id}`);
    toast("Excel proyek diunduh");
  };

  return (
    <div>
      <PageHeader
        title="Pusat Laporan"
        subtitle="Mingguan, bulanan, dan per proyek — semua angka dari data sesi ini"
        icon={<FileText className="h-5 w-5" />}
        actions={
          mode === "Mingguan"
            ? <><button className="btn-secondary" onClick={exportWeek}>Export Excel</button><button className="btn-primary" onClick={() => exportPDF("laporan-konten", `Laporan-Mingguan-${week0}`)}>Export PDF</button></>
            : mode === "Bulanan"
              ? <><button className="btn-secondary" onClick={exportMonth}>Export Excel</button><button className="btn-primary" onClick={() => exportPDF("laporan-konten", `Laporan-Bulanan-${month}`)}>Export PDF</button></>
              : <><button className="btn-secondary" onClick={exportProject}>Export Excel</button><button className="btn-primary" onClick={() => exportPDF("laporan-konten", `Laporan-${activeProjectId}`)}>Export PDF</button></>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-steel-100 p-1">
          {(["Mingguan", "Bulanan", "Per Proyek"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${mode === m ? "bg-white text-navy-900 shadow-soft" : "text-steel-500"}`}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === "Mingguan" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-steel-600">
            Minggu mulai Senin
            <input type="date" className="input w-auto" value={week0} onChange={(e) => setWeekStart(e.target.value)} />
          </label>
        )}
        {mode === "Bulanan" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-steel-600">
            Bulan
            <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        )}
        {mode === "Per Proyek" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-steel-600">
            Proyek
            <select className="input w-auto" value={activeProjectId} onChange={(e) => setProjectId(e.target.value)}>
              {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {String(p.vessel ?? "")}</option>)}
            </select>
          </label>
        )}
      </div>

      <div id="laporan-konten">
        {mode === "Mingguan" && (
          <div className="space-y-4">
            <p className="text-sm text-steel-500">{fmtTanggal(week0)} → {fmtTanggal(week1)} · {fmtJumlah(weekly.projects.length)} proyek aktif</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Proyek Aktif" value={fmtJumlah(weekly.projects.length)} hint={`Rata-rata progres ${Math.round(weekly.avgProgress)}%`} chip="navy" />
              <KpiCard label="Invoice Terbit / Lunas" value={`${fmtJumlah(weekly.invTerbit.length)} / ${fmtJumlah(weekly.invLunas.length)}`} hint={fmtRupiah(weekly.invLunasVal)} chip="teal" />
              <KpiCard label="PO Terbit" value={fmtJumlah(weekly.po.length)} hint={fmtRupiah(weekly.poVal)} chip="amber" />
              <KpiCard label="Kehadiran" value={`${Math.round(weekly.hadirPct)}%`} hint={`${fmtJumlah(weekly.hadir)} dari ${fmtJumlah(weekly.att.length)} presensi`} chip="violet" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <CardHeader title="Proyek + Progres" subtitle="Aktif minggu ini" />
                <div className="space-y-3 px-5 pb-5">
                  {weekly.projects.slice(0, 6).map((p) => (
                    <div key={p.id}>
                      <div className="flex justify-between text-xs"><span className="font-mono font-semibold text-navy-900">{p.id}</span><span className="text-steel-500">{num(p.progress)}%</span></div>
                      <ProgressBar value={num(p.progress)} className="mt-1" />
                    </div>
                  ))}
                  {weekly.projects.length === 0 && <EmptyState title="Tidak ada proyek aktif" />}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title="NCR Baru + Insiden" subtitle={`${fmtJumlah(weekly.ncr.length)} NCR · ${fmtJumlah(weekly.incidents.length)} insiden`} />
                <div className="space-y-2 px-5 pb-5 text-xs">
                  {weekly.ncr.slice(0, 5).map((n) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-navy-900">{n.id}</span>
                      <StatusBadge status={String(n.status)} />
                      <span className="ml-auto text-steel-500">{fmtTanggal(String(n.raised ?? ""))}</span>
                    </div>
                  ))}
                  {weekly.incidents.slice(0, 5).map((x) => (
                    <div key={x.id} className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-navy-900">{x.id}</span>
                      <span className="truncate text-steel-600">{String(x.desc ?? x.type ?? "")}</span>
                      <span className="ml-auto text-steel-500">{fmtTanggal(String(x.date ?? ""))}</span>
                    </div>
                  ))}
                  {weekly.ncr.length === 0 && weekly.incidents.length === 0 && <p className="text-steel-400">Nihil temuan minggu ini.</p>}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title="Komposisi" subtitle="Terbit vs lunas vs PO" />
                <div className="flex items-center gap-4 px-5 pb-5">
                  <Donut
                    data={[
                      { name: "Terbit", value: weekly.invTerbit.length },
                      { name: "Lunas", value: weekly.invLunas.length },
                      { name: "PO", value: weekly.po.length },
                    ]}
                    size={130}
                    thickness={18}
                    centerValue={fmtJumlah(weekly.invTerbit.length + weekly.invLunas.length + weekly.po.length)}
                    centerLabel="Dok"
                  />
                  <div className="text-xs text-steel-600">
                    <p>Terbit {fmtJumlah(weekly.invTerbit.length)} · {fmtMiliar(weekly.invTerbitVal)}</p>
                    <p>Lunas {fmtJumlah(weekly.invLunas.length)} · {fmtMiliar(weekly.invLunasVal)}</p>
                    <p>PO {fmtJumlah(weekly.po.length)} · {fmtMiliar(weekly.poVal)}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {mode === "Bulanan" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label={`Pendapatan ${month}`} value={fmtMiliar(monthly.revenue)} hint={`${fmtJumlah(monthly.invLunas.length)} invoice lunas`} chip="teal" />
              <KpiCard label="Biaya (AP + Payroll)" value={fmtMiliar(monthly.cost)} hint={`Payroll ${fmtMiliar(monthly.payrollTotal)}`} chip="navy" />
              <KpiCard label="Laba Bersih" value={fmtMiliar(monthly.laba)} hint={monthly.laba >= 0 ? "Surplus" : "Defisit"} chip="violet" />
              <KpiCard label="PPh 21" value={fmtRupiah(monthly.pph21)} hint={monthly.taxRow ? `Periode ${String(monthly.taxRow.status)}` : "Belum ada periode"} chip="amber" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <CardHeader title="P&L Ringkas" subtitle="Pendapatan Lunas dikurangi AP Lunas + payroll" />
                <div className="space-y-1.5 px-5 pb-5 text-sm">
                  <div className="flex justify-between"><span className="text-steel-500">Pendapatan</span><span className="font-semibold">{fmtRupiah(monthly.revenue)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">Biaya</span><span className="font-semibold">{fmtRupiah(monthly.cost)}</span></div>
                  <div className="flex justify-between border-t border-steel-100 pt-2"><span className="text-steel-500">Laba</span><span className="font-bold text-navy-900">{fmtRupiah(monthly.laba)}</span></div>
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title="Pajak Bulan Ini" subtitle="11% PPN, 2% PPh23, total PPh21 payroll" />
                <div className="space-y-1.5 px-5 pb-5 text-sm">
                  <div className="flex justify-between"><span className="text-steel-500">PPN Keluaran</span><span className="font-semibold">{fmtRupiah(monthly.ppnKeluar)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">PPN Masukan</span><span className="font-semibold">{fmtRupiah(monthly.ppnMasuk)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">PPh 23</span><span className="font-semibold">{fmtRupiah(monthly.pph23)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">PPh 21</span><span className="font-semibold">{fmtRupiah(monthly.pph21)}</span></div>
                  {monthly.taxRow && <p className="text-xs text-steel-400">Periode {String(monthly.taxRow.period)} · {String(monthly.taxRow.status)} · dilapor {fmtTanggal(String(monthly.taxRow.reportedAt ?? ""))}</p>}
                </div>
              </Card>
            </div>
          </div>
        )}

        {mode === "Per Proyek" && (
          !project ? (
            <EmptyState title="Belum ada proyek" subtitle="Pilih cabang lain atau tambah proyek." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Budget vs Aktual" value={fmtMiliar(num(project.actual))} hint={`dari ${fmtMiliar(num(project.budget))}`} chip="navy" />
                <KpiCard label="Progres" value={`${num(project.progress)}%`} hint={String(project.status ?? "")} chip="teal" />
                <KpiCard label="BoQ Total" value={fmtMiliar(boqTotal)} hint={`${fmtJumlah(boqRows.length)} item`} chip="violet" />
                <KpiCard label="Invoice" value={fmtMiliar(projInvTotal)} hint={`${fmtJumlah(projInvoices.length)} invoice`} chip="amber" />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="p-4">
                  <CardHeader title="WBS Top" subtitle="5 pekerjaan teratas" />
                  <div className="space-y-2 px-5 pb-5 text-xs">
                    {wbsTop.map((w, i) => (
                      <div key={i}>
                        <div className="flex justify-between"><span className="truncate font-medium text-navy-900" title={w.task}>{w.task}</span><span className="text-steel-500">{w.progress}%</span></div>
                        <ProgressBar value={num(w.progress)} className="mt-1" />
                      </div>
                    ))}
                    {wbsTop.length === 0 && <p className="text-steel-400">Belum ada WBS.</p>}
                  </div>
                </Card>
                <Card className="p-4">
                  <CardHeader title="NCR Proyek" subtitle={`${fmtJumlah(projNcr.length)} temuan`} />
                  <div className="space-y-2 px-5 pb-5 text-xs">
                    {projNcr.slice(0, 6).map((n) => (
                      <div key={n.id} className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-navy-900">{n.id}</span>
                        <Badge tone="gray">{String(n.severity ?? n.type ?? "")}</Badge>
                        <StatusBadge status={String(n.status)} />
                      </div>
                    ))}
                    {projNcr.length === 0 && <p className="text-steel-400">Nihil NCR.</p>}
                  </div>
                </Card>
                <Card className="p-4">
                  <CardHeader title="Aktivitas Terakhir" subtitle="Dari feed aktivitas" />
                  <div className="space-y-2 px-5 pb-5 text-xs text-steel-600">
                    {projActivities.map((a) => (
                      <p key={a.id}><strong className="text-navy-900">{String(a.actor)}</strong> {String(a.action)} <span className="font-mono">{String(a.target)}</span></p>
                    ))}
                    {projActivities.length === 0 && <p className="text-steel-400">Belum ada aktivitas terkait.</p>}
                  </div>
                </Card>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
