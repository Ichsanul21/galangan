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
  cashflowSeries,
  agingBuckets,
  sparkRevenue,
  apTrend,
  cashInTrend,
  ebitdaTrend,
} from "../../data";

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
  Milestone: "INV-M",
  Progres: "INV-P",
  "Uang Muka": "INV-U",
  Retensi: "INV-R",
  "T&M": "INV-T",
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

const COA = [
  { kode: "1100", akun: "Kas", tipe: "Aset" },
  { kode: "1200", akun: "Piutang Usaha", tipe: "Aset" },
  { kode: "2100", akun: "Hutang Usaha", tipe: "Liabilitas" },
  { kode: "4100", akun: "Pendapatan Proyek", tipe: "Pendapatan" },
  { kode: "5100", akun: "Beban Proyek", tipe: "Beban" },
  { kode: "5200", akun: "Beban Gaji", tipe: "Beban" },
  { kode: "6100", akun: "Pajak", tipe: "Beban" },
];

export default function Finance() {
  const { data, add, update, log, branch, inBranch } = useStore();
  const [tab, setTab] = useState("Piutang (AR)");
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
  });
  const [invLines, setInvLines] = useState<InvLine[]>([emptyLine()]);
  const [payTarget, setPayTarget] = useState<StoreItem | null>(null);
  const [apTarget, setApTarget] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState(emptyProof);
  const [rejectInv, setRejectInv] = useState<StoreItem | null>(null);
  const [showAp, setShowAp] = useState(false);
  const [apForm, setApForm] = useState({ v: "", po: "", amt: "", due: "" });
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

  const cfLast = cashflowSeries[cashflowSeries.length - 1];
  const cfPrev = cashflowSeries[cashflowSeries.length - 2];
  const cfDelta = cfPrev && cfPrev.masuk ? Math.round(((cfLast.masuk - cfPrev.masuk) / cfPrev.masuk) * 100) : 0;

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

  const labaLast = plMonthly.length ? plMonthly[plMonthly.length - 1].laba : 0;
  const labaPrev = plMonthly.length > 1 ? plMonthly[plMonthly.length - 2].laba : 0;
  const labaDelta = labaPrev ? Math.round(((labaLast - labaPrev) / Math.abs(labaPrev)) * 100) : 0;

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
    setInvForm({ project: "", billingType: "Milestone", milestoneRef: "", serviceRef: "", retentionPct: "5", due: "", paymentTerm: "Termin 1", nsfp: "", noFaktur: "" });
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

  const stepInvoice = (inv: StoreItem, next: string) => {
    if (next === "Lunas") {
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
        <KpiCard label="Total Piutang (AR)" value={fmtMiliar(arTotal)} delta={`${lateCount} telat`} deltaDirection="down" icon={<Wallet className="h-5 w-5" />} chip="rose" spark={sparkRevenue} />
        <KpiCard label="Total Hutang (AP)" value={fmtMiliar(apTotal)} hint="Kepada vendor" icon={<Wallet className="h-5 w-5" />} chip="navy" spark={apTrend} />
        <KpiCard
          label={`Cashflow Masuk (${cfLast.month})`}
          value={`Rp ${cfLast.masuk.toLocaleString("id-ID")} M`}
          delta={`${cfDelta >= 0 ? "+" : ""}${cfDelta}% vs bulan lalu`}
          deltaDirection={cfDelta >= 0 ? "up" : "down"}
          icon={<ArrowDownToLine className="h-5 w-5" />} chip="teal" spark={cashInTrend}
        />
        <KpiCard
          label="Laba Berjalan (derivasi jurnal)"
          value={fmtMiliar(labaLast)}
          delta={`${labaDelta >= 0 ? "+" : ""}${labaDelta}% vs bulan lalu`}
          deltaDirection={labaDelta >= 0 ? "up" : "down"}
          icon={<TrendingUp className="h-5 w-5" />} chip="violet" spark={ebitdaTrend}
        />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Piutang (AR)", "Hutang (AP)", "Jadwal Bayar", "Invoice", "Project P&L", "Pajak", "Jurnal"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Piutang (AR)" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CardHeader title="Daftar Invoice" subtitle="Hanya transisi status yang legal yang tampil. Umur = hari ini − jatuh tempo." />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Invoice</th><th className="th">Proyek</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">Umur</th><th className="th">Penagihan</th><th className="th">Status</th><th className="th">Aksi</th></tr>
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
                                {invNext(String(inv.status)).length === 0 && <span className="text-xs text-steel-400">—</span>}
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
                  <CardHeader title="Aging Piutang" subtitle="Nilai dalam milyar Rupiah" />
                  <div className="flex items-center gap-4 p-1">
                    <Donut
                      data={agingBuckets}
                      colors={agingBuckets.map((a) => a.color)}
                      size={140}
                      thickness={18}
                      centerValue="19.3"
                      centerLabel="M"
                    />
                    <div className="flex-1 space-y-2">
                      {agingBuckets.map((a) => (
                        <div key={a.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: a.color }} />
                          <span className="text-steel-600">{a.name}</span>
                          <span className="ml-auto font-semibold text-navy-900">{a.value}</span>
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Vendor</th><th className="th">PO</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">PPh 23</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {payables.map((a) => (
                      <tr key={a.id} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900 truncate" title={String(a.v)}>{String(a.v)}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(a.po)}</td>
                        <td className="td font-semibold">{fmtRupiah(num(a.amt))}</td>
                        <td className="td text-steel-600">{fmtTanggal(String(a.due ?? ""))}</td>
                        <td className="td text-steel-600">{String(a.pph ?? "2%")}</td>
                        <td className="td"><StatusBadge status={String(a.st)} /></td>
                        <td className="td">
                          {a.st !== "Lunas" && (
                            <button className="btn-secondary text-xs" onClick={() => { setApTarget(a); setProof(emptyProof()); }}>
                              Bayar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Card>
                <CardHeader title="Arus Kas Bulanan" subtitle="Masuk vs keluar (milyar Rupiah)" />
                <div className="h-56 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
                  <CardHeader title="Pergerakan Invoice" subtitle="Penerbitan & status koleksi" />
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                        <Area type="monotone" dataKey="masuk" name="Diterbitkan" stroke="#0b3a63" strokeWidth={2.5} fill="#8cc9e8" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
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

          {tab === "Jurnal" && (
            <div className="space-y-4">
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
                  <CardHeader title="CoA Referensi" subtitle="Kode akun statis" />
                  <div className="space-y-1.5 px-5 pb-5 text-xs">
                    {COA.map((c) => (
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
            <Field label="NSFP (opsional, unik)" hint="cth: 0026.001-25.00000001">
              <input className="input font-mono" value={invForm.nsfp} onChange={(e) => setInv("nsfp", e.target.value)} placeholder="NSFP" />
            </Field>
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
        footer={<><button className="btn-secondary" onClick={() => setShowAp(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!apForm.v.trim()) { toast("Vendor wajib diisi", "info"); return; }
          if (!num(apForm.amt) || num(apForm.amt) <= 0) { toast("Nominal harus lebih dari 0", "info"); return; }
          if (!apForm.due) { toast("Jatuh tempo wajib diisi", "info"); return; }
          const created = add("payables", { v: apForm.v.trim(), po: apForm.po.trim() || "-", amt: num(apForm.amt), due: apForm.due, pph: "2%", st: "Belum Dibayar" },
            { action: "mencatat hutang", module: "Keuangan" });
          toast(`Hutang ${created.id} dicatat`); setShowAp(false); setApForm({ v: "", po: "", amt: "", due: "" });
        }}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Vendor"><input className="input" value={apForm.v} onChange={(e) => setApForm({ ...apForm, v: e.target.value })} /></Field>
            <Field label="Referensi PO"><input className="input font-mono" value={apForm.po} onChange={(e) => setApForm({ ...apForm, po: e.target.value })} /></Field>
            <Field label="Nilai (Rp)"><input type="number" min={0} className="input" value={apForm.amt} onChange={(e) => setApForm({ ...apForm, amt: e.target.value })} /></Field>
            <Field label="Jatuh tempo"><input type="date" required className="input" value={apForm.due} onChange={(e) => setApForm({ ...apForm, due: e.target.value })} /></Field>
          </FormGrid>
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

      <Modal open={writeOff !== null} onClose={() => { setWriteOff(null); setWriteOffReason(""); }} title={`Hapus buku ${writeOff?.id ?? ""}?`} subtitle={`${fmtRupiah(num(writeOff?.amount))} keluar dari AR dan masuk beban. Wajib isi alasan.`}
        footer={<><button className="btn-secondary" onClick={() => { setWriteOff(null); setWriteOffReason(""); }}>Batal</button><button className="btn-primary" disabled={!writeOffReason.trim()} onClick={() => setConfirmWriteOff(true)}>Lanjut Konfirmasi</button></>}>
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
