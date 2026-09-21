import { useMemo, useState } from "react";
import { Wallet, ArrowDownToLine, FileText, Receipt, TrendingUp, Plus, Trash2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardHeader,
  PageHeader,
  KpiCard,
  Tabs,
  StatusBadge,
  Badge,
  ChartTooltip,
  Donut,
  Modal,
  Field,
  FormGrid,
  ConfirmModal,
  EmptyState,
  ProgressBar,
  toast,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtRupiah, fmtMiliar, fmtTanggal, fmtJumlah, todayISO } from "../../utils/format";
import { getSetting } from "../../utils/settings";
import { exportExcel } from "../../utils/export";
import {
  COA_EXCEL,
  NL_EXCEL,
  HUTANG_EXCEL,
  PIUTANG_EXCEL,
  KASBANK_EXCEL,
  JU_PENYESUAIAN_EXCEL,
  LAPORAN_EXCEL,
} from "../../data/financeExcel";

const INV_NEXT: Record<string, string[]> = {
  Draft: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Belum Dibayar"],
  "Belum Dibayar": ["Lunas", "Terlambat"],
  Terlambat: ["Lunas"],
  Ditolak: ["Draft"],
  Lunas: [],
  Dihapusbukukan: [],
};

const BILLING_TYPES = ["Milestone", "Progres", "Uang Muka", "Retensi", "T&M"] as const;

const INV_PREFIX: Record<string, string> = {
  Milestone: "INV/MS",
  Progres: "INV/PR",
  "Uang Muka": "INV/UM",
  Retensi: "INV/RT",
  "T&M": "INV/TM",
};

const DUNNING_NEXT: Record<string, string> = {
  "Belum Ditagih": "Ditagih",
  Ditagih: "SP1",
  SP1: "SP2",
  SP2: "Hold",
  Hold: "Hapus Buku",
  "Hapus Buku": "Hapus Buku",
};

const AR_BUCKETS = [
  { name: "Current", min: Number.NEGATIVE_INFINITY, max: 0 },
  { name: "1–30 hari", min: 1, max: 30 },
  { name: "31–60 hari", min: 31, max: 60 },
  { name: "61–90 hari", min: 61, max: 90 },
  { name: "91–120 hari", min: 91, max: 120 },
  { name: ">120 hari", min: 121, max: Number.POSITIVE_INFINITY },
];

const EQUIP_RATE_PER_JAM = 1500000;

interface InvLine {
  desc: string;
  qty: string;
  unit: string;
  price: string;
  rate: string;
  hours: string;
}

const invNext = (s: string): string[] => INV_NEXT[s] ?? [];
const emptyProof = () => ({ date: todayISO(), method: "Transfer", ref: "" });
const emptyLine = (): InvLine => ({ desc: "", qty: "1", unit: "pcs", price: "", rate: "", hours: "" });
const num = (v: unknown): number => Number(v) || 0;

function lineAmount(l: InvLine, isTM: boolean): number {
  if (isTM) return num(l.rate) * num(l.hours);
  return num(l.qty) * num(l.price);
}

function ageDays(due: unknown, today: string): number {
  const d = Date.parse(String(due ?? ""));
  const t = Date.parse(today);
  if (!Number.isFinite(d) || !Number.isFinite(t)) return 0;
  return Math.floor((t - d) / 86400000);
}

