import { useMemo, useState } from "react";
import { useDraftState } from "../../utils/draft";
import { FileText } from "lucide-react";
import { Card, CardHeader, PageHeader, StatusBadge, Badge, KpiCard, EmptyState, ProgressBar, Donut, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtTanggal, fmtRupiah, fmtMiliar, fmtJumlah, todayISO } from "../../utils/format";
import { getSetting } from "../../utils/settings";
import { useT } from "../../i18n/LanguageContext";
import { n_misc } from "../../i18n/n_misc";
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

function shiftMonth(ym: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface ReportTpl { name: string; mode: Mode; weekStart: string; month: string; projectId: string }
interface ReportArc { name: string; at: string; mode: Mode; info: string }

function loadTpls(): ReportTpl[] {
  try {
    const raw = localStorage.getItem("isms.reportTpl");
    const arr = raw ? JSON.parse(raw) as ReportTpl[] : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function loadArc(): ReportArc[] {
  try {
    const raw = localStorage.getItem("isms.reportArc");
    const arr = raw ? JSON.parse(raw) as ReportArc[] : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export default function Laporan() {
  const { data, branch, inBranch, wbsFor, log } = useStore();
  const { locale } = useT();
  const S = n_misc[locale];
  const [mode, setMode] = useState<Mode>("Mingguan");
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [projectId, setProjectId] = useState("");
  const [tplName, setTplName] = useState("");
  const [tpls, setTpls] = useState<ReportTpl[]>(() => loadTpls());
  const [sigName, setSigName] = useDraftState("isms.draft.laporan.sigName", "");
  const [sigRole, setSigRole] = useDraftState("isms.draft.laporan.sigRole", "");
  const [sigDate, setSigDate] = useDraftState("isms.draft.laporan.sigDate", todayISO());
  const [arc, setArc] = useState<ReportArc[]>(() => loadArc());
  // Filter cabang lokal untuk seksi PO/absensi/insiden/payroll (Semua + daftar cabang).
  const [brF, setBrF] = useState("SEMUA");
  const branchCities = useMemo(() => (data.branches ?? []).map((b) => String(b.city ?? b.name ?? b.id)), [data.branches]);
  const matchBr = (r: StoreItem): boolean =>
    brF === "SEMUA" || !r.branch || String(r.branch) === brF;

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
    const po = (data.purchaseOrders ?? []).filter((p) => inRange(String(p.date ?? ""), week0, week1) && matchBr(p));
    const ncr = (data.ncr ?? []).filter((n) => inRange(String(n.raised ?? ""), week0, week1) && matchProject(String(n.project ?? "")));
    const att = (data.attendance ?? []).filter((a) => inRange(String(a.date ?? ""), week0, week1) && matchBr(a));
    const hadir = att.filter((a) => a.status === "Hadir").length;
    const hadirPct = att.length > 0 ? (hadir / att.length) * 100 : 0;
    const incidents = (data.incidents ?? []).filter((x) => inRange(String(x.date ?? ""), week0, week1) && matchBr(x));
    return {
      projects, avgProgress,
      invTerbit, invTerbitVal: invTerbit.reduce((s, i) => s + num(i.amount), 0),
      invLunas, invLunasVal: invLunas.reduce((s, i) => s + num(i.amount), 0),
      po, poVal: po.reduce((s, p) => s + num(p.amount), 0),
      ncr, att, hadir, hadirPct, incidents,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, week0, week1, branch, brF]);

  const monthly = useMemo(() => {
    const inv = (data.invoices ?? []).filter((i) => String(i.due ?? "").slice(0, 7) === month && matchProject(String(i.project ?? "")));
    const invLunas = (data.invoices ?? []).filter((i) => i.status === "Lunas" && String(i.paidAt ?? i.due ?? "").slice(0, 7) === month && matchProject(String(i.project ?? "")));
    const apLunas = (data.payables ?? []).filter((a) => a.st === "Lunas" && String(a.paidAt ?? a.due ?? "").slice(0, 7) === month);
    const payRows = (data.payroll ?? []).filter((p) => String(p.period ?? "") === month && matchBr(p));
    const revenue = invLunas.reduce((s, i) => s + num(i.amount), 0);
    const apCost = apLunas.reduce((s, a) => s + num(a.amt), 0);
    const payrollTotal = payRows.reduce((s, p) => s + (num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions)), 0);
    const cost = apCost + payrollTotal;
    const laba = revenue - cost;
    const ppnRate = getSetting(data, "PPN_RATE", 12) / 100;
    const pphRate = getSetting(data, "PPH23_RATE", 2) / 100;
    const ppnKeluar = Math.round(revenue * ppnRate);
    const ppnMasuk = Math.round(apLunas.reduce((s, a) => s + num(a.amt), 0) * ppnRate);
    const pph23 = Math.round(apLunas.reduce((s, a) => s + num(a.amt), 0) * pphRate);
    const pph21 = payRows.reduce((s, p) => s + num(p.pph21), 0);
    const taxRow = (data.taxPeriods ?? []).find((t) => String(t.period) === month);
    return { inv, invLunas, revenue, apLunas, payRows, payrollTotal, cost, laba, ppnKeluar, ppnMasuk, pph23, pph21, taxRow };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, month, branch, brF]);

  const projectsVisible = useMemo(() => inBranch(data.projects ?? []), [data.projects, branch]);
  const activeProjectId = projectId || projectsVisible[0]?.id || "";
  const project = projectsVisible.find((p) => p.id === activeProjectId);
  const wbsTop = project && data.wbsByProject?.[project.id]?.length ? wbsFor(project.id).slice(0, 5) : [];
  const boqRows = (data.boq ?? []).filter((b) => String(b.projectId ?? b.project ?? "") === activeProjectId);
  const boqTotal = boqRows.reduce((s, b) => s + (num(b.totalPrice) || num(b.quantity) * num(b.unitPrice)), 0);
  const projInvoices = (data.invoices ?? []).filter((i) => String(i.project) === activeProjectId);
  const projInvTotal = projInvoices.reduce((s, i) => s + num(i.amount), 0);
  const projNcr = (data.ncr ?? []).filter((n) => String(n.project) === activeProjectId);
  const projActivities = (data.activities ?? []).filter((a) => String(a.target ?? "").includes(activeProjectId)).slice(0, 5);

  const prevMonth = shiftMonth(month, -1);
  const monthlyPrev = useMemo(() => {
    const invLunas = (data.invoices ?? []).filter((i) => i.status === "Lunas" && String(i.paidAt ?? i.due ?? "").slice(0, 7) === prevMonth && matchProject(String(i.project ?? "")));
    const apLunas = (data.payables ?? []).filter((a) => a.st === "Lunas" && String(a.paidAt ?? a.due ?? "").slice(0, 7) === prevMonth);
    const payRows = (data.payroll ?? []).filter((p) => String(p.period ?? "") === prevMonth && matchBr(p));
    const revenue = invLunas.reduce((s, i) => s + num(i.amount), 0);
    const cost = apLunas.reduce((s, a) => s + num(a.amt), 0) + payRows.reduce((s, p) => s + (num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions)), 0);
    return { revenue, cost, laba: revenue - cost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, prevMonth, branch, brF]);

  const weekPrev0 = addDays(week0, -7);
  const weekPrev1 = addDays(week0, -1);
  const weeklyPrev = useMemo(() => {
    const invLunas = (data.invoices ?? []).filter((i) => i.status === "Lunas" && inRange(String(i.paidAt ?? i.due ?? ""), weekPrev0, weekPrev1) && matchProject(String(i.project ?? "")));
    const po = (data.purchaseOrders ?? []).filter((p) => inRange(String(p.date ?? ""), weekPrev0, weekPrev1) && matchBr(p));
    const revenue = invLunas.reduce((s, i) => s + num(i.amount), 0);
    const cost = po.reduce((s, p) => s + num(p.amount), 0);
    return { revenue, cost, laba: revenue - cost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, weekPrev0, weekPrev1, branch, brF]);
  const weeklyRev = weekly.invLunasVal;
  const weeklyCost = weekly.poVal;
  const weeklyLaba = weeklyRev - weeklyCost;

  const sigRows = (): unknown[][] => (
    sigName.trim() ? [[""], ["Disahkan oleh", `${sigName.trim()} · ${sigRole.trim() || "-"} · ${fmtTanggal(sigDate)}`]] : []
  );

  const pushArc = (name: string, info: string, m: Mode) => {
    const entry: ReportArc = { name, at: todayISO(), mode: m, info };
    const next = [entry, ...arc].slice(0, 10);
    setArc(next);
    try { localStorage.setItem("isms.reportArc", JSON.stringify(next)); } catch { /* abaikan */ }
    log(`mengekspor laporan ${name}`, info, "Laporan");
  };

  const saveTpl = () => {
    if (!tplName.trim()) { toast(S.tTemplateNameRequired, "info"); return; }
    const tpl: ReportTpl = { name: tplName.trim(), mode, weekStart: week0, month, projectId: activeProjectId };
    const next = [tpl, ...tpls.filter((t) => t.name !== tpl.name)].slice(0, 20);
    setTpls(next);
    try { localStorage.setItem("isms.reportTpl", JSON.stringify(next)); } catch { /* abaikan */ }
    toast(S.tTemplateSaved.replace("{n}", tpl.name));
    setTplName("");
  };

  const applyTpl = (t: ReportTpl) => {
    setMode(t.mode);
    setWeekStart(t.weekStart);
    setMonth(t.month);
    setProjectId(t.projectId);
    toast(S.tTemplateUsed.replace("{n}", t.name));
  };

  const delTpl = (name: string) => {
    const next = tpls.filter((t) => t.name !== name);
    setTpls(next);
    try { localStorage.setItem("isms.reportTpl", JSON.stringify(next)); } catch { /* abaikan */ }
    toast(S.tTemplateDeleted.replace("{n}", name), "info");
  };

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
      ["Pembanding minggu lalu (lunas / PO / laba)", `${fmtRupiah(weeklyPrev.revenue)} / ${fmtRupiah(weeklyPrev.cost)} / ${fmtRupiah(weeklyPrev.laba)}`],
      ...sigRows(),
    ];
    void exportExcel(rows, `Laporan-Mingguan-${week0}`);
    pushArc(`Laporan-Mingguan-${week0}`, `${fmtTanggal(week0)} - ${fmtTanggal(week1)}`, "Mingguan");
    toast(S.tExcelWeekDownloaded);
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
      ["Bulan lalu (revenue / cost / laba)", `${fmtRupiah(monthlyPrev.revenue)} / ${fmtRupiah(monthlyPrev.cost)} / ${fmtRupiah(monthlyPrev.laba)}`],
      ...sigRows(),
    ];
    void exportExcel(rows, `Laporan-Bulanan-${month}`);
    pushArc(`Laporan-Bulanan-${month}`, month, "Bulanan");
    toast(S.tExcelMonthDownloaded);
  };

  const exportProject = () => {
    if (!project) { toast(S.tPickProjectFirst, "info"); return; }
    const rows: unknown[][] = [
      [`Laporan Proyek ${project.id} · ${String(project.vessel ?? "")}`],
      ["Indikator", "Nilai"],
      ["Budget", num(project.budget)],
      ["Aktual", num(project.actual)],
      ["Progres", `${num(project.progress)}%`],
      ["BoQ total", boqTotal],
      ["Invoice", `${fmtJumlah(projInvoices.length)} · ${fmtRupiah(projInvTotal)}`],
      ["NCR", fmtJumlah(projNcr.length)],
      ...sigRows(),
    ];
    void exportExcel(rows, `Laporan-${project.id}`);
    pushArc(`Laporan-${project.id}`, String(project.vessel ?? ""), "Per Proyek");
    toast(S.tExcelProjectDownloaded);
  };

  const pdfName = mode === "Mingguan" ? `Laporan-Mingguan-${week0}` : mode === "Bulanan" ? `Laporan-Bulanan-${month}` : `Laporan-${activeProjectId}`;
  const exportPDFLogged = () => {
    exportPDF("laporan-konten", pdfName);
    pushArc(pdfName, mode === "Per Proyek" ? String(project?.vessel ?? "") : mode === "Bulanan" ? month : `${fmtTanggal(week0)} - ${fmtTanggal(week1)}`, mode);
    toast(S.tPdfArchived);
  };

  return (
    <div>
      <PageHeader
        title={S.lapTitle}
        subtitle={S.lapSubtitle}
        icon={<FileText className="h-5 w-5" />}
        actions={
          mode === "Mingguan"
            ? <><button className="btn-secondary" onClick={exportWeek}>{S.exportExcelBtn}</button><button className="btn-primary" onClick={exportPDFLogged}>Export PDF</button></>
            : mode === "Bulanan"
              ? <><button className="btn-secondary" onClick={exportMonth}>{S.exportExcelBtn}</button><button className="btn-primary" onClick={exportPDFLogged}>Export PDF</button></>
              : <><button className="btn-secondary" onClick={exportProject}>{S.exportExcelBtn}</button><button className="btn-primary" onClick={exportPDFLogged}>Export PDF</button></>
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
              {m === "Mingguan" ? S.modeWeekly : m === "Bulanan" ? S.modeMonthly : S.modePerProject}
            </button>
          ))}
        </div>
        {mode === "Mingguan" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-steel-600">
            {S.weekStartsMonday}
            <input type="date" className="input w-auto" value={week0} onChange={(e) => setWeekStart(e.target.value)} />
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-steel-600">
          {S.branchLabel}
          <select className="input w-auto" value={brF} onChange={(e) => setBrF(e.target.value)} aria-label={S.branchFilterAria}>
            <option value="SEMUA">{S.allLabel}</option>
            {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {mode === "Bulanan" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-steel-600">
            {S.monthLabel}
            <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        )}
        {mode === "Per Proyek" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-steel-600">
            {S.projectLabel}
            <select className="input w-auto" value={activeProjectId} onChange={(e) => setProjectId(e.target.value)}>
              {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {String(p.vessel ?? "")}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <CardHeader title={S.savedTemplates} subtitle={S.saveModeParams} />
          <div className="flex flex-wrap gap-2 px-5 pb-2">
            <input className="input w-48" placeholder={S.templateNamePh} value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <button className="btn-secondary text-xs" onClick={saveTpl}>{S.saveTemplateBtn}</button>
          </div>
          <div className="space-y-1.5 px-5 pb-5 text-sm">
            {tpls.map((t) => (
              <div key={t.name} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                <span className="font-semibold text-navy-900">{t.name}</span>
                <Badge tone="gray">{t.mode}</Badge>
                <span className="ml-auto flex gap-1.5">
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => applyTpl(t)}>{S.useBtn}</button>
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => delTpl(t.name)}>{S.deleteBtn}</button>
                </span>
              </div>
            ))}
            {tpls.length === 0 && <p className="text-xs text-steel-400">{S.noTemplates}</p>}
          </div>
        </Card>
        <Card className="p-4">
          <CardHeader title={S.signTitle} subtitle={S.signSub} />
          <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-3">
            <label className="text-xs text-steel-600">{S.nameLabel}<input className="input mt-1" value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder={S.sigNamePh} /></label>
            <label className="text-xs text-steel-600">{S.positionLabel}<input className="input mt-1" value={sigRole} onChange={(e) => setSigRole(e.target.value)} placeholder={S.sigRolePh} /></label>
            <label className="text-xs text-steel-600">{S.dateLabel}<input type="date" className="input mt-1" value={sigDate} onChange={(e) => setSigDate(e.target.value)} /></label>
          </div>
        </Card>
      </div>

      <div id="laporan-konten">
        {mode === "Mingguan" && (
          <div className="space-y-4">
            <p className="text-sm text-steel-500">{S.weekRangeProjects.replace("{a}", fmtTanggal(week0)).replace("{b}", fmtTanggal(week1)).replace("{n}", fmtJumlah(weekly.projects.length))}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label={S.kpiActiveProject} value={fmtJumlah(weekly.projects.length)} hint={S.avgProgressHint.replace("{n}", String(Math.round(weekly.avgProgress)))} chip="navy" />
              <KpiCard label={S.kpiInvoiceIssuedPaid} value={`${fmtJumlah(weekly.invTerbit.length)} / ${fmtJumlah(weekly.invLunas.length)}`} hint={fmtRupiah(weekly.invLunasVal)} chip="teal" />
              <KpiCard label={S.kpiPoIssued} value={fmtJumlah(weekly.po.length)} hint={fmtRupiah(weekly.poVal)} chip="amber" />
              <KpiCard label={S.kpiAttendance} value={`${Math.round(weekly.hadirPct)}%`} hint={S.attendanceHint.replace("{a}", fmtJumlah(weekly.hadir)).replace("{b}", fmtJumlah(weekly.att.length))} chip="violet" />
            </div>
            <Card className="p-4">
              <CardHeader title={S.compareLastWeek} subtitle={`${fmtTanggal(weekPrev0)} → ${fmtTanggal(weekPrev1)}`} />
              <div className="grid grid-cols-1 gap-2 px-5 pb-5 text-sm sm:grid-cols-3">
                <div className="flex justify-between"><span className="text-steel-500">{S.paidDelta}</span><span className="font-semibold">{fmtRupiah(weeklyRev - weeklyPrev.revenue)}</span></div>
                <div className="flex justify-between"><span className="text-steel-500">{S.poDelta}</span><span className="font-semibold">{fmtRupiah(weeklyCost - weeklyPrev.cost)}</span></div>
                <div className="flex justify-between"><span className="text-steel-500">{S.profitDelta}</span><span className="font-semibold">{fmtRupiah(weeklyLaba - weeklyPrev.laba)}</span></div>
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <CardHeader title={S.projectProgress} subtitle={S.activeThisWeek} />
                <div className="space-y-3 px-5 pb-5">
                  {weekly.projects.slice(0, 6).map((p) => (
                    <div key={p.id}>
                      <div className="flex justify-between text-xs"><span className="font-mono font-semibold text-navy-900">{p.id}</span><span className="text-steel-500">{num(p.progress)}%</span></div>
                      <ProgressBar value={num(p.progress)} className="mt-1" />
                    </div>
                  ))}
                  {weekly.projects.length === 0 && <EmptyState title={S.emptyActiveProjects} />}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title={S.ncrPlusIncident} subtitle={S.ncrIncidentCount.replace("{a}", fmtJumlah(weekly.ncr.length)).replace("{b}", fmtJumlah(weekly.incidents.length))} />
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
                  {weekly.ncr.length === 0 && weekly.incidents.length === 0 && <p className="text-steel-400">{S.noFindingsWeek}</p>}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title={S.compositionTitle} subtitle={S.issuedVsPaidVsPo} />
                <div className="flex items-center gap-4 px-5 pb-5">
                  <Donut
                    data={[
                      { name: S.segIssued, value: weekly.invTerbit.length },
                      { name: S.segPaid, value: weekly.invLunas.length },
                      { name: S.segPo, value: weekly.po.length },
                    ]}
                    size={130}
                    thickness={18}
                    centerValue={fmtJumlah(weekly.invTerbit.length + weekly.invLunas.length + weekly.po.length)}
                    centerLabel={S.donutDocs}
                  />
                  <div className="text-xs text-steel-600">
                    <p>{S.segLineIssued.replace("{a}", fmtJumlah(weekly.invTerbit.length)).replace("{b}", fmtMiliar(weekly.invTerbitVal))}</p>
                    <p>{S.segLinePaid.replace("{a}", fmtJumlah(weekly.invLunas.length)).replace("{b}", fmtMiliar(weekly.invLunasVal))}</p>
                    <p>{S.segLinePo.replace("{a}", fmtJumlah(weekly.po.length)).replace("{b}", fmtMiliar(weekly.poVal))}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {mode === "Bulanan" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label={S.revenueMonth.replace("{n}", month)} value={fmtMiliar(monthly.revenue)} hint={S.invoicePaidCount.replace("{n}", fmtJumlah(monthly.invLunas.length))} chip="teal" />
              <KpiCard label={S.costApPayroll} value={fmtMiliar(monthly.cost)} hint={S.payrollAmount.replace("{n}", fmtMiliar(monthly.payrollTotal))} chip="navy" />
              <KpiCard label={S.netProfit} value={fmtMiliar(monthly.laba)} hint={monthly.laba >= 0 ? S.surplusLabel : S.deficitLabel} chip="violet" />
              <KpiCard label={S.pph21Label} value={fmtRupiah(monthly.pph21)} hint={monthly.taxRow ? S.periodStatus.replace("{n}", String(monthly.taxRow.status)) : S.noPeriod} chip="amber" />
            </div>
            <Card className="p-4">
              <CardHeader title={S.compareLastMonth.replace("{n}", prevMonth)} subtitle={S.deltaRevCostProfit} />
              <div className="grid grid-cols-1 gap-2 px-5 pb-5 text-sm sm:grid-cols-3">
                <div className="flex justify-between"><span className="text-steel-500">{S.revDeltaVsMonth}</span><span className="font-semibold">{fmtRupiah(monthly.revenue - monthlyPrev.revenue)}</span></div>
                <div className="flex justify-between"><span className="text-steel-500">{S.costDeltaVsMonth}</span><span className="font-semibold">{fmtRupiah(monthly.cost - monthlyPrev.cost)}</span></div>
                <div className="flex justify-between"><span className="text-steel-500">{S.profitDelta}</span><span className="font-semibold">{fmtRupiah(monthly.laba - monthlyPrev.laba)}</span></div>
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <CardHeader title={S.pnlBrief} subtitle={S.pnlSub} />
                <div className="space-y-1.5 px-5 pb-5 text-sm">
                  <div className="flex justify-between"><span className="text-steel-500">{S.revenueLabel}</span><span className="font-semibold">{fmtRupiah(monthly.revenue)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">{S.costLabel}</span><span className="font-semibold">{fmtRupiah(monthly.cost)}</span></div>
                  <div className="flex justify-between border-t border-steel-100 pt-2"><span className="text-steel-500">{S.profitLabel}</span><span className="font-bold text-navy-900">{fmtRupiah(monthly.laba)}</span></div>
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title={S.taxThisMonth} subtitle={S.taxSub} />
                <div className="space-y-1.5 px-5 pb-5 text-sm">
                  <div className="flex justify-between"><span className="text-steel-500">{S.ppnOut}</span><span className="font-semibold">{fmtRupiah(monthly.ppnKeluar)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">{S.ppnIn}</span><span className="font-semibold">{fmtRupiah(monthly.ppnMasuk)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">{S.pph23Label}</span><span className="font-semibold">{fmtRupiah(monthly.pph23)}</span></div>
                  <div className="flex justify-between"><span className="text-steel-500">{S.pph21Label}</span><span className="font-semibold">{fmtRupiah(monthly.pph21)}</span></div>
                  {monthly.taxRow && <p className="text-xs text-steel-400">{S.taxPeriodDetail.replace("{a}", String(monthly.taxRow.period)).replace("{b}", String(monthly.taxRow.status)).replace("{c}", fmtTanggal(String(monthly.taxRow.reportedAt ?? "")))}</p>}
                </div>
              </Card>
            </div>
          </div>
        )}

        {mode === "Per Proyek" && (
          !project ? (
            <EmptyState title={S.emptyProjects} subtitle={S.pickOtherBranch} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label={S.budgetVsActual} value={fmtMiliar(num(project.actual))} hint={S.fromAmount.replace("{n}", fmtMiliar(num(project.budget)))} chip="navy" />
                <KpiCard label={S.progressLabel} value={`${num(project.progress)}%`} hint={String(project.status ?? "")} chip="teal" />
                <KpiCard label={S.boqTotal} value={fmtMiliar(boqTotal)} hint={S.itemCountSuffix.replace("{n}", fmtJumlah(boqRows.length))} chip="violet" />
                <KpiCard label={S.invoiceLabel} value={fmtMiliar(projInvTotal)} hint={S.invoiceCount.replace("{n}", fmtJumlah(projInvoices.length))} chip="amber" />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="p-4">
                  <CardHeader title={S.wbsTop} subtitle={S.top5Jobs} />
                  <div className="space-y-2 px-5 pb-5 text-xs">
                    {wbsTop.map((w, i) => (
                      <div key={i}>
                        <div className="flex justify-between"><span className="truncate font-medium text-navy-900" title={w.task}>{w.task}</span><span className="text-steel-500">{w.progress}%</span></div>
                        <ProgressBar value={num(w.progress)} className="mt-1" />
                      </div>
                    ))}
                    {wbsTop.length === 0 && <p className="text-steel-400">{S.noWbs}</p>}
                  </div>
                </Card>
                <Card className="p-4">
                  <CardHeader title={S.projectNcr} subtitle={S.findingsCount.replace("{n}", fmtJumlah(projNcr.length))} />
                  <div className="space-y-2 px-5 pb-5 text-xs">
                    {projNcr.slice(0, 6).map((n) => {
                      const sev = String(n.severity ?? n.type ?? "");
                      return (
                      <div key={n.id} className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-navy-900">{n.id}</span>
                        <Badge tone={sev === "Critical" ? "red" : sev === "Major" ? "amber" : "blue"}>{sev}</Badge>
                        <StatusBadge status={String(n.status)} />
                      </div>
                      );
                    })}
                    {projNcr.length === 0 && <p className="text-steel-400">{S.nihilNcr}</p>}
                  </div>
                </Card>
                <Card className="p-4">
                  <CardHeader title={S.lastActivities} subtitle={S.fromActivityFeed} />
                  <div className="space-y-2 px-5 pb-5 text-xs text-steel-600">
                    {projActivities.map((a) => (
                      <p key={a.id}><strong className="text-navy-900">{String(a.actor)}</strong> {String(a.action)} <span className="font-mono">{String(a.target)}</span></p>
                    ))}
                    {projActivities.length === 0 && <p className="text-steel-400">{S.noRelatedActivity}</p>}
                  </div>
                </Card>
              </div>
            </div>
          )
        )}
        <div className="mt-4 rounded-xl border border-steel-100 bg-surface p-4 text-sm">
          <p className="font-semibold text-navy-900">{S.endorsement}</p>
          {sigName.trim() ? (
            <p className="mt-1 text-steel-600">{S.endorsedBy.replace("{a}", sigName.trim()).replace("{b}", sigRole.trim() ? S.endorsedRoleSuffix.replace("{n}", sigRole.trim()) : "").replace("{c}", fmtTanggal(sigDate))}</p>
          ) : (
            <p className="mt-1 text-xs text-steel-400">{S.fillSignHint}</p>
          )}
        </div>
      </div>

      <Card className="mt-4 p-4">
        <CardHeader title={S.archiveSent} subtitle={S.archiveSub} />
        <div className="space-y-1.5 px-5 pb-5 text-sm">
          {arc.map((a, i) => (
            <div key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
              <span className="font-mono font-semibold text-navy-900">{a.name}</span>
              <Badge tone="gray">{a.mode}</Badge>
              <span className="truncate text-xs text-steel-500">{a.info}</span>
              <span className="ml-auto text-xs text-steel-500">{fmtTanggal(a.at)}</span>
            </div>
          ))}
          {arc.length === 0 && <p className="text-xs text-steel-400">{S.noArchivedReports}</p>}
        </div>
      </Card>
    </div>
  );
}
