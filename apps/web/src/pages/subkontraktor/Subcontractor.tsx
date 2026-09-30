import { useEffect, useMemo, useState } from "react";
import { Plus, HardHat, FileSignature, Star, Search } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, Modal, Field, FormGrid, ConfirmModal, SortTh, toggleSort, sortRows, usePager, toast,
  NumInput, FlowStrip,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useBusy } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { remoteRepository } from "../../services/repositories";
import { getJwt, isBackendConfigured } from "../../services/http";
import { fmtRupiah, fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { getSetting } from "../../utils/settings";
import { PPH_SUBKON_OPTIONS } from "../../utils/sb";
import { subActiveTrend, subContractTrend, woTrend, ratingTrend } from "../../data";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_crm } from "../../i18n/n_crm";

const toneMap: Record<string, "green" | "blue" | "amber" | "red" | "gray" | "navy"> = {
  Aktif: "green",
  Kualifikasi: "amber",
  Blacklist: "red",
  "Dalam Proses": "blue",
  Selesai: "green",
  Lunas: "green",
  Disetujui: "blue",
  Diajukan: "amber",
  "Belum Dibayar": "amber",
  Draf: "gray",
  Ditolak: "red",
  "Retensi Released": "green",
};

const TERM_NEXT: Record<string, string[]> = {
  Draf: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Lunas"],
  Lunas: [],
  Ditolak: [],
  "Retensi Released": [],
};

function normTerm(s: string): string {
  return s === "Belum Dibayar" ? "Diajukan" : s;
}

const termNext = (s: string): string[] => TERM_NEXT[normTerm(s)] ?? [];

const SUB_NEXT: Record<string, string[]> = {
  Aktif: ["Kualifikasi", "Blacklist"],
  Kualifikasi: ["Aktif", "Blacklist"],
  Blacklist: ["Kualifikasi"],
};

function normSub(s: string): string {
  return SUB_NEXT[s] ? s : "Kualifikasi";
}

const CONTRACT_TYPES = ["Borongan", "Lump-sum", "Spesialis", "Support"];
const PAY_SCHEMES = ["harian", "unit", "meter", "jam"];

const pphOf = (p: StoreItem, fallback = 2): number => Number(p.pphPct ?? fallback);
const retOf = (p: StoreItem): number => Number(p.retPct ?? 5);
const potonganOf = (p: StoreItem, pphFallback = 2): number => Number(p.amount || 0) * (pphOf(p, pphFallback) + retOf(p)) / 100;
const netoOf = (p: StoreItem, pphFallback = 2): number => Number(p.amount || 0) - potonganOf(p, pphFallback);

/* Baca ulang payables segar (bukan snapshot render): mode remote → list BE,
   gagal/lokal → fallback snapshot. Pemanggil wajib filter cocok persis. */
async function freshPayables(fallback: StoreItem[]): Promise<StoreItem[]> {
  try {
    if (isBackendConfigured() && getJwt()) {
      const rows = await remoteRepository("payables").list();
      if (Array.isArray(rows)) return rows;
    }
  } catch {
    /* abaikan - pakai fallback lokal */
  }
  return fallback;
}

function complianceOf(k3: unknown): { label: string; tone: "green" | "amber" | "red" } {
  const v = String(k3 ?? "");
  if (v === "A+" || v === "A") return { label: "Patuh", tone: "green" };
  if (v === "B+" || v === "B") return { label: "Cukup", tone: "amber" };
  return { label: "Perlu Bina", tone: "red" };
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - base) / 86400000);
}

function daysLate(iso: string | null | undefined): number {
  const d = daysUntil(iso);
  return d !== null && d < 0 ? Math.abs(d) : 0;
}

interface Milestone { title: string; pct: number; due: string }

function milestonesOf(s: StoreItem): Milestone[] {
  return Array.isArray(s.milestones) ? s.milestones as Milestone[] : [];
}

/* Konversi nilai K3 → angka untuk grafik evaluasi (skor aktual). */
function k3Score(k3: unknown): number {
  const v = String(k3 ?? "").trim().toUpperCase();
  if (v === "A+") return 95;
  if (v === "A") return 90;
  if (v === "B+") return 82;
  if (v === "B") return 78;
  if (v === "C") return 65;
  return 60;
}

function shortSub(name: unknown): string {
  const s = String(name ?? "");
  return s.replace(/^(PT|CV)\s+/i, "").split(" ").slice(0, 2).join(" ");
}

