import { useEffect, useMemo, useState } from "react";
import { bucketByMonth, monthAxis, rebindLegacyMonthSeries } from "../../utils/monthAxis";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, Cpu, Pencil, Trash2, Wrench, AlertTriangle, Gauge, CheckCircle2, Download, Search } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, RadialGauge, Modal, Field, FormGrid, EmptyState, ConfirmModal, StatusBadge, toast, SortTh, toggleSort, sortRows, usePager,
  NumInput, AsyncButton,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem, CollectionKey } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { equipmentHours, sparkUtil, equipTotalTrend, maintTrend, serviceDueTrend } from "../../data";
import { fmtTanggal, fmtJumlah, fmtRupiah, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import {
  MAINT_JENIS,
  MAINT_STATUS,
  MAINT_STATUS_TONE,
  canRestoreStock,
  canTransition,
  costBreakdown,
  historyOf,
  isMaintStatus,
  materialsCost,
  materialsOf,
  nextStatuses,
  planShortages,
  planStockCut,
  statusOf,
  workDaysOf,
  type MaintHistoryEntry,
  type MaintStatus,
} from "../../utils/maintenance";
import {
  equipmentCostSummary,
  maintenanceDowntimeHours,
  type EquipmentCostSummary,
} from "../../utils/projectCost";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { exportExcel } from "../../utils/export";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_eqp } from "../../i18n/n_eqp";

const BOOK_PRIORITIES = ["Normal", "Tinggi", "Kritis"];
const TARGET_HOURS = 176;
const EQ_CATS = ["Pengangkat", "Pengelasan", "Tenaga", "Transportasi", "Pengecatan", "Lainnya"];

/* Tarif harian teknisi untuk hitung biaya tenaga servis.
   DEFAULT ini hanya fallback - angka bisnis sebenarnya ada di settings
   (EQUIP_LABOR_RATE_PER_DAY), dibaca saat siklus dibuat supaya tarif
   tidak mengikat seluruh riwayat lampau yang sudah terpakai. */
const DEFAULT_LABOR_RATE_PER_DAY = 750000;

/* ================= FORM SIKLUS MAINTENANCE ================= */

interface MaintForm {
  equipmentId: string;
  jenis: string;
  tanggal: string;
  eta: string;
  teknisiId: string;
  /** Proyek tempat biaya servis ini dibebankan (HPP proyek). */
  projectId: string;
  catatan: string;
  /** Hour meter saat mulai & saat selesai (odometer tidak boleh mundur). */
  hours: string;
  hoursAfter: string;
  downtimeHours: string;
  /** Baris material: { itemId, qty } - qty masih string (input). */
  mats: { itemId: string; qty: string }[];
}

function emptyMaintForm(): MaintForm {
  return {
    equipmentId: "",
    jenis: MAINT_JENIS[0],
    tanggal: todayISO(),
    eta: "",
    teknisiId: "",
    projectId: "",
    catatan: "",
    hours: "",
    hoursAfter: "",
    downtimeHours: "0",
    mats: [],
  };
}

/** Label status siklus untuk UI (id/en). */
function maintStatusLabel(s: MaintStatus, locale: string): string {
  if (locale !== "en") return s;
  return s === "Terjadwal" ? "Scheduled" : s === "Sedang Proses" ? "In Progress" : s === "Selesai" ? "Done" : "Cancelled";
}

function isMaintJenis(v: unknown): v is string {
  return typeof v === "string" && (MAINT_JENIS as readonly string[]).includes(v);
}



/* Chart jam/bulan memakai sumbu bulan berurutan dari utils/monthAxis.ts.

   alignToTrailingMonths() lama memutar seed equipmentHours dengan
   findIndex(d.month === curName). Karena nama bulan berjalan hampir
   selalu tidak ada di seed (jendelanya Sep..Ags), rotasi TIDAK terjadi
   sama sekali: label dihitung ulang tiap bulan sementara datanya tetap,
   sehingga seluruh grafik bergeser satu bulan setiap pergantian bulan
   tanpa satu pun angka yang berubah.

   Sekarang jam diambil dari booking yang benar-benar selesai - field
   `hours` diisi saat booking diselesaikan (lihat confirmFinish) - lalu
   di-bucket per bulan dari tanggal booking. */

/* Seluruh jam/input waktu memakai format 24 jam (00:00–23:59, tanpa AM/PM).
   norm24() menormalkan data lama AM/PM ("02:00 PM" → "14:00") agar konsisten;
   input memakai type="time" + step 5 menit + lang id-ID (render 24H di browser). */
