import { useEffect, useMemo, useState } from "react";
import { Plus, HardHat, FileSignature, Star, Receipt, Pencil, Trash2 } from "lucide-react";
import { Card, PageHeader, Badge, KpiCard, Tabs, ProgressBar, Modal, Field, FormGrid, ConfirmModal, SortTh, toggleSort, sortRows, usePager, toast, SearchBox, rowMatches,
  NumInput, MoneyInput, FlowStrip,
  AsyncButton,
  FileUploadButton,
  RowAction,
} from "../../components/ui";
import { useAuth, canSetTarget } from "../../auth/auth";
import { DocumentPreviewCell } from "../../components/DocumentPreview";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem, type CollectionKey } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { remoteRepository } from "../../services/repositories";
import { getJwt, isBackendConfigured } from "../../services/http";
import { fmtRupiah, fmtMiliar, fmtTanggal, parseRupiah, todayISO } from "../../utils/format";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import { sameName } from "../../utils/names";
import { woMilestonesOf, woProgressOf, terminMilestoneOptions } from "../../utils/woMilestones";
import { AlertBannerView, flashPick, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { rowHighlightClass } from "../../components/rowHighlight";
import { getSetting } from "../../utils/settings";
import { PPH_SUBKON_OPTIONS } from "../../utils/sb";
import { pdfServerReady } from "../../services/pdfClient";
import { usePdfDoc } from "../../components/usePdfDoc";
import { subActiveTrend, subContractTrend, woTrend, ratingTrend } from "../../data";
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

/* Batch koleksi modul Subkontraktor untuk useModuleSync (pengganti resync penuh). */
const SUB_COLS: CollectionKey[] = ["activities", "employees", "incidents", "payables", "projects", "subcontractors", "termins", "timesheets", "workOrders"];

export default function Subcontractor() {
  const { data, add, update, remove, log, branch } = useStore();
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
  const [subQ, setSubQ] = useState("");
  const [subStatus, setSubStatus] = useState("Semua");
  const modAlert = useModuleAlert("subkontraktor");
  const flash = useNotifFlash();
  const deepParams = useDeepLinkParams();
  /* Printer PDF: dipakai untuk kwitansi. Satu hook untuk seluruh halaman
     supaya Blob URL hanya hidup selama satu dokumen sedang dipakai. */
  const pdfDoc = usePdfDoc();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(SUB_COLS);

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
  const [progPct, setProgPct] = useState("");
  /* T6-SK4: foto progres WO + historikal edit sebelumnya. */
  const [progPhotoUrl, setProgPhotoUrl] = useState("");
  /* T6-SK5: ubah WO/SPK hanya procurement (dan peran target). */
  const { user: sessionUser } = useAuth();
  const canEditWo = (): boolean => {
    const r = String(sessionUser?.role ?? "").toLowerCase();
    return canSetTarget(sessionUser?.role) || r.includes("procurement") || r.includes("purchasing") || r.includes("logistik");
  };
  // Ubah WO (scope/target) + ubah termin Draf (milestone/amount).
  const [woEdit, setWoEdit] = useState<StoreItem | null>(null);
  const [woEditForm, setWoEditForm] = useState({ scope: "", targetDate: "" });
  /* S3: modal tambah/hapus milestone PER WO (bukan milestone SOW subkontraktor).
     Client: "WO gk ada fitur untuk nambahkan milestone... bikin popup modal
     baru untuk milestone per WO". */
  const [woMsFor, setWoMsFor] = useState<StoreItem | null>(null);
  const [woMsForm, setWoMsForm] = useState({ title: "", pct: "", due: "" });
  const [termEdit, setTermEdit] = useState<StoreItem | null>(null);
  const [termEditForm, setTermEditForm] = useState({ milestone: "", amount: "" });
  const [confirmFinish, setConfirmFinish] = useState<{ id: string; v: number; note: string; ms: string[]; milestones?: unknown[] } | null>(null);
  const [showTerm, setShowTerm] = useState(false);
  const [termForm, setTermForm] = useState({ sub: "", wo: "", milestone: "", amount: "", pphPct: "0.5", retPct: "5", scheme: "Persentase" });
  const [termPay, setTermPay] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState({ date: todayISO(), method: "Transfer", ref: "" });
  /* Bukti transfer sebagai berkas (foto Struk / PDF mutasi bank). Sebelumnya
     form hanya menerima nomor referensi - kolom "Bukti bayar" di checklist
     dokumen terpenuhi begitu ada ref dan tanggal, padahal tidak ada
     berkas yang bisa diaudit. Sekarang bukti bisa dilampirkan; teks ref
     tetap ada karena rekonsiliasi sering hanya punya nomor. */
  const [proofUrl, setProofUrl] = useState("");
  /* Nomor invoice & BAST wajib sebelum bayar (requirement 2 Oktober).
     Ini bukan formalitas: kwitansi mencantumkan keduanya, dan tanpa
     nomor itu bukti pembayaran tidak bisa dicocokkan ke invoice mana pun -
     sengketa pembayaran pertama yang muncul justru soal ini. */
  const [proofDocs, setProofDocs] = useState({ invoiceNo: "", bastNo: "" });
  /* S2: unggah berkas invoice & BAST (client: unggah file, bukan hanya nomor). */
  const [invoiceFileUrl, setInvoiceFileUrl] = useState("");
  const [bastFileUrl, setBastFileUrl] = useState("");
  const [withholdingRef, setWithholdingRef] = useState("");
  const [termDirCheck, setTermDirCheck] = useState(false);
  const [termDirName, setTermDirName] = useState("");
  const [rejectTerm, setRejectTerm] = useState<StoreItem | null>(null);
  const [releaseTerm, setReleaseTerm] = useState<StoreItem | null>(null);
  const [releaseForm, setReleaseForm] = useState({ date: todayISO(), ba: "" });
  const [showTs, setShowTs] = useState(false);
  const [tsForm, setTsForm] = useState({ wo: "", employee: "", date: todayISO(), hours: "", note: "" });
  // Ubah / hapus timesheet & termin. Edit hanya boleh saat belum Disetujui.
  const [tsEditId, setTsEditId] = useState<string | null>(null);
  const [delTs, setDelTs] = useState<StoreItem | null>(null);
  const [delTerm, setDelTerm] = useState<StoreItem | null>(null);
  /* Subkontraktor & WO belum punya hapus. Keduanya jadi acuan record
     keuangan, jadi hanya boleh dihapus kalau belum ada yang merujuk. */
  const [delSub, setDelSub] = useState<StoreItem | null>(null);
  const [delWo, setDelWo] = useState<StoreItem | null>(null);
  const [rateForm, setRateForm] = useState({ wo: "", rate: "" });

  const runningWo = workOrders.filter((w) => w.status !== "Selesai").length;
  const avgRating = subcontractors.length ? Math.round(subcontractors.reduce((s, x) => s + Number(x.rating || 0), 0) / subcontractors.length) : 0;
  /* T6-SK2: nama kapal dari proyek WO. */
  const vesselOfProject = (projectId: string): string =>
    String(data.projects.find((p) => String(p.id) === projectId)?.vessel ?? "-");
  const filteredSubs = subcontractors.filter((s) => {
    /* T6-SK3: tipe kontrak tidak lagi jadi filter utama; status saja + search. */
    if (subStatus !== "Semua" && normSub(s.status) !== subStatus) return false;
    return rowMatches(s, subQ, ["name", "services", "contractType", "status", "k3", "id"]);
  });
  const woPager = usePager(workOrders.length);
  useEffect(() => {
    woPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const tIdx = payments.findIndex((t) => ids.includes(String(t.id)));
    if (tIdx >= 0) {
      if (tab === "Termin & Pembayaran") { flashPick(flash, ids, -1, () => {}, 100); return; }
      setTab("Termin & Pembayaran");
      window.setTimeout(() => flashPick(flash, ids, -1, () => {}, 100), 250);
      return;
    }
    const idx = workOrders.findIndex((r) => ids.includes(String(r.id)));
    if (idx >= 0) {
      if (tab === "Work Order") { flashPick(flash, ids, idx, woPager.go, woPager.size); return; }
      setTab("Work Order");
      window.setTimeout(() => flashPick(flash, ids, idx, woPager.go, woPager.size), 250);
      return;
    }
    flashPick(flash, ids, -1, () => {}, 100);
  };
  const pickNotif = (rowId: string) => pickNotifIds([rowId]);
  /* T6-SK9: whitelist tab aktif - Timesheet sudah dihapus dari UI. */
  useDeepLinkTarget(deepParams.tab, deepParams.highlight, setTab, pickNotifIds, [], ["Subkontraktor", "Work Order", "Termin & Pembayaran", "Kepatuhan K3"]);

  /* Progres WO = jumlah bobot milestone termin yang selesai (sinkron dua arah
     dengan status termin; tanpa milestone → progres tersimpan legacy). */
  /* Milestone yang ditandai selesai untuk sebuah WO.
     Sumber kebenarannya `doneAt` di setiap milestone - field `doneMs` yang
     lama hanya berisi judul, jadi tidak bisa membedakan "tahap 40% selesai"
     dari "tahap 100% selesai". Pembacaan dua sumber ini selama migrasi
     menjaga WO lama yang belum punya `milestones` tetap hidup. */
  const doneMsOf = (w: StoreItem): string[] => {
    const fromDoneAt = woMilestonesOf(w)
      .filter((m) => m.doneAt !== "")
      .map((m) => m.title);
    if (fromDoneAt.length > 0) return fromDoneAt;
    return Array.isArray(w.doneMs) ? (w.doneMs as unknown[]).map((x) => String(x)) : [];
  };

  /* Progress WO = turunan dari milestone WO (item 11 revisi 2 Oktober).
     Sebelumnya hanya membaca milestone SOW milik SUBKONTRAKTOR, jadi satu
     subkontraktor dengan dua WO memakai bobot yang sama untuk keduanya -
     "Fabrikasi 40%" milik WO A tercampur dengan "Coating 40%" milik WO B.

     Pembagiannya total bobot milestone WO, bukan 100, supayauser yang hanya
     mengisi tiga tahap 30/30/40 tidak melihat progres melompat ke 90% di
     tahap kedua. Fungsi dan aturannya ada di `utils/woMilestones.ts`. */
  const effProgress = (wo: StoreItem | null | undefined): number => woProgressOf(wo);

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
  /* Opsi milestone untuk form termin: milestone SOW subkontraktor DIGABUNG
     dengan milestone WO yang dipilih (item 11). Digabung, bukan diganti:
     termin yang sudah terbit merujuk milestone SOW, dan kalau diganti daftar
     itu, cap termin lama ikut hilang dan nilainya tidak bisa diaudit lagi.
     Judul yang sama digabung jadi satu opsi supaya cap-nya tidak terhitung
     dua kali untuk tahap yang sama. */
  const termMsList = terminMilestoneOptions(termSub, termWo);
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
    const bgValue = parseRupiah(subForm.bgValue || "0");
    if (subForm.bgValue && (!Number.isFinite(bgValue) || bgValue < 0)) { toast(S.tBgInvalid, "info"); return; }
    const created = await add("subcontractors", {
      name: subForm.name.trim(), services: subForm.services.trim() || "Umum",
      rating: 80, active: 0, contract: parseRupiah(subForm.contract) || 0, status: "Kualifikasi", k3: subForm.k3,
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
  const saveWoMilestone = async () => {
    if (!woMsFor) return;
    if (!woMsForm.title.trim()) { toast(locale === "en" ? "Milestone title is required" : "Judul milestone wajib diisi", "info"); return; }
    const pct = Number(woMsForm.pct);
    if (!Number.isFinite(pct) || pct <= 0) { toast(locale === "en" ? "Milestone weight must be > 0" : "Bobot milestone harus lebih dari 0", "info"); return; }
    if (!woMsForm.due) { toast(locale === "en" ? "Milestone due date is required" : "Due date milestone wajib diisi", "info"); return; }
    const next = [...woMilestonesOf(woMsFor), { title: woMsForm.title.trim(), pct, due: woMsForm.due }];
    try {
      await update("workOrders", woMsFor.id, { milestones: next });
      log("menambah milestone WO", `${woMsFor.id} · ${woMsForm.title.trim()} (${pct}%)`, "Subkontraktor");
      toast((locale === "en" ? "Milestone added to {n}" : "Milestone ditambahkan ke {n}").replace("{n}", String(woMsFor.id)));
      setWoMsFor({ ...woMsFor, milestones: next });
      setWoMsForm({ title: "", pct: "", due: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const removeWoMilestone = async (idx: number) => {
    if (!woMsFor) return;
    const next = woMilestonesOf(woMsFor).filter((_, i) => i !== idx);
    try {
      await update("workOrders", woMsFor.id, { milestones: next });
      log("menghapus milestone WO", `${woMsFor.id} · index ${idx + 1}`, "Subkontraktor");
      setWoMsFor({ ...woMsFor, milestones: next });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openWoEdit = (w: StoreItem) => {
    /* T6-SK5: SPK/WO tidak sembarang orang ubah. */
    if (!canEditWo()) {
      toast(locale === "en" ? "Only Procurement (or target roles) can edit WO/SPK" : "Hanya Procurement (atau peran target) yang bisa mengubah WO/SPK", "info");
      return;
    }
    setWoEdit(w);
    setWoEditForm({ scope: String(w.scope ?? ""), targetDate: String(w.targetDate ?? "") });
  };

  const saveWoEdit = async () => {
    if (!woEdit) return;
    if (!canEditWo()) {
      toast(locale === "en" ? "Only Procurement can edit WO/SPK" : "Hanya Procurement yang bisa mengubah WO/SPK", "info");
      return;
    }
    if (String(woEdit.status) === "Selesai") { toast(locale === "en" ? "Finished WO cannot be edited" : "WO Selesai tidak bisa diubah", "info"); return; }
    if (!woEditForm.scope.trim()) { toast(S.tWoFieldsRequired, "info"); return; }
    if (!woEditForm.targetDate) { toast(S.tWoTargetRequired, "info"); return; }
    try {
      const history = Array.isArray(woEdit.history) ? (woEdit.history as unknown[]) : [];
      await update("workOrders", woEdit.id, {
        scope: woEditForm.scope.trim(),
        targetDate: woEditForm.targetDate,
        history: [...history, {
          at: todayISO(),
          by: String(sessionUser?.name ?? "Anda"),
          field: "scope/target",
          from: `${String(woEdit.scope ?? "")} · ${String(woEdit.targetDate ?? "")}`,
          to: `${woEditForm.scope.trim()} · ${woEditForm.targetDate}`,
        }],
      });
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
    const amount = parseRupiah(termEditForm.amount);
    if (!termEditForm.milestone.trim()) { toast(S.tMsTitleRequired, "info"); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast(S.tQuoteValuePositive ?? "Nominal harus > 0", "info"); return; }
    try {
      await update("termins", termEdit.id, { milestone: termEditForm.milestone.trim(), amount });
      log("mengubah termin", `${termEdit.id} · ${termEditForm.milestone.trim()} · ${fmtRupiah(amount)}`, "Subkontraktor");
      toast(locale === "en" ? `Term ${termEdit.id} updated` : `Termin ${termEdit.id} diubah`);
      setTermEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* T6-SK1: evaluasi kinerja (evalChart + EvalTooltip) dihapus dari UI.
     Fungsi tidak lagi dipanggil - sengaja dihapus agar tidak jadi dead code. */

  const applyWoProgress = async (id: string, v: number, note: string, doneMs?: string[], milestones?: unknown[]) => {
    try {
    const prev = workOrders.find((w) => w.id === id);
    /* T6-SK4: historikal progres + foto. */
    const history = Array.isArray(prev?.history) ? (prev!.history as unknown[]) : [];
    const histEntry = {
      at: todayISO(),
      by: String(sessionUser?.name ?? "Anda"),
      progress: v,
      note: note.trim(),
      photoUrl: progPhotoUrl.trim() || undefined,
      from: Number(prev?.progress ?? 0),
    };
    await update("workOrders", id, {
      progress: v,
      status: v >= 100 ? "Selesai" : "Dalam Proses",
      ...(doneMs ? { doneMs } : {}),
      ...(milestones ? { milestones } : {}),
      ...(progPhotoUrl.trim() ? { photoUrl: progPhotoUrl.trim() } : {}),
      history: [...history, histEntry],
    });
    log("mengupdate progres", `${id} → ${v}%${note ? ` - ${note}` : ""}${progPhotoUrl.trim() ? " · foto" : ""}`, "Subkontraktor");
    toast(S.tProgressTo.replace("{a}", id).replace("{b}", String(v)));
    setProgPhotoUrl("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveWoProgress = async () => {
    if (!woProg) return;
/* Milestone yang dipakai dialog progres = milestone milik WO itu sendiri
       (item 11). Sebelumnya yang diambil adalah SOW subkontraktor, jadi satu
       sub dengan dua WO menampilkan tahap yang sama untuk keduanya, dan
       mencentangnya di satu WO ikut menaikkan progres WO lain.

       Milestone SOW sub tetap dipakai sebagai OPSI termin di
       `terminMilestoneOptions` - keduanya beda fungsi: SOW menyatakan apa yang
       ditagih ke subkontraktor, milestone WO menyatakan pekerjaan yang sedang
       dikerjakan. Menggabungkan keduanya jadi satu daftar akan membuat cap
       termin ambigu. */
    const ms = woMilestonesOf(woProg);
    // Jalur numerik untuk WO tanpa milestone (legacy): input 0-100 terintegrasi ke termin cap & status WO.
    if (ms.length === 0) {
      const v = Math.max(0, Math.min(100, Math.round(Number(progPct))));
      if (progPct.trim() === "" || !Number.isFinite(v)) { toast(locale === "en" ? "Enter progress 0-100" : "Isi progres numerik 0-100", "info"); return; }
      if (v < effProgress(woProg) && !progNote.trim()) { toast(S.tProgressNoteRequired, "info"); return; }
      /* Jalur numerik (WO tanpa milestone): tetap jadi 100%, jadi selesai. */
    if (v >= 100) { setConfirmFinish({ id: woProg.id, v, note: progNote.trim(), ms: [] }); return; }
      applyWoProgress(woProg.id, v, progNote.trim());
      setWoProg(null); setProgMs([]); setProgNote(""); setProgPct("");
      return;
    }
const known = ms.map((m) => m.title);
    const checked = progMs.filter((t) => known.includes(t));
    /* Persentase dihitung `woProgressOf` dari milestone yang dicentang, bukan
       dijumlahkan di sini. Kalau dua tempat menghitung sendiri, dialog ini
       bisa menampilkan 100% sementara tabel WO tetap 60%. */
    const staged = ms.map((m) => (checked.includes(m.title) ? { ...m, doneAt: todayISO() } : { ...m, doneAt: "" }));
    const v = woProgressOf({ ...woProg, milestones: staged });
    if (v < effProgress(woProg) && !progNote.trim()) {
      toast(S.tProgressNoteRequired, "info");
      return;
    }
    if (v >= 100) {
      setConfirmFinish({ id: woProg.id, v, note: progNote.trim(), ms: checked, milestones: staged });
      return;
    }
    /* `staged` menyimpan penanda selesai `doneAt` per milestone. Daftar judul
       (`doneMs`) tidak bisa membedakan tahap 40% yang sudah selesai dari
       tahap 100%, jadi bentuk lamanya hanya dipertahankan untuk WO lama. */
    await applyWoProgress(woProg.id, v, progNote.trim(), checked, staged);
    setWoProg(null);
    setProgMs([]);
    setProgNote("");
    setProgPct("");
  };

  const saveTerm = async () => {
    try {
    if (!termForm.sub) { toast(S.tSubRequired, "info"); return; }
    const wo = workOrders.find((w) => w.id === termForm.wo && sameName(w.sub, termForm.sub));
    if (!wo) { toast(S.tWoBelongsSub, "info"); return; }
    const amount = parseRupiah(termForm.amount);
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
      scheme: termForm.scheme,
    }, { action: "mengajukan termin", module: "Subkontraktor" });
    toast(S.tTermFiled.replace("{n}", created.id));
    setShowTerm(false);
    setTermForm({ sub: "", wo: "", milestone: "", amount: "", pphPct: "0.5", retPct: "5", scheme: "Persentase" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

/* Cetak kwitansi.
   *
   * Server merakit dokumen dari baris `termins` miliknya sendiri, jadi
   * nominal, PPh, dan retensi pada kwitansi tidak bisa berbeda dari
   * pembukuan - dan tidak bisa dimanipulasi dari browser.
   *
   * Komplain lama "kwitansi kontennya terpotong" berasal dari mesin PDF
   * client: align:'right' pada baris nominal menganchor tepi kanan baris di
   * margin kiri, sehingga Rp 44.832.500 mulai dari x = -25 mm dan lebih dari
   * separuhnya tercetak di luar kertas. Mesin server mengukur ulang nominal
   * dari lebar kolom yang terukur, dan probe geometri menjaga hal itu. */
/* SPK: perintah kerja resmi untuk subkontraktor. Tidak ada mesin lokal -
      kalau server tidak aktif, yang jujur dilakukan adalah memberi tahu,
      bukan mencetak versi seadanya. */
const printSpk = async (w: StoreItem): Promise<void> => {
    if (!pdfServerReady()) {
      toast(locale === "en" ? "Official PDF needs the server - connect the backend first." : "PDF resmi perlu server aktif - hubungkan backend dulu.", "info");
      return;
    }
    await pdfDoc.request({ kind: "spk", id: String(w.id), locale }, `SPK-${w.id}`, false);
  };

  /* Kwitansi dibuat server dari baris `termins`. Rinciannya memuat SELURUH
     pengurangan - PPh, retensi, dan denda - bukan cuma netonya: subkontraktor
     yang menerima nominal bersih tanpa rincian akan menghitung ulang sendiri
     dari diff, dan justru di situ sengketa paling sering muncul. Semua angka
     dibaca dari record termin yang sudah dibekukan saat pelunasan. */
  const printKwitansi = async (p: StoreItem): Promise<void> => {
    const id = String(p.id);
    if (!pdfServerReady()) {
      toast(locale === "en" ? "Official PDF needs the server - connect the backend first." : "PDF resmi perlu server aktif - hubungkan backend dulu.", "info");
      return;
    }
    const done = await pdfDoc.request({ kind: "kwitansi", id, locale }, `Kwitansi-${id}`, false);
    if (done) toast(locale === "en" ? `Receipt for ${id} printed` : `Kwitansi ${id} dicetak`);
  };

  const stepTerm = async (p: StoreItem, next: string) => {
    if (next === "Lunas") {
      setTermPay(p);
      setProof({ date: todayISO(), method: "Transfer", ref: "" });
      setProofUrl("");
      /* Termin yang sudah punya nomor (diisi manual sebelumnya) tidak
         dignorer: pem homebu form akan langsung menampilkan isinya. */
      setProofDocs({ invoiceNo: String(p.invoiceNo ?? ""), bastNo: String(p.bastNo ?? "") });
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
    /* Requirement client 2 Oktober: invoice dan BAST wajib ada sebelum bukti
       bayar diterbitkan. Numeriknya disimpan di baris termin yang sama, dan
       kwitansi membacanya dari sana - jadi kwitansi tidak bisa dicetak untuk
       pembayaran yang tidak punya invoice/BAST, dan kalau nanti dicek,
       jejaknya ada di pembukuan bukan hanya di kepala orang yang membayar. */
    if (!proofDocs.invoiceNo.trim()) { toast(S.tInvoiceNoWajib, "info"); return; }
    if (!proofDocs.bastNo.trim()) { toast(S.tBastNoWajib, "info"); return; }
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
      proofUrl: proofUrl.trim(),
      invoiceNo: proofDocs.invoiceNo.trim(),
      bastNo: proofDocs.bastNo.trim(),
      ...(invoiceFileUrl.trim() ? { invoiceFileUrl: invoiceFileUrl.trim() } : {}),
      ...(bastFileUrl.trim() ? { bastFileUrl: bastFileUrl.trim() } : {}),
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
          /* Nomor invoice/BAST ikut dikembalikan ke semula: Hutang gagal
             tercatat berarti belum ada pembayaran yang terjadi, jadi jangan
             meninggalkan dokumen yang menyatakan sebaliknya. */
          invoiceNo: termPay.invoiceNo, bastNo: termPay.bastNo,
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
      const tMsTitle = String(termPay.milestone ?? "");
      /* Milestone yang selesai dicatat dengan `doneAt` di milestone milik WO
         itu sendiri. Versi lama menulis daftar judul ke `doneMs` dan memakai
         bobot milestone SOW SUBKONTRAKTOR - jadi melunasi termin untuk satu WO
         ikut menandai tahap dengan nama sama di WO lain milik subkontraktor
         yang sama. Progress dihitung ulang oleh `woProgressOf`, jadi angka yang
         disimpan selalu konsisten dengan milestone-nya. */
      if (wo && tMsTitle !== "" && !doneMsOf(wo).includes(tMsTitle)) {
        const own = woMilestonesOf(wo).find((m) => m.title === tMsTitle);
        if (own) {
          const today = todayISO();
          const next = woMilestonesOf(wo).map((m) =>
            m.title === tMsTitle ? { ...m, doneAt: today } : m,
          );
          const v = woProgressOf({ ...wo, milestones: next });
          await update("workOrders", wo.id, {
            milestones: next,
            doneMs: next.filter((m) => m.doneAt !== "").map((m) => m.title),
            progress: v,
            status: v >= 100 ? "Selesai" : "Dalam Proses",
          });
        }
      }
    }
    log("melunasi termin", `${termPay.id} via ${proof.method} ${proof.ref.trim()} · PPh ${pphOf(termPay, pphDefault)}% = ${fmtRupiah(pphAmt)} · hutang ${poNeto} ${fmtRupiah(netoPayable)}${retAmt > 0 ? ` + retensi ${fmtRupiah(retAmt)} ditahan` : ""}`, "Subkontraktor");
    toast(S.tTermPaid.replace("{a}", termPay.id).replace("{b}", fmtRupiah(pphAmt)).replace("{c}", fmtRupiah(netoPayable)));
    setTermPay(null);
    setWithholdingRef("");
    setProofDocs({ invoiceNo: "", bastNo: "" });
    setInvoiceFileUrl("");
    setBastFileUrl("");
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

  /* ==== HAPUS TERMIN ==== */
  const confirmDelTerm = async () => {
    if (!delTerm) return;
    const p = delTerm;
    const st = normTerm(String(p.status));
    const ret = retOf(p);
    /* Lunas dengan retensi belum dilepas = uang retensi masih
       tertahan. Menghapus di titik ini menghapus jejaknya tanpa
       bukti pelepasan, jadi tolak dengan pesan yang jelas. */
    if (st === "Lunas" && ret > 0) {
      toast(
        locale === "en"
          ? `Retention on termin ${String(p.id)} has not been released - issue the retention BA first.`
          : `Retensi pada termin ${String(p.id)} belum dilepas - terbitkan BA retensi dulu.`,
        "info",
      );
      setDelTerm(null);
      return;
    }
    try {
      await remove("termins", String(p.id));
      log("menghapus termin", `${String(p.id)} - ${fmtRupiah(Number(p.amount || 0))}`, "Subkontraktor");
      toast(locale === "en" ? `Termin ${String(p.id)} deleted` : `Termin ${String(p.id)} dihapus`);
      setDelTerm(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ==== HAPUS SUBKONTRAKTOR / WORK ORDER ==== */
  const subUsages = (s: StoreItem): string[] => {
    const name = String(s.name ?? "");
    const out: string[] = [];
    if (workOrders.some((w) => sameName(w.sub, name))) out.push("workOrders");
    if (payments.some((t) => sameName(t.sub, name))) out.push("termins");
    if (data.payables.some((p) => sameName(String(p.sub ?? ""), name))) out.push("payables");
    if (data.activities.some((a) => sameName(String(a.sub ?? ""), name))) out.push("activities");
    return out;
  };

  const woUsages = (w: StoreItem): string[] => {
    const out: string[] = [];
    if (timesheets.some((t) => String(t.woId ?? "") === String(w.id))) out.push("timesheets");
    if (payments.some((t) => String(t.wo ?? t.woId ?? "") === String(w.id))) out.push("termins");
    if (data.payables.some((p) => String(p.woId ?? "") === String(w.id))) out.push("payables");
    return out;
  };

  const confirmDelSub = async () => {
    if (!delSub) return;
    const used = subUsages(delSub);
    if (used.length > 0) {
      toast(locale === "en"
        ? `${delSub.name} is still referenced in ${used.join(", ")} - cancel those records first.`
        : `${delSub.name} masih dirujuk di ${used.join(", ")} - batalkan record itu dulu.`, "info");
      setDelSub(null);
      return;
    }
    try {
      await remove("subcontractors", String(delSub.id));
      log("menghapus subkontraktor", `${String(delSub.id)} - ${String(delSub.name ?? "")}`, "Subkontraktor");
      toast(locale === "en" ? `Subcontractor ${String(delSub.name ?? "")} deleted` : `Subkontraktor ${String(delSub.name ?? "")} dihapus`);
      setDelSub(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDelWo = async () => {
    if (!delWo) return;
    const used = woUsages(delWo);
    if (used.length > 0) {
      toast(locale === "en"
        ? `Work order ${String(delWo.id)} is still referenced in ${used.join(", ")} - void those records first.`
        : `Work order ${String(delWo.id)} masih dirujuk di ${used.join(", ")} - batalkan record itu dulu.`, "info");
      setDelWo(null);
      return;
    }
    try {
      await remove("workOrders", String(delWo.id));
      log("menghapus work order", `${String(delWo.id)} - ${String(delWo.sub ?? "")}`, "Subkontraktor");
      toast(locale === "en" ? `Work order ${String(delWo.id)} deleted` : `Work order ${String(delWo.id)} dihapus`);
      setDelWo(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveTimesheet = async () => {
    try {
    if (!tsForm.wo || !tsForm.employee || !tsForm.date) { toast(S.tTsFieldsRequired, "info"); return; }
    const hours = Number(tsForm.hours);
    if (!Number.isFinite(hours) || hours <= 0) { toast(S.tHoursPositive, "info"); return; }
    const wo = workOrders.find((w) => w.id === tsForm.wo);
    const projectId = String(wo?.project ?? "");
    const rate = Number(wo?.rate || 0);
    const payload = {
      woId: tsForm.wo, employeeId: tsForm.employee, date: tsForm.date, hours, note: tsForm.note.trim(),
      projectId, rate, cost: Math.round(hours * rate),
      branch: branchOfEmployee(tsForm.employee),
    };
    if (tsEditId) {
      /* Koreksi timesheet: biaya dihitung ULANG dari tarif WO saat ini.
         Bila tarif berubah setelah pencatatan, angka kost ikut bergerak -
         itu benar karena termin dihitung dari timesheet × tarif. */
      const prev = timesheets.find((x) => String(x.id) === tsEditId);
      if (String(prev?.status ?? "Diajukan") === "Disetujui") {
        toast(
          locale === "en"
            ? `Timesheet ${tsEditId} is already approved - void it in the termin instead.`
            : `Timesheet ${tsEditId} sudah disetujui - void di termin.`,
          "info",
        );
        return;
      }
      await update("timesheets", tsEditId, { ...payload, status: String(prev?.status ?? "Diajukan") });
      log("mengubah timesheet", `${tsEditId} - ${hours} jam`, "Subkontraktor");
      toast(locale === "en" ? `Timesheet ${tsEditId} updated` : `Timesheet ${tsEditId} diperbarui`);
      setTsEditId(null);
    } else {
      const created = await add("timesheets", { ...payload, status: "Diajukan" }, { action: "mencatat timesheet", module: "Subkontraktor" });
      toast(S.tTsLogged.replace("{a}", created.id).replace("{b}", String(hours)));
    }
    setShowTs(false);
    setTsForm({ wo: "", employee: "", date: todayISO(), hours: "", note: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ==== UBAH / HAPUS TIMESHEET ==== */
  const openTsEdit = (t: StoreItem) => {
    setTsEditId(String(t.id));
    setTsForm({
      wo: String(t.woId ?? ""),
      employee: String(t.employeeId ?? ""),
      date: String(t.date ?? todayISO()),
      hours: String(Number(t.hours || 0)),
      note: String(t.note ?? ""),
    });
    setShowTs(true);
  };

  const confirmDelTs = async () => {
    if (!delTs) return;
    if (String(delTs.status ?? "Diajukan") === "Disetujui") {
      toast(
        locale === "en"
          ? `Timesheet ${delTs.id} is approved and already feeds the termin - void the termin instead.`
          : `Timesheet ${delTs.id} sudah disetujui dan sudah jadi dasar termin - void terminnya.`,
        "info",
      );
      return;
    }
    try {
      await remove("timesheets", String(delTs.id));
      log("menghapus timesheet", `${delTs.id} - ${String(delTs.hours ?? 0)} jam`, "Subkontraktor");
      toast(locale === "en" ? `Timesheet ${delTs.id} deleted` : `Timesheet ${delTs.id} dihapus`);
      setDelTs(null);
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
    const rate = parseRupiah(rateForm.rate);
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

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} dismiss={modAlert.dismiss} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiActiveSubs} value={String(subcontractors.filter((s) => s.status === "Aktif").length)} icon={<HardHat className="h-5 w-5" />} chip="navy" spark={subActiveTrend} hint={S.kpiActiveSubsHint} />
        <KpiCard label={S.kpiActiveContracts} value={fmtMiliar(subcontractors.reduce((s, x) => s + Number(x.contract || 0), 0))} icon={<FileSignature className="h-5 w-5" />} chip="teal" spark={subContractTrend} />
        <KpiCard label={S.kpiRunningWo} value={String(runningWo)} hint={S.kpiRunningWoHint} icon={<HardHat className="h-5 w-5" />} chip="amber" spark={woTrend} />
        <KpiCard label={S.kpiAvgRating} value={`${avgRating}%`} delta={S.kpiRatingDelta} deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" spark={ratingTrend} />
      </div>

      <div className="mt-4 card">
        {/* T6-SK9: tab Timesheet dihapus dari UI (data tetap di store).
            T6-SK1: evaluasi kinerja dihapus dari bawah tab. */}
        <Tabs tabs={["Subkontraktor", "Work Order", "Termin & Pembayaran", "Kepatuhan K3"]} active={tab} onChange={setTab} labels={{ Subkontraktor: S.tabSub, "Work Order": S.tabWo, "Termin & Pembayaran": S.tabTermin, "Kepatuhan K3": S.tabK3 }} />
        <div className="p-4">
          {tab === "Subkontraktor" && (
            <div className="space-y-4">
              {/* T6-SK1: evaluasi kinerja dihapus dari UI (notes2). */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SearchBox
                  value={subQ}
                  onChange={setSubQ}
                  placeholder={S.subSearchPh}
                  ariaLabel={S.subSearchAria}
                  className="min-w-52 flex-1 sm:max-w-xs"
                />
                {/* T6-SK3: filter hanya status; semua status langsung tampil di select. */}
                <select className="input w-auto py-1.5 text-sm" value={subStatus} onChange={(e) => setSubStatus(e.target.value)} aria-label={S.statusLabel}>
                  {["Semua", "Aktif", "Kualifikasi", "Blacklist", "Nonaktif"].map((s) => <option key={s} value={s}>{s === "Semua" ? S.allStatus : s}</option>)}
                </select>
                {(subQ.trim() !== "" || subStatus !== "Semua") && (
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
                    {subUsages(s).length === 0 ? (
                      <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelSub(s)}>{locale === "en" ? "Delete" : "Hapus"}</button>
                    ) : (
                      <span className="text-xs text-steel-400" title={subUsages(s).join(", ")}>{locale === "en" ? "Locked" : "Terkunci"}</span>
                    )}
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
                          {/* T6-SK2: detail WO = subkon + proyek + kapal. */}
                          <p className="truncate font-medium text-navy-900" title={String(w.sub)}>{w.sub}</p>
                          <p className="truncate text-xs" title={`${String(w.project)} · ${String(vesselOfProject(String(w.project)))}`}>
                            {String(w.project)} · {String(vesselOfProject(String(w.project)))}
                          </p>
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
                        {/* SPK resmi. Hanya dari server: dokumen ini dirakit dari
                            baris work order + kontrak subkontraktor, jadi mesin
                            lokal lama tidak punya cacah untuk dokumen ini. */}
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => void printSpk(w)}
                          title={locale === "en" ? "Print the work order (SPK)" : "Cetak Surat Perintah Kerja"}
                        >
                          {locale === "en" ? "SPK" : "SPK"}
                        </button>
                        {w.status !== "Selesai" && (
                          <button className="btn-secondary text-xs" aria-label={locale === "en" ? `Milestones for ${w.id}` : `Milestone ${w.id}`} onClick={() => { setWoMsFor(w); setWoMsForm({ title: "", pct: "", due: "" }); }}>
                            {locale === "en" ? "Milestones" : "Milestone"}
                          </button>
                        )}
                        {w.status !== "Selesai" && (
                          <button className="btn-secondary text-xs" aria-label={S.updateProgAria.replace("{n}", w.id)} onClick={() => { setWoProg(w); setProgMs(doneMsOf(w)); setProgNote(""); setProgPct(String(effProgress(w))); setProgPhotoUrl(String(w.photoUrl ?? "")); }}>{S.updateBtn}</button>
                        )}
                        {w.status !== "Selesai" && canEditWo() && (
                          <button className="btn-secondary text-xs" aria-label={`${locale === "en" ? "Edit" : "Ubah"} ${w.id}`} onClick={() => openWoEdit(w)}>{locale === "en" ? "Edit" : "Ubah"}</button>
                        )}
                        {Number(w.progress || 0) < 100 && w.targetDate && daysLate(String(w.targetDate)) > 0 && !w.penaltyAt && (
                          <button className="btn-secondary text-xs" aria-label={S.logPenaltyAria.replace("{n}", w.id)} onClick={() => recordPenalty(w)}>{S.logPenaltyBtn}</button>
                        )}
                        {woUsages(w).length === 0 ? (
                          <button className="btn-secondary text-xs text-rose-600" aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${w.id}`} onClick={() => setDelWo(w)}>{locale === "en" ? "Delete" : "Hapus"}</button>
                        ) : (
                          <span className="text-xs text-steel-400" title={woUsages(w).join(", ")}>{locale === "en" ? "Locked" : "Terkunci"}</span>
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
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                  {(["Draf", "Diajukan", "Disetujui", "Lunas", "Retensi Released"] as const).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-full border border-steel-200 bg-white px-2 py-0.5 font-semibold text-steel-600">
                      <Badge tone={toneMap[normTerm(s)] ?? "gray"}>{normTerm(s)}</Badge>
                      {payments.filter((t) => normTerm(String(t.status ?? "")) === normTerm(s)).length}
                    </span>
                  ))}
                  <span className="text-steel-400">Draf → Diajukan → Disetujui → Lunas (+hutang & retensi) → Retensi Released (WO Selesai + BA)</span>
                </div>
              </div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowTerm(true)}><Plus className="h-3.5 w-3.5" /> {S.proposeTerminBtn}</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label={locale === "en" ? "Project" : "Proyek"} sortKey="project" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortSub} sortKey="sub" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortWoProg} sortKey="wo" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortValue} sortKey="nilai" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortRetensi} sortKey="retensi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortNeto} sortKey="neto" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.actionLabel}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(payments, sort, (p, key) =>
                      key === "createdAt" ? (createdAtOf(p) ?? "") : key === "updatedAt" ? (lastTouchedAt(p) ?? "") : key === "termin" ? String(p.id ?? "") : key === "sub" ? String(p.sub ?? "") : key === "wo" ? String(p.woId ?? p.progress ?? "") : key === "nilai" ? Number(p.amount ?? 0) : key === "pph" ? Number(p.amount ?? 0) * pphOf(p, pphDefault) / 100 : key === "retensi" ? Number(p.amount ?? 0) * retOf(p) / 100 : key === "neto" ? netoOf(p, pphDefault) : key === "tanggal" ? String(p.date ?? "") : String(p.status ?? "")
                    ).map((p) => {
                      const wo = workOrders.find((w) => w.id === p.woId);
                      const canRelease = normTerm(p.status) === "Lunas" && retOf(p) > 0 && wo?.status === "Selesai";
                      /* T6-SK6: kolom tabel termin disederhanakan.
                         Proyek diambil dari WO bila ada. */
                      const proj = wo ? String(wo.project ?? "") : String(p.project ?? "");
                      return (
                      <tr key={p.id} id={notifRowId(String(p.id))} className={rowHighlightClass({ id: String(p.id), flash, notified: notified.has(String(p.id)), base: "hover:bg-surface" })}>
                        <td className="td font-mono text-xs text-steel-600 truncate" title={proj}>{proj || "-"}</td>
                        <td className="td text-steel-600 truncate" title={String(p.sub)}>{p.sub}</td>
                        <td className="td font-mono text-xs text-steel-500">{p.progress}{p.milestone ? <span className="block text-steel-400">{S.msPrefix.replace("{n}", String(p.milestone))}</span> : null}
                          {/* T6-SK7: tampilkan skema termin bila ada. */}
                          {String(p.scheme ?? "") !== "" && <span className="block text-[11px] text-steel-400">{S.schemeLabel.replace("{n}", String(p.scheme))}</span>}
                        </td>
                        <td className="td font-semibold">{fmtMiliar(p.amount)}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.amount || 0) * retOf(p) / 100)} <span className="text-xs text-steel-400">({retOf(p)}%)</span></td>
                        <td className="td font-semibold text-emerald-600">{fmtRupiah(netoOf(p, pphDefault))}</td>
                        <td className="td">
                          <div className="mb-1 max-w-44"><FlowStrip steps={["Draf", "Diajukan", "Disetujui", "Lunas"]} current={normTerm(p.status) === "Retensi Released" ? "Lunas" : normTerm(p.status)} ariaLabel={`Alur termin ${p.id}`} /></div>
                          <Badge tone={toneMap[normTerm(p.status)] ?? "gray"}>{normTerm(p.status)}</Badge>
                          {(() => {
/* Checklist dokumen pembayaran. Invoice & BAST dibaca dari field yang
                               sama dengan yang dipakai form bayar - sebelumnya
                               `withholdingRef` (bukti potong PPh) ikut
                               dipakai sebagai penanda invoice ada, sehingga
                               checklist hijau padahal invoice belum ada. */
                             const docs = [
                               { label: locale === "en" ? "Invoice" : "Invoice", done: String(p.invoiceNo ?? "").trim() !== "" },
                               { label: "BAST", done: String(p.bastNo ?? "").trim() !== "" },
                               { label: locale === "en" ? "Withholding proof" : "Bukti potong", done: String(p.withholdingRef ?? "").trim() !== "" },
                               { label: locale === "en" ? "Payment receipt" : "Bukti bayar", done: String(p.proofUrl ?? "").trim() !== "" || String(p.paidAt ?? "").trim() !== "" },
                             ];
                            return (
                              <div className="mt-1 space-y-0.5">
                                {docs.map((d) => (
                                  <p key={d.label} className="text-[11px] text-steel-500">{d.done ? "✓" : "○"} {d.label}</p>
                                ))}
                              </div>
                            );
                          })()}
                          {String(p.proofUrl ?? "") !== "" && (
                            <div className="mt-1">
                              <DocumentPreviewCell
                                doc={{
                                  title: `${locale === "en" ? "Receipt" : "Bukti bayar"} ${p.id}`,
                                  subtitle: p.paidRef ? String(p.paidRef) : undefined,
                                  fileUrl: String(p.proofUrl),
                                }}
                              />
                            </div>
                          )}
                          {/* S2: pratinjau berkas invoice & BAST bila ada. */}
                          {String(p.invoiceFileUrl ?? "") !== "" && (
                            <div className="mt-1">
                              <DocumentPreviewCell doc={{ title: `${locale === "en" ? "Invoice" : "Invoice"} ${String(p.invoiceNo ?? p.id)}`, fileUrl: String(p.invoiceFileUrl) }} />
                            </div>
                          )}
                          {String(p.bastFileUrl ?? "") !== "" && (
                            <div className="mt-1">
                              <DocumentPreviewCell doc={{ title: `${locale === "en" ? "BAST" : "BAST"} ${String(p.bastNo ?? p.id)}`, fileUrl: String(p.bastFileUrl) }} />
                            </div>
                          )}
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
                            {/* Kwitansi hanya sah untuk termin yang sudah dibayar.
                                Termin yang belum Lunas tidak punya nominal final -
                                PPh dan retensi masih bisa berubah - sehingga
                                kwitansi saat itu akan bertanggal dengan angka yang
                                belum final. */}
                            {normTerm(String(p.status)) === "Lunas" && (
                              <RowAction
                                icon={Receipt}
                                tone="neutral"
                                label={locale === "en"
                                  ? "Settlement statement with the PPh, retention, and penalty breakdown"
                                  : "Kuitansi dengan rincian PPh, retensi, dan denda"}
                                ariaLabel={`${locale === "en" ? "Print receipt" : "Cetak kwitansi"} ${p.id}`}
                                onClick={() => void printKwitansi(p)}
                              />
                            )}
                            {normTerm(String(p.status)) === "Draf" && (
                              <>
                                <RowAction icon={Pencil} tone="neutral" label={locale === "en" ? "Edit" : "Ubah"} ariaLabel={`${locale === "en" ? "Edit" : "Ubah"} ${p.id}`} onClick={() => openTermEdit(p)} />
                                {/* Hapus termin hanya sah saat masih Draf. Modul ini
                                    sebelumnya sama sekali tidak punya remove(), jadi
                                    termin salah nominal pun nyangkut selamanya. Setelah
                                    Disetujui termin sudah jadi dokumen pembayaran dan
                                    tidak boleh hilang tanpa pembatalan. */}
                                <RowAction icon={Trash2} tone="danger" label={locale === "en" ? "Delete" : "Hapus"} ariaLabel={`${locale === "en" ? "Delete" : "Hapus"} ${p.id}`} onClick={() => setDelTerm(p)} />
                              </>
                            )}
                            {normTerm(String(p.status)) === "Lunas" && retOf(p) > 0 && (
                              <span className="text-xs text-steel-400" title={locale === "en"
                                ? `Retention of ${fmtRupiah(Number(p.amount || 0) * retOf(p) / 100)} is still held - release it before deleting.`
                                : `Retensi ${fmtRupiah(Number(p.amount || 0) * retOf(p) / 100)} masih tertahan - lepaskan dulu sebelum menghapus.`}>
                                {locale === "en" ? "Locked" : "Terkunci"}
                              </span>
                            )}
                            {termNext(p.status).length === 0 && !canRelease && normTerm(String(p.status)) !== "Draf" && normTerm(String(p.status)) !== "Lunas" && <span className="text-xs text-steel-400">-</span>}
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
                    <MoneyInput className="input" value={rateForm.rate} onChange={(v) => setRateForm({ ...rateForm, rate: v })} placeholder={S.ratePh} />
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
                          <div className="flex flex-wrap gap-1.5">
                            {String(t.status ?? "Diajukan") !== "Disetujui"
                              ? <button className="btn-primary text-xs" aria-label={S.approveAria.replace("{n}", t.id)} onClick={() => approveTimesheet(t)}>{S.approveBtn}</button>
                              : null}
                            {/* Ubah/Hapus timesheet. Dulu tabelnya hanya punya
                                Setujui. Timesheet yang jamnya salah ketik (paling
                                sering - workforce submits by paper) tidak bisa
                                dikoreksi, dan yang sudah Disetujui sudah jadi
                                dasar termin, jadi tidak bisa dihapus. */}
                            {String(t.status ?? "Diajukan") !== "Disetujui" && (
                              <>
                                <RowAction icon={Pencil} tone="neutral" label={locale === "en" ? "Edit" : "Ubah"} ariaLabel={`${locale === "en" ? "Edit" : "Ubah"} ${String(t.id)}`} onClick={() => openTsEdit(t)} />
                                <RowAction icon={Trash2} tone="danger" label={locale === "en" ? "Delete" : "Hapus"} ariaLabel={`${locale === "en" ? "Delete" : "Hapus"} ${String(t.id)}`} onClick={() => setDelTs(t)} />
                              </>
                            )}
                            {String(t.status ?? "Diajukan") === "Disetujui" && (
                              <span className="text-xs text-steel-400" title={locale === "en"
                                ? "Already approved - changes would invalidate the termin it feeds."
                                : "Sudah disetujui - perubahan membatalkan termin yang turun dari timesheet ini."}>
                                {locale === "en" ? "Locked" : "Terkunci"}
                              </span>
                            )}
                          </div>
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
                <FlowStrip steps={["Kualifikasi", "Aktif", "Blacklist"]} current={subcontractors.some((s) => normSub(s.status) === "Blacklist") ? "Blacklist" : subcontractors.some((s) => normSub(s.status) === "Aktif") ? "Aktif" : "Kualifikasi"} ariaLabel={locale === "en" ? "Compliance flow" : "Alur kepatuhan"} />
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-steel-500">
                  <span><Badge tone="amber">Kualifikasi</Badge> {subcontractors.filter((s) => normSub(s.status) === "Kualifikasi").length}</span>
                  <span><Badge tone="green">Aktif</Badge> {subcontractors.filter((s) => normSub(s.status) === "Aktif").length}</span>
                  <span><Badge tone="red">Blacklist</Badge> {subcontractors.filter((s) => normSub(s.status) === "Blacklist").length}</span>
                  <span>K3: <Badge tone="green">Patuh (A+/A)</Badge> <Badge tone="amber">Cukup (B+/B)</Badge> <Badge tone="red">Perlu Bina (C)</Badge> · insiden proyek WO terkait menurunkan kepatuhan</span>
                </div>
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
                      <FlowStrip steps={["Kualifikasi", "Aktif", "Blacklist"]} current={normSub(s.status)} ariaLabel={locale === "en" ? "Subcontractor status" : "Status subkontraktor"} />
                      <p className="mt-1 text-[11px] text-steel-500">Grade K3 {String(s.k3)} → skor {k3Score(s.k3)} · {complianceOf(s.k3).label} · {list.length} insiden terkait WO</p>
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
            <Field label={S.contractAmountLabel}><MoneyInput className="input" value={subForm.contract} onChange={(v) => setSubForm({ ...subForm, contract: v })} /></Field>
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
            <Field label={S.bgValueLabel}><MoneyInput className="input" value={subForm.bgValue} onChange={(v) => setSubForm({ ...subForm, bgValue: v })} placeholder={S.bgValuePh} /></Field>
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
          <Field label={S.amountLabel}><MoneyInput className="input" value={termEditForm.amount} onChange={(v) => setTermEditForm({ ...termEditForm, amount: v })} /></Field>
        </div>
      </Modal>

      {/* Modal progres WO = milestone checklist + input numerik (tanpa slider, terintegrasi termin/timesheet) */}
      <Modal open={woProg !== null} onClose={() => setWoProg(null)} title={S.progTitle.replace("{n}", woProg?.id ?? "")}
        subtitle={woProg ? `${woProg.sub} · ${woProg.project} · saat ini ${effProgress(woProg)}%` : ""}
        footer={<><button className="btn-secondary" onClick={() => setWoProg(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveWoProgress}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          {(() => {
            /* Milestone yang dirender = milestone WO itu sendiri, sama persis
               dengan yang divalidasi `saveWoProgress`. Versi lama memakai
               `milestonesOf(sub)` (milestone SOW), jadi checklist yang tampil
               bisa punya judul yang tidak ada di WO: centangnya tidak pernah
               ikut dihitung dan progres tersimpan 0% tanpa pesan error.
               Milestone SOW tetap dipakai sebagai opsi termin di
               `terminMilestoneOptions` - dua hal berbeda. `sub` masih dipakai
               di bawah untuk nilai kontrak pada jalur numerik. */
            const sub = woProg ? subcontractors.find((s) => sameName(s.name, String(woProg.sub ?? ""))) : undefined;
            const ms = woProg ? woMilestonesOf(woProg) : [];
            const woHours = woProg ? hoursByWo(String(woProg.id)) : 0;
            const woRate = Number(woProg?.rate || 0);
            if (ms.length === 0) {
              return (
                <>
                  <Field label={locale === "en" ? "Actual progress (numeric 0-100)" : "Progres aktual (numerik 0-100)"} hint={locale === "en" ? `No WO milestones — numeric feeds termin cap (${fmtRupiah(Number(sub?.contract || 0) * Number(progPct || 0) / 100)}) & WO status` : `Tanpa milestone WO — angka ini mengisi cap termin (${fmtRupiah(Number(sub?.contract || 0) * Number(progPct || 0) / 100)}) & status WO`}>
                    <NumInput min={0} max={100} className="input" value={progPct} onChange={(e) => setProgPct(e.target.value)} placeholder="0-100" />
                  </Field>
                  <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
                    {locale === "en" ? `Timesheet ${woHours}h${woRate > 0 ? ` × ${fmtRupiah(woRate)}` : ""} kept separate as cost reference; progress stays manual until WO milestones exist.` : `Timesheet ${woHours} jam${woRate > 0 ? ` × ${fmtRupiah(woRate)}` : ""} tetap jadi referensi biaya; progres manual sampai milestone WO dibuat.`}
                  </p>
                </>
              );
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
                    ? `Progress = sum of completed milestone weights = ${Math.min(100, total)}% (two-way synced with Paid terms → WO ${woProg?.id}, timesheet ${woHours}h)`
                    : `Progres = jumlah bobot milestone selesai = ${Math.min(100, total)}% (sinkron dua arah dengan termin Lunas → WO ${woProg?.id}, timesheet ${woHours} jam)`}
                </p>
                <p className="text-[11px] text-steel-500">Centang milestone = update numerik otomatis. Sinkron ke cap termin & status WO (100% → Selesai).</p>
              </>
            );
          })()}
          <Field label={S.noteLabel} hint={S.progNoteHint}>
            <input className="input" value={progNote} onChange={(e) => setProgNote(e.target.value)} placeholder={S.progNotePh} />
          </Field>
          {/* T6-SK4: foto progres WO. */}
          <Field label={locale === "en" ? "Progress photo" : "Foto progres"}>
            <div className="flex flex-wrap items-center gap-2">
              <FileUploadButton
                label={locale === "en" ? "Upload photo" : "Unggah foto"}
                accept=".png,.jpg,.jpeg"
                onUploaded={(u) => setProgPhotoUrl(u)}
              />
              {progPhotoUrl.trim() !== "" && (
                <DocumentPreviewCell doc={{ title: locale === "en" ? "Progress photo" : "Foto progres", fileUrl: progPhotoUrl }} />
              )}
            </div>
          </Field>
          {/* T6-SK4: historikal edit progres sebelumnya. */}
          {(() => {
            const hist = Array.isArray(woProg?.history) ? (woProg!.history as Array<Record<string, unknown>>) : [];
            if (hist.length === 0) return null;
            return (
              <div className="rounded-lg border border-steel-100 bg-surface p-2.5">
                <p className="mb-1 text-[11px] font-semibold text-navy-900">
                  {locale === "en" ? "Progress history" : "Historikal progres"}
                </p>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {[...hist].reverse().map((h, i) => (
                    <li key={i} className="text-[11px] text-steel-600">
                      {fmtTanggal(String(h.at ?? ""))} · {String(h.by ?? "-")} · {String(h.from ?? "")}% → {String(h.progress ?? "")}%
                      {h.note ? ` · ${String(h.note)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* Konfirmasi WO selesai 100% */}
      <ConfirmModal
        open={confirmFinish !== null}
        title={S.finishTitle.replace("{n}", confirmFinish?.id ?? "")}
        desc={S.finishDesc}
        confirmLabel={S.finishConfirmBtn}
        onCancel={() => setConfirmFinish(null)}
        onConfirm={() => { if (confirmFinish) applyWoProgress(confirmFinish.id, confirmFinish.v, confirmFinish.note, confirmFinish.ms, confirmFinish.milestones); setConfirmFinish(null); setWoProg(null); setProgMs([]); setProgNote(""); setProgPct(""); }}
      />

      {/* S3: modal kelola milestone PER WO (milestone milik work order itu sendiri) */}
      <Modal open={woMsFor !== null} onClose={() => setWoMsFor(null)}
        title={locale === "en" ? `WO Milestones - ${woMsFor?.id ?? ""}` : `Milestone WO - ${woMsFor?.id ?? ""}`}
        subtitle={locale === "en" ? "Milestones owned by this work order (not the subcontractor SOW)." : "Milestone milik work order ini (bukan SOW subkontraktor)."}
        footer={<>
          <button className="btn-secondary" onClick={() => setWoMsFor(null)}>{S.cancelBtn}</button>
          <button className="btn-primary" onClick={() => void saveWoMilestone()}>{locale === "en" ? "Add milestone" : "Tambah milestone"}</button>
        </>}>
        <div className="space-y-3">
          <div className="space-y-2">
            {(woMsFor ? woMilestonesOf(woMsFor) : []).map((m, idx) => (
              <div key={`${m.title}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-steel-100 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">{m.title}</p>
                  <p className="text-xs text-steel-500">{m.pct}% · {m.due ? fmtTanggal(m.due) : "-"}</p>
                </div>
                <button className="btn-secondary text-xs text-rose-600" onClick={() => void removeWoMilestone(idx)}>{S.deleteBtn}</button>
              </div>
            ))}
            {(!woMsFor || woMilestonesOf(woMsFor).length === 0) && (
              <p className="text-sm text-steel-400">{locale === "en" ? "No milestones on this WO yet." : "Belum ada milestone di WO ini."}</p>
            )}
          </div>
          <FormGrid>
            <Field label={locale === "en" ? "Title" : "Judul"}>
              <input className="input" value={woMsForm.title} onChange={(e) => setWoMsForm({ ...woMsForm, title: e.target.value })} placeholder={locale === "en" ? "e.g. Fabrikasi section" : "cth: Fabrikasi section"} />
            </Field>
            <Field label={locale === "en" ? "Weight (%)" : "Bobot (%)"}>
              <NumInput min={1} className="input" value={woMsForm.pct} onChange={(e) => setWoMsForm({ ...woMsForm, pct: e.target.value })} placeholder="40" />
            </Field>
          </FormGrid>
          <Field label={locale === "en" ? "Due date" : "Tanggal jatuh tempo"}>
            <input type="date" className="input" value={woMsForm.due} onChange={(e) => setWoMsForm({ ...woMsForm, due: e.target.value })} />
          </Field>
        </div>
      </Modal>

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
          <Field label={S.termAmountLabel}><MoneyInput className="input" value={termForm.amount} onChange={(v) => setTermForm({ ...termForm, amount: v })} /></Field>
          <FormGrid>
            {/* T6-SK7: skema termin - persentase / DP-Termin / Kontan. */}
            <Field label={locale === "en" ? "Payment scheme" : "Skema termin"}>
              <select className="input" value={termForm.scheme} onChange={(e) => setTermForm({ ...termForm, scheme: e.target.value })}>
                <option value="Persentase">{locale === "en" ? "Percentage" : "Persentase"}</option>
                <option value="DP/Termin">DP / Termin</option>
                <option value="Kontan">{locale === "en" ? "Cash" : "Kontan"}</option>
              </select>
            </Field>
            <Field label={locale === "en" ? "Tax (%)" : "Pajak (%)"}>
              <select className="input" value={termForm.pphPct} onChange={(e) => setTermForm({ ...termForm, pphPct: e.target.value })}>
                {/* T6-SK8: label "Pajak" (client); nilai tetap pphPct di store. */}
                {PPH_SUBKON_OPTIONS.map((rate) => (
                  <option key={rate} value={String(rate)}>
                    {rate}%{rate === 0.5 ? (locale === "en" ? " Final" : " Final") : " PPh 23"}
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
        footer={<><button className="btn-secondary" onClick={() => setTermPay(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" disabled={(needsTermDirector(termPay) && (!termDirCheck || !termDirName.trim()))} onAction={confirmBuktiTerm}>{S.saveProofBtn}</AsyncButton></>}>
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
          <FormGrid>
            <Field label={S.invoiceNoLabel} hint={S.invoiceNoHint}>
              <input className="input font-mono" value={proofDocs.invoiceNo} onChange={(e) => setProofDocs({ ...proofDocs, invoiceNo: e.target.value })} placeholder={S.invoiceNoPh} />
            </Field>
            <Field label={S.bastNoLabel} hint={S.bastNoHint}>
              <input className="input font-mono" value={proofDocs.bastNo} onChange={(e) => setProofDocs({ ...proofDocs, bastNo: e.target.value })} placeholder={S.bastNoPh} />
            </Field>
          </FormGrid>
          {/* S2: unggah berkas invoice & BAST di samping nomor teks. */}
          <FormGrid>
            <Field label={locale === "en" ? "Invoice file" : "Berkas invoice"}>
              <div className="flex flex-wrap items-center gap-2">
                <FileUploadButton
                  label={locale === "en" ? "Upload invoice" : "Unggah invoice"}
                  accept=".png,.jpg,.jpeg,.pdf"
                  onUploaded={(u) => setInvoiceFileUrl(u)}
                />
                {invoiceFileUrl.trim() !== "" && (
                  <DocumentPreviewCell doc={{ title: `${locale === "en" ? "Invoice" : "Invoice"} ${proofDocs.invoiceNo || String(termPay?.id ?? "")}`, fileUrl: invoiceFileUrl }} />
                )}
              </div>
            </Field>
            <Field label={locale === "en" ? "BAST file" : "Berkas BAST"}>
              <div className="flex flex-wrap items-center gap-2">
                <FileUploadButton
                  label={locale === "en" ? "Upload BAST" : "Unggah BAST"}
                  accept=".png,.jpg,.jpeg,.pdf"
                  onUploaded={(u) => setBastFileUrl(u)}
                />
                {bastFileUrl.trim() !== "" && (
                  <DocumentPreviewCell doc={{ title: `${locale === "en" ? "BAST" : "BAST"} ${proofDocs.bastNo || String(termPay?.id ?? "")}`, fileUrl: bastFileUrl }} />
                )}
              </div>
            </Field>
          </FormGrid>
          <Field
            label={locale === "en" ? "Payment receipt (file)" : "Bukti bayar (berkas)"}
            hint={locale === "en"
              ? "Optional - photo of the transfer slip or bank PDF. The reference above stays for reconciliation."
              : "Opsional - foto struk transfer atau PDF mutasi bank. Nomor referensi di atas tetap dipakai untuk rekonsiliasi."}
          >
            <div className="flex flex-wrap items-center gap-2">
              <FileUploadButton
                label={locale === "en" ? "Upload receipt" : "Unggah bukti"}
                accept=".png,.jpg,.jpeg,.pdf"
                onUploaded={(u) => setProofUrl(u)}
              />
              {proofUrl.trim() !== "" && (
                <DocumentPreviewCell doc={{ title: `${locale === "en" ? "Receipt" : "Bukti bayar"} ${termPay?.id ?? ""}`, fileUrl: proofUrl }} />
              )}
            </div>
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

      {/* Modal timesheet - dipakai untuk catat baru maupun koreksi */}
      <Modal open={showTs} onClose={() => { setShowTs(false); setTsEditId(null); }} title={tsEditId ? `${locale === "en" ? "Edit" : "Ubah"} ${S.tsTitle}` : S.tsTitle}
        footer={<><button className="btn-secondary" onClick={() => { setShowTs(false); setTsEditId(null); }}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveTimesheet}>{S.saveBtn}</button></>}>
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

      <ConfirmModal
        open={delSub !== null}
        title={delSub ? (locale === "en" ? `Delete subcontractor ${String(delSub.name ?? "")}?` : `Hapus subkontraktor ${String(delSub.name ?? "")}?`) : ""}
        desc={delSub ? (subUsages(delSub).length > 0
          ? (locale === "en"
            ? `Still referenced in ${subUsages(delSub).join(", ")} - deletion is blocked.`
            : `Masih dirujuk di ${subUsages(delSub).join(", ")} - penghapusan diblokir.`)
          : (locale === "en"
            ? `${String(delSub.services ?? "")} with ${milestonesOf(delSub).length} milestone(s) will be removed.`
            : `${String(delSub.services ?? "")} beserta ${milestonesOf(delSub).length} milestone akan dihapus.`)) : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        confirmDisabled={delSub ? subUsages(delSub).length > 0 : false}
        onCancel={() => setDelSub(null)}
        onConfirm={confirmDelSub}
      />

      <ConfirmModal
        open={delWo !== null}
        title={delWo ? (locale === "en" ? `Delete work order ${String(delWo.id)}?` : `Hapus work order ${String(delWo.id)}?`) : ""}
        desc={delWo ? (woUsages(delWo).length > 0
          ? (locale === "en"
            ? `Still referenced in ${woUsages(delWo).join(", ")} - deletion is blocked.`
            : `Masih dirujuk di ${woUsages(delWo).join(", ")} - penghapusan diblokir.`)
          : (locale === "en"
            ? `${String(delWo.scope ?? "")} at ${effProgress(delWo)}% progress will be removed.`
            : `${String(delWo.scope ?? "")} dengan progres ${effProgress(delWo)}% akan dihapus.`)) : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        confirmDisabled={delWo ? woUsages(delWo).length > 0 : false}
        onCancel={() => setDelWo(null)}
        onConfirm={confirmDelWo}
      />

      {/* Konfirmasi hapus timesheet */}
      <ConfirmModal
        open={delTs !== null}
        title={delTs ? `${locale === "en" ? "Delete timesheet" : "Hapus timesheet"} ${String(delTs.id)}?` : ""}
        desc={delTs
          ? (locale === "en"
            ? `${String(delTs.hours ?? 0)}h on ${fmtTanggal(delTs.date)} will be removed and the termin estimate recalculated.`
            : `${String(delTs.hours ?? 0)} jam pada ${fmtTanggal(delTs.date)} akan dihapus dan estimasi termin dihitung ulang.`)
          : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelTs(null)}
        onConfirm={confirmDelTs}
      />

      {/* Konfirmasi hapus termin */}
      <ConfirmModal
        open={delTerm !== null}
        title={delTerm ? `${locale === "en" ? "Delete termin" : "Hapus termin"} ${String(delTerm.id)}?` : ""}
        desc={delTerm ? (locale === "en"
          ? `Termin ${String(delTerm.id)} for ${fmtRupiah(Number(delTerm.amount || 0))} is still a draft, so nothing has been paid against it yet.`
          : `Termin ${String(delTerm.id)} senilai ${fmtRupiah(Number(delTerm.amount || 0))} masih draf, jadi belum ada pembayaran yang tercatat.`)
          : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelTerm(null)}
        onConfirm={confirmDelTerm}
      />
    </div>
  );
}