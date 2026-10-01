import { useEffect, useMemo, useState } from "react";
import { Plus, Factory, ShoppingCart, ClipboardList, Check, X, Printer, Send, Star, Wallet, Umbrella, Search } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, ConfirmModal, toast, EmptyState, SortTh, toggleSort, sortRows, usePager,
  NumInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useBusy } from "../../components/ui";
import { useStore, type StoreItem, type CollectionKey } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { findUsages } from "../../utils/usages";
import { remoteRepository } from "../../services/repositories";
import { getJwt, isBackendConfigured } from "../../services/http";
import { fmtRupiah, fmtJumlah, fmtTanggal, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { getSetting } from "../../utils/settings";
import { sbPoNumber, sbSplitIncludePpn, maxSeq, SB_KOP } from "../../utils/sb";
import { spendByCategory, procurementTrend, poCountTrend, poValueTrend, prPendingTrend, vendorTrend } from "../../data";
import { exportExcel } from "../../utils/export";
import { useDraftState } from "../../utils/draft";
import { useT } from "../../i18n/LanguageContext";
import { n_proc } from "../../i18n/n_proc";
import { FilterPopover } from "../../components/FilterPopover";

/* Baris PO string-state (pola smallForm): simpan string, Number() saat validasi. */
interface POLine { name: string; qty: string; unit: string; price: string; spec?: string; need?: string }
interface Quote { vendor: string; price: number; eta: string }
interface Approval { level: string; by: string; date: string }
interface VendorScore { po: string; q: number; d: number; p: number; score: number; date: string }

const VENDOR_CATS = ["Baja & Struktur", "Mesin & Engine", "Cat & Coating", "Rigging & Wire", "Listrik", "Jasa"];

/* Status kanonis PO Besar + pemetaan status seed lama. */
const PO_NEXT: Record<string, string[]> = {
  Draft: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Dikirim"],
  Dikirim: ["Diterima Sebagian", "Diterima"],
  "Diterima Sebagian": ["Diterima"],
  Diterima: [],
  Ditolak: [],
};

function normPo(s: string): string {
  if (s === "Menunggu Persetujuan") return "Diajukan";
  if (s === "Dalam Pengiriman") return "Dikirim";
  return s;
}

const poNext = (s: string): string[] => PO_NEXT[normPo(s)] ?? [];

const poStatus: Record<string, "green" | "amber" | "blue" | "gray"> = {
  Diajukan: "gray",
  "Menunggu Persetujuan": "gray",
  Disetujui: "blue",
  Dikirim: "amber",
  "Dalam Pengiriman": "amber",
  "Diterima Sebagian": "blue",
  Diterima: "green",
  Ditolak: "gray",
  Draft: "gray",
};

const SMALL_NEXT: Record<string, string[]> = {
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Diterima"],
  Diterima: [],
  Ditolak: [],
};

const RFQ_NEXT: Record<string, string[]> = {
  Draf: ["Terkirim"],
  Draft: ["Terkirim"],
  Terkirim: ["Evaluasi"],
  Evaluasi: ["Diputuskan"],
  Diputuskan: [],
};

const RFQ_STAGES = ["Draf", "Draft", "Terkirim", "Evaluasi", "Diputuskan"];
const RFQ_STAGE_COLOR: Record<string, string> = {
  Draf: "#94a3b8",
  Draft: "#94a3b8",
  Terkirim: "#2e9ad4",
  Evaluasi: "#f59e0b",
  Diputuskan: "#0d9488",
};

const PR_PENDING = ["Draft", "Menunggu Approval", "RFQ", "Diajukan"];

const lineTotal = (lines: { qty: string | number; price: string | number }[]): number =>
  lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0);

const poLines = (po: StoreItem): POLine[] => (Array.isArray(po.lines) ? (po.lines as POLine[]) : []);

const isLate = (po: StoreItem): boolean =>
  Boolean(po.eta) && String(po.eta) < todayISO() && normPo(po.status) !== "Diterima";

/* ---- Approval bertingkat nominal PO Besar (docs/11§4.4: >Rp1M + Finance) ----
   Ambang Finance dari settings APPROVE_PO (default 1jt) - diteruskan dari
   komponen karena fungsi ini murni. */
function needLevels(amount: number, financeLimit = 1000000): string[] {
  const lv: string[] = [];
  if (amount > 500000000) lv.push("SPV", "Manager", "Director");
  else if (amount > 50000000) lv.push("SPV", "Manager");
  else lv.push("SPV");
  if (amount > financeLimit && !lv.includes("Finance")) lv.push("Finance"); // ambang APPROVE_PO
  return lv;
}

function levelOf(amount: number, financeLimit = 1000000): string {
  if (amount > 500000000) return "Director + Finance";
  if (amount > 50000000) return "Manager + Finance";
  if (amount > financeLimit) return "SPV + Finance";
  return "SPV";
}

function apprOf(po: StoreItem): Approval[] {
  return Array.isArray(po.approvals) ? (po.approvals as Approval[]) : [];
}

function nextLevel(po: StoreItem, financeLimit = 1000000): string | null {
  const need = needLevels(Number(po.amount || 0), financeLimit);
  const done = apprOf(po).map((a) => a.level);
  return need.find((l) => !done.includes(l)) ?? null;
}

/* ---- Skor vendor ---- */
function scoresOf(v: StoreItem): VendorScore[] {
  return Array.isArray(v.scores) ? (v.scores as VendorScore[]) : [];
}

function avgScore(v: StoreItem): number | null {
  const s = scoresOf(v);
  if (s.length === 0) return null;
  return s.reduce((a, x) => a + Number(x.score || 0), 0) / s.length;
}

/* ---- Kontrak payung ---- */
function payungOf(v: StoreItem): { periode: string; plafon: number } | null {
  const p = v.payung as { periode?: string; plafon?: number } | undefined;
  if (!p || !p.plafon || Number(p.plafon) <= 0) return null;
  return { periode: String(p.periode ?? ""), plafon: Number(p.plafon) };
}

function lateDaysOf(po: StoreItem): number {
  if (!po.eta) return 0;
  const t = Date.parse(String(po.eta));
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.parse(todayISO()) - t) / 86400000));
}

/* Baca ulang payables segar (bukan snapshot render): mode remote → list BE,
   gagal/lokal → fallback snapshot. Pemanggil wajib filter cocok persis. */
async function freshPayables(fallback: StoreItem[]): Promise<StoreItem[]> {
  try {
    if (isBackendConfigured() && getJwt()) {
      const rows = await remoteRepository("payables").list();
      if (Array.isArray(rows)) return rows;
    }
  } catch {
    /* abaikan - pakai fallback lokal */
  }
  return fallback;
}

/* Batch koleksi modul Procurement untuk useModuleSync (pengganti resync penuh). */
const PROC_COLS: CollectionKey[] = ["inventory", "payables", "projects", "purchaseOrders", "requisitions", "rfqs", "vendors"];