export default function Subcontractor() {
  const busy = useBusy();
  const { data, add, update, log, branch, resync } = useStore();
  const { locale } = useT();
  const S = n_crm[locale];
  const subcontractors = data.subcontractors;
  const workOrders = data.workOrders;
  const payments = data.termins;
  const timesheets = data.timesheets;
  const projectOptions = data.projects;
  const employeeOptions = data.employees;
  const [tab, setTab] = useState("Subkontraktor");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [typeFilter, setTypeFilter] = useState("Semua");
  const [subQ, setSubQ] = useState("");
  const [subStatus, setSubStatus] = useState("Semua");
  const modAlert = useModuleAlert("subkontraktor");
  const flash = useNotifFlash();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  useEffect(() => { void resync().catch(() => undefined); }, [resync]);

  const [showSub, setShowSub] = useState(false);
  const [subForm, setSubForm] = useState({ name: "", services: "", contract: "", k3: "A", contractType: "Borongan", payScheme: "unit", noBG: "", bgExpiry: "", bgValue: "" });
  const [subConfirm, setSubConfirm] = useState<{ id: string; name: string; next: string } | null>(null);
  const [msSub, setMsSub] = useState<StoreItem | null>(null);
  const [msForm, setMsForm] = useState({ title: "", pct: "", due: "" });
  const [showWo, setShowWo] = useState(false);
  const [woForm, setWoForm] = useState({ sub: "", project: "", scope: "", targetDate: "", penaltyPct: "0.1" });
  const [woProg, setWoProg] = useState<StoreItem | null>(null);
  const [progMs, setProgMs] = useState<string[]>([]);
  const [progNote, setProgNote] = useState("");
  // Ubah WO (scope/target) + ubah termin Draf (milestone/amount).
  const [woEdit, setWoEdit] = useState<StoreItem | null>(null);
  const [woEditForm, setWoEditForm] = useState({ scope: "", targetDate: "" });
  const [termEdit, setTermEdit] = useState<StoreItem | null>(null);
  const [termEditForm, setTermEditForm] = useState({ milestone: "", amount: "" });
  const [confirmFinish, setConfirmFinish] = useState<{ id: string; v: number; note: string; ms: string[] } | null>(null);
  const [showTerm, setShowTerm] = useState(false);
  const [termForm, setTermForm] = useState({ sub: "", wo: "", milestone: "", amount: "", pphPct: "0.5", retPct: "5" });
  const [termPay, setTermPay] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState({ date: todayISO(), method: "Transfer", ref: "" });
  const [withholdingRef, setWithholdingRef] = useState("");
  const [termDirCheck, setTermDirCheck] = useState(false);
  const [termDirName, setTermDirName] = useState("");
  const [rejectTerm, setRejectTerm] = useState<StoreItem | null>(null);
  const [releaseTerm, setReleaseTerm] = useState<StoreItem | null>(null);
  const [releaseForm, setReleaseForm] = useState({ date: todayISO(), ba: "" });
  const [showTs, setShowTs] = useState(false);
  const [tsForm, setTsForm] = useState({ wo: "", employee: "", date: todayISO(), hours: "", note: "" });
  const [rateForm, setRateForm] = useState({ wo: "", rate: "" });

  const runningWo = workOrders.filter((w) => w.status !== "Selesai").length;
  const avgRating = subcontractors.length ? Math.round(subcontractors.reduce((s, x) => s + Number(x.rating || 0), 0) / subcontractors.length) : 0;
  const filteredSubs = subcontractors.filter((s) => {
    if (typeFilter !== "Semua" && String(s.contractType ?? "Borongan") !== typeFilter) return false;
    if (subStatus !== "Semua" && normSub(s.status) !== subStatus) return false;
    const needle = subQ.trim().toLowerCase();
    if (!needle) return true;
    return `${s.name ?? ""} ${s.services ?? ""}`.toLowerCase().includes(needle);
  });
  const woPager = usePager(workOrders.length);
  useEffect(() => {
    woPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const pickNotif = (rowId: string) => {
    const tIdx = payments.findIndex((t) => String(t.id) === rowId);
    if (tIdx >= 0) {
      if (tab === "Termin & Pembayaran") { flash.pick(rowId, -1, () => {}, 100); return; }
      setTab("Termin & Pembayaran");
      window.setTimeout(() => { flash.pick(rowId, -1, () => {}, 100); }, 250);
      return;
    }
    const idx = workOrders.findIndex((r) => String(r.id) === rowId);
    if (idx >= 0) {
      if (tab === "Work Order") { flash.pick(rowId, idx, woPager.go, woPager.size); return; }
      setTab("Work Order");
      window.setTimeout(() => { flash.pick(rowId, idx, woPager.go, woPager.size); }, 250);
      return;
    }
    flash.pick(rowId, -1, () => {}, 100);
  };

  /* Progres WO = jumlah bobot milestone termin yang selesai (sinkron dua arah
     dengan status termin; tanpa milestone → progres tersimpan legacy). */
  const doneMsOf = (w: StoreItem): string[] =>
    Array.isArray(w.doneMs) ? (w.doneMs as unknown[]).map((x) => String(x)) : [];
  const effProgress = (wo: StoreItem | null | undefined): number => {
    if (!wo) return 0;
    const sub = subcontractors.find((s) => sameName(s.name, String(wo.sub ?? "")));
    const ms = sub ? milestonesOf(sub) : [];
    if (ms.length === 0) return Number(wo.progress || 0);
    const done = doneMsOf(wo);
    return Math.min(100, ms.filter((m) => done.includes(m.title)).reduce((s, m) => s + Number(m.pct || 0), 0));
  };

  const termWoOptions = workOrders.filter((w) => termForm.sub && sameName(w.sub, termForm.sub));
  const termWo = workOrders.find((w) => w.id === termForm.wo) ?? null;
  const termSub = subcontractors.find((s) => s.name === termForm.sub) ?? null;
  const termCap = termSub && termWo ? Number(termSub.contract || 0) * effProgress(termWo) / 100 : 0;
  const termUsed = termForm.wo
    ? payments.filter((t) => t.woId === termForm.wo && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0)
    : 0;
  const termTsHours = termForm.wo
    ? timesheets.filter((t) => t.woId === termForm.wo).reduce((s, t) => s + Number(t.hours || 0), 0)
    : 0;
  const termTsRef = termWo && Number(termWo.rate || 0) > 0 && termTsHours > 0
    ? termTsHours * Number(termWo.rate || 0)
    : 0;
  const termMsList = termSub ? milestonesOf(termSub) : [];
  const termMs = termMsList.find((m) => m.title === termForm.milestone) ?? null;
  const termMsCap = termMs && termSub ? Number(termSub.contract || 0) * Number(termMs.pct || 0) / 100 : 0;
  const termMsUsed = termMs
    ? payments.filter((t) => sameName(t.sub, termForm.sub) && t.milestone === termMs.title && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0)
    : 0;

  const hoursByWo = (woId: string): number =>
    timesheets.filter((t) => t.woId === woId).reduce((s, t) => s + Number(t.hours || 0), 0);

  /* Posisi alur termin terjauh (untuk strip alur header tab Termin). */
  const furthestTermin = useMemo(() => {
    const order = ["Draf", "Diajukan", "Disetujui", "Lunas", "Retensi Released"];
    const max = payments.reduce((m, t) => Math.max(m, order.indexOf(normTerm(String(t.status ?? "")))), -1);
    return max >= 0 ? order[max] : order[0];
  }, [payments]);

  // Cabang global sebagai fallback bila lookup proyek/karyawan tidak punya cabang.
  const globalBranch = branch === "SEMUA" ? "" : branch;
  const branchOfProject = (pid: string): string =>
    String(data.projects.find((p) => p.id === pid)?.branch ?? globalBranch ?? "");
  const branchOfEmployee = (empId: string): string =>
    String(data.employees.find((e) => e.id === empId)?.branch ?? globalBranch ?? "");
  // Ambang Director untuk pelunasan termin (pengaturan APPROVE_TERMIN).
  const terminThreshold = getSetting(data, "APPROVE_TERMIN", 2000000);
  // Default PPh subkon bila termin tak menyebut pphPct (pengaturan PPH_SUBKON_DEFAULT).
  const pphDefault = getSetting(data, "PPH_SUBKON_DEFAULT", 0.5);
  const needsTermDirector = (t: StoreItem | null): boolean =>
    !!t && Number(t.amount || 0) > terminThreshold && !t.directorApproved;

  const woOfSub = (subName: string): StoreItem[] => workOrders.filter((w) => sameName(w.sub, subName));
  const incidentsOfSub = (subName: string): StoreItem[] => {
    const projs = woOfSub(subName).map((w) => w.project);
    return data.incidents.filter((i) => i.project && projs.includes(i.project));
  };

  const saveSub = async () => {
    try {
    if (!subForm.name.trim()) { toast(S.tSubNameRequired, "info"); return; }
    const bgValue = Number(subForm.bgValue || 0);
    if (subForm.bgValue && (!Number.isFinite(bgValue) || bgValue < 0)) { toast(S.tBgInvalid, "info"); return; }
    const created = await add("subcontractors", {
      name: subForm.name.trim(), services: subForm.services.trim() || "Umum",
      rating: 80, active: 0, contract: Number(subForm.contract) || 0, status: "Kualifikasi", k3: subForm.k3,
      contractType: subForm.contractType, payScheme: subForm.payScheme,
      noBG: subForm.noBG.trim(), bgExpiry: subForm.bgExpiry, bgValue,
      milestones: [],
    }, { action: "meregistrasi subkontraktor", module: "Subkontraktor" });
    toast(S.tSubRegistered.replace("{n}", created.id));
    setShowSub(false);
    setSubForm({ name: "", services: "", contract: "", k3: "A", contractType: "Borongan", payScheme: "unit", noBG: "", bgExpiry: "", bgValue: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveMilestone = async () => {
    try {
    if (!msSub) return;
    if (!msForm.title.trim()) { toast(S.tMsTitleRequired, "info"); return; }
    const pct = Number(msForm.pct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) { toast(S.tMsWeightRange, "info"); return; }
    if (!msForm.due) { toast(S.tMsDueRequired, "info"); return; }
    const next = [...milestonesOf(msSub), { title: msForm.title.trim(), pct, due: msForm.due }];
    if (next.reduce((s, m) => s + Number(m.pct || 0), 0) > 100) { toast(S.tMsOverweight, "info"); return; }
    await update("subcontractors", msSub.id, { milestones: next });
    log("menambah milestone SOW", `${msSub.name} · ${msForm.title.trim()} (${pct}%)`, "Subkontraktor");
    toast(S.tMsAdded.replace("{n}", String(msSub.name)));
    setMsSub({ ...msSub, milestones: next });
    setMsForm({ title: "", pct: "", due: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const removeMilestone = async (idx: number) => {
    try {
    if (!msSub) return;
    const next = milestonesOf(msSub).filter((_, i) => i !== idx);
    await update("subcontractors", msSub.id, { milestones: next });
    log("menghapus milestone SOW", `${msSub.name} · index ${idx + 1}`, "Subkontraktor");
    setMsSub({ ...msSub, milestones: next });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveWo = async () => {
    try {
    if (!woForm.sub || !woForm.project || !woForm.scope.trim()) { toast(S.tWoFieldsRequired, "info"); return; }
    if (!woForm.targetDate) { toast(S.tWoTargetRequired, "info"); return; }
    const penaltyPct = Number(woForm.penaltyPct);
    if (!Number.isFinite(penaltyPct) || penaltyPct < 0 || penaltyPct > 5) { toast(S.tPenaltyRange, "info"); return; }
    const created = await add("workOrders", { sub: woForm.sub, project: woForm.project, scope: woForm.scope.trim(), progress: 0, status: "Dalam Proses", date: todayISO(), targetDate: woForm.targetDate, penaltyPct, branch: branchOfProject(woForm.project) },
      { action: "menerbitkan WO", module: "Subkontraktor" });
    toast(S.tWoIssued.replace("{n}", created.id));
    setShowWo(false);
    setWoForm({ sub: "", project: "", scope: "", targetDate: "", penaltyPct: "0.1" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const recordPenalty = async (w: StoreItem) => {
    try {
    const sub = subcontractors.find((s) => s.name === w.sub);
    const late = daysLate(String(w.targetDate ?? ""));
    const perDay = Number(w.penaltyPct || 0);
    const base = Number(sub?.contract || 0);
    const raw = base * perDay / 100 * late;
    const amount = Math.min(raw, base * 5 / 100);
    await update("workOrders", w.id, { penaltyDays: late, penaltyAmount: Math.round(amount), penaltyAt: todayISO() });
    log("mencatat denda keterlambatan", `${w.id} · telat ${late} hari · ${fmtRupiah(Math.round(amount))}`, "Subkontraktor");
    toast(S.tPenaltyLogged.replace("{a}", w.id).replace("{b}", fmtRupiah(Math.round(amount))));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // Ubah WO: scope + target (WO berjalan saja, bukan Selesai).
  const openWoEdit = (w: StoreItem) => {
    setWoEdit(w);
    setWoEditForm({ scope: String(w.scope ?? ""), targetDate: String(w.targetDate ?? "") });
  };

  const saveWoEdit = async () => {
    if (!woEdit) return;
    if (String(woEdit.status) === "Selesai") { toast(locale === "en" ? "Finished WO cannot be edited" : "WO Selesai tidak bisa diubah", "info"); return; }
    if (!woEditForm.scope.trim()) { toast(S.tWoFieldsRequired, "info"); return; }
    if (!woEditForm.targetDate) { toast(S.tWoTargetRequired, "info"); return; }
    try {
      await update("workOrders", woEdit.id, { scope: woEditForm.scope.trim(), targetDate: woEditForm.targetDate });
      log("mengubah WO", `${woEdit.id} · scope/target`, "Subkontraktor");
      toast(S.tProgressTo.replace("{a}", woEdit.id).replace("{b}", String(effProgress(woEdit))));
      setWoEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  // Ubah termin Draf: milestone + amount (aliran Draf→… terkunci setelah Diajukan).
  const openTermEdit = (p: StoreItem) => {
    setTermEdit(p);
    setTermEditForm({ milestone: String(p.milestone ?? ""), amount: String(p.amount ?? "") });
  };

  const saveTermEdit = async () => {
    if (!termEdit) return;
    if (normTerm(String(termEdit.status)) !== "Draf") { toast(locale === "en" ? "Only Draft terms can be edited" : "Hanya termin Draf yang bisa diubah", "info"); return; }
    const amount = Number(termEditForm.amount);
    if (!termEditForm.milestone.trim()) { toast(S.tMsTitleRequired, "info"); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast(S.tQuoteValuePositive ?? "Nominal harus > 0", "info"); return; }
    try {
      await update("termins", termEdit.id, { milestone: termEditForm.milestone.trim(), amount });
      log("mengubah termin", `${termEdit.id} · ${termEditForm.milestone.trim()} · ${fmtRupiah(amount)}`, "Subkontraktor");
      toast(locale === "en" ? `Term ${termEdit.id} updated` : `Termin ${termEdit.id} diubah`);
      setTermEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* Grafik evaluasi dari skor aktual (rating + konversi K3 per subkontraktor). */
  const evalChart = subcontractors.map((s) => ({
    name: shortSub(s.name),
    full: String(s.name ?? ""),
    rating: Number(s.rating || 0),
    k3: k3Score(s.k3),
  }));

  const applyWoProgress = async (id: string, v: number, note: string, doneMs?: string[]) => {
    try {
    await update("workOrders", id, { progress: v, status: v >= 100 ? "Selesai" : "Dalam Proses", ...(doneMs ? { doneMs } : {}) });
    log("mengupdate progres", `${id} → ${v}%${note ? ` - ${note}` : ""}`, "Subkontraktor");
    toast(S.tProgressTo.replace("{a}", id).replace("{b}", String(v)));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveWoProgress = () => {
    if (!woProg) return;
    const sub = subcontractors.find((s) => sameName(s.name, String(woProg.sub ?? "")));
    const ms = sub ? milestonesOf(sub) : [];
    if (ms.length === 0) {
      toast(locale === "en" ? "No SOW milestones yet - add milestones first" : "Belum ada milestone SOW - tambah milestone dulu", "info");
      return;
    }
    const known = ms.map((m) => m.title);
    const checked = progMs.filter((t) => known.includes(t));
    const v = Math.min(100, ms.filter((m) => checked.includes(m.title)).reduce((s, m) => s + Number(m.pct || 0), 0));
    if (v < effProgress(woProg) && !progNote.trim()) {
      toast(S.tProgressNoteRequired, "info");
      return;
    }
    if (v >= 100) {
      setConfirmFinish({ id: woProg.id, v, note: progNote.trim(), ms: checked });
      return;
    }
    applyWoProgress(woProg.id, v, progNote.trim(), checked);
    setWoProg(null);
    setProgMs([]);
    setProgNote("");
  };

  const saveTerm = async () => {
    try {
    if (!termForm.sub) { toast(S.tSubRequired, "info"); return; }
    const wo = workOrders.find((w) => w.id === termForm.wo && sameName(w.sub, termForm.sub));
    if (!wo) { toast(S.tWoBelongsSub, "info"); return; }
    const amount = Number(termForm.amount);
    if (!amount || amount <= 0) { toast(S.tTermPositive, "info"); return; }
    const pphPct = Number(termForm.pphPct);
    const retPct = Number(termForm.retPct);
    if (Number.isNaN(pphPct) || pphPct < 0 || pphPct > 100 || Number.isNaN(retPct) || retPct < 0 || retPct > 100) {
      toast(S.tTaxRange, "info");
      return;
    }
    const sub = subcontractors.find((s) => s.name === termForm.sub);
    const cap = sub ? Number(sub.contract || 0) * effProgress(wo) / 100 : 0;
    const used = payments.filter((t) => t.woId === wo.id && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0);
    if (used + amount > cap) {
      toast(S.tTermOverCap.replace("{a}", fmtRupiah(cap)).replace("{b}", fmtRupiah(Number(sub?.contract || 0))).replace("{c}", String(effProgress(wo))).replace("{d}", fmtRupiah(used)), "info");
      return;
    }
    const msList = sub ? milestonesOf(sub) : [];
    const ms = msList.find((m) => m.title === termForm.milestone);
    if (!ms) { toast(S.tTermNeedMs, "info"); return; }
    const msCap = Number(sub?.contract || 0) * Number(ms.pct || 0) / 100;
    const msUsed = payments.filter((t) => sameName(t.sub, termForm.sub) && t.milestone === ms.title && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0);
    if (msUsed + amount > msCap) {
      toast(S.tTermOverMs.replace("{a}", ms.title).replace("{b}", fmtRupiah(msCap)).replace("{c}", String(ms.pct)).replace("{d}", fmtRupiah(msUsed)), "info");
      return;
    }
    const created = await add("termins", {
      sub: termForm.sub, woId: wo.id, milestone: ms.title, progress: `${wo.id} (${wo.progress}%)`, amount,
      pphPct, retPct, status: "Draf", date: todayISO(), branch: branchOfProject(String(wo.project ?? "")),
    }, { action: "mengajukan termin", module: "Subkontraktor" });
    toast(S.tTermFiled.replace("{n}", created.id));
    setShowTerm(false);
    setTermForm({ sub: "", wo: "", milestone: "", amount: "", pphPct: "0.5", retPct: "5" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const stepTerm = async (p: StoreItem, next: string) => {
    if (next === "Lunas") {
      setTermPay(p);
      setProof({ date: todayISO(), method: "Transfer", ref: "" });
      setWithholdingRef("");
      setTermDirCheck(false);
      setTermDirName("");
      return;
    }
    if (next === "Ditolak") {
      setRejectTerm(p);
      return;
    }
    try {
    await update("termins", p.id, { status: next });
    toast(S.movedTo.replace("{a}", p.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmBuktiTerm = async () => {
    if (!termPay) return;
    if (!proof.date) { toast(S.tPayDateRequired, "info"); return; }
    if (!proof.ref.trim()) { toast(S.tRefRequired, "info"); return; }
    // Termin di atas ambang APPROVE_TERMIN wajib persetujuan Director (checkbox + nama).
    if (needsTermDirector(termPay) && (!termDirCheck || !termDirName.trim())) {
      toast(S.tDirectorRequired.replace("{n}", fmtRupiah(terminThreshold)), "info");
      return;
    }
    const termId = termPay.id;
    const prevStatus = String(termPay.status ?? "");
    try {
    // PPh variatif RawData (cth PAK YUSUF 0.5%): potong saat bayar + simpan bukti potong.
    const pphAmt = Math.round(Number(termPay.amount || 0) * pphOf(termPay, pphDefault) / 100);
    const retAmt = Math.round(Number(termPay.amount || 0) * retOf(termPay) / 100);
    const wo = workOrders.find((w) => w.id === termPay.woId);
    const penalty = Math.max(0, Math.round(Number(wo?.penaltyAmount || 0)));
    const netoPayable = Math.max(0, Math.round(netoOf(termPay, pphDefault)) - penalty);
    await update("termins", termPay.id, {
      status: "Lunas", paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim(),
      pphAmt, retAmt, penaltyApplied: penalty, withholdingRef: withholdingRef.trim(),
      ...(needsTermDirector(termPay) ? { directorApproved: termDirName.trim() } : {}),
    });
    // Termin Lunas → hutang usaha: 1 baris neto (Belum Dibayar, denda mengurangi neto)
    // + 1 baris retensi (Ditahan, dirilis setelah WO Selesai). Idempoten: baca ulang
    // payables segar lalu cocokkan po PERSIS dengan yang akan ditulis; sudah ada →
    // toast info + lewati. Gagal catat setelah Lunas → kompensasi status semula.
    const poNeto = `TERM-${termPay.id}`;
    const poRet = `TERM-${termPay.id}-R`;
    const vesselProj = String(wo?.project ?? "");
    try {
    const existingPo = new Set((await freshPayables(data.payables ?? [])).map((a) => String(a.po ?? "")));
    if (!existingPo.has(poNeto)) {
      await add("payables", {
        v: String(termPay.sub ?? ""), kodePembantu: String(termPay.sub ?? ""),
        po: poNeto, openAwal: 0, amt: netoPayable,
        due: proof.date, pph: `${pphOf(termPay, pphDefault)}%`, st: "Belum Dibayar",
        vessel: vesselProj, project: vesselProj, branch: branchOfProject(vesselProj),
        item: String(termPay.milestone ?? termPay.progress ?? ""),
        pay1: 0, pay2: 0,
        note: `Termin ${termPay.id} neto; PPh ${fmtRupiah(pphAmt)}; retensi ${fmtRupiah(retAmt)} ditahan; denda ${fmtRupiah(penalty)}`,
        terminId: termPay.id,
      }, { action: "mencatat hutang termin", module: "Subkontraktor" });
    } else {
      toast(locale === "en" ? `Payable ${poNeto} already exists - skipping duplicate entry` : `Hutang ${poNeto} sudah ada - lewati pencatatan ganda`, "info");
    }
    if (retAmt > 0 && !existingPo.has(poRet)) {
      await add("payables", {
        v: String(termPay.sub ?? ""), kodePembantu: String(termPay.sub ?? ""),
        po: poRet, openAwal: 0, amt: retAmt,
        due: proof.date, pph: `${pphOf(termPay, pphDefault)}%`, st: "Ditahan",
        vessel: vesselProj, project: vesselProj, branch: branchOfProject(vesselProj),
        item: `Retensi ${termPay.milestone ?? termPay.id}`,
        pay1: 0, pay2: 0,
        note: `Retensi termin ${termPay.id} - rilis setelah WO Selesai`,
        terminId: termPay.id,
      }, { action: "menahan retensi termin", module: "Subkontraktor" });
    } else if (retAmt > 0) {
      toast(locale === "en" ? `Payable ${poRet} already exists - skipping duplicate entry` : `Hutang ${poRet} sudah ada - lewati pencatatan ganda`, "info");
    }
    } catch (payErr) {
      // Kompensasi atomik: kembalikan termin ke status + bukti semula agar tak
      // tertinggal Lunas tanpa hutang. Modal dibiarkan terbuka agar bisa coba lagi.
      let reverted = false;
      try {
        await update("termins", termId, {
          status: prevStatus,
          paidAt: termPay.paidAt, paidMethod: termPay.paidMethod, paidRef: termPay.paidRef,
          pphAmt: termPay.pphAmt, retAmt: termPay.retAmt, penaltyApplied: termPay.penaltyApplied,
          withholdingRef: termPay.withholdingRef,
          ...(needsTermDirector(termPay) ? { directorApproved: termPay.directorApproved } : {}),
        });
        reverted = true;
      } catch {
        /* kompensasi gagal - sampaikan eksplisit di toast */
      }
      const cause = payErr instanceof Error ? payErr.message : S.saveFail;
      toast(locale === "en"
        ? `Failed to record payable for term ${termId} (${cause}) - status ${reverted ? `reverted to ${prevStatus || "previous"}` : "NOT reverted, check manually"}`
        : `Hutang termin ${termId} gagal dicatat (${cause}) - status ${reverted ? `dikembalikan ke ${prevStatus || "semula"}` : "GAGAL dikembalikan, periksa manual"}`, "info");
      return;
    }
    /* Sinkron dua arah termin→WO: milestone yang Lunas menandai milestone WO selesai. */
    if (termPay.woId && termPay.milestone) {
      const wo = workOrders.find((w) => w.id === termPay.woId);
      const tSub = subcontractors.find((s) => sameName(s.name, String(termPay.sub ?? "")));
      const tMs = tSub ? milestonesOf(tSub).find((m) => m.title === String(termPay.milestone)) : undefined;
      if (wo && tMs && !doneMsOf(wo).includes(tMs.title)) {
        const done = [...doneMsOf(wo), tMs.title];
        const v = Math.min(100, milestonesOf(tSub as StoreItem).filter((m) => done.includes(m.title)).reduce((s, m) => s + Number(m.pct || 0), 0));
        await update("workOrders", wo.id, { doneMs: done, progress: v, status: v >= 100 ? "Selesai" : "Dalam Proses" });
      }
    }
    log("melunasi termin", `${termPay.id} via ${proof.method} ${proof.ref.trim()} · PPh ${pphOf(termPay, pphDefault)}% = ${fmtRupiah(pphAmt)} · hutang ${poNeto} ${fmtRupiah(netoPayable)}${retAmt > 0 ? ` + retensi ${fmtRupiah(retAmt)} ditahan` : ""}`, "Subkontraktor");
    toast(S.tTermPaid.replace("{a}", termPay.id).replace("{b}", fmtRupiah(pphAmt)).replace("{c}", fmtRupiah(netoPayable)));
    setTermPay(null);
    setWithholdingRef("");
    setTermDirCheck(false);
    setTermDirName("");
    } catch {
      toast(S.tPayStuck.replace("{n}", termId), "info");
    }
  };

  const confirmRelease = async () => {
    if (!releaseTerm) return;
    const wo = workOrders.find((w) => w.id === releaseTerm.woId);
    if (!wo || wo.status !== "Selesai") { toast(S.tReleaseNeedDone, "info"); return; }
    if (!releaseForm.date) { toast(S.tReleaseDateRequired, "info"); return; }
    if (!releaseForm.ba.trim()) { toast(S.tBaRequired, "info"); return; }
    const relId = releaseTerm.id;
    try {
      await update("termins", releaseTerm.id, {
      status: "Retensi Released", releasedAt: releaseForm.date, releaseBA: releaseForm.ba.trim(),
    });
    // Baris retensi Ditahan → Belum Dibayar agar bisa dibayar via hutang usaha.
    const poRet = `TERM-${releaseTerm.id}-R`;
    const held = (data.payables ?? []).find((a) => String(a.po ?? "") === poRet && String(a.st ?? "") === "Ditahan");
    if (held) {
      await update("payables", held.id, { st: "Belum Dibayar" });
      log("merilis retensi hutang", `${held.id} (${poRet}) → Belum Dibayar`, "Subkontraktor");
    }
    log("merilis retensi", `${releaseTerm.id} · BA ${releaseForm.ba.trim()} · ${fmtTanggal(releaseForm.date)}`, "Subkontraktor");
    toast(S.tReleased.replace("{n}", releaseTerm.id) + (held ? S.tReleasedDebt : ""));
    setReleaseTerm(null);
    setReleaseForm({ date: todayISO(), ba: "" });
    } catch {
      toast(S.tReleaseStuck.replace("{n}", relId), "info");
    }
  };

  const saveTimesheet = async () => {
    try {
    if (!tsForm.wo || !tsForm.employee || !tsForm.date) { toast(S.tTsFieldsRequired, "info"); return; }
    const hours = Number(tsForm.hours);
    if (!Number.isFinite(hours) || hours <= 0) { toast(S.tHoursPositive, "info"); return; }
    const wo = workOrders.find((w) => w.id === tsForm.wo);
    const projectId = String(wo?.project ?? "");
    const rate = Number(wo?.rate || 0);
    const created = await add("timesheets", {
      woId: tsForm.wo, employeeId: tsForm.employee, date: tsForm.date, hours, note: tsForm.note.trim(),
      projectId, rate, cost: Math.round(hours * rate), status: "Diajukan",
      branch: branchOfEmployee(tsForm.employee),
    }, { action: "mencatat timesheet", module: "Subkontraktor" });
    toast(S.tTsLogged.replace("{a}", created.id).replace("{b}", String(hours)));
    setShowTs(false);
    setTsForm({ wo: "", employee: "", date: todayISO(), hours: "", note: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const approveTimesheet = async (t: StoreItem) => {
    try {
    await update("timesheets", t.id, { status: "Disetujui" });
    log("menyetujui timesheet", `${t.id} · ${t.hours} jam`, "Subkontraktor");
    toast(S.tTsApproved.replace("{n}", t.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveRate = async () => {
    try {
    if (!rateForm.wo) { toast(S.tPickWoFirst, "info"); return; }
    const rate = Number(rateForm.rate);
    if (!Number.isFinite(rate) || rate < 0) { toast(S.tRateInvalid, "info"); return; }
    await update("workOrders", rateForm.wo, { rate });
    log("menetapkan rate WO", `${rateForm.wo} · ${fmtRupiah(rate)}/jam`, "Subkontraktor");
    toast(S.tRateSaved.replace("{n}", rateForm.wo));
    setRateForm({ wo: "", rate: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  return (
    <div>
      <PageHeader
        title={S.scTitle}
        subtitle={S.scSubtitle}
        icon={<HardHat className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowSub(true)}><Plus className="h-4 w-4" /> {S.regSubBtn}</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiActiveSubs} value={String(subcontractors.filter((s) => s.status === "Aktif").length)} icon={<HardHat className="h-5 w-5" />} chip="navy" spark={subActiveTrend} hint={S.kpiActiveSubsHint} />
        <KpiCard label={S.kpiActiveContracts} value={fmtMiliar(subcontractors.reduce((s, x) => s + Number(x.contract || 0), 0))} icon={<FileSignature className="h-5 w-5" />} chip="teal" spark={subContractTrend} />
        <KpiCard label={S.kpiRunningWo} value={String(runningWo)} hint={S.kpiRunningWoHint} icon={<HardHat className="h-5 w-5" />} chip="amber" spark={woTrend} />
        <KpiCard label={S.kpiAvgRating} value={`${avgRating}%`} delta={S.kpiRatingDelta} deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" spark={ratingTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Subkontraktor", "Work Order", "Termin & Pembayaran", "Timesheet", "Kepatuhan K3"]} active={tab} onChange={setTab} labels={{ Subkontraktor: S.tabSub, "Work Order": S.tabWo, "Termin & Pembayaran": S.tabTermin, Timesheet: S.tabTimesheet, "Kepatuhan K3": S.tabK3 }} />
        <div className="p-4">
          {tab === "Subkontraktor" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title={S.evalTitle} subtitle={S.evalSub} />
                <div className="h-52 p-4 pt-0 sm:h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={evalChart} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#8aa2b6" axisLine={false} tickLine={false} interval={0} />
                      <YAxis domain={[0, 100]} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}`} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 5" label={{ value: "Target 80", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                      <Bar dataKey="rating" name={locale === "en" ? "Actual rating" : "Rating aktual"} fill="#0b3a63" radius={[3, 3, 0, 0]} barSize={16} onClick={(d) => { const pl = (d as unknown as { payload?: { full?: string; rating?: number; k3?: number } }).payload; if (pl?.full) toast(`${pl.full} — rating ${pl.rating}, K3 ${pl.k3}`); }} style={{ cursor: "pointer" }} />
                      <Bar dataKey="k3" name="K3" fill="#f59e0b" radius={[3, 3, 0, 0]} barSize={16} onClick={(d) => { const pl = (d as unknown as { payload?: { full?: string; rating?: number; k3?: number } }).payload; if (pl?.full) toast(`${pl.full} — rating ${pl.rating}, K3 ${pl.k3}`); }} style={{ cursor: "pointer" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full" placeholder={S.subSearchPh} aria-label={S.subSearchAria} value={subQ} onChange={(e) => setSubQ(e.target.value)} />
                </div>
                <FilterPopover
                  activeCount={[subStatus !== "Semua", typeFilter !== "Semua"].filter(Boolean).length}
                  initial={{ status: subStatus, tipe: typeFilter }}
                  onReset={() => { setSubQ(""); setSubStatus("Semua"); setTypeFilter("Semua"); }}
                  onApply={(d) => { setSubStatus(d.status); setTypeFilter(d.tipe); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.statusLabel}>
                        <select className="input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {["Semua", "Aktif", "Kualifikasi", "Blacklist"].map((s) => <option key={s} value={s}>{s === "Semua" ? S.allStatus : s}</option>)}
                        </select>
                      </Field>
                      <Field label={S.contractTypeLabel}>
                        <select className="input w-full" value={draft.tipe} onChange={(e) => setDraft({ ...draft, tipe: e.target.value })}>
                          {["Semua", ...CONTRACT_TYPES].map((t) => <option key={t} value={t}>{t === "Semua" ? S.allTypes : t}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                </FilterPopover>
                {(subQ.trim() !== "" || subStatus !== "Semua" || typeFilter !== "Semua") && (
                  <span className="text-xs text-steel-400">
                    {S.subFilterActive.replace("{n}", String(filteredSubs.length))}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSubs.map((s) => (
                <Card key={s.id} className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900 truncate" title={String(s.name)}>{s.name}</p>
                      <p className="text-xs text-steel-500 truncate" title={String(s.services)}>{s.services}</p>
                    </div>
                    <Badge tone={toneMap[normSub(s.status)] ?? "gray"}>{normSub(s.status)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="navy">{s.contractType ?? "Borongan"}</Badge>
                    <Badge tone="gray">{S.schemeLabel.replace("{n}", String(s.payScheme ?? "unit"))}</Badge>
                    {(() => {
                      const left = daysUntil(String(s.bgExpiry ?? ""));
                      if (!s.bgExpiry) return <Badge tone="gray">{S.noBg}</Badge>;
                      if (left === null) return null;
                      if (left < 0) return <Badge tone="red">{S.bgExpired}</Badge>;
                      if (left <= 30) return <Badge tone="amber">{S.bgCountdown.replace("{n}", String(left))}</Badge>;
                      return <Badge tone="green">{S.bgSafe}</Badge>;
                    })()}
                    <Badge tone="teal">{S.msCount.replace("{n}", String(milestonesOf(s).length))}</Badge>
                  </div>
                  {s.noBG ? (
                    <p className="mt-1.5 text-xs text-steel-500">BG {s.noBG} · {fmtRupiah(Number(s.bgValue || 0))}{s.bgExpiry ? ` · exp ${fmtTanggal(String(s.bgExpiry))}` : ""}</p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">{S.scRatingLabel}</p>
                      <p className="font-semibold text-navy-900">{s.rating}%</p>
                    </div>
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">{S.scK3Label}</p>
                      <p className="font-semibold text-navy-900">{s.k3}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-steel-500">
                    <span>{S.contractLabel} {fmtMiliar(s.contract)}</span>
                    <span>{S.woActiveCount.replace("{n}", String(workOrders.filter((w) => sameName(w.sub, s.name) && w.status !== "Selesai").length))}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-steel-100 pt-3">
                    <button
                      className="btn-secondary text-xs"
                      aria-label={S.manageMsAria.replace("{n}", String(s.name))}
                      onClick={() => { setMsSub(s); setMsForm({ title: "", pct: "", due: "" }); }}
                    >
                      {S.msSowBtn}
                    </button>
                    {SUB_NEXT[normSub(s.status)].map((next) => (
                      <button
                        key={next}
                        className="btn-secondary text-xs"
                        aria-label={S.changeStatusAria.replace("{a}", String(s.name)).replace("{b}", next)}
                        onClick={() => setSubConfirm({ id: s.id, name: s.name, next })}
                      >
                        {S.toNextBtn.replace("{n}", next)}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
              </div>
            </div>
          )}

          {tab === "Work Order" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowWo(true)}><Plus className="h-3.5 w-3.5" /> {S.issueWoBtn}</button>
              </div>
              <div className="space-y-3">
                {woPager.slice(workOrders).map((w) => (
                  <Card key={w.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="font-mono text-sm font-semibold text-navy-900 shrink-0">{w.id}</div>
                        <div className="min-w-0 text-sm text-steel-600">
                          <p className="truncate" title={`${w.sub} · ${w.project}`}>{w.sub} · {w.project}</p>
                          <p className="text-xs text-steel-500 truncate" title={String(w.scope)}>{w.scope}</p>
                          {w.date && <p className="text-xs text-steel-400">{fmtTanggal(w.date)}</p>}
                          {w.targetDate && <p className="text-xs text-steel-500">{S.targetPenalty.replace("{a}", fmtTanggal(String(w.targetDate))).replace("{b}", String(Number(w.penaltyPct || 0)))}</p>}
                          {Number(w.rate || 0) > 0 && <p className="text-xs text-steel-500">{S.ratePerHour.replace("{n}", fmtRupiah(Number(w.rate)))}</p>}
                          {(() => {
                            if (Number(w.progress || 0) >= 100 || !w.targetDate) return null;
                            const late = daysLate(String(w.targetDate));
                            if (late <= 0) return null;
                            const sub = subcontractors.find((s) => s.name === w.sub);
                            const base = Number(sub?.contract || 0);
                            const perDay = Number(w.penaltyPct || 0);
                            const usulan = Math.min(base * perDay / 100 * late, base * 5 / 100);
                            return (
                              <p className="text-xs font-medium text-rose-600">
                                {S.latePenalty.replace("{a}", String(late)).replace("{b}", fmtRupiah(Math.round(usulan)))}
                                {w.penaltyAt ? S.penaltyLogged.replace("{n}", fmtTanggal(String(w.penaltyAt))) : ""}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={effProgress(w)} className="w-24" tone={w.status === "Selesai" ? "green" : "navy"} />
                          <span className="text-xs font-medium">{effProgress(w)}%</span>
                        </div>
                        <Badge tone={toneMap[w.status] ?? "gray"}>{w.status}</Badge>
                        {w.status !== "Selesai" && (
                          <button className="btn-secondary text-xs" aria-label={S.updateProgAria.replace("{n}", w.id)} onClick={() => { setWoProg(w); setProgMs(doneMsOf(w)); setProgNote(""); }}>{S.updateBtn}</button>
                        )}
                        {w.status !== "Selesai" && (
                          <button className="btn-secondary text-xs" aria-label={`${locale === "en" ? "Edit" : "Ubah"} ${w.id}`} onClick={() => openWoEdit(w)}>{locale === "en" ? "Edit" : "Ubah"}</button>
                        )}
                        {Number(w.progress || 0) < 100 && w.targetDate && daysLate(String(w.targetDate)) > 0 && !w.penaltyAt && (
                          <button className="btn-secondary text-xs" aria-label={S.logPenaltyAria.replace("{n}", w.id)} onClick={() => recordPenalty(w)}>{S.logPenaltyBtn}</button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
                {workOrders.length === 0 && <p className="py-6 text-center text-sm text-steel-400">{S.emptyWo}</p>}
                {woPager.bar}
              </div>
            </div>
          )}

          {tab === "Termin & Pembayaran" && (
            <div>
              <div className="mb-3 rounded-xl bg-surface p-2.5">
                <FlowStrip steps={["Draf", "Diajukan", "Disetujui", "Lunas", "Retensi Released"]} current={furthestTermin} ariaLabel={locale === "en" ? "Termin flow" : "Alur termin"} />
                <p className="mt-1.5 text-[11px] text-steel-500">
                  {locale === "en"
                    ? "Flow: Draft → Proposed → Approved → Paid → Retention Released (Rejected branches off)."
                    : "Alur: Draf → Diajukan → Disetujui → Lunas → Retensi Released (Ditolak di luar alur)."}
                </p>
              </div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowTerm(true)}><Plus className="h-3.5 w-3.5" /> {S.proposeTerminBtn}</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label={S.sortTermin} sortKey="termin" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortSub} sortKey="sub" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortWoProg} sortKey="wo" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortValue} sortKey="nilai" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortPph} sortKey="pph" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortRetensi} sortKey="retensi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortNeto} sortKey="neto" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.dateLabel} sortKey="tanggal" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.actionLabel}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(payments, sort, (p, key) =>
                      key === "termin" ? String(p.id ?? "") : key === "sub" ? String(p.sub ?? "") : key === "wo" ? String(p.woId ?? p.progress ?? "") : key === "nilai" ? Number(p.amount ?? 0) : key === "pph" ? Number(p.amount ?? 0) * pphOf(p, pphDefault) / 100 : key === "retensi" ? Number(p.amount ?? 0) * retOf(p) / 100 : key === "neto" ? netoOf(p, pphDefault) : key === "tanggal" ? String(p.date ?? "") : String(p.status ?? "")
                    ).map((p) => {
                      const wo = workOrders.find((w) => w.id === p.woId);
                      const canRelease = normTerm(p.status) === "Lunas" && retOf(p) > 0 && wo?.status === "Selesai";
                      return (
                      <tr key={p.id} id={notifRowId(String(p.id))} className={flash.flashId === String(p.id) ? "notif-hl notif-flash hover:bg-surface" : (notified.has(String(p.id)) ? "notif-hl hover:bg-surface" : "hover:bg-surface")}>
                        <td className="td font-mono font-medium text-navy-900">{p.id}</td>
                        <td className="td text-steel-600 truncate" title={String(p.sub)}>{p.sub}</td>
                        <td className="td font-mono text-xs text-steel-500">{p.progress}{p.milestone ? <span className="block text-steel-400">{S.msPrefix.replace("{n}", String(p.milestone))}</span> : null}</td>
                        <td className="td font-semibold">{fmtMiliar(p.amount)}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.amount || 0) * pphOf(p, pphDefault) / 100)} <span className="text-xs text-steel-400">({pphOf(p, pphDefault)}%)</span></td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.amount || 0) * retOf(p) / 100)} <span className="text-xs text-steel-400">({retOf(p)}%)</span></td>
                        <td className="td font-semibold text-emerald-600">{fmtRupiah(netoOf(p, pphDefault))}</td>
                        <td className="td text-steel-600">{fmtTanggal(p.date)}</td>
                        <td className="td">
                          <Badge tone={toneMap[normTerm(p.status)] ?? "gray"}>{normTerm(p.status)}</Badge>
                          {(() => {
                            const docs = [
                              { label: "Invoice", done: Boolean(p.invoiceNo ?? p.withholdingRef) },
                              { label: "BAST", done: Boolean(p.bastNo ?? p.releaseBA) },
                              { label: "Bukti bayar", done: Boolean(p.paymentRef ?? p.paidRef ?? p.paidAt) },
                            ];
                            const allDone = docs.every((d) => d.done);
                            const terminal = normTerm(String(p.status)) === "Lunas" || String(p.status) === "Retensi Released";
                            return (
                              <div className="mt-1 space-y-0.5">
                                {docs.map((d) => (
                                  <p key={d.label} className="text-[11px] text-steel-500">{d.done ? "✓" : "○"} {d.label}</p>
                                ))}
                                {!allDone && !terminal && (
                                  <p className="text-[11px] text-steel-400">Lengkapi Invoice + BAST + Bukti bayar untuk ke status berikutnya</p>
                                )}
                              </div>
                            );
                          })()}
                          {p.status === "Retensi Released" && p.releasedAt && <p className="mt-1 text-xs text-steel-500">{S.baInfo.replace("{a}", String(p.releaseBA)).replace("{b}", fmtTanggal(p.releasedAt))}</p>}
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {termNext(p.status).map((next) => (
                              <button
                                key={next}
                                className={next === "Lunas" ? "btn-primary text-xs" : "btn-secondary text-xs"}
                                aria-label={S.stepAria.replace("{a}", next).replace("{b}", p.id)}
                                onClick={() => stepTerm(p, next)}
                              >
                                {next === "Lunas" ? S.payBtn : next === "Diajukan" ? S.proposeBtn : next}
                              </button>
                            ))}
                            {canRelease && (
                              <button className="btn-primary text-xs" aria-label={S.releaseRetAria.replace("{n}", p.id)} onClick={() => { setReleaseTerm(p); setReleaseForm({ date: todayISO(), ba: "" }); }}>
                                {S.releaseRetBtn}
                              </button>
                            )}
                            {normTerm(String(p.status)) === "Draf" && (
                              <button className="btn-secondary text-xs" aria-label={`${locale === "en" ? "Edit" : "Ubah"} ${p.id}`} onClick={() => openTermEdit(p)}>
                                {locale === "en" ? "Edit" : "Ubah"}
                              </button>
                            )}
                            {termNext(p.status).length === 0 && !canRelease && <span className="text-xs text-steel-400">-</span>}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Timesheet" && (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-secondary text-xs" onClick={() => setShowTs(true)}><Plus className="h-3.5 w-3.5" /> {S.logTsBtn}</button>
              </div>
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">{S.recapWoTitle}</h3>
                <div className="mt-2 space-y-2">
                  {workOrders.map((w) => {
                    const hours = hoursByWo(w.id);
                    const sub = subcontractors.find((s) => s.name === w.sub);
                    const scheme = String(sub?.payScheme ?? "unit");
                    const rate = Number(w.rate || 0);
                    const usulan = (scheme === "harian" || scheme === "jam") && rate > 0 ? hours * rate : 0;
                    return (
                      <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                        <div>
                          <p className="font-mono font-medium text-navy-900">{w.id} <span className="font-sans text-xs text-steel-500">· {w.sub}</span></p>
                          <p className="text-xs text-steel-500">{S.woHoursScheme.replace("{a}", String(hours)).replace("{b}", scheme)}{rate > 0 ? S.rateAutoSuffix.replace("{n}", fmtRupiah(rate)) : ""}</p>
                        </div>
                        {usulan > 0 && <Badge tone="teal">{S.proposeTerminBadge.replace("{n}", fmtRupiah(usulan))}</Badge>}
                      </div>
                    );
                  })}
                  {workOrders.length === 0 && <p className="text-xs text-steel-400">{S.emptyWo}</p>}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-steel-100 pt-3">
                  <Field label={S.woRateLabel}>
                    <select className="input" value={rateForm.wo} onChange={(e) => setRateForm({ ...rateForm, wo: e.target.value })}>
                      <option value="">{S.pickWoOpt}</option>
                      {workOrders.map((w) => <option key={w.id} value={w.id}>{w.id} ({w.sub})</option>)}
                    </select>
                  </Field>
                  <Field label={S.rateLabel}>
                    <NumInput min={0} className="input" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })} placeholder={S.ratePh} />
                  </Field>
                  <button className="btn-secondary text-xs" onClick={saveRate}>{S.saveRateBtn}</button>
                </div>
              </Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label={S.sortId} sortKey="id" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.sortWo} sortKey="wo" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.projectLabel} sortKey="proyek" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.employeeLabel} sortKey="karyawan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.dateLabel} sortKey="tanggal" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.sortHours} sortKey="jam" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.sortCost} sortKey="biaya" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.sortStatus} sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.sortNote} sortKey="catatan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">{S.actionLabel}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(timesheets, sort2, (t, key) =>
                      key === "id" ? String(t.id ?? "") : key === "wo" ? String(t.woId ?? "") : key === "proyek" ? String(t.projectId ?? workOrders.find((w) => w.id === t.woId)?.project ?? "") : key === "karyawan" ? String(t.employeeId ?? "") : key === "tanggal" ? String(t.date ?? "") : key === "jam" ? Number(t.hours ?? 0) : key === "biaya" ? Number(t.cost ?? Number(t.hours || 0) * Number(workOrders.find((w) => w.id === t.woId)?.rate || 0)) : key === "status" ? String(t.status ?? "Diajukan") : String(t.note ?? "")
                    ).map((t) => (
                      <tr key={t.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{t.id}</td>
                        <td className="td font-mono text-xs text-steel-600">{t.woId}</td>
                        <td className="td font-mono text-xs text-steel-600">{t.projectId ?? workOrders.find((w) => w.id === t.woId)?.project ?? "-"}</td>
                        <td className="td text-steel-600 text-xs">{t.employeeId}</td>
                        <td className="td text-steel-600">{fmtTanggal(t.date)}</td>
                        <td className="td font-semibold">{S.hoursSuffix.replace("{n}", String(t.hours))}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(t.cost ?? Number(t.hours || 0) * Number(workOrders.find((w) => w.id === t.woId)?.rate || t.rate || 0)))}</td>
                        <td className="td"><Badge tone={String(t.status ?? "Diajukan") === "Disetujui" ? "green" : "amber"}>{t.status ?? "Diajukan"}</Badge></td>
                        <td className="td text-steel-600 text-xs">{t.note ?? "-"}</td>
                        <td className="td">
                          {String(t.status ?? "Diajukan") !== "Disetujui"
                            ? <button className="btn-primary text-xs" aria-label={S.approveAria.replace("{n}", t.id)} onClick={() => approveTimesheet(t)}>{S.approveBtn}</button>
                            : <span className="text-xs text-steel-400">-</span>}
                        </td>
                      </tr>
                    ))}
                    {timesheets.length === 0 && <tr><td colSpan={10} className="td text-center text-steel-400">{S.emptyTs}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Kepatuhan K3" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-surface p-2.5">
                <FlowStrip steps={["Kualifikasi", "Aktif"]} current="Aktif" ariaLabel={locale === "en" ? "Compliance flow" : "Alur kepatuhan"} />
                <p className="mt-1.5 text-[11px] text-steel-500">
                  {locale === "en"
                    ? "Flow: Qualification → Active (Blacklisted is off-flow, needs coaching). Per-card strip shows each sub's position."
                    : "Alur: Kualifikasi → Aktif (Blacklist di luar alur, perlu pembinaan). Strip per kartu menunjukkan posisi tiap subkontraktor."}
                </p>
              </div>
              {subcontractors.map((s) => {
                const list = incidentsOfSub(s.name);
                const comp = complianceOf(s.k3);
                return (
                  <Card key={s.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-navy-900">{s.name}</p>
                        <p className="text-xs text-steel-500 mt-0.5">{S.k3WoRating.replace("{a}", String(woOfSub(s.name).length)).replace("{b}", String(s.k3))}</p>
                      </div>
                      <Badge tone={comp.tone}>{comp.label} · {list.length} insiden</Badge>
                    </div>
                    <div className="mt-2">
                      {normSub(s.status) === "Blacklist" ? (
                        <p className="text-xs text-steel-500">
                          <Badge tone="red">Blacklist</Badge> <span className="ml-1">{locale === "en" ? "off-flow — coaching required" : "di luar alur — perlu pembinaan"}</span>
                        </p>
                      ) : (
                        <FlowStrip steps={["Kualifikasi", "Aktif"]} current={normSub(s.status)} ariaLabel={locale === "en" ? "Subcontractor status" : "Status subkontraktor"} />
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {list.map((i) => (
                        <p key={i.id} className="text-xs text-steel-600">{i.id} · {i.type} · {fmtTanggal(i.date)} · {i.location} - {i.desc}</p>
                      ))}
                      {list.length === 0 && <p className="text-xs text-steel-400">{S.emptyIncident}</p>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal registrasi */}
      <Modal open={showSub} onClose={() => setShowSub(false)} title={S.regTitle} subtitle={S.regSub2}
        footer={<><button className="btn-secondary" onClick={() => setShowSub(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveSub}>{S.regConfirmBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.companyNameLabel}><input className="input" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} placeholder={S.companyNamePh} /></Field>
          <Field label={S.servicesLabel}><input className="input" value={subForm.services} onChange={(e) => setSubForm({ ...subForm, services: e.target.value })} placeholder={S.servicesPh} /></Field>
          <FormGrid>
            <Field label={S.contractAmountLabel}><NumInput min={0} className="input" value={subForm.contract} onChange={(e) => setSubForm({ ...subForm, contract: e.target.value })} /></Field>
            <Field label={S.k3RatingLabel}>
              <select className="input" value={subForm.k3} onChange={(e) => setSubForm({ ...subForm, k3: e.target.value })}>
                {["A+", "A", "B+", "B", "C"].map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label={S.contractTypeLabel}>
              <select className="input" value={subForm.contractType} onChange={(e) => setSubForm({ ...subForm, contractType: e.target.value })}>
                {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.paySchemeLabel}>
              <select className="input" value={subForm.payScheme} onChange={(e) => setSubForm({ ...subForm, payScheme: e.target.value })}>
                {PAY_SCHEMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.bgNoLabel}><input className="input font-mono" value={subForm.noBG} onChange={(e) => setSubForm({ ...subForm, noBG: e.target.value })} placeholder={S.bgNoPh} /></Field>
            <Field label={S.bgExpiryLabel}><input type="date" className="input" value={subForm.bgExpiry} onChange={(e) => setSubForm({ ...subForm, bgExpiry: e.target.value })} /></Field>
            <Field label={S.bgValueLabel}><NumInput min={0} className="input" value={subForm.bgValue} onChange={(e) => setSubForm({ ...subForm, bgValue: e.target.value })} placeholder={S.bgValuePh} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal kelola milestone SOW */}
      <Modal open={msSub !== null} onClose={() => setMsSub(null)} title={S.msTitle.replace("{n}", msSub?.name ?? "")} subtitle={S.msSub}
        footer={<button className="btn-secondary" onClick={() => setMsSub(null)}>{S.closeBtn}</button>}>
        <div className="space-y-3">
          <div className="space-y-2">
            {msSub && milestonesOf(msSub).map((m, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-navy-900">{m.title}</p>
                  <p className="text-xs text-steel-500">{S.msMeta.replace("{a}", String(m.pct)).replace("{b}", fmtTanggal(m.due)).replace("{c}", fmtRupiah(Number(msSub.contract || 0) * Number(m.pct || 0) / 100))}</p>
                </div>
                <button className="btn-secondary text-xs" onClick={() => removeMilestone(idx)}>{S.deleteBtn}</button>
              </div>
            ))}
            {(!msSub || milestonesOf(msSub).length === 0) && <p className="text-xs text-steel-400">{S.emptyMs}</p>}
          </div>
          <FormGrid>
            <Field label={S.msNameLabel}><input className="input" value={msForm.title} onChange={(e) => setMsForm({ ...msForm, title: e.target.value })} placeholder={S.msNamePh} /></Field>
            <Field label={S.weightLabel}><NumInput min={0} max={100} className="input" value={msForm.pct} onChange={(e) => setMsForm({ ...msForm, pct: e.target.value })} placeholder={S.weightPh} /></Field>
            <Field label={S.dueLabel}><input type="date" className="input" value={msForm.due} onChange={(e) => setMsForm({ ...msForm, due: e.target.value })} /></Field>
          </FormGrid>
          <button className="btn-primary text-xs" onClick={saveMilestone}><Plus className="h-3.5 w-3.5" /> {S.addMsBtn}</button>
        </div>
      </Modal>

      {/* Konfirmasi status subkontraktor */}
      <ConfirmModal
        open={subConfirm !== null}
        title={S.subStatusTitle.replace("{a}", subConfirm?.name ?? "").replace("{b}", subConfirm?.next ?? "")}
        desc={S.subStatusDesc}
        confirmLabel={S.confirmChangeBtn}
        onCancel={() => setSubConfirm(null)}
        onConfirm={async () => { try { if (subConfirm) { await update("subcontractors", subConfirm.id, { status: subConfirm.next }); toast(S.movedTo.replace("{a}", subConfirm.name).replace("{b}", subConfirm.next)); } setSubConfirm(null); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } }}
      />

      {/* Modal WO */}
      <Modal open={showWo} onClose={() => setShowWo(false)} title={S.issueWoTitle}
        footer={<><button className="btn-secondary" onClick={() => setShowWo(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveWo}>{S.issueWoConfirm}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.tabSub}>
              <select className="input" value={woForm.sub} onChange={(e) => setWoForm({ ...woForm, sub: e.target.value })}>
                <option value="">{S.pickOpt}</option>
                {subcontractors.filter((s) => s.status === "Aktif").map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label={S.projectLabel}>
              <select className="input" value={woForm.project} onChange={(e) => setWoForm({ ...woForm, project: e.target.value })}>
                <option value="">{S.pickOpt}</option>
                {projectOptions.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.scopeJobLabel}><input className="input" value={woForm.scope} onChange={(e) => setWoForm({ ...woForm, scope: e.target.value })} placeholder={S.scopeJobPh} /></Field>
          <FormGrid>
            <Field label={S.targetDoneLabel}><input type="date" className="input" value={woForm.targetDate} onChange={(e) => setWoForm({ ...woForm, targetDate: e.target.value })} /></Field>
            <Field label={S.penaltyLabel} hint={S.penaltyHint}><NumInput min={0} max={5} step={0.1} className="input" value={woForm.penaltyPct} onChange={(e) => setWoForm({ ...woForm, penaltyPct: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal ubah WO (scope + target) */}
      <Modal open={woEdit !== null} onClose={() => setWoEdit(null)} title={woEdit ? `${locale === "en" ? "Edit WO" : "Ubah WO"} ${woEdit.id}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setWoEdit(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveWoEdit}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.scopeJobLabel}><input className="input" value={woEditForm.scope} onChange={(e) => setWoEditForm({ ...woEditForm, scope: e.target.value })} placeholder={S.scopeJobPh} /></Field>
          <Field label={S.targetDoneLabel}><input type="date" className="input" value={woEditForm.targetDate} onChange={(e) => setWoEditForm({ ...woEditForm, targetDate: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal ubah termin Draf (milestone + amount) */}
      <Modal open={termEdit !== null} onClose={() => setTermEdit(null)} title={termEdit ? `${locale === "en" ? "Edit term" : "Ubah termin"} ${termEdit.id}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setTermEdit(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveTermEdit}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.msNameLabel}><input className="input" value={termEditForm.milestone} onChange={(e) => setTermEditForm({ ...termEditForm, milestone: e.target.value })} placeholder={S.pickMsOpt} /></Field>
          <Field label={S.amountLabel}><NumInput min={0} className="input" value={termEditForm.amount} onChange={(e) => setTermEditForm({ ...termEditForm, amount: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal progres WO = checklist milestone termin (sinkron dua arah, tanpa slider) */}
      <Modal open={woProg !== null} onClose={() => setWoProg(null)} title={S.progTitle.replace("{n}", woProg?.id ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setWoProg(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveWoProgress}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          {(() => {
            const sub = woProg ? subcontractors.find((s) => sameName(s.name, String(woProg.sub ?? ""))) : undefined;
            const ms = sub ? milestonesOf(sub) : [];
            if (ms.length === 0) {
              return <p className="text-sm text-steel-500">{locale === "en" ? "No SOW milestones for this subcontractor yet." : "Subkontraktor ini belum punya milestone SOW."}</p>;
            }
            const total = ms.filter((m) => progMs.includes(m.title)).reduce((s, m) => s + Number(m.pct || 0), 0);
            return (
              <>
                <div className="space-y-1.5">
                  {ms.map((m) => {
                    const paid = payments.some((t) => t.woId === woProg?.id && t.milestone === m.title && normTerm(t.status) === "Lunas");
                    return (
                      <label key={m.title} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-steel-100 px-3 py-2 text-sm hover:bg-surface">
                        <input
                          type="checkbox"
                          checked={progMs.includes(m.title)}
                          onChange={(e) => setProgMs((prev) => e.target.checked ? [...prev, m.title] : prev.filter((t) => t !== m.title))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-navy-900">{m.title}</span>
                          <span className="block text-xs text-steel-500">{m.pct}% · due {fmtTanggal(m.due)}{paid ? (locale === "en" ? " · term Paid" : " · termin Lunas") : ""}</span>
                        </span>
                        {paid && <Badge tone="green">Lunas</Badge>}
                      </label>
                    );
                  })}
                </div>
                <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
                  {locale === "en"
                    ? `Progress = sum of completed milestone weights = ${Math.min(100, total)}% (two-way synced with Paid terms)`
                    : `Progres = jumlah bobot milestone selesai = ${Math.min(100, total)}% (sinkron dua arah dengan termin Lunas)`}
                </p>
                <p className="text-[11px] text-steel-500">Progress dari checklist milestone berbobot, otomatis jadi %. Sinkron ke termin.</p>
              </>
            );
          })()}
          <Field label={S.noteLabel} hint={S.progNoteHint}>
            <input className="input" value={progNote} onChange={(e) => setProgNote(e.target.value)} placeholder={S.progNotePh} />
          </Field>
        </div>
      </Modal>

      {/* Konfirmasi WO selesai 100% */}
      <ConfirmModal
        open={confirmFinish !== null}
        title={S.finishTitle.replace("{n}", confirmFinish?.id ?? "")}
        desc={S.finishDesc}
        confirmLabel={S.finishConfirmBtn}
        onCancel={() => setConfirmFinish(null)}
        onConfirm={() => { if (confirmFinish) applyWoProgress(confirmFinish.id, confirmFinish.v, confirmFinish.note, confirmFinish.ms); setConfirmFinish(null); setWoProg(null); setProgMs([]); setProgNote(""); }}
      />

      {/* Modal termin */}
      <Modal open={showTerm} onClose={() => setShowTerm(false)} title={S.termTitle} subtitle={S.termSub2}
        footer={<><button className="btn-secondary" onClick={() => setShowTerm(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveTerm}>{S.proposeBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.tabSub}>
              <select className="input" value={termForm.sub} onChange={(e) => setTermForm({ ...termForm, sub: e.target.value, wo: "", milestone: "" })}>
                <option value="">{S.pickOpt}</option>
                {subcontractors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label={S.woLabel}>
              <select className="input" value={termForm.wo} onChange={(e) => setTermForm({ ...termForm, wo: e.target.value })} disabled={!termForm.sub}>
                <option value="">{termForm.sub ? S.pickWoOpt : S.pickSubFirst}</option>
                {termWoOptions.map((w) => <option key={w.id} value={w.id}>{w.id} ({effProgress(w)}%)</option>)}
              </select>
            </Field>
            <Field label={S.msSowBtn} hint={S.msHint}>
              <select className="input" value={termForm.milestone} onChange={(e) => setTermForm({ ...termForm, milestone: e.target.value })} disabled={!termForm.sub}>
                <option value="">{termForm.sub ? (termMsList.length ? S.pickMsOpt : S.noMsOpt) : S.pickSubFirst}</option>
                {termMsList.map((m) => <option key={m.title} value={m.title}>{m.title} ({m.pct}% · due {fmtTanggal(m.due)})</option>)}
              </select>
            </Field>
          </FormGrid>
          {termSub && termWo && (
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
              {S.termCapInfo.replace("{a}", fmtRupiah(termCap)).replace("{b}", fmtRupiah(Number(termSub.contract || 0))).replace("{c}", String(termWo.progress)).replace("{d}", fmtRupiah(termUsed))}
              {termMs ? S.msCapInfo.replace("{a}", termMs.title).replace("{b}", fmtRupiah(termMsCap)).replace("{c}", fmtRupiah(termMsUsed)) : ""}
              {termTsRef > 0 ? S.tsRefInfo.replace("{a}", String(termTsHours)).replace("{b}", fmtRupiah(Number(termWo.rate))).replace("{c}", fmtRupiah(termTsRef)) : ""}
            </p>
          )}
          <Field label={S.termAmountLabel}><NumInput min={0} className="input" value={termForm.amount} onChange={(e) => setTermForm({ ...termForm, amount: e.target.value })} /></Field>
          <FormGrid>
            <Field label={S.pphLabel}>
              <select className="input" value={termForm.pphPct} onChange={(e) => setTermForm({ ...termForm, pphPct: e.target.value })}>
                {/* Sumber tarif dari PPH_SUBKON_OPTIONS. Versi lama menulis
                    0.5 dan 2 langsung di sini, jadi konstantanya mati dan
                    kalau tarifnya berubah keduanya bisa berbeda. */}
                {PPH_SUBKON_OPTIONS.map((rate) => (
                  <option key={rate} value={String(rate)}>
                    {rate}%{rate === 0.5 ? " Final (cth Pak Yusuf)" : " PPh 23"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={S.retensiLabel}><NumInput min={0} max={100} className="input" value={termForm.retPct} onChange={(e) => setTermForm({ ...termForm, retPct: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal bukti bayar termin */}
      <Modal open={termPay !== null} onClose={() => setTermPay(null)} title={S.payTermTitle.replace("{n}", termPay?.id ?? "")} subtitle={S.payTermSub.replace("{a}", termPay?.sub ?? "").replace("{b}", fmtRupiah(termPay ? netoOf(termPay) : 0)).replace("{c}", needsTermDirector(termPay) ? S.directorNeeded.replace("{n}", fmtRupiah(terminThreshold)) : "")}
        footer={<><button className="btn-secondary" onClick={() => setTermPay(null)}>{S.cancelBtn}</button><button className="btn-primary" disabled={(needsTermDirector(termPay) && (!termDirCheck || !termDirName.trim())) || busy.isBusy("confirmBuktiTerm")} onClick={() => void busy.run("confirmBuktiTerm", confirmBuktiTerm)}>{S.saveProofBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.payDateLabel}><input type="date" required className="input" value={proof.date} onChange={(e) => setProof({ ...proof, date: e.target.value })} /></Field>
            <Field label={S.methodLabel}>
              <select className="input" value={proof.method} onChange={(e) => setProof({ ...proof, method: e.target.value })}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.refNoLabel} hint={S.refNoHint}>
            <input className="input font-mono" value={proof.ref} onChange={(e) => setProof({ ...proof, ref: e.target.value })} placeholder={S.refNoPh} />
          </Field>
          <Field label={S.withholdLabel} hint={S.withholdHint.replace("{a}", String(termPay ? pphOf(termPay, pphDefault) : "")).replace("{b}", fmtRupiah(termPay ? Math.round(Number(termPay.amount || 0) * pphOf(termPay, pphDefault) / 100) : 0))}>
            <input className="input font-mono" value={withholdingRef} onChange={(e) => setWithholdingRef(e.target.value)} placeholder={S.withholdPh} />
          </Field>
          {needsTermDirector(termPay) && (
            <>
              <label className="flex items-start gap-2 text-sm text-steel-600">
                <input type="checkbox" className="mt-1" checked={termDirCheck} onChange={(e) => setTermDirCheck(e.target.checked)} />
                {S.directorCheck}
              </label>
              <Field label={S.directorNameLabel} hint={S.directorNameHint}>
                <input className="input" value={termDirName} onChange={(e) => setTermDirName(e.target.value)} placeholder={S.directorNamePh} />
              </Field>
            </>
          )}
        </div>
      </Modal>

      {/* Konfirmasi penolakan termin */}
      <ConfirmModal
        open={rejectTerm !== null}
        title={S.rejectTermTitle.replace("{n}", rejectTerm?.id ?? "")}
        desc={S.rejectTermDesc}
        confirmLabel={S.rejectConfirmBtn}
        onCancel={() => setRejectTerm(null)}
        onConfirm={async () => { try { if (rejectTerm) { await update("termins", rejectTerm.id, { status: "Ditolak" }); toast(S.tRejected.replace("{n}", rejectTerm.id)); } setRejectTerm(null); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } }}
      />

      {/* Modal release retensi */}
      <Modal open={releaseTerm !== null} onClose={() => setReleaseTerm(null)} title={S.releaseTitle.replace("{n}", releaseTerm?.id ?? "")} subtitle={S.releaseSub}
        footer={<><button className="btn-secondary" onClick={() => setReleaseTerm(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={confirmRelease}>{S.releaseConfirmBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.releaseDateLabel}><input type="date" className="input" value={releaseForm.date} onChange={(e) => setReleaseForm({ ...releaseForm, date: e.target.value })} /></Field>
            <Field label={S.baNoLabel}><input className="input font-mono" value={releaseForm.ba} onChange={(e) => setReleaseForm({ ...releaseForm, ba: e.target.value })} placeholder={S.baNoPh} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal timesheet */}
      <Modal open={showTs} onClose={() => setShowTs(false)} title={S.tsTitle}
        footer={<><button className="btn-secondary" onClick={() => setShowTs(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveTimesheet}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.woLabel}>
              <select className="input" value={tsForm.wo} onChange={(e) => setTsForm({ ...tsForm, wo: e.target.value })}>
                <option value="">{S.pickWoOpt}</option>
                {workOrders.filter((w) => w.status !== "Selesai").map((w) => <option key={w.id} value={w.id}>{w.id} - {w.sub}</option>)}
              </select>
            </Field>
            <Field label={S.projectFromWo} hint={(() => { const w = workOrders.find((x) => x.id === tsForm.wo); return w && Number(w.rate || 0) > 0 ? S.rateAutoHint.replace("{n}", fmtRupiah(Number(w.rate))) : S.rateMissingHint; })()}>
              <p className="input bg-surface text-steel-600" aria-label={S.projectFromWoAria}>
                {tsForm.wo ? (workOrders.find((x) => x.id === tsForm.wo)?.project ?? "-") : S.pickWoFirstTs}
              </p>
            </Field>
            <Field label={S.employeeLabel}>
              <select className="input" value={tsForm.employee} onChange={(e) => setTsForm({ ...tsForm, employee: e.target.value })}>
                <option value="">{S.pickOpt}</option>
                {employeeOptions.map((e) => <option key={e.id} value={e.id}>{e.name} - {e.role}</option>)}
              </select>
            </Field>
            <Field label={S.dateLabel}><input type="date" className="input" value={tsForm.date} onChange={(e) => setTsForm({ ...tsForm, date: e.target.value })} /></Field>
            <Field label={S.hoursLabel}><NumInput min={0} step={0.5} className="input" value={tsForm.hours} onChange={(e) => setTsForm({ ...tsForm, hours: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.noteLabel}><input className="input" value={tsForm.note} onChange={(e) => setTsForm({ ...tsForm, note: e.target.value })} placeholder={S.notePhTs} /></Field>
        </div>
      </Modal>
    </div>
  );
}
