import { useEffect, useMemo, useState } from "react";
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
  Maximize,
  Minimize,
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
  NumInput,
  AsyncButton,
} from "../components/ui";
import { useStore } from "../data/store";
import type { CollectionKey } from "../data/store";
import { useModuleSync } from "../data/useModuleSync";
import { bucketByMonth, monthAxis, monthKeyOf, rebindLegacyMonthSeries } from "../utils/monthAxis";
import { lastPoint, numOf, pctChange, prevPoint } from "../utils/series";
import { warnLevelOf } from "../utils/inventoryWarn";
import {
  MODULE_ALERT_TO,
  buildModuleAlertItems,
  type ModuleAlertItem,
  type ModuleAlertKey,
} from "../utils/moduleAlerts";

/* Urutan modul untuk kartu "Perlu Perhatian". */
const DASH_ALERT_KEYS: ModuleAlertKey[] = [
  "proyek",
  "drydock",
  "equipment",
  "qc",
  "inventori",
  "keuangan",
  "crm",
  "procurement",
  "subkontraktor",
  "kapal",
  "sdm",
  "payroll",
  "dokumen",
];

/* Label modul untuk chip pengelompokan di kartu. */
const DASH_ALERT_LABEL: Record<ModuleAlertKey, { id: string; en: string }> = {
  proyek: { id: "Proyek", en: "Projects" },
  drydock: { id: "Drydock", en: "Drydock" },
  inventori: { id: "Inventori", en: "Inventory" },
  equipment: { id: "Equipment", en: "Equipment" },
  subkontraktor: { id: "Subkontraktor", en: "Subcontractors" },
  qc: { id: "QC & Safety", en: "QC & Safety" },
  crm: { id: "CRM", en: "CRM" },
  procurement: { id: "Procurement", en: "Procurement" },
  keuangan: { id: "Keuangan", en: "Finance" },
  sdm: { id: "SDM", en: "HR" },
  payroll: { id: "Payroll", en: "Payroll" },
  kapal: { id: "Kapal", en: "Vessels" },
  dokumen: { id: "Dokumen", en: "Documents" },
};

/* Nada chip per modul supaya kartu mudah dipindai sekilas. */
const DASH_ALERT_TONE: Record<ModuleAlertKey, string> = {
  proyek: "bg-navy-50 text-navy-700",
  drydock: "bg-ocean-50 text-ocean-700",
  inventori: "bg-amber-50 text-amber-700",
  equipment: "bg-violet-50 text-violet-700",
  subkontraktor: "bg-teal-50 text-teal-700",
  qc: "bg-rose-50 text-rose-700",
  crm: "bg-emerald-50 text-emerald-700",
  procurement: "bg-indigo-50 text-indigo-700",
  keuangan: "bg-amber-50 text-amber-700",
  sdm: "bg-sky-50 text-sky-700",
  payroll: "bg-lime-50 text-lime-700",
  kapal: "bg-cyan-50 text-cyan-700",
  dokumen: "bg-slate-100 text-slate-700",
};

/* Batas tampilan: kartu harus tetap ringkas. Sisanya ada di /notifikasi. */
const DASH_ALERT_CAP = 12;
import { useAuth, canSetTarget } from "../auth/auth";

import { pdfServerReady } from "../services/pdfClient";
import { usePdfDoc } from "../components/usePdfDoc";
import { todayISO } from "../utils/format";
import { scopeNames } from "../utils/scope";
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
import { useT } from "../i18n/LanguageContext";
import { n_misc } from "../i18n/n_misc";

const RANGES = ["6B", "12B"] as const;

/* Label status untuk card analisis status proyek yang sedang berjalan.
   "Proyek Terlambat" dan "Proyek Tertunda" memakai awalan yang sama supaya
   keduanya mudah dibandingkan berdampingan di strip distribusi - permintaan
   eksplisit: label "tertunda" perlu ada selain "terlambat". Status lain sudah
   berupa kalimat yang berdiri sendiri sehingga ditampilkan apa adanya.
   Satu sumber untuk strip distribusi DAN badge per baris: sebelumnya keduanya
   menulis pemetaan sendiri-sendiri dan mudah berbeda. */
const STATUS_LABEL: Record<string, string> = {
  Terlambat: "Proyek Terlambat",
  Tertunda: "Proyek Tertunda",
  Selesai: "Proyek Selesai",
  Batal: "Proyek Dibatalkan",
};
const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

/* RANGES tetap: 6B = 6 bulan, 12B = 12 bulan. */

interface BranchTarget { revenue: number; projects: number }

