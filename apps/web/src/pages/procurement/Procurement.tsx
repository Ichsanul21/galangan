import { useState } from "react";
import { Plus, Factory, ShoppingCart, ClipboardList, Check, X, Undo2, Printer, Pencil, Send, Star, Wallet, Umbrella } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, ConfirmModal, toast, EmptyState, SortTh, toggleSort, sortRows } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtRupiah, fmtJumlah, fmtTanggal, todayISO } from "../../utils/format";
import { getSetting } from "../../utils/settings";
import { sbPoNumber, sbSplitIncludePpn, maxSeq, SB_KOP } from "../../utils/sb";
import { spendByCategory, procurementTrend, poCountTrend, poValueTrend, prPendingTrend, vendorTrend } from "../../data";
import { exportExcel } from "../../utils/export";

interface POLine { name: string; qty: number; unit: string; price: number }
interface Quote { vendor: string; price: number; eta: string }
interface Approval { level: string; by: string; date: string }
interface VendorScore { po: string; q: number; d: number; p: number; score: number; date: string }

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

const PR_PENDING = ["Draft", "Menunggu Approval", "RFQ", "Diajukan"];

const lineTotal = (lines: POLine[]): number =>
  lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0);

const poLines = (po: StoreItem): POLine[] => (Array.isArray(po.lines) ? (po.lines as POLine[]) : []);

const isLate = (po: StoreItem): boolean =>
  Boolean(po.eta) && String(po.eta) < todayISO() && normPo(po.status) !== "Diterima";

/* ---- Approval bertingkat nominal PO Besar (docs/11§4.4: >Rp1M + Finance) ---- */
function needLevels(amount: number): string[] {
  const lv: string[] = [];
  if (amount > 500000000) lv.push("SPV", "Manager", "Director");
  else if (amount > 50000000) lv.push("SPV", "Manager");
  else lv.push("SPV");
  if (amount > 1000000 && !lv.includes("Finance")) lv.push("Finance"); // ambang APPROVE_PO
  return lv;
}

function levelOf(amount: number): string {
  if (amount > 500000000) return "Director + Finance";
  if (amount > 50000000) return "Manager + Finance";
  if (amount > 1000000) return "SPV + Finance";
  return "SPV";
}

function apprOf(po: StoreItem): Approval[] {
  return Array.isArray(po.approvals) ? (po.approvals as Approval[]) : [];
}

