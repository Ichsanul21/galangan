import { useMemo, useState } from "react";
import { Download, Wallet } from "lucide-react";
import {
  Badge,
  Card,
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
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtBulan, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { getSetting } from "../../utils/settings";
import { exportExcel } from "../../utils/export";

const NEXT_STATUS: Record<string, string> = {
  Draft: "Dihitung",
  Dihitung: "Disetujui",
  Disetujui: "Dibayar",
};

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

/* PPh21 progresif tahunan disetahunkan: bruto×12 − PTKP → lapis T1–T4 → /12. */
function calcPphProgressive(bruto: number, ptkpStatus: string, dependents: number, r: PayrollRates): number {
  const bruto12 = Math.max(0, bruto) * 12;
  const base = String(ptkpStatus).startsWith("K/") ? r.ptkpK0 : r.ptkpTK0;
  const ptkp = base + Math.min(3, Math.max(0, dependents)) * r.ptkpTang;
  const pkp = Math.max(0, bruto12 - ptkp);
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
  return Math.round(tahunan / 12);
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
  const [tab, setTab] = useState("Gaji");
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [editTarget, setEditTarget] = useState<StoreItem | null>(null);
  const [editForm, setEditForm] = useState({ basic: "", overtimePay: "", deductions: "" });
  const [editLines, setEditLines] = useState<AllowanceLine[]>([]);
  const [payTarget, setPayTarget] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState({ date: todayISO(), method: "Transfer", ref: "" });
  const [slipTarget, setSlipTarget] = useState<StoreItem | null>(null);
  const [slipSign, setSlipSign] = useState({ received: false, date: todayISO() });
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  /* ---------- THR & bonus ---------- */
  const [bonusForm, setBonusForm] = useState({ employeeId: "", nominal: "", keterangan: "" });

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

  const generate = () => {
    const existing = new Set(gajiRows.map((p) => String(p.employeeId)));
    const fresh = activeEmps.filter((e) => !existing.has(e.id));
    if (fresh.length === 0) {
      toast("Semua karyawan aktif sudah punya draft periode ini", "info");
      return;
    }
    fresh.forEach(async (e) => {
      const basic = Number(e.basic || 0);
      const lines = normAllowances(e.allowances);
      if (lines.length === 0) lines.push({ label: "Tunjangan", amount: 0 });
      const recs = data.attendance.filter(
        (a) =>
          a.employeeId === e.id &&
          String(a.date).startsWith(period) &&
          a.status === "Hadir" &&
          (Number(a.overtime || 0) === 0 || String(a.otStatus ?? "") === "Disetujui"),
      );
      const hadirDays = recs.length;
      const overtimePay = calcOvertimePay(basic, recs, otDivisor);
      /* Cicilan kasbon otomatis: min(cicilan, sisa) per entri, langsung kurangi sisa. */
      let kasbonPot = 0;
      const kasbon = normKasbon(e);
      if (kasbon.length > 0) {
        const next = kasbon.map((k) => {
          const inst = Math.min(Math.max(0, Number(k.cicilan) || 0), Math.max(0, Number(k.sisa) || 0));
          kasbonPot += inst;
          return { ...k, sisa: Math.max(0, Number(k.sisa) - inst) };
        });
        await update("employees", e.id, { kasbon: next });
      }
      const c = buildComponents(e, basic, lines, overtimePay, 0, kasbonPot, hadirDays);
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
    });
    log("generate payroll", `${period} · ${fresh.length} draft`, "Payroll");
    toast(`${fresh.length} draft payroll ${fmtBulan(period)} dibuat`);
  };

  const advance = async (p: StoreItem) => {
    const next = NEXT_STATUS[String(p.status)];
    if (!next) return;
    if (next === "Dibayar") {
      setPayTarget(p);
      setProof({ date: todayISO(), method: "Transfer", ref: "" });
      return;
    }
    await update("payroll", p.id, { status: next });
    log("memproses payroll", `${p.id} → ${next}`, "Payroll");
    toast(`${p.id} → ${next}`);
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
      toast("Data karyawan tidak ditemukan", "info");
      return;
    }
    const basic = Number(editForm.basic);
    const overtimePay = Number(editForm.overtimePay);
    const manualDed = Number(editForm.deductions);
    if ([basic, overtimePay, manualDed].some((n) => Number.isNaN(n) || n < 0)) {
      toast("Komponen gaji harus angka valid", "info");
      return;
    }
    if (editLines.some((l) => Number.isNaN(Number(l.amount)) || Number(l.amount) < 0)) {
      toast("Nominal tunjangan harus angka valid", "info");
      return;
    }
    const lines = editLines.map((l) => ({ label: l.label.trim() || "Tunjangan", amount: Number(l.amount) || 0 }));
    const kasbonPot = Number(editTarget.kasbonPot || 0);
    const hadirDays = Number(editTarget.hadirDays ?? 0);
    const c = buildComponents(emp, basic, lines, overtimePay, manualDed, kasbonPot, hadirDays);
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
    toast(`${editTarget.id} diperbarui — net ${fmtRupiah(c.net)}`);
    setEditTarget(null);
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    if (!proof.date) {
      toast("Tanggal bayar wajib diisi", "info");
      return;
    }
    if (!proof.ref.trim()) {
      toast("No. referensi wajib diisi", "info");
      return;
    }
    await update("payroll", payTarget.id, {
      status: "Dibayar",
      paidAt: proof.date,
      paidMethod: proof.method,
      paidRef: proof.ref.trim(),
    });
    log("membayar payroll", `${payTarget.id} via ${proof.method} ${proof.ref.trim()}`, "Payroll");
    toast(`${payTarget.id} dibayar — bukti tersimpan`);
    setPayTarget(null);
  };

  const removeRow = async (p: StoreItem) => {
    await remove("payroll", p.id);
    log("menghapus payroll", `${p.id} · ${rowType(p)}`, "Payroll");
    toast(`${p.id} dihapus`);
  };

  /* ---------- THR ---------- */
  const generateTHR = () => {
    const existing = new Set(thrRows.map((p) => String(p.employeeId)));
    const fresh = activeEmps.filter((e) => !existing.has(e.id));
    if (fresh.length === 0) {
      toast("THR periode ini sudah dihitung untuk semua karyawan aktif", "info");
      return;
    }
    fresh.forEach(async (e) => {
      const basic = Number(e.basic || 0);
      const allowAvg = sumAllowances(e.allowances);
      const n = monthsWorked(String(e.join ?? ""), period);
      const thr = Math.round(((basic + allowAvg) * Math.min(n, 12)) / 12);
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
          pph21: 0,
          bpjsKesKar: 0,
          bpjsKesPer: 0,
          bpjsTkKar: 0,
          net: thr,
          thrBase: basic + allowAvg,
          masaBulan: Math.min(n, 12),
          status: "Draft",
          paidAt: "",
          branch: String(e.branch ?? ""),
        },
        undefined,
      );
    });
    log("hitung THR", `${period} · ${fresh.length} penerima`, "Payroll");
    toast(`${fresh.length} THR ${fmtBulan(period)} dihitung`);
  };

  const saveBonus = async () => {
    const emp = empOf(bonusForm.employeeId);
    if (!emp) {
      toast("Pilih karyawan dulu", "info");
      return;
    }
    const nominal = Number(bonusForm.nominal);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      toast("Nominal bonus harus lebih dari 0", "info");
      return;
    }
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
        pph21: 0,
        bpjsKesKar: 0,
        bpjsKesPer: 0,
        bpjsTkKar: 0,
        net: Math.round(nominal),
        bonusNote: bonusForm.keterangan.trim() || "Bonus",
        status: "Draft",
        paidAt: "",
        branch: String(emp.branch ?? ""),
      },
      { action: "mencatat bonus", module: "Payroll" },
    );
    toast(`Bonus ${fmtRupiah(nominal)} untuk ${emp.name} dicatat`);
    setBonusForm({ employeeId: "", nominal: "", keterangan: "" });
  };

  /* ---------- kasbon ---------- */
  const saveKasbon = async () => {
    const emp = empOf(kasbonForm.employeeId);
    if (!emp) {
      toast("Pilih karyawan dulu", "info");
      return;
    }
    const jumlah = Number(kasbonForm.jumlah);
    const cicilan = Number(kasbonForm.cicilan);
    if (!Number.isFinite(jumlah) || jumlah <= 0) {
      toast("Jumlah kasbon harus lebih dari 0", "info");
      return;
    }
    if (!Number.isFinite(cicilan) || cicilan <= 0) {
      toast("Cicilan per payroll harus lebih dari 0", "info");
      return;
    }
    if (!kasbonForm.tanggal) {
      toast("Tanggal kasbon wajib diisi", "info");
      return;
    }
    const entry: KasbonEntry = {
      id: `KSB-${Date.now().toString(36).toUpperCase()}`,
      tanggal: kasbonForm.tanggal,
      jumlah: Math.round(jumlah),
      cicilan: Math.round(cicilan),
      sisa: Math.round(jumlah),
    };
    await update("employees", emp.id, { kasbon: [...normKasbon(emp), entry] });
    log("mencatat kasbon", `${entry.id} · ${emp.name} · ${fmtRupiah(entry.jumlah)}`, "Payroll");
    toast(`Kasbon ${fmtRupiah(entry.jumlah)} untuk ${emp.name} dicatat`);
    setKasbonForm({ employeeId: "", tanggal: todayISO(), jumlah: "", cicilan: "" });
  };

  const removeKasbon = async (emp: StoreItem, kasbonId: string) => {
    await update("employees", emp.id, { kasbon: normKasbon(emp).filter((k) => k.id !== kasbonId) });
    log("menghapus kasbon", `${kasbonId} · ${emp.name}`, "Payroll");
    toast(`Kasbon ${kasbonId} dihapus`);
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
    toast("Rekap payroll diunduh");
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
    toast("Daftar THR & bonus diunduh");
  };

  const openSlip = (p: StoreItem) => {
    setSlipTarget(p);
    const sign = (p.slipSign ?? {}) as { received?: boolean; date?: string };
    setSlipSign({ received: Boolean(sign.received), date: String(sign.date ?? todayISO()) });
  };

  const saveSlipSign = async () => {
    if (!slipTarget) return;
    if (slipSign.received && !slipSign.date) {
      toast("Tanggal terima wajib diisi", "info");
      return;
    }
    await update("payroll", slipTarget.id, { slipSign: { received: slipSign.received, date: slipSign.received ? slipSign.date : "" } });
    log("tanda terima slip", `${slipTarget.id} · ${slipSign.received ? `diterima ${slipSign.date}` : "belum diterima"}`, "Payroll");
    toast(`Tanda terima ${slipTarget.id} disimpan`);
    setSlipTarget(null);
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
      ...normAllowances(p.allowances).map((l) => [`Tunjangan — ${l.label}`, fmtRupiah(Number(l.amount) || 0)] as string[]),
      ["Upah lembur", fmtRupiah(Number(p.overtimePay || 0))],
      ["Cicilan kasbon", fmtRupiah(Number(p.kasbonPot || 0))],
      ["Potongan manual", fmtRupiah(Number(p.deductions || 0) - Number(p.kasbonPot || 0))],
      [isHarian ? "PPh harian (5% × kelebihan 450rb × hari hadir)" : "PPh 21 (progresif disetahunkan)", fmtRupiah(Number(p.pph21 || 0))],
      [`BPJS Kesehatan karyawan (${rates.bpjsKes}%)`, fmtRupiah(b.kes)],
      [`BPJS Ketenagakerjaan – JHT karyawan (${rates.bpjsTk}%)`, fmtRupiah(b.tk)],
      [`BPJS Kesehatan perusahaan (${rates.bpjsKesPer}%) — info, tidak memotong gaji`, fmtRupiah(Number(p.bpjsKesPer || 0))],
      [rowType(p) === "Gaji" ? "Gaji bersih" : "Nominal diterima", fmtRupiah(Number(p.net || 0))],
      ["Status", String(p.status)],
      ["Tanda terima", sign.received ? `Sudah diterima ${fmtTanggal(sign.date ?? "")}` : "Belum diterima"],
    ];
    void exportExcel([head, ...body], `slip-${p.id}`, "Slip");
    toast(`Slip ${p.id} diunduh`);
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
    toast("Hasil pesangon diunduh (tanpa disimpan)");
  };

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="PPh21 progresif disetahunkan (PTKP TK/0–K/3) · BPJS split karyawan/perusahaan · lembur hanya yang Disetujui"
        icon={<Wallet className="h-5 w-5" />}
        actions={
          tab === "Gaji" ? (
            <>
              <button className="btn-secondary" onClick={() => setShowPesangon(true)}>Kalkulator Pesangon</button>
              <button className="btn-secondary" onClick={exportRekap}>
                <Download className="h-4 w-4" /> Export Rekap
              </button>
              <button className="btn-primary-gradient" onClick={generate}>Generate {fmtBulan(period)}</button>
            </>
          ) : tab === "THR & Bonus" ? (
            <>
              <button className="btn-secondary" onClick={exportThrBonus}>
                <Download className="h-4 w-4" /> Export THR & Bonus
              </button>
              <button className="btn-primary-gradient" onClick={generateTHR}>Hitung THR {fmtBulan(period)}</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => setShowPesangon(true)}>Kalkulator Pesangon</button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Bruto (Gaji)" value={fmtRupiah(totals.bruto)} hint={`Periode ${fmtBulan(period)}`} chip="navy" />
        <KpiCard label="Total Net (Gaji)" value={fmtRupiah(totals.net)} hint={`${gajiRows.length} slip gaji`} chip="teal" />
        <KpiCard label="Total PPh21" value={fmtRupiah(totals.pph21)} hint="Progresif T1–T4 disetahunkan" chip="amber" />
        <KpiCard label="Total BPJS Karyawan" value={fmtRupiah(totals.bpjs)} hint={`Kes ${rates.bpjsKes}% + TK-JHT ${rates.bpjsTk}%`} chip="violet" />
      </div>

      <div className="card">
        <Tabs tabs={["Gaji", "THR & Bonus", "Kasbon"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Gaji" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  Periode
                  <input type="month" className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} />
                </label>
                <span className="text-xs text-steel-400">
                  Lembur dari absensi bulan berjalan (hanya Disetujui) · tarif = pokok/{otDivisor} · jam 1–2: 1,5x · jam 3–4: 2x · jam 5+: 3x · Harian: PPh 5% × kelebihan Rp 450rb/hari
                </span>
              </div>
              <div className="overflow-x-auto p-2">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label="ID" sortKey="id" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="Karyawan" sortKey="emp" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="Pokok" sortKey="basic" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="Tunjangan" sortKey="allow" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="Lembur" sortKey="overtime" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="PPh21" sortKey="pph" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="BPJS" sortKey="bpjs" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="Net" sortKey="net" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                      <th className="th">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(gajiRows, sort, (row, k) => {
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
                        default: return "";
                      }
                    }).map((p) => (
                      <tr key={p.id} className="hover:bg-surface">
                        <td className="td font-mono text-steel-600">{p.id}</td>
                        <td className="td font-medium text-navy-900">{empNameOf(String(p.employeeId))}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.basic || 0))}</td>
                        <td className="td text-steel-600">{fmtRupiah(sumAllowances(p.allowances))}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.overtimePay || 0))}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.pph21 || 0))}</td>
                        <td className="td text-steel-600">{fmtRupiah(bpjsKarOf(p).kes + bpjsKarOf(p).tk)}</td>
                        <td className="td font-bold text-navy-900">{fmtRupiah(Number(p.net || 0))}</td>
                        <td className="td"><StatusBadge status={String(p.status)} /></td>
                        <td className="td">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {p.status === "Draft" && (
                              <button className="text-sm font-semibold text-ocean-600 hover:underline" onClick={() => openEdit(p)}>Edit</button>
                            )}
                            {NEXT_STATUS[String(p.status)] && (
                              <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => advance(p)}>
                                {String(p.status) === "Disetujui" ? "Bayar" : `→ ${NEXT_STATUS[String(p.status)]}`}
                              </button>
                            )}
                            <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => openSlip(p)}>Slip</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {gajiRows.length === 0 && <EmptyState title={`Belum ada payroll ${fmtBulan(period)}`} subtitle="Klik Generate untuk membuat draft dari data karyawan & absensi." />}
              </div>
            </div>
          )}

          {tab === "THR & Bonus" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-steel-600">
                  Periode
                  <input type="month" className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} />
                </label>
                <span className="text-xs text-steel-400">
                  THR = 1×(pokok + tunjangan rata-rata) bila masa kerja ≥12 bln, selain itu proporsional n/12 · total THR {fmtRupiah(totals.thr)} · total Bonus {fmtRupiah(totals.bonus)}
                </span>
              </div>
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">Bonus Manual</h3>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label="Karyawan">
                    <select className="input w-auto" value={bonusForm.employeeId} onChange={(e) => setBonusForm({ ...bonusForm, employeeId: e.target.value })}>
                      <option value="">— Pilih —</option>
                      {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Nominal (Rp)">
                    <input type="number" min="0" className="input w-44" value={bonusForm.nominal} onChange={(e) => setBonusForm({ ...bonusForm, nominal: e.target.value })} placeholder="cth: 1000000" />
                  </Field>
                  <Field label="Keterangan">
                    <input className="input w-56" value={bonusForm.keterangan} onChange={(e) => setBonusForm({ ...bonusForm, keterangan: e.target.value })} placeholder="cth: Bonus proyek Q3" />
                  </Field>
                  <button className="btn-primary" onClick={saveBonus}>Catat Bonus</button>
                </div>
              </Card>
              <div className="overflow-x-auto p-2">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label="ID" sortKey="id" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label="Karyawan" sortKey="emp" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label="Tipe" sortKey="type" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label="Nominal" sortKey="nominal" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label="Keterangan" sortKey="ket" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label="Status" sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <th className="th">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows([...thrRows, ...bonusRows], sort2, (row, k) => {
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
                      <tr key={p.id} className="hover:bg-surface">
                        <td className="td font-mono text-steel-600">{p.id}</td>
                        <td className="td font-medium text-navy-900">{empNameOf(String(p.employeeId))}</td>
                        <td className="td"><Badge tone={rowType(p) === "THR" ? "amber" : "violet"}>{rowType(p)}</Badge></td>
                        <td className="td font-bold text-navy-900">{fmtRupiah(Number(p.net || 0))}</td>
                        <td className="td max-w-[240px] truncate text-steel-600" title={rowType(p) === "THR" ? `Basis ${fmtRupiah(Number(p.thrBase || 0))} × ${Number(p.masaBulan || 0)}/12` : String(p.bonusNote ?? "")}>
                          {rowType(p) === "THR" ? `Basis ${fmtRupiah(Number(p.thrBase || 0))} × ${Number(p.masaBulan || 0)}/12` : String(p.bonusNote ?? "")}
                        </td>
                        <td className="td"><StatusBadge status={String(p.status)} /></td>
                        <td className="td">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {NEXT_STATUS[String(p.status)] && (
                              <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => advance(p)}>
                                {String(p.status) === "Disetujui" ? "Bayar" : `→ ${NEXT_STATUS[String(p.status)]}`}
                              </button>
                            )}
                            <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => openSlip(p)}>Slip</button>
                            {p.status === "Draft" && (
                              <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => removeRow(p)}>Hapus</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {thrRows.length + bonusRows.length === 0 && <EmptyState title={`Belum ada THR/bonus ${fmtBulan(period)}`} subtitle="Klik Hitung THR atau catat bonus manual." />}
              </div>
            </div>
          )}

          {tab === "Kasbon" && (
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">Tambah Kasbon</h3>
                <p className="mt-1 text-xs text-steel-500">Cicilan otomatis = min(cicilan, sisa) dipotong saat Generate payroll dan mengurangi sisa.</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label="Karyawan">
                    <select className="input w-auto" value={kasbonForm.employeeId} onChange={(e) => setKasbonForm({ ...kasbonForm, employeeId: e.target.value })}>
                      <option value="">— Pilih —</option>
                      {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name} · sisa {fmtRupiah(kasbonSisa(e))}</option>)}
                    </select>
                  </Field>
                  <Field label="Tanggal">
                    <input type="date" className="input w-auto" value={kasbonForm.tanggal} onChange={(e) => setKasbonForm({ ...kasbonForm, tanggal: e.target.value })} />
                  </Field>
                  <Field label="Jumlah (Rp)">
                    <input type="number" min="0" className="input w-44" value={kasbonForm.jumlah} onChange={(e) => setKasbonForm({ ...kasbonForm, jumlah: e.target.value })} placeholder="cth: 2000000" />
                  </Field>
                  <Field label="Cicilan/payroll (Rp)">
                    <input type="number" min="0" className="input w-44" value={kasbonForm.cicilan} onChange={(e) => setKasbonForm({ ...kasbonForm, cicilan: e.target.value })} placeholder="cth: 500000" />
                  </Field>
                  <button className="btn-primary" onClick={saveKasbon}>Catat Kasbon</button>
                </div>
              </Card>
              <div className="overflow-x-auto p-2">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label="Karyawan" sortKey="emp" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label="ID" sortKey="id" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label="Tanggal" sortKey="date" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label="Jumlah" sortKey="amount" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label="Cicilan" sortKey="install" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <SortTh label="Sisa" sortKey="sisa" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      <th className="th">Aksi</th>
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
                            <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => removeKasbon(e, k.id)}>Hapus</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {activeEmps.every((e) => normKasbon(e).length === 0) && <EmptyState title="Belum ada kasbon" subtitle="Catat kasbon lewat form di atas." />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- modal edit draft ---------- */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit Komponen (Draft)"
        subtitle={editTarget ? `${editTarget.id} · PPh21 & BPJS dihitung ulang otomatis` : ""}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditTarget(null)}>Batal</button>
            <button className="btn-primary" onClick={saveEdit}>Simpan</button>
          </>
        }
      >
        <FormGrid>
          <Field label="Gaji pokok (Rp)"><input type="number" min="0" className="input" value={editForm.basic} onChange={(e) => setEditForm({ ...editForm, basic: e.target.value })} /></Field>
          <Field label="Upah lembur (Rp)"><input type="number" min="0" className="input" value={editForm.overtimePay} onChange={(e) => setEditForm({ ...editForm, overtimePay: e.target.value })} /></Field>
          <Field label="Potongan manual (Rp)"><input type="number" min="0" className="input" value={editForm.deductions} onChange={(e) => setEditForm({ ...editForm, deductions: e.target.value })} /></Field>
        </FormGrid>
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-navy-900">Tunjangan rinci</p>
            <button className="btn-secondary text-xs" onClick={() => setEditLines((prev) => [...prev, { label: "", amount: 0 }])}>+ Baris</button>
          </div>
          <div className="space-y-2">
            {editLines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input flex-1" value={l.label} onChange={(e) => setEditLines((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="cth: Transport" />
                <input type="number" min="0" className="input w-44" value={String(l.amount)} onChange={(e) => setEditLines((prev) => prev.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} placeholder="Nominal" />
                <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => setEditLines((prev) => prev.filter((_, j) => j !== i))}>Hapus</button>
              </div>
            ))}
            {editLines.length === 0 && <p className="text-xs text-steel-400">Belum ada baris tunjangan.</p>}
          </div>
        </div>
      </Modal>

      {/* ---------- modal bayar ---------- */}
      <Modal
        open={payTarget !== null}
        onClose={() => setPayTarget(null)}
        title="Bukti Pembayaran"
        subtitle={payTarget ? `${payTarget.id} · net ${fmtRupiah(Number(payTarget.net || 0))}` : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPayTarget(null)}>Batal</button>
            <button className="btn-primary" onClick={confirmPay}>Konfirmasi Bayar</button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal bayar"><input type="date" className="input" value={proof.date} onChange={(e) => setProof({ ...proof, date: e.target.value })} /></Field>
            <Field label="Metode">
              <select className="input" value={proof.method} onChange={(e) => setProof({ ...proof, method: e.target.value })}>
                <option>Transfer</option>
                <option>Tunai</option>
                <option>Giro</option>
              </select>
            </Field>
          </FormGrid>
          <Field label="No. referensi"><input className="input" value={proof.ref} onChange={(e) => setProof({ ...proof, ref: e.target.value })} placeholder="cth: TRF-202608-001" /></Field>
        </div>
      </Modal>

      {/* ---------- modal pesangon ---------- */}
      <Modal
        open={showPesangon}
        onClose={() => setShowPesangon(false)}
        title="Kalkulator Pesangon"
        subtitle="Hitung read-only + export — tanpa menyimpan"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowPesangon(false)}>Tutup</button>
            <button className="btn-primary" onClick={exportPesangon}>
              <Download className="h-4 w-4" /> Export Hasil
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label="Masa kerja (tahun)"><input type="number" min="0" step="0.5" className="input" value={pesForm.masaKerja} onChange={(e) => setPesForm({ ...pesForm, masaKerja: e.target.value })} /></Field>
            <Field label="Upah bulanan (Rp)"><input type="number" min="0" className="input" value={pesForm.upah} onChange={(e) => setPesForm({ ...pesForm, upah: e.target.value })} /></Field>
          </FormGrid>
          <dl className="space-y-2 rounded-xl bg-surface p-3 text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">Pesangon ({pesHitung.pesMonths}× upah, maks 9)</dt><dd className="font-medium">{fmtRupiah(pesHitung.pesangon)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">UPMK ({pesHitung.upmkMonths}× upah)</dt><dd className="font-medium">{fmtRupiah(pesHitung.upmk)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">UPH (15% × pesangon+UPMK)</dt><dd className="font-medium">{fmtRupiah(pesHitung.uph)}</dd></div>
            <div className="flex justify-between border-t border-steel-200 pt-2"><dt className="font-bold text-navy-900">Total</dt><dd className="font-bold text-navy-900">{fmtRupiah(pesHitung.total)}</dd></div>
          </dl>
        </div>
      </Modal>

      {/* ---------- modal slip ---------- */}
      <Modal
        open={slipTarget !== null}
        onClose={() => setSlipTarget(null)}
        title={slipTarget && rowType(slipTarget) !== "Gaji" ? `Slip ${rowType(slipTarget)}` : "Slip Gaji"}
        subtitle={slipTarget ? `${slipTarget.id} · ${empNameOf(String(slipTarget.employeeId))} · ${fmtBulan(String(slipTarget.period))}` : ""}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSlipTarget(null)}>Tutup</button>
            <button className="btn-primary" onClick={() => slipTarget && exportSlip(slipTarget)}>
              <Download className="h-4 w-4" /> Unduh Slip
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
              <dl className="space-y-2 text-sm">
                {rowType(slipTarget) === "Gaji" ? (
                  <>
                    <div className="flex justify-between"><dt className="text-steel-500">{isHarian ? `Upah harian × ${Number(slipTarget.hadirDays ?? 0)} hari` : "Gaji pokok"}</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.basic || 0))}</dd></div>
                    {normAllowances(slipTarget.allowances).map((l, i) => (
                      <div key={i} className="flex justify-between"><dt className="text-steel-500">Tunjangan — {l.label}</dt><dd className="font-medium">{fmtRupiah(Number(l.amount) || 0)}</dd></div>
                    ))}
                    <div className="flex justify-between"><dt className="text-steel-500">Upah lembur</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.overtimePay || 0))}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">Cicilan kasbon</dt><dd className="font-medium">−{fmtRupiah(Number(slipTarget.kasbonPot || 0))}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">Potongan manual</dt><dd className="font-medium">−{fmtRupiah(manualDed)}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">{isHarian ? "PPh harian" : `PPh 21 (${emp?.ptkpStatus ?? "TK/0"})`}</dt><dd className="font-medium">−{fmtRupiah(Number(slipTarget.pph21 || 0))}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">BPJS Kesehatan karyawan ({rates.bpjsKes}%)</dt><dd className="font-medium">−{fmtRupiah(b.kes)}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">BPJS TK – JHT karyawan ({rates.bpjsTk}%)</dt><dd className="font-medium">−{fmtRupiah(b.tk)}</dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">BPJS Kesehatan perusahaan ({rates.bpjsKesPer}%) — info</dt><dd className="font-medium">{fmtRupiah(Number(slipTarget.bpjsKesPer || 0))}</dd></div>
                    <div className="flex justify-between border-t border-steel-200 pt-2"><dt className="font-bold text-navy-900">Gaji bersih</dt><dd className="font-bold text-navy-900">{fmtRupiah(Number(slipTarget.net || 0))}</dd></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><dt className="text-steel-500">Tipe</dt><dd><Badge tone={rowType(slipTarget) === "THR" ? "amber" : "violet"}>{rowType(slipTarget)}</Badge></dd></div>
                    <div className="flex justify-between"><dt className="text-steel-500">Keterangan</dt><dd className="font-medium">{rowType(slipTarget) === "THR" ? `Basis ${fmtRupiah(Number(slipTarget.thrBase || 0))} × ${Number(slipTarget.masaBulan || 0)}/12` : String(slipTarget.bonusNote ?? "")}</dd></div>
                    <div className="flex justify-between border-t border-steel-200 pt-2"><dt className="font-bold text-navy-900">Nominal diterima</dt><dd className="font-bold text-navy-900">{fmtRupiah(Number(slipTarget.net || 0))}</dd></div>
                  </>
                )}
                <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={String(slipTarget.status)} /></dd></div>
                {slipTarget.paidAt && <div className="flex justify-between"><dt className="text-steel-500">Dibayar</dt><dd className="font-medium">{fmtTanggal(slipTarget.paidAt)}</dd></div>}
                {sign.received && <div className="flex justify-between"><dt className="text-steel-500">Diterima</dt><dd className="font-medium">{fmtTanggal(sign.date ?? "")}</dd></div>}
              </dl>
              <div className="rounded-xl bg-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">Tanda terima</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-steel-700">
                    <input type="checkbox" checked={slipSign.received} onChange={(e) => setSlipSign({ ...slipSign, received: e.target.checked })} />
                    Sudah diterima
                  </label>
                  {slipSign.received && (
                    <input type="date" className="input w-auto" value={slipSign.date} onChange={(e) => setSlipSign({ ...slipSign, date: e.target.value })} />
                  )}
                  <button className="btn-secondary text-xs" onClick={saveSlipSign}>Simpan Tanda Terima</button>
                </div>
              </div>
              <p className="text-xs text-steel-400">Jenis payroll: {PAY_TYPES.join(" / ")} · baris lama tanpa tipe dianggap Gaji.</p>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