function loadTargets(): Record<string, BranchTarget> {
  try {
    const raw = localStorage.getItem("isms.targets");
    const obj = raw ? JSON.parse(raw) as Record<string, BranchTarget> : {};
    return typeof obj === "object" && obj !== null ? obj : {};
  } catch { return {}; }
}

/* Batch koleksi modul Dashboard untuk useModuleSync (pengganti resync penuh). */
const DB_COLS: CollectionKey[] = ["activities", "drydocks", "employees", "incidents", "inventory", "invoices", "ncr", "projects", "quotations", "vessels"];

export default function Dashboard() {

  const { data, branch, inBranch } = useStore();
  const pdfDoc = usePdfDoc();
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(DB_COLS);
  const { locale } = useT();
  const S = n_misc[locale];
  const { user } = useAuth();
  const allowedTarget = canSetTarget(user?.role);
  const navigate = useNavigate();
  const [isFs, setIsFs] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const branchProjects = inBranch(data.projects);
  const projects = branchProjects;
  const activities = data.activities;
  const [range, setRange] = useState<(typeof RANGES)[number]>("12B");
  const [targets, setTargets] = useState<Record<string, BranchTarget>>(() => loadTargets());
  const [showTarget, setShowTarget] = useState(false);
  const [tgtRev, setTgtRev] = useState("");
  const [tgtProj, setTgtProj] = useState("");
/* Hampir semua angka di Dashboard ini dulu dibaca dari `data.*` mentah,
     sedangkan modul tujuan memakai inBranch(). Akibatnya di luar cabang
     "SEMUA" kartu menampilkan angka global, tapi baris highlight-nya tidak
     ada di daftar tujuan, jadi klik hanya diam-diam tidak terjadi.
     Semua pembacaan di bawah sudah memakai inBranch. */
  const totalActive = branchProjects.filter((p) => p.status !== "Selesai").length;
  const delayed = branchProjects.filter((p) => p.status === "Terlambat").length;
  const activeContracts = branchProjects
    .filter((p) => p.status !== "Selesai")
    .reduce((s, p) => s + Number(p.budget || 0), 0);
  const drydocks = inBranch(data.drydocks);
  const openNcrList = inBranch(data.ncr).filter((n) => n.status !== "Tertutup");
  const openNcr = openNcrList.length;
  const criticalOpenNcr = openNcrList.filter((n) => n.severity === "Critical").length;

  /* Navigasi deep-link dari Dashboard: pindah modul + tab + highlight baris tujuan.
     Sekarang semua baris yang dihitung kartu ikut disorot, bukan hanya satu.

     BUG YANG DIPERBAIKI: ketiganya dulu meneruskan `highlight=<satu id>` -
     id pertama yang kebetulan ketemu. Jadi kartu "NCR Terbuka" yang menghitung
     lima baris hanya membuat SATU baris berkedip di tab tujuan, dan pengguna
     menyimpulkan sisanya tidak ada. Worse, kartu "Piutang Tertagih" yang
     menjumlahkan seluruh sisa piutang bisa menunjuk invoice yang justru LUNAS,
     karena urutannya tidak sama dengan urutan filter di tabel tujuan.

     Sekarang id dikirim sebagai daftar (dipisah koma; lihat useDeepLink.ts) dan
     tabel tujuan menyorot semuanya. Kartu tetap redirect ke modul + tab yang
     benar, dan baris notifikasi warning yang sudah ada tetap memakai
     .notif-hl - penanda kelompok hanya menambah, tidak menghapus. */
  const highlightOf = (ids: string[]): string =>
    ids.length > 0 ? `&highlight=${encodeURIComponent(ids.join(","))}` : "";

  /* Semua NCR terbuka di cabang aktif, urut stabil (paling kritis dulu). */
  const openNcrIds = openNcrList.map((n) => String(n.id));

  const goNcr = () => {
    const q = `?alert=qc&tab=NCR${highlightOf(openNcrIds)}`;
    navigate(`/qc-safety${q}`);
  };

  /* Piutang yang benar-benar masih harus ditagih: bukan Draft (belum tagih) dan
     bukan Lunas. Diurutkan jatuh tempo paling awal supaya baris pertama yang
     terlihat adalah yang paling mendesak. */
  const arRows = inBranch(data.invoices)
    .filter((i) => i.status !== "Lunas" && i.status !== "Draft")
    .sort((a, b) => String(a.due ?? "").localeCompare(String(b.due ?? "")));

  const goAR = () => {
    const q = `?alert=keuangan&tab=${encodeURIComponent("Piutang (AR)")}${highlightOf(arRows.map((i) => String(i.id)))}`;
    navigate(`/keuangan${q}`);
  };

  /* Kartu ini diarahkan ke tab "Kontrak" CRM, dan isi tab itu adalah
     `data.contracts` - BUKAN `data.quotations`. Versi lama mengirim id
     quotation ke tab Kontrak; CRM mencari id itu lebih dulu di daftar
     penawaran, jadi ia justru membuka tab "Penawaran" dan menimpa tab yang
     diminta - persis bug yang useDeepLink.ts bilang sudah ditutup.

     Jadi yang dikirim, yang dihitung, dan yang ditampilkan sekarang satu
     sumber: kontrak yang ditandatangani. Jumlah = kontrak, nilai = kontrak,
     id yang disorot = kontrak. */
  const wonContracts = inBranch(data.contracts).filter((k) => String(k.status ?? "") !== "Batal");
  const wonContractValue = wonContracts.reduce((s, k) => s + Number(k.value || 0), 0);

  const goKontrak = () => {
    const q = `?alert=crm&tab=Kontrak${highlightOf(wonContracts.map((k) => String(k.id)))}`;
    navigate(`/crm${q}`);
  };

  /* Kartu "Perlu Perhatian" berisi kondisi dari 13 modul sekaligus, jadi tidak
     ada satu tab tujuan yang memuat semuanya. Yang diklik adalah header kartu:
     buka /notifikasi pada tab "Perlu Perhatian" lalu sorot SEMUA baris alert
     yang tampil, supaya angka di kartu dan yang terlihat di layar sama.

Id tidak diteruskan di sini. Kartu ini memakai engine utils/moduleAlerts
     (ModuleAlertItem.id = "mod-qc-NCR-001") sedangkan /notifikasi memakai
     utils/alerts (NotifItem.id = "alert-<id>") - dua skema id yang berbeda
     dan tidak bisa dipetakan satu-satu tanpa tabel pemetaan yang rapuh.
     Jadi yang dikirim adalah perintah "tampilkan semua alert", dan halaman
     tujuan yang menyorot barisnya sendiri. */
  const goNotifikasi = () => navigate("/notifikasi?alert=1");
  const arOutstanding = inBranch(data.invoices)
    .filter((i) => i.status !== "Lunas" && i.status !== "Draft")
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  /* Badge "stok menipis" memakai klasifikasi yang sama dengan Katalog dan
     sidebar (inventoryWarn.warnLevelOf), bukan `stock <= minStock` telanjang.
     Aturan telanjang ikut menghitung kategori Service/Jasa yang minStok-nya
     memang tidak berlaku, sehingga badge ini pernah menampilkan angka yang
     tidak cocok dengan jumlah alert di /notifikasi. */
  const lowStock = inBranch(data.inventory).filter((i) => {
    const lv = warnLevelOf(i).level;
    return lv === "critical" || lv === "low";
  });
  const stockValue = inBranch(data.inventory).reduce((s, i) => s + Number(i.stock || 0) * Number(i.cost || 0), 0);
  /* Sumbu + angka revenue dari invoice yang SUNGGUHNYA bertanggal.
     withMonthLabels() lama memutar seed revenueSeries supaya bulan berjalan
     jadi titik terakhir, padahal numeriknya tidak berpindah: label
     "Okt 2026" menempel ke angka yang sebenarnya milik Oktober tahun lalu,
     sehingga grafik menampilkan pertumbuhan fiktif. Analytics.tsx:78
     mencatat pola ini sebagai "tidak bisa di tolerate" dan sudah
     menghapusnya di sana; halaman ini adalah sisa satu-satunya yang masih memakainya.

     Sekarang label dan angka berasal dari bulan yang sama lewat
     bucketByMonth(). Seed hanya jadi fallback kalau tidak ada invoice
     bertanggal sama sekali, supaya tab tidak kosong di install kosong.

     `revenue` dalam miliar, `cost` = nilai neto invoice, `projects` =
     jumlah proyek berbeda yang invoice di bulan itu. */
  const monthCount = range === "6B" ? 6 : 12;
  const revAxis = useMemo(() => monthAxis({ months: monthCount, locale }), [monthCount, locale]);

  const chartData = useMemo(() => {
    const invoices = inBranch(data.invoices);
    const bucket = bucketByMonth(
      invoices,
      revAxis,
      (i) => i.paidAt ?? i.date ?? i.due,
      (i) => Number(i.amount ?? 0),
      (vals) => Math.round((vals.reduce((s, x) => s + x, 0) / 1e9) * 100) / 100,
    );
    const anyReal = Object.values(bucket).some((v) => v > 0);
    if (!anyReal) {
      const base = monthCount >= revenueSeries.length ? revenueSeries : revenueSeries.slice(-monthCount);
      return rebindLegacyMonthSeries(base, { locale }).map((r) => ({
        bln: r.bln,
        revenue: Number(r.revenue || 0),
        cost: Number(r.cost || 0),
        projects: Number(r.projects || 0),
      }));
    }
    return revAxis.map((pt) => {
      const month = invoices.filter(
        (i) => monthKeyOf(i.paidAt ?? i.date ?? i.due) === pt.key,
      );
      const projects = new Set(month.map((i) => String(i.project ?? i.vessel ?? ""))).size;
      return {
        bln: pt.label,
        revenue: bucket[pt.key] ?? 0,
        cost: Math.round((month.reduce((s, i) => s + Number(i.neto ?? i.amount ?? 0), 0) / 1e9) * 100) / 100,
        projects,
      };
    });
  }, [data.invoices, branch, revAxis, monthCount, locale]);
  const utilDrydock = drydocks.length
    ? Math.round((drydocks.filter((d) => d.status === "Terpakai").length / drydocks.length) * 100)
    : 0;
  /* Ekor seri wajib dijaga: `utilSeries[len-1].equipment` melempar TypeError
     kalau deret seed kosong, dan karena render gagal seluruh pohon React
     ikut tumbang - bukan hanya kartu KPI ini. Helper lastPoint/prevPoint
     mengembalikan null; lihat utils/series.ts. */
  const utilLastPoint = lastPoint(utilSeries);
  const utilEquipment = Math.round(numOf(utilLastPoint?.equipment));

  /* Sumbu + angka revenue dari invoice yang SUNGGUHNYA bertanggal.
     withMonthLabels() lama memutar seed revenueSeries supaya bulan berjalan
     jadi titik terakhir - numeriknya tidak berpindah, jadi label "Okt 2026"
     menempel ke angka yang sebenarnya milik Oktober tahun lalu, dan grafik
     menampilkan pertumbuhan fiktif. Sekarang label dan angka berasal dari
     bulan yang sama lewat bucketByMonth(); seed hanya dipakai sebagai
     fallback kalau tidak ada invoice bertanggal sama sekali.

     `revenue` dalam miliar, `cost` = nilai_before_tax invoice, `projects`
     = jumlah proyek berbeda di invoice bulan itu. */

  const lastRev = lastPoint(revenueSeries);
  const prevRev = prevPoint(revenueSeries);
  const revGrowth = pctChange(numOf(lastRev?.revenue), numOf(prevRev?.revenue));
  const lastMargin = lastPoint(marginSeries);
  const prevMargin = prevPoint(marginSeries);
  const marginDiff = numOf(lastMargin?.margin) - numOf(prevMargin?.margin);
  const lastUtil = lastPoint(utilSeries);
  const prevUtil = prevPoint(utilSeries);
  const utilDiff = numOf(lastUtil?.equipment) - numOf(prevUtil?.equipment);
  const activeEmployees = inBranch(data.employees).filter((e) => e.status === "Aktif").length;
  const seaTrialVessel =
    projects.find((p) => p.status !== "Selesai" && scopeNames(p.scope).includes("Sea Trial"))?.vessel ?? "-";

  /* Ringkasan portofolio dicetak oleh server dari baris DB-nya sendiri.
   Versi lama menangkap DOM (`exportPDF` + html2canvas), jadi angka di PDF bisa
   berbeda dari pembukuan dan grafiknya jadi gambar. `monthCount` diteruskan
   sebagai filter; server yang menghitung. */
const exportSummary = async () => {
  if (!pdfServerReady()) {
    toast(S.tPortfolioPdfExported, "info");
    return;
  }
  const done = await pdfDoc.request(
    { kind: "analitik", locale, filters: { scope: "Dashboard", months: monthCount } },
    `Ringkasan-Portofolio-${todayISO()}`,
    false,
  );
  if (done) toast(S.tPortfolioPdfExported);
};

  const tgt = targets[branch] ?? { revenue: 0, projects: 0 };
  const aktualRev = branchProjects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const aktualProj = branchProjects.filter((p) => p.status !== "Selesai").length;

  const saveTarget = () => {
    if (!allowedTarget) { toast(S.tOnlyDirectorManager, "info"); return; }
    const revenue = Number(tgtRev);
    const nProj = Number(tgtProj);
    if (!Number.isFinite(revenue) || revenue < 0 || !Number.isFinite(nProj) || nProj < 0) { toast(S.tTargetNonNegative, "info"); return; }
    const next = { ...targets, [branch]: { revenue, projects: Math.round(nProj) } };
    setTargets(next);
    try { localStorage.setItem("isms.targets", JSON.stringify(next)); } catch { /* abaikan */ }
    toast(S.tTargetSaved.replace("{n}", branch));
    setShowTarget(false);
    setTgtRev("");
    setTgtProj("");
  };

  const openTargetModal = () => {
    if (!allowedTarget) { toast(S.tOnlyDirectorManager, "info"); return; }
    setTgtRev(String(tgt.revenue || ""));
    setTgtProj(String(tgt.projects || ""));
    setShowTarget(true);
  };

  const togglePresent = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch { toast(S.tFullscreenUnsupported, "info"); }
  };

  const totalRevenue = revenueSeries.reduce((s, d) => s + d.revenue, 0);
  const totalRevenueLabel = `Rp ${totalRevenue.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  const typeDist = (["New Build", "Repair", "Retrofit"] as const).map((t, i) => ({
    name: t,
    value: projects.filter((p) => p.type === t).length,
    color: ["#0b3a63", "#2e9ad4", "#22c55e"][i],
  }));
  const pipelineActive = inBranch(data.quotations)
    .filter((x) => x.stage !== "Menang")
    .reduce((s, x) => s + Number(x.value || 0), 0);

  /* Ambang alert (ALERT_*) DIHAPUS dari Dashboard. Sekarang setiap kondisi
     dihitung sekali di utils/moduleAlerts.ts, jadi-changing-the-setting
     di Pengaturan tetap berlaku lewat satu jalur saja. */

  /* Daftar per-item dari sistem alert modul (utils/moduleAlerts.ts).
     Sebelumnya kartu ini hanya menampilkan agregat jumlah yang ditulis
     manual di dalam Dashboard, sedangkan data per-item yang sudah punya
     rowId - dipakai sidebar badge dan AlertBanner di tiap modul - tidak
     pernah sampai ke sini. Sekarang keduanya bersumber dari satu tempat:
     klik item langsung melompat ke modul, tab, lalu baris yang DIPAKAI. */
  const attentionItems = useMemo(() => {
    const byKey = buildModuleAlertItems(data);
    const out: { key: ModuleAlertKey; item: ModuleAlertItem }[] = [];
    /* Urutan modul = urutan trademark kartu di bawah, jadi stable. */
    for (const k of DASH_ALERT_KEYS) {
      for (const item of byKey[k]) out.push({ key: k, item });
    }
    return out;
  }, [data]);

  const goAttentionItem = (key: ModuleAlertKey, rowId: string) => {
    const q = `?alert=${encodeURIComponent(key)}&highlight=${encodeURIComponent(rowId)}`;
    navigate(`${MODULE_ALERT_TO[key]}${q}`);
  };

  /* PDF sudah dibuat server dari baris DB (lihat exportSummary), jadi tidak
     ada lagi area cetak tersembunyi, tidak ada kop HTML di dalam dashboard,
     dan tidak ada mode yang mematikan animasi hanya untuk foto. */
  return (
    <Stagger className="space-y-5">
      <StaggerItem>
        <PageHeader
          title={S.dashTitle}
          subtitle={S.dashSubtitle}
          icon={<TrendingUp className="h-5 w-5" />}
          actions={
            /* Filter, tombol presentasi, dan "Proyek Baru" adalah kontrol UI. */
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={togglePresent} title={isFs ? S.exitFullscreen : S.presentBtn}>
                {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />} {isFs ? S.exitFullscreen : S.presentBtn}
              </button>
              <AsyncButton className="btn-secondary" onAction={exportSummary}>
                <Download className="h-4 w-4" /> {S.exportBtn}
              </AsyncButton>
              <button className="btn-primary-gradient" onClick={() => navigate("/proyek?create=1&alert=proyek")}>
                <Plus className="h-4 w-4" /> {S.newProjectBtn}
              </button>
            </div>
          }
        />
      </StaggerItem>

      {/* TARGET VS AKTUAL - atur via tombol, hanya Direktur/Manager */}
      <StaggerItem>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-navy-900">{S.targetVsActual.replace("{n}", branch)}</h3>
            {allowedTarget ? (
              <button className="btn-secondary text-xs" onClick={openTargetModal}>{S.setTargetBtn}</button>
            ) : (
              <span className="text-xs text-steel-400">{S.onlyDirectorManager}</span>
            )}
          </div>
          {(!tgt.revenue || tgt.revenue <= 0) && (!tgt.projects || tgt.projects <= 0) && (
            <div className="mx-1 mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1 text-xs leading-relaxed text-amber-800">
                <p className="font-semibold">Belum ada target untuk cabang {branch}.</p>
                <p className="text-amber-700">Aktual {fmtMiliar(aktualRev)} · {aktualProj} proyek aktif belum bisa dibandingkan. {allowedTarget ? "Klik Atur Target untuk mengisi." : "Minta Direktur/Manager mengisi target."}</p>
              </div>
              {allowedTarget && (
                <button className="btn-secondary shrink-0 px-2 py-1 text-[11px]" onClick={openTargetModal}>Isi target</button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 px-1 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-steel-500">{S.revenueActualVsTarget}</span><span className="font-semibold text-navy-900">{fmtMiliar(aktualRev)} / {fmtMiliar(tgt.revenue)}</span></div>
              <ProgressBar value={tgt.revenue > 0 ? (aktualRev / tgt.revenue) * 100 : 0} tone="navy" />
              {(!tgt.revenue || tgt.revenue <= 0) && <p className="mt-1 text-[11px] italic text-steel-400">Target pendapatan masih kosong</p>}
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="text-steel-500">{S.projectActualVsTarget}</span><span className="font-semibold text-navy-900">{aktualProj} / {tgt.projects}</span></div>
              <ProgressBar value={tgt.projects > 0 ? (aktualProj / tgt.projects) * 100 : 0} tone="teal" />
              {(!tgt.projects || tgt.projects <= 0) && <p className="mt-1 text-[11px] italic text-steel-400">Target proyek masih kosong</p>}
            </div>
          </div>
        </Card>
      </StaggerItem>

      <Modal open={showTarget} onClose={() => setShowTarget(false)} title={S.setTargetTitle.replace("{n}", branch)} subtitle={S.setTargetSub}
        footer={<><button className="btn-secondary" onClick={() => setShowTarget(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveTarget}>{S.saveTargetBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.targetRevenueLabel}><NumInput min={0} className="input" placeholder={S.targetRevenuePh} value={tgtRev} onChange={(e) => setTgtRev(e.target.value)} /></Field>
          <Field label={S.targetProjectLabel}><NumInput min={0} className="input" placeholder={S.targetProjectPh} value={tgtProj} onChange={(e) => setTgtProj(e.target.value)} /></Field>
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
                <p className="text-sm text-steel-300">{S.totalPortfolio}</p>
                <p className="text-3xl font-bold tracking-tight">{fmtMiliar(activeContracts)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="teal" className="bg-white/15 border-white/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {S.systemOperational}
              </Badge>
              <span className="px-3 py-1.5 rounded-lg bg-black/25 text-sm font-medium text-white">
                {S.activeWorkers.replace("{n}", String(activeEmployees))}
              </span>
            </div>
          </div>
        </GlowCard>
      </StaggerItem>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <KpiCard
            label={S.kpiActiveProjects}
            value={String(totalActive)}
            delta={S.delayedSuffix.replace("{n}", String(delayed))}
            deltaDirection="down"
            icon={<Anchor className="h-5 w-5" />}
            chip="navy"
            spark={sparkProjects}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label={S.kpiRevenue12}
            value={totalRevenueLabel}
            delta={S.deltaPctVsMonth.replace("{n}", `${revGrowth >= 0 ? "+" : ""}${revGrowth.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`)}
            deltaDirection={revGrowth > 0 ? "up" : revGrowth < 0 ? "down" : "flat"}
            icon={<Wallet className="h-5 w-5" />}
            chip="teal"
            spark={sparkRevenue}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label={S.kpiGrossMargin}
            value={`${numOf(lastMargin?.margin).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
            delta={S.deltaPoinVsMonth.replace("{n}", `${marginDiff >= 0 ? "+" : ""}${marginDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`)}
            deltaDirection={marginDiff > 0 ? "up" : marginDiff < 0 ? "down" : "flat"}
            icon={<TrendingUp className="h-5 w-5" />}
            chip="violet"
            spark={sparkMargin}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label={S.kpiEquipUtil}
            value={`${utilEquipment}%`}
            delta={S.deltaPoinVsMonth.replace("{n}", `${utilDiff >= 0 ? "+" : ""}${utilDiff.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`)}
            deltaDirection={utilDiff > 0 ? "up" : utilDiff < 0 ? "down" : "flat"}
            icon={<Cpu className="h-5 w-5" />}
            chip="amber"
            spark={sparkUtil}
          />
        </StaggerItem>
      </div>

      {/* RINGKASAN OPERASIONAL - pindahan strip, tepat di bawah 4 kartu utama */}
      <StaggerItem>
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
                <Boxes className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">{S.stockValueLabel} {lowStock.length > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{S.lowStockBadge.replace("{n}", String(lowStock.length))}</span>}</p>
                <Link to="/inventori" className="text-lg font-bold text-gradient-navy hover:underline">{fmtMiliar(stockValue)}</Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Calendar className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">{S.seaTrialLabel}</p>
                <p className="text-lg font-bold text-gradient-navy">{seaTrialVessel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Anchor className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">{S.activeQuotationLabel}</p>
                <Link to="/crm" className="text-lg font-bold text-gradient-navy hover:underline">{fmtMiliar(pipelineActive)}</Link>
              </div>
            </div>
          </div>
          {/* Kartu mini "NCR Terbuka" / "Piutang Tertagih" / "Kontrak Menang".
              Semuanya adalah <button> penuh (bukan hanya angkanya) supaya
              target kliknya besar dan tidak perlu clicked secara presisi;
              geklik akan redirect ke modul + tab tujuan lalu menyorot SELURUH
              baris yang dihitung angka di kartu ini. */}
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-steel-100 pt-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={goNcr}
              title={`Buka ${openNcrIds.length} NCR terbuka di QC & Safety (tab NCR, semua baris disorot)`}
              className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-2 text-left transition-colors hover:border-rose-400 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-xs text-steel-500">{S.openNcrLabel}</span>
                <span className="text-[11px] text-rose-400" aria-hidden>&rarr; QC &amp; Safety</span>
              </span>
              <span className="font-bold text-rose-600" title={criticalOpenNcr > 0 ? S.criticalCount.replace("{n}", String(criticalOpenNcr)) : S.nihilCritical}>
                {criticalOpenNcr > 0 ? S.ncrCasesCritical.replace("{n}", String(openNcr)).replace("{a}", String(criticalOpenNcr)) : S.ncrCases.replace("{n}", String(openNcr))}
              </span>
            </button>
            <button
              type="button"
              onClick={goAR}
              title={`Buka ${arRows.length} invoice belum tertagih di Keuangan (tab Piutang (AR), semua baris disorot)`}
              className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl border border-navy-200 bg-navy-50/40 px-3 py-2 text-left transition-colors hover:border-navy-400 hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-xs text-steel-500">{S.arLabel}</span>
                <span className="text-[11px] text-navy-400" aria-hidden>&rarr; Keuangan</span>
              </span>
              <span className="font-bold text-navy-900">{fmtMiliar(arOutstanding)}</span>
            </button>
            <button
              type="button"
              onClick={goKontrak}
              title={`Buka ${wonContracts.length} kontrak menang di CRM (tab Kontrak, semua baris disorot)`}
              className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-xs text-steel-500">{S.wonContractLabel}</span>
                <span className="text-[11px] text-emerald-600" aria-hidden>&rarr; CRM</span>
              </span>
              <span className="font-bold text-navy-900">{fmtMiliar(wonContractValue)}</span>
            </button>
          </div>
        </Card>
      </StaggerItem>

      {/* PERLU PERHATIAN - klik item untuk ke modul + tab + baris yang DIPAKAI,
          atau klik header untuk membuka daftar lengkap di /notifikasi pada tab
          "Perlu Perhatian" dengan semua baris alert disorot. */}
      <StaggerItem>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <button
              type="button"
              onClick={goNotifikasi}
              title={`Buka semua notifikasi (${attentionItems.length} kondisi) - semua baris alert akan disorot`}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <h3 className="text-sm font-semibold text-navy-900 underline-offset-2 hover:underline">{S.needAttention.replace("{n}", String(attentionItems.length))} <span className="text-[11px] font-normal text-steel-400">&rarr; Notifikasi</span></h3>
            </button>
            <span className="text-xs text-steel-400">{S.autoThreshold}</span>
            <button type="button" onClick={goNotifikasi} className="btn-secondary ml-auto px-2 py-1 text-[11px]">{S.seeAll}</button>
          </div>
          {attentionItems.length === 0 && (
            <p className="px-1 text-sm text-steel-400">{S.allThresholdsSafe}</p>
          )}
          {attentionItems.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {attentionItems.slice(0, DASH_ALERT_CAP).map(({ key, item }) => (
                <li key={`${key}:${item.id}`}>
                  <button
                    type="button"
                    onClick={() => goAttentionItem(key, item.rowId)}
                    className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-steel-100 bg-surface p-3 text-left hover:border-ocean-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
                  >
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${DASH_ALERT_TONE[key]}`}>
                      {DASH_ALERT_LABEL[key][locale === "en" ? "en" : "id"]}
                    </span>
                    <span className="text-xs font-medium leading-relaxed text-navy-800">{item.label}</span>
                    {item.detail && (
                      <span className="line-clamp-2 text-[11px] text-steel-500">{item.detail}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {attentionItems.length > DASH_ALERT_CAP && (
            <p className="mt-3 px-1 text-xs text-steel-400">
              {locale === "en"
                ? `Showing ${DASH_ALERT_CAP} of ${attentionItems.length} - see all in Notifications.`
                : `Menampilkan ${DASH_ALERT_CAP} dari ${attentionItems.length} - lihat semua di Notifikasi.`}
            </p>
          )}
        </Card>
      </StaggerItem>

      {/* STATUS + ACTIVITY - tepat di bawah Perlu Perhatian */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StaggerItem>
          <Card>
            <CardHeader
              title={S.activeProjectStatus}
              subtitle={S.latestProgress}
              action={
                <Link to="/proyek" className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-600 hover:text-ocean-500">
                  {S.seeAll} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="flex flex-wrap gap-1.5 px-5 pb-3" role="group" aria-label="Distribusi status proyek aktif">
              {(() => {
                const groups: Record<string, number> = {};
                for (const p of branchProjects) groups[String(p.status)] = (groups[String(p.status)] ?? 0) + 1;
                const order = ["Sedang Berjalan", "Dalam Proses", "Tertunda", "Terlambat", "Batal", "Selesai"];
const toneFor = (s: string): "blue" | "amber" | "red" | "gray" | "green" =>
                  s === "Terlambat" ? "red" : s === "Selesai" ? "green" : s === "Tertunda" ? "amber" : s === "Batal" ? "gray" : "blue";
                return order.filter((s) => (groups[s] ?? 0) > 0 || s !== "Selesai").map((s) => (
                  <Link key={s} to={`/proyek?status=${encodeURIComponent(s)}`} className="inline-flex items-center gap-1.5 rounded-full border border-steel-200 px-2.5 py-1 text-xs font-semibold hover:border-ocean-400" title={`Filter proyek ${s}`}>
                    <Badge tone={toneFor(s)}>{statusLabel(s)}</Badge>
                    <span className="text-navy-900">{groups[s] ?? 0}</span>
                  </Link>
                ));
              })()}
            </div>
            <div className="max-h-80 divide-y divide-steel-100 overflow-y-auto">
              {branchProjects.map((p) => (
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
                    <Badge tone={p.status === "Terlambat" ? "red" : p.status === "Selesai" ? "green" : p.status === "Tertunda" ? "amber" : p.status === "Batal" ? "gray" : "blue"}>
                      {statusLabel(String(p.status))}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title={S.recentActivity} subtitle={S.realtimeLog} />
            <div className="max-h-80 space-y-1 overflow-y-auto p-3">
              {activities.map((a) => (
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
              title={S.revenueVsVolume}
              subtitle={`${S.trend12Months} · Bulan berjalan paling kanan`}
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
                  <XAxis dataKey="bln" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <YAxis yAxisId="proj" orientation="right" tick={{ fontSize: 12 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v) => (typeof v === "number" ? `Rp ${v} M` : v)} />} />
                  <Area yAxisId="rev" type="monotone" dataKey="revenue" name={S.legendRevenue} stroke="#0b3a63" strokeWidth={2.5} fill="url(#revGrad)" isAnimationActive />
                  <Bar yAxisId="proj" dataKey="projects" name={S.legendProjectCount} fill="#8cc9e8" radius={[4, 4, 0, 0]} barSize={16} isAnimationActive />
                  <Line yAxisId="rev" type="monotone" dataKey="cost" name={S.legendCost} stroke="#e11d48" strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title={S.projectComposition} subtitle={S.byJobType} />
            <div className="flex flex-col items-center gap-4 p-4">
              <Donut
                data={typeDist}
                colors={typeDist.map((d) => d.color)}
                size={170}
                thickness={22}
                centerValue={String(typeDist.reduce((s, d) => s + d.value, 0))}
                centerLabel={S.donutProjects}
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
            <CardHeader title={S.capacityUtil} subtitle={S.drydockSlipwayBerth} />
            <div className="p-4">
              <div className="mb-3 flex items-end gap-2">
                <span className="text-3xl font-bold text-navy-900">{utilDrydock}%</span>
                <span className="pb-1 text-xs text-steel-500">{S.facilitiesInstalled.replace("{n}", String(drydocks.length))}</span>
              </div>
              <div className="max-h-64 space-y-3 overflow-y-auto scroll-flush pr-4">
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
            <CardHeader title={S.productionUtil} subtitle={S.drydockVsEquip} />
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
                  <Area type="monotone" dataKey="equipment" stroke="#2e9ad4" strokeWidth={2} fill="url(#utilGrad)" isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardHeader title={S.smartInsights} subtitle={S.autoRecommendations} />
            <div className="max-h-80 space-y-2.5 overflow-y-auto p-4 pt-0">
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