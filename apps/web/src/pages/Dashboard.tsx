import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Anchor,
  Wallet,
  TrendingUp,
  ArrowRight,
  Boxes,
  Sparkles,
  Cpu,
  Plus,
  Download,
  Calendar,
  AlertTriangle,
  FileCheck2,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Tooltip,
} from "recharts";
import {
  Card,
  CardHeader,
  KpiCard,
  PageHeader,
  RadialGauge,
  Donut,
  ChartTooltip,
  Stagger,
  StaggerItem,
  GlowCard,
  Badge,
  ProgressBar,
  Avatar,
  Modal,
  Field,
  toast,
} from "../components/ui";
import { useStore } from "../data/store";
import type { StoreItem } from "../data/store";
import { getSetting } from "../utils/settings";
import { useAuth, canSetTarget } from "../auth/auth";
import { exportExcel } from "../utils/export";
import { todayISO } from "../utils/format";
import {
  revenueSeries,
  sparkRevenue,
  sparkMargin,
  sparkProjects,
  sparkUtil,
  utilSeries,
  marginSeries,
  drydockLoad,
  insights,
  fmtMiliar,
} from "../data";

const RANGES = ["6B", "12B"] as const;

interface BranchTarget { revenue: number; projects: number }

function loadTargets(): Record<string, BranchTarget> {
  try {
    const raw = localStorage.getItem("isms.targets");
    const obj = raw ? JSON.parse(raw) as Record<string, BranchTarget> : {};
    return typeof obj === "object" && obj !== null ? obj : {};
  } catch { return {}; }
}

export default function Dashboard() {
  const { data, wbsFor, branch } = useStore();
  const { user } = useAuth();
  const allowedTarget = canSetTarget(user?.role);
  const navigate = useNavigate();
  const projects = data.projects;
  const branchProjects = data.projects.filter((p) => branch === "SEMUA" || !p.branch || p.branch === branch);
  const activities = data.activities;
  const [range, setRange] = useState<(typeof RANGES)[number]>("12B");
  const [targets, setTargets] = useState<Record<string, BranchTarget>>(() => loadTargets());
  const [showTarget, setShowTarget] = useState(false);
  const [tgtRev, setTgtRev] = useState("");
  const [tgtProj, setTgtProj] = useState("");
  const totalActive = projects.filter((p) => p.status !== "Selesai").length;
  const delayed = projects.filter((p) => p.status === "Terlambat").length;
  const activeContracts = projects
    .filter((p) => p.status !== "Selesai")
    .reduce((s, p) => s + Number(p.budget || 0), 0);
  const drydocks = data.drydocks;
  const openNcr = data.ncr.filter((n) => n.status !== "Tertutup").length;
  const arOutstanding = data.invoices
    .filter((i) => i.status !== "Lunas" && i.status !== "Draft")
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  const lowStock = data.inventory.filter((i) => i.stock <= i.minStock);
  const stockValue = data.inventory.reduce((s, i) => s + Number(i.stock || 0) * Number(i.cost || 0), 0);
  const wonQuotes = data.quotations.filter((x) => x.stage === "Menang").reduce((s, x) => s + Number(x.value || 0), 0);
  const utilDrydock =
    Math.round((drydocks.filter((d) => d.status === "Terpakai").length / drydocks.length) * 100);
  const utilEquipment = Math.round(utilSeries[utilSeries.length - 1].equipment);

  const chartData =
    range === "12B" ? revenueSeries : revenueSeries.slice(-6);

  const lastRev = revenueSeries[revenueSeries.length - 1];
  const prevRev = revenueSeries[revenueSeries.length - 2];
  const revGrowth = prevRev && prevRev.revenue ? ((lastRev.revenue - prevRev.revenue) / prevRev.revenue) * 100 : 0;
  const lastMargin = marginSeries[marginSeries.length - 1];
  const prevMargin = marginSeries[marginSeries.length - 2];
  const marginDiff = lastMargin && prevMargin ? lastMargin.margin - prevMargin.margin : 0;
  const lastUtil = utilSeries[utilSeries.length - 1];
  const prevUtil = utilSeries[utilSeries.length - 2];
  const utilDiff = lastUtil && prevUtil ? lastUtil.equipment - prevUtil.equipment : 0;
  const activeEmployees = data.employees.filter((e) => e.status === "Aktif").length;
  const seaTrialVessel =
    projects.find((p) => p.status !== "Selesai" && (p.scope ?? []).includes("Sea Trial"))?.vessel ?? "—";

  const exportSummary = () => {
    const rows: (string | number)[][] = [
      ["ID Proyek", "Kapal", "Progres (%)", "Anggaran (Rp)", "Realisasi (Rp)"],
      ...projects.map((p) => [p.id, p.vessel, Number(p.progress || 0), Number(p.budget || 0), Number(p.actual || 0)]),
    ];
    exportExcel(rows, "Ringkasan Portofolio");
    toast("Ringkasan portofolio diekspor ke Excel");
  };

  const tgt = targets[branch] ?? { revenue: 0, projects: 0 };
  const aktualRev = branchProjects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const aktualProj = branchProjects.filter((p) => p.status !== "Selesai").length;

  const saveTarget = () => {
    if (!allowedTarget) { toast("Hanya Direktur / Manager yang dapat mengatur target", "info"); return; }
    const revenue = Number(tgtRev);
    const nProj = Number(tgtProj);
    if (!Number.isFinite(revenue) || revenue < 0 || !Number.isFinite(nProj) || nProj < 0) { toast("Target harus angka ≥ 0", "info"); return; }
    const next = { ...targets, [branch]: { revenue, projects: Math.round(nProj) } };
    setTargets(next);
    try { localStorage.setItem("isms.targets", JSON.stringify(next)); } catch { /* abaikan */ }
    toast(`Target ${branch} disimpan`);
    setShowTarget(false);
    setTgtRev("");
    setTgtProj("");
  };

  const openTargetModal = () => {
    if (!allowedTarget) { toast("Hanya Direktur / Manager yang dapat mengatur target", "info"); return; }
    setTgtRev(String(tgt.revenue || ""));
    setTgtProj(String(tgt.projects || ""));
    setShowTarget(true);
  };

  const togglePresent = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch { toast("Fullscreen tidak didukung browser ini", "info"); }
  };

  const totalRevenue = revenueSeries.reduce((s, d) => s + d.revenue, 0);
  const totalRevenueLabel = `Rp ${totalRevenue.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  const typeDist = (["New Build", "Repair", "Retrofit"] as const).map((t, i) => ({
    name: t,
    value: projects.filter((p) => p.type === t).length,
    color: ["#0b3a63", "#2e9ad4", "#22c55e"][i],
  }));
  const pipelineActive = data.quotations
    .filter((x) => x.stage !== "Menang")
    .reduce((s, x) => s + Number(x.value || 0), 0);

  const today = todayISO();
  const todayMs = Date.parse(today);
  const msDays = getSetting(data, "ALERT_MILESTONE_DAYS", 7);
  const cpDays = getSetting(data, "ALERT_CP_DAYS", 3);
  const cert90 = getSetting(data, "ALERT_CERT_DAYS", 90);
  const cert60 = getSetting(data, "ALERT_CERT_60", 60);
  const cert30 = getSetting(data, "ALERT_CERT_30", 30);
  const wbsEndMs = (end: string): number | null => {
    const m = /^(\d{4})-(\d{2})/.exec(String(end ?? ""));
    if (!m) {
      const t = Date.parse(String(end ?? ""));
      return Number.isNaN(t) ? null : t;
    }
    return new Date(Number(m[1]), Number(m[2]), 0).getTime();
  };
  const hasRealWbs = (pid: string): boolean => Boolean(data.wbsByProject?.[pid]?.length);
  const staleMilestones = branchProjects.flatMap((p) =>
    !hasRealWbs(p.id)
      ? []
      : wbsFor(p.id)
      .filter((w) => Number(w.progress || 0) === 0)
      .filter((w) => {
        const t = wbsEndMs(w.end);
        if (t === null) return false;
        const diff = Math.ceil((t - todayMs) / 86400000);
        return diff >= 0 && diff <= msDays;
      })
      .map((w) => ({ project: p.id, task: w.task }))
  );
  const cpDelayed = branchProjects.filter((p) =>
    hasRealWbs(p.id) &&
    wbsFor(p.id).some((w) => {
      if (Number(w.progress || 0) !== 0) return false;
      const t = wbsEndMs(w.end);
      if (t === null) return false;
      return Math.floor((todayMs - t) / 86400000) > cpDays;
    })
  );
  const budgetTight = branchProjects.filter((p) => {
    const b = Number(p.budget || 0);
    if (!b) return false;
    const r = Number(p.actual || 0) / b;
    return r > 0.8 && r <= 1;
  });
  const overrun = branchProjects.filter((p) => Number(p.actual || 0) > Number(p.budget || 0));
  const overrun10 = overrun.filter((p) => Number(p.actual || 0) > Number(p.budget || 0) * 1.1);
  const certDaysUntil = (exp: string): number | null => {
    const t = wbsEndMs(exp);
    if (t === null) return null;
    return Math.ceil((t - todayMs) / 86400000);
  };
  const vesselCertTier = (v: StoreItem): "crit" | "warn" | "info" | null => {
    let best: number | null = null;
    for (const c of (v.certificates ?? []) as { expires?: string }[]) {
      const d = certDaysUntil(String(c.expires ?? ""));
      if (d === null || d > cert90) continue;
      if (best === null || d < best) best = d;
    }
    if (best === null) return null;
    if (best <= cert30) return "crit";
    if (best <= cert60) return "warn";
    return "info";
  };
  const certCrit = data.vessels.filter((v) => vesselCertTier(v) === "crit");
  const certWarn = data.vessels.filter((v) => vesselCertTier(v) === "warn");
  const certInfo = data.vessels.filter((v) => vesselCertTier(v) === "info");
  const overdueInvoices = data.invoices.filter(
    (i) => i.status !== "Lunas" && i.status !== "Draft" && String(i.due) < today
  );
  const overdueDays = (due: string) => Math.floor((todayMs - Date.parse(String(due))) / 86400000);
  const overdue730 = overdueInvoices.filter((i) => overdueDays(String(i.due)) >= 30);
  const overdue14 = overdueInvoices.filter((i) => { const d = overdueDays(String(i.due)); return d >= 14 && d < 30; });
  const overdue7 = overdueInvoices.filter((i) => { const d = overdueDays(String(i.due)); return d >= 7 && d < 14; });
  const latestIncident = [...data.incidents].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const delayedProjects = branchProjects.filter((p) => p.status === "Terlambat");

  const attention: { icon: typeof Boxes; text: string; to: string; tone: string }[] = [
    ...(staleMilestones.length
      ? [{ icon: AlertTriangle, text: `${staleMilestones.length} milestone 0% berakhir ≤${msDays} hari (${staleMilestones[0].project})`, to: "/proyek", tone: "bg-amber-50 text-amber-600" }]
      : []),
    ...(cpDelayed.length
      ? [{ icon: Clock, text: `${cpDelayed.length} proyek critical-path delay >${cpDays} hari (${cpDelayed[0].id})`, to: "/proyek/monitoring", tone: "bg-rose-50 text-rose-600" }]
      : []),
    ...(budgetTight.length
      ? [{ icon: Wallet, text: `${budgetTight.length} proyek serapan >80% (${budgetTight[0].id})`, to: "/proyek", tone: "bg-amber-50 text-amber-600" }]
      : []),
    ...(overrun.length
      ? [{ icon: AlertTriangle, text: `${overrun.length} proyek overrun${overrun10.length ? ` (${overrun10.length} di antaranya >10%)` : ""}`, to: "/keuangan", tone: "bg-rose-50 text-rose-600" }]
      : []),
    ...(lowStock.length
      ? [{ icon: Boxes, text: `${lowStock.length} item stok di bawah minimum`, to: "/inventori", tone: "bg-amber-50 text-amber-600" }]
      : []),
    ...(certCrit.length
      ? [{ icon: FileCheck2, text: `${certCrit.length} kapal sertifikat kritis/kedaluwarsa ≤${cert30} hari`, to: "/kapal", tone: "bg-rose-50 text-rose-600" }]
      : []),
    ...(certWarn.length
      ? [{ icon: FileCheck2, text: `${certWarn.length} kapal sertifikat warning ≤${cert60} hari`, to: "/kapal", tone: "bg-amber-50 text-amber-600" }]
      : []),
    ...(certInfo.length
      ? [{ icon: FileCheck2, text: `${certInfo.length} kapal sertifikat info ≤${cert90} hari`, to: "/kapal", tone: "bg-ocean-50 text-ocean-600" }]
      : []),
    ...(overdueInvoices.length
      ? [{ icon: Wallet, text: `${overdueInvoices.length} invoice overdue (7h: ${overdue7.length} · 14h: ${overdue14.length} · 30h+: ${overdue730.length})`, to: "/keuangan", tone: "bg-rose-50 text-rose-600" }]
      : []),
    ...(latestIncident
      ? [{ icon: Clock, text: `Insiden terbaru: ${latestIncident.id} — ${latestIncident.desc}`, to: "/qc-safety", tone: "bg-violet-50 text-violet-600" }]
      : []),
    ...(delayedProjects.length
      ? [{ icon: AlertTriangle, text: `${delayedProjects.length} proyek Terlambat (${delayedProjects[0].id})`, to: "/proyek", tone: "bg-rose-50 text-rose-600" }]
      : []),
  ];

  return (
    <Stagger className="space-y-5">
      <StaggerItem>
        <PageHeader
          title="Dashboard Eksekutif"
          subtitle="PT Syukur Bersaudara — pusat kendali operasional galangan, Samarinda real-time"
          icon={<TrendingUp className="h-5 w-5" />}
          actions={
            <>
              <button className="btn-secondary" onClick={togglePresent}>
                <Sparkles className="h-4 w-4" /> Presentasi
              </button>
              <button className="btn-secondary" onClick={exportSummary}>
                <Download className="h-4 w-4" /> Ekspor
              </button>
              <button className="btn-primary-gradient" onClick={() => navigate("/proyek")}>
                <Plus className="h-4 w-4" /> Proyek Baru
              </button>
            </>
          }
        />
      </StaggerItem>

      {/* TARGET VS AKTUAL — atur via tombol, hanya Direktur/Manager */}
      <StaggerItem>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-navy-900">Target vs Aktual · {branch}</h3>
            {allowedTarget ? (
              <button className="btn-secondary text-xs" onClick={openTargetModal}>Atur Target</button>
            ) : (
              <span className="text-xs text-steel-400">Hanya Direktur / Manager dapat mengatur</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 px-1 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-steel-500">Revenue aktual vs target</span><span className="font-semibold text-navy-900">{fmtMiliar(aktualRev)} / {fmtMiliar(tgt.revenue)}</span></div>
              <ProgressBar value={tgt.revenue > 0 ? (aktualRev / tgt.revenue) * 100 : 0} tone="navy" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-steel-500">Proyek aktual vs target</span><span className="font-semibold text-navy-900">{aktualProj} / {tgt.projects}</span></div>
              <ProgressBar value={tgt.projects > 0 ? (aktualProj / tgt.projects) * 100 : 0} tone="teal" />
            </div>
          </div>
        </Card>
      </StaggerItem>

      <Modal open={showTarget} onClose={() => setShowTarget(false)} title={`Atur Target · ${branch}`} subtitle="Hanya Direktur / Manager — tersimpan per cabang per perangkat"
        footer={<><button className="btn-secondary" onClick={() => setShowTarget(false)}>Batal</button><button className="btn-primary" onClick={saveTarget}>Simpan Target</button></>}>
        <div className="space-y-3">
          <Field label="Target revenue (Rp)"><input type="number" min={0} className="input" placeholder="cth: 50000000000" value={tgtRev} onChange={(e) => setTgtRev(e.target.value)} /></Field>
          <Field label="Target proyek aktif"><input type="number" min={0} className="input" placeholder="cth: 8" value={tgtProj} onChange={(e) => setTgtProj(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* HERO GLOW BANNER */}
      <StaggerItem>
        <GlowCard gradient="gradient-hero">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-steel-300">Total Nilai Portofolio Berjalan</p>
                <p className="text-3xl font-bold tracking-tight">{fmtMiliar(activeContracts)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="teal" className="bg-white/15 border-white/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sistem Operasional
              </Badge>
              <span className="px-3 py-1.5 rounded-lg bg-white/15 text-sm font-medium">
                {activeEmployees} pekerja aktif
              </span>
            </div>
          </div>
        </GlowCard>
      </StaggerItem>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <KpiCard
            label="Proyek Aktif"
            value={String(totalActive)}
            delta={`${delayed} terlambat`}
            deltaDirection="down"
            icon={<Anchor className="h-5 w-5" />}
            chip="navy"
            spark={sparkProjects}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Pendapatan 12 Bulan"
            value={totalRevenueLabel}
            delta={`${revGrowth >= 0 ? "+" : ""}${revGrowth.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% vs bulan lalu`}
            deltaDirection={revGrowth > 0 ? "up" : revGrowth < 0 ? "down" : "flat"}
            icon={<Wallet className="h-5 w-5" />}
            chip="teal"
            spark={sparkRevenue}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Margin Bruto"
            value={`${lastMargin.margin.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
            delta={`${marginDiff >= 0 ? "+" : ""}${marginDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin vs bulan lalu`}
            deltaDirection={marginDiff > 0 ? "up" : marginDiff < 0 ? "down" : "flat"}
            icon={<TrendingUp className="h-5 w-5" />}
            chip="violet"
            spark={sparkMargin}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Utilitas Equipment"
            value={`${utilEquipment}%`}
            delta={`${utilDiff >= 0 ? "+" : ""}${utilDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin vs bulan lalu`}
            deltaDirection={utilDiff > 0 ? "up" : utilDiff < 0 ? "down" : "flat"}
            icon={<Cpu className="h-5 w-5" />}
            chip="amber"
            spark={sparkUtil}
          />
        </StaggerItem>
      </div>

      {/* RINGKASAN OPERASIONAL — pindahan strip, tepat di bawah 4 kartu utama */}
      <StaggerItem>
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
                <Boxes className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">Nilai Stok {lowStock.length > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{lowStock.length} menipis</span>}</p>
                <Link to="/inventori" className="text-lg font-bold text-gradient-navy hover:underline">{fmtMiliar(stockValue)}</Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Calendar className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">Sea Trial Terjadwal</p>
                <p className="text-lg font-bold text-gradient-navy">{seaTrialVessel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Anchor className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">Quotation Aktif</p>
                <Link to="/crm" className="text-lg font-bold text-gradient-navy hover:underline">{fmtMiliar(pipelineActive)}</Link>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 border-t border-steel-100 pt-3 sm:grid-cols-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel-500">NCR terbuka</span>
              <Link to="/qc-safety" className="font-bold text-rose-600 hover:underline">{openNcr} kasus</Link>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel-500">Piutang tertagih</span>
              <Link to="/keuangan" className="font-bold text-navy-900 hover:underline">{fmtMiliar(arOutstanding)}</Link>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel-500">Kontrak menang (CRM)</span>
              <Link to="/crm" className="font-bold text-navy-900 hover:underline">{fmtMiliar(wonQuotes)}</Link>
            </div>
          </div>
        </Card>
      </StaggerItem>

      {/* PERLU PERHATIAN */}
      <StaggerItem>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-semibold text-navy-900">Perlu Perhatian ({attention.length})</h3>
            <span className="text-xs text-steel-400">Ambang otomatis dari data berjalan</span>
          </div>
          {attention.length === 0 && (
            <p className="px-1 text-sm text-steel-400">Semua ambang dalam batas aman.</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {attention.map((a, i) => (
              <Link key={i} to={a.to} className="flex items-start gap-2.5 rounded-xl border border-steel-100 bg-surface p-3 hover:border-ocean-400">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.tone}`}>
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-medium leading-relaxed text-navy-800">{a.text}</span>
              </Link>
            ))}
          </div>
        </Card>
      </StaggerItem>

      {/* STATUS + ACTIVITY — tepat di bawah Perlu Perhatian */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StaggerItem>
          <Card>
            <CardHeader
              title="Status Proyek Aktif"
              subtitle="Progres terbaru"
              action={
                <Link to="/proyek" className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-600 hover:text-ocean-500">
                  Lihat semua <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="divide-y divide-steel-100">
              {branchProjects.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  to={`/proyek/${p.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy-900 truncate" title={p.vessel}>{p.vessel}</p>
                    <p className="text-xs text-steel-500">{p.id} · {p.client}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <ProgressBar value={p.progress} tone={p.status === "Terlambat" ? "red" : "navy"} />
                      <p className="mt-1 text-right text-[11px] text-steel-500">{p.progress}%</p>
                    </div>
                    <Badge tone={p.status === "Terlambat" ? "red" : p.status === "Selesai" ? "green" : "blue"}>
                      {p.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Aktivitas Terkini" subtitle="Log real-time di seluruh modul" />
            <div className="space-y-1 p-3">
              {activities.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface">
                  <Avatar name={a.actor} className="h-8 w-8 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-steel-700" title={`${a.actor} ${a.action} ${a.target}`}>
                      <span className="font-semibold text-navy-900">{a.actor}</span> {a.action}{" "}
                      <span className="font-medium text-navy-800">{a.target}</span>
                    </p>
                    <p className="text-[11px] text-steel-400">{a.module} · {a.time}</p>
                  </div>
                  <Badge tone={a.tone as never}>{a.module}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>
      </div>

      {/* MAIN CHARTS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Pendapatan & Volume Proyek"
              subtitle="Tren 12 bulan terakhir (dalam miliar Rupiah)"
              action={
                <div className="flex items-center gap-1 rounded-lg border border-steel-200 bg-surface p-0.5">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        range === r ? "bg-white text-navy-800 shadow-sm" : "text-steel-500 hover:text-navy-700"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="h-64 p-4 pt-0 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0b3a63" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0b3a63" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <YAxis yAxisId="proj" orientation="right" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v) => (typeof v === "number" ? `Rp ${v} M` : v)} />} />
                  <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Pendapatan" stroke="#0b3a63" strokeWidth={2.5} fill="url(#revGrad)" />
                  <Bar yAxisId="proj" dataKey="projects" name="Jumlah Proyek" fill="#8cc9e8" radius={[4, 4, 0, 0]} barSize={16} />
                  <Line yAxisId="rev" type="monotone" dataKey="cost" name="Biaya" stroke="#e11d48" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Komposisi Proyek" subtitle="Berdasarkan jenis pekerjaan" />
            <div className="flex flex-col items-center gap-4 p-4">
              <Donut
                data={typeDist}
                colors={typeDist.map((d) => d.color)}
                size={170}
                thickness={22}
                centerValue={String(typeDist.reduce((s, d) => s + d.value, 0))}
                centerLabel="proyek"
              />
              <div className="grid w-full grid-cols-2 gap-2">
                {typeDist.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                    <span className="text-steel-600">{d.name}</span>
                    <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </StaggerItem>
      </div>

      {/* GAUGES + HEATMAP + INSIGHTS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <StaggerItem className="lg:col-span-2">
          <Card>
            <CardHeader title="Utilisasi Kapasitas" subtitle="Drydock, slipway & berth" />
            <div className="p-4">
              <div className="mb-3 flex items-end gap-2">
                <span className="text-3xl font-bold text-navy-900">{utilDrydock}%</span>
                <span className="pb-1 text-xs text-steel-500">dari {drydocks.length} fasilitas terpasang</span>
              </div>
              <div className="space-y-3">
                {drydockLoad.map((d) => (
                  <div key={d.dock}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-steel-600">{d.dock}</span>
                      <span className="font-semibold text-navy-800">{d.kapasitas}%</span>
                    </div>
                    <ProgressBar value={d.kapasitas} tone={d.kapasitas > 85 ? "red" : d.kapasitas > 70 ? "amber" : "navy"} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Produksi & Utilisasi" subtitle="Tren drydock vs equipment" />
            <div className="flex items-center justify-center gap-6 p-4">
              <RadialGauge value={utilDrydock} label="Drydock" color="#0b3a63" />
              <RadialGauge value={utilEquipment} label="Equipment" color="#2e9ad4" />
            </div>
            <div className="mt-2 -mb-1 h-16 px-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={utilSeries} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2e9ad4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2e9ad4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="equipment" stroke="#2e9ad4" strokeWidth={2} fill="url(#utilGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title="Wawasan Cerdas" subtitle="Rekomendasi otomatis" />
            <div className="space-y-2.5 p-4 pt-0">
              {insights.map((i) => {
                const dot =
                  i.tone === "rose" ? "bg-rose-500" : i.tone === "teal" ? "bg-teal-500" : i.tone === "violet" ? "bg-violet-500" : "bg-ocean-500";
                return (
                  <div key={i.id} className="rounded-xl border border-steel-100 bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      <p className="text-sm font-semibold text-navy-900">{i.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-steel-500 leading-relaxed">{i.desc}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </StaggerItem>
      </div>

    </Stagger>
  );
}
