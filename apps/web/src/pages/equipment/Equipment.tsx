import { useEffect, useMemo, useState } from "react";
import { Plus, Cpu, Wrench, AlertTriangle, Gauge, CheckCircle2, Download, Search } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, RadialGauge, Modal, Field, FormGrid, EmptyState, ConfirmModal, StatusBadge, toast, SortTh, toggleSort, sortRows, usePager,
  NumInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
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

export default function EquipmentPage() {
  const { data, add, update, remove, log, branch } = useStore();
  const { locale } = useT();
  const S = n_eqp[locale];
  const modAlert = useModuleAlert("equipment");
  const flash = useNotifFlash();
  const equipment = data.equipment;
  const bookings = data.bookings;
  const calibrations = data.calibrations;
  const [tab, setTab] = useState("Register");
  const [eqQ, setEqQ] = useState("");
  const [eqStatus, setEqStatus] = useState("Semua");
  const [eqCat, setEqCat] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });
  const [sort4, setSort4] = useState<SortState>({ key: null, dir: "asc" });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Pengangkat", code: "", serial: "", branch: "Samarinda", model: "", pic: "", util: "50", rate: "", fuelPrice: "0", acquisitionCost: "", usefulLife: "" });
  const [showService, setShowService] = useState(false);
  const [svcDate, setSvcDate] = useState("");
  const [svcTarget, setSvcTarget] = useState("");

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

  const [showCal, setShowCal] = useState(false);
  const [calForm, setCalForm] = useState({ equipmentId: "", item: "", due: "" });
  const [finishingCal, setFinishingCal] = useState<StoreItem | null>(null);
  const [calCert, setCalCert] = useState("");

  const today = todayISO();

  const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
    Tersedia: "green",
    Terpakai: "blue",
    Maintenance: "amber",
  };

  const maintenance = equipment.filter((e) => e.status === "Maintenance").length;
  const avgUtil = equipment.length ? Math.round(equipment.reduce((s, e) => s + Number(e.util || 0), 0) / equipment.length) : 0;
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
      if (!sameName(a.equip, b.equip) || a.date !== b.date) continue;
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
  const statsByEquip = (name: string): { hours: number; downtime: number; fuel: number } => ({
    hours: doneBookings.filter((b) => sameName(b.equip, name)).reduce((s, b) => s + Number(b.hours || 0), 0),
    downtime: doneBookings.filter((b) => sameName(b.equip, name)).reduce((s, b) => s + Number(b.downtime || 0), 0),
    fuel: doneBookings.filter((b) => sameName(b.equip, name)).reduce((s, b) => s + Number(b.fuelLiters || 0), 0),
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
    if (k === "utilisasi") return Number(e.util || 0);
    if (k === "jam") return Number(e.lastHours || 0);
    if (k === "tarif") return Number(e.rate || 0);
    if (k === "nilaibuku") return Number(depreciationOf(e)?.book ?? -1);
    if (k === "kategori") return String(e.category ?? "");
    if (k === "model") return String(e.model ?? "");
    if (k === "status") return String(e.status ?? "");
    return String(e.name ?? "");
  }), [regFiltered, sort]);
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
    if (!form.name.trim() || !form.code.trim()) { toast(S.eqReqNameCode, "info"); return; }
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) { toast(S.eqCodeFormat, "info"); return; }
    if (equipment.some((e) => String(e.code).toUpperCase() === code)) { toast(S.eqCodeUsed.replace("{a}", code), "info"); return; }
    if (!form.serial.trim()) { toast(S.eqSerialReq, "info"); return; }
    if (!form.pic.trim()) { toast(S.eqPicReq, "info"); return; }
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
      name: form.name.trim(), category: form.category, code, serial: form.serial.trim(), branch: form.branch,
      status: "Tersedia", util, nextService: "-", lastHours: 0, model: form.model.trim() || "-",
      pic: form.pic.trim(), rate, fuelPrice, acquisitionCost, usefulLife,
    }, { action: "mendaftarkan equipment", module: "Equipment" });
    toast(S.eqAdded.replace("{a}", created.id));
    setShowAdd(false);
    setForm({ name: "", category: "Pengangkat", code: "", serial: "", branch: "Samarinda", model: "", pic: "", util: "50", rate: "", fuelPrice: "0", acquisitionCost: "", usefulLife: "" });
  };

  const saveService = async () => {
    if (!svcTarget || !svcDate) { toast(S.eqSvcReq, "info"); return; }
    const target = equipment.find((e) => e.id === svcTarget);
    await update("equipment", svcTarget, { nextService: svcDate });
    log("menjadwalkan servis", `${target?.name ?? svcTarget} · ${fmtTanggal(svcDate)}`, "Equipment");
    toast(S.eqSvcUpdated);
    setShowService(false);
    setSvcDate("");
    setSvcTarget("");
  };

  const openRecord = (eq: StoreItem) => {
    setRecording(eq);
    setWoForm({ tanggal: todayISO(), teknisi: "", catatan: "", hours: String(eq.lastHours ?? 0), next: typeof eq.nextService === "string" && eq.nextService !== "-" ? eq.nextService : "" });
  };

  const saveRecord = async () => {
    if (!recording) return;
    if (!woForm.tanggal || !woForm.teknisi.trim() || !woForm.hours) { toast(S.eqRecordReq, "info"); return; }
    const hours = Number(woForm.hours);
    if (!Number.isFinite(hours) || hours < 0) { toast(S.eqHoursInvalid, "info"); return; }
    await update("equipment", recording.id, {
      lastHours: hours,
      nextService: woForm.next || recording.nextService,
      status: recording.status === "Maintenance" ? "Tersedia" : recording.status,
    });
    log("mencatat servis", `${recording.name} · ${fmtTanggal(woForm.tanggal)}${woForm.catatan.trim() ? ` · ${woForm.catatan.trim()}` : ""}`, "Equipment");
    toast(S.eqSvcRecorded.replace("{a}", recording.name));
    setRecording(null);
  };

  const startMaintenance = async () => {
    if (!maintaining) return;
    if (!maintNote.trim() || !maintEta) { toast(S.eqMaintReq, "info"); return; }
    await update("equipment", maintaining.id, { status: "Maintenance", maintenanceNote: maintNote.trim(), maintenanceEta: maintEta });
    log("memasukkan maintenance", `${maintaining.name} · selesai ${fmtTanggal(maintEta)}`, "Equipment");
    toast(S.eqEnterMaint.replace("{a}", maintaining.name));
    setMaintaining(null);
    setMaintNote("");
    setMaintEta("");
  };

  const endMaintenance = async (eq: StoreItem) => {
    await update("equipment", eq.id, { status: "Tersedia", maintenanceNote: "", maintenanceEta: "" });
    log("menyelesaikan maintenance", eq.name, "Equipment");
    toast(S.eqBackAvail.replace("{a}", eq.name));
  };

  const clashOf = (equip: string, date: string, a: number, b: number): StoreItem[] =>
    bookings.filter((o) => {
      if (!sameName(o.equip, equip) || o.date !== date || o.status === "Selesai") return false;
      const r = bookingRange(o);
      return r ? rangesOverlap(a, b, r.mulai, r.selesai) : false;
    });

  const persistBooking = async (priority: string) => {
    const { equip, proyek, date, mulai, selesai } = bookForm;
    const eq = equipment.find((e) => sameName(e.name, equip));
    if (!eq) { setBookError(S.eqNotFound); return; }
    const created = await add("bookings", { equip, proyek, jam: `${mulai}-${selesai}`, mulai, selesai, status: "Terjadwal", date, priority, branch: String((data.projects ?? []).find((p) => String(p.id) === String(proyek))?.branch ?? (branch !== "SEMUA" ? branch : "")) },
      { action: "membooking equipment", target: `${equip} · ${priority}`, module: "Equipment" });
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
    const eq = equipment.find((e) => sameName(e.name, equip));
    if (!eq) { setBookError(S.eqNotFound); return; }
    if (eq.status === "Maintenance") {
      const msg = S.eqRejectMaint.replace("{a}", equip);
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    if (isMeasuring(eq) && isCalExpired(eq.id, calibrations, today)) {
      const msg = S.eqRejectCal.replace("{a}", equip);
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
      const msg = S.eqRejectClash.replace("{a}", equip).replace("{b}", fmtTanggal(date));
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    try {
      await persistBooking(priority);
    } catch {
      toast(S.eqBookFail.replace("{a}", equip), "info");
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
    log("menggusur booking", `${bookForm.equip} · ${fmtTanggal(bookForm.date)} menggusur ${names}`, "Equipment");
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
    if (!finishing) return;
    const hours = Number(finishHours);
    if (!Number.isFinite(hours) || hours <= 0) { toast(S.eqHoursPositive, "info"); return; }
    const downtime = Math.max(0, Number(finishDowntime) || 0);
    const fuelLiters = Math.max(0, Number(finishFuel) || 0);
    if (!Number.isFinite(fuelLiters) || fuelLiters < 0) { toast(S.eqFuelNonNeg, "info"); return; }
    const eq = equipment.find((e) => e.name === finishing.equip);
    const rate = Number(eq?.rate || 0);
    await update("bookings", finishing.id, { status: "Selesai", hours, downtime, fuelLiters, cost: hours * rate });
    if (eq) {
      const stillActive = bookings.some((o) => o.id !== finishing.id && sameName(o.equip, eq.name) && o.status !== "Selesai");
      await update("equipment", eq.id, {
        lastHours: Number(eq.lastHours || 0) + hours,
        status: stillActive ? eq.status : "Tersedia",
      });
    }
    log("menyelesaikan booking", `${finishing.equip} · ${fmtTanggal(String(finishing.date))} · ${hours} jam · downtime ${downtime} jam`, "Equipment");
    toast(S.eqBookingDone.replace("{a}", finishing.id));
    setFinishing(null);
    setFinishHours("");
    setFinishDowntime("0");
    setFinishFuel("0");
  };

  const saveCalibration = async () => {
    if (!calForm.equipmentId || !calForm.item.trim() || !calForm.due) { toast(S.eqCalReq, "info"); return; }
    if (calForm.due < today) { toast(S.eqCalPast, "info"); return; }
    const dupe = calibrations.some((c) => c.equipmentId === calForm.equipmentId && String(c.item).toLowerCase() === calForm.item.trim().toLowerCase() && c.status !== "Selesai");
    if (dupe) { toast(S.eqCalDupe, "info"); return; }
    const eq = equipment.find((e) => e.id === calForm.equipmentId);
    const created = await add("calibrations", {
      equipmentId: calForm.equipmentId, item: calForm.item.trim(), due: calForm.due, status: "Terjadwal", cert: "",
    }, { action: "menjadwalkan kalibrasi", target: `${eq?.name ?? calForm.equipmentId} · ${fmtTanggal(calForm.due)}`, module: "Equipment" });
    toast(S.eqCalScheduled.replace("{a}", created.id));
    setShowCal(false);
    setCalForm({ equipmentId: "", item: "", due: "" });
  };

  const confirmCalFinish = async () => {
    if (!finishingCal) return;
    if (!calCert.trim()) { toast(S.eqCertReq, "info"); return; }
    await update("calibrations", finishingCal.id, { status: "Selesai", cert: calCert.trim() });
    log("menyelesaikan kalibrasi", `${finishingCal.id} · sertifikat ${calCert.trim()}`, "Equipment");
    toast(S.eqCalDone.replace("{a}", finishingCal.id));
    setFinishingCal(null);
    setCalCert("");
  };

  const exportCost = () => {
    void exportExcel(
      [["Proyek", "Jam Pakai", "Downtime (jam)", "Biaya (Rp)"],
        ...costRows.map(([proj, v]) => [proj, v.hours, v.downtime, v.cost])],
      `Biaya-Equipment-${today}`,
      "Biaya",
    );
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
    );
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
                          {["Semua", "Pengangkat", "Pengelasan", "Tenaga", "Transportasi", "Pengecatan", "Lainnya"].map((c) => <option key={c} value={c}>{c === "Semua" ? S.eqAllCat : c}</option>)}
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
                    <tr key={e.id} id={notifRowId(String(e.id))} className={flash.flashId === String(e.id) ? "notif-hl notif-flash hover:bg-surface" : "notif-hl hover:bg-surface"}>
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
                          <ProgressBar value={e.util} className="w-20" tone={e.util > 75 ? "amber" : "navy"} />
                          <span className="text-xs font-medium">{e.util}%</span>
                        </div>
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
                        <p className="truncate font-medium text-navy-900" title={b.equip}>{b.equip}</p>
                        <p className="text-xs text-steel-500">{b.proyek} · {b.jam} · {fmtTanggal(String(b.date))} · {b.priority ?? "Normal"}</p>
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
                          <p className="truncate font-medium text-navy-900" title={`${b.equip} · ${b.proyek}`}>{b.equip} · {b.proyek}</p>
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
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowService(true)}><Wrench className="h-3.5 w-3.5" /> {S.eqSchedSvc}</button>
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
                            : <span className="text-steel-400">-</span>}
                        </td>
                        <td className="td"><Badge tone={e.status === "Maintenance" ? "amber" : "green"}>{e.status === "Maintenance" ? S.eqInService : S.eqScheduled}</Badge></td>
                        <td className="td">
                          <button className="btn-secondary text-xs" onClick={() => openRecord(e)}>{S.eqLogSvc}</button>
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
                              {expired && <Badge tone="red">{S.eqExpired}</Badge>}
                            </div>
                          </td>
                          <td className="td">
                            {c.status !== "Selesai" && (
                              <button className="btn-secondary text-xs" onClick={() => { setFinishingCal(c); setCalCert(""); }}>{S.finishBtn}</button>
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
                          <td className="td font-mono font-medium text-navy-900">{proj}</td>
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
                        <p className="font-medium text-navy-900">{b.equip} <span className="font-mono text-xs text-steel-500">· {b.id}</span></p>
                        <p className="text-xs text-steel-500">{b.proyek} · {fmtTanggal(String(b.date))} · {b.hours ?? 0} jam · downtime {b.downtime ?? 0} jam · BBM {fmtJumlah(Number(b.fuelLiters || 0))} L</p>
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
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-navy-900">{S.eqOeeTitle} <span className="text-xs font-normal text-steel-500">{S.eqOeeHint.replace("{a}", String(TARGET_HOURS))}</span></h3>
                  <Badge tone="navy">{S.eqAvgOee.replace("{a}", avgOee !== null ? `${Math.round(avgOee * 100)}%` : "-")}</Badge>
                </div>
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
                          <span className="font-semibold text-navy-900">{Math.round(v.oee * 100)}%</span>
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
                  <p className="mt-2 text-center text-xs text-steel-500">{S.eqOverallUtilCap}</p>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title={S.eqHoursPerMonth} subtitle={S.eqHoursPerMonthSub} />
                  <div className="h-52 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equipmentHours} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                        <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2e9ad4" stopOpacity={0.35} /><stop offset="95%" stopColor="#2e9ad4" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}rb`} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `${fmtJumlah(Number(v))} jam`} />} />
                        <Area type="monotone" dataKey="jam" stroke="#2e9ad4" strokeWidth={2.5} fill="url(#eqGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {equipment.slice(0, 6).map((e) => (
                  <div key={e.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-steel-600">{e.name}</span>
                      <span className="font-semibold text-navy-900">{e.util}%</span>
                    </div>
                    <ProgressBar value={e.util} tone={e.util > 75 ? "red" : e.util > 60 ? "amber" : "green"} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-steel-400">{S.eqForecastNote}</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal tambah */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={S.eqAdd}
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveAdd}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.eqNameField}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={S.eqNamePh} /></Field>
            <Field label={S.eqCodeField}><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={S.eqCodePh} /></Field>
            <Field label={S.thCategory}>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["Pengangkat", "Pengelasan", "Tenaga", "Transportasi", "Pengecatan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
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
        footer={<><button className="btn-secondary" onClick={() => setShowService(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveService}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.thEquipment}>
            <select className="input" value={svcTarget} onChange={(e) => setSvcTarget(e.target.value)}>
              <option value="">{S.eqChoose}</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </Field>
          <Field label={S.eqSvcDateField}><input type="date" className="input" value={svcDate} onChange={(e) => setSvcDate(e.target.value)} /></Field>
        </div>
      </Modal>

      <Modal open={recording !== null} onClose={() => setRecording(null)} title={S.eqRecordTitle.replace("{a}", recording?.name ?? "")} subtitle={S.eqRecordSub}
        footer={<><button className="btn-secondary" onClick={() => setRecording(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveRecord}>{S.eqSaveSvc}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.eqSvcDateField}><input type="date" className="input" value={woForm.tanggal} onChange={(e) => setWoForm({ ...woForm, tanggal: e.target.value })} /></Field>
            <Field label={S.eqTechField}><input className="input" value={woForm.teknisi} onChange={(e) => setWoForm({ ...woForm, teknisi: e.target.value })} placeholder={S.eqTechPh} /></Field>
            <Field label={S.eqHourMeter}><NumInput min={0} className="input" value={woForm.hours} onChange={(e) => setWoForm({ ...woForm, hours: e.target.value })} /></Field>
            <Field label={S.eqNextSvc}><input type="date" className="input" value={woForm.next} onChange={(e) => setWoForm({ ...woForm, next: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.eqWorkNote}><input className="input" value={woForm.catatan} onChange={(e) => setWoForm({ ...woForm, catatan: e.target.value })} placeholder={S.eqWorkNotePh} /></Field>
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
        footer={<><button className="btn-secondary" onClick={() => { setShowBook(false); setBookError(null); }}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveBooking}>{S.eqSaveBooking}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thEquipment}>
              <select className="input" value={bookForm.equip} onChange={(e) => setBookForm({ ...bookForm, equip: e.target.value })}>
                <option value="">{S.eqChoose}</option>
                {equipment.filter((e) => e.status !== "Maintenance").map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </Field>
            <Field label={S.thProject}>
              <select className="input" value={bookForm.proyek} onChange={(e) => setBookForm({ ...bookForm, proyek: e.target.value })}>
                <option value="">{S.eqChoose}</option>
                {data.projects.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.dateLabel}><input type="date" className="input" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} /></Field>
            <Field label={S.eqStartField}><input type="time" className="input" value={bookForm.mulai} onChange={(e) => setBookForm({ ...bookForm, mulai: e.target.value })} /></Field>
            <Field label={S.eqEndField}><input type="time" className="input" value={bookForm.selesai} onChange={(e) => setBookForm({ ...bookForm, selesai: e.target.value })} /></Field>
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

      {/* Modal selesaikan booking */}
      <Modal open={finishing !== null} onClose={() => setFinishing(null)} title={S.eqFinishBookTitle.replace("{a}", finishing?.equip ?? "")} subtitle={finishing ? `${finishing.proyek} · ${finishing.jam} · ${fmtTanggal(String(finishing.date))}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setFinishing(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={confirmFinish}>{S.finishBtn}</button></>}>
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
        <Field label={S.eqCertNoField} hint={S.eqCertNoHint}>
          <input className="input font-mono" value={calCert} onChange={(e) => setCalCert(e.target.value)} placeholder={S.eqCertNoPh} />
        </Field>
      </Modal>
    </div>
  );
}

function minutesToStr(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