function nextLevel(po: StoreItem): string | null {
  const need = needLevels(Number(po.amount || 0));
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

export default function Procurement() {
  const { data, add, update, log, inBranch } = useStore();
  const purchaseOrders = inBranch(data.purchaseOrders);
  const requisitions = data.requisitions;
  const vendors = data.vendors;
  const rfqs = data.rfqs;
  const invList = inBranch(data.inventory);

  const PO_KECIL_LIMIT = getSetting(data, "PO_KECIL_LIMIT", 50000000);
  const ppnRate = getSetting(data, "PPN_RATE", 12);

  /* No. PO SB max+1: scan docNo tahun berjalan, parse leading (\d+)/. */
  const nextPoSeq = (): number => {
    const year = todayISO().slice(0, 4);
    const nums = purchaseOrders
      .map((p) => String((p as StoreItem).docNo ?? ""))
      .filter((s) => s.endsWith(`/${year}`));
    return maxSeq(nums, /^(\d+)\//) + 1;
  };

  const [tab, setTab] = useState("PO Besar (Kantor)");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });
  const [sort4, setSort4] = useState<SortState>({ key: null, dir: "asc" });

  /* ---- PO Besar ---- */
  const [showBig, setShowBig] = useState(false);
  const [bigForm, setBigForm] = useState({ tujuan: "kapal" as "kapal" | "stok", prId: "", itemId: "", vendor: "", project: "", vessel: "", eta: "", includePpn: true, override: false, overrideReason: "" });
  const [bigLines, setBigLines] = useState<POLine[]>([{ name: "", qty: 1, unit: "pcs", price: 0 }]);

  /* ---- PO Kecil ---- */
  const [showSmall, setShowSmall] = useState(false);
  const [smallForm, setSmallForm] = useState({ workshop: "", requester: "", item: "", qty: "1", unit: "pcs", price: "", eta: "", project: "", vessel: "", nota: "", override: false, overrideReason: "" });
  const [kasAwal, setKasAwal] = useState("");

  /* ---- RFQ ---- */
  const [rfqPr, setRfqPr] = useState<StoreItem | null>(null);
  const [rfqVendors, setRfqVendors] = useState<string[]>([]);
  const [quoteRfq, setQuoteRfq] = useState<StoreItem | null>(null);
  const [quoteForm, setQuoteForm] = useState({ vendor: "", price: "", eta: "" });
  const [winRfq, setWinRfq] = useState<StoreItem | null>(null);
  const [winVendor, setWinVendor] = useState("");

  /* ---- PR ---- */
  const [showPr, setShowPr] = useState(false);
  const [prForm, setPrForm] = useState({ item: "", by: "", amount: "" });
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

  /* ---- Kontrak payung ---- */
  const [payungVendor, setPayungVendor] = useState<StoreItem | null>(null);
  const [payungPeriode, setPayungPeriode] = useState("");
  const [payungPlafon, setPayungPlafon] = useState("");

  const bigList = purchaseOrders.filter((p) => p.poType !== "Kecil");
  const smallList = purchaseOrders.filter((p) => p.poType === "Kecil");
  const approvedPRs = requisitions.filter((r) => r.status === "Disetujui");

  const openPo = purchaseOrders.filter((p) => normPo(p.status) !== "Diterima").reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingPr = requisitions.filter((r) => PR_PENDING.includes(r.status)).length;

  const plafonPakai = (vendorName: string, excludeId?: string): number =>
    purchaseOrders
      .filter((o) => o.vendor === vendorName && !["Ditolak"].includes(normPo(o.status)) && o.id !== excludeId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);

  /* Validasi plafon kontrak payung: null bila vendor tanpa payung. */
  const cekPlafon = (vendorName: string, tambahan: number): { ok: boolean; pakai: number; plafon: number } | null => {
    const v = vendors.find((x) => x.name === vendorName);
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
        ["Realisasi PO Kecil vs Kasbon Workshop", bulanIni],
        ["Saldo awal sesi (manual)", Number(kasAwal) || 0],
        [],
        ["PO", "Kebutuhan", "Nilai"],
        ...smallBulan.map((p) => [p.id, String(p.item ?? ""), Number(p.amount || 0)]),
        ["Realisasi bulan ini", "", smallBulanTotal],
        ["Sisa", "", kasSisa],
      ],
      `Kas-Kecil-${bulanIni}`,
      "Kas Kecil"
    );
    toast("Realisasi kas kecil diekspor");
  };

  /* ============ PO BESAR ============ */
  const saveBig = () => {
    if (!bigForm.prId) { toast("PR wajib dipilih (dropdown PR Disetujui)", "info"); return; }
    const invItem = invList.find((i) => i.id === bigForm.itemId);
    if (!invItem) { toast("Pilih item inventori dari daftar", "info"); return; }
    if (!bigForm.vendor) { toast("Vendor wajib dipilih", "info"); return; }
    if (bigForm.tujuan === "kapal") {
      if (!bigForm.project) { toast("Untuk Kapal: proyek wajib dipilih", "info"); return; }
      if (!bigForm.vessel.trim()) { toast("Untuk Kapal: U/TK kapal wajib diisi", "info"); return; }
    }
    if (!bigForm.eta) { toast("ETA wajib diisi", "info"); return; }
    if (bigLines.length === 0) { toast("Minimal 1 baris item", "info"); return; }
    for (const l of bigLines) {
      if (!l.name.trim()) { toast("Nama baris item wajib diisi", "info"); return; }
      if (!Number(l.qty) || Number(l.qty) <= 0) { toast("Qty tiap baris harus lebih dari 0", "info"); return; }
      if (!Number(l.price) || Number(l.price) <= 0) { toast("Harga tiap baris harus lebih dari 0", "info"); return; }
    }
    if (bigOver && (!bigForm.override || !bigForm.overrideReason.trim())) {
      toast("Melebihi sisa budget proyek — centang override dan isi alasan", "info");
      return;
    }
    const plafon = cekPlafon(bigForm.vendor, bigTotal);
    if (plafon && !plafon.ok) { toast(`Plafon kontrak payung terlampaui (pakai ${fmtRupiah(plafon.pakai)} / plafon ${fmtRupiah(plafon.plafon)})`, "info"); return; }
    const pr = requisitions.find((r) => r.id === bigForm.prId);
    const docNo = sbPoNumber(nextPoSeq());
    const isStok = bigForm.tujuan === "stok";
    const created = add("purchaseOrders", {
      poType: "Besar", item: invItem.name, itemId: invItem.id, vendor: bigForm.vendor,
      req: bigForm.prId, amount: bigTotal, qty: bigLines.reduce((s, l) => s + Number(l.qty), 0),
      lines: bigLines.map((l) => ({ name: l.name.trim(), qty: Number(l.qty), unit: l.unit, price: Number(l.price) })),
      project: isStok ? "-" : (bigForm.project || "-"), vessel: isStok ? "" : bigForm.vessel.trim(), eta: bigForm.eta || "",
      docNo, includePpn: bigForm.includePpn, tujuan: bigForm.tujuan,
      receivedQty: 0, returnedQty: 0, status: "Draft", date: todayISO(), revisi: "",
      amendments: [], approvals: [], overrideReason: bigOver ? bigForm.overrideReason.trim() : "",
    }, { action: "membuat PO Besar", module: "Procurement" });
    if (pr && pr.status === "Disetujui") update("requisitions", pr.id, { status: "Sudah PO" });
    toast(`PO Besar ${created.id} (${docNo}) dibuat (Draft)`);
    setShowBig(false);
    setBigForm({ tujuan: "kapal", prId: "", itemId: "", vendor: "", project: "", vessel: "", eta: "", includePpn: true, override: false, overrideReason: "" });
    setBigLines([{ name: "", qty: 1, unit: "pcs", price: 0 }]);
  };

  /* ============ PO KECIL ============ */
  const saveSmall = () => {
    if (!smallForm.workshop.trim()) { toast("Workshop wajib diisi", "info"); return; }
    if (!smallForm.requester.trim()) { toast("Peminta wajib diisi", "info"); return; }
    if (!smallForm.item.trim()) { toast("Item kebutuhan wajib diisi", "info"); return; }
    const qty = Number(smallForm.qty);
    const price = Number(smallForm.price);
    if (!qty || qty <= 0) { toast("Qty harus lebih dari 0", "info"); return; }
    if (!price || price <= 0) { toast("Estimasi harga harus lebih dari 0", "info"); return; }
    if (!smallForm.unit.trim()) { toast("Satuan wajib dipilih", "info"); return; }
    if (!smallForm.eta) { toast("ETA wajib diisi", "info"); return; }
    if (smallForm.project && !smallForm.vessel.trim()) { toast("Jika proyek diisi, U/TK kapal wajib diisi", "info"); return; }
    const amount = qty * price;
    if (amount > PO_KECIL_LIMIT) { toast("melebihi batas PO Kecil, gunakan PO Besar", "info"); return; }
    if (smallOver && (!smallForm.override || !smallForm.overrideReason.trim())) {
      toast("Melebihi sisa budget proyek — centang override dan isi alasan", "info");
      return;
    }
    add("purchaseOrders", {
      poType: "Kecil", item: smallForm.item.trim(), workshop: smallForm.workshop.trim(),
      requester: smallForm.requester.trim(), vendor: "Workshop Internal",
      req: "-", amount, qty, unit: smallForm.unit.trim(), receivedQty: 0, returnedQty: 0, status: "Diajukan",
      date: todayISO(), eta: smallForm.eta || "", project: smallForm.project || "-",
      vessel: smallForm.vessel.trim(), nota: smallForm.nota.trim(),
      docNo: sbPoNumber(nextPoSeq()),
      lines: [{ name: smallForm.item.trim(), qty, unit: smallForm.unit.trim(), price }],
      revisi: "", amendments: [], overrideReason: smallOver ? smallForm.overrideReason.trim() : "",
    }, { action: "membuat PO Kecil", module: "Procurement" });
    toast("PO Kecil dibuat (Diajukan)");
    setShowSmall(false);
    setSmallForm({ workshop: "", requester: "", item: "", qty: "1", unit: "pcs", price: "", eta: "", project: "", vessel: "", nota: "", override: false, overrideReason: "" });
  };

  const doPoStatus = (po: StoreItem, next: string) => {
    if (po.poType === "Kecil") {
      const allowed = SMALL_NEXT[normPo(po.status)] ?? [];
      if (!allowed.includes(next)) { toast(`Transisi ${po.status} → ${next} tidak diizinkan untuk PO Kecil`, "info"); return; }
    }
    update("purchaseOrders", po.id, { status: next });
    toast(`${po.id} → ${next}`);
  };

  /* Persetujuan berjenjang SPV → Manager → Director sesuai nominal. */
  const doApproveLevel = (po: StoreItem) => {
    const nx = nextLevel(po);
    if (!nx) { toast(`${po.id} sudah disetujui penuh`, "info"); return; }
    const done: Approval[] = [...apprOf(po), { level: nx, by: "Anda", date: todayISO() }];
    const doneLevels = done.map((a) => a.level);
    const still = needLevels(Number(po.amount || 0)).find((l) => !doneLevels.includes(l)) ?? null;
    update("purchaseOrders", po.id, { approvals: done, status: still ? po.status : "Disetujui" });
    log("persetujuan PO", `${po.id} level ${nx}${still ? `, lanjut ke ${still}` : " (penuh)"}`, "Procurement");
    toast(still ? `${po.id} disetujui ${nx}, lanjut ke ${still}` : `${po.id} disetujui penuh`);
  };

  /* ============ RFQ ============ */
  const saveRfq = () => {
    if (!rfqPr) return;
    if (rfqVendors.length < 3) { toast("Pilih minimal 3 vendor untuk RFQ (docs/11)", "info"); return; }
    add("rfqs", {
      prId: rfqPr.id, item: rfqPr.item, vendors: rfqVendors, quotes: [],
      status: "Draf", winner: "",
    }, { action: "membuat RFQ", target: rfqPr.id, module: "Procurement" });
    update("requisitions", rfqPr.id, { status: "RFQ" });
    toast(`RFQ untuk ${rfqPr.id} dibuat (Draf)`);
    setRfqPr(null);
    setRfqVendors([]);
  };

  const saveQuote = () => {
    if (!quoteRfq) return;
    if (!quoteForm.vendor) { toast("Pilih vendor dulu", "info"); return; }
    const price = Number(quoteForm.price);
    if (!price || price <= 0) { toast("Harga penawaran harus lebih dari 0", "info"); return; }
    if (!quoteForm.eta) { toast("ETA wajib diisi", "info"); return; }
    const cur = (Array.isArray(quoteRfq.quotes) ? quoteRfq.quotes : []) as Quote[];
    const next = [...cur.filter((x) => x.vendor !== quoteForm.vendor), { vendor: quoteForm.vendor, price, eta: quoteForm.eta }];
    const nextStatus = quoteRfq.status === "Terkirim" ? "Evaluasi" : quoteRfq.status;
    update("rfqs", quoteRfq.id, { quotes: next, status: nextStatus });
    toast(`Penawaran ${quoteForm.vendor} tersimpan`);
    setQuoteRfq(null);
    setQuoteForm({ vendor: "", price: "", eta: "" });
  };

  const confirmWin = () => {
    if (!winRfq) return;
    if (!winVendor) { toast("Pilih pemenang dulu", "info"); return; }
    const quotes = (Array.isArray(winRfq.quotes) ? winRfq.quotes : []) as Quote[];
    const win = quotes.find((x) => x.vendor === winVendor);
    if (!win) { toast("Pemenang belum memberi penawaran", "info"); return; }
    const plafon = cekPlafon(winVendor, win.price);
    if (plafon && !plafon.ok) { toast(`Plafon kontrak payung terlampaui (pakai ${fmtRupiah(plafon.pakai)} / plafon ${fmtRupiah(plafon.plafon)})`, "info"); return; }
    update("rfqs", winRfq.id, { winner: winVendor, status: "Diputuskan" });
    const match = invList.find((i) => i.name.toLowerCase().includes(String(winRfq.item).toLowerCase().split(" ")[0] ?? ""));
    const created = add("purchaseOrders", {
      poType: "Besar", item: winRfq.item, itemId: match?.id ?? "", vendor: winVendor,
      req: winRfq.prId, amount: win.price, qty: 1,
      lines: [{ name: winRfq.item, qty: 1, unit: "pcs", price: win.price }],
      project: "-", eta: win.eta, receivedQty: 0, returnedQty: 0,
      status: "Diajukan", date: todayISO(), revisi: "", amendments: [], approvals: [],
    }, { action: "memenangkan RFQ", target: `${winRfq.id} → ${winVendor}`, module: "Procurement" });
    const pr = requisitions.find((r) => r.id === winRfq.prId);
    if (pr) update("requisitions", pr.id, { status: "Sudah PO" });
    toast(`${winRfq.id} dimenangkan ${winVendor} → ${created.id}`);
    setWinRfq(null);
    setWinVendor("");
  };

  /* ============ KONSOLIDASI ============ */
  const saveKonsolidasi = () => {
    if (konsIds.length < 2) { toast("Pilih minimal 2 PR Disetujui untuk konsolidasi", "info"); return; }
    if (!konsVendor) { toast("Vendor wajib dipilih", "info"); return; }
    const prs = requisitions.filter((r) => konsIds.includes(r.id));
    if (prs.some((r) => r.status !== "Disetujui")) { toast("Semua PR harus berstatus Disetujui", "info"); return; }
    const lines = prs.map((r) => ({ name: r.item, qty: 1, unit: "pcs", price: Number(r.amount) || 0 }));
    const total = lineTotal(lines);
    if (konsProject) {
      const info = budgetInfo(konsProject, total);
      if (info && info.aktif + total > info.sisa) { toast("Gabungan PR melebihi sisa budget proyek", "info"); return; }
    }
    const plafon = cekPlafon(konsVendor, total);
    if (plafon && !plafon.ok) { toast(`Plafon kontrak payung terlampaui (pakai ${fmtRupiah(plafon.pakai)} / plafon ${fmtRupiah(plafon.plafon)})`, "info"); return; }
    const created = add("purchaseOrders", {
      poType: "Besar", item: `Konsolidasi ${prs.length} PR`, itemId: "",
      vendor: konsVendor, req: prs.map((r) => r.id).join(", "), amount: total, qty: prs.length,
      lines, project: konsProject || "-", eta: konsEta || "",
      receivedQty: 0, returnedQty: 0, status: "Draft", date: todayISO(), revisi: "", amendments: [], approvals: [],
    }, { action: "konsolidasi PR ke PO", target: prs.map((r) => r.id).join(", "), module: "Procurement" });
    prs.forEach((r) => update("requisitions", r.id, { status: "Sudah PO" }));
    toast(`Konsolidasi ${prs.length} PR → ${created.id}`);
    setKonsIds([]);
    setKonsVendor("");
    setKonsProject("");
    setKonsEta("");
  };

  /* ============ SKOR VENDOR (Q40 + D30 + P30, skala 100 — docs/11) ============ */
  const evalPreview = (() => {
    const q = Number(evalQ), d = Number(evalD), p = Number(evalP);
    if (![q, d, p].every((n) => n >= 1 && n <= 5)) return null;
    return Math.round(q * 8 + d * 6 + p * 6);
  })();

  const saveEval = () => {
    if (!evalPo) return;
    const q = Number(evalQ), d = Number(evalD), p = Number(evalP);
    if (![q, d, p].every((n) => n >= 1 && n <= 5)) { toast("Nilai kualitas, delivery, harga 1–5 wajib diisi", "info"); return; }
    const score = Math.round(q * 8 + d * 6 + p * 6);
    const v = vendors.find((x) => x.name === evalPo.vendor);
    if (!v) { toast("Vendor tidak ditemukan di master", "info"); return; }
    const next = [...scoresOf(v), { po: evalPo.id, q, d, p, score, date: todayISO() }];
    const avg = next.reduce((s, x) => s + Number(x.score), 0) / next.length;
    const patch: Record<string, unknown> = { scores: next };
    if (avg < 60) patch.status = "Blacklist";
    update("vendors", v.id, patch);
    update("purchaseOrders", evalPo.id, { evaluated: true });
    log("evaluasi vendor", `${v.name}: skor ${score} dari ${evalPo.id} (rata-rata ${Math.round(avg)})`, "Procurement");
    toast(avg < 60 ? `${v.name} skor ${score} — rata-rata ${Math.round(avg)}, otomatis Blacklist` : `Skor ${v.name}: ${score} tersimpan`);
    setEvalPo(null);
    setEvalQ("");
    setEvalD("");
    setEvalP("");
  };

  const savePayung = () => {
    if (!payungVendor) return;
    const plafon = Number(payungPlafon);
    if (payungPlafon.trim() !== "" && (!plafon || plafon <= 0)) { toast("Plafon harus lebih dari 0 bila diisi", "info"); return; }
    if (payungPlafon.trim() === "") {
      update("vendors", payungVendor.id, { payung: null });
      log("hapus kontrak payung", payungVendor.name, "Procurement");
      toast(`Kontrak payung ${payungVendor.name} dihapus`);
    } else {
      update("vendors", payungVendor.id, { payung: { periode: payungPeriode.trim() || "-", plafon } });
      log("kontrak payung", `${payungVendor.name}: plafon ${fmtRupiah(plafon)} (${payungPeriode.trim() || "-"})`, "Procurement");
      toast(`Kontrak payung ${payungVendor.name} tersimpan`);
    }
    setPayungVendor(null);
    setPayungPeriode("");
    setPayungPlafon("");
  };

  /* ============ AMANDEMEN ============ */
  const confirmAmendNow = () => {
    if (!amendPo) return;
    const st = normPo(amendPo.status);
    if (st !== "Disetujui" && st !== "Dikirim") { toast("Amandemen hanya untuk PO Disetujui/Dikirim", "info"); return; }
    if (!amendForm.name.trim()) { toast("Nama baris tambahan wajib diisi", "info"); return; }
    const qty = Number(amendForm.qty);
    const price = Number(amendForm.price);
    if (!qty || qty <= 0 || !price || price <= 0) { toast("Qty & harga tambahan harus lebih dari 0", "info"); return; }
    if (!amendForm.note.trim()) { toast("Catatan amandemen wajib diisi", "info"); return; }
    const cur = (amendPo.revisi as string) || "";
    const n = cur.startsWith("R") ? Number(cur.slice(1)) + 1 : 1;
    const revisi = `R${n}`;
    const newLine = { name: amendForm.name.trim(), qty, unit: amendForm.unit, price };
    const lines = [...poLines(amendPo), newLine];
    const amendments = [...(Array.isArray(amendPo.amendments) ? amendPo.amendments : []), { note: amendForm.note.trim(), date: todayISO(), revisi }];
    update("purchaseOrders", amendPo.id, { lines, amendments, revisi, amount: lineTotal(lines) });
    log("amandemen PO", `${amendPo.id} ${revisi}: ${amendForm.note.trim()}`, "Procurement");
    toast(`${amendPo.id} diamandemen (${revisi})`);
    setAmendPo(null);
    setConfirmAmend(false);
    setAmendForm({ name: "", qty: "1", unit: "pcs", price: "", note: "" });
  };

  /* ============ CETAK (kop SB + pecah DPP/PPN bila include) ============ */
  const cetakPo = (po: StoreItem) => {
    const lines = poLines(po);
    const split = po.includePpn === false ? null : sbSplitIncludePpn(Number(po.amount || 0), getSetting(data, "PPN_RATE", 12));
    const rows: (string | number | null)[][] = [
      [SB_KOP.line1, SB_KOP.name],
      [SB_KOP.hq, `${SB_KOP.addr1} · HP ${SB_KOP.hp}`],
      [],
      ["Purchase Order", po.docNo ? `${po.id} / ${po.docNo}` : po.id],
      ["Tipe", po.poType === "Kecil" ? "PO Kecil (Workshop)" : "PO Besar (Kantor)"],
      ["Vendor", po.vendor ?? "-"],
      ["Referensi PR", po.req ?? "-"],
      ["Proyek", po.project ?? "-"],
      ["U/TK Kapal", po.vessel ?? "-"],
      ["Tanggal", fmtTanggal(po.date)],
      ["ETA", po.eta ? fmtTanggal(po.eta) : "-"],
      ["Status", normPo(po.status)],
      ["Level approval", levelOf(Number(po.amount || 0))],
      ["Persetujuan", apprOf(po).length > 0 ? apprOf(po).map((a) => `${a.level} oleh ${a.by} ${a.date}`).join("; ") : "-"],
      ["No faktur pajak", po.noFaktur ?? "-"],
      ["Tanggal faktur", po.tglFaktur ? fmtTanggal(po.tglFaktur) : "-"],
      ["Denda keterlambatan (Rp)", Number(po.dendaRp || 0)],
      [],
      ["Baris", "Qty", "Satuan", "Harga", "Subtotal"],
      ...lines.map((l) => [l.name, l.qty, l.unit, l.price, Number(l.qty) * Number(l.price)]),
      ["Total", "", "", "", Number(po.amount || lineTotal(lines))],
      ...(split ? [[`DPP (Total include PPN ${ppnRate}%)`, "", "", "", split.dpp], [`PPN ${ppnRate}%`, "", "", "", split.ppn]] : []),
    ];
    void exportExcel(rows, `PO-${po.id}`, "PO");
    toast(`PO ${po.id} diekspor ke Excel`);
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

  const confirmRecv = (mode: "penuh" | "sebagian") => {
    if (!recvPo) return;
    const qty = Number(recvQty);
    if (!qty || qty <= 0) { toast("Qty terima harus lebih dari 0", "info"); return; }
    const orderedQty = Number(recvPo.qty || 0);
    if (orderedQty > 0 && Number(recvPo.receivedQty || 0) + qty > orderedQty) { toast(`Qty terima melebihi qty PO (dipesan ${orderedQty}, sudah diterima ${Number(recvPo.receivedQty || 0)})`, "info"); return; }
    const isBig = recvPo.poType !== "Kecil";
    if (isBig && (!recvNoFaktur.trim() || !recvTglFaktur)) { toast("No faktur & tanggal faktur wajib untuk PO Besar", "info"); return; }
    if (!isBig && !recvNoFaktur.trim()) { toast("No. nota/bukti wajib diisi untuk PO Kecil", "info"); return; }
    const invItem = invList.find((i) => i.id === recvItem);
    if (!isBig && !invItem) { toast("PO Kecil: pilih item inventori tujuan (wajib)", "info"); return; }
    if (recvItem && !invItem) { toast("Pilih item inventori tujuan", "info"); return; }
    if (invItem) {
      update("inventory", invItem.id, { stock: Number(invItem.stock) + qty });
      add("movements", {
        item: invItem.name, itemId: invItem.id, type: "Penerimaan", qty, by: recvPo.id, date: todayISO(), tone: "in",
      }, { action: "menerima barang", target: `${invItem.name} × ${qty} (${recvPo.id})`, module: "Procurement" });
    }
    /* Denda: hari telat × % per hari dari nilai PO, dibatasi 5%. */
    let dendaRp = Number(recvPo.dendaRp || 0);
    const late = lateDaysOf(recvPo);
    const pct = Math.min(5, Math.max(0, Number(recvDendaPct) || 0));
    if (late > 0 && pct > 0) {
      dendaRp = Math.round(Math.min(Number(recvPo.amount || 0) * 0.05, Number(recvPo.amount || 0) * (pct / 100) * late));
    }
    update("purchaseOrders", recvPo.id, {
      itemId: invItem ? invItem.id : recvPo.itemId,
      item: invItem ? invItem.name : recvPo.item,
      qty: recvPo.qty ?? qty,
      receivedQty: Number(recvPo.receivedQty || 0) + qty,
      status: mode === "penuh" ? "Diterima" : "Diterima Sebagian",
      noFaktur: recvNoFaktur.trim(),
      tglFaktur: recvTglFaktur,
      dendaRp,
    });
    /* Auto-AP dari GR (3-way match PO–GR–Invoice): hutang vendor terbentuk saat terima. */
    const apExists = (data.payables ?? []).some((a) => String(a.po ?? "") === String(recvPo.id));
    if (!apExists && Number(recvPo.amount || 0) > 0) {
      const poAmount = Number(recvPo.amount || 0);
      const apAmt = orderedQty > 0 ? Math.round((poAmount * qty) / orderedQty) : poAmount;
      const apTotal = apAmt + dendaRp;
      add("payables", {
        v: String(recvPo.vendor ?? ""), kodePembantu: String(recvPo.vendor ?? ""),
        po: recvPo.docNo ? `${recvPo.id} / ${recvPo.docNo}` : String(recvPo.id),
        openAwal: 0, amt: apTotal, due: recvPo.eta || todayISO(),
        pph: "2%", st: "Belum Dibayar", vessel: String(recvPo.vessel ?? ""),
        item: String(recvPo.item ?? ""), pay1: 0, pay2: 0,
        noFaktur: recvNoFaktur.trim(), tglFaktur: recvTglFaktur,
      }, { action: "auto-hutang dari GR", target: `${recvPo.id} (3-way match)`, module: "Procurement" });
      log("auto-hutang GR", `${recvPo.id} → hutang ${recvPo.vendor} ${fmtRupiah(apTotal)}`, "Procurement");
    }
    if (late > 0 && dendaRp > 0) log("denda keterlambatan", `${recvPo.id}: telat ${late} hari → ${fmtRupiah(dendaRp)}`, "Procurement");
    toast(`${recvPo.id} ${mode === "penuh" ? "diterima" : "diterima sebagian"}${invItem ? ` — stok ${invItem.name} +${qty}` : ""}${dendaRp > 0 ? ` · denda ${fmtRupiah(dendaRp)}` : ""}`);
    setRecvPo(null);
    setRecvItem("");
    setRecvQty("");
    setRecvNoFaktur("");
    setRecvTglFaktur("");
    setRecvDendaPct("0.1");
  };

  const maxRet = (po: StoreItem): number =>
    Math.max(0, Number(po.receivedQty ?? po.qty ?? 0) - Number(po.returnedQty ?? 0));

  const confirmRetur = () => {
    if (!retPo) return;
    const qty = Number(retQty);
    if (!qty || qty <= 0) { toast("Qty retur harus lebih dari 0", "info"); return; }
    if (qty > maxRet(retPo)) { toast(`Qty retur melebihi qty diterima (maks ${maxRet(retPo)})`, "info"); return; }
    if (!retNote.trim()) { toast("Alasan retur wajib diisi", "info"); return; }
    const invItem = invList.find((i) => i.id === retPo.itemId);
    if (!invItem) { toast("PO ini belum terlink ke item inventori", "info"); return; }
    if (Number(invItem.stock) < qty) { toast("Stok tidak cukup untuk retur", "info"); return; }
    update("inventory", invItem.id, { stock: Number(invItem.stock) - qty });
    add("movements", {
      item: invItem.name, itemId: invItem.id, type: "Retur", qty, by: `${retPo.id} — ${retNote.trim()}`, date: todayISO(), tone: "out",
    }, { action: "meretur barang", target: `${invItem.name} × ${qty} (${retPo.id})`, module: "Procurement" });
    update("purchaseOrders", retPo.id, { returnedQty: Number(retPo.returnedQty || 0) + qty });
    log("meretur barang", `${invItem.name} × ${qty} (${retPo.id}): ${retNote.trim()}`, "Procurement");
    toast(`Retur ${retPo.id} × ${qty} tersimpan`);
    setRetPo(null);
    setRetQty("");
    setRetNote("");
  };

  const approvePr = (r: StoreItem, ok: boolean) => {
    update("requisitions", r.id, { status: ok ? "Disetujui" : "Ditolak" });
    toast(`${r.id} ${ok ? "disetujui" : "ditolak"}`);
  };

  const poAksi = (po: StoreItem) => {
    const st = normPo(po.status);
    const nx = po.poType === "Kecil" ? null : nextLevel(po);
    return (
      <div className="flex flex-wrap gap-1.5">
        {st === "Draft" && <button className="btn-secondary text-xs" onClick={() => doPoStatus(po, "Diajukan")}>Ajukan</button>}
        {st === "Diajukan" && po.poType === "Kecil" && (
          <>
            <button className="btn-secondary text-xs" onClick={() => setConfirmApprove(po)}><Check className="h-3.5 w-3.5" /> Setujui</button>
            <button className="btn-secondary text-xs text-rose-600" aria-label={`Tolak ${po.id}`} onClick={() => setConfirmRejectPo(po)}><X className="h-3.5 w-3.5" /> Tolak</button>
          </>
        )}
        {st === "Diajukan" && po.poType !== "Kecil" && (
          <>
            {nx
              ? <button className="btn-primary text-xs" onClick={() => doApproveLevel(po)}><Check className="h-3.5 w-3.5" /> Setujui ({nx})</button>
              : <span className="text-xs text-steel-400">Menunggu tahap lain</span>}
            <button className="btn-secondary text-xs text-rose-600" aria-label={`Tolak ${po.id}`} onClick={() => setConfirmRejectPo(po)}><X className="h-3.5 w-3.5" /> Tolak</button>
          </>
        )}
        {st === "Disetujui" && (
          <button className="btn-secondary text-xs" onClick={() => doPoStatus(po, "Dikirim")}><Send className="h-3.5 w-3.5" /> Kirim</button>
        )}
        {(st === "Dikirim" || st === "Diterima Sebagian") && (
          <>
            <button className="btn-primary text-xs" onClick={() => openRecv(po)}>Terima</button>
            {st === "Dikirim" && <button className="btn-secondary text-xs" onClick={() => openRecv(po)}>Terima Sebagian</button>}
          </>
        )}
        {(st === "Disetujui" || st === "Dikirim") && (
          <button className="btn-secondary text-xs" aria-label={`Amandemen ${po.id}`} onClick={() => { setAmendPo(po); setAmendForm({ name: "", qty: "1", unit: "pcs", price: "", note: "" }); }}>
            <Pencil className="h-3.5 w-3.5" /> Amandemen
          </button>
        )}
        {st === "Diterima" && !po.evaluated && (
          <button className="btn-secondary text-xs" aria-label={`Nilai vendor ${po.id}`} onClick={() => { setEvalPo(po); setEvalQ(""); setEvalD(""); setEvalP(""); }}>
            <Star className="h-3.5 w-3.5" /> Nilai
          </button>
        )}
        {st === "Diterima" && (
          <button className="btn-secondary text-xs" aria-label={`Retur ${po.id}`} onClick={() => { setRetPo(po); setRetQty(""); setRetNote(""); }}>
            <Undo2 className="h-3.5 w-3.5" /> Retur
          </button>
        )}
        <button className="btn-secondary text-xs" aria-label={`Cetak ${po.id}`} onClick={() => cetakPo(po)}><Printer className="h-3.5 w-3.5" /> Cetak</button>
        {poNext(po.status).length === 0 && st !== "Diterima" && <span className="text-xs text-steel-400">—</span>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Procurement & Purchasing"
        subtitle="Permintaan, penawaran, PO, dan manajemen vendor"
        icon={<ShoppingCart className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            {tab === "PO Kecil (Workshop)"
              ? <button className="btn-primary-gradient" onClick={() => setShowSmall(true)}><Plus className="h-4 w-4" /> Buat PO Kecil</button>
              : <button className="btn-primary-gradient" onClick={() => { setShowBig(true); }}><Plus className="h-4 w-4" /> Buat PO Besar</button>}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="PO Aktif" value={String(purchaseOrders.length)} icon={<ShoppingCart className="h-5 w-5" />} chip="navy" spark={poCountTrend} hint="Sedang berjalan" />
        <KpiCard label="Nilai PO Terbuka" value={fmtRupiah(openPo)} hint="Belum diterima penuh" icon={<ShoppingCart className="h-5 w-5" />} chip="teal" spark={poValueTrend} />
        <KpiCard label="Permintaan Menunggu" value={`${pendingPr} PR`} hint="Perlu approval" icon={<ClipboardList className="h-5 w-5" />} chip="amber" spark={prPendingTrend} />
        <KpiCard label="Vendor Terdaftar" value={String(vendors.length)} icon={<Factory className="h-5 w-5" />} chip="violet" hint="Rating & evaluasi" spark={vendorTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["PO Besar (Kantor)", "PO Kecil (Workshop)", "RFQ", "PR", "Vendor"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "PO Besar (Kantor)" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="Belanja per Kategori" subtitle="Persentase total pengeluaran" />
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
                  <CardHeader title="Tren Pengadaan" subtitle="Jumlah PO & nilai pengeluaran (milyar Rupiah)" />
                  <div className="h-44 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={procurementTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs><linearGradient id="procGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} /><stop offset="95%" stopColor="#0d9488" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip formatter={(v) => (typeof v === "number" ? `Rp ${v} M` : v)} />} />
                        <Area type="monotone" dataKey="pengeluaran" name="Pengeluaran" stroke="#0d9488" strokeWidth={2.5} fill="url(#procGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">Approval bertingkat nominal: ≤50 jt SPV · ≤500 jt +Manager · &gt;500 jt +Director · &gt;Rp1 jt +Finance (docs/11§4.4). PO Besar wajib faktur pajak saat terima. Hutang vendor otomatis terbentuk saat GR (3-way match PO–GR–AP).</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label="PO" sortKey="po" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Item" sortKey="item" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Vendor" sortKey="vendor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Nilai" sortKey="nilai" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Level" sortKey="level" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="ETA" sortKey="eta" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Revisi" sortKey="revisi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(bigList, sort, (po, k) => {
                      if (k === "nilai") return Number(po.amount || 0);
                      if (k === "item") return String(po.item ?? "");
                      if (k === "vendor") return String(po.vendor ?? "");
                      if (k === "level") return String(levelOf(Number(po.amount || 0)));
                      if (k === "eta") return String(po.eta ?? "");
                      if (k === "revisi") return String(po.revisi || "R0");
                      if (k === "status") return String(normPo(String(po.status ?? "")));
                      return String(po.id ?? "");
                    }).map((po) => {
                      const st = normPo(po.status);
                      const need = needLevels(Number(po.amount || 0));
                      const done = apprOf(po);
                      const payung = vendors.some((v) => v.name === po.vendor && payungOf(v));
                      return (
                        <tr key={po.id} className="hover:bg-surface">
                          <td className="td font-mono font-medium text-navy-900">{po.id}</td>
                          <td className="td text-steel-600">
                            <p className="truncate" title={String(po.item)}>{po.item}</p>
                            {(po.qty || po.receivedQty) && (
                              <p className="text-xs text-steel-400">
                                Qty {po.qty ? fmtJumlah(Number(po.qty)) : "—"} · Diterima {fmtJumlah(Number(po.receivedQty || 0))}
                                {Number(po.returnedQty || 0) > 0 && ` · Retur ${fmtJumlah(Number(po.returnedQty))}`}
                              </p>
                            )}
                            {poLines(po).length > 0 && (
                              <p className="text-xs text-steel-400 truncate" title={poLines(po).map((l) => `${l.name} ×${l.qty}`).join("; ")}>{poLines(po).length} baris · PR {po.req}</p>
                            )}
                            {po.noFaktur && (
                              <p className="text-xs text-steel-400 truncate" title={`Faktur ${po.noFaktur}`}>Faktur {po.noFaktur}{po.tglFaktur ? ` · ${fmtTanggal(po.tglFaktur)}` : ""}</p>
                            )}
                          </td>
                          <td className="td text-steel-600">
                            <p className="truncate" title={String(po.vendor)}>{po.vendor}</p>
                            {payung && <span className="mt-0.5 inline-block"><Badge tone="navy">Payung</Badge></span>}
                          </td>
                          <td className="td font-semibold">
                            {fmtRupiah(po.amount)}
                            {Number(po.dendaRp || 0) > 0 && <p className="text-xs font-normal text-rose-600">Denda {fmtRupiah(Number(po.dendaRp))}</p>}
                          </td>
                          <td className="td">
                            <Badge tone="navy">{levelOf(Number(po.amount || 0))}</Badge>
                            <p className="mt-0.5 text-xs text-steel-400">{done.length}/{need.length} tahap{done.length > 0 ? ` · ${done.map((a) => a.level).join(" → ")}` : ""}</p>
                          </td>
                          <td className="td text-steel-600">
                            {po.eta ? fmtTanggal(po.eta) : "—"}
                            {isLate(po) && <span className="ml-1.5"><Badge tone="red">Terlambat</Badge></span>}
                          </td>
                          <td className="td text-steel-600 font-mono text-xs">{po.revisi || "R0"}</td>
                          <td className="td"><Badge tone={poStatus[po.status] ?? poStatus[st] ?? "gray"}>{st}</Badge></td>
                          <td className="td">{poAksi(po)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {bigList.length === 0 && <EmptyState title="Belum ada PO Besar" subtitle="Buat PO Besar dari PR Disetujui, RFQ, atau konsolidasi." />}
              </div>
            </div>
          )}

          {tab === "PO Kecil (Workshop)" && (
            <div className="space-y-4">
              <Card className="p-5">
                <CardHeader title="Realisasi PO Kecil vs Kasbon Workshop" subtitle="Alat bantu sesi ini — bukan ledger permanen" />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Field label={`Saldo awal sesi (${bulanIni})`}>
                    <input type="number" min={0} className="input" value={kasAwal} onChange={(e) => setKasAwal(e.target.value)} placeholder="cth: 25000000" />
                  </Field>
                  <div className="rounded-lg bg-surface p-2.5">
                    <p className="flex items-center gap-1 text-xs text-steel-500"><Wallet className="h-3.5 w-3.5" /> Realisasi bulan ini</p>
                    <p className="font-semibold text-navy-900">{fmtRupiah(smallBulanTotal)}</p>
                    <p className="text-xs text-steel-400">{smallBulan.length} PO Kecil</p>
                  </div>
                  <div className="rounded-lg bg-surface p-2.5">
                    <p className="text-xs text-steel-500">Sisa kasbon</p>
                    <p className={`font-semibold ${kasSisa < 0 ? "text-rose-600" : "text-navy-900"}`}>{fmtRupiah(kasSisa)}</p>
                    <p className="text-xs text-steel-400">Saldo awal − realisasi</p>
                  </div>
                  <div className="flex items-end">
                    <button className="btn-secondary text-xs" onClick={exportKas}><Printer className="h-3.5 w-3.5" /> Export</button>
                  </div>
                </div>
              </Card>
              <div>
                <div className="mb-3 flex justify-end">
                  <button className="btn-secondary text-xs" onClick={() => setShowSmall(true)}><Plus className="h-3.5 w-3.5" /> Buat PO Kecil</button>
                </div>
                <p className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">PO Kecil: Diajukan → Disetujui → Diterima, tanpa RFQ. Batas {fmtRupiah(PO_KECIL_LIMIT)} — selebihnya gunakan PO Besar.</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><SortTh label="PO" sortKey="po" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Kebutuhan" sortKey="kebutuhan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Workshop" sortKey="workshop" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Nilai" sortKey="nilai" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="ETA" sortKey="eta" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(smallList, sort2, (po, k) => {
                        if (k === "nilai") return Number(po.amount || 0);
                        if (k === "kebutuhan") return String(po.item ?? "");
                        if (k === "workshop") return String(po.workshop ?? "");
                        if (k === "eta") return String(po.eta ?? "");
                        if (k === "status") return String(normPo(String(po.status ?? "")));
                        return String(po.id ?? "");
                      }).map((po) => {
                        const st = normPo(po.status);
                        return (
                          <tr key={po.id} className="hover:bg-surface">
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
                              <p className="text-xs text-steel-400">Qty {fmtJumlah(Number(po.qty || 0))} · {po.requester}</p>
                            </td>
                            <td className="td text-steel-600 truncate" title={String(po.workshop ?? "-")}>{po.workshop ?? "-"}</td>
                            <td className="td font-semibold">{fmtRupiah(po.amount)}</td>
                            <td className="td text-steel-600">
                              {po.eta ? fmtTanggal(po.eta) : "—"}
                              {isLate(po) && <span className="ml-1.5"><Badge tone="red">Terlambat</Badge></span>}
                            </td>
                            <td className="td"><Badge tone={poStatus[st] ?? "gray"}>{st}</Badge></td>
                            <td className="td">{poAksi(po)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {smallList.length === 0 && <EmptyState title="Belum ada PO Kecil" subtitle="PO workshop di bawah 50 juta dicatat di sini." />}
                </div>
              </div>
            </div>
          )}

          {tab === "RFQ" && (
            <div className="space-y-4">
              {rfqs.map((r) => {
                const quotes = (Array.isArray(r.quotes) ? r.quotes : []) as Quote[];
                const minPrice = quotes.length > 0 ? Math.min(...quotes.map((x) => Number(x.price))) : 0;
                const minEta = quotes.length > 0 ? quotes.map((x) => x.eta).sort()[0] : "";
                return (
                  <Card key={r.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-navy-900">{r.id} · {r.item}</p>
                        <p className="text-xs text-steel-500 truncate" title={`PR ${r.prId}`}>PR {r.prId} · Vendor: {(r.vendors as string[]).join(", ")}</p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {quotes.length === 0
                      ? <div className="mt-2"><EmptyState title="Belum ada penawaran" subtitle="Input harga + ETA tiap vendor." /></div>
                      : (
                        <table className="mt-3 w-full">
                          <thead className="bg-surface sticky top-0 z-10">
                            <tr><SortTh label="Vendor" sortKey="vendor" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Harga" sortKey="harga" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="ETA" sortKey="eta" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Komparasi" sortKey="komparasi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /></tr>
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
                                    {Number(x.price) === minPrice && <Badge tone="green">Termurah</Badge>}
                                    {x.eta === minEta && <Badge tone="blue">Tercepat</Badge>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(RFQ_NEXT[r.status] ?? []).map((n) => (
                        <button key={n} className="btn-secondary text-xs" onClick={() => { update("rfqs", r.id, { status: n }); toast(`${r.id} → ${n}`); }}>{n}</button>
                      ))}
                      <button className="btn-secondary text-xs" onClick={() => { setQuoteRfq(r); setQuoteForm({ vendor: "", price: "", eta: "" }); }}>Input Penawaran</button>
                      {r.status === "Evaluasi" && quotes.length > 0 && (
                        <button className="btn-primary text-xs" onClick={() => {
                          const cheap = quotes.find((x) => Number(x.price) === minPrice);
                          setWinRfq(r); setWinVendor(cheap?.vendor ?? "");
                        }}>Menangkan</button>
                      )}
                      {r.winner && <Badge tone="green">Pemenang: {r.winner}</Badge>}
                    </div>
                  </Card>
                );
              })}
              {rfqs.length === 0 && <EmptyState title="Belum ada RFQ" subtitle="Buat RFQ dari PR Disetujui di tab PR." />}
            </div>
          )}

          {tab === "PR" && (
            <div className="space-y-4">
              <Card className="p-5">
                <CardHeader title="Konsolidasi PR" subtitle="Centang multi-PR Disetujui satu vendor menjadi 1 PO Besar" />
                {approvedPRs.length === 0
                  ? <p className="py-3 text-center text-sm text-steel-400">Tidak ada PR Disetujui untuk dikonsolidasi.</p>
                  : (
                    <div className="space-y-2">
                      {approvedPRs.map((r) => (
                        <label key={r.id} className="flex items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
                          <input type="checkbox" checked={konsIds.includes(r.id)} onChange={(e) => setKonsIds((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} aria-label={`Konsolidasi ${r.id}`} />
                          <span className="min-w-0 flex-1 truncate font-medium text-navy-900" title={`${r.id} — ${r.item}`}>{r.id} — {r.item}</span>
                          <span className="shrink-0 font-semibold">{fmtRupiah(r.amount)}</span>
                        </label>
                      ))}
                      <FormGrid>
                        <Field label="Vendor gabungan">
                          <select className="input" value={konsVendor} onChange={(e) => setKonsVendor(e.target.value)}>
                            <option value="">Pilih vendor…</option>
                            {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Proyek">
                          <select className="input" value={konsProject} onChange={(e) => setKonsProject(e.target.value)}>
                            <option value="">Tanpa proyek…</option>
                            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.vessel}</option>)}
                          </select>
                        </Field>
                      </FormGrid>
                      <Field label="ETA"><input type="date" className="input" value={konsEta} onChange={(e) => setKonsEta(e.target.value)} /></Field>
                      <button className="btn-primary text-xs" onClick={saveKonsolidasi}>Konsolidasi → PO Besar</button>
                    </div>
                  )}
              </Card>
              <div>
                <div className="mb-3 flex justify-end">
                  <button className="btn-secondary text-xs" onClick={() => setShowPr(true)}><Plus className="h-3.5 w-3.5" /> Buat PR</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><SortTh label="PR" sortKey="pr" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label="Item" sortKey="item" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label="Oleh" sortKey="oleh" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label="Nilai" sortKey="nilai" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(requisitions, sort4, (r, k) => {
                        if (k === "nilai") return Number(r.amount || 0);
                        if (k === "item") return String(r.item ?? "");
                        if (k === "oleh") return String(r.by ?? "");
                        if (k === "status") return String(r.status ?? "");
                        return String(r.id ?? "");
                      }).map((r) => (
                        <tr key={r.id} className="hover:bg-surface">
                          <td className="td font-mono font-medium text-navy-900">{r.id}</td>
                          <td className="td text-steel-600 truncate" title={String(r.item)}>{r.item}</td>
                          <td className="td text-steel-600">{r.by}</td>
                          <td className="td font-semibold">{fmtRupiah(r.amount)}</td>
                          <td className="td"><StatusBadge status={r.status} /></td>
                          <td className="td">
                            <div className="flex flex-wrap gap-1.5">
                              {(r.status === "Draft" || r.status === "Draf") && (
                                <button className="btn-primary text-xs" onClick={() => { update("requisitions", r.id, { status: "Diajukan" }); log("mengajukan PR", r.id, "Procurement"); toast(`${r.id} diajukan`); }}>Ajukan</button>
                              )}
                              {PR_PENDING.includes(r.status) && (
                                <>
                                  <button className="btn-secondary text-xs" onClick={() => approvePr(r, true)}><Check className="h-3.5 w-3.5" /> Setujui</button>
                                  <button className="btn-secondary text-xs text-rose-600" aria-label={`Tolak ${r.id}`} onClick={() => approvePr(r, false)}><X className="h-3.5 w-3.5" /> Tolak</button>
                                </>
                              )}
                              {r.status === "Disetujui" && (
                                <button className="btn-primary text-xs" onClick={() => { setRfqPr(r); setRfqVendors([]); }}>Buat RFQ</button>
                              )}
                              {r.status === "Ditolak" && (
                                <button className="btn-secondary text-xs" onClick={() => update("requisitions", r.id, { status: "Menunggu Approval" })}>Ajukan Ulang</button>
                              )}
                              {(r.status === "Sudah PO" || r.status === "RFQ") && <span className="text-xs text-steel-400">—</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === "Vendor" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowVendor(true)}><Plus className="h-3.5 w-3.5" /> Tambah Vendor</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {vendors.map((v) => {
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
                          {pg && <Badge tone="navy">Payung</Badge>}
                          <Badge tone={isBlack ? "red" : v.status === "Aktif" ? "green" : "amber"}>{v.status ?? "Aktif"}</Badge>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-surface p-2.5">
                          <p className="text-xs text-steel-500">On-time</p>
                          <p className="font-semibold text-navy-900">{v.onTime}%</p>
                        </div>
                        <div className="rounded-lg bg-surface p-2.5">
                          <p className="text-xs text-steel-500">Kualitas</p>
                          <p className="font-semibold text-navy-900">{v.quality}%</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-steel-500">{v.po} PO ditangani</p>
                      <div className="mt-2 flex items-center gap-1.5 text-sm">
                        <Star className="h-4 w-4 text-amber-500" />
                        {avg === null
                          ? <span className="text-xs text-steel-400">Belum ada evaluasi</span>
                          : <span className="font-semibold text-navy-900">Skor {Math.round(avg)} <span className="font-normal text-steel-400">({scoresOf(v).length} evaluasi)</span></span>}
                      </div>
                      {pg && (
                        <p className="mt-1.5 text-xs text-steel-500">
                          Payung {pg.periode} · plafon {fmtRupiah(pg.plafon)} · terpakai {fmtRupiah(plafonPakai(v.name))}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button className="btn-secondary text-xs" onClick={() => { setPayungVendor(v); setPayungPeriode(pg?.periode === "-" ? "" : pg?.periode ?? ""); setPayungPlafon(pg ? String(pg.plafon) : ""); }}>
                          <Umbrella className="h-3.5 w-3.5" /> {pg ? "Ubah Payung" : "Kontrak Payung"}
                        </button>
                        {isBlack && (
                          <button className="btn-secondary text-xs text-rose-600" onClick={() => setUnblockVendor(v)}>Buka Blokir (Eskalasi)</button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal PO Besar */}
      <Modal open={showBig} onClose={() => setShowBig(false)} title="Buat PO Besar" subtitle="Masuk status Draft · wajib link PR Disetujui · pilih tujuan Kapal atau Stok"
        wide footer={<><button className="btn-secondary" onClick={() => setShowBig(false)}>Batal</button><button className="btn-primary" onClick={saveBig}>Simpan PO Besar</button></>}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tujuan PO">
            {(["kapal", "stok"] as const).map((t) => (
              <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${bigForm.tujuan === t ? "border-navy-700 bg-navy-50 text-navy-900" : "border-steel-200 text-steel-600"}`}>
                <input type="radio" name="tujuan-po" checked={bigForm.tujuan === t} onChange={() => setBigForm({ ...bigForm, tujuan: t })} />
                {t === "kapal" ? "Untuk Kapal (proyek + U/TK wajib)" : "Stok Gudang saja"}
              </label>
            ))}
          </div>
          <FormGrid>
            <Field label="PR Disetujui" hint="Wajib — 1 PR per PO manual">
              <select className="input" value={bigForm.prId} onChange={(e) => setBigForm({ ...bigForm, prId: e.target.value })}>
                <option value="">Pilih PR…</option>
                {approvedPRs.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.item} · {fmtRupiah(r.amount)}</option>)}
              </select>
            </Field>
            <Field label="Item inventori" hint="Wajib — penerimaan menambah stok item ini persis sebesar qty">
              <select className="input" value={bigForm.itemId} onChange={(e) => setBigForm({ ...bigForm, itemId: e.target.value })}>
                <option value="">Pilih item…</option>
                {invList.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Vendor">
              <select className="input" value={bigForm.vendor} onChange={(e) => setBigForm({ ...bigForm, vendor: e.target.value })}>
                <option value="">Pilih vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}{payungOf(v) ? ` (Payung: ${fmtRupiah(payungOf(v)!.plafon)})` : ""}</option>)}
              </select>
            </Field>
            <Field label="Proyek (cek budget)" hint={bigForm.tujuan === "kapal" ? "Wajib untuk PO kapal" : "Dikosongkan otomatis untuk stok"}>
              <select className="input" value={bigForm.project} disabled={bigForm.tujuan === "stok"} onChange={(e) => setBigForm({ ...bigForm, project: e.target.value })}>
                <option value="">Tanpa proyek…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="ETA (wajib)"><input type="date" className="input" value={bigForm.eta} onChange={(e) => setBigForm({ ...bigForm, eta: e.target.value })} /></Field>
          <FormGrid>
            <Field label="U/TK kapal" hint={bigForm.tujuan === "kapal" ? "Wajib — cth: U/TB. TRIALFA 01" : "Tidak dipakai untuk stok"}><input className="input" value={bigForm.vessel} disabled={bigForm.tujuan === "stok"} onChange={(e) => setBigForm({ ...bigForm, vessel: e.target.value })} placeholder="U/…" /></Field>
            <Field label="Harga" hint={`RawData: "Harga Include PPN ${ppnRate}%"`}>
              <select className="input" value={bigForm.includePpn ? "include" : "exclude"} onChange={(e) => setBigForm({ ...bigForm, includePpn: e.target.value === "include" })}>
                <option value="include">Include PPN {ppnRate}%</option>
                <option value="exclude">Exclude PPN</option>
              </select>
            </Field>
          </FormGrid>
          <p className="text-xs text-steel-500">No. dokumen SB otomatis: <span className="font-mono">{sbPoNumber(nextPoSeq())}</span> (format nn/PO-SB/SMD/m/yyyy)</p>
          <div>
            <p className="label">Baris item (minimal 1)</p>
            <div className="space-y-2">
              {bigLines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input className="input col-span-5" placeholder="Nama baris" value={l.name} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                  <input type="number" min={1} className="input col-span-2" placeholder="Qty" value={l.qty} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))} />
                  <select className="input col-span-2" value={l.unit} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))}>
                    {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
                  </select>
                  <input type="number" min={0} className="input col-span-2" placeholder="Harga" value={l.price} onChange={(e) => setBigLines((s) => s.map((x, i) => (i === idx ? { ...x, price: Number(e.target.value) } : x)))} />
                  <button className="btn-secondary col-span-1 text-xs" aria-label={`Hapus baris ${idx + 1}`} onClick={() => setBigLines((s) => s.filter((_, i) => i !== idx))}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <button className="btn-secondary mt-2 text-xs" onClick={() => setBigLines((s) => [...s, { name: "", qty: 1, unit: "pcs", price: 0 }])}><Plus className="h-3.5 w-3.5" /> Tambah baris</button>
            <p className="mt-2 text-sm font-semibold text-navy-900">Total: {fmtRupiah(bigTotal)} · Level approval: {levelOf(bigTotal)}</p>
          </div>
          {bigOver && bigBudget && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Peringatan keras: total PO aktif proyek {fmtRupiah(bigBudget.aktif)} + PO ini {fmtRupiah(bigTotal)} melebihi sisa budget {fmtRupiah(bigBudget.sisa)}.
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={bigForm.override} onChange={(e) => setBigForm({ ...bigForm, override: e.target.checked })} /> Override dengan alasan
              </label>
              <input className="input mt-2" placeholder="Alasan override…" value={bigForm.overrideReason} onChange={(e) => setBigForm({ ...bigForm, overrideReason: e.target.value })} />
            </div>
          )}
        </div>
      </Modal>

      {/* Modal PO Kecil */}
      <Modal open={showSmall} onClose={() => setShowSmall(false)} title="Buat PO Kecil" subtitle="Workshop · Diajukan → Disetujui → Diterima · tanpa RFQ"
        footer={<><button className="btn-secondary" onClick={() => setShowSmall(false)}>Batal</button><button className="btn-primary" onClick={saveSmall}>Simpan PO Kecil</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Workshop"><input className="input" value={smallForm.workshop} onChange={(e) => setSmallForm({ ...smallForm, workshop: e.target.value })} placeholder="cth: Workshop Balikpapan" /></Field>
            <Field label="Peminta"><input className="input" value={smallForm.requester} onChange={(e) => setSmallForm({ ...smallForm, requester: e.target.value })} placeholder="cth: Rudi H." /></Field>
          </FormGrid>
          <Field label="Item bebas"><input className="input" value={smallForm.item} onChange={(e) => setSmallForm({ ...smallForm, item: e.target.value })} placeholder="cth: Oli hidrolik 20L" /></Field>
          <FormGrid>
            <Field label="Qty"><input type="number" min={1} className="input" value={smallForm.qty} onChange={(e) => setSmallForm({ ...smallForm, qty: e.target.value })} /></Field>
            <Field label="Satuan">
              <select className="input" value={smallForm.unit} onChange={(e) => setSmallForm({ ...smallForm, unit: e.target.value })}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll", "set", "pak"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Estimasi harga satuan (Rp)"><input type="number" min={0} className="input" value={smallForm.price} onChange={(e) => setSmallForm({ ...smallForm, price: e.target.value })} /></Field>
            <Field label="No. nota/bukti (wajib saat terima)"><input className="input" value={smallForm.nota} onChange={(e) => setSmallForm({ ...smallForm, nota: e.target.value })} placeholder="cth: NT-2026-001" /></Field>
          </FormGrid>
          <FormGrid>
            <Field label="ETA (wajib)"><input type="date" className="input" value={smallForm.eta} onChange={(e) => setSmallForm({ ...smallForm, eta: e.target.value })} /></Field>
            <Field label="Proyek (cek budget)">
              <select className="input" value={smallForm.project} onChange={(e) => setSmallForm({ ...smallForm, project: e.target.value })}>
                <option value="">Stok workshop (tanpa proyek)…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="U/TK kapal" hint="Wajib bila proyek diisi"><input className="input" value={smallForm.vessel} onChange={(e) => setSmallForm({ ...smallForm, vessel: e.target.value })} placeholder="U/… atau kosongkan untuk stok" /></Field>
          <p className="text-sm font-semibold text-navy-900">Total: {fmtRupiah(smallAmount)} · Batas {fmtRupiah(PO_KECIL_LIMIT)}</p>
          {smallOver && smallBudget && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Peringatan keras: melebihi sisa budget {fmtRupiah(smallBudget.sisa)}.
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={smallForm.override} onChange={(e) => setSmallForm({ ...smallForm, override: e.target.checked })} /> Override dengan alasan
              </label>
              <input className="input mt-2" placeholder="Alasan override…" value={smallForm.overrideReason} onChange={(e) => setSmallForm({ ...smallForm, overrideReason: e.target.value })} />
            </div>
          )}
        </div>
      </Modal>

      {/* Modal buat RFQ */}
      <Modal open={rfqPr !== null} onClose={() => setRfqPr(null)} title={`Buat RFQ — ${rfqPr?.id ?? ""}`} subtitle={`${rfqPr?.item ?? ""} · pilih minimal 3 vendor`}
        footer={<><button className="btn-secondary" onClick={() => setRfqPr(null)}>Batal</button><button className="btn-primary" onClick={saveRfq}>Buat RFQ (Draf)</button></>}>
        <div className="space-y-2">
          {vendors.map((v) => (
            <label key={v.id} className="flex items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={rfqVendors.includes(v.name)} onChange={(e) => setRfqVendors((s) => (e.target.checked ? [...s, v.name] : s.filter((x) => x !== v.name)))} aria-label={`RFQ ke ${v.name}`} />
              <span className="truncate font-medium text-navy-900" title={v.name}>{v.name}</span>
              <span className="ml-auto text-xs text-steel-400">{v.cat}</span>
            </label>
          ))}
        </div>
      </Modal>

      {/* Modal input penawaran */}
      <Modal open={quoteRfq !== null} onClose={() => setQuoteRfq(null)} title={`Penawaran — ${quoteRfq?.id ?? ""}`} subtitle="Harga + ETA per vendor"
        footer={<><button className="btn-secondary" onClick={() => setQuoteRfq(null)}>Batal</button><button className="btn-primary" onClick={saveQuote}>Simpan Penawaran</button></>}>
        <div className="space-y-3">
          <Field label="Vendor">
            <select className="input" value={quoteForm.vendor} onChange={(e) => setQuoteForm({ ...quoteForm, vendor: e.target.value })}>
              <option value="">Pilih vendor…</option>
              {((quoteRfq?.vendors as string[]) ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label="Harga (Rp)"><input type="number" min={0} className="input" value={quoteForm.price} onChange={(e) => setQuoteForm({ ...quoteForm, price: e.target.value })} /></Field>
            <Field label="ETA"><input type="date" className="input" value={quoteForm.eta} onChange={(e) => setQuoteForm({ ...quoteForm, eta: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Konfirmasi setujui / tolak PO (PO Kecil: setujui tunggal) */}
      <ConfirmModal
        open={confirmApprove !== null}
        title={`Setujui ${confirmApprove?.id ?? ""}?`}
        desc="PO yang disetujui berlanjut ke tahap pengiriman."
        confirmLabel="Ya, setujui"
        onCancel={() => setConfirmApprove(null)}
        onConfirm={() => { if (confirmApprove) doPoStatus(confirmApprove, "Disetujui"); setConfirmApprove(null); }}
      />
      <ConfirmModal
        open={confirmRejectPo !== null}
        title={`Tolak ${confirmRejectPo?.id ?? ""}?`}
        desc="PO yang ditolak berhenti di tahap pengajuan."
        confirmLabel="Ya, tolak"
        onCancel={() => setConfirmRejectPo(null)}
        onConfirm={() => { if (confirmRejectPo) doPoStatus(confirmRejectPo, "Ditolak"); setConfirmRejectPo(null); }}
      />

      {/* Modal terima barang */}
      <Modal open={recvPo !== null} onClose={() => setRecvPo(null)} title={`Terima ${recvPo?.id ?? ""}`} subtitle="Stok bertambah persis sebesar qty yang diterima"
        footer={<>
          <button className="btn-secondary" onClick={() => setRecvPo(null)}>Batal</button>
          <button className="btn-secondary" onClick={() => confirmRecv("sebagian")}>Terima Sebagian</button>
          <button className="btn-primary" onClick={() => confirmRecv("penuh")}>Terima Penuh</button>
        </>}>
        <div className="space-y-3">
          <Field label="Item inventori tujuan" hint={recvPo?.poType === "Kecil" ? "Opsional untuk PO Kecil (item bebas)" : undefined}>
            <select className="input" value={recvItem} onChange={(e) => setRecvItem(e.target.value)}>
              <option value="">Pilih item…</option>
              {invList.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <Field label="Qty diterima"><input type="number" min={0} className="input" value={recvQty} onChange={(e) => setRecvQty(e.target.value)} /></Field>
          <FormGrid>
            <Field label="No faktur pajak" hint={recvPo?.poType === "Kecil" ? "Opsional untuk PO Kecil" : "Wajib untuk PO Besar"}>
              <input className="input font-mono" value={recvNoFaktur} onChange={(e) => setRecvNoFaktur(e.target.value)} placeholder="cth: 010.000-26.00000001" />
            </Field>
            <Field label="Tanggal faktur" hint={recvPo?.poType === "Kecil" ? "Opsional untuk PO Kecil" : "Wajib untuk PO Besar"}>
              <input type="date" className="input" value={recvTglFaktur} onChange={(e) => setRecvTglFaktur(e.target.value)} />
            </Field>
          </FormGrid>
          {recvPo && recvLate > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Terlambat {recvLate} hari dari ETA {fmtTanggal(recvPo.eta)} — usulan denda {fmtRupiah(recvDendaPreview)}.
              <div className="mt-2">
                <Field label="Denda per hari (%)" hint="Batas total 5% dari nilai PO">
                  <input type="number" min={0} max={5} step={0.1} className="input" value={recvDendaPct} onChange={(e) => setRecvDendaPct(e.target.value)} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal retur */}
      <Modal open={retPo !== null} onClose={() => setRetPo(null)} title={`Retur ${retPo?.id ?? ""}`} subtitle={retPo ? `Maksimal ${fmtJumlah(maxRet(retPo))} (diterima dikurangi yang sudah diretur)` : ""}
        footer={<><button className="btn-secondary" onClick={() => setRetPo(null)}>Batal</button><button className="btn-primary" onClick={confirmRetur}>Simpan Retur</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Qty retur"><input type="number" min={0} className="input" value={retQty} onChange={(e) => setRetQty(e.target.value)} /></Field>
            <Field label="Alasan"><input className="input" value={retNote} onChange={(e) => setRetNote(e.target.value)} placeholder="cth: Rusak saat kirim" /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal amandemen */}
      <Modal open={amendPo !== null && !confirmAmend} onClose={() => setAmendPo(null)} title={`Amandemen ${amendPo?.id ?? ""}`} subtitle="Tambah baris/catatan · revisi naik otomatis"
        footer={<><button className="btn-secondary" onClick={() => setAmendPo(null)}>Batal</button><button className="btn-primary" onClick={() => setConfirmAmend(true)}>Lanjut Konfirmasi</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Baris tambahan"><input className="input" value={amendForm.name} onChange={(e) => setAmendForm({ ...amendForm, name: e.target.value })} /></Field>
            <Field label="Satuan">
              <select className="input" value={amendForm.unit} onChange={(e) => setAmendForm({ ...amendForm, unit: e.target.value })}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Qty"><input type="number" min={1} className="input" value={amendForm.qty} onChange={(e) => setAmendForm({ ...amendForm, qty: e.target.value })} /></Field>
            <Field label="Harga satuan (Rp)"><input type="number" min={0} className="input" value={amendForm.price} onChange={(e) => setAmendForm({ ...amendForm, price: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Catatan amandemen"><input className="input" value={amendForm.note} onChange={(e) => setAmendForm({ ...amendForm, note: e.target.value })} placeholder="cth: Tambah scope baut" /></Field>
        </div>
      </Modal>
      <ConfirmModal
        open={confirmAmend}
        title={`Simpan amandemen ${amendPo?.id ?? ""}?`}
        desc="Baris tambahan dicatat di amendments dan nomor revisi naik (R1, R2, …)."
        confirmLabel="Ya, simpan amandemen"
        onCancel={() => setConfirmAmend(false)}
        onConfirm={confirmAmendNow}
      />

      {/* Modal evaluasi vendor */}
      <Modal open={evalPo !== null} onClose={() => setEvalPo(null)} title={`Evaluasi Vendor — ${evalPo?.id ?? ""}`} subtitle={`${evalPo?.vendor ?? ""} · kualitas 30 + delivery 30 + harga 40 (skala 100)`}
        footer={<><button className="btn-secondary" onClick={() => setEvalPo(null)}>Batal</button><button className="btn-primary" onClick={saveEval}>Simpan Skor</button></>}>
        <div className="space-y-3">
          <FormGrid>
            {(["Kualitas", "Delivery", "Harga"] as const).map((lbl) => {
              const val = lbl === "Kualitas" ? evalQ : lbl === "Delivery" ? evalD : evalP;
              const set = lbl === "Kualitas" ? setEvalQ : lbl === "Delivery" ? setEvalD : setEvalP;
              return (
                <Field key={lbl} label={`${lbl} (1–5)`}>
                  <select className="input" value={val} onChange={(e) => set(e.target.value)} aria-label={`Nilai ${lbl}`}>
                    <option value="">Pilih…</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              );
            })}
          </FormGrid>
          <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
            {evalPreview === null ? "Isi ketiga nilai untuk melihat skor." : `Skor usulan: ${evalPreview} (rata-rata vendor <60 otomatis Blacklist).`}
          </p>
        </div>
      </Modal>
      <ConfirmModal
        open={unblockVendor !== null}
        title={`Buka blokir ${unblockVendor?.name ?? ""}?`}
        desc="Vendor Blacklist hanya dibuka lewat eskalasi — tercatat di log."
        confirmLabel="Ya, buka (eskalasi)"
        onCancel={() => setUnblockVendor(null)}
        onConfirm={() => {
          if (unblockVendor) {
            update("vendors", unblockVendor.id, { status: "Aktif" });
            log("buka blacklist (eskalasi)", unblockVendor.name, "Procurement");
            toast(`${unblockVendor.name} dibuka kembali (Aktif)`);
          }
          setUnblockVendor(null);
        }}
      />

      {/* Modal kontrak payung */}
      <Modal open={payungVendor !== null} onClose={() => setPayungVendor(null)} title={`Kontrak Payung — ${payungVendor?.name ?? ""}`} subtitle="PO ke vendor ini divalidasi terhadap plafon kumulatif"
        footer={<><button className="btn-secondary" onClick={() => setPayungVendor(null)}>Batal</button><button className="btn-primary" onClick={savePayung}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Periode" hint="cth: 2026-01 s.d. 2026-12">
            <input className="input" value={payungPeriode} onChange={(e) => setPayungPeriode(e.target.value)} placeholder="cth: 2026" />
          </Field>
          <Field label="Plafon (Rp)" hint="Kosongkan untuk menghapus kontrak payung">
            <input type="number" min={0} className="input" value={payungPlafon} onChange={(e) => setPayungPlafon(e.target.value)} placeholder="cth: 5000000000" />
          </Field>
          {payungVendor && (
            <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
              Terpakai saat ini {fmtRupiah(plafonPakai(payungVendor.name))} (PO aktif, di luar Ditolak).
            </p>
          )}
        </div>
      </Modal>

      {/* Modal PR */}
      <Modal open={showPr} onClose={() => setShowPr(false)} title="Buat Purchase Requisition"
        footer={<><button className="btn-secondary" onClick={() => setShowPr(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!prForm.item.trim()) { toast("Item wajib diisi", "info"); return; }
          if (!Number(prForm.amount) || Number(prForm.amount) <= 0) { toast("Estimasi nilai harus lebih dari 0", "info"); return; }
          const created = add("requisitions", { item: prForm.item.trim(), by: prForm.by.trim() || "Anda", amount: Number(prForm.amount), status: "Menunggu Approval" },
            { action: "mengajukan PR", module: "Procurement" });
          toast(`PR ${created.id} diajukan`); setShowPr(false); setPrForm({ item: "", by: "", amount: "" });
        }}>Ajukan</button></>}>
        <div className="space-y-3">
          <Field label="Item dibutuhkan"><input className="input" value={prForm.item} onChange={(e) => setPrForm({ ...prForm, item: e.target.value })} /></Field>
          <FormGrid>
            <Field label="Pemohon"><input className="input" value={prForm.by} onChange={(e) => setPrForm({ ...prForm, by: e.target.value })} placeholder="cth: Rudi H." /></Field>
            <Field label="Estimasi nilai (Rp)"><input type="number" min={0} className="input" value={prForm.amount} onChange={(e) => setPrForm({ ...prForm, amount: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal vendor */}
      <Modal open={showVendor} onClose={() => setShowVendor(false)} title="Tambah Vendor"
        footer={<><button className="btn-secondary" onClick={() => setShowVendor(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!vForm.name.trim()) { toast("Nama vendor wajib diisi", "info"); return; }
          const created = add("vendors", { name: vForm.name.trim(), cat: vForm.cat, onTime: 100, quality: 100, po: 0, status: "Kualifikasi", scores: [] },
            { action: "mendaftarkan vendor", module: "Procurement" });
          toast(`Vendor ${created.id} ditambahkan`); setShowVendor(false); setVForm({ name: "", cat: "Baja & Struktur" });
        }}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama vendor"><input className="input" value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} /></Field>
          <Field label="Kategori">
            <select className="input" value={vForm.cat} onChange={(e) => setVForm({ ...vForm, cat: e.target.value })}>
              {["Baja & Struktur", "Mesin & Engine", "Cat & Coating", "Rigging & Wire", "Listrik", "Jasa"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Dialog pemenang RFQ — pilihan vendor + konfirmasi */}
      <Modal open={winRfq !== null} onClose={() => { setWinRfq(null); setWinVendor(""); }} title={`Pemenang — ${winRfq?.id ?? ""}`} subtitle="Komparasi otomatis lalu menangkan satu vendor"
        footer={<><button className="btn-secondary" onClick={() => { setWinRfq(null); setWinVendor(""); }}>Batal</button><button className="btn-primary" onClick={confirmWin}>Menangkan & Buat PO</button></>}>
        <Field label="Vendor pemenang">
          <select className="input" value={winVendor} onChange={(e) => setWinVendor(e.target.value)}>
            <option value="">Pilih pemenang…</option>
            {((winRfq?.quotes as Quote[] | undefined) ?? []).map((x) => (
              <option key={x.vendor} value={x.vendor}>{x.vendor} · {fmtRupiah(Number(x.price))} · ETA {fmtTanggal(x.eta)}</option>
            ))}
          </select>
        </Field>
      </Modal>
    </div>
  );
}
