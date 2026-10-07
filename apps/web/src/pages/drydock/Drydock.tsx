import { useEffect, useMemo, useState } from "react";
import { ID_MON as MONTH_ID } from "../../utils/monthAxis";
import { Plus, Ship, CalendarRange, AlertTriangle, GripVertical, Trash2, Wrench, User, Eye, ArrowLeftRight } from "lucide-react";
import { Card, CardHeader, PageHeader, SearchBox, Badge, KpiCard, ProgressBar, Modal, Field, FormGrid, ConfirmModal, StatusBadge, toast, SortTh, toggleSort, sortRows, usePager,
  NumInput, FlowStrip,
  RowAction, rowMatches,
  EntityPicker,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { AsyncButton } from "../../components/ui";
import { employeeOptions, isKnownEmployee } from "../../utils/employeeOptions";
import { useStore } from "../../data/store";
import type { StoreItem, CollectionKey } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { dockUtilTrend, slotTrend } from "../../data";
import { fmtJumlah, fmtRupiah, fmtTanggal, fmtRentang, todayISO } from "../../utils/format";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import { getSetting } from "../../utils/settings";
import { sameName } from "../../utils/names";
import { sbDsNumber, maxSeq } from "../../utils/sb";
import { AlertBannerView, flashPick, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import FacilityMap, { facilityRowsFor } from "../../components/FacilityMap";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { rowHighlightClass } from "../../components/rowHighlight";
import { exportExcel } from "../../utils/export";
import { findUsages } from "../../utils/usages";
import { n_dry } from "../../i18n/n_dry";
import { useT } from "../../i18n/LanguageContext";

const DAYS = 90;
const FREE_WINDOW = 7;
const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const SLOT_COLORS = ["bg-ocean-500", "bg-navy-700", "bg-amber-500", "bg-teal-500", "bg-violet-500", "bg-steel-400"];

/* Warna bar gantt HARUS inline style: class dari data (s.color) tidak
   di-generate Tailwind (build hanya scan source) sehingga background hilang. */
const SLOT_HEX: Record<string, string> = {
  "bg-ocean-500": "#2e9ad4",
  "bg-navy-700": "#12598f",
  "bg-amber-500": "#f59e0b",
  "bg-teal-500": "#0d9488",
  "bg-violet-500": "#8b5cf6",
  "bg-steel-400": "#8aa2b6",
};
const PRIORITIES = ["Normal", "Tinggi", "Kritis"];
const STATUS_FILTERS = ["Semua", "Terjadwal", "Berjalan", "Selesai", "Maintenance"];
const UNDOCK_ITEMS = ["Lambung bersih", "Katup laut tertutup", "Anoda terpasang", "Propeller terpasang", "Sea trial siap"];
const MONTH_NAMES = MONTH_ID;

function dayToISO(day: number): string {
  const d = new Date();
  d.setDate(d.getDate() + day);
  return d.toISOString().slice(0, 10);
}

/** ISO tanggal → indeks hari relatif hari ini (0 = hari ini). */
function isoToDay(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 86400000);
}

function dockLengthM(capacity: unknown): number | null {
  const m = /(\d+(?:\.\d+)?)\s*m/i.exec(String(capacity ?? ""));
  return m ? Number(m[1]) : null;
}

function vesselLoa(vesselName: string, vessels: StoreItem[]): number | null {
  const v = vessels.find((x) => x.name === vesselName);
  const loa = Number(v?.loa);
  return v && Number.isFinite(loa) ? loa : null;
}

function coveredDays(dockId: string, slots: StoreItem[]): number {
  const covered = new Set<number>();
  for (const s of slots) {
    if (s.dockId !== dockId) continue;
    const from = Number(s.from);
    const to = Number(s.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    for (let d = Math.max(0, from); d < Math.min(DAYS, to); d++) covered.add(d);
  }
  return covered.size;
}

function slotStatus(s: StoreItem, projects: StoreItem[]): string {
  if (s.project === "MAINT") return "Maintenance";
  if (s.undockDone === true) return "Selesai";
  const proj = projects.find((p) => p.id === s.project);
  if (proj?.status === "Selesai" || Number(s.to) <= 0) return "Selesai";
  if (Number(s.from) <= 0) return "Berjalan";
  return "Terjadwal";
}

function slotDays(s: StoreItem): number {
  return Math.max(0, Number(s.to || 0) - Number(s.from || 0));
}

function slotCost(s: StoreItem): number {
  return slotDays(s) * Math.max(0, Number(s.ratePerDay || 0));
}

function undockList(s: StoreItem): boolean[] {
  const raw = Array.isArray(s.undock) ? s.undock as unknown[] : [];
  return UNDOCK_ITEMS.map((_, i) => raw[i] === true);
}

/* Batch koleksi modul Drydock untuk useModuleSync (pengganti resync penuh). */
const DRY_COLS: CollectionKey[] = ["activities", "dockSlots", "drydocks", "invoices", "ncr", "projects", "vessels"];

export default function Drydock() {
  const { data, add, update, remove, log } = useStore();
  const picOptions = useMemo(() => employeeOptions(data.employees), [data.employees]);
  const { locale } = useT();
  const S = n_dry[locale];
  const modAlert = useModuleAlert("drydock");
  const flash = useNotifFlash();
  const deepParams = useDeepLinkParams();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(DRY_COLS);
  const drydocks = data.drydocks;
  const dockSlots = data.dockSlots;
  const projectOptions = data.projects;
  const [selected, setSelected] = useState<string | null>(null);

  const [showBook, setShowBook] = useState(false);
  /* T6-DD4: booking pakai tanggal kalender; from/to tetap indeks hari untuk
     gantt/overlap. fromIso/toIso adalah sumber input user. */
  const [bookForm, setBookForm] = useState({ dockId: "DD-1", project: "", from: "1", to: "30", fromIso: dayToISO(1), toIso: dayToISO(30), priority: "Normal", ratePerDay: "0", dsRef: "", vessel2: "", startDate: "", area: "" });
  const [bookError, setBookError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StoreItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<StoreItem | null>(null);
  const [moveForm, setMoveForm] = useState({ dockId: "DD-1", from: "", to: "", area: "" });
  const [moveError, setMoveError] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Semua");
  const [areaFilter, setAreaFilter] = useState("Semua");
  const [slotQ, setSlotQ] = useState("");
  const [posFilter, setPosFilter] = useState("Semua");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [picModal, setPicModal] = useState<StoreItem | null>(null);
  const [picDraft, setPicDraft] = useState("");
  const [areaModal, setAreaModal] = useState<StoreItem | null>(null);
  const [areaDraft, setAreaDraft] = useState("");
  const [slotAreaDraft, setSlotAreaDraft] = useState("");
  const [showMaint, setShowMaint] = useState(false);
  /* T6-DD5: maintenance pakai tanggal kalender; alasan di bawah tanggal. */
  const [maintForm, setMaintForm] = useState({ dockId: "DD-1", from: "1", to: "7", fromIso: dayToISO(1), toIso: dayToISO(7), reason: "" });

  /* No. DS SB max+1: scan dsRef DS-type saja, parse leading (\d+)/. */
  const nextDsSeq = (): number =>
    maxSeq(dockSlots.map((s) => String((s as StoreItem).dsRef ?? "")), /^(\d+)\//) + 1;

  const sel = dockSlots.find((s) => s.id === selected) ?? null;
  const [utilDraft, setUtilDraft] = useState({ power: "", water: "" });
  const [bastOffer, setBastOffer] = useState<StoreItem | null>(null);

  const tarifKwh = getSetting(data, "TARIF_LISTRIK_KWH", 1500);
  const tarifAir = getSetting(data, "TARIF_AIR_M3", 15000);
  const utilCostOf = (s: StoreItem): number =>
    Math.max(0, Number(s.powerKwh || 0)) * tarifKwh + Math.max(0, Number(s.waterM3 || 0)) * tarifAir;
  const tagihanOf = (s: StoreItem): number => slotCost(s) + utilCostOf(s);

  const openSlot = (s: StoreItem) => {
    setSelected(s.id);
    setUtilDraft({ power: String(s.powerKwh ?? ""), water: String(s.waterM3 ?? "") });
    setSlotAreaDraft(String(s.area ?? ""));
  };

  /* Area efektif slot: area slot sendiri, fallback ke area fasilitasnya. */
  const dockAreaOf = (dockId: string): string =>
    String(drydocks.find((d) => d.id === dockId)?.area ?? "").trim();
  const slotAreaOf = (s: StoreItem): string =>
    String(s.area ?? "").trim() || dockAreaOf(String(s.dockId ?? ""));
  const areaOptions = [...new Set([
    ...drydocks.map((d) => String(d.area ?? "").trim()).filter(Boolean),
    ...dockSlots.map((s) => String(s.area ?? "").trim()).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b));

  /* Baris siap gambar untuk Peta Fasilitas. Dibaca dari store (bukan seed)
     supaya kapal yang baru ditambahkan atau dock yang ubah dimensi langsung
     muncul di peta tanpa perlu seed baru. */
  const facilityMapData = facilityRowsFor(
    drydocks as unknown as Record<string, unknown>[],
    dockSlots as unknown as Record<string, unknown>[],
    (data.vessels ?? []) as unknown as Record<string, unknown>[],
  );

  const saveArea = async () => {
    if (!areaModal) return;
    try {
      await update("drydocks", areaModal.id, { area: areaDraft.trim() });
      log("menetapkan area dock", `${areaModal.name} · ${areaDraft.trim() || "-"}`, "Drydock");
      toast(S.tAreaSaved.replace("{a}", areaModal.name));
      setAreaModal(null);
      setAreaDraft("");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const saveSlotArea = async () => {
    if (!sel) return;
    try {
      await update("dockSlots", sel.id, { area: slotAreaDraft.trim() });
      log("menetapkan area slot", `${sel.id} · ${slotAreaDraft.trim() || "-"}`, "Drydock");
      toast(S.tAreaSaved.replace("{a}", String(sel.id)));
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const saveUtility = async () => {
    if (!sel) return;
    /* Konsumsi AKUMULASI: input = tambahan meter, bukan timpa. Riwayat dicatat di meterLog. */
    const addPower = Number(utilDraft.power || 0);
    const addWater = Number(utilDraft.water || 0);
    if (addPower < 0 || addWater < 0 || !Number.isFinite(addPower) || !Number.isFinite(addWater)) {
      toast(S.tUtilInvalid, "info");
      return;
    }
    if (addPower === 0 && addWater === 0) {
      toast("Isi tambahan kWh/m³ dulu (konsumsi diakumulasi, bukan ditimpa)", "info");
      return;
    }
    const power = Number(sel.powerKwh || 0) + addPower;
    const water = Number(sel.waterM3 || 0) + addWater;
    try {
      await update("dockSlots", sel.id, {
        powerKwh: power,
        waterM3: water,
        meterLog: [...(Array.isArray(sel.meterLog) ? sel.meterLog : []), { date: todayISO(), power: addPower, water: addWater }],
      });
      log("mencatat konsumsi slot", `${sel.id} · +${addPower} kWh · +${addWater} m³ (total ${power} kWh · ${water} m³)`, "Drydock");
      toast(S.tUtilSaved.replace("{a}", sel.id));
      setUtilDraft({ power: "", water: "" });
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const toggleUndock = async (idx: number) => {
    if (!sel) return;
    try {
      const next = undockList(sel);
      next[idx] = !next[idx];
      await update("dockSlots", sel.id, { undock: next });
      if (next.every(Boolean) && !sel.undockDone) {
        log("menyelesaikan docking report", `${sel.id} · undocking checklist lengkap`, "Drydock");
        // Undock tutup alur: status kapal kembali seperti sebelum masuk dock.
        const prevMap = (sel.prevVesselStatus ?? {}) as Record<string, string>;
        const names = String(sel.vessel ?? "").split("+").map((x) => x.trim()).filter(Boolean);
        for (const vesselName of names) {
          const vsl = data.vessels.find((x) => sameName(x.name, vesselName));
          if (!vsl) continue;
          const backTo = prevMap[vesselName] ?? prevMap[String(vsl.name)] ?? (String(vsl.status) === "Dalam Docking" ? "Dalam Operasi" : String(vsl.status));
          await update("vessels", vsl.id, {
            status: backTo,
            // History SEMUA kapal pada slot ganda "A + B".
            history: [...(vsl.history ?? []), { date: new Date().toISOString().slice(0, 10), event: `Undocking selesai - slot ${sel.id} (${sel.dockId})`, type: "Docking" }],
          });
        }
        await update("dockSlots", sel.id, { undockDone: true });
        // Cek NCR terbuka proyek ini sebelum menutup alur.
        const openNcr = (data.ncr ?? []).filter((n) => String(n.project) === String(sel.project) && String(n.status) !== "Tertutup");
        if (openNcr.length > 0) {
          toast(`Slot ${sel.id} Selesai — perhatian: ${openNcr.length} NCR masih terbuka (${openNcr.map((n) => String(n.id)).join(", ")})`, "info");
          log("undock dengan NCR terbuka", `${sel.id} · ${openNcr.map((n) => String(n.id)).join(", ")}`, "Drydock");
        } else {
          toast(S.tUndockDone.replace("{a}", sel.id));
        }
        // Tawar BAST draft untuk slot yang baru selesai.
        setBastOffer({ ...sel, undock: next, undockDone: true });
      }
    } catch {
      toast(S.tChecklistFail.replace("{a}", sel.id), "info");
    }
  };

  const confirmBastOffer = async () => {
    if (!bastOffer) return;
    try {
      const created = await add("bast", {
        projectId: String(bastOffer.project), milestone: `Docking ${String(bastOffer.vessel)} (${String(bastOffer.id)})`,
        tanggal: todayISO(), penandatangan: "", lampiran: `Docking report slot ${String(bastOffer.id)}`,
        amount: tagihanOf(bastOffer), status: "Draft", slotId: String(bastOffer.id),
      }, { action: "menawarkan BAST undock", target: `${String(bastOffer.id)} · Docking ${String(bastOffer.vessel)}`, module: "Drydock" });
      log("membuat BAST undock", `${created.id} ← slot ${String(bastOffer.id)}`, "Drydock");
      toast(`BAST draft ${created.id} dibuat dari slot ${String(bastOffer.id)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    } finally {
      setBastOffer(null);
    }
  };

  const createInvoiceFromSlot = async (s: StoreItem) => {
    const proj = data.projects.find((p) => p.id === s.project);
    if (!proj || s.project === "MAINT") { toast("Slot maintenance / tanpa proyek tidak bisa ditagih", "info"); return; }
    const ref = `Dock ${String(s.id)}`;
    const dupe = (data.invoices ?? []).some((i) => String(i.milestoneRef ?? "") === ref || String(i.paymentTerm ?? "").startsWith(ref));
    if (dupe) { toast(`${ref} sudah pernah dibuatkan invoice - tolak tagih ganda`, "info"); return; }
    const days = slotDays(s);
    const rate = Math.max(0, Number(s.ratePerDay || 0));
    const dockAmt = days * rate;
    const kwh = Math.max(0, Number(s.powerKwh || 0));
    const m3 = Math.max(0, Number(s.waterM3 || 0));
    const total = dockAmt + kwh * tarifKwh + m3 * tarifAir;
    if (total <= 0) { toast("Tagihan nol — isi tarif/hari atau konsumsi dulu", "info"); return; }
    const due = (() => {
      const d = new Date(`${todayISO()}T00:00:00`);
      d.setDate(d.getDate() + 30);
      return d.toISOString().slice(0, 10);
    })();
    try {
      const created = await add("invoices", {
        client: proj.client, kodePembantu: proj.client, project: proj.id,
        branch: String(proj.branch ?? ""),
        amount: total, grandTotal: total, dpp: total, ppnAmt: 0, pphAmt: 0,
        jasaTotal: dockAmt, matTotal: kwh * tarifKwh + m3 * tarifAir,
        ppnRate: 0, pphRate: 0, dpApplied: 0, retentionPct: 0, retentionAmt: 0, retentionStatus: "-",
        skdt: false, due, status: "Draft", paymentTerm: `${ref} · ${String(s.vessel)}`,
        billingType: "Milestone", milestoneRef: ref, slotId: String(s.id),
        lines: [
          { desc: `Dock ${days} hari × ${fmtRupiah(rate)}`, qty: days, unit: "hari", price: rate, amount: dockAmt },
          ...(kwh > 0 ? [{ desc: `Listrik ${fmtJumlah(kwh)} kWh × ${fmtRupiah(tarifKwh)}`, qty: kwh, unit: "kWh", price: tarifKwh, amount: kwh * tarifKwh }] : []),
          ...(m3 > 0 ? [{ desc: `Air ${fmtJumlah(m3)} m³ × ${fmtRupiah(tarifAir)}`, qty: m3, unit: "m³", price: tarifAir, amount: m3 * tarifAir }] : []),
        ],
        dunning: "Belum Ditagih",
      }, { action: "membuat invoice dari slot dock", target: `${ref} · ${fmtRupiah(total)}`, module: "Drydock" });
      log("membuat invoice dock", `${created.id} ← ${ref} · ${fmtRupiah(total)}`, "Drydock");
      toast(`Invoice draft ${created.id} dibuat dari ${ref} (${fmtRupiah(total)})`);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const dockCostTotal = (dockId: string): number =>
    dockSlots.filter((s) => s.dockId === dockId).reduce((sum, s) => sum + slotCost(s), 0);

  const exportAnnualPlan = () => {
    void exportExcel(
      [["Slot", "Fasilitas", "Kapal", "Mulai", "Selesai", "Hari", "Tarif/Hari (Rp)", "Biaya Dock (Rp)", "Listrik (kWh)", "Air (m³)"],
        ...dockSlots.map((s) => [s.id, drydocks.find((d) => d.id === s.dockId)?.name ?? s.dockId, s.vessel, fmtTanggal(dayToISO(Number(s.from))), fmtTanggal(dayToISO(Number(s.to))), slotDays(s), Number(s.ratePerDay || 0), slotCost(s), Number(s.powerKwh || 0), Number(s.waterM3 || 0)])],
      "Rencana-Dock-Tahunan",
      "Dock Plan",
    ).then(() => toast(S.tAnnualExported)).catch(() => toast(S.saveFail, "info"));
  };

  const coverageByDock = drydocks.map((d) => ({
    dock: d,
    pct: Math.round((coveredDays(d.id, dockSlots) / DAYS) * 100),
  }));
  const totalCovered = drydocks.reduce((s, d) => s + coveredDays(d.id, dockSlots), 0);
  const util = drydocks.length ? Math.round((totalCovered / (drydocks.length * DAYS)) * 100) : 0;
  const busiest = coverageByDock.length ? coverageByDock.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;

  const overlap = (dockId: string, from: number, to: number, ignore?: string) =>
    dockSlots.some((o) => o.dockId === dockId && o.id !== ignore && from < o.to && o.from < to);

  const conflict = dockSlots.filter((s) => {
    const sameDock = dockSlots.filter((o) => o.dockId === s.dockId && o.id !== s.id);
    return sameDock.some((o) => s.from < o.to && o.from < s.to);
  });
  const hasConflict = conflict.length > 0;

  const overlapsKritis = (s: StoreItem): boolean => {
    if (s.priority === "Kritis") return true;
    return dockSlots.some((o) => o.id !== s.id && o.dockId === s.dockId && s.from < o.to && o.from < s.to && o.priority === "Kritis");
  };
  const criticalConflicts = conflict.filter(overlapsKritis);

  const firstFree = (dockId: string): number | null => {
    const segs = dockSlots
      .filter((s) => s.dockId === dockId)
      .map((s) => ({ from: Number(s.from), to: Number(s.to) }))
      .sort((a, b) => a.from - b.from);
    for (let s = 0; s + FREE_WINDOW <= DAYS; s++) {
      if (!segs.some((o) => s < o.to && o.from < s + FREE_WINDOW)) return s;
    }
    return null;
  };
  const nextFree = drydocks
    .map((d) => ({ dock: d, start: firstFree(d.id) }))
    .filter((x): x is { dock: StoreItem; start: number } => x.start !== null)
    .sort((a, b) => a.start - b.start)[0];

  const selDock = drydocks.find((d) => d.id === bookForm.dockId);
  const selProj = data.projects.find((p) => p.id === bookForm.project);
  const selLoa = selProj ? vesselLoa(selProj.vessel, data.vessels) : null;
  const selCap = selDock ? dockLengthM(selDock.capacity) : null;
  /* T6-DD4: daftar area dari slot/dock yang ada + input bebas via datalist. */
  const dockAreaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of dockSlots) {
      const a = String(slotAreaOf(s) ?? "").trim();
      if (a) set.add(a);
    }
    for (const d of drydocks) {
      const a = String(d.area ?? "").trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort();
  }, [dockSlots, drydocks]);
  /* T6-DD3: waiting list = proyek aktif yang belum punya slot docking. */
  const waitingList = useMemo(() => {
    const scheduled = new Set(dockSlots.map((s) => String(s.project ?? "")));
    return data.projects
      .filter((p) => p.status !== "Selesai" && p.status !== "Batal" && !scheduled.has(String(p.id)))
      .sort((a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")));
  }, [data.projects, dockSlots]);

  const isActiveSlot = (s: StoreItem): boolean => {
    const st = slotStatus(s, data.projects);
    return st === "Terjadwal" || st === "Berjalan";
  };
  const filteredSlots = dockSlots.filter((s) => {
    if (statusFilter !== "Semua" && slotStatus(s, data.projects) !== statusFilter) return false;
    /* Positioning: Masuk = Terjadwal (akan masuk dock), Keluar = Selesai (sudah
       keluar). "Berjalan" pernah hilang: FlowStrip menampilkannya sebagai
       langkah aktif tetapi tidak ada cabang yang menanganinya, jadi tidak
       ada cara memfilter docking yang sedang berjalan - dan karena
       current selalu diisi salah satu langkah, legendanya terlihat seperti
       filter yang aktif padahal posFilter masih "Semua". */
    if (posFilter === "Masuk" && slotStatus(s, data.projects) !== "Terjadwal") return false;
    if (posFilter === "Keluar" && slotStatus(s, data.projects) !== "Selesai") return false;
    if (posFilter === "Berjalan" && slotStatus(s, data.projects) !== "Berjalan") return false;
    if (showActiveOnly && !isActiveSlot(s)) return false;
    if (areaFilter !== "Semua" && slotAreaOf(s) !== areaFilter) return false;
    /* Pencarian teks (A2). Disini, bukan di masing-masing tabel, karena kedua
       tabel modul ini membaca `filteredSlots` yang sama - satu kotak pencarian
       untuk keduanya, bukan dua. */
    if (slotQ !== "" && !rowMatches(
      {
        area: String(slotAreaOf(s)), slot: String(s.slot ?? s.id ?? ""),
        status: String(slotStatus(s, data.projects)),
        project: String(data.projects.find((p) => String(p.id) === String(s.projectId ?? ""))?.vessel ?? s.projectId ?? ""),
      } as unknown as Record<string, unknown>,
      slotQ,
      ["area", "slot", "status", "project"],
    )) return false;
    return true;
  });
  const activeByArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of dockSlots) {
      if (!isActiveSlot(s)) continue;
      const key = slotAreaOf(s) || S.noArea;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockSlots, data.projects, drydocks]);
  const sortedSlots = useMemo(() => sortRows(filteredSlots, sort, (s: StoreItem, k) => {
    if (k === "createdAt") return createdAtOf(s) ?? "";
    if (k === "updatedAt") return lastTouchedAt(s) ?? "";
    return k === "days" ? Number(slotDays(s)) : k === "status" ? String(slotStatus(s, data.projects)) : k === "area" ? String(s.area ?? "") : k === "facility" ? String(drydocks.find((d) => d.id === s.dockId)?.name ?? s.dockId) : String((s as unknown as Record<string, unknown>)[k] ?? "");
  }), [filteredSlots, sort, data.projects, drydocks]);
  const pager = usePager(filteredSlots.length);
  /* Terjemahkan id deep-link menjadi sorotan baris. Satu id (banner modul)
     dan daftar id (kartu Dashboard yang menghitung kelompok) memakai jalur
     sama; hanya pemanggilan flash.pick vs pickMany yang berbeda. */
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const idx = sortedSlots.findIndex((s) => ids.includes(String(s.id)));
    if (idx >= 0) { flashPick(flash, ids, idx, pager.go, pager.size); return; }
    const found = dockSlots.find((s) => ids.includes(String(s.id)));
    if (!found || statusFilter === "Semua") { flashPick(flash, ids, -1, () => {}, 100); return; }
    const fullSorted = sortRows(dockSlots, sort, (s: StoreItem, k) => {
      if (k === "createdAt") return createdAtOf(s) ?? "";
      if (k === "updatedAt") return lastTouchedAt(s) ?? "";
      return k === "days" ? Number(slotDays(s)) : k === "status" ? String(slotStatus(s, data.projects)) : k === "area" ? String(s.area ?? "") : k === "facility" ? String(drydocks.find((d) => d.id === s.dockId)?.name ?? s.dockId) : String((s as unknown as Record<string, unknown>)[k] ?? "");
    });
    const fullIdx = fullSorted.findIndex((s) => ids.includes(String(s.id)));
    setStatusFilter("Semua");
    setAreaFilter("Semua");
    setPosFilter("Semua");
    setShowActiveOnly(false);
    window.setTimeout(() => flashPick(flash, ids, fullIdx, pager.go, pager.size), 250);
  };
  const pickNotif = (rowId: string) => pickNotifIds([rowId]);
  /* Halaman ini tidak bertab, jadi ?tab= dari Dashboard selalu kosong dan
     setTab tidak pernah dipanggil - resolve cukup menyorot baris slot. */
  useDeepLinkTarget("", deepParams.highlight, () => {}, pickNotifIds);
  useEffect(() => {
    pager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, areaFilter, posFilter, showActiveOnly]);

  const saveBooking = async () => {
    const proj = data.projects.find((p) => p.id === bookForm.project);
    if (!proj) { setBookError(S.tPickProject); return; }
    /* T6-DD4: sumber input = tanggal kalender; indeks hari dihitung dari sana. */
    const from = isoToDay(bookForm.fromIso) ?? Number(bookForm.from);
    const to = isoToDay(bookForm.toIso) ?? Number(bookForm.to);
    /* from=0 diizinkan: slot langsung Berjalan (hari ini). */
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from < 0 || to > DAYS) { setBookError(S.rangeInvalid.replace("{n}", String(DAYS))); return; }
    if (overlap(bookForm.dockId, from, to)) {
      const msg = S.tOverlapReject.replace("{a}", String(from)).replace("{b}", String(to)).replace("{c}", selDock?.name ?? bookForm.dockId);
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    const cap = selDock ? dockLengthM(selDock.capacity) : null;
    const loa = vesselLoa(proj.vessel, data.vessels);
    if (cap !== null && loa !== null && loa > cap) {
      const msg = S.tLoaReject.replace("{a}", proj.vessel).replace("{b}", String(loa)).replace("{c}", selDock?.name ?? "").replace("{d}", String(cap));
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    const ratePerDay = Number(bookForm.ratePerDay || 0);
    if (!Number.isFinite(ratePerDay) || ratePerDay < 0) { setBookError(S.tRateInvalid); return; }
    // No. Dock Space SB: pakai input atau auto (format nnn/DS-SB/SMD/m/yyyy).
    const dsRef = bookForm.dsRef.trim() || sbDsNumber(nextDsSeq());
    const vesselFull = bookForm.vessel2.trim() ? `${proj.vessel} + ${bookForm.vessel2.trim()}` : proj.vessel;
    try {
      const created = await add("dockSlots", {
        dockId: bookForm.dockId, project: proj.id, vessel: vesselFull, from, to,
        priority: bookForm.priority, ratePerDay, dsRef,
        startDate: bookForm.startDate || undefined,
        area: bookForm.area.trim(),
        color: SLOT_COLORS[dockSlots.length % SLOT_COLORS.length],
      }, { action: "membooking slot", target: `${bookForm.dockId} · ${vesselFull} · ${bookForm.priority}`, module: "Drydock" });
      /* Sinkron status kapal: masuk dock → Dalam Docking (status sebelumnya disimpan di slot). */
      const prevMap: Record<string, string> = {};
      for (const vesselName of String(vesselFull).split("+").map((x: string) => x.trim()).filter(Boolean)) {
        const vsl = data.vessels.find((x) => sameName(x.name, vesselName));
        if (!vsl) continue;
        prevMap[vesselName] = String(vsl.status);
        if (String(vsl.status) !== "Dalam Docking") {
          await update("vessels", vsl.id, {
            status: "Dalam Docking",
            history: [...(vsl.history ?? []), { date: todayISO(), event: `Masuk docking - slot ${created.id} (${bookForm.dockId})`, type: "Docking" }],
          });
        }
      }
      await update("dockSlots", created.id, { prevVesselStatus: prevMap });
      toast(S.tBooked.replace("{a}", created.id).replace("{b}", bookForm.priority).replace("{c}", dsRef));
      setBookForm({ dockId: "DD-1", project: "", from: "1", to: "30", fromIso: dayToISO(1), toIso: dayToISO(30), priority: "Normal", ratePerDay: "0", dsRef: "", vessel2: "", startDate: "", area: "" });
      setShowBook(false);
      setBookError(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const saveMaintBlock = async () => {
    const from = isoToDay(maintForm.fromIso) ?? Number(maintForm.from);
    const to = isoToDay(maintForm.toIso) ?? Number(maintForm.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from < 0 || to > DAYS) {
      toast(S.rangeInvalid.replace("{n}", String(DAYS)), "info");
      return;
    }
    if (!maintForm.reason.trim()) { toast(S.tMaintReason, "info"); return; }
    if (overlap(maintForm.dockId, from, to)) {
      const msg = S.tOverlapReject.replace("{a}", String(from)).replace("{b}", String(to)).replace("{c}", drydocks.find((d) => d.id === maintForm.dockId)?.name ?? maintForm.dockId);
      toast(msg, "info");
      return;
    }
    const dock = drydocks.find((d) => d.id === maintForm.dockId);
    try {
      const created = await add("dockSlots", {
        dockId: maintForm.dockId, project: "MAINT", vessel: `Maintenance - ${maintForm.reason.trim()}`,
        from, to, priority: "Normal", reason: maintForm.reason.trim(), color: "bg-steel-400",
      }, { action: "memblokir maintenance", target: `${maintForm.dockId} · ${fmtRentang(dayToISO(from), dayToISO(to))}`, module: "Drydock" });
      toast(S.tMaintSaved.replace("{a}", created.id).replace("{b}", dock?.name ?? maintForm.dockId));
      setShowMaint(false);
      setMaintForm({ dockId: "DD-1", from: "1", to: "7", fromIso: dayToISO(1), toIso: dayToISO(7), reason: "" });
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const savePic = async () => {
    if (!picModal) return;
    try {
      await update("drydocks", picModal.id, { pic: picDraft.trim() || "Belum ditentukan" });
      log("menetapkan PIC dock", `${picModal.name} · ${picDraft.trim() || "Belum ditentukan"}`, "Drydock");
      toast(S.tPicSaved.replace("{a}", picModal.name));
      setPicModal(null);
      setPicDraft("");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /* Tindak lanjut slot konflik: geser tanggal / pindah fasilitas.
     Hapus diblokir bila proyek belum Selesai, jadi jalan keluarnya pindah —
     validasi sama dengan booking baru (abaikan slot sendiri). */
  const openMove = (s: StoreItem) => {
    setMoveTarget(s);
    setMoveForm({ dockId: String(s.dockId ?? "DD-1"), from: String(s.from ?? ""), to: String(s.to ?? ""), area: String(s.area ?? "") });
    setMoveError(null);
  };

  const saveMove = async () => {
    if (!moveTarget) return;
    const from = Number(moveForm.from);
    const to = Number(moveForm.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from < 0 || to > DAYS) {
      setMoveError(S.rangeInvalid.replace("{n}", String(DAYS)));
      return;
    }
    if (overlap(moveForm.dockId, from, to, String(moveTarget.id))) {
      const dock = drydocks.find((d) => d.id === moveForm.dockId);
      setMoveError(S.tMoveOverlap.replace("{a}", dock?.name ?? moveForm.dockId));
      return;
    }
    const dock = drydocks.find((d) => d.id === moveForm.dockId);
    const proj = data.projects.find((p) => p.id === moveTarget.project);
    const loa = proj ? vesselLoa(proj.vessel, data.vessels) : null;
    const cap = dock ? dockLengthM(dock.capacity) : null;
    if (cap !== null && loa !== null && loa > cap) {
      setMoveError(S.tMoveLoa.replace("{a}", String(moveTarget.vessel)).replace("{b}", String(loa)).replace("{c}", dock?.name ?? "").replace("{d}", String(cap)));
      return;
    }
    try {
      await update("dockSlots", moveTarget.id, { dockId: moveForm.dockId, from, to, area: moveForm.area.trim() });
      log("memindah slot", `${moveTarget.id} → ${moveForm.dockId} hari ${from}-${to}`, "Drydock");
      toast(S.tMoved.replace("{a}", String(moveTarget.id)).replace("{b}", String(from)).replace("{c}", String(to)));
      setMoveTarget(null);
      setMoveError(null);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : S.tMoveFail);
    }
  };

  const confirmDelete = async () => {    if (!deleting) return;
      const usedBy = findUsages(data, "dockSlots", String(deleting.id));
      if (usedBy.length > 0) {
        toast(`Hapus diblokir - ${deleting.id} dipakai di: ${usedBy.join(", ")}`, "info");
        log("gagal hapus slot docking", `${deleting.id} · masih dipakai di: ${usedBy.join(", ")}`, "Drydock");
        return;
      }
    const proj = data.projects.find((p) => p.id === deleting.project);
    if (proj && proj.status !== "Selesai") {
      toast(S.tDeleteBlocked.replace("{a}", String(deleting.id)).replace("{b}", proj.id).replace("{c}", String(proj.status)), "info");
      setDeleting(null);
      return;
    }
    try {
      await remove("dockSlots", deleting.id);
      log("menghapus slot", `${deleting.id} · ${deleting.vessel}`, "Drydock");
      toast(S.tDeleted, "info");
      setDeleting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.tDeleteFail, "info");
    }
  };

  return (
    <div>
      <PageHeader
        title={S.pageTitle}
        subtitle={S.pageSubtitle}
        icon={<Ship className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowMaint(true)}><Wrench className="h-4 w-4" /> {S.btnMaintBlock}</button>
            <button className="btn-primary-gradient" onClick={() => { setShowBook(true); setBookError(null); }}><Plus className="h-4 w-4" /> {S.btnBookSlot}</button>
          </div>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} dismiss={modAlert.dismiss} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiUtil} value={`${util}%`} delta={S.kpiUtilDelta} deltaDirection="flat" icon={<Ship className="h-5 w-5" />} chip="navy" spark={dockUtilTrend} />        <KpiCard label={S.kpiSlots} value={S.kpiSlotsVal.replace("{n}", String(dockSlots.length))} hint={S.kpiSlotsHint} icon={<CalendarRange className="h-5 w-5" />} chip="teal" spark={slotTrend} />
        <KpiCard
          label={S.kpiConflict}
          value={hasConflict ? String(conflict.length) : "0"}
          delta={hasConflict ? S.kpiConflictYes : S.kpiConflictNo}
          deltaDirection={hasConflict ? "down" : "up"}
          icon={<AlertTriangle className="h-5 w-5" />}
          chip={hasConflict ? "rose" : "teal"}
          spark={slotTrend}
        />
        <KpiCard
          label={S.kpiNext}
          value={nextFree ? fmtTanggal(dayToISO(nextFree.start)) : S.kpiFull}
          hint={nextFree ? S.kpiNextHint.replace("{a}", nextFree.dock.name) : S.kpiFullHint.replace("{n}", String(DAYS))}
          chip="amber"
          spark={dockUtilTrend}
        />
      </div>

{hasConflict && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{S.conflictTitle.replace("{n}", String(conflict.length))}</p>
            <p>{S.conflictDesc.replace("{a}", conflict.map((c) => c.vessel).join(", "))}</p>
          </div>
        </div>
      )}

      {/* Satu kotak untuk kedua tabel modul ini (Slot per Area dan Fasilitas):
          keduanya membaca `filteredSlots` yang sama, jadi dua kotak search
          akan berarti mengetik dua kali untuk hasil yang sama. */}
      <div className="mb-3 flex justify-end">
        <SearchBox value={slotQ} onChange={setSlotQ} className="w-full max-w-xs" placeholder={locale === "en" ? "Search slots, projects, status..." : "Cari slot, proyek, status..."} ariaLabel={locale === "en" ? "Search dock slots" : "Cari slot drydock"} />
      </div>

      {/* Peta fasilitas: satu skala panjang untuk semua baris, jadi drydock
          120 m terlihat benar-benar lebih panjang dari slipway 80 m. Kapal
          yang tidak muat dapat outline merah plus daftar alasannya - fasilitas
          tidak diperbesar supaya accommodate. */}
      <Card className="mb-4 p-5">
        <h3 className="mb-1 text-sm font-semibold text-navy-900">Peta Fasilitas</h3>
        <p className="mb-3 text-xs text-steel-500">
          Panjang fasilitas dan kapal digambar pada skala yang sama. Pita merah menandai kapal yang melebihi ukuran fasilitas.
        </p>
        <FacilityMap {...facilityMapData} />
      </Card>

      {criticalConflicts.length > 0 && (
        <div className="mb-4 rounded-lg border-2 border-rose-600 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-bold">{S.critTitle.replace("{n}", String(criticalConflicts.length))}</p>
          <ul className="mt-1 list-disc pl-5">
            {criticalConflicts.map((c) => (
              <li key={c.id} className="font-semibold">{c.vessel} · {c.project} · {drydocks.find((d) => d.id === c.dockId)?.name} · {fmtRentang(dayToISO(Number(c.from)), dayToISO(Number(c.to)))}</li>
            ))}
          </ul>
        </div>
      )}


        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-navy-900">{S.utilTitle}</h3>
          <div className="space-y-3">
            {coverageByDock.map(({ dock, pct }) => (
              <div key={dock.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-steel-600">{dock.name}</span>
                  <span className="font-semibold text-navy-900">{pct}%</span>
                </div>
                <ProgressBar value={pct} tone={pct > 80 ? "red" : pct > 60 ? "amber" : "green"} />
                <p className="mt-1 text-xs text-steel-500">{S.dockCost.replace("{a}", fmtRupiah(dockCostTotal(dock.id)))}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-steel-400">
            {busiest ? S.busiestNow.replace("{a}", busiest.dock.name).replace("{b}", String(busiest.pct)) : S.noUtil} {S.utilNote.replace("{n}", String(DAYS))}
          </p>
        </Card>

      <div className="mt-5 grid grid-cols-1 gap-5">
        {/* ==== PETA AREA (GRAFIK) ====
            Item 6 revisi 2 Oktober. Tabel "Slot per Area" di bawahnya
            menjawab "slot mana saja", tapi tidak menjawab pertanyaan yang
            biasa ditanya_admin drydock: area mana yang sudah penuh, berapa
            kapal yang menumpuk di sana, dan mana yang longgar. Kartu ini
            menjawabnya lewat(isian per area, bukan baris per slot). */}
        <Card>
          <CardHeader
            title={locale === "en" ? "Area capacity map" : "Peta Kapasitas Area"}
            subtitle={locale === "en"
              ? "One block per area, scaled by slot count. Fill = share of slots currently occupied."
              : "Satu blok per area, discalakan menurut jumlah slot. Isian = porsi slot yang sedang terisi."}
          />
          {(() => {
            const groups = new Map<string, StoreItem[]>();
            for (const s of filteredSlots) {
              const key = slotAreaOf(s) || S.noArea;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(s);
            }
            /* Area tanpa slot pun dihitung, kalau tidak area yang kosong lenyap
               dari peta - padahal justru itu yang perlu terlihat. */
            for (const d of drydocks) {
              const key = String(d.area ?? "").trim() || S.noArea;
              if (!groups.has(key)) groups.set(key, []);
            }
            const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
            const maxSlots = Math.max(1, ...entries.map(([, sl]) => sl.length));
            if (entries.length === 0) {
              return <p className="px-5 pb-5 text-xs text-steel-400">{S.emptySlots}</p>;
            }
            return (
              <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
                {entries.map(([area, slots]) => {
                  const vessels = Array.from(new Set(slots.map((s) => String(s.vessel ?? "-")))).filter((v) => v !== "-");
                  const occupied = slots.filter((s) => isActiveSlot(s)).length;
                  const conflicts = slots.filter((s) => conflict.some((c) => c.id === s.id)).length;
                  const fill = slots.length === 0 ? 0 : Math.round((occupied / slots.length) * 100);
                  /* Lebar blok diskalakan jumlah slot supaya area besar langsung
                     terlihat lebih besar - itu poin "grafis"nya; tabel tidak
                     pernah bisa menunjukkan itu. */
                  const scale = Math.round((slots.length / maxSlots) * 100);
                  return (
                    <div key={area} className="rounded-xl border border-steel-100 bg-surface p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-navy-900" title={area}>{area}</p>
                        <span className="shrink-0 text-xs text-steel-500">{locale === "en" ? `${slots.length} slots` : `${slots.length} slot`}</span>
                      </div>
                      <div className="mt-2 h-16 w-full overflow-hidden rounded-lg bg-steel-50 p-1" title={locale === "en" ? `Scale: ${scale}% of the largest area` : `Skala: ${scale}% dari area terbesar`}>
                        <div
                          className={`h-full rounded-md ${fill > 80 ? "bg-rose-400" : fill > 50 ? "bg-amber-400" : "bg-ocean-400"}`}
                          style={{ width: `${Math.max(8, scale)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <Badge tone={occupied > 0 ? "blue" : "gray"}>{locale === "en" ? `${occupied} occupied` : `${occupied} terisi`}</Badge>
                        <Badge tone="teal">{locale === "en" ? `${vessels.length} vessels` : `${vessels.length} kapal`}</Badge>
                        {conflicts > 0 && <Badge tone="red">{locale === "en" ? `${conflicts} conflict` : `${conflicts} bentrok`}</Badge>}
                      </div>
                      {vessels.length > 0 && (
                        <p className="mt-1 truncate text-[11px] text-steel-500" title={vessels.join(", ")}>{vessels.join(" · ")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Card>
        <Card>
          <CardHeader title="Slot per Area" subtitle="Grup Area · Slot · Status · Kapal · Masuk–Keluar (ikut filter bar di bawah)" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr><th className="th">Area</th><th className="th">Slot</th><th className="th">Status</th><th className="th">Kapal</th><th className="th">Masuk–Keluar</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {(() => {
                  const groups = new Map<string, StoreItem[]>();
                  for (const s of filteredSlots) {
                    const key = slotAreaOf(s) || S.noArea;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(s);
                  }
                  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
                  if (entries.length === 0) return <tr><td colSpan={5} className="td text-center text-steel-400">{S.emptySlots}</td></tr>;
                  return entries.flatMap(([area, slots]) =>
                    slots.map((s, i) => (
                      <tr key={s.id} className="hover:bg-surface">
                        {i === 0 ? <td className="td font-semibold text-navy-900" rowSpan={slots.length}>{area}</td> : null}
                        <td className="td font-mono text-xs text-steel-600">{String(s.id)}</td>
                        <td className="td"><StatusBadge status={slotStatus(s, data.projects)} /></td>
                        <td className="td text-steel-600">{String(s.vessel ?? "-")}</td>
                        <td className="td text-steel-600">{fmtRentang(dayToISO(Number(s.from)), dayToISO(Number(s.to)))}</td>
                      </tr>
                    ))
                  );
                })()}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title={S.cardSlots} subtitle={S.cardSlotsSub} action={
            <div className="flex flex-wrap items-center gap-1.5">
              <select className="input text-xs" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label={S.filterAreaAria}>
                <option value="Semua">{S.areaLabel}: Semua ({dockSlots.filter((s) => isActiveSlot(s)).length} aktif)</option>
                {areaOptions.map((a) => <option key={a} value={a}>{a} ({activeByArea.get(a) ?? 0} aktif)</option>)}
              </select>
              <select className="input text-xs" value={posFilter} onChange={(e) => setPosFilter(e.target.value)} aria-label={S.filterPosAria}>
                <option value="Semua">Positioning: Semua</option>
                <option value="Masuk">↓ {S.posMasuk} (Terjadwal)</option>
                <option value="Berjalan">● Berjalan (docking)</option>
                <option value="Keluar">↑ {S.posKeluar} (Selesai)</option>
              </select>
              <select className="input text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={S.filterStatusAria}>
                {STATUS_FILTERS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <label className="flex items-center gap-1 rounded-lg border border-steel-200 bg-surface px-2 py-1 text-xs text-steel-600">
                <input type="checkbox" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} />
                Aktif saja
              </label>
              {(areaFilter !== "Semua" || posFilter !== "Semua" || statusFilter !== "Semua" || showActiveOnly) && (
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setAreaFilter("Semua"); setPosFilter("Semua"); setStatusFilter("Semua"); setShowActiveOnly(false); }}>
                  Reset
                </button>
              )}
            </div>
          } />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr><SortTh label={S.colFacility} sortKey="facility" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.areaLabel} sortKey="area" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colProject} sortKey="vessel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colDuration} sortKey="days" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colPriority} sortKey="priority" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colCreated} sortKey="createdAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colUpdated} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.colAction}</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {pager.slice(sortedSlots).map((s) => {
                  const st = slotStatus(s, data.projects);
                  const isCrit = conflict.some((c) => c.id === s.id) && overlapsKritis(s);
                  return (
                    <tr key={s.id} id={notifRowId(String(s.id))} className={`${isCrit ? "bg-rose-50" : "hover:bg-surface"} ${rowHighlightClass({ id: String(s.id), flash, notified: notified.has(String(s.id)), base: isCrit ? "" : "hover:bg-surface" })}`}>
                      <td className="td text-steel-600">{drydocks.find((d) => d.id === s.dockId)?.name}</td>
                      <td className="td text-steel-600" title={slotAreaOf(s) || S.noArea}>{String(s.area ?? "").trim() || <span className="text-steel-400">—</span>}</td>
                      <td className="td">
                        <p className="font-medium text-navy-900">{s.vessel}</p>
                        <p className="text-xs font-mono text-steel-500">{s.project}</p>
                        {s.dsRef ? <p className="text-xs font-mono text-steel-400">DS {s.dsRef}</p> : null}
                        {s.startDate ? <p className="text-xs text-steel-400">{S.startedOn.replace("{a}", fmtTanggal(s.startDate))}</p> : null}
                      </td>
                      <td className="td text-steel-600">{fmtRentang(dayToISO(s.from), dayToISO(s.to))} ({S.durationDays.replace("{n}", String(s.to - s.from))})</td>
                      <td className="td">
                        {s.project === "MAINT"
                          ? <Badge tone="gray">{S.maintBadge}</Badge>
                          : <Badge tone={s.priority === "Kritis" ? "red" : s.priority === "Tinggi" ? "amber" : "gray"}>{s.priority ?? "Normal"}</Badge>}
                      </td>
                      <td className="td"><StatusBadge status={st} /></td>
                      <td className="td text-xs text-steel-600">{createdAtOf(s) !== null ? fmtTanggal(createdAtOf(s)) : <span className="text-steel-400">-</span>}</td>
                      <td className="td text-xs text-steel-600">{lastTouchedAt(s) !== null ? fmtTanggal(lastTouchedAt(s)) : <span className="text-steel-400">-</span>}</td>
                      <td className="td">
                        <div className="flex gap-1.5">
                          <RowAction icon={Eye} tone="neutral" label={S.detailBtn} ariaLabel={`${S.detailBtn} ${String(s.id)}`} onClick={() => openSlot(s)} />
                          <RowAction
                            icon={ArrowLeftRight}
                            tone="neutral"
                            label={conflict.some((c) => c.id === s.id) ? S.moveTitleConflict : S.moveTitlePlain}
                            ariaLabel={S.moveAria.replace("{a}", String(s.id))}
                            onClick={() => openMove(s)}
                          />
                          <RowAction icon={Trash2} tone="danger" label={S.delSlotTitle.replace("{a}", String(s.id))} onClick={() => setDeleting(s)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredSlots.length === 0 && <tr><td colSpan={9} className="td text-center text-steel-400">{S.emptySlots}</td></tr>}
              </tbody>
            </table>
            {pager.bar}
          </div>
        </Card>

      <Card className="mt-5">
        <CardHeader
          title={S.mappingTitle}
          subtitle={`${S.mappingSub} · Masuk (Terjadwal) → Berjalan → Keluar (Selesai)`}
          action={<Badge tone="navy">{filteredSlots.length} slot{showActiveOnly ? " aktif" : ""}</Badge>}
        />
        <div className="px-4 pb-2">
          <FlowStrip
            steps={["Masuk", "Berjalan", "Keluar"]}
            current={posFilter === "Semua" ? "" : posFilter}
            onSelect={(step) => setPosFilter((cur) => (cur === step ? "Semua" : step))}
            ariaLabel="Alur positioning docking"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-steel-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-steel-400" /> Terjadwal = ↓ Masuk</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ocean-500" /> Berjalan = docking</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Selesai = ↑ Keluar</span>
            {areaFilter !== "Semua" && <Badge tone="teal">Area: {areaFilter}</Badge>}
            {posFilter !== "Semua" && <Badge tone="navy">Positioning: {posFilter}</Badge>}
            {statusFilter !== "Semua" && <Badge tone="slate">Status: {statusFilter}</Badge>}
            {showActiveOnly && <Badge tone="blue">Slot aktif saja</Badge>}
          </div>
        </div>
        <div className="space-y-4 p-4 pt-2">
          {(() => {
            const groups = new Map<string, StoreItem[]>();
            for (const s of filteredSlots) {
              const key = slotAreaOf(s) || S.noArea;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(s);
            }
            const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            if (entries.length === 0) return (
              <div className="rounded-xl border border-dashed border-steel-300 bg-surface p-6 text-center">
                <p className="text-sm font-medium text-steel-600">{S.emptySlots}</p>
                <p className="mt-1 text-xs text-steel-400">Coba ubah filter area / positioning / nonaktifkan &quot;Aktif saja&quot;.</p>
                <button className="btn-secondary mt-2 text-xs" onClick={() => { setAreaFilter("Semua"); setPosFilter("Semua"); setStatusFilter("Semua"); setShowActiveOnly(false); }}>Tampilkan semua slot</button>
              </div>
            );
            return entries.map(([area, slots]) => {
              const nMasuk = slots.filter((s) => slotStatus(s, data.projects) === "Terjadwal").length;
              const nJalan = slots.filter((s) => slotStatus(s, data.projects) === "Berjalan").length;
              const nKeluar = slots.filter((s) => slotStatus(s, data.projects) === "Selesai").length;
              return (
              <div key={area} className="rounded-xl border border-steel-100 bg-surface p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-900">{area}</p>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone="gray">↓ {nMasuk} masuk</Badge>
                    <Badge tone="blue">● {nJalan} berjalan</Badge>
                    <Badge tone="green">↑ {nKeluar} keluar</Badge>
                    <Badge tone="navy">{slots.length} slot</Badge>
                  </span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-steel-100">
                  <div className="flex h-full">
                    <span className="bg-steel-400" style={{ width: `${slots.length ? (nMasuk / slots.length) * 100 : 0}%` }} />
                    <span className="bg-ocean-500" style={{ width: `${slots.length ? (nJalan / slots.length) * 100 : 0}%` }} />
                    <span className="bg-emerald-500" style={{ width: `${slots.length ? (nKeluar / slots.length) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {slots.map((s) => {
                    const st = slotStatus(s, data.projects);
                    return (
                    <button
                      key={s.id}
                      onClick={() => openSlot(s)}
                      className={`rounded-lg border bg-white px-3 py-2 text-left transition-colors hover:border-ocean-400 ${st === "Berjalan" ? "border-ocean-400" : "border-steel-200"}`}
                      title={`${s.vessel} · ${s.project} · ${st}`}
                    >
                      <p className="truncate text-sm font-semibold text-navy-900">{s.vessel}</p>
                      <p className="font-mono text-[11px] text-steel-500">{s.id} · {drydocks.find((d) => d.id === s.dockId)?.name ?? s.dockId}</p>
                      <p className="mt-1 text-[11px] text-steel-500">{fmtRentang(dayToISO(Number(s.from)), dayToISO(Number(s.to)))}</p>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <StatusBadge status={st} />
                        {st === "Terjadwal" && <Badge tone="gray">↓ Masuk</Badge>}
                        {st === "Berjalan" && <Badge tone="blue">● Docking</Badge>}
                        {st === "Selesai" && <Badge tone="green">↑ Keluar</Badge>}
                      </span>
                    </button>
                    );
                  })}
                </div>
              </div>
              );
            });
          })()}
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader
          title={S.ganttTitle}
          subtitle={S.ganttSub}
          action={
            <div className="flex items-center gap-2">
              <Badge tone="navy">{S.daysBadge.replace("{n}", String(DAYS))}</Badge>
              <div className="flex items-center gap-1 rounded-lg border border-steel-200 bg-surface p-0.5">
                <button
                  onClick={() => setWide(false)}
                  aria-label={S.ganttNarrowAria}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${!wide ? "bg-white text-navy-800 shadow-sm" : "text-steel-500 hover:text-navy-700"}`}
                >
                  {S.ganttNarrow}
                </button>
                <button
                  onClick={() => setWide(true)}
                  aria-label={S.ganttWideAria}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${wide ? "bg-white text-navy-800 shadow-sm" : "text-steel-500 hover:text-navy-700"}`}
                >
                  {S.ganttWide}
                </button>
              </div>
            </div>
          }
        />
        <div className="overflow-x-auto p-4">
          <div className={wide ? "min-w-[1400px]" : "min-w-[900px]"}>
            <div className="mb-2 flex items-center">
              <div className="w-52 shrink-0 pr-3" />
              <div className="flex flex-1 gap-px">
                {weeks.map((w) => (
                  <div key={w} className="flex-1 border-l border-steel-200 pl-1 text-[10px] text-steel-400">
                    <p className="font-semibold">{S.weekShort.replace("{n}", String(w))}</p>
                    <p>{fmtTanggal(dayToISO((w - 1) * 7))}</p>
                  </div>
                ))}
              </div>
            </div>

            {drydocks.map((dock) => {
              const slots = dockSlots.filter((s) => s.dockId === dock.id);
              return (
                <div key={dock.id} className="mb-5">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-navy-900">{dock.name}</p>
                      <span className="inline-flex items-center gap-1 text-xs text-steel-500"><User className="h-3 w-3" /> {S.picLabel.replace("{a}", String(dock.pic ?? S.picFallback))}</span>
                      <button className="btn-secondary text-xs" onClick={() => { setPicModal(dock); setPicDraft(String(dock.pic ?? "")); }}>{S.btnPic}</button>
                      <Badge tone="teal">{String(dock.area ?? "").trim() || S.noArea}</Badge>
                      <button className="btn-secondary text-xs" onClick={() => { setAreaModal(dock); setAreaDraft(String(dock.area ?? "")); }}>{S.areaLabel}</button>
                    </div>
                    <Badge tone={dock.status === "Terpakai" ? "blue" : "green"}>{dock.status}</Badge>
                  </div>
                  <div className="flex items-center gap-px">
                    <div className="w-52 shrink-0 pr-3">
                      <p className="truncate text-xs text-steel-500" title={String(dock.capacity)}>{dock.capacity}</p>
                    </div>
                    <div className="relative h-16 flex-1 rounded-lg bg-steel-50 border border-steel-100"
                      style={{
                        backgroundImage: "repeating-linear-gradient(to right, #e9eff4 0, #e9eff4 1px, transparent 1px, transparent calc(100%/13))",
                      }}
                    >
                      {slots.map((s) => {
                        const leftPct = (s.from / DAYS) * 100;
                        const widthPct = ((s.to - s.from) / DAYS) * 100;
                        const isSel = selected === s.id;
                        const isConf = conflict.some((c) => c.id === s.id);
                        const isCrit = isConf && overlapsKritis(s);
                        const isMaint = s.project === "MAINT";
                        const barBg = isMaint ? "#8aa2b6" : isConf ? "#f43f5e" : (SLOT_HEX[String(s.color)] ?? "#2e9ad4");
                        return (
                          <div
                            key={s.id}
                            id={notifRowId(String(s.id))}
                            onClick={() => { if (isSel) setSelected(null); else openSlot(s); }}
                            className={`absolute top-1/2 -translate-y-1/2 flex h-10 items-center justify-between rounded-md px-2 text-xs font-medium text-white shadow cursor-pointer transition ${isSel ? "ring-2 ring-navy-900" : "hover:brightness-110"} ${isCrit && !isSel ? "ring-4 ring-rose-800" : isConf && !isSel ? "ring-2 ring-rose-700" : ""} ${rowHighlightClass({ id: String(s.id), flash, notified: notified.has(String(s.id)) })}`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: barBg }}
                            title={`${s.vessel} · ${s.project} · ${fmtRentang(dayToISO(s.from), dayToISO(s.to))}${s.priority ? ` · ${s.priority}` : ""}${isCrit ? S.tipCrit : isConf ? S.tipOverlap : ""}`}
                          >
                            <span className="truncate min-w-0 flex-1 flex items-center gap-1" title={s.vessel}>
                              <GripVertical className="h-3 w-3 shrink-0 opacity-70" />
                              {s.vessel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      </div>

      {/* T6-DD3: "Rencana docking tahunan" diganti Waiting List Dock. */}
      <Card className="mt-5">
        <CardHeader
          title={locale === "en" ? "Dock Waiting List" : "Waiting List Dock"}
          subtitle={locale === "en"
            ? "Projects that still need a dock slot, then scheduled slots by month."
            : "Proyek yang masih butuh slot docking, lalu slot terjadwal per bulan."}
          action={<button className="btn-secondary text-xs" onClick={exportAnnualPlan}>{S.exportExcelBtn}</button>}
        />
        <div className="space-y-4 p-4 pt-0">
          {waitingList.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-navy-900">
                {locale === "en" ? "Waiting (no slot yet)" : "Menunggu (belum ada slot)"}
              </p>
              <div className="space-y-1.5">
                {waitingList.map((p) => (
                  <div key={String(p.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-navy-900">{String(p.id)}</p>
                      <p className="truncate text-navy-900">{String(p.vessel)}</p>
                      <p className="text-xs text-steel-500">
                        {fmtTanggal(String(p.start ?? ""))} → {fmtTanggal(String(p.end ?? ""))}
                      </p>
                    </div>
                    <button
                      className="btn-primary text-xs"
                      onClick={() => {
                        setBookForm({
                          dockId: bookForm.dockId,
                          project: String(p.id),
                          from: "1", to: "30",
                          fromIso: dayToISO(1), toIso: dayToISO(30),
                          priority: "Normal", ratePerDay: "0", dsRef: "",
                          vessel2: "", startDate: String(p.start ?? ""), area: "",
                        });
                        /* Auto-fill dari jadwal proyek. */
                        if (p.start && p.end) {
                          const d0 = isoToDay(String(p.start));
                          const d1 = isoToDay(String(p.end));
                          if (d0 !== null && d1 !== null && d1 > d0) {
                            const from = Math.max(0, Math.min(DAYS - 1, d0));
                            const to = Math.max(from + 1, Math.min(DAYS, d1));
                            setBookForm((f) => ({ ...f, from: String(from), to: String(to), fromIso: dayToISO(from), toIso: dayToISO(to) }));
                          }
                        }
                        setShowBook(true);
                      }}
                    >
                      {locale === "en" ? "Book slot" : "Booking slot"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold text-navy-900">
              {locale === "en" ? "Scheduled by month" : "Terjadwal per bulan"}
            </p>
            <div className="grid min-w-[1100px] grid-cols-12 gap-2 overflow-x-auto">
              {Array.from({ length: 12 }, (_, m) => {
                const base = new Date();
                const dt = new Date(base.getFullYear(), base.getMonth() + m, 1);
                const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
                const inMonth = dockSlots.filter((s) => dayToISO(Number(s.from)).slice(0, 7) === key || dayToISO(Number(s.to)).slice(0, 7) === key);
                return (
                  <div key={key} className="rounded-lg border border-steel-100 bg-surface p-2">
                    <p className="text-xs font-semibold text-navy-900">{MONTH_NAMES[dt.getMonth()]} {dt.getFullYear()}</p>
                    <div className="mt-1.5 space-y-1">
                      {inMonth.map((s) => (
                        <button key={s.id} className="block w-full truncate rounded bg-white px-1.5 py-1 text-left text-[11px] text-steel-600 hover:text-navy-900" title={`${s.vessel} · ${fmtRentang(dayToISO(Number(s.from)), dayToISO(Number(s.to)))}`} onClick={() => openSlot(s)}>
                          {s.vessel}
                        </button>
                      ))}
                      {inMonth.length === 0 && <p className="text-[11px] text-steel-400">{S.monthEmpty}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Modal detail slot */}
      <Modal open={sel !== null} onClose={() => setSelected(null)} title={S.slotTitle.replace("{a}", sel?.id ?? "")} subtitle={sel ? `${sel.vessel} · ${sel.project}` : ""}>
        {sel && (
          <div>
          <dl className="dl-div text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">{S.colFacility}</dt><dd className="font-medium">{drydocks.find((d) => d.id === sel.dockId)?.name}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt className="text-steel-500">{S.areaLabel}</dt><dd className="flex items-center gap-1.5">
              <input className="input w-36 py-1 text-xs" value={slotAreaDraft} onChange={(e) => setSlotAreaDraft(e.target.value)} placeholder={S.areaPh} aria-label={S.areaLabel} />
              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void saveSlotArea()}>{S.saveShort}</button>
            </dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.colDuration}</dt><dd className="font-medium">{fmtRentang(dayToISO(sel.from), dayToISO(sel.to))} ({S.durationDays.replace("{n}", String(slotDays(sel)))})</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.colPriority}</dt><dd className="font-medium">{sel.priority ?? "Normal"}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblRate}</dt><dd className="font-medium">{S.perDay.replace("{a}", fmtRupiah(Number(sel.ratePerDay || 0)))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblCost}</dt><dd className="font-semibold text-navy-900">{S.durationDays.replace("{n}", String(slotDays(sel)))} × {fmtRupiah(Number(sel.ratePerDay || 0))} = {fmtRupiah(slotCost(sel))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.colStatus}</dt><dd><StatusBadge status={slotStatus(sel, data.projects)} /></dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblConflict}</dt><dd>{conflict.some((c) => c.id === sel.id) ? <Badge tone="red">{S.conflictBadge}</Badge> : <Badge tone="green">{S.safeBadge}</Badge>}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblRecorded}</dt><dd className="font-medium">{fmtJumlah(Number(sel.powerKwh || 0))} kWh · {fmtJumlah(Number(sel.waterM3 || 0))} m³</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Tagihan konsumsi</dt><dd className="font-medium text-right">{fmtJumlah(Number(sel.powerKwh || 0))} kWh × {fmtRupiah(tarifKwh)} + {fmtJumlah(Number(sel.waterM3 || 0))} m³ × {fmtRupiah(tarifAir)} = {fmtRupiah(utilCostOf(sel))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Total tagihan slot</dt><dd className="font-semibold text-navy-900">Dock {fmtRupiah(slotCost(sel))} + konsumsi {fmtRupiah(utilCostOf(sel))} = {fmtRupiah(tagihanOf(sel))}</dd></div>
            <p className="text-right text-[11px] text-steel-400">Tarif dari Pengaturan (TARIF_LISTRIK_KWH / TARIF_AIR_M3)</p>
          </dl>
          <button className="btn-primary mt-2 w-full justify-center text-xs" onClick={() => void createInvoiceFromSlot(sel)}>Buat invoice dari slot (draft Milestone)</button>
          <div className="mt-3 border-t border-steel-100 pt-3">
            <p className="text-xs font-semibold text-steel-500">{S.utilSection} (tambah — diakumulasi)</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label={`+ ${S.lblPower}`}><NumInput min={0} className="input" value={utilDraft.power} onChange={(e) => setUtilDraft({ ...utilDraft, power: e.target.value })} placeholder={S.phPower} /></Field>
              <Field label={`+ ${S.lblWater}`}><NumInput min={0} className="input" value={utilDraft.water} onChange={(e) => setUtilDraft({ ...utilDraft, water: e.target.value })} placeholder={S.phWater} /></Field>
            </div>
            <button className="btn-secondary mt-2 text-xs" onClick={saveUtility}>{S.btnSaveUtil}</button>
            {Array.isArray(sel.meterLog) && sel.meterLog.length > 0 && (
              <div className="mt-2 rounded-lg bg-steel-50 px-3 py-2">
                <p className="text-xs font-semibold text-navy-900">Riwayat meter</p>
                {(sel.meterLog as { date: string; power: number; water: number }[]).slice(-5).reverse().map((m, i) => (
                  <p key={i} className="text-xs text-steel-600">{fmtTanggal(m.date)} · +{fmtJumlah(Number(m.power || 0))} kWh · +{fmtJumlah(Number(m.water || 0))} m³</p>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 border-t border-steel-100 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-steel-500">{S.undockSection}</p>
              {sel.undockDone
                ? <Badge tone="green">Selesai — undock tuntas</Badge>
                : <Badge tone={undockList(sel).every(Boolean) ? "green" : "amber"}>{undockList(sel).every(Boolean) ? S.undockReady : S.undockProgress.replace("{n}", String(undockList(sel).filter(Boolean).length))}</Badge>}
            </div>
            <div className="mt-2 space-y-1.5">
              {UNDOCK_ITEMS.map((item, idx) => (
                <label key={item} className="flex items-center gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm text-steel-700">
                  <input type="checkbox" checked={undockList(sel)[idx]} onChange={() => toggleUndock(idx)} />
                  {item}
                </label>
              ))}
            </div>
          </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-secondary flex-1 justify-center" onClick={() => { setSelected(null); openMove(sel); }}>{S.btnMoveSlot}</button>
              <button className="btn-danger flex-1 justify-center" onClick={() => { setDeleting(sel); setSelected(null); }}><Trash2 className="h-4 w-4" /> {S.btnDelSlot}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal geser/pindah slot (tindak lanjut konflik) */}
      <Modal open={moveTarget !== null} onClose={() => { setMoveTarget(null); setMoveError(null); }} title={S.moveSlotTitle.replace("{a}", moveTarget?.id ?? "")} subtitle={S.moveSlotSub}
        footer={<><button className="btn-secondary" onClick={() => { setMoveTarget(null); setMoveError(null); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveMove}>{S.btnSaveMove}</AsyncButton></>}>
        <div className="space-y-3">
          {moveError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{moveError}</p>}
          <Field label={S.lblTargetFacility}>
            <select className="input" value={moveForm.dockId} onChange={(e) => setMoveForm({ ...moveForm, dockId: e.target.value })}>
              {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label={S.areaLabel}>
            <input className="input" value={moveForm.area} onChange={(e) => setMoveForm({ ...moveForm, area: e.target.value })} placeholder={S.areaPh} />
          </Field>
          <FormGrid>
            <Field label={S.lblStartDay.replace("{n}", String(DAYS))}><NumInput min={0} max={DAYS} className="input" value={moveForm.from} onChange={(e) => setMoveForm({ ...moveForm, from: e.target.value })} /></Field>
            <Field label={S.lblEndDay.replace("{n}", String(DAYS))}><NumInput min={1} max={DAYS} className="input" value={moveForm.to} onChange={(e) => setMoveForm({ ...moveForm, to: e.target.value })} /></Field>
          </FormGrid>
          <p className="text-xs text-steel-500">{S.moveHint.replace("{a}", Number(moveForm.to) > Number(moveForm.from) ? S.durationDays.replace("{n}", String(Number(moveForm.to) - Number(moveForm.from))) : "-")}</p>
        </div>
      </Modal>

      {/* Modal booking */}
      <Modal open={showBook} onClose={() => { setShowBook(false); setBookError(null); }} title={S.bookTitle} subtitle={S.bookSub}
        footer={<><button className="btn-secondary" onClick={() => { setShowBook(false); setBookError(null); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveBooking}>{S.btnSaveBook}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colFacility}>
              <select className="input" value={bookForm.dockId} onChange={(e) => setBookForm({ ...bookForm, dockId: e.target.value })}>
                {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label={S.colProject}>
              <select className="input" value={bookForm.project} onChange={(e) => {
                const pid = e.target.value;
                const p = data.projects.find((x) => x.id === pid);
                /* T6-DD4: auto-fill tanggal dari jadwal proyek (start/end).
                   Bila tidak ada tanggal proyek, biarkan default hari ini+1..30. */
                if (p?.start && p?.end) {
                  const d0 = isoToDay(String(p.start));
                  const d1 = isoToDay(String(p.end));
                  if (d0 !== null && d1 !== null && d1 > d0) {
                    const from = Math.max(0, Math.min(DAYS - 1, d0));
                    const to = Math.max(from + 1, Math.min(DAYS, d1));
                    setBookForm({ ...bookForm, project: pid, from: String(from), to: String(to), fromIso: dayToISO(from), toIso: dayToISO(to), startDate: String(p.start) });
                    return;
                  }
                }
                setBookForm({ ...bookForm, project: pid });
              }}>
                <option value="">{S.optPickProject}</option>
                {projectOptions.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Start date" : "Tanggal mulai"}>
              <input type="date" className="input" value={bookForm.fromIso} onChange={(e) => {
                const iso = e.target.value;
                const d = isoToDay(iso);
                setBookForm({ ...bookForm, fromIso: iso, ...(d !== null ? { from: String(Math.max(0, Math.min(DAYS, d))) } : {}), startDate: iso });
              }} />
            </Field>
            <Field label={locale === "en" ? "End date" : "Tanggal selesai"}>
              <input type="date" className="input" value={bookForm.toIso} onChange={(e) => {
                const iso = e.target.value;
                const d = isoToDay(iso);
                setBookForm({ ...bookForm, toIso: iso, ...(d !== null ? { to: String(Math.max(1, Math.min(DAYS, d))) } : {}) });
              }} />
            </Field>
            <Field label={S.colPriority}>
              <select className="input" value={bookForm.priority} onChange={(e) => setBookForm({ ...bookForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label={S.lblRateDay} hint={S.hintRate}>
              <NumInput min={0} className="input" value={bookForm.ratePerDay} onChange={(e) => setBookForm({ ...bookForm, ratePerDay: e.target.value })} placeholder={S.phRate} />
            </Field>
            <Field label={S.lblDs} hint={S.hintDs}>
              <input className="input font-mono" value={bookForm.dsRef} onChange={(e) => setBookForm({ ...bookForm, dsRef: e.target.value })} placeholder={sbDsNumber(nextDsSeq())} />
            </Field>
            <Field label={S.lblPartner} hint={S.hintPartner}>
              <input className="input" value={bookForm.vessel2} onChange={(e) => setBookForm({ ...bookForm, vessel2: e.target.value })} placeholder={S.phPartner} />
            </Field>
            <Field label={S.areaLabel} hint={locale === "en" ? "Pick existing area or type a new one" : "Pilih area yang ada atau ketik baru"}>
              <input className="input" list="dock-area-list" value={bookForm.area} onChange={(e) => setBookForm({ ...bookForm, area: e.target.value })} placeholder={S.areaPh} />
              <datalist id="dock-area-list">
                {dockAreaOptions.map((a) => <option key={a} value={a} />)}
              </datalist>
            </Field>
          </FormGrid>
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
            {S.costEstimate.replace("{a}", String(Math.max(0, Number(bookForm.to || 0) - Number(bookForm.from || 0)))).replace("{b}", fmtRupiah(Number(bookForm.ratePerDay || 0))).replace("{c}", fmtRupiah(Math.max(0, Number(bookForm.to || 0) - Number(bookForm.from || 0)) * Math.max(0, Number(bookForm.ratePerDay || 0))))}
          </p>
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
            {S.capInfo.replace("{a}", selDock?.capacity ?? "-")}
            {selProj ? (selLoa !== null ? S.loaInfo.replace("{a}", selProj.vessel).replace("{b}", String(selLoa)) : S.loaMissing.replace("{a}", selProj.vessel)) : ""}
            {selCap !== null && selLoa !== null ? (selLoa > selCap ? S.overCap : S.fitsCap) : ""}
          </p>
          {bookError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{bookError}</p>
          )}
        </div>
      </Modal>

      {/* Modal blokir maintenance */}
      <Modal open={showMaint} onClose={() => setShowMaint(false)} title={S.maintTitle} subtitle={S.maintSub}
        footer={<><button className="btn-secondary" onClick={() => setShowMaint(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveMaintBlock}>{S.btnSaveMaint}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colFacility}>
              <select className="input" value={maintForm.dockId} onChange={(e) => setMaintForm({ ...maintForm, dockId: e.target.value })}>
                {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Start date" : "Tanggal mulai"}>
              <input type="date" className="input" value={maintForm.fromIso} onChange={(e) => {
                const iso = e.target.value;
                const d = isoToDay(iso);
                setMaintForm({ ...maintForm, fromIso: iso, ...(d !== null ? { from: String(Math.max(0, Math.min(DAYS, d))) } : {}) });
              }} />
            </Field>
            <Field label={locale === "en" ? "End date" : "Tanggal selesai"}>
              <input type="date" className="input" value={maintForm.toIso} onChange={(e) => {
                const iso = e.target.value;
                const d = isoToDay(iso);
                setMaintForm({ ...maintForm, toIso: iso, ...(d !== null ? { to: String(Math.max(1, Math.min(DAYS, d))) } : {}) });
              }} />
            </Field>
          </FormGrid>
          {/* T6-DD5: alasan maintenance di paling bawah form. */}
          <Field label={S.lblReason}><input className="input" value={maintForm.reason} onChange={(e) => setMaintForm({ ...maintForm, reason: e.target.value })} placeholder={S.phReason} /></Field>
        </div>
      </Modal>

      {/* Modal PIC dock */}
      <Modal open={picModal !== null} onClose={() => setPicModal(null)} title={S.picTitle.replace("{a}", picModal?.name ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setPicModal(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={savePic}>{S.btnSavePic}</button></>}>
        <Field label={S.lblPic} hint={S.hintPic}>
          <EntityPicker value={picDraft} onChange={setPicDraft} options={picOptions} placeholder={S.phPic} ariaLabel={S.lblPic} emptyText={locale === "en" ? "No matching employee." : "Tidak ada karyawan yang cocok."} allowCustom invalid={picDraft.trim() !== "" && !isKnownEmployee(data.employees, picDraft)} />
        </Field>
      </Modal>

      {/* Modal area dock (teks bebas) */}
      <Modal open={areaModal !== null} onClose={() => setAreaModal(null)} title={`${S.areaLabel} - ${areaModal?.name ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setAreaModal(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveArea}>{S.btnSaveArea}</button></>}>
        <Field label={S.areaLabel}>
          <input className="input" value={areaDraft} onChange={(e) => setAreaDraft(e.target.value)} placeholder={S.areaPh} />
        </Field>
      </Modal>

      <ConfirmModal open={bastOffer !== null} title={`Buat BAST draft untuk slot ${bastOffer?.id ?? ""}?`}
        desc={bastOffer ? `Undock ${String(bastOffer.vessel)} tuntas. Buat BAST draft "Docking ${String(bastOffer.vessel)} (${String(bastOffer.id)})" senilai ${fmtRupiah(tagihanOf(bastOffer))} (dock + konsumsi)?` : ""}
        confirmLabel="Buat BAST draft" onCancel={() => setBastOffer(null)}
        onConfirm={confirmBastOffer} />

      <ConfirmModal open={deleting !== null} title={S.delTitle.replace("{a}", deleting?.id ?? "")} desc={(() => {
        const base = S.delDesc.replace("{a}", String(deleting?.vessel ?? ""));
        const used = deleting ? findUsages(data, "dockSlots", String(deleting.id)) : [];
        return used.length > 0 ? `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.` : base;
      })()}
        confirmLabel={deleting && findUsages(data, "dockSlots", String(deleting.id)).length > 0 ? "Diblokir - masih dipakai" : S.confirmDelete} danger onCancel={() => setDeleting(null)}
        confirmDisabled={deleting ? findUsages(data, "dockSlots", String(deleting.id)).length > 0 : false}
        onConfirm={confirmDelete} />
    </div>
  );
}

