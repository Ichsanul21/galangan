import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Wallet, ArrowDownToLine, FileText, Receipt, TrendingUp, Plus, Trash2, Pencil, Eye, Boxes, Ban } from "lucide-react";
import { openFileUrl } from "../../services/files";
import { pdfServerReady } from "../../services/pdfClient";
import { usePdfDoc } from "../../components/usePdfDoc";
import { ID_MON as MONTH_ID } from "../../utils/monthAxis";
import {
  AreaChart,
  Area,
  Bar,
  ComposedChart,
  Legend,
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
  Accordion,
  SortTh,
  toggleSort,
  sortRows,
  usePager,
  toast,
  NumInput, AsyncButton, SecureImg, FileUploadButton,
  SearchBox, rowMatches,
  RowAction,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useBusy } from "../../components/ui";
import { n_fin } from "../../i18n/n_fin";
import { useT } from "../../i18n/LanguageContext";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtRupiah, fmtMiliar, fmtTanggal, fmtJumlah, todayISO } from "../../utils/format";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import { getSetting } from "../../utils/settings";
import { useDraftState } from "../../utils/draft";
import { sameName } from "../../utils/names";
import { sbInvoiceMath, maxSeq, PPN_INVOICE_DEFAULT, PPH_JASA_DEFAULT } from "../../utils/sb";
import { exportExcel, exportExcelSheets } from "../../utils/export";
import { durasiJam, parseJam } from "../../utils/time24";
import { useUrlParam, type UrlParamCodec } from "../../utils/urlParam";
import { kasKodeOf, postCashJournal } from "../../services/autoJournal";
import { FilterPopover } from "../../components/FilterPopover";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { rowHighlightClass } from "../../components/rowHighlight";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { findUsages } from "../../utils/usages";
import {
  COA_EXCEL,
  NL_EXCEL,
  HUTANG_EXCEL,
  PIUTANG_EXCEL,
  KASBANK_EXCEL,
  JU_PENYESUAIAN_EXCEL,
  LAPORAN_EXCEL,
  LATEST_SNAPSHOT,
} from "../../data/financeExcel";

/* Filter historikal Hari/Bulan/Tahun untuk Kas & Bank, Buku Besar, Neraca, Laba Rugi.
   Satu struktur state per tab: { mode, hari (YYYY-MM-DD), bulan (YYYY-MM), tahun (YYYY) }.
   matchHist() dipakai semua tabel bertanggal; tabel Excel statis diberi badge pembanding.
   SALDO memakai helper as-of (kasAsOfReport / plMonthly s.d. tanggal), bukan
   matchHist - lihat catatan di kasAsOfReport. */
export type HistMode = "Semua" | "Hari" | "Bulan" | "Tahun";
export interface HistFilter { mode: HistMode; hari: string; bulan: string; tahun: string }
export const emptyHist = (): HistFilter => ({ mode: "Semua", hari: "", bulan: "", tahun: "" });

/** Encode/decode filter untuk URL: "bulan:2026-06", "tahun:2026", "hari:2026-06-15".
 *  Tanpa ini, pilihan "Juni 2026" hilang saat reload dan tidak bisa dibagikan
 *  ke orang lain - laporan yang sedang ditinjau jadi tidak bisa direferensikan. */
export function histToParam(f: HistFilter): string {
  if (f.mode === "Bulan" && /^\d{4}-\d{2}$/.test(f.bulan)) return `bulan:${f.bulan}`;
  if (f.mode === "Tahun" && /^\d{4}$/.test(f.tahun)) return `tahun:${f.tahun}`;
  if (f.mode === "Hari" && /^\d{4}-\d{2}-\d{2}$/.test(f.hari)) return `hari:${f.hari}`;
  return "";
}
export function histFromParam(raw: string | null | undefined): HistFilter {
  const s = String(raw ?? "").trim();
  const [k, v = ""] = s.split(":");
  /* Regex saja tidak cukup: "2026-13" lolos pola YYYY-MM dan "2026-02-30"
     pola YYYY-MM-DD, padahal keduanya tanggal yang tidak ada. Filter dengan
     tanggal acuan salah lebih berbahaya daripada filter kosong - angka yang
     tampil terlihat sah, hanya bukan yang benar. */
  if (k === "bulan" && bulanValid(v)) return { mode: "Bulan", hari: "", bulan: v, tahun: "" };
  if (k === "tahun" && /^\d{4}$/.test(v)) return { mode: "Tahun", hari: "", bulan: "", tahun: v };
  if (k === "hari" && hariValid(v)) return { mode: "Hari", hari: v, bulan: "", tahun: "" };
  return emptyHist();
}
function bulanValid(v: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(v)) return false;
  const m = Number(v.slice(5, 7));
  return m >= 1 && m <= 12;
}
function hariValid(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/* Kodec didefinisikan sekali di luar komponen: useUrlParam melakukan
   memo pada identitas codec, jadi object yang dibuat inline setiap render
   membuat hook menganggap nilai berubah terus-menerus. */
const HIST_CODEC = {
  parse: histFromParam,
  format: (f: HistFilter): string => histToParam(f),
} satisfies UrlParamCodec<HistFilter>;

/** Filter historikal yang tersimpan di URL - survive reload & bisa dibagikan. */
function useHistFilterParam(key: string): [HistFilter, (next: HistFilter) => void] {
  return useUrlParam(key, HIST_CODEC);
}

export function matchHist(dateISO: unknown, f: HistFilter): boolean {
  if (f.mode === "Semua") return true;
  const s = String(dateISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  if (f.mode === "Hari") return !!f.hari && s === f.hari;
  if (f.mode === "Bulan") return !!f.bulan && s.slice(0, 7) === f.bulan;
  if (f.mode === "Tahun") return !!f.tahun && s.slice(0, 4) === f.tahun;
  return true;
}
export function matchHistPeriod(periodYM: unknown, f: HistFilter): boolean {
  if (f.mode === "Semua") return true;
  const s = String(periodYM ?? "");
  if (!/^\d{4}-\d{2}$/.test(s)) return false;
  if (f.mode === "Hari") return !!f.hari && s === f.hari.slice(0, 7);
  if (f.mode === "Bulan") return !!f.bulan && s === f.bulan;
  if (f.mode === "Tahun") return !!f.tahun && s.slice(0, 4) === f.tahun;
  return true;
}
/* Filter historikal: UTAMA per bulan (input month), opsi per tanggal
   spesifik atau per tahun. Mode Tahun sempat ada di matchHist dan
   liveAsOf tapi tidak pernah ditampilkan - sekarang tampil, karena
   pemanggil sudah mengimplementasikannya dan tombolnya dibuat-buat
   menyimpan kode mati. */
export function HistFilterBar({ value, onChange, idPrefix }: { value: HistFilter; onChange: (v: HistFilter) => void; idPrefix: string }) {
  const { locale } = useT();
  const T = n_fin[locale];
  const modes: { id: HistMode; label: string }[] = [
    { id: "Semua", label: T.histAll },
    { id: "Bulan", label: T.histMonth },
    { id: "Hari", label: T.histDay },
    { id: "Tahun", label: T.histYear },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-surface px-3 py-2">
      <span className="text-xs font-semibold text-steel-500">{T.histLabel}</span>
      {modes.map((m) => (
        <button key={m.id} type="button" onClick={() => onChange({ ...value, mode: m.id })}
          aria-pressed={value.mode === m.id}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${value.mode === m.id ? "bg-navy-700 text-white" : "bg-white text-steel-600 hover:bg-steel-100"}`}>
          {m.label}
        </button>
      ))}
      {value.mode === "Bulan" && (
        <input id={`${idPrefix}-bulan`} type="month" className="input w-auto py-1.5 text-xs" value={value.bulan} onChange={(e) => onChange({ ...value, bulan: e.target.value })} aria-label={T.histMonthAria} />
      )}
      {value.mode === "Hari" && (
        <input id={`${idPrefix}-hari`} type="date" className="input w-auto py-1.5 text-xs" value={value.hari} onChange={(e) => onChange({ ...value, hari: e.target.value })} aria-label={T.histDayAria} />
      )}
      {value.mode === "Tahun" && (
        /* type="number" karena <input type="number"> tidak punya validasi
           tahun; min/max mencegah tahun 4 digit terpotong. */
        <input id={`${idPrefix}-tahun`} type="number" inputMode="numeric" min={1000} max={9999} step={1}
          className="input w-24 py-1.5 text-xs font-mono" value={value.tahun}
          onChange={(e) => onChange({ ...value, tahun: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          aria-label={T.histYearAria} placeholder={LATEST_SNAPSHOT.slice(0, 4)} />
      )}
      {value.mode !== "Semua" && (
        <button type="button" className="text-xs font-semibold text-ocean-600 hover:underline" onClick={() => onChange(emptyHist())}>{T.histReset}</button>
      )}
    </div>
  );
}

const INV_NEXT: Record<string, string[]> = {
  Draft: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Belum Dibayar"],
  // Terlambat bukan transisi manual - terisi otomatis dari due (efek di bawah).
  "Belum Dibayar": ["Lunas"],
  Terlambat: ["Lunas"],
  Ditolak: ["Draft"],
  Lunas: [],
  Dihapusbukukan: [],
};

const BILLING_TYPES = ["Milestone", "Progres", "Uang Muka", "Retensi", "T&M"] as const;

/* Pipeline invoice: Draft → Diajukan → Disetujui → Belum Dibayar → Lunas.
   Terlambat = cabang Belum Dibayar; Ditolak kembali ke Draft. */
const INV_STAGES = ["Draft", "Diajukan", "Disetujui", "Belum Dibayar", "Terlambat", "Lunas", "Ditolak", "Dihapusbukukan"] as const;

function InvStageStrip({ counts, active, onPick }: {
  counts: Record<string, number>;
  active: string;
  onPick: (s: string) => void;
}) {
  const { locale } = useT();
  const S = n_fin[locale];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={S.invFilterAria}>
      {INV_STAGES.map((st, i) => {
        const n = counts[st] ?? 0;
        const on = active === st;
        return (
          <button
            key={st}
            onClick={() => onPick(on ? "Semua" : st)}
            aria-pressed={on}
            title={n === 0 ? S.stageEmpty.replace("{a}", st) : S.stageShow.replace("{n}", String(n)).replace("{a}", st)}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              on ? "border-navy-700 bg-navy-700 text-white" : "border-steel-200 bg-white text-steel-700 hover:border-navy-400"
            }`}
          >
            {st}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${on ? "bg-white/25 text-white" : "bg-surface text-steel-600"}`}>
              {n}
            </span>
            {i < INV_STAGES.length - 1 && <span aria-hidden className={on ? "text-white/60" : "text-steel-300"}>→</span>}
          </button>
        );
      })}
      <span className="text-xs text-steel-400">{S.flowHint}</span>
    </div>
  );
}

const INV_PREFIX: Record<string, string> = {
  Milestone: "INV/MS-SMD",
  Progres: "INV/PR-SMD",
  "Uang Muka": "INV/UM-SMD",
  Retensi: "INV/RT-SMD",
  "T&M": "INV/TM-SMD",
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
  { name: "1-30 hari", min: 1, max: 30 },
  { name: "31-60 hari", min: 31, max: 60 },
  { name: "61-90 hari", min: 61, max: 90 },
  { name: "91-120 hari", min: 91, max: 120 },
  { name: ">120 hari", min: 121, max: Number.POSITIVE_INFINITY },
];

/* Tarif default bila master equipment belum punya `rate`. Nilai INTI dulu
   dipakai untuk semua alat sekaligus; sekarang tarifnya dibaca per unit dari
   data/index.ts (lihat equipRateOf di bawah) dan konstanta ini hanya tersisa
   sebagai jaring pengaman. */
const EQUIP_RATE_PER_JAM = 1500000;

interface InvLine {
  desc: string;
  qty: string;
  unit: string;
  price: string;
  rate: string;
  hours: string;
  kategori: string; // "Jasa" | "Material" - split RawData CONTOH INVOICE
}

const invNext = (s: string): string[] => INV_NEXT[s] ?? [];
const emptyProof = () => ({ date: todayISO(), method: "Transfer", ref: "" });
const emptyLine = (): InvLine => ({ desc: "", qty: "1", unit: "pcs", price: "", rate: "", hours: "", kategori: "Jasa" });
const num = (v: unknown): number => Number(v) || 0;

// Neto invoice: grandTotal bila ada, else amount dikurangi retensi yang ditahan.
const invNeto = (inv: StoreItem): number => {
  const g = num(inv.grandTotal);
  if (g > 0) return g;
  return Math.max(0, num(inv.amount) - num(inv.retentionAmt));
};

// Payroll: bruto = basic + tunjangan (array|number) + lembur; net = kas keluar;
// potongan = bruto - net (PPh21 + BPJS karyawan), selalu seimbang.
const allowSum = (p: StoreItem): number => {
  const a = p.allowances;
  if (Array.isArray(a)) return a.reduce((s: number, l: unknown) => s + num((l as { amount?: unknown }).amount), 0);
  return num(a);
};
const payBruto = (p: StoreItem): number => num(p.basic) + allowSum(p) + num(p.overtimePay);
const payNet = (p: StoreItem): number => {
  const n = num(p.net);
  if (n > 0) return n;
  const bruto = payBruto(p);
  const pot = num(p.pph21) + num(p.bpjsKesKar ?? p.bpjsKes) + num(p.bpjsTkKar ?? p.bpjsTk) + num(p.deductions);
  return Math.max(0, bruto - pot);
};

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

/* Lama pakai equipment dari rentang jam. Versi lama regex-nya tidak
   punya cabang AM/PM, sehingga booking warisan "7:00 PM-6:00 AM"
   menghasilkan selisih negatif yang dibuang jadi 0 jam - durasi
   tengah malam hilang dari laporan. Sekarang lewat helper jam yang
   sama dengan modul lain, dan rentang tengah malam dihitung 24 jam. */
function parseJamHours(jam: unknown): number {
  const r = parseJam(jam);
  if (!r) return 0;
  return durasiJam(r.mulai, r.selesai);
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

// Saldo pembanding Excel (Neraca Saldo Agustus 2026, satu-satunya snapshot audit).
// Baris Kas/Hutang/Piutang membawa `periode` (YYYY-MM), jurnal membawa `tgl`.
// SEMUA historikal lain DIHITUNG LIVE dari dokumen (jurnal, payables, invoices,
// payroll) - tidak ada snapshot hardcode per bulan.
/* Snapshot audit hanya ada untuk '2026-08'. */
const isSnapMonth = (ym: string): boolean => ym === LATEST_SNAPSHOT;
const nlOf = (kode: string): { d: number; k: number } => NL_EXCEL[kode] ?? { d: 0, k: 0 };
/* Tanggal as-of (YYYY-MM-DD) dari filter: Hari -> hari itu; Bulan -> hari
   TERAKHIR bulan itu; Tahun -> 31 Desember; Semua -> TANGGAL TRANSAKSI
   TERAKHIR yang ada di data, bukan konstanta.
   Versi lama memakai `${bulan}-31` untuk semua bulan, jadi Juni jadi
   '2026-06-31' - tanggal yang tidak ada. Kebetulan perbandingan leksikal
   tetap benar karena format ISO, tapi badge di UI menampilkan tanggal yang
   tidak pernah ada. */
function akhirBulan(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return `${ym}-31`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}
export function liveAsOf(f: HistFilter, lastDate = ""): string {
  if (f.mode === "Hari" && /^\d{4}-\d{2}-\d{2}$/.test(f.hari)) return f.hari;
  if (f.mode === "Bulan" && /^\d{4}-\d{2}$/.test(f.bulan)) return akhirBulan(f.bulan);
  if (f.mode === "Tahun" && /^\d{4}$/.test(f.tahun)) return `${f.tahun}-12-31`;
  /* Mode "Semua": memakai transaksi terakhir yang benar-benar ada. Damanya
     konstanta "2026-08-31" yang tadinya ditulis di sini: data yang masuk
     setelah Agustus 2026 tidak pernah ikut terhitung dan tidak ada yang
     memberi tahu - angkanya terlihat masuk akal, hanya bukan yang sebenarnya. */
  const s = String(lastDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
/* As-of kosong (data belum ada) berarti "sampai hari ini". */
export function asOfOrToday(f: HistFilter, lastDate = ""): string {
  return liveAsOf(f, lastDate) || todayISO();
}
/* Saldo Kas/Bank AS-OF tanggal D plus mutasi periode filter, dalam satu
   lintasan.

   matchHist() hanya menyaring jurnal yang ADA DI DALAM window, jadi tidak
   bisa dipakai untuk saldo: saldo Kas 1 Juni = saldo 31 Mei + mutasi Juni,
   sedangkan mutasi Juni saja menghasilkan saldo yang kehilangan saldo awal.
   Saldo awal dari snapshot Excel hanya dipakai kalau snapshot bulan itu
   yang memang diminta; bulan lain dihitung dari nol. Pola kumulatif yang
   sama sudah dipakai apOutAsOf/arOutAsOf untuk hutang & piutang - yang
   hilang hanya versi jurnal. */
export function kasAsOfReport(
  list: StoreItem[],
  end: string,
  f: HistFilter,
  opening: Record<string, number>,
  kodeRe: RegExp,
): { saldo: Record<string, number>; masuk: Record<string, number>; keluar: Record<string, number>; hitung: number } {
  const saldo: Record<string, number> = { ...opening };
  const masuk: Record<string, number> = {};
  const keluar: Record<string, number> = {};
  let hitung = 0;
  for (const j of list) {
    if (j.status === "Void") continue;
    if (j.sumber !== "Kas" && j.sumber !== "Bank") continue;
    const d = String(j.date ?? "").slice(0, 10);
    const inPeriod = matchHist(d, f);
    const amt = num(j.amount);
    for (const [kode, side] of [[String(j.db ?? ""), 1], [String(j.kr ?? ""), -1]] as const) {
      if (!kodeRe.test(kode)) continue;
      if (d <= end) {
        saldo[kode] = (saldo[kode] ?? 0) + side * amt;
        if (inPeriod) {
          hitung += 1;
          const bucket = side > 0 ? masuk : keluar;
          bucket[kode] = (bucket[kode] ?? 0) + amt;
        }
      }
    }
  }
  return { saldo, masuk, keluar, hitung };
}

/* Sisa hutang per vendor AS-OF tanggal D, live dari koleksi payables:
   amt tercatat - pembayaran bertanggal <= D (pay1/pay2 tanpa tanggal ikut terhitung). */
function apOutAsOf(list: StoreItem[], end: string): { v: string; total: number; count: number }[] {
  const m = new Map<string, { v: string; total: number; count: number }>();
  for (const a of list) {
    let paid = 0;
    if (num(a.pay1) > 0 && (!a.pay1date || String(a.pay1date) <= end)) paid += num(a.pay1);
    if (num(a.pay2) > 0 && (!a.pay2date || String(a.pay2date) <= end)) paid += num(a.pay2);
    const out = Math.max(0, num(a.amt) - paid);
    if (out <= 0) continue;
    const v = String(a.v ?? "-");
    const cur = m.get(v) ?? { v, total: 0, count: 0 };
    cur.total += out;
    cur.count += 1;
    m.set(v, cur);
  }
  return [...m.values()].sort((x, y) => y.total - x.total);
}
/* Sisa piutang per customer AS-OF tanggal D, live dari koleksi invoices:
   neto invoice yang belum lunas per D (Lunas tanpa paidAt dianggap lunas;
   hapus buku hanya keluar bila writeOffAt <= D). */
function arOutAsOf(list: StoreItem[], end: string): { c: string; total: number; count: number }[] {
  const m = new Map<string, { c: string; total: number; count: number }>();
  for (const i of list) {
    const st = String(i.status ?? "");
    if (st === "Draft") continue;
    if (st === "Dihapusbukukan" && String(i.writeOffAt ?? "") <= end) continue;
    if (st === "Lunas" && (!i.paidAt || String(i.paidAt) <= end)) continue;
    const v = invNeto(i);
    if (v <= 0) continue;
    const c = String(i.client ?? "-");
    const cur = m.get(c) ?? { c, total: 0, count: 0 };
    cur.total += v;
    cur.count += 1;
    m.set(c, cur);
  }
  return [...m.values()].sort((x, y) => y.total - x.total);
}

export default function Finance() {
  const busy = useBusy();
  /* Judul kolom SPT tidak ada lagi di FE: dokumennya dirakit server dari
     baris `taxPeriods`, dan labelnya ikut dari factory yang sama. Satu tempat
     lagi akan jadi tempat kedua yang bisa berbeda dari dokumen filed. */
  /* ==========================================================================
   FORM PENYETORAN PAJAK (SPT)
   ==========================================================================

   Tab Pajak sebelumnya tidak punya form sama sekali - hanya KPI turunan
   hitungan dan tombol ekspor. Yang borrower cek keady tax adalah NPWP
   perusahaan, kode retval, nomor formulir, dan bank penyetor; tidak satu
   pun ada di aplikasi, jadi harus dicari di luar sistem setiap kali SPT
   dicetak.

   Kolom PPN/PPh TIDAK diketik manual. Angka itu turun dari invoice Lunas,
   payable Lunas, payroll, dan termin - semuanya sudah dihitung taxCalc.
   Yang diketik di sini adalah identitas dan bukti setor, yaitu hal yang
   memang tidak bisa diturunkan dari data operasional.

   PPN terutang tetap dibaca dari perhitungan, dengan override opsional
   (`ppnTerutangManual`) untuk kasus ketika ada koreksi manual yang tidak
   tercermin di jurnal. Kalau diisi, field itu yang dipakai SPT dan diberi
   catatan supaya selisihnya terlihat, bukan tersembunyi. */

type SptNumField =
  | "npwp" | "npwpPenyetor" | "tanggalSetor" | "nomorFormulir" | "bank" | "teller"
  | "kodeRetval" | "klu" | "penanggungJawab" | "telepon" | "email"
  | "dppKelDN" | "dppKelLN" | "ppnTerpotong"
  | "dppMasDN" | "dppMasLN" | "ppnImpor" | "ppnTidakDikreditkan" | "ppnDikompensasikan"
  | "pph21" | "pph22" | "pph23" | "pph24" | "pph25" | "pph26"
  | "ppnBM" | "retensiWithhold" | "ppnTerutangManual";

const SPT_NUM_FIELDS: SptNumField[] = [
  "npwp", "npwpPenyetor", "tanggalSetor", "nomorFormulir", "bank", "teller",
  "kodeRetval", "klu", "penanggungJawab", "telepon", "email",
  "dppKelDN", "dppKelLN", "ppnTerpotong",
  "dppMasDN", "dppMasLN", "ppnImpor", "ppnTidakDikreditkan", "ppnDikompensasikan",
  "pph21", "pph22", "pph23", "pph24", "pph25", "pph26",
  "ppnBM", "retensiWithhold", "ppnTerutangManual",
];

const SPT_TEXT_FIELDS = ["npwp", "npwpPenyetor", "tanggalSetor", "nomorFormulir", "bank", "teller", "kodeRetval", "klu", "penanggungJawab", "telepon", "email"] as const;
const SPT_AMOUNT_FIELDS = [
  "dppKelDN", "dppKelLN", "ppnTerpotong",
  "dppMasDN", "dppMasLN", "ppnImpor", "ppnTidakDikreditkan", "ppnDikompensasikan",
  "pph21", "pph22", "pph23", "pph24", "pph25", "pph26",
  "ppnBM", "retensiWithhold", "ppnTerutangManual",
] as const;

const sptNumOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function SptFilingForm({ period, locked, onSave }: {
  period: StoreItem;
  locked: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const { locale } = useT();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of SPT_NUM_FIELDS) out[f] = String(period[f] ?? "");
    return out;
  });
  const [dirty, setDirty] = useState(false);

  /* Pindah periode -> muat ulang isinya. Tanpa ini form akan menampilkan
     NPWP periode sebelumnya saat user mengganti select periode. */
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of SPT_NUM_FIELDS) next[f] = String(period[f] ?? "");
    setDraft(next);
    setDirty(false);
  }, [period.id]);

  const set = (f: SptNumField, v: string): void => {
    setDraft((d) => ({ ...d, [f]: v }));
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    const patch: Record<string, unknown> = {};
    for (const f of SPT_TEXT_FIELDS) patch[f] = draft[f] ?? "";
    for (const f of SPT_AMOUNT_FIELDS) patch[f] = sptNumOf(draft[f]);
    await onSave(patch);
    setDirty(false);
  };

  const txt = (f: SptNumField, label: string, ph = ""): ReactElement => (
    <Field label={label}>
      <input
        className="input font-mono"
        value={draft[f] ?? ""}
        placeholder={ph}
        disabled={locked}
        onChange={(e) => set(f, e.target.value)}
        aria-label={label}
      />
    </Field>
  );
  const amt = (f: SptNumField, label: string): ReactElement => (
    <Field label={label}>
      <input
        className="input font-mono text-right"
        inputMode="numeric"
        value={draft[f] ?? ""}
        placeholder="0"
        disabled={locked}
        onChange={(e) => set(f, e.target.value.replace(/[^\d]/g, ""))}
        aria-label={label}
      />
    </Field>
  );

  const manual = sptNumOf(draft.ppnTerutangManual);
  const auto = sptNumOf(period.ppnTerutangAuto);
  const usingManual = manual > 0;

  return (
    <Card className="p-4">
      <CardHeader
        title={locale === "en" ? "Filing identity & payment" : "Identitas & Bukti Setor"}
        subtitle={locale === "en"
          ? "Figures come from the operational data. Only the identity and the payment proof are typed."
          : "Angka berasal dari data operasional. Yang diketik hanya identitas dan bukti setor."}
        action={
          <div className="flex items-center gap-2">
            {dirty && !locked && (
              <button className="btn-primary text-xs" onClick={() => void save()}>
                {locale === "en" ? "Save filing" : "Simpan data setor"}
              </button>
            )}
            {locked && (
              <Badge tone="green">{locale === "en" ? "Locked - filed" : "Terkunci - sudah lapor"}</Badge>
            )}
          </div>
        }
      />

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">
            {locale === "en" ? "Company" : "Identitas perusahaan"}
          </p>
          <FormGrid>
            {txt("npwp", locale === "en" ? "Company NPWP" : "NPWP perusahaan", "01.234.567.8-901.000")}
            {txt("klu", locale === "en" ? "KLU (business classification)" : "KLU (klasifikasi usaha)", "45101")}
            {txt("penanggungJawab", locale === "en" ? "Responsible person" : "Penanggung jawab")}
            {txt("telepon", locale === "en" ? "Phone" : "Telepon")}
            {txt("email", locale === "en" ? "Email" : "Surel")}
          </FormGrid>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">
            {locale === "en" ? "Output VAT (PPN Keluaran)" : "PPN Keluaran"}
          </p>
          <FormGrid>
            {amt("dppKelDN", locale === "en" ? "Domestic VAT base" : "DPP dalam negeri")}
            {amt("dppKelLN", locale === "en" ? "Foreign VAT base" : "DPP luar negeri")}
            {amt("ppnTerpotong", locale === "en" ? "VAT withheld (credit note)" : "PPN terpotong (kredit nota)")}
          </FormGrid>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">
            {locale === "en" ? "Input VAT (PPN Masukan)" : "PPN Masukan"}
          </p>
          <FormGrid>
            {amt("dppMasDN", locale === "en" ? "Domestic input base" : "DPP dalam negeri")}
            {amt("dppMasLN", locale === "en" ? "Foreign input base" : "DPP luar negeri")}
            {amt("ppnImpor", locale === "en" ? "Import VAT" : "PPN impor")}
            {amt("ppnTidakDikreditkan", locale === "en" ? "VAT not creditable" : "PPN tidak dikreditkan")}
            {amt("ppnDikompensasikan", locale === "en" ? "Carried forward" : "PPN dikompensasikan")}
          </FormGrid>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">
            {locale === "en" ? "Income tax withheld (PPh)" : "PPh dipotong"}
          </p>
          <FormGrid>
            {amt("pph21", "PPh 21")}
            {amt("pph22", "PPh 22")}
            {amt("pph23", "PPh 23")}
            {amt("pph24", "PPh 24")}
            {amt("pph25", "PPh 25")}
            {amt("pph26", "PPh 26")}
          </FormGrid>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">
            {locale === "en" ? "Other" : "Lainnya"}
          </p>
          <FormGrid>
            {amt("ppnBM", locale === "en" ? "VAT base for luxury goods (PPnBM)" : "PPnBM")}
            {amt("retensiWithhold", locale === "en" ? "Retention withheld" : "Retensi dipotong")}
          </FormGrid>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            {locale === "en" ? "VAT payable" : "PPN terutang"}
          </p>
          <p className="text-sm text-navy-900">
            {locale === "en" ? "From operational data" : "Dari data operasional"}:{" "}
            <span className="font-semibold">{fmtRupiah(auto)}</span>
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {amt("ppnTerutangManual", locale === "en" ? "Manual override" : "Override manual")}
            <Field label={locale === "en" ? "Used on SPT" : "Dipakai di SPT"}>
              <div className="flex h-9 items-center gap-2">
                <Badge tone={usingManual ? "amber" : "green"}>
                  {usingManual
                    ? (locale === "en" ? "Manual override" : "Override manual")
                    : (locale === "en" ? "Automatic" : "Otomatis")}
                </Badge>
                <span className="font-semibold">{fmtRupiah(usingManual ? manual : auto)}</span>
              </div>
            </Field>
          </div>
          {usingManual && (
            <p className="mt-2 text-[11px] text-amber-700">
              {locale === "en"
                ? `Manual override differs from the calculated figure by ${fmtRupiah(manual - auto)}. The override is what gets printed.`
                : `Override manual berbeda dari angka perhitungan sebesar ${fmtRupiah(manual - auto)}. Angka override inilah yang dicetak.`}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">
            {locale === "en" ? "Payment" : "Penyetoran"}
          </p>
          <FormGrid>
            {txt("npwpPenyetor", locale === "en" ? "Depositor NPWP/NTWP" : "NPWP/NTWP penyetor")}
            {txt("tanggalSetor", locale === "en" ? "Deposit date" : "Tanggal setor")}
            {txt("nomorFormulir", locale === "en" ? "Form number" : "Nomor formulir", "1.1-08-000-1.2-23-24/26")}
            {txt("bank", locale === "en" ? "Bank" : "Bank")}
            {txt("teller", locale === "en" ? "Teller" : "Teller")}
            {txt("kodeRetval", locale === "en" ? "Return code" : "Kode retval", "1")}
          </FormGrid>
        </div>
      </div>
    </Card>
  );
}

const { data, add, update, remove, log, branch, inBranch } = useStore();

  /* Buka bukti pembayaran di tab baru. window.open(url) biasa ada di sini
     sebelumnya, tapi tab baru tidak membawa header Authorization sehingga
     backend membalas 401 - pengguna melihat halaman login, bukan bukti.
     openFileUrl membuka tab baru lewat blob ber-JWT. */
  const openProof = (url: string): Promise<void> => openFileUrl(url);
  const { locale } = useT();
  const S = n_fin[locale];
  const modAlert = useModuleAlert("keuangan");
  const flash = useNotifFlash();
  const pdfDoc = usePdfDoc();
    const deepParams = useDeepLinkParams();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  const [tab, setTab] = useState("Akun");
  const [retQ, setRetQ] = useState("");
  const [plQ, setPlQ] = useState("");
  const [allocQ, setAllocQ] = useState("");
  const [juListQ, setJuListQ] = useState("");
  /* Pencarian teks untuk Piutang (AR) dan Hutang (AP). Tab lain di modul ini
     punya search sendiri atau tabelnya pendek. */
  const [arQ, setArQ] = useState("");
  const [apQ, setApQ] = useState("");
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
    clientPO: "",
    retentionPct: "5",
    due: "",
    paymentTerm: "Termin 1",
    nsfp: "",
    noFaktur: "",
    kodePembantu: "",
    skdt: false, // INV PAKAI SKDT: tanpa PPN (cth BG MHKL 35)
    dpApplied: "", // amortisasi uang muka (cth V2 potong DP-1 Rp 1.098M)
    dpRef: "", // referensi DP wajib bila dpApplied > 0 (cth INV/UM-SMD-2026-001)
  });
  const [invLines, setInvLines] = useDraftState<InvLine[]>("isms.draft.finance.invLines", [emptyLine()]);
  const [payTarget, setPayTarget] = useState<StoreItem | null>(null);
  const [apTarget, setApTarget] = useState<StoreItem | null>(null);
  const [apPayAmt, setApPayAmt] = useState("");
  const [proof, setProof] = useState(emptyProof);
  /* Lampiran gambar bukti pembayaran (satu state dipakai modal invoice & hutang). */
  const [proofImg, setProofImg] = useState("");
  /* Modal Detail Invoice (read-only + viewer bukti & jurnal). */
  const [invDetail, setInvDetail] = useState<StoreItem | null>(null);
  /* Filter historikal per tab laporan. */
  /* Keempat filter historikal disimpan di URL (?kas=bulan:2026-06&nr=).
   Tanpa itu, laporan yang sedang ditinjau hilang begitu halaman di-reload
   dan tidak bisa dibagikan - "tolong cek Kas & Bank Juni 2026" jadi
   kalimat yang tidak punya tautan. */
  const [kasHist, setKasHist] = useHistFilterParam("kas");
  const [bbHist, setBbHist] = useHistFilterParam("bb");
  const [lrHist, setLrHist] = useHistFilterParam("lr");
  const [nrHist, setNrHist] = useHistFilterParam("nr");
  /* Lampiran gambar jurnal manual. */
  const [juImg, setJuImg] = useState("");
  const [juViewer, setJuViewer] = useState<StoreItem | null>(null);
  const [rejectInv, setRejectInv] = useState<StoreItem | null>(null);
  const [showAp, setShowAp] = useState(false);
  const [apForm, setApForm] = useState({ v: "", kodePembantu: "", po: "", openAwal: "", amt: "", due: "", nonPpn: false, vessel: "", item: "" });
  const [apEdit, setApEdit] = useState<StoreItem | null>(null);
  const [apEditForm, setApEditForm] = useState({ v: "", kodePembantu: "", openAwal: "", amt: "", due: "", nonPpn: false, vessel: "", item: "" });
  const [releaseTarget, setReleaseTarget] = useState<StoreItem | null>(null);
  const [releaseForm, setReleaseForm] = useState({ date: todayISO(), ba: "", warrantyId: "" });
  const [taxId, setTaxId] = useState("");
  /* Periode pajak "Lapor" sudah jadi SPT yang filed - tidak boleh hilang. */
  const [delTax, setDelTax] = useState<StoreItem | null>(null);
  /* Menandai Lapor bersifat satu arah: periode terkunci, angka tidak bisa
     diedit lagi, dan hutang pajak terbit sebagai payables. Tidak ada jalan
     membatalkan dari halaman ini, jadi harus dikonfirmasi lebih dulu -
     dan konfirmasinya menampilkan angkanya, bukan sekadar "Yakin?" karena
     yang dikunci adalah angka yang tidak bisa dikoreksi lagi. */
  const [confirmLapor, setConfirmLapor] = useState(false);
  const [newPeriod, setNewPeriod] = useState("");

  // 1. AR aging + dunning + hapus buku
  const [writeOff, setWriteOff] = useState<StoreItem | null>(null);
  const [writeOffReason, setWriteOffReason] = useState("");
  const [confirmWriteOff, setConfirmWriteOff] = useState(false);
  const [woDirCheck, setWoDirCheck] = useState(false);
  const [woDirName, setWoDirName] = useState("");

  // 2. Jadwal bayar / batch
  const [schedSel, setSchedSel] = useDraftState<string[]>("isms.draft.finance.schedSel", []);
  const [showBatch, setShowBatch] = useState(false);
  const [batchProof, setBatchProof] = useState(emptyProof);
  /* Satu bukti gambar dipakai bersama untuk semua baris batch. */
  const [batchImg, setBatchImg] = useState("");

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
  const [coaQ, setCoaQ] = useState("");
  const [coaTipe, setCoaTipe] = useState("Semua");
  const coaTipeOptions = ["Semua", "Aset", "Liabilitas", "Ekuitas", "Pendapatan", "Beban", "Header"];
  const coaFiltered = coaRows.filter((c) => {
    const tipe = coaList.find((x) => x.kode === String(c.kode))?.tipe ?? "";
    const matchT = coaTipe === "Semua" || tipe === coaTipe;
    const matchQ = rowMatches(c, coaQ, ["kode", "nama", "dk", "nrlr", "id"]);
    return matchT && matchQ;
  });
  /* Sort per tabel - satu state per tabel agar tidak bentrok antar tab. */
  const [akunSort, setAkunSort] = useState<SortState>({ key: null, dir: "asc" });
  const [arSort, setArSort] = useState<SortState>({ key: null, dir: "asc" });
  const [apSort, setApSort] = useState<SortState>({ key: null, dir: "asc" });
  const [kasSort, setKasSort] = useState<SortState>({ key: null, dir: "asc" });
  const [jadwalSort, setJadwalSort] = useState<SortState>({ key: null, dir: "asc" });
  const [invSort, setInvSort] = useState<SortState>({ key: null, dir: "asc" });
  const [invFQ, setInvFQ] = useState("");
  const [invFStatus, setInvFStatus] = useState("Semua");
  const [invFBilling, setInvFBilling] = useState("Semua");
  /* Filter tanggal historikal (Hari/Bulan/Tahun) utk tab Invoice+AR (jatuh tempo),
     Hutang (jatuh tempo), dan Jurnal (tanggal jurnal). */
  const [invHist, setInvHist] = useState<HistFilter>(emptyHist);
  const [apHist, setApHist] = useState<HistFilter>(emptyHist);
  const [juHist, setJuHist] = useState<HistFilter>(emptyHist);
  const invStageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const st of INV_STAGES) c[st] = 0;
    for (const i of invoices) {
      const s = String(i.status ?? "");
      if (s in c) c[s] += 1;
    }
    return c;
  }, [invoices]);
  const filteredInvoices = useMemo(() => {
    return invoices.filter((i) => {
      if (invFStatus !== "Semua" && String(i.status ?? "") !== invFStatus) return false;
      if (invFBilling !== "Semua" && String(i.billingType ?? i.paymentTerm ?? "") !== invFBilling) return false;
      if (!matchHist(String(i.due ?? ""), invHist)) return false;
      /* `rowMatches` dengan field yang dinyatakan, bukan satu string gabungan.
         Field yang tidak disebut tidak ikut dicari - dan itulah bug yang
         membuat nomor invoice sulit ditemukan: `noInv` (nomor resmi yang
         tercetak di kertas, mis. "058/INV-SB/SMD/IX/2026") TIDAK ada di
         daftar field lama, padahal itu yang dicari akuntansi. `vessel` juga
         tidak, padahal invoice selalu punya kapal. */
      if (!rowMatches(i as unknown as Record<string, unknown>, invFQ, ["id", "noInv", "client", "project", "vessel", "status", "milestoneRef", "billingType", "paymentTerm"])) return false;
      return true;
    });
  }, [invoices, invFQ, invFStatus, invFBilling, invHist]);
  const filteredAr = useMemo(
    () => invoices
      .filter((i) => matchHist(String(i.due ?? ""), invHist))
      .filter((i) => rowMatches(i as unknown as Record<string, unknown>, arQ, ["id", "client", "kodePembantu", "status", "po"])),
    [invoices, invHist, arQ]);
  const filteredAp = useMemo(
    () => payables
      .filter((a) => matchHist(String(a.due ?? ""), apHist))
      .filter((a) => rowMatches(a as unknown as Record<string, unknown>, apQ, ["v", "kodePembantu", "po", "vessel", "item", "st"])),
    [payables, apHist, apQ]);
  const filteredJu = useMemo(
    () => manJournals
      .filter((j) => matchHist(String(j.date ?? ""), juHist))
      .filter((j) => rowMatches(j as unknown as Record<string, unknown>, juListQ, ["id", "uraian", "db", "kr", "sumber", "status", "dokumen"])),
    [manJournals, juHist, juListQ]);
  const [bbSort, setBbSort] = useState<SortState>({ key: null, dir: "asc" });
  const [lrSort, setLrSort] = useState<SortState>({ key: null, dir: "asc" });
  const [nrSort, setNrSort] = useState<SortState>({ key: null, dir: "asc" });
  const [asetSort, setAsetSort] = useState<SortState>({ key: null, dir: "asc" });
  const [juSort, setJuSort] = useState<SortState>({ key: null, dir: "asc" });
  const [alokasiSort, setAlokasiSort] = useState<SortState>({ key: null, dir: "asc" });
  const [pajakSort, setPajakSort] = useState<SortState>({ key: null, dir: "asc" });
  const sortedInv = useMemo(() => sortRows(filteredInvoices, invSort, (inv, k) =>
    k === "tipe" ? String(inv.billingType ?? inv.paymentTerm ?? "") : k === "lines" ? (Array.isArray(inv.lines) ? inv.lines.length : 1) :
    k === "retensi" ? num(inv.retentionAmt) : k === "efaktur" ? String(inv.nsfp ?? inv.noFaktur ?? "") :
    k === "amount" ? invNeto(inv) : k === "status" ? String(inv.status) :
    /* Tanggal lewat `createdAtOf`/`lastTouchedAt` yang sudah menormalkan ke ISO
       penuh. Field mentah tidak aman: `updated_at` server bertanda jam
       sedangkan `date` invoice cuma YYYY-MM-DD, dan campuran keduanya dalam
       satu perbandingan teks mengurutkan tanggal terbalik. Yang tidak ada
       tanggalnya -> string kosong, jadi mengurut ke akhir bukan ke depan. */
    k === "createdAt" ? (createdAtOf(inv) ?? "") :
    k === "updatedAt" ? (lastTouchedAt(inv) ?? "") : String(inv.id)), [filteredInvoices, invSort]);
  const sortedAr = useMemo(() => sortRows(filteredAr, arSort, (inv, k) =>
    k === "id" ? String(inv.id) : k === "kode" ? String(inv.kodePembantu ?? inv.client ?? "") : k === "project" ? String(inv.project ?? "") :
    k === "openAwal" ? num(inv.openAwal) : k === "amount" ? num(inv.amount) : k === "due" ? String(inv.due ?? "") :
    k === "age" ? ageDays(inv.due, today) : String(inv.status)), [filteredAr, arSort, today]);
  const sortedAp = useMemo(() => sortRows(filteredAp, apSort, (a, k) =>
    k === "v" ? String(a.v) : k === "kode" ? String(a.kodePembantu ?? a.v) : k === "po" ? String(a.po) :
    k === "vessel" ? String(a.vessel ?? "") : k === "openAwal" ? num(a.openAwal) : k === "amt" ? num(a.amt) :
    k === "sisa" ? Math.max(0, num(a.amt) - num(a.pay1) - num(a.pay2)) : k === "due" ? String(a.due ?? "") : String(a.st)), [filteredAp, apSort]);
  const sortedJu = useMemo(() => sortRows(filteredJu, juSort, (j, k) =>
    k === "kode" ? String(j.kodePembantu ?? "") : k === "dok" ? String(j.dokumen ?? "") : k === "uraian" ? String(j.uraian ?? "") :
    k === "db" ? String(j.db ?? "") : k === "kr" ? String(j.kr ?? "") : k === "amount" ? num(j.amount) :
    k === "sumber" ? String(j.sumber ?? "") : k === "status" ? String(j.status ?? "") : String(j.date ?? "")), [filteredJu, juSort]);
  const invPager = usePager(filteredInvoices.length);
  const arPager = usePager(filteredAr.length);
  const apPager = usePager(filteredAp.length);
  const juPager = usePager(filteredJu.length);
  useEffect(() => {
    invPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invFQ, invFStatus, invFBilling, invHist, tab]);
  useEffect(() => {
    arPager.reset();
    apPager.reset();
    juPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invHist, apHist, juHist, tab]);

  // Terlambat otomatis dari due (menggantikan flag manual): invoice Belum Dibayar
  // yang lewat jatuh tempo otomatis berstatus Terlambat. ageDays sudah ada.
  useEffect(() => {
    const rows = (data.invoices ?? []).filter(
      (i) => String(i.status) === "Belum Dibayar" && ageDays(i.due, today) > 0
    );
    for (const r of rows) {
      void update("invoices", r.id, { status: "Terlambat" })
        .then(() => {
          log("invoice jatuh tempo otomatis", `${r.id} → Terlambat`, "Keuangan");
        })
        /* .catch(() => {}) menelan kegagalan: invoice tetap "Belum Dibayar"
           padahal sudah lewat jatuh tempo, dan tidak ada yang tahu kenapa
           saat backend menolak (403) atau sedang offline. Dicatat agar
           bisa ditindaklanjuti. */
        .catch((err) => {
          log(
            "gagal menandai invoice terlambat",
            `${r.id} · ${err instanceof Error ? err.message : String(err)}`,
            "Keuangan",
          );
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.invoices]);

  /* Tab "Invoice" dan "Piutang (AR)" membaca koleksi `invoices` yang sama,
     jadi `sortedInv.findIndex` dulu selalu menangkap baris AR dan
     menimpa tab tujuan. Karena itu tab yang diminta deep-link diperiksa
     lebih dulu, baru urutan fallback. */
  /* Terjemahkan sekumpulan id deep-link menjadi tab + sorotan. Satu id (klik
     banner modul) dan banyak id (klik kartu Dashboard "Piutang Tertagih",
     yang mengirim seluruh invoice belum tertagih) memakai jalur yang sama. */
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const mark = (index: number, pager: { go: (p: number) => void; size: number }): void => {
      if (ids.length > 1) flash.pickMany(ids, index, pager.go, pager.size);
      else flash.pick(ids[0] as string, index, pager.go, pager.size);
    };
    const flashIn = (
      list: StoreItem[],
      pager: { go: (p: number) => void; size: number },
      tabName: string,
    ) => {
      /* Posisi baris PERTAMA yang ikut kelompok - itu yang digulir ke tengah. */
      const idx = list.findIndex((r) => ids.includes(String(r.id)));
      if (idx < 0) return false;
      if (tab !== tabName) setTab(tabName);
      window.setTimeout(() => mark(idx, pager), tab === tabName ? 0 : 250);
      return true;
    };

    if (tab === "Piutang (AR)" && flashIn(sortedAr, arPager, "Piutang (AR)")) return;
    if (tab === "Hutang (AP)" && flashIn(sortedAp, apPager, "Hutang (AP)")) return;
    if (tab === "Invoice" && flashIn(sortedInv, invPager, "Invoice")) return;

    if (flashIn(sortedInv, invPager, "Invoice")) return;
    if (flashIn(sortedAp, apPager, "Hutang (AP)")) return;
    if (flashIn(sortedAr, arPager, "Piutang (AR)")) return;
    mark(-1, { go: () => {}, size: 100 });
  };

  /* Satu id dari banner modul. */
  const pickNotif = (rowId: string): void => pickNotifIds([rowId]);

  /* Deep-link Dashboard (?tab=Piutang (AR)&highlight=INV-..): pindah tab + flash. */
  useDeepLinkTarget(deepParams.tab, deepParams.highlight, setTab, pickNotifIds);
  const coaTipeOf = (c: StoreItem): string => coaList.find((x) => x.kode === String(c.kode))?.tipe ?? "-";
  const TIPE_ORDER = ["Aset", "Liabilitas", "Ekuitas", "Pendapatan", "Beban", "Header"];
  const coaGroups = useMemo(() => {
    const sorted = sortRows(coaFiltered, akunSort, (c, k) =>
      k === "kode" ? String(c.kode) : k === "nama" ? String(c.nama) : k === "tipe" ? coaTipeOf(c) : k === "dk" ? String(c.dk) : String(c.nrlr));
    const groups = TIPE_ORDER.map((t) => ({ tipe: t, rows: sorted.filter((c) => coaTipeOf(c) === t) })).filter((g) => g.rows.length > 0);
    const other = sorted.filter((c) => !TIPE_ORDER.includes(coaTipeOf(c)));
    if (other.length > 0) groups.push({ tipe: "Lainnya", rows: other });
    return groups;
  }, [coaFiltered, akunSort, coaList]);

  // Jurnal (sheet JU): tambah jurnal manual berimbang, multi-baris per voucher.
  const [showJu, setShowJu] = useState(false);
  const [juForm, setJuForm] = useState({ date: todayISO(), kodePembantu: "", dokumen: "", uraian: "", sumber: "JU" });
  const [juLines, setJuLines] = useState([{ db: "", kr: "", amount: "" }]);

  // Kas & Bank: catat mutasi masuk/keluar per rekening.
  const [showMut, setShowMut] = useState(false);
  const [mutForm, setMutForm] = useState({ date: todayISO(), rekening: "1-111", arah: "Masuk", lawan: "", kodePembantu: "", dokumen: "", uraian: "", amount: "" });

  // Piutang: ubah invoice yang belum lunas.
  const [invEdit, setInvEdit] = useState<StoreItem | null>(null);
  const [invEditForm, setInvEditForm] = useState({ client: "", kodePembantu: "", due: "", paymentTerm: "", milestoneRef: "", nsfp: "", noFaktur: "" });
  /* Hapus invoice (belum ada di modul ini sama sekali). */
  const [delInvoice, setDelInvoice] = useState<StoreItem | null>(null);

  // Aset (sheet Aset): tambah harta baru, susut GL otomatis.
  const [showAst, setShowAst] = useState(false);
  const [astForm, setAstForm] = useState({ nama: "", kelompok: "2", bulan: "", tahun: "", nilai: "", metode: "GL" });
  // Hapus via ConfirmModal + daftar pemakai (blokir bila dipakai).
  const [delCoa, setDelCoa] = useState<StoreItem | null>(null);
  const [delAsset, setDelAsset] = useState<StoreItem | null>(null);
  // Hapus jurnal Draft + ubah aset (susut dihitung ulang dgn tarif fiskal yg sama).
  const [astEdit, setAstEdit] = useState<StoreItem | null>(null);

  const KAS_REKENING = coaRows.filter((c) => /^(1-11|1-12)/.test(String(c.kode)) && String(c.dk) !== "-");
  /* Tanggal transaksi terakhir di SELURUH dokumen pembukuan. Dipakai sebagai
     as-of mode "Semua": kalau tidak, "Semua" berarti "Agustus 2026" karena
     konstanta, dan setiap transaksi setelahnya tidak pernah masuk hitungan
     tanpa ada yang memberi tahu. */
  const lastTxDate = useMemo(() => {
    let max = "";
    for (const j of data.journals ?? []) {
      const d = String(j.date ?? "").slice(0, 10);
      if (d > max) max = d;
    }
    for (const i of data.invoices ?? []) {
      for (const k of ["date", "due", "paidAt"]) {
        const d = String(i[k] ?? "").slice(0, 10);
        if (d > max) max = d;
      }
    }
    for (const a of data.payables ?? []) {
      for (const k of ["date", "due", "paidAt"]) {
        const d = String(a[k] ?? "").slice(0, 10);
        if (d > max) max = d;
      }
    }
    for (const p of data.payroll ?? []) {
      const d = String(p.paidAt ?? p.period ?? "").slice(0, 10);
      if (d > max) max = d;
    }
    return max;
  }, [data.journals, data.invoices, data.payables, data.payroll]);
  /* Kas & Bank LIVE: SALDO kumulatif s.d. tanggal filter, mutasi per rekening
     hanya untuk periode filter. Versi lama menjumlahkan jurnal yang ada DI
     DALAM window, jadi saldo awal hilang dan angka per bulan sebelum
     Agu-2026 bukan saldo - saldo awal Excel hanya diisi saat isSnapMonth. */
  const kasAsOf = asOfOrToday(kasHist, lastTxDate);
  const kasSnap = kasAsOf.slice(0, 7) === LATEST_SNAPSHOT;
  const kasRows = useMemo(
    () => KASBANK_EXCEL.filter((r) => (r.periode ?? LATEST_SNAPSHOT) === LATEST_SNAPSHOT),
    []);
  const kasInScope = (j: StoreItem): boolean =>
    j.status !== "Void" && (j.sumber === "Kas" || j.sumber === "Bank") && matchHist(String(j.date ?? ""), kasHist);
  const kasOpening = useMemo(() => {
    const m: Record<string, number> = {};
    if (kasSnap) for (const r of kasRows) m[r.kode] = r.awal;
    return m;
  }, [kasRows, kasSnap]);
  const kasRep = useMemo(
    () => kasAsOfReport(manJournals, kasAsOf, kasHist, kasOpening, /^(1-11|1-12)/),
    [manJournals, kasAsOf, kasHist, kasOpening],
  );
  const kasSaldo = kasRep.saldo;

  const kasFlow = (kode: string): { masuk: number; keluar: number; count: number } => {
    const masuk = kasRep.masuk[kode] ?? 0;
    const keluar = kasRep.keluar[kode] ?? 0;
    const n = manJournals.filter((j) => kasInScope(j) && (String(j.db) === kode || String(j.kr) === kode)).length;
    return { masuk, keluar, count: n };
  };
  /* Rekap live per rekening (semua kode Kas/Bank yang muncul di jurnal periode ini). */
  const kasLiveRows = useMemo(() => {
    const order = new Map<string, { kode: string; nama: string; masuk: number; keluar: number; count: number }>();
    const nameOf = (kode: string): string =>
      String(coaRows.find((c) => String(c.kode) === kode)?.nama ?? KASBANK_EXCEL.find((r) => r.kode === kode)?.nama ?? kode);
    for (const j of manJournals) {
      if (!kasInScope(j)) continue;
      for (const kode of [String(j.db ?? ""), String(j.kr ?? "")]) {
        if (!kode || !/^(1-11|1-12)/.test(kode)) continue;
        const cur = order.get(kode) ?? { kode, nama: nameOf(kode), masuk: 0, keluar: 0, count: 0 };
        if (String(j.db) === kode) { cur.masuk += num(j.amount); cur.count += 1; }
        if (String(j.kr) === kode) { cur.keluar += num(j.amount); cur.count += 1; }
        order.set(kode, cur);
      }
    }
    return [...order.values()].sort((a, b) => a.kode.localeCompare(b.kode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manJournals, kasHist, coaRows]);

  /* === EXPORT 4 LAPORAN HISTORIKAL ===
   *
   * Angka as-of yang sudah diperbaiki tidak bisa diekspor kalau tidak ada
   * jalurnya:(reportExcel hanya dipakai Jadwal Bayar dan SPT, jadi hasil
   * koreksi saldo hanya bisa dibaca di layar lalu hilang begitu tab ditutup.
   *
   * Setiap sheet membawa baris "As-of" supaya angka bisa ditelusuri
   * kembali - file Excel tanpa tanggal acuan tidak bisa dipertanggungjawabkan
   * saat Someone membukanya enam bulan kemudian. */
  const exportHist = async (which: "kas" | "bb" | "lr" | "nr"): Promise<void> => {
    try {
      if (which === "kas") {
        await exportExcelSheets([
          {
            name: "Kas & Bank",
            rows: [
              ["Rekening", "Nama", "Saldo awal", "Masuk periode", "Keluar periode", "Saldo akhir"],
              ...kasLiveRows.map((r) => [
                r.kode, r.nama,
                kasRep.saldo[r.kode] ?? 0,
                kasRep.masuk[r.kode] ?? 0,
                kasRep.keluar[r.kode] ?? 0,
                kasRep.saldo[r.kode] ?? 0,
              ] as (string | number)[]),
              [],
              ["As-of", kasAsOf],
              ["Periode", kasHist.mode === "Semua" ? "Semua" : `${kasHist.mode} ${kasHist.bulan || kasHist.tahun || kasHist.hari}`],
            ],
          },
          {
            name: "Voucher",
            rows: [
              ["Tanggal", "Dokumen", "Uraian", "DB", "KR", "Nominal"],
              ...manJournals
                .filter((j) => j.status !== "Void" && (j.sumber === "Kas" || j.sumber === "Bank") && matchHist(String(j.date ?? ""), kasHist))
                .map((j) => [String(j.date ?? ""), String(j.dokumen ?? "-"), String(j.uraian ?? ""), String(j.db ?? "-"), String(j.kr ?? "-"), num(j.amount)] as (string | number)[]),
            ],
          },
        ], `Kas-Bank-${kasAsOf}`);
      } else if (which === "bb") {
        await exportExcelSheets([
          {
            name: "Buku Besar",
            rows: [
              ["Kode", "Nama akun", "Debit s.d. tanggal", "Kredit s.d. tanggal", "Saldo", "Debit periode", "Kredit periode", "Baris"],
              ...bbLive.map((r) => [r.kode, r.nama, r.dAll, r.kAll, r.dAll - r.kAll, r.d, r.k, r.n] as (string | number)[]),
              [],
              ["As-of", bbAsOf],
              ["Total debit", bbDAll],
              ["Total kredit", bbKAll],
              ["Selisih", bbDAll - bbKAll],
            ],
          },
        ], `Buku-Besar-${bbAsOf}`);
      } else if (which === "lr") {
        await exportExcelSheets([
          {
            name: "Laba Rugi",
            rows: [
              ["Komponen", "Kumulatif s.d. as-of", "Periode ini"],
              ["Pendapatan", lrLive.revenue, lrLive.period.revenue],
              ["Beban pokok", lrLive.costProj, lrLive.period.costProj],
              ["Gaji", lrLive.salary, lrLive.period.salary],
              ["Write-off", lrLive.writeoff, lrLive.period.writeoff],
              ["Laba bersih", lrLive.laba, lrLive.period.laba],
              [],
              ["As-of", lrAsOf],
            ],
          },
        ], `Laba-Rugi-${lrAsOf}`);
      } else {
        await exportExcelSheets([
          {
            name: "Hutang",
            rows: [
              ["Vendor", "Sisa (Rp)", "Dokumen"],
              ...hutLive.map((h) => [h.v, Math.round(h.total), h.count] as (string | number)[]),
              [],
              ["As-of", nrAsOf],
            ],
          },
          {
            name: "Piutang",
            rows: [
              ["Customer", "Sisa (Rp)", "Dokumen"],
              ...piuLive.map((p) => [p.c, Math.round(p.total), p.count] as (string | number)[]),
              [],
              ["As-of", nrAsOf],
            ],
          },
          {
            name: "Ringkasan",
            rows: [
              ["Komponen", "Nilai"],
              ["Total hutang", hutLiveTotal],
              ["Total piutang", piuLiveTotal],
              ["Laba kumulatif s.d. as-of", nrLabaLive],
              ["As-of", nrAsOf],
            ],
          },
        ], `Neraca-${nrAsOf}`);
      }
      toast(S.histExported, "info");
    } catch (e) {
      toast(`${S.histExportFailed} ${e instanceof Error ? e.message : String(e)}`, "info");
    }
  };

  const isTMForm = invForm.billingType === "T&M";
  const invTotal = invLines.reduce((s, l) => s + lineAmount(l, isTMForm), 0);
  // Rumus RawData CONTOH INVOICE: TOTAL=Jasa+Material, DPP=TOTAL×11/12,
  // PPN=12%×DPP (0 bila SKDT), PPh=2%×Jasa, Grand=TOTAL+PPN-PPh-DP.
  const sbPreview = useMemo(() => {
    const jasa = invLines.filter((l) => (l.kategori || "Jasa") === "Jasa").reduce((s, l) => s + lineAmount(l, isTMForm), 0);
    const material = invLines.filter((l) => l.kategori === "Material").reduce((s, l) => s + lineAmount(l, isTMForm), 0);
    return sbInvoiceMath({
      jasa,
      material,
      ppnRate: getSetting(data, "PPN_INVOICE_RATE", PPN_INVOICE_DEFAULT),
      pphRate: getSetting(data, "PPH_JASA_RATE", PPH_JASA_DEFAULT),
      skdt: invForm.skdt,
      dpApplied: num(invForm.dpApplied),
      retentionPct: invForm.billingType === "Uang Muka" || isTMForm ? 0 : num(invForm.retentionPct),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invLines, invForm.skdt, invForm.dpApplied, invForm.retentionPct, invForm.billingType, isTMForm, data.settings]);
  const retentionAmtPreview = sbPreview.retentionAmt;

  const approveThreshold = getSetting(data, "APPROVE_INVOICE", 5000000);
  const needsDirector = (inv: StoreItem): boolean =>
    invNeto(inv) > approveThreshold && !inv.directorApproved && String(inv.status) !== "Lunas" && String(inv.status) !== "Dihapusbukukan";

  const arOpen = useMemo(
    () => invoices.filter((i) => i.status !== "Lunas" && i.status !== "Draft" && i.status !== "Dihapusbukukan"),
    [invoices]
  );
  const arTotal = arOpen.reduce((s, i) => s + invNeto(i), 0);
  const apTotal = payables.filter((a) => a.st !== "Lunas").reduce((s, a) => s + Math.max(0, num(a.amt) - num(a.pay1) - num(a.pay2)), 0);
  const lateCount = invoices.filter((i) => i.status === "Terlambat").length;
  const writeOffTotal = invoices.filter((i) => i.status === "Dihapusbukukan").reduce((s, i) => s + invNeto(i), 0);

  const agingReal = useMemo(
    () =>
      AR_BUCKETS.map((b) => {
        const rows = arOpen.filter((i) => {
          const age = ageDays(i.due, today);
          return age >= b.min && age <= b.max;
        });
        return { ...b, count: rows.length, total: rows.reduce((s, i) => s + invNeto(i), 0) };
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

  // Kas & Bank per periode snapshot (sheet JU,Kas,Bank + BB) - bukan dummy.
  const kasAwal = kasRows.reduce((s, r) => s + r.awal, 0);
  const kasAkhir = kasRows.reduce((s, r) => s + r.akhir, 0);
  const kasDelta = kasAwal ? Math.round(((kasAkhir - kasAwal) / Math.abs(kasAwal)) * 100) : 0;

  // Hutang Excel awal periode terbaru untuk spark AP.
  const apAwalExcel = HUTANG_EXCEL.filter((h) => (h.periode ?? LATEST_SNAPSHOT) === LATEST_SNAPSHOT)
    .reduce((s, h) => s + (h.awal || 0), 0);

  const retentionTotal = invoices
    .filter((i) => num(i.retentionAmt) > 0 && i.retentionStatus !== "Released")
    .reduce((s, i) => s + num(i.retentionAmt), 0);

  const taxPeriods = data.taxPeriods ?? [];
  /* Default = periode berjalan (YYYY-MM hari ini), bukan taxPeriods[1]. */
  const curYM = today.slice(0, 7);
  const defaultTax = taxPeriods.find((t) => String(t.period ?? "") === curYM) ?? taxPeriods[0];
  const activeTaxId = taxId || defaultTax?.id || "";
  const activeTax = taxPeriods.find((t) => t.id === activeTaxId) ?? taxPeriods[0];
  const activePeriod = String(activeTax?.period ?? "");

  const monthOf = (v: unknown): string => String(v ?? "").slice(0, 7);
  const invPaidMonth = (i: StoreItem): string => monthOf(i.paidAt || i.due);
  const apPaidMonth = (a: StoreItem): string => monthOf(a.paidAt || a.due);

  const taxCalc = useMemo(() => {
    if (!activePeriod) return { ppnKeluar: 0, ppnMasuk: 0, pph23: 0, pph21: 0, invBase: 0, apBase: 0, ppnRate: 12, pphRate: 2 };
    const invLunas = invoices.filter((i) => i.status === "Lunas" && invPaidMonth(i) === activePeriod);
    const invBase = invLunas.reduce((s, i) => s + invNeto(i), 0);
    const apLunas = payables.filter((a) => a.st === "Lunas" && apPaidMonth(a) === activePeriod);
    const apBase = apLunas.reduce((s, a) => s + num(a.amt), 0);
    const payRows = (data.payroll ?? []).filter(
      (p) => String(p.period ?? "") === activePeriod && String(p.status ?? "") === "Dibayar",
    );
    const pph21 = payRows.reduce((s, p) => s + num(p.pph21), 0);
    // PPh dipotong dari termin subkon yang lunas periode ini (dipotong saat bayar termin).
    const termPph = (data.termins ?? [])
      .filter((t) => t.status === "Lunas" && monthOf(t.paidAt) === activePeriod)
      .reduce((s, t) => s + num(t.pphAmt), 0);
    const ppnRate = getSetting(data, "PPN_RATE", 12);
    const pphRate = getSetting(data, "PPH23_RATE", 2);
    // PPN Keluaran memakai ppnAmt HISTORIS per invoice (0 valid untuk SKDT/
    // retensi). Hanya baris lama tanpa ppnAmt yang dihitung ulang - ganti
    // tarif di Pengaturan tidak menulis ulang riwayat.
    const hasStored = (i: StoreItem): boolean =>
      i.ppnAmt !== undefined && i.ppnAmt !== null && String(i.ppnAmt) !== "";
    const ppnKeluar = invLunas.reduce(
      (s, i) => s + (hasStored(i) ? Math.round(num(i.ppnAmt)) : Math.round((invNeto(i) * ppnRate) / 100)),
      0,
    );
    return {
      ppnKeluar,
      ppnMasuk: Math.round((apBase * ppnRate) / 100),
      pph23: Math.round((apBase * pphRate) / 100) + Math.round(termPph),
      pph21,
      invBase,
      apBase,
      ppnRate,
      pphRate,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, payables, data.payroll, data.settings, activePeriod]);

  const taxLocked = activeTax?.status === "Lapor";

  const confirmDelTax = async () => {
    if (!delTax) return;
    if (String(delTax.status ?? "") === "Lapor") {
      toast(locale === "en"
        ? `Tax period ${String(delTax.period)} is already reported - a filed return cannot be deleted.`
        : `Periode pajak ${String(delTax.period)} sudah Lapor - SPT yang sudah diajukan tidak bisa dihapus.`, "info");
      setDelTax(null);
      return;
    }
    try {
      await remove("taxPeriods", String(delTax.id));
      log("menghapus periode pajak", String(delTax.period), "Pajak");
      if (taxId === String(delTax.id)) setTaxId("");
      toast(locale === "en" ? `Tax period ${String(delTax.period)} deleted` : `Periode pajak ${String(delTax.period)} dihapus`);
      setDelTax(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };
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
      rows.push({ key: `AR:${i.id}`, kind: "AR", id: String(i.id), ref: String(i.project ?? ""), desc: String(i.client ?? ""), due: String(i.due ?? ""), amount: invNeto(i), age: ageDays(i.due, today) });
    }
    return rows.sort((a, b) => String(a.due).localeCompare(String(b.due)));
  }, [payables, arOpen, today]);
  const schedTotal = schedItems.filter((r) => schedSel.includes(r.key)).reduce((s, r) => s + r.amount, 0);

  // 5. Pemetaan biaya ke proyek (kunci AP "ID / docNo" -> split ambil ID)
  const poIdOf = (poRef: unknown): string => String(poRef ?? "").split(" / ")[0].trim();
  const poProject = useMemo(() => {
    const m: Record<string, string> = {};
    for (const po of data.purchaseOrders ?? []) {
      const proj = po.project ?? po.projectId ?? po.proyek;
      if (po.id && proj) {
        m[String(po.id)] = String(proj);
        if (po.docNo) m[`${po.id} / ${po.docNo}`] = String(proj);
      }
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
    const revenue = (data.invoices ?? []).filter((i) => i.project === profitPid && i.status === "Lunas").reduce((s, i) => s + invNeto(i), 0);
    let costPayable = 0;
    let unallocPayable = 0;
    for (const a of data.payables ?? []) {
      if (a.st !== "Lunas") continue;
      const proj = poProject[poIdOf(a.po)] ?? poProject[String(a.po ?? "")];
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
      const bruto = payBruto(p) || payNet(p);
      const ap = String(p.allocProject ?? "");
      const pct = p.allocPct === undefined || p.allocPct === "" ? 0 : num(p.allocPct);
      if (ap === profitPid && pct > 0) costPayroll += Math.round((bruto * pct) / 100);
      else if (!ap) unallocPayroll += bruto;
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
    /* Tarif per jam diambil dari master equipment, bukan konstanta global.
       Versi lama memakai EQUIP_RATE_PER_JAM = 1.500.000 untuk SEMUA alat:
       mesin las streets Rp 250.000/jam jadi-biaya 6x lipat, forklift
       Rp 350.000 jadi 4x lipat, dan tab Equipment menampilkan angka yang
       berbeda dari kartu ini untuk baris yang sama. Plus kolom cost pada
       booking yang sudah terisi hasil perhitungan jam x tarif - memakai
      Angka itu membuat CBS ganda hitung. */
    const equipRateOf = (row: StoreItem): number => {
      const name = String(row.equipName ?? row.equip ?? "");
      const code = String(row.equipCode ?? "");
      const found =
        (data.equipment ?? []).find((e) => String(e.id ?? "") === String(row.equipmentId ?? ""))
        ?? (data.equipment ?? []).find((e) => String(e.code ?? "") === code)
        ?? (data.equipment ?? []).find((e) => String(e.name ?? "").trim() === name.trim());
      const rate = num(found?.rate);
      return rate > 0 ? rate : EQUIP_RATE_PER_JAM;
    };
    for (const b of data.bookings ?? []) {
      if (String(b.proyek ?? b.project ?? "") !== profitPid) continue;
      if (String(b.status ?? "") !== "Selesai") continue;
      const cost = num(b.cost);
      equipment += cost > 0 ? cost : parseJamHours(b.jam) * equipRateOf(b);
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
        amount: invNeto(i),
      });
    }
    for (const i of data.invoices ?? []) {
      if (i.status !== "Dihapusbukukan") continue;
      rows.push({
        date: String(i.writeOffAt || i.due || ""),
        ref: String(i.id),
        desc: `Hapus buku piutang ${i.id} - ${i.writeOffReason ?? ""}`,
        debitAkun: "5100 Beban Proyek",
        kreditAkun: "1200 Piutang Usaha",
        amount: invNeto(i),
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
      const bruto = payBruto(p) || payNet(p);
      const net = Math.min(payNet(p), bruto);
      const pot = Math.max(0, bruto - net);
      const d = String(p.paidAt || "");
      if (net > 0) {
        rows.push({
          date: d,
          ref: String(p.id),
          desc: `Gaji ${p.employeeId ?? ""} periode ${p.period ?? ""} (net)`,
          debitAkun: "5200 Beban Gaji",
          kreditAkun: "1100 Kas",
          amount: net,
        });
      }
      if (pot > 0) {
        rows.push({
          date: d,
          ref: String(p.id),
          desc: `Potongan ${p.employeeId ?? ""} periode ${p.period ?? ""} (PPh21+BPJS)`,
          debitAkun: "5200 Beban Gaji",
          kreditAkun: "2100 Hutang Usaha",
          amount: pot,
        });
      }
      if (net <= 0 && pot <= 0 && bruto > 0) {
        rows.push({
          date: d,
          ref: String(p.id),
          desc: `Gaji ${p.employeeId ?? ""} periode ${p.period ?? ""}`,
          debitAkun: "5200 Beban Gaji",
          kreditAkun: "1100 Kas",
          amount: bruto,
        });
      }
    }
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data.invoices, data.payables, data.payroll]);
  /* Total jurnal = per DOKUMEN, bukan penjumlahan amount tiap baris.
     Satu dokumen bisa punya banyak baris (JUM-0831 = 7 baris) dan tiap baris
     menyimpan amount = dbAmt || krAmt, sehingga reduce() menjumlahkan
     sisi debit DAN kredit -> total 1,84x nilai dokumen sebenarnya.
     Jurnal berimbang: Σ debet = Σ kredit = nilai dokumen, jadi ambil yang
     lebih besar per dokumen. */
  const journalTotal = useMemo(() => {
    type Jr = { db?: unknown; kr?: unknown; kode?: unknown; kodeAkun?: unknown; kodePembantu?: unknown; dokumen?: unknown; ref?: unknown; uraian?: unknown; desc?: unknown; description?: unknown };
    const perDoc = new Map<string, { db: number; kr: number }>();
    for (const j of journals as unknown as Jr[]) {
      const doc = String(j.dokumen ?? j.ref ?? j.uraian ?? j.desc ?? j.description ?? "-");
      const cur = perDoc.get(doc) ?? { db: 0, kr: 0 };
      const db = num(j.db ?? j.kode ?? j.kodeAkun ?? j.kodePembantu);
      const kr = num(j.kr ?? j.kode ?? j.kodeAkun ?? j.kodePembantu);
      if (db) cur.db += db;
      if (kr) cur.kr += kr;
      perDoc.set(doc, cur);
    }
    let total = 0;
    for (const { db, kr } of perDoc.values()) total += Math.max(db, kr);
    return total;
  }, [journals]);

  const plMonthly = useMemo(() => {
    const agg: Record<string, { revenue: number; costProj: number; salary: number; writeoff: number }> = {};
    const bump = (period: string, k: "revenue" | "costProj" | "salary" | "writeoff", v: number) => {
      if (!/^\d{4}-\d{2}$/.test(period)) return;
      agg[period] = agg[period] ?? { revenue: 0, costProj: 0, salary: 0, writeoff: 0 };
      agg[period][k] += v;
    };
    for (const i of data.invoices ?? []) {
      if (i.status === "Lunas") bump(monthOf(i.paidAt || i.due), "revenue", invNeto(i));
      if (i.status === "Dihapusbukukan") bump(monthOf(i.writeOffAt || i.due), "writeoff", invNeto(i));
    }
    for (const a of data.payables ?? []) {
      if (a.st === "Lunas") bump(monthOf(a.paidAt || a.due), "costProj", num(a.amt));
    }
    for (const p of data.payroll ?? []) {
      if (p.status === "Dibayar") bump(monthOf(p.paidAt || p.period), "salary", payBruto(p) || payNet(p));
    }
    return Object.keys(agg)
      .sort()
      .map((period) => ({ period, ...agg[period], laba: agg[period].revenue - agg[period].costProj - agg[period].salary - agg[period].writeoff }));
  }, [data.invoices, data.payables, data.payroll]);

  /* EBITDA 12 bulan, dihitung dari dokumen nyata.
     Laba (plMonthly) subtracting D&A dan bunga - barang yang tidak ada di
     data modul ini, sehingga laba di bawah bukan EBITDA dan tidak bisa
     dibandingkan ke EBITDA. Yang bisa dihitung dari data yang ada:
     EBITDA = pendapatan - biaya proyek - gaji - hapus buku.
     Dihitung eksplisit dari dokumen, BUKAN dari mock ebitdaReal, dan
     hanya bulan yang punya dokumen nyata yang ditampilkan. */
  const ebitdaRows = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let k = 11; k >= 0; k -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const MON = MONTH_ID;
    return keys.map((key) => {
      const row = plMonthly.find((p) => p.period === key);
      const revenue = row?.revenue ?? 0;
      const ebitda = revenue - (row?.costProj ?? 0) - (row?.salary ?? 0) - (row?.writeoff ?? 0);
      const d = new Date(`${key}-01T00:00:00`);
      return {
        period: key,
        name: `${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        revenue,
        ebitda,
        margin: revenue > 0 ? Math.round((ebitda / revenue) * 1000) / 10 : null,
        adaData: row !== undefined,
      };
    });
  }, [plMonthly]);
  const ebitdaReal = ebitdaRows.filter((d) => d.adaData);

  const labaLast = plMonthly.length ? plMonthly[plMonthly.length - 1].laba : LAPORAN_EXCEL.labaBersih;
  const labaPrev = plMonthly.length > 1 ? plMonthly[plMonthly.length - 2].laba : 0;
  const labaDelta = labaPrev ? Math.round(((labaLast - labaPrev) / Math.abs(labaPrev)) * 100) : 0;

  // Arus kas live dari jurnal Lunas (masuk = invoice Lunas, keluar = payable + payroll).
  // Kosong bila belum ada pelunasan - grafik menampilkan empty state, bukan kurva dummy.
  const flowMonthly = plMonthly.map((p) => ({
    month: p.period.slice(5),
    masuk: Math.round(((p.revenue || 0) / 1000000000) * 10) / 10,
    keluar: Math.round((((p.costProj || 0) + (p.salary || 0)) / 1000000000) * 10) / 10,
  }));
  const labaSpark =
    plMonthly.length > 0
      ? plMonthly.map((p) => ({ name: p.period.slice(5), v: Math.round((p.laba / 1000000000) * 10) / 10 }))
      : [{ name: "Ags", v: Math.round((LAPORAN_EXCEL.labaBersih / 1000000000) * 10) / 10 }];
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
    const revTotal = (data.invoices ?? []).filter((i) => i.status === "Lunas").reduce((s, i) => s + invNeto(i), 0);
    const apLunasTotal = (data.payables ?? []).filter((a) => a.st === "Lunas").reduce((s, a) => s + num(a.amt), 0);
    const payRows = (data.payroll ?? []).filter((p) => p.status === "Dibayar");
    const payBrutoTotal = payRows.reduce((s, p) => s + (payBruto(p) || payNet(p)), 0);
    const payNetTotal = payRows.reduce((s, p) => s + Math.min(payNet(p), payBruto(p) || payNet(p)), 0);
    const payHutangTotal = Math.max(0, payBrutoTotal - payNetTotal);
    const kasNet = revTotal - apLunasTotal - payNetTotal;
    const piutang = arTotal + retentionTotal;
    const hutang = apTotal + payHutangTotal;
    const ppnUtang = Math.max(0, taxCalc.ppnKeluar - taxCalc.ppnMasuk);
    const aset = kasNet + piutang;
    const kewajiban = hutang + ppnUtang;
    const ekuitas = aset - kewajiban;
    const laba = revTotal - apLunasTotal - payBrutoTotal - writeOffTotal;
    return { revTotal, apLunasTotal, payPaidTotal: payBrutoTotal, payNetTotal, payHutangTotal, kasNet, piutang, hutang, ppnUtang, aset, kewajiban, ekuitas, laba };
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

  const saveInvoice = async () => {
    const proj = projectById[invForm.project];
    if (!proj) { toast(S.pickProjectFirst, "info"); return; }
    if (!invForm.due) { toast(S.dueRequired, "info"); return; }
    if (!invForm.paymentTerm.trim()) { toast(S.termLabelRequired, "info"); return; }
    if (invForm.billingType === "Milestone" && !invForm.milestoneRef.trim()) { toast(S.milestoneRequired, "info"); return; }
    if (num(invForm.dpApplied) > 0 && !invForm.dpRef.trim()) { toast(S.dpRefRequired, "info"); return; }
    const validLines = invLines.filter((l) => l.desc.trim() && lineAmount(l, isTMForm) > 0);
    if (validLines.length === 0) { toast(S.minOneLine, "info"); return; }
    if (invForm.nsfp.trim() && (data.invoices ?? []).some((i) => String(i.nsfp ?? "") === invForm.nsfp.trim())) { toast(S.nsfpUsed, "info"); return; }
    if (invForm.noFaktur.trim() && (data.invoices ?? []).some((i) => String(i.noFaktur ?? "") === invForm.noFaktur.trim())) { toast(S.fakturUsed, "info"); return; }
    // E6: clientPO opsional - bila diisi harus milik proyek yang sama.
    if (invForm.clientPO) {
      const po = (data.clientPos ?? []).find((p) => String(p.no ?? "") === invForm.clientPO || String(p.id ?? "") === invForm.clientPO);
      if (!po) { toast(S.poUnknown, "info"); return; }
      if (po.projectId && String(po.projectId) !== proj.id) { toast(S.poMismatch.replace("{a}", String(po.projectId)).replace("{b}", proj.id), "info"); return; }
    }
    // Cegah tagih ganda manual-vs-auto per BAST: satu milestone satu invoice per proyek.
    if (invForm.billingType === "Milestone" && invForm.milestoneRef.trim()) {
      const ref = invForm.milestoneRef.trim();
      const dupRef = (data.invoices ?? []).some(
        (i) => String(i.project ?? "") === proj.id && String(i.milestoneRef ?? "") === ref
      );
      if (dupRef) { toast(`Milestone ${ref} proyek ${proj.id} sudah ditagih - tolak tagih ganda`, "info"); return; }
      const bastHit = (data.bast ?? []).find(
        (b) => String(b.projectId ?? "") === proj.id &&
          (String(b.milestone ?? "") === ref || `BAST ${String(b.id)}` === ref)
      );
      if (bastHit) {
        const billed =
          Boolean(bastHit.invoiceId) ||
          (data.invoices ?? []).some(
            (i) => String(i.milestoneRef ?? "") === `BAST ${String(bastHit.id)}` ||
              String(i.bastId ?? "") === String(bastHit.id)
          );
        if (billed) { toast(`BAST ${String(bastHit.id)} sudah ditagih - tolak tagih ganda`, "info"); return; }
      }
    }
    const total = validLines.reduce((s, l) => s + lineAmount(l, isTMForm), 0);
    const pct = invForm.billingType === "Uang Muka" || invForm.billingType === "T&M" ? 0 : num(invForm.retentionPct);
    const retentionAmt = Math.round(total * (pct / 100));
    const jasaTotal = validLines.filter((l) => (l.kategori || "Jasa") === "Jasa").reduce((s, l) => s + lineAmount(l, isTMForm), 0);
    const matTotal = validLines.filter((l) => l.kategori === "Material").reduce((s, l) => s + lineAmount(l, isTMForm), 0);
    // Tarif DISIMPAN per invoice - laporan pajak memakai tarif historis ini,
    // bukan setting saat ini (ganti tarif tidak menulis ulang riwayat).
    const ppnRateUsed = getSetting(data, "PPN_INVOICE_RATE", PPN_INVOICE_DEFAULT);
    const pphRateUsed = getSetting(data, "PPH_JASA_RATE", PPH_JASA_DEFAULT);
    const sb = sbInvoiceMath({
      jasa: jasaTotal,
      material: matTotal,
      ppnRate: ppnRateUsed,
      pphRate: pphRateUsed,
      skdt: invForm.skdt,
      dpApplied: num(invForm.dpApplied),
      retentionPct: pct,
    });
    // H-03: recompute PPN/PPh vs stored - tolak bila tidak konsisten.
    const verify = sbInvoiceMath({
      jasa: jasaTotal,
      material: matTotal,
      ppnRate: ppnRateUsed,
      pphRate: pphRateUsed,
      skdt: invForm.skdt,
      dpApplied: num(invForm.dpApplied),
      retentionPct: pct,
    });
    if (verify.dpp !== sb.dpp || verify.ppn !== sb.ppn || verify.pph !== sb.pph || verify.grand !== sb.grand || verify.retentionAmt !== retentionAmt) {
      toast(S.taxMismatch, "info");
      return;
    }
    if (!Number.isFinite(sb.grand) || sb.grand <= 0) { toast(S.grandPositive, "info"); return; }
    const storedLines = validLines.map((l) => ({
      desc: l.desc.trim(),
      qty: num(l.qty),
      unit: l.unit || "pcs",
      price: num(l.price),
      rate: num(l.rate),
      hours: num(l.hours),
      kategori: l.kategori || "Jasa",
      amount: lineAmount(l, isTMForm),
    }));
    let invId = invPreview;
    let bump = 1;
    while ((data.invoices ?? []).some((i) => String(i.id) === invId)) {
      bump += 1;
      invId = `${invPreview}-${bump}`;
    }
    try {
    const created = await add("invoices", {
      id: invId,
      client: proj.client,
      kodePembantu: invForm.kodePembantu.trim() || proj.client,
      project: proj.id,
      branch: String(proj.branch ?? (branch !== "SEMUA" ? branch : "")),
      amount: total,
      due: invForm.due,
      status: "Draft",
      paymentTerm: invForm.milestoneRef.trim() || invForm.paymentTerm,
      billingType: invForm.billingType,
      milestoneRef: invForm.milestoneRef.trim(),
      serviceRef: invForm.serviceRef.trim(),
      ...(invForm.clientPO ? { clientPO: invForm.clientPO } : {}),
      ...(invForm.dpRef.trim() ? { dpRef: invForm.dpRef.trim() } : {}),
      lines: storedLines,
      retentionPct: pct,
      retentionAmt,
      retentionStatus: retentionAmt > 0 ? "Ditahan" : "-",
      jasaTotal: sb.jasa,
      matTotal: sb.material,
      dpp: sb.dpp,
      ppnAmt: sb.ppn,
      pphAmt: sb.pph,
      ppnRate: ppnRateUsed,
      pphRate: pphRateUsed,
      dpApplied: sb.dpApplied,
      grandTotal: sb.grand,
      skdt: invForm.skdt,
      nsfp: invForm.nsfp.trim(),
      noFaktur: invForm.noFaktur.trim(),
      dunning: "Belum Ditagih",
    }, { action: "menerbitkan invoice", module: "Keuangan" });
    if (invForm.billingType === "Uang Muka") {
      await update("projects", proj.id, { hasAdvance: true });
      log("menandai uang muka proyek", proj.id, "Keuangan");
    }
    toast(S.invCreated.replace("{a}", created.id));
    setShowInv(false);
    setInvForm({ project: "", billingType: "Milestone", milestoneRef: "", serviceRef: "", clientPO: "", retentionPct: "5", due: "", paymentTerm: "Termin 1", nsfp: "", noFaktur: "", kodePembantu: "", skdt: false, dpApplied: "", dpRef: "" });
    setInvLines([emptyLine()]);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // T&M: tarik baris otomatis dari timesheet Disetujui - jumlah jam × rate per WO proyek ini.
  const pullTimesheetLines = () => {
    if (!invForm.project) { toast(S.pickProjectFirst, "info"); return; }
    const rateOf = (t: StoreItem): number =>
      Number(t.rate || 0) || Number((data.workOrders ?? []).find((w) => w.id === t.woId)?.rate || 0);
    const projOf = (t: StoreItem): string =>
      String(t.projectId ?? woProject[String(t.woId ?? "")] ?? "");
    const rows = (data.timesheets ?? []).filter(
      (t) => String(t.status ?? "Diajukan") === "Disetujui" && projOf(t) === invForm.project && Number(t.hours || 0) > 0 && rateOf(t) > 0,
    );
    if (rows.length === 0) { toast(S.noTimesheet, "info"); return; }
    const agg = new Map<string, { hours: number; rate: number }>();
    for (const t of rows) {
      const woId = String(t.woId ?? "-");
      const cur = agg.get(woId) ?? { hours: 0, rate: rateOf(t) };
      agg.set(woId, { hours: cur.hours + Number(t.hours || 0), rate: cur.rate || rateOf(t) });
    }
    const lines: InvLine[] = [...agg.entries()].map(([woId, a]) => ({
      desc: `T&M ${woId} - ${a.hours} jam`, qty: "1", unit: "lot", price: "",
      rate: String(a.rate), hours: String(a.hours), kategori: "Jasa",
    }));
    setInvLines(lines);
    const total = lines.reduce((s, l) => s + lineAmount(l, true), 0);
    toast(S.tsPulled.replace("{n}", String(rows.length)).replace("{a}", String(lines.length)).replace("{b}", fmtRupiah(total)));
  };

  const dunningOf = (inv: StoreItem): string => String(inv.dunning ?? "Belum Ditagih");

  const advanceDunning = async (inv: StoreItem) => {
    const cur = dunningOf(inv);
    const next = DUNNING_NEXT[cur] ?? "Ditagih";
    if (next === "Hapus Buku") {
      setWriteOff(inv);
      setWriteOffReason("");
      setWoDirCheck(false);
      setWoDirName("");
      return;
    }
    try {
    await update("invoices", inv.id, { dunning: next });
    log("mengupdate penagihan", `${inv.id} → ${next}`, "Keuangan");
    toast(S.movedTo.replace("{a}", inv.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const needsWriteOffDirector = (inv: StoreItem | null): boolean =>
    !!inv && invNeto(inv) > approveThreshold && !inv.directorApproved;

  const doWriteOff = async () => {
    if (!writeOff) return;
    if (!writeOffReason.trim()) { toast(S.woReasonRequired, "info"); return; }
    // Hapus buku di atas ambang APPROVE_INVOICE wajib persetujuan Director (checkbox + nama).
    if (needsWriteOffDirector(writeOff) && (!woDirCheck || !woDirName.trim())) {
      toast(S.woDirectorRequired.replace("{a}", fmtRupiah(approveThreshold)), "info");
      return;
    }
    try {
    await update("invoices", writeOff.id, {
      status: "Dihapusbukukan",
      dunning: "Hapus Buku",
      writeOffReason: writeOffReason.trim(),
      writeOffAt: today,
      ...(needsWriteOffDirector(writeOff) ? { directorApproved: woDirName.trim(), writeOffBy: woDirName.trim() } : {}),
    });
    log("menghapus-bukukan piutang", `${writeOff.id} - ${writeOffReason.trim()}`, "Keuangan");
    toast(S.woDone.replace("{a}", writeOff.id));
    setWriteOff(null);
    setWriteOffReason("");
    setConfirmWriteOff(false);
    setWoDirCheck(false);
    setWoDirName("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // --- Akun: tambah / ubah / hapus (kolom sheet Akun) ---
  const saveCoa = async () => {
    const kode = coaForm.kode.trim();
    if (!kode) { toast(S.coaNoRequired, "info"); return; }
    if (!/^\d+-\d+$/.test(kode)) { toast(S.coaNoFormat, "info"); return; }
    if (!coaForm.nama.trim()) { toast(S.coaNameRequired, "info"); return; }
    try {
    if (coaTarget) {
      if (String(coaTarget.dk) === "-") {
        /* Baris header: hanya nama yang boleh diubah, posisi D/K & NR/LR dikunci. */
        await update("coa", coaTarget.id, { nama: coaForm.nama.trim() });
      } else {
        await update("coa", coaTarget.id, { nama: coaForm.nama.trim(), dk: coaForm.dk, nrlr: coaForm.nrlr });
      }
      log("mengubah akun", kode, "Keuangan");
      toast(S.coaUpdated.replace("{a}", kode));
    } else {
      if (coaKode.has(kode)) { toast(S.coaExists, "info"); return; }
      await add("coa", { id: `COA-${kode}`, kode, nama: coaForm.nama.trim(), dk: coaForm.dk, nrlr: coaForm.nrlr }, { action: "menambah akun", module: "Keuangan" });
      toast(S.coaAdded.replace("{a}", kode));
    }
    setShowCoa(false);
    setCoaTarget(null);
    setCoaForm({ kode: "", nama: "", dk: "D", nrlr: "NR" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // --- Jurnal: tambah manual berimbang multi-baris (kolom sheet JU: Kas/BPD/JPb/JPn/JM) ---
  const saveJu = async () => {
    if (!juForm.date) { toast(S.dateRequired, "info"); return; }
    if (!juForm.uraian.trim()) { toast(S.descRequired, "info"); return; }
    const lines = juLines.filter((l) => l.db || l.kr || l.amount);
    if (lines.length === 0) { toast(S.minOneJuLine, "info"); return; }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.db || !l.kr) { toast(S.juRowRequire.replace("{n}", String(i + 1)), "info"); return; }
      if (l.db === l.kr) { toast(S.juRowDiff.replace("{n}", String(i + 1)), "info"); return; }
      if (!coaKode.has(l.db) || !coaKode.has(l.kr)) { toast(S.juRowCoa.replace("{n}", String(i + 1)), "info"); return; }
      if (!num(l.amount) || num(l.amount) <= 0) { toast(S.juRowPositive.replace("{n}", String(i + 1)), "info"); return; }
    }
    const compact = (juForm.date || todayISO()).replaceAll("-", "");
    const juPrefix = `JU-${compact}-`;
    const juNext = maxSeq(manJournals.map((j) => String((j as StoreItem).dokumen ?? "")), new RegExp(`^${juPrefix}(\\d+)$`)) + 1;
    const voucher = juForm.dokumen.trim() || `${juPrefix}${String(juNext).padStart(3, "0")}`;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      try {
        await add("journals", {
          date: juForm.date, kodePembantu: juForm.kodePembantu.trim(), dokumen: voucher,
          uraian: lines.length > 1 ? `${juForm.uraian.trim()} (${i + 1}/${lines.length})` : juForm.uraian.trim(),
          db: l.db, kr: l.kr, amount: num(l.amount),
          sumber: juForm.sumber, status: "Posted",
          branch: branch !== "SEMUA" ? branch : "",
          ...(juImg ? { lampiranUrl: juImg, buktiUrl: juImg } : {}),
        }, { action: "mencatat jurnal", module: "Keuangan" });
      } catch (err) {
        toast(S.juRowFail.replace("{n}", String(i + 1)).replace("{a}", err instanceof Error ? err.message : S.backendUnreachable), "info");
        return;
      }
    }
    const total = lines.reduce((s, l) => s + num(l.amount), 0);
    toast(S.juSaved.replace("{a}", voucher).replace("{n}", String(lines.length)).replace("{b}", fmtRupiah(total)));
    setShowJu(false);
    setJuForm({ date: todayISO(), kodePembantu: "", dokumen: "", uraian: "", sumber: "JU" });
    setJuLines([{ db: "", kr: "", amount: "" }]);
    setJuImg("");
  };

  // --- Kas & Bank: mutasi masuk/keluar per rekening ---
  const saveMut = async () => {
    if (!mutForm.date) { toast(S.dateRequired, "info"); return; }
    if (!mutForm.rekening) { toast(S.pickCashAccount, "info"); return; }
    if (!mutForm.lawan) { toast(S.pickCounter, "info"); return; }
    if (mutForm.lawan === mutForm.rekening) { toast(S.counterDiff, "info"); return; }
    if (!mutForm.uraian.trim()) { toast(S.descRequired, "info"); return; }
    if (!num(mutForm.amount) || num(mutForm.amount) <= 0) { toast(S.amountPositive, "info"); return; }
    const db = mutForm.arah === "Masuk" ? mutForm.rekening : mutForm.lawan;
    const kr = mutForm.arah === "Masuk" ? mutForm.lawan : mutForm.rekening;
    try {
    await add("journals", {
      date: mutForm.date, kodePembantu: mutForm.kodePembantu.trim(), dokumen: mutForm.dokumen.trim() || "-",
      uraian: mutForm.uraian.trim(), db, kr, amount: num(mutForm.amount), sumber: mutForm.rekening.startsWith("1-11") ? "Kas" : "Bank", status: "Posted",
      branch: branch !== "SEMUA" ? branch : "",
    }, { action: "mencatat mutasi kas/bank", module: "Keuangan" });
    toast(S.mutSaved.replace("{a}", mutForm.arah).replace("{b}", mutForm.rekening));
    setShowMut(false);
    setMutForm({ date: todayISO(), rekening: "1-111", arah: "Masuk", lawan: "", kodePembantu: "", dokumen: "", uraian: "", amount: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // --- Jurnal otomatis idempoten (uang mengalir): pelunasan invoice, bayar
  // hutang, bayar massal masing-masing menulis 1 baris Kas/Bank berimbang.
  // Idempoten via dokumen unik - aman dipanggil ulang / dari bayar massal.
  const postAutoJournal = async (args: {
    dokumen: string; date: string; uraian: string; db: string; kr: string; amount: number;
  }): Promise<boolean> =>
    postCashJournal({ add, journals: data.journals ?? [], branch, ...args });

  // --- Hutang: simpan + ubah (kolom sheet Hutang) ---
  const saveAp = async () => {
    if (!apForm.v.trim()) { toast(S.vendorRequired, "info"); return; }
    if (!num(apForm.amt) || num(apForm.amt) <= 0) { toast(S.balancePositive, "info"); return; }
    if (!apForm.due) { toast(S.dueRequired, "info"); return; }
    try {
    const created = await add("payables", {
      v: apForm.v.trim(), kodePembantu: apForm.kodePembantu.trim() || apForm.v.trim(),
      po: apForm.po.trim() || "OPEN-0826", openAwal: num(apForm.openAwal), amt: num(apForm.amt),
      due: apForm.due, pph: apForm.nonPpn ? "Non-PPn" : "2%", st: "Belum Dibayar",
      vessel: apForm.vessel.trim(), item: apForm.item.trim(), pay1: 0, pay2: 0,
    }, { action: "mencatat hutang", module: "Keuangan" });
    toast(S.apAdded.replace("{a}", created.id));
    setShowAp(false);
    setApForm({ v: "", kodePembantu: "", po: "", openAwal: "", amt: "", due: "", nonPpn: false, vessel: "", item: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveApEdit = async () => {
    if (!apEdit) return;
    if (!apEditForm.v.trim()) { toast(S.vendorRequired, "info"); return; }
    if (!num(apEditForm.amt) || num(apEditForm.amt) <= 0) { toast(S.balancePositive, "info"); return; }
    try {
    await update("payables", apEdit.id, {
      v: apEditForm.v.trim(), kodePembantu: apEditForm.kodePembantu.trim() || apEditForm.v.trim(),
      openAwal: num(apEditForm.openAwal), amt: num(apEditForm.amt), due: apEditForm.due,
      pph: apEditForm.nonPpn ? "Non-PPn" : "2%",
      vessel: apEditForm.vessel.trim(), item: apEditForm.item.trim(),
    });
    log("mengubah hutang", apEdit.id, "Keuangan");
    toast(S.apUpdated.replace("{a}", apEdit.id));
    setApEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // --- Piutang: ubah invoice belum lunas ---
  const saveInvEdit = async () => {
    if (!invEdit) return;
    if (!invEditForm.client.trim()) { toast(S.customerRequired, "info"); return; }
    if (!invEditForm.due) { toast(S.dueRequired, "info"); return; }
    try {
    await update("invoices", invEdit.id, {
      client: invEditForm.client.trim(),
      kodePembantu: invEditForm.kodePembantu.trim() || invEditForm.client.trim(),
      due: invEditForm.due, paymentTerm: invEditForm.paymentTerm,
      milestoneRef: invEditForm.milestoneRef.trim(), nsfp: invEditForm.nsfp.trim(), noFaktur: invEditForm.noFaktur.trim(),
    });
    log("mengubah invoice", invEdit.id, "Keuangan");
    toast(S.invUpdated.replace("{a}", invEdit.id));
    setInvEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /**
   * Hapus invoice.
   *
   * Dibatasi ketat: invoice hanya boleh dihapus selama masih DRAFT atau
   * DITOLAK. Setelah terbit (Lunas/Terlambat/Belum Dibayar) invoice sudah
   * beruang dan menjadi acuan pelunasan - menghapusnya berarti menghapus
   * piutang yang sudah diakui, bukan membatalkan salah input. Untuk invoice
   * yang sudah terbit, jalur yang benarVOID/adjustment atau delete payables
   * yang merujuknya, dan backend juga memblokir via delete-guard refs.
   */
  const confirmDelInvoice = async () => {
    if (!delInvoice) return;
    const st = String(delInvoice.status ?? "");
    if (st !== "Draft" && st !== "Ditolak") {
      toast(
        locale === "en"
          ? `Invoice ${delInvoice.id} is already issued (${st}) - void or settle it instead of deleting.`
          : `Invoice ${delInvoice.id} sudah terbit (${st}) - void atau lunaskan, jangan dihapus.`,
        "info",
      );
      return;
    }
    try {
      await remove("invoices", String(delInvoice.id));
      log("menghapus invoice", `${delInvoice.id} - ${st}`, "Keuangan");
      toast(locale === "en" ? `Invoice ${delInvoice.id} deleted` : `Invoice ${delInvoice.id} dihapus`);
      setDelInvoice(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // --- Aset: tambah harta (kolom sheet Aset), tarif fiskal GL ---
  const AST_TARIF: Record<string, number> = { BP: 5, "1": 25, "2": 12.5, "3": 6.25 };
  const saveAst = async () => {
    if (!astForm.nama.trim()) { toast(S.assetNameRequired, "info"); return; }
    if (!num(astForm.nilai) || num(astForm.nilai) <= 0) { toast(S.assetValuePositive, "info"); return; }
    const tarif = AST_TARIF[astForm.kelompok] ?? 12.5;
    const susutTahun = Math.round((num(astForm.nilai) * tarif) / 100);
    try {
    await add("assets", {
      nama: astForm.nama.trim(), kelompok: astForm.kelompok, bulan: astForm.bulan.trim() || "-",
      tahun: astForm.tahun.trim() || today.slice(0, 4), nilai: num(astForm.nilai),
      sisaAwal: num(astForm.nilai), susutTahun, metode: astForm.metode || "GL",
    }, { action: "menambah aset", module: "Keuangan" });
    toast(S.assetAdded.replace("{a}", astForm.nama.trim()).replace("{b}", String(tarif)));
    setShowAst(false);
    setAstForm({ nama: "", kelompok: "2", bulan: "", tahun: "", nilai: "", metode: "GL" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // --- Aset: ubah harta (nama/kelompok/periode/nilai/metode), susut dihitung ulang ---
  const openAstEdit = (a: StoreItem) => {
    setAstEdit(a);
    setAstForm({
      nama: String(a.nama ?? ""),
      kelompok: String(a.kelompok ?? "2"),
      bulan: String(a.bulan ?? ""),
      tahun: String(a.tahun ?? ""),
      nilai: String(a.nilai ?? ""),
      metode: String(a.metode ?? "GL"),
    });
    setShowAst(true);
  };

  const closeAst = () => {
    setShowAst(false);
    setAstEdit(null);
    setAstForm({ nama: "", kelompok: "2", bulan: "", tahun: "", nilai: "", metode: "GL" });
  };

  const saveAstEdit = async () => {
    if (!astEdit) return;
    if (!astForm.nama.trim()) { toast(S.assetNameRequired, "info"); return; }
    if (!num(astForm.nilai) || num(astForm.nilai) <= 0) { toast(S.assetValuePositive, "info"); return; }
    const tarif = AST_TARIF[astForm.kelompok] ?? 12.5;
    const susutTahun = Math.round((num(astForm.nilai) * tarif) / 100);
    try {
      await update("assets", String(astEdit.id), {
        nama: astForm.nama.trim(), kelompok: astForm.kelompok, bulan: astForm.bulan.trim() || "-",
        tahun: astForm.tahun.trim() || today.slice(0, 4), nilai: num(astForm.nilai),
        sisaAwal: num(astForm.nilai), susutTahun, metode: astForm.metode || "GL",
      });
      log("mengubah aset", `${astEdit.id} · ${astForm.nama.trim()}`, "Keuangan");
      toast(S.assetAdded.replace("{a}", astForm.nama.trim()).replace("{b}", String(tarif)));
      closeAst();
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // --- Laba Rugi ala sheet LR: kelompok dari NL snapshot audit Agu-2026 ---
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
  /* Laba kumulatif s.d. tanggal as-of + mutasi periode filter. Versi lama
     menjumlahkan hanya bulan-bulan yang lolos matchHistPeriod, sehingga
     laba yang ditampilkan adalah laba bulan itu saja - bukan laba yang
     dibukukan sampai tanggal itu. Neraca memakai angka yang sama, jadi
     kedua laporan saling bertentangan. */
  const lrLive = useMemo(() => {
    const asOf = asOfOrToday(lrHist, lastTxDate);
    const upto = asOf.slice(0, 7);
    const inPeriod = plMonthly.filter((p) => matchHistPeriod(p.period, lrHist));
    const uptoRows = plMonthly.filter((p) => p.period <= upto);
    const sum = (rows: typeof plMonthly): { revenue: number; costProj: number; salary: number; writeoff: number; laba: number; n: number } =>
      rows.reduce(
        (s, p) => ({ revenue: s.revenue + p.revenue, costProj: s.costProj + p.costProj, salary: s.salary + p.salary, writeoff: s.writeoff + p.writeoff, laba: s.laba + p.laba, n: s.n + 1 }),
        { revenue: 0, costProj: 0, salary: 0, writeoff: 0, laba: 0, n: 0 },
      );
    return { ...sum(uptoRows), nPeriod: inPeriod.length, period: sum(inPeriod) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plMonthly, lrHist]);

  /* ============ NILAI BUKU BESAR, NERACA, LABA RUGI ============
   * Taruh di luar render tab supaya layar dan tombol export memakai
   * ANGKA YANG SAMA. Kalau masing-masing menghitung sendiri, keduanya bisa
   * menyimpang tanpa ketahuan - dan angka yang diekspor seharusnya identik
   * dengan yang di layar. */
  const lrAsOf = asOfOrToday(lrHist, lastTxDate);
  const lrSnap = isSnapMonth(lrAsOf.slice(0, 7));

  const bbAsOf = asOfOrToday(bbHist, lastTxDate);
  const bbSnap = isSnapMonth(bbAsOf.slice(0, 7));
  /* Debit/kredit kumulatif s.d. bbAsOf - saldo buku besar harus mengandung
     transaksi SEJAK AWAL, bukan hanya periode yang difilter. Yang
     period-scoped tetap kolom "mutasi periode ini". */
  const bbLive = useMemo(() => {
    const m = new Map<string, { kode: string; nama: string; d: number; k: number; n: number; dAll: number; kAll: number }>();
    const nameOf = (kode: string): string => String(coaRows.find((c) => String(c.kode) === kode)?.nama ?? kode);
    for (const j of manJournals) {
      if (j.status === "Void") continue;
      const tgl = String(j.date ?? "").slice(0, 10);
      const inPeriod = matchHist(tgl, bbHist);
      if (tgl > bbAsOf && !inPeriod) continue;
      for (const [kode, side] of [[String(j.db ?? ""), "d"], [String(j.kr ?? ""), "k"]] as const) {
        if (!kode) continue;
        const cur = m.get(kode) ?? { kode, nama: nameOf(kode), d: 0, k: 0, n: 0, dAll: 0, kAll: 0 };
        if (side === "d") { cur.dAll += num(j.amount); if (inPeriod) cur.d += num(j.amount); }
        else { cur.kAll += num(j.amount); if (inPeriod) cur.k += num(j.amount); }
        if (inPeriod) cur.n += 1;
        m.set(kode, cur);
      }
    }
    return [...m.values()].sort((a, b) => a.kode.localeCompare(b.kode));
  }, [manJournals, bbHist, bbAsOf, coaRows]);
  /* Saldo kumulatif harus seimbang: total debit = total kredit untuk semua
     akun. Kalau tidak, ada jurnal yang tanggalnya di luar rentang as-of dan
     angka yang tampil bukan saldo. */
  const bbDAll = bbLive.reduce((s, r) => s + r.dAll, 0);
  const bbKAll = bbLive.reduce((s, r) => s + r.kAll, 0);

  const nrAsOf = asOfOrToday(nrHist, lastTxDate);
  const nrSnap = isSnapMonth(nrAsOf.slice(0, 7));
  const hutLive = apOutAsOf(payables, nrAsOf);
  const piuLive = arOutAsOf(invoices, nrAsOf);
  const hutLiveTotal = hutLive.reduce((s, h) => s + h.total, 0);
  const piuLiveTotal = piuLive.reduce((s, p) => s + p.total, 0);
  const nrLabaLive = plMonthly.filter((p) => p.period <= nrAsOf.slice(0, 7)).reduce((s, p) => s + p.laba, 0);

  const stepInvoice = async (inv: StoreItem, next: string) => {    if (next === "Lunas") {
      setPayTarget(inv);
      setProof(emptyProof());
      setProofImg("");
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
    try {
    await update("invoices", inv.id, { status: next });
    log("memproses invoice", `${inv.id} ${inv.status} → ${next}`, "Keuangan");
    toast(S.movedTo.replace("{a}", inv.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDirector = async () => {
    if (!dirTarget) return;
    if (!dirCheck) { toast(S.dirCheckRequired, "info"); return; }
    if (!dirName.trim()) { toast(S.approverRequired, "info"); return; }
    try {
    await update("invoices", dirTarget.id, {
      status: "Disetujui",
      directorApproved: true,
      directorName: dirName.trim(),
      directorAt: today,
    });
    log("menyetujui invoice via Director", `${dirTarget.id} oleh ${dirName.trim()}`, "Keuangan");
    toast(S.dirApproved.replace("{a}", dirTarget.id));
    setDirTarget(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // Lunas mengalir balik: projects.actual (+status bila syarat tutup terpenuhi),
  // bast (invoiceId + paidAt), contracts (paidTotal), clients.creditLimit.
  const afterInvoicePaid = async (inv: StoreItem, paidDate: string, paidRef: string): Promise<void> => {
    try {
      const grand = invNeto(inv);
      const pid = String(inv.project ?? "");
      if (pid) {
        const mine = (data.invoices ?? []).filter((i) => String(i.project ?? "") === pid);
        const actual = mine.reduce(
          (s, i) => s + (String(i.id) === String(inv.id) ? grand : (String(i.status) === "Lunas" ? invNeto(i) : 0)),
          0
        );
        const patch: Record<string, unknown> = { actual };
        const proj = projectById[pid];
        if (proj) {
          const rest = mine.filter((i) => String(i.id) !== String(inv.id) && String(i.status) !== "Lunas");
          const bastOk = (data.bast ?? []).some(
            (b) => String(b.projectId ?? "") === pid && String(b.status) === "Disetujui"
          );
          const wbs = (data.wbsByProject ?? {})[pid] ?? [];
          const totalW = wbs.reduce((s, w) => s + Number(w.weight || 0), 0);
          const wProg = totalW > 0
            ? Math.round(wbs.reduce((s, w) => s + Number(w.progress || 0) * Number(w.weight || 0), 0) / totalW)
            : 0;
          if (rest.length === 0 && String(proj.tahap) === "Handover" && bastOk && wProg === 100) {
            patch.status = "Selesai";
          }
        }
        await update("projects", pid, patch);
        log("akumulasi realisasi dari pelunasan", `${pid} → ${fmtRupiah(actual)}`, "Keuangan");
        const proj2 = projectById[pid];
        const contract = (data.contracts ?? []).find((c) =>
          String(c.projectId ?? "") === pid ||
          (proj2?.quotationId && String(c.quotationId ?? "") === String(proj2.quotationId))
        );
        if (contract) {
          const paidTotal = (data.invoices ?? [])
            .filter((i) => String(i.project ?? "") === pid &&
              (String(i.id) === String(inv.id) || String(i.status) === "Lunas"))
            .reduce((s, i) => s + (String(i.id) === String(inv.id) ? grand : invNeto(i)), 0);
          await update("contracts", contract.id, { paidTotal, lastPaidAt: paidDate, lastPaidRef: paidRef });
          log("akumulasi pembayaran kontrak", `${contract.id} → ${fmtRupiah(paidTotal)}`, "Keuangan");
        }
      }
      // BAST yang ditagih invoice ini: simpan invoiceId balik + catat pelunasan.
      const ref = String(inv.milestoneRef ?? "");
      const bastId = String(inv.bastId ?? "") || (ref.startsWith("BAST ") ? ref.slice(5).trim() : "");
      if (bastId) {
        const b = (data.bast ?? []).find((x) => String(x.id) === bastId);
        if (b) {
          await update("bast", b.id, { invoiceId: String(inv.id), paidAt: paidDate, paidRef });
          log("pelunasan invoice BAST", `${bastId} ← ${String(inv.id)} Lunas`, "Keuangan");
        }
      }
      // Plafon kredit klien dipulihkan sebesar grand yang dilunasi.
      const client = (data.clients ?? []).find((c) => sameName(c.name, inv.client));
      if (client && grand > 0) {
        await update("clients", client.id, {
          creditLimit: num(client.creditLimit) + grand,
          lastPaidAt: paidDate,
        });
        log("pemulihan limit kredit", `${String(client.name)} +${fmtRupiah(grand)}`, "Keuangan");
      }
    } catch {
      /* backflow best-effort - pelunasan inti sudah tersimpan */
    }
  };

  const confirmBuktiInv = async () => {
    if (!payTarget) return;
    if (!proof.date) { toast(S.payDateRequired, "info"); return; }
    if (!proof.ref.trim()) { toast(S.refRequired, "info"); return; }
    try {
      await update("invoices", payTarget.id, {
        status: "Lunas", paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim(),
        ...(proofImg ? { paidProofUrl: proofImg, buktiUrl: proofImg } : {}),
      });
      log("melunasi invoice", `${payTarget.id} via ${proof.method} ${proof.ref.trim()}`, "Keuangan");
      const kasKode = kasKodeOf(proof.method);
      const jurnalOk = await postAutoJournal({
        dokumen: `CASH-${payTarget.id}`,
        date: proof.date,
        uraian: `Pelunasan ${payTarget.id} via ${proof.method} ${proof.ref.trim()}`,
        db: kasKode,
        kr: "1-130",
        amount: invNeto(payTarget),
      });
      await afterInvoicePaid(payTarget, proof.date, proof.ref.trim());
      toast(S.paidRecorded.replace("{a}", payTarget.id) + (jurnalOk ? S.paidWithJournal : ""));
      setPayTarget(null);
      setProofImg("");
    } catch {
      toast(S.paidFail.replace("{a}", payTarget.id), "info");
    }
  };

  const confirmBuktiAp = async () => {
    if (!apTarget) return;
    if (!proof.date) { toast(S.payDateRequired, "info"); return; }
    if (!proof.ref.trim()) { toast(S.refRequired, "info"); return; }
    // Hutang 2 tahap ala CONTOH HUTANG.xlsx (Pembayaran I / II + sisa).
    const amt = num(apTarget.amt);
    const p1 = num(apTarget.pay1);
    const bayar = num(apPayAmt);
    if (!bayar || bayar <= 0) { toast(S.stageAmountRequired, "info"); return; }
    if (bayar > amt - p1 - num(apTarget.pay2)) { toast(S.overRemain, "info"); return; }
    try {
      if (!p1) {
      const sisa = amt - bayar;
      await update("payables", apTarget.id, {
        pay1: bayar, pay1date: proof.date, pay1ref: proof.ref.trim(), pay1method: proof.method,
        st: sisa <= 0 ? "Lunas" : "Dibayar Sebagian",
        ...(sisa <= 0 ? { paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim() } : {}),
        ...(proofImg ? { pay1ProofUrl: proofImg, buktiUrl: proofImg } : {}),
      });
      log("membayar hutang tahap I", `${apTarget.po} ${fmtRupiah(bayar)} via ${proof.ref.trim()}`, "Keuangan");
      await postAutoJournal({
        dokumen: `PAY-${apTarget.id}-1`,
        date: proof.date,
        uraian: `Bayar hutang I ${apTarget.po} via ${proof.ref.trim()}`,
        db: "2-110",
        kr: kasKodeOf(proof.method),
        amount: bayar,
      });
      toast(S.stageOneDone.replace("{a}", fmtRupiah(bayar)).replace("{b}", fmtRupiah(Math.max(0, sisa))));
    } else {
      const p2 = num(apTarget.pay2) + bayar;
      const sisa = amt - p1 - p2;
      await update("payables", apTarget.id, {
        pay2: p2, pay2date: proof.date, pay2ref: proof.ref.trim(), pay2method: proof.method,
        st: sisa <= 0 ? "Lunas" : "Dibayar Sebagian",
        ...(sisa <= 0 ? { paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim() } : {}),
        ...(proofImg ? { pay2ProofUrl: proofImg, buktiUrl: proofImg } : {}),
      });
      log("membayar hutang tahap II", `${apTarget.po} ${fmtRupiah(bayar)} via ${proof.ref.trim()}`, "Keuangan");
      await postAutoJournal({
        dokumen: `PAY-${apTarget.id}-2`,
        date: proof.date,
        uraian: `Bayar hutang II ${apTarget.po} via ${proof.ref.trim()}`,
        db: "2-110",
        kr: kasKodeOf(proof.method),
        amount: bayar,
      });
      toast(S.stageTwoDone.replace("{a}", fmtRupiah(bayar)).replace("{b}", fmtRupiah(Math.max(0, sisa))));
      }
      setApTarget(null);
      setApPayAmt("");
      setProofImg("");
    } catch {
      toast(S.apPayFail.replace("{a}", String(apTarget.po)), "info");
    }
  };

  const toggleSched = (key: string) =>
    setSchedSel((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const confirmBatch = async () => {
    if (schedSel.length === 0) { toast(S.pickSchedule, "info"); return; }
    if (!batchProof.date) { toast(S.payDateRequired, "info"); return; }
    if (!batchProof.ref.trim()) { toast(S.refRequired, "info"); return; }
    const ordered = schedItems.filter((r) => schedSel.includes(r.key)).sort((a, b) => String(a.due).localeCompare(String(b.due)));
    let batchFail = 0;
    for (const r of ordered) {
      try {
        if (r.kind === "AP") {
        const ap = (data.payables ?? []).find((a) => String(a.id) === String(r.id));
        const sisaAp = ap ? Math.max(0, num(ap.amt) - num(ap.pay1) - num(ap.pay2)) : num(r.amount);
        const prevP1 = num(ap?.pay1);
        await update("payables", r.id, prevP1 > 0
          ? { pay2: num(ap?.pay2) + sisaAp, pay2date: batchProof.date, pay2ref: batchProof.ref.trim(), pay2method: batchProof.method, st: "Lunas", paidAt: batchProof.date, paidMethod: batchProof.method, paidRef: batchProof.ref.trim(), ...(batchImg ? { pay2ProofUrl: batchImg, buktiUrl: batchImg } : {}) }
          : { pay1: sisaAp, pay1date: batchProof.date, pay1ref: batchProof.ref.trim(), pay1method: batchProof.method, st: "Lunas", paidAt: batchProof.date, paidMethod: batchProof.method, paidRef: batchProof.ref.trim(), ...(batchImg ? { pay1ProofUrl: batchImg, buktiUrl: batchImg } : {}) });
        log("melunasi hutang massal", `${r.ref} via ${batchProof.method} ${batchProof.ref.trim()}`, "Keuangan");
        await postAutoJournal({
          dokumen: `PAY-${r.id}-B`,
          date: batchProof.date,
          uraian: `Bayar hutang massal ${r.ref} via ${batchProof.ref.trim()}`,
          db: "2-110",
          kr: kasKodeOf(batchProof.method),
          amount: sisaAp,
        });
      } else {
        await update("invoices", r.id, { status: "Lunas", paidAt: batchProof.date, paidMethod: batchProof.method, paidRef: batchProof.ref.trim(), ...(batchImg ? { paidProofUrl: batchImg, buktiUrl: batchImg } : {}) });
        log("melunasi invoice massal", `${r.id} via ${batchProof.method} ${batchProof.ref.trim()}`, "Keuangan");
        await postAutoJournal({
          dokumen: `CASH-${r.id}`,
          date: batchProof.date,
          uraian: `Pelunasan massal ${r.id} via ${batchProof.ref.trim()}`,
          db: kasKodeOf(batchProof.method),
          kr: "1-130",
          amount: r.amount,
        });
        const full = (data.invoices ?? []).find((i) => String(i.id) === String(r.id));
        if (full) await afterInvoicePaid(full, batchProof.date, batchProof.ref.trim());
        }
      } catch {
        batchFail++;
      }
    }
    toast(S.batchDone.replace("{n}", String(ordered.length - batchFail)) + (batchFail > 0 ? S.batchFailSuffix.replace("{n}", String(batchFail)) : ""));
    setSchedSel([]);
    setShowBatch(false);
    setBatchImg("");
  };

  const exportJadwal = () => {
    const rows: unknown[][] = [
      ["Jenis", "ID", "Ref/Proyek", "Uraian", "Jatuh Tempo", "Umur (hari)", "Nilai (Rp)"],
      ...schedItems.map((r) => [r.kind, r.id, r.ref, r.desc, r.due, r.age, r.amount]),
    ];
    void exportExcel(rows, "Jadwal-Bayar-30hari");
    toast(S.scheduleExported);
  };

  const exportEfaktur = () => {
    if (!activePeriod) { toast(S.pickPeriodFirst, "info"); return; }
    if (efakturRows.length === 0) { toast(S.noLunasPeriod, "info"); return; }
    const rows = efakturRows.map((i) => [
      String(i.nsfp ?? ""),
      String(i.noFaktur ?? ""),
      String(i.paidAt || i.due || ""),
      String(i.client ?? ""),
      num(i.dpp) || num(i.amount),
      num(i.ppnAmt) || Math.round((num(i.amount) * taxCalc.ppnRate) / 100),
    ]);
    downloadCsv(`EFAKTUR-${activePeriod}.csv`, ["NSFP", "NoFaktur", "Tanggal", "Client", "DPP", "PPN"], rows);
    toast(S.efakturExported.replace("{a}", activePeriod).replace("{n}", String(efakturRows.length)));
  };

  const saveAlloc = async () => {
    if (!allocTarget) return;
    if (!allocForm.project) { toast(S.pickAllocProject, "info"); return; }
    const pct = num(allocForm.pct);
    if (pct <= 0 || pct > 100) { toast(S.allocPctRange, "info"); return; }
    try {
    await update("payroll", allocTarget.id, { allocProject: allocForm.project, allocPct: pct });
    log("mengalokasikan gaji", `${allocTarget.id} → ${allocForm.project} ${pct}%`, "Keuangan");
    toast(S.allocSaved.replace("{a}", allocTarget.id).replace("{n}", String(pct)).replace("{b}", allocForm.project));
    setAllocTarget(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveOverhead = async () => {
    if (!profitPid) return;
    const pct = num(overheadPct);
    if (pct < 0 || pct > 100) { toast(S.overheadRange, "info"); return; }
    try {
    await update("projects", profitPid, { overheadPct: pct });
    log("mengatur overhead proyek", `${profitPid} ${pct}%`, "Keuangan");
    toast(S.overheadSaved.replace("{a}", profitPid).replace("{n}", String(pct)));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmRelease = async () => {
    if (!releaseTarget) return;
    if (!releaseForm.date) { toast(S.releaseDateRequired, "info"); return; }
    if (!releaseForm.ba.trim()) { toast(S.baRequired, "info"); return; }
    const retAmt = num(releaseTarget.retentionAmt);
    try {
      await update("invoices", releaseTarget.id, {
      retentionStatus: "Released",
      retentionReleaseDate: releaseForm.date,
      retentionBaNo: releaseForm.ba.trim(),
      ...(releaseForm.warrantyId ? { warrantyId: releaseForm.warrantyId } : {}),
    });
    // Retensi yang dirilis menjadi tagihan baru (top-up AR) agar kasir bisa menagihkannya.
    if (retAmt > 0 && !(data.invoices ?? []).some((i) => String(i.milestoneRef ?? "") === `Retensi ${releaseTarget.id}`)) {
      let topId = `${releaseTarget.id}-R`;
      let bumpN = 1;
      while ((data.invoices ?? []).some((i) => String(i.id) === topId)) {
        bumpN += 1;
        topId = `${releaseTarget.id}-R${bumpN}`;
      }
      await add("invoices", {
        id: topId,
        client: releaseTarget.client,
        kodePembantu: releaseTarget.kodePembantu ?? releaseTarget.client,
        project: releaseTarget.project,
        amount: retAmt,
        grandTotal: retAmt,
        retentionAmt: 0,
        retentionPct: 0,
        retentionStatus: "-",
        // Retensi = bagian grand invoice induk yang sudah ber-PPN - tidak kena
        // PPN/PPh baru. Tarif induk disimpan agar laporan tak menghitung ulang.
        jasaTotal: 0,
        matTotal: 0,
        dpp: 0,
        ppnAmt: 0,
        pphAmt: 0,
        ppnRate: num(releaseTarget.ppnRate) || getSetting(data, "PPN_INVOICE_RATE", PPN_INVOICE_DEFAULT),
        pphRate: num(releaseTarget.pphRate) || getSetting(data, "PPH_JASA_RATE", PPH_JASA_DEFAULT),
        skdt: Boolean(releaseTarget.skdt),
        due: releaseForm.date,
        status: "Diajukan",
        paymentTerm: `Retensi ${releaseTarget.id}`,
        billingType: "Retensi",
        milestoneRef: `Retensi ${releaseTarget.id}`,
        dunning: "Belum Ditagih",
      }, { action: "menagih retensi yang dirilis", module: "Keuangan" });
      log("membuat invoice retensi", `${topId} dari ${releaseTarget.id} · ${fmtRupiah(retAmt)}`, "Keuangan");
    }
    log("me-release retensi", `${releaseTarget.id} BA ${releaseForm.ba.trim()}`, "Keuangan");
    toast(S.retentionReleased.replace("{a}", releaseTarget.id) + (retAmt > 0 ? S.retentionBilled : ""));
    setReleaseTarget(null);
    setReleaseForm({ date: todayISO(), ba: "", warrantyId: "" });
    } catch {
      toast(S.releaseFail.replace("{a}", releaseTarget.id), "info");
    }
  };

  const markTaxLapor = async () => {
    if (!activeTax) { toast(S.pickPeriodFirst, "info"); return; }
    if (activeTax.status === "Lapor") { toast(S.periodLocked, "info"); return; }
    try {
      await update("taxPeriods", activeTax.id, {
      status: "Lapor",
      ppnKeluar: taxCalc.ppnKeluar,
      ppnMasuk: taxCalc.ppnMasuk,
      pph23: taxCalc.pph23,
      pph21: taxCalc.pph21,
      reportedAt: todayISO(),
      /* PPN terutang OTOMATIS disimpan terpisah dari override manual, supaya
         saat periode terkunci masih kelihatan berapa yang dihitung sistem
         dan berapa yang dikoreksi orang. Tanpa ini selisih koreksi hilang
         begitu Lapor ditekan. */
      ppnTerutangAuto: taxCalc.ppnKeluar - taxCalc.ppnMasuk,
      ppnTerutangFinal: sptNumOf(activeTax.ppnTerutangManual) > 0
        ? sptNumOf(activeTax.ppnTerutangManual)
        : taxCalc.ppnKeluar - taxCalc.ppnMasuk,
    });
    // Kunci pajak menerbitkan hutang pajak (idempoten via po TAX-<periode>-*):
    // PPh 23 dan PPh 21 sebagai DUA baris terpisah.
    const ppnNet = Math.max(0, num(taxCalc.ppnKeluar) - num(taxCalc.ppnMasuk));
    const pph23 = Math.round(num(taxCalc.pph23));
    const pph21lock = Math.round(num(taxCalc.pph21));
    const taxDue = `${activePeriod}-28`;
    if (ppnNet > 0 && !(data.payables ?? []).some((a) => String(a.po ?? "") === `TAX-${activePeriod}-PPN`)) {
      await add("payables", {
        v: "Hutang Pajak PPN", po: `TAX-${activePeriod}-PPN`, amt: ppnNet, openAwal: ppnNet,
        due: taxDue, pph: "Non-PPn", st: "Belum Dibayar", vessel: "-",
        item: `PPN terutang ${activePeriod}`, pay1: 0, pay1date: "", pay2: 0, pay2date: "",
      }, { action: "hutang pajak dari kunci periode", module: "Pajak" });
    }
    if (pph23 > 0 && !(data.payables ?? []).some((a) => String(a.po ?? "") === `TAX-${activePeriod}-PPH23`)) {
      await add("payables", {
        v: "Hutang Pajak PPh 23", po: `TAX-${activePeriod}-PPH23`, amt: pph23, openAwal: pph23,
        due: taxDue, pph: "Non-PPn", st: "Belum Dibayar", vessel: "-",
        item: `PPh 23 ${activePeriod}`, pay1: 0, pay1date: "", pay2: 0, pay2date: "",
      }, { action: "hutang pajak dari kunci periode", module: "Pajak" });
    }
    if (pph21lock > 0 && !(data.payables ?? []).some((a) => String(a.po ?? "") === `TAX-${activePeriod}-PPH21`)) {
      await add("payables", {
        v: "Hutang Pajak PPh 21", po: `TAX-${activePeriod}-PPH21`, amt: pph21lock, openAwal: pph21lock,
        due: taxDue, pph: "Non-PPn", st: "Belum Dibayar", vessel: "-",
        item: `PPh 21 ${activePeriod}`, pay1: 0, pay1date: "", pay2: 0, pay2date: "",
      }, { action: "hutang pajak dari kunci periode", module: "Pajak" });
    }
    log("melaporkan periode pajak", `${activeTax.period} dikunci`, "Pajak");
    toast(S.periodReported.replace("{a}", String(activeTax.period)));
    } catch {
      toast(S.periodLockFail.replace("{a}", String(activeTax.period)), "info");
    }
  };

/* SPT dibuat server dari baris `taxPeriods` versi beku. Ini bukan sekadar
     soal tampilan: SPT adalah dokumen pajak yang filed, jadi nominalnya harus
     sama persis dengan yang tercatat, bukan hasil hit ulang dari state layar. */
  const exportSptPdf = async (): Promise<void> => {
    if (!activeTax) return;
    if (!pdfServerReady()) {
      toast(S.saveFail, "info");
      return;
    }
    const done = await pdfDoc.request({ kind: "spt", id: String(activeTax.id), locale }, `SPT-${activeTax.period}`, false);
    if (done) toast(S.sptPdfExported);
  };

  const exportSpt = () => {
    if (!activeTax) return;
    /* SPT dari snapshot kunci: nilai tampil (taxShown) dan ekspor SAMA.
       Dasar/tarif kolom memakai kalkulasi berjalan sebagai keterangan. */
    const shown = taxShown;
    const rows: unknown[][] = [
      ["SPT Ringkas", activeTax.period, `Status: ${activeTax.status}`],
      ["Jenis", "Dasar", "Tarif", "Nilai (Rp)"],
      ["PPN Keluaran", taxCalc.invBase, `${taxCalc.ppnRate}%`, shown.ppnKeluar],
      ["PPN Masukan", taxCalc.apBase, `${taxCalc.ppnRate}%`, shown.ppnMasuk],
      ["PPh 23", taxCalc.apBase, `${taxCalc.pphRate}%`, shown.pph23],
      ["PPh 21", "Total payroll", "-", shown.pph21],
      ["PPN Terutang (Keluaran - Masukan)", "-", "-", shown.ppnKeluar - shown.ppnMasuk],
    ];
    void exportExcel(rows, `SPT-${activeTax.period}`);
    toast(S.sptExported);
  };

  const firstLate = invoices.find((i) => i.status === "Terlambat") ?? null;

  return (
    <div>
      <PageHeader
        title={S.pageTitle}
        subtitle={S.pageSubtitle}
        icon={<Wallet className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowInv(true)}><FileText className="h-4 w-4" /> {S.createInvoice}</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} dismiss={modAlert.dismiss} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiAR} value={fmtMiliar(arTotal)} delta={S.lateDelta.replace("{n}", String(lateCount))} deltaDirection="down" icon={<Wallet className="h-5 w-5" />} chip="rose" spark={arSpark} />
        <KpiCard label={S.kpiAP} value={fmtMiliar(apTotal)} hint={S.kpiAPHin} icon={<Wallet className="h-5 w-5" />} chip="navy" spark={apSpark} />
        <KpiCard
          label={S.kasTitle}
          value={fmtMiliar(kasAkhir)}
          delta={(kasDelta >= 0 ? "+" : "") + S.kasDelta.replace("{a}", String(kasDelta))}
          deltaDirection={kasDelta >= 0 ? "up" : "down"}
          icon={<ArrowDownToLine className="h-5 w-5" />} chip="teal" spark={kasSpark}
        />
        <KpiCard
          label={plMonthly.length ? S.kpiLabaRun : S.kpiLabaNet}
          value={fmtMiliar(labaLast)}
          delta={(labaDelta >= 0 ? "+" : "") + S.labaDelta.replace("{a}", String(labaDelta))}
          deltaDirection={labaDelta >= 0 ? "up" : "down"}
          icon={<TrendingUp className="h-5 w-5" />} chip="violet" spark={labaSpark}
        />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Akun", "Aset", "Invoice", "Piutang (AR)", "Hutang (AP)", "Jadwal Bayar", "Kas & Bank", "Jurnal", "Buku Besar", "Laba Rugi", "Neraca", "Project P&L", "Pajak"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Akun" && (
            <div className="space-y-4">
              <CardHeader
                title={S.akunTitle}
                subtitle={S.akunSub}
                action={<button className="btn-primary text-xs" onClick={() => { setCoaTarget(null); setCoaForm({ kode: "", nama: "", dk: "D", nrlr: "NR" }); setShowCoa(true); }}>{S.addAkun}</button>}
              />
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                  value={coaQ}
                  onChange={setCoaQ}
                  placeholder={S.searchAkunPh}
                  ariaLabel={S.searchAkunAria}
                  className="w-56"
                />
                <select className="input w-auto py-1.5 text-sm" value={coaTipe} onChange={(e) => setCoaTipe(e.target.value)} aria-label={S.filterTipeAria}>
                  {coaTipeOptions.map((t) => <option key={t} value={t}>{t === "Semua" ? S.allTypes : t}</option>)}
                </select>
                <span className="ml-auto text-xs text-steel-400">{S.countAkun.replace("{n}", String(coaFiltered.length))}</span>
              </div>
              <div className="space-y-3">
                {coaGroups.map((g) => (
                  <Accordion key={g.tipe} title={g.tipe} subtitle={g.tipe === "Header" ? S.headerLockNote : S.countAkun.replace("{n}", String(g.rows.length))} count={g.rows.length} defaultOpen={coaGroups.length === 1 || g.tipe === "Aset"}>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-surface sticky top-0 z-10">
                          <tr>
                            <SortTh label={S.colNoAkun} sortKey="kode" sort={akunSort} onSort={(k) => setAkunSort((s) => toggleSort(s, k))} />
                            <SortTh label={S.colNamaAkun} sortKey="nama" sort={akunSort} onSort={(k) => setAkunSort((s) => toggleSort(s, k))} />
                            <SortTh label="D/K" sortKey="dk" sort={akunSort} onSort={(k) => setAkunSort((s) => toggleSort(s, k))} />
                            <SortTh label="NR/LR" sortKey="nrlr" sort={akunSort} onSort={(k) => setAkunSort((s) => toggleSort(s, k))} />
                            <th className="th">{S.actionTh}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {g.rows.map((c) => {
                            const header = String(c.dk) === "-";
                            return (
                              <tr key={String(c.id)} className={header ? "bg-navy-50 font-semibold" : "hover:bg-surface"}>
                                <td className="td font-mono text-xs font-semibold text-navy-900">{String(c.kode)}</td>
                                <td className="td text-xs text-steel-600">{String(c.nama)} {header && <span className="ml-1 rounded-full bg-navy-700 px-1.5 py-0.5 text-[10px] font-bold text-white">Header</span>}</td>
                                <td className="td text-xs text-steel-500">{String(c.dk)}</td>
                                <td className="td text-xs text-steel-500">{String(c.nrlr)}</td>
                                <td className="td">
                                  <div className="flex gap-1.5">
                                    <RowAction icon={Pencil} tone="neutral" label={S.editBtn} ariaLabel={`${S.editBtn} ${String(c.kode)}`} onClick={() => { setCoaTarget(c); setCoaForm({ kode: String(c.kode), nama: String(c.nama), dk: String(c.dk) === "-" ? "D" : String(c.dk), nrlr: String(c.nrlr) === "-" ? "NR" : String(c.nrlr) }); setShowCoa(true); }} />
                                    {!header && (
                                      <RowAction icon={Trash2} tone="danger" label={S.deleteBtn} ariaLabel={`${S.deleteBtn} ${String(c.kode)}`} onClick={() => setDelCoa(c)} />
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Accordion>
                ))}
                {coaGroups.length === 0 && <p className="py-6 text-center text-sm text-steel-400">{S.noAkunMatch}</p>}
              </div>
            </div>
          )}

          {tab === "Piutang (AR)" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CardHeader title={S.invListTitle} subtitle={S.arSub} />
                <div className="px-5 pb-2">
                  <SearchBox value={arQ} onChange={setArQ} placeholder={S.cardSearchPh} ariaLabel={locale === "en" ? "Search receivables" : "Cari piutang"} />
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
                  <HistFilterBar value={invHist} onChange={setInvHist} idPrefix="ar" />
                  <span className="text-xs text-steel-400">{S.arCountFilt.replace("{n}", String(sortedAr.length))}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.colInvoice} sortKey="id" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colKodePembantu} sortKey="kode" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colProyek} sortKey="project" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colSaldoAwal} sortKey="openAwal" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colNilai} sortKey="amount" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colDue} sortKey="due" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colUmur} sortKey="age" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <th className="th">{S.colPenagihan}</th>
                        <SortTh label={S.colStatus} sortKey="status" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        <th className="th">{S.actionTh}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {arPager.slice(sortedAr).map((inv) => {
                        const age = ageDays(inv.due, today);
                        const dun = dunningOf(inv);
                        const nextDun = DUNNING_NEXT[dun] ?? "Ditagih";
                        const open = inv.status !== "Lunas" && inv.status !== "Draft" && inv.status !== "Dihapusbukukan";
                        return (
                          <tr key={inv.id} id={notifRowId(String(inv.id))} className={rowHighlightClass({ id: String(inv.id), flash, notified: notified.has(String(inv.id)), base: "hover:bg-surface" })}>
                            <td className="td">
                              <p className="font-medium text-navy-900 font-mono">{inv.id}</p>
                              <p className="text-xs text-steel-500 truncate" title={String(inv.client ?? "")}>{String(inv.client ?? "")}</p>
                              <p className="text-[11px] text-steel-400">{String(inv.billingType ?? inv.paymentTerm ?? "")}{inv.milestoneRef ? ` · ${inv.milestoneRef}` : ""}</p>
                              {needsDirector(inv) && <span className="mt-1 inline-block"><Badge tone="amber">{S.needDirector}</Badge></span>}
                            </td>
                            <td className="td text-steel-600 font-mono text-xs truncate" title={String(inv.kodePembantu ?? inv.client ?? "")}>{String(inv.kodePembantu ?? inv.client ?? "")}{inv.nonPpn ? " · Non-PPn" : ""}</td>
                            <td className="td text-steel-600 font-mono text-xs truncate" title={String(inv.project ?? "-")}>{inv.project || "-"}</td>
                            <td className="td text-xs text-steel-500">{num(inv.openAwal) ? fmtRupiah(num(inv.openAwal)) : "-"}</td>
                            <td className="td font-semibold text-navy-900">{fmtRupiah(num(inv.amount))}</td>
                            <td className="td text-steel-600">{fmtTanggal(String(inv.due ?? ""))}</td>
                            <td className="td text-xs text-steel-600">{open ? S.ageDays.replace("{n}", fmtJumlah(age)) : "-"}</td>
                            <td className="td">
                              {open ? (
                                <span className="flex items-center gap-1.5">
                                  <StatusBadge status={dun} />
                                  <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => void busy.run(`dun-${inv.id}`, () => advanceDunning(inv))} disabled={busy.isBusy(`dun-${inv.id}`)}>{S.dunningNext.replace("{a}", nextDun)}</button>
                                </span>
                              ) : <span className="text-xs text-steel-400">-</span>}
                            </td>
                            <td className="td"><StatusBadge status={String(inv.status)} /></td>
                            <td className="td">
                              <div className="flex flex-wrap gap-1.5">
                                {invNext(String(inv.status)).map((next) => (
                                  <button
                                    key={next}
                                    className={next === "Lunas" ? "btn-primary text-xs" : next === "Ditolak" ? "btn-secondary text-xs text-rose-600" : "btn-secondary text-xs"}
                                    title={
                                      next === "Lunas" ? S.settleViaModal
                                      : next === "Ditolak" ? S.rejectViaModal
                                      : next === "Disetujui" ? S.approveNote
                                      : S.moveTo.replace("{a}", next)
                                    }
                                    onClick={() => void busy.run(`stepInvoice-${inv.id}-${next}`, () => stepInvoice(inv, next))} disabled={busy.isBusy(`stepInvoice-${inv.id}-${next}`)}
                                  >
                                    {next === "Lunas" ? S.markPaid : next}
                                  </button>
                                ))}
                                {(String(inv.status) === "Draft" || String(inv.status) === "Ditolak") && (
                                  <button
                                    className="btn-secondary text-xs"
                                    title={S.editLockedNote}
                                    onClick={() => {
                                      setInvEdit(inv);
                                      setInvEditForm({
                                        client: String(inv.client ?? ""), kodePembantu: String(inv.kodePembantu ?? inv.client ?? ""),
                                        due: String(inv.due ?? ""), paymentTerm: String(inv.paymentTerm ?? ""),
                                        milestoneRef: String(inv.milestoneRef ?? ""), nsfp: String(inv.nsfp ?? ""), noFaktur: String(inv.noFaktur ?? ""),
                                      });
                                    }}
                                  >{S.editBtn}</button>
                                )}
                                {invNext(String(inv.status)).length === 0 && (String(inv.status) === "Lunas" || String(inv.status) === "Dihapusbukukan") && <span className="text-xs text-steel-400">-</span>}
                              </div>
                            </td>
                          </tr>
                        );
                    })}
                  </tbody>
                </table>
              </div>
                {sortedAr.length === 0 && <EmptyState title={S.emptyInvTitle} subtitle={S.emptyInvSub} />}
                {arPager.bar}
                <Card className="mt-4 p-4">
                  <CardHeader title={S.agingTitle} subtitle={S.agingSub} />
                  <div className="overflow-x-auto px-5 pb-5">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr>
                          <SortTh label={S.colBucket} sortKey="name" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.colJumlah} sortKey="count" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                          <SortTh label={S.colTotal} sortKey="total" sort={arSort} onSort={(k) => setArSort((s) => toggleSort(s, k))} />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(agingReal, arSort, (b, k) => k === "count" ? Number(b.count) : k === "total" ? Number(b.total) : String(b.name)).map((b) => (
                          <tr key={b.name} className="hover:bg-surface">
                            <td className="td font-medium text-navy-900">{b.name}</td>
                            <td className="td text-steel-600">{S.countInvoice.replace("{n}", fmtJumlah(b.count))}</td>
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
                  <CardHeader title={S.agingDonutTitle} subtitle={S.agingDonutSub} />
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
                  <CardHeader title={S.retentionTitle} subtitle={S.retentionSub} />
                  <p className="px-5 pb-2 text-2xl font-bold text-navy-900">{fmtRupiah(retentionTotal)}</p>
                  <div className="px-5 pb-2"><SearchBox value={retQ} onChange={setRetQ} placeholder={S.cardSearchPh} ariaLabel={S.cardSearchPh} /></div>
                  <div className="max-h-64 space-y-2 overflow-y-auto scroll-flush-5 px-5 pb-5 pr-4">
                    {invoices.filter((i) => num(i.retentionAmt) > 0).filter((i) => rowMatches(i, retQ, ["id", "noInv", "client", "retentionStatus"])).map((i) => (
                      <div key={i.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-navy-900">{i.id}</span>
                        <span className="text-steel-500">{fmtRupiah(num(i.retentionAmt))}</span>
                        <span className="ml-auto"><StatusBadge status={String(i.retentionStatus ?? "Ditahan")} /></span>
                        {i.retentionStatus !== "Released" && (
                          <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => { setReleaseTarget(i); setReleaseForm({ date: todayISO(), ba: "", warrantyId: "" }); }}>{S.releaseBtn}</button>
                        )}
                      </div>
                    ))}
                    {invoices.filter((i) => num(i.retentionAmt) > 0).length === 0 && (
                      <p className="text-xs text-steel-400">{S.noRetention}</p>
                    )}
                  </div>
                </Card>
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Receipt className="h-3.5 w-3.5" /> {S.lateBanner.replace("{n}", String(lateCount))}
                  <button className="font-semibold underline" onClick={() => { if (firstLate) { setPayTarget(firstLate); setProof(emptyProof()); setProofImg(""); } }}>{S.markPaidLink}</button>
                </p>
              </div>
            </div>
          )}

          {tab === "Hutang (AP)" && (
            <div className="space-y-5">
              <CardHeader
                title={S.apTitle}
                subtitle={S.apSub}
                action={<button className="btn-secondary text-xs" onClick={() => setShowAp(true)}>{S.addHutang}</button>}
              />
              <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
                <HistFilterBar value={apHist} onChange={setApHist} idPrefix="ap" />
                <SearchBox value={apQ} onChange={setApQ} placeholder={S.cardSearchPh} ariaLabel={locale === "en" ? "Search payables" : "Cari utang"} className="max-w-xs" />
                <span className="text-xs text-steel-400">{S.apCountFilt.replace("{n}", String(sortedAp.length))}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colVendor} sortKey="v" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colKodePembantu} sortKey="kode" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colPO} sortKey="po" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colVessel} sortKey="vessel" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colSaldoAwal} sortKey="openAwal" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colSaldoAkhir} sortKey="amt" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <th className="th">{S.colBayar1}</th>
                      <th className="th">{S.colBayar2}</th>
                      <SortTh label={S.colSisa} sortKey="sisa" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colDue} sortKey="due" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <th className="th">{S.pph23}</th>
                      <SortTh label={S.colStatus} sortKey="st" sort={apSort} onSort={(k) => setApSort((s) => toggleSort(s, k))} />
                      <th className="th">{S.actionTh}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {apPager.slice(sortedAp).map((a) => (
                      <tr key={a.id} id={notifRowId(String(a.id))} className={rowHighlightClass({ id: String(a.id), flash, notified: notified.has(String(a.id)), base: "hover:bg-surface" })}>
                        <td className="td font-medium text-navy-900 truncate" title={String(a.v)}>{String(a.v)}</td>
                        <td className="td font-mono text-xs text-steel-600 truncate" title={String(a.kodePembantu ?? a.v)}>{String(a.kodePembantu ?? a.v)}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(a.po)}</td>
                        <td className="td text-xs text-steel-600 truncate" title={String(a.vessel ?? a.item ?? "")}>{String(a.vessel ?? "") || "-"}</td>
                        <td className="td text-xs text-steel-500">{num(a.openAwal) ? fmtRupiah(num(a.openAwal)) : "-"}</td>
                        <td className="td font-semibold">{fmtRupiah(num(a.amt))}</td>
                        <td className="td text-xs text-steel-600">{num(a.pay1) ? `${fmtRupiah(num(a.pay1))}${a.pay1date ? ` · ${fmtTanggal(String(a.pay1date))}` : ""}` : "-"}
                          {String(a.pay1ProofUrl ?? "") && <button type="button" onClick={() => void openProof(String(a.pay1ProofUrl))} className="mt-1 block overflow-hidden rounded-lg border border-steel-200" title="Lihat bukti tahap I"><SecureImg src={String(a.pay1ProofUrl)} alt={`Bukti I ${String(a.po)}`} className="h-10 w-16 object-cover" /></button>}</td>
                        <td className="td text-xs text-steel-600">{num(a.pay2) ? `${fmtRupiah(num(a.pay2))}${a.pay2date ? ` · ${fmtTanggal(String(a.pay2date))}` : ""}` : "-"}
                          {String(a.pay2ProofUrl ?? "") && <button type="button" onClick={() => void openProof(String(a.pay2ProofUrl))} className="mt-1 block overflow-hidden rounded-lg border border-steel-200" title="Lihat bukti tahap II"><SecureImg src={String(a.pay2ProofUrl)} alt={`Bukti II ${String(a.po)}`} className="h-10 w-16 object-cover" /></button>}
                          {String(a.buktiUrl ?? "") && !String(a.pay1ProofUrl ?? "") && !String(a.pay2ProofUrl ?? "") && <button type="button" onClick={() => void openProof(String(a.buktiUrl))} className="mt-1 block overflow-hidden rounded-lg border border-steel-200" title="Lihat bukti"><SecureImg src={String(a.buktiUrl)} alt={`Bukti ${String(a.po)}`} className="h-10 w-16 object-cover" /></button>}</td>
                        <td className="td font-semibold text-navy-900">{fmtRupiah(Math.max(0, num(a.amt) - num(a.pay1) - num(a.pay2)))}</td>
                        <td className="td text-steel-600">{fmtTanggal(String(a.due ?? ""))}</td>
                        <td className="td text-steel-600">{String(a.pph ?? "2%")}</td>
                        <td className="td"><StatusBadge status={String(a.st)} /></td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {a.st !== "Lunas" && (
                              <>
                                <RowAction
                                  icon={Wallet}
                                  tone="success"
                                  label={S.payStage.replace("{a}", num(a.pay1) ? " II" : " I")}
                                  ariaLabel={`${S.payStage.replace("{a}", num(a.pay1) ? " II" : " I")} ${String(a.po)}`}
                                  onClick={() => { setApTarget(a); setProof(emptyProof()); setProofImg(""); setApPayAmt(String(Math.max(0, num(a.amt) - num(a.pay1) - num(a.pay2)))); }}
                                />
                                <RowAction icon={Pencil} tone="neutral" label={S.editBtn} ariaLabel={`${S.editBtn} ${String(a.v)}`} onClick={() => {
                                  setApEdit(a);
                                  setApEditForm({
                                    v: String(a.v ?? ""), kodePembantu: String(a.kodePembantu ?? a.v ?? ""),
                                    openAwal: String(a.openAwal ?? ""), amt: String(a.amt ?? ""),
                                    due: String(a.due ?? ""), nonPpn: String(a.pph ?? "") === "Non-PPn",
                                    vessel: String(a.vessel ?? ""), item: String(a.item ?? ""),
                                  });
                                }} />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {apPager.bar}
              </div>
              <Card>
                <CardHeader title={S.cashflowTitle} subtitle={S.cashflowSub} />
                {flowMonthly.length === 0 ? (
                  <div className="p-4"><EmptyState title={S.emptyCashTitle} subtitle={S.emptyCashSub} /></div>
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
                      <Area type="monotone" dataKey="masuk" name={S.chartIn} stroke="#0d9488" strokeWidth={2.5} fill="url(#cp)" />
                      <Area type="monotone" dataKey="keluar" name={S.chartOut} stroke="#e11d48" strokeWidth={2} fill="transparent" />
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
                title={S.kasTitle}
                subtitle={S.kasSub}
                action={<><button className="btn-secondary text-xs" onClick={() => { void exportHist("kas"); }} title={S.histExported}>{S.histExport}</button><button className="btn-primary text-xs" onClick={() => setShowMut(true)}>{S.addMutasi}</button></>}
              />
              <HistFilterBar value={kasHist} onChange={setKasHist} idPrefix="kas" />
              <p className="rounded-lg bg-ocean-50 px-3 py-2 text-xs text-ocean-700">
                {S.kasLiveBadge.replace("{n}", String(kasLiveRows.reduce((s, r) => s + r.count, 0))).replace("{d}", kasAsOf).replace("{s}", kasSnap ? S.kasSnapSuffix : S.kasLiveSuffix)}
              </p>
              {kasSnap && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colKode} sortKey="kode" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colRekening} sortKey="nama" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colSaldoAwal} sortKey="awal" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colMasuk} sortKey="masuk" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colKeluar} sortKey="keluar" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colBerjalan} sortKey="berjalan" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colSaldoAkhir} sortKey="akhir" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(kasRows, kasSort, (r, k) =>
                      k === "nama" ? String(r.nama) : k === "awal" ? Number(r.awal) : k === "masuk" ? kasFlow(r.kode).masuk :
                      k === "keluar" ? kasFlow(r.kode).keluar : k === "berjalan" ? (kasSaldo[r.kode] ?? r.awal) :
                      k === "akhir" ? Number(r.akhir) : String(r.kode)).map((r) => {
                      const { masuk, keluar } = kasFlow(r.kode);
                      return (
                      <tr key={r.kode} className="hover:bg-surface">
                        <td className="td font-mono text-xs font-semibold text-navy-900">{r.kode}</td>
                        <td className="td text-xs text-steel-600">{r.nama}</td>
                        <td className="td text-xs">{fmtRupiah(r.awal)}</td>
                        <td className="td text-xs text-emerald-600">{masuk ? fmtRupiah(masuk) : "-"}</td>
                        <td className="td text-xs text-rose-600">{keluar ? fmtRupiah(keluar) : "-"}</td>
                        <td className="td text-xs font-semibold">{fmtRupiah((kasSaldo[r.kode] ?? r.awal))}</td>
                        <td className="td text-xs text-steel-500">{fmtRupiah(r.akhir)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
              <Card className="p-4">
                <CardHeader title={S.kasRecapTitle.replace("{d}", kasAsOf.slice(0, 7))} subtitle={S.kasRecapSub} />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">{S.colKode}</th><th className="th">{S.colRekening}</th><th className="th">{S.colMasuk}</th><th className="th">{S.colKeluar}</th><th className="th">{S.kasNetCol}</th><th className="th">{S.kasJCol}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {kasLiveRows.map((r) => (
                        <tr key={r.kode} className="hover:bg-surface">
                          <td className="td font-mono text-xs font-semibold text-navy-900">{r.kode}</td>
                          <td className="td text-xs text-steel-600">{r.nama}</td>
                          <td className="td text-xs text-emerald-600">{r.masuk ? fmtRupiah(r.masuk) : "-"}</td>
                          <td className="td text-xs text-rose-600">{r.keluar ? fmtRupiah(r.keluar) : "-"}</td>
                          <td className="td text-xs font-semibold">{fmtRupiah(r.masuk - r.keluar)}</td>
                          <td className="td text-xs text-steel-500">{r.count}</td>
                        </tr>
                      ))}
                      {kasLiveRows.length === 0 && (
                        <tr><td className="td text-xs italic text-steel-400" colSpan={6}>{S.kasEmptyLive}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title={S.adjTitle} subtitle={S.adjSub} />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.colTanggal} sortKey="tgl" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colUraian} sortKey="uraian" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colAkunDB} sortKey="db" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colDebit} sortKey="dbAmt" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colAkunKR} sortKey="kr" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colKredit} sortKey="krAmt" sort={kasSort} onSort={(k) => setKasSort((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(JU_PENYESUAIAN_EXCEL.filter((j) => matchHist(String(j.tgl ?? ""), kasHist)), kasSort, (j, k) =>
                        k === "uraian" ? String(j.uraian) : k === "db" ? String(j.db) : k === "dbAmt" ? Number(j.dbAmt) :
                        k === "kr" ? String(j.kr) : k === "krAmt" ? Number(j.krAmt) : String(j.tgl)).map((j, i) => (
                        <tr key={i} className="hover:bg-surface">
                          <td className="td font-mono text-xs text-steel-600">{j.tgl}</td>
                          <td className="td text-xs text-steel-600">{j.uraian}</td>
                          <td className="td font-mono text-xs">{j.db || "-"}</td>
                          <td className="td text-xs">{j.dbAmt ? fmtRupiah(j.dbAmt) : "-"}</td>
                          <td className="td font-mono text-xs">{j.kr}</td>
                          <td className="td text-xs">{fmtRupiah(j.krAmt)}</td>
                        </tr>
                      ))}
                      {JU_PENYESUAIAN_EXCEL.filter((j) => matchHist(String(j.tgl ?? ""), kasHist)).length === 0 && (
                        <tr><td className="td text-xs italic text-steel-400" colSpan={6}>{S.kasAdjEmpty}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title={S.kasMutTitle} subtitle={S.kasMutSub} />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Tanggal</th><th className="th">Dokumen</th><th className="th">Uraian</th><th className="th">DB</th><th className="th">KR</th><th className="th">Nominal</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {manJournals.filter((j) => (String(j.sumber) === "Kas" || String(j.sumber) === "Bank") && matchHist(String(j.date ?? ""), kasHist)).slice(0, 100).map((j) => (
                        <tr key={String(j.id)} className="hover:bg-surface">
                          <td className="td font-mono text-xs text-steel-600">{fmtTanggal(String(j.date ?? ""))}</td>
                          <td className="td font-mono text-xs">{String(j.dokumen ?? "-")}</td>
                          <td className="td max-w-56 truncate text-xs text-steel-600" title={String(j.uraian ?? "")}>{String(j.uraian ?? "")}</td>
                          <td className="td font-mono text-xs">{String(j.db ?? "-")}</td>
                          <td className="td font-mono text-xs">{String(j.kr ?? "-")}</td>
                          <td className="td text-xs font-semibold">{fmtRupiah(num(j.amount))}</td>
                        </tr>
                      ))}
                      {manJournals.filter((j) => (String(j.sumber) === "Kas" || String(j.sumber) === "Bank") && matchHist(String(j.date ?? ""), kasHist)).length === 0 && (
                        <tr><td className="td text-xs italic text-steel-400" colSpan={6}>{S.kasMutEmpty}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === "Jadwal Bayar" && (
            <div className="space-y-4">
              <CardHeader
                title={S.schedTitle}
                subtitle={S.schedSub}
                action={
                  <div className="flex gap-2">
                    <AsyncButton className="btn-secondary text-xs" onAction={exportJadwal}>{S.exportExcelBtn}</AsyncButton>
                    <button className="btn-primary text-xs" disabled={schedSel.length === 0} onClick={() => { setBatchProof(emptyProof()); setBatchImg(""); setShowBatch(true); }}>
                      {S.batchPay.replace("{n}", fmtJumlah(schedSel.length)).replace("{a}", fmtRupiah(schedTotal))}
                    </button>
                  </div>
                }
              />
              {schedItems.length === 0 ? (
                <EmptyState title={S.emptySchedTitle} subtitle={S.emptySchedSub} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <th className="th"><input type="checkbox" aria-label={S.selectAll} checked={schedSel.length === schedItems.length} onChange={() => setSchedSel((prev) => (prev.length === schedItems.length ? [] : schedItems.map((r) => r.key)))} /></th>
                        <SortTh label={S.colJenis} sortKey="kind" sort={jadwalSort} onSort={(k) => setJadwalSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colID} sortKey="id" sort={jadwalSort} onSort={(k) => setJadwalSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colRefProject} sortKey="ref" sort={jadwalSort} onSort={(k) => setJadwalSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colUraian} sortKey="desc" sort={jadwalSort} onSort={(k) => setJadwalSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colDue} sortKey="due" sort={jadwalSort} onSort={(k) => setJadwalSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colNilai} sortKey="amount" sort={jadwalSort} onSort={(k) => setJadwalSort((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(schedItems, jadwalSort, (r, k) =>
                        k === "kind" ? String(r.kind) : k === "id" ? String(r.id) : k === "ref" ? String(r.ref) :
                        k === "desc" ? String(r.desc) : k === "due" ? String(r.due) : Number(r.amount)).map((r) => (
                        <tr key={r.key} className="hover:bg-surface">
                          <td className="td"><input type="checkbox" aria-label={S.selectItem.replace("{a}", r.id)} checked={schedSel.includes(r.key)} onChange={() => toggleSched(r.key)} /></td>
                          <td className="td"><Badge tone={r.kind === "AP" ? "navy" : "amber"}>{r.kind}</Badge></td>
                          <td className="td font-mono text-xs font-semibold text-navy-900">{r.id}</td>
                          <td className="td font-mono text-xs text-steel-600">{r.ref}</td>
                          <td className="td text-xs text-steel-600 truncate" title={r.desc}>{r.desc}</td>
                          <td className="td text-xs text-steel-600">{fmtTanggal(r.due)}{r.age > 0 ? S.ageLate.replace("{n}", fmtJumlah(r.age)) : ""}</td>
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
                  <CardHeader title={S.invMoveTitle} subtitle={S.invMoveSub} />
                  {flowMonthly.length === 0 ? (
                    <div className="flex h-56 items-center justify-center"><EmptyState title={S.emptyMoveTitle} subtitle={S.emptyMoveSub} /></div>
                  ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={flowMonthly} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                        <Area type="monotone" dataKey="masuk" name={S.chartIssued} stroke="#0b3a63" strokeWidth={2.5} fill="#8cc9e8" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  )}
                </Card>
                <Card className="p-5">
                  <CardHeader title={S.invDocTitle} />
                  <p className="text-sm text-steel-600">{S.invDocPara}</p>
                  <p className="mt-2 text-xs text-steel-500">{S.invDocNote.replace("{a}", invPreview).replace("{b}", invForm.billingType)}</p>
                  <button className="btn-primary mt-4 w-full justify-center" onClick={() => setShowInv(true)}>{S.createInvoice}</button>
                </Card>
              </div>
              <CardHeader title={S.invListTitle} subtitle={S.invTableSub} />
              <InvStageStrip counts={invStageCounts} active={invFStatus} onPick={setInvFStatus} />
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SearchBox
                  value={invFQ}
                  onChange={setInvFQ}
                  placeholder={S.searchInvPh}
                  ariaLabel={S.searchInvAria}
                  className="min-w-52 flex-1 sm:max-w-xs"
                />
                <FilterPopover
                  activeCount={[invFStatus !== "Semua", invFBilling !== "Semua"].filter(Boolean).length}
                  initial={{ status: invFStatus, billing: invFBilling }}
                  onReset={() => { setInvFQ(""); setInvFStatus("Semua"); setInvFBilling("Semua"); }}
                  onApply={(d) => { setInvFStatus(d.status); setInvFBilling(d.billing); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.colStatus}>
                        <select className="input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {["Semua", "Draft", "Diajukan", "Disetujui", "Belum Dibayar", "Terlambat", "Lunas", "Ditolak", "Dihapusbukukan"].map((s) => <option key={s} value={s}>{s === "Semua" ? S.allStatus : s}</option>)}
                        </select>
                      </Field>
                      <Field label={S.billingTypeLabel}>
                        <select className="input w-full" value={draft.billing} onChange={(e) => setDraft({ ...draft, billing: e.target.value })}>
                          {["Semua", "Milestone", "Progres", "Uang Muka", "Retensi", "T&M", "Saldo Awal"].map((s) => <option key={s} value={s}>{s === "Semua" ? S.allTypes : s}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                </FilterPopover>
                <span className="ml-auto text-xs text-steel-400">{S.countInvoice.replace("{n}", String(filteredInvoices.length))}</span>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <HistFilterBar value={invHist} onChange={setInvHist} idPrefix="inv" />
                <span className="text-xs text-steel-400">{S.invDueNote}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colInvoice} sortKey="id" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colTipe} sortKey="tipe" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colLines} sortKey="lines" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colRetensi} sortKey="retensi" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colEfaktur} sortKey="efaktur" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colNilai} sortKey="amount" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colStatus} sortKey="status" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colCreated} sortKey="createdAt" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colUpdated} sortKey="updatedAt" sort={invSort} onSort={(k) => setInvSort((s) => toggleSort(s, k))} />
                      <th className="th">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {invPager.slice(sortedInv).map((inv) => {
                      const bukti = String(inv.paidProofUrl ?? inv.buktiUrl ?? "");
                      return (
                      <tr key={inv.id} id={notifRowId(String(inv.id))} className={rowHighlightClass({ id: String(inv.id), flash, notified: notified.has(String(inv.id)), base: "hover:bg-surface" })}>
                        <td className="td font-mono text-xs font-semibold text-navy-900">{inv.id}<span className="block font-sans text-[11px] font-normal text-steel-500">{fmtTanggal(String(inv.due ?? ""))}</span></td>
                        <td className="td text-xs text-steel-600">{String(inv.billingType ?? inv.paymentTerm ?? "-")}{inv.serviceRef ? ` · ${inv.serviceRef}` : ""}</td>
                        <td className="td text-xs text-steel-600">{S.linesCount.replace("{n}", String(Array.isArray(inv.lines) ? inv.lines.length : 1))}</td>
                        <td className="td text-xs">
                          {num(inv.retentionAmt) > 0 ? (
                            <span className="flex items-center gap-2">
                              {fmtRupiah(num(inv.retentionAmt))} <StatusBadge status={String(inv.retentionStatus ?? "Ditahan")} />
                            </span>
                          ) : <span className="text-steel-400">-</span>}
                        </td>
                        <td className="td font-mono text-[11px] text-steel-600">{inv.nsfp || inv.noFaktur ? `${inv.nsfp || "-"} / ${inv.noFaktur || "-"}` : "-"}</td>
                        <td className="td font-semibold">{fmtRupiah(invNeto(inv))}
                          {needsDirector(inv) && <span className="ml-2 inline-block"><Badge tone="amber">{S.needDirector}</Badge></span>}
                          {bukti && <span className="ml-2 inline-block"><Badge tone="teal">{S.proofBadge}</Badge></span>}
                        </td>
                        <td className="td"><StatusBadge status={String(inv.status)} />
                          {inv.directorApproved && <p className="mt-1 text-[11px] text-steel-500">Dir: {String(inv.directorName ?? "")}</p>}
                        </td>
                        <td className="td text-xs text-steel-600">{createdAtOf(inv) !== null ? fmtTanggal(createdAtOf(inv)) : <span className="text-steel-400">-</span>}</td>
                        <td className="td text-xs text-steel-600">{lastTouchedAt(inv) !== null ? fmtTanggal(lastTouchedAt(inv)) : <span className="text-steel-400">-</span>}</td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            <RowAction icon={Eye} tone="neutral" label={S.detBtn} ariaLabel={`${S.detBtn} ${String(inv.id)}`} onClick={() => setInvDetail(inv)} />
                            {/* Ubah invoice: modal edit SUDAH ada (dipakai tab
                                Piutang AR) tapi hanya TER wiring dari tabel
                                Piutang dan hanya untuk status Draft/Ditolak.
                                Tab Invoice sendiri tidak punya jalan ke sana,
                                jadi invoice salah tanggal/pelanggan di sini
                                tidak bisa dikoreksi. */}
                            <RowAction
                              icon={Pencil}
                              tone="neutral"
                              label={S.editBtn}
                              ariaLabel={`${S.editBtn} ${String(inv.id)}`}
                              onClick={() => {
                                setInvEdit(inv);
                                setInvEditForm({
                                  client: String(inv.client ?? ""),
                                  kodePembantu: String(inv.kodePembantu ?? inv.client ?? ""),
                                  due: String(inv.due ?? ""),
                                  paymentTerm: String(inv.paymentTerm ?? ""),
                                  milestoneRef: String(inv.milestoneRef ?? ""),
                                  nsfp: String(inv.nsfp ?? ""),
                                  noFaktur: String(inv.noFaktur ?? ""),
                                });
                              }}
                            />
                            {/* Hapus invoice: TIDAK ADA sama sekali di modul ini
                                walau tabel Invoice menampilkan semua invoice
                                setiap hari. Invoice yang salah input (test,
                                duplikat, salah periode) hanya bisa dibatalkan
                                lewat adjustment - tidak bisa dihapus.
                                Backend memblokir bila invoice sudah jadi acuan
                                payables.invoice / sudah Lunas. */}
                            <RowAction
                              icon={Trash2}
                              tone="danger"
                              label={S.deleteBtn}
                              ariaLabel={`${S.deleteBtn} ${String(inv.id)}`}
                              onClick={() => setDelInvoice(inv)}
                            />
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {invPager.bar}
              </div>
            </div>
          )}

          {tab === "Buku Besar" ? (() => {
            return (
            <div className="space-y-4">
              <CardHeader
                title={S.bbTitle}
                subtitle={S.bbSub}
                action={<button className="btn-secondary text-xs" onClick={() => { void exportHist("bb"); }} title={S.histExported}>{S.histExport}</button>}
              />
              <HistFilterBar value={bbHist} onChange={setBbHist} idPrefix="bb" />
              <p className="rounded-lg bg-ocean-50 px-3 py-2 text-xs text-ocean-700">
                {S.bbLiveBadge.replace("{n}", String(bbLive.reduce((s, r) => s + r.n, 0))).replace("{d}", bbAsOf).replace("{s}", bbSnap ? S.bbSnapSuffix : S.bbLiveSuffix)}
              </p>
              {bbSnap && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="p-4"><p className="text-xs text-steel-500">{S.bbRevTitle}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.totalPendapatan)}</p><p className="mt-1 text-[11px] text-steel-400">{S.bbRevNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.bbCostTitle}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.totalBebanPokok)}</p><p className="mt-1 text-[11px] text-steel-400">{S.bbCostNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.kpiLabaNet}</p><p className="mt-1 text-lg font-bold text-emerald-600">{fmtRupiah(LAPORAN_EXCEL.labaBersih)}</p><p className="mt-1 text-[11px] text-steel-400">{S.bbNetNote} · {S.auditTag}</p></Card>
              </div>
              )}
              {bbSnap && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colKode} sortKey="kode" sort={bbSort} onSort={(k) => setBbSort((s) => toggleSort(s, k))} rowSpan={2} />
                      <SortTh label={S.colNamaAkun} sortKey="nama" sort={bbSort} onSort={(k) => setBbSort((s) => toggleSort(s, k))} rowSpan={2} />
                      <SortTh label="D/K" sortKey="dk" sort={bbSort} onSort={(k) => setBbSort((s) => toggleSort(s, k))} rowSpan={2} />
                      <th className="th" colSpan={2}>{S.bbTrial}</th><th className="th" colSpan={2}>{S.bbPL}</th><th className="th" colSpan={2}>{S.bbBalance}</th>
                    </tr>
                    <tr><th className="th">{S.colDebit}</th><th className="th">{S.colKredit}</th><th className="th">{S.colDebit}</th><th className="th">{S.colKredit}</th><th className="th" colSpan={2}>{S.bbPeriodCol}</th>
                    </tr>
                    <tr><th className="th">{S.colDebit}</th><th className="th">{S.colKredit}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(coaRows.filter((c) => String(c.dk) !== "-"), bbSort, (c, k) =>
                      k === "nama" ? String(c.nama) : k === "dk" ? String(c.dk) : String(c.kode)).map((c) => {
                      const kode = String(c.kode);
                      const isLR = String(c.nrlr) === "LR";
                      const d = nlOf(kode).d;
                      const k = nlOf(kode).k;
                      return (
                      <tr key={kode} className="hover:bg-surface">
                        <td className="td font-mono text-xs font-semibold text-navy-900">{kode}</td>
                        <td className="td text-xs text-steel-600">{String(c.nama)}</td>
                        <td className="td text-xs text-steel-500">{String(c.dk)}</td>
                        <td className="td text-xs">{d ? fmtRupiah(d) : "-"}</td>
                        <td className="td text-xs">{k ? fmtRupiah(k) : "-"}</td>
                        <td className="td text-xs">{isLR && d ? fmtRupiah(d) : "-"}</td>
                        <td className="td text-xs">{isLR && k ? fmtRupiah(k) : "-"}</td>
                        <td className="td text-xs">{!isLR && d ? fmtRupiah(d) : "-"}</td>
                        <td className="td text-xs">{!isLR && k ? fmtRupiah(k) : "-"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
              <Card className="p-4">
                <CardHeader title={S.bbLiveTitle.replace("{d}", bbAsOf.slice(0, 7))} subtitle={S.bbLiveSub.replace("{a}", fmtMiliar(bbDAll)).replace("{b}", fmtMiliar(bbKAll)).replace("{c}", Math.abs(bbDAll - bbKAll) < 1 ? S.bbBalanced : S.bbUnbalanced)} />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">{S.colKode}</th><th className="th">{S.colNamaAkun}</th><th className="th">{S.bbCumDebit}</th><th className="th">{S.bbCumKredit}</th><th className="th">{S.bbSaldoCol}</th><th className="th" colSpan={2}>{S.bbPeriodCol}</th><th className="th">{S.bbRowsCol}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {bbLive.map((r) => (
                        <tr key={r.kode} className="hover:bg-surface">
                          <td className="td font-mono text-xs font-semibold text-navy-900">{r.kode}</td>
                          <td className="td text-xs text-steel-600">{r.nama}</td>
                          <td className="td text-xs">{fmtRupiah(r.dAll)}</td>
                          <td className="td text-xs">{fmtRupiah(r.kAll)}</td>
                          <td className="td text-xs font-semibold">{fmtRupiah(r.dAll - r.kAll)}</td>
                          <td className="td text-xs">{r.d ? fmtRupiah(r.d) : "-"}</td>
                          <td className="td text-xs">{r.k ? fmtRupiah(r.k) : "-"}</td>
                          <td className="td text-xs text-steel-500">{r.n}</td>
                        </tr>
                      ))}
                      {bbLive.length === 0 && (
                        <tr><td className="td text-xs italic text-steel-400" colSpan={8}>{S.bbEmptyLive}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-steel-500">{S.bbNote}{bbSnap ? S.bbSnapNote : ""}</p>
              <Card className="p-4">
                <CardHeader title={S.bbVoucherTitle.replace("{d}", bbAsOf.slice(0, 7))} subtitle={S.bbVoucherSub} />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Tanggal</th><th className="th">Dokumen</th><th className="th">Uraian</th><th className="th">DB</th><th className="th">KR</th><th className="th">Nominal</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {manJournals.filter((j) => matchHist(String(j.date ?? ""), bbHist)).slice(0, 100).map((j) => (
                        <tr key={String(j.id)} className="hover:bg-surface">
                          <td className="td font-mono text-xs text-steel-600">{fmtTanggal(String(j.date ?? ""))}</td>
                          <td className="td font-mono text-xs">{String(j.dokumen ?? "-")}</td>
                          <td className="td max-w-56 truncate text-xs text-steel-600" title={String(j.uraian ?? "")}>{String(j.uraian ?? "")}</td>
                          <td className="td font-mono text-xs">{String(j.db ?? "-")}</td>
                          <td className="td font-mono text-xs">{String(j.kr ?? "-")}</td>
                          <td className="td text-xs font-semibold">{fmtRupiah(num(j.amount))}</td>
                        </tr>
                      ))}
                      {manJournals.filter((j) => matchHist(String(j.date ?? ""), bbHist)).length === 0 && (
                        <tr><td className="td text-xs italic text-steel-400" colSpan={6}>{S.bbEmptyLive}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
            );
          })() : null}

          {tab === "Laba Rugi" ? (() => {
            return (
            <div className="space-y-4">
              <CardHeader
                title={S.lrTitle}
                subtitle={S.lrSub}
                action={<button className="btn-secondary text-xs" onClick={() => { void exportHist("lr"); }} title={S.histExported}>{S.histExport}</button>}
              />
              <HistFilterBar value={lrHist} onChange={setLrHist} idPrefix="lr" />
              <p className="rounded-lg bg-ocean-50 px-3 py-2 text-xs text-ocean-700">
                {S.lrLiveBadge.replace("{n}", String(lrLive.n)).replace("{d}", lrAsOf).replace("{s}", lrSnap ? S.lrSnapSuffix : S.lrLiveSuffix)}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-steel-500">{S.bbRevTitle} {S.lrLiveTag}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrLive.revenue)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrRevHint}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.lrCostTitle} {S.lrLiveTag}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrLive.costProj)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrCostHint}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.lrOpexTitle} {S.lrLiveTag}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrLive.salary + lrLive.writeoff)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrOpexHint}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.kpiLabaNet} {S.lrLiveTag}</p><p className="mt-1 text-lg font-bold text-emerald-600">{fmtRupiah(lrLive.laba)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrPeriodCount.replace("{n}", String(lrLive.n))}</p></Card>
              </div>
              {lrSnap && (
              <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-steel-500">{S.bbRevTitle}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrRows.pend)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrRevNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.lrCostTitle}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrRows.bebanPokok)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrCostNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.lrOpexTitle}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(lrRows.biayaUsaha)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrOpexNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.kpiLabaNet}</p><p className="mt-1 text-lg font-bold text-emerald-600">{fmtRupiah(lrRows.pend - lrRows.bebanPokok - lrRows.biayaUsaha + lrRows.lainMasuk - lrRows.lainKeluar)}</p><p className="mt-1 text-[11px] text-steel-400">{S.lrOtherNet.replace("{a}", fmtRupiah(lrRows.lainMasuk - lrRows.lainKeluar))} · {S.auditTag}</p></Card>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colNoAkun} sortKey="kode" sort={lrSort} onSort={(k) => setLrSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colPos} sortKey="pos" sort={lrSort} onSort={(k) => setLrSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colNilai} sortKey="nilai" sort={lrSort} onSort={(k) => setLrSort((s) => toggleSort(s, k))} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(lrRows.rows, lrSort, (r, k) => k === "pos" ? String(r.pos) : k === "nilai" ? Number(r.nilai) : String(r.kode)).map((r) => (
                      <tr key={r.kode} className="hover:bg-surface">
                        <td className="td font-mono text-xs font-semibold text-navy-900">{r.kode}</td>
                        <td className="td text-xs text-steel-600">{r.pos}</td>
                        <td className="td text-xs font-semibold">{fmtRupiah(r.nilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
              )}
              <Card className="p-4">
                <CardHeader title={S.lrHistTitle} subtitle={S.lrHistSub} />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">Periode</th><th className="th">Pendapatan</th><th className="th">Beban Proyek</th><th className="th">Gaji</th><th className="th">Laba</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {plMonthly.filter((p) => matchHistPeriod(p.period, lrHist)).map((p) => (
                        <tr key={p.period} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{p.period}</td>
                          <td className="td">{fmtMiliar(p.revenue)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.costProj)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.salary)}</td>
                          <td className="td font-semibold text-emerald-600">{fmtMiliar(p.laba)}</td>
                        </tr>
                      ))}
                      {plMonthly.filter((p) => matchHistPeriod(p.period, lrHist)).length === 0 && (
                        <tr><td className="td text-xs italic text-steel-400" colSpan={5}>{S.lrEmptyHist}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
            );
          })() : null}

          {tab === "Project P&L" && (
            <div className="space-y-5">
              <CardHeader
                title={S.plTitle}
                subtitle={S.plSub}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Field label={S.profitProject}>
                  <select className="input" value={profitPid} onChange={(e) => { setProfitProjectId(e.target.value); const p = projectById[e.target.value]; setOverheadPct(String(p?.overheadPct ?? 5)); }}>
                    {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
                  </select>
                </Field>
                <Field label={S.cardSearchPh}>
                  <input className="input" value={plQ} onChange={(e) => setPlQ(e.target.value)} placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} />
                </Field>
              </div>
              {profitCalc && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label={S.revPid.replace("{a}", profitPid)} value={fmtMiliar(profitCalc.revenue)} hint={S.invLunasHint} chip="teal" />
                  <KpiCard label={S.costPid.replace("{a}", profitPid)} value={fmtMiliar(profitCalc.cost)} hint={S.costBreakdown.replace("{a}", fmtMiliar(profitCalc.costPayable)).replace("{b}", fmtMiliar(profitCalc.costTermin)).replace("{c}", fmtMiliar(profitCalc.costPayroll))} chip="navy" />
                  <KpiCard label={S.marginVal.replace("{a}", profitPid)} value={fmtMiliar(profitCalc.margin)} delta={S.marginDelta.replace("{n}", String(profitCalc.marginPct))} deltaDirection={profitCalc.margin >= 0 ? "up" : "down"} chip="violet" />
                  <KpiCard label={S.unallocatedCard} value={fmtMiliar(profitCalc.unallocPayable + profitCalc.unallocTermin + profitCalc.unallocPayroll)} hint={S.costBreakdown.replace("{a}", fmtMiliar(profitCalc.unallocPayable)).replace("{b}", fmtMiliar(profitCalc.unallocTermin)).replace("{c}", fmtMiliar(profitCalc.unallocPayroll))} chip="amber" />
                </div>
              )}
              <div className="grid max-h-80 grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-3">
                {projectsVisible.filter((p) => rowMatches(p, plQ, ["id", "vessel", "client", "status"])).map((p) => {
                  const rev = (data.invoices ?? []).filter((i) => i.project === p.id).reduce((s, i) => s + invNeto(i), 0);
                  const margin = rev - num(p.actual);
                  return (
                    <Card key={p.id} className="card-hover p-4">
                      <p className="text-xs text-steel-500 font-mono truncate" title={`${p.id} · ${p.vessel}`}>{p.id} · {p.vessel}{p.hasAdvance ? S.advanceTag : ""}</p>
                      <p className="mt-1 text-sm font-semibold text-navy-900">{S.marginVal.replace("{a}", fmtMiliar(margin))}</p>
                      <div className="mt-2 text-xs text-steel-500">
                        <p>{S.billedCost.replace("{a}", fmtMiliar(rev)).replace("{b}", fmtMiliar(num(p.actual)))}</p>
                        <p className={`mt-1 font-medium ${margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {S.marginPct.replace("{n}", String(rev ? Math.round((margin / rev) * 100) : 0))}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <CardHeader title={S.allocTitle2} subtitle={S.allocSub2} />
                <div className="px-5 pb-2"><SearchBox value={allocQ} onChange={setAllocQ} placeholder={S.cardSearchPh} ariaLabel={S.cardSearchPh} /></div>
                <div className="max-h-80 overflow-y-auto">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.colPayroll} sortKey="id" sort={alokasiSort} onSort={(k) => setAlokasiSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colKaryawan} sortKey="emp" sort={alokasiSort} onSort={(k) => setAlokasiSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colPeriode} sortKey="period" sort={alokasiSort} onSort={(k) => setAlokasiSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colNet} sortKey="net" sort={alokasiSort} onSort={(k) => setAlokasiSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colAlokasi} sortKey="alloc" sort={alokasiSort} onSort={(k) => setAlokasiSort((s) => toggleSort(s, k))} />
                        <th className="th">{S.actionTh}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows((data.payroll ?? []).filter((p) => p.status === "Dibayar").filter((p) => rowMatches(p, allocQ, ["id", "employeeId", "period", "allocProject", "status"])), alokasiSort, (p, k) =>
                        k === "emp" ? String(p.employeeId ?? "") : k === "period" ? String(p.period ?? "") :
                        k === "net" ? payNet(p) :
                        k === "alloc" ? String(p.allocProject ?? "") : String(p.id)).map((p) => (
                        <tr key={p.id} className="hover:bg-surface">
                          <td className="td font-mono text-xs font-semibold text-navy-900">{p.id}</td>
                          <td className="td font-mono text-xs text-steel-600">{String(p.employeeId ?? "")}</td>
                          <td className="td text-xs text-steel-600">{String(p.period ?? "")}</td>
                          <td className="td text-xs font-semibold">{fmtRupiah(payNet(p))}</td>
                          <td className="td text-xs text-steel-600">{p.allocProject ? `${p.allocProject} · ${p.allocPct}%` : S.unallocatedCell}</td>
                          <td className="td"><RowAction icon={Boxes} tone="primary" label={S.colAlokasi} ariaLabel={`${S.colAlokasi} ${String(p.id)}`} onClick={() => { setAllocTarget(p); setAllocForm({ project: String(p.allocProject ?? profitPid), pct: String(p.allocPct ?? 100) }); }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </Card>
              {cbs && (
                <Card>
                  <CardHeader
                    title={S.cbsTitle.replace("{a}", profitPid)}
                    subtitle={S.cbsSub}
                    action={
                      <div className="flex items-end gap-2">
                        <Field label={S.overheadPctLabel}>
                          <NumInput min={0} max={100} className="input w-24" value={overheadPct} onChange={(e) => setOverheadPct(e.target.value)} />
                        </Field>
                        <AsyncButton className="btn-secondary text-xs" onAction={saveOverhead}>{S.saveBtn}</AsyncButton>
                      </div>
                    }
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr><th className="th">{S.colElemen}</th><th className="th">{S.colNilai}</th><th className="th">{S.colCatatan}</th></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">{S.cbsMaterial}</td><td className="td font-semibold">{fmtRupiah(cbs.material)}</td><td className="td text-xs text-steel-500">{S.cbsMaterialNote}</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">{S.cbsLabor}</td><td className="td font-semibold">{fmtRupiah(cbs.labor)}</td><td className="td text-xs text-steel-500">{S.cbsLaborNote}</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">{S.cbsSubcon}</td><td className="td font-semibold">{fmtRupiah(cbs.subcon)}</td><td className="td text-xs text-steel-500">{S.cbsSubconNote}</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">{S.cbsEquipment}</td><td className="td font-semibold">{fmtRupiah(cbs.equipment)}</td><td className="td text-xs text-steel-500">{S.cbsEquipmentNote}</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-medium text-navy-900">{S.overheadRow.replace("{a}", fmtJumlah(cbs.ohPct))}</td><td className="td font-semibold">{fmtRupiah(cbs.overhead)}</td><td className="td text-xs text-steel-500">{S.cbsOverheadManual}</td></tr>
                        <tr className="hover:bg-surface"><td className="td font-bold text-navy-900">{S.totalCost}</td><td className="td font-bold text-navy-900">{fmtRupiah(cbs.total)}</td><td className="td text-xs text-steel-500">{S.vsBudget.replace("{a}", fmtRupiah(cbs.budget)).replace("{b}", fmtRupiah(cbs.vsBudget))}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 pb-5">
                    <ProgressBar value={cbs.budget ? Math.round((cbs.total / cbs.budget) * 100) : 0} tone={cbs.budget && cbs.total > cbs.budget ? "red" : "navy"} showLabel />
                  </div>
                </Card>
              )}
              <Card>
                <CardHeader title={S.plMonthlyTitle} subtitle={S.plMonthlySub} />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.colPeriode} sortKey="period" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colPendapatan} sortKey="revenue" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colBebanProyek} sortKey="costProj" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colBebanGaji} sortKey="salary" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colHapusBuku} sortKey="writeoff" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colLaba} sortKey="laba" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(plMonthly, pajakSort, (p, k) =>
                        k === "revenue" ? Number(p.revenue) : k === "costProj" ? Number(p.costProj) : k === "salary" ? Number(p.salary) :
                        k === "writeoff" ? Number(p.writeoff) : k === "laba" ? Number(p.laba) : String(p.period)).map((p) => (
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
                        <tr><td className="td text-xs text-steel-400" colSpan={6}>{S.plEmpty}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {ebitdaReal.length > 0 && (
                <Card className="p-5" data-export-hide>
                  <CardHeader
                    title="EBITDA 12 bulan"
                    subtitle="Pendapatan - biaya proyek - gaji - hapus buku, dari invoice/payable/payroll nyata"
                    action={<Badge tone={ebitdaReal[ebitdaReal.length - 1].margin !== null && ebitdaReal[ebitdaReal.length - 1].margin! >= 0 ? "green" : "rose"}>
                      {ebitdaReal[ebitdaReal.length - 1].margin !== null
                        ? `margin ${ebitdaReal[ebitdaReal.length - 1].margin}%`
                        : "-"}
                    </Badge>}
                  />
                  <div className="mt-3 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={ebitdaReal} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="ebitdaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0d9488" stopOpacity={0.32} />
                            <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} jt`} />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="revenue" name="Pendapatan" fill="#0b3a63" radius={[4, 4, 0, 0]} isAnimationActive />
                        <Area type="monotone" dataKey="ebitda" name="EBITDA" stroke="#0d9488" strokeWidth={2.5} fill="url(#ebitdaGrad)" dot={{ r: 3 }} isAnimationActive />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-[11px] text-steel-400">
                    {locale === "en"
                      ? "Note: D&A and interest are not available in this module, so this is EBITDA before depreciation, not a full income-statement EBITDA."
                      : "Catatan: D&A dan bunga tidak tersedia di modul ini, jadi ini EBITDA sebelum penyusutan - bukan laba bersih final."}
                  </p>
                </Card>
              )}
            </div>
          )}

          {tab === "Neraca" ? (() => {
            return (
            <div className="space-y-4">
              <CardHeader title={S.nrTitle} subtitle={S.nrSub.replace("{a}", LAPORAN_EXCEL.neracaTotal.toLocaleString("id-ID"))} action={<button className="btn-secondary text-xs" onClick={() => { void exportHist("nr"); }} title={S.histExported}>{S.histExport}</button>} />
              <HistFilterBar value={nrHist} onChange={setNrHist} idPrefix="nr" />
              <p className="rounded-lg bg-ocean-50 px-3 py-2 text-xs text-ocean-700">
                {S.nrLiveBadge.replace("{a}", nrAsOf).replace("{b}", fmtMiliar(hutLiveTotal)).replace("{c}", String(hutLive.length)).replace("{d}", fmtMiliar(piuLiveTotal)).replace("{e}", String(piuLive.length)).replace("{f}", fmtRupiah(nrLabaLive)).replace("{g}", nrSnap ? S.nrSnapSuffix : S.nrLiveSuffix)}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrApLive}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(hutLiveTotal)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrVendorCount.replace("{n}", String(hutLive.length)).replace("{d}", nrAsOf)}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrArLive}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(piuLiveTotal)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrCustCount.replace("{n}", String(piuLive.length)).replace("{d}", nrAsOf)}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrProfitLive}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(nrLabaLive)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrProfitHint}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrCloseTitle} ({S.auditTag})</p><p className="mt-1 text-lg font-bold text-emerald-600">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAkhir)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrCloseNote.replace("{a}", fmtRupiah(LAPORAN_EXCEL.labaBerjalan))} · 2026-08</p></Card>
              </div>
              {nrSnap && (
              <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrCurrentAsset}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.aktivaLancar)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrCurrentNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrFixedBook}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.bukuAktivaTetap)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrFixedNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrOpenTitle}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAwal)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrOpenNote} · {S.auditTag}</p></Card>
                <Card className="p-4"><p className="text-xs text-steel-500">{S.nrCloseTitle}</p><p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAkhir)}</p><p className="mt-1 text-[11px] text-steel-400">{S.nrCloseNote.replace("{a}", fmtRupiah(LAPORAN_EXCEL.labaBerjalan))} · {S.auditTag}</p></Card>
              </div>
              <Card className="p-4">
                <CardHeader title={S.reTitle} subtitle={S.reSub} />
                <div className="overflow-x-auto px-1 pb-3">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><th className="th">{S.colNoAkun}</th><th className="th">{S.colPos}</th><th className="th">{S.colNilai}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      <tr className="hover:bg-surface"><td className="td font-mono text-xs font-semibold text-navy-900">3-200</td><td className="td text-xs text-steel-600">{S.reTitle} ({S.auditTag})</td><td className="td text-xs font-semibold">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAwal)}</td></tr>
                      <tr className="hover:bg-surface"><td className="td font-mono text-xs text-steel-400">live</td><td className="td text-xs text-steel-600">{S.reCurrentRow} {S.nrDocAsOf.replace("{d}", nrAsOf)}</td><td className="td text-xs font-semibold">{fmtRupiah(nrLabaLive)}</td></tr>
                      <tr className="hover:bg-surface"><td className="td font-mono text-xs text-steel-400">-</td><td className="td text-xs font-bold text-navy-900">{S.reTotalRow} ({S.auditTag})</td><td className="td text-xs font-bold text-navy-900">{fmtRupiah(LAPORAN_EXCEL.labaDitahanAkhir)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </Card>
              </>
              )}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <CardHeader title={S.nrApLiveTitle.replace("{a}", S.subHutangTitle).replace("{d}", nrAsOf)} subtitle={S.nrApLiveSub} />
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10"><tr>
                        <SortTh label={S.colVendor} sortKey="v" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.nrDocCol} sortKey="count" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.nrOutstandingCol} sortKey="total" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                      </tr></thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(hutLive, nrSort, (h, k) => k === "count" ? Number(h.count) : k === "total" ? Number(h.total) : String(h.v)).map((h) => (
                          <tr key={h.v} className="hover:bg-surface">
                            <td className="td text-xs font-medium text-navy-900">{h.v}</td>
                            <td className="td text-xs text-steel-600">{h.count} AP</td>
                            <td className="td text-xs font-semibold">{fmtRupiah(h.total)}</td>
                          </tr>
                        ))}
                        {hutLive.length === 0 && (
                          <tr><td className="td text-xs italic text-steel-400" colSpan={3}>{S.nrApEmpty.replace("{d}", nrAsOf)}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card className="p-4">
                  <CardHeader title={S.nrArLiveTitle.replace("{a}", S.subPiutangTitle).replace("{d}", nrAsOf)} subtitle={S.nrArLiveSub} />
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10"><tr>
                        <SortTh label={S.colCustomer} sortKey="c" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.nrDocCol} sortKey="count" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.nrOutstandingCol} sortKey="total" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                      </tr></thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(piuLive, nrSort, (p, k) => k === "count" ? Number(p.count) : k === "total" ? Number(p.total) : String(p.c)).map((p) => (
                          <tr key={p.c} className="hover:bg-surface">
                            <td className="td text-xs font-medium text-navy-900">{p.c}</td>
                            <td className="td text-xs text-steel-600">{p.count} INV</td>
                            <td className="td text-xs font-semibold">{fmtRupiah(p.total)}</td>
                          </tr>
                        ))}
                        {piuLive.length === 0 && (
                          <tr><td className="td text-xs italic text-steel-400" colSpan={3}>{S.nrArEmpty.replace("{d}", nrAsOf)}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
              {nrSnap && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <CardHeader title={S.nrApAuditTitle.replace("{a}", S.subHutangTitle)} subtitle={S.subHutangSub} />
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10"><tr>
                        <SortTh label={S.colVendor} sortKey="v" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colAwal} sortKey="awal" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colAkhir} sortKey="akhir" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <th className="th">PPn</th>
                      </tr></thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(HUTANG_EXCEL, nrSort, (h, k) => k === "awal" ? Number(h.awal) : k === "akhir" ? Number(h.akhir) : String(h.v)).map((h) => (
                          <tr key={h.v} className="hover:bg-surface">
                            <td className="td text-xs font-medium text-navy-900">{h.v}</td>
                            <td className="td text-xs text-steel-600">{h.awal ? fmtRupiah(h.awal) : "-"}</td>
                            <td className="td text-xs font-semibold">{h.akhir ? fmtRupiah(h.akhir) : "-"}</td>
                            <td className="td text-xs">{h.nonPpn ? <Badge tone="amber">Non-PPn</Badge> : <span className="text-steel-400">PPn</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card className="p-4">
                  <CardHeader title={S.nrArAuditTitle.replace("{a}", S.subPiutangTitle)} subtitle={S.subPiutangSub} />
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10"><tr>
                        <SortTh label={S.colCustomer} sortKey="c" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colAwal} sortKey="awal" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colAkhir} sortKey="akhir" sort={nrSort} onSort={(k) => setNrSort((s) => toggleSort(s, k))} />
                        <th className="th">PPn</th>
                      </tr></thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(PIUTANG_EXCEL, nrSort, (p, k) => k === "awal" ? Number(p.awal) : k === "akhir" ? Number(p.akhir) : String(p.c)).map((p) => (
                          <tr key={p.c} className="hover:bg-surface">
                            <td className="td text-xs font-medium text-navy-900">{p.c}</td>
                            <td className="td text-xs text-steel-600">{p.awal ? fmtRupiah(p.awal) : "-"}</td>
                            <td className="td text-xs font-semibold">{p.akhir ? fmtRupiah(p.akhir) : "-"}</td>
                            <td className="td text-xs">{p.nonPpn ? <Badge tone="amber">Non-PPn</Badge> : <span className="text-steel-400">PPn</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
              )}
            </div>
            );
          })() : null}

          {tab === "Pajak" && (
            <div className="space-y-4">
              <CardHeader
                title={S.taxTitle}
                subtitle={S.taxSub.replace("{a}", String(taxCalc.ppnRate)).replace("{b}", String(taxCalc.pphRate))}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Field label={S.colPeriode}>
                  <select className="input" value={activeTaxId} onChange={(e) => setTaxId(e.target.value)}>
                    {taxPeriods.map((t) => <option key={t.id} value={t.id}>{t.period} · {t.status}</option>)}
                  </select>
                </Field>
                <Field label={S.newPeriodLabel} hint={S.taxDateHint}>
                  <input type="date" className="input font-mono" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} aria-label={S.newPeriodLabel} />
                </Field>
                <AsyncButton className="btn-secondary text-xs" onAction={async () => {
                    const raw = newPeriod.trim();
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) { toast(S.periodFormat, "info"); return; }
                    const p = raw.slice(0, 7);
                    /* Validasi RENTANG bulan: regex saja menerima "2026-00"/"2026-13".
                       Periode seperti itu tak akan pernah cocok dengan paidAt mana pun
                       sehingga seluruh tab Pajak diam-diam menampilkan nol. */
                    const mm = Number(p.slice(5, 7));
                    if (mm < 1 || mm > 12) { toast(S.periodFormat, "info"); return; }
                    if (taxPeriods.some((t) => t.period === p)) { toast(S.periodExists, "info"); return; }
                    try {
                    const created = await add("taxPeriods", { period: p, ppnKeluar: 0, ppnMasuk: 0, pph23: 0, pph21: 0, status: "Draft" }, { action: "membuat periode pajak", module: "Pajak" });
                    setTaxId(created.id);
                    setNewPeriod("");
                    toast(S.periodCreated.replace("{a}", String(created.period)));
                    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
                  }}>{S.newPeriodBtn}</AsyncButton>
                {activeTax && !taxLocked && (
                  <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelTax(activeTax)}>{locale === "en" ? "Delete period" : "Hapus periode"}</button>
                )}
                {activeTax && taxLocked && (
                  <span className="self-center text-xs text-steel-400" title={locale === "en" ? "Already filed as SPT" : "Sudah diajukan sebagai SPT"}>
                    {locale === "en" ? "Reported - locked" : "Lapor - terkunci"}
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <AsyncButton className="btn-secondary text-xs" onAction={exportEfaktur}>{S.exportEfaktur}</AsyncButton>
                  <AsyncButton className="btn-primary text-xs" onAction={exportSptPdf}>{S.exportSptPdf}</AsyncButton>
                <AsyncButton className="btn-secondary text-xs" onAction={exportSpt}>{S.exportSpt}</AsyncButton>
                  <AsyncButton className="btn-primary text-xs" disabled={taxLocked} onAction={async () => {
                    if (!activeTax) { toast(S.pickPeriodFirst, "info"); return; }
                    setConfirmLapor(true);
                  }}>
                    {taxLocked ? S.alreadyReported : S.markReported}
                  </AsyncButton>
                </div>
              </div>
              {activeTax && <SptFilingForm
                  period={activeTax}
                  locked={taxLocked}
                  onSave={async (patch) => {
                    try {
                      await update("taxPeriods", activeTax.id, patch);
                      toast(S.sptSaved);
                    } catch (e) {
                      toast(e instanceof Error ? e.message : S.saveFail, "info");
                    }
                  }}
                />}
              {!activeTax ? (
                <EmptyState title={S.emptyTaxTitle} subtitle={S.emptyTaxSub} />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: S.ppnOut, value: fmtRupiah(taxShown.ppnKeluar), hint: S.ppnOutHint.replace("{a}", String(taxCalc.ppnRate)).replace("{b}", fmtRupiah(taxCalc.invBase)) },
                    { label: S.ppnIn, value: fmtRupiah(taxShown.ppnMasuk), hint: S.ppnOutHint.replace("{a}", String(taxCalc.ppnRate)).replace("{b}", fmtRupiah(taxCalc.apBase)) },
                    { label: S.pph23, value: fmtRupiah(taxShown.pph23), hint: S.pph23Hint.replace("{a}", String(taxCalc.pphRate)) },
                    { label: S.pph21, value: fmtRupiah(taxShown.pph21), hint: S.payrollHint.replace("{a}", activePeriod) },
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
                  {S.taxOwed.replace("{a}", activePeriod || "-").replace("{b}", fmtRupiah(taxShown.ppnKeluar - taxShown.ppnMasuk))}
                  {taxLocked ? S.taxLockedNote : S.taxLiveNote}
                  {" "}{S.reportedOn.replace("{a}", fmtTanggal(activeTax?.reportedAt))}
                </p>
                <p className="mt-1 text-xs text-steel-500">{S.efakturNote.replace("{a}", activePeriod || "-").replace("{n}", fmtJumlah(efakturRows.length))}</p>
              </Card>
            </div>
          )}

          {tab === "Aset" && (
            <div className="space-y-4">
              <CardHeader
                title={S.assetTitle}
                subtitle={S.assetSub}
                action={<button className="btn-primary text-xs" onClick={() => { setAstEdit(null); setAstForm({ nama: "", kelompok: "2", bulan: "", tahun: "", nilai: "", metode: "GL" }); setShowAst(true); }}>{S.addAset}</button>}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colNo} sortKey="no" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colNamaHarta} sortKey="nama" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colKel} sortKey="kel" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colBulan} sortKey="bulan" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colTahun} sortKey="tahun" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colNilaiPerolehan} sortKey="nilai" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colMetode} sortKey="metode" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colSusut} sortKey="susut" sort={asetSort} onSort={(k) => setAsetSort((s) => toggleSort(s, k))} />
                      <th className="th">{S.colSusutBln}</th>
                      <th className="th">{S.colAkunBeban}</th>
                      <th className="th">{S.colAkunAkum}</th>
                      <th className="th">{S.actionTh}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(assetRows.map((a, i) => ({ a, i })), asetSort, ({ a }, k) =>
                      k === "nama" ? String(a.nama ?? "") : k === "kel" ? String(a.kelompok ?? "") : k === "bulan" ? String(a.bulan ?? "") :
                      k === "tahun" ? String(a.tahun ?? "") : k === "nilai" ? num(a.nilai) : k === "metode" ? String(a.metode ?? "") :
                      k === "susut" ? num(a.susutTahun) : String(a.id ?? "")).map(({ a, i }) => {
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
                            <div className="flex gap-1">
                              <RowAction icon={Pencil} tone="neutral" label={S.editBtn} ariaLabel={`${S.editBtn} ${String(a.id ?? a.nama ?? "")}`} onClick={() => openAstEdit(a)} />
                              <RowAction icon={Trash2} tone="danger" label={S.deleteBtn} ariaLabel={`${S.deleteBtn} ${String(a.id ?? a.nama ?? "")}`} onClick={() => setDelAsset(a)} />
                            </div>
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
                title={S.juTitle}
                subtitle={S.juSub}
                action={<button className="btn-primary text-xs" onClick={() => setShowJu(true)}>{S.addJurnal}</button>}
              />
              <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
                <HistFilterBar value={juHist} onChange={setJuHist} idPrefix="ju" />
                <span className="text-xs text-steel-400">{S.juCountFilt.replace("{n}", String(sortedJu.length))}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr>
                      <SortTh label={S.colTanggal} sortKey="date" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colKodePembantu} sortKey="kode" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colDokumen} sortKey="dok" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colUraian} sortKey="uraian" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colAkunDB} sortKey="db" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colAkunKR} sortKey="kr" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colNominal} sortKey="amount" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colSumber} sortKey="sumber" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <SortTh label={S.colStatus} sortKey="status" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                      <th className="th">{S.juAttachCol}</th>
                      <th className="th">{S.actionTh}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {juPager.slice(sortedJu).map((j) => (
                      <tr key={String(j.id)} className="hover:bg-surface">
                        <td className="td text-xs text-steel-600">{fmtTanggal(String(j.date ?? ""))}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(j.kodePembantu || "-")}</td>
                        <td className="td font-mono text-xs text-steel-600">{String(j.dokumen ?? "-")}</td>
                        <td className="td max-w-56 truncate text-xs text-steel-600" title={String(j.uraian ?? "")}>{String(j.uraian ?? "")}</td>
                        <td className="td font-mono text-xs">{String(j.db || "-")}</td>
                        <td className="td font-mono text-xs">{String(j.kr)}</td>
                        <td className="td text-xs font-semibold">{fmtRupiah(num(j.amount))}</td>
                        <td className="td text-xs text-steel-500">{String(j.sumber ?? "JU")}</td>
                        <td className="td"><StatusBadge status={String(j.status ?? "Posted")} /></td>
                        <td className="td">
                          {String(j.lampiranUrl ?? j.buktiUrl ?? "") ? (
                            <button type="button" onClick={() => setJuViewer(j)} className="block overflow-hidden rounded-lg border border-steel-200" title="Lihat lampiran">
                              <SecureImg src={String(j.lampiranUrl ?? j.buktiUrl)} alt={String(j.dokumen ?? j.id)} className="h-10 w-14 object-cover" />
                            </button>
                          ) : <span className="text-xs text-steel-300">-</span>}
                        </td>
                        <td className="td">
                          {String(j.status) !== "Void" && (
                            <RowAction icon={Ban} tone="danger" label={S.voidBtn} ariaLabel={`${S.voidBtn} ${String(j.id)}`} disabled={busy.isBusy(`voidJu-${j.id}`)} onClick={() => void busy.run(`voidJu-${j.id}`, async () => { try { await update("journals", String(j.id), { status: "Void" }); log("mem-void jurnal", String(j.id), "Keuangan"); toast(S.voided.replace("{a}", String(j.id))); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } })} />
                          )}
                          {/*
                            Tombol hapus jurnal sengaja DIHAPUS: hanya muncul untuk
                            status "Draft", dan tidak ada satu pun jalur kode yang
                            membuat jurnal Draft (saveJu/saveMut/autoJournal semuanya
                            "Posted"). Jadi tombol ini dead code - user tidak pernah
                            bisa menghapusnya. Jurnal koreksi lewat Void.
                          */}
                        </td>
                      </tr>
                    ))}
                    {manJournals.length === 0 && (
                      <tr><td className="td text-xs text-steel-400" colSpan={12}>{S.emptyJuManual}</td></tr>
                    )}
                  </tbody>
                </table>
                {juPager.bar}
              </div>
              <CardHeader title={S.juSumTitle} subtitle={S.juSumSub} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                  <p className="text-xs text-steel-500">{S.balAssetTitle}</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.aset)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">{S.balAssetHint.replace("{a}", fmtRupiah(balance.kasNet)).replace("{b}", fmtRupiah(balance.piutang))}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">{S.balLiabTitle}</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.kewajiban)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">{S.balLiabHint.replace("{a}", fmtRupiah(balance.hutang)).replace("{b}", fmtRupiah(balance.ppnUtang))}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">{S.balEquityTitle}</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.ekuitas)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">{S.balEquityHint}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">{S.balProfitTitle}</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{fmtRupiah(balance.laba)}</p>
                  <p className="mt-1 text-[11px] text-steel-400">{S.balProfitHint}</p>
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  {journals.length === 0 ? (
                    <EmptyState title={S.emptyJuTitle} subtitle={S.emptyJuSub} />
                  ) : (
                    <div>
                    <div className="mb-2"><SearchBox value={juListQ} onChange={setJuListQ} placeholder={S.cardSearchPh} ariaLabel={S.cardSearchPh} /></div>
                    <div className="max-h-80 overflow-y-auto">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-surface sticky top-0 z-10">
                          <tr>
                            <SortTh label={S.colTanggal} sortKey="date" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                            <SortTh label={S.colRef} sortKey="ref" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                            <SortTh label={S.colDebit} sortKey="db" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                            <SortTh label={S.colKredit} sortKey="kr" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                            <SortTh label={S.colNilai} sortKey="amount" sort={juSort} onSort={(k) => setJuSort((s) => toggleSort(s, k))} />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {sortRows(journals.filter((j) => rowMatches(j as unknown as Record<string, unknown>, juListQ, ["date", "ref", "desc", "debitAkun", "kreditAkun"])), juSort, (j, k) =>
                            k === "ref" ? String(j.ref) : k === "db" ? String(j.debitAkun) : k === "kr" ? String(j.kreditAkun) :
                            k === "amount" ? Number(j.amount) : String(j.date)).map((j, idx) => (
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
                    </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-steel-500">{S.balancedNote.replace("{a}", fmtRupiah(journalTotal)).replace("{b}", fmtRupiah(journalTotal))}</p>
                </div>
                <Card className="p-4">
                  <CardHeader title={S.coaRefTitle} subtitle={S.countAkun.replace("{n}", String(coaList.length))} />
                  <div className="max-h-96 space-y-1.5 overflow-y-auto scroll-flush-5 px-5 pb-5 text-xs">
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
                <CardHeader title={S.plJuTitle} subtitle={S.plJuSub} />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr>
                        <SortTh label={S.colPeriode} sortKey="period" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colPendapatan} sortKey="revenue" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colBebanProyek} sortKey="costProj" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colBebanGaji} sortKey="salary" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colHapusBuku} sortKey="writeoff" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                        <SortTh label={S.colLaba} sortKey="laba" sort={pajakSort} onSort={(k) => setPajakSort((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(plMonthly, pajakSort, (p, k) =>
                        k === "revenue" ? Number(p.revenue) : k === "costProj" ? Number(p.costProj) : k === "salary" ? Number(p.salary) :
                        k === "writeoff" ? Number(p.writeoff) : k === "laba" ? Number(p.laba) : String(p.period)).map((p) => (
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
                        <tr><td className="td text-xs text-steel-400" colSpan={6}>{S.juPlEmpty}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Modal open={showInv} onClose={() => setShowInv(false)} title={S.createInvoice} subtitle={S.newInvoiceSub} wide
        footer={<><button className="btn-secondary" onClick={() => setShowInv(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveInvoice}>{S.publishDraft}</AsyncButton></>}>
        <div className="space-y-3">
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">{S.previewNo} <strong className="font-mono text-navy-900">{invPreview}</strong> {S.previewType.replace("{a}", invForm.billingType)}{invTotal > approveThreshold ? <span className="ml-2"><Badge tone="amber">{S.needDirectorApprove}</Badge></span> : ""}</p>
          <FormGrid>
            <Field label={S.colProyek}>
              <select className="input" value={invForm.project} onChange={(e) => setInv("project", e.target.value)}>
                <option value="">{S.selectProject}</option>
                {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel} · {p.client}</option>)}
              </select>
            </Field>
            <Field label={S.billingTypeLabel}>
              <select className="input" value={invForm.billingType} onChange={(e) => setInv("billingType", e.target.value)}>
                {BILLING_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.fMilestone} hint={S.milestoneHint}>
              <input className="input" value={invForm.milestoneRef} onChange={(e) => setInv("milestoneRef", e.target.value)} placeholder="Milestone 3" />
            </Field>
            <Field label={S.dueLabel}>
              <input type="date" required className="input" value={invForm.due} onChange={(e) => setInv("due", e.target.value)} />
            </Field>
          </FormGrid>
          <Field label={S.fClientPO} hint={S.clientPOHint}>
            <select className="input font-mono" value={invForm.clientPO} onChange={(e) => setInv("clientPO", e.target.value)}>
              <option value="">{S.noClientPO}</option>
              {(data.clientPos ?? []).filter((p) => !invForm.project || !p.projectId || String(p.projectId) === invForm.project).map((p) => (
                <option key={String(p.id)} value={String(p.no ?? p.id)}>{String(p.no ?? p.id)}{p.projectId ? ` · ${String(p.projectId)}` : ""}</option>
              ))}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.fKodePembantu} hint={S.kodePembantuHint}>
              <input className="input font-mono" value={invForm.kodePembantu} onChange={(e) => setInv("kodePembantu", e.target.value)} placeholder={S.kodePembantuPh} />
            </Field>
            <Field label={S.fNsfp} hint={S.nsfpHint}>
              <input className="input font-mono" value={invForm.nsfp} onChange={(e) => setInv("nsfp", e.target.value)} placeholder="NSFP" />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.fNoFaktur} hint={S.noFakturHint}>
              <input className="input font-mono" value={invForm.noFaktur} onChange={(e) => setInv("noFaktur", e.target.value)} placeholder={S.noFakturShort} />
            </Field>
            <Field label={S.fDpAmort} hint={S.dpAmortHint}>
              <NumInput min={0} className="input" value={invForm.dpApplied} onChange={(e) => setInv("dpApplied", e.target.value)} placeholder="0" />
            </Field>
          </FormGrid>
          <Field label={S.fDpRef} hint={S.dpRefHint}>
            <input className="input font-mono" value={invForm.dpRef} onChange={(e) => setInv("dpRef", e.target.value)} placeholder={S.dpRefPh} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-steel-600">
            <input type="checkbox" checked={invForm.skdt} onChange={(e) => setInvForm((f) => ({ ...f, skdt: e.target.checked }))} />
            {S.skdtCheck}
          </label>
          {isTMForm && (
            <Field label={S.fServiceRef} hint={S.serviceRefHint}>
              <input className="input font-mono" value={invForm.serviceRef} onChange={(e) => setInv("serviceRef", e.target.value)} placeholder="SRV-002" />
            </Field>
          )}
          {!isTMForm && invForm.billingType !== "Uang Muka" && (
            <FormGrid>
              <Field label={S.fRetentionPct}>
                <NumInput min={0} max={100} className="input" value={invForm.retentionPct} onChange={(e) => setInv("retentionPct", e.target.value)} />
              </Field>
              <Field label={S.fTermLabel}>
                <select className="input" value={invForm.paymentTerm} onChange={(e) => setInv("paymentTerm", e.target.value)}>
                  {["Termin 1", "Termin 2", "Termin 3", "Milestone 1", "Milestone 2", "Milestone 3", "Progress", "Final"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </FormGrid>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label">{S.linesTotal.replace("{a}", fmtRupiah(invTotal))}{retentionAmtPreview > 0 ? S.retentionSuffix.replace("{a}", fmtRupiah(retentionAmtPreview)) : ""}</p>              <div className="flex gap-2">
                {isTMForm && (
                  <AsyncButton className="btn-secondary px-2 py-1 text-xs" onAction={pullTimesheetLines}>{S.pullTimesheet}</AsyncButton>
                )}
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setInvLines((ls) => [...ls, emptyLine()])}>
                  <Plus className="h-3.5 w-3.5" /> {S.addRow}
                </button>
              </div>
            </div>
            <p className="mb-2 rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
              Jasa {fmtRupiah(sbPreview.jasa)} + Material {fmtRupiah(sbPreview.material)} = {fmtRupiah(sbPreview.total)}
              {" · "}DPP (×11/12) {fmtRupiah(sbPreview.dpp)} · PPN {fmtRupiah(sbPreview.ppn)}{invForm.skdt ? " (SKDT)" : ""}
              {" · "}PPh jasa {fmtRupiah(sbPreview.pph)}{num(invForm.dpApplied) > 0 ? ` · DP -${fmtRupiah(sbPreview.dpApplied)}` : ""}
              {" → "}<strong className="text-navy-900">Grand {fmtRupiah(sbPreview.grand)}</strong>
            </p>
            <div className="space-y-2">
              {invLines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-xl bg-surface p-2">
                  <div className="col-span-6 sm:col-span-3">
                    <Field label={S.fDesc}><input className="input" value={l.desc} onChange={(e) => setLine(idx, "desc", e.target.value)} placeholder={S.descPh} /></Field>
                  </div>
                  {!isTMForm && (
                    <div className="col-span-6 sm:col-span-2">
                      <Field label={S.fKategori}>
                        <select className="input" value={l.kategori || "Jasa"} onChange={(e) => setLine(idx, "kategori", e.target.value)}>
                          <option>Jasa</option>
                          <option>Material</option>
                        </select>
                      </Field>
                    </div>
                  )}
                  {isTMForm ? (
                    <>
                      <div className="col-span-5 sm:col-span-3"><Field label={S.fRate}><NumInput min={0} className="input" value={l.rate} onChange={(e) => setLine(idx, "rate", e.target.value)} /></Field></div>
                      <div className="col-span-5 sm:col-span-3"><Field label={S.fHours}><NumInput min={0} className="input" value={l.hours} onChange={(e) => setLine(idx, "hours", e.target.value)} /></Field></div>
                      <div className="col-span-2 sm:col-span-2">
                        <p className="text-xs font-semibold text-navy-900">{fmtRupiah(lineAmount(l, true))}</p>
                        <button className="mt-1 text-rose-600" aria-label={S.delRow} onClick={() => setInvLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-3 sm:col-span-2"><Field label={S.fQty}><NumInput min={0} className="input" value={l.qty} onChange={(e) => setLine(idx, "qty", e.target.value)} /></Field></div>
                      <div className="col-span-3 sm:col-span-2"><Field label={S.fUnit}><input className="input" value={l.unit} onChange={(e) => setLine(idx, "unit", e.target.value)} /></Field></div>
                      <div className="col-span-4 sm:col-span-3"><Field label={S.fPrice}><NumInput min={0} className="input" value={l.price} onChange={(e) => setLine(idx, "price", e.target.value)} /></Field></div>
                      <div className="col-span-2 sm:col-span-1">
                        <button className="text-rose-600" aria-label={S.delRow} onClick={() => setInvLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={payTarget !== null} onClose={() => { setPayTarget(null); setProofImg(""); }} title={S.markPaidTitle.replace("{a}", payTarget?.id ?? "")} subtitle={`${String(payTarget?.client ?? "")} · ${fmtRupiah(num(payTarget?.amount))}`}
        footer={<><button className="btn-secondary" onClick={() => { setPayTarget(null); setProofImg(""); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmBuktiInv}>{S.saveProofPaid}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fPayDate}><input type="date" required className="input" value={proof.date} onChange={(e) => setProofField("date", e.target.value)} /></Field>
            <Field label={S.colMetode}>
              <select className="input" value={proof.method} onChange={(e) => setProofField("method", e.target.value)}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.fRefNo} hint={S.refProofHint}>
            <input className="input font-mono" value={proof.ref} onChange={(e) => setProofField("ref", e.target.value)} placeholder={S.refProofPh} />
          </Field>
          <Field label={S.proofImgLabel} hint={S.proofImgHint}>
            <div className="flex flex-wrap items-center gap-2">
              <FileUploadButton accept=".png,.jpg,.jpeg" label={proofImg ? S.imgReplace : S.imgUpload} onUploaded={setProofImg} />
              {proofImg && <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setProofImg("")}>{S.deleteBtn}</button>}
            </div>
            {proofImg && (
              <div className="mt-2 overflow-hidden rounded-xl border border-steel-200">
                <SecureImg src={proofImg} alt={`Bukti ${payTarget?.id ?? ""}`} className="h-40 w-full object-contain bg-steel-50" />
              </div>
            )}
          </Field>
        </div>
      </Modal>

      {/* Hapus invoice: hanya Draft / Ditolak. Invoice yang sudah terbit harus
          di-void atau dilunasi - menghapusnya menghapus piutang yang sudah
          diakui. Backend juga memblokir bila payables.invoice merujuk. */}
      <ConfirmModal
        open={confirmLapor}
        title={locale === "en"
          ? `File ${activeTax ? String(activeTax.period) : ""} as SPT?`
          : `Tandai periode ${activeTax ? String(activeTax.period) : ""} sebagai Lapor?`}
        desc={locale === "en"
          ? `PPN payable ${fmtRupiah(Math.max(0, num(taxCalc.ppnKeluar) - num(taxCalc.ppnMasuk)))}, PPh23 ${fmtRupiah(Math.round(num(taxCalc.pph23)))}, PPh21 ${fmtRupiah(Math.round(num(taxCalc.pph21)))} will be locked and published as tax payables. Once filed, the period can no longer be edited.`
          : `PPN terutang ${fmtRupiah(Math.max(0, num(taxCalc.ppnKeluar) - num(taxCalc.ppnMasuk)))}, PPh23 ${fmtRupiah(Math.round(num(taxCalc.pph23)))}, PPh21 ${fmtRupiah(Math.round(num(taxCalc.pph21)))} akan dikunci dan terbit sebagai hutang pajak. Setelah ditandai Lapor, angka periode ini tidak bisa diedit lagi.`}
        confirmLabel={locale === "en" ? "File as SPT" : "Tandai Lapor"}
        danger
        confirmDisabled={!activeTax || taxLocked}
        onCancel={() => setConfirmLapor(false)}
        onConfirm={async () => {
          setConfirmLapor(false);
          await markTaxLapor();
        }}
      />

      <ConfirmModal
        open={delTax !== null}
        title={delTax ? (locale === "en" ? `Delete tax period ${String(delTax.period)}?` : `Hapus periode pajak ${String(delTax.period)}?`) : ""}
        desc={delTax ? (locale === "en"
          ? `Draft totals for ${String(delTax.period)} (PPN keluar ${fmtRupiah(Number(delTax.ppnKeluar || 0))}, PPN masuk ${fmtRupiah(Number(delTax.ppnMasuk || 0))}, PPh23 ${fmtRupiah(Number(delTax.pph23 || 0))}, PPh21 ${fmtRupiah(Number(delTax.pph21 || 0))}) will be removed.`
          : `Nilai Draft periode ${String(delTax.period)} (PPN keluar ${fmtRupiah(Number(delTax.ppnKeluar || 0))}, PPN masuk ${fmtRupiah(Number(delTax.ppnMasuk || 0))}, PPh23 ${fmtRupiah(Number(delTax.pph23 || 0))}, PPh21 ${fmtRupiah(Number(delTax.pph21 || 0))}) akan dihapus.`) : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        confirmDisabled={delTax ? String(delTax.status ?? "") === "Lapor" : false}
        onCancel={() => setDelTax(null)}
        onConfirm={confirmDelTax}
      />

      <ConfirmModal
        open={delInvoice !== null}
        title={delInvoice ? (locale === "en" ? `Delete invoice ${delInvoice.id}?` : `Hapus invoice ${delInvoice.id}?`) : ""}
        desc={(() => {
          if (!delInvoice) return "";
          const st = String(delInvoice.status ?? "");
          const base = locale === "en"
            ? `Invoice ${delInvoice.id} (${st}) will be permanently deleted.`
            : `Invoice ${delInvoice.id} (${st}) akan dihapus permanen.`;
          if (st !== "Draft" && st !== "Ditolak") {
            return locale === "en"
              ? `${base} This invoice is already issued, so deletion is blocked - void or settle it instead.`
              : `${base} Invoice ini sudah terbit sehingga penghapusan diblokir - void atau lunaskan.`;
          }
          const used = findUsages(data, "invoices", String(delInvoice.id));
          return used.length > 0
            ? (locale === "en"
              ? `${base} Referenced by: ${used.join(", ")}. Deletion blocked.`
              : `${base} Dirujuk oleh: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={(() => {
          if (!delInvoice) return S.deleteBtn;
          const st = String(delInvoice.status ?? "");
          const used = findUsages(data, "invoices", String(delInvoice.id));
          if (st !== "Draft" && st !== "Ditolak") {
            return locale === "en" ? "Blocked - already issued" : "Diblokir - sudah terbit";
          }
          if (used.length > 0) return locale === "en" ? "Blocked - still referenced" : "Diblokir - masih dirujuk";
          return S.deleteBtn;
        })()}
        danger
        confirmDisabled={(() => {
          if (!delInvoice) return true;
          const st = String(delInvoice.status ?? "");
          return (st !== "Draft" && st !== "Ditolak") || findUsages(data, "invoices", String(delInvoice.id)).length > 0;
        })()}
        onCancel={() => setDelInvoice(null)}
        onConfirm={confirmDelInvoice}
      />

      <ConfirmModal
        open={rejectInv !== null}
        title={S.rejectTitle.replace("{a}", rejectInv?.id ?? "")}
        desc={S.rejectDesc}
        confirmLabel={S.confirmReject}
        onCancel={() => setRejectInv(null)}
        onConfirm={async () => {
          if (!rejectInv) return;
          try {
            await update("invoices", rejectInv.id, { status: "Ditolak" });
            /* Reject invoice sebelumnya TIDAK punya log() sama sekali - satu-satunya
               transisi status invoice yang hilang jejaknya di audit trail. */
            log("menolak invoice", `${rejectInv.id} · ${String(rejectInv.client ?? "")}`, "Keuangan");
            toast(S.rejected.replace("{a}", rejectInv.id));
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          finally { setRejectInv(null); }
        }}
      />

      <Modal open={apTarget !== null} onClose={() => { setApTarget(null); setProofImg(""); }} title={S.apPayTitle.replace("{a}", !num(apTarget?.pay1) ? "I" : "II").replace("{b}", String(apTarget?.po ?? ""))} subtitle={S.apPaySub.replace("{a}", String(apTarget?.v ?? "")).replace("{b}", fmtRupiah(Math.max(0, num(apTarget?.amt) - num(apTarget?.pay1) - num(apTarget?.pay2))))}
        footer={<><button className="btn-secondary" onClick={() => { setApTarget(null); setProofImg(""); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmBuktiAp}>{S.saveProofPay}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.fStageAmount} hint={!num(apTarget?.pay1) ? S.apPhase1 : S.apPhase2.replace("{a}", fmtRupiah(num(apTarget?.pay1)))}>
            <NumInput min={0} className="input" value={apPayAmt} onChange={(e) => setApPayAmt(e.target.value)} placeholder={S.stagePh} />
          </Field>
          <FormGrid>
            <Field label={S.fPayDate}><input type="date" required className="input" value={proof.date} onChange={(e) => setProofField("date", e.target.value)} /></Field>
            <Field label={S.colMetode}>
              <select className="input" value={proof.method} onChange={(e) => setProofField("method", e.target.value)}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.fRefNo} hint={S.refGiroHint}>
            <input className="input font-mono" value={proof.ref} onChange={(e) => setProofField("ref", e.target.value)} placeholder={S.refGiroPh} />
          </Field>
          <Field label={S.apProofLabel} hint={S.apProofHint}>
            <div className="flex flex-wrap items-center gap-2">
              <FileUploadButton accept=".png,.jpg,.jpeg" label={proofImg ? S.imgReplace : S.imgUpload} onUploaded={setProofImg} />
              {proofImg && <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setProofImg("")}>{S.deleteBtn}</button>}
            </div>
            {proofImg && (
              <div className="mt-2 overflow-hidden rounded-xl border border-steel-200">
                <SecureImg src={proofImg} alt={`Bukti ${String(apTarget?.po ?? apTarget?.id ?? "")}`} className="h-40 w-full object-contain bg-steel-50" />
              </div>
            )}
          </Field>
        </div>
      </Modal>

      <Modal open={showAp} onClose={() => setShowAp(false)} title={S.apNewTitle}
        footer={<><button className="btn-secondary" onClick={() => setShowAp(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveAp}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colVendor}><input className="input" value={apForm.v} onChange={(e) => setApForm({ ...apForm, v: e.target.value })} /></Field>
            <Field label={S.fKodePembantu} hint={S.vendorDefaultHint}><input className="input font-mono" value={apForm.kodePembantu} onChange={(e) => setApForm({ ...apForm, kodePembantu: e.target.value })} /></Field>
            <Field label={S.fPoRef} hint={S.poFormatHint}><input className="input font-mono" value={apForm.po} onChange={(e) => setApForm({ ...apForm, po: e.target.value })} placeholder={S.poPh} /></Field>
            <Field label={S.fVessel} hint={S.vesselHint}><input className="input" value={apForm.vessel} onChange={(e) => setApForm({ ...apForm, vessel: e.target.value })} /></Field>
            <Field label={S.fItem}><input className="input" value={apForm.item} onChange={(e) => setApForm({ ...apForm, item: e.target.value })} placeholder={S.itemPh} /></Field>
            <Field label={S.fOpenBal}><NumInput min={0} className="input" value={apForm.openAwal} onChange={(e) => setApForm({ ...apForm, openAwal: e.target.value })} /></Field>
            <Field label={S.fCloseBal}><NumInput min={0} className="input" value={apForm.amt} onChange={(e) => setApForm({ ...apForm, amt: e.target.value })} /></Field>
            <Field label={S.dueLabel}><input type="date" required className="input" value={apForm.due} onChange={(e) => setApForm({ ...apForm, due: e.target.value })} /></Field>
          </FormGrid>
          <label className="flex items-center gap-2 text-sm text-steel-600">
            <input type="checkbox" checked={apForm.nonPpn} onChange={(e) => setApForm({ ...apForm, nonPpn: e.target.checked })} />
            {S.nonPpnCheck}
          </label>
        </div>
      </Modal>

      <Modal open={apEdit !== null} onClose={() => setApEdit(null)} title={S.editApTitle.replace("{a}", String(apEdit?.po ?? apEdit?.id ?? ""))} subtitle={String(apEdit?.v ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setApEdit(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveApEdit}>{S.saveChanges}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colVendor}><input className="input" value={apEditForm.v} onChange={(e) => setApEditForm({ ...apEditForm, v: e.target.value })} /></Field>
            <Field label={S.fKodePembantu}><input className="input font-mono" value={apEditForm.kodePembantu} onChange={(e) => setApEditForm({ ...apEditForm, kodePembantu: e.target.value })} /></Field>
            <Field label={S.fVessel}><input className="input" value={apEditForm.vessel} onChange={(e) => setApEditForm({ ...apEditForm, vessel: e.target.value })} /></Field>
            <Field label={S.fItem}><input className="input" value={apEditForm.item} onChange={(e) => setApEditForm({ ...apEditForm, item: e.target.value })} /></Field>
            <Field label={S.fOpenBal}><NumInput min={0} className="input" value={apEditForm.openAwal} onChange={(e) => setApEditForm({ ...apEditForm, openAwal: e.target.value })} /></Field>
            <Field label={S.fCloseBal}><NumInput min={0} className="input" value={apEditForm.amt} onChange={(e) => setApEditForm({ ...apEditForm, amt: e.target.value })} /></Field>
            <Field label={S.dueLabel}><input type="date" required className="input" value={apEditForm.due} onChange={(e) => setApEditForm({ ...apEditForm, due: e.target.value })} /></Field>
          </FormGrid>
          <label className="flex items-center gap-2 text-sm text-steel-600">
            <input type="checkbox" checked={apEditForm.nonPpn} onChange={(e) => setApEditForm({ ...apEditForm, nonPpn: e.target.checked })} />
            {S.nonPpnCheck}
          </label>
        </div>
      </Modal>

      <Modal open={releaseTarget !== null} onClose={() => setReleaseTarget(null)} title={S.relTitle.replace("{a}", releaseTarget?.id ?? "")} subtitle={S.relSub.replace("{a}", fmtRupiah(num(releaseTarget?.retentionAmt)))}
        footer={<><button className="btn-secondary" onClick={() => setReleaseTarget(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmRelease}>{S.releaseRetensiBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fReleaseDate}><input type="date" required className="input" value={releaseForm.date} onChange={(e) => setReleaseForm({ ...releaseForm, date: e.target.value })} /></Field>
            <Field label={S.fBaNo}><input className="input font-mono" value={releaseForm.ba} onChange={(e) => setReleaseForm({ ...releaseForm, ba: e.target.value })} placeholder={S.baPh} /></Field>
          </FormGrid>
          <Field label={S.fWarranty} hint={S.warrantyHint}>
            <select className="input" value={releaseForm.warrantyId} onChange={(e) => setReleaseForm({ ...releaseForm, warrantyId: e.target.value })}>
              <option value="">{S.noWarranty}</option>
              {(data.warranties ?? []).filter((w) => String(w.projectId ?? "") === String(releaseTarget?.project ?? "")).map((w) => (
                <option key={w.id} value={w.id}>{w.id} · {w.status} · {fmtTanggal(String(w.start ?? ""))}</option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal open={showBatch} onClose={() => { setShowBatch(false); setBatchImg(""); }} title={S.batchTitle.replace("{n}", fmtJumlah(schedSel.length))} subtitle={S.batchSub.replace("{a}", fmtRupiah(schedTotal))}
        footer={<><button className="btn-secondary" onClick={() => { setShowBatch(false); setBatchImg(""); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmBatch}>{S.settleAll}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fPayDate}><input type="date" required className="input" value={batchProof.date} onChange={(e) => setBatchProof({ ...batchProof, date: e.target.value })} /></Field>
            <Field label={S.colMetode}>
              <select className="input" value={batchProof.method} onChange={(e) => setBatchProof({ ...batchProof, method: e.target.value })}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.fRefNo} hint={S.batchRefHint}>
            <input className="input font-mono" value={batchProof.ref} onChange={(e) => setBatchProof({ ...batchProof, ref: e.target.value })} placeholder={S.batchRefPh} />
          </Field>
          <Field label={S.batchProofLabel} hint={S.batchProofHint}>
            <div className="flex flex-wrap items-center gap-2">
              <FileUploadButton accept=".png,.jpg,.jpeg" label={batchImg ? S.imgReplace : S.imgUpload} onUploaded={setBatchImg} />
              {batchImg && <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setBatchImg("")}>{S.deleteBtn}</button>}
            </div>
            {batchImg && (
              <div className="mt-2 overflow-hidden rounded-xl border border-steel-200">
                <SecureImg src={batchImg} alt="Bukti bayar massal" className="h-40 w-full object-contain bg-steel-50" />
              </div>
            )}
          </Field>
        </div>
      </Modal>

      <Modal open={allocTarget !== null} onClose={() => setAllocTarget(null)} title={S.allocTitle.replace("{a}", allocTarget?.id ?? "")} subtitle={S.allocSub}
        footer={<><button className="btn-secondary" onClick={() => setAllocTarget(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveAlloc}>{S.saveAlloc}</AsyncButton></>}>
        <div className="space-y-3">
          {(() => {
            // Saran proyek = proyek tersering karyawan ini di timesheet (petunjuk saja, simpan tetap manual).
            const ts = (data.timesheets ?? []).filter((t) => String(t.employeeId ?? "") === String(allocTarget?.employeeId ?? ""));
            const freq = new Map<string, number>();
            for (const t of ts) {
              const pid = String(t.projectId ?? woProject[String(t.woId ?? "")] ?? "");
              if (pid) freq.set(pid, (freq.get(pid) ?? 0) + 1);
            }
            const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
            if (!top) return null;
            return (
              <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
                {S.suggestLead} <strong className="text-navy-900">{top[0]}</strong>{S.suggestRest.replace("{n}", String(top[1]))}
              </p>
            );
          })()}
          <FormGrid>
            <Field label={S.colProyek}>
              <select className="input" value={allocForm.project} onChange={(e) => setAllocForm({ ...allocForm, project: e.target.value })}>
                <option value="">{S.selectProject}</option>
                {projectsVisible.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.fAllocPct}><NumInput min={1} max={100} className="input" value={allocForm.pct} onChange={(e) => setAllocForm({ ...allocForm, pct: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={dirTarget !== null} onClose={() => setDirTarget(null)} title={S.dirTitle.replace("{a}", dirTarget?.id ?? "")} subtitle={S.dirSub.replace("{a}", fmtRupiah(num(dirTarget?.amount))).replace("{b}", fmtRupiah(approveThreshold))}
        footer={<><button className="btn-secondary" onClick={() => setDirTarget(null)}>{S.cancelBtn}</button><button className="btn-primary" disabled={!dirCheck || !dirName.trim()} onClick={confirmDirector}>{S.approveAsDirector}</button></>}>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-steel-600">
            <input type="checkbox" className="mt-1" checked={dirCheck} onChange={(e) => setDirCheck(e.target.checked)} />
            {S.dirCheck}
          </label>
          <Field label={S.fDirName} hint={S.dirNameHint}>
            <input className="input" value={dirName} onChange={(e) => setDirName(e.target.value)} placeholder={S.dirNamePh} />
          </Field>
        </div>
      </Modal>

      <Modal open={showCoa} onClose={() => { setShowCoa(false); setCoaTarget(null); }} title={coaTarget ? S.coaEditTitle.replace("{a}", String(coaTarget.kode)) : S.coaAdd} subtitle={coaTarget && String(coaTarget.dk) === "-" ? S.coaHeaderNote : S.coaFormNote}
        footer={<><button className="btn-secondary" onClick={() => { setShowCoa(false); setCoaTarget(null); }}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveCoa}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fCoaNo} hint={S.coaNoHint}>
              <input className="input font-mono" value={coaForm.kode} disabled={coaTarget !== null} onChange={(e) => setCoaForm({ ...coaForm, kode: e.target.value })} placeholder="1-125" />
            </Field>
            <Field label={S.fCoaName}><input className="input" value={coaForm.nama} onChange={(e) => setCoaForm({ ...coaForm, nama: e.target.value })} placeholder={S.coaNamePh} /></Field>
            <Field label={S.fCoaDK} hint={coaTarget && String(coaTarget.dk) === "-" ? S.lockedHeader : undefined}>
              <select className="input" value={coaForm.dk} disabled={coaTarget !== null && String(coaTarget.dk) === "-"} onChange={(e) => setCoaForm({ ...coaForm, dk: e.target.value })}>
                <option value="D">D - Debit</option>
                <option value="K">K - Kredit</option>
              </select>
            </Field>
            <Field label={S.fCoaNRLR} hint={coaTarget && String(coaTarget.dk) === "-" ? S.lockedHeader : undefined}>
              <select className="input" value={coaForm.nrlr} disabled={coaTarget !== null && String(coaTarget.dk) === "-"} onChange={(e) => setCoaForm({ ...coaForm, nrlr: e.target.value })}>
                <option value="NR">NR - Neraca</option>
                <option value="LR">LR - Laba-Rugi</option>
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showJu} onClose={() => setShowJu(false)} title={S.juNewTitle} subtitle={S.juNewSub}
        footer={<><button className="btn-secondary" onClick={() => setShowJu(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveJu}>{S.juSave}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colTanggal}><input type="date" required className="input" value={juForm.date} onChange={(e) => setJuForm({ ...juForm, date: e.target.value })} /></Field>
            <Field label={S.fKodePembantu}><input className="input font-mono" value={juForm.kodePembantu} onChange={(e) => setJuForm({ ...juForm, kodePembantu: e.target.value })} placeholder="vendor / customer" /></Field>
            <Field label={S.fVoucher} hint={S.voucherHint}><input className="input font-mono" value={juForm.dokumen} onChange={(e) => setJuForm({ ...juForm, dokumen: e.target.value })} /></Field>
            <Field label={S.colSumber}>
              <select className="input" value={juForm.sumber} onChange={(e) => setJuForm({ ...juForm, sumber: e.target.value })}>
                {["JU", "Kas", "Bank", "JPb", "JPn", "JM"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.colUraian}><input className="input" value={juForm.uraian} onChange={(e) => setJuForm({ ...juForm, uraian: e.target.value })} placeholder={S.juDescPh} /></Field>
          <Field label={S.juAttachLabel} hint={S.juAttachHint}>
            <div className="flex flex-wrap items-center gap-2">
              <FileUploadButton accept=".png,.jpg,.jpeg" label={juImg ? S.imgReplace : S.imgUpload} onUploaded={setJuImg} />
              {juImg && <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setJuImg("")}>{S.deleteBtn}</button>}
            </div>
            {juImg && (
              <div className="mt-2 overflow-hidden rounded-xl border border-steel-200">
                <SecureImg src={juImg} alt={S.juAttachLabel} className="h-32 w-full object-contain bg-steel-50" />
              </div>
            )}
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label">{S.juLinesTitle.replace("{a}", fmtRupiah(juLines.reduce((s, l) => s + num(l.amount), 0)))}</p>
              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setJuLines((ls) => [...ls, { db: "", kr: "", amount: "" }])}>
                <Plus className="h-3.5 w-3.5" /> {S.addRow}
              </button>
            </div>
            <div className="space-y-2">
              {juLines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-xl bg-surface p-2">
                  <div className="col-span-12 sm:col-span-4">
                    <Field label={S.dbLine.replace("{n}", String(idx + 1))}>
                      <select className="input font-mono" value={l.db} onChange={(e) => setJuLines((ls) => ls.map((x, i) => (i === idx ? { ...x, db: e.target.value } : x)))}>
                        <option value="">{S.selectAccount}</option>
                        {coaRows.filter((c) => String(c.dk) !== "-").map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="col-span-12 sm:col-span-4">
                    <Field label={S.krLine.replace("{n}", String(idx + 1))}>
                      <select className="input font-mono" value={l.kr} onChange={(e) => setJuLines((ls) => ls.map((x, i) => (i === idx ? { ...x, kr: e.target.value } : x)))}>
                        <option value="">{S.selectAccount}</option>
                        {coaRows.filter((c) => String(c.dk) !== "-").map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="col-span-10 sm:col-span-3">
                    <Field label={S.fNominal}><NumInput min={0} className="input" value={l.amount} onChange={(e) => setJuLines((ls) => ls.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))} /></Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <button className="text-rose-600" aria-label={S.delJuRow.replace("{n}", String(idx + 1))} onClick={() => setJuLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : [{ db: "", kr: "", amount: "" }]))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={showMut} onClose={() => setShowMut(false)} title={S.mutTitle} subtitle={S.mutSub}
        footer={<><button className="btn-secondary" onClick={() => setShowMut(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveMut}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colTanggal}><input type="date" required className="input" value={mutForm.date} onChange={(e) => setMutForm({ ...mutForm, date: e.target.value })} /></Field>
            <Field label={S.colRekening}>
              <select className="input font-mono" value={mutForm.rekening} onChange={(e) => setMutForm({ ...mutForm, rekening: e.target.value })}>
                {KAS_REKENING.map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
              </select>
            </Field>
            <Field label={S.fArah}>
              <select className="input" value={mutForm.arah} onChange={(e) => setMutForm({ ...mutForm, arah: e.target.value })}>
                <option>Masuk</option>
                <option>Keluar</option>
              </select>
            </Field>
            <Field label={S.fLawan}>
              <select className="input font-mono" value={mutForm.lawan} onChange={(e) => setMutForm({ ...mutForm, lawan: e.target.value })}>
                <option value="">{S.selectAccount}</option>
                {coaRows.filter((c) => String(c.dk) !== "-").map((c) => <option key={String(c.id)} value={String(c.kode)}>{String(c.kode)} · {String(c.nama)}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.fKodePembantu}><input className="input font-mono" value={mutForm.kodePembantu} onChange={(e) => setMutForm({ ...mutForm, kodePembantu: e.target.value })} /></Field>
            <Field label={S.fNoDoc} hint={S.noDocHint}><input className="input font-mono" value={mutForm.dokumen} onChange={(e) => setMutForm({ ...mutForm, dokumen: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.colUraian}><input className="input" value={mutForm.uraian} onChange={(e) => setMutForm({ ...mutForm, uraian: e.target.value })} placeholder={S.mutDescPh} /></Field>
          <Field label={S.fNominal}><NumInput min={0} className="input" value={mutForm.amount} onChange={(e) => setMutForm({ ...mutForm, amount: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={invEdit !== null} onClose={() => setInvEdit(null)} title={S.editInvTitle.replace("{a}", invEdit?.id ?? "")} subtitle={S.editInvSub}
        footer={<><button className="btn-secondary" onClick={() => setInvEdit(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveInvEdit}>{S.saveChanges}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colCustomer}><input className="input" value={invEditForm.client} onChange={(e) => setInvEditForm({ ...invEditForm, client: e.target.value })} /></Field>
            <Field label={S.fKodePembantu}><input className="input font-mono" value={invEditForm.kodePembantu} onChange={(e) => setInvEditForm({ ...invEditForm, kodePembantu: e.target.value })} /></Field>
            <Field label={S.dueLabel}><input type="date" required className="input" value={invEditForm.due} onChange={(e) => setInvEditForm({ ...invEditForm, due: e.target.value })} /></Field>
            <Field label={S.fTermin}><input className="input" value={invEditForm.paymentTerm} onChange={(e) => setInvEditForm({ ...invEditForm, paymentTerm: e.target.value })} /></Field>
            <Field label={S.fMilestone}><input className="input" value={invEditForm.milestoneRef} onChange={(e) => setInvEditForm({ ...invEditForm, milestoneRef: e.target.value })} /></Field>
            <Field label="NSFP"><input className="input font-mono" value={invEditForm.nsfp} onChange={(e) => setInvEditForm({ ...invEditForm, nsfp: e.target.value })} /></Field>
            <Field label={S.noFakturShort}><input className="input font-mono" value={invEditForm.noFaktur} onChange={(e) => setInvEditForm({ ...invEditForm, noFaktur: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showAst} onClose={closeAst} title={astEdit ? `${S.editBtn} ${String(astEdit.nama ?? astEdit.id)}` : S.astTitle} subtitle={S.astSub}
        footer={<><button className="btn-secondary" onClick={closeAst}>{S.cancelBtn}</button><button className="btn-primary" onClick={() => void busy.run(`saveAst-${astEdit?.id ?? "new"}`, astEdit ? saveAstEdit : saveAst)} disabled={busy.isBusy(`saveAst-${astEdit?.id ?? "new"}`)}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fAssetName}><input className="input" value={astForm.nama} onChange={(e) => setAstForm({ ...astForm, nama: e.target.value })} placeholder={S.assetNamePh} /></Field>
            <Field label={S.fAssetGroup}>
              <select className="input" value={astForm.kelompok} onChange={(e) => setAstForm({ ...astForm, kelompok: e.target.value })}>
                <option value="BP">BP - Bangunan Permanen (5%)</option>
                <option value="1">1 - Kelompok 1 (25%)</option>
                <option value="2">2 - Kelompok 2 (12,5%)</option>
                <option value="3">3 - Kelompok 3 (6,25%)</option>
              </select>
            </Field>
            <Field label={S.fAssetMonth} hint={S.assetMonthHint}><input className="input" value={astForm.bulan} onChange={(e) => setAstForm({ ...astForm, bulan: e.target.value })} /></Field>
            <Field label={S.fAssetYear}><input className="input font-mono" value={astForm.tahun} onChange={(e) => setAstForm({ ...astForm, tahun: e.target.value })} placeholder="2026" /></Field>
            <Field label={S.fAssetValue}><NumInput min={0} className="input" value={astForm.nilai} onChange={(e) => setAstForm({ ...astForm, nilai: e.target.value })} /></Field>
            <Field label={S.colMetode}>
              <select className="input" value={astForm.metode} onChange={(e) => setAstForm({ ...astForm, metode: e.target.value })}>
                <option>GL</option>
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={writeOff !== null} onClose={() => { setWriteOff(null); setWriteOffReason(""); setWoDirCheck(false); setWoDirName(""); }} title={S.woTitle.replace("{a}", writeOff?.id ?? "")} subtitle={S.woSub.replace("{a}", fmtRupiah(num(writeOff?.amount))) + (needsWriteOffDirector(writeOff) ? S.woThresholdNote.replace("{a}", fmtRupiah(approveThreshold)) : "")}        footer={<><button className="btn-secondary" onClick={() => { setWriteOff(null); setWriteOffReason(""); setWoDirCheck(false); setWoDirName(""); }}>{S.cancelBtn}</button><button className="btn-primary" disabled={!writeOffReason.trim() || (needsWriteOffDirector(writeOff) && (!woDirCheck || !woDirName.trim()))} onClick={() => setConfirmWriteOff(true)}>{S.continueConfirm}</button></>}>
        <Field label={S.fWoReason} hint={S.woReasonHint}>
          <input className="input" value={writeOffReason} onChange={(e) => setWriteOffReason(e.target.value)} placeholder={S.woReasonPh} />
        </Field>
        {needsWriteOffDirector(writeOff) && (
          <>
            <label className="flex items-start gap-2 text-sm text-steel-600">
              <input type="checkbox" className="mt-1" checked={woDirCheck} onChange={(e) => setWoDirCheck(e.target.checked)} />
              {S.woDirCheck}
            </label>
            <Field label={S.fDirName} hint={S.dirNameHint}>
              <input className="input" value={woDirName} onChange={(e) => setWoDirName(e.target.value)} placeholder={S.dirNamePh} />
            </Field>
          </>
        )}
      </Modal>

      <ConfirmModal
        open={confirmWriteOff && writeOff !== null}
        title={S.woTitle.replace("{a}", writeOff?.id ?? "")}
        desc={S.woDesc.replace("{a}", writeOffReason.trim() || "-")}
        confirmLabel={S.confirmWo}
        danger
        onCancel={() => setConfirmWriteOff(false)}
        onConfirm={doWriteOff}
      />

      <ConfirmModal
        open={delCoa !== null}
        title={delCoa ? `Hapus akun ${String(delCoa.kode ?? delCoa.id)}?` : ""}
        desc={(() => {
          const used = delCoa ? findUsages(data, "coa", String(delCoa.id)) : [];
          const base = delCoa ? `Akun ${String(delCoa.kode ?? "")} · ${String(delCoa.nama ?? "")} akan dihapus permanen.` : "";
          return used.length > 0 ? `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.` : base;
        })()}
        confirmLabel={delCoa && findUsages(data, "coa", String(delCoa.id)).length > 0 ? "Diblokir - masih dipakai" : S.deleteBtn}
        danger
        confirmDisabled={delCoa ? findUsages(data, "coa", String(delCoa.id)).length > 0 : false}
        onCancel={() => setDelCoa(null)}
        onConfirm={async () => {
          if (!delCoa) return;
          const usedBy = findUsages(data, "coa", String(delCoa.id));
            if (usedBy.length > 0) { toast(`Hapus diblokir - ${delCoa.kode} dipakai di: ${usedBy.join(", ")}`, "info"); log("gagal hapus akun", `${delCoa.kode} · masih dipakai di: ${usedBy.join(", ")}`, "Keuangan"); return; }
          try { await remove("coa", String(delCoa.id)); log("menghapus akun", String(delCoa.kode), "Keuangan"); toast(S.coaDeleted.replace("{a}", String(delCoa.kode))); setDelCoa(null); }
          catch (e) { toast(e instanceof Error ? e.message : S.coaDeleteFail, "info"); }
        }}
      />

      <ConfirmModal
        open={delAsset !== null}
        title={delAsset ? `Hapus aset ${String(delAsset.nama ?? delAsset.id)}?` : ""}
        desc={(() => {
          const used = delAsset ? findUsages(data, "assets", String(delAsset.id)) : [];
          const base = delAsset ? `Aset ${String(delAsset.nama ?? "")} akan dihapus permanen.` : "";
          return used.length > 0 ? `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.` : base;
        })()}
        confirmLabel={delAsset && findUsages(data, "assets", String(delAsset.id)).length > 0 ? "Diblokir - masih dipakai" : S.deleteBtn}
        danger
        confirmDisabled={delAsset ? findUsages(data, "assets", String(delAsset.id)).length > 0 : false}
        onCancel={() => setDelAsset(null)}
        onConfirm={async () => {
          if (!delAsset) return;
          const usedBy = findUsages(data, "assets", String(delAsset.id));
            if (usedBy.length > 0) { toast(`Hapus diblokir - ${delAsset.nama} dipakai di: ${usedBy.join(", ")}`, "info"); log("gagal hapus aset", `${delAsset.nama} · masih dipakai di: ${usedBy.join(", ")}`, "Keuangan"); return; }
          try { await remove("assets", String(delAsset.id)); log("menghapus aset", String(delAsset.nama), "Keuangan"); toast(S.assetDeleted.replace("{a}", String(delAsset.nama))); setDelAsset(null); }
          catch (e) { toast(e instanceof Error ? e.message : S.assetDeleteFail, "info"); }
        }}
      />

      {/* Modal Detail Invoice: ringkasan + baris + pajak + bukti & jurnal viewer. */}
      <Modal open={invDetail !== null} onClose={() => setInvDetail(null)} title={invDetail ? S.detTitle.replace("{a}", invDetail.id) : S.detBtn}
        subtitle={invDetail ? `${String(invDetail.client ?? "")} · ${String(invDetail.project ?? "")} · ${String(invDetail.status ?? "")}` : ""} wide
        footer={<>
          <button className="btn-secondary" onClick={() => setInvDetail(null)}>{S.cancelBtn}</button>
          <button
            className="btn-primary"
            disabled={pdfDoc.state.busy}
            onClick={() => {
              if (!pdfServerReady()) {
                toast(locale === "en"
                  ? "Official PDF needs the server - connect the backend first."
                  : "PDF resmi perlu server aktif - hubungkan backend dulu.", "info");
                return;
              }
              void pdfDoc.request(
                { kind: "invoice", id: String(invDetail?.id ?? ""), locale },
                `Invoice-${String(invDetail?.id ?? "")}.pdf`,
                false,
              );
            }}
          >
            {pdfDoc.state.busy
              ? (locale === "en" ? "Preparing..." : "Menyiapkan...")
              : (locale === "en" ? "Print Invoice" : "Cetak Invoice")}
          </button>
        </>}>
        {invDetail && (() => {
          const bukti = String(invDetail.paidProofUrl ?? invDetail.buktiUrl ?? "");
          const relJurnal = (manJournals ?? []).filter((j) => String(j.dokumen ?? "").includes(String(invDetail.id)));
          const lines = Array.isArray(invDetail.lines) ? invDetail.lines : [];
          return (
            <div className="space-y-4">
              <dl className="dl-div grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.detClientProject}</dt><dd className="text-right font-medium text-navy-900">{String(invDetail.client ?? "-")} / {String(invDetail.project ?? "-")}</dd></div>
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.detTypeTerm}</dt><dd className="text-right font-medium text-navy-900">{String(invDetail.billingType ?? invDetail.paymentTerm ?? "-")}{invDetail.milestoneRef ? ` · ${String(invDetail.milestoneRef)}` : ""}</dd></div>
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.dueLabel}</dt><dd className="text-right font-medium text-navy-900">{fmtTanggal(String(invDetail.due ?? ""))}</dd></div>
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.colStatus}</dt><dd className="text-right"><StatusBadge status={String(invDetail.status ?? "")} /></dd></div>
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.detTax}</dt><dd className="text-right font-medium text-navy-900">{fmtRupiah(num(invDetail.dpp))} / {fmtRupiah(num(invDetail.ppnAmt))} / {fmtRupiah(num(invDetail.pphAmt))}</dd></div>
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.detGrand}</dt><dd className="text-right font-bold text-navy-900">{fmtRupiah(invNeto(invDetail))}</dd></div>
                {(invDetail.paidAt || invDetail.paidRef) && (
                  <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.detPaid}</dt><dd className="text-right font-medium text-navy-900">{invDetail.paidAt ? fmtTanggal(String(invDetail.paidAt)) : "-"} · {String(invDetail.paidMethod ?? "-")} · {String(invDetail.paidRef ?? "-")}</dd></div>
                )}
                {(invDetail.nsfp || invDetail.noFaktur) && (
                  <div className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{S.detEfaktur}</dt><dd className="text-right font-mono text-xs text-navy-900">{String(invDetail.nsfp ?? "-")} / {String(invDetail.noFaktur ?? "-")}</dd></div>
                )}
              </dl>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">{S.detLines.replace("{n}", String(lines.length))}</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface"><tr><th className="th">{S.colUraian}</th><th className="th">{S.detQty}</th><th className="th">{S.detPrice}</th><th className="th">{S.detAmount}</th></tr></thead>
                    <tbody className="divide-y divide-steel-100">
                      {lines.map((l: unknown, i: number) => {
                        const r = l as Record<string, unknown>;
                        return (
                          <tr key={i}>
                            <td className="td font-medium text-navy-900">{String(r.desc ?? "-")}</td>
                            <td className="td text-steel-600">{String(r.qty ?? r.hours ?? "-")} {String(r.unit ?? "")}</td>
                            <td className="td text-steel-600">{fmtRupiah(num(r.price ?? r.rate))}</td>
                            <td className="td font-semibold">{fmtRupiah(num(r.amount ?? num(r.qty) * num(r.price)))}</td>
                          </tr>
                        );
                      })}
                      {lines.length === 0 && <tr><td colSpan={4} className="td text-center text-steel-400">-</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-steel-200 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">{S.detProof}</p>
                  {bukti ? (
                    <button type="button" onClick={() => void openProof(bukti)} className="block w-full overflow-hidden rounded-lg border border-steel-200" title={S.detOpenFull}>
                      <SecureImg src={bukti} alt={`Bukti ${invDetail.id}`} className="h-44 w-full object-contain bg-steel-50" />
                    </button>
                  ) : <p className="text-xs italic text-steel-400">{S.detNoProof}</p>}
                </div>
                <div className="rounded-xl border border-steel-200 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">{S.detJournals.replace("{n}", String(relJurnal.length))}</p>
                  {relJurnal.length === 0 && <p className="text-xs italic text-steel-400">{S.detNoJournal}</p>}
                  <div className="max-h-44 space-y-1.5 overflow-y-auto">
                    {relJurnal.map((j) => {
                      const lamp = String(j.lampiranUrl ?? j.buktiUrl ?? "");
                      return (
                        <div key={String(j.id)} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-xs">
                          <span className="font-mono font-semibold text-navy-900">{String(j.dokumen ?? j.id)}</span>
                          <span className="truncate text-steel-500">{String(j.uraian ?? "")}</span>
                          <span className="ml-auto font-semibold">{fmtRupiah(num(j.amount))}</span>
                          {lamp && <button type="button" className="font-semibold text-ocean-600 hover:underline" onClick={() => setJuViewer(j)}>{S.viewBtn}</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Viewer lampiran jurnal (gambar). */}
      <Modal open={juViewer !== null} onClose={() => setJuViewer(null)} title={juViewer ? S.juViewTitle.replace("{a}", String(juViewer.dokumen ?? juViewer.id)) : S.juAttachLabel}
        subtitle={juViewer ? String(juViewer.uraian ?? "") : ""}
        footer={<><button className="btn-secondary" onClick={() => setJuViewer(null)}>{S.cancelBtn}</button></>}>
        {juViewer && (() => {
          const lamp = String(juViewer.lampiranUrl ?? juViewer.buktiUrl ?? "");
          return lamp ? (
            <div className="overflow-hidden rounded-xl border border-steel-200">
              <SecureImg src={lamp} alt={String(juViewer.dokumen ?? juViewer.id)} className="max-h-96 w-full object-contain bg-steel-50" />
            </div>
          ) : <p className="text-sm italic text-steel-400">{S.juNoAttach}</p>;
        })()}
      </Modal>

    </div>
  );
}