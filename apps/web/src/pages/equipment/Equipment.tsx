import { useEffect, useMemo, useState } from "react";
import { Plus, Cpu, Pencil, Trash2, Wrench, AlertTriangle, Gauge, CheckCircle2, Download, User } from "lucide-react";
import { PageHeader, Badge, KpiCard, Tabs, ProgressBar, Modal, Field, FormGrid, ConfirmModal, toast, SortTh, toggleSort, sortRows, usePager,
  NumInput, MoneyInput, AsyncButton,
  SearchBox,
  rowMatches,
  RowAction,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { ServiceNotesButton, ServiceNotesModal, notesOf } from "../../components/ServiceNotes";
import { useStore } from "../../data/store";
import type { StoreItem, CollectionKey } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { remoteRepository } from "../../services/repositories";
import { getJwt, isBackendConfigured } from "../../services/http";
import { serviceDueTrend } from "../../data";
import { fmtTanggal, fmtJumlah, fmtRupiah, parseIdNumber, parseRupiah, todayISO } from "../../utils/format";
import { loadedLaborRatePerDay } from "../../utils/rates";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import { sameName } from "../../utils/names";
import {
  MAINT_JENIS,
  canRestoreStock,
  canTransition,
  costBreakdown,
  historyOf,
  materialsCost,
  materialsOf,
  nextStatuses,
  planShortages,
  planStockCut,
  statusOf,
  workDaysOf,
  type MaintStatus,
} from "../../utils/maintenance";
import { maintenanceDowntimeHours } from "../../utils/projectCost";
import { employeeOptions, isKnownEmployee } from "../../utils/employeeOptions";
import { EntityPicker } from "../../components/ui";
import { AlertBannerView, flashPick, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { rowHighlightClass } from "../../components/rowHighlight";
import { exportExcel } from "../../utils/export";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_eqp } from "../../i18n/n_eqp";

const TARGET_HOURS = 176;
const EQ_CATS = ["Pengangkat", "Pengelasan", "Tenaga", "Transportasi", "Pengecatan", "Lainnya"];

/* Tarif harian teknisi untuk hitung biaya tenaga servis.
   DEFAULT ini hanya fallback - angka bisnis sebenarnya ada di settings
   (EQUIP_LABOR_RATE_PER_DAY), dibaca saat siklus dibuat supaya tarif
   tidak mengikat seluruh riwayat lampau yang sudah terpakai.

   Angkanya diturunkan dari UMP Kalimantan Timur 2026 lewat utils/rates.ts
   (beban BPJS + THR + pengawas + tools). Nilai lama 1.100.000 berdiri
   sendiri tanpa bisa ditunjuk ke UMP mana pun, sehingga biaya tenaga servis
   under-reported atau over-reported tanpa alasan yang bisa dibuktikan. */
const DEFAULT_LABOR_RATE_PER_DAY = loadedLaborRatePerDay("welder");

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

/* Baca ulang `maintenances` dari server, bukan dari snapshot render.
   Dipakai setelah form hasil servis disimpan: transition ke "Selesai"
   memotong stok dan menghitung bahan/biaya dari baris yang DIBACA, jadi
   kalau baris di memori masih versi lama, pemotongan memakai angka lama.
   Mode lokal / tanpa backend -> pakai snapshot, seperti helper sejenis di
   modul Subkontraktor. */
async function freshMaintenances(fallback: StoreItem[]): Promise<StoreItem[]> {
  try {
    if (isBackendConfigured() && getJwt()) {
      const rows = await remoteRepository("maintenances").list();
      if (Array.isArray(rows)) return rows;
    }
  } catch {
    /* abaikan - pakai snapshot lokal */
  }
  return fallback;
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


/* Batch koleksi modul Equipment untuk useModuleSync (pengganti resync penuh). */
const EQ_COLS: CollectionKey[] = ["activities", "bookings", "branches", "calibrations", "equipment", "inventory", "projects", "maintenances", "employees", "movements", "settings"];

export default function EquipmentPage() {
  const { data, add, update, remove, log } = useStore();
  const { locale } = useT();
  const S = n_eqp[locale];
  const modAlert = useModuleAlert("equipment");
  const flash = useNotifFlash();
  const deepParams = useDeepLinkParams();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(EQ_COLS);
  const equipment = data.equipment;
  const bookings = data.bookings;
  const calibrations = data.calibrations;
  const maintenances = data.maintenances;
  const employees = data.employees;
  const projects = data.projects;
  const [tab, setTab] = useState("Daftar Equipment");

const [eqQ, setEqQ] = useState("");
  const [eqStatus, setEqStatus] = useState("Semua");
  const [eqCat, setEqCat] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [delEquip, setDelEquip] = useState<StoreItem | null>(null);
  const picOptions = useMemo(() => employeeOptions(data.employees), [data.employees]);
  /* T6-EQ1: form disesuaikan notes2 - branch hidden (default Samarinda),
     serial → tahun unit, model → merk, pic → PJ unit, harga barang,
     umur pakai dalam bulan, keterangan, tahun akuisisi. Tarif+BBM di-hide. */
  const [form, setForm] = useState({ name: "", category: "Pengangkat", categoryCustom: "", code: "", serial: "", branch: "Samarinda", model: "", pic: "", util: "50", rate: "", fuelPrice: "0", acquisitionCost: "", usefulLife: "", notes: "", acqYear: "" });
  /* T6-EQ5: delegasi peminjaman per unit. */
  const [delegasiFor, setDelegasiFor] = useState<StoreItem | null>(null);
  const [delegasiTo, setDelegasiTo] = useState("");
  const [delegasiNote, setDelegasiNote] = useState("");
  const [showService, setShowService] = useState(false);



  /* ================= SIKLUS MAINTENANCE (koleksi `maintenances`) =================
     Alur: Terjadwal -> Sedang Proses -> Selesai, atau Dibatalkan dari mana saja
     selain Selesai. Setiap transisi masuk ke maintenance.history[].

     `maintenanceForm` dipakai untuk create (dari tombol Jadwalkan) maupun
     update (dari tombol Ubah) - satu form, satu handler, supaya tidak ada
     dua jalur tulis yang bisa berbedaivrsi. */
  const [maintForm, setMaintForm] = useState<MaintForm>(emptyMaintForm());
  const [maintEditingId, setMaintEditingId] = useState<string | null>(null);
  /* true = form ini dibuka dari tombol "Catat Servis", jadi setelah hasil
     servis tersimpan siklusnya langsung diselesaikan (lihat saveMaint). */
  const [maintFinishOnSave, setMaintFinishOnSave] = useState(false);


  const today = todayISO();

  /* Booking dicocokkan by ID/code; nama lama tetap terbaca (fallback) untuk data lama. */
  const resolveEquip = (ref: unknown): StoreItem | undefined => {
    const key = String(ref ?? "").trim();
    if (!key) return undefined;
    return equipment.find((e) => String(e.id) === key || String(e.code ?? "").toUpperCase() === key.toUpperCase())
      ?? equipment.find((e) => sameName(e.name, key));
  };
  const equipKey = (ref: unknown): string => resolveEquip(ref)?.id ?? `name:${String(ref ?? "").trim().toLowerCase()}`;
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



  const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
    Tersedia: "green",
    Terpakai: "blue",
    Maintenance: "amber",
  };

  /* T6-EQ4 fix: KPI "Dalam Maintenance" = equipment status Maintenance
     + alat dengan kalibrasi aktif (belum Selesai/Gagal), sesuai hint. */
  const calActiveEqIds = new Set(
    calibrations
      .filter((c) => c.status !== "Selesai" && c.status !== "Gagal")
      .map((c) => String(c.equipmentId ?? "")),
  );
  const maintenance = equipment.filter((e) => e.status === "Maintenance" || calActiveEqIds.has(String(e.id))).length;
  const dueSoon = equipment.filter((e) => {
    const d = daysUntil(String(e.nextService ?? ""), today);
    return d !== null && d <= 14;
  });


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



  const regFiltered = equipment.filter((e) => {
    if (eqStatus !== "Semua" && String(e.status ?? "") !== eqStatus) return false;
    if (eqCat !== "Semua" && String(e.category ?? "") !== eqCat) return false;
    return rowMatches(e, eqQ, ["id", "name", "code", "model", "category", "status", "lastHours", "rate"]);
  });
  const regSorted = useMemo(() => sortRows(regFiltered, sort, (e, k) => {
    if (k === "utilisasi") return (e.utilManual === true) ? Number(e.util || 0) : autoUtilOf(e);
    if (k === "jam") return Number(e.lastHours || 0);
    if (k === "harga" || k === "tarif") return Number(e.acquisitionCost || e.rate || 0);
    if (k === "nilaibuku") return Number(depreciationOf(e)?.book ?? -1);
    if (k === "kategori") return String(e.category ?? "");
    if (k === "model") return String(e.model ?? "");
    if (k === "serial") return String(e.serial ?? "");
    if (k === "acqYear") return Number(e.acqYear || 0);
    if (k === "status") return String(e.status ?? "");
    if (k === "createdAt") return createdAtOf(e) ?? "";
    if (k === "updatedAt") return lastTouchedAt(e) ?? "";
    return String(e.name ?? "");
  }), [regFiltered, sort, bookings, today]);
  const regPager = usePager(regFiltered.length);
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const idx = regSorted.findIndex((e) => ids.includes(String(e.id)));
    if (idx >= 0) {
if (tab === "Daftar Equipment") { flashPick(flash, ids, idx, regPager.go, regPager.size); return; }
    setTab("Daftar Equipment");
      window.setTimeout(() => flashPick(flash, ids, idx, regPager.go, regPager.size), 250);
      return;
    }
    const found = equipment.find((e) => ids.includes(String(e.id)));
    if (!found) { flashPick(flash, ids, -1, () => {}, 100); return; }
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
    const fullIdx = fullSorted.findIndex((e) => ids.includes(String(e.id)));
    setTab("Daftar Equipment");
    setEqStatus("Semua");
    setEqCat("Semua");
    window.setTimeout(() => flashPick(flash, ids, fullIdx, regPager.go, regPager.size), 250);
  };
  const pickNotif = (rowId: string) => pickNotifIds([rowId]);
  /* T7-EQ2: whitelist tab aktif - tab lama (Booking/Maintenance/dst) dihapus
     dari UI; tanpa whitelist ini URL ?tab=Maintenance masih me-resurrect
     branch yang sudah mati. */
  useDeepLinkTarget(deepParams.tab, deepParams.highlight, setTab, pickNotifIds, [], ["Daftar Equipment"]);
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
      rate: String(parseIdNumber(e.rate)),
      fuelPrice: String(parseIdNumber(e.fuelPrice)),
      acquisitionCost: String(parseIdNumber(e.acquisitionCost)),
      /* usefulLife di store tetap tahun; form menampilkan bulan. */
      usefulLife: String(Math.round((Number(e.usefulLife ?? 0) || 0) * 12)),
      notes: String(e.notes ?? ""),
      acqYear: String(e.acquisitionYear ?? ""),
    });
    setShowAdd(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const category = form.category === "Lainnya" ? form.categoryCustom.trim() : form.category;
    if (!form.name.trim()) { toast(locale === "en" ? "Equipment name is required" : "Nama equipment wajib diisi", "info"); return; }
    if (!category) { toast(locale === "en" ? "Custom category is required" : "Kategori kustom wajib diisi", "info"); return; }
    if (!form.serial.trim()) { toast(locale === "en" ? "Unit year is required" : "Tahun unit wajib diisi", "info"); return; }
    /* Kode equipment = identitas bisnis (dipakai label QR, booking, kontrak
       sewa). Mengubahnya melenceng dari semua rujukan lama, jadi form ubah
       sengaja tidak menyediakan kolom kode sama sekali. */
    const rate = parseRupiah(form.rate || "0");
    const fuelPrice = parseRupiah(form.fuelPrice || "0");
    const acquisitionCost = parseRupiah(form.acquisitionCost || "0");
    /* Form umur pakai dalam BULAN; store/depreciation memakai TAHUN. */
    const usefulLifeMonths = Number(form.usefulLife || 0);
    const usefulLife = usefulLifeMonths > 0 ? Math.round((usefulLifeMonths / 12) * 10) / 10 : 0;
    if (!Number.isFinite(rate) || rate < 0) { toast(S.eqRateMin, "info"); return; }
    if (!Number.isFinite(fuelPrice) || fuelPrice < 0) { toast(S.eqFuelMin, "info"); return; }
    if ((form.acquisitionCost && (!Number.isFinite(acquisitionCost) || acquisitionCost < 0))
      || (form.usefulLife && (!Number.isFinite(usefulLifeMonths) || usefulLifeMonths <= 0))) {
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
        notes: form.notes.trim(),
        acquisitionYear: form.acqYear.trim() || undefined,
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
    const rate = parseRupiah(form.rate || "0");
    if (!Number.isFinite(rate) || rate < 0) { toast(S.eqRateMin, "info"); return; }
    const fuelPrice = parseRupiah(form.fuelPrice || "0");
    const acquisitionCost = parseRupiah(form.acquisitionCost || "0");
    const usefulLifeMonths = Number(form.usefulLife || 0);
    const usefulLife = usefulLifeMonths > 0 ? Math.round((usefulLifeMonths / 12) * 10) / 10 : 0;
    if (fuelPrice < 0 || !Number.isFinite(fuelPrice)) { toast(S.eqFuelMin, "info"); return; }
    if ((form.acquisitionCost && (!Number.isFinite(acquisitionCost) || acquisitionCost < 0)) || (form.usefulLife && (!Number.isFinite(usefulLifeMonths) || usefulLifeMonths <= 0))) {
      toast(S.eqCostLife, "info");
      return;
    }
    const created = await add("equipment", {
      name: form.name.trim(), category, code, serial: form.serial.trim(), branch: form.branch,
      status: "Tersedia", util: 0, utilManual: false, nextService: "-", lastHours: 0, model: form.model.trim() || "-",
      pic: form.pic.trim(), rate, fuelPrice, acquisitionCost, usefulLife,
      notes: form.notes.trim(),
      acquisitionYear: form.acqYear.trim() || undefined,
    }, { action: "mendaftarkan equipment", module: "Equipment" });
    toast(S.eqAdded.replace("{a}", created.id));
    setShowAdd(false);
    setForm({ name: "", category: "Pengangkat", categoryCustom: "", code: "", serial: "", branch: "Samarinda", model: "", pic: "", util: "50", rate: "", fuelPrice: "0", acquisitionCost: "", usefulLife: "", notes: "", acqYear: "" });
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

  /** Buka form UBAH satu siklus yang sudah ada.
   *  `finishOnSave` dipakai oleh tombol "Catat Servis": form ini bukan
   *  koreksi data, tapi pengisian hasil servis, jadi setelah tersimpan
   *  siklusnya langsung diselesaikan (lihat saveMaint). */
  const openMaintEdit = (m: StoreItem, finishOnSave = false) => {
    const mats = materialsOf(m);
    const eq = equipment.find((e) => String(e.id) === String(m.equipmentId));
    setMaintEditingId(String(m.id));
    setMaintFinishOnSave(finishOnSave);
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
    setMaintFinishOnSave(false);
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

    /* E1: catatan servis WAJIB saat jalur "Catat Servis" / finish. */
    if (maintFinishOnSave && !String(form.catatan ?? "").trim()) {
      toast(
        locale === "en" ? "Service notes are required to finish this cycle" : "Catatan servis wajib diisi untuk menyelesaikan siklus ini",
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
      /* Jalur "Catat Servis": form ini dibuka dari tombol itu, jadi setelah
         hasil servis tersimpan, siklusnya baru benar-benar diselesaikan -
         lengkap dengan pemotongan stok dan pelepasan unit dari workshop.
         Tanpa langkah ini, tombolnya hanya jadi "Ubah" yang tidak menutup
         apa pun. */
      if (maintFinishOnSave && maintEditingId) {
        /* Baris dibaca ULANG dari server: `data.maintenances` di memori masih
           versi sebelum form ini disimpan, jadi transition-nya akan menghitung
           bahan dan biaya dari angka lama. */
        const fresh = await freshMaintenances(data.maintenances);
        const saved = fresh.find((m) => String(m.id) === String(maintEditingId));
        if (!saved) {
          toast(locale === "en" ? "Service record could not be re-read - finish it from the list" : "Data servis tidak terbaca ulang - selesaikan dari daftar", "info");
          return;
        }
        await advanceMaintStatus(saved, "Selesai");
      }
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



  const exportRegister = () => {
    void exportExcel(
      /* T6-EQ1: kolom tarif+BBM di-hide di form → jangan ikut export register. */
      [["Kode", "Nama", "Kategori", "Harga Perolehan (Rp)", "Umur Ekonomis (thn)", "Penyusutan/Tahun (Rp)", "Nilai Buku (Rp)"],
        ...equipment.map((e) => {
          const dep = depreciationOf(e);
          return [e.code, e.name, e.category, Number(e.acquisitionCost || 0), Number(e.usefulLife || 0), dep ? Math.round(dep.annual) : 0, dep ? Math.round(dep.book) : 0];
        })],
      `Register-Aset-Equipment-${today}`,
      "Register",
    ).catch(() => toast(S.saveFail, "info"));
    toast(S.eqRegisterExported);
  };

/* ---------- Catatan servis per unit ---------- */
  const [noteEquip, setNoteEquip] = useState<StoreItem | null>(null);
  const noteLabels = useMemo(() => ({
    title: locale === "en" ? "Service notes - {a}" : "Catatan Servis - {a}",
    subtitle: locale === "en"
      ? "Cross-cycle observations. Kept separate from the note on each maintenance cycle."
      : "Pengamatan lintas siklus. Dipisahkan dari catatan pada tiap siklus maintenance.",
    observation: locale === "en" ? "Observation" : "Pengamatan",
    observationPh: locale === "en"
      ? "e.g. welding on this seam cracks again after the 3rd pass"
      : "cth: las di sambungan ini retak lagi setelah lapis ke-3",
    attachment: locale === "en" ? "Attachment (optional)" : "Lampiran (opsional)",
    attachmentHint: locale === "en" ? "Photo or PDF of the report" : "Foto atau PDF laporan",
    recorded: locale === "en" ? "Recorded ({n})" : "Tercatat ({n})",
    empty: locale === "en"
      ? "No notes yet. Maintenance cycle notes stay on each cycle."
      : "Belum ada catatan. Catatan siklus maintenance tetap menempel pada siklusnya.",
    save: locale === "en" ? "Save Note" : "Simpan Catatan",
    close: locale === "en" ? "Close" : "Tutup",
    delete: locale === "en" ? "Delete" : "Hapus",
    deleteTitle: locale === "en" ? "Delete this note?" : "Hapus catatan ini?",
    deleteDesc: locale === "en" ? "Deleted notes cannot be restored." : "Catatan yang dihapus tidak bisa dikembalikan.",
    added: locale === "en" ? "Service note added" : "Catatan servis ditambahkan",
    removed: locale === "en" ? "Service note removed" : "Catatan servis dihapus",
    notes: locale === "en" ? "Notes" : "Catatan",
    notesTitle: locale === "en"
      ? "Service notes that outlive a single maintenance cycle"
      : "Catatan servis yang bertahan melewati satu siklus maintenance",
    emptyNote: locale === "en" ? "Note is empty" : "Catatan kosong",
    saveFail: S.saveFail,
    fmtDate: (v: unknown): string => fmtTanggal(String(v ?? "")),
  }), [locale, S.saveFail]);

  return (
    <div>
      <PageHeader
        title={S.eqTitle}
        subtitle={S.eqSubtitle}
        icon={<Cpu className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> {S.eqAdd}</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} dismiss={modAlert.dismiss} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.eqKpiTotal} value={String(equipment.length)} icon={<Cpu className="h-5 w-5" />} chip="navy" hint={S.eqKpiTotalHint} />
        {/* T6-EQ4: card analisis = Total / Sedang terpakai / Dalam maintenance. */}
        <KpiCard label={S.eqKpiUsed ?? "Sedang Terpakai"} value={String(equipment.filter((e) => e.status === "Terpakai").length)} icon={<Gauge className="h-5 w-5" />} chip="teal" hint={S.eqKpiUsedHint} />
        <KpiCard label={S.eqKpiMaint2 ?? "Dalam Maintenance"} value={String(maintenance)} delta={S.eqKpiMaintDelta} deltaDirection="down" icon={<Wrench className="h-5 w-5" />} chip="amber" hint={S.eqKpiMaint2Hint} />
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
        {/* T6-EQ3: hanya daftar equipment. Tab booking/maintenance/kalibrasi/
            biaya dihapus dari UI (data tetap di store; alur servis lewat
            aksi/aksi delegasi). */}
        <Tabs tabs={["Daftar Equipment"]} active={tab} onChange={setTab} labels={{ "Daftar Equipment": locale === "en" ? "Equipment List" : "Daftar Equipment" }} />
        <div className="p-4">
          {tab === "Daftar Equipment" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SearchBox
                  value={eqQ}
                  onChange={setEqQ}
                  placeholder={S.eqSearchPh}
                  ariaLabel={S.eqSearchAria}
                  className="min-w-52 flex-1 sm:max-w-xs"
                />
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
                  <tr><SortTh label={S.thEquipment} sortKey="equipment" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thCategory} sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thModel} sortKey="model" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.eqSerialField} sortKey="serial" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.eqAcqYearField} sortKey="acqYear" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.eqPicField} sortKey="pic" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thUtil} sortKey="utilisasi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thHours} sortKey="jam" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.eqCostField} sortKey="harga" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colCreated} sortKey="createdAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colUpdated} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.thAction}</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {regPager.slice(regSorted).map((e) => {
                    const expired = isCalExpired(e.id, calibrations, today);
                    return (
                    <tr key={e.id} id={notifRowId(String(e.id))} className={rowHighlightClass({ id: String(e.id), flash, notified: notified.has(String(e.id)), base: "hover:bg-surface" })}>
                      <td className="td">
                        <p className="font-medium text-navy-900">{e.name}</p>
                        <p className="text-xs text-steel-500 font-mono">{e.code}</p>
                      </td>
                      <td className="td"><Badge tone="gray">{e.category}</Badge></td>
                      <td className="td text-steel-600">{e.model}</td>
                      {/* T7-EQ1: kolom nomor seri + tahun unit/akuisisi. */}
                      <td className="td text-xs font-mono text-steel-500">{String(e.serial ?? "-")}</td>
                      <td className="td text-steel-600">{String(e.acqYear ?? "-")}</td>
                      {/* T6-EQ1/EQ2: kolom PJ unit + harga barang; tarif/BBM disembunyikan. */}
                      <td className="td text-steel-600 truncate" title={String(e.pic ?? "")}>{String(e.pic ?? "-")}</td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={statusTone[e.status] ?? "gray"}>{e.status}</Badge>
                          {isMeasuring(e) && expired && <Badge tone="red">{S.eqCalExpired}</Badge>}
                          {String(e.delegatedTo ?? "") !== "" && (
                            <Badge
                              tone="blue"
                              title={`${String(e.delegationNote ?? "")}${String(e.delegatedAt ?? "") ? ` · ${fmtTanggal(String(e.delegatedAt))}` : ""}`}
                            >
                              {S.eqDelegasiBadge?.replace("{a}", String(e.delegatedTo)) ?? `→ ${String(e.delegatedTo)}`}
                              {String(e.delegatedAt ?? "") ? ` · ${fmtTanggal(String(e.delegatedAt))}` : ""}
                            </Badge>
                          )}
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
                      <td className="td text-steel-600 text-xs font-semibold">{fmtRupiah(Number(e.acquisitionCost || 0))}</td>
                      <td className="td text-xs text-steel-600">{createdAtOf(e) !== null ? fmtTanggal(createdAtOf(e)) : <span className="text-steel-400">-</span>}</td>
                      <td className="td text-xs text-steel-600">{lastTouchedAt(e) !== null ? fmtTanggal(lastTouchedAt(e)) : <span className="text-steel-400">-</span>}</td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1.5">
                        {/* Aksi Register diarahkan ke ALUR SIKLUS, bukan lagi
                            toggle status langsung. Mulai = buat siklus
                            Terjadwal; Selesai = majukan siklus yang sedang
                            berjalan (bukan cuma membalik status equipment),
                            supaya material terpotong dan HPP proyek terisi. */}
                        {e.status === "Tersedia" && (
                          <RowAction
                            icon={Wrench}
                            tone="primary"
                            label={locale === "en" ? "Schedule service" : "Jadwalkan Servis"}
                            ariaLabel={`${locale === "en" ? "Schedule service" : "Jadwalkan Servis"} ${String(e.name ?? e.id)}`}
                            onClick={() => openMaintNew(String(e.id))}
                          />
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
                              /* E1: SEMUA jalur ke Selesai lewat modal catatan servis.
                                 Versi lama Register memanggil advanceMaintStatus
                                 langsung tanpa modal - persis yang dikeluhkan. */
                              onClick={() => openMaintEdit(cycle.raw, true)}
                              title={locale === "en" ? "Open service notes modal (required to finish)" : "Buka modal catatan servis (wajib untuk menyelesaikan)"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> {S.eqComplete}
                            </button>
                          );
                        })()}
                        {e.status === "Terpakai" && (
                          <span className="text-xs text-steel-500">{S.eqBackToBooking}</span>
                        )}
                        {/* T6-EQ5: aksi delegasi peminjaman per unit. */}
                        <RowAction
                          icon={User}
                          tone="primary"
                          label={S.eqDelegasiBtn ?? "Delegasi"}
                          ariaLabel={`${S.eqDelegasiBtn ?? "Delegasi"} ${String(e.name ?? e.id)}`}
                          onClick={() => {
                            setDelegasiFor(e);
                            setDelegasiTo(String(e.delegatedTo ?? e.pic ?? ""));
                            setDelegasiNote(String(e.delegationNote ?? ""));
                          }}
                        />
                        {/* Ubah/Hapus equipment. Dulu tabel Register tidak punya
                            kolom aksi sama sekali selain lifecycle servis,
                            sehingga equipment yang salah tarif/jangka tidak
                            bisa dikoreksi dan equipment yang tak dipakai
                            selamanya tidak bisa dihapus. */}
                        {/* Catatan servis lintas siklus: pengamatan seperti "titik
                            las ini retak lagi" menempel pada unit, bukan pada satu
                            siklus maintenance, jadi tidak ikut tertutup bersama
                            arsip siklusnya. */}
                        <ServiceNotesButton
                          count={notesOf(e).length}
                          labels={{
                            notes: locale === "en" ? "Notes" : "Catatan",
                            notesTitle: locale === "en"
                              ? "Service notes that outlive a single maintenance cycle"
                              : "Catatan servis yang bertahan melewati satu siklus maintenance",
                          }}
                          onClick={() => setNoteEquip(e)}
                        />
                        <RowAction
                          icon={Pencil}
                          tone="neutral"
                          label={locale === "en" ? "Edit equipment" : "Ubah equipment"}
                          ariaLabel={`${S.eqEdit} ${String(e.name ?? e.id)}`}
                          onClick={() => openEdit(e)}
                        />
                        <RowAction
                          icon={Trash2}
                          tone="danger"
                          label={locale === "en" ? "Delete equipment" : "Hapus equipment"}
                          ariaLabel={`${S.delBtn} ${String(e.name ?? e.id)}`}
                          onClick={() => setDelEquip(e)}
                        />
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
            {/* T6-EQ1: cabang di-hidden, default Samarinda (ditulis saat save). */}
            <Field label={S.eqSerialField} hint={S.eqSerialHint}><input className="input font-mono" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} placeholder={S.eqSerialPh} /></Field>
            <Field label={S.eqAcqYearField}><input className="input font-mono" value={form.acqYear} onChange={(e) => setForm({ ...form, acqYear: e.target.value })} placeholder={S.eqAcqYearPh} /></Field>
            <Field label={S.eqPicField} hint={S.eqPicHint}><EntityPicker value={form.pic} onChange={(v) => setForm({ ...form, pic: v })} options={picOptions} placeholder={S.eqPicPh} ariaLabel={S.eqPicField} emptyText={locale === "en" ? "No matching employee." : "Tidak ada karyawan yang cocok."} allowCustom invalid={form.pic.trim() !== "" && !isKnownEmployee(data.employees, form.pic)} /></Field>
            <Field label={S.thModel}><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label={S.eqUtilField}><NumInput className="input" value={form.util} onChange={(e) => setForm({ ...form, util: e.target.value })} /></Field>
            {/* T6-EQ1: tarif pakai + BBM di-hide (bukan dihapus dari store). */}
            {false && (
              <>
                <Field label={S.eqRateField}><MoneyInput className="input" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} placeholder={S.eqRatePh} /></Field>
                <Field label={S.eqFuelField}><MoneyInput className="input" value={form.fuelPrice} onChange={(v) => setForm({ ...form, fuelPrice: v })} placeholder={S.eqFuelPh} /></Field>
              </>
            )}
            <Field label={S.eqCostField}><MoneyInput className="input" value={form.acquisitionCost} onChange={(v) => setForm({ ...form, acquisitionCost: v })} placeholder={S.eqCostPh} /></Field>
            <Field label={S.eqLifeField} hint={locale === "en" ? "Stored internally as years" : "Disimpan internal dalam tahun"}>
              <NumInput min={0} className="input" value={form.usefulLife} onChange={(e) => setForm({ ...form, usefulLife: e.target.value })} placeholder={S.eqLifePh} />
            </Field>
            <Field label={S.eqNotesField}><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={S.eqNotesPh} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* T6-EQ5: modal delegasi peminjaman equipment. */}
      <Modal open={delegasiFor !== null} onClose={() => setDelegasiFor(null)}
        title={(S.eqDelegasiTitle ?? "Delegasi - {a}").replace("{a}", String(delegasiFor?.name ?? ""))}
        subtitle={String(delegasiFor?.id ?? "")}
        footer={<>
          <button className="btn-secondary" onClick={() => setDelegasiFor(null)}>{S.cancelBtn}</button>
          {String(delegasiFor?.delegatedTo ?? "") !== "" && (
            <button className="btn-secondary text-rose-600" onClick={async () => {
              if (!delegasiFor) return;
              try {
                await update("equipment", delegasiFor.id, { delegatedTo: undefined, delegatedAt: undefined, delegationNote: undefined });
                toast((S.eqDelegasiCleared ?? "Delegasi {a} dibersihkan").replace("{a}", String(delegasiFor.name)));
                setDelegasiFor(null);
              } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
            }}>{locale === "en" ? "Clear" : "Bersihkan"}</button>
          )}
          <AsyncButton className="btn-primary" onAction={async () => {
            if (!delegasiFor) return;
            if (!delegasiTo.trim()) { toast(locale === "en" ? "Delegate is required" : "Penerima delegasi wajib diisi", "info"); return; }
            try {
              /* T6-EQ5 fix: jangan timpa `pic` - PJ unit asli tetap tersimpan;
                 delegasi hanya menambah delegatedTo/delegatedAt/delegationNote. */
              await update("equipment", delegasiFor.id, {
                delegatedTo: delegasiTo.trim(),
                delegatedAt: todayISO(),
                delegationNote: delegasiNote.trim(),
              });
              log("mendelegasikan equipment", `${delegasiFor.id} → ${delegasiTo.trim()}`, "Equipment");
              toast((S.eqDelegasiSaved ?? "Delegasi {a} disimpan").replace("{a}", String(delegasiFor.id)));
              setDelegasiFor(null);
            } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          }}>{S.saveBtn}</AsyncButton>
        </>}>
        <div className="space-y-3">
          <Field label={S.eqDelegasiTo ?? "Dipinjam ke"}>
            <EntityPicker value={delegasiTo} onChange={setDelegasiTo} options={picOptions} placeholder={S.eqPicPh} ariaLabel={S.eqDelegasiTo} emptyText={locale === "en" ? "No matching employee." : "Tidak ada karyawan yang cocok."} allowCustom />
          </Field>
          <Field label={S.eqDelegasiNote ?? "Catatan"}>
            <input className="input" value={delegasiNote} onChange={(e) => setDelegasiNote(e.target.value)} placeholder={S.eqDelegasiNotePh} />
          </Field>
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






      <ServiceNotesModal
        equip={noteEquip}
        labels={noteLabels}
        onClose={() => setNoteEquip(null)}
        onSave={async (id, next) => {
          await update("equipment", id, { serviceNotes: next });
          log("menulis catatan servis", `${id} (${next.length} catatan)`, "Equipment");
          setNoteEquip((e) => (e ? { ...e, serviceNotes: next } : e));
        }}
      />
    </div>
  );
}