function parseJamHours(jam: unknown): number {
  const s = String(jam ?? "");
  const m = s.match(/(\d{1,2}):(\d{2})\s*[–\-—]\s*(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const a = num(m[1]) + num(m[2]) / 60;
  const b = num(m[3]) + num(m[4]) / 60;
  const h = b - a;
  return h > 0 && h <= 24 ? h : 0;
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number): string => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const COA = (rows: StoreItem[]): { kode: string; akun: string; tipe: string; dk: string; nrlr: string }[] =>
  rows.map((c) => ({
    kode: String(c.kode),
    akun: String(c.nama),
    tipe:
      String(c.nrlr) === "LR"
        ? String(c.kode).startsWith("4") || String(c.kode).startsWith("7-1") || String(c.kode).startsWith("7-2")
          ? "Pendapatan"
          : "Beban"
        : String(c.kode).startsWith("1")
          ? "Aset"
          : String(c.kode).startsWith("2")
            ? "Liabilitas"
            : String(c.kode).startsWith("3")
              ? "Ekuitas"
              : String(c.dk) === "-"
                ? "Header"
                : "Aset",
    dk: String(c.dk),
    nrlr: String(c.nrlr),
  }));

// Saldo pembanding Excel (Neraca Saldo Agustus 2026) untuk rekonsiliasi opening balance.
const nlOf = (kode: string): { d: number; k: number } => NL_EXCEL[kode] ?? { d: 0, k: 0 };

export default function Finance() {
  const { data, add, update, remove, log, branch, inBranch } = useStore();
  const [tab, setTab] = useState("Akun");
  const today = todayISO();

  const projectById = useMemo(() => {
    const m: Record<string, StoreItem> = {};
    for (const p of data.projects ?? []) m[String(p.id)] = p;
    return m;
  }, [data.projects]);

  const matchBranch = (projectId: string): boolean => {
    if (branch === "SEMUA") return true;
    const p = projectById[projectId];
    if (!p || !p.branch) return true;
    return String(p.branch) === branch;
  };

  const invoices = useMemo(
    () => (data.invoices ?? []).filter((i) => matchBranch(String(i.project ?? ""))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.invoices, branch, data.projects]
  );
  const payables = useMemo(() => inBranch(data.payables ?? []), [data.payables, branch]);
  const projectsVisible = useMemo(() => inBranch(data.projects ?? []), [data.projects, branch]);

  // CoA live dari store (seed = sheet Akun Excel), fallback ke file Excel.
  const coaRows: StoreItem[] = useMemo(
    () =>
      data.coa && data.coa.length > 0
        ? data.coa
        : COA_EXCEL.map((c) => ({ id: `COA-${c.kode}`, kode: c.kode, nama: c.nama, dk: c.dk, nrlr: c.nrlr })),
    [data.coa]
  );
  const coaList = useMemo(() => COA(coaRows), [coaRows]);
  const coaKode = useMemo(() => new Set(coaRows.map((c) => String(c.kode))), [coaRows]);
  const manJournals = useMemo(() => data.journals ?? [], [data.journals]);
  const assetRows = useMemo(() => data.assets ?? [], [data.assets]);

  const [showInv, setShowInv] = useState(false);
  const [invForm, setInvForm] = useState({
    project: "",
    billingType: "Milestone" as string,
    milestoneRef: "",
    serviceRef: "",
    retentionPct: "5",
    due: "",
    paymentTerm: "Termin 1",
    nsfp: "",
    noFaktur: "",
    kodePembantu: "",
  });
  const [invLines, setInvLines] = useState<InvLine[]>([emptyLine()]);
  const [payTarget, setPayTarget] = useState<StoreItem | null>(null);
  const [apTarget, setApTarget] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState(emptyProof);
  const [rejectInv, setRejectInv] = useState<StoreItem | null>(null);
  const [showAp, setShowAp] = useState(false);
  const [apForm, setApForm] = useState({ v: "", kodePembantu: "", po: "", openAwal: "", amt: "", due: "", nonPpn: false });
  const [apEdit, setApEdit] = useState<StoreItem | null>(null);
  const [apEditForm, setApEditForm] = useState({ v: "", kodePembantu: "", openAwal: "", amt: "", due: "", nonPpn: false });
  const [releaseTarget, setReleaseTarget] = useState<StoreItem | null>(null);
  const [releaseForm, setReleaseForm] = useState({ date: todayISO(), ba: "" });
  const [taxId, setTaxId] = useState("");
  const [newPeriod, setNewPeriod] = useState("");

  // 1. AR aging + dunning + hapus buku
  const [writeOff, setWriteOff] = useState<StoreItem | null>(null);
  const [writeOffReason, setWriteOffReason] = useState("");
  const [confirmWriteOff, setConfirmWriteOff] = useState(false);

  // 2. Jadwal bayar / batch
  const [schedSel, setSchedSel] = useState<string[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [batchProof, setBatchProof] = useState(emptyProof);

  // 5/6. Profit + CBS per proyek
  const [profitProjectId, setProfitProjectId] = useState("");
  const [allocTarget, setAllocTarget] = useState<StoreItem | null>(null);
  const [allocForm, setAllocForm] = useState({ project: "", pct: "100" });
  const [overheadPct, setOverheadPct] = useState("5");

  // 8. Approval director invoice
  const [dirTarget, setDirTarget] = useState<StoreItem | null>(null);
  const [dirCheck, setDirCheck] = useState(false);
  const [dirName, setDirName] = useState("");

  // Akun (sheet Akun): tambah/ubah sesuai kolom NO AKUN, NAMA AKUN, D/K, NR/LR.
  const [showCoa, setShowCoa] = useState(false);
  const [coaForm, setCoaForm] = useState({ kode: "", nama: "", dk: "D", nrlr: "NR" });
  const [coaTarget, setCoaTarget] = useState<StoreItem | null>(null);

  // Jurnal (sheet JU): tambah jurnal manual berimbang.
  const [showJu, setShowJu] = useState(false);
  const [juForm, setJuForm] = useState({ date: todayISO(), kodePembantu: "", dokumen: "", uraian: "", db: "", kr: "", amount: "", sumber: "JU" });

  // Kas & Bank: catat mutasi masuk/keluar per rekening.
  const [showMut, setShowMut] = useState(false);
  const [mutForm, setMutForm] = useState({ date: todayISO(), rekening: "1-111", arah: "Masuk", lawan: "", kodePembantu: "", dokumen: "", uraian: "", amount: "" });

  // Piutang: ubah invoice yang belum lunas.
  const [invEdit, setInvEdit] = useState<StoreItem | null>(null);
  const [invEditForm, setInvEditForm] = useState({ client: "", kodePembantu: "", due: "", paymentTerm: "", milestoneRef: "", nsfp: "", noFaktur: "" });

  // Aset (sheet Aset): tambah harta baru, susut GL otomatis.
  const [showAst, setShowAst] = useState(false);
  const [astForm, setAstForm] = useState({ nama: "", kelompok: "2", bulan: "", tahun: "", nilai: "", metode: "GL" });

  const KAS_REKENING = coaRows.filter((c) => /^(1-11|1-12)/.test(String(c.kode)) && String(c.dk) !== "-");
  const kasSaldo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of KASBANK_EXCEL) m[r.kode] = r.awal;
    for (const j of manJournals) {
      if (j.status === "Void") continue;
      if (j.sumber !== "Kas" && j.sumber !== "Bank") continue;
      const amt = num(j.amount);
      if (String(j.db) in m) m[String(j.db)] += amt;
      if (String(j.kr) in m) m[String(j.kr)] -= amt;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manJournals]);

  const isTMForm = invForm.billingType === "T&M";
  const invTotal = invLines.reduce((s, l) => s + lineAmount(l, isTMForm), 0);
  const retentionAmtPreview = invForm.billingType === "Uang Muka" || invForm.billingType === "T&M"
    ? 0
    : Math.round(invTotal * (num(invForm.retentionPct) / 100));

  const approveThreshold = getSetting(data, "APPROVE_INVOICE", 5000000);
  const needsDirector = (inv: StoreItem): boolean =>
    num(inv.amount) > approveThreshold && !inv.directorApproved && String(inv.status) !== "Lunas" && String(inv.status) !== "Dihapusbukukan";

  const arOpen = useMemo(
    () => invoices.filter((i) => i.status !== "Lunas" && i.status !== "Draft" && i.status !== "Dihapusbukukan"),
    [invoices]
  );
  const arTotal = arOpen.reduce((s, i) => s + num(i.amount), 0);
  const apTotal = payables.filter((a) => a.st !== "Lunas").reduce((s, a) => s + num(a.amt), 0);
  const lateCount = invoices.filter((i) => i.status === "Terlambat").length;
  const writeOffTotal = invoices.filter((i) => i.status === "Dihapusbukukan").reduce((s, i) => s + num(i.amount), 0);

  const agingReal = useMemo(
    () =>
      AR_BUCKETS.map((b) => {
        const rows = arOpen.filter((i) => {
          const age = ageDays(i.due, today);
          return age >= b.min && age <= b.max;
        });
        return { ...b, count: rows.length, total: rows.reduce((s, i) => s + num(i.amount), 0) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arOpen]
  );

  const AR_DONUT_COLORS = ["#22c55e", "#f59e0b", "#f97316", "#ef4444", "#8b5cf6", "#0b3a63"];

  const agingDonut = useMemo(
    () =>
      agingReal.map((b, i) => ({
        name: b.name,
        value: Math.round((b.total / 1000000000) * 10) / 10,
        color: AR_DONUT_COLORS[i % AR_DONUT_COLORS.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agingReal]
  );
  const agingDonutTotal = agingDonut.reduce((s, d) => s + d.value, 0);

  // Kas & Bank dari Excel (sheet JU,Kas,Bank + BB) — bukan dummy.
  const kasAwal = KASBANK_EXCEL.reduce((s, r) => s + r.awal, 0);
  const kasAkhir = KASBANK_EXCEL.reduce((s, r) => s + r.akhir, 0);
  const kasDelta = kasAwal ? Math.round(((kasAkhir - kasAwal) / Math.abs(kasAwal)) * 100) : 0;

  // Hutang Excel awal vs akhir untuk spark AP.
  const apAwalExcel = HUTANG_EXCEL.reduce((s, h) => s + (h.awal || 0), 0);

  const retentionTotal = invoices
    .filter((i) => num(i.retentionAmt) > 0 && i.retentionStatus !== "Released")
    .reduce((s, i) => s + num(i.retentionAmt), 0);

  const taxPeriods = data.taxPeriods ?? [];
  const activeTaxId = taxId || taxPeriods[1]?.id || taxPeriods[0]?.id || "";
  const activeTax = taxPeriods.find((t) => t.id === activeTaxId) ?? taxPeriods[0];
  const activePeriod = String(activeTax?.period ?? "");

  const monthOf = (v: unknown): string => String(v ?? "").slice(0, 7);
  const invPaidMonth = (i: StoreItem): string => monthOf(i.paidAt || i.due);
  const apPaidMonth = (a: StoreItem): string => monthOf(a.paidAt || a.due);

  const taxCalc = useMemo(() => {
    if (!activePeriod) return { ppnKeluar: 0, ppnMasuk: 0, pph23: 0, pph21: 0, invBase: 0, apBase: 0, ppnRate: 11, pphRate: 2 };
    const invLunas = invoices.filter((i) => i.status === "Lunas" && invPaidMonth(i) === activePeriod);
    const invBase = invLunas.reduce((s, i) => s + num(i.amount), 0);
    const apLunas = payables.filter((a) => a.st === "Lunas" && apPaidMonth(a) === activePeriod);
    const apBase = apLunas.reduce((s, a) => s + num(a.amt), 0);
    const payRows = (data.payroll ?? []).filter((p) => String(p.period ?? "") === activePeriod);
    const pph21 = payRows.reduce((s, p) => s + num(p.pph21), 0);
    const ppnRate = getSetting(data, "PPN_RATE", 11);
    const pphRate = getSetting(data, "PPH23_RATE", 2);
    return {
      ppnKeluar: Math.round((invBase * ppnRate) / 100),
      ppnMasuk: Math.round((apBase * ppnRate) / 100),
      pph23: Math.round((apBase * pphRate) / 100),
      pph21,
      invBase,
      apBase,
      ppnRate,
      pphRate,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, payables, data.payroll, data.settings, activePeriod]);

  const taxLocked = activeTax?.status === "Lapor";
  const taxShown = taxLocked
    ? { ppnKeluar: num(activeTax.ppnKeluar), ppnMasuk: num(activeTax.ppnMasuk), pph23: num(activeTax.pph23), pph21: num(activeTax.pph21) }
    : taxCalc;

  // 3. Nomor invoice auto per tipe
  const invPreview = useMemo(() => {
    const prefix = INV_PREFIX[invForm.billingType] ?? "INV";
    const year = today.slice(0, 4);
    const head = `${prefix}-${year}-`;
    let max = 0;
    for (const i of data.invoices ?? []) {
      const id = String(i.id ?? "");
      if (id.startsWith(head)) {
        const n = Number(id.slice(head.length));
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return `${head}${String(max + 1).padStart(3, "0")}`;
  }, [invForm.billingType, data.invoices, today]);

  // 2. Jadwal bayar: payable + invoice jatuh tempo <= 30 hari, sort due
  const schedItems = useMemo(() => {
    const cutoff = Date.parse(today) + 30 * 86400000;
    const rows: { key: string; kind: "AP" | "AR"; id: string; ref: string; desc: string; due: string; amount: number; age: number }[] = [];
    for (const a of payables) {
      if (a.st === "Lunas") continue;
      const dueMs = Date.parse(String(a.due ?? ""));
      if (!Number.isFinite(dueMs) || dueMs > cutoff) continue;
      rows.push({ key: `AP:${a.id}`, kind: "AP", id: String(a.id), ref: String(a.po ?? "-"), desc: String(a.v ?? ""), due: String(a.due ?? ""), amount: num(a.amt), age: ageDays(a.due, today) });
    }
    for (const i of arOpen) {
      const dueMs = Date.parse(String(i.due ?? ""));
      if (!Number.isFinite(dueMs) || dueMs > cutoff) continue;
      rows.push({ key: `AR:${i.id}`, kind: "AR", id: String(i.id), ref: String(i.project ?? ""), desc: String(i.client ?? ""), due: String(i.due ?? ""), amount: num(i.amount), age: ageDays(i.due, today) });
    }
    return rows.sort((a, b) => String(a.due).localeCompare(String(b.due)));
  }, [payables, arOpen, today]);
  const schedTotal = schedItems.filter((r) => schedSel.includes(r.key)).reduce((s, r) => s + r.amount, 0);

  // 5. Pemetaan biaya ke proyek
  const poProject = useMemo(() => {
    const m: Record<string, string> = {};
    for (const po of data.purchaseOrders ?? []) {
      const proj = po.project ?? po.projectId ?? po.proyek;
      if (po.id && proj) m[String(po.id)] = String(proj);
    }
    return m;
  }, [data.purchaseOrders]);

  const woProject = useMemo(() => {
    const m: Record<string, string> = {};
    for (const wo of data.workOrders ?? []) {
      if (wo.id && wo.project) m[String(wo.id)] = String(wo.project);
      const short = String(wo.id ?? "").replace("WO-2026-0", "WO-0").replace("WO-2026-", "WO-");
      if (wo.id && wo.project) m[short] = String(wo.project);
    }
    return m;
  }, [data.workOrders]);

  const terminProjectOf = (t: StoreItem): string => {
    if (t.project) return String(t.project);
    const prog = String(t.progress ?? "");
    const m = prog.match(/WO-2026-\d+|WO-\d+/);
    if (m && woProject[m[0]]) return woProject[m[0]];
    for (const k of Object.keys(woProject)) {
      if (prog.includes(k)) return woProject[k];
    }
    return "";
  };

  const profitPid = profitProjectId || projectsVisible[0]?.id || "";
  const profitCalc = useMemo(() => {
    if (!profitPid) return null;
    const revenue = (data.invoices ?? []).filter((i) => i.project === profitPid && i.status === "Lunas").reduce((s, i) => s + num(i.amount), 0);
    let costPayable = 0;
    let unallocPayable = 0;
    for (const a of data.payables ?? []) {
      if (a.st !== "Lunas") continue;
      const proj = poProject[String(a.po ?? "")];
      if (proj === profitPid) costPayable += num(a.amt);
      else if (!proj) unallocPayable += num(a.amt);
    }
    let costTermin = 0;
    let unallocTermin = 0;
    for (const t of data.termins ?? []) {
      if (t.status !== "Lunas") continue;
      const proj = terminProjectOf(t);
      if (proj === profitPid) costTermin += num(t.amount);
      else if (!proj) unallocTermin += num(t.amount);
    }
    let costPayroll = 0;
    let unallocPayroll = 0;
    for (const p of data.payroll ?? []) {
      if (p.status !== "Dibayar") continue;
      const net = num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions);
      const ap = String(p.allocProject ?? "");
      const pct = p.allocPct === undefined || p.allocPct === "" ? 0 : num(p.allocPct);
      if (ap === profitPid && pct > 0) costPayroll += Math.round((net * pct) / 100);
      else if (!ap) unallocPayroll += net;
    }
    const cost = costPayable + costTermin + costPayroll;
    const margin = revenue - cost;
    return { revenue, costPayable, costTermin, costPayroll, unallocPayable, unallocTermin, unallocPayroll, cost, margin, marginPct: revenue ? Math.round((margin / revenue) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profitPid, data.invoices, data.payables, data.termins, data.payroll, poProject, woProject]);

  // 6. CBS auto-collect
  const inventoryByName = useMemo(() => {
    const m: Record<string, number> = {};
    for (const inv of data.inventory ?? []) m[String(inv.name ?? "")] = num(inv.cost);
    return m;
  }, [data.inventory]);

  const cbs = useMemo(() => {
    if (!profitPid) return null;
    let material = 0;
    for (const mv of data.movements ?? []) {
      if (String(mv.by ?? "") !== profitPid) continue;
      if (String(mv.type ?? "") !== "Pengeluaran") continue;
      const cost = inventoryByName[String(mv.item ?? "")] ?? 0;
      material += num(mv.qty) * cost;
    }
    const labor = profitCalc?.costPayroll ?? 0;
    let subcon = 0;
    for (const t of data.termins ?? []) {
      if (t.status !== "Lunas") continue;
      if (terminProjectOf(t) === profitPid) subcon += num(t.amount);
    }
    let equipment = 0;
    for (const b of data.bookings ?? []) {
      if (String(b.proyek ?? b.project ?? "") !== profitPid) continue;
      if (String(b.status ?? "") !== "Selesai") continue;
      equipment += parseJamHours(b.jam) * EQUIP_RATE_PER_JAM;
    }
    const proj = projectById[profitPid];
    const ohPct = overheadPct === "" ? num(proj?.overheadPct) : num(overheadPct);
    const subtotal = material + labor + subcon + equipment;
    const overhead = Math.round((subtotal * ohPct) / 100);
    const total = subtotal + overhead;
    const budget = num(proj?.budget);
    return { material, labor, subcon, equipment, ohPct, overhead, subtotal, total, budget, vsBudget: budget - total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profitPid, data.movements, data.termins, data.bookings, inventoryByName, profitCalc, projectById, overheadPct]);

  // 7. Neraca + P&L bulanan derivasi jurnal
  const journals = useMemo(() => {
    const rows: { date: string; ref: string; desc: string; debitAkun: string; kreditAkun: string; amount: number }[] = [];
    for (const i of data.invoices ?? []) {
      if (i.status !== "Lunas") continue;
      rows.push({
        date: String(i.paidAt || i.due || ""),
        ref: String(i.id),
        desc: `Pelunasan invoice ${i.id} (${i.client ?? ""})`,
        debitAkun: "1100 Kas",
        kreditAkun: "1200 Piutang Usaha",
        amount: num(i.amount),
      });
    }
    for (const i of data.invoices ?? []) {
      if (i.status !== "Dihapusbukukan") continue;
      rows.push({
        date: String(i.writeOffAt || i.due || ""),
        ref: String(i.id),
        desc: `Hapus buku piutang ${i.id} — ${i.writeOffReason ?? ""}`,
        debitAkun: "5100 Beban Proyek",
        kreditAkun: "1200 Piutang Usaha",
        amount: num(i.amount),
      });
    }
    for (const a of data.payables ?? []) {
      if (a.st !== "Lunas") continue;
      rows.push({
        date: String(a.paidAt || a.due || ""),
        ref: String(a.id),
        desc: `Pembayaran hutang ${a.po ?? a.id} (${a.v ?? ""})`,
        debitAkun: "2100 Hutang Usaha",
        kreditAkun: "1100 Kas",
        amount: num(a.amt),
      });
    }
    for (const p of data.payroll ?? []) {
      if (p.status !== "Dibayar") continue;
      rows.push({
        date: String(p.paidAt || ""),
        ref: String(p.id),
        desc: `Gaji ${p.employeeId ?? ""} periode ${p.period ?? ""}`,
        debitAkun: "5200 Beban Gaji",
        kreditAkun: "1100 Kas",
        amount: num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions),
      });
    }
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data.invoices, data.payables, data.payroll]);
  const journalTotal = journals.reduce((s, j) => s + j.amount, 0);

  const plMonthly = useMemo(() => {
    const agg: Record<string, { revenue: number; costProj: number; salary: number; writeoff: number }> = {};
    const bump = (period: string, k: "revenue" | "costProj" | "salary" | "writeoff", v: number) => {
      if (!/^\d{4}-\d{2}$/.test(period)) return;
      agg[period] = agg[period] ?? { revenue: 0, costProj: 0, salary: 0, writeoff: 0 };
      agg[period][k] += v;
    };
    for (const i of data.invoices ?? []) {
      if (i.status === "Lunas") bump(monthOf(i.paidAt || i.due), "revenue", num(i.amount));
      if (i.status === "Dihapusbukukan") bump(monthOf(i.writeOffAt || i.due), "writeoff", num(i.amount));
    }
    for (const a of data.payables ?? []) {
      if (a.st === "Lunas") bump(monthOf(a.paidAt || a.due), "costProj", num(a.amt));
    }
    for (const p of data.payroll ?? []) {
      if (p.status === "Dibayar") bump(monthOf(p.paidAt || p.period), "salary", num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions));
    }
    return Object.keys(agg)
      .sort()
      .map((period) => ({ period, ...agg[period], laba: agg[period].revenue - agg[period].costProj - agg[period].salary - agg[period].writeoff }));
  }, [data.invoices, data.payables, data.payroll]);

  const labaLast = plMonthly.length ? plMonthly[plMonthly.length - 1].laba : LAPORAN_EXCEL.labaBersih;
  const labaPrev = plMonthly.length > 1 ? plMonthly[plMonthly.length - 2].laba : 0;
  const labaDelta = labaPrev ? Math.round(((labaLast - labaPrev) / Math.abs(labaPrev)) * 100) : 0;

  // Arus kas live dari jurnal Lunas (masuk = invoice Lunas, keluar = payable + payroll).
  // Kosong bila belum ada pelunasan — grafik menampilkan empty state, bukan kurva dummy.
  const flowMonthly = plMonthly.map((p) => ({
    month: p.period.slice(5),
    masuk: Math.round(((p.revenue || 0) / 1000000000) * 10) / 10,
    keluar: Math.round((((p.costProj || 0) + (p.salary || 0)) / 1000000000) * 10) / 10,
  }));
  const labaSpark =
    plMonthly.length > 0
      ? plMonthly.map((p) => ({ name: p.period.slice(5), v: Math.round((p.laba / 1000000000) * 10) / 10 }))
      : [{ name: "Agu", v: Math.round((LAPORAN_EXCEL.labaBersih / 1000000000) * 10) / 10 }];
  const arSpark = agingReal.map((b) => ({ name: b.name, v: Math.round((b.total / 1000000000) * 10) / 10 }));
  const apSpark = [
    { name: "Awal", v: Math.round((apAwalExcel / 1000000000) * 10) / 10 },
    { name: "Akhir", v: Math.round((apTotal / 1000000000) * 10) / 10 },
  ];
  const kasSpark = [
    { name: "Awal", v: Math.round((kasAwal / 1000000000) * 10) / 10 },
    { name: "Akhir", v: Math.round((kasAkhir / 1000000000) * 10) / 10 },
  ];

  const balance = useMemo(() => {
    const revTotal = (data.invoices ?? []).filter((i) => i.status === "Lunas").reduce((s, i) => s + num(i.amount), 0);
    const apLunasTotal = (data.payables ?? []).filter((a) => a.st === "Lunas").reduce((s, a) => s + num(a.amt), 0);
    const payPaidTotal = (data.payroll ?? []).filter((p) => p.status === "Dibayar").reduce((s, p) => s + (num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions)), 0);
    const kasNet = revTotal - apLunasTotal - payPaidTotal;
    const piutang = arTotal + retentionTotal;
    const hutang = apTotal;
    const ppnUtang = Math.max(0, taxCalc.ppnKeluar - taxCalc.ppnMasuk);
    const aset = kasNet + piutang;
    const kewajiban = hutang + ppnUtang;
    const ekuitas = aset - kewajiban;
    const laba = revTotal - apLunasTotal - payPaidTotal - writeOffTotal;
    return { revTotal, apLunasTotal, payPaidTotal, kasNet, piutang, hutang, ppnUtang, aset, kewajiban, ekuitas, laba };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.invoices, data.payables, data.payroll, arTotal, retentionTotal, apTotal, taxCalc, writeOffTotal]);

  // 4. e-Faktur rows periode aktif
  const efakturRows = useMemo(
    () =>
      invoices.filter((i) => i.status === "Lunas" && invPaidMonth(i) === activePeriod),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, activePeriod]
  );

  const setInv = (k: string, v: string) => setInvForm((f) => ({ ...f, [k]: v }));
  const setProofField = (k: string, v: string) => setProof((f) => ({ ...f, [k]: v }));
  const setLine = (idx: number, k: keyof InvLine, v: string) =>
    setInvLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));

  const saveInvoice = () => {
    const proj = projectById[invForm.project];
    if (!proj) { toast("Pilih proyek dulu", "info"); return; }
    if (!invForm.due) { toast("Jatuh tempo wajib diisi", "info"); return; }
    const validLines = invLines.filter((l) => l.desc.trim() && lineAmount(l, isTMForm) > 0);
    if (validLines.length === 0) { toast("Isi minimal satu baris dengan nominal lebih dari 0", "info"); return; }
    if (invForm.nsfp.trim() && (data.invoices ?? []).some((i) => String(i.nsfp ?? "") === invForm.nsfp.trim())) { toast("NSFP sudah dipakai invoice lain", "info"); return; }
    if (invForm.noFaktur.trim() && (data.invoices ?? []).some((i) => String(i.noFaktur ?? "") === invForm.noFaktur.trim())) { toast("No. faktur sudah dipakai invoice lain", "info"); return; }
    const total = validLines.reduce((s, l) => s + lineAmount(l, isTMForm), 0);
    const pct = invForm.billingType === "Uang Muka" || invForm.billingType === "T&M" ? 0 : num(invForm.retentionPct);
    const retentionAmt = Math.round(total * (pct / 100));
    const storedLines = validLines.map((l) => ({
      desc: l.desc.trim(),
      qty: num(l.qty),
      unit: l.unit || "pcs",
      price: num(l.price),
      rate: num(l.rate),
      hours: num(l.hours),
      amount: lineAmount(l, isTMForm),
    }));
    let invId = invPreview;
    let bump = 1;
    while ((data.invoices ?? []).some((i) => String(i.id) === invId)) {
      bump += 1;
      invId = `${invPreview}-${bump}`;
    }
    const created = add("invoices", {
      id: invId,
      client: proj.client,
      kodePembantu: invForm.kodePembantu.trim() || proj.client,
      project: proj.id,
      amount: total,
      due: invForm.due,
      status: "Draft",
      paymentTerm: invForm.milestoneRef.trim() || invForm.paymentTerm,
      billingType: invForm.billingType,
      milestoneRef: invForm.milestoneRef.trim(),
      serviceRef: invForm.serviceRef.trim(),
      lines: storedLines,
      retentionPct: pct,
      retentionAmt,
      retentionStatus: retentionAmt > 0 ? "Ditahan" : "-",
      nsfp: invForm.nsfp.trim(),
      noFaktur: invForm.noFaktur.trim(),
      dunning: "Belum Ditagih",
    }, { action: "menerbitkan invoice", module: "Keuangan" });
    if (invForm.billingType === "Uang Muka") {
      update("projects", proj.id, { hasAdvance: true });
      log("menandai uang muka proyek", proj.id, "Keuangan");
    }
    toast(`Invoice ${created.id} dibuat (Draft)`);
    setShowInv(false);
    setInvForm({ project: "", billingType: "Milestone", milestoneRef: "", serviceRef: "", retentionPct: "5", due: "", paymentTerm: "Termin 1", nsfp: "", noFaktur: "", kodePembantu: "" });
    setInvLines([emptyLine()]);
  };

  const dunningOf = (inv: StoreItem): string => String(inv.dunning ?? "Belum Ditagih");

  const advanceDunning = (inv: StoreItem) => {
    const cur = dunningOf(inv);
    const next = DUNNING_NEXT[cur] ?? "Ditagih";
    if (next === "Hapus Buku") {
      setWriteOff(inv);
      setWriteOffReason("");
      return;
    }
    update("invoices", inv.id, { dunning: next });
    log("mengupdate penagihan", `${inv.id} → ${next}`, "Keuangan");
    toast(`${inv.id} → ${next}`);
  };

  const doWriteOff = () => {
    if (!writeOff) return;
    update("invoices", writeOff.id, {
      status: "Dihapusbukukan",
      dunning: "Hapus Buku",
      writeOffReason: writeOffReason.trim(),
      writeOffAt: today,
    });
    log("menghapus-bukukan piutang", `${writeOff.id} — ${writeOffReason.trim()}`, "Keuangan");
    toast(`${writeOff.id} dihapusbukukan — masuk beban`);
    setWriteOff(null);
    setWriteOffReason("");
    setConfirmWriteOff(false);
  };

  // --- Akun: tambah / ubah / hapus (kolom sheet Akun) ---
  const saveCoa = () => {
    const kode = coaForm.kode.trim();
    if (!kode) { toast("No. akun wajib diisi", "info"); return; }
    if (!coaForm.nama.trim()) { toast("Nama akun wajib diisi", "info"); return; }
    if (coaTarget) {
      update("coa", coaTarget.id, { nama: coaForm.nama.trim(), dk: coaForm.dk, nrlr: coaForm.nrlr });
      log("mengubah akun", kode, "Keuangan");
      toast(`Akun ${kode} diubah`);
    } else {
      if (coaKode.has(kode)) { toast("No. akun sudah ada", "info"); return; }
      add("coa", { id: `COA-${kode}`, kode, nama: coaForm.nama.trim(), dk: coaForm.dk, nrlr: coaForm.nrlr }, { action: "menambah akun", module: "Keuangan" });
      toast(`Akun ${kode} ditambah`);
    }
    setShowCoa(false);
    setCoaTarget(null);
    setCoaForm({ kode: "", nama: "", dk: "D", nrlr: "NR" });
  };

  // --- Jurnal: tambah manual berimbang (kolom sheet JU) ---
  const saveJu = () => {
    if (!juForm.date) { toast("Tanggal wajib diisi", "info"); return; }
    if (!juForm.uraian.trim()) { toast("Uraian wajib diisi", "info"); return; }
    if (!juForm.db || !juForm.kr) { toast("Akun DB dan KR wajib diisi", "info"); return; }
    if (juForm.db === juForm.kr) { toast("Akun DB dan KR harus berbeda", "info"); return; }
    if (!coaKode.has(juForm.db) || !coaKode.has(juForm.kr)) { toast("Akun harus terdaftar di CoA", "info"); return; }
    if (!num(juForm.amount) || num(juForm.amount) <= 0) { toast("Nominal harus lebih dari 0", "info"); return; }
    add("journals", {
      date: juForm.date, kodePembantu: juForm.kodePembantu.trim(), dokumen: juForm.dokumen.trim() || "-",
      uraian: juForm.uraian.trim(), db: juForm.db, kr: juForm.kr, amount: num(juForm.amount),
      sumber: juForm.sumber, status: "Posted",
    }, { action: "mencatat jurnal", module: "Keuangan" });
    toast(`Jurnal ${juForm.db} → ${juForm.kr} tersimpan (Posted, berimbang)`);
    setShowJu(false);
    setJuForm({ date: todayISO(), kodePembantu: "", dokumen: "", uraian: "", db: "", kr: "", amount: "", sumber: "JU" });
  };

  // --- Kas & Bank: mutasi masuk/keluar per rekening ---
  const saveMut = () => {
    if (!mutForm.date) { toast("Tanggal wajib diisi", "info"); return; }
    if (!mutForm.rekening) { toast("Pilih rekening kas/bank", "info"); return; }
    if (!mutForm.lawan) { toast("Pilih akun lawan", "info"); return; }
    if (mutForm.lawan === mutForm.rekening) { toast("Akun lawan harus berbeda", "info"); return; }
    if (!mutForm.uraian.trim()) { toast("Uraian wajib diisi", "info"); return; }
    if (!num(mutForm.amount) || num(mutForm.amount) <= 0) { toast("Nominal harus lebih dari 0", "info"); return; }
    const db = mutForm.arah === "Masuk" ? mutForm.rekening : mutForm.lawan;
    const kr = mutForm.arah === "Masuk" ? mutForm.lawan : mutForm.rekening;
    add("journals", {
      date: mutForm.date, kodePembantu: mutForm.kodePembantu.trim(), dokumen: mutForm.dokumen.trim() || "-",
      uraian: mutForm.uraian.trim(), db, kr, amount: num(mutForm.amount), sumber: mutForm.rekening.startsWith("1-11") ? "Kas" : "Bank", status: "Posted",
    }, { action: "mencatat mutasi kas/bank", module: "Keuangan" });
    toast(`Mutasi ${mutForm.arah} ${mutForm.rekening} tersimpan`);
    setShowMut(false);
    setMutForm({ date: todayISO(), rekening: "1-111", arah: "Masuk", lawan: "", kodePembantu: "", dokumen: "", uraian: "", amount: "" });
  };

  // --- Hutang: simpan + ubah (kolom sheet Hutang) ---
  const saveAp = () => {
    if (!apForm.v.trim()) { toast("Vendor wajib diisi", "info"); return; }
    if (!num(apForm.amt) || num(apForm.amt) <= 0) { toast("Saldo akhir harus lebih dari 0", "info"); return; }
    if (!apForm.due) { toast("Jatuh tempo wajib diisi", "info"); return; }
    const created = add("payables", {
      v: apForm.v.trim(), kodePembantu: apForm.kodePembantu.trim() || apForm.v.trim(),
      po: apForm.po.trim() || "OPEN-0826", openAwal: num(apForm.openAwal), amt: num(apForm.amt),
      due: apForm.due, pph: apForm.nonPpn ? "Non-PPn" : "2%", st: "Belum Dibayar",
    }, { action: "mencatat hutang", module: "Keuangan" });
    toast(`Hutang ${created.id} dicatat`);
    setShowAp(false);
    setApForm({ v: "", kodePembantu: "", po: "", openAwal: "", amt: "", due: "", nonPpn: false });
  };

  const saveApEdit = () => {
    if (!apEdit) return;
    if (!apEditForm.v.trim()) { toast("Vendor wajib diisi", "info"); return; }
    if (!num(apEditForm.amt) || num(apEditForm.amt) <= 0) { toast("Saldo akhir harus lebih dari 0", "info"); return; }
    update("payables", apEdit.id, {
      v: apEditForm.v.trim(), kodePembantu: apEditForm.kodePembantu.trim() || apEditForm.v.trim(),
      openAwal: num(apEditForm.openAwal), amt: num(apEditForm.amt), due: apEditForm.due,
      pph: apEditForm.nonPpn ? "Non-PPn" : "2%",
    });
    log("mengubah hutang", apEdit.id, "Keuangan");
    toast(`Hutang ${apEdit.id} diubah`);
    setApEdit(null);
  };

  // --- Piutang: ubah invoice belum lunas ---
  const saveInvEdit = () => {
    if (!invEdit) return;
    if (!invEditForm.client.trim()) { toast("Customer wajib diisi", "info"); return; }
    if (!invEditForm.due) { toast("Jatuh tempo wajib diisi", "info"); return; }
    update("invoices", invEdit.id, {
      client: invEditForm.client.trim(),
      kodePembantu: invEditForm.kodePembantu.trim() || invEditForm.client.trim(),
      due: invEditForm.due, paymentTerm: invEditForm.paymentTerm,
      milestoneRef: invEditForm.milestoneRef.trim(), nsfp: invEditForm.nsfp.trim(), noFaktur: invEditForm.noFaktur.trim(),
    });
    log("mengubah invoice", invEdit.id, "Keuangan");
    toast(`Invoice ${invEdit.id} diubah`);
    setInvEdit(null);
  };

  // --- Aset: tambah harta (kolom sheet Aset), tarif fiskal GL ---
  const AST_TARIF: Record<string, number> = { BP: 5, "1": 25, "2": 12.5, "3": 6.25 };
  const saveAst = () => {
    if (!astForm.nama.trim()) { toast("Nama/jenis harta wajib diisi", "info"); return; }
    if (!num(astForm.nilai) || num(astForm.nilai) <= 0) { toast("Nilai perolehan harus lebih dari 0", "info"); return; }
    const tarif = AST_TARIF[astForm.kelompok] ?? 12.5;
    const susutTahun = Math.round((num(astForm.nilai) * tarif) / 100);
    add("assets", {
      nama: astForm.nama.trim(), kelompok: astForm.kelompok, bulan: astForm.bulan.trim() || "-",
      tahun: astForm.tahun.trim() || today.slice(0, 4), nilai: num(astForm.nilai),
      sisaAwal: num(astForm.nilai), susutTahun, metode: astForm.metode || "GL",
    }, { action: "menambah aset", module: "Keuangan" });
    toast(`Aset ${astForm.nama.trim()} ditambah (susut ${tarif}%/thn)`);
    setShowAst(false);
    setAstForm({ nama: "", kelompok: "2", bulan: "", tahun: "", nilai: "", metode: "GL" });
  };

  // --- Laba Rugi ala sheet LR: kelompok dari NL per kode akun ---
  const lrRows = useMemo(() => {
    const amtD = (kode: string): number => nlOf(kode).d;
    const amtK = (kode: string): number => nlOf(kode).k;
    const rows: { kode: string; pos: string; nilai: number }[] = [];
    for (const c of coaRows) {
      const k = String(c.kode);
      if (/^4-/.test(k) && (amtD(k) || amtK(k))) rows.push({ kode: k, pos: String(c.nama), nilai: amtK(k) - amtD(k) });
      else if (/^[567]-/.test(k) && String(c.dk) !== "-" && (amtD(k) || amtK(k)))
        rows.push({ kode: k, pos: String(c.nama), nilai: String(c.dk) === "D" ? amtD(k) - amtK(k) : amtK(k) - amtD(k) });
    }
    const sum = (re: RegExp): number => rows.filter((r) => re.test(r.kode)).reduce((s, r) => s + r.nilai, 0);
    return { rows, pend: sum(/^4-/), bebanPokok: sum(/^5-/), biayaUsaha: sum(/^6-/), lainMasuk: sum(/^7-[12]/), lainKeluar: sum(/^7-[34]/) };
  }, [coaRows]);

  const stepInvoice = (inv: StoreItem, next: string) => {    if (next === "Lunas") {
      setPayTarget(inv);
      setProof(emptyProof());
      return;
    }
    if (next === "Ditolak") {
      setRejectInv(inv);
      return;
    }
    if (next === "Disetujui" && needsDirector(inv)) {
      setDirTarget(inv);
      setDirCheck(false);
      setDirName("");
      return;
    }
    update("invoices", inv.id, { status: next });
    toast(`${inv.id} → ${next}`);
  };

  const confirmDirector = () => {
    if (!dirTarget) return;
    if (!dirCheck) { toast("Centang persetujuan Director dulu", "info"); return; }
    if (!dirName.trim()) { toast("Nama penyetuju wajib diisi", "info"); return; }
    update("invoices", dirTarget.id, {
      status: "Disetujui",
      directorApproved: true,
      directorName: dirName.trim(),
      directorAt: today,
    });
    log("menyetujui invoice via Director", `${dirTarget.id} oleh ${dirName.trim()}`, "Keuangan");
    toast(`${dirTarget.id} disetujui Director`);
    setDirTarget(null);
  };

  const confirmBuktiInv = () => {
    if (!payTarget) return;
    if (!proof.date) { toast("Tanggal bayar wajib diisi", "info"); return; }
    if (!proof.ref.trim()) { toast("No. referensi wajib diisi", "info"); return; }
    update("invoices", payTarget.id, {
      status: "Lunas", paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim(),
    });
    log("melunasi invoice", `${payTarget.id} via ${proof.method} ${proof.ref.trim()}`, "Keuangan");
    toast(`${payTarget.id} lunas — pembayaran tercatat`);
    setPayTarget(null);
  };

  const confirmBuktiAp = () => {
    if (!apTarget) return;
    if (!proof.date) { toast("Tanggal bayar wajib diisi", "info"); return; }
    if (!proof.ref.trim()) { toast("No. referensi wajib diisi", "info"); return; }
    update("payables", apTarget.id, {
      st: "Lunas", paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim(),
    });
    log("melunasi hutang", `${apTarget.po} via ${proof.method} ${proof.ref.trim()}`, "Keuangan");
    toast(`${apTarget.po} dilunasi — bukti tersimpan`);
    setApTarget(null);
  };

  const toggleSched = (key: string) =>
    setSchedSel((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const confirmBatch = () => {
    if (schedSel.length === 0) { toast("Pilih minimal satu jadwal", "info"); return; }
    if (!batchProof.date) { toast("Tanggal bayar wajib diisi", "info"); return; }
    if (!batchProof.ref.trim()) { toast("No. referensi wajib diisi", "info"); return; }
    const ordered = schedItems.filter((r) => schedSel.includes(r.key)).sort((a, b) => String(a.due).localeCompare(String(b.due)));
    for (const r of ordered) {
      if (r.kind === "AP") {
        update("payables", r.id, { st: "Lunas", paidAt: batchProof.date, paidMethod: batchProof.method, paidRef: batchProof.ref.trim() });
        log("melunasi hutang massal", `${r.ref} via ${batchProof.method} ${batchProof.ref.trim()}`, "Keuangan");
      } else {
        update("invoices", r.id, { status: "Lunas", paidAt: batchProof.date, paidMethod: batchProof.method, paidRef: batchProof.ref.trim() });
        log("melunasi invoice massal", `${r.id} via ${batchProof.method} ${batchProof.ref.trim()}`, "Keuangan");
      }
    }
    toast(`${ordered.length} item dilunasi massal (tertua dulu)`);
    setSchedSel([]);
    setShowBatch(false);
  };

  const exportJadwal = () => {
    const rows: unknown[][] = [
      ["Jenis", "ID", "Ref/Proyek", "Uraian", "Jatuh Tempo", "Umur (hari)", "Nilai (Rp)"],
      ...schedItems.map((r) => [r.kind, r.id, r.ref, r.desc, r.due, r.age, r.amount]),
    ];
    void exportExcel(rows, "Jadwal-Bayar-30hari");
    toast("Excel jadwal bayar diunduh");
  };

  const exportEfaktur = () => {
    if (!activePeriod) { toast("Pilih periode dulu", "info"); return; }
    if (efakturRows.length === 0) { toast("Tidak ada invoice Lunas pada periode aktif", "info"); return; }
    const rows = efakturRows.map((i) => [
      String(i.nsfp ?? ""),
      String(i.noFaktur ?? ""),
      String(i.paidAt || i.due || ""),
      String(i.client ?? ""),
      num(i.amount),
      Math.round((num(i.amount) * taxCalc.ppnRate) / 100),
    ]);
    downloadCsv(`EFAKTUR-${activePeriod}.csv`, ["NSFP", "NoFaktur", "Tanggal", "Client", "DPP", "PPN"], rows);
    toast(`CSV e-Faktur ${activePeriod} diunduh (${efakturRows.length} baris)`);
  };

  const saveAlloc = () => {
    if (!allocTarget) return;
    if (!allocForm.project) { toast("Pilih proyek alokasi", "info"); return; }
    const pct = num(allocForm.pct);
    if (pct <= 0 || pct > 100) { toast("Persen alokasi 1–100", "info"); return; }
    update("payroll", allocTarget.id, { allocProject: allocForm.project, allocPct: pct });
    log("mengalokasikan gaji", `${allocTarget.id} → ${allocForm.project} ${pct}%`, "Keuangan");
    toast(`Gaji ${allocTarget.id} dialokasikan ${pct}% ke ${allocForm.project}`);
    setAllocTarget(null);
  };

  const saveOverhead = () => {
    if (!profitPid) return;
    const pct = num(overheadPct);
    if (pct < 0 || pct > 100) { toast("Overhead % harus 0–100", "info"); return; }
    update("projects", profitPid, { overheadPct: pct });
    log("mengatur overhead proyek", `${profitPid} ${pct}%`, "Keuangan");
    toast(`Overhead ${profitPid} disimpan ${pct}%`);
  };

  const confirmRelease = () => {
    if (!releaseTarget) return;
    if (!releaseForm.date) { toast("Tanggal release wajib diisi", "info"); return; }
    if (!releaseForm.ba.trim()) { toast("No. berita acara wajib diisi", "info"); return; }
    update("invoices", releaseTarget.id, {
      retentionStatus: "Released",
      retentionReleaseDate: releaseForm.date,
      retentionBaNo: releaseForm.ba.trim(),
    });
    log("me-release retensi", `${releaseTarget.id} BA ${releaseForm.ba.trim()}`, "Keuangan");
    toast(`Retensi ${releaseTarget.id} di-release`);
    setReleaseTarget(null);
    setReleaseForm({ date: todayISO(), ba: "" });
  };

  const markTaxLapor = () => {
    if (!activeTax) { toast("Pilih periode dulu", "info"); return; }
    if (activeTax.status === "Lapor") { toast("Periode sudah dilapor dan dikunci", "info"); return; }
    update("taxPeriods", activeTax.id, {
      status: "Lapor",
      ppnKeluar: taxCalc.ppnKeluar,
      ppnMasuk: taxCalc.ppnMasuk,
      pph23: taxCalc.pph23,
      pph21: taxCalc.pph21,
      reportedAt: todayISO(),
    });
    log("melaporkan periode pajak", `${activeTax.period} dikunci`, "Pajak");
    toast(`Periode ${activeTax.period} dilapor dan dikunci`);
  };

  const exportSpt = () => {
    if (!activeTax) return;
    const rows: unknown[][] = [
      ["SPT Ringkas", activeTax.period, `Status: ${activeTax.status}`],
      ["Jenis", "Dasar", "Tarif", "Nilai (Rp)"],
      ["PPN Keluaran", taxCalc.invBase, `${taxCalc.ppnRate}%`, taxCalc.ppnKeluar],
      ["PPN Masukan", taxCalc.apBase, `${taxCalc.ppnRate}%`, taxCalc.ppnMasuk],
      ["PPh 23", taxCalc.apBase, `${taxCalc.pphRate}%`, taxCalc.pph23],
      ["PPh 21", "Total payroll", "-", taxCalc.pph21],
      ["PPN Terutang (Keluaran - Masukan)", "-", "-", taxCalc.ppnKeluar - taxCalc.ppnMasuk],
    ];
    void exportExcel(rows, `SPT-${activeTax.period}`);
    toast("Excel SPT ringkas diunduh");
  };

  const firstLate = invoices.find((i) => i.status === "Terlambat") ?? null;

  return (
    <div>
      <PageHeader
        title="Keuangan & Billing"
        subtitle="Piutang, hutang, invoice, retensi, pajak, dan jurnal"
        icon={<Wallet className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowInv(true)}><FileText className="h-4 w-4" /> Buat Invoice</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Piutang (AR)" value={fmtMiliar(arTotal)} delta={`${lateCount} telat`} deltaDirection="down" icon={<Wallet className="h-5 w-5" />} chip="rose" spark={arSpark} />
        <KpiCard label="Total Hutang (AP)" value={fmtMiliar(apTotal)} hint="Saldo akhir Excel Hutang" icon={<Wallet className="h-5 w-5" />} chip="navy" spark={apSpark} />
        <KpiCard
          label="Kas & Bank (Excel Agu-2026)"
          value={fmtMiliar(kasAkhir)}
          delta={`${kasDelta >= 0 ? "+" : ""}${kasDelta}% vs saldo awal`}
          deltaDirection={kasDelta >= 0 ? "up" : "down"}
          icon={<ArrowDownToLine className="h-5 w-5" />} chip="teal" spark={kasSpark}
        />
        <KpiCard
          label={plMonthly.length ? "Laba Berjalan (derivasi jurnal)" : "Laba Bersih Excel Agu-2026"}
          value={fmtMiliar(labaLast)}
          delta={`${labaDelta >= 0 ? "+" : ""}${labaDelta}% vs bulan lalu`}
          deltaDirection={labaDelta >= 0 ? "up" : "down"}
          icon={<TrendingUp className="h-5 w-5" />} chip="violet" spark={labaSpark}
        />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Akun", "Jurnal", "Kas & Bank", "Hutang (AP)", "Piutang (AR)", "Buku Besar", "Laba Rugi", "Neraca", "Aset", "Jadwal Bayar", "Invoice", "Project P&L", "Pajak"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Akun" && (
            <div className="space-y-4">
              <CardHeader
                title="Daftar Akun — Sheet Akun Excel"
                subtitle="Baris header (D/K = −) tidak bisa dihapus."
                action={<button className="btn-primary text-xs" onClick={() => { setCoaTarget(null); setCoaForm({ kode: "", nama: "", dk: "D", nrlr: "NR" }); setShowCoa(true); }}>+ Tambah Akun</button>}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">No. Akun</th><th className="th">Nama Akun</th><th className="th">D/K</th><th className="th">NR/LR</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {coaRows.map((c) => {
                      const header = String(c.dk) === "-";
                      return (
                        <tr key={String(c.id)} className={header ? "bg-surface font-semibold" : "hover:bg-surface"}>
                          <td className="td font-mono text-xs font-semibold text-navy-900">{String(c.kode)}</td>
                          <td className="td text-xs text-steel-600">{String(c.nama)}</td>
                          <td className="td text-xs text-steel-500">{String(c.dk)}</td>
                          <td className="td text-xs text-steel-500">{String(c.nrlr)}</td>
                          <td className="td">
                            <div className="flex gap-1.5">
                              <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => { setCoaTarget(c); setCoaForm({ kode: String(c.kode), nama: String(c.nama), dk: String(c.dk) === "-" ? "D" : String(c.dk), nrlr: String(c.nrlr) === "-" ? "NR" : String(c.nrlr) }); setShowCoa(true); }}>
                                Ubah
                              </button>
                              {!header && (
                                <button className="btn-secondary px-2 py-1 text-[11px] text-rose-600" onClick={() => { remove("coa", String(c.id)); log("menghapus akun", String(c.kode), "Keuangan"); toast(`Akun ${c.kode} dihapus`); }}>
                                  Hapus
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Piutang (AR)" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CardHeader title="Daftar Invoice" subtitle="Umur = hari ini − jatuh tempo." />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Invoice</th><th className="th">Kode Pembantu</th><th className="th">Proyek</th><th className="th">Saldo Awal</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">Umur</th><th className="th">Penagihan</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {invoices.map((inv) => {
                        const age = ageDays(inv.due, today);
                        const dun = dunningOf(inv);
                        const nextDun = DUNNING_NEXT[dun] ?? "Ditagih";
                        const open = inv.status !== "Lunas" && inv.status !== "Draft" && inv.status !== "Dihapusbukukan";
                        return (
                          <tr key={inv.id} className="hover:bg-surface">
                            <td className="td">
                              <p className="font-medium text-navy-900 font-mono">{inv.id}</p>
                              <p className="text-xs text-steel-500 truncate" title={String(inv.client ?? "")}>{String(inv.client ?? "")}</p>
                              <p className="text-[11px] text-steel-400">{String(inv.billingType ?? inv.paymentTerm ?? "")}{inv.milestoneRef ? ` · ${inv.milestoneRef}` : ""}</p>
                              {needsDirector(inv) && <span className="mt-1 inline-block"><Badge tone="amber">Butuh Director</Badge></span>}
                            </td>
                            <td className="td text-steel-600 font-mono text-xs truncate" title={String(inv.project)}>{inv.project}</td>
                            <td className="td text-steel-600 font-mono text-xs truncate" title={String(inv.kodePembantu ?? inv.client ?? "")}>{String(inv.kodePembantu ?? inv.client ?? "")}{inv.nonPpn ? " · Non-PPn" : ""}</td>
                            <td className="td text-steel-600 font-mono text-xs truncate" title={String(inv.project)}>{inv.project || "—"}</td>
                            <td className="td text-xs text-steel-500">{num(inv.openAwal) ? fmtRupiah(num(inv.openAwal)) : "—"}</td>
                            <td className="td font-semibold text-navy-900">{fmtRupiah(num(inv.amount))}</td>
                            <td className="td text-steel-600">{fmtTanggal(String(inv.due ?? ""))}</td>
                            <td className="td text-xs text-steel-600">{open ? `${fmtJumlah(age)} hari` : "—"}</td>
                            <td className="td">
                              {open ? (
                                <span className="flex items-center gap-1.5">
                                  <StatusBadge status={dun} />
                                  <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => advanceDunning(inv)}>
                                    → {nextDun}
                                  </button>
                                </span>
                              ) : <span className="text-xs text-steel-400">—</span>}
                            </td>
                            <td className="td"><StatusBadge status={String(inv.status)} /></td>
                            <td className="td">
                              <div className="flex flex-wrap gap-1.5">
                                {invNext(String(inv.status)).map((next) => (
                                  <button
                                    key={next}
                                    className={next === "Lunas" ? "btn-primary text-xs" : next === "Ditolak" ? "btn-secondary text-xs text-rose-600" : "btn-secondary text-xs"}
                                    onClick={() => stepInvoice(inv, next)}
                                  >
                                    {next === "Lunas" ? "Tandai Lunas" : next}
                                  </button>
                                ))}
                                {String(inv.status) !== "Lunas" && String(inv.status) !== "Dihapusbukukan" && (
                                  <button
                                    className="btn-secondary text-xs"
                                    onClick={() => {
                                      setInvEdit(inv);
                                      setInvEditForm({
                                        client: String(inv.client ?? ""), kodePembantu: String(inv.kodePembantu ?? inv.client ?? ""),
                                        due: String(inv.due ?? ""), paymentTerm: String(inv.paymentTerm ?? ""),
                                        milestoneRef: String(inv.milestoneRef ?? ""), nsfp: String(inv.nsfp ?? ""), noFaktur: String(inv.noFaktur ?? ""),
                                      });
                                    }}
                                  >
                                    Ubah
                                  </button>
                                )}
                                {invNext(String(inv.status)).length === 0 && (String(inv.status) === "Lunas" || String(inv.status) === "Dihapusbukukan") && <span className="text-xs text-steel-400">—</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {invoices.length === 0 && <EmptyState title="Belum ada invoice" subtitle="Buat invoice pertama untuk cabang ini." />}
                <Card className="mt-4 p-4">
                  <CardHeader title="Aging Real per Bucket" subtitle="Dihitung dari jatuh tempo vs hari ini. Hanya invoice non-Lunas/Draft/Dihapusbukukan." />
                  <div className="overflow-x-auto px-5 pb-5">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr><th className="th">Bucket</th><th className="th">Jumlah</th><th className="th">Total</th></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {agingReal.map((b) => (
                          <tr key={b.name} className="hover:bg-surface">
                            <td className="td font-medium text-navy-900">{b.name}</td>
                            <td className="td text-steel-600">{fmtJumlah(b.count)} invoice</td>
                            <td className="td font-semibold">{fmtRupiah(b.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
              <div className="space-y-5">
                <div>
                  <CardHeader title="Aging Piutang" subtitle="Real dari jatuh tempo vs hari ini, milyar Rupiah" />
                  <div className="flex items-center gap-4 p-1">
                    <Donut
                      data={agingDonut}
                      colors={agingDonut.map((a) => a.color)}
                      size={140}
                      thickness={18}
                      centerValue={String(Math.round(agingDonutTotal * 10) / 10)}
                      centerLabel="M"
                    />
                    <div className="flex-1 space-y-2">
                      {agingReal.map((b, i) => (
                        <div key={b.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: AR_DONUT_COLORS[i % AR_DONUT_COLORS.length] }} />
                          <span className="text-steel-600">{b.name} ({fmtJumlah(b.count)})</span>
                          <span className="ml-auto font-semibold text-navy-900">{fmtMiliar(b.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <Card className="p-4">
                  <CardHeader title="Retensi Ditahan" subtitle="5% default tiap termin, release per invoice" />
                  <p className="px-5 pb-2 text-2xl font-bold text-navy-900">{fmtRupiah(retentionTotal)}</p>
                  <div className="space-y-2 px-5 pb-5">
                    {invoices.filter((i) => num(i.retentionAmt) > 0).slice(0, 5).map((i) => (
                      <div key={i.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-navy-900">{i.id}</span>
                        <span className="text-steel-500">{fmtRupiah(num(i.retentionAmt))}</span>
                        <span className="ml-auto"><StatusBadge status={String(i.retentionStatus ?? "Ditahan")} /></span>
                        {i.retentionStatus !== "Released" && (
                          <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => { setReleaseTarget(i); setReleaseForm({ date: todayISO(), ba: "" }); }}>
                            Release
                          </button>
                        )}
                      </div>
                    ))}
                    {invoices.filter((i) => num(i.retentionAmt) > 0).length === 0 && (
                      <p className="text-xs text-steel-400">Belum ada retensi ditahan.</p>
                    )}
                  </div>
                </Card>
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Receipt className="h-3.5 w-3.5" /> {lateCount} invoice terlambat ·
                  <button className="font-semibold underline" onClick={() => { if (firstLate) { setPayTarget(firstLate); setProof(emptyProof()); } }}>
                    tandai lunas
                  </button>
                </p>
              </div>
            </div>
          )}

          {tab === "Hutang (AP)" && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowAp(true)}>+ Catat Hutang</button>
              </div>
              <p className="text-xs text-steel-500">Tanda kuning di Excel = vendor Non-PPn.</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Vendor</th><th className="th">Kode Pembantu</th><th className="th">PO</th><th className="th">Saldo Awal</th><th className="th">Saldo Akhir</th><th className="th">Jatuh Tempo</th><th className="th">PPh 23</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {payables.map((a) => (
                      <tr key={a.id} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900 truncate" title={String(a.v)}>{String(a.v)}</td>
                        <td className="td font-mono text-xs text-steel-600 truncate" title={String(a.kodePembantu ?? a.v)}>{String(a.kodePembantu ?? a.v)}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(a.po)}</td>
                        <td className="td text-xs text-steel-500">{num(a.openAwal) ? fmtRupiah(num(a.openAwal)) : "—"}</td>
                        <td className="td font-semibold">{fmtRupiah(num(a.amt))}</td>
                        <td className="td text-steel-600">{fmtTanggal(String(a.due ?? ""))}</td>
                        <td className="td text-steel-600">{String(a.pph ?? "2%")}</td>
                        <td className="td"><StatusBadge status={String(a.st)} /></td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {a.st !== "Lunas" && (
                              <>
                                <button className="btn-secondary text-xs" onClick={() => { setApTarget(a); setProof(emptyProof()); }}>
                                  Bayar
                                </button>
                                <button className="btn-secondary text-xs" onClick={() => {
                                  setApEdit(a);
                                  setApEditForm({
                                    v: String(a.v ?? ""), kodePembantu: String(a.kodePembantu ?? a.v ?? ""),
                                    openAwal: String(a.openAwal ?? ""), amt: String(a.amt ?? ""),
                                    due: String(a.due ?? ""), nonPpn: String(a.pph ?? "") === "Non-PPn",
                                  });
                                }}>
                                  Ubah
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Card>
                <CardHeader title="Arus Kas Bulanan" subtitle="Live dari pelunasan (milyar Rupiah) — kosong hingga ada invoice/hutang dilunasi" />
                {flowMonthly.length === 0 ? (
                  <div className="p-4"><EmptyState title="Belum ada arus kas" subtitle="Lunasi invoice atau hutang agar arus kas terbentuk dari data nyata." /></div>
                ) : (
                <div className="h-56 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={flowMonthly} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="masuk" name="Masuk" stroke="#0d9488" strokeWidth={2.5} fill="url(#cp)" />
                      <Area type="monotone" dataKey="keluar" name="Keluar" stroke="#e11d48" strokeWidth={2} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                )}
              </Card>
            </div>
          )}

          {tab === "Kas & Bank" && (
            <div className="space-y-4">
              <CardHeader
                title="Kas & Bank — Pembanding Excel Agustus 2026"
                subtitle="Saldo awal + mutasi + saldo akhir per rekening (sheet JU,Kas,Bank + BB). No. dokumen 101/201/301/401, kode pembantu vendor/customer."
                action={<button className="btn-primary text-xs" onClick={() => setShowMut(true)}>+ Catat Mutasi</button>}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Kode</th><th className="th">Rekening</th><th className="th">Saldo Awal</th><th className="th">Mutasi Masuk</th><th className="th">Mutasi Keluar</th><th className="th">Saldo Berjalan</th><th className="th">Saldo Akhir Excel</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {KASBANK_EXCEL.map((r) => {
                      let masuk = 0;
                      let keluar = 0;
                      for (const j of manJournals) {
                        if (j.status === "Void") continue;
                        if (j.sumber !== "Kas" && j.sumber !== "Bank") continue;
                        if (String(j.db) === r.kode) masuk += num(j.amount);
                        if (String(j.kr) === r.kode) keluar += num(j.amount);
                      }
                      return (
                      <tr key={r.kode} className="hover:bg-surface">
                        <td className="td font-mono text-xs font-semibold text-navy-900">{r.kode}</td>
                        <td className="td text-xs text-steel-600">{r.nama}</td>
                        <td className="td text-xs">{fmtRupiah(r.awal)}</td>
                        <td className="td text-xs text-emerald-600">{masuk ? fmtRupiah(masuk) : "—"}</td>
                        <td className="td text-xs text-rose-600">{keluar ? fmtRupiah(keluar) : "—"}</td>
                        <td className="td text-xs font-semibold">{fmtRupiah((kasSaldo[r.kode] ?? r.awal))}</td>
                        <td className="td text-xs text-steel-500">{fmtRupiah(r.akhir)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Card className="p-4">
                <CardHeader title="Jurnal Penyesuaian Agustus (template berimbang)" subtitle="PPN + penyusutan dari sheet JU — dipakai sebagai template posting ulang." />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Tanggal</th><th className="th">Uraian</th><th className="th">Akun DB</th><th className="th">Debit</th><th className="th">Akun KR</th><th className="th">Kredit</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {JU_PENYESUAIAN_EXCEL.map((j, i) => (
                        <tr key={i} className="hover:bg-surface">
                          <td className="td font-mono text-xs text-steel-600">{j.tgl}</td>
                          <td className="td text-xs text-steel-600">{j.uraian}</td>
                          <td className="td font-mono text-xs">{j.db || "—"}</td>
                          <td className="td text-xs">{j.dbAmt ? fmtRupiah(j.dbAmt) : "—"}</td>
                          <td className="td font-mono text-xs">{j.kr}</td>
                          <td className="td text-xs">{fmtRupiah(j.krAmt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === "Jadwal Bayar" && (
            <div className="space-y-4">
              <CardHeader
                title="Jadwal Bayar 30 Hari"
                subtitle="Payable + invoice jatuh tempo ≤30 hari (termasuk yang sudah lewat), urut jatuh tempo tertua dulu."
                action={
                  <div className="flex gap-2">
                    <button className="btn-secondary text-xs" onClick={exportJadwal}>Export Excel</button>
                    <button className="btn-primary text-xs" disabled={schedSel.length === 0} onClick={() => { setBatchProof(emptyProof()); setShowBatch(true); }}>
                      Bayar Massal ({fmtJumlah(schedSel.length)}) · {fmtRupiah(schedTotal)}
                    </button>
                  </div>
                }
              />
              {schedItems.length === 0 ? (
                <EmptyState title="Tidak ada jadwal jatuh tempo" subtitle="Tidak ada payable/invoice jatuh tempo dalam 30 hari ke depan." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <th className="th"><input type="checkbox" aria-label="Pilih semua" checked={schedSel.length === schedItems.length} onChange={() => setSchedSel((prev) => (prev.length === schedItems.length ? [] : schedItems.map((r) => r.key)))} /></th>
                        <th className="th">Jenis</th><th className="th">ID</th><th className="th">Ref/Proyek</th><th className="th">Uraian</th><th className="th">Jatuh Tempo</th><th className="th">Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {schedItems.map((r) => (
                        <tr key={r.key} className="hover:bg-surface">
                          <td className="td"><input type="checkbox" aria-label={`Pilih ${r.id}`} checked={schedSel.includes(r.key)} onChange={() => toggleSched(r.key)} /></td>
                          <td className="td"><Badge tone={r.kind === "AP" ? "navy" : "amber"}>{r.kind}</Badge></td>
                          <td className="td font-mono text-xs font-semibold text-navy-900">{r.id}</td>
                          <td className="td font-mono text-xs text-steel-600">{r.ref}</td>
                          <td className="td text-xs text-steel-600 truncate" title={r.desc}>{r.desc}</td>
                          <td className="td text-xs text-steel-600">{fmtTanggal(r.due)}{r.age > 0 ? ` (${fmtJumlah(r.age)} hari lewat)` : ""}</td>
                          <td className="td text-xs font-semibold">{fmtRupiah(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "Invoice" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="p-5 lg:col-span-2">
                  <CardHeader title="Pergerakan Invoice" subtitle="Live dari penerbitan per bulan (milyar Rupiah)" />
                  {flowMonthly.length === 0 ? (
                    <div className="flex h-56 items-center justify-center"><EmptyState title="Belum ada pergerakan" subtitle="Invoice saldo awal belum lunas — grafik terbentuk dari pelunasan nyata." /></div>
                  ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={flowMonthly} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                        <Area type="monotone" dataKey="masuk" name="Diterbitkan" stroke="#0b3a63" strokeWidth={2.5} fill="#8cc9e8" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  )}
                </Card>
                <Card className="p-5">
                  <CardHeader title="Dokumen Invoice" />
                  <p className="text-sm text-steel-600">
                    Invoice mendukung lines, tipe Milestone / Progres / Uang Muka / Retensi / T&amp;M, referensi milestone, dan referensi service/WO untuk T&amp;M.
                  </p>
                  <p className="mt-2 text-xs text-steel-500">Nomor otomatis per tipe, mis. {invPreview} untuk {invForm.billingType}. NSFP dan No. Faktur opsional tetapi unik bila diisi.</p>
                  <button className="btn-primary mt-4 w-full justify-center" onClick={() => setShowInv(true)}>Buat Invoice</button>
                </Card>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Invoice</th><th className="th">Tipe</th><th className="th">Lines</th><th className="th">Retensi</th><th className="th">e-Faktur</th><th className="th">Nilai</th><th className="th">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-surface">
                        <td className="td font-mono text-xs font-semibold text-navy-900">{inv.id}<span className="block font-sans text-[11px] font-normal text-steel-500">{fmtTanggal(String(inv.due ?? ""))}</span></td>
                        <td className="td text-xs text-steel-600">{String(inv.billingType ?? inv.paymentTerm ?? "-")}{inv.serviceRef ? ` · ${inv.serviceRef}` : ""}</td>
                        <td className="td text-xs text-steel-600">{Array.isArray(inv.lines) ? inv.lines.length : 1} baris</td>
                        <td className="td text-xs">
                          {num(inv.retentionAmt) > 0 ? (
                            <span className="flex items-center gap-2">
                              {fmtRupiah(num(inv.retentionAmt))} <StatusBadge status={String(inv.retentionStatus ?? "Ditahan")} />
                            </span>
                          ) : <span className="text-steel-400">—</span>}
                        </td>
                        <td className="td font-mono text-[11px] text-steel-600">{inv.nsfp || inv.noFaktur ? `${inv.nsfp || "-"} / ${inv.noFaktur || "-"}` : "—"}</td>
                        <td className="td font-semibold">{fmtRupiah(num(inv.amount))}</td>
                        <td className="td"><StatusBadge status={String(inv.status)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Buku Besar" && (
            <div className="space-y-4">
              <CardHeader
                title="Buku Besar & Neraca Lajur — Pembanding Excel"
                subtitle={`Neraca Saldo seimbang Rp ${LAPORAN_EXCEL.nlSeimbang.toLocaleString("id-ID")} (sheet NL). Laba-Rugi D/K selisih = laba berjalan.`}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="p-4"><p className="text-xs text-steel-500">Total Pendapatan (Excel)</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.totalPendapatan)}</p><p className="mt-1 text-[11px] text-steel-400">4-101 Repair & Docking</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Total Beban Pokok (Excel)</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.totalBebanPokok)}</p><p className="mt-1 text-[11px] text-steel-400">5-101 + 5-200 + 5-500 + 5-600</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Laba Bersih (Excel)</p><p className="mt-1 text-lg font-bold text-emerald-600">{fmtRupiah(LAPORAN_EXCEL.labaBersih)}</p><p className="mt-1 text-[11px] text-steel-400">Selisih NL Laba-Rugi</p></Card>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th" rowSpan={2}>Kode</th><th className="th" rowSpan={2}>Nama Akun</th><th className="th" rowSpan={2}>D/K</th><th className="th" colSpan={2}>Neraca Saldo</th><th className="th" colSpan={2}>Laba-Rugi</th><th className="th" colSpan={2}>Neraca</th></tr>
                    <tr><th className="th">Debit</th><th className="th">Kredit</th><th className="th">Debit</th><th className="th">Kredit</th><th className="th">Debit</th><th className="th">Kredit</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {coaRows.filter((c) => String(c.dk) !== "-").map((c) => {
                      const kode = String(c.kode);
                      const isLR = String(c.nrlr) === "LR";
                      const d = nlOf(kode).d;
                      const k = nlOf(kode).k;
                      return (
                      <tr key={kode} className="hover:bg-surface">
                        <td className="td font-mono text-xs font-semibold text-navy-900">{kode}</td>
                        <td className="td text-xs text-steel-600">{String(c.nama)}</td>
                        <td className="td text-xs text-steel-500">{String(c.dk)}</td>
                        <td className="td text-xs">{d ? fmtRupiah(d) : "—"}</td>
                        <td className="td text-xs">{k ? fmtRupiah(k) : "—"}</td>
                        <td className="td text-xs">{isLR && d ? fmtRupiah(d) : "—"}</td>
                        <td className="td text-xs">{isLR && k ? fmtRupiah(k) : "—"}</td>
                        <td className="td text-xs">{!isLR && d ? fmtRupiah(d) : "—"}</td>
                        <td className="td text-xs">{!isLR && k ? fmtRupiah(k) : "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-steel-500">Sumber jurnal BB: Kas / Bank (BPD) / JPb / JPn / JM. Saldo akhir BB = pembanding kolom Debit/Kredit di atas.</p>
            </div>
          )}

          {tab === "Laba Rugi" && (
            <div className="space-y-4">
              <CardHeader
                title="Laporan Laba-Rugi — Sheet LR Excel"
                subtitle="POS-POS per akun dari Neraca Saldo. Laba = Pendapatan − Beban Pokok − Biaya Usaha + Lain Masuk − Lain Keluar."
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-steel-500">Total Pendapatan</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrRows.pend)}</p><p className="mt-1 text-[11px] text-steel-400">Akun 4-xxx</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Beban Pokok Pendapatan</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrRows.bebanPokok)}</p><p className="mt-1 text-[11px] text-steel-400">Akun 5-xxx</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Biaya Usaha</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrRows.biayaUsaha)}</p><p className="mt-1 text-[11px] text-steel-400">Akun 6-xxx</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Laba Bersih</p><p className="mt-1 text-lg font-bold text-emerald-600">{fmtRupiah(lrRows.pend - lrRows.bebanPokok - lrRows.biayaUsaha + lrRows.lainMasuk - lrRows.lainKeluar)}</p><p className="mt-1 text-[11px] text-steel-400">Lain-lain neto {fmtRupiah(lrRows.lainMasuk - lrRows.lainKeluar)}</p></Card>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">No. Akun</th><th className="th">Pos-Pos</th><th className="th">Nilai</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {lrRows.rows.map((r) => (
                      <tr key={r.kode} className="hover:bg-surface">
                        <td className="td font-mono text-xs font-semibold text-navy-900">{r.kode}</td>
                        <td className="td text-xs text-steel-600">{r.pos}</td>
                        <td className="td text-xs font-semibold">{fmtRupiah(r.nilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Project P&L" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Proyek analisis">
                  <select className="input" value={profitPid} onChange={(e) => { setProfitProjectId(e.target.value); const p = projectById[e.target.value]; setOverheadPct(String(p?.overheadPct ?? 5)); }}>
                    {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
                  </select>
                </Field>
                <p className="pb-2 text-xs text-steel-500">Pendapatan dari invoice Lunas. Payable dipetakan via PO ke proyek, termin Lunas via WO, gaji via alokasi manual. Sisanya masuk Tak teralokasi.</p>
              </div>
              {profitCalc && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label={`Pendapatan ${profitPid}`} value={fmtMiliar(profitCalc.revenue)} hint="Invoice Lunas proyek" chip="teal" />
                  <KpiCard label={`Biaya ${profitPid}`} value={fmtMiliar(profitCalc.cost)} hint={`Payable ${fmtMiliar(profitCalc.costPayable)} · Termin ${fmtMiliar(profitCalc.costTermin)} · Gaji ${fmtMiliar(profitCalc.costPayroll)}`} chip="navy" />
                  <KpiCard label={`Margin ${profitPid}`} value={fmtMiliar(profitCalc.margin)} delta={`${profitCalc.marginPct}% margin`} deltaDirection={profitCalc.margin >= 0 ? "up" : "down"} chip="violet" />
                  <KpiCard label="Tak Teralokasi" value={fmtMiliar(profitCalc.unallocPayable + profitCalc.unallocTermin + profitCalc.unallocPayroll)} hint={`Payable ${fmtMiliar(profitCalc.unallocPayable)} · Termin ${fmtMiliar(profitCalc.unallocTermin)} · Gaji ${fmtMiliar(profitCalc.unallocPayroll)}`} chip="amber" />
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {projectsVisible.slice(0, 6).map((p) => {
                  const rev = (data.invoices ?? []).filter((i) => i.project === p.id).reduce((s, i) => s + num(i.amount), 0);
                  const margin = rev - num(p.actual);
                  return (
                    <Card key={p.id} className="card-hover p-4">
                      <p className="text-xs text-steel-500 font-mono truncate" title={`${p.id} · ${p.vessel}`}>{p.id} · {p.vessel}{p.hasAdvance ? " · Uang muka" : ""}</p>
                      <p className="mt-1 text-sm font-semibold text-navy-900">Margin {fmtMiliar(margin)}</p>
                      <div className="mt-2 text-xs text-steel-500">
                        <p>Tertagih {fmtMiliar(rev)} · Cost {fmtMiliar(num(p.actual))}</p>
                        <p className={`mt-1 font-medium ${margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          Margin {rev ? Math.round((margin / rev) * 100) : 0}%
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <CardHeader title="Alokasi Gaji per Proyek" subtitle="Payroll Dibayar tanpa alokasi tampil sebagai Tak teralokasi. Klik Alokasi untuk menetapkan proyek + %." />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Payroll</th><th className="th">Karyawan</th><th className="th">Periode</th><th className="th">Net</th><th className="th">Alokasi</th><th className="th">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {(data.payroll ?? []).filter((p) => p.status === "Dibayar").slice(0, 20).map((p) => (
                        <tr key={p.id} className="hover:bg-surface">
                          <td className="td font-mono text-xs font-semibold text-navy-900">{p.id}</td>
                          <td className="td font-mono text-xs text-steel-600">{String(p.employeeId ?? "")}</td>
                          <td className="td text-xs text-steel-600">{String(p.period ?? "")}</td>
                          <td className="td text-xs font-semibold">{fmtRupiah(num(p.net) || num(p.basic) + num(p.allowances) + num(p.overtimePay) - num(p.deductions))}</td>
                          <td className="td text-xs text-steel-600">{p.allocProject ? `${p.allocProject} · ${p.allocPct}%` : "Tak teralokasi"}</td>
                          <td className="td"><button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => { setAllocTarget(p); setAllocForm({ project: String(p.allocProject ?? profitPid), pct: String(p.allocPct ?? 100) }); }}>Alokasi</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              {cbs && (
                <Card>
                  <CardHeader
                    title={`CBS ${profitPid} — Auto Collect`}
                    subtitle="Material dari movement Pengeluaran proyek × harga inventori. Labor dari alokasi gaji. Subcon dari termin Lunas. Equipment dari booking Selesai × Rp 1,5 jt/jam. Overhead % manual per proyek."
                    action={
                      <div className="flex items-end gap-2">
                        <Field label="Overhead %">
                          <input type="number" min={0} max={100} className="input w-24" value={overheadPct} onChange={(e) => setOverheadPct(e.target.value)} />
                        </Field>
                        <button className="btn-secondary text-xs" onClick={saveOverhead}>Simpan</button>
                      </div>
                    }
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr><th className="th">Elemen</th><th className="th">Nilai</th><th className="th">Catatan</th></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">Material</td><td className="td font-semibold">{fmtRupiah(cbs.material)}</td><td className="td text-xs text-steel-500">Movement Pengeluaran proyek</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">Labor</td><td className="td font-semibold">{fmtRupiah(cbs.labor)}</td><td className="td text-xs text-steel-500">Payroll alokasi proyek</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">Subcon</td><td className="td font-semibold">{fmtRupiah(cbs.subcon)}</td><td className="td text-xs text-steel-500">Termin Lunas proyek</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">Equipment</td><td className="td font-semibold">{fmtRupiah(cbs.equipment)}</td><td className="td text-xs text-steel-500">Booking Selesai × tarif alat</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">Overhead ({fmtJumlah(cbs.ohPct)}%)</td><td className="td font-semibold">{fmtRupiah(cbs.overhead)}</td><td className="td text-xs text-steel-500">Manual per proyek</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-bold text-navy-900">Total biaya</td><td className="td font-bold text-navy-900">{fmtRupiah(cbs.total)}</td><td className="td text-xs text-steel-500">vs budget {fmtRupiah(cbs.budget)} · selisih {fmtRupiah(cbs.vsBudget)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 pb-5">
                    <ProgressBar value={cbs.budget ? Math.round((cbs.total / cbs.budget) * 100) : 0} tone={cbs.budget && cbs.total > cbs.budget ? "red" : "navy"} showLabel />
                  </div>
                </Card>
              )}
              <Card>
                <CardHeader title="P&L Bulanan (derivasi jurnal)" subtitle="Pendapatan dari invoice Lunas, beban proyek dari payable Lunas, beban gaji dari payroll Dibayar, hapus buku dari piutang Dihapusbukukan." />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Periode</th><th className="th">Pendapatan</th><th className="th">Beban Proyek</th><th className="th">Beban Gaji</th><th className="th">Hapus Buku</th><th className="th">Laba</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {plMonthly.map((p) => (
                        <tr key={p.period} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{p.period}</td>
                          <td className="td">{fmtMiliar(p.revenue)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.costProj)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.salary)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.writeoff)}</td>
                          <td className="td font-semibold text-emerald-600">{fmtMiliar(p.laba)}</td>
                        </tr>
                      ))}
                      {plMonthly.length === 0 && (
                        <tr><td className="td text-xs text-steel-400" colSpan={6}>Belum ada jurnal Lunas pada periode berjalan.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === "Neraca" && (
            <div className="space-y-4">
              <CardHeader title="Neraca + Laba Ditahan — Pembanding Excel Agustus 2026" subtitle={`Total neraca Rp ${LAPORAN_EXCEL.neracaTotal.toLocaleString("id-ID")} (Aktiva = Kewajiban + Ekuitas).`} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-steel-500">Aktiva Lancar</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.aktivaLancar)}</p><p className="mt-1 text-[11px] text-steel-400">Dominan Piutang Direksi + Antar Perusahaan + Usaha</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Nilai Buku Aktiva Tetap</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.bukuAktivaTetap)}</p><p className="mt-1 text-[11px] text-steel-400">Perolehan 15,57T − Akum 9,65T</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Laba Ditahan Awal</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAwal)}</p><p className="mt-1 text-[11px] text-steel-400">Sheet Laba Ditahan</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">Laba Ditahan Akhir</p><p className="mt-1 text-lg font-bold text-emerald-600">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAkhir)}</p><p className="mt-1 text-[11px] text-steel-400">Awal + berjalan {fmtRupiah(LAPORAN_EXCEL.labaBerjalan)}</p></Card>
              </div>
              <Card className="p-4">
                <CardHeader title="Laba Ditahan — Sheet Laba Ditahan Excel" subtitle="Jumlah Laba Ditahan = Laba Ditahan awal + Laba (Rugi) periode berjalan." />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">No. Akun</th><th className="th">Pos-Pos</th><th className="th">Nilai</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      <tr className="hover:bg-surface"><td className="td font-mono text-xs font-semibold text-navy-900">3-200</td><td className="td text-xs text-steel-600">Laba Ditahan</td><td className="td text-xs font-semibold">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAwal)}</td></tr>
                      <tr className="hover:bg-surface"><td className="td font-mono text-xs text-steel-400">—</td><td className="td text-xs text-steel-600">Laba (Rugi) Periode Berjalan</td><td className="td text-xs font-semibold">{fmtRupiah(labaLast)}</td></tr>
                      <tr className="hover:bg-surface"><td className="td font-mono text-xs text-steel-400">—</td><td className="td text-xs font-bold text-navy-900">Jumlah Laba Ditahan</td><td className="td text-xs font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAwal + labaLast)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <CardHeader title="Subledger Hutang Excel (53 vendor)" subtitle="Kuning = vendor Non-PPn. Saldo akhir = opening AP." />
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10"><tr><th className="th">Vendor</th><th className="th">Awal</th><th className="th">Akhir</th><th className="th">PPn</th></tr></thead>
                      <tbody className="divide-y divide-steel-100">
                        {HUTANG_EXCEL.map((h) => (
                          <tr key={h.v} className="hover:bg-surface">
                            <td className="td text-xs font-medium text-navy-900">{h.v}</td>
                            <td className="td text-xs text-steel-600">{h.awal ? fmtRupiah(h.awal) : "—"}</td>
                            <td className="td text-xs font-semibold">{h.akhir ? fmtRupiah(h.akhir) : "—"}</td>
                            <td className="td text-xs">{h.nonPpn ? <Badge tone="amber">Non-PPn</Badge> : <span className="text-steel-400">PPn</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card className="p-4">
                  <CardHeader title="Subledger Piutang Excel (63 customer)" subtitle="Kuning = Non-PPn / perorangan. Saldo akhir = opening AR." />
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10"><tr><th className="th">Customer</th><th className="th">Awal</th><th className="th">Akhir</th><th className="th">PPn</th></tr></thead>
                      <tbody className="divide-y divide-steel-100">
                        {PIUTANG_EXCEL.map((p) => (
                          <tr key={p.c} className="hover:bg-surface">
                            <td className="td text-xs font-medium text-navy-900">{p.c}</td>
                            <td className="td text-xs text-steel-600">{p.awal ? fmtRupiah(p.awal) : "—"}</td>
                            <td className="td text-xs font-semibold">{p.akhir ? fmtRupiah(p.akhir) : "—"}</td>
                            <td className="td text-xs">{p.nonPpn ? <Badge tone="amber">Non-PPn</Badge> : <span className="text-steel-400">PPn</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === "Pajak" && (
            <div className="space-y-4">
              <CardHeader
                title="Ringkasan Pajak per Periode"
                subtitle={`PPN Keluaran ${taxCalc.ppnRate}% dari invoice Lunas periode (paidAt/due), PPN Masukan ${taxCalc.ppnRate}% dari payable Lunas, PPh23 ${taxCalc.pphRate}% dari payable Lunas jasa, PPh21 total payroll periode.`}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Periode">
                  <select className="input" value={activeTaxId} onChange={(e) => setTaxId(e.target.value)}>
                    {taxPeriods.map((t) => <option key={t.id} value={t.id}>{t.period} · {t.status}</option>)}
                  </select>
                </Field>
                <Field label="Periode baru (YYYY-MM)">
                  <input className="input font-mono" placeholder="2026-09" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} />
                </Field>
                <button
                  className="btn-secondary text-xs"
                  onClick={() => {
                    if (!/^\d{4}-\d{2}$/.test(newPeriod.trim())) { toast("Format periode YYYY-MM", "info"); return; }
                    if (taxPeriods.some((t) => t.period === newPeriod.trim())) { toast("Periode sudah ada", "info"); return; }
                    const created = add("taxPeriods", { period: newPeriod.trim(), ppnKeluar: 0, ppnMasuk: 0, pph23: 0, pph21: 0, status: "Draft" }, { action: "membuat periode pajak", module: "Pajak" });
                    setTaxId(created.id);
                    setNewPeriod("");
                    toast(`Periode ${created.period} dibuat`);
                  }}
                >
                  Periode Baru
                </button>
                <div className="ml-auto flex gap-2">
                  <button className="btn-secondary text-xs" onClick={exportEfaktur}>Export CSV e-Faktur</button>
                  <button className="btn-secondary text-xs" onClick={exportSpt}>Export Excel SPT</button>
                  <button className="btn-primary text-xs" disabled={taxLocked} onClick={markTaxLapor}>
                    {taxLocked ? "Sudah Lapor (Terkunci)" : "Tandai Lapor"}
                  </button>
                </div>
              </div>
              {!activeTax ? (
                <EmptyState title="Belum ada periode pajak" subtitle="Buat periode baru untuk mulai." />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "PPN Keluaran", value: fmtRupiah(taxShown.ppnKeluar), hint: `${taxCalc.ppnRate}% dari ${fmtRupiah(taxCalc.invBase)}` },
                    { label: "PPN Masukan", value: fmtRupiah(taxShown.ppnMasuk), hint: `${taxCalc.ppnRate}% dari ${fmtRupiah(taxCalc.apBase)}` },
                    { label: "PPh 23", value: fmtRupiah(taxShown.pph23), hint: `${taxCalc.pphRate}% dari payable Lunas` },
                    { label: "PPh 21", value: fmtRupiah(taxShown.pph21), hint: `Payroll ${activePeriod}` },
                  ].map((k) => (
                    <Card key={k.label} className="p-4">
                      <p className="text-xs text-steel-500">{k.label}</p>
                      <p className="mt-1 text-lg font-bold text-navy-900">{k.value}</p>
                      <p className="mt-1 text-[11px] text-steel-400">{k.hint}</p>
                    </Card>
                  ))}
                </div>
              )}
              <Card className="p-4">
                <p className="text-sm text-steel-600">
                  PPN terutang periode {activePeriod || "—"}: <strong className="text-navy-900">{fmtRupiah(taxShown.ppnKeluar - taxShown.ppnMasuk)}</strong>
                  {taxLocked ? " · Angka dikunci dari snapshot saat pelaporan." : " · Angka live dari data Lunas."}
                  {" "}Dilapor per {fmtTanggal(activeTax?.reportedAt)}.
                </p>
                <p className="mt-1 text-xs text-steel-500">e-Faktur periode {activePeriod || "—"}: {fmtJumlah(efakturRows.length)} invoice Lunas (kolom NSFP, NoFaktur, Tanggal, Client, DPP, PPN).</p>
              </Card>
            </div>
          )}

          {tab === "Aset" && (
            <div className="space-y-4">
              <CardHeader
                title="Aset Tetap — Sheet Aset Excel"
                subtitle="Beban bulanan: 6-021→1-280, 6-021A→1-281, 6-021B→1-282, 6-021C→1-270, 6-022→1-290."
                action={<button className="btn-primary text-xs" onClick={() => setShowAst(true)}>+ Tambah Aset</button>}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">No.</th><th className="th">Nama / Jenis Harta</th><th className="th">Kel.</th><th className="th">Bulan</th><th className="th">Tahun</th><th className="th">Nilai Perolehan</th><th className="th">Metode</th><th className="th">Susut / Thn</th><th className="th">Susut / Bln</th><th className="th">Akun Beban</th><th className="th">Akun Akumulasi</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {assetRows.map((a, i) => {
                      const gol = String(a.nama ?? "");
                      const beban = gol === "Bangunan" ? "6-021 C" : gol === "Alat Berat" ? "6-021 A" : gol === "Kendaraan" ? "6-021" : gol.includes("Mesin") ? "6-021 B" : "6-022";
                      const akum = gol === "Bangunan" ? "1-270" : gol === "Alat Berat" ? "1-281" : gol === "Kendaraan" ? "1-280" : gol.includes("Mesin") ? "1-282" : "1-290";
                      const seed = String(a.id ?? "").startsWith("AST-EX-");
                      return (
                      <tr key={String(a.id ?? i)} className="hover:bg-surface">
                        <td className="td font-mono text-xs text-steel-500">{i + 1}</td>
                        <td className="td text-xs font-medium text-navy-900">{gol}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(a.kelompok ?? "-")}</td>
                        <td className="td text-xs text-steel-600">{String(a.bulan ?? "-")}</td>
                        <td className="td text-xs text-steel-600">{String(a.tahun ?? "-")}</td>
                        <td className="td text-xs font-semibold">{fmtRupiah(num(a.nilai))}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(a.metode ?? "GL")}</td>
                        <td className="td text-xs">{fmtRupiah(num(a.susutTahun))}</td>
                        <td className="td text-xs text-steel-600">{fmtRupiah(Math.round(num(a.susutTahun) / 12))}</td>
                        <td className="td font-mono text-[11px] text-steel-600">{beban}</td>
                        <td className="td font-mono text-[11px] text-steel-600">{akum}</td>
                        <td className="td">
                          {!seed && (
                            <button className="btn-secondary px-2 py-1 text-[11px] text-rose-600" onClick={() => { remove("assets", String(a.id)); log("menghapus aset", String(a.nama), "Keuangan"); toast(`Aset ${a.nama} dihapus`); }}>
                              Hapus
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Jurnal" && (
            <div className="space-y-4">
              <CardHeader
                title="Jurnal Umum — Sheet JU Excel"
                action={<button className="btn-primary text-xs" onClick={() => setShowJu(true)}>+ Catat Jurnal</button>}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Tanggal</th><th className="th">Kode Pembantu</th><th className="th">Dokumen</th><th className="th">Uraian</th><th className="th">Akun DB</th><th className="th">Akun KR</th><th className="th">Nominal</th><th className="th">Sumber</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {manJournals.map((j) => (
                      <tr key={String(j.id)} className="hover:bg-surface">
                        <td className="td text-xs text-steel-600">{fmtTanggal(String(j.date ?? ""))}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(j.kodePembantu || "—")}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(j.dokumen ?? "-")}</td>
                        <td className="td max-w-56 truncate text-xs text-steel-600" title={String(j.uraian ?? "")}>{String(j.uraian ?? "")}</td>
                        <td className="td font-mono text-xs">{String(j.db || "—")}</td>
                        <td className="td font-mono text-xs">{String(j.kr)}</td>
                        <td className="td text-xs font-semibold">{fmtRupiah(num(j.amount))}</td>
                        <td className="td text-xs text-steel-500">{String(j.sumber ?? "JU")}</td>
                        <td className="td"><StatusBadge status={String(j.status ?? "Posted")} /></td>
                        <td className="td">
                          {String(j.status) !== "Void" && (
                            <button className="btn-secondary px-2 py-1 text-[11px] text-rose-600" onClick={() => { update("journals", String(j.id), { status: "Void" }); log("mem-void jurnal", String(j.id), "Keuangan"); toast(`${j.id} di-void`); }}>
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {manJournals.length === 0 && (
                      <tr><td className="td text-xs text-steel-400" colSpan={10}>Belum ada jurnal manual.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <CardHeader title="Jurnal Ringkas (Derivasi)" subtitle="Dihitung dari invoice Lunas, hapus buku, payable Lunas, dan payroll Dibayar. Total debit selalu sama dengan total kredit." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                  <p className="text-xs text-steel-500">Aset (Kas + Piutang + Retensi)</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.aset)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">Kas {fmtRupiah(balance.kasNet)} · Piutang {fmtRupiah(balance.piutang)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">Kewajiban (Hutang + PPN terutang)</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.kewajiban)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">Hutang {fmtRupiah(balance.hutang)} · PPN {fmtRupiah(balance.ppnUtang)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">Ekuitas (Aset − Kewajiban)</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.ekuitas)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">Termasuk laba berjalan</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">Laba Berjalan</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.laba)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">Pendapatan − beban proyek − gaji − hapus buku</p>
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  {journals.length === 0 ? (
                    <EmptyState title="Belum ada jurnal" subtitle="Lunasi invoice atau hutang untuk membentuk jurnal otomatis." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-surface sticky top-0 z-10">
                          <tr><th className="th">Tanggal</th><th className="th">Ref</th><th className="th">Debit</th><th className="th">Kredit</th><th className="th">Nilai</th></tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {journals.slice(0, 40).map((j, idx) => (
                            <tr key={`${j.ref}-${idx}`} className="hover:bg-surface">
                              <td className="td text-xs text-steel-600">{fmtTanggal(j.date)}</td>
                              <td className="td"><p className="font-mono text-xs font-semibold text-navy-900">{j.ref}</p><p className="max-w-56 truncate text-[11px] text-steel-500" title={j.desc}>{j.desc}</p></td>
                              <td className="td text-xs">{j.debitAkun}</td>
                              <td className="td text-xs">{j.kreditAkun}</td>
                              <td className="td text-xs font-semibold">{fmtRupiah(j.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-steel-500">Total debit {fmtRupiah(journalTotal)} = Total kredit {fmtRupiah(journalTotal)} · Seimbang.</p>
                </div>
                <Card className="p-4">
                  <CardHeader title="CoA Referensi" subtitle={`${coaList.length} akun (sheet Akun)`} />
                  <div className="max-h-96 space-y-1.5 overflow-y-auto px-5 pb-5 text-xs">
                    {coaList.map((c) => (
                      <div key={c.kode} className="flex gap-2">
                        <span className="w-12 font-mono font-semibold text-navy-900">{c.kode}</span>
                        <span className="text-steel-600">{c.akun}</span>
                        <span className="ml-auto text-steel-400">{c.tipe}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
              <Card>
                <CardHeader title="P&L Bulanan dari Jurnal" subtitle="Grup periode YYYY-MM dari tanggal jurnal (paidAt/due). Hapus buku masuk kolom beban hapus buku." />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Periode</th><th className="th">Pendapatan</th><th className="th">Beban Proyek</th><th className="th">Beban Gaji</th><th className="th">Hapus Buku</th><th className="th">Laba</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {plMonthly.map((p) => (
                        <tr key={p.period} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{p.period}</td>
                          <td className="td">{fmtRupiah(p.revenue)}</td>
                          <td className="td text-steel-600">{fmtRupiah(p.costProj)}</td>
                          <td className="td text-steel-600">{fmtRupiah(p.salary)}</td>
                          <td className="td text-steel-600">{fmtRupiah(p.writeoff)}</td>
                          <td className="td font-semibold text-emerald-600">{fmtRupiah(p.laba)}</td>
                        </tr>
                      ))}
                      {plMonthly.length === 0 && (
                        <tr><td className="td text-xs text-steel-400" colSpan={6}>Belum ada jurnal pada periode berjalan.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Modal open={showInv} onClose={() => setShowInv(false)} title="Buat Invoice" subtitle="Lines + tipe billing + milestone ref. Jatuh tempo wajib." wide
        footer={<><button className="btn-secondary" onClick={() => setShowInv(false)}>Batal</button><button className="btn-primary" onClick={saveInvoice}>Terbitkan (Draft)</button></>}>
        <div className="space-y-3">
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">Nomor preview: <strong className="font-mono text-navy-900">{invPreview}</strong> · Tipe {invForm.billingType}{invTotal > approveThreshold ? <span className="ml-2"><Badge tone="amber">Butuh Director saat approve</Badge></span> : ""}</p>
          <FormGrid>
            <Field label="Proyek">
              <select className="input" value={invForm.project} onChange={(e) => setInv("project", e.target.value)}>
                <option value="">Pilih proyek…</option>
                {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel} · {p.client}</option>)}
              </select>
            </Field>
            <Field label="Tipe billing">
              <select className="input" value={invForm.billingType} onChange={(e) => setInv("billingType", e.target.value)}>
                {BILLING_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Milestone ref" hint="cth: Milestone 3 / Termin 2">
              <input className="input" value={invForm.milestoneRef} onChange={(e) => setInv("milestoneRef", e.target.value)} placeholder="Milestone 3" />
            </Field>
            <Field label="Jatuh tempo">
              <input type="date" required className="input" value={invForm.due} onChange={(e) => setInv("due", e.target.value)} />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Kode pembantu" hint="Default = nama customer (kolom sheet Piutang)">
              <input className="input font-mono" value={invForm.kodePembantu} onChange={(e) => setInv("kodePembantu", e.target.value)} placeholder="cth: PT Kartika Samudra" />
            </Field>
            <Field label="NSFP (opsional, unik)" hint="cth: 0026.001-25.00000001">
              <input className="input font-mono" value={invForm.nsfp} onChange={(e) => setInv("nsfp", e.target.value)} placeholder="NSFP" />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="No. faktur (opsional, unik)" hint="cth: 010.002-26.00000001">
              <input className="input font-mono" value={invForm.noFaktur} onChange={(e) => setInv("noFaktur", e.target.value)} placeholder="No. faktur" />
            </Field>
          </FormGrid>
          {isTMForm && (
            <Field label="Referensi service / WO" hint="cth: SRV-002 / WO-2026-043">
              <input className="input font-mono" value={invForm.serviceRef} onChange={(e) => setInv("serviceRef", e.target.value)} placeholder="SRV-002" />
            </Field>
          )}
          {!isTMForm && invForm.billingType !== "Uang Muka" && (
            <FormGrid>
              <Field label="Retensi % (default 5)">
                <input type="number" min={0} max={100} className="input" value={invForm.retentionPct} onChange={(e) => setInv("retentionPct", e.target.value)} />
              </Field>
              <Field label="Termin label">
                <select className="input" value={invForm.paymentTerm} onChange={(e) => setInv("paymentTerm", e.target.value)}>
                  {["Termin 1", "Termin 2", "Termin 3", "Milestone 1", "Milestone 2", "Milestone 3", "Progress", "Final"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </FormGrid>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label">Lines — total {fmtRupiah(invTotal)}{retentionAmtPreview > 0 ? ` · retensi ${fmtRupiah(retentionAmtPreview)}` : ""}</p>
              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setInvLines((ls) => [...ls, emptyLine()])}>
                <Plus className="h-3.5 w-3.5" /> Baris
              </button>
            </div>
            <div className="space-y-2">
              {invLines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-xl bg-surface p-2">
                  <div className="col-span-12 sm:col-span-4">
                    <Field label="Deskripsi"><input className="input" value={l.desc} onChange={(e) => setLine(idx, "desc", e.target.value)} placeholder="cth: Hull assembly section 4" /></Field>
                  </div>
                  {isTMForm ? (
                    <>
                      <div className="col-span-5 sm:col-span-3"><Field label="Rate (Rp)"><input type="number" min={0} className="input" value={l.rate} onChange={(e) => setLine(idx, "rate", e.target.value)} /></Field></div>
                      <div className="col-span-5 sm:col-span-3"><Field label="Hours"><input type="number" min={0} className="input" value={l.hours} onChange={(e) => setLine(idx, "hours", e.target.value)} /></Field></div>
                      <div className="col-span-2 sm:col-span-2">
                        <p className="text-xs font-semibold text-navy-900">{fmtRupiah(lineAmount(l, true))}</p>
                        <button className="mt-1 text-rose-600" aria-label="Hapus baris" onClick={() => setInvLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-3 sm:col-span-2"><Field label="Qty"><input type="number" min={0} className="input" value={l.qty} onChange={(e) => setLine(idx, "qty", e.target.value)} /></Field></div>
                      <div className="col-span-3 sm:col-span-2"><Field label="Unit"><input className="input" value={l.unit} onChange={(e) => setLine(idx, "unit", e.target.value)} /></Field></div>
                      <div className="col-span-4 sm:col-span-3"><Field label="Harga (Rp)"><input type="number" min={0} className="input" value={l.price} onChange={(e) => setLine(idx, "price", e.target.value)} /></Field></div>
                      <div className="col-span-2 sm:col-span-1">
                        <button className="text-rose-600" aria-label="Hapus baris" onClick={() => setInvLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={payTarget !== null} onClose={() => setPayTarget(null)} title={`Tandai lunas ${payTarget?.id ?? ""}?`} subtitle={`${String(payTarget?.client ?? "")} · ${fmtRupiah(num(payTarget?.amount))}`}
        footer={<><button className="btn-secondary" onClick={() => setPayTarget(null)}>Batal</button><button className="btn-primary" onClick={confirmBuktiInv}>Simpan Bukti Lunas</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal bayar"><input type="date" required className="input" value={proof.date} onChange={(e) => setProofField("date", e.target.value)} /></Field>
            <Field label="Metode">
              <select className="input" value={proof.method} onChange={(e) => setProofField("method", e.target.value)}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="No. referensi" hint="Wajib — no. bukti transfer / kuitansi">
            <input className="input font-mono" value={proof.ref} onChange={(e) => setProofField("ref", e.target.value)} placeholder="cth: TRF-2026-0912" />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={rejectInv !== null}
        title={`Tolak ${rejectInv?.id ?? ""}?`}
        desc="Invoice yang ditolak kembali ke status Draft dan bisa diajukan ulang."
        confirmLabel="Ya, tolak"
        onCancel={() => setRejectInv(null)}
        onConfirm={() => { if (rejectInv) { update("invoices", rejectInv.id, { status: "Ditolak" }); toast(`${rejectInv.id} ditolak → Draft menyusul`); } setRejectInv(null); }}
      />

      <Modal open={apTarget !== null} onClose={() => setApTarget(null)} title={`Bayar ${String(apTarget?.po ?? "")}?`} subtitle={`${String(apTarget?.v ?? "")} · ${fmtRupiah(num(apTarget?.amt))}`}
        footer={<><button className="btn-secondary" onClick={() => setApTarget(null)}>Batal</button><button className="btn-primary" onClick={confirmBuktiAp}>Simpan Bukti Bayar</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal bayar"><input type="date" required className="input" value={proof.date} onChange={(e) => setProofField("date", e.target.value)} /></Field>
            <Field label="Metode">
              <select className="input" value={proof.method} onChange={(e) => setProofField("method", e.target.value)}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="No. referensi" hint="Wajib — no. bukti transfer / giro">
            <input className="input font-mono" value={proof.ref} onChange={(e) => setProofField("ref", e.target.value)} placeholder="cth: TRF-2026-0913" />
          </Field>
        </div>
      </Modal>

      <Modal open={showAp} onClose={() => setShowAp(false)} title="Catat Hutang Vendor"
        footer={<><button className="btn-secondary" onClick={() => setShowAp(false)}>Batal</button><button className="btn-primary" onClick={saveAp}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Vendor"><input className="input" value={apForm.v} onChange={(e) => setApForm({ ...apForm, v: e.target.value })} /></Field>
            <Field label="Kode pembantu" hint="Default = nama vendor"><input className="input font-mono" value={apForm.kodePembantu} onChange={(e) => setApForm({ ...apForm, kodePembantu: e.target.value })} /></Field>
            <Field label="Referensi PO"><input className="input font-mono" value={apForm.po} onChange={(e) => setApForm({ ...apForm, po: e.target.value })} /></Field>
            <Field label="Saldo awal bulan (Rp)"><input type="number" min={0} className="input" value={apForm.openAwal} onChange={(e) => setApForm({ ...apForm, openAwal: e.target.value })} /></Field>
            <Field label="Saldo akhir (Rp)"><input type="number" min={0} className="input" value={apForm.amt} onChange={(e) => setApForm({ ...apForm, amt: e.target.value })} /></Field>
            <Field label="Jatuh tempo"><input type="date" required className="input" value={apForm.due} onChange={(e) => setApForm({ ...apForm, due: e.target.value })} /></Field>
          </FormGrid>
          <label className="flex items-center gap-2 text-sm text-steel-600">
            <input type="checkbox" checked={apForm.nonPpn} onChange={(e) => setApForm({ ...apForm, nonPpn: e.target.checked })} />
            Vendor Non-PPn (kuning di Excel — tanpa potong PPh 23)
          </label>
        </div>
      </Modal>

      <Modal open={apEdit !== null} onClose={() => setApEdit(null)} title={`Ubah hutang ${String(apEdit?.po ?? apEdit?.id ?? "")}?`} subtitle={String(apEdit?.v ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setApEdit(null)}>Batal</button><button className="btn-primary" onClick={saveApEdit}>Simpan Perubahan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Vendor"><input className="input" value={apEditForm.v} onChange={(e) => setApEditForm({ ...apEditForm, v: e.target.value })} /></Field>
            <Field label="Kode pembantu"><input className="input font-mono" value={apEditForm.kodePembantu} onChange={(e) => setApEditForm({ ...apEditForm, kodePembantu: e.target.value })} /></Field>
            <Field label="Saldo awal bulan (Rp)"><input type="number" min={0} className="input" value={apEditForm.openAwal} onChange={(e) => setApEditForm({ ...apEditForm, openAwal: e.target.value })} /></Field>
            <Field label="Saldo akhir (Rp)"><input type="number" min={0} className="input" value={apEditForm.amt} onChange={(e) => setApEditForm({ ...apEditForm, amt: e.target.value })} /></Field>
            <Field label="Jatuh tempo"><input type="date" required className="input" value={apEditForm.due} onChange={(e) => setApEditForm({ ...apEditForm, due: e.target.value })} /></Field>
          </FormGrid>
          <label className="flex items-center gap-2 text-sm text-steel-600">
            <input type="checkbox" checked={apEditForm.nonPpn} onChange={(e) => setApEditForm({ ...apEditForm, nonPpn: e.target.checked })} />
            Vendor Non-PPn (kuning di Excel — tanpa potong PPh 23)
          </label>
        </div>
      </Modal>

      <Modal open={releaseTarget !== null} onClose={() => setReleaseTarget(null)} title={`Release retensi ${releaseTarget?.id ?? ""}?`} subtitle={`${fmtRupiah(num(releaseTarget?.retentionAmt))} · butuh tanggal + no. berita acara`}
        footer={<><button className="btn-secondary" onClick={() => setReleaseTarget(null)}>Batal</button><button className="btn-primary" onClick={confirmRelease}>Release Retensi</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal release"><input type="date" required className="input" value={releaseForm.date} onChange={(e) => setReleaseForm({ ...releaseForm, date: e.target.value })} /></Field>
            <Field label="No. berita acara"><input className="input font-mono" value={releaseForm.ba} onChange={(e) => setReleaseForm({ ...releaseForm, ba: e.target.value })} placeholder="cth: BA-2026-044" /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showBatch} onClose={() => setShowBatch(false)} title={`Bayar massal ${fmtJumlah(schedSel.length)} item?`} subtitle={`Total ${fmtRupiah(schedTotal)} · urutan pelunasan tertua dulu · satu bukti untuk semua`}
        footer={<><button className="btn-secondary" onClick={() => setShowBatch(false)}>Batal</button><button className="btn-primary" onClick={confirmBatch}>Lunasi Semua Terpilih</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal bayar"><input type="date" required className="input" value={batchProof.date} onChange={(e) => setBatchProof({ ...batchProof, date: e.target.value })} /></Field>
            <Field label="Metode">
              <select className="input" value={batchProof.method} onChange={(e) => setBatchProof({ ...batchProof, method: e.target.value })}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="No. referensi" hint="Wajib — satu no. bukti untuk seluruh batch">
            <input className="input font-mono" value={batchProof.ref} onChange={(e) => setBatchProof({ ...batchProof, ref: e.target.value })} placeholder="cth: TRF-2026-0999" />
          </Field>
        </div>
      </Modal>

      <Modal open={allocTarget !== null} onClose={() => setAllocTarget(null)} title={`Alokasi gaji ${allocTarget?.id ?? ""}?`} subtitle="Pilih proyek + persen alokasi. Sisanya tetap tak teralokasi."
        footer={<><button className="btn-secondary" onClick={() => setAllocTarget(null)}>Batal</button><button className="btn-primary" onClick={saveAlloc}>Simpan Alokasi</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Proyek">
              <select className="input" value={allocForm.project} onChange={(e) => setAllocForm({ ...allocForm, project: e.target.value })}>
                <option value="">Pilih proyek…</option>
                {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Persen (%)"><input type="number" min={1} max={100} className="input" value={allocForm.pct} onChange={(e) => setAllocForm({ ...allocForm, pct: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={dirTarget !== null} onClose={() => setDirTarget(null)} title={`Persetujuan Director ${dirTarget?.id ?? ""}?`} subtitle={`${fmtRupiah(num(dirTarget?.amount))} di atas ambang ${fmtRupiah(approveThreshold)}. Tombol Setujui terkunci sampai checklist + nama diisi.`}
        footer={<><button className="btn-secondary" onClick={() => setDirTarget(null)}>Batal</button><button className="btn-primary" disabled={!dirCheck || !dirName.trim()} onClick={confirmDirector}>Setujui sebagai Director</button></>}>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-steel-600">
            <input type="checkbox" className="mt-1" checked={dirCheck} onChange={(e) => setDirCheck(e.target.checked)} />
            Saya selaku Director menyetujui invoice nominal besar ini.
          </label>
          <Field label="Nama Director" hint="Wajib — dicatat di log">
            <input className="input" value={dirName} onChange={(e) => setDirName(e.target.value)} placeholder="cth: Andi Darman" />
          </Field>
        </div>
      </Modal>

      <Modal open={showCoa} onClose={() => { setShowCoa(false); setCoaTarget(null); }} title={coaTarget ? `Ubah akun ${coaTarget.kode}?` : "Tambah Akun"}
        footer={<><button className="btn-secondary" onClick={() => { setShowCoa(false); setCoaTarget(null); }}>Batal</button><button className="btn-primary" onClick={saveCoa}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="No. akun" hint="cth: 1-125">
              <input className="input font-mono" value={coaForm.kode} disabled={coaTarget !== null} onChange={(e) => setCoaForm({ ...coaForm, kode: e.target.value })} placeholder="x-xxx" />
            </Field>
            <Field label="Nama akun"><input className="input" value={coaForm.nama} onChange={(e) => setCoaForm({ ...coaForm, nama: e.target.value })} placeholder="cth: Bank Kaltimtara Syariah" /></Field>
            <Field label="Akun D/K">
              <select className="input" value={coaForm.dk} onChange={(e) => setCoaForm({ ...coaForm, dk: e.target.value })}>
                <option value="D">D — Debit</option>
                <option value="K">K — Kredit</option>
              </select>
            </Field>
            <Field label="Akun NR/LR">
              <select className="input" value={coaForm.nrlr} onChange={(e) => setCoaForm({ ...coaForm, nrlr: e.target.value })}>
                <option value="NR">NR — Neraca</option>
                <option value="LR">LR — Laba-Rugi</option>
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showJu} onClose={() => setShowJu(false)} title="Catat Jurnal Umum" subtitle="Wajib berimbang: satu akun DB + satu akun KR dengan nominal sama"
        footer={<><button className="btn-secondary" onClick={() => setShowJu(false)}>Batal</button><button className="btn-primary" onClick={saveJu}>Simpan (Posted)</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal"><input type="date" required className="input" value={juForm.date} onChange={(e) => setJuForm({ ...juForm, date: e.target.value })} /></Field>
            <Field label="Kode pembantu"><input className="input font-mono" value={juForm.kodePembantu} onChange={(e) => setJuForm({ ...juForm, kodePembantu: e.target.value })} placeholder="vendor / customer" /></Field>
            <Field label="Dokumen" hint="cth: 101 / 201 / BKM-001"><input className="input font-mono" value={juForm.dokumen} onChange={(e) => setJuForm({ ...juForm, dokumen: e.target.value })} /></Field>
            <Field label="Sumber">
              <select className="input" value={juForm.sumber} onChange={(e) => setJuForm({ ...juForm, sumber: e.target.value })}>
                {["JU", "Kas", "Bank", "JPb", "JPn", "JM"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Uraian"><input className="input" value={juForm.uraian} onChange={(e) => setJuForm({ ...juForm, uraian: e.target.value })} placeholder="cth: Penyesuaian PPN September" /></Field>
          <FormGrid>
            <Field label="Akun DB">
              <select className="input font-mono" value={juForm.db} onChange={(e) => setJuForm({ ...juForm, db: e.target.value })}>
                <option value="">Pilih akun…</option>
                {coaRows.filter((c) => String(c.dk) !== "-").map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
              </select>
            </Field>
            <Field label="Akun KR">
              <select className="input font-mono" value={juForm.kr} onChange={(e) => setJuForm({ ...juForm, kr: e.target.value })}>
                <option value="">Pilih akun…</option>
                {coaRows.filter((c) => String(c.dk) !== "-").map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
              </select>
            </Field>
            <Field label="Nominal (Rp)"><input type="number" min={0} className="input" value={juForm.amount} onChange={(e) => setJuForm({ ...juForm, amount: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showMut} onClose={() => setShowMut(false)} title="Catat Mutasi Kas & Bank" subtitle="Masuk menambah saldo rekening, keluar mengurangi — otomatis jadi jurnal berimbang"
        footer={<><button className="btn-secondary" onClick={() => setShowMut(false)}>Batal</button><button className="btn-primary" onClick={saveMut}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal"><input type="date" required className="input" value={mutForm.date} onChange={(e) => setMutForm({ ...mutForm, date: e.target.value })} /></Field>
            <Field label="Rekening">
              <select className="input font-mono" value={mutForm.rekening} onChange={(e) => setMutForm({ ...mutForm, rekening: e.target.value })}>
                {KAS_REKENING.map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
              </select>
            </Field>
            <Field label="Arah">
              <select className="input" value={mutForm.arah} onChange={(e) => setMutForm({ ...mutForm, arah: e.target.value })}>
                <option>Masuk</option>
                <option>Keluar</option>
              </select>
            </Field>
            <Field label="Akun lawan">
              <select className="input font-mono" value={mutForm.lawan} onChange={(e) => setMutForm({ ...mutForm, lawan: e.target.value })}>
                <option value="">Pilih akun…</option>
                {coaRows.filter((c) => String(c.dk) !== "-").map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Kode pembantu"><input className="input font-mono" value={mutForm.kodePembantu} onChange={(e) => setMutForm({ ...mutForm, kodePembantu: e.target.value })} /></Field>
            <Field label="No. dokumen" hint="cth: 101 / BKM-009"><input className="input font-mono" value={mutForm.dokumen} onChange={(e) => setMutForm({ ...mutForm, dokumen: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Uraian"><input className="input" value={mutForm.uraian} onChange={(e) => setMutForm({ ...mutForm, uraian: e.target.value })} placeholder="cth: Terima pembayaran invoice" /></Field>
          <Field label="Nominal (Rp)"><input type="number" min={0} className="input" value={mutForm.amount} onChange={(e) => setMutForm({ ...mutForm, amount: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={invEdit !== null} onClose={() => setInvEdit(null)} title={`Ubah invoice ${invEdit?.id ?? ""}?`} subtitle="Hanya untuk invoice yang belum lunas/dihapusbukukan"
        footer={<><button className="btn-secondary" onClick={() => setInvEdit(null)}>Batal</button><button className="btn-primary" onClick={saveInvEdit}>Simpan Perubahan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Customer"><input className="input" value={invEditForm.client} onChange={(e) => setInvEditForm({ ...invEditForm, client: e.target.value })} /></Field>
            <Field label="Kode pembantu"><input className="input font-mono" value={invEditForm.kodePembantu} onChange={(e) => setInvEditForm({ ...invEditForm, kodePembantu: e.target.value })} /></Field>
            <Field label="Jatuh tempo"><input type="date" required className="input" value={invEditForm.due} onChange={(e) => setInvEditForm({ ...invEditForm, due: e.target.value })} /></Field>
            <Field label="Termin"><input className="input" value={invEditForm.paymentTerm} onChange={(e) => setInvEditForm({ ...invEditForm, paymentTerm: e.target.value })} /></Field>
            <Field label="Milestone ref"><input className="input" value={invEditForm.milestoneRef} onChange={(e) => setInvEditForm({ ...invEditForm, milestoneRef: e.target.value })} /></Field>
            <Field label="NSFP"><input className="input font-mono" value={invEditForm.nsfp} onChange={(e) => setInvEditForm({ ...invEditForm, nsfp: e.target.value })} /></Field>
            <Field label="No. faktur"><input className="input font-mono" value={invEditForm.noFaktur} onChange={(e) => setInvEditForm({ ...invEditForm, noFaktur: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showAst} onClose={() => setShowAst(false)} title="Tambah Aset" subtitle="Tarif fiskal GL: BP 5%, Kel.1 25%, Kel.2 12,5%, Kel.3 6,25%"
        footer={<><button className="btn-secondary" onClick={() => setShowAst(false)}>Batal</button><button className="btn-primary" onClick={saveAst}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama / jenis harta"><input className="input" value={astForm.nama} onChange={(e) => setAstForm({ ...astForm, nama: e.target.value })} placeholder="cth: Excavator PC 200" /></Field>
            <Field label="Kel. harta">
              <select className="input" value={astForm.kelompok} onChange={(e) => setAstForm({ ...astForm, kelompok: e.target.value })}>
                <option value="BP">BP — Bangunan Permanen (5%)</option>
                <option value="1">1 — Kelompok 1 (25%)</option>
                <option value="2">2 — Kelompok 2 (12,5%)</option>
                <option value="3">3 — Kelompok 3 (6,25%)</option>
              </select>
            </Field>
            <Field label="Bulan perolehan" hint="cth: Jan"><input className="input" value={astForm.bulan} onChange={(e) => setAstForm({ ...astForm, bulan: e.target.value })} /></Field>
            <Field label="Tahun perolehan"><input className="input font-mono" value={astForm.tahun} onChange={(e) => setAstForm({ ...astForm, tahun: e.target.value })} placeholder="2026" /></Field>
            <Field label="Nilai perolehan (Rp)"><input type="number" min={0} className="input" value={astForm.nilai} onChange={(e) => setAstForm({ ...astForm, nilai: e.target.value })} /></Field>
            <Field label="Metode">
              <select className="input" value={astForm.metode} onChange={(e) => setAstForm({ ...astForm, metode: e.target.value })}>
                <option>GL</option>
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={writeOff !== null} onClose={() => { setWriteOff(null); setWriteOffReason(""); }} title={`Hapus buku ${writeOff?.id ?? ""}?`} subtitle={`${fmtRupiah(num(writeOff?.amount))} keluar dari AR dan masuk beban. Wajib isi alasan.`}        footer={<><button className="btn-secondary" onClick={() => { setWriteOff(null); setWriteOffReason(""); }}>Batal</button><button className="btn-primary" disabled={!writeOffReason.trim()} onClick={() => setConfirmWriteOff(true)}>Lanjut Konfirmasi</button></>}>
        <Field label="Alasan hapus buku" hint="Wajib — cth: piutang tak tertagih 180 hari, debitur pailit">
          <input className="input" value={writeOffReason} onChange={(e) => setWriteOffReason(e.target.value)} placeholder="Tulis alasan…" />
        </Field>
      </Modal>

      <ConfirmModal
        open={confirmWriteOff && writeOff !== null}
        title={`Hapus buku ${writeOff?.id ?? ""}?`}
        desc={`Alasan: ${writeOffReason.trim() || "—"}. Status menjadi Dihapusbukukan dan tercatat sebagai beban.`}
        confirmLabel="Ya, hapus-bukukan"
        danger
        onCancel={() => setConfirmWriteOff(false)}
        onConfirm={doWriteOff}
      />
    </div>
  );
}