export default function Procurement() {
  const busy = useBusy();
  const { data, add, update, remove, log, inBranch } = useStore();
  const { locale } = useT();
  const S = n_proc[locale];
  const modAlert = useModuleAlert("procurement");
  const flash = useNotifFlash();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(PROC_COLS);
  const purchaseOrders = inBranch(data.purchaseOrders);
  const requisitions = data.requisitions;
  const vendors = data.vendors;
  const rfqs = data.rfqs;
  const invList = inBranch(data.inventory);

  const PO_KECIL_LIMIT = getSetting(data, "PO_KECIL_LIMIT", 50000000);
  const APPROVE_PO_LIMIT = getSetting(data, "APPROVE_PO", 1000000);
  const ppnRate = getSetting(data, "PPN_RATE", 12);

  /* Distribusi tahap RFQ + jumlah per tahap. Halaman RFQ hanya menampilkan
     daftar kartu per RFQ, jadi tidak ada angka agregat: user tidak bisa
     melihat apakah 5 RFQ tersangkut di "Evaluasi" sementara yang lain sudah
     "Terkirim". Dihitung dari baris RFQ nyata (r.status). */
  const quotationStageDistReal = useMemo(() => {
    const m = new Map<string, { count: number; nilai: number; minDays: number | null }>();
    const now = new Date();
    for (const r of rfqs) {
      const st = String(r.status ?? "").trim() || "Draf";
      const cur = m.get(st) ?? { count: 0, nilai: 0, minDays: null };
      cur.count += 1;
      cur.nilai += lineTotal(Array.isArray(r.quotes) ? r.quotes : []);
      const raw = String(r.date ?? r.createdAt ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const days = Math.floor((now.getTime() - new Date(`${raw}T00:00:00`).getTime()) / 86400000);
        if (days >= 0 && (cur.minDays === null || days < cur.minDays)) cur.minDays = days;
      }
      m.set(st, cur);
    }
    return RFQ_STAGES.filter((s) => m.has(s)).map((s) => {
      const v = m.get(s) as { count: number; nilai: number; minDays: number | null };
      return { name: s, value: v.count, count: v.count, nilai: v.nilai, minDays: v.minDays, color: RFQ_STAGE_COLOR[s] ?? "#94a3b8" };
    });
  }, [rfqs]);
  const rfqStuck = quotationStageDistReal.filter((d) => (d.minDays ?? 0) > 14);

  /* No. PO SB max+1: scan docNo tahun berjalan, parse leading (\d+)/. */
  const nextPoSeq = (): number => {
    const year = todayISO().slice(0, 4);
    const nums = purchaseOrders
      .map((p) => String((p as StoreItem).docNo ?? ""))
      .filter((s) => s.endsWith(`/${year}`));
    return maxSeq(nums, /^(\d+)\//) + 1;
  };

  const [tab, setTab] = useState("PR");
  const [pq, setPq] = useState("");
  const [pStatus, setPStatus] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });
  const [sort4, setSort4] = useState<SortState>({ key: null, dir: "asc" });

  /* ---- PO Besar ---- */
  const [showBig, setShowBig] = useState(false);
  const [bigForm, setBigForm] = useState({ tujuan: "kapal" as "kapal" | "stok", prId: "", itemId: "", vendor: "", project: "", vessel: "", eta: "", includePpn: true, override: false, overrideReason: "" });
  const [bigLines, setBigLines] = useDraftState<POLine[]>("isms.draft.procurement.bigLines", [{ name: "", qty: "1", unit: "pcs", price: "", spec: "", need: "" }]);
  const [vCatF, setVCatF] = useState("Semua");
  const [poDetail, setPoDetail] = useState<StoreItem | null>(null);

  /* ---- PO Kecil ---- */
  const [showSmall, setShowSmall] = useState(false);
  const [smallForm, setSmallForm] = useState({ workshop: "", requester: "", item: "", spec: "", need: "", qty: "1", unit: "pcs", price: "", eta: "", project: "", vessel: "", nota: "", override: false, overrideReason: "" });
  const [kasAwal, setKasAwal] = useState("");

  /* ---- RFQ ---- */
  const [rfqPr, setRfqPr] = useState<StoreItem | null>(null);
  const [rfqVendors, setRfqVendors] = useDraftState<string[]>("isms.draft.procurement.rfqVendors", []);
  const [quoteRfq, setQuoteRfq] = useState<StoreItem | null>(null);
  const [quoteForm, setQuoteForm] = useState({ vendor: "", price: "", eta: "" });
  const [winRfq, setWinRfq] = useState<StoreItem | null>(null);
  const [winVendor, setWinVendor] = useState("");

  /* ---- PR ---- */
  const [showPr, setShowPr] = useState(false);
  const [prForm, setPrForm] = useState({ item: "", by: "", amount: "", qty: "1", unit: "pcs", project: "" });
  const [konsIds, setKonsIds] = useState<string[]>([]);
  const [konsVendor, setKonsVendor] = useState("");
  const [konsProject, setKonsProject] = useState("");
  const [konsEta, setKonsEta] = useState("");

  /* ---- Umum ---- */
  const [showVendor, setShowVendor] = useState(false);
  const [vForm, setVForm] = useState({ name: "", cat: "Baja & Struktur" });
  const [confirmApprove, setConfirmApprove] = useState<StoreItem | null>(null);
  const [confirmRejectPo, setConfirmRejectPo] = useState<StoreItem | null>(null);
  const [recvPo, setRecvPo] = useState<StoreItem | null>(null);
  const [recvItem, setRecvItem] = useState("");
  const [recvQty, setRecvQty] = useState("");
  const [recvNoFaktur, setRecvNoFaktur] = useState("");
  const [recvTglFaktur, setRecvTglFaktur] = useState("");
  const [recvDendaPct, setRecvDendaPct] = useState("0.1");
  const [retPo, setRetPo] = useState<StoreItem | null>(null);
  const [retQty, setRetQty] = useState("");
  const [retNote, setRetNote] = useState("");
  const [amendPo, setAmendPo] = useState<StoreItem | null>(null);
  const [amendForm, setAmendForm] = useState({ name: "", qty: "1", unit: "pcs", price: "", note: "" });
  const [confirmAmend, setConfirmAmend] = useState(false);

  /* ---- Skor vendor ---- */
  const [evalPo, setEvalPo] = useState<StoreItem | null>(null);
  const [evalQ, setEvalQ] = useState("");
  const [evalD, setEvalD] = useState("");
  const [evalP, setEvalP] = useState("");
  const [unblockVendor, setUnblockVendor] = useState<StoreItem | null>(null);
  // Hapus PO/PR (Draft saja) & vendor via ConfirmModal + daftar pemakai.
  const [delPo, setDelPo] = useState<StoreItem | null>(null);
  const [delPr, setDelPr] = useState<StoreItem | null>(null);
  const [delVendor, setDelVendor] = useState<StoreItem | null>(null);

  /* ---- Kontrak payung ---- */
  const [payungVendor, setPayungVendor] = useState<StoreItem | null>(null);
  const [payungPeriode, setPayungPeriode] = useState("");
  const [payungPlafon, setPayungPlafon] = useState("");

  const bigList = purchaseOrders.filter((p) => p.poType !== "Kecil");
  const smallList = purchaseOrders.filter((p) => p.poType === "Kecil");
  const approvedPRs = requisitions.filter((r) => r.status === "Disetujui");

  /* Filter satu pola (cari + status) mengikuti tab aktif. */
  const STATUS_OPSI: Record<string, string[]> = {
    "PO Besar (Kantor)": ["Semua", "Draft", "Diajukan", "Disetujui", "Dikirim", "Diterima Sebagian", "Diterima", "Ditolak"],
    "PO Kecil (Workshop)": ["Semua", "Diajukan", "Disetujui", "Diterima", "Ditolak"],
    RFQ: ["Semua", "Draf", "Draft", "Terkirim", "Evaluasi", "Diputuskan"],
    PR: ["Semua", "Draft", "Menunggu Approval", "RFQ", "Diajukan", "Disetujui", "Sudah PO", "Ditolak"],
    Vendor: ["Semua", "Aktif", "Nonaktif", "Blacklist"],
  };
  const matchProc = (hay: string, st: string): boolean => {
    if (pStatus !== "Semua" && normPo(st) !== pStatus && st !== pStatus) return false;
    const q = pq.trim().toLowerCase();
    if (!q) return true;
    return hay.toLowerCase().includes(q);
  };
  const venCatOf = (name: string): string => String(vendors.find((v) => sameName(v.name, name))?.cat ?? "");
  const bigShown = bigList.filter((po) => matchProc(`${po.id} ${po.item} ${po.vendor} ${poLines(po).map((l) => l.name).join(" ")}`, String(normPo(po.status)))
    && (vCatF === "Semua" || venCatOf(String(po.vendor ?? "")) === vCatF));
  const smallShown = smallList.filter((po) => matchProc(`${po.id} ${po.item} ${po.vendor} ${po.workshop ?? ""}`, String(normPo(po.status)))
    && (vCatF === "Semua" || venCatOf(String(po.vendor ?? "")) === vCatF));
  const rfqShown = rfqs.filter((r) => matchProc(`${r.id} ${r.item} ${r.prId} ${(Array.isArray(r.vendors) ? r.vendors as string[] : []).join(" ")}`, String(r.status)));
  const prShown = requisitions.filter((r) => matchProc(`${r.id} ${r.item} ${r.by}`, String(r.status)));
  const vendorShown = vendors.filter((v) => matchProc(`${v.name} ${v.cat}`, String(v.status ?? "Aktif")) && (vCatF === "Semua" || String(v.cat ?? "") === vCatF));

  /* Vendor terfilter kategori — dipakai SEMUA select vendor + tab Vendor. */
  const vendByCat = useMemo(() => vendors.filter((v) => vCatF === "Semua" || String(v.cat ?? "") === vCatF), [vendors, vCatF]);
  const venCatPick = (id: string) => (
    <select
      id={id}
      className="input w-auto py-1.5 text-xs"
      value={vCatF}
      aria-label={locale === "en" ? "Vendor category" : "Kategori vendor"}
      title={locale === "en" ? "Vendor category" : "Kategori vendor"}
      onChange={(e) => setVCatF(e.target.value)}
    >
      <option value="Semua">{locale === "en" ? "All categories" : "Semua kategori"}</option>
      {VENDOR_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
  const sortedBig = useMemo(() => sortRows(bigShown, sort, (po, k) => {
    if (k === "nilai") return Number(po.amount || 0);
    if (k === "item") return String(po.item ?? "");
    if (k === "vendor") return String(po.vendor ?? "");
    if (k === "level") return String(levelOf(Number(po.amount || 0), APPROVE_PO_LIMIT));
    if (k === "eta") return String(po.eta ?? "");
    if (k === "revisi") return String(po.revisi || "R0");
    if (k === "status") return String(normPo(String(po.status ?? "")));
    return String(po.id ?? "");
  }), [bigShown, sort, APPROVE_PO_LIMIT]);
  const sortedSmall = useMemo(() => sortRows(smallShown, sort2, (po, k) => {
    if (k === "nilai") return Number(po.amount || 0);
    if (k === "kebutuhan") return String(po.item ?? "");
    if (k === "vendor") return String(po.vendor ?? "");
    if (k === "workshop") return String(po.workshop ?? "");
    if (k === "level") return String(levelOf(Number(po.amount || 0), APPROVE_PO_LIMIT));
    if (k === "eta") return String(po.eta ?? "");
    if (k === "revisi") return String(po.revisi || "R0");
    if (k === "status") return String(normPo(String(po.status ?? "")));
    return String(po.id ?? "");
  }), [smallShown, sort2, APPROVE_PO_LIMIT]);
  const sortedPr = useMemo(() => sortRows(prShown, sort4, (r, k) => {
    if (k === "nilai") return Number(r.amount || 0);
    if (k === "item") return String(r.item ?? "");
    if (k === "oleh") return String(r.by ?? "");
    if (k === "status") return String(r.status ?? "");
    return String(r.id ?? "");
  }), [prShown, sort4]);
  const bigPager = usePager(bigShown.length);
  const smallPager = usePager(smallShown.length);
  const prPager = usePager(prShown.length);
  useEffect(() => {
    bigPager.reset();
    smallPager.reset();
    prPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pq, pStatus, vCatF, tab]);

  const pickNotif = (rowId: string) => {
    const idxBig = sortedBig.findIndex((r) => String(r.id) === rowId);
    if (idxBig >= 0) {
      if (tab === "PO Besar (Kantor)") { flash.pick(rowId, idxBig, bigPager.go, bigPager.size); return; }
      setTab("PO Besar (Kantor)");
      window.setTimeout(() => { flash.pick(rowId, idxBig, bigPager.go, bigPager.size); }, 250);
      return;
    }
    const idxSmall = sortedSmall.findIndex((r) => String(r.id) === rowId);
    if (idxSmall >= 0) {
      if (tab === "PO Kecil (Workshop)") { flash.pick(rowId, idxSmall, smallPager.go, smallPager.size); return; }
      setTab("PO Kecil (Workshop)");
      window.setTimeout(() => { flash.pick(rowId, idxSmall, smallPager.go, smallPager.size); }, 250);
      return;
    }
    const idxPr = sortedPr.findIndex((r) => String(r.id) === rowId);
    if (idxPr >= 0) {
      if (tab === "PR") { flash.pick(rowId, idxPr, prPager.go, prPager.size); return; }
      setTab("PR");
      window.setTimeout(() => { flash.pick(rowId, idxPr, prPager.go, prPager.size); }, 250);
      return;
    }
    flash.pick(rowId, -1, () => {}, 100);
  };

  const openPo = purchaseOrders.filter((p) => normPo(p.status) !== "Diterima").reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingPr = requisitions.filter((r) => PR_PENDING.includes(r.status)).length;

  const plafonPakai = (vendorName: string, excludeId?: string): number =>
    purchaseOrders
      .filter((o) => sameName(o.vendor, vendorName) && !["Ditolak"].includes(normPo(o.status)) && o.id !== excludeId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);

  /* Validasi plafon kontrak payung: null bila vendor tanpa payung. */
  const cekPlafon = (vendorName: string, tambahan: number): { ok: boolean; pakai: number; plafon: number } | null => {
    const v = vendors.find((x) => sameName(x.name, vendorName));
    const pg = v ? payungOf(v) : null;
    if (!pg) return null;
    const pakai = plafonPakai(vendorName);
    return { ok: pakai + tambahan <= pg.plafon, pakai, plafon: pg.plafon };
  };

  const budgetInfo = (projectId: string, _amount: number, excludeId?: string): { sisa: number; aktif: number } | null => {
    if (!projectId) return null;
    const p = data.projects.find((x) => x.id === projectId);
    if (!p) return null;
    const sisa = Number(p.budget || 0) - Number(p.actual || 0);
    const aktif = purchaseOrders
      .filter((o) => o.project === projectId && !["Ditolak", "Diterima"].includes(normPo(o.status)) && o.id !== excludeId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    return { sisa, aktif };
  };

  const bigTotal = lineTotal(bigLines);
  const bigBudget = budgetInfo(bigForm.project, bigTotal);
  const bigOver = bigBudget !== null && bigBudget.aktif + bigTotal > bigBudget.sisa;
  const smallAmount = Number(smallForm.qty || 0) * Number(smallForm.price || 0);
  const smallBudget = budgetInfo(smallForm.project, smallAmount);
  const smallOver = smallBudget !== null && smallBudget.aktif + smallAmount > smallBudget.sisa;

  /* Kas kecil workshop: alat bantu sesi (state lokal), bukan ledger permanen. */
  const bulanIni = todayISO().slice(0, 7);
  const smallBulan = smallList.filter((p) => String(p.date ?? "").slice(0, 7) === bulanIni);
  const smallBulanTotal = smallBulan.reduce((s, p) => s + Number(p.amount || 0), 0);
  const kasSisa = (Number(kasAwal) || 0) - smallBulanTotal;
  const exportKas = () => {
    void exportExcel(
      [
        [S.kasT, bulanIni],
        [S.xSaldoManual, Number(kasAwal) || 0],
        [],
        [S.po, S.kebutuhan, S.nilai],
        ...smallBulan.map((p) => [p.id, String(p.item ?? ""), Number(p.amount || 0)]),
        [S.kasBulanIni, "", smallBulanTotal],
        [S.xSisa, "", kasSisa],
      ],
      `Kas-Kecil-${bulanIni}`,
      "Kas Kecil"
    ).catch(() => toast(S.saveFail, "info"));
    toast(S.tKasExport);
  };

  /* ============ PO BESAR ============ */
  const saveBig = async () => {
    try {
    if (!bigForm.prId) { toast(S.tPrWajib, "info"); return; }
    const invItem = invList.find((i) => i.id === bigForm.itemId);
    if (!invItem) { toast(S.tItemInv, "info"); return; }
    if (!bigForm.vendor) { toast(S.tVendorWajib, "info"); return; }
    if (bigForm.tujuan === "kapal") {
      if (!bigForm.project) { toast(S.tKapalProyek, "info"); return; }
      if (!bigForm.vessel.trim()) { toast(S.tKapalUtk, "info"); return; }
    }
    if (!bigForm.eta) { toast(S.tEtaWajib, "info"); return; }
    if (bigLines.length === 0) { toast(S.tMinBaris, "info"); return; }
    for (const l of bigLines) {
      if (!l.name.trim()) { toast(S.tNamaBaris, "info"); return; }
      if (!Number(l.qty) || Number(l.qty) <= 0) { toast(S.tQtyBaris, "info"); return; }
      if (!Number(l.price) || Number(l.price) <= 0) { toast(S.tHargaBaris, "info"); return; }
    }
    if (bigOver && (!bigForm.override || !bigForm.overrideReason.trim())) {
      toast(S.tOverBudget, "info");
      return;
    }
    const plafon = cekPlafon(bigForm.vendor, bigTotal);
    if (plafon && !plafon.ok) { toast(S.tPlafon.replace("{a}", fmtRupiah(plafon.pakai)).replace("{b}", fmtRupiah(plafon.plafon)), "info"); return; }
    const pr = requisitions.find((r) => r.id === bigForm.prId);
    const docNo = sbPoNumber(nextPoSeq());
    const isStok = bigForm.tujuan === "stok";
    const created = await add("purchaseOrders", {
      poType: "Besar", item: invItem.name, itemId: invItem.id, vendor: bigForm.vendor,
      req: bigForm.prId, amount: bigTotal, qty: bigLines.reduce((s, l) => s + Number(l.qty), 0),
      lines: bigLines.map((l) => ({ name: l.name.trim(), qty: Number(l.qty), unit: l.unit, price: Number(l.price), spec: (l.spec ?? "").trim(), need: (l.need ?? "").trim() })),
      project: isStok ? "-" : (bigForm.project || "-"), vessel: isStok ? "" : bigForm.vessel.trim(), eta: bigForm.eta || "",
      docNo, includePpn: bigForm.includePpn, tujuan: bigForm.tujuan,
      receivedQty: 0, returnedQty: 0, status: "Draft", date: todayISO(), revisi: "",
      amendments: [], approvals: [], overrideReason: bigOver ? bigForm.overrideReason.trim() : "",
    }, { action: "membuat PO Besar", module: "Procurement" });
    if (pr && pr.status === "Disetujui") await update("requisitions", pr.id, { status: "Sudah PO" });
    toast(S.tBigCreated.replace("{a}", created.id).replace("{b}", docNo));
    setShowBig(false);
    setBigForm({ tujuan: "kapal", prId: "", itemId: "", vendor: "", project: "", vessel: "", eta: "", includePpn: true, override: false, overrideReason: "" });
    setBigLines([{ name: "", qty: "1", unit: "pcs", price: "" }]);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ============ PO KECIL ============ */
  const saveSmall = async () => {
    try {
    if (!smallForm.workshop.trim()) { toast(S.tWorkshop, "info"); return; }
    if (!smallForm.requester.trim()) { toast(S.tPeminta, "info"); return; }
    if (!smallForm.item.trim()) { toast(S.tItemButuh2, "info"); return; }
    const qty = Number(smallForm.qty);
    const price = Number(smallForm.price);
    if (!qty || qty <= 0) { toast(S.tQtyPos, "info"); return; }
    if (!price || price <= 0) { toast(S.tEstHarga, "info"); return; }
    if (!smallForm.unit.trim()) { toast(S.tSatuan, "info"); return; }
    if (!smallForm.eta) { toast(S.tEtaWajib, "info"); return; }
    if (smallForm.project && !smallForm.vessel.trim()) { toast(S.tProyekUtk, "info"); return; }
    const amount = qty * price;
    if (amount > PO_KECIL_LIMIT) { toast(S.tOverKecil, "info"); return; }
    if (smallOver && (!smallForm.override || !smallForm.overrideReason.trim())) {
      toast(S.tOverBudget, "info");
      return;
    }
    await add("purchaseOrders", {
      poType: "Kecil", item: smallForm.item.trim(), workshop: smallForm.workshop.trim(),
      requester: smallForm.requester.trim(), vendor: "Workshop Internal",
      req: "-", amount, qty, unit: smallForm.unit.trim(), receivedQty: 0, returnedQty: 0, status: "Diajukan",
      date: todayISO(), eta: smallForm.eta || "", project: smallForm.project || "-",
      vessel: smallForm.vessel.trim(), nota: smallForm.nota.trim(),
      docNo: sbPoNumber(nextPoSeq()),
      lines: [{ name: smallForm.item.trim(), qty, unit: smallForm.unit.trim(), price, spec: smallForm.spec.trim(), need: smallForm.need.trim() }],
      revisi: "", amendments: [], overrideReason: smallOver ? smallForm.overrideReason.trim() : "",
    }, { action: "membuat PO Kecil", module: "Procurement" });
    toast(S.tSmallCreated);
    setShowSmall(false);
    setSmallForm({ workshop: "", requester: "", item: "", spec: "", need: "", qty: "1", unit: "pcs", price: "", eta: "", project: "", vessel: "", nota: "", override: false, overrideReason: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const doPoStatus = async (po: StoreItem, next: string) => {
    try {
    if (po.poType === "Kecil") {
      const allowed = SMALL_NEXT[normPo(po.status)] ?? [];
      if (!allowed.includes(next)) { toast(S.tTransSmall.replace("{a}", String(po.status)).replace("{b}", next), "info"); return; }
    }
    await update("purchaseOrders", po.id, { status: next });
    toast(S.tArrow.replace("{a}", po.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* Persetujuan berjenjang SPV → Manager → Director sesuai nominal. */
  const doApproveLevel = async (po: StoreItem) => {
    try {
    const nx = nextLevel(po, APPROVE_PO_LIMIT);
    if (!nx) { toast(S.tFullApproved.replace("{n}", po.id), "info"); return; }
    const done: Approval[] = [...apprOf(po), { level: nx, by: "Anda", date: todayISO() }];
    const doneLevels = done.map((a) => a.level);
    const still = needLevels(Number(po.amount || 0), APPROVE_PO_LIMIT).find((l) => !doneLevels.includes(l)) ?? null;
    await update("purchaseOrders", po.id, { approvals: done, status: still ? po.status : "Disetujui" });
    log("persetujuan PO", `${po.id} level ${nx}${still ? `, lanjut ke ${still}` : " (penuh)"}`, "Procurement");
    toast(still ? S.tApprNext.replace("{n}", po.id).replace("{a}", nx).replace("{b}", still) : S.tApprFull.replace("{n}", po.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ============ RFQ ============ */
  const saveRfq = async () => {
    try {
    if (!rfqPr) return;
    if (rfqVendors.length === 0) { toast(S.tRfqMin3, "info"); return; }
    if (rfqVendors.length < 3) {
      const lanjut = window.confirm(locale === "en" ? `Continue with ${rfqVendors.length} vendor(s)? (minimum 3)` : `Lanjut dengan ${rfqVendors.length} vendor? (minimal 3)`);
      if (!lanjut) return;
    }
    await add("rfqs", {
      prId: rfqPr.id, item: rfqPr.item, vendors: rfqVendors, quotes: [],
      status: "Draf", winner: "",
    }, { action: "membuat RFQ", target: rfqPr.id, module: "Procurement" });
    await update("requisitions", rfqPr.id, { status: "RFQ" });
    toast(S.tRfqCreated.replace("{n}", rfqPr.id));
    setRfqPr(null);
    setRfqVendors([]);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveQuote = async () => {
    try {
    if (!quoteRfq) return;
    if (!quoteForm.vendor) { toast(S.tPilihVendor, "info"); return; }
    const price = Number(quoteForm.price);
    if (!price || price <= 0) { toast(S.tHargaQuote, "info"); return; }
    if (!quoteForm.eta) { toast(S.tEtaWajib, "info"); return; }
    const prPagu = requisitions.find((r) => r.id === quoteRfq.prId);
    const pagu = prPagu ? Number(prPagu.amount || 0) : 0;
    if (pagu > 0 && price > pagu * 1.2) {
      toast(locale === "en" ? `Quote ${fmtRupiah(price)} is >20% above PR ceiling ${fmtRupiah(pagu)}` : `Quote ${fmtRupiah(price)} >20% di atas pagu PR ${fmtRupiah(pagu)}`, "info");
    }
    const cur = (Array.isArray(quoteRfq.quotes) ? quoteRfq.quotes : []) as Quote[];
    const next = [...cur.filter((x) => x.vendor !== quoteForm.vendor), { vendor: quoteForm.vendor, price, eta: quoteForm.eta }];
    const nextStatus = quoteRfq.status === "Terkirim" ? "Evaluasi" : quoteRfq.status;
    await update("rfqs", quoteRfq.id, { quotes: next, status: nextStatus });
    toast(S.tQuoteSaved.replace("{n}", quoteForm.vendor));
    setQuoteRfq(null);
    setQuoteForm({ vendor: "", price: "", eta: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmWin = async () => {
    if (!winRfq) return;
    if (!winVendor) { toast(S.tPilihMenang, "info"); return; }
    const quotes = (Array.isArray(winRfq.quotes) ? winRfq.quotes : []) as Quote[];
    const win = quotes.find((x) => sameName(x.vendor, winVendor));
    if (!win) { toast(S.tMenangNoQuote, "info"); return; }
    const plafon = cekPlafon(winVendor, win.price);
    if (plafon && !plafon.ok) { toast(S.tPlafon.replace("{a}", fmtRupiah(plafon.pakai)).replace("{b}", fmtRupiah(plafon.plafon)), "info"); return; }
    try {
      await update("rfqs", winRfq.id, { winner: winVendor, status: "Diputuskan" });
      const prWin = requisitions.find((r) => r.id === winRfq.prId);
      const wQty = Number(prWin?.qty || 0) > 0 ? Number(prWin?.qty) : 1;
      const wUnit = String(prWin?.unit || "pcs");
      const wProject = String(prWin?.project || "-");
      const wVessel = String(prWin?.vessel || data.projects.find((p) => p.id === String(prWin?.project || ""))?.vessel || "");
      const exact = invList.find((i) => String(i.name).toLowerCase() === String(winRfq.item).toLowerCase());
      const created = await add("purchaseOrders", {
        poType: "Besar", item: winRfq.item, itemId: exact?.id ?? "", vendor: winVendor,
        req: winRfq.prId, prIds: [winRfq.prId], rfqId: winRfq.id, amount: win.price, qty: wQty,
        lines: [{ name: winRfq.item, qty: wQty, unit: wUnit, price: wQty > 0 ? Math.round((Number(win.price) / wQty) * 100) / 100 : Number(win.price) }],
        project: wProject, vessel: wVessel, eta: win.eta, receivedQty: 0, returnedQty: 0,
        docNo: sbPoNumber(nextPoSeq()),
        status: "Draft", date: todayISO(), revisi: "", amendments: [], approvals: [],
      }, { action: "memenangkan RFQ", target: `${winRfq.id} → ${winVendor}`, module: "Procurement" });
      const pr = requisitions.find((r) => r.id === winRfq.prId);
      if (pr) await update("requisitions", pr.id, { status: "Sudah PO" });
      toast(S.tWinInfo.replace("{n}", winRfq.id).replace("{a}", winVendor).replace("{b}", created.id));
      setWinRfq(null);
      setWinVendor("");
    } catch {
      toast(S.tWinFail.replace("{n}", winRfq.id), "info");
    }
  };

  /* ============ KONSOLIDASI ============ */
  const saveKonsolidasi = async () => {
    if (konsIds.length < 2) { toast(S.tKonsMin2, "info"); return; }
    if (!konsVendor) { toast(S.tVendorWajib, "info"); return; }
    const prs = requisitions.filter((r) => konsIds.includes(r.id));
    if (prs.some((r) => r.status !== "Disetujui")) { toast(S.tKonsStatus, "info"); return; }
    const lines = prs.map((r) => {
      const q = Number(r.qty || 0) > 0 ? Number(r.qty) : 1;
      return { name: r.item, qty: q, unit: String(r.unit || "pcs"), price: Math.round((Number(r.amount || 0) / q) * 100) / 100 };
    });
    const total = lineTotal(lines);
    if (konsProject) {
      const info = budgetInfo(konsProject, total);
      if (info && info.aktif + total > info.sisa) { toast(S.tKonsBudget, "info"); return; }
    }
    const plafon = cekPlafon(konsVendor, total);
    if (plafon && !plafon.ok) { toast(S.tPlafon.replace("{a}", fmtRupiah(plafon.pakai)).replace("{b}", fmtRupiah(plafon.plafon)), "info"); return; }
    try {
      const created = await add("purchaseOrders", {
        poType: "Besar", item: `Konsolidasi ${prs.length} PR`, itemId: "",
        vendor: konsVendor, req: prs.map((r) => r.id).join(", "), prIds: prs.map((r) => r.id), amount: total, qty: lines.reduce((s, l) => s + Number(l.qty || 0), 0),
        lines, project: konsProject || String(prs.map((r) => r.project).find(Boolean) || "-"), vessel: String(prs.map((r) => r.vessel).find(Boolean) || ""), eta: konsEta || "",
        docNo: sbPoNumber(nextPoSeq()),
        receivedQty: 0, returnedQty: 0, status: "Draft", date: todayISO(), revisi: "", amendments: [], approvals: [],
      }, { action: "konsolidasi PR ke PO", target: prs.map((r) => r.id).join(", "), module: "Procurement" });
      for (const r of prs) {
        await update("requisitions", r.id, { status: "Sudah PO" });
      }
      toast(S.tKonsOk.replace("{n}", String(prs.length)).replace("{a}", created.id));
      setKonsIds([]);
      setKonsVendor("");
      setKonsProject("");
      setKonsEta("");
    } catch {
      toast(S.tKonsFail, "info");
    }
  };

  /* ============ SKOR VENDOR (Q40 + D30 + P30, skala 100 - docs/11) ============ */
  const evalPreview = (() => {
    const q = Number(evalQ), d = Number(evalD), p = Number(evalP);
    if (![q, d, p].every((n) => n >= 1 && n <= 5)) return null;
    return Math.round(q * 8 + d * 6 + p * 6);
  })();

  const saveEval = async () => {
    try {
    if (!evalPo) return;
    const q = Number(evalQ), d = Number(evalD), p = Number(evalP);
    if (![q, d, p].every((n) => n >= 1 && n <= 5)) { toast(S.tEvalRange, "info"); return; }
    const score = Math.round(q * 8 + d * 6 + p * 6);
    const v = vendors.find((x) => sameName(x.name, evalPo.vendor));
    if (!v) { toast(S.tVendNotFound, "info"); return; }
    const next = [...scoresOf(v), { po: evalPo.id, q, d, p, score, date: todayISO() }];
    const avg = next.reduce((s, x) => s + Number(x.score), 0) / next.length;
    const patch: Record<string, unknown> = { scores: next };
    if (avg < 60) patch.status = "Blacklist";
    await update("vendors", v.id, patch);
    await update("purchaseOrders", evalPo.id, { evaluated: true });
    log("evaluasi vendor", `${v.name}: skor ${score} dari ${evalPo.id} (rata-rata ${Math.round(avg)})`, "Procurement");
    toast(avg < 60 ? S.tEvalBlack.replace("{n}", v.name).replace("{a}", String(score)).replace("{b}", String(Math.round(avg))) : S.tEvalSaved.replace("{n}", v.name).replace("{a}", String(score)));
    setEvalPo(null);
    setEvalQ("");
    setEvalD("");
    setEvalP("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const savePayung = async () => {
    try {
    if (!payungVendor) return;
    const plafon = Number(payungPlafon);
    if (payungPlafon.trim() !== "" && (!plafon || plafon <= 0)) { toast(S.tPlafonPos, "info"); return; }
    if (payungPlafon.trim() === "") {
      await update("vendors", payungVendor.id, { payung: null });
      log("hapus kontrak payung", payungVendor.name, "Procurement");
      toast(S.tPayDel.replace("{n}", payungVendor.name));
    } else {
      await update("vendors", payungVendor.id, { payung: { periode: payungPeriode.trim() || "-", plafon } });
      log("kontrak payung", `${payungVendor.name}: plafon ${fmtRupiah(plafon)} (${payungPeriode.trim() || "-"})`, "Procurement");
      toast(S.tPaySaved.replace("{n}", payungVendor.name));
    }
    setPayungVendor(null);
    setPayungPeriode("");
    setPayungPlafon("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ============ AMANDEMEN ============ */
  const confirmAmendNow = async () => {
    try {
    if (!amendPo) return;
    const st = normPo(amendPo.status);
    if (st !== "Disetujui" && st !== "Dikirim") { toast(S.tAmdOnly, "info"); return; }
    if (!amendForm.name.trim()) { toast(S.tAmdName, "info"); return; }
    const qty = Number(amendForm.qty);
    const price = Number(amendForm.price);
    if (!qty || qty <= 0 || !price || price <= 0) { toast(S.tAmdQtyPrice, "info"); return; }
    if (!amendForm.note.trim()) { toast(S.tAmdNote, "info"); return; }
    const cur = (amendPo.revisi as string) || "";
    const n = cur.startsWith("R") ? Number(cur.slice(1)) + 1 : 1;
    const revisi = `R${n}`;
    const newLine = { name: amendForm.name.trim(), qty, unit: amendForm.unit, price };
    const lines = [...poLines(amendPo).map((l) => ({ name: l.name, qty: Number(l.qty) || 0, unit: l.unit, price: Number(l.price) || 0 })), newLine];
    const amendments = [...(Array.isArray(amendPo.amendments) ? amendPo.amendments : []), { note: amendForm.note.trim(), date: todayISO(), revisi }];
    await update("purchaseOrders", amendPo.id, { lines, amendments, revisi, amount: lineTotal(lines) });
    log("amandemen PO", `${amendPo.id} ${revisi}: ${amendForm.note.trim()}`, "Procurement");
    toast(S.tAmdOk.replace("{a}", amendPo.id).replace("{b}", revisi));
    setAmendPo(null);
    setConfirmAmend(false);
    setAmendForm({ name: "", qty: "1", unit: "pcs", price: "", note: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ============ CETAK (kop SB + pecah DPP/PPN bila include) ============ */
  const cetakPo = (po: StoreItem) => {
    const lines = poLines(po);
    const split = po.includePpn === false ? null : sbSplitIncludePpn(Number(po.amount || 0), getSetting(data, "PPN_RATE", 12));
    const rows: (string | number | null)[][] = [
      [SB_KOP.line1, SB_KOP.name],
      [SB_KOP.hq, `${SB_KOP.addr1} · HP ${SB_KOP.hp}`],
      [],
      [S.xPo, po.docNo ? `${po.id} / ${po.docNo}` : po.id],
      [S.xTipe, po.poType === "Kecil" ? S.tabSmall : S.tabBig],
      [S.vendor, po.vendor ?? "-"],
      [S.xRefPr, po.req ?? "-"],
      [S.proyek, po.project ?? "-"],
      [S.xUtk, po.vessel ?? "-"],
      [S.xTgl, fmtTanggal(po.date)],
      [S.eta, po.eta ? fmtTanggal(po.eta) : "-"],
      [S.status, normPo(po.status)],
      [S.xLevelAppr, levelOf(Number(po.amount || 0), APPROVE_PO_LIMIT)],
      [S.xAppr, apprOf(po).length > 0 ? apprOf(po).map((a) => S.apprJoin.replace("{n}", a.level).replace("{a}", a.by).replace("{b}", a.date)).join("; ") : "-"],
      [S.noFaktur, po.noFaktur ?? "-"],
      [S.tglFaktur, po.tglFaktur ? fmtTanggal(po.tglFaktur) : "-"],
      [S.xDenda, Number(po.dendaRp || 0)],
      [],
      [S.xBaris, S.qty, S.satuan, S.harga, S.xSubtotal],
      ...lines.map((l) => [l.name, l.qty, l.unit, l.price, Number(l.qty) * Number(l.price)]),
      [S.xTotal, "", "", "", Number(po.amount || lineTotal(lines))],
      ...(split ? [[S.xDpp.replace("{n}", String(ppnRate)), "", "", "", split.dpp], [S.xPpn.replace("{n}", String(ppnRate)), "", "", "", split.ppn]] : []),
    ];
    void exportExcel(rows, `PO-${po.id}`, "PO").catch(() => toast(S.saveFail, "info"));
    toast(S.tPoExport.replace("{n}", po.id));
  };

  /* ============ TERIMA & RETUR (qty persis) ============ */
  const openRecv = (po: StoreItem) => {
    setRecvPo(po);
    setRecvItem(po.itemId ?? "");
    setRecvQty(po.qty ? String(po.qty) : "");
    setRecvNoFaktur(po.noFaktur ? String(po.noFaktur) : "");
    setRecvTglFaktur(po.tglFaktur ? String(po.tglFaktur) : "");
    setRecvDendaPct("0.1");
  };

  const recvLate = recvPo ? lateDaysOf(recvPo) : 0;
  const recvDendaPreview = (() => {
    if (!recvPo || recvLate <= 0) return 0;
    const pct = Math.min(5, Math.max(0, Number(recvDendaPct) || 0));
    if (pct <= 0) return 0;
    return Math.round(Math.min(Number(recvPo.amount || 0) * 0.05, Number(recvPo.amount || 0) * (pct / 100) * recvLate));
  })();

  const confirmRecv = async (mode: "penuh" | "sebagian") => {
    if (!recvPo) return;    const qty = Number(recvQty);
    if (!qty || qty <= 0) { toast(S.tRecvQty, "info"); return; }
    const orderedQty = Number(recvPo.qty || 0);
    if (orderedQty > 0 && Number(recvPo.receivedQty || 0) + qty > orderedQty) { toast(S.tRecvOver.replace("{a}", String(orderedQty)).replace("{b}", String(Number(recvPo.receivedQty || 0))), "info"); return; }
    const isBig = recvPo.poType !== "Kecil";
    if (isBig && (!recvNoFaktur.trim() || !recvTglFaktur)) { toast(S.tFakturWajib, "info"); return; }
    if (!isBig && !recvNoFaktur.trim()) { toast(S.tNotaWajib, "info"); return; }
    const invItem = invList.find((i) => i.id === recvItem);
    if (!invItem) { toast(isBig ? S.tPilihItem : S.tKecilItem, "info"); return; }
    try {
      if (invItem) {
      const unitPrice = orderedQty > 0 ? Number(recvPo.amount || 0) / orderedQty : 0;
      const oldStock = Number(invItem.stock || 0);
      const oldAvg = Number(invItem.avgCost) > 0 ? Number(invItem.avgCost) : Number(invItem.cost || 0);
      const invPatch: Record<string, unknown> = { stock: oldStock + qty };
      if (unitPrice > 0 && oldStock + qty > 0) {
        invPatch.avgCost = Math.round(((oldStock * oldAvg + qty * unitPrice) / (oldStock + qty)) * 100) / 100;
      }
      await update("inventory", invItem.id, invPatch);
      await add("movements", {
        item: invItem.name, itemId: invItem.id, type: "Penerimaan", qty, by: recvPo.id, date: todayISO(), tone: "in",
      }, { action: "menerima barang", target: `${invItem.name} × ${qty} (${recvPo.id})`, module: "Procurement" });
    }
    /* Denda: hari telat × % per hari dari nilai PO, dibatasi 5%. */
    const prevDenda = Number(recvPo.dendaRp || 0);
    let dendaRp = prevDenda;
    const late = lateDaysOf(recvPo);
    const pct = Math.min(5, Math.max(0, Number(recvDendaPct) || 0));
    if (prevDenda <= 0 && late > 0 && pct > 0) {
      dendaRp = Math.round(Math.min(Number(recvPo.amount || 0) * 0.05, Number(recvPo.amount || 0) * (pct / 100) * late));
    }
    const dendaBaru = Math.max(0, dendaRp - prevDenda);
    await update("purchaseOrders", recvPo.id, {
      itemId: invItem ? invItem.id : recvPo.itemId,
      item: invItem ? invItem.name : recvPo.item,
      qty: recvPo.qty ?? qty,
      receivedQty: Number(recvPo.receivedQty || 0) + qty,
      status: mode === "penuh" ? "Diterima" : "Diterima Sebagian",
      noFaktur: recvNoFaktur.trim(),
      tglFaktur: recvTglFaktur,
      dendaRp,
    });
    /* Auto-AP dari penerimaan (3-way match PO-terima-invoice): hutang vendor terbentuk saat terima.
       Idempoten: kunci po PERSIS sama dengan yang ditulis ("ID / docNo"), dicek ke
       payables segar; sudah ada → toast info + lewati insert. */
    const poKey = recvPo.docNo ? `${recvPo.id} / ${recvPo.docNo}` : String(recvPo.id);
    const apExists = (await freshPayables(data.payables ?? [])).some((a) => String(a.po ?? "") === poKey);
    if (apExists && Number(recvPo.amount || 0) > 0) {
      toast(locale === "en" ? `Payable ${poKey} already exists - skipping duplicate entry` : `Hutang ${poKey} sudah ada - lewati pencatatan ganda`, "info");
    }
    if (!apExists && Number(recvPo.amount || 0) > 0) {
      const poAmount = Number(recvPo.amount || 0);
      const apAmt = orderedQty > 0 ? Math.round((poAmount * qty) / orderedQty) : poAmount;
      const apTotal = apAmt + dendaBaru;
      const dueDate = (() => {
        const t = Date.parse(recvTglFaktur || todayISO());
        if (Number.isNaN(t)) return todayISO();
        return new Date(t + 30 * 86400000).toISOString().slice(0, 10);
      })();
      await add("payables", {
        v: String(recvPo.vendor ?? ""), kodePembantu: String(recvPo.vendor ?? ""),
        po: poKey,
        openAwal: 0, amt: apTotal, due: dueDate,
        pph: "2%", st: "Belum Dibayar", vessel: String(recvPo.vessel ?? ""),
        item: String(recvPo.item ?? ""), pay1: 0, pay2: 0,
        noFaktur: recvNoFaktur.trim(), tglFaktur: recvTglFaktur,
      }, { action: "auto-hutang dari penerimaan barang", target: `${recvPo.id} (3-way match)`, module: "Procurement" });
      log("auto-hutang penerimaan barang", `${recvPo.id} → hutang ${recvPo.vendor} ${fmtRupiah(apTotal)}`, "Procurement");
    }
    if (late > 0 && dendaRp > 0) log("denda keterlambatan", `${recvPo.id}: telat ${late} hari → ${fmtRupiah(dendaRp)}`, "Procurement");
    toast(`${recvPo.id} ${mode === "penuh" ? S.tRecvPenuh : S.tRecvSebagian}${invItem ? S.tRecvStok.replace("{a}", invItem.name).replace("{b}", String(qty)) : ""}${dendaRp > 0 ? S.tRecvDenda.replace("{n}", fmtRupiah(dendaRp)) : ""}`);
    setRecvPo(null);
    setRecvItem("");
    setRecvQty("");
    setRecvNoFaktur("");
    setRecvTglFaktur("");
    setRecvDendaPct("0.1");
    } catch {
      toast(S.tRecvFail.replace("{n}", recvPo.id), "info");
    }
  };

  const maxRet = (po: StoreItem): number =>
    Math.max(0, Number(po.receivedQty ?? po.qty ?? 0) - Number(po.returnedQty ?? 0));

  const confirmRetur = async () => {
    if (!retPo) return;
    const qty = Number(retQty);
    if (!qty || qty <= 0) { toast(S.tRetQty, "info"); return; }
    if (qty > maxRet(retPo)) { toast(S.tRetOver.replace("{n}", String(maxRet(retPo))), "info"); return; }
    if (!retNote.trim()) { toast(S.tRetNote, "info"); return; }
    const invItem = invList.find((i) => i.id === retPo.itemId);
    if (!invItem) { toast(S.tRetNoLink, "info"); return; }
    if (Number(invItem.stock) < qty) { toast(S.tRetStok, "info"); return; }
    try {
      await update("inventory", invItem.id, { stock: Number(invItem.stock) - qty });
      await add("movements", {
        item: invItem.name, itemId: invItem.id, type: "Retur", qty, by: `${retPo.id} - ${retNote.trim()}`, date: todayISO(), tone: "out",
      }, { action: "meretur barang", target: `${invItem.name} × ${qty} (${retPo.id})`, module: "Procurement" });
      await update("purchaseOrders", retPo.id, { returnedQty: Number(retPo.returnedQty || 0) + qty });
      log("meretur barang", `${invItem.name} × ${qty} (${retPo.id}): ${retNote.trim()}`, "Procurement");
      toast(S.tRetOk.replace("{a}", retPo.id).replace("{b}", String(qty)));
      setRetPo(null);
      setRetQty("");
      setRetNote("");
    } catch {
      toast(S.tRetFail.replace("{n}", retPo.id), "info");
    }
  };

  const approvePr = async (r: StoreItem, ok: boolean) => {
    try {
    await update("requisitions", r.id, { status: ok ? "Disetujui" : "Ditolak" });
    toast(ok ? S.tPrOk.replace("{n}", r.id) : S.tPrNo.replace("{n}", r.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const poAksi = (po: StoreItem) => {
    const st = normPo(po.status);
    const nx = po.poType === "Kecil" ? null : nextLevel(po, APPROVE_PO_LIMIT);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button className="btn-secondary text-xs" onClick={() => setPoDetail(po)}>{locale === "en" ? "Detail" : "Detail"}</button>
        {st === "Draft" && <button className="btn-primary text-xs" onClick={() => doPoStatus(po, "Diajukan")}>{S.btnAjukan} - {locale === "en" ? "next" : "lanjut"}</button>}
        {st === "Draft" && (
          <button className="btn-secondary text-xs text-rose-600" aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${po.id}`} onClick={() => setDelPo(po)}>
            {locale === "en" ? "Delete" : "Hapus"}
          </button>
        )}
        {st === "Diajukan" && po.poType === "Kecil" && (
          <button className="btn-primary text-xs" onClick={() => setConfirmApprove(po)}><Check className="h-3.5 w-3.5" /> {S.btnSetujui}</button>
        )}
        {st === "Diajukan" && po.poType !== "Kecil" && (
          <>
            {(() => {
              const need = needLevels(Number(po.amount || 0), APPROVE_PO_LIMIT);
              const done = apprOf(po);
              return nx
                ? <button className="btn-primary text-xs" onClick={() => void busy.run(`approve-${po.id}`, () => doApproveLevel(po))} disabled={busy.isBusy(`approve-${po.id}`)}><Check className="h-3.5 w-3.5" /> {S.btnSetujuiNx.replace("{n}", nx)} - {done.length + 1}/{need.length}</button>
                : <span className="text-xs text-steel-400">{S.menungguTahap}</span>;
            })()}
          </>
        )}
        {st === "Disetujui" && (
          <button className="btn-primary text-xs" onClick={() => doPoStatus(po, "Dikirim")}><Send className="h-3.5 w-3.5" /> {S.btnKirim} - {locale === "en" ? "next" : "lanjut"}</button>
        )}
        {(st === "Dikirim" || st === "Diterima Sebagian") && (
          <button className="btn-primary text-xs" onClick={() => openRecv(po)}>{S.btnTerima} - {locale === "en" ? "stock in" : "stok masuk"}</button>
        )}
        {st === "Diterima" && !po.evaluated && (
          <button className="btn-primary text-xs" aria-label={S.ariaNilaiVendor.replace("{n}", po.id)} onClick={() => { setEvalPo(po); setEvalQ(""); setEvalD(""); setEvalP(""); }}>
            <Star className="h-3.5 w-3.5" /> {S.btnNilai}
          </button>
        )}
        <details className="relative">
          <summary className="btn-secondary cursor-pointer list-none text-xs">{locale === "en" ? "More" : "Lainnya"}</summary>
          <div className="absolute right-0 z-20 mt-1 flex w-40 flex-col gap-1 rounded-xl border border-steel-200 bg-white p-1.5 shadow-lift">
            {(st === "Diajukan") && (
              <button className="rounded-lg px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-steel-50" aria-label={S.ariaTolakN.replace("{n}", po.id)} onClick={() => setConfirmRejectPo(po)}><X className="mr-1 inline h-3.5 w-3.5" />{S.btnTolak}</button>
            )}
            {(st === "Dikirim") && (
              <button className="rounded-lg px-2 py-1.5 text-left text-xs text-steel-600 hover:bg-steel-50" onClick={() => openRecv(po)}>{S.btnTerimaSebagian}</button>
            )}
            {(st === "Disetujui" || st === "Dikirim") && (
              <button className="rounded-lg px-2 py-1.5 text-left text-xs text-steel-600 hover:bg-steel-50" aria-label={S.ariaAmandemen.replace("{n}", po.id)} onClick={() => { setAmendPo(po); setAmendForm({ name: "", qty: "1", unit: "pcs", price: "", note: "" }); }}>
                {S.btnAmandemen}
              </button>
            )}
            {st === "Diterima" && (
              <button className="rounded-lg px-2 py-1.5 text-left text-xs text-steel-600 hover:bg-steel-50" aria-label={S.ariaRetur.replace("{n}", po.id)} onClick={() => { setRetPo(po); setRetQty(""); setRetNote(""); }}>
                {S.btnRetur}
              </button>
            )}
            <button className="rounded-lg px-2 py-1.5 text-left text-xs text-steel-600 hover:bg-steel-50" aria-label={S.ariaCetak.replace("{n}", po.id)} onClick={() => cetakPo(po)}>{S.btnCetak}</button>
          </div>
        </details>
        {poNext(po.status).length === 0 && st !== "Diterima" && st !== "Ditolak" && <span className="text-xs text-steel-400">-</span>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={S.pageTitle}
        icon={<ShoppingCart className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            {tab === "Vendor" ? (
              <button className="btn-primary-gradient" onClick={() => setShowVendor(true)}><Plus className="h-4 w-4" /> {S.btnTambahVendor}</button>
            ) : (
              <>
                <button className="btn-primary-gradient" onClick={() => setShowPr(true)}><Plus className="h-4 w-4" /> {locale === "en" ? "Request goods" : "Minta Barang"}</button>
                {tab === "PO Besar (Kantor)" && (
                  <button className="btn-secondary text-xs" onClick={() => setShowBig(true)}>{S.btnCreateBig}</button>
                )}
                {tab === "PO Kecil (Workshop)" && (
                  <button className="btn-secondary text-xs" onClick={() => setShowSmall(true)}>{S.btnCreateSmall}</button>
                )}
              </>
            )}
          </div>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiActive} value={String(purchaseOrders.length)} icon={<ShoppingCart className="h-5 w-5" />} chip="navy" spark={poCountTrend} hint={S.kpiActiveHint} />
        <KpiCard label={S.kpiOpen} value={fmtRupiah(openPo)} hint={S.kpiOpenHint} icon={<ShoppingCart className="h-5 w-5" />} chip="teal" spark={poValueTrend} />
        <KpiCard label={S.kpiPending} value={S.pendingPrVal.replace("{n}", String(pendingPr))} hint={S.kpiPendingHint} icon={<ClipboardList className="h-5 w-5" />} chip="amber" spark={prPendingTrend} />
        <KpiCard label={S.kpiVendor} value={String(vendors.length)} icon={<Factory className="h-5 w-5" />} chip="violet" hint={S.kpiVendorHint} spark={vendorTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["PR", "RFQ", "PO Besar (Kantor)", "PO Kecil (Workshop)", "Vendor"]} active={tab} onChange={setTab} labels={{ PR: S.tabPr, RFQ: S.tabRfq, "PO Besar (Kantor)": S.tabBig, "PO Kecil (Workshop)": S.tabSmall, Vendor: S.tabVendor }} />
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
              <input className="input pl-9 w-full" placeholder={S.searchPh} aria-label={S.searchAria} value={pq} onChange={(e) => setPq(e.target.value)} />
            </div>
            <FilterPopover
              activeCount={[pStatus !== "Semua"].filter(Boolean).length}
              initial={{ status: pStatus }}
              onReset={() => { setPq(""); setPStatus("Semua"); }}
              onApply={(d) => { setPStatus(d.status); }}
            >
              {(draft, setDraft) => (
                <div className="space-y-3">
                  <Field label={S.status}>
                    <select className="input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                      {(STATUS_OPSI[tab] ?? ["Semua"]).map((s) => <option key={s} value={s}>{s === "Semua" ? S.allStatus : s}</option>)}
                    </select>
                  </Field>
                  <Field label="Kategori vendor">
                    <select className="input w-full" value={vCatF} onChange={(e) => setVCatF(e.target.value)}>
                      <option value="Semua">Semua kategori</option>
                      {VENDOR_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </FilterPopover>
            {(tab === "PO Besar (Kantor)" || tab === "PO Kecil (Workshop)" || tab === "Vendor") && (
              <label className="flex items-center gap-1.5 text-xs text-steel-500">
                <span className="whitespace-nowrap">Kategori vendor:</span>
                <select className="input w-auto py-1.5 text-xs" value={vCatF} onChange={(e) => setVCatF(e.target.value)}>
                  <option value="Semua">Semua kategori</option>
                  {VENDOR_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            {(pq.trim() !== "" || pStatus !== "Semua" || vCatF !== "Semua") && (
              <button className="btn-secondary text-xs" onClick={() => { setPq(""); setPStatus("Semua"); setVCatF("Semua"); }}>
                {locale === "en" ? "Reset" : "Atur Ulang"}
              </button>
            )}
          </div>
          {tab === "PO Besar (Kantor)" && (
            <div className="space-y-4">
              <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">{S.bigInfo.replace("{n}", fmtRupiah(PO_KECIL_LIMIT))}</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label={S.po} sortKey="po" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.item} sortKey="item" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.vendor} sortKey="vendor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.nilai} sortKey="nilai" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.level} sortKey="level" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.eta} sortKey="eta" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.revisi} sortKey="revisi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.status} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.aksi}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {bigPager.slice(sortedBig).map((po) => {
                      const st = normPo(po.status);
                      const need = needLevels(Number(po.amount || 0), APPROVE_PO_LIMIT);
                      const done = apprOf(po);
                      const payung = vendors.some((v) => sameName(v.name, po.vendor) && payungOf(v));
                      return (
                        <tr key={po.id} id={notifRowId(String(po.id))} className={flash.flashId === String(po.id) ? "notif-hl notif-flash hover:bg-surface" : (notified.has(String(po.id)) ? "notif-hl hover:bg-surface" : "hover:bg-surface")}>
                          <td className="td font-mono font-medium text-navy-900">{po.id}
                            {po.docNo && <p className="text-xs font-normal text-steel-400">{String(po.docNo)}</p>}
                          </td>
                          <td className="td text-steel-600">
                            <p className="truncate" title={String(po.item)}>{po.item}</p>
                            {(po.qty || po.receivedQty) && (
                              <p className="text-xs text-steel-400">
                                {S.qtyDiterima.replace("{a}", po.qty ? fmtJumlah(Number(po.qty)) : "-").replace("{b}", fmtJumlah(Number(po.receivedQty || 0)))}
                                {Number(po.returnedQty || 0) > 0 && S.returN.replace("{n}", fmtJumlah(Number(po.returnedQty)))}
                              </p>
                            )}
                            {poLines(po).length > 0 && (
                              <p className="text-xs text-steel-400 truncate" title={poLines(po).map((l) => `${l.name} ×${l.qty}`).join("; ")}>{S.barisPr.replace("{n}", String(poLines(po).length)).replace("{a}", String(po.req ?? ""))}</p>
                            )}
                            {poLines(po).some((l) => l.spec || l.need) && (
                              <p className="text-xs text-steel-400 truncate" title={poLines(po).map((l) => [l.name, l.spec, l.need].filter(Boolean).join(" — ")).join("; ")}>
                                {poLines(po).map((l) => [l.spec, l.need].filter(Boolean).join(" — ")).filter(Boolean).join("; ")}
                              </p>
                            )}
                            {po.noFaktur && (
                              <p className="text-xs text-steel-400 truncate" title={S.fakturN.replace("{n}", String(po.noFaktur))}>{S.fakturN.replace("{n}", String(po.noFaktur))}{po.tglFaktur ? S.dotN.replace("{n}", fmtTanggal(po.tglFaktur)) : ""}</p>
                            )}
                          </td>
                          <td className="td text-steel-600">
                            <p className="truncate" title={String(po.vendor)}>{po.vendor}</p>
                            {venCatOf(String(po.vendor ?? "")) !== "" && <p className="text-xs text-steel-400">{venCatOf(String(po.vendor ?? ""))}</p>}
                            {payung && <span className="mt-0.5 inline-block"><Badge tone="navy">{S.payung}</Badge></span>}
                          </td>
                          <td className="td font-semibold">
                            {fmtRupiah(po.amount)}
                            {Number(po.dendaRp || 0) > 0 && <p className="text-xs font-normal text-rose-600">{S.dendaN.replace("{n}", fmtRupiah(Number(po.dendaRp)))}</p>}
                          </td>
                          <td className="td">
                            <Badge tone="navy">{levelOf(Number(po.amount || 0), APPROVE_PO_LIMIT)}</Badge>
                            <p className="mt-0.5 text-xs text-steel-400">{S.tahap.replace("{a}", String(done.length)).replace("{b}", String(need.length))}{done.length > 0 ? S.tahapLanjut.replace("{n}", done.map((a) => a.level).join(" → ")) : ""}</p>
                          </td>
                          <td className="td text-steel-600">
                            {po.eta ? fmtTanggal(po.eta) : "-"}
                            {isLate(po) && <span className="ml-1.5"><Badge tone="red">{S.terlambat}</Badge></span>}
                          </td>
                          <td className="td text-steel-600 font-mono text-xs">{po.revisi || "R0"}</td>
                          <td className="td"><Badge tone={poStatus[po.status] ?? poStatus[st] ?? "gray"}>{st}</Badge></td>
                          <td className="td">{poAksi(po)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {bigShown.length === 0 && <EmptyState title={S.emptyBigT} subtitle={S.emptyBigS} />}
                {bigPager.bar}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title={S.cardSpendT} subtitle={S.cardSpendS} />
                  <div className="flex items-center gap-4 p-4 pt-0">
                    <Donut data={spendByCategory} colors={spendByCategory.map((d) => d.color)} size={130} thickness={18} centerValue="100" centerLabel="%" />
                    <div className="flex-1 space-y-1.5">
                      {spendByCategory.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                          <span className="truncate text-steel-600" title={d.name}>{d.name}</span>
                          <span className="ml-auto font-semibold text-navy-900">{d.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title={S.cardTrenT} subtitle={S.cardTrenS} />
                  <div className="h-44 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={procurementTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs><linearGradient id="procGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} /><stop offset="95%" stopColor="#0d9488" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip formatter={(v) => (typeof v === "number" ? S.chartRpM.replace("{n}", String(v)) : v)} />} />
                        <Area type="monotone" dataKey="pengeluaran" name={S.chartKeluar} stroke="#0d9488" strokeWidth={2.5} fill="url(#procGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              </div>
            </div>
          )}

          {tab === "PO Kecil (Workshop)" && (
            <div className="space-y-4">
              <details>
                <summary className="cursor-pointer rounded-lg bg-steel-50 px-3 py-2 text-xs font-semibold text-steel-600 hover:bg-steel-100">{S.kasT}</summary>
              <Card className="mt-2 p-5">
                <CardHeader title={S.kasT} subtitle={S.kasS} />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Field label={S.kasSaldo.replace("{n}", bulanIni)}>
                    <NumInput min={0} className="input" value={kasAwal} onChange={(e) => setKasAwal(e.target.value)} placeholder={S.phKasContoh} />
                  </Field>
                  <div className="rounded-lg bg-surface p-2.5">
                    <p className="flex items-center gap-1 text-xs text-steel-500"><Wallet className="h-3.5 w-3.5" /> {S.kasBulanIni}</p>
                    <p className="font-semibold text-navy-900">{fmtRupiah(smallBulanTotal)}</p>
                    <p className="text-xs text-steel-400">{S.kasPoKecil.replace("{n}", String(smallBulan.length))}</p>
                  </div>
                  <div className="rounded-lg bg-surface p-2.5">
                    <p className="text-xs text-steel-500">{S.kasSisa}</p>
                    <p className={`font-semibold ${kasSisa < 0 ? "text-rose-600" : "text-navy-900"}`}>{fmtRupiah(kasSisa)}</p>
                    <p className="text-xs text-steel-400">{S.kasSisaHint}</p>
                  </div>
                  <div className="flex items-end">
                    <button className="btn-secondary text-xs" onClick={exportKas}><Printer className="h-3.5 w-3.5" /> {S.btnExport}</button>
                  </div>
                </div>
              </Card>
              </details>
              <div>
                <p className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">{S.smallInfo.replace("{n}", fmtRupiah(PO_KECIL_LIMIT))}</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><SortTh label={S.po} sortKey="po" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.kebutuhan} sortKey="kebutuhan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.vendor} sortKey="vendor" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.nilai} sortKey="nilai" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.level} sortKey="level" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.eta} sortKey="eta" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.revisi} sortKey="revisi" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.status} sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">{S.aksi}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {smallPager.slice(sortedSmall).map((po) => {
                        const st = normPo(po.status);
                        const need = needLevels(Number(po.amount || 0), APPROVE_PO_LIMIT);
                        const done = apprOf(po);
                        return (
                          <tr key={po.id} id={notifRowId(String(po.id))} className={flash.flashId === String(po.id) ? "notif-hl notif-flash hover:bg-surface" : (notified.has(String(po.id)) ? "notif-hl hover:bg-surface" : "hover:bg-surface")}>
                          <td className="td font-mono font-medium text-navy-900">{po.id}
                            {po.docNo && <p className="text-xs font-normal text-steel-400">{po.docNo}</p>}
                            {(() => {
                              const ap = (data.payables ?? []).find((a) => String(a.po ?? "").startsWith(String(po.id)));
                              const gr = Number(po.receivedQty || 0) > 0;
                              if (!gr && !ap) return null;
                              const ok = gr && !!ap && !!po.noFaktur;
                              return <p className="mt-0.5"><Badge tone={ok ? "green" : "amber"}>{ok ? "3-way ✓" : "3-way …"}</Badge></p>;
                            })()}
                          </td>
                            <td className="td text-steel-600">
                              <p className="truncate" title={String(po.item)}>{po.item}</p>
                              <p className="text-xs text-steel-400">{S.qtyBy.replace("{a}", fmtJumlah(Number(po.qty || 0))).replace("{b}", String(po.requester ?? ""))}</p>
                              {/* Workshop dipindah ke sini sebagai sub-teks supaya
                                  kolom tabel PO Kecil sama persis dengan PO Besar
                                  (keputusan client: tampilan disamakan, fungsi
                                  dan modal tetap terpisah). */}
                              {po.workshop && <p className="text-xs text-steel-400 truncate" title={String(po.workshop)}>{S.workshop}: {String(po.workshop)}</p>}
                              {poLines(po).some((l) => l.spec || l.need) && (
                                <p className="text-xs text-steel-400 truncate" title={poLines(po).map((l) => [l.spec, l.need].filter(Boolean).join(" — ")).join("; ")}>
                                  {poLines(po).map((l) => [l.spec, l.need].filter(Boolean).join(" — ")).filter(Boolean).join("; ")}
                                </p>
                              )}
                            </td>
                            <td className="td text-steel-600">
                              <p className="truncate" title={String(po.vendor ?? "-")}>{po.vendor ?? "-"}</p>
                              {venCatOf(String(po.vendor ?? "")) !== "" && <p className="text-xs text-steel-400">{venCatOf(String(po.vendor ?? ""))}</p>}
                            </td>
                            <td className="td font-semibold">{fmtRupiah(po.amount)}</td>
                            <td className="td">
                              <Badge tone="navy">{levelOf(Number(po.amount || 0), APPROVE_PO_LIMIT)}</Badge>
                              <p className="mt-0.5 text-xs text-steel-400">{S.tahap.replace("{a}", String(done.length)).replace("{b}", String(need.length))}</p>
                            </td>
                            <td className="td text-steel-600">
                              {po.eta ? fmtTanggal(po.eta) : "-"}
                              {isLate(po) && <span className="ml-1.5"><Badge tone="red">{S.terlambat}</Badge></span>}
                            </td>
                            <td className="td text-steel-600 font-mono text-xs">{po.revisi || "R0"}</td>
                            <td className="td"><Badge tone={poStatus[st] ?? "gray"}>{st}</Badge></td>
                            <td className="td">{poAksi(po)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {smallShown.length === 0 && <EmptyState title={S.emptySmallT} subtitle={S.emptySmallS} />}
                  {smallPager.bar}
                </div>
              </div>
            </div>
          )}

          {tab === "RFQ" && (
            <div className="space-y-4">
              {quotationStageDistReal.length > 0 && (
                <Card className="p-5" data-export-hide>
                  <CardHeader
                    title={locale === "en" ? "RFQ distribution by stage" : "Distribusi RFQ per Tahap"}
                    subtitle={locale === "en"
                      ? "Count and value from real RFQ records; flags stages older than 14 days"
                      : "Jumlah dan nilai dari baris RFQ nyata; menandai tahap yang lewat 14 hari"}
                  />
                  <div className="mt-3 space-y-2">
                    {quotationStageDistReal.map((d) => {
                      const max = Math.max(...quotationStageDistReal.map((x) => x.count), 1);
                      return (
                        <div key={d.name} className="flex items-center gap-2.5 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
                          <span className="w-24 shrink-0 font-medium text-navy-900">{d.name}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-steel-100">
                            <span className="block h-full rounded-full" style={{ width: `${(d.count / max) * 100}%`, background: d.color }} />
                          </span>
                          <span className="w-8 text-right font-semibold text-navy-900">{d.count}</span>
                          <span className="w-24 text-right text-xs text-steel-500">{fmtRupiah(d.nilai)}</span>
                          <span className="w-28 text-right text-[11px]">
                            {d.minDays !== null && d.minDays > 14 ? (
                              <Badge tone="amber">
                                {locale === "en" ? `${d.minDays}d oldest` : `terlama ${d.minDays} hr`}
                              </Badge>
                            ) : (
                              <span className="text-steel-400">-</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {rfqStuck.length > 0 && (
                      <p className="pt-1 text-[11px] text-amber-700">
                        {locale === "en"
                          ? `${rfqStuck.length} stage(s) hold RFQ older than 14 days - needs follow-up.`
                          : `${rfqStuck.length} tahap menahan RFQ lebih dari 14 hari - perlu ditindaklanjuti.`}
                      </p>
                    )}
                  </div>
                </Card>
              )}
              {rfqShown.map((r) => {
                const quotes = (Array.isArray(r.quotes) ? r.quotes : []) as Quote[];
                const minPrice = quotes.length > 0 ? Math.min(...quotes.map((x) => Number(x.price))) : 0;
                const minEta = quotes.length > 0 ? quotes.map((x) => x.eta).sort()[0] : "";
                return (
                  <Card key={r.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-navy-900">{r.id} · {r.item}</p>
                        <p className="text-xs text-steel-500 truncate" title={S.prN.replace("{n}", String(r.prId))}>{S.rfqPrVendor.replace("{a}", String(r.prId)).replace("{b}", (r.vendors as string[]).join(", "))}</p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {quotes.length === 0
                      ? <div className="mt-2"><EmptyState title={S.emptyQuoteT} subtitle={S.emptyQuoteS} /></div>
                      : (
                        <table className="mt-3 w-full">
                          <thead className="bg-surface sticky top-14 z-10">
                            <tr><SortTh label={S.vendor} sortKey="vendor" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.harga} sortKey="harga" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.eta} sortKey="eta" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.komparasi} sortKey="komparasi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /></tr>
                          </thead>
                          <tbody className="divide-y divide-steel-100">
                            {sortRows(quotes, sort3, (x, k) => {
                              if (k === "harga") return Number(x.price || 0);
                              if (k === "eta") return String(x.eta ?? "");
                              if (k === "komparasi") return String(`${Number(x.price) === minPrice ? "Termurah" : ""} ${x.eta === minEta ? "Tercepat" : ""}`);
                              return String(x.vendor ?? "");
                            }).map((x) => (
                              <tr key={x.vendor}>
                                <td className="td truncate" title={x.vendor}>{x.vendor}</td>
                                <td className="td font-semibold">{fmtRupiah(Number(x.price))}</td>
                                <td className="td text-steel-600">{fmtTanggal(x.eta)}</td>
                                <td className="td">
                                  <div className="flex gap-1.5">
                                    {Number(x.price) === minPrice && <Badge tone="green">{S.cheapest}</Badge>}
                                    {x.eta === minEta && <Badge tone="blue">{S.fastest}</Badge>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(RFQ_NEXT[r.status] ?? []).map((n, i) => (
                        <button key={n} className={i === 0 ? "btn-primary text-xs" : "btn-secondary text-xs"} onClick={async () => { try { await update("rfqs", r.id, { status: n }); toast(S.tArrow.replace("{a}", r.id).replace("{b}", n)); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } }}>{i === 0 ? `${n} - ${locale === "en" ? "next" : "lanjut"}` : n}</button>
                      ))}
                      <button className="btn-secondary text-xs" onClick={() => { setQuoteRfq(r); setQuoteForm({ vendor: "", price: "", eta: "" }); }}>{S.btnInputQuote}</button>
                      {r.status === "Evaluasi" && quotes.length > 0 && (
                        <button className="btn-primary text-xs" onClick={() => {
                          const cheap = quotes.find((x) => Number(x.price) === minPrice);
                          setWinRfq(r); setWinVendor(cheap?.vendor ?? "");
                        }}>{S.btnWin}</button>
                      )}
                      {r.winner && <Badge tone="green">{S.winnerN.replace("{n}", String(r.winner))}</Badge>}
                      {r.status === "Diputuskan" && (() => {
                        const linked = purchaseOrders.find((p) => String(p.rfqId ?? "") === String(r.id));
                        return linked ? <button className="btn-secondary text-xs" onClick={() => { setTab("PO Besar (Kantor)"); setPq(linked.id); }}>{locale === "en" ? "View PO" : "Lihat PO"} {linked.id}</button> : null;
                      })()}
                    </div>
                  </Card>
                );
              })}
              {rfqShown.length === 0 && <EmptyState title={S.emptyRfqT} subtitle={S.emptyRfqS} />}
            </div>
          )}

          {tab === "PR" && (
            <div className="space-y-4">
              <Card className="p-5">
                <CardHeader title={S.konsT} subtitle={S.konsS} />
                {approvedPRs.length === 0
                  ? <p className="py-3 text-center text-sm text-steel-400">{S.konsEmpty}</p>
                  : (
                    <div className="space-y-2">
                      {approvedPRs.map((r) => (
                        <label key={r.id} className="flex items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
                          <input type="checkbox" checked={konsIds.includes(r.id)} onChange={(e) => setKonsIds((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} aria-label={S.konsAria.replace("{n}", r.id)} />
                          <span className="min-w-0 flex-1 truncate font-medium text-navy-900" title={`${r.id} - ${r.item}`}>{r.id} - {r.item}</span>
                          <span className="shrink-0 font-semibold">{fmtRupiah(r.amount)}</span>
                        </label>
                      ))}
                      <FormGrid>
                        <Field label={S.fVendorGab}>
                          <div className="mb-1.5 flex justify-end">{venCatPick("vcat-kons")}</div>
                          <select className="input" value={konsVendor} onChange={(e) => setKonsVendor(e.target.value)}>
                            <option value="">{S.optPilihVendor}</option>
                            {vendByCat.map((v) => <option key={v.id} value={v.name}>{v.name} · {v.cat}</option>)}
                          </select>
                        </Field>
                        <Field label={S.proyek}>
                          <select className="input" value={konsProject} onChange={(e) => setKonsProject(e.target.value)}>
                            <option value="">{S.optTanpaProyek}</option>
                            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
                          </select>
                        </Field>
                      </FormGrid>
                      <Field label={S.eta}><input type="date" className="input" value={konsEta} onChange={(e) => setKonsEta(e.target.value)} /></Field>
                      <button className="btn-primary text-xs" onClick={() => void busy.run("saveKonsolidasi", saveKonsolidasi)} disabled={busy.isBusy("saveKonsolidasi")}>{S.btnKons}</button>
                    </div>
                  )}
              </Card>
              <div>
                <div className="mb-3 flex justify-end">
                  <button className="btn-secondary text-xs" onClick={() => setShowPr(true)}><Plus className="h-3.5 w-3.5" /> {S.btnBuatPr}</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><SortTh label={S.pr} sortKey="pr" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.item} sortKey="item" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.oleh} sortKey="oleh" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.nilai} sortKey="nilai" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.status} sortKey="status" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><th className="th">{S.aksi}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {prPager.slice(sortedPr).map((r) => (
                        <tr key={r.id} id={notifRowId(String(r.id))} className={flash.flashId === String(r.id) ? "notif-hl notif-flash hover:bg-surface" : (notified.has(String(r.id)) ? "notif-hl hover:bg-surface" : "hover:bg-surface")}>
                          <td className="td font-mono font-medium text-navy-900">{r.id}</td>
                          <td className="td text-steel-600">
                            <p className="truncate" title={String(r.item)}>{r.item}</p>
                            {(r.qty || r.unit || r.project) && (
                              <p className="text-xs text-steel-400">{fmtJumlah(Number(r.qty || 0))} {String(r.unit || "pcs")}{r.project ? ` · ${String(r.project)}` : ""}</p>
                            )}
                          </td>
                          <td className="td text-steel-600">{r.by}</td>
                          <td className="td font-semibold">{fmtRupiah(r.amount)}</td>
                          <td className="td"><StatusBadge status={r.status} /></td>
                          <td className="td">
                            <div className="flex flex-wrap gap-1.5">
                              {(r.status === "Draft" || r.status === "Draf") && (
                                <button className="btn-primary text-xs" onClick={async () => { try { await update("requisitions", r.id, { status: "Diajukan" }); log("mengajukan PR", r.id, "Procurement"); toast(S.tPrRowDiajukan.replace("{n}", r.id)); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } }}>{S.btnAjukan}</button>
                              )}
                              {(r.status === "Draft" || r.status === "Draf") && (
                                <button className="btn-secondary text-xs text-rose-600" aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${r.id}`} onClick={() => setDelPr(r)}>
                                  {locale === "en" ? "Delete" : "Hapus"}
                                </button>
                              )}
                              {PR_PENDING.includes(r.status) && (
                                <>
                                  <button className="btn-primary text-xs" onClick={() => approvePr(r, true)}><Check className="h-3.5 w-3.5" /> {S.btnSetujui}</button>
                                  <button className="btn-secondary text-xs text-rose-600" aria-label={S.ariaTolakN.replace("{n}", r.id)} onClick={() => approvePr(r, false)}><X className="h-3.5 w-3.5" /> {S.btnTolak}</button>
                                </>
                              )}
                              {r.status === "Disetujui" && (
                                <button className="btn-primary text-xs" onClick={() => { setRfqPr(r); setRfqVendors([]); }}>{S.btnBuatRfq}</button>
                              )}
                              {r.status === "Ditolak" && (
                                <button className="btn-secondary text-xs" onClick={async () => { try { await update("requisitions", r.id, { status: "Menunggu Approval" }); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } }}>{S.btnAjukanUlang}</button>
                              )}
                              {(r.status === "Sudah PO" || r.status === "RFQ") && (() => {
                                const rfq = rfqs.find((x) => String(x.prId) === String(r.id));
                                const pos = purchaseOrders.filter((p) => {
                                  const ids = Array.isArray(p.prIds) ? (p.prIds as string[]) : [];
                                  const reqIds = String(p.req ?? "").split(",").map((s) => s.trim());
                                  return ids.includes(String(r.id)) || reqIds.includes(String(r.id));
                                });
                                return (
                                  <>
                                    {rfq && <button className="btn-secondary text-xs" onClick={() => { setTab("RFQ"); setPq(rfq.id); }}>{locale === "en" ? "View RFQ" : "Lihat RFQ"} {rfq.id}</button>}
                                    {pos.map((p) => <button key={p.id} className="btn-secondary text-xs" onClick={() => { setTab("PO Besar (Kantor)"); setPq(p.id); }}>{locale === "en" ? "View PO" : "Lihat PO"} {p.id}</button>)}
                                    {!rfq && pos.length === 0 && <span className="text-xs text-steel-400">-</span>}
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {prPager.bar}
                </div>
              </div>
            </div>
          )}

          {tab === "Vendor" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                {venCatPick("vcat-tab")}
                <button className="btn-secondary text-xs" onClick={() => setShowVendor(true)}><Plus className="h-3.5 w-3.5" /> {S.btnTambahVendor}</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {vendorShown.map((v) => {
                  const avg = avgScore(v);
                  const pg = payungOf(v);
                  const isBlack = v.status === "Blacklist";
                  return (
                    <Card key={v.id} className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy-900 truncate" title={String(v.name)}>{v.name}</p>
                          <p className="text-xs text-steel-500">{v.cat}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {pg && <Badge tone="navy">{S.payung}</Badge>}
                          <Badge tone={isBlack ? "red" : v.status === "Aktif" ? "green" : "amber"}>{v.status ?? "Aktif"}</Badge>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-surface p-2.5">
                          <p className="text-xs text-steel-500">{S.vOnTime}</p>
                          <p className="font-semibold text-navy-900">{v.onTime}%</p>
                        </div>
                        <div className="rounded-lg bg-surface p-2.5">
                          <p className="text-xs text-steel-500">{S.vKualitas}</p>
                          <p className="font-semibold text-navy-900">{v.quality}%</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-steel-500">{S.vPoDitangani.replace("{n}", String(v.po ?? ""))}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-sm">
                        <Star className="h-4 w-4 text-amber-500" />
                        {avg === null
                          ? <span className="text-xs text-steel-400">{S.vBelumEval}</span>
                          : <span className="font-semibold text-navy-900">{S.vSkorA.replace("{n}", String(Math.round(avg)))} <span className="font-normal text-steel-400">{S.vSkorB.replace("{n}", String(scoresOf(v).length))}</span></span>}
                      </div>
                      {pg && (
                        <p className="mt-1.5 text-xs text-steel-500">
                          {S.vPayungInfo.replace("{n}", pg.periode).replace("{a}", fmtRupiah(pg.plafon)).replace("{b}", fmtRupiah(plafonPakai(v.name)))}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button className="btn-secondary text-xs" onClick={() => { setPayungVendor(v); setPayungPeriode(pg?.periode === "-" ? "" : pg?.periode ?? ""); setPayungPlafon(pg ? String(pg.plafon) : ""); }}>
                          <Umbrella className="h-3.5 w-3.5" /> {pg ? S.btnUbahPayung : S.btnKontrakPayung}
                        </button>
                        {isBlack && (
                          <button className="btn-secondary text-xs text-rose-600" onClick={() => setUnblockVendor(v)}>{S.btnBukaBlokir}</button>
                        )}
                        <button className="btn-secondary text-xs text-rose-600" aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${v.name}`} onClick={() => setDelVendor(v)}>
                          {locale === "en" ? "Delete" : "Hapus"}
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drawer detail PO: lines + kebutuhan + PR link */}
      <Modal open={poDetail !== null} onClose={() => setPoDetail(null)} title={poDetail ? `${poDetail.id} · ${normPo(poDetail.status)}` : ""} subtitle={poDetail ? `${String(poDetail.vendor ?? "-")} · ${fmtRupiah(Number(poDetail.amount || 0))}${poDetail.docNo ? ` · ${String(poDetail.docNo)}` : ""}` : ""} wide>
        {poDetail && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">{locale === "en" ? "Lines" : "Rincian baris"}</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface"><tr><th className="th">{S.item}</th><th className="th">{S.qty}</th><th className="th">{S.satuan}</th><th className="th">{S.harga}</th><th className="th">{S.nilai}</th></tr></thead>
                  <tbody className="divide-y divide-steel-100">
                    {poLines(poDetail).map((l, i) => (
                      <tr key={i}>
                        <td className="td font-medium text-navy-900">{l.name}</td>
                        <td className="td">{fmtJumlah(Number(l.qty || 0))}</td>
                        <td className="td text-steel-600">{l.unit}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(l.price || 0))}</td>
                        <td className="td font-semibold">{fmtRupiah(Number(l.qty || 0) * Number(l.price || 0))}</td>
                      </tr>
                    ))}
                    {poLines(poDetail).length === 0 && <tr><td colSpan={5} className="td text-center text-steel-400">-</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">{locale === "en" ? "Requirement" : "Kebutuhan"}</p>
              <dl className="dl-div text-sm">
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.kebutuhan}</dt><dd className="text-right font-medium text-navy-900">{String(poDetail.item ?? "-")} · {fmtJumlah(Number(poDetail.qty || 0))} {String(poDetail.unit ?? "")}</dd></div>
                {poDetail.workshop && <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.workshop}</dt><dd className="text-right font-medium text-navy-900">{String(poDetail.workshop)}</dd></div>}
                {poDetail.requester && <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.peminta}</dt><dd className="text-right font-medium text-navy-900">{String(poDetail.requester)}</dd></div>}
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.proyek}</dt><dd className="text-right font-medium text-navy-900">{String(poDetail.project ?? "-")}{poDetail.vessel ? ` · ${String(poDetail.vessel)}` : ""}</dd></div>
              </dl>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">PR</p>
              <div className="flex flex-wrap gap-1.5">
                {(Array.isArray(poDetail.prIds) && poDetail.prIds.length > 0
                  ? (poDetail.prIds as string[])
                  : String(poDetail.req ?? "").split(",").map((s) => s.trim()).filter(Boolean)
                ).map((id) => (
                  <button key={id} className="btn-secondary text-xs" onClick={() => { setPoDetail(null); setTab("PR"); setPq(id); }}>
                    {locale === "en" ? "View PR" : "Lihat PR"} {id}
                  </button>
                ))}
                {String(poDetail.req ?? "-") === "-" && (!Array.isArray(poDetail.prIds) || poDetail.prIds.length === 0) && (
                  <span className="text-xs text-steel-400">-</span>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal PO Besar */}
      <Modal open={showBig} onClose={() => setShowBig(false)} title={S.mBigT} subtitle={S.mBigS}
        wide footer={<><button className="btn-secondary" onClick={() => setShowBig(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={() => void busy.run("saveBig", saveBig)} disabled={busy.isBusy("saveBig")}>{S.btnSimpanBig}</button></>}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={S.ariaTujuan}>
            {(["kapal", "stok"] as const).map((t) => (
              <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${bigForm.tujuan === t ? "border-navy-700 bg-navy-50 text-navy-900" : "border-steel-200 text-steel-600"}`}>
                <input type="radio" name="tujuan-po" checked={bigForm.tujuan === t} onChange={() => setBigForm({ ...bigForm, tujuan: t })} />
                {t === "kapal" ? S.tujuanKapal : S.tujuanStok}
              </label>
            ))}
          </div>
          <FormGrid>
            <Field label={S.fPrDisetujui} hint={S.hintPrWajib}>
              <select className="input" value={bigForm.prId} onChange={(e) => setBigForm({ ...bigForm, prId: e.target.value })}>
                <option value="">{S.optPilihPr}</option>
                {approvedPRs.map((r) => <option key={r.id} value={r.id}>{r.id} - {r.item} · {fmtRupiah(r.amount)}</option>)}
              </select>
            </Field>
            <Field label={S.fItemInv} hint={S.hintItemWajib}>
              <select className="input" value={bigForm.itemId} onChange={(e) => setBigForm({ ...bigForm, itemId: e.target.value })}>
                <option value="">{S.optPilihItem}</option>
                {invList.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.vendor}>
              <div className="mb-1.5 flex justify-end">{venCatPick("vcat-big")}</div>
              <select className="input" value={bigForm.vendor} onChange={(e) => setBigForm({ ...bigForm, vendor: e.target.value })}>
                <option value="">{S.optPilihVendor}</option>
                {vendByCat.map((v) => <option key={v.id} value={v.name}>{v.name} · {v.cat}{payungOf(v) ? ` (Payung: ${fmtRupiah(payungOf(v)!.plafon)})` : ""}</option>)}
              </select>
            </Field>
            <Field label={S.proyekBudget} hint={bigForm.tujuan === "kapal" ? S.hintWajibKapal : S.hintStokAuto}>
              <select className="input" value={bigForm.project} disabled={bigForm.tujuan === "stok"} onChange={(e) => setBigForm({ ...bigForm, project: e.target.value })}>
                <option value="">{S.optTanpaProyek}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.etaWajib}><input type="date" className="input" value={bigForm.eta} onChange={(e) => setBigForm({ ...bigForm, eta: e.target.value })} /></Field>
          <FormGrid>
            <Field label={S.fUtk} hint={bigForm.tujuan === "kapal" ? S.hintUtkContoh : S.hintUtkStok}><input className="input" value={bigForm.vessel} disabled={bigForm.tujuan === "stok"} onChange={(e) => setBigForm({ ...bigForm, vessel: e.target.value })} placeholder={S.phUtk} /></Field>
            <Field label={S.harga} hint={S.hintHarga.replace("{n}", String(ppnRate))}>
              <select className="input" value={bigForm.includePpn ? "include" : "exclude"} onChange={(e) => setBigForm({ ...bigForm, includePpn: e.target.value === "include" })}>
                <option value="include">{S.optIncludePpn.replace("{n}", String(ppnRate))}</option>
                <option value="exclude">{S.optExcludePpn}</option>
              </select>
            </Field>
          </FormGrid>
          <p className="text-xs text-steel-500">{S.docSb} <span className="font-mono">{sbPoNumber(nextPoSeq())}</span> {S.docSbFmt}</p>
          <div>
            <p className="label">{S.barisMin}</p>
            <div className="space-y-2">
              {bigLines.map((l, idx) => (
                <div key={idx} className="rounded-xl border border-steel-200 p-2">
                  <div className="grid grid-cols-12 gap-2">
                    <input className="input col-span-4" placeholder={S.phNamaBaris} value={l.name} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                    <input className="input col-span-3" placeholder="Spesifikasi (cth: MS 6x100)" value={l.spec ?? ""} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, spec: e.target.value } : x)))} />
                    <NumInput min={0} className="input col-span-1" placeholder={S.qty} value={l.qty} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                    <select className="input col-span-1" value={l.unit} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))}>
                      {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <NumInput min={0} className="input col-span-2" placeholder={S.harga} value={l.price} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))} />
                    <button className="btn-secondary col-span-1 text-xs" aria-label={S.ariaHapusBaris.replace("{n}", String(idx + 1))} onClick={() => setBigLines((s) => s.filter((_, i) => i !== idx))}><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <input className="input mt-2 !py-1.5 text-xs" placeholder="Kebutuhan / untuk apa (cth: sheer bulkhead XV-42)" value={l.need ?? ""} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, need: e.target.value } : x)))} />
                  <p className="mt-1 text-[11px] text-steel-500">
                    {l.name.trim() || "Baris ini"} · {fmtJumlah(Number(l.qty || 0))} {l.unit} × {fmtRupiah(Number(l.price || 0))} = <b className="text-navy-900">{fmtRupiah(Number(l.qty || 0) * Number(l.price || 0))}</b>
                  </p>
                </div>
              ))}
            </div>
            <button className="btn-secondary mt-2 text-xs" onClick={() => setBigLines((s) => [...s, { name: "", qty: "1", unit: "pcs", price: "", spec: "", need: "" }])}><Plus className="h-3.5 w-3.5" /> {S.btnTambahBaris}</button>
            <p className="mt-2 text-sm font-semibold text-navy-900">{S.totalLevel.replace("{a}", fmtRupiah(bigTotal)).replace("{b}", levelOf(bigTotal, APPROVE_PO_LIMIT))}</p>
          </div>
          {bigOver && bigBudget && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {S.overBig.replace("{n}", fmtRupiah(bigBudget.aktif)).replace("{a}", fmtRupiah(bigTotal)).replace("{b}", fmtRupiah(bigBudget.sisa))}
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={bigForm.override} onChange={(e) => setBigForm({ ...bigForm, override: e.target.checked })} /> {S.overrideAlasan}
              </label>
              <input className="input mt-2" placeholder={S.phOverride} value={bigForm.overrideReason} onChange={(e) => setBigForm({ ...bigForm, overrideReason: e.target.value })} />
            </div>
          )}
        </div>
      </Modal>

      {/* Modal PO Kecil */}
      <Modal open={showSmall} onClose={() => setShowSmall(false)} title={S.mSmallT} subtitle={S.mSmallS}
        footer={<><button className="btn-secondary" onClick={() => setShowSmall(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={() => void busy.run("saveSmall", saveSmall)} disabled={busy.isBusy("saveSmall")}>{S.btnSimpanSmall}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.workshop}><input className="input" value={smallForm.workshop} onChange={(e) => setSmallForm({ ...smallForm, workshop: e.target.value })} placeholder={S.phWorkshop} /></Field>
            <Field label={S.peminta}><input className="input" value={smallForm.requester} onChange={(e) => setSmallForm({ ...smallForm, requester: e.target.value })} placeholder={S.phPeminta} /></Field>
          </FormGrid>
          <Field label={S.itemBebas}><input className="input" value={smallForm.item} onChange={(e) => setSmallForm({ ...smallForm, item: e.target.value })} placeholder={S.phItemBebas} /></Field>
          <FormGrid>
            <Field label="Spesifikasi"><input className="input" value={smallForm.spec} onChange={(e) => setSmallForm({ ...smallForm, spec: e.target.value })} placeholder="cth: MS P/K 10x10" /></Field>
            <Field label="Kebutuhan / untuk apa"><input className="input" value={smallForm.need} onChange={(e) => setSmallForm({ ...smallForm, need: e.target.value })} placeholder="cth: BPK deck 3" /></Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.qty}><NumInput min={1} className="input" value={smallForm.qty} onChange={(e) => setSmallForm({ ...smallForm, qty: e.target.value })} /></Field>
            <Field label={S.satuan}>
              <select className="input" value={smallForm.unit} onChange={(e) => setSmallForm({ ...smallForm, unit: e.target.value })}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll", "set", "pak"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.estHarga}><NumInput min={0} className="input" value={smallForm.price} onChange={(e) => setSmallForm({ ...smallForm, price: e.target.value })} /></Field>
            <Field label={S.nota}><input className="input" value={smallForm.nota} onChange={(e) => setSmallForm({ ...smallForm, nota: e.target.value })} placeholder={S.phNota} /></Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.etaWajib}><input type="date" className="input" value={smallForm.eta} onChange={(e) => setSmallForm({ ...smallForm, eta: e.target.value })} /></Field>
            <Field label={S.proyekBudget}>
              <select className="input" value={smallForm.project} onChange={(e) => setSmallForm({ ...smallForm, project: e.target.value })}>
                <option value="">{S.optStokWorkshop}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.fUtk} hint={S.hintWajibProyek}><input className="input" value={smallForm.vessel} onChange={(e) => setSmallForm({ ...smallForm, vessel: e.target.value })} placeholder={S.phUtkStok} /></Field>
          <p className="text-sm font-semibold text-navy-900">{S.totalBatas.replace("{a}", fmtRupiah(smallAmount)).replace("{b}", fmtRupiah(PO_KECIL_LIMIT))}</p>
          {smallOver && smallBudget && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {S.overSmall.replace("{n}", fmtRupiah(smallBudget.sisa))}
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={smallForm.override} onChange={(e) => setSmallForm({ ...smallForm, override: e.target.checked })} /> {S.overrideAlasan}
              </label>
              <input className="input mt-2" placeholder={S.phOverride} value={smallForm.overrideReason} onChange={(e) => setSmallForm({ ...smallForm, overrideReason: e.target.value })} />
            </div>
          )}
        </div>
      </Modal>

      {/* Modal buat RFQ */}
      <Modal open={rfqPr !== null} onClose={() => setRfqPr(null)} title={S.mRfqT.replace("{n}", rfqPr?.id ?? "")} subtitle={S.mRfqS.replace("{a}", rfqPr?.item ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setRfqPr(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={() => void busy.run("saveRfq", saveRfq)} disabled={busy.isBusy("saveRfq")}>{S.btnBuatRfqDraf}</button></>}>
        <div className="space-y-2">
          <div className="flex justify-end">{venCatPick("vcat-rfq")}</div>
          {vendByCat.map((v) => (
            <label key={v.id} className="flex items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={rfqVendors.includes(v.name)} onChange={(e) => setRfqVendors((s) => (e.target.checked ? [...s, v.name] : s.filter((x) => x !== v.name)))} aria-label={S.ariaRfqKe.replace("{n}", String(v.name))} />
              <span className="truncate font-medium text-navy-900" title={v.name}>{v.name}</span>
              <span className="ml-auto text-xs text-steel-400">{v.cat}</span>
            </label>
          ))}
          {vendByCat.length === 0 && <p className="text-xs text-steel-400">{locale === "en" ? "No vendors in this category." : "Tidak ada vendor pada kategori ini."}</p>}
        </div>
      </Modal>

      {/* Modal input penawaran */}
      <Modal open={quoteRfq !== null} onClose={() => setQuoteRfq(null)} title={S.mQuoteT.replace("{n}", quoteRfq?.id ?? "")} subtitle={S.mQuoteS}
        footer={<><button className="btn-secondary" onClick={() => setQuoteRfq(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={() => void busy.run("saveQuote", saveQuote)} disabled={busy.isBusy("saveQuote")}>{S.btnSimpanQuote}</button></>}>
        <div className="space-y-3">
          <Field label={S.vendor}>
            <select className="input" value={quoteForm.vendor} onChange={(e) => setQuoteForm({ ...quoteForm, vendor: e.target.value })}>
              <option value="">{S.optPilihVendor}</option>
              {((quoteRfq?.vendors as string[]) ?? []).map((v) => <option key={v} value={v}>{v}{venCatOf(v) ? ` · ${venCatOf(v)}` : ""}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.hargaRp}><NumInput min={0} className="input" value={quoteForm.price} onChange={(e) => setQuoteForm({ ...quoteForm, price: e.target.value })} /></Field>
            <Field label={S.eta}><input type="date" className="input" value={quoteForm.eta} onChange={(e) => setQuoteForm({ ...quoteForm, eta: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Konfirmasi setujui / tolak PO (PO Kecil: setujui tunggal) */}
      <ConfirmModal
        open={confirmApprove !== null}
        title={S.cmApprT.replace("{n}", confirmApprove?.id ?? "")}
        desc={S.cmApprD}
        confirmLabel={S.cmApprC}
        onCancel={() => setConfirmApprove(null)}
        onConfirm={() => { if (confirmApprove) doPoStatus(confirmApprove, "Disetujui"); setConfirmApprove(null); }}
      />
      <ConfirmModal
        open={confirmRejectPo !== null}
        title={S.cmRejT.replace("{n}", confirmRejectPo?.id ?? "")}
        desc={S.cmRejD}
        confirmLabel={S.cmRejC}
        onCancel={() => setConfirmRejectPo(null)}
        onConfirm={() => { if (confirmRejectPo) doPoStatus(confirmRejectPo, "Ditolak"); setConfirmRejectPo(null); }}
      />

      {/* Modal terima barang */}
      <Modal open={recvPo !== null} onClose={() => setRecvPo(null)} title={S.mRecvT.replace("{n}", recvPo?.id ?? "")} subtitle={S.mRecvS}
        footer={<>
          <button className="btn-secondary" onClick={() => setRecvPo(null)}>{S.btnBatal}</button>
          <button className="btn-secondary" onClick={() => void busy.run("confirmRecv-sebagian", () => confirmRecv("sebagian"))} disabled={busy.isBusy("confirmRecv-sebagian")}>{S.btnTerimaSebagian}</button>
          <button className="btn-primary" onClick={() => void busy.run("confirmRecv-penuh", () => confirmRecv("penuh"))} disabled={busy.isBusy("confirmRecv-penuh")}>{S.btnTerimaPenuh}</button>
        </>}>
        <div className="space-y-3">
          <Field label={S.itemTujuan} hint={recvPo?.poType === "Kecil" ? S.hintKecilOps : undefined}>
            <select className="input" value={recvItem} onChange={(e) => setRecvItem(e.target.value)}>
              <option value="">{S.optPilihItem}</option>
              {invList.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <Field label={S.qtyDiterimaF}><NumInput min={0} className="input" value={recvQty} onChange={(e) => setRecvQty(e.target.value)} /></Field>
          <FormGrid>
            <Field label={S.noFaktur} hint={recvPo?.poType === "Kecil" ? S.hintOpsKecil : S.hintWajibBesar}>
              <input className="input font-mono" value={recvNoFaktur} onChange={(e) => setRecvNoFaktur(e.target.value)} placeholder={S.phFaktur} />
            </Field>
            <Field label={S.tglFaktur} hint={recvPo?.poType === "Kecil" ? S.hintOpsKecil : S.hintWajibBesar}>
              <input type="date" className="input" value={recvTglFaktur} onChange={(e) => setRecvTglFaktur(e.target.value)} />
            </Field>
          </FormGrid>
          {recvPo && recvLate > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {S.lateInfo.replace("{n}", String(recvLate)).replace("{a}", fmtTanggal(recvPo.eta)).replace("{b}", fmtRupiah(recvDendaPreview))}
              <div className="mt-2">
                <Field label={S.dendaHari} hint={S.hintDendaMax}>
                  <NumInput min={0} max={5} step={0.1} className="input" value={recvDendaPct} onChange={(e) => setRecvDendaPct(e.target.value)} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal retur */}
      <Modal open={retPo !== null} onClose={() => setRetPo(null)} title={S.mRetT.replace("{n}", retPo?.id ?? "")} subtitle={retPo ? S.mRetS.replace("{n}", fmtJumlah(maxRet(retPo))) : ""}
        footer={<><button className="btn-secondary" onClick={() => setRetPo(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={() => void busy.run("confirmRetur", confirmRetur)} disabled={busy.isBusy("confirmRetur")}>{S.btnSimpanRetur}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.qtyRetur}><NumInput min={0} className="input" value={retQty} onChange={(e) => setRetQty(e.target.value)} /></Field>
            <Field label={S.alasan}><input className="input" value={retNote} onChange={(e) => setRetNote(e.target.value)} placeholder={S.phAlasan} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal amandemen */}
      <Modal open={amendPo !== null && !confirmAmend} onClose={() => setAmendPo(null)} title={S.mAmdT.replace("{n}", amendPo?.id ?? "")} subtitle={S.mAmdS}
        footer={<><button className="btn-secondary" onClick={() => setAmendPo(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={() => setConfirmAmend(true)}>{S.btnLanjutKonfirm}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.barisTambahan}><input className="input" value={amendForm.name} onChange={(e) => setAmendForm({ ...amendForm, name: e.target.value })} /></Field>
            <Field label={S.satuan}>
              <select className="input" value={amendForm.unit} onChange={(e) => setAmendForm({ ...amendForm, unit: e.target.value })}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.qty}><NumInput min={1} className="input" value={amendForm.qty} onChange={(e) => setAmendForm({ ...amendForm, qty: e.target.value })} /></Field>
            <Field label={S.hargaSatuan}><NumInput min={0} className="input" value={amendForm.price} onChange={(e) => setAmendForm({ ...amendForm, price: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.catatanAmd}><input className="input" value={amendForm.note} onChange={(e) => setAmendForm({ ...amendForm, note: e.target.value })} placeholder={S.phCatatanAmd} /></Field>
        </div>
      </Modal>
      <ConfirmModal
        open={confirmAmend}
        title={S.cmAmdT.replace("{n}", amendPo?.id ?? "")}
        desc={S.cmAmdD}
        confirmLabel={S.cmAmdC}
        onCancel={() => setConfirmAmend(false)}
        onConfirm={confirmAmendNow}
      />

      {/* Modal evaluasi vendor */}
      <Modal open={evalPo !== null} onClose={() => setEvalPo(null)} title={S.mEvalT.replace("{n}", evalPo?.id ?? "")} subtitle={S.mEvalS.replace("{n}", evalPo?.vendor ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setEvalPo(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveEval}>{S.btnSimpanSkor}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            {(["Kualitas", "Delivery", "Harga"] as const).map((lbl) => {
              const val = lbl === "Kualitas" ? evalQ : lbl === "Delivery" ? evalD : evalP;
              const set = lbl === "Kualitas" ? setEvalQ : lbl === "Delivery" ? setEvalD : setEvalP;
              return (
                <Field key={lbl} label={`${lbl === "Kualitas" ? S.skKualitas : lbl === "Delivery" ? S.skDelivery : S.skHarga} (1-5)`}>
                  <select className="input" value={val} onChange={(e) => set(e.target.value)} aria-label={S.ariaNilaiLbl.replace("{n}", lbl === "Kualitas" ? S.skKualitas : lbl === "Delivery" ? S.skDelivery : S.skHarga)}>
                    <option value="">{S.optPilih}</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              );
            })}
          </FormGrid>
          <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
            {evalPreview === null ? S.evalIsiDulu : S.evalUsulan.replace("{n}", String(evalPreview))}
          </p>
        </div>
      </Modal>
      <ConfirmModal
        open={unblockVendor !== null}
        title={S.cmUnblockT.replace("{n}", unblockVendor?.name ?? "")}
        desc={S.cmUnblockD}
        confirmLabel={S.cmUnblockC}
        onCancel={() => setUnblockVendor(null)}
        onConfirm={async () => {
          try {
          if (unblockVendor) {
            await update("vendors", unblockVendor.id, { status: "Aktif" });
            log("buka blacklist (eskalasi)", unblockVendor.name, "Procurement");
            toast(S.tUnblocked.replace("{n}", unblockVendor.name));
          }
          setUnblockVendor(null);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
        }}
      />
      {/* Hapus PO (Draft saja, tanpa referensi anak yang dikenal). */}
      <ConfirmModal
        open={delPo !== null}
        title={delPo ? (locale === "en" ? `Delete PO ${delPo.id}?` : `Hapus PO ${delPo.id}?`) : ""}
        desc={delPo
          ? (locale === "en"
            ? `PO ${delPo.id} (${delPo.vendor ?? "-"}) in Draft will be permanently deleted.`
            : `PO ${delPo.id} (${delPo.vendor ?? "-"}) status Draft akan dihapus permanen.`)
          : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelPo(null)}
        onConfirm={async () => {
          if (!delPo) return;
          if (normPo(String(delPo.status)) !== "Draft") { toast(locale === "en" ? "Only Draft PO can be deleted" : "Hanya PO Draft yang bisa dihapus", "info"); return; }
          try {
            await remove("purchaseOrders", String(delPo.id));
            log("menghapus PO", String(delPo.id), "Procurement");
            toast(locale === "en" ? `PO ${delPo.id} deleted` : `PO ${delPo.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelPo(null);
        }}
      />
      {/* Hapus PR (Draft/Draf saja). */}
      <ConfirmModal
        open={delPr !== null}
        title={delPr ? (locale === "en" ? `Delete PR ${delPr.id}?` : `Hapus PR ${delPr.id}?`) : ""}
        desc={delPr
          ? (locale === "en"
            ? `PR ${delPr.id} (${delPr.item ?? "-"}) in Draft will be permanently deleted.`
            : `PR ${delPr.id} (${delPr.item ?? "-"}) status Draft akan dihapus permanen.`)
          : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelPr(null)}
        onConfirm={async () => {
          if (!delPr) return;
          if (String(delPr.status) !== "Draft" && String(delPr.status) !== "Draf") { toast(locale === "en" ? "Only Draft PR can be deleted" : "Hanya PR Draft yang bisa dihapus", "info"); return; }
          try {
            await remove("requisitions", String(delPr.id));
            log("menghapus PR", String(delPr.id), "Procurement");
            toast(locale === "en" ? `PR ${delPr.id} deleted` : `PR ${delPr.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelPr(null);
        }}
      />
      {/* Hapus vendor (blokir bila dipakai PO/hutang). */}
      <ConfirmModal
        open={delVendor !== null}
        title={delVendor ? (locale === "en" ? `Delete vendor ${delVendor.name}?` : `Hapus vendor ${delVendor.name}?`) : ""}
        desc={(() => {
          if (!delVendor) return "";
          const used = findUsages(data, "vendors", String(delVendor.id));
          const base = locale === "en"
            ? `Vendor ${delVendor.name} will be permanently deleted.`
            : `Vendor ${delVendor.name} akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Used in: ${used.join(", ")}. Deletion blocked.` : `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delVendor && findUsages(data, "vendors", String(delVendor.id)).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : (locale === "en" ? "Delete" : "Hapus")}
        danger
        confirmDisabled={delVendor ? findUsages(data, "vendors", String(delVendor.id)).length > 0 : false}
        onCancel={() => setDelVendor(null)}
        onConfirm={async () => {
          if (!delVendor) return;
          const usedBy = findUsages(data, "vendors", String(delVendor.id));
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked - used in: ${usedBy.join(", ")}` : `Hapus diblokir - dipakai di: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("vendors", String(delVendor.id));
            log("menghapus vendor", String(delVendor.name), "Procurement");
            toast(locale === "en" ? `Vendor ${delVendor.id} deleted` : `Vendor ${delVendor.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelVendor(null);
        }}
      />

      {/* Modal kontrak payung */}
      <Modal open={payungVendor !== null} onClose={() => setPayungVendor(null)} title={S.mPayT.replace("{n}", payungVendor?.name ?? "")} subtitle={S.mPayS}
        footer={<><button className="btn-secondary" onClick={() => setPayungVendor(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={savePayung}>{S.btnSimpan}</button></>}>
        <div className="space-y-3">
          <Field label={S.periode} hint={S.hintPeriode}>
            <input className="input" value={payungPeriode} onChange={(e) => setPayungPeriode(e.target.value)} placeholder={S.phPeriode} />
          </Field>
          <Field label={S.plafon} hint={S.hintPlafonKosong}>
            <NumInput min={0} className="input" value={payungPlafon} onChange={(e) => setPayungPlafon(e.target.value)} placeholder={S.phPlafon} />
          </Field>
          {payungVendor && (
            <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
              {S.payTerpakai.replace("{n}", fmtRupiah(plafonPakai(payungVendor.name)))}
            </p>
          )}
        </div>
      </Modal>

      {/* Modal PR */}
      <Modal open={showPr} onClose={() => setShowPr(false)} title={S.mPrT}
        footer={<><button className="btn-secondary" onClick={() => setShowPr(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={async () => {
          try {
          if (!prForm.item.trim()) { toast(S.tItemWajib, "info"); return; }
          if (!Number(prForm.amount) || Number(prForm.amount) <= 0) { toast(S.tEstPos, "info"); return; }
          const prQty = Number(prForm.qty || 0);
          if (!prQty || prQty <= 0) { toast(S.tQtyPos, "info"); return; }
          if (!prForm.unit.trim()) { toast(S.tSatuan, "info"); return; }
          const created = await add("requisitions", { item: prForm.item.trim(), by: prForm.by.trim() || "Anda", amount: Number(prForm.amount), qty: prQty, unit: prForm.unit.trim(), project: prForm.project || "-", vessel: prForm.project ? String(data.projects.find((p) => p.id === prForm.project)?.vessel || "") : "", status: "Menunggu Approval" },
            { action: "mengajukan PR", module: "Procurement" });
          toast(S.tPrDiajukan.replace("{n}", created.id)); setShowPr(false); setPrForm({ item: "", by: "", amount: "", qty: "1", unit: "pcs", project: "" });
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
        }}>{S.btnAjukan}</button></>}>
        <div className="space-y-3">
          <Field label={S.itemButuh}><input className="input" value={prForm.item} onChange={(e) => setPrForm({ ...prForm, item: e.target.value })} /></Field>
          <FormGrid>
            <Field label={S.pemohon}><input className="input" value={prForm.by} onChange={(e) => setPrForm({ ...prForm, by: e.target.value })} placeholder={S.phPeminta} /></Field>
            <Field label={S.estNilai}><NumInput min={0} className="input" value={prForm.amount} onChange={(e) => setPrForm({ ...prForm, amount: e.target.value })} /></Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.qty}><NumInput min={1} className="input" value={prForm.qty} onChange={(e) => setPrForm({ ...prForm, qty: e.target.value })} /></Field>
            <Field label={S.satuan}>
              <select className="input" value={prForm.unit} onChange={(e) => setPrForm({ ...prForm, unit: e.target.value })}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll", "set", "pak"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.proyek}>
            <select className="input" value={prForm.project} onChange={(e) => setPrForm({ ...prForm, project: e.target.value })}>
              <option value="">{S.optTanpaProyek}</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal vendor */}
      <Modal open={showVendor} onClose={() => setShowVendor(false)} title={S.btnTambahVendor}
        footer={<><button className="btn-secondary" onClick={() => setShowVendor(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={async () => {
          try {
          if (!vForm.name.trim()) { toast(S.tVendName, "info"); return; }
          const created = await add("vendors", { name: vForm.name.trim(), cat: vForm.cat, onTime: 100, quality: 100, po: 0, status: "Kualifikasi", scores: [] },
            { action: "mendaftarkan vendor", module: "Procurement" });
          toast(S.tVendAdded.replace("{n}", created.id)); setShowVendor(false); setVForm({ name: "", cat: "Baja & Struktur" });
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
        }}>{S.btnSimpan}</button></>}>
        <div className="space-y-3">
          <Field label={S.namaVendor}><input className="input" value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} /></Field>
          <Field label={S.kategori}>
            <select className="input" value={vForm.cat} onChange={(e) => setVForm({ ...vForm, cat: e.target.value })}>
              {["Baja & Struktur", "Mesin & Engine", "Cat & Coating", "Rigging & Wire", "Listrik", "Jasa"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Dialog pemenang RFQ - pilihan vendor + konfirmasi */}
      <Modal open={winRfq !== null} onClose={() => { setWinRfq(null); setWinVendor(""); }} title={S.mWinT.replace("{n}", winRfq?.id ?? "")} subtitle={S.mWinS}
        footer={<><button className="btn-secondary" onClick={() => { setWinRfq(null); setWinVendor(""); }}>{S.btnBatal}</button><button className="btn-primary" onClick={confirmWin}>{S.btnWinBuat}</button></>}>
        <Field label={S.vendorMenang}>
          <select className="input" value={winVendor} onChange={(e) => setWinVendor(e.target.value)}>
            <option value="">{S.optPilihMenang}</option>
            {((winRfq?.quotes as Quote[] | undefined) ?? []).map((x) => (
              <option key={x.vendor} value={x.vendor}>{x.vendor} · {fmtRupiah(Number(x.price))} · ETA {fmtTanggal(x.eta)}</option>
            ))}
          </select>
        </Field>
      </Modal>
    </div>
  );
}
