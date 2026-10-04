import { useMemo, useState } from "react";
import { Download, Wallet } from "lucide-react";
import {
  Badge,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  FormGrid,
  KpiCard,
  Modal,
  PageHeader,
  SortTh,
  StatusBadge,
  Tabs,
  sortRows,
  toast,
  toggleSort,
  NumInput,
  AsyncButton,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtBulan, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import { AlertBannerView, flashPick, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { rowHighlightClass } from "../../components/rowHighlight";
import { getSetting } from "../../utils/settings";
import { exportExcel } from "../../utils/export";
import { pdfServerReady } from "../../services/pdfClient";
import { usePdfDoc } from "../../components/usePdfDoc";
import { findUsages } from "../../utils/usages";
import { kasKodeOf, postCashJournal } from "../../services/autoJournal";
import { n_dry } from "../../i18n/n_dry";
import { useT } from "../../i18n/LanguageContext";

const NEXT_STATUS: Record<string, string> = {
  Draft: "Dihitung",
  Dihitung: "Disetujui",
  Disetujui: "Dibayar",
};

/* Alur bisa mundur: Dihitung/Disetujui dapat dikembalikan langsung ke Draft
   (via konfirmasi + log). Tidak bisa mundur dari Dibayar. */
const PREV_TO_DRAFT = ["Dihitung", "Disetujui"];
const PAY_STAGES = ["Draft", "Dihitung", "Disetujui", "Dibayar"] as const;

function StageStrip({ counts, active, onPick, prefix }: {
  counts: Record<string, number>;
  active: string;
  onPick: (s: string) => void;
  prefix: string;
}) {
  const total = PAY_STAGES.reduce((s, st) => s + (counts[st] ?? 0), 0);
  const { locale } = useT();
  const S = n_dry[locale];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={S.stageAria}>
      {PAY_STAGES.map((st, i) => {
        const n = counts[st] ?? 0;
        const on = active === st;
        return (
          <button
            key={st}
            onClick={() => onPick(on ? "Semua" : st)}
            aria-pressed={on}
            title={n === 0 ? S.stageEmpty.replace("{a}", st) : S.stageShow.replace("{n}", String(n)).replace("{a}", st)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
              on ? "border-navy-700 bg-navy-700 text-white" : "border-steel-200 bg-white text-steel-700 hover:border-navy-400"
            }`}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${on ? "bg-white/25 text-white" : "bg-surface text-navy-800"}`}>
              {i + 1}
            </span>
            {st}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${on ? "bg-white/25 text-white" : "bg-surface text-steel-600"}`}>
              {n}
            </span>
            {i < PAY_STAGES.length - 1 && <span aria-hidden className={on ? "text-white/60" : "text-steel-300"}>→</span>}
          </button>
        );
      })}
      <span className="text-xs text-steel-400">{S.stageHint.replace("{n}", String(total))}</span>
      <span className="sr-only" id={`${prefix}-stage-hint`}>{S.stageActive.replace("{a}", active)}</span>
    </div>
  );
}

const PAY_TYPES = ["Gaji", "THR", "Bonus"];

/* StoreItem ber-index-signature sehingga tidak memenuhi constraint generik inBranch;
   intersection ini mempertahankan field sekaligus memuaskan constraint. */
type Branchable = StoreItem & { branch?: string };

interface AllowanceLine {
  label: string;
  amount: number;
}

interface KasbonEntry {
  id: string;
  tanggal: string;
  jumlah: number;
  cicilan: number;
  sisa: number;
}

/* Pola rates dipertahankan dari versi sebelumnya, dikembangkan dengan lapis
   progresif, PTKP per status, dan porsi BPJS perusahaan. */
export interface PayrollRates {
  pphRate: number;
  ptkpMonthly: number;
  bpjsKes: number;
  bpjsTk: number;
  t1Rate: number;
  t1Max: number;
  t2Rate: number;
  t2Max: number;
  t3Rate: number;
  t3Max: number;
  t4Rate: number;
  ptkpTK0: number;
  ptkpK0: number;
  ptkpTang: number;
  bpjsKesPer: number;
}

function normAllowances(v: unknown): AllowanceLine[] {
  if (Array.isArray(v)) {
    return (v as unknown[])
      .map((l) =>
        typeof l === "object" && l !== null
          ? { label: String((l as { label?: unknown }).label ?? "Tunjangan"), amount: Number((l as { amount?: unknown }).amount ?? 0) }
          : { label: "Tunjangan", amount: Number(l ?? 0) },
      )
      .filter((l) => l.amount > 0 || l.label.trim().length > 0);
  }
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return [];
  return [{ label: "Tunjangan", amount: n }];
}

function sumAllowances(v: unknown): number {
  return normAllowances(v).reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

function normKasbon(e: StoreItem): KasbonEntry[] {
  if (!Array.isArray(e.kasbon)) return [];
  return (e.kasbon as unknown[])
    .filter((k): k is Record<string, unknown> => typeof k === "object" && k !== null)
    .map((k) => ({
      id: String(k.id ?? ""),
      tanggal: String(k.tanggal ?? ""),
      jumlah: Number(k.jumlah ?? 0),
      cicilan: Number(k.cicilan ?? 0),
      sisa: Number(k.sisa ?? 0),
    }));
}

function kasbonSisa(e: StoreItem): number {
  return normKasbon(e).reduce((s, k) => s + Math.max(0, Number(k.sisa) || 0), 0);
}

function rowType(p: StoreItem): string {
  return String(p.type ?? "Gaji");
}

function bpjsKarOf(p: StoreItem): { kes: number; tk: number } {
  return {
    kes: Number(p.bpjsKesKar ?? p.bpjsKes ?? 0),
    tk: Number(p.bpjsTkKar ?? p.bpjsTk ?? 0),
  };
}

/* PPh tahunan atas penghasilan setahun (progresif lapis). Dipakai gaji
   (disetahunkan dari bruto bulanan) dan penghasilan tak teratur (selisih). */
function annualPph(penghasilanSetahun: number, ptkpStatus: string, dependents: number, r: PayrollRates): number {
  const base = String(ptkpStatus).startsWith("K/") ? r.ptkpK0 : r.ptkpTK0;
  const ptkp = base + Math.min(3, Math.max(0, dependents)) * r.ptkpTang;
  const pkp = Math.max(0, penghasilanSetahun - ptkp);
  if (pkp <= 0) return 0;
  const lapis: Array<[number, number]> = [
    [r.t1Max, r.t1Rate],
    [r.t2Max, r.t2Rate],
    [r.t3Max, r.t3Rate],
    [Number.POSITIVE_INFINITY, r.t4Rate],
  ];
  let sisa = pkp;
  let bawah = 0;
  let tahunan = 0;
  for (const [atas, tarif] of lapis) {
    if (sisa <= 0) break;
    const kena = Math.min(sisa, atas - bawah);
    if (kena > 0) tahunan += kena * (tarif / 100);
    sisa -= kena;
    bawah = atas;
  }
  return tahunan;
}

/* PPh21 progresif tahunan disetahunkan: bruto×12 - PTKP → lapis T1-T4 → /12. */
function calcPphProgressive(bruto: number, ptkpStatus: string, dependents: number, r: PayrollRates): number {
  return Math.round(annualPph(Math.max(0, bruto) * 12, ptkpStatus, dependents, r) / 12);
}

/* PPh atas penghasilan tak teratur (THR/bonus): selisih PPh tahunan
   dengan vs tanpa komponen itu. Harian: flat 5% (konsisten tarif harian). */
function calcPphIrregular(baseMonthly: number, irregular: number, emp: StoreItem, r: PayrollRates): number {
  const irr = Math.max(0, Number(irregular) || 0);
  if (irr <= 0) return 0;
  if (String(emp.tipe ?? "") === "Harian") return Math.round(irr * 0.05);
  const base = Math.max(0, Number(baseMonthly) || 0);
  const dep = Number(emp.dependents ?? 0);
  const st = String(emp.ptkpStatus ?? "TK/0");
  return Math.max(0, Math.round(annualPph(base * 12 + irr, st, dep, r) - annualPph(base * 12, st, dep, r)));
}

/* Karyawan Harian: basic dianggap upah harian. ≤450rb/hari bebas, selebihnya 5%. */
function calcPphHarian(upahHarian: number, hadirDays: number): number {
  const lebih = Math.max(0, upahHarian - 450000);
  if (lebih <= 0 || hadirDays <= 0) return 0;
  return Math.round(0.05 * lebih * hadirDays);
}

function calcOvertimePay(basic: number, records: StoreItem[], divisor: number): number {
  if (basic <= 0 || divisor <= 0) return 0;
  const rate = basic / divisor;
  let total = 0;
  records.forEach((a) => {
    const h = Number(a.overtime || 0);
    if (h <= 0) return;
    total += rate * (Math.min(h, 2) * 1.5 + Math.min(Math.max(h - 2, 0), 2) * 2 + Math.max(h - 4, 0) * 3);
  });
  return Math.round(total);
}

/* Masa kerja dalam bulan pada suatu periode YYYY-MM (inklusif, join bulan berjalan = 1). */
function monthsWorked(joinISO: string, periodYM: string): number {
  const jm = String(joinISO).match(/^(\d{4})-(\d{2})/);
  const pm = String(periodYM).match(/^(\d{4})-(\d{2})/);
  if (!jm || !pm) return 0;
  const n = (Number(pm[1]) * 12 + Number(pm[2])) - (Number(jm[1]) * 12 + Number(jm[2])) + 1;
  return Math.max(0, n);
}

/* Pesangon sederhana: 1 bln per tahun masa kerja (maks 9) + UPMK proporsional + UPH 15%. */
function calcPesangon(masaKerja: number, upah: number): { pesMonths: number; pesangon: number; upmkMonths: number; upmk: number; uph: number; total: number } {
  const mk = Math.max(0, masaKerja);
  const u = Math.max(0, upah);
  const pesMonths = mk < 1 ? 1 : Math.min(9, Math.floor(mk) + 1);
  const upmkMonths = mk < 3 ? 0 : mk < 6 ? 2 : mk < 9 ? 3 : mk < 12 ? 4 : mk < 15 ? 5 : mk < 18 ? 6 : mk < 21 ? 7 : mk < 24 ? 8 : 10;
  const pesangon = pesMonths * u;
  const upmk = upmkMonths * u;
  const uph = Math.round(0.15 * (pesangon + upmk));
  return { pesMonths, pesangon, upmkMonths, upmk, uph, total: pesangon + upmk + uph };
}

export default function Payroll() {
  const { data, add, update, remove, log, inBranch } = useStore();
  const { locale } = useT();
  const S = n_dry[locale];
  const advLabel: Record<string, string> = { Draft: S.advCalc, Dihitung: S.advApprove, Disetujui: S.advPay };
  const modAlert = useModuleAlert("payroll");
  const flash = useNotifFlash();
  const deepParams = useDeepLinkParams();
  const [tab, setTab] = useState("Gaji");
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  /* Resolve id deep-link. Tab tujuan diturunkan dari rowType baris itu -
     id payroll tidak pernah memberi tahu tabnya sendiri. */
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const row = data.payroll.find((p) => ids.includes(String(p.id)));
    if (!row) { flashPick(flash, ids, -1, () => {}, 100); return; }
    const targetTab = rowType(row) === "Gaji" ? "Gaji" : "THR & Bonus";
    const needTab = tab !== targetTab;
    const needStage = (targetTab === "Gaji" ? gajiStage : thrStage) !== "Semua";
    const needPeriod = String(row.period ?? "") !== "" && String(row.period) !== period;
    if (!needTab && !needStage && !needPeriod) { flashPick(flash, ids, -1, () => {}, 100); return; }
    if (needTab) setTab(targetTab);
    if (needStage) {
      if (targetTab === "Gaji") setGajiStage("Semua");
      else setThrStage("Semua");
    }
    if (needPeriod) setPeriod(String(row.period));
    window.setTimeout(() => flashPick(flash, ids, -1, () => {}, 100), 250);
  };
  const pickNotif = (rowId: string) => pickNotifIds([rowId]);
  useDeepLinkTarget(deepParams.tab, deepParams.highlight, setTab, pickNotifIds);
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [editTarget, setEditTarget] = useState<StoreItem | null>(null);
  const [editForm, setEditForm] = useState({ basic: "", overtimePay: "", deductions: "" });
  const [editLines, setEditLines] = useState<AllowanceLine[]>([]);
  const [payTarget, setPayTarget] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState({ date: todayISO(), method: "Transfer", ref: "" });
  const [confirmAdv, setConfirmAdv] = useState<StoreItem | null>(null);
  const [revertTarget, setRevertTarget] = useState<StoreItem | null>(null);
  const [gajiStage, setGajiStage] = useState<string>("Semua");
  const [thrStage, setThrStage] = useState<string>("Semua");
  const [slipTarget, setSlipTarget] = useState<StoreItem | null>(null);
  const [slipSign, setSlipSign] = useState({ received: false, date: todayISO() });
  // Hapus THR/bonus & kasbon via ConfirmModal + daftar pemakai (blokir bila dipakai).
  const [delPay, setDelPay] = useState<StoreItem | null>(null);
  const [delKasbon, setDelKasbon] = useState<{ e: StoreItem; kasbonId: string } | null>(null);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const pdfDoc = usePdfDoc();
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  /* ---------- THR & bonus ---------- */
  const [bonusForm, setBonusForm] = useState({ employeeId: "", nominal: "", keterangan: "" });
  // Ubah THR/bonus HANYA bila Draft: nominal+keterangan (Bonus) / keterangan (THR, nominal turunan basis×masa).
  const [bonusEdit, setBonusEdit] = useState<StoreItem | null>(null);
  const [bonusEditForm, setBonusEditForm] = useState({ nominal: "", keterangan: "" });

  /* ---------- pesangon ---------- */
  const [showPesangon, setShowPesangon] = useState(false);
  const [pesForm, setPesForm] = useState({ masaKerja: "5", upah: "6500000" });

  /* ---------- kasbon ---------- */
  const [kasbonForm, setKasbonForm] = useState({ employeeId: "", tanggal: todayISO(), jumlah: "", cicilan: "" });

  const activeEmps = useMemo(
    () => inBranch(data.employees as Branchable[]).filter((e) => e.status === "Aktif"),
    [data.employees, inBranch],
  );

  const rows = useMemo(
    () => inBranch(data.payroll.filter((p) => p.period === period)).sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId))),
    [data.payroll, period, inBranch],
  );
  const gajiRows = useMemo(() => rows.filter((p) => rowType(p) === "Gaji"), [rows]);
  const thrRows = useMemo(() => rows.filter((p) => rowType(p) === "THR"), [rows]);
  const bonusRows = useMemo(() => rows.filter((p) => rowType(p) === "Bonus"), [rows]);
  const stageCounts = (list: StoreItem[]): Record<string, number> => {
    const c: Record<string, number> = { Draft: 0, Dihitung: 0, Disetujui: 0, Dibayar: 0 };
    for (const p of list) {
      const s = String(p.status ?? "");
      if (s in c) c[s] += 1;
    }
    return c;
  };
  const gajiShown = useMemo(
    () => (gajiStage === "Semua" ? gajiRows : gajiRows.filter((p) => String(p.status) === gajiStage)),
    [gajiRows, gajiStage],
  );
  const thrBonusAll = useMemo(() => [...thrRows, ...bonusRows], [thrRows, bonusRows]);
  const thrShown = useMemo(
    () => (thrStage === "Semua" ? thrBonusAll : thrBonusAll.filter((p) => String(p.status) === thrStage)),
    [thrBonusAll, thrStage],
  );

  const rates: PayrollRates = {
    pphRate: getSetting(data, "PPH21_T1_RATE", 5),
    ptkpMonthly: getSetting(data, "PTKP_TK0", 54000000) / 12,
    bpjsKes: getSetting(data, "BPJS_KES_KAR", 1),
    bpjsTk: getSetting(data, "BPJS_TK_KAR", 2),
    t1Rate: getSetting(data, "PPH21_T1_RATE", 5),
    t1Max: getSetting(data, "PPH21_T1_MAX", 60000000),
    t2Rate: getSetting(data, "PPH21_T2_RATE", 15),
    t2Max: getSetting(data, "PPH21_T2_MAX", 250000000),
    t3Rate: getSetting(data, "PPH21_T3_RATE", 25),
    t3Max: getSetting(data, "PPH21_T3_MAX", 500000000),
    t4Rate: getSetting(data, "PPH21_T4_RATE", 30),
    ptkpTK0: getSetting(data, "PTKP_TK0", 54000000),
    ptkpK0: getSetting(data, "PTKP_K0", 58500000),
    ptkpTang: getSetting(data, "PTKP_TANGGUNGAN", 4500000),
    bpjsKesPer: getSetting(data, "BPJS_KES_PER", 4),
  };
  const otDivisor = getSetting(data, "OVERTIME_DIV", 173);

  const empOf = (id: string): StoreItem | undefined => data.employees.find((e) => e.id === id);
  const empNameOf = (id: string): string => empOf(id)?.name ?? id;

  const totals = useMemo(() => {
    const bruto = gajiRows.reduce((s, p) => s + Number(p.basic || 0) + sumAllowances(p.allowances) + Number(p.overtimePay || 0), 0);
    const net = gajiRows.reduce((s, p) => s + Number(p.net || 0), 0);
    const pph21 = gajiRows.reduce((s, p) => s + Number(p.pph21 || 0), 0);
    const bpjs = gajiRows.reduce((s, p) => s + bpjsKarOf(p).kes + bpjsKarOf(p).tk, 0);
    const thr = thrRows.reduce((s, p) => s + Number(p.net || 0), 0);
    const bonus = bonusRows.reduce((s, p) => s + Number(p.net || 0), 0);
    return { bruto, net, pph21, bpjs, thr, bonus };
  }, [gajiRows, thrRows, bonusRows]);

  const buildComponents = (
    emp: StoreItem,
    basic: number,
    lines: AllowanceLine[],
    overtimePay: number,
    manualDed: number,
    kasbonPot: number,
    hadirDays: number,
  ) => {
    const allowTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const bruto = basic + allowTotal + overtimePay;
    const isHarian = String(emp.tipe ?? "") === "Harian";
    const pph21 = isHarian
      ? calcPphHarian(basic, hadirDays)
      : calcPphProgressive(bruto, String(emp.ptkpStatus ?? "TK/0"), Number(emp.dependents ?? 0), rates);
    const bpjsKesKar = Math.round(basic * (rates.bpjsKes / 100));
    const bpjsKesPer = Math.round(basic * (rates.bpjsKesPer / 100));
    const bpjsTkKar = Math.round(basic * (rates.bpjsTk / 100));
    const deductions = manualDed + kasbonPot;
    const net = bruto - deductions - pph21 - bpjsKesKar - bpjsTkKar;
    return { allowTotal, bruto, pph21, bpjsKesKar, bpjsKesPer, bpjsTkKar, deductions, net };
  };

  const generate = async () => {
    const existing = new Set(gajiRows.map((p) => String(p.employeeId)));
    const fresh = activeEmps.filter((e) => !existing.has(e.id));
    if (fresh.length === 0) {
      toast(S.tAllDrafted, "info");
      return;
    }
    for (const e of fresh) {
      const basic = Number(e.basic || 0);
      const lines = normAllowances(e.allowances);
      if (lines.length === 0) lines.push({ label: "Tunjangan", amount: 0 });
      /* Kehadiran tetap dihitung walau lembur belum disetujui; hanya upah
         lembur yang dinolkan bila otStatus bukan "Disetujui". */
      const recsHadir = data.attendance.filter(
        (a) =>
          a.employeeId === e.id &&
          String(a.date).startsWith(period) &&
          a.status === "Hadir",
      );
      const recsOT = recsHadir.filter(
        (a) => Number(a.overtime || 0) === 0 || String(a.otStatus ?? "") === "Disetujui",
      );
      const hadirDays = recsHadir.length;
      const overtimePay = calcOvertimePay(basic, recsOT, otDivisor);
      /* Potongan cuti tak dibayar: hari Unpaid yang sudah final × upah harian
         (basic/25). "Disetujui Atasan" dianggap final untuk potongan ini. */
      const unpaidDays = (data.leaves ?? [])
        .filter(
          (l) =>
            l.employeeId === e.id &&
            String(l.type ?? "") === "Unpaid" &&
            ["Disetujui", "Disetujui Atasan"].includes(String(l.status ?? "")) &&
            String(l.from ?? "").slice(0, 7) === period,
        )
        .reduce((s, l) => s + (Number(l.days) || 0), 0);
      const unpaidPot = basic > 0 && unpaidDays > 0 ? Math.round((basic / 25) * unpaidDays) : 0;
      /* Kasbon TIDAK dipotong saat generate Draft - potongan cicilan baru
         diterapkan saat Bayar (confirmPay). kasbonPot draft selalu 0. */
      const kasbonPot = 0;
      try {
        const c = buildComponents(e, basic, lines, overtimePay, unpaidPot, kasbonPot, hadirDays);
    await add(
          "payroll",
          {
            employeeId: e.id,
            period,
            type: "Gaji",
            basic,
            allowances: lines,
            overtimePay,
            deductions: c.deductions,
            kasbonPot,
            unpaidDays,
            unpaidPot,
            hadirDays,
            pph21: c.pph21,
            bpjsKesKar: c.bpjsKesKar,
            bpjsKesPer: c.bpjsKesPer,
            bpjsTkKar: c.bpjsTkKar,
            net: c.net,
            status: "Draft",
            paidAt: "",
            branch: String(e.branch ?? ""),
          },
          undefined,
        );
      } catch {
        toast(S.tGenFail.replace("{a}", String(e.name ?? e.id)), "info");
      }
    }
    log("generate payroll", `${period} · ${fresh.length} draft`, "Payroll");
    toast(S.tDraftsMade.replace("{n}", String(fresh.length)).replace("{a}", fmtBulan(period)));
  };

  /* Alur maju: validasi + konfirmasi sebelum pindah tahap. Net ≤ 0 tetap
     boleh maju, tetapi wajib lewat konfirmasi peringatan. Dibayar lewat
     modal bukti (kas + jurnal otomatis). */
  const askAdvance = (p: StoreItem) => {
    const next = NEXT_STATUS[String(p.status)];
    if (!next) return;
    if (next === "Dibayar") {
      setPayTarget(p);
      setProof({ date: todayISO(), method: "Transfer", ref: "" });
      return;
    }
    setConfirmAdv(p);
  };

  const doAdvance = async () => {
    if (!confirmAdv) return;
    const next = NEXT_STATUS[String(confirmAdv.status)];
    if (!next || next === "Dibayar") {
      setConfirmAdv(null);
      return;
    }
    try {
    await update("payroll", confirmAdv.id, { status: next });
    log("memproses payroll", `${confirmAdv.id} ${confirmAdv.status} → ${next}`, "Payroll");
    toast(S.movedTo.replace("{a}", String(confirmAdv.id)).replace("{b}", next));
    setConfirmAdv(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const doRevert = async () => {
    if (!revertTarget) return;
    try {
    await update("payroll", revertTarget.id, { status: "Draft" });
    log("mengembalikan payroll ke Draft", `${revertTarget.id} ${revertTarget.status} → Draft`, "Payroll");
    toast(`${revertTarget.id} dikembalikan ke Draft`);
    setRevertTarget(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openEdit = (p: StoreItem) => {
    setEditTarget(p);
    setEditForm({
      basic: String(p.basic ?? 0),
      overtimePay: String(p.overtimePay ?? 0),
      deductions: String(Number(p.deductions || 0) - Number(p.kasbonPot || 0)),
    });
    const lines = normAllowances(p.allowances);
    setEditLines(lines.length > 0 ? lines : [{ label: "Tunjangan", amount: 0 }]);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const emp = empOf(String(editTarget.employeeId));
    if (!emp) {
      toast(S.tEmpMissing, "info");
      return;
    }
    const basic = Number(editForm.basic);
    const overtimePay = Number(editForm.overtimePay);
    const manualDed = Number(editForm.deductions);
    if ([basic, overtimePay, manualDed].some((n) => Number.isNaN(n) || n < 0)) {
      toast(S.tCompInvalid, "info");
      return;
    }
    if (editLines.some((l) => Number.isNaN(Number(l.amount)) || Number(l.amount) < 0)) {
      toast(S.tAllowanceInvalid, "info");
      return;
    }
    const lines = editLines.map((l) => ({ label: l.label.trim() || "Tunjangan", amount: Number(l.amount) || 0 }));
    const kasbonPot = Number(editTarget.kasbonPot || 0);
    const hadirDays = Number(editTarget.hadirDays ?? 0);
    const c = buildComponents(emp, basic, lines, overtimePay, manualDed, kasbonPot, hadirDays);
    try {
    await update("payroll", editTarget.id, {
      basic,
      allowances: lines,
      overtimePay,
      deductions: c.deductions,
      pph21: c.pph21,
      bpjsKesKar: c.bpjsKesKar,
      bpjsKesPer: c.bpjsKesPer,
      bpjsTkKar: c.bpjsTkKar,
      net: c.net,
    });
    toast(S.tUpdated.replace("{a}", String(editTarget.id)).replace("{b}", fmtRupiah(c.net)));
    setEditTarget(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    if (!proof.date) {
      toast(S.tDateReq, "info");
      return;
    }
    if (!proof.ref.trim()) {
      toast(S.tRefReq, "info");
      return;
    }
    const slipId = payTarget.id;
    try {
      /* Kasbon dipotong saat Bayar: min(cicilan, sisa) per entri, kurangi sisa
         karyawan, lalu sesuaikan potongan + net slip ini. */
      let kasbonPot = Number(payTarget.kasbonPot || 0);
      let deductions = Number(payTarget.deductions || 0);
      let net = Number(payTarget.net || 0);
      const empKas = empOf(String(payTarget.employeeId));
      const kasbon = empKas ? normKasbon(empKas) : [];
      if (kasbon.length > 0 && String(payTarget.status ?? "") !== "Dibayar") {
        let pot = 0;
        const next = kasbon.map((k) => {
          const inst = Math.min(Math.max(0, Number(k.cicilan) || 0), Math.max(0, Number(k.sisa) || 0));
          pot += inst;
          return { ...k, sisa: Math.max(0, Number(k.sisa) - inst) };
        });
        if (pot > 0) {
          await update("employees", String(payTarget.employeeId), { kasbon: next });
          kasbonPot += pot;
          deductions += pot;
          net -= pot;
        }
      }
      await update("payroll", payTarget.id, {
        status: "Dibayar",
        paidAt: proof.date,
        paidMethod: proof.method,
        paidRef: proof.ref.trim(),
        kasbonPot,
        deductions,
        net,
      });
      log("membayar payroll", `${payTarget.id} via ${proof.method} ${proof.ref.trim()}${kasbonPot > 0 ? ` · kasbon ${fmtRupiah(kasbonPot)}` : ""}`, "Payroll");
      await postCashJournal({
        add,
        journals: data.journals ?? [],
        branch: String(payTarget.branch ?? ""),
        dokumen: `PAYROLL-${rowType(payTarget)}-${String(payTarget.period ?? period)}-${String(payTarget.employeeId ?? "")}`,
        date: proof.date,
        uraian: `Bayar ${rowType(payTarget)} ${payTarget.id} via ${proof.ref.trim()}`,
        db: "6-002",
        kr: kasKodeOf(proof.method),
        amount: Math.max(0, net),
      });
      toast(S.tPaid.replace("{a}", String(payTarget.id)));
      setPayTarget(null);
    } catch {
      toast(S.tPayFail.replace("{a}", slipId), "info");
    }
  };

  const removeRow = async (p: StoreItem) => {
    try {
      /* Hapus Draft Gaji: kembalikan sisa kasbon bila slip ini sudah telanjur
         memotong (data lama yang potong saat generate). */
      let restored = 0;
      const refund = String(p.status ?? "") === "Draft" ? Math.max(0, Number(p.kasbonPot || 0)) : 0;
      const empDel = refund > 0 ? empOf(String(p.employeeId)) : undefined;
      if (empDel && refund > 0) {
        let left = refund;
        const next = normKasbon(empDel).map((k) => {
          if (left <= 0) return k;
          const room = Math.max(0, Number(k.jumlah || 0) - Number(k.sisa || 0));
          const back = Math.min(room, left);
          left -= back;
          restored += back;
          return { ...k, sisa: Number(k.sisa || 0) + back };
        });
        if (restored > 0) await update("employees", empDel.id, { kasbon: next });
      }
      await remove("payroll", p.id);
      log("menghapus payroll", `${p.id} · ${rowType(p)}${restored > 0 ? ` · kasbon kembali ${fmtRupiah(restored)}` : ""}`, "Payroll");
      toast(S.tRowDeleted.replace("{a}", String(p.id)) + (restored > 0 ? ` · kasbon kembali ${fmtRupiah(restored)}` : ""));
    } catch (e) {
      toast(e instanceof Error ? e.message : S.tRowDeleteFail, "info");
    }
  };

  /* ---------- THR ---------- */
  const generateTHR = async () => {
    const existing = new Set(thrRows.map((p) => String(p.employeeId)));
    const fresh = activeEmps.filter((e) => !existing.has(e.id));
    if (fresh.length === 0) {
      toast(S.tThrDone, "info");
      return;
    }
    for (const e of fresh) {
      try {
      const basic = Number(e.basic || 0);
      const allowAvg = sumAllowances(e.allowances);
      const n = monthsWorked(String(e.join ?? ""), period);
      const thr = Math.round(((basic + allowAvg) * Math.min(n, 12)) / 12);
      const pphThr = calcPphIrregular(basic + allowAvg, thr, e, rates);
      await add(
        "payroll",
        {
          employeeId: e.id,
          period,
          type: "THR",
          basic: 0,
          allowances: [],
          overtimePay: 0,
          deductions: 0,
          kasbonPot: 0,
          pph21: pphThr,
          bpjsKesKar: 0,
          bpjsKesPer: 0,
          bpjsTkKar: 0,
          net: thr - pphThr,
          thrBase: basic + allowAvg,
          masaBulan: Math.min(n, 12),
          status: "Draft",
          paidAt: "",
          branch: String(e.branch ?? ""),
        },
        undefined,
      );
      } catch (err) { toast(err instanceof Error ? err.message : S.saveFail, "info"); }
    }
    log("hitung THR", `${period} · ${fresh.length} penerima`, "Payroll");
    toast(S.tThrMade.replace("{n}", String(fresh.length)).replace("{a}", fmtBulan(period)));
  };

  const saveBonus = async () => {
    const emp = empOf(bonusForm.employeeId);
    if (!emp) {
      toast(S.tPickEmp, "info");
      return;
    }
    const nominal = Number(bonusForm.nominal);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      toast(S.tBonusInvalid, "info");
      return;
    }
    const bonusBase = Number(emp.basic || 0) + sumAllowances(emp.allowances);
    const pphBonus = calcPphIrregular(bonusBase, nominal, emp, rates);
    try {
    await add(
      "payroll",
      {
        employeeId: emp.id,
        period,
        type: "Bonus",
        basic: 0,
        allowances: [],
        overtimePay: 0,
        deductions: 0,
        kasbonPot: 0,
        pph21: pphBonus,
        bpjsKesKar: 0,
        bpjsKesPer: 0,
        bpjsTkKar: 0,
        net: Math.round(nominal) - pphBonus,
        bonusNote: bonusForm.keterangan.trim() || "Bonus",
        status: "Draft",
        paidAt: "",
        branch: String(emp.branch ?? ""),
      },
      { action: "mencatat bonus", module: "Payroll" },
    );
    toast(S.tBonusSaved.replace("{a}", fmtRupiah(nominal)).replace("{b}", String(emp.name)));
    setBonusForm({ employeeId: "", nominal: "", keterangan: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openBonusEdit = (p: StoreItem) => {
    setBonusEdit(p);
    setBonusEditForm({
      nominal: String(Number(p.net || 0) + Number(p.pph21 || 0)),
      keterangan: String(p.bonusNote ?? ""),
    });
  };

  const saveBonusEdit = async () => {
    if (!bonusEdit) return;
    if (String(bonusEdit.status) !== "Draft") { toast(locale === "en" ? "Only Draft rows can be edited" : "Hanya baris Draft yang bisa diubah", "info"); return; }
    const emp = empOf(String(bonusEdit.employeeId));
    if (!emp) { toast(S.tPickEmp, "info"); return; }
    const note = bonusEditForm.keterangan.trim() || "Bonus";
    try {
      if (rowType(bonusEdit) === "Bonus") {
        const nominal = Number(bonusEditForm.nominal);
        if (!Number.isFinite(nominal) || nominal <= 0) { toast(S.tBonusInvalid, "info"); return; }
        const bonusBase = Number(emp.basic || 0) + sumAllowances(emp.allowances);
        const pphBonus = calcPphIrregular(bonusBase, nominal, emp, rates);
        await update("payroll", bonusEdit.id, { pph21: pphBonus, net: Math.round(nominal) - pphBonus, bonusNote: note });
      } else {
        await update("payroll", bonusEdit.id, { bonusNote: note });
      }
      log("mengubah THR/bonus", `${bonusEdit.id} · ${note}`, "Payroll");
      toast(S.tUpdated.replace("{a}", String(bonusEdit.id)).replace("{b}", fmtRupiah(Number(bonusEdit.net || 0))));
      setBonusEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ---------- kasbon ---------- */
  const saveKasbon = async () => {
    const emp = empOf(kasbonForm.employeeId);
    if (!emp) {
      toast(S.tPickEmp, "info");
      return;
    }
    const jumlah = Number(kasbonForm.jumlah);
    const cicilan = Number(kasbonForm.cicilan);
    if (!Number.isFinite(jumlah) || jumlah <= 0) {
      toast(S.tKasbonInvalid, "info");
      return;
    }
    if (!Number.isFinite(cicilan) || cicilan <= 0) {
      toast(S.tInstallInvalid, "info");
      return;
    }
    if (!kasbonForm.tanggal) {
      toast(S.tKasbonDateReq, "info");
      return;
    }
    const entry: KasbonEntry = {
      id: `KSB-${Date.now().toString(36).toUpperCase()}`,
      tanggal: kasbonForm.tanggal,
      jumlah: Math.round(jumlah),
      cicilan: Math.round(cicilan),
      sisa: Math.round(jumlah),
    };
    try {
    await update("employees", emp.id, { kasbon: [...normKasbon(emp), entry] });
    log("mencatat kasbon", `${entry.id} · ${emp.name} · ${fmtRupiah(entry.jumlah)}`, "Payroll");
    toast(S.tKasbonSaved.replace("{a}", fmtRupiah(entry.jumlah)).replace("{b}", String(emp.name)));
    setKasbonForm({ employeeId: "", tanggal: todayISO(), jumlah: "", cicilan: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const removeKasbon = async (emp: StoreItem, kasbonId: string) => {
    try {
    await update("employees", emp.id, { kasbon: normKasbon(emp).filter((k) => k.id !== kasbonId) });
    log("menghapus kasbon", `${kasbonId} · ${emp.name}`, "Payroll");
    toast(S.tKasbonDeleted.replace("{a}", kasbonId));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ---------- export ---------- */
  const exportRekap = () => {
    const head = ["ID", "Karyawan", "Periode", "Pokok", "Tunjangan", "Lembur", "Kasbon", "Potongan Manual", "PPh21", "BPJS Kes (Kar)", "BPJS TK-JHT (Kar)", "BPJS Kes (Per, info)", "Net", "Status"];
    const body = gajiRows.map((p) => {
      const b = bpjsKarOf(p);
      return [
        p.id,
        empNameOf(String(p.employeeId)),
        p.period,
        Number(p.basic || 0),
        sumAllowances(p.allowances),
        Number(p.overtimePay || 0),
        Number(p.kasbonPot || 0),
        Number(p.deductions || 0) - Number(p.kasbonPot || 0),
        Number(p.pph21 || 0),
        b.kes,
        b.tk,
        Number(p.bpjsKesPer || 0),
        Number(p.net || 0),
        p.status,
      ];
    });
    void exportExcel([head, ...body], `rekap-payroll-${period}`, "Rekap");
    toast(S.tRekapDone);
  };

  const exportThrBonus = () => {
    const head = ["ID", "Karyawan", "Periode", "Tipe", "Nominal", "Keterangan", "Status"];
    const body = [...thrRows, ...bonusRows].map((p) => [
      p.id,
      empNameOf(String(p.employeeId)),
      p.period,
      rowType(p),
      Number(p.net || 0),
      rowType(p) === "THR" ? `Basis ${fmtRupiah(Number(p.thrBase || 0))} × ${Number(p.masaBulan || 0)}/12` : String(p.bonusNote ?? ""),
      p.status,
    ]);
    void exportExcel([head, ...body], `thr-bonus-${period}`, "THR Bonus");
    toast(S.tThrBonusDone);
  };

  const openSlip = (p: StoreItem) => {
    setSlipTarget(p);
    const sign = (p.slipSign ?? {}) as { received?: boolean; date?: string };
    setSlipSign({ received: Boolean(sign.received), date: String(sign.date ?? todayISO()) });
  };

  const saveSlipSign = async () => {
    if (!slipTarget) return;
    if (slipSign.received && !slipSign.date) {
      toast(S.tReceiveDateReq, "info");
      return;
    }
    try {
    await update("payroll", slipTarget.id, { slipSign: { received: slipSign.received, date: slipSign.received ? slipSign.date : "" } });
    log("tanda terima slip", `${slipTarget.id} · ${slipSign.received ? `diterima ${slipSign.date}` : "belum diterima"}`, "Payroll");
    toast(S.tSignSaved.replace("{a}", String(slipTarget.id)));
    setSlipTarget(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* Slip gaji dibuat server dari baris `payroll`: komponen, potongan, dan
     nominal diambil dari data yang disimpan, bukan dari state layar. Slip
     diberikan ke karyawan dan jadi bukti hak Finances - kalau angkanya
     dirakit ulang di browser, slip bisa berbeda dari payroll yang tercatat. */
  const exportSlipPdf = async (p: StoreItem): Promise<void> => {
    const id = String(p.id);
    if (!pdfServerReady()) {
      toast(S.saveFail, "info");
      return;
    }
    const done = await pdfDoc.request({ kind: "slipGaji", id, locale }, `slip-${id}`, false);
    if (done) toast(S.tSlipPdfDone.replace("{a}", id));
  };

  const exportSlip = (p: StoreItem) => {
    const b = bpjsKarOf(p);
    const emp = empOf(String(p.employeeId));
    const isHarian = String(emp?.tipe ?? "") === "Harian";
    const sign = (p.slipSign ?? {}) as { received?: boolean; date?: string };
    const head = ["Komponen", "Nilai"];
    const body = [
      ["ID", p.id],
      ["Karyawan", empNameOf(String(p.employeeId))],
      ["Periode", fmtBulan(String(p.period))],
      ["Tipe", rowType(p)],
      [isHarian ? "Upah harian" : "Gaji pokok", fmtRupiah(Number(p.basic || 0))],
      ...normAllowances(p.allowances).map((l) => [`Tunjangan - ${l.label}`, fmtRupiah(Number(l.amount) || 0)] as string[]),
      ["Upah lembur", fmtRupiah(Number(p.overtimePay || 0))],
      ["Cicilan kasbon", fmtRupiah(Number(p.kasbonPot || 0))],
      ["Potongan manual", fmtRupiah(Number(p.deductions || 0) - Number(p.kasbonPot || 0))],
      [isHarian ? "PPh harian (5% × kelebihan 450rb × hari hadir)" : "PPh 21 (progresif disetahunkan)", fmtRupiah(Number(p.pph21 || 0))],
      [`BPJS Kesehatan karyawan (${rates.bpjsKes}%)`, fmtRupiah(b.kes)],
      [`BPJS Ketenagakerjaan - JHT karyawan (${rates.bpjsTk}%)`, fmtRupiah(b.tk)],
      [`BPJS Kesehatan perusahaan (${rates.bpjsKesPer}%) - info, tidak memotong gaji`, fmtRupiah(Number(p.bpjsKesPer || 0))],
      [rowType(p) === "Gaji" ? "Gaji bersih" : "Nominal diterima", fmtRupiah(Number(p.net || 0))],
      ["Status", String(p.status)],
      ["Tanda terima", sign.received ? `Sudah diterima ${fmtTanggal(sign.date ?? "")}` : "Belum diterima"],
    ];
    void exportExcel([head, ...body], `slip-${p.id}`, "Slip");
    toast(S.tSlipDone.replace("{a}", String(p.id)));
  };

  /* ---------- pesangon ---------- */
  const pesHitung = calcPesangon(Number(pesForm.masaKerja || 0), Number(pesForm.upah || 0));
  const exportPesangon = () => {
    const head = ["Komponen", "Nilai"];
    const body = [
      ["Masa kerja (tahun)", Number(pesForm.masaKerja || 0)],
      ["Upah bulanan", fmtRupiah(Number(pesForm.upah || 0))],
      [`Pesangon (${pesHitung.pesMonths}× upah, maks 9)`, fmtRupiah(pesHitung.pesangon)],
      [`UPMK (${pesHitung.upmkMonths}× upah)`, fmtRupiah(pesHitung.upmk)],
      ["UPH (15% × pesangon+UPMK)", fmtRupiah(pesHitung.uph)],
      ["Total", fmtRupiah(pesHitung.total)],
    ];
    void exportExcel([head, ...body], "kalkulator-pesangon", "Pesangon");
    log("hitung pesangon", `mk ${pesForm.masaKerja} thn · total ${fmtRupiah(pesHitung.total)}`, "Payroll");
    toast(S.tPesangonDone);
  };

  return (
    <div>
      <PageHeader
        title={S.payPageTitle}
        subtitle={S.payPageSubtitle}
        icon={<Wallet className="h-5 w-5" />}
        actions={
          tab === "Gaji" ? (
            <>
              <button className="btn-secondary" onClick={() => setShowPesangon(true)}>{S.btnPesangon}</button>
              <button className="btn-secondary" onClick={exportRekap}>
                <Download className="h-4 w-4" /> {S.btnExportRekap}
              </button>
              <AsyncButton className="btn-primary-gradient" onAction={generate}>{S.btnGenerate.replace("{a}", fmtBulan(period))}</AsyncButton>
            </>
          ) : tab === "THR & Bonus" ? (
            <>
              <button className="btn-secondary" onClick={exportThrBonus}>
                <Download className="h-4 w-4" /> {S.btnExportThr}
              </button>
              <button className="btn-primary-gradient" onClick={generateTHR}>{S.btnCalcThr.replace("{a}", fmtBulan(period))}</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => setShowPesangon(true)}>{S.btnPesangon}</button>
          )
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiBruto} value={fmtRupiah(totals.bruto)} hint={S.kpiPeriod.replace("{a}", fmtBulan(period))} chip="navy" />
        <KpiCard label={S.kpiNet} value={fmtRupiah(totals.net)} hint={S.kpiSlips.replace("{n}", String(gajiRows.length))} chip="teal" />
        <KpiCard label={S.kpiPph} value={fmtRupiah(totals.pph21)} hint={S.kpiPphHint} chip="amber" />
        <KpiCard label={S.kpiBpjs} value={fmtRupiah(totals.bpjs)} hint={S.kpiBpjsHint.replace("{a}", String(rates.bpjsKes)).replace("{b}", String(rates.bpjsTk))} chip="violet" />
      </div>

      <div className="card">
        <Tabs tabs={["Gaji", "THR & Bonus", "Kasbon"]} active={tab} onChange={setTab} labels={{ Gaji: S.tabGaji, "THR & Bonus": S.tabThr, Kasbon: S.tabKasbon }} />
        <div className="p-4">
          {tab === "Gaji" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  {S.lblPeriod}
                  <input type="month" className="input w-auto" value={period} onChange={(e) => { setPeriod(e.target.value); setGajiStage("Semua"); }} />
                </label>
                <span className="text-xs text-steel-400">
                  {S.overtimeInfo.replace("{a}", String(otDivisor))}
                </span>
              </div>
              <StageStrip counts={stageCounts(gajiRows)} active={gajiStage} onPick={setGajiStage} prefix="gaji" />
              <div className="overflow-x-auto p-2">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colId} sortKey="id" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colEmployee} sortKey="emp" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colBasic} sortKey="basic" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colAllowance} sortKey="allow" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colOvertime} sortKey="overtime" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colPph} sortKey="pph" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colBpjs} sortKey="bpjs" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colNet} sortKey="net" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colCreated} sortKey="createdAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colUpdated} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <th className="th">{S.colAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(gajiShown, sort, (row, k) => {
                      const p = row as StoreItem;
                      switch (k) {
                        case "id": return String(p.id ?? "");
                        case "emp": return String(empNameOf(String(p.employeeId ?? "")));
                        case "basic": return Number(p.basic ?? 0);
                        case "allow": return Number(sumAllowances(p.allowances));
                        case "overtime": return Number(p.overtimePay ?? 0);
                        case "pph": return Number(p.pph21 ?? 0);
                        case "bpjs": return Number(bpjsKarOf(p).kes + bpjsKarOf(p).tk);
                        case "net": return Number(p.net ?? 0);
                        case "status": return String(p.status ?? "");
                        case "createdAt": return createdAtOf(p) ?? "";
                        case "updatedAt": return lastTouchedAt(p) ?? "";
                        default: return "";
                      }
                    }).map((p) => (
                      <tr key={p.id} id={notifRowId(String(p.id))} className={rowHighlightClass({ id: String(p.id), flash, notified: notified.has(String(p.id)), base: "hover:bg-surface" })}>
                        <td className="td font-mono text-steel-600">{p.id}</td>
                        <td className="td font-medium text-navy-900">{empNameOf(String(p.employeeId))}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.basic || 0))}</td>
                        <td className="td text-steel-600">{fmtRupiah(sumAllowances(p.allowances))}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.overtimePay || 0))}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.pph21 || 0))}</td>
                        <td className="td text-steel-600">{fmtRupiah(bpjsKarOf(p).kes + bpjsKarOf(p).tk)}</td>
                        <td className="td font-bold text-navy-900">{fmtRupiah(Number(p.net || 0))}</td>
                        <td className="td"><StatusBadge status={String(p.status)} /></td>
                        <td className="td text-xs text-steel-600">{createdAtOf(p) !== null ? fmtTanggal(createdAtOf(p)) : <span className="text-steel-400">-</span>}</td>
                        <td className="td text-xs text-steel-600">{lastTouchedAt(p) !== null ? fmtTanggal(lastTouchedAt(p)) : <span className="text-steel-400">-</span>}</td>
                        <td className="td">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {p.status === "Draft" && (
                              <button className="text-sm font-semibold text-ocean-600 hover:underline" title={S.editTitleAttr} onClick={() => openEdit(p)}>{S.btnEdit}</button>
                            )}
                            {NEXT_STATUS[String(p.status)] && (
                              <button
                                className="text-sm font-semibold text-emerald-600 hover:underline"
                                title={String(p.status) === "Disetujui" ? S.payViaModal : S.moveToNext.replace("{a}", NEXT_STATUS[String(p.status)])}
                                onClick={() => askAdvance(p)}
                              >
                                {advLabel[String(p.status)] ?? S.advFallback.replace("{a}", NEXT_STATUS[String(p.status)])}
                              </button>
                            )}
                            {PREV_TO_DRAFT.includes(String(p.status)) && (
                              <button
                                className="text-sm font-semibold text-amber-600 hover:underline"
                                title={`Kembalikan ${p.id} ke Draft`}
                                onClick={() => setRevertTarget(p)}
                              >
                                Kembalikan ke Draft
                              </button>
                            )}
                            <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => openSlip(p)}>{S.btnSlip}</button>
                            {p.status === "Draft" && (
                              <button className="text-sm font-semibold text-rose-600 hover:underline" title={S.delTitleAttr} onClick={() => setDelPay(p)}>{S.btnDelete}</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {gajiShown.length === 0 && (
                  <EmptyState
                    title={gajiStage === "Semua" ? S.emptyGaji.replace("{a}", fmtBulan(period)) : S.emptyStage.replace("{a}", gajiStage).replace("{b}", fmtBulan(period))}
                    subtitle={gajiStage === "Semua" ? S.emptyGajiHint : S.emptyStageHint}
                  />
                )}
              </div>
            </div>
          )}

          {tab === "THR & Bonus" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  {S.lblPeriod}
                  <input type="month" className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} />
                </label>
                <span className="text-xs text-steel-400">
                  {S.thrInfo.replace("{a}", fmtRupiah(totals.thr)).replace("{b}", fmtRupiah(totals.bonus))}
                </span>
              </div>
              <StageStrip counts={stageCounts(thrBonusAll)} active={thrStage} onPick={setThrStage} prefix="thr" />
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">{S.bonusManual}</h3>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label={S.colEmployee}>
                    <select className="input w-auto" value={bonusForm.employeeId} onChange={(e) => setBonusForm({ ...bonusForm, employeeId: e.target.value })}>
                      <option value="">{S.optPick}</option>
                      {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </Field>
                  <Field label={S.lblNominal}>
                    <NumInput min="0" className="input w-44" value={bonusForm.nominal} onChange={(e) => setBonusForm({ ...bonusForm, nominal: e.target.value })} placeholder={S.phBonusNominal} />
                  </Field>
                  <Field label={S.lblNote}>
                    <input className="input w-56" value={bonusForm.keterangan} onChange={(e) => setBonusForm({ ...bonusForm, keterangan: e.target.value })} placeholder={S.phBonusNote} />
                  </Field>
                  <button className="btn-primary" onClick={saveBonus}>{S.btnAddBonus}</button>
                </div>
              </Card>
              <div className="overflow-x-auto p-2">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colId} sortKey="id" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={S.colEmployee} sortKey="emp" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={S.colType} sortKey="type" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={S.colNominal} sortKey="nominal" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={S.lblNote} sortKey="ket" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={S.colStatus} sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <th className="th">{S.colAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(thrShown, sort2, (row, k) => {
                      const p = row as StoreItem;
                      switch (k) {
                        case "id": return String(p.id ?? "");
                        case "emp": return String(empNameOf(String(p.employeeId ?? "")));
                        case "type": return String(rowType(p));
                        case "nominal": return Number(p.net ?? 0);
                        case "ket": return String(rowType(p)) === "THR"
                          ? `Basis ${Number(p.thrBase ?? 0)} x ${Number(p.masaBulan ?? 0)}/12`
                          : String(p.bonusNote ?? "");
                        case "status": return String(p.status ?? "");
                        default: return "";
                      }
                    }).map((p) => (
                      <tr key={p.id} id={notifRowId(String(p.id))} className={rowHighlightClass({ id: String(p.id), flash, notified: notified.has(String(p.id)), base: "hover:bg-surface" })}>
                        <td className="td font-mono text-steel-600">{p.id}</td>
                        <td className="td font-medium text-navy-900">{empNameOf(String(p.employeeId))}</td>
                        <td className="td"><Badge tone={rowType(p) === "THR" ? "amber" : "violet"}>{rowType(p)}</Badge></td>
                        <td className="td font-bold text-navy-900">{fmtRupiah(Number(p.net || 0))}</td>
                        <td className="td max-w-[240px] truncate text-steel-600" title={rowType(p) === "THR" ? S.thrBasis.replace("{a}", fmtRupiah(Number(p.thrBase || 0))).replace("{b}", String(Number(p.masaBulan || 0))) : String(p.bonusNote ?? "")}>
                          {rowType(p) === "THR" ? S.thrBasis.replace("{a}", fmtRupiah(Number(p.thrBase || 0))).replace("{b}", String(Number(p.masaBulan || 0))) : String(p.bonusNote ?? "")}
                        </td>
                        <td className="td"><StatusBadge status={String(p.status)} /></td>
                        <td className="td">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {NEXT_STATUS[String(p.status)] && (
                              <button
                                className="text-sm font-semibold text-emerald-600 hover:underline"
                                title={String(p.status) === "Disetujui" ? S.payViaModal : S.moveToNext.replace("{a}", NEXT_STATUS[String(p.status)])}
                                onClick={() => askAdvance(p)}
                              >
                                {advLabel[String(p.status)] ?? S.advFallback.replace("{a}", NEXT_STATUS[String(p.status)])}
                              </button>
                            )}
                            <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => openSlip(p)}>{S.btnSlip}</button>
                            {PREV_TO_DRAFT.includes(String(p.status)) && (
                              <button
                                className="text-sm font-semibold text-amber-600 hover:underline"
                                title={`Kembalikan ${p.id} ke Draft`}
                                onClick={() => setRevertTarget(p)}
                              >
                                Kembalikan ke Draft
                              </button>
                            )}
                            {p.status === "Draft" && (
                              <button className="text-sm font-semibold text-rose-600 hover:underline" title={S.delTitleAttr} onClick={() => setDelPay(p)}>{S.btnDelete}</button>
                            )}
                            {p.status === "Draft" && (
                              <button className="text-sm font-semibold text-navy-700 hover:underline" title={S.btnEdit} onClick={() => openBonusEdit(p)}>{S.btnEdit}</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {thrShown.length === 0 && (
                  <EmptyState
                    title={thrStage === "Semua" ? S.emptyThr.replace("{a}", fmtBulan(period)) : S.emptyThrStage.replace("{a}", thrStage).replace("{b}", fmtBulan(period))}
                    subtitle={thrStage === "Semua" ? S.emptyThrHint : S.emptyStageHint}
                  />
                )}
              </div>
            </div>
          )}

          {tab === "Kasbon" && (
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">{S.kasbonAdd}</h3>
                <p className="mt-1 text-xs text-steel-500">{S.kasbonInfo}</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label={S.colEmployee}>
                    <select className="input w-auto" value={kasbonForm.employeeId} onChange={(e) => setKasbonForm({ ...kasbonForm, employeeId: e.target.value })}>
                      <option value="">{S.optPick}</option>
                      {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name} · sisa {fmtRupiah(kasbonSisa(e))}</option>)}
                    </select>
                  </Field>
                  <Field label={S.lblDate}>
                    <input type="date" className="input w-auto" value={kasbonForm.tanggal} onChange={(e) => setKasbonForm({ ...kasbonForm, tanggal: e.target.value })} />
                  </Field>
                  <Field label={S.lblAmount}>
                    <NumInput min="0" className="input w-44" value={kasbonForm.jumlah} onChange={(e) => setKasbonForm({ ...kasbonForm, jumlah: e.target.value })} placeholder={S.phKasbonAmount} />
                  </Field>
                  <Field label={S.lblInstall}>
                    <NumInput min="0" className="input w-44" value={kasbonForm.cicilan} onChange={(e) => setKasbonForm({ ...kasbonForm, cicilan: e.target.value })} placeholder={S.phKasbonInstall} />
                  </Field>
                  <button className="btn-primary" onClick={saveKasbon}>{S.btnAddKasbon}</button>
                </div>
              </Card>
              <div className="overflow-x-auto p-2">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colEmployee} sortKey="emp" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label={S.colId} sortKey="id" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label={S.colDate} sortKey="date" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label={S.colAmount} sortKey="amount" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label={S.colInstall} sortKey="install" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label={S.colRemain} sortKey="sisa" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <th className="th">{S.colAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(activeEmps.flatMap((e) => normKasbon(e).map((k) => ({ e, k }))), sort3, (row, key) => {
                      const { e, k } = row as { e: StoreItem; k: KasbonEntry };
                      switch (key) {
                        case "emp": return String(e.name ?? "");
                        case "id": return String(k.id ?? "");
                        case "date": return String(k.tanggal ?? "");
                        case "amount": return Number(k.jumlah ?? 0);
                        case "install": return Number(k.cicilan ?? 0);
                        case "sisa": return Number(k.sisa ?? 0);
                        default: return "";
                      }
                    }).map(({ e, k }) => (
                        <tr key={`${e.id}-${k.id}`} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{e.name}</td>
                          <td className="td font-mono text-steel-600">{k.id}</td>
                          <td className="td text-steel-600">{fmtTanggal(k.tanggal)}</td>
                          <td className="td text-steel-600">{fmtRupiah(k.jumlah)}</td>
                          <td className="td text-steel-600">{fmtRupiah(k.cicilan)}</td>
                          <td className="td font-bold text-navy-900">{fmtRupiah(Math.max(0, k.sisa))}</td>
                          <td className="td">
                            <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => setDelKasbon({ e, kasbonId: k.id })}>{S.btnDelete}</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {activeEmps.every((e) => normKasbon(e).length === 0) && <EmptyState title={S.emptyKasbon} subtitle={S.emptyKasbonHint} />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- modal edit draft ---------- */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={S.editCompTitle}
        subtitle={editTarget ? S.editCompSub.replace("{a}", String(editTarget.id)) : ""}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditTarget(null)}>{S.cancelBtn}</button>
            <button className="btn-primary" onClick={saveEdit}>{S.saveShort}</button>
          </>
        }
      >
        <FormGrid>
          <Field label={S.lblBasic}><NumInput min="0" className="input" value={editForm.basic} onChange={(e) => setEditForm({ ...editForm, basic: e.target.value })} /></Field>
          <Field label={S.lblOvertimePay}><NumInput min="0" className="input" value={editForm.overtimePay} onChange={(e) => setEditForm({ ...editForm, overtimePay: e.target.value })} /></Field>
          <Field label={S.lblManualDed}><NumInput min="0" className="input" value={editForm.deductions} onChange={(e) => setEditForm({ ...editForm, deductions: e.target.value })} /></Field>
        </FormGrid>
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-navy-900">{S.allowDetail}</p>
            <button className="btn-secondary text-xs" onClick={() => setEditLines((prev) => [...prev, { label: "", amount: 0 }])}>{S.addRow}</button>
          </div>
          <div className="space-y-2">
            {editLines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input flex-1" value={l.label} onChange={(e) => setEditLines((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={S.phTransport} />
                <NumInput min="0" className="input w-44" value={String(l.amount)} onChange={(e) => setEditLines((prev) => prev.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} placeholder={S.phNominal} />
                <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => setEditLines((prev) => prev.filter((_, j) => j !== i))}>{S.btnDelete}</button>
              </div>
            ))}
            {editLines.length === 0 && <p className="text-xs text-steel-400">{S.noAllowRows}</p>}
          </div>
        </div>
      </Modal>

      {/* ---------- modal ubah THR/bonus Draft ---------- */}
      <Modal
        open={bonusEdit !== null}
        onClose={() => setBonusEdit(null)}
        title={bonusEdit ? `${S.btnEdit} ${rowType(bonusEdit)} ${bonusEdit.id}` : ""}
        subtitle={bonusEdit ? `${empNameOf(String(bonusEdit.employeeId))} · ${fmtBulan(period)}` : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBonusEdit(null)}>{S.cancelBtn}</button>
            <button className="btn-primary" onClick={saveBonusEdit}>{S.saveShort}</button>
          </>
        }
      >
        <div className="space-y-3">
          {bonusEdit && rowType(bonusEdit) === "Bonus" && (
            <Field label={S.phBonusNominal}>
              <NumInput min="0" className="input" value={bonusEditForm.nominal} onChange={(e) => setBonusEditForm({ ...bonusEditForm, nominal: e.target.value })} placeholder={S.phBonusNominal} />
            </Field>
          )}
          {bonusEdit && rowType(bonusEdit) === "THR" && (
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
              {S.thrBasis.replace("{a}", fmtRupiah(Number(bonusEdit.thrBase || 0))).replace("{b}", String(Number(bonusEdit.masaBulan || 0)))}
            </p>
          )}
          <Field label={locale === "en" ? "Note" : "Keterangan"}>
            <input className="input" value={bonusEditForm.keterangan} onChange={(e) => setBonusEditForm({ ...bonusEditForm, keterangan: e.target.value })} placeholder={S.phBonusNote} />
          </Field>
        </div>
      </Modal>

      {/* ---------- modal bayar ---------- */}
      <Modal
        open={payTarget !== null}
        onClose={() => setPayTarget(null)}
        title={S.payProofTitle}
        subtitle={payTarget ? S.payProofSub.replace("{a}", String(payTarget.id)).replace("{b}", fmtRupiah(Number(payTarget.net || 0))) : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPayTarget(null)}>{S.cancelBtn}</button>
            <AsyncButton className="btn-primary" onAction={confirmPay}>{S.btnConfirmPay}</AsyncButton>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.lblPayDate}><input type="date" className="input" value={proof.date} onChange={(e) => setProof({ ...proof, date: e.target.value })} /></Field>
            <Field label={S.lblMethod}>
              <select className="input" value={proof.method} onChange={(e) => setProof({ ...proof, method: e.target.value })}>
                <option>Transfer</option>
                <option>Tunai</option>
                <option>Giro</option>
              </select>
            </Field>
          </FormGrid>
          <Field label={S.lblRefNo}><input className="input" value={proof.ref} onChange={(e) => setProof({ ...proof, ref: e.target.value })} placeholder={S.phRefNo} /></Field>
        </div>
      </Modal>

      {/* ---------- modal pesangon ---------- */}
      <Modal
        open={showPesangon}
        onClose={() => setShowPesangon(false)}
        title={S.pesTitle}
        subtitle={S.pesSub}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowPesangon(false)}>{S.closeBtn}</button>
            <button className="btn-primary" onClick={exportPesangon}>
              <Download className="h-4 w-4" /> {S.btnExportResult}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.lblWorkYears}><NumInput min="0" step="0.5" className="input" value={pesForm.masaKerja} onChange={(e) => setPesForm({ ...pesForm, masaKerja: e.target.value })} /></Field>
            <Field label={S.lblMonthlyWage}><NumInput min="0" className="input" value={pesForm.upah} onChange={(e) => setPesForm({ ...pesForm, upah: e.target.value })} /></Field>
          </FormGrid>
          <dl className="dl-div rounded-xl bg-surface p-3 text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">{S.pesRow.replace("{a}", String(pesHitung.pesMonths))}</dt><dd className="font-medium">{fmtRupiah(pesHitung.pesangon)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.upmkRow.replace("{a}", String(pesHitung.upmkMonths))}</dt><dd className="font-medium">{fmtRupiah(pesHitung.upmk)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.uphRow}</dt><dd className="font-medium">{fmtRupiah(pesHitung.uph)}</dd></div>
            <div className="flex justify-between border-t border-steel-200 pt-2"><dt className="font-bold text-navy-900">{S.totalRow}</dt><dd className="font-bold text-navy-900">{fmtRupiah(pesHitung.total)}</dd></div>
          </dl>
        </div>
      </Modal>

      {/* ---------- modal slip ---------- */}
      <Modal
        open={slipTarget !== null}
        onClose={() => setSlipTarget(null)}
        title={slipTarget && rowType(slipTarget) !== "Gaji" ? S.slipTypeTitle.replace("{a}", rowType(slipTarget)) : S.slipGajiTitle}
        subtitle={slipTarget ? `${slipTarget.id} · ${empNameOf(String(slipTarget.employeeId))} · ${fmtBulan(String(slipTarget.period))}` : ""}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSlipTarget(null)}>{S.closeBtn}</button>
            <button className="btn-secondary" onClick={() => slipTarget && exportSlip(slipTarget)}>
              {locale === "en" ? "Excel" : "Excel"}
            </button>
            <button className="btn-primary" onClick={() => slipTarget && exportSlipPdf(slipTarget)}>
              <Download className="h-4 w-4" /> {S.btnDownloadSlip}
            </button>
          </>
        }
      >
        {slipTarget && (() => {
          const b = bpjsKarOf(slipTarget);
          const emp = empOf(String(slipTarget.employeeId));
          const isHarian = String(emp?.tipe ?? "") === "Harian";
          const sign = (slipTarget.slipSign ?? {}) as { received?: boolean; date?: string };
          const manualDed = Number(slipTarget.deductions || 0) - Number(slipTarget.kasbonPot || 0);
          return (
            <div className="space-y-3">
              <dl className="dl-div text-sm">
                {rowType(slipTarget) === "Gaji" ? (
                  <>
                    <div className="flex justify-between"><dt className="text-steel-500">{isHarian ? S.dailyWage.replace("{n}", String(Number(slipTarget.hadirDays ?? 0))) : S.basicPay}</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.basic || 0))}</dd></div>
                    {normAllowances(slipTarget.allowances).map((l, i) => (
                      <div key={i} className="flex justify-between"><dt className="text-steel-500">{S.allowanceRow.replace("{a}", l.label)}</dt><dd className="font-medium">{fmtRupiah(Number(l.amount) || 0)}</dd></div>
                    ))}
                    <div className="flex justify-between"><dt className="text-steel-500">{S.wageOvertime}</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.overtimePay || 0))}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{S.kasbonInstallRow}</dt><dd className="font-medium">-{fmtRupiah(Number(slipTarget.kasbonPot || 0))}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{S.manualDedRow}</dt><dd className="font-medium">-{fmtRupiah(manualDed)}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{isHarian ? S.pphDaily : S.pph21Status.replace("{a}", String(emp?.ptkpStatus ?? "TK/0"))}</dt><dd className="font-medium">-{fmtRupiah(Number(slipTarget.pph21 || 0))}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{S.bpjsKesRow.replace("{a}", String(rates.bpjsKes))}</dt><dd className="font-medium">-{fmtRupiah(b.kes)}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{S.bpjsTkRow.replace("{a}", String(rates.bpjsTk))}</dt><dd className="font-medium">-{fmtRupiah(b.tk)}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{S.bpjsPerRow.replace("{a}", String(rates.bpjsKesPer))}</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.bpjsKesPer || 0))}</dd></div>
                    <div className="flex justify-between border-t border-steel-200 pt-2"><dt className="font-bold text-navy-900">{S.netPay}</dt><dd className="font-bold text-navy-900">{fmtRupiah(Number(slipTarget.net || 0))}</dd></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><dt className="text-steel-500">{S.colType}</dt><dd><Badge tone={rowType(slipTarget) === "THR" ? "amber" : "violet"}>{rowType(slipTarget)}</Badge></dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{S.lblNote}</dt><dd className="font-medium">{rowType(slipTarget) === "THR" ? S.thrBasis.replace("{a}", fmtRupiah(Number(slipTarget.thrBase || 0))).replace("{b}", String(Number(slipTarget.masaBulan || 0))) : String(slipTarget.bonusNote ?? "")}</dd></div>
                    <div className="flex justify-between border-t border-steel-200 pt-2"><dt className="font-bold text-navy-900">{S.nominalReceived}</dt><dd className="font-bold text-navy-900">{fmtRupiah(Number(slipTarget.net || 0))}</dd></div>
                  </>
                )}
                <div className="flex justify-between"><dt className="text-steel-500">{S.colStatus}</dt><dd><StatusBadge status={String(slipTarget.status)} /></dd></div>
                {slipTarget.paidAt && <div className="flex justify-between"><dt className="text-steel-500">{S.paidOn}</dt><dd className="font-medium">{fmtTanggal(slipTarget.paidAt)}</dd></div>}
                {sign.received && <div className="flex justify-between"><dt className="text-steel-500">{S.receivedOn}</dt><dd className="font-medium">{fmtTanggal(sign.date ?? "")}</dd></div>}
              </dl>
              <div className="rounded-xl bg-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">{S.signTitle}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-steel-700">
                    <input type="checkbox" checked={slipSign.received} onChange={(e) => setSlipSign({ ...slipSign, received: e.target.checked })} />
                    {S.receivedCheck}
                  </label>
                  {slipSign.received && (
                    <input type="date" className="input w-auto" value={slipSign.date} onChange={(e) => setSlipSign({ ...slipSign, date: e.target.value })} />
                  )}
                  <button className="btn-secondary text-xs" onClick={saveSlipSign}>{S.btnSaveSign}</button>
                </div>
              </div>
              <p className="text-xs text-steel-400">{S.typesNote.replace("{a}", PAY_TYPES.join(" / "))}</p>
            </div>
          );
        })()}
      </Modal>
      <ConfirmModal
        open={confirmAdv !== null}
        title={confirmAdv ? S.advTitle.replace("{a}", String(confirmAdv.id)) : S.advTitleEmpty}
        desc={
          confirmAdv
            ? ((Number(confirmAdv.net || 0) > 0)
              ? ""
              : `⚠ Peringatan: net ${fmtRupiah(Number(confirmAdv.net || 0))} ≤ 0 (minus/potongan berlebih). Lanjutkan? `)
              + S.advDesc.replace("{a}", empNameOf(String(confirmAdv.employeeId))).replace("{b}", rowType(confirmAdv)).replace("{c}", fmtBulan(period)).replace("{d}", fmtRupiah(Number(confirmAdv.net || 0))).replace("{e}", String(confirmAdv.status)).replace("{f}", NEXT_STATUS[String(confirmAdv.status)] ?? "?")
            : ""
        }
        confirmLabel={confirmAdv ? advLabel[String(confirmAdv.status)] ?? S.advContinue : S.advContinue}
        onCancel={() => setConfirmAdv(null)}
        onConfirm={() => void doAdvance()}
      />
      <ConfirmModal
        open={revertTarget !== null}
        title={revertTarget ? `Kembalikan ${revertTarget.id} ke Draft?` : ""}
        desc={
          revertTarget
            ? `${rowType(revertTarget)} ${empNameOf(String(revertTarget.employeeId))} · ${fmtBulan(period)} · ${fmtRupiah(Number(revertTarget.net || 0))} akan dikembalikan dari ${revertTarget.status} ke Draft agar bisa dikoreksi. Riwayat tercatat di log.`
            : ""
        }
        confirmLabel="Kembalikan ke Draft"
        onCancel={() => setRevertTarget(null)}
        onConfirm={() => void doRevert()}
      />
      <ConfirmModal
        open={delPay !== null}
        title={delPay ? `Hapus ${rowType(delPay)} ${delPay.id}?` : ""}
        desc={(() => {
          const used = delPay ? findUsages(data, "payroll", String(delPay.id)) : [];
          const kasbonNote = delPay && String(delPay.status ?? "") === "Draft" && Number(delPay.kasbonPot || 0) > 0
            ? ` Sisa kasbon ${fmtRupiah(Number(delPay.kasbonPot))} akan dikembalikan ke karyawan.`
            : "";
          const base = delPay ? `${rowType(delPay)} ${empNameOf(String(delPay.employeeId))} · ${fmtBulan(period)} · ${fmtRupiah(Number(delPay.net || 0))} akan dihapus permanen.${kasbonNote}` : "";
          return used.length > 0 ? `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.` : base;
        })()}
        confirmLabel={delPay && findUsages(data, "payroll", String(delPay.id)).length > 0 ? "Diblokir - masih dipakai" : S.btnDelete}
        danger
        confirmDisabled={delPay ? findUsages(data, "payroll", String(delPay.id)).length > 0 : false}
        onCancel={() => setDelPay(null)}
        onConfirm={async () => {
          if (!delPay) return;
          const usedBy = findUsages(data, "payroll", String(delPay.id));
          if (usedBy.length > 0) { toast(`Hapus diblokir - ${delPay.id} dipakai di: ${usedBy.join(", ")}`, "info"); return; }
          await removeRow(delPay);
          setDelPay(null);
        }}
      />
      <ConfirmModal
        open={delKasbon !== null}
        title={delKasbon ? `Hapus kasbon ${delKasbon.kasbonId}?` : ""}
        desc={(() => {
          if (!delKasbon) return "";
          const entry = normKasbon(delKasbon.e).find((x) => x.id === delKasbon.kasbonId);
          const base = `${String(delKasbon.e.name ?? delKasbon.e.id)} · ${delKasbon.kasbonId}${entry ? ` · sisa ${fmtRupiah(Math.max(0, entry.sisa))}` : ""} akan dihapus permanen.`;
          return base;
        })()}
        confirmLabel={S.btnDelete}
        danger
        onCancel={() => setDelKasbon(null)}
        onConfirm={async () => {
          if (!delKasbon) return;
          await removeKasbon(delKasbon.e, delKasbon.kasbonId);
          setDelKasbon(null);
        }}
      />
    </div>
  );
}