import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, Cpu, Wrench, AlertTriangle, Gauge, CheckCircle2, Download, Search } from "lucide-react";
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
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { exportExcel } from "../../utils/export";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_eqp } from "../../i18n/n_eqp";

const BOOK_PRIORITIES = ["Normal", "Tinggi", "Kritis"];
const TARGET_HOURS = 176;
const EQ_CATS = ["Pengangkat", "Pengelasan", "Tenaga", "Transportasi", "Pengecatan", "Lainnya"];

const ID_MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Label "Mon YYYY" untuk N titik terakhir, bulan berjalan terakhir. */
function trailingMonthLabels(n: number, locale: string): string[] {
  const now = new Date();
  const M = locale === "en" ? EN_MON : ID_MON;
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${M[d.getMonth()]} ${d.getFullYear()}`);
  }
  return out;
}

/* Samakan deret data dengan jendela label bulan-berjalan.
   Versi lama menempel label secara posisional: data equipmentHours berlabel
   tetap "Sep".."Ags" sementara label dihitung ulang tiap bulan, sehingga
   titik "Ags" tampil sebagai "Sep 2026" dan SELURUH grafik bergeser satu bulan
   setiap pergantian bulan. Sekarang data diputar agar bulan pada datanya
   sendiri yang jadi acuan, persis seperti withMonthLabels() di Analytics:
   bulan berjalan benar-benar berada di titik terakhir. */
function alignToTrailingMonths<T extends { month: string }>(arr: T[], locale: string): (T & { label: string })[] {
  const now = new Date();
  const cur = now.getMonth();
  const curName = (locale === "en" ? EN_MON : ID_MON)[cur];
  const labels = trailingMonthLabels(arr.length, locale);

  const pos = arr.findIndex((d) => d.month === curName);
  const rot = pos >= 0 ? [...arr.slice(pos + 1), ...arr.slice(0, pos + 1)] : [...arr];

  return rot.map((d, i) => {
    const label = labels[labels.length - rot.length + i] ?? d.month;
    return { ...d, label };
  });
}

function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function parseJam(jam: string): { mulai: string; selesai: string } | null {
  const m = /(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/.exec(jam ?? "");
  if (!m) return null;
  return { mulai: m[1], selesai: m[2] };
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
const EQ_COLS: CollectionKey[] = ["activities", "bookings", "branches", "calibrations", "equipment", "inventory", "projects"];

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
  const [form, setForm] = useState({ name: "", category: "Pengangkat", categoryCustom: "", code: "", serial: "", branch: "Samarinda", model: "", pic: "", util: "50", rate: "", fuelPrice: "0", acquisitionCost: "", usefulLife: "" });
  const [showService, setShowService] = useState(false);
  const [svcTarget, setSvcTarget] = useState("");
  const [schedForm, setSchedForm] = useState({ tanggal: todayISO(), teknisi: "", hours: "", next: "", catatan: "" });
  const [schedMats, setSchedMats] = useState<{ itemId: string; qty: string }[]>([]);

  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ equip: "", proyek: "", date: todayISO(), mulai: "", selesai: "", priority: "Normal" });
  const [bookError, setBookError] = useState<string | null>(null);
  const [gusur, setGusur] = useState<{ clash: StoreItem[] } | null>(null);

  const [finishing, setFinishing] = useState<StoreItem | null>(null);
  const [finishHours, setFinishHours] = useState("");
  const [finishDowntime, setFinishDowntime] = useState("0");
  const [finishFuel, setFinishFuel] = useState("0");

  const [maintaining, setMaintaining] = useState<StoreItem | null>(null);
  const [maintNote, setMaintNote] = useState("");
  const [maintEta, setMaintEta] = useState("");

  const [recording, setRecording] = useState<StoreItem | null>(null);
  const [woForm, setWoForm] = useState({ tanggal: todayISO(), teknisi: "", catatan: "", hours: "", next: "" });
  const [svcMats, setSvcMats] = useState<{ itemId: string; qty: string }[]>([]);
  const [editHist, setEditHist] = useState<StoreItem | null>(null);
  const [editHistMats, setEditHistMats] = useState<{ itemId: string; qty: string }[]>([]);
  const [delHist, setDelHist] = useState<StoreItem | null>(null);

  const [showCal, setShowCal] = useState(false);
  const [calForm, setCalForm] = useState({ equipmentId: "", item: "", due: "" });
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

  /* Chart jam/bulan: label "Mon YYYY", bulan berjalan terakhir. */
  const hoursChart = useMemo(
    () => alignToTrailingMonths(equipmentHours, locale),
    [locale],
  );

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

  const saveService = async () => {
    try {
    if (!svcTarget || !schedForm.tanggal || !schedForm.teknisi.trim() || !schedForm.hours) { toast(S.eqRecordReq, "info"); return; }
    const hours = Number(schedForm.hours);
    if (!Number.isFinite(hours) || hours < 0) { toast(S.eqHoursInvalid, "info"); return; }
    const target = equipment.find((e) => e.id === svcTarget);
    /* Kebutuhan material jadwal: validasi qty positif + item dikenal saja.
       Stok TIDAK dipotong di sini (catat servis sudah potong saat eksekusi) — hindari ganda. */
    const mats = schedMats.filter((m) => m.itemId);
    for (const m of mats) {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      const q = Number(m.qty);
      if (!it) { toast("Material servis tidak dikenal", "info"); return; }
      if (!Number.isFinite(q) || q <= 0) { toast(`Qty material ${it.name} harus positif`, "info"); return; }
    }
    const matSummary = mats.map((m) => {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      return { itemId: m.itemId, name: String(it?.name ?? m.itemId), qty: Number(m.qty) || 0, unit: String(it?.unit ?? ""), cost: (Number(m.qty) || 0) * (it ? invCost(it) : 0) };
    });
    const matCost = Math.round(matSummary.reduce((s, m) => s + m.cost, 0));
    const nextVal = schedForm.next || schedForm.tanggal;
    await update("equipment", svcTarget, {
      nextService: nextVal,
      scheduledService: {
        tanggal: schedForm.tanggal, teknisi: schedForm.teknisi.trim(), hours,
        next: schedForm.next, catatan: schedForm.catatan.trim(),
        materials: matSummary, cost: matCost,
      },
      ...(matSummary.length > 0 ? { scheduledServiceMaterials: matSummary, scheduledServiceCost: matCost } : {}),
    });
    log("menjadwalkan servis", `${target?.name ?? svcTarget} · ${fmtTanggal(schedForm.tanggal)} · teknisi ${schedForm.teknisi.trim()} · ${fmtJumlah(hours)} jam${schedForm.catatan.trim() ? ` · ${schedForm.catatan.trim()}` : ""}${matSummary.length > 0 ? ` · kebutuhan ${matSummary.map((m) => `${m.name} × ${m.qty}`).join("; ")} (${fmtRupiah(matCost)}, stok tidak dipotong)` : ""}`, "Equipment");
    toast(S.eqSvcUpdated);
    setShowService(false);
    setSvcTarget("");
    setSchedForm({ tanggal: todayISO(), teknisi: "", hours: "", next: "", catatan: "" });
    setSchedMats([]);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const schedMatsCost = schedMats.reduce((s, m) => {
    const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
    return s + (Number(m.qty) || 0) * (it ? invCost(it) : 0);
  }, 0);

  const openEditHist = (eq: StoreItem) => {
    setEditHist(eq);
    const cur = (Array.isArray(eq.lastServiceMaterials) ? eq.lastServiceMaterials : []) as { itemId?: string; name?: string; qty: number }[];
    setEditHistMats(cur.map((m) => {
      const byId = (data.inventory ?? []).find((x) => x.id === m.itemId);
      const byName = !byId ? (data.inventory ?? []).find((x) => String(x.name ?? "").toLowerCase() === String(m.name ?? "").toLowerCase()) : undefined;
      return { itemId: String(m.itemId ?? byId?.id ?? byName?.id ?? ""), qty: String(m.qty ?? "") };
    }));
  };

  const saveEditHist = async () => {
    try {
    if (!editHist) return;
    const mats = editHistMats.filter((m) => m.itemId);
    for (const m of mats) {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      const q = Number(m.qty);
      if (!it) { toast("Material servis tidak dikenal", "info"); return; }
      if (!Number.isFinite(q) || q <= 0) { toast(`Qty material ${it.name} harus positif`, "info"); return; }
    }
    const matSummary = mats.map((m) => {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      return { itemId: m.itemId, name: String(it?.name ?? m.itemId), qty: Number(m.qty) || 0, unit: String(it?.unit ?? ""), cost: (Number(m.qty) || 0) * (it ? invCost(it) : 0) };
    });
    const matCost = Math.round(matSummary.reduce((s, m) => s + m.cost, 0));
    /* Edit riwayat: hanya perbarui tampilan record, stok TIDAK diubah (sudah dipotong saat catat). */
    await update("equipment", editHist.id, {
      lastServiceMaterials: matSummary,
      lastServiceCost: matCost,
    });
    log("memperbarui riwayat servis", `${editHist.name} · ${matSummary.length > 0 ? matSummary.map((m) => `${m.name} × ${m.qty}`).join("; ") : "tanpa material"} (stok tidak diubah)`, "Equipment");
    toast("Riwayat servis diperbarui");
    setEditHist(null);
    setEditHistMats([]);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDelHist = async () => {
    try {
    if (!delHist) return;
    /* Hapus riwayat: hanya bersihkan tampilan record, stok TIDAK dikembalikan. */
    await update("equipment", delHist.id, { lastServiceMaterials: [], lastServiceCost: 0 });
    log("menghapus riwayat servis", `${delHist.name} (stok tidak dikembalikan)`, "Equipment");
    toast("Riwayat servis dihapus");
    setDelHist(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openRecord = (eq: StoreItem) => {
    setRecording(eq);
    setWoForm({ tanggal: todayISO(), teknisi: "", catatan: "", hours: String(eq.lastHours ?? 0), next: typeof eq.nextService === "string" && eq.nextService !== "-" ? eq.nextService : "" });
    setSvcMats([]);
  };

  const svcMatsCost = svcMats.reduce((s, m) => {
    const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
    return s + (Number(m.qty) || 0) * (it ? invCost(it) : 0);
  }, 0);

  const saveRecord = async () => {
    try {
    if (!recording) return;
    if (!woForm.tanggal || !woForm.teknisi.trim() || !woForm.hours) { toast(S.eqRecordReq, "info"); return; }
    const hours = Number(woForm.hours);
    if (!Number.isFinite(hours) || hours < 0) { toast(S.eqHoursInvalid, "info"); return; }
    const fresh = equipment.find((e) => e.id === recording.id) ?? recording;
    if (hours < Number(fresh.lastHours || 0)) { toast(`Hour meter ${fmtJumlah(hours)} di bawah catatan terakhir ${fmtJumlah(Number(fresh.lastHours || 0))} — odometer tidak boleh mundur`, "info"); return; }
    /* Validasi material servis: qty positif & cukup stok. */
    const mats = svcMats.filter((m) => m.itemId);
    for (const m of mats) {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      const q = Number(m.qty);
      if (!it) { toast("Material servis tidak dikenal", "info"); return; }
      if (!Number.isFinite(q) || q <= 0) { toast(`Qty material ${it.name} harus positif`, "info"); return; }
      if (q > Number(it.stock || 0)) { toast(`Stok ${it.name} kurang (tersedia ${fmtJumlah(Number(it.stock || 0))} ${it.unit})`, "info"); return; }
    }
    const matCost = mats.reduce((s, m) => {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      return s + (Number(m.qty) || 0) * (it ? invCost(it) : 0);
    }, 0);
    const matSummary = mats.map((m) => {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      return { itemId: m.itemId, name: String(it?.name ?? m.itemId), qty: Number(m.qty) || 0, unit: String(it?.unit ?? ""), cost: (Number(m.qty) || 0) * (it ? invCost(it) : 0) };
    });
    await update("equipment", recording.id, {
      lastHours: hours,
      nextService: woForm.next || recording.nextService,
      status: recording.status === "Maintenance" ? "Tersedia" : recording.status,
      ...(matSummary.length > 0 ? { lastServiceMaterials: matSummary, lastServiceCost: Math.round(matCost) } : {}),
    });
    for (const m of matSummary) {
      const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
      if (!it) continue;
      await update("inventory", it.id, { stock: Number(it.stock || 0) - m.qty });
      await add("movements", {
        item: it.name, itemId: it.id, type: "Pengeluaran", qty: m.qty,
        by: `Servis ${recording.name} · ${fmtTanggal(woForm.tanggal)}`, date: woForm.tanggal, tone: "out",
        purpose: `Servis ${recording.name}`, pic: woForm.teknisi.trim(),
      }, { action: "material servis", target: `${it.name} × ${m.qty} (${recording.name})`, module: "Equipment" });
    }
    log("mencatat servis", `${recording.name} · ${fmtTanggal(woForm.tanggal)}${woForm.catatan.trim() ? ` · ${woForm.catatan.trim()}` : ""}${matSummary.length > 0 ? ` · material ${matSummary.map((m) => `${m.name} × ${m.qty}`).join("; ")} (${fmtRupiah(Math.round(matCost))})` : ""}`, "Equipment");
    toast(S.eqSvcRecorded.replace("{a}", recording.name));
    setRecording(null);
    setSvcMats([]);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const startMaintenance = async () => {
    try {
    if (!maintaining) return;
    if (!maintNote.trim() || !maintEta) { toast(S.eqMaintReq, "info"); return; }
    await update("equipment", maintaining.id, { status: "Maintenance", maintenanceNote: maintNote.trim(), maintenanceEta: maintEta });
    log("memasukkan maintenance", `${maintaining.name} · selesai ${fmtTanggal(maintEta)}`, "Equipment");
    toast(S.eqEnterMaint.replace("{a}", maintaining.name));
    setMaintaining(null);
    setMaintNote("");
    setMaintEta("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const endMaintenance = async (eq: StoreItem) => {
    try {
    await update("equipment", eq.id, { status: "Tersedia", maintenanceNote: "", maintenanceEta: "" });
    log("menyelesaikan maintenance", eq.name, "Equipment");
    toast(S.eqBackAvail.replace("{a}", eq.name));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const clashOf = (equip: string, date: string, a: number, b: number): StoreItem[] =>
    bookings.filter((o) => {
      if (equipKey(o.equip) !== equipKey(equip) || o.date !== date || o.status === "Selesai") return false;
      const r = bookingRange(o);
      return r ? rangesOverlap(a, b, r.mulai, r.selesai) : false;
    });

  const persistBooking = async (priority: string) => {
    const { equip, proyek, date, mulai, selesai } = bookForm;
    const eq = resolveEquip(equip);
    if (!eq) { setBookError(S.eqNotFound); return; }
    const created = await add("bookings", { equip: eq.id, equipCode: eq.code, equipName: eq.name, proyek, jam: `${mulai}-${selesai}`, mulai, selesai, status: "Terjadwal", date, priority, branch: String((data.projects ?? []).find((p) => String(p.id) === String(proyek))?.branch ?? (branch !== "SEMUA" ? branch : "")) },
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
    setCalForm({ equipmentId: "", item: "", due: "" });
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
                        {e.status === "Tersedia" && (
                          <button className="btn-secondary text-xs" onClick={() => { setMaintaining(e); setMaintNote(""); setMaintEta(""); }}>
                            <Wrench className="h-3.5 w-3.5" /> {S.eqTabMaint}
                          </button>
                        )}
                        {e.status === "Maintenance" && (
                          <button className="btn-secondary text-xs" onClick={() => endMaintenance(e)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> {S.eqBackAvailBtn}
                          </button>
                        )}
                        {e.status === "Terpakai" && (
                          <span className="text-xs text-steel-500">{S.eqBackToBooking}</span>
                        )}
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
                        <p className="text-xs text-steel-500">{projCell(b.proyek)} · {b.jam} · {fmtTanggal(String(b.date))} · {b.priority ?? "Normal"}</p>
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
                          <p className="text-xs text-steel-500">{b.jam} · {fmtTanggal(String(b.date))}</p>
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
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <button className="btn-secondary text-xs" onClick={() => setShowService(true)}><Wrench className="h-3.5 w-3.5" /> Jadwalkan servis</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr><SortTh label={S.thEquipment} sortKey="equipment" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thSchedule} sortKey="jadwal" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thNoteEta} sortKey="catatan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thStatus} sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">{S.thAction}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(equipment, sort2, (e, k) => {
                      if (k === "jadwal") return String(e.nextService ?? "");
                      if (k === "catatan") return String(`${e.maintenanceNote ?? ""} ${e.maintenanceEta ?? ""}`);
                      if (k === "status") return String(e.status ?? "");
                      return String(e.name ?? "");
                    }).map((e) => (
                      <tr key={e.id} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900">{e.name}</td>
                        <td className="td text-steel-600">{fmtTanggal(typeof e.nextService === "string" ? e.nextService : "")}</td>
                        <td className="td text-xs text-steel-600">
                          {e.status === "Maintenance" && e.maintenanceNote
                            ? `${e.maintenanceNote}${e.maintenanceEta ? ` · selesai ${fmtTanggal(String(e.maintenanceEta))}` : ""}`
                            : Array.isArray(e.lastServiceMaterials) && e.lastServiceMaterials.length > 0
                              ? `Servis terakhir: ${(e.lastServiceMaterials as { name: string; qty: number; unit: string }[]).map((m) => `${m.name} × ${m.qty} ${m.unit ?? ""}`).join("; ")} (${fmtRupiah(Number(e.lastServiceCost || 0))})`
                              : <span className="text-steel-400">-</span>}
                          {(() => {
                            const sched = (e.scheduledService ?? null) as { tanggal?: string; teknisi?: string; materials?: { name: string; qty: number; unit?: string }[] } | null;
                            const schedMats = (Array.isArray(e.scheduledServiceMaterials) ? e.scheduledServiceMaterials : sched?.materials ?? []) as { name: string; qty: number; unit?: string }[];
                            if (!sched && schedMats.length === 0) return null;
                            return (
                              <span className="mt-1 block text-[11px] text-steel-500">
                                Jadwal{sched?.tanggal ? ` ${fmtTanggal(String(sched.tanggal))}` : ""}{sched?.teknisi ? ` · ${sched.teknisi}` : ""}{schedMats.length > 0 ? ` · butuh ${schedMats.map((m) => `${m.name} × ${m.qty}`).join("; ")} (stok tidak dipotong)` : ""}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="td"><Badge tone={e.status === "Maintenance" ? "amber" : "green"}>{e.status === "Maintenance" ? S.eqInService : S.eqScheduled}</Badge></td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            <button className="btn-secondary text-xs" onClick={() => openRecord(e)}>Realisasikan</button>
                            {Array.isArray(e.lastServiceMaterials) && e.lastServiceMaterials.length > 0 && (
                              <>
                                <button className="btn-secondary text-xs" onClick={() => openEditHist(e)}>Edit riwayat</button>
                                <button className="btn-secondary text-xs" onClick={() => setDelHist(e)}>Hapus riwayat</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Kalibrasi" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowCal(true)}><Plus className="h-3.5 w-3.5" /> {S.eqSchedCal}</button>
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
                            {c.status !== "Selesai" && c.status !== "Gagal" && (
                              <button className="btn-secondary text-xs" onClick={() => { setFinishingCal(c); setCalCert(""); setCalResult("Lulus"); setCalDoneDate(todayISO()); setCalInterval("12"); }}>{S.finishBtn}</button>
                            )}
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

      {/* Modal tambah */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={S.eqAdd}
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveAdd}>{S.saveBtn}</AsyncButton></>}>
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
      <Modal open={showService} onClose={() => setShowService(false)} title={S.eqSchedSvc}
        footer={<><button className="btn-secondary" onClick={() => setShowService(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveService}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.thEquipment}>
            <select className="input" value={svcTarget} onChange={(e) => setSvcTarget(e.target.value)}>
              <option value="">{S.eqChoose}</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.eqSvcDateField}><input type="date" className="input" value={schedForm.tanggal} onChange={(e) => setSchedForm({ ...schedForm, tanggal: e.target.value })} /></Field>
            <Field label={S.eqTechField}><input className="input" value={schedForm.teknisi} onChange={(e) => setSchedForm({ ...schedForm, teknisi: e.target.value })} placeholder={S.eqTechPh} /></Field>
            <Field label="Hour meter (odometer)"><NumInput min={0} className="input" value={schedForm.hours} onChange={(e) => setSchedForm({ ...schedForm, hours: e.target.value })} /></Field>
            <Field label={S.eqNextSvc}><input type="date" className="input" value={schedForm.next} onChange={(e) => setSchedForm({ ...schedForm, next: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.eqWorkNote}><input className="input" value={schedForm.catatan} onChange={(e) => setSchedForm({ ...schedForm, catatan: e.target.value })} placeholder={S.eqWorkNotePh} /></Field>
          <div className="border-t border-steel-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-steel-500">Kebutuhan material dari inventory (stok tidak dipotong)</p>
              <button className="btn-secondary text-xs" onClick={() => setSchedMats((m) => [...m, { itemId: "", qty: "" }])}>+ Tambah material</button>
            </div>
            {schedMats.length === 0 && <p className="text-xs text-steel-400">Belum ada material — tambah bila servis terjadwal membutuhkan sparepart dari gudang.</p>}
            {schedMats.map((m, idx) => {
              const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
              return (
                <div key={idx} className="mb-2 grid grid-cols-12 items-end gap-2">
                  <div className="col-span-7">
                    <p className="label">Item · gudang</p>
                    <select className="input" value={m.itemId} onChange={(e) => setSchedMats((arr) => arr.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)))}>
                      <option value="">— Pilih item —</option>
                      {(data.inventory ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.warehouse} · stok {fmtJumlah(Number(x.stock || 0))} {x.unit}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <p className="label">Qty{it ? ` (${it.unit})` : ""}</p>
                    <NumInput min={0} className="input" value={m.qty} onChange={(e) => setSchedMats((arr) => arr.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                  </div>
                  <button className="btn-secondary col-span-2 text-xs" onClick={() => setSchedMats((arr) => arr.filter((_, i) => i !== idx))}>Hapus</button>
                  {it && <p className="col-span-12 text-xs text-steel-500">≈ {fmtRupiah((Number(m.qty) || 0) * invCost(it))} · stok tersedia {fmtJumlah(Number(it.stock || 0))} {it.unit}</p>}
                </div>
              );
            })}
            {schedMats.length > 0 && <p className="text-right text-sm font-semibold text-navy-900">Total kebutuhan: {fmtRupiah(Math.round(schedMatsCost))} (tidak potong stok)</p>}
          </div>
        </div>
      </Modal>

      <Modal open={recording !== null} onClose={() => setRecording(null)} title={S.eqRecordTitle.replace("{a}", recording?.name ?? "")} subtitle={S.eqRecordSub}
        footer={<><button className="btn-secondary" onClick={() => setRecording(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveRecord}>{S.eqSaveSvc}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.eqSvcDateField}><input type="date" className="input" value={woForm.tanggal} onChange={(e) => setWoForm({ ...woForm, tanggal: e.target.value })} /></Field>
            <Field label={S.eqTechField}><input className="input" value={woForm.teknisi} onChange={(e) => setWoForm({ ...woForm, teknisi: e.target.value })} placeholder={S.eqTechPh} /></Field>
            <Field label="Hour meter (odometer)" hint={`Angka odometer alat — bukan jam kerja. Terakhir: ${fmtJumlah(Number((equipment.find((e) => e.id === recording?.id) ?? recording)?.lastHours || 0))} — tidak boleh mundur.`}><NumInput min={0} className="input" value={woForm.hours} onChange={(e) => setWoForm({ ...woForm, hours: e.target.value })} /></Field>
            <Field label={S.eqNextSvc}><input type="date" className="input" value={woForm.next} onChange={(e) => setWoForm({ ...woForm, next: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.eqWorkNote}><input className="input" value={woForm.catatan} onChange={(e) => setWoForm({ ...woForm, catatan: e.target.value })} placeholder={S.eqWorkNotePh} /></Field>
          <div className="border-t border-steel-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-steel-500">Material servis dari inventory (potong stok / barang keluar)</p>
              <button className="btn-secondary text-xs" onClick={() => setSvcMats((m) => [...m, { itemId: "", qty: "" }])}>+ Tambah material</button>
            </div>
            {svcMats.length === 0 && <p className="text-xs text-steel-400">Belum ada material — tambah bila servis memakai sparepart dari gudang.</p>}
            {svcMats.map((m, idx) => {
              const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
              return (
                <div key={idx} className="mb-2 grid grid-cols-12 items-end gap-2">
                  <div className="col-span-7">
                    <p className="label">Item · gudang</p>
                    <select className="input" value={m.itemId} onChange={(e) => setSvcMats((arr) => arr.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)))}>
                      <option value="">— Pilih item —</option>
                      {(data.inventory ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.warehouse} · stok {fmtJumlah(Number(x.stock || 0))} {x.unit}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <p className="label">Qty{it ? ` (${it.unit})` : ""}</p>
                    <NumInput min={0} className="input" value={m.qty} onChange={(e) => setSvcMats((arr) => arr.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                  </div>
                  <button className="btn-secondary col-span-2 text-xs" onClick={() => setSvcMats((arr) => arr.filter((_, i) => i !== idx))}>Hapus</button>
                  {it && <p className="col-span-12 text-xs text-steel-500">≈ {fmtRupiah((Number(m.qty) || 0) * invCost(it))} · stok tersedia {fmtJumlah(Number(it.stock || 0))} {it.unit}</p>}
                </div>
              );
            })}
            {svcMats.length > 0 && <p className="text-right text-sm font-semibold text-navy-900">Total material: {fmtRupiah(Math.round(svcMatsCost))} (masuk biaya servis)</p>}
          </div>
        </div>
      </Modal>

      {/* Modal maintenance */}
      <Modal open={maintaining !== null} onClose={() => setMaintaining(null)} title={S.eqMaintTitle.replace("{a}", maintaining?.name ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setMaintaining(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={startMaintenance}>{S.eqEnterMaintBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.eqDamageNote}><input className="input" value={maintNote} onChange={(e) => setMaintNote(e.target.value)} placeholder={S.eqDamageNotePh} /></Field>
          <Field label={S.eqEtaField}><input type="date" className="input" value={maintEta} onChange={(e) => setMaintEta(e.target.value)} /></Field>
        </div>
      </Modal>

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
            <Field label={S.eqStartField} hint="Format 24 jam (cth 14:00)"><input type="time" className="input" value={bookForm.mulai} onChange={(e) => setBookForm({ ...bookForm, mulai: e.target.value })} /></Field>
            <Field label={S.eqEndField} hint="Format 24 jam (cth 17:30)"><input type="time" className="input" value={bookForm.selesai} onChange={(e) => setBookForm({ ...bookForm, selesai: e.target.value })} /></Field>
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

      {/* Edit riwayat servis terakhir (tampilan record saja, stok tidak diubah) */}
      <Modal open={editHist !== null} onClose={() => setEditHist(null)} title={`Edit riwayat servis - ${editHist?.name ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setEditHist(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveEditHist}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-steel-500">Material servis (stok tidak diubah)</p>
            <button className="btn-secondary text-xs" onClick={() => setEditHistMats((m) => [...m, { itemId: "", qty: "" }])}>+ Tambah material</button>
          </div>
          {editHistMats.length === 0 && <p className="text-xs text-steel-400">Tanpa material.</p>}
          {editHistMats.map((m, idx) => {
            const it = (data.inventory ?? []).find((x) => x.id === m.itemId);
            return (
              <div key={idx} className="mb-2 grid grid-cols-12 items-end gap-2">
                <div className="col-span-7">
                  <p className="label">Item · gudang</p>
                  <select className="input" value={m.itemId} onChange={(e) => setEditHistMats((arr) => arr.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)))}>
                    <option value="">— Pilih item —</option>
                    {(data.inventory ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.warehouse} · stok {fmtJumlah(Number(x.stock || 0))} {x.unit}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <p className="label">Qty{it ? ` (${it.unit})` : ""}</p>
                  <NumInput min={0} className="input" value={m.qty} onChange={(e) => setEditHistMats((arr) => arr.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                </div>
                <button className="btn-secondary col-span-2 text-xs" onClick={() => setEditHistMats((arr) => arr.filter((_, i) => i !== idx))}>Hapus</button>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Hapus riwayat servis terakhir */}
      <ConfirmModal
        open={delHist !== null}
        title={`Hapus riwayat servis - ${delHist?.name ?? ""}`}
        desc="Riwayat servis terakhir akan dihapus dari tampilan. Stok inventory tidak dikembalikan."
        confirmLabel={S.delBtn}
        danger
        onCancel={() => setDelHist(null)}
        onConfirm={confirmDelHist}
      />

      {/* Modal selesaikan booking */}
      <Modal open={finishing !== null} onClose={() => setFinishing(null)} title={S.eqFinishBookTitle.replace("{a}", finishing ? equipLabel(finishing.equip) : "")} subtitle={finishing ? `${finishing.proyek} · ${finishing.jam} · ${fmtTanggal(String(finishing.date))}` : ""}
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

      {/* Modal jadwalkan kalibrasi */}
      <Modal open={showCal} onClose={() => setShowCal(false)} title={S.eqSchedCal}
        footer={<><button className="btn-secondary" onClick={() => setShowCal(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveCalibration}>{S.saveBtn}</button></>}>
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
