import { useState } from "react";
import { Plus, Ship, CalendarRange, AlertTriangle, GripVertical, Trash2, Wrench, User } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, ProgressBar, Modal, Field, FormGrid, ConfirmModal, StatusBadge, toast, SortTh, toggleSort, sortRows } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { dockUtilTrend, slotTrend } from "../../data";
import { fmtJumlah, fmtRupiah, fmtTanggal, fmtRentang } from "../../utils/format";
import { sbDsNumber, maxSeq } from "../../utils/sb";
import { AlertBannerView, notifRowId, useModuleAlert } from "../../components/AlertBanner";
import { exportExcel } from "../../utils/export";

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
  const modAlert = useModuleAlert("drydock");
  const drydocks = data.drydocks;
  const dockSlots = data.dockSlots;
  const projectOptions = data.projects;
  const [selected, setSelected] = useState<string | null>(null);

  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ dockId: "DD-1", project: "", from: "1", to: "30", priority: "Normal", ratePerDay: "0", dsRef: "", vessel2: "", startDate: "" });
  const [bookError, setBookError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StoreItem | null>(null);
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
      toast("Konsumsi listrik/air harus angka 0 atau lebih", "info");
      return;
    }
    await update("dockSlots", sel.id, { powerKwh: power, waterM3: water });
    log("mencatat konsumsi slot", `${sel.id} · ${power} kWh · ${water} m³`, "Drydock");
    toast(`Konsumsi slot ${sel.id} disimpan`);
  };

  const toggleUndock = async (idx: number) => {
    if (!sel) return;
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
          history: [...(vsl.history ?? []), { date: new Date().toISOString().slice(0, 10), event: `Undocking selesai — slot ${sel.id} (${sel.dockId})`, type: "Docking" }],
        });
      }
      toast(`Docking report ${sel.id} lengkap`);
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
    toast("Rencana dock tahunan diekspor");
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

  const saveBooking = async () => {
    const proj = data.projects.find((p) => p.id === bookForm.project);
    if (!proj) { setBookError("Pilih proyek dulu."); return; }
    const from = Number(bookForm.from);
    const to = Number(bookForm.to);
    if (!from || !to || to <= from || from < 0 || to > DAYS) { setBookError(`Rentang hari tidak valid (1–${DAYS}).`); return; }
    if (overlap(bookForm.dockId, from, to)) {
      const msg = `Booking ditolak: rentang hari ${from}–${to} tumpang tindih dengan slot lain di ${selDock?.name ?? bookForm.dockId}.`;
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    const cap = selDock ? dockLengthM(selDock.capacity) : null;
    const loa = vesselLoa(proj.vessel, data.vessels);
    if (cap !== null && loa !== null && loa > cap) {
      const msg = `Booking ditolak: LOA ${proj.vessel} (${loa} m) melebihi kapasitas ${selDock?.name} (${cap} m).`;
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    const ratePerDay = Number(bookForm.ratePerDay || 0);
    if (!Number.isFinite(ratePerDay) || ratePerDay < 0) { setBookError("Tarif dock per hari harus 0 atau lebih."); return; }
    // No. Dock Space SB: pakai input atau auto (format nnn/DS-SB/SMD/m/yyyy).
    const dsRef = bookForm.dsRef.trim() || sbDsNumber(nextDsSeq());
    const vesselFull = bookForm.vessel2.trim() ? `${proj.vessel} + ${bookForm.vessel2.trim()}` : proj.vessel;
    const created = await add("dockSlots", {
      dockId: bookForm.dockId, project: proj.id, vessel: vesselFull, from, to,
      priority: bookForm.priority, ratePerDay, dsRef,
      startDate: bookForm.startDate || undefined,
      color: SLOT_COLORS[dockSlots.length % SLOT_COLORS.length],
    }, { action: "membooking slot", target: `${bookForm.dockId} · ${vesselFull} · ${bookForm.priority}`, module: "Drydock" });
    toast(`Slot ${created.id} dibooking (${bookForm.priority}) · DS ${dsRef}`);
    setBookForm({ dockId: "DD-1", project: "", from: "1", to: "30", priority: "Normal", ratePerDay: "0", dsRef: "", vessel2: "", startDate: "" });
    setShowBook(false);
    setBookError(null);
  };

  const saveMaintBlock = async () => {
    const from = Number(maintForm.from);
    const to = Number(maintForm.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || from < 0 || to > DAYS) {
      toast(`Rentang hari tidak valid (1–${DAYS}).`, "info");
      return;
    }
    if (!maintForm.reason.trim()) { toast("Alasan maintenance wajib diisi", "info"); return; }
    const dock = drydocks.find((d) => d.id === maintForm.dockId);
    const created = await add("dockSlots", {
      dockId: maintForm.dockId, project: "MAINT", vessel: `Maintenance — ${maintForm.reason.trim()}`,
      from, to, priority: "Normal", reason: maintForm.reason.trim(), color: "bg-steel-400",
    }, { action: "memblokir maintenance", target: `${maintForm.dockId} · ${fmtRentang(dayToISO(from), dayToISO(to))}`, module: "Drydock" });
    toast(`Blok maintenance ${created.id} di ${dock?.name ?? maintForm.dockId}`);
    setShowMaint(false);
    setMaintForm({ dockId: "DD-1", from: "1", to: "7", reason: "" });
  };

  const savePic = async () => {
    if (!picModal) return;
    await update("drydocks", picModal.id, { pic: picDraft.trim() || "Belum ditentukan" });
    log("menetapkan PIC dock", `${picModal.name} · ${picDraft.trim() || "Belum ditentukan"}`, "Drydock");
    toast(`PIC ${picModal.name} diperbarui`);
    setPicModal(null);
    setPicDraft("");
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const proj = data.projects.find((p) => p.id === deleting.project);
    if (proj && proj.status !== "Selesai") {
      toast(`Slot ${deleting.id} tidak bisa dihapus: proyek ${proj.id} masih berstatus ${proj.status}.`, "info");
      setDeleting(null);
      return;
    }
    await remove("dockSlots", deleting.id);
    log("menghapus slot", `${deleting.id} · ${deleting.vessel}`, "Drydock");
    toast("Slot dihapus", "info");
    setDeleting(null);
  };

  return (
    <div>
      <PageHeader
        title="Drydock & Kapasitas"
        subtitle="Penjadwalan slot docking, utilisasi, dan deteksi konflik"
        icon={<Ship className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowMaint(true)}><Wrench className="h-4 w-4" /> Blokir Maintenance</button>
            <button className="btn-primary-gradient" onClick={() => { setShowBook(true); setBookError(null); }}><Plus className="h-4 w-4" /> Booking Slot</button>
          </div>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onClose={modAlert.dismiss} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Utilitas Docking" value={`${util}%`} delta="Hari terisi per total hari dock" deltaDirection="flat" icon={<Ship className="h-5 w-5" />} chip="navy" spark={dockUtilTrend} />
        <KpiCard label="Slot Terisi" value={`${dockSlots.length} slot`} hint="Jadwal aktif semua fasilitas" icon={<CalendarRange className="h-5 w-5" />} chip="teal" spark={slotTrend} />
        <KpiCard
          label="Konflik Slot"
          value={hasConflict ? String(conflict.length) : "0"}
          delta={hasConflict ? "Perlu atasi" : "Tidak ada"}
          deltaDirection={hasConflict ? "down" : "up"}
          icon={<AlertTriangle className="h-5 w-5" />}
          chip={hasConflict ? "rose" : "teal"}
          spark={slotTrend}
        />
        <KpiCard
          label="Kapasitas Berikutnya"
          value={nextFree ? fmtTanggal(dayToISO(nextFree.start)) : "Penuh"}
          hint={nextFree ? `${nextFree.dock.name} · slot seminggu bebas` : `${DAYS} hari ke depan`}
          chip="amber"
          spark={dockUtilTrend}
        />
      </div>

      {hasConflict && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Deteksi konflik slot ({conflict.length})</p>
            <p>Slot docking tumpang tindih pada fasilitas yang sama: {conflict.map((c) => c.vessel).join(", ")}. Tinjau ulang alokasi untuk menghindari penundaan proyek.</p>
          </div>
        </div>
      )}

      {criticalConflicts.length > 0 && (
        <div className="mb-4 rounded-lg border-2 border-rose-600 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-bold">Panel perhatian — konflik melibatkan slot Kritis ({criticalConflicts.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {criticalConflicts.map((c) => (
              <li key={c.id} className="font-semibold">{c.vessel} · {c.project} · {drydocks.find((d) => d.id === c.dockId)?.name} · {fmtRentang(dayToISO(Number(c.from)), dayToISO(Number(c.to)))}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader
          title="Gantt Penjadwalan Docking"
          subtitle="Klik slot untuk detail · 13 minggu ke depan"
          action={
            <div className="flex items-center gap-2">
              <Badge tone="navy">{DAYS} hari</Badge>
              <div className="flex items-center gap-1 rounded-lg border border-steel-200 bg-surface p-0.5">
                <button
                  onClick={() => setWide(false)}
                  aria-label="Tampilan gantt sempit"
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${!wide ? "bg-white text-navy-800 shadow-sm" : "text-steel-500 hover:text-navy-700"}`}
                >
                  Sempit
                </button>
                <button
                  onClick={() => setWide(true)}
                  aria-label="Tampilan gantt lebar"
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${wide ? "bg-white text-navy-800 shadow-sm" : "text-steel-500 hover:text-navy-700"}`}
                >
                  Lebar
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
                    <p className="font-semibold">W{w}</p>
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
                      <span className="inline-flex items-center gap-1 text-xs text-steel-500"><User className="h-3 w-3" /> PIC: {dock.pic ?? "Belum ditentukan"}</span>
                      <button className="btn-secondary text-xs" onClick={() => { setPicModal(dock); setPicDraft(String(dock.pic ?? "")); }}>PIC</button>
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
                            className={`absolute top-1/2 -translate-y-1/2 flex h-10 items-center justify-between rounded-md px-2 text-xs font-medium text-white shadow cursor-pointer transition ${isMaint ? "bg-steel-400" : isConf ? "bg-rose-500" : s.color} ${isSel ? "ring-2 ring-navy-900" : "hover:brightness-110"} ${isCrit && !isSel ? "ring-4 ring-rose-800" : isConf && !isSel ? "ring-2 ring-rose-700" : ""} ${modAlert.highlight.has(String(s.id)) ? "notif-hl" : ""}`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            title={`${s.vessel} · ${s.project} · ${fmtRentang(dayToISO(s.from), dayToISO(s.to))}${s.priority ? ` · ${s.priority}` : ""}${isCrit ? " · KRITIS TUMPANG TINDIH" : isConf ? " · TUMPANG TINDIH" : ""}`}
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

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Slot Docking Aktif" subtitle="Detail slot saat ini" action={
            <select className="input text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status slot">
              {STATUS_FILTERS.map((s) => <option key={s}>{s}</option>)}
            </select>
          } />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr><SortTh label="Fasilitas" sortKey="facility" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Proyek" sortKey="vessel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Durasi" sortKey="days" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Prioritas" sortKey="priority" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {sortRows(filteredSlots, sort, (s: StoreItem, k) => k === "days" ? Number(slotDays(s)) : k === "status" ? String(slotStatus(s, data.projects)) : k === "facility" ? String(drydocks.find((d) => d.id === s.dockId)?.name ?? s.dockId) : String((s as unknown as Record<string, unknown>)[k] ?? "")).map((s) => {
                  const st = slotStatus(s, data.projects);
                  const isCrit = conflict.some((c) => c.id === s.id) && overlapsKritis(s);
                  return (
                    <tr key={s.id} className={`hover:bg-surface ${isCrit ? "bg-rose-50" : ""}`}>
                      <td className="td text-steel-600">{drydocks.find((d) => d.id === s.dockId)?.name}</td>
                      <td className="td">
                        <p className="font-medium text-navy-900">{s.vessel}</p>
                        <p className="text-xs font-mono text-steel-500">{s.project}</p>
                        {s.dsRef ? <p className="text-xs font-mono text-steel-400">DS {s.dsRef}</p> : null}
                        {s.startDate ? <p className="text-xs text-steel-400">Mulai {fmtTanggal(s.startDate)}</p> : null}
                      </td>
                      <td className="td text-steel-600">{fmtRentang(dayToISO(s.from), dayToISO(s.to))} ({s.to - s.from} hari)</td>
                      <td className="td">
                        {s.project === "MAINT"
                          ? <Badge tone="gray">Blokir</Badge>
                          : <Badge tone={s.priority === "Kritis" ? "red" : s.priority === "Tinggi" ? "amber" : "gray"}>{s.priority ?? "Normal"}</Badge>}
                      </td>
                      <td className="td"><StatusBadge status={st} /></td>
                      <td className="td">
                        <div className="flex gap-1.5">
                          <button className="btn-secondary text-xs" onClick={() => openSlot(s)}>Detail</button>
                          <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title={`Hapus slot ${s.id}`} aria-label={`Hapus slot ${s.id}`} onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredSlots.length === 0 && <tr><td colSpan={6} className="td text-center text-steel-400">Belum ada slot pada filter ini.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-navy-900">Utilisasi per Fasilitas</h3>
          <div className="space-y-3">
            {coverageByDock.map(({ dock, pct }) => (
              <div key={dock.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-steel-600">{dock.name}</span>
                  <span className="font-semibold text-navy-900">{pct}%</span>
                </div>
                <ProgressBar value={pct} tone={pct > 80 ? "red" : pct > 60 ? "amber" : "green"} />
                <p className="mt-1 text-xs text-steel-500">Biaya dock {fmtRupiah(dockCostTotal(dock.id))}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-steel-400">
            {busiest ? `${busiest.dock.name} saat ini paling padat (${busiest.pct}%).` : "Belum ada data utilisasi."} Dihitung dari hari terisi slot per {DAYS} hari.
          </p>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Rencana Dock Tahunan (12 Bulan)"
          subtitle="Read-only · slot existing per bulan"
          action={<button className="btn-secondary text-xs" onClick={exportAnnualPlan}>Ekspor Excel</button>}
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
                    {inMonth.length === 0 && <p className="text-[11px] text-steel-400">Kosong</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Modal detail slot */}
      <Modal open={sel !== null} onClose={() => setSelected(null)} title={`Slot ${sel?.id ?? ""}`} subtitle={sel ? `${sel.vessel} · ${sel.project}` : ""}>
        {sel && (
          <div>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">Fasilitas</dt><dd className="font-medium">{drydocks.find((d) => d.id === sel.dockId)?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Durasi</dt><dd className="font-medium">{fmtRentang(dayToISO(sel.from), dayToISO(sel.to))} ({slotDays(sel)} hari)</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Prioritas</dt><dd className="font-medium">{sel.priority ?? "Normal"}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Tarif dock</dt><dd className="font-medium">{fmtRupiah(Number(sel.ratePerDay || 0))}/hari</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Biaya dock</dt><dd className="font-semibold text-navy-900">{slotDays(sel)} hari × {fmtRupiah(Number(sel.ratePerDay || 0))} = {fmtRupiah(slotCost(sel))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={slotStatus(sel, data.projects)} /></dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Konflik</dt><dd>{conflict.some((c) => c.id === sel.id) ? <Badge tone="red">Tumpang tindih</Badge> : <Badge tone="green">Aman</Badge>}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Konsumsi tercatat</dt><dd className="font-medium">{fmtJumlah(Number(sel.powerKwh || 0))} kWh · {fmtJumlah(Number(sel.waterM3 || 0))} m³</dd></div>
          </dl>
          <div className="mt-3 border-t border-steel-100 pt-3">
            <p className="text-xs font-semibold text-steel-500">KONSUMSI LISTRIK / AIR PER SLOT</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Listrik (kWh)"><input type="number" min={0} className="input" value={utilDraft.power} onChange={(e) => setUtilDraft({ ...utilDraft, power: e.target.value })} placeholder="cth: 1200" /></Field>
              <Field label="Air (m³)"><input type="number" min={0} className="input" value={utilDraft.water} onChange={(e) => setUtilDraft({ ...utilDraft, water: e.target.value })} placeholder="cth: 85" /></Field>
            </div>
            <button className="btn-secondary mt-2 text-xs" onClick={saveUtility}>Simpan Konsumsi</button>
          </div>
          <div className="mt-3 border-t border-steel-100 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-steel-500">DOCKING REPORT — CHECKLIST UNDOCKING</p>
              <Badge tone={undockList(sel).every(Boolean) ? "green" : "amber"}>{undockList(sel).every(Boolean) ? "Siap Undocking" : `${undockList(sel).filter(Boolean).length}/5`}</Badge>
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
            <button className="btn-danger mt-3 w-full justify-center" onClick={() => { setDeleting(sel); setSelected(null); }}><Trash2 className="h-4 w-4" /> Hapus Slot</button>
          </div>
        )}
      </Modal>

      {/* Modal booking */}
      <Modal open={showBook} onClose={() => { setShowBook(false); setBookError(null); }} title="Booking Slot Docking" subtitle="Booking yang tumpang tindih akan ditolak"
        footer={<><button className="btn-secondary" onClick={() => { setShowBook(false); setBookError(null); }}>Batal</button><button className="btn-primary" onClick={saveBooking}>Simpan Booking</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Fasilitas">
              <select className="input" value={bookForm.dockId} onChange={(e) => setBookForm({ ...bookForm, dockId: e.target.value })}>
                {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Proyek">
              <select className="input" value={bookForm.project} onChange={(e) => setBookForm({ ...bookForm, project: e.target.value })}>
                <option value="">Pilih proyek…</option>
                {projectOptions.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Mulai (hari ke-)"><input type="number" min={0} max={90} className="input" value={bookForm.from} onChange={(e) => setBookForm({ ...bookForm, from: e.target.value })} /></Field>
            <Field label="Selesai (hari ke-)"><input type="number" min={1} max={90} className="input" value={bookForm.to} onChange={(e) => setBookForm({ ...bookForm, to: e.target.value })} /></Field>
            <Field label="Prioritas">
              <select className="input" value={bookForm.priority} onChange={(e) => setBookForm({ ...bookForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Tarif dock per hari (Rp)" hint="Default 0 · biaya = hari × tarif">
              <input type="number" min={0} className="input" value={bookForm.ratePerDay} onChange={(e) => setBookForm({ ...bookForm, ratePerDay: e.target.value })} placeholder="cth: 15000000" />
            </Field>
            <Field label="No. Dock Space (SB)" hint="Otomatis bila kosong: nnn/DS-SB/SMD/m/yyyy">
              <input className="input font-mono" value={bookForm.dsRef} onChange={(e) => setBookForm({ ...bookForm, dsRef: e.target.value })} placeholder={sbDsNumber(nextDsSeq())} />
            </Field>
            <Field label="Kapal pasangan (Barge)" hint="Opsional — cth surat TB/Barge">
              <input className="input" value={bookForm.vessel2} onChange={(e) => setBookForm({ ...bookForm, vessel2: e.target.value })} placeholder="cth: BG RMN 3324" />
            </Field>
            <Field label="Tanggal mulai kalender" hint="Arsip/backdate — cth surat 00 Jan 2024">
              <input type="date" className="input" value={bookForm.startDate} onChange={(e) => setBookForm({ ...bookForm, startDate: e.target.value })} />
            </Field>
          </FormGrid>
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
            Estimasi biaya dock: {Math.max(0, Number(bookForm.to || 0) - Number(bookForm.from || 0))} hari × {fmtRupiah(Number(bookForm.ratePerDay || 0))} = {fmtRupiah(Math.max(0, Number(bookForm.to || 0) - Number(bookForm.from || 0)) * Math.max(0, Number(bookForm.ratePerDay || 0)))}
          </p>
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
            Info kapasitas: {selDock?.capacity ?? "—"}
            {selProj ? (selLoa !== null ? ` · LOA ${selProj.vessel} ${selLoa} m` : ` · data LOA ${selProj.vessel} tidak tersedia`) : ""}
            {selCap !== null && selLoa !== null ? (selLoa > selCap ? " · MELEBIHI KAPASITAS — booking akan ditolak." : " · muat di fasilitas ini.") : ""}
          </p>
          {bookError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{bookError}</p>
          )}
        </div>
      </Modal>

      {/* Modal blokir maintenance */}
      <Modal open={showMaint} onClose={() => setShowMaint(false)} title="Blokir Maintenance Dock" subtitle="Blok ikut deteksi overlap seperti slot biasa"
        footer={<><button className="btn-secondary" onClick={() => setShowMaint(false)}>Batal</button><button className="btn-primary" onClick={saveMaintBlock}>Simpan Blokir</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Fasilitas">
              <select className="input" value={maintForm.dockId} onChange={(e) => setMaintForm({ ...maintForm, dockId: e.target.value })}>
                {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Alasan"><input className="input" value={maintForm.reason} onChange={(e) => setMaintForm({ ...maintForm, reason: e.target.value })} placeholder="cth: Perbaikan rail slipway" /></Field>
            <Field label="Dari (hari ke-)"><input type="number" min={0} max={90} className="input" value={maintForm.from} onChange={(e) => setMaintForm({ ...maintForm, from: e.target.value })} /></Field>
            <Field label="Sampai (hari ke-)"><input type="number" min={1} max={90} className="input" value={maintForm.to} onChange={(e) => setMaintForm({ ...maintForm, to: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal PIC dock */}
      <Modal open={picModal !== null} onClose={() => setPicModal(null)} title={`PIC — ${picModal?.name ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setPicModal(null)}>Batal</button><button className="btn-primary" onClick={savePic}>Simpan PIC</button></>}>
        <Field label="Penanggung jawab dock" hint="Kosongkan untuk kembali ke Belum ditentukan">
          <input className="input" value={picDraft} onChange={(e) => setPicDraft(e.target.value)} placeholder="cth: Rudi Hartono" />
        </Field>
      </Modal>

      <ConfirmModal open={deleting !== null} title={`Hapus slot ${deleting?.id}?`} desc={`${deleting?.vessel} akan dikeluarkan dari jadwal docking.`}
        confirmLabel="Ya, hapus" danger onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete} />
    </div>
  );
}
