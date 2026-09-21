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
  ChartTooltip,
  Donut,
  Modal,
  Field,
  FormGrid,
  ConfirmModal,
  EmptyState,
  toast,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtRupiah, fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";
import {
  cashflowSeries,
  agingBuckets,
  plSummary,
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
};

const BILLING_TYPES = ["Milestone", "Progres", "Uang Muka", "Retensi", "T&M"] as const;

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

  const isTMForm = invForm.billingType === "T&M";
  const invTotal = invLines.reduce((s, l) => s + lineAmount(l, isTMForm), 0);
  const retentionAmtPreview = invForm.billingType === "Uang Muka" || invForm.billingType === "T&M"
    ? 0
    : Math.round(invTotal * (num(invForm.retentionPct) / 100));

  const arTotal = invoices
    .filter((i) => i.status !== "Lunas" && i.status !== "Draft")
    .reduce((s, i) => s + num(i.amount), 0);
  const apTotal = payables.filter((a) => a.st !== "Lunas").reduce((s, a) => s + num(a.amt), 0);
  const lateCount = invoices.filter((i) => i.status === "Terlambat").length;

  const cfLast = cashflowSeries[cashflowSeries.length - 1];
  const cfPrev = cashflowSeries[cashflowSeries.length - 2];
  const cfDelta = cfPrev && cfPrev.masuk ? Math.round(((cfLast.masuk - cfPrev.masuk) / cfPrev.masuk) * 100) : 0;
  const plLast = plSummary[plSummary.length - 1];
  const plPrev = plSummary[plSummary.length - 2];
  const ebitdaDelta = plPrev && plPrev.ebitda ? Math.round(((plLast.ebitda - plPrev.ebitda) / plPrev.ebitda) * 100) : 0;

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
    if (!activePeriod) return { ppnKeluar: 0, ppnMasuk: 0, pph23: 0, pph21: 0, invBase: 0, apBase: 0 };
    const invLunas = invoices.filter((i) => i.status === "Lunas" && invPaidMonth(i) === activePeriod);
    const invBase = invLunas.reduce((s, i) => s + num(i.amount), 0);
    const apLunas = payables.filter((a) => a.st === "Lunas" && apPaidMonth(a) === activePeriod);
    const apBase = apLunas.reduce((s, a) => s + num(a.amt), 0);
    const payRows = (data.payroll ?? []).filter((p) => String(p.period ?? "") === activePeriod);
    const pph21 = payRows.reduce((s, p) => s + num(p.pph21), 0);
    return {
      ppnKeluar: Math.round(invBase * 0.11),
      ppnMasuk: Math.round(apBase * 0.11),
      pph23: Math.round(apBase * 0.02),
      pph21,
      invBase,
      apBase,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, payables, data.payroll, activePeriod]);

  const taxLocked = activeTax?.status === "Lapor";
  const taxShown = taxLocked
    ? { ppnKeluar: num(activeTax.ppnKeluar), ppnMasuk: num(activeTax.ppnMasuk), pph23: num(activeTax.pph23), pph21: num(activeTax.pph21) }
    : taxCalc;

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
    const created = add("invoices", {
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
    }, { action: "menerbitkan invoice", module: "Keuangan" });
    if (invForm.billingType === "Uang Muka") {
      update("projects", proj.id, { hasAdvance: true });
      log("menandai uang muka proyek", proj.id, "Keuangan");
    }
    toast(`Invoice ${created.id} dibuat (Draft)`);
    setShowInv(false);
    setInvForm({ project: "", billingType: "Milestone", milestoneRef: "", serviceRef: "", retentionPct: "5", due: "", paymentTerm: "Termin 1" });
    setInvLines([emptyLine()]);
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
    update("invoices", inv.id, { status: next });
    toast(`${inv.id} → ${next}`);
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
      ["PPN Keluaran", taxCalc.invBase, "11%", taxCalc.ppnKeluar],
      ["PPN Masukan", taxCalc.apBase, "11%", taxCalc.ppnMasuk],
      ["PPh 23", taxCalc.apBase, "2%", taxCalc.pph23],
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
          label="EBITDA Kuartalan"
          value={`Rp ${plLast.ebitda.toLocaleString("id-ID")} M`}
          delta={`${ebitdaDelta >= 0 ? "+" : ""}${ebitdaDelta}% QoQ`}
          deltaDirection={ebitdaDelta >= 0 ? "up" : "down"}
          icon={<TrendingUp className="h-5 w-5" />} chip="violet" spark={ebitdaTrend}
        />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Piutang (AR)", "Hutang (AP)", "Invoice", "Project P&L", "Pajak", "Jurnal"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Piutang (AR)" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CardHeader title="Daftar Invoice" subtitle="Hanya transisi status yang legal yang tampil" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Invoice</th><th className="th">Proyek</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface">
                          <td className="td">
                            <p className="font-medium text-navy-900 font-mono">{inv.id}</p>
                            <p className="text-xs text-steel-500 truncate" title={String(inv.client ?? "")}>{String(inv.client ?? "")}</p>
                            <p className="text-[11px] text-steel-400">{String(inv.billingType ?? inv.paymentTerm ?? "")}{inv.milestoneRef ? ` · ${inv.milestoneRef}` : ""}</p>
                          </td>
                          <td className="td text-steel-600 font-mono text-xs truncate" title={String(inv.project)}>{inv.project}</td>
                          <td className="td font-semibold text-navy-900">{fmtRupiah(num(inv.amount))}</td>
                          <td className="td text-steel-600">{fmtTanggal(String(inv.due ?? ""))}</td>
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
                      ))}
                    </tbody>
                  </table>
                </div>
                {invoices.length === 0 && <EmptyState title="Belum ada invoice" subtitle="Buat invoice pertama untuk cabang ini." />}
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
                  <button className="btn-primary mt-4 w-full justify-center" onClick={() => setShowInv(true)}>Buat Invoice</button>
                </Card>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Invoice</th><th className="th">Tipe</th><th className="th">Lines</th><th className="th">Retensi</th><th className="th">Nilai</th><th className="th">Status</th></tr>
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
                <CardHeader title="Rekap Kuartalan" subtitle="Revenue, biaya, laba kotor & EBITDA (milyar Rupiah)" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Periode</th><th className="th">Revenue</th><th className="th">Biaya</th><th className="th">Gross</th><th className="th">EBITDA</th><th className="th">Margin</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {plSummary.map((p) => (
                        <tr key={p.month} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{p.month}</td>
                          <td className="td">{fmtMiliar(p.revenue)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.cost)}</td>
                          <td className="td font-semibold text-emerald-600">{fmtMiliar(p.gross)}</td>
                          <td className="td font-semibold">{fmtMiliar(p.ebitda)}</td>
                          <td className="td"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{Math.round((p.gross / p.revenue) * 100)}%</span></td>
                        </tr>
                      ))}
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
                subtitle="PPN Keluaran 11% dari invoice Lunas periode (paidAt/due), PPN Masukan 11% dari payable Lunas, PPh23 2% dari payable Lunas jasa, PPh21 total payroll periode."
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
                    { label: "PPN Keluaran", value: fmtRupiah(taxShown.ppnKeluar), hint: `11% dari ${fmtRupiah(taxCalc.invBase)}` },
                    { label: "PPN Masukan", value: fmtRupiah(taxShown.ppnMasuk), hint: `11% dari ${fmtRupiah(taxCalc.apBase)}` },
                    { label: "PPh 23", value: fmtRupiah(taxShown.pph23), hint: "2% dari payable Lunas" },
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
              </Card>
            </div>
          )}

          {tab === "Jurnal" && (
            <div className="space-y-4">
              <CardHeader title="Jurnal Ringkas (Derivasi)" subtitle="Dihitung dari invoice Lunas, payable Lunas, dan payroll Dibayar. Total debit selalu sama dengan total kredit." />
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
            </div>
          )}
        </div>
      </div>

      <Modal open={showInv} onClose={() => setShowInv(false)} title="Buat Invoice" subtitle="Lines + tipe billing + milestone ref. Jatuh tempo wajib." wide
        footer={<><button className="btn-secondary" onClick={() => setShowInv(false)}>Batal</button><button className="btn-primary" onClick={saveInvoice}>Terbitkan (Draft)</button></>}>
        <div className="space-y-3">
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
    </div>
  );
}