function norm24(t: unknown): string {
  const s = String(t ?? "").trim();
  if (!s) return "";
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?\s?[Mm]\.?$/.exec(s);
  if (m) {
    let h = Number(m[1]) % 12;
    if (/^[Pp]/.test(m[3])) h += 12;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  }
  const m2 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m2) return s;
  const h = Math.min(23, Math.max(0, Number(m2[1])));
  const min = Math.min(59, Math.max(0, Number(m2[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function fmtJam24(jam: unknown): string {
  const parts = String(jam ?? "").split(/\s*[–—-]\s*/);
  if (parts.length >= 2) {
    const a = norm24(parts[0]);
    const b = norm24(parts.slice(1).join("-"));
    if (/^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b)) return `${a}–${b}`;
  }
  const single = norm24(jam);
  return /^\d{2}:\d{2}$/.test(single) ? single : String(jam ?? "-");
}

function toMinutes(t: string): number | null {
  const n = norm24(t);
  const m = /^(\d{1,2}):(\d{2})$/.exec(n.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function parseJam(jam: string): { mulai: string; selesai: string } | null {
  const norm = String(jam ?? "").replace(/([AaPp])\.?\s?[Mm]\.?/g, (x) => ` ${x.toUpperCase()}`);
  const m = /(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[–—-]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i.exec(norm);
  if (!m) return null;
  return { mulai: norm24(m[1]), selesai: norm24(m[2]) };
}

function bookingRange(b: StoreItem): { mulai: number; selesai: number } | null {
  const rawMulai = typeof b.mulai === "string" && b.mulai ? b.mulai : parseJam(String(b.jam ?? ""))?.mulai;
  const rawSelesai = typeof b.selesai === "string" && b.selesai ? b.selesai : parseJam(String(b.jam ?? ""))?.selesai;
  if (!rawMulai || !rawSelesai) return null;
  const a = toMinutes(rawMulai);
  const c = toMinutes(rawSelesai);
  if (a === null || c === null) return null;
  return { mulai: a, selesai: c };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function durationHours(mulai: string, selesai: string): number {
  const a = toMinutes(mulai);
  const b = toMinutes(selesai);
  if (a === null || b === null || b <= a) return 0;
  return Math.round(((b - a) / 60) * 10) / 10;
}

function daysUntil(dateISO: string, today: string): number | null {
  if (!dateISO || dateISO === "-") return null;
  const ms = Date.parse(dateISO) - Date.parse(today);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86400000);
}

function isMeasuring(e: StoreItem): boolean {
  return /las|ukur|load|meter/i.test(`${e.name ?? ""} ${e.category ?? ""} ${e.code ?? ""}`);
}

function isCalExpired(eqId: string, calibrations: StoreItem[], today: string): boolean {
  return calibrations.some((c) => c.equipmentId === eqId && c.status !== "Selesai" && String(c.due ?? "") < today);
}

function depreciationOf(e: StoreItem): { annual: number; book: number } | null {
  const cost = Number(e.acquisitionCost || 0);
  const life = Number(e.usefulLife || 0);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(life) || life <= 0) return null;
  const annual = cost / life;
  return { annual, book: Math.max(0, cost - annual) };
}

/* Indikator utilisasi (global): <40% rendah-nganggur, 40–85% optimal, >85% overuse.
   Target global 176 jam/bulan. Makin tinggi belum tentu baik — >85% berarti butuh maintenance/reschedule. */
function utilGrade(v: number, en: boolean): { label: string; tone: "green" | "amber" | "red"; desc: string } {
  if (v > 85) return { label: en ? "Overuse · perlu maintenance" : "Overuse · butuh maintenance", tone: "red", desc: en ? "over 85% — schedule maintenance / add unit" : ">85% — jadwalkan maintenance / tambah unit" };
  if (v >= 40) return { label: en ? "Optimal" : "Optimal", tone: "green", desc: en ? "healthy load 40–85% (booking ÷ 176h)" : "beban sehat 40–85% (jam booking ÷ 176)" };
  return { label: en ? "Rendah · nganggur" : "Rendah · nganggur", tone: "amber", desc: en ? "under 40% — unit idle" : "<40% — alat nganggur" };
}

/* Indikator baik/buruk OEE: ≥70% baik, 40–70% cukup, <40% buruk. */
function oeeGrade(v: number, en: boolean): { label: string; tone: "green" | "amber" | "red" } {
  if (v >= 0.7) return { label: en ? "Good" : "Baik", tone: "green" };
  if (v >= 0.4) return { label: en ? "Fair" : "Cukup", tone: "amber" };
  return { label: en ? "Poor" : "Buruk", tone: "red" };
}

/* Batch koleksi modul Equipment untuk useModuleSync (pengganti resync penuh). */
const EQ_COLS: CollectionKey[] = ["activities", "bookings", "branches", "calibrations", "equipment", "inventory", "projects", "maintenances", "employees", "movements", "settings"];

export default function EquipmentPage() {
  const { data, add, update, remove, log, branch } = useStore();
  const { locale } = useT();
  const S = n_eqp[locale];
  const modAlert = useModuleAlert("equipment");
  const flash = useNotifFlash();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(EQ_COLS);
  const equipment = data.equipment;
  const bookings = data.bookings;
  const calibrations = data.calibrations;
  const maintenances = data.maintenances;
  const employees = data.employees;
  const projects = data.projects;
  const [tab, setTab] = useState("Register");

  /* Heatmap hari x jam dari booking nyata. Sumbu jam diambil dari jam
     mulai booking (jam field "08:00-17:00"), jadi heatmap ikut bergerak
     kalau jadwal kerja berubah - tidak seperti deret mock yang angkanya
     tetap. Slot dengan 0 sengaja dibiarkan kosong, bukan dihitung 100%. */
  const HOUR_COLS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const DAY_LABELS = locale === "en"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const equipmentHeatmapReal = useMemo(() => {
    const grid = new Map<string, Map<number, number>>();
    for (const b of bookings) {
      const raw = String(b.date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) continue;
      const d = new Date(`${raw}T00:00:00`);
      if (Number.isNaN(d.getTime())) continue;
      // getDay(): 0=Minggu -> indeks 6 supaya urut Sen..Min
      const dayIdx = (d.getDay() + 6) % 7;
      const hourMatch = /(\d{1,2}):/.exec(String(b.jam ?? ""));
      const hour = hourMatch ? Number(hourMatch[1]) : 8;
      if (!grid.has(DAY_LABELS[dayIdx])) grid.set(DAY_LABELS[dayIdx], new Map());
      const rowMap = grid.get(DAY_LABELS[dayIdx]) as Map<number, number>;
      rowMap.set(hour, (rowMap.get(hour) ?? 0) + 1);
    }
    return DAY_LABELS.map((day) => {
      const cells: Record<number, number> = {};
      for (const h of HOUR_COLS) cells[h] = grid.get(day)?.get(h) ?? 0;
      return { day, cells };
    });
  }, [bookings, locale]);
  const heatMax = Math.max(1, ...equipmentHeatmapReal.flatMap((r) => HOUR_COLS.map((h) => r.cells[h] ?? 0)));
  const heatTotal = equipmentHeatmapReal.reduce(
    (s, r) => s + HOUR_COLS.reduce((a, h) => a + (r.cells[h] ?? 0), 0),
    0,
  );
  const [eqQ, setEqQ] = useState("");
  const [utilQ, setUtilQ] = useState("");
  const [utilDraft, setUtilDraft] = useState<Record<string, string>>({});
  const [eqStatus, setEqStatus] = useState("Semua");
  const [eqCat, setEqCat] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });
  const [sort4, setSort4] = useState<SortState>({ key: null, dir: "asc" });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [delEquip, setDelEquip] = useState<StoreItem | null>(null);
  const [form, setForm] = useState({ name: "", category: "Pengangkat", categoryCustom: "", code: "", serial: "", branch: "Samarinda", model: "", pic: "", util: "50", rate: "", fuelPrice: "0", acquisitionCost: "", usefulLife: "" });
  const [showService, setShowService] = useState(false);


  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ equip: "", proyek: "", date: todayISO(), mulai: "", selesai: "", priority: "Normal" });
  const [bookError, setBookError] = useState<string | null>(null);
  const [gusur, setGusur] = useState<{ clash: StoreItem[] } | null>(null);

  const [finishing, setFinishing] = useState<StoreItem | null>(null);
  const [finishHours, setFinishHours] = useState("");
  const [finishDowntime, setFinishDowntime] = useState("0");
  const [finishFuel, setFinishFuel] = useState("0");

  /* ================= SIKLUS MAINTENANCE (koleksi `maintenances`) =================
     Alur: Terjadwal -> Sedang Proses -> Selesai, atau Dibatalkan dari mana saja
     selain Selesai. Setiap transisi masuk ke maintenance.history[].

     `maintenanceForm` dipakai untuk create (dari tombol Jadwalkan) maupun
     update (dari tombol Ubah) - satu form, satu handler, supaya tidak ada
     dua jalur tulis yang bisa berbedaivrsi. */
  const [maintForm, setMaintForm] = useState<MaintForm>(emptyMaintForm());
  const [maintEditingId, setMaintEditingId] = useState<string | null>(null);
  const [delMaint, setDelMaint] = useState<StoreItem | null>(null);
  const [histOf, setHistOf] = useState<StoreItem | null>(null);

  const [showCal, setShowCal] = useState(false);
  const [calForm, setCalForm] = useState({ equipmentId: "", item: "", due: "" });
  /* id kalibrasi yang sedang diedit (null = jadwal baru). */
  const [calEditId, setCalEditId] = useState<string | null>(null);
  const [delCal, setDelCal] = useState<StoreItem | null>(null);
  const [finishingCal, setFinishingCal] = useState<StoreItem | null>(null);
  const [calCert, setCalCert] = useState("");
  const [calResult, setCalResult] = useState("Lulus");
  const [calDoneDate, setCalDoneDate] = useState(todayISO());
  const [calInterval, setCalInterval] = useState("12");

  const today = todayISO();

  /* Booking dicocokkan by ID/code; nama lama tetap terbaca (fallback) untuk data lama. */
  const resolveEquip = (ref: unknown): StoreItem | undefined => {
    const key = String(ref ?? "").trim();
    if (!key) return undefined;
    return equipment.find((e) => String(e.id) === key || String(e.code ?? "").toUpperCase() === key.toUpperCase())
      ?? equipment.find((e) => sameName(e.name, key));
  };
  const equipKey = (ref: unknown): string => resolveEquip(ref)?.id ?? `name:${String(ref ?? "").trim().toLowerCase()}`;
  const equipLabel = (ref: unknown): string => {
    const e = resolveEquip(ref);
    return e ? `${e.name} (${e.code})` : String(ref ?? "-");
  };
  const invCost = (it: StoreItem): number => {
    const a = Number(it.avgCost);
    return a > 0 ? a : Number(it.cost || 0);
  };
  /* Utilisasi Auto global: jam booking Selesai bulan berjalan ÷ 176 × 100%.
     Default Auto; Manual hanya bila dikunci eksplisit (utilManual === true). */
  const autoUtilOf = (eq: StoreItem): number => {
    const month = today.slice(0, 7);
    const hours = bookings
      .filter((b) => b.status === "Selesai" && equipKey(b.equip) === String(eq.id) && String(b.date ?? "").slice(0, 7) === month)
      .reduce((s, b) => s + Number(b.hours || 0), 0);
    return Math.min(100, Math.round((hours / TARGET_HOURS) * 100));
  };
  const autoHoursOf = (eq: StoreItem): number => {
    const month = today.slice(0, 7);
    return bookings
      .filter((b) => b.status === "Selesai" && equipKey(b.equip) === String(eq.id) && String(b.date ?? "").slice(0, 7) === month)
      .reduce((s, b) => s + Number(b.hours || 0), 0);
  };
  const dispUtil = (eq: StoreItem): number =>
    (eq.utilManual === true) ? Number(eq.util || 0) : autoUtilOf(eq);

  /* Kategori custom ikut filter: gabungan baku + kategori tersimpan. */
  const allCats = useMemo(() => {
    const extra = equipment.map((e) => String(e.category ?? "").trim()).filter((c) => c && !EQ_CATS.includes(c));
    return [...EQ_CATS, ...Array.from(new Set(extra)).sort()];
  }, [equipment]);

  /* Chart jam/bulan: sumbu bulan berurutan, angka dari booking yang selesai.
     Seed equipmentHours hanya dipakai kalau belum ada booking Selesai
     sama sekali, supaya kurvanya tidak kosong di install baru. */
  const hoursAxis = useMemo(
    () => monthAxis({ months: 12, locale: locale as "id" | "en" }),
    [locale],
  );
  const hoursChart = useMemo(() => {
    const done = bookings.filter((b) => String(b.status ?? "") === "Selesai");
    const bucket = bucketByMonth(
      done,
      hoursAxis,
      (b) => b.date,
      (b) => Number(b.hours || 0),
      (vals) => vals.reduce((s, x) => s + x, 0),
    );
    const anyReal = Object.values(bucket).some((v) => v > 0);
    if (!anyReal) {
      return rebindLegacyMonthSeries(equipmentHours, { locale: locale as "id" | "en" }).map((r) => ({
        label: r.bln,
        jam: Number(r.jam || 0),
      }));
    }
    return hoursAxis.map((pt) => ({ label: pt.label, jam: bucket[pt.key] ?? 0 }));
  }, [bookings, hoursAxis, locale]);

  /* Nama proyek booking → link detail + nama kapal. */
  const projOf = (id: unknown): StoreItem | undefined =>
    (data.projects ?? []).find((p) => String(p.id) === String(id));
  const projCell = (id: unknown): ReactNode => {
    const p = projOf(id);
    const key = String(id ?? "-");
    if (!p) return <span className="font-mono text-xs text-steel-500">{key}</span>;
    return (
      <Link to={`/proyek/${p.id}`} className="font-medium text-ocean-600 hover:underline" title={String(p.vessel ?? p.id)}>
        {String(p.vessel ?? p.id)}
        <span className="ml-1 font-mono text-[11px] font-normal text-steel-400">{p.id}</span>
      </Link>
    );
  };

  const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
    Tersedia: "green",
    Terpakai: "blue",
    Maintenance: "amber",
  };

  const maintenance = equipment.filter((e) => e.status === "Maintenance").length;
  const avgUtil = equipment.length ? Math.round(equipment.reduce((s, e) => s + dispUtil(e), 0) / equipment.length) : 0;
  const dueSoon = equipment.filter((e) => {
    const d = daysUntil(String(e.nextService ?? ""), today);
    return d !== null && d <= 14;
  });

  const activeBookings = bookings.filter((b) => b.status !== "Selesai");
  const conflictIds = new Set<string>();
  for (let i = 0; i < activeBookings.length; i++) {
    for (let j = i + 1; j < activeBookings.length; j++) {
      const a = activeBookings[i];
      const b = activeBookings[j];
      if (equipKey(a.equip) !== equipKey(b.equip) || a.date !== b.date) continue;
      const ra = bookingRange(a);
      const rb = bookingRange(b);
      if (ra && rb && rangesOverlap(ra.mulai, ra.selesai, rb.mulai, rb.selesai)) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }
  const conflictList = activeBookings.filter((b) => conflictIds.has(b.id));

  const doneBookings = bookings.filter((b) => b.status === "Selesai");
  const statsByEquip = (ref: string): { hours: number; downtime: number; fuel: number } => ({
    hours: doneBookings.filter((b) => equipKey(b.equip) === equipKey(ref)).reduce((s, b) => s + Number(b.hours || 0), 0),
    downtime: doneBookings.filter((b) => equipKey(b.equip) === equipKey(ref)).reduce((s, b) => s + Number(b.downtime || 0), 0),
    fuel: doneBookings.filter((b) => equipKey(b.equip) === equipKey(ref)).reduce((s, b) => s + Number(b.fuelLiters || 0), 0),
  });
  const oeeOf = (name: string): { avail: number; perf: number; oee: number } | null => {
    const st = statsByEquip(name);
    if (st.hours <= 0) return null;
    const avail = Math.min(1, Math.max(0, 1 - st.downtime / st.hours));
    const perf = Math.min(1, st.hours / TARGET_HOURS);
    return { avail, perf, oee: avail * perf };
  };
  const oeeValues = equipment.map((e) => oeeOf(e.name)).filter((v): v is { avail: number; perf: number; oee: number } => v !== null);
  const avgOee = oeeValues.length ? oeeValues.reduce((s, v) => s + v.oee, 0) / oeeValues.length : null;
  const costByProject = new Map<string, { hours: number; downtime: number; cost: number }>();
  doneBookings.forEach((b) => {
    const key = String(b.proyek ?? "-");
    const cur = costByProject.get(key) ?? { hours: 0, downtime: 0, cost: 0 };
    cur.hours += Number(b.hours || 0);
    cur.downtime += Number(b.downtime || 0);
    cur.cost += Number(b.cost || 0);
    costByProject.set(key, cur);
  });
  const costRows = Array.from(costByProject.entries());
  const totalCost = costRows.reduce((s, [, v]) => s + v.cost, 0);

  /* ================= DERIVED: SIKLUS MAINTENANCE ================= */

  /* Baris tabel maintenance. Satu siklus per baris dari koleksi
     `maintenances`; equipment yang belum punya siklus TIDAK ikut tampil
     (dulu tabelnya iterating equipment, sehingga "jadwal servis berikutnya"
     tercampur dengan riwayat servis sebelumnya). */
  /* Tarif tenaga per hari dari settings. Harus DILETAKKAN DI ATAS maintRows:
     useMemo menjalankan factory-nya saat render, jadi const yang dipanggil di
     dalamnya belum boleh dideklarasikan setelahnya (TDZ). */
  const laborRate = (): number => {
    const row = data.settings.find((s) => String(s.key ?? "") === "EQUIP_LABOR_RATE_PER_DAY");
    const n = Number(row?.value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_LABOR_RATE_PER_DAY;
  };

  const maintRows = useMemo(() => {
    return maintenances.map((m) => {
      const st = statusOf(m);
      const materials = materialsOf(m);
      const materialCost = materialsCost(materials);
      const breakdown = costBreakdown(m, { laborRatePerDay: Number(m.laborRatePerDay ?? laborRate()) });
      const eq = equipment.find((e) => String(e.id) === String(m.equipmentId));
      const short = planShortages(planStockCut(m, data.inventory));
      return {
        raw: m,
        id: String(m.id),
        equipmentId: String(m.equipmentId ?? ""),
        equipmentName: String(m.equipmentName ?? eq?.name ?? m.equipmentId ?? "-"),
        jenis: String(m.jenis ?? ""),
        tanggal: String(m.tanggal ?? ""),
        eta: String(m.eta ?? ""),
        status: st,
        teknisi: String(m.teknisi ?? ""),
        projectId: String(m.projectId ?? ""),
        materials,
        materialCost,
        laborCost: breakdown.labor,
        costTotal: st === "Selesai" ? breakdown.total : materialCost,
        downtimeHours: maintenanceDowntimeHours(m),
        workDays: workDaysOf(m),
        deducted: canRestoreStock(m),
        shortages: short,
        history: historyOf(m),
        /* Transisi berikutnya yang boleh diklik (dari utils/maintenance). */
        next: nextStatuses(st),
      };
    });
  }, [maintenances, equipment, data.inventory]);

  const maintSorted = useMemo(() => sortRows(maintRows, sort2, (r, k) => {
    if (k === "equipment") return r.equipmentName;
    if (k === "jadwal") return r.tanggal;
    if (k === "jenis") return r.jenis;
    if (k === "status") return r.status;
    if (k === "proyek") return r.projectId;
    if (k === "biaya") return r.costTotal;
    if (k === "catatan") return String(r.raw.catatan ?? "");
    return r.id;
  }), [maintRows, sort2]);

  const maintPager = usePager(maintSorted.length, 15);
  useEffect(() => { maintPager.reset(); }, [sort2, tab]);

  const maintStats = useMemo(() => {
    const byStatus: Record<MaintStatus, number> = { Terjadwal: 0, "Sedang Proses": 0, Selesai: 0, Dibatalkan: 0 };
    let costRealized = 0;
    let costCommitted = 0;
    let downtime = 0;
    for (const r of maintRows) {
      byStatus[r.status] += 1;
      if (r.status === "Selesai") {
        costRealized += r.costTotal;
        downtime += r.downtimeHours;
      } else if (r.status !== "Dibatalkan") {
        costCommitted += r.materialCost;
      }
    }
    return { byStatus, costRealized, costCommitted, downtime };
  }, [maintRows]);

  /* Legacy: equipment.nextService yang belum punya baris maintenances.
     Ditampilkan sebagai baris readonly supaya tidak ada jadwal yang hilang
     setelah pindah ke koleksi baru. */
  const legacyMaint = useMemo(() => {
    const covered = new Set(maintenances.map((m) => String(m.equipmentId ?? "")));
    return equipment.filter((e) => {
      const ns = String(e.nextService ?? "");
      return ns !== "" && ns !== "-" && !covered.has(String(e.id));
    });
  }, [equipment, maintenances]);

  /* ================= DERIVED: BIAYA EQUIPMENT PER PROYEK (HPP) =================
     Dipakai tab "Biaya" dan, yang lebih penting, diekspor ke
     pages/proyek/ProjectDetail.tsx lewat utils/projectCost.ts supaya modul
     Proyek menghitung HPP dari sumber angka yang sama. */
  const projectCostSummaries = useMemo(() => {
    const out = new Map<string, EquipmentCostSummary>();
    for (const p of projects) {
      const id = String(p.id);
      out.set(id, equipmentCostSummary(id, bookings, maintenances, equipment));
    }
    return out;
  }, [projects, bookings, maintenances, equipment]);

  const projectCostRows = useMemo(() => Array.from(projectCostSummaries.entries())
    .filter(([, s]) => s.totalRealized > 0 || s.totalCommitted > 0)
    .map(([projectId, s]) => {
      const proj = projects.find((p) => String(p.id) === projectId);
      return {
        projectId,
        vessel: String(proj?.vessel ?? ""),
        client: String(proj?.client ?? ""),
        rental: s.rental,
        fuel: s.fuel,
        maintRealized: s.maintenanceRealized,
        maintCommitted: s.maintenanceCommitted,
        realized: s.totalRealized,
        committed: s.totalCommitted,
      };
    })
    .sort((a, b) => b.committed - a.committed), [projectCostSummaries, projects]);

  const regFiltered = equipment.filter((e) => {
    if (eqStatus !== "Semua" && String(e.status ?? "") !== eqStatus) return false;
    if (eqCat !== "Semua" && String(e.category ?? "") !== eqCat) return false;
    const needle = eqQ.trim().toLowerCase();
    if (!needle) return true;
    return `${e.name ?? ""} ${e.code ?? ""} ${e.model ?? ""}`.toLowerCase().includes(needle);
  });
  const regSorted = useMemo(() => sortRows(regFiltered, sort, (e, k) => {
    if (k === "utilisasi") return (e.utilManual === true) ? Number(e.util || 0) : autoUtilOf(e);
    if (k === "jam") return Number(e.lastHours || 0);
    if (k === "tarif") return Number(e.rate || 0);
    if (k === "nilaibuku") return Number(depreciationOf(e)?.book ?? -1);
    if (k === "kategori") return String(e.category ?? "");
    if (k === "model") return String(e.model ?? "");
    if (k === "status") return String(e.status ?? "");
    return String(e.name ?? "");
  }), [regFiltered, sort, bookings, today]);
  const regPager = usePager(regFiltered.length);
  const pickNotif = (rowId: string) => {
    const key = String(rowId);
    const idx = regSorted.findIndex((e) => String(e.id) === key);
    if (idx >= 0) {
      if (tab === "Register") { flash.pick(key, idx, regPager.go, regPager.size); return; }
      setTab("Register");
      window.setTimeout(() => { flash.pick(key, idx, regPager.go, regPager.size); }, 250);
      return;
    }
    const found = equipment.find((e) => String(e.id) === key);
    if (!found) { flash.pick(key, -1, () => {}, 100); return; }
    const fullSorted = sortRows(equipment, sort, (e, k) => {
      if (k === "utilisasi") return Number(e.util || 0);
      if (k === "jam") return Number(e.lastHours || 0);
      if (k === "tarif") return Number(e.rate || 0);
      if (k === "nilaibuku") return Number(depreciationOf(e)?.book ?? -1);
      if (k === "kategori") return String(e.category ?? "");
      if (k === "model") return String(e.model ?? "");
      if (k === "status") return String(e.status ?? "");
      return String(e.name ?? "");
    });
    const fullIdx = fullSorted.findIndex((e) => String(e.id) === key);
    setTab("Register");
    setEqStatus("Semua");
    setEqCat("Semua");
    window.setTimeout(() => {
      if (fullIdx >= 0) flash.pick(key, fullIdx, regPager.go, regPager.size);
      else flash.pick(key, -1, () => {}, 100);
    }, 250);
  };
  useEffect(() => {
    regPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqQ, eqStatus, eqCat, tab]);

  /* ==== UBAH / HAPUS EQUIPMENT (tab Register) ====
   Satu form dipakai untuk create & update supaya aturan validasi kode/serial/
   tarif tidak bercabang. `saveAdd()` sudah menyimpan angka hasil validasi ke
   state `form`; `saveEdit()` menuliskan patch yang sama minus field kunci
   yang tidak boleh berubah (kode equipment = id bisnis, jadi terkunci). */
  const openEdit = (e: StoreItem) => {
    setEditingId(String(e.id));
    setForm({
      name: String(e.name ?? ""),
      category: String(e.category ?? EQ_CATS[0]),
      categoryCustom: "",
      code: String(e.code ?? ""),
      serial: String(e.serial ?? ""),
      branch: String(e.branch ?? "Samarinda"),
      model: String(e.model ?? ""),
      pic: String(e.pic ?? ""),
      util: String(e.util ?? 0),
      rate: String(Number(e.rate ?? 0)),
      fuelPrice: String(Number(e.fuelPrice ?? 0)),
      acquisitionCost: String(Number(e.acquisitionCost ?? 0)),
      usefulLife: String(Number(e.usefulLife ?? 0)),
    });
    setShowAdd(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const category = form.category === "Lainnya" ? form.categoryCustom.trim() : form.category;
    if (!form.name.trim()) { toast(locale === "en" ? "Equipment name is required" : "Nama equipment wajib diisi", "info"); return; }
    if (!category) { toast(locale === "en" ? "Custom category is required" : "Kategori kustom wajib diisi", "info"); return; }
    if (!form.serial.trim()) { toast(locale === "en" ? "Serial number is required" : "Nomor seri wajib diisi", "info"); return; }
    /* Kode equipment = identitas bisnis (dipakai label QR, booking, kontrak
       sewa). Mengubahnya melenceng dari semua rujukan lama, jadi form ubah
       sengaja tidak menyediakan kolom kode sama sekali. */
    const rate = Number(form.rate || 0);
    const fuelPrice = Number(form.fuelPrice || 0);
    const acquisitionCost = Number(form.acquisitionCost || 0);
    const usefulLife = Number(form.usefulLife || 0);
    if (!Number.isFinite(rate) || rate < 0) { toast(S.eqRateMin, "info"); return; }
    if (!Number.isFinite(fuelPrice) || fuelPrice < 0) { toast(S.eqFuelMin, "info"); return; }
    if ((form.acquisitionCost && (!Number.isFinite(acquisitionCost) || acquisitionCost < 0))
      || (form.usefulLife && (!Number.isFinite(usefulLife) || usefulLife <= 0))) {
      toast(S.eqCostLife, "info");
      return;
    }
    try {
      await update("equipment", editingId, {
        name: form.name.trim(),
        category,
        model: form.model.trim() || "-",
        serial: form.serial.trim(),
        branch: form.branch,
        pic: form.pic.trim(),
        rate: Math.round(rate),
        fuelPrice: Math.round(fuelPrice),
        acquisitionCost: Math.round(acquisitionCost),
        usefulLife,
      });
      log("mengubah equipment", `${editingId} - ${form.name.trim()}`, "Equipment");
      toast(locale === "en" ? `Equipment ${form.name.trim()} updated` : `Equipment ${form.name.trim()} diperbarui`);
      setShowAdd(false);
      setEditingId(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /** Hapus equipment, diblokir bila masih punya booking / kalibrasi /
      siklus maintenance - semuanya jadi yatim tanpa induknya. */
  const confirmDelEquip = async () => {
    if (!delEquip) return;
    try {
      await remove("equipment", String(delEquip.id));
      log("menghapus equipment", `${delEquip.id} - ${delEquip.name ?? ""}`, "Equipment");
      toast(locale === "en" ? `Equipment ${delEquip.id} deleted` : `Equipment ${delEquip.id} dihapus`);
      setDelEquip(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveAdd = async () => {
    try {
    if (!form.name.trim() || !form.code.trim()) { toast(S.eqReqNameCode, "info"); return; }
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) { toast(S.eqCodeFormat, "info"); return; }
    if (equipment.some((e) => String(e.code).toUpperCase() === code)) { toast(S.eqCodeUsed.replace("{a}", code), "info"); return; }
    if (!form.serial.trim()) { toast(S.eqSerialReq, "info"); return; }
    if (!form.pic.trim()) { toast(S.eqPicReq, "info"); return; }
    /* Kategori "Lainnya" → teks custom wajib, tersimpan sebagai kategori + ikut filter. */
    const category = form.category === "Lainnya" ? form.categoryCustom.trim() : form.category;
    if (!category) { toast(locale === "en" ? "Custom category is required" : "Kategori kustom wajib diisi", "info"); return; }
    const util = Number(form.util);
    if (!Number.isFinite(util) || util < 0 || util > 100) { toast(S.eqUtilRange, "info"); return; }
    const rate = Number(form.rate || 0);
    if (!Number.isFinite(rate) || rate < 0) { toast(S.eqRateMin, "info"); return; }
    const fuelPrice = Number(form.fuelPrice || 0);
    const acquisitionCost = Number(form.acquisitionCost || 0);
    const usefulLife = Number(form.usefulLife || 0);
    if (fuelPrice < 0 || !Number.isFinite(fuelPrice)) { toast(S.eqFuelMin, "info"); return; }
    if ((form.acquisitionCost && (!Number.isFinite(acquisitionCost) || acquisitionCost < 0)) || (form.usefulLife && (!Number.isFinite(usefulLife) || usefulLife <= 0))) {
      toast(S.eqCostLife, "info");
      return;
    }
    const created = await add("equipment", {
      name: form.name.trim(), category, code, serial: form.serial.trim(), branch: form.branch,
      status: "Tersedia", util: 0, utilManual: false, nextService: "-", lastHours: 0, model: form.model.trim() || "-",
      pic: form.pic.trim(), rate, fuelPrice, acquisitionCost, usefulLife,
    }, { action: "mendaftarkan equipment", module: "Equipment" });
    toast(S.eqAdded.replace("{a}", created.id));
    setShowAdd(false);
    setForm({ name: "", category: "Pengangkat", categoryCustom: "", code: "", serial: "", branch: "Samarinda", model: "", pic: "", util: "50", rate: "", fuelPrice: "0", acquisitionCost: "", usefulLife: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ================= SIKLUS MAINTENANCE ================= */
  /** materialsOfRow -> array snapshot siap tulis, dari baris form. */
  /**materialsOfRow -> array snapshot siap tulis, dari baris form. */
  const matsFromForm = (rows: MaintForm["mats"]) => {
    const out: { itemId: string; name: string; qty: number; unit: string; cost: number }[] = [];
    for (const r of rows) {
      if (!r.itemId) continue;
      const q = Number(r.qty);
      if (!Number.isFinite(q) || q <= 0) continue;
      const it = data.inventory.find((x) => String(x.id) === r.itemId);
      if (!it) continue;
      out.push({
        itemId: String(it.id),
        name: String(it.name ?? it.id),
        qty: q,
        unit: String(it.unit ?? ""),
        /* Snapshot harga saat servis dicatat - harga beli bisa naik
           di masa depan, tapi riwayat harus mencerminkan biaya saat itu. */
        cost: invCost(it),
      });
    }
    return out;
  };

  /** Buka form untuk equipment tertentu (dari tombol Jadwalkan). */
  const openMaintNew = (equipmentId?: string) => {
    const id = equipmentId ?? equipment[0]?.id ?? "";
    const eq = equipment.find((e) => String(e.id) === id);
    setMaintEditingId(null);
    setMaintForm({
      ...emptyMaintForm(),
      equipmentId: id,
      /* Hour meter diisi dari odometer saat ini: kolom hours = sebelum,
         hoursAfter = diisi teknisi saat pekerjaan selesai. */
      hours: eq ? String(eq.lastHours ?? 0) : "",
    });
    setShowService(true);
  };

  /** Buka form UBAH satu siklus yang sudah ada. */
  const openMaintEdit = (m: StoreItem) => {
    const mats = materialsOf(m);
    const eq = equipment.find((e) => String(e.id) === String(m.equipmentId));
    setMaintEditingId(String(m.id));
    setMaintForm({
      equipmentId: String(m.equipmentId ?? eq?.id ?? ""),
      jenis: isMaintJenis(m.jenis) ? String(m.jenis) : MAINT_JENIS[0],
      tanggal: String(m.tanggal ?? todayISO()),
      eta: String(m.eta ?? ""),
      teknisiId: String(m.teknisiId ?? ""),
      projectId: String(m.projectId ?? ""),
      catatan: String(m.catatan ?? ""),
      hours: String(m.hours ?? eq?.lastHours ?? 0),
      hoursAfter: String(m.hoursAfter ?? m.hours ?? eq?.lastHours ?? 0),
      downtimeHours: String(m.downtimeHours ?? 0),
      mats: mats.map((x) => ({ itemId: x.itemId, qty: String(x.qty) })),
    });
    setShowService(true);
  };

  const closeMaint = () => {
    setShowService(false);
    setMaintEditingId(null);
    setMaintForm(emptyMaintForm());
  };

  /**
   * Simpan siklus maintenance (create atau update).
   *
   * Pemotongan stok TIDAK dilakukan di sini - hanya saat siklus berstatus
   * Selesai (lihat advanceMaintStatus). Ini penting supaya menjadwalkan
   * servis tidak menahan stok, dan supaya material bisa diubah bebas
   * selama pekerjaan belum terealisasi.
   */
  const saveMaint = async () => {
    const form = maintForm;
    const eqId = form.equipmentId.trim();
    if (!eqId) { toast(locale === "en" ? "Pick an equipment" : "Pilih equipment", "info"); return; }
    if (!form.tanggal) { toast(locale === "en" ? "Date is required" : "Tanggal wajib diisi", "info"); return; }
    const eq = equipment.find((e) => String(e.id) === eqId);
    if (!eq) { toast(locale === "en" ? "Unknown equipment" : "Equipment tidak dikenal", "info"); return; }

    const hours = Number(form.hours || eq.lastHours || 0);
    const hoursAfter = Number(form.hoursAfter || form.hours || eq.lastHours || 0);
    if (!Number.isFinite(hours) || !Number.isFinite(hoursAfter) || hours < 0 || hoursAfter < 0) {
      toast(locale === "en" ? "Hour meter must be a valid number" : "Hour meter harus angka valid", "info");
      return;
    }
    if (hoursAfter < hours) {
      toast(
        locale === "en"
          ? `Hour meter cannot go backwards (${fmtJumlah(hours)} -> ${fmtJumlah(hoursAfter)})`
          : `Hour meter tidak boleh mundur (${fmtJumlah(hours)} -> ${fmtJumlah(hoursAfter)})`,
        "info",
      );
      return;
    }

    /* Downtime ikut menentukan HPP (maintenanceDowntimeHours dipakai untuk
       mundur ke hitungan hari kerja saat field ini kosong), jadi harus
       berupa angka >= 0. Nilai NaN/negatif yang lolos akan tersimpan
       sebagai null di JSON dan menjatuhkan perhitungan biaya diam-diam. */
    const downtimeHours = Number(form.downtimeHours || 0);
    if (!Number.isFinite(downtimeHours) || downtimeHours < 0) {
      toast(
        locale === "en"
          ? "Downtime hours must be a number of 0 or more"
          : "Downtime harus angka 0 atau lebih",
        "info",
      );
      return;
    }

    /* Validasi material: item harus dikenal & stok cukup. Divalidasi di sini
       (bukan hanya saat Selesai) supaya planner tahu sooner dan tidak
       discovering kekurangan saat pekerjaan sudah berjalan. */
    const materials = matsFromForm(form.mats);
    const draft = { ...(maintEditingId ? (data.maintenances.find((m) => m.id === maintEditingId) ?? {}) : {}), materials };
    const short = planShortages(planStockCut(draft, data.inventory));
    if (short.length > 0) {
      toast(
        locale === "en"
          ? `Insufficient stock: ${short.map((s) => `${s.name} (need ${fmtJumlah(s.qty)}, have ${fmtJumlah(s.available)})`).join("; ")}`
          : `Stok kurang: ${short.map((s) => `${s.name} (butuh ${fmtJumlah(s.qty)}, tersedia ${fmtJumlah(s.available)})`).join("; ")}`,
        "info",
      );
      return;
    }

    const proj = projects.find((p) => String(p.id) === form.projectId);
    const teknisi = employees.find((e) => String(e.id) === form.teknisiId);
    const materialCost = materialsCost(materials);
    /* Biaya tenaga dihitung dari hari kerja; saat baru dijadwalkan (belum
       ada tanggal selesai) hari kerja 0, jadi total = material saja. */
    const breakdown = costBreakdown(
      { ...draft, mulai: form.tanggal, selesai: String(form.eta || "") },
      { laborRatePerDay: laborRate() },
    );

    const row = {
      equipmentId: eqId,
      equipmentName: String(eq.name ?? eqId),
      equipmentCode: String(eq.code ?? ""),
      tanggal: form.tanggal,
      jenis: form.jenis,
      /* Status TIDAK bisa diubah lewat form ini - lewat advanceMaintStatus
         supaya semua perpindahan status tercatat di history[]. */
      status: maintEditingId
        ? statusOf(data.maintenances.find((m) => m.id === maintEditingId) ?? {})
        : "Terjadwal",
      teknisiId: form.teknisiId,
      teknisi: String(teknisi?.name ?? form.teknisiId ?? ""),
      mulai: form.tanggal,
      selesai: statusOf(data.maintenances.find((m) => m.id === maintEditingId) ?? {}) === "Selesai"
        ? String(data.maintenances.find((m) => m.id === maintEditingId)?.selesai ?? "")
        : "",
      eta: form.eta,
      catatan: form.catatan.trim(),
      projectId: form.projectId,
      projectName: String(proj?.id ?? ""),
      hours,
      hoursAfter,
      materials,
      materialCost,
      downtimeHours,
      laborCost: breakdown.labor,
      costTotal: breakdown.total,
      laborRatePerDay: laborRate(),
      branch: String(eq.branch ?? ""),
    };

    try {
      if (maintEditingId) {
        const prev = data.maintenances.find((m) => m.id === maintEditingId);
        await update("maintenances", maintEditingId, {
          ...row,
          /* deducted TIDAK diubah di sini - siklus yang sudah Selesai punya
             stok terpotong; ubah material-nya lewat adjustMaintMaterials
             supaya delta stok dihitung, bukan dipotong ulang. */
          deducted: canRestoreStock(prev ?? {}),
        });
        log("mengubah maintenance", `${maintEditingId} - ${eq.name} - ${fmtTanggal(form.tanggal)}`, "Equipment");
      } else {
        await add(
          "maintenances",
          {
            ...row,
            createdAt: todayISO(),
            createdBy: "Anda",
            deducted: false,
            history: [
              { at: `${todayISO()} ${new Date().toTimeString().slice(0, 5)}`, from: "-", to: "Terjadwal", by: "Anda", note: form.catatan.trim() },
            ],
          },
          { action: "menjadwalkan maintenance", target: `${eq.name} - ${fmtTanggal(form.tanggal)}`, module: "Equipment" },
        );
        log("menjadwalkan maintenance", `${eq.name} - ${fmtTanggal(form.tanggal)}${materials.length > 0 ? ` - kebutuhan ${materials.map((m) => `${m.name} x ${m.qty}`).join("; ")}` : ""}`, "Equipment");
      }
      toast(maintEditingId ? (locale === "en" ? "Maintenance updated" : "Maintenance diperbarui") : (locale === "en" ? "Maintenance scheduled" : "Maintenance dijadwalkan"));
      closeMaint();
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /**
   * Ubah qty material pada siklus yang stoknya SUDAH terpotong.
   * Dipakai tombol Ubah di baris berstatus Selesai: yang dihitung adalah
   * DELTA (kurang/tambah), bukan jumlah baru - supaya adjusting tidak
   * menggandakan atau mengembalikan seluruh stok.
   */
  const adjustMaintMaterials = async (m: StoreItem, next: { itemId: string; qty: string }[]) => {
    const prevMats = materialsOf(m);
    const nextMats = matsFromForm(next);
    const delta = new Map<string, number>();
    for (const x of nextMats) delta.set(x.itemId, (delta.get(x.itemId) ?? 0) + x.qty);
    for (const x of prevMats) delta.set(x.itemId, (delta.get(x.itemId) ?? 0) - x.qty);

    /* Simulasikan dulu seluruh delta, baru tulis. Menulis sambil loop
       berarti kegagalan di tengah menyisakan stok setengah terpotong. */
    const nextStock = new Map<string, number>();
    for (const [itemId, d] of delta) {
      if (d === 0) continue;
      const it = data.inventory.find((x) => String(x.id) === itemId);
      if (!it) { toast(locale === "en" ? "Unknown material" : "Material tidak dikenal", "info"); return; }
      const cur = nextStock.get(itemId) ?? Number(it.stock || 0);
      const after = cur - d;
      if (after < 0) {
        toast(
          locale === "en"
            ? `Not enough stock for ${it.name}: need ${fmtJumlah(-d)} more, have ${fmtJumlah(cur)}`
            : `Stok ${it.name} tidak cukup: perlu ${fmtJumlah(-d)} lagi, tersedia ${fmtJumlah(cur)}`,
          "info",
        );
        return;
      }
      nextStock.set(itemId, after);
    }
    try {
      for (const [itemId, stock] of nextStock) {
        await update("inventory", itemId, { stock });
      }
      const materialCost = materialsCost(nextMats);
      await update("maintenances", String(m.id), {
        materials: nextMats,
        materialCost,
        costTotal: materialCost + Number(m.laborCost ?? 0) + Number(m.otherCost ?? 0),
      });
      log(
        "mengoreksi material maintenance",
        `${m.id}${nextStock.size > 0 ? ` - ${[...nextStock].map(([id, s]) => `${id} -> ${fmtJumlah(s)}`).join("; ")}` : ""}`,
        "Equipment",
      );
      toast(locale === "en" ? "Material corrected, stock adjusted" : "Material dikoreksi, stok disesuaikan");
      closeMaint();
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /**
   * Majukan/batalkan status satu siklus.
   *
   * Titik kritis: pemotongan stok terjadi TEPAT SEKALI saat masuk Selesai.
   * Flag `deducted` yang menjaganya - tanpa itu, dua kali klik Selesai akan
   * memotong stok dua kali. Membatalkan siklus yang sudah Selesai tidak
   * lewat sini (status final) - pakai cancelMaint yang mengembalikan stok.
   */
  const advanceMaintStatus = async (m: StoreItem, to: MaintStatus, note?: string) => {
    const from = statusOf(m);
    if (!canTransition(from, to)) {
      toast(
        locale === "en"
          ? `Cannot move from ${from} to ${to}`
          : `Tidak bisa pindah dari ${maintStatusLabel(from, locale)} ke ${maintStatusLabel(to, locale)}`,
        "info",
      );
      return;
    }
    const materials = materialsOf(m);
    const patch: Record<string, unknown> = {
      status: to,
      history: [
        ...historyOf(m),
        {
          at: `${todayISO()} ${new Date().toTimeString().slice(0, 5)}`,
          from,
          to,
          by: "Anda",
          note: note ?? "",
        },
      ],
    };

    try {
      if (to === "Sedang Proses") {
        patch.mulai = String(m.mulai || m.tanggal || todayISO());
        /* Unit masuk workshop: equipment.status = Maintenance supaya tak bisa
           dibooking lagi (saveBooking menolak status Maintenance). */
        await update("maintenances", String(m.id), patch);
        await update("equipment", String(m.equipmentId), {
          status: "Maintenance",
          maintenanceNote: String(m.catatan ?? ""),
          maintenanceEta: String(m.eta ?? ""),
        });
      } else if (to === "Selesai") {
        /* --- REALISASI: potong stok material (sekali) --- */
        if (!canRestoreStock(m)) {
          const short = planShortages(planStockCut({ ...m, materials }, data.inventory));
          if (short.length > 0) {
            toast(
              locale === "en"
                ? `Insufficient stock: ${short.map((s) => `${s.name} (need ${fmtJumlah(s.qty)}, have ${fmtJumlah(s.available)})`).join("; ")}`
                : `Stok kurang: ${short.map((s) => `${s.name} (butuh ${fmtJumlah(s.qty)}, tersedia ${fmtJumlah(s.available)})`).join("; ")}`,
              "info",
            );
            return;
          }
          for (const r of materials) {
            if (r.itemId === "") continue;
            const it = data.inventory.find((x) => String(x.id) === r.itemId);
            if (!it) continue;
            await update("inventory", r.itemId, { stock: Number(it.stock || 0) - r.qty });
            await add(
              "movements",
              {
                item: r.name || String(it.name ?? r.itemId),
                itemId: r.itemId,
                type: "Pengeluaran",
                qty: r.qty,
                by: `Servis ${String(m.equipmentName ?? m.equipmentId)} - ${fmtTanggal(String(m.tanggal ?? todayISO()))}`,
                date: todayISO(),
                tone: "out",
                fromWh: String(it.warehouse ?? ""),
                toWh: "",
                purpose: `Servis ${String(m.equipmentName ?? m.equipmentId)}`,
                pic: String(m.teknisi ?? ""),
                projectId: String(m.projectId ?? ""),
                keterangan: `Maintenance ${String(m.id)}`,
              },
              { action: "material servis", target: `${r.name} × ${r.qty} (${m.id})`, module: "Equipment" },
            );
          }
          patch.deducted = true;
        }
        patch.selesai = todayISO();
        patch.hoursAfter = String(m.hoursAfter || m.hours || 0);
        /* equipment.nextService diisi dari siklus ini supaya tab Register
           tetap menampilkan jadwal berikutnya (kolom legacy itu tetap
           dibaca modul lain). */
        await update("maintenances", String(m.id), patch);
        await update("equipment", String(m.equipmentId), {
          status: "Tersedia",
          lastHours: Number(m.hoursAfter || m.hours || 0),
          lastServiceMaterials: materials.length > 0 ? materials : undefined,
          lastServiceCost: materialsCost(materials),
          nextService: String(m.eta && m.eta !== "" ? m.eta : "-"),
          maintenanceNote: "",
          maintenanceEta: "",
        });
      } else if (to === "Dibatalkan") {
        patch.selesai = todayISO();
        await update("maintenances", String(m.id), patch);
        await update("equipment", String(m.equipmentId), {
          status: "Tersedia",
          maintenanceNote: "",
          maintenanceEta: "",
        });
      }
      log(
        to === "Selesai" ? "menyelesaikan maintenance" : to === "Dibatalkan" ? "membatalkan maintenance" : "memulai maintenance",
        `${m.id} - ${String(m.equipmentName ?? m.equipmentId)}${note ? ` - ${note}` : ""}`,
        "Equipment",
      );
      toast(
        to === "Selesai"
          ? (locale === "en" ? "Maintenance completed - stock deducted" : "Maintenance selesai - stok dipotong")
          : to === "Dibatalkan"
            ? (locale === "en" ? "Maintenance cancelled" : "Maintenance dibatalkan")
            : (locale === "en" ? "Maintenance started" : "Maintenance dimulai"),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /**
   * Batalkan siklus yang SUDAH SELESAI (stok sudah terpotong).
   * Stok dikembalikan DAN movements koreksi dicatat supaya nilai
   * inventori tetap bisa ditelusuri, bukan hanya diubah diam-diam.
   */
  const cancelCompletedMaint = async (m: StoreItem) => {
    if (!canRestoreStock(m)) return;
    try {
      for (const r of materialsOf(m)) {
        if (r.itemId === "") continue;
        const it = data.inventory.find((x) => String(x.id) === r.itemId);
        if (!it) continue;
        await update("inventory", r.itemId, { stock: Number(it.stock || 0) + r.qty });
        await add(
          "movements",
          {
            item: r.name || String(it.name ?? r.itemId),
            itemId: r.itemId,
            type: "Retur",
            qty: r.qty,
            by: `Pembatalan maintenance ${String(m.id)}`,
            date: todayISO(),
            tone: "in",
            fromWh: "",
            toWh: String(it.warehouse ?? ""),
            supplier: `Servis ${String(m.equipmentName ?? m.equipmentId)}`,
            pic: "Anda",
            keterangan: `Maintenance ${String(m.id)} dibatalkan`,
          },
          { action: "koreksi material servis", target: `${r.name} × ${r.qty} (${m.id})`, module: "Equipment" },
        );
      }
      const from = statusOf(m);
      await update("maintenances", String(m.id), {
        status: "Dibatalkan",
        deducted: false,
        selesai: todayISO(),
        history: [
          ...historyOf(m),
          {
            at: `${todayISO()} ${new Date().toTimeString().slice(0, 5)}`,
            from,
            to: "Dibatalkan",
            by: "Anda",
            note: "stok material dikembalikan",
          },
        ],
      });
      await update("equipment", String(m.equipmentId), { status: "Tersedia" });
      log("membatalkan maintenance selesai", `${m.id} - stok dikembalikan`, "Equipment");
      toast(locale === "en" ? "Cancelled - stock returned" : "Dibatalkan - stok dikembalikan");
      setDelMaint(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /** Hapus satu siklus. Stok dikembalikan bila siklus sudah memotong stok. */
  const confirmDelMaint = async () => {
    if (!delMaint) return;
    const m = delMaint;
    if (canRestoreStock(m)) {
      await cancelCompletedMaint(m);
      await remove("maintenances", String(m.id));
      log("menghapus maintenance", `${m.id} - stok dikembalikan`, "Equipment");
      toast(locale === "en" ? "Maintenance record deleted" : "Data maintenance dihapus");
      setDelMaint(null);
      return;
    }
    try {
      await remove("maintenances", String(m.id));
      log("menghapus maintenance", String(m.id), "Equipment");
      toast(locale === "en" ? "Maintenance record deleted" : "Data maintenance dihapus");
      setDelMaint(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };


  const clashOf = (equip: string, date: string, a: number, b: number): StoreItem[] =>
    bookings.filter((o) => {
      if (equipKey(o.equip) !== equipKey(equip) || o.date !== date || o.status === "Selesai") return false;
      const r = bookingRange(o);
      return r ? rangesOverlap(a, b, r.mulai, r.selesai) : false;
    });

  const persistBooking = async (priority: string) => {
    const { equip, proyek, date } = bookForm;
    const mulai = norm24(bookForm.mulai);
    const selesai = norm24(bookForm.selesai);
    const eq = resolveEquip(equip);
    if (!eq) { setBookError(S.eqNotFound); return; }
    const created = await add("bookings", { equip: eq.id, equipCode: eq.code, equipName: eq.name, proyek, jam: `${mulai}–${selesai}`, mulai, selesai, status: "Terjadwal", date, priority, branch: String((data.projects ?? []).find((p) => String(p.id) === String(proyek))?.branch ?? (branch !== "SEMUA" ? branch : "")) },
      { action: "membooking equipment", target: `${eq.name} · ${priority}`, module: "Equipment" });
    await update("equipment", eq.id, { status: "Terpakai" });
    toast(S.eqBookingCreated.replace("{a}", created.id).replace("{b}", priority));
    setShowBook(false);
    setBookError(null);
    setBookForm({ equip: "", proyek: "", date: todayISO(), mulai: "", selesai: "", priority: "Normal" });
  };

  const saveBooking = async () => {
    const { equip, proyek, date, mulai, selesai, priority } = bookForm;
    if (!equip || !proyek || !date || !mulai || !selesai) {
      setBookError(S.eqBookReq);
      return;
    }
    const a = toMinutes(mulai);
    const b = toMinutes(selesai);
    if (a === null || b === null || b <= a) {
      setBookError(S.eqBookTimeOrder);
      return;
    }
    const eq = resolveEquip(equip);
    if (!eq) { setBookError(S.eqNotFound); return; }
    if (eq.status === "Maintenance") {
      const msg = S.eqRejectMaint.replace("{a}", equipLabel(equip));
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    if (isMeasuring(eq) && isCalExpired(eq.id, calibrations, today)) {
      const msg = S.eqRejectCal.replace("{a}", equipLabel(equip));
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    const clash = clashOf(equip, date, a, b);
    if (clash.length > 0) {
      const gusurEligible = priority === "Kritis" && clash.every((c) => String(c.priority ?? "Normal") !== "Kritis");
      if (gusurEligible) {
        setGusur({ clash });
        return;
      }
      const msg = S.eqRejectClash.replace("{a}", equipLabel(equip)).replace("{b}", fmtTanggal(date));
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    try {
      await persistBooking(priority);
    } catch {
      toast(S.eqBookFail.replace("{a}", equipLabel(equip)), "info");
    }
  };

  const confirmGusur = async () => {
    if (!gusur) return;
    const names = gusur.clash.map((c) => `${c.id} (${c.proyek})`).join(", ");
    for (const c of gusur.clash) {
      try {
        await remove("bookings", c.id);
      } catch (err) {
        toast(S.eqGusurFail.replace("{a}", c.id).replace("{b}", err instanceof Error ? err.message : S.eqBackendDown), "info");
        return;
      }
    }
    log("menggusur booking", `${equipLabel(bookForm.equip)} · ${fmtTanggal(bookForm.date)} menggusur ${names}`, "Equipment");
    try {
      await persistBooking("Kritis");
    } catch (err) {
      toast(S.eqCritFail.replace("{a}", err instanceof Error ? err.message : S.eqBackendDown), "info");
      return;
    }
    toast(S.eqCritGusur.replace("{a}", names));
    setGusur(null);
  };

  const openFinish = (b: StoreItem) => {
    const r = bookingRange(b);
    setFinishing(b);
    setFinishHours(r ? String(durationHours(minutesToStr(r.mulai), minutesToStr(r.selesai))) : "");
    setFinishDowntime(String(b.downtime ?? 0));
    setFinishFuel(String(b.fuelLiters ?? 0));
  };

  const confirmFinish = async () => {
    try {
    if (!finishing) return;
    const hours = Number(finishHours);
    if (!Number.isFinite(hours) || hours <= 0) { toast(S.eqHoursPositive, "info"); return; }
    const downtime = Math.max(0, Number(finishDowntime) || 0);
    const fuelLiters = Math.max(0, Number(finishFuel) || 0);
    if (!Number.isFinite(fuelLiters) || fuelLiters < 0) { toast(S.eqFuelNonNeg, "info"); return; }
    const eq = resolveEquip(finishing.equip);
    const rate = Number(eq?.rate || 0);
    await update("bookings", finishing.id, { status: "Selesai", hours, downtime, fuelLiters, cost: hours * rate });
    if (eq) {
      const stillActive = bookings.some((o) => o.id !== finishing.id && equipKey(o.equip) === String(eq.id) && o.status !== "Selesai");
      await update("equipment", eq.id, {
        lastHours: Number(eq.lastHours || 0) + hours,
        status: stillActive ? eq.status : "Tersedia",
      });
    }
    log("menyelesaikan booking", `${equipLabel(finishing.equip)} · ${fmtTanggal(String(finishing.date))} · ${hours} jam · downtime ${downtime} jam`, "Equipment");
    toast(S.eqBookingDone.replace("{a}", finishing.id));
    setFinishing(null);
    setFinishHours("");
    setFinishDowntime("0");
    setFinishFuel("0");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveCalibration = async () => {
    try {
    if (!calForm.equipmentId || !calForm.item.trim() || !calForm.due) { toast(S.eqCalReq, "info"); return; }
    /* Backdate diizinkan: due boleh kemarin (pencatatan susulan kalibrasi lapangan). */
    const dupe = calibrations.some((c) => c.equipmentId === calForm.equipmentId && String(c.item).toLowerCase() === calForm.item.trim().toLowerCase() && c.status !== "Selesai");
    if (dupe) { toast(S.eqCalDupe, "info"); return; }
    const eq = equipment.find((e) => e.id === calForm.equipmentId);
    const created = await add("calibrations", {
      equipmentId: calForm.equipmentId, item: calForm.item.trim(), due: calForm.due, status: "Terjadwal", cert: "",
    }, { action: "menjadwalkan kalibrasi", target: `${eq?.name ?? calForm.equipmentId} · ${fmtTanggal(calForm.due)}`, module: "Equipment" });
    toast(S.eqCalScheduled.replace("{a}", created.id));
    setShowCal(false);
    setCalEditId(null);
    setCalForm({ equipmentId: "", item: "", due: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ==== UBAH / HAPUS KALIBRASI ====
     Tabel Kalibrasi hanya punya tombol Selesaikan. Kalibrasi Terjadwal yang
     due-nya bentrok atau alat ukurnya salah tidak bisa dikoreksi; jadwal
     dobel juga tidak bisa dihapus. */
  const openCalEdit = (c: StoreItem) => {
    setCalEditId(String(c.id));
    setCalForm({
      equipmentId: String(c.equipmentId ?? ""),
      item: String(c.item ?? ""),
      due: String(c.due ?? todayISO()),
    });
    setShowCal(true);
  };

  const saveCalEdit = async () => {
    if (!calEditId) return;
    if (!calForm.equipmentId || !calForm.item.trim() || !calForm.due) { toast(S.eqCalReq, "info"); return; }
    const dupe = calibrations.some(
      (c) => String(c.id) !== calEditId
        && String(c.equipmentId) === calForm.equipmentId
        && String(c.item).toLowerCase() === calForm.item.trim().toLowerCase()
        && c.status !== "Selesai",
    );
    if (dupe) { toast(S.eqCalDupe, "info"); return; }
    try {
      await update("calibrations", calEditId, {
        equipmentId: calForm.equipmentId,
        item: calForm.item.trim(),
        due: calForm.due,
      });
      log("mengubah kalibrasi", `${calEditId} - ${calForm.item.trim()} - ${fmtTanggal(calForm.due)}`, "Equipment");
      toast(locale === "en" ? `Calibration ${calEditId} updated` : `Kalibrasi ${calEditId} diperbarui`);
      setShowCal(false);
      setCalEditId(null);
      setCalForm({ equipmentId: "", item: "", due: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDelCal = async () => {
    if (!delCal) return;
    try {
      await remove("calibrations", String(delCal.id));
      log("menghapus kalibrasi", `${delCal.id} - ${delCal.item ?? ""}`, "Equipment");
      toast(locale === "en" ? `Calibration ${delCal.id} deleted` : `Kalibrasi ${delCal.id} dihapus`);
      setDelCal(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  function addMonthsISO(iso: string, months: number): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
    if (!m) return todayISO();
    const d = new Date(Number(m[1]), Number(m[2]) - 1 + months, Number(m[3]));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const confirmCalFinish = async () => {
    try {
    if (!finishingCal) return;
    if (!calCert.trim()) { toast(S.eqCertReq, "info"); return; }
    if (!calDoneDate) { toast(S.calDoneReq, "info"); return; }
    const interval = Math.max(1, Math.floor(Number(calInterval) || 12));
    const nextDue = addMonthsISO(calDoneDate, interval);
    const passed = calResult === "Lulus";
    await update("calibrations", finishingCal.id, { status: passed ? "Selesai" : "Gagal", cert: calCert.trim(), result: calResult, doneDate: calDoneDate });
    /* Auto-set due berikutnya: jadwal kalibrasi ulang otomatis dibuat. */
    const dupeNext = calibrations.some((c) => c.id !== finishingCal.id && c.equipmentId === finishingCal.equipmentId && String(c.item).toLowerCase() === String(finishingCal.item).toLowerCase() && c.status !== "Selesai" && c.status !== "Gagal");
    if (!dupeNext) {
      await add("calibrations", {
        equipmentId: finishingCal.equipmentId, item: String(finishingCal.item), due: nextDue, status: "Terjadwal", cert: "",
      }, { action: "menjadwalkan kalibrasi ulang", target: `${equipLabel(finishingCal.equipmentId)} · ${fmtTanggal(nextDue)}`, module: "Equipment" });
    }
    const eq = equipment.find((e) => e.id === finishingCal.equipmentId);
    log("menyelesaikan kalibrasi", `${finishingCal.id} · ${calResult} · sertifikat ${calCert.trim()} · due berikutnya ${fmtTanggal(nextDue)}`, "Equipment");
    toast(`${S.eqCalDone.replace("{a}", finishingCal.id)} · ${calResult} · berikutnya ${fmtTanggal(nextDue)}${eq ? ` (${eq.name})` : ""}`);
    setFinishingCal(null);
    setCalCert("");
    setCalResult("Lulus");
    setCalDoneDate(todayISO());
    setCalInterval("12");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveUtilOverride = async (eq: StoreItem, manual: boolean) => {
    try {
      if (manual) {
        const v = Number(utilDraft[eq.id] ?? eq.util);
        if (!Number.isFinite(v) || v < 0 || v > 100) { toast(S.eqUtilRange, "info"); return; }
        await update("equipment", eq.id, { util: v, utilManual: true });
        log("override utilisasi manual", `${eq.name} → ${v}%`, "Equipment");
        toast(`Utilisasi ${eq.name} dikunci manual ${v}%`);
      } else {
        await update("equipment", eq.id, { utilManual: false });
        log("utilisasi auto", `${eq.name} → auto ${autoUtilOf(eq)}%`, "Equipment");
        toast(`Utilisasi ${eq.name} mengikuti auto (${autoUtilOf(eq)}%)`);
      }
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const exportCost = () => {
    void exportExcel(
      [["Proyek", "Jam Pakai", "Downtime (jam)", "Biaya (Rp)"],
        ...costRows.map(([proj, v]) => [proj, v.hours, v.downtime, v.cost])],
      `Biaya-Equipment-${today}`,
      "Biaya",
    ).catch(() => toast(S.saveFail, "info"));
    toast(S.eqCostExported);
  };

  const exportRegister = () => {
    void exportExcel(
      [["Kode", "Nama", "Kategori", "Harga Perolehan (Rp)", "Umur Ekonomis (thn)", "Penyusutan/Tahun (Rp)", "Nilai Buku (Rp)", "Harga BBM/L (Rp)", "Total BBM (L)", "Biaya BBM (Rp)"],
        ...equipment.map((e) => {
          const dep = depreciationOf(e);
          const st = statsByEquip(e.name);
          const fuelCost = st.fuel * Number(e.fuelPrice || 0);
          return [e.code, e.name, e.category, Number(e.acquisitionCost || 0), Number(e.usefulLife || 0), dep ? Math.round(dep.annual) : 0, dep ? Math.round(dep.book) : 0, Number(e.fuelPrice || 0), st.fuel, Math.round(fuelCost)];
        })],
      `Register-Aset-Equipment-${today}`,
      "Register",
    ).catch(() => toast(S.saveFail, "info"));
    toast(S.eqRegisterExported);
  };

  return (
    <div>
      <PageHeader
        title={S.eqTitle}
        subtitle={S.eqSubtitle}
        icon={<Cpu className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> {S.eqAdd}</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.eqKpiTotal} value={String(equipment.length)} icon={<Cpu className="h-5 w-5" />} chip="navy" spark={equipTotalTrend} hint={S.eqKpiTotalHint} />
        <KpiCard label={S.eqKpiAvgUtil} value={`${avgUtil}%`} icon={<Gauge className="h-5 w-5" />} chip="teal" hint={S.eqKpiAvgHint} spark={sparkUtil} />
        <KpiCard label={S.eqKpiMaint} value={String(maintenance)} delta={S.eqKpiMaintDelta} deltaDirection="down" icon={<Wrench className="h-5 w-5" />} chip="amber" spark={maintTrend} />
        <KpiCard
          label={S.eqKpiDue}
          value={String(dueSoon.length)}
          delta={dueSoon.length > 0 ? dueSoon.slice(0, 2).map((e) => e.name).join(" · ") : S.eqKpiDueSafe}
          deltaDirection={dueSoon.length > 0 ? "down" : "up"}
          icon={<AlertTriangle className="h-5 w-5" />}
          chip="rose"
          spark={serviceDueTrend}
        />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Register", "Alokasi / Booking", "Maintenance", "Kalibrasi", "Biaya", "Utilisasi"]} active={tab} onChange={setTab} labels={{ Register: S.eqTabRegister, "Alokasi / Booking": S.eqTabBooking, Maintenance: S.eqTabMaint, Kalibrasi: S.eqTabCal, Biaya: S.eqTabCost, Utilisasi: S.eqTabUtil }} />
        <div className="p-4">
          {tab === "Register" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full" placeholder={S.eqSearchPh} aria-label={S.eqSearchAria} value={eqQ} onChange={(e) => setEqQ(e.target.value)} />
                </div>
                <FilterPopover
                  activeCount={[eqStatus !== "Semua", eqCat !== "Semua"].filter(Boolean).length}
                  initial={{ status: eqStatus, kategori: eqCat }}
                  onReset={() => { setEqQ(""); setEqStatus("Semua"); setEqCat("Semua"); }}
                  onApply={(d) => { setEqStatus(d.status); setEqCat(d.kategori); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.thStatus}>
                        <select className="input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {["Semua", "Tersedia", "Terpakai", "Maintenance"].map((s) => <option key={s} value={s}>{s === "Semua" ? S.eqAllStatus : s}</option>)}
                        </select>
                      </Field>
                      <Field label={S.thCategory}>
                        <select className="input w-full" value={draft.kategori} onChange={(e) => setDraft({ ...draft, kategori: e.target.value })}>
                          {["Semua", ...allCats].map((c) => <option key={c} value={c}>{c === "Semua" ? S.eqAllCat : c}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                </FilterPopover>
                {(eqQ.trim() !== "" || eqStatus !== "Semua" || eqCat !== "Semua") && (
                  <span className="text-xs text-steel-400">
                    {S.eqFilterActive.replace("{n}", String(regSorted.length))}
                  </span>
                )}
              </div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-steel-500">{S.eqBookNote}</p>
                <button className="btn-secondary text-xs" onClick={exportRegister}><Download className="h-3.5 w-3.5" /> {S.eqExportRegister}</button>
              </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr><SortTh label={S.thEquipment} sortKey="equipment" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thCategory} sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thModel} sortKey="model" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thUtil} sortKey="utilisasi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thHours} sortKey="jam" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thRate} sortKey="tarif" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thBookVal} sortKey="nilaibuku" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.thAction}</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {regPager.slice(regSorted).map((e) => {
                    const expired = isCalExpired(e.id, calibrations, today);
                    return (
                    <tr key={e.id} id={notifRowId(String(e.id))} className={flash.flashId === String(e.id) ? "notif-hl notif-flash hover:bg-surface" : (notified.has(String(e.id)) ? "notif-hl hover:bg-surface" : "hover:bg-surface")}>
                      <td className="td">
                        <p className="font-medium text-navy-900">{e.name}</p>
                        <p className="text-xs text-steel-500 font-mono">{e.code}</p>
                      </td>
                      <td className="td"><Badge tone="gray">{e.category}</Badge></td>
                      <td className="td text-steel-600">{e.model}</td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={statusTone[e.status] ?? "gray"}>{e.status}</Badge>
                          {isMeasuring(e) && expired && <Badge tone="red">{S.eqCalExpired}</Badge>}
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={dispUtil(e)} className="w-20" tone={dispUtil(e) > 85 ? "red" : dispUtil(e) >= 40 ? "green" : "amber"} />
                          <span className="text-xs font-medium">{dispUtil(e)}%</span>
                          <Badge tone={(e.utilManual === true) ? "gray" : "blue"}>{(e.utilManual === true) ? "Manual" : "Auto"}</Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-steel-400">{autoHoursOf(e)} jam ÷ 176 · {utilGrade(dispUtil(e), locale === "en").label}</p>
                      </td>
                      <td className="td text-steel-600 font-mono text-xs">{fmtJumlah(Number(e.lastHours || 0))} jam</td>
                      <td className="td text-steel-600 text-xs">
                        {Number(e.rate || 0) > 0 ? fmtRupiah(Number(e.rate)) : "-"}
                        <span className="block text-steel-400">BBM {fmtRupiah(Number(e.fuelPrice || 0))}/L</span>
                      </td>
                      <td className="td text-steel-600 text-xs">
                        {(() => {
                          const dep = depreciationOf(e);
                          if (!dep) return <span className="text-steel-400">-</span>;
                          return (
                            <span>
                              <span className="font-semibold text-navy-900">{fmtRupiah(Math.round(dep.book))}</span>
                              <span className="block text-steel-400">susut {fmtRupiah(Math.round(dep.annual))}/thn</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1.5">
                        {/* Aksi Register diarahkan ke ALUR SIKLUS, bukan lagi
                            toggle status langsung. Mulai = buat siklus
                            Terjadwal; Selesai = majukan siklus yang sedang
                            berjalan (bukan cuma membalik status equipment),
                            supaya material terpotong dan HPP proyek terisi. */}
                        {e.status === "Tersedia" && (
                          <button className="btn-secondary text-xs" onClick={() => openMaintNew(String(e.id))}>
                            <Wrench className="h-3.5 w-3.5" /> {locale === "en" ? "Schedule service" : "Jadwalkan Servis"}
                          </button>
                        )}
                        {e.status === "Maintenance" && (() => {
                          const cycle = maintRows.find((r) => r.equipmentId === String(e.id) && r.status === "Sedang Proses");
                          if (!cycle) {
                            return (
                              <span className="text-xs text-steel-500" title={locale === "en" ? "Flagged as Maintenance but no active cycle found. Create one." : "Berstatus Maintenance tapi siklus aktif tidak ditemukan. Buat siklus."}>
                                {locale === "en" ? "No active cycle" : "Tanpa siklus aktif"}
                              </span>
                            );
                          }
                          return (
                            <button
                              className="btn-primary text-xs"
                              onClick={() => void advanceMaintStatus(cycle.raw, "Selesai")}
                              title={locale === "en" ? "Complete the cycle and deduct material stock" : "Selesaikan siklus dan potong stok material"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> {S.eqComplete}
                            </button>
                          );
                        })()}
                        {e.status === "Terpakai" && (
                          <span className="text-xs text-steel-500">{S.eqBackToBooking}</span>
                        )}
                        {/* Ubah/Hapus equipment. Dulu tabel Register tidak punya
                            kolom aksi sama sekali selain lifecycle servis,
                            sehingga equipment yang salah tarif/jangka tidak
                            bisa dikoreksi dan equipment yang tak dipakai
                            selamanya tidak bisa dihapus. */}
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => openEdit(e)}
                          title={locale === "en" ? "Edit equipment" : "Ubah equipment"}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {S.eqEdit}
                        </button>
                        <button
                          className="btn-secondary text-xs text-rose-600"
                          onClick={() => setDelEquip(e)}
                          title={locale === "en" ? "Delete equipment" : "Hapus equipment"}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {S.delBtn}
                        </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {regPager.bar}
            </div>
            </div>
          )}

          {tab === "Alokasi / Booking" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.eqActiveBookings}</h3>
                  <button className="btn-secondary text-xs" onClick={() => { setShowBook(true); setBookError(null); }}><Plus className="h-3.5 w-3.5" /> {S.eqBookBtn}</button>
                </div>
                <div className="space-y-2.5">
                  {activeBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-navy-900" title={equipLabel(b.equip)}>{equipLabel(b.equip)}</p>
                        <p className="text-xs text-steel-500">{projCell(b.proyek)} · <span className="font-mono" title="Jam 24 jam">{fmtJam24(b.jam)}</span> · {fmtTanggal(String(b.date))} · {b.priority ?? "Normal"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={b.status === "Terpakai" ? "blue" : "gray"}>{b.status}</Badge>
                        <button className="btn-secondary text-xs" onClick={() => openFinish(b)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> {S.finishBtn}
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeBookings.length === 0 && (
                    <EmptyState title={S.eqNoBookingTitle} subtitle={S.eqNoBookingSub} />
                  )}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">{S.eqConflictTitle}</h3>
                {conflictList.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    <p className="font-medium">{S.eqNoConflict}</p>
                    <p className="mt-1 text-xs">{S.eqNoConflictDesc}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <p className="font-medium">{S.eqClashCount.replace("{n}", String(conflictList.length))}</p>
                      <p className="mt-1 text-xs">{S.eqClashDesc}</p>
                    </div>
                    {conflictList.map((b) => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border border-red-200 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900" title={`${equipLabel(b.equip)} · ${b.proyek}`}>{equipLabel(b.equip)} · {b.proyek}</p>
                          <p className="text-xs text-steel-500"><span className="font-mono" title="Jam 24 jam">{fmtJam24(b.jam)}</span> · {fmtTanggal(String(b.date))}</p>
                        </div>
                        <Badge tone="red">{S.eqClashBadge}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

{tab === "Maintenance" && (
            <div className="space-y-4">
              {/* ==== ALUR SIKLUS MAINTENANCE ====
                  Terjadwal -> Sedang Proses -> Selesai, atau Dibatalkan.
                  Setiap transisi menyimpan jejak di maintenance.history[] dan
                  memotong stok material TEPAT SEKALI saat masuk Selesai
                  (dijaga flag `deducted`). Tombol "Catat Servis" yang dulu
                  membuka form tanpa status kini berubah jadi tombol
                  Ubah / Riwayat / Hapus di kolom Aksi. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {(MAINT_STATUS as readonly string[]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-full border border-steel-200 bg-white px-2 py-0.5 text-[11px]">
                      <Badge tone={MAINT_STATUS_TONE[s as MaintStatus]}>{maintStatusLabel(s as MaintStatus, locale)}</Badge>
                      <span className="font-semibold text-navy-900">{maintStats.byStatus[s as MaintStatus]}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="input w-auto py-1.5 text-xs"
                    aria-label={locale === "en" ? "Pick equipment to schedule" : "Pilih equipment untuk dijadwalkan"}
                    value={maintForm.equipmentId}
                    onChange={(e) => setMaintForm({ ...maintForm, equipmentId: e.target.value })}
                  >
                    <option value="">{locale === "en" ? "-- equipment --" : "-- pilih equipment --"}</option>
                    {equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <button className="btn-primary-gradient text-xs" onClick={() => openMaintNew(maintForm.equipmentId || equipment[0]?.id)}>
                    <Wrench className="h-3.5 w-3.5" /> {locale === "en" ? "Schedule maintenance" : "Jadwalkan Maintenance"}
                  </button>
                </div>
</div>

              {/* ==== TABEL SIKLUS MAINTENANCE ==== */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr>
                      <SortTh label={locale === "en" ? "Cycle" : "Siklus"} sortKey="id" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={S.thEquipment} sortKey="equipment" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={locale === "en" ? "Type" : "Jenis"} sortKey="jenis" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={locale === "en" ? "Scheduled" : "Jadwal"} sortKey="jadwal" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={locale === "en" ? "Project (HPP)" : "Proyek (HPP)"} sortKey="proyek" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <th className="th">{locale === "en" ? "Material usage" : "Penggunaan Material"}</th>
                      <SortTh label={locale === "en" ? "Cost" : "Biaya"} sortKey="biaya" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <SortTh label={S.thStatus} sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                      <th className="th">{S.thAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {maintPager.slice(maintSorted).map((r) => (
                      <tr key={r.id} className="hover:bg-surface">
                        <td className="td font-mono text-xs text-navy-900">{r.id}</td>
                        <td className="td">
                          <p className="font-medium text-navy-900 truncate" title={r.equipmentName}>{r.equipmentName}</p>
                          {r.teknisi !== "" && <p className="text-[11px] text-steel-500 truncate">{r.teknisi}</p>}
                        </td>
                        <td className="td"><Badge tone="gray">{r.jenis || "-"}</Badge></td>
                        <td className="td text-steel-600 text-xs">
                          <p>{fmtTanggal(r.tanggal)}</p>
                          {r.eta !== "" && (
                            <p className="text-[11px] text-steel-400">ETA: {fmtTanggal(r.eta)}</p>
                          )}
                          {r.workDays > 0 && (
                            <p className="text-[11px] text-steel-400">{r.workDays} {locale === "en" ? "day(s)" : "hari kerja"}</p>
                          )}
                        </td>
                        <td className="td text-xs">
                          {r.projectId !== "" ? (
                            <Link to={`/proyek/${r.projectId}`} className="font-mono text-ocean-600 hover:underline">{r.projectId}</Link>
                          ) : (
                            <span className="text-steel-400" title={locale === "en" ? "Not charged to any project (overhead)" : "Tidak dibebankan ke proyek (overhead)"}>-</span>
                          )}
                        </td>
                        <td className="td text-xs text-steel-600">
                          {r.materials.length === 0 ? (
                            <span className="text-steel-400">-</span>
                          ) : (
                            <>
                              <ul className="space-y-0.5">
                                {r.materials.map((mt) => (
                                  <li key={`${mt.itemId}-${mt.qty}`} className="truncate" title={`${mt.name} x ${fmtJumlah(mt.qty)} ${mt.unit} = ${fmtRupiah(Math.round(mt.qty * mt.cost))}`}>
                                    {mt.name} × {fmtJumlah(mt.qty)} {mt.unit}
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-0.5 font-medium text-navy-900">{fmtRupiah(r.materialCost)}</p>
                              {r.status === "Selesai" ? (
                                <p className="text-[11px] text-emerald-600">
                                  {locale === "en" ? "stock deducted" : "stok sudah dipotong"}
                                </p>
                              ) : r.shortages.length > 0 ? (
                                <Badge tone="red" title={locale === "en" ? "Not enough stock at realization time" : "Stok tidak cukup saat pekerjaan diselesaikan"}>
                                  {locale === "en" ? "stock short" : "stok kurang"}
                                </Badge>
                              ) : (
                                <p className="text-[11px] text-steel-400">
                                  {locale === "en" ? "not deducted yet" : "belum dipotong"}
                                </p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="td text-xs">
                          <p className="font-semibold text-navy-900">{fmtRupiah(r.costTotal)}</p>
                          {r.laborCost > 0 && <p className="text-[11px] text-steel-400">{locale === "en" ? "incl. labor" : "incl. tenaga"}</p>}
                          {r.status === "Selesai" && r.downtimeHours > 0 && (
                            <p className="text-[11px] text-steel-400">
                              {locale === "en" ? "downtime" : "downtime"} {fmtJumlah(r.downtimeHours)} {locale === "en" ? "h" : "jam"}
                            </p>
                          )}
                        </td>
                        <td className="td">
                          <Badge tone={MAINT_STATUS_TONE[r.status]}>{maintStatusLabel(r.status, locale)}</Badge>
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {/* Transisi status berikutnya - hanya yang sah
                                (dari utils/maintenance nextStatuses). */}
                            {r.next.map((to) => (
                              <button
                                key={to}
                                className={to === "Dibatalkan" ? "btn-secondary text-xs" : "btn-primary text-xs"}
                                onClick={() => void advanceMaintStatus(r.raw, to)}
                              >
                                {to === "Sedang Proses"
                                  ? (locale === "en" ? "Start" : "Mulai")
                                  : to === "Selesai"
                                    ? (locale === "en" ? "Record service" : "Catat Servis")
                                    : (locale === "en" ? "Cancel" : "Batalkan")}
                              </button>
                            ))}
                            {/* Kolom Aksi: Ubah / Riwayat / Hapus - inilah
                                pengganti tombol "Catat Servis" tunggal yang
                                dulu tidak bisa mengoreksi hasil servis. */}
                            <button
                              className="btn-secondary text-xs"
                              onClick={() => openMaintEdit(r.raw)}
                              title={r.status === "Selesai"
                                ? (locale === "en" ? "Adjust materials - stock synced by delta" : "Koreksi material - stok disesuaikan by delta")
                                : (locale === "en" ? "Edit schedule" : "Ubah jadwal")}
                            >
                              {S.eqEdit}
                            </button>
                            <button
                              className="btn-secondary text-xs"
                              onClick={() => setHistOf(r.raw)}
                            >
                              {S.eqHistory}
                            </button>
                            <button
                              className="btn-secondary text-xs text-rose-600"
                              onClick={() => setDelMaint(r.raw)}
                            >
                              {S.delBtn}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {maintSorted.length === 0 && (
                      <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-steel-400">
                        {locale === "en"
                          ? "No maintenance cycles yet. Schedule one to start the Terjadwal -> Sedang Proses -> Selesai flow."
                          : "Belum ada siklus maintenance. Jadwalkan satu untuk memulai alur Terjadwal → Sedang Proses → Selesai."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
                {maintPager.bar}
              </div>

              {/* Baris legacy: equipment.nextService yang belum punya siklus.
                  Ditampilkan supaya tidak ada jadwal yang hilang saat pindah
                  ke koleksi maintenances. */}
              {legacyMaint.length > 0 && (
                <Card className="p-4">
                  <CardHeader
                    title={locale === "en" ? "Legacy next-service schedule" : "Jadwal Servis Legacy (belum ada siklus)"}
                    subtitle={locale === "en"
                      ? "These come from equipment.nextService only. Create a cycle to make them traceable."
                      : "Berasal dari equipment.nextService saja. Buat siklus agar bisa dilacak."}
                  />
                  <div className="mt-2 space-y-1">
                    {legacyMaint.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 border-b border-steel-100 py-1.5 text-sm">
                        <span className="truncate text-navy-900">{e.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-steel-500">{fmtTanggal(String(e.nextService))}</span>
                          <button className="btn-secondary !py-0.5 text-[11px]" onClick={() => openMaintNew(String(e.id))}>
                            {locale === "en" ? "Make cycle" : "Buat siklus"}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {tab === "Kalibrasi" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => { setCalEditId(null); setCalForm({ equipmentId: "", item: "", due: todayISO() }); setShowCal(true); }}><Plus className="h-3.5 w-3.5" /> {S.eqSchedCal}</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr><SortTh label={S.thId} sortKey="id" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thEquipment} sortKey="equipment" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thMeasure} sortKey="item" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thDue} sortKey="due" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thCert} sortKey="sertifikat" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thStatus} sortKey="status" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><th className="th">{S.thAction}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(calibrations, sort3, (c, k) => {
                      if (k === "equipment") return String(equipment.find((e) => e.id === c.equipmentId)?.name ?? c.equipmentId ?? "");
                      if (k === "item") return String(c.item ?? "");
                      if (k === "due") return String(c.due ?? "");
                      if (k === "sertifikat") return String(c.cert ?? "");
                      if (k === "status") return String(c.status ?? "");
                      return String(c.id ?? "");
                    }).map((c) => {
                      const eq = equipment.find((e) => e.id === c.equipmentId) ?? data.equipment.find((e) => e.id === c.equipmentId);
                      const expired = c.status !== "Selesai" && String(c.due ?? "") < today;
                      return (
                        <tr key={c.id} className="hover:bg-surface">
                          <td className="td font-mono font-medium text-navy-900">{c.id}</td>
                          <td className="td text-steel-600">{eq?.name ?? c.equipmentId}</td>
                          <td className="td text-steel-600">{c.item}</td>
                          <td className="td text-steel-600">{fmtTanggal(String(c.due))}</td>
                          <td className="td font-mono text-xs text-steel-600">{c.cert || "-"}</td>
                          <td className="td">
                            <div className="flex flex-wrap gap-1">
                              <StatusBadge status={String(c.status)} />
                              {c.result ? <Badge tone={String(c.result) === "Lulus" ? "green" : "red"}>{String(c.result)}</Badge> : null}
                              {expired && <Badge tone="red">{S.eqExpired}</Badge>}
                            </div>
                          </td>
                          <td className="td">
                            <div className="flex flex-wrap gap-1.5">
                              {c.status !== "Selesai" && c.status !== "Gagal" && (
                                <button className="btn-secondary text-xs" onClick={() => { setFinishingCal(c); setCalCert(""); setCalResult("Lulus"); setCalDoneDate(todayISO()); setCalInterval("12"); }}>{S.finishBtn}</button>
                              )}
                              {/* Kalibrasi yang sudah Terjadwal masih bisa
                                  dikoreksi (tanggaldue / alat ukur sering
                                  berubah karena jadwal clash), dan bisa dihapus
                                  kalau dijadwalkan dobel. Dulu tidak ada
                                  keduanya - hanya tombol Selesaikan. */}
                              <button
                                className="btn-secondary text-xs"
                                onClick={() => openCalEdit(c)}
                                title={locale === "en" ? "Edit calibration schedule" : "Ubah jadwal kalibrasi"}
                              >
                                <Pencil className="h-3.5 w-3.5" /> {S.eqEdit}
                              </button>
                              <button
                                className="btn-secondary text-xs text-rose-600"
                                onClick={() => setDelCal(c)}
                                title={locale === "en" ? "Delete calibration" : "Hapus kalibrasi"}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> {S.delBtn}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {calibrations.length === 0 && <tr><td colSpan={7} className="td text-center text-steel-400">{S.eqNoCal}</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-steel-500">{S.eqCalNote}</p>
            </div>
          )}

          {tab === "Biaya" && (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-navy-900">{S.eqCostTitle} <span className="text-xs font-normal text-steel-500">{S.eqCostHint}</span></h3>
                  <button className="btn-secondary text-xs" onClick={exportCost}><Download className="h-3.5 w-3.5" /> {S.eqExportExcel}</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-surface">
                      <tr><SortTh label={S.thProject} sortKey="proyek" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.thHours} sortKey="jam" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.thDowntime} sortKey="downtime" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /><SortTh label={S.thCost} sortKey="biaya" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} /></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(costRows, sort4, ([proj, v], k) => {
                        if (k === "jam") return Number(v.hours || 0);
                        if (k === "downtime") return Number(v.downtime || 0);
                        if (k === "biaya") return Number(v.cost || 0);
                        return String(proj ?? "");
                      }).map(([proj, v]) => (
                        <tr key={proj} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{projCell(proj)}</td>
                          <td className="td text-steel-600">{fmtJumlah(v.hours)} jam</td>
                          <td className="td text-steel-600">{fmtJumlah(v.downtime)} jam</td>
                          <td className="td font-semibold">{fmtRupiah(v.cost)}</td>
                        </tr>
                      ))}
                      {costRows.length === 0 && <tr><td colSpan={4} className="td text-center text-steel-400">{S.eqNoDoneBooking}</td></tr>}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-right text-sm font-semibold text-navy-900">{S.eqTotal.replace("{a}", fmtRupiah(totalCost))}</p>
              </Card>

              {/* ==== HPP PROYEK DARI EQUIPMENT ====
                  Tabel di atas hanya menjumlahkan booking selesai. Angka itu
                  TIDAK pernah masuk ke modul Proyek, sehingga HPP proyek
                  under-reported: sewa crane/genset dan material servis hilang
                  dari margin. Card ini menjumlahkan keduanya dari sumber yang
                  sama dengan utils/projectCost.ts (dipakai juga oleh
                  pages/proyek/ProjectDetail.tsx), jadi modul Equipment dan
                  modul Proyek tidak bisa lagi berbeda angka. */}
              <Card className="p-5">
                <CardHeader
                  title={locale === "en" ? "Equipment cost charged to projects (HPP)" : "Biaya Equipment yang Dibebankan ke Proyek (HPP)"}
                  subtitle={locale === "en"
                    ? "Realised = finished bookings + completed maintenance. Committed = plus work still in progress."
                    : "Terealisasi = booking selesai + maintenance selesai. Terkunci = ditambah pekerjaan yang masih berjalan."}
                />
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-surface">
                      <tr>
                        <SortTh label={S.thProject} sortKey="p" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <th className="th">{locale === "en" ? "Rental" : "Sewa"}</th>
                        <th className="th">BBM</th>
                        <th className="th">{locale === "en" ? "Maintenance (done)" : "Maintenance (selesai)"}</th>
                        <SortTh label={locale === "en" ? "Realised" : "Terealisasi"} sortKey="r" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        <SortTh label={locale === "en" ? "Committed" : "Terkunci"} sortKey="c" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(projectCostRows, sort3, (r, k) => {
                        if (k === "r") return r.realized;
                        if (k === "c") return r.committed;
                        return `${r.projectId} ${r.vessel}`;
                      }).map((r) => (
                        <tr key={r.projectId} className="hover:bg-surface">
                          <td className="td">
                            <p className="font-medium text-navy-900">{projCell(r.projectId)}</p>
                            {r.vessel !== "" && <p className="text-xs text-steel-500 truncate" title={r.vessel}>{r.vessel}</p>}
                          </td>
                          <td className="td text-steel-600">{fmtRupiah(r.rental)}</td>
                          <td className="td text-steel-600">{fmtRupiah(r.fuel)}</td>
                          <td className="td text-steel-600">
                            {fmtRupiah(r.maintRealized)}
                            {r.maintCommitted > 0 && (
                              <p className="text-[11px] text-amber-600">
                                + {fmtRupiah(r.maintCommitted)} {locale === "en" ? "in progress" : "berjalan"}
                              </p>
                            )}
                          </td>
                          <td className="td font-semibold text-navy-900">{fmtRupiah(r.realized)}</td>
                          <td className="td font-semibold">{fmtRupiah(r.committed)}</td>
                        </tr>
                      ))}
                      {projectCostRows.length === 0 && (
                        <tr><td colSpan={6} className="td text-center text-steel-400">
                          {locale === "en"
                            ? "No equipment cost booked to any project yet. Finish a booking or a maintenance cycle with a project selected."
                            : "Belum ada biaya equipment yang dibebankan ke proyek. Selesaikan booking atau siklus maintenance dengan proyek terpilih."}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-steel-500">
                  {locale === "en"
                    ? "These figures are the same ones Project Detail uses for cost vs budget, so the two modules cannot drift apart."
                    : "Angka ini sama dengan yang dipakai Project Detail untuk biaya vs anggaran, jadi kedua modul tidak bisa melenceng."}
                </p>
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.eqDoneHistory}</h3>
                <div className="space-y-2">
                  {doneBookings.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                      <div>
                        <p className="font-medium text-navy-900">{equipLabel(b.equip)} <span className="font-mono text-xs text-steel-500">· {b.id}</span></p>
                        <p className="text-xs text-steel-500">{projCell(b.proyek)} · {fmtTanggal(String(b.date))} · {b.hours ?? 0} jam · downtime {b.downtime ?? 0} jam · BBM {fmtJumlah(Number(b.fuelLiters || 0))} L</p>
                      </div>
                      <Badge tone="green">{fmtRupiah(Number(b.cost || 0))}</Badge>
                    </div>
                  ))}
                  {doneBookings.length === 0 && <p className="text-xs text-steel-400">{S.eqNoDoneBooking}</p>}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.eqFuelTitle} <span className="text-xs font-normal text-steel-500">{S.eqFuelHint}</span></h3>
                <div className="space-y-2">
                  {equipment.map((e) => {
                    const st = statsByEquip(e.name);
                    const fuelCost = st.fuel * Number(e.fuelPrice || 0);
                    return (
                      <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                        <div>
                          <p className="font-medium text-navy-900">{e.name}</p>
                          <p className="text-xs text-steel-500">{fmtJumlah(st.fuel)} L × {fmtRupiah(Number(e.fuelPrice || 0))}/L</p>
                        </div>
                        <Badge tone="amber">{fmtRupiah(Math.round(fuelCost))}</Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {tab === "Utilisasi" && (
            <div className="space-y-4">
              {/* Heatmap hari x jam, dihitung dari booking nyata. Sebelumnya
                  halaman ini hanya menampilkan utilisasi bulanan per alat,
                  jadi pola-jam sibuk (mis. Senin pagi penuh, Jumat sore
                  kosong) tidak pernah terlihat padahal itu yang menentukan
                  agregar unit. */}
              {bookings.length > 0 && (
                <Card className="p-5" data-export-hide>
                  <CardHeader
                    title={locale === "en" ? "Booking heatmap (day x hour)" : "Heatmap Booking (hari x jam)"}
                    subtitle={locale === "en"
                      ? "Counted from real booking records; darker means more units booked"
                      : "Dihitung dari baris booking nyata; makin gelap makin banyak unit terpakai"}
                  />
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-center">
                      <thead>
                        <tr>
                          <th className="w-16 text-[11px] font-medium text-steel-500" />
                          {HOUR_COLS.map((h) => (
                            <th key={h} className="text-[11px] font-medium text-steel-500">{h}:00</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentHeatmapReal.map((row) => (
                          <tr key={row.day}>
                            <th className="pr-2 text-right text-[11px] font-medium text-steel-600">{row.day}</th>
                            {HOUR_COLS.map((h) => {
                              const v = row.cells[h] ?? 0;
                              return (
                                <td key={h} className="p-0">
                                  <span
                                    className="flex h-7 items-center justify-center rounded text-[10px] font-semibold"
                                    style={{
                                      background: v === 0 ? "#f1f5f9" : `rgba(11,58,99,${0.12 + (v / heatMax) * 0.78})`,
                                      color: v === 0 ? "#cbd5e1" : v / heatMax > 0.55 ? "#ffffff" : "#0b3a63",
                                    }}
                                    title={`${row.day} ${h}:00 · ${v}`}
                                  >
                                    {v > 0 ? v : ""}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] text-steel-400">
                      {locale === "en"
                        ? `${heatTotal} bookings across ${heatMax} max per slot`
                        : `${fmtJumlah(heatTotal)} booking, puncak ${fmtJumlah(heatMax)} per slot`}
                    </p>
                  </div>
                </Card>
              )}

              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-navy-900">{S.eqOeeTitle} <span className="text-xs font-normal text-steel-500">{S.eqOeeHint.replace("{a}", String(TARGET_HOURS))}</span></h3>
                  <span className="flex items-center gap-1.5">
                    <Badge tone="navy">{S.eqAvgOee.replace("{a}", avgOee !== null ? `${Math.round(avgOee * 100)}%` : "-")}</Badge>
                    {avgOee !== null && (() => { const g = oeeGrade(avgOee, locale === "en"); return <Badge tone={g.tone}>{g.label}</Badge>; })()}
                  </span>
                </div>
                <p className="mb-3 text-xs text-steel-500">{locale === "en" ? "Good ≥70% · Fair 40–70% · Poor <40% (availability × performance)" : "Baik ≥70% · Cukup 40–70% · Buruk <40% (availability × performance)"}</p>
                <div className="space-y-2.5">
                  {equipment.map((e) => {
                    const v = oeeOf(e.name);
                    if (!v) return (
                      <div key={e.id} className="flex items-center justify-between gap-2 border-b border-steel-100 py-1.5 text-sm">
                        <span className="text-steel-600">{e.name}</span>
                        <span className="text-xs text-steel-400">{S.eqNoOee}</span>
                      </div>
                    );
                    return (
                      <div key={e.id}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-steel-600">{e.name} <span className="text-xs text-steel-400">(A {Math.round(v.avail * 100)}% × P {Math.round(v.perf * 100)}%)</span></span>
                          <span className="flex items-center gap-1.5 font-semibold text-navy-900">{Math.round(v.oee * 100)}% <Badge tone={oeeGrade(v.oee, locale === "en").tone}>{oeeGrade(v.oee, locale === "en").label}</Badge></span>
                        </div>
                        <ProgressBar value={Math.round(v.oee * 100)} tone={v.oee < 0.4 ? "red" : v.oee < 0.7 ? "amber" : "green"} />
                      </div>
                    );
                  })}
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="p-5">
                  <CardHeader title={S.eqOverallUtil} />
                  <div className="flex items-center justify-center">
                    <RadialGauge value={avgUtil} label={S.thEquipment} size={140} />
                  </div>
                  {(() => { const g = utilGrade(avgUtil, locale === "en"); return (
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-steel-500">
                      <Badge tone={g.tone}>{g.label}</Badge> {g.desc}
                    </p>
                  ); })()}
                  <p className="mt-1 text-center text-xs text-steel-500">{S.eqOverallUtilCap}</p>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title={S.eqHoursPerMonth} subtitle="Per bulan (cth Sep 2026) — bulan berjalan paling kanan" />
                  <div className="h-52 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hoursChart} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                        <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2e9ad4" stopOpacity={0.35} /><stop offset="95%" stopColor="#2e9ad4" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="label" stroke="#8aa2b6" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}rb`} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `${fmtJumlah(Number(v))} jam`} />} />
                        <Area type="monotone" dataKey="jam" stroke="#2e9ad4" strokeWidth={2.5} fill="url(#eqGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                <input className="input pl-9 w-full" placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} value={utilQ} onChange={(e) => setUtilQ(e.target.value)} />
              </div>
              <div className="max-h-96 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {equipment.filter((e) => {
                    const needle = utilQ.trim().toLowerCase();
                    if (!needle) return true;
                    return `${e.name ?? ""} ${e.code ?? ""}`.toLowerCase().includes(needle);
                  }).map((e) => {
                    const manual = e.utilManual === true;
                    const auto = autoUtilOf(e);
                    const disp = manual ? Number(e.util || 0) : auto;
                    const g = utilGrade(disp, locale === "en");
                    return (
                    <div key={e.id} className="rounded-xl border border-steel-100 p-3">
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span className="text-steel-600">{e.name} <span className="font-mono text-xs text-steel-400">{e.code}</span></span>
                        <span className="flex shrink-0 items-center gap-1.5 font-semibold text-navy-900">{disp}% <Badge tone={manual ? "gray" : "blue"}>{manual ? "Manual" : "Auto"}</Badge></span>
                      </div>
                      <ProgressBar value={disp} tone={g.tone} />
                      <p className="mt-1 text-xs text-steel-500"><Badge tone={g.tone}>{g.label}</Badge> <span className="ml-1">Auto bulan ini: {auto}% ({autoHoursOf(e)} jam ÷ 176)</span></p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select className="input w-auto py-1 text-xs" value={manual ? "Manual" : "Auto"} onChange={(ev) => { if (ev.target.value === "Auto") void saveUtilOverride(e, false); else setUtilDraft((m) => ({ ...m, [e.id]: String(e.util ?? 0) })); }} aria-label={`Mode utilisasi ${e.name}`}>
                          <option value="Auto">Auto</option>
                          <option value="Manual">Manual</option>
                        </select>
                        {manual && (
                          <>
                            <NumInput min={0} className="input w-20 !py-1 text-xs" value={utilDraft[e.id] ?? String(e.util ?? 0)} onChange={(ev) => setUtilDraft((m) => ({ ...m, [e.id]: ev.target.value }))} aria-label={`Util manual ${e.name}`} />
                            <button className="btn-secondary text-xs" onClick={() => void saveUtilOverride(e, true)}>Kunci</button>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-steel-400">{S.eqForecastNote}</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal tambah / ubah equipment */}
      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditingId(null); }}
        title={editingId ? `${S.eqEdit} ${editingId}` : S.eqAdd}
        wide
        footer={<>
          <button className="btn-secondary" onClick={() => { setShowAdd(false); setEditingId(null); }}>{S.cancelBtn}</button>
          <AsyncButton className="btn-primary" onAction={editingId ? saveEdit : saveAdd}>{S.saveBtn}</AsyncButton>
        </>}
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.eqNameField}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={S.eqNamePh} /></Field>
            <Field label={S.eqCodeField}><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={S.eqCodePh} /></Field>
            <Field label={S.thCategory}>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {EQ_CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            {form.category === "Lainnya" && (
              <Field label={locale === "en" ? "Custom category" : "Kategori kustom"} hint={locale === "en" ? "Saved as the equipment category and included in filters" : "Disimpan sebagai kategori + ikut filter"}>
                <input className="input" value={form.categoryCustom} onChange={(e) => setForm({ ...form, categoryCustom: e.target.value })} placeholder={locale === "en" ? "e.g.: Survey" : "cth: Survei"} />
              </Field>
            )}
            <Field label={S.eqBranchField}>
              <select className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
                {data.branches.map((b) => <option key={b.id} value={String(b.city)}>{String(b.city)}</option>)}
              </select>
            </Field>
            <Field label={S.eqSerialField} hint={S.eqSerialHint}><input className="input font-mono" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} placeholder={S.eqSerialPh} /></Field>
            <Field label={S.eqPicField} hint={S.eqPicHint}><input className="input" value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} placeholder={S.eqPicPh} /></Field>
            <Field label={S.thModel}><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label={S.eqUtilField}><NumInput className="input" value={form.util} onChange={(e) => setForm({ ...form, util: e.target.value })} /></Field>
            <Field label={S.eqRateField}><NumInput min={0} className="input" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder={S.eqRatePh} /></Field>
            <Field label={S.eqFuelField}><NumInput min={0} className="input" value={form.fuelPrice} onChange={(e) => setForm({ ...form, fuelPrice: e.target.value })} placeholder={S.eqFuelPh} /></Field>
            <Field label={S.eqCostField}><NumInput min={0} className="input" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })} placeholder={S.eqCostPh} /></Field>
            <Field label={S.eqLifeField}><NumInput min={0} className="input" value={form.usefulLife} onChange={(e) => setForm({ ...form, usefulLife: e.target.value })} placeholder={S.eqLifePh} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal servis */}
      <Modal
        open={showService}
        onClose={closeMaint}
        title={maintEditingId
          ? (locale === "en" ? `Edit maintenance - ${maintEditingId}` : `Ubah Maintenance - ${maintEditingId}`)
          : (locale === "en" ? "Schedule maintenance" : "Jadwalkan Maintenance")}
        subtitle={locale === "en"
          ? "Materials are planned here; stock is deducted once the cycle is completed."
          : "Material direncanakan di sini; stok dipotong satu kali saat siklus diselesaikan."}
        wide
        footer={<><button className="btn-secondary" onClick={closeMaint}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={async () => {
          /* Siklus yang SUDAH Selesai sudah memotong stok, jadi simpan biasa
             akan memotong dua kali. Jalur itu harus lewat delta. */
          if (maintEditingId) {
            const prev = data.maintenances.find((m) => m.id === maintEditingId);
            if (prev && canRestoreStock(prev)) {
              await adjustMaintMaterials(prev, maintForm.mats);
              return;
            }
          }
          await saveMaint();
        }}>{maintEditingId ? S.saveBtn : (locale === "en" ? "Schedule" : "Jadwalkan")}</AsyncButton></>}
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thEquipment}>
              <select className="input" value={maintForm.equipmentId} onChange={(e) => setMaintForm({ ...maintForm, equipmentId: e.target.value })}>
                <option value="">{S.eqChoose}</option>
                {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Work type" : "Jenis Pekerjaan"}>
              <select className="input" value={maintForm.jenis} onChange={(e) => setMaintForm({ ...maintForm, jenis: e.target.value })}>
                {MAINT_JENIS.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Scheduled date" : "Tanggal Jadwal"}>
              <input type="date" className="input" value={maintForm.tanggal} onChange={(e) => setMaintForm({ ...maintForm, tanggal: e.target.value })} />
            </Field>
            <Field label={locale === "en" ? "Estimated finish (ETA)" : "Estimasi Selesai"}>
              <input type="date" className="input" value={maintForm.eta} onChange={(e) => setMaintForm({ ...maintForm, eta: e.target.value })} />
            </Field>
            <Field label={S.eqTechField} hint={locale === "en" ? "Linked employee, for costing" : "Terhubung ke karyawan, untuk hitung biaya"}>
              <select className="input" value={maintForm.teknisiId} onChange={(e) => setMaintForm({ ...maintForm, teknisiId: e.target.value })}>
                <option value="">{S.eqChoose}</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </Field>
            <Field
              label={locale === "en" ? "Charged to project (HPP)" : "Dibebankan ke Proyek (HPP)"}
              hint={locale === "en"
                ? "Material + labour land in this project's cost. Leave empty for overhead."
                : "Material + tenaga masuk biaya proyek ini. Kosongkan bila overhead."}
            >
              <select className="input" value={maintForm.projectId} onChange={(e) => setMaintForm({ ...maintForm, projectId: e.target.value })}>
                <option value="">{locale === "en" ? "-- overhead --" : "-- overhead --"}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Hour meter before" : "Hour Meter Awal"}>
              <NumInput min={0} className="input" value={maintForm.hours} onChange={(e) => setMaintForm({ ...maintForm, hours: e.target.value })} />
            </Field>
            <Field
              label={locale === "en" ? "Hour meter after" : "Hour Meter Akhir"}
              hint={locale === "en" ? "Must not be lower than before" : "Tidak boleh lebih kecil dari awal"}
            >
              <NumInput min={0} className="input" value={maintForm.hoursAfter} onChange={(e) => setMaintForm({ ...maintForm, hoursAfter: e.target.value })} />
            </Field>
            <Field label={locale === "en" ? "Downtime (hours)" : "Downtime (jam)"}>
              <NumInput min={0} className="input" value={maintForm.downtimeHours} onChange={(e) => setMaintForm({ ...maintForm, downtimeHours: e.target.value })} />
            </Field>
          </FormGrid>
          <Field label={S.eqWorkNote}>
            <input className="input" value={maintForm.catatan} onChange={(e) => setMaintForm({ ...maintForm, catatan: e.target.value })} placeholder={S.eqWorkNotePh} />
          </Field>
          <div className="border-t border-steel-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-steel-500">
                {locale === "en" ? "Material usage from inventory" : "Penggunaan Material dari Inventory"}
              </p>
              <button className="btn-secondary text-xs" onClick={() => setMaintForm({ ...maintForm, mats: [...maintForm.mats, { itemId: "", qty: "" }] })}>
                + {locale === "en" ? "Add material" : "Tambah Material"}
              </button>
            </div>
            {maintForm.mats.length === 0 && (
              <p className="text-xs text-steel-400">
                {locale === "en"
                  ? "No material yet. Add spare parts that this service will consume - stock is cut when the cycle is completed."
                  : "Belum ada material. Tambahkan sparepart yang akan dipakai - stok dipotong saat siklus diselesaikan."}
              </p>
            )}
            {maintForm.mats.map((m, idx) => {
              const it = data.inventory.find((x) => String(x.id) === m.itemId);
              const q = Number(m.qty) || 0;
              const over = it !== undefined && q > Number(it.stock || 0);
              return (
                <div key={idx} className="mb-2 grid grid-cols-12 items-end gap-2">
                  <div className="col-span-7">
                    <p className="label">{locale === "en" ? "Item · warehouse" : "Item · Gudang"}</p>
                    <select
                      className="input"
                      value={m.itemId}
                      onChange={(e) => setMaintForm((f) => ({ ...f, mats: f.mats.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)) }))}
                    >
                      <option value="">{locale === "en" ? "-- pick item --" : "-- pilih item --"}</option>
                      {data.inventory.map((x) => (
                        <option key={x.id} value={x.id}>{x.name} · {x.warehouse} · stok {fmtJumlah(Number(x.stock || 0))} {x.unit}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <p className="label">{locale === "en" ? "Qty" : "Jumlah"}{it ? ` (${it.unit})` : ""}</p>
                    <NumInput
                      min={0}
                      className="input"
                      value={m.qty}
                      onChange={(e) => setMaintForm((f) => ({ ...f, mats: f.mats.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)) }))}
                    />
                  </div>
                  <button
                    className="btn-secondary col-span-2 text-xs"
                    onClick={() => setMaintForm((f) => ({ ...f, mats: f.mats.filter((_, i) => i !== idx) }))}
                  >
                    {locale === "en" ? "Remove" : "Hapus"}
                  </button>
                  {it && (
                    <p className={`col-span-12 text-xs ${over ? "text-rose-600" : "text-steel-500"}`}>
                      ≈ {fmtRupiah(Math.round(q * invCost(it)))} · {locale === "en" ? "available" : "tersedia"} {fmtJumlah(Number(it.stock || 0))} {it.unit}
                      {over && ` (${locale === "en" ? "not enough" : "kurang"} ${fmtJumlah(q - Number(it.stock || 0))})`}
                    </p>
                  )}
                </div>
              );
            })}
            {(() => {
              const mats = matsFromForm(maintForm.mats);
              const matCost = materialsCost(mats);
              const wd = (() => {
                if (!maintForm.tanggal || !maintForm.eta) return 0;
                const a = new Date(`${maintForm.tanggal}T00:00:00`).getTime();
                const b = new Date(`${maintForm.eta}T00:00:00`).getTime();
                if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
                return Math.round((b - a) / 86400000) + 1;
              })();
              const labor = wd * laborRate();
              return mats.length > 0 || labor > 0 ? (
                <div className="mt-1 space-y-0.5 text-right text-sm">
                  {mats.length > 0 && <p className="text-steel-600">{locale === "en" ? "Material" : "Material"}: {fmtRupiah(matCost)}</p>}
                  {labor > 0 && <p className="text-steel-600">{locale === "en" ? "Labour" : "Tenaga"}: {fmtRupiah(labor)} <span className="text-[11px] text-steel-400">({wd} {locale === "en" ? "days" : "hari"} × {fmtRupiah(laborRate())})</span></p>}
                  <p className="font-semibold text-navy-900">{locale === "en" ? "Total" : "Total"}: {fmtRupiah(matCost + labor)}</p>
                  <p className="text-[11px] text-steel-400">
                    {locale === "en" ? "Stock is not deducted until the cycle is completed." : "Stok belum dipotong sampai siklus diselesaikan."}
                  </p>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      </Modal>

      {/* ==== MODAL RIWAYAT STATUS ==== */}
      <Modal
        open={histOf !== null}
        onClose={() => setHistOf(null)}
        title={histOf ? (locale === "en" ? `History - ${histOf.id}` : `Riwayat Status - ${histOf.id}`) : ""}
        subtitle={histOf ? `${String(histOf.equipmentName ?? "")} · ${fmtTanggal(String(histOf.tanggal ?? ""))}` : ""}
      >
        {(() => {
          const entries: MaintHistoryEntry[] = historyOf(histOf ?? {});
          if (entries.length === 0) {
            return <p className="text-sm text-steel-400">{locale === "en" ? "No status change recorded." : "Belum ada perubahan status tercatat."}</p>;
          }
          return (
            <ol className="space-y-2">
              {entries.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3 border-l-2 border-steel-200 pl-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-steel-400">{h.at}</p>
                    <p className="font-medium text-navy-900">
                      {h.from} <span className="text-steel-400">→</span>{" "}
                      <Badge tone={MAINT_STATUS_TONE[h.to as MaintStatus] ?? "gray"}>
                        {isMaintStatus(h.to) ? maintStatusLabel(h.to, locale) : h.to}
                      </Badge>
                    </p>
                    {h.note !== "" && <p className="text-xs text-steel-600">{h.note}</p>}
                  </div>
                  <p className="shrink-0 text-xs text-steel-500">{h.by}</p>
                </li>
              ))}
            </ol>
          );
        })()}
      </Modal>

      {/* ==== KONFIRMASI HAPUS SIKLUS ==== */}
      <ConfirmModal
        open={delMaint !== null}
        title={delMaint ? (locale === "en" ? `Delete maintenance ${delMaint.id}?` : `Hapus maintenance ${delMaint.id}?`) : ""}
        desc={delMaint ? (() => {
          const st = statusOf(delMaint);
          const mats = materialsOf(delMaint);
          const name = String(delMaint.equipmentName ?? delMaint.equipmentId ?? "");
          if (canRestoreStock(delMaint)) {
            return locale === "en"
              ? `This cycle already deducted ${mats.length} material line(s) from inventory. Deleting it will RETURN the stock and write correcting movements.`
              : `Siklus ini sudah memotong ${mats.length} baris material dari inventory. Menghapus akan MENGEMBALIKAN stok dan mencatat movements koreksi.`;
          }
          return locale === "en"
            ? `Maintenance cycle for ${name} (${st}) will be permanently deleted. No stock was deducted, so inventory is untouched.`
            : `Siklus maintenance ${name} (${st}) akan dihapus permanen. Stok belum terpotong, jadi inventory tidak tersentuh.`;
        })() : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelMaint(null)}
        onConfirm={confirmDelMaint}
      />



      {/* Modal booking */}
      <Modal open={showBook} onClose={() => { setShowBook(false); setBookError(null); }} title={S.eqBookTitle} subtitle={S.eqBookSub}
        footer={<><button className="btn-secondary" onClick={() => { setShowBook(false); setBookError(null); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveBooking}>{S.eqSaveBooking}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thEquipment}>
              <select className="input" value={bookForm.equip} onChange={(e) => setBookForm({ ...bookForm, equip: e.target.value })}>
                <option value="">{S.eqChoose}</option>
                {equipment.filter((e) => e.status !== "Maintenance").map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
              </select>
            </Field>
            <Field label={S.thProject}>
              <select className="input" value={bookForm.proyek} onChange={(e) => setBookForm({ ...bookForm, proyek: e.target.value })}>
                <option value="">{S.eqChoose}</option>
                {data.projects.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.dateLabel}><input type="date" className="input" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} /></Field>
            <Field label={S.eqStartField} hint="24 jam · 00:00–23:59 tanpa AM/PM (cth 14:00)"><input type="time" lang="id-ID" step={300} className="input font-mono" value={norm24(bookForm.mulai)} onChange={(e) => setBookForm({ ...bookForm, mulai: norm24(e.target.value) })} /></Field>
            <Field label={S.eqEndField} hint="24 jam · 00:00–23:59 tanpa AM/PM (cth 17:30)"><input type="time" lang="id-ID" step={300} className="input font-mono" value={norm24(bookForm.selesai)} onChange={(e) => setBookForm({ ...bookForm, selesai: norm24(e.target.value) })} /></Field>
            <Field label={S.eqPriorityField}>
              <select className="input" value={bookForm.priority} onChange={(e) => setBookForm({ ...bookForm, priority: e.target.value })}>
                {BOOK_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </FormGrid>
          {bookError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{bookError}</p>
          )}
        </div>
      </Modal>

      {/* Konfirmasi hapus equipment. Backend memblokir via delete-guard
          (409 REFERENCED) bila masih ada booking / kalibrasi / maintenance
          yang menunjuk equipment ini, karena ketiganya punya
          equipmentId/equip sebagai referensi. */}
      <ConfirmModal
        open={delEquip !== null}
        title={delEquip ? (locale === "en" ? `Delete equipment ${delEquip.name}?` : `Hapus equipment ${delEquip.name}?`) : ""}
        desc={(() => {
          if (!delEquip) return "";
          const id = String(delEquip.id);
          const ref = String(delEquip.name);
          const nBook = bookings.filter((b) => equipKey(b.equip) === equipKey(id)).length;
          const cals = calibrations.filter((c) => String(c.equipmentId) === id).length;
          const cycles = maintenances.filter((m) => String(m.equipmentId) === id).length;
          const used: string[] = [];
          if (nBook > 0) used.push(locale === "en" ? `${nBook} booking(s)` : `${nBook} booking`);
          if (cals > 0) used.push(locale === "en" ? `${cals} calibration(s)` : `${cals} kalibrasi`);
          if (cycles > 0) used.push(locale === "en" ? `${cycles} maintenance cycle(s)` : `${cycles} siklus maintenance`);
          const base = locale === "en"
            ? `Equipment ${ref} (${id}) will be permanently deleted.`
            : `Equipment ${ref} (${id}) akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en"
              ? `${base} Still referenced by: ${used.join(", ")}. Deletion blocked.`
              : `${base} Masih dirujuk oleh: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        confirmDisabled={(() => {
          if (!delEquip) return true;
          const id = String(delEquip.id);
          return (
            bookings.some((b) => equipKey(b.equip) === equipKey(id))
            || calibrations.some((c) => String(c.equipmentId) === id)
            || maintenances.some((m) => String(m.equipmentId) === id)
          );
        })()}
        onCancel={() => setDelEquip(null)}
        onConfirm={confirmDelEquip}
      />

      {/* Konfirmasi gusur booking Kritis */}
      <ConfirmModal
        open={gusur !== null}
        title={S.eqGusurTitle}
        desc={S.eqGusurDesc.replace("{a}", gusur?.clash.map((c) => `${c.id} (${c.proyek})`).join(", ") ?? "")}
        confirmLabel={S.eqGusurYes}
        danger
        onCancel={() => setGusur(null)}
        onConfirm={confirmGusur}
      />


      {/* Modal selesaikan booking */}
      <Modal open={finishing !== null} onClose={() => setFinishing(null)} title={S.eqFinishBookTitle.replace("{a}", finishing ? equipLabel(finishing.equip) : "")} subtitle={finishing ? `${finishing.proyek} · ${fmtJam24(finishing.jam)} · ${fmtTanggal(String(finishing.date))}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setFinishing(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmFinish}>{S.finishBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.eqActualHours} hint={S.eqActualHoursHint}>
            <NumInput min={0} step={0.5} className="input" value={finishHours} onChange={(e) => setFinishHours(e.target.value)} />
          </Field>
          <Field label={S.eqDowntimeField} hint={S.eqDowntimeHint}>
            <NumInput min={0} step={0.5} className="input" value={finishDowntime} onChange={(e) => setFinishDowntime(e.target.value)} />
          </Field>
          <Field label={S.eqFuelLitField} hint={S.eqFuelLitHint}>
            <NumInput min={0} step={0.5} className="input" value={finishFuel} onChange={(e) => setFinishFuel(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Modal jadwalkan / ubah kalibrasi */}
      <Modal
        open={showCal}
        onClose={() => { setShowCal(false); setCalEditId(null); }}
        title={calEditId ? `${S.eqEdit} ${calEditId}` : S.eqSchedCal}
        footer={<>
          <button className="btn-secondary" onClick={() => { setShowCal(false); setCalEditId(null); }}>{S.cancelBtn}</button>
          <button className="btn-primary" onClick={calEditId ? saveCalEdit : saveCalibration}>{S.saveBtn}</button>
        </>}
      >
        <div className="space-y-3">
          <Field label={S.thEquipment}>
            <select className="input" value={calForm.equipmentId} onChange={(e) => setCalForm({ ...calForm, equipmentId: e.target.value })}>
              <option value="">{S.eqChoose}</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code}){isMeasuring(e) ? " · alat ukur" : ""}</option>)}
            </select>
          </Field>
          <Field label={S.eqMeasureField}><input className="input" value={calForm.item} onChange={(e) => setCalForm({ ...calForm, item: e.target.value })} placeholder={S.eqMeasurePh} /></Field>
          <Field label={S.eqDueField}><input type="date" className="input" value={calForm.due} onChange={(e) => setCalForm({ ...calForm, due: e.target.value })} /></Field>
        </div>
      </Modal>

      <ConfirmModal
        open={delCal !== null}
        title={delCal ? (locale === "en" ? `Delete calibration ${delCal.id}?` : `Hapus kalibrasi ${delCal.id}?`) : ""}
        desc={delCal
          ? (String(delCal.status) === "Selesai"
            ? (locale === "en"
              ? `This calibration is already completed with certificate "${String(delCal.cert ?? "-")}". Deleting it removes the traceability record.`
              : `Kalibrasi ini sudah selesai dengan sertifikat "${String(delCal.cert ?? "-")}". Menghapus akan menghilangkan jejak keterlacakannya.`)
            : (locale === "en"
              ? `"${String(delCal.item)}" for ${String(delCal.equipmentId)} will be permanently deleted.`
              : `"${String(delCal.item)}" untuk ${String(delCal.equipmentId)} akan dihapus permanen.`))
          : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelCal(null)}
        onConfirm={confirmDelCal}
      />

      {/* Modal selesaikan kalibrasi */}
      <Modal open={finishingCal !== null} onClose={() => setFinishingCal(null)} title={S.eqCalDoneTitle.replace("{a}", finishingCal?.id ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setFinishingCal(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={confirmCalFinish}>{S.finishBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal pelaksanaan" hint={S.calBackdateHint}>
              <input type="date" className="input" value={calDoneDate} onChange={(e) => setCalDoneDate(e.target.value)} />
            </Field>
            <Field label="Hasil kalibrasi">
              <select className="input" value={calResult} onChange={(e) => setCalResult(e.target.value)}>
                <option value="Lulus">Lulus</option>
                <option value="Gagal">Gagal</option>
              </select>
            </Field>
          </FormGrid>
          <Field label={S.eqCertNoField} hint={S.eqCertNoHint}>
            <input className="input font-mono" value={calCert} onChange={(e) => setCalCert(e.target.value)} placeholder={S.eqCertNoPh} />
          </Field>
          <Field label="Interval kalibrasi ulang (bulan)" hint={calDoneDate ? `Due berikutnya otomatis: ${fmtTanggal(addMonthsISO(calDoneDate, Math.max(1, Math.floor(Number(calInterval) || 12))))}` : undefined}>
            <NumInput min={1} className="input" value={calInterval} onChange={(e) => setCalInterval(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function minutesToStr(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

