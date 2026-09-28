import { useEffect, useMemo, useState } from "react";
import { Plus, Ship, CalendarRange, AlertTriangle, GripVertical, Trash2, Wrench, User } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, ProgressBar, Modal, Field, FormGrid, ConfirmModal, StatusBadge, toast, SortTh, toggleSort, sortRows, usePager,
  NumInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { dockUtilTrend, slotTrend } from "../../data";
import { fmtJumlah, fmtRupiah, fmtTanggal, fmtRentang } from "../../utils/format";
import { sbDsNumber, maxSeq } from "../../utils/sb";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { exportExcel } from "../../utils/export";
import { n_dry } from "../../i18n/n_dry";
import { useT } from "../../i18n/LanguageContext";

const DAYS = 90;
const FREE_WINDOW = 7;
const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const SLOT_COLORS = ["bg-ocean-500", "bg-navy-700", "bg-amber-500", "bg-teal-500", "bg-violet-500", "bg-steel-400"];
const PRIORITIES = ["Normal", "Tinggi", "Kritis"];
const STATUS_FILTERS = ["Semua", "Terjadwal", "Berjalan", "Selesai", "Maintenance"];
const UNDOCK_ITEMS = ["Lambung bersih", "Katup laut tertutup", "Anoda terpasang", "Propeller terpasang", "Sea trial siap"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function dayToISO(day: number): string {
  const d = new Date();
  d.setDate(d.getDate() + day);
  return d.toISOString().slice(0, 10);
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

export default function Drydock() {
  const { data, add, update, remove, log } = useStore();
  const { locale } = useT();
  const S = n_dry[locale];
  const modAlert = useModuleAlert("drydock");
  const flash = useNotifFlash();
  const drydocks = data.drydocks;
  const dockSlots = data.dockSlots;
  const projectOptions = data.projects;
  const [selected, setSelected] = useState<string | null>(null);

  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ dockId: "DD-1", project: "", from: "1", to: "30", priority: "Normal", ratePerDay: "0", dsRef: "", vessel2: "", startDate: "" });
  const [bookError, setBookError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StoreItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<StoreItem | null>(null);
  const [moveForm, setMoveForm] = useState({ dockId: "DD-1", from: "", to: "" });
  const [moveError, setMoveError] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [picModal, setPicModal] = useState<StoreItem | null>(null);
  const [picDraft, setPicDraft] = useState("");
  const [showMaint, setShowMaint] = useState(false);
  const [maintForm, setMaintForm] = useState({ dockId: "DD-1", from: "1", to: "7", reason: "" });

  /* No. DS SB max+1: scan dsRef DS-type saja, parse leading (\d+)/. */
  const nextDsSeq = (): number =>
    maxSeq(dockSlots.map((s) => String((s as StoreItem).dsRef ?? "")), /^(\d+)\//) + 1;

  const sel = dockSlots.find((s) => s.id === selected) ?? null;
  const [utilDraft, setUtilDraft] = useState({ power: "", water: "" });

  const openSlot = (s: StoreItem) => {
    setSelected(s.id);
    setUtilDraft({ power: String(s.powerKwh ?? ""), water: String(s.waterM3 ?? "") });
  };

  const saveUtility = async () => {
    if (!sel) return;
    const power = Number(utilDraft.power || 0);
    const water = Number(utilDraft.water || 0);
    if (power < 0 || water < 0 || !Number.isFinite(power) || !Number.isFinite(water)) {
      toast(S.tUtilInvalid, "info");
      return;
    }
    await update("dockSlots", sel.id, { powerKwh: power, waterM3: water });
    log("mencatat konsumsi slot", `${sel.id} · ${power} kWh · ${water} m³`, "Drydock");
    toast(S.tUtilSaved.replace("{a}", sel.id));
  };

  const toggleUndock = async (idx: number) => {
    if (!sel) return;
    try {
      const next = undockList(sel);
      next[idx] = !next[idx];
      await update("dockSlots", sel.id, { undock: next });
      if (next.every(Boolean)) {
        log("menyelesaikan docking report", `${sel.id} · undocking checklist lengkap`, "Drydock");
        // E7: undock lengkap → append vessel history.
        const proj = data.projects.find((p) => p.id === sel.project);
        const vesselName = proj?.vessel ?? String(sel.vessel ?? "").split(" + ")[0];
        const vsl = data.vessels.find((x) => x.name === vesselName);
        if (vsl) {
          await update("vessels", vsl.id, {
            history: [...(vsl.history ?? []), { date: new Date().toISOString().slice(0, 10), event: `Undocking selesai - slot ${sel.id} (${sel.dockId})`, type: "Docking" }],
          });
        }
        toast(S.tUndockDone.replace("{a}", sel.id));
      }
    } catch {
      toast(S.tChecklistFail.replace("{a}", sel.id), "info");
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
    );
    toast(S.tAnnualExported);
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

  const filteredSlots = statusFilter === "Semua"
    ? dockSlots
    : dockSlots.filter((s) => slotStatus(s, data.projects) === statusFilter);
  const sortedSlots = useMemo(() => sortRows(filteredSlots, sort, (s: StoreItem, k) => k === "days" ? Number(slotDays(s)) : k === "status" ? String(slotStatus(s, data.projects)) : k === "facility" ? String(drydocks.find((d) => d.id === s.dockId)?.name ?? s.dockId) : String((s as unknown as Record<string, unknown>)[k] ?? "")), [filteredSlots, sort, data.projects, drydocks]);
  const pager = usePager(filteredSlots.length);
  const pickNotif = (rowId: string) => {
    const key = String(rowId);
    const idx = sortedSlots.findIndex((s) => String(s.id) === key);
    if (idx >= 0) { flash.pick(key, idx, pager.go, pager.size); return; }
    const found = dockSlots.find((s) => String(s.id) === key);
    if (!found || statusFilter === "Semua") { flash.pick(key, -1, () => {}, 100); return; }
    const fullSorted = sortRows(dockSlots, sort, (s: StoreItem, k) => k === "days" ? Number(slotDays(s)) : k === "status" ? String(slotStatus(s, data.projects)) : k === "facility" ? String(drydocks.find((d) => d.id === s.dockId)?.name ?? s.dockId) : String((s as unknown as Record<string, unknown>)[k] ?? ""));
    const fullIdx = fullSorted.findIndex((s) => String(s.id) === key);
    setStatusFilter("Semua");
    window.setTimeout(() => {
      if (fullIdx >= 0) flash.pick(key, fullIdx, pager.go, pager.size);
      else flash.pick(key, -1, () => {}, 100);
    }, 250);
  };
  useEffect(() => {
    pager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const saveBooking = async () => {
    const proj = data.projects.find((p) => p.id === bookForm.project);
    if (!proj) { setBookError(S.tPickProject); return; }
    const from = Number(bookForm.from);
    const to = Number(bookForm.to);
    if (!from || !to || to <= from || from < 0 || to > DAYS) { setBookError(S.rangeInvalid.replace("{n}", String(DAYS))); return; }
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
    const created = await add("dockSlots", {
      dockId: bookForm.dockId, project: proj.id, vessel: vesselFull, from, to,
      priority: bookForm.priority, ratePerDay, dsRef,
      startDate: bookForm.startDate || undefined,
      color: SLOT_COLORS[dockSlots.length % SLOT_COLORS.length],
    }, { action: "membooking slot", target: `${bookForm.dockId} · ${vesselFull} · ${bookForm.priority}`, module: "Drydock" });
    toast(S.tBooked.replace("{a}", created.id).replace("{b}", bookForm.priority).replace("{c}", dsRef));
    setBookForm({ dockId: "DD-1", project: "", from: "1", to: "30", priority: "Normal", ratePerDay: "0", dsRef: "", vessel2: "", startDate: "" });
    setShowBook(false);
    setBookError(null);
  };

  const saveMaintBlock = async () => {
    const from = Number(maintForm.from);
    const to = Number(maintForm.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from < 0 || to > DAYS) {
      toast(S.rangeInvalid.replace("{n}", String(DAYS)), "info");
      return;
    }
    if (!maintForm.reason.trim()) { toast(S.tMaintReason, "info"); return; }
    const dock = drydocks.find((d) => d.id === maintForm.dockId);
    const created = await add("dockSlots", {
      dockId: maintForm.dockId, project: "MAINT", vessel: `Maintenance - ${maintForm.reason.trim()}`,
      from, to, priority: "Normal", reason: maintForm.reason.trim(), color: "bg-steel-400",
    }, { action: "memblokir maintenance", target: `${maintForm.dockId} · ${fmtRentang(dayToISO(from), dayToISO(to))}`, module: "Drydock" });
    toast(S.tMaintSaved.replace("{a}", created.id).replace("{b}", dock?.name ?? maintForm.dockId));
    setShowMaint(false);
    setMaintForm({ dockId: "DD-1", from: "1", to: "7", reason: "" });
  };

  const savePic = async () => {
    if (!picModal) return;
    await update("drydocks", picModal.id, { pic: picDraft.trim() || "Belum ditentukan" });
    log("menetapkan PIC dock", `${picModal.name} · ${picDraft.trim() || "Belum ditentukan"}`, "Drydock");
    toast(S.tPicSaved.replace("{a}", picModal.name));
    setPicModal(null);
    setPicDraft("");
  };

  /* Tindak lanjut slot konflik: geser tanggal / pindah fasilitas.
     Hapus diblokir bila proyek belum Selesai, jadi jalan keluarnya pindah —
     validasi sama dengan booking baru (abaikan slot sendiri). */
  const openMove = (s: StoreItem) => {
    setMoveTarget(s);
    setMoveForm({ dockId: String(s.dockId ?? "DD-1"), from: String(s.from ?? ""), to: String(s.to ?? "") });
    setMoveError(null);
  };

  const saveMove = async () => {
    if (!moveTarget) return;
    const from = Number(moveForm.from);
    const to = Number(moveForm.to);
    if (!from || !to || to <= from || from < 0 || to > DAYS) {
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
      await update("dockSlots", moveTarget.id, { dockId: moveForm.dockId, from, to });
      log("memindah slot", `${moveTarget.id} → ${moveForm.dockId} hari ${from}-${to}`, "Drydock");
      toast(S.tMoved.replace("{a}", String(moveTarget.id)).replace("{b}", String(from)).replace("{c}", String(to)));
      setMoveTarget(null);
      setMoveError(null);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : S.tMoveFail);
    }
  };

  const confirmDelete = async () => {    if (!deleting) return;
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

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiUtil} value={`${util}%`} delta={S.kpiUtilDelta} deltaDirection="flat" icon={<Ship className="h-5 w-5" />} chip="navy" spark={dockUtilTrend} />
        <KpiCard label={S.kpiSlots} value={S.kpiSlotsVal.replace("{n}", String(dockSlots.length))} hint={S.kpiSlotsHint} icon={<CalendarRange className="h-5 w-5" />} chip="teal" spark={slotTrend} />
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
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{S.conflictTitle.replace("{n}", String(conflict.length))}</p>
            <p>{S.conflictDesc.replace("{a}", conflict.map((c) => c.vessel).join(", "))}</p>
          </div>
        </div>
      )}

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
        <Card>
          <CardHeader title={S.cardSlots} subtitle={S.cardSlotsSub} action={
            <select className="input text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={S.filterStatusAria}>
              {STATUS_FILTERS.map((s) => <option key={s}>{s}</option>)}
            </select>
          } />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr><SortTh label={S.colFacility} sortKey="facility" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colProject} sortKey="vessel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colDuration} sortKey="days" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colPriority} sortKey="priority" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.colAction}</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {pager.slice(sortedSlots).map((s) => {
                  const st = slotStatus(s, data.projects);
                  const isCrit = conflict.some((c) => c.id === s.id) && overlapsKritis(s);
                  return (
                    <tr key={s.id} id={notifRowId(String(s.id))} className={`hover:bg-surface ${isCrit ? "bg-rose-50" : ""} ${flash.flashId === String(s.id) ? "notif-hl notif-flash" : "notif-hl"}`}>
                      <td className="td text-steel-600">{drydocks.find((d) => d.id === s.dockId)?.name}</td>
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
                      <td className="td">
                        <div className="flex gap-1.5">
                          <button className="btn-secondary text-xs" onClick={() => openSlot(s)}>{S.detailBtn}</button>
                          <button
                            className="btn-secondary text-xs"
                            title={conflict.some((c) => c.id === s.id) ? S.moveTitleConflict : S.moveTitlePlain}
                            aria-label={S.moveAria.replace("{a}", String(s.id))}
                            onClick={() => openMove(s)}
                          >
                            {S.btnMove}
                          </button>
                          <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title={S.delSlotTitle.replace("{a}", String(s.id))} aria-label={S.delSlotTitle.replace("{a}", String(s.id))} onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredSlots.length === 0 && <tr><td colSpan={6} className="td text-center text-steel-400">{S.emptySlots}</td></tr>}
              </tbody>
            </table>
            {pager.bar}
          </div>
        </Card>

      <Card>
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
                        return (
                          <div
                            key={s.id}
                            id={notifRowId(String(s.id))}
                            onClick={() => { if (isSel) setSelected(null); else openSlot(s); }}
                            className={`absolute top-1/2 -translate-y-1/2 flex h-10 items-center justify-between rounded-md px-2 text-xs font-medium text-white shadow cursor-pointer transition ${isMaint ? "bg-steel-400" : isConf ? "bg-rose-500" : s.color} ${isSel ? "ring-2 ring-navy-900" : "hover:brightness-110"} ${isCrit && !isSel ? "ring-4 ring-rose-800" : isConf && !isSel ? "ring-2 ring-rose-700" : ""} ${flash.flashId === String(s.id) ? "notif-hl notif-flash" : "notif-hl"}`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
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

      <Card className="mt-5">
        <CardHeader
          title={S.annualTitle}
          subtitle={S.annualSub}
          action={<button className="btn-secondary text-xs" onClick={exportAnnualPlan}>{S.exportExcelBtn}</button>}
        />
        <div className="overflow-x-auto p-4 pt-0">
          <div className="grid min-w-[1100px] grid-cols-12 gap-2">
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
      </Card>

      {/* Modal detail slot */}
      <Modal open={sel !== null} onClose={() => setSelected(null)} title={S.slotTitle.replace("{a}", sel?.id ?? "")} subtitle={sel ? `${sel.vessel} · ${sel.project}` : ""}>
        {sel && (
          <div>
          <dl className="dl-div text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">{S.colFacility}</dt><dd className="font-medium">{drydocks.find((d) => d.id === sel.dockId)?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.colDuration}</dt><dd className="font-medium">{fmtRentang(dayToISO(sel.from), dayToISO(sel.to))} ({S.durationDays.replace("{n}", String(slotDays(sel)))})</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.colPriority}</dt><dd className="font-medium">{sel.priority ?? "Normal"}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblRate}</dt><dd className="font-medium">{S.perDay.replace("{a}", fmtRupiah(Number(sel.ratePerDay || 0)))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblCost}</dt><dd className="font-semibold text-navy-900">{S.durationDays.replace("{n}", String(slotDays(sel)))} × {fmtRupiah(Number(sel.ratePerDay || 0))} = {fmtRupiah(slotCost(sel))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.colStatus}</dt><dd><StatusBadge status={slotStatus(sel, data.projects)} /></dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblConflict}</dt><dd>{conflict.some((c) => c.id === sel.id) ? <Badge tone="red">{S.conflictBadge}</Badge> : <Badge tone="green">{S.safeBadge}</Badge>}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">{S.lblRecorded}</dt><dd className="font-medium">{fmtJumlah(Number(sel.powerKwh || 0))} kWh · {fmtJumlah(Number(sel.waterM3 || 0))} m³</dd></div>
          </dl>
          <div className="mt-3 border-t border-steel-100 pt-3">
            <p className="text-xs font-semibold text-steel-500">{S.utilSection}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label={S.lblPower}><NumInput min={0} className="input" value={utilDraft.power} onChange={(e) => setUtilDraft({ ...utilDraft, power: e.target.value })} placeholder={S.phPower} /></Field>
              <Field label={S.lblWater}><NumInput min={0} className="input" value={utilDraft.water} onChange={(e) => setUtilDraft({ ...utilDraft, water: e.target.value })} placeholder={S.phWater} /></Field>
            </div>
            <button className="btn-secondary mt-2 text-xs" onClick={saveUtility}>{S.btnSaveUtil}</button>
          </div>
          <div className="mt-3 border-t border-steel-100 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-steel-500">{S.undockSection}</p>
              <Badge tone={undockList(sel).every(Boolean) ? "green" : "amber"}>{undockList(sel).every(Boolean) ? S.undockReady : S.undockProgress.replace("{n}", String(undockList(sel).filter(Boolean).length))}</Badge>
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
        footer={<><button className="btn-secondary" onClick={() => { setMoveTarget(null); setMoveError(null); }}>{S.cancelBtn}</button><button className="btn-primary" onClick={() => void saveMove()}>{S.btnSaveMove}</button></>}>
        <div className="space-y-3">
          {moveError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{moveError}</p>}
          <Field label={S.lblTargetFacility}>
            <select className="input" value={moveForm.dockId} onChange={(e) => setMoveForm({ ...moveForm, dockId: e.target.value })}>
              {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.lblStartDay.replace("{n}", String(DAYS))}><NumInput min={1} max={DAYS} className="input" value={moveForm.from} onChange={(e) => setMoveForm({ ...moveForm, from: e.target.value })} /></Field>
            <Field label={S.lblEndDay.replace("{n}", String(DAYS))}><NumInput min={1} max={DAYS} className="input" value={moveForm.to} onChange={(e) => setMoveForm({ ...moveForm, to: e.target.value })} /></Field>
          </FormGrid>
          <p className="text-xs text-steel-500">{S.moveHint.replace("{a}", Number(moveForm.to) > Number(moveForm.from) ? S.durationDays.replace("{n}", String(Number(moveForm.to) - Number(moveForm.from))) : "-")}</p>
        </div>
      </Modal>

      {/* Modal booking */}
      <Modal open={showBook} onClose={() => { setShowBook(false); setBookError(null); }} title={S.bookTitle} subtitle={S.bookSub}
        footer={<><button className="btn-secondary" onClick={() => { setShowBook(false); setBookError(null); }}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveBooking}>{S.btnSaveBook}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colFacility}>
              <select className="input" value={bookForm.dockId} onChange={(e) => setBookForm({ ...bookForm, dockId: e.target.value })}>
                {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label={S.colProject}>
              <select className="input" value={bookForm.project} onChange={(e) => setBookForm({ ...bookForm, project: e.target.value })}>
                <option value="">{S.optPickProject}</option>
                {projectOptions.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.lblStartAt}><NumInput min={0} max={90} className="input" value={bookForm.from} onChange={(e) => setBookForm({ ...bookForm, from: e.target.value })} /></Field>
            <Field label={S.lblEndAt}><NumInput min={1} max={90} className="input" value={bookForm.to} onChange={(e) => setBookForm({ ...bookForm, to: e.target.value })} /></Field>
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
            <Field label={S.lblCalDate} hint={S.hintCalDate}>
              <input type="date" className="input" value={bookForm.startDate} onChange={(e) => setBookForm({ ...bookForm, startDate: e.target.value })} />
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
            <Field label={S.lblReason}><input className="input" value={maintForm.reason} onChange={(e) => setMaintForm({ ...maintForm, reason: e.target.value })} placeholder={S.phReason} /></Field>
            <Field label={S.lblFromDay}><NumInput min={0} max={90} className="input" value={maintForm.from} onChange={(e) => setMaintForm({ ...maintForm, from: e.target.value })} /></Field>
            <Field label={S.lblToDay}><NumInput min={1} max={90} className="input" value={maintForm.to} onChange={(e) => setMaintForm({ ...maintForm, to: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal PIC dock */}
      <Modal open={picModal !== null} onClose={() => setPicModal(null)} title={S.picTitle.replace("{a}", picModal?.name ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setPicModal(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={savePic}>{S.btnSavePic}</button></>}>
        <Field label={S.lblPic} hint={S.hintPic}>
          <input className="input" value={picDraft} onChange={(e) => setPicDraft(e.target.value)} placeholder={S.phPic} />
        </Field>
      </Modal>

      <ConfirmModal open={deleting !== null} title={S.delTitle.replace("{a}", deleting?.id ?? "")} desc={S.delDesc.replace("{a}", String(deleting?.vessel ?? ""))}
        confirmLabel={S.confirmDelete} danger onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete} />
    </div>
  );
}
