import { useState, useEffect, useMemo } from "react";
import { useAuth, canSetTarget } from "../../auth/auth";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Plus, Trash2, FileDown, Eye, Pencil } from "lucide-react";
import {
  Card,
  CardHeader,
  PageHeader,
  StatusBadge,
  ProgressBar,
  Tabs,
  KpiCard,
  Modal,
  Field,
  FormGrid,
  ConfirmModal,
  Badge,
  toast,
  Avatar,
  SecureImg,
  SortTh,
  toggleSort,
  sortRows,
  NumInput,
  FileUploadButton,
  AsyncButton,
  RowAction,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useBusy } from "../../components/ui";
import BoQSection from "./BoQSection";
import ReportSection from "./ReportSection";
import SparepartServiceSection from "./SparepartServiceSection";
import { useStore } from "../../data/store";
import type { StoreItem, WbsItem, CollectionKey } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { DocumentPreviewCell, DocumentPreviewPanel, DownloadFileButton, InlineDocPreview } from "../../components/DocumentPreview";
import { docAttachment, looksLikeUrl } from "../../utils/docAttachment";
import { DOC_TYPES, NEEDS_QC_LINK, qcCertCandidates, subTypesOf } from "../../utils/docTypes";
import { useT } from "../../i18n/LanguageContext";
import { n_prj } from "../../i18n/n_prj";
import { fmtMiliar, fmtTanggal, fmtRentang, fmtBulan } from "../../data";
import { fmtRupiah, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { pdfServerReady } from "../../services/pdfClient";
import { usePdfDoc } from "../../components/usePdfDoc";
import { canonPrioritas, scopeList } from "../../utils/scope";
import { equipmentCostSummary } from "../../utils/projectCost";
import { employeeOptions } from "../../utils/employeeOptions";
import { delayDaysOf, shouldAutoSetLate, shouldClearOverride } from "../../utils/projectDelay";
import { generateRisksFromWbs, generateRisksFromWo } from "../../utils/riskAuto";
import { EntityPicker, SearchBox, rowMatches } from "../../components/ui";
import { PRIORITAS } from "./Projects";
import { TAHAP, tahapOf, hasContract, isOverdue } from "./Projects";
import { getSetting } from "../../utils/settings";
import { sbInvoiceMath, PPN_INVOICE_DEFAULT, PPH_JASA_DEFAULT } from "../../utils/sb";
import { exportExcel } from "../../utils/export";

/* "Dalam Proses" = status default proyek baru (ProjectAddModal). Tanpa baris
   ini, <select> status tidak punya <option> yang cocok untuk proyek-proyek itu
   dan merender kosong -pengguna tidak pernah melihat statusnya sendiri. */
const STATUS = ["Sedang Berjalan", "Dalam Proses", "Tertunda", "Batal", "Selesai", "Terlambat"];
const RISK_LEVEL = ["Rendah", "Sedang", "Tinggi"];
const STATIONS = ["Cutting", "Bending", "Welding", "Panel", "Block", "Erection", "Alignment", "Launching"];

type WbsExt = WbsItem & { predecessor?: string };
interface WbsBaseline { at: string; wbs: WbsExt[]; }

/* Resolusi lampiran memakai utils/docAttachment (satu sumber untuk semua modul).
   Versi lokal dulu mencoba `d.fileName` LEBIH DAHULU - padahal fileName itu
   metadata nama berkas ("kontrak-kerja.pdf"), bukan URL. Akibatnya dokumen
   yang lampirannya diisi manual meminta GET /kontrak-kerja.pdf, sementara
   berkas di backend hanya dilayani di /files/*, jadi jawabannya 404 dan panel
   pratinjau hanya menampilkan "gagal memuat" tanpa sebab yang jelas.
   Sekarang kandidat URL dibaca lebih dulu, dan `looksLikeUrl` menolak nama
   berkas polos agar tidak salah dikira URL lagi. */
function docUrlOf(d: StoreItem): string {
  return docAttachment(d).url;
}

function docBaseName(d: StoreItem, url: string): string {
  const raw = docAttachment(d).fileName;
  const urlExt = docExtOf(url);
  const withExt = (name: string): string => {
    if (!urlExt) return name;
    // Pertahankan ekstensi asli: bila nama tanpa ekstensi, tempel dari URL.
    if (/\.[a-z0-9]+$/i.test(name)) return name;
    return `${name}.${urlExt}`;
  };
  if (raw && raw !== "-" && !/^(https?:|blob:|data:|\/)/i.test(raw)) return withExt(raw);
  const clean = url.split("?")[0].split("#")[0];
  const base = clean.split("/").pop() ?? "";
  if (base) return decodeURIComponent(base);
  return withExt(String(d.title ?? d.id ?? "dokumen"));
}

function docExtOf(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const m = /\.([a-z0-9]+)$/i.exec(clean);
  return (m?.[1] ?? "").toLowerCase();
}

/* Batch koleksi halaman detail proyek untuk useModuleSync. */
const PD_COLS: CollectionKey[] = ["activities", "projects", "documents", "bookings", "equipment", "maintenances"];

export default function ProjectDetail() {
  const busy = useBusy();
  const { locale } = useT();
  const S = n_prj[locale];
  const { id } = useParams();
  const { data, update, add, remove, wbsFor, setWbs, teamFor, setTeam, log } = useStore();
  /* D3: inventory diakses supaya material WBS bisa terhubung ke stok.
     Saat save WBS task dengan material terpilih, stok berkurang dan
     movement dicatat otomatis. */
  const invList = data.inventory ?? [];
  const { user: session } = useAuth();
  /* Printer PDF: BAST disusun server dari baris `bast` + relasi proyek/WO,
     jadi tidak ada jalur lokal untuk dokumen ini. */
  const pdfDoc = usePdfDoc();
  const printBastPdf = async (b: StoreItem): Promise<void> => {
    if (!pdfServerReady()) {
      toast(locale === "en" ? "Official PDF needs the server - connect the backend first." : "PDF resmi perlu server aktif - hubungkan backend dulu.", "info");
      return;
    }
    await pdfDoc.request({ kind: "bast", id: String(b.id), locale }, `BAST-${b.id}`, false);
  };
  const project = data.projects.find((p) => p.id === id) ?? data.projects[0];
  /* Fetch per-batch halaman (pengganti resync penuh): proyek + dokumen. */
  useModuleSync(PD_COLS);
  const [tab, setTab] = useState("Ringkasan");

  const [showScope, setShowScope] = useState(false);
  const [scopeVal, setScopeVal] = useState({ service: "", lokasi: "", deskripsi: "" });
  const [showDoc, setShowDoc] = useState(false);
  const [showActual, setShowActual] = useState(false);
  const [actualVal, setActualVal] = useState("");

  const saveActual = async () => {
    const v = Number(actualVal);
    if (!Number.isFinite(v) || v < 0) { toast(S.detToastActualInvalid, "info"); return; }
    try {
      await update("projects", pid, { actual: v });
      log("mencatat realisasi", `${pid} → ${fmtRupiah(v)}`, "Proyek");
      toast(S.detToastActualSaved.replace("{a}", fmtRupiah(v)));
      setShowActual(false);
      setActualVal("");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.detActualFail, "info");
    }
  };
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("Laporan");
  const [docSubType, setDocSubType] = useState("");
  const [docQcCertId, setDocQcCertId] = useState("");
  /* Penanggung jawab dokumen. Default-nya nama pengguna yang sedang login.
     Sebelumnya ditulis literal `"Anda"` - jadi semua dokumen yang dibuat dari
     tab proyek tercatatatasnama "Anda", dan kolom penanggung jawab di arsip
     tidak pernah menunjuk siapa pun. */
  const [docOwner, setDocOwner] = useState("");
  const [lastUploadedId, setLastUploadedId] = useState<string | null>(null);
  /* PD2: pratinjau dokumen kini lewat modal Detail (docDetail), bukan
     expand inline `openDocId`. `lastUploadedId` tetap dipakai untuk
     sorotan "Baru diunggah" di kartu. */
  /* Item 5c revisi 2 Oktober: tombol Excel per dokumen diganti Detail +
     modal. Export Excel untuk SATU dokumen memaksa pengguna mengunduh
     berkas 9 baris untuk hal yang sebenarnya bisa dibaca di layar - dan
     spreadsheet tidak pernah jadi tempat riwayat revisi. */
  const [docDetail, setDocDetail] = useState<StoreItem | null>(null);
  const [delScope, setDelScope] = useState<number | null>(null);
  /* Risiko, change order, trial, dan BAST dulu hanya punya tambah + ubah -
     tidak ada jalur hapus sama sekali, jadi record yang salah input (BAST
     salah milestone, risk yang dobel) nyangkut permanen di proyek. */
  const [delRec, setDelRec] = useState<{ kind: "risks" | "trials" | "changeOrders" | "bast"; row: StoreItem } | null>(null);
  const [showWbs, setShowWbs] = useState(false);
  const [wbsForm, setWbsForm] = useState({ task: "", start: "", end: "", weight: "10", progress: "0", predecessor: "" });
  const [showTeam, setShowTeam] = useState(false);
  const [teamPick, setTeamPick] = useState("");
  const [wbsTaskUpdate, setWbsTaskUpdate] = useState<string | null>(null);
  const [wbsUpdateForm, setWbsUpdateForm] = useState({ hours: "", material: "", status: "Sedang" as "Sedang" | "Selesai", progress: "", predecessor: "", station: "", photoNote: "", photoUrl: "", dft: "" });
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ docId: "", to: "" });
  const [statusPending, setStatusPending] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [tahapMove, setTahapMove] = useState<null | { dir: 1 | -1 }>(null);
  const [tahapReason, setTahapReason] = useState("");

  /* Ganti status kaku: konfirmasi + alasan wajib (NCR gate tetap untuk Selesai).
     P8: "Terlambat" kini bisa di-override manual. User mengubah status dari
     "Terlambat" ke sesuatu yang lain (atau ke "Terlambat" secara sadar) →
     tulis statusOverride supaya auto-logic tidak menulis balik. */
  const askStatus = (next: string) => {
    if (next === project.status) return;
    if (next === "Selesai" && project.status !== "Selesai") {
      // Aturan silang tahap×status: Selesai wajib tahap Handover.
      if (tahapOf(project) !== "Handover") { toast("Proyek hanya bisa Selesai pada tahap Handover", "info"); return; }
      const block = closeBlockReason();
      if (block) { toast(`Tutup proyek ditolak: ${block}`, "info"); return; }
      const openNcr = (data.ncr ?? []).filter((n) => n.project === pid && n.status !== "Tertutup");
      if (openNcr.length > 0) { toast(S.detToastNcrOpen.replace("{n}", String(openNcr.length)), "info"); return; }
      const itpHold = (data.inspections ?? []).filter((i) => i.project === pid && i.status === "NCR");
      if (itpHold.length > 0) { toast(S.detToastItp.replace("{n}", String(itpHold.length)), "info"); return; }
    }
    setStatusPending(next);
    setStatusReason("");
  };

  /* Prioritas proyek: dulu write-once (hanya ditulis ProjectAddModal), tidak
     bisa diubah di halaman mana pun padahal tampil sebagai badge & bisa difilter. */
  const savePrioritas = async (next: string) => {
    const cur = canonPrioritas(project.prioritas);
    if (next === cur) return;
    try {
      await update("projects", pid, { prioritas: next });
      log("mengubah prioritas proyek", `${pid} · ${cur} → ${next}`, "Proyek");
      toast(`${S.prjFieldPrioritas}: ${cur} → ${next}`);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

const confirmStatus = async () => {
      if (!statusPending) return;
      if (!statusReason.trim()) { toast(S.detToastReasonReq, "info"); return; }
      const next = statusPending;
      try {
        if (next === "Selesai" && project.status !== "Selesai") {
          const vsl = data.vessels.find((x) => x.name === project.vessel);
          if (vsl) {
            await update("vessels", vsl.id, {
              history: [...(vsl.history ?? []), { date: todayISO(), event: `Proyek ${pid} selesai - serah terima`, type: "Delivery" }],
              dockHistory: [...(vsl.dockHistory ?? []), { date: todayISO(), dock: "Galangan", scope: `Penyelesaian proyek ${pid}`, result: "Selesai", nextDue: todayISO() }],
            });
          }
          log("menyelesaikan proyek + history kapal", `${pid} · ${project.vessel} (alasan: ${statusReason.trim()})`, "Proyek");
        } else {
          log("mengubah status", `${pid} → ${next} (alasan: ${statusReason.trim()})`, "Proyek");
        }
        /* P8: override status. Kalau user memilih status berbeda dari yang
           ditulis auto-logic (khususnya keluar dari "Terlambat"), tulis
           statusOverride supaya useEffect tidak menulis balik. Override juga
           ditulis saat user sadar memilih "Terlambat" secara manual. */
        const wasLate = project.status === "Terlambat";
        const willBeLate = next === "Terlambat";
        const overridePatch: Record<string, unknown> = {};
        if (wasLate !== willBeLate) {
          overridePatch.statusOverride = { status: next, reason: statusReason.trim(), at: todayISO(), by: "Anda" };
        } else if (willBeLate && !wasLate) {
          overridePatch.statusOverride = { status: "Terlambat", reason: statusReason.trim(), at: todayISO(), by: "Anda" };
        }
        await update("projects", pid, { status: next, ...overridePatch });
        toast(S.detToastStatus.replace("{a}", next));
        setStatusPending(null);
        setStatusReason("");
      } catch (e) {
        toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /* Geser tahap kaku di detail: E1 gate + alasan wajib + tahapLog. */
  const confirmTahapMove = async () => {
    if (!tahapMove) return;
    if (!tahapReason.trim()) { toast(S.detToastReasonReq, "info"); return; }
    const idx = TAHAP.indexOf(tahapOf(project));
    const to = TAHAP[idx + tahapMove.dir];
    if (!to) { setTahapMove(null); return; }
    if (tahapMove.dir === 1) {
      const from = TAHAP[idx];
if (from === "Desain" && to === "Produksi") {
          /* D1: gate Class Approval pindah ke Documents. Cek apakah ada
             dokumen tipe Sertifikat + subType "Sertifikat Kelas" yang sudah
             Disetujui untuk proyek ini. Fallback ke designStages lama untuk
             data proyek yang belum punya dokumen Class Approval. */
          const classDoc = data.documents.find(
            (d) => d.project === pid && d.type === "Sertifikat" && d.subType === "Sertifikat Kelas" && d.status === "Disetujui",
          );
          const stages = (project.designStages ?? []) as { name: string; status: string }[];
          const ca = stages.find((s) => s.name === "Class Approval");
          const approved = Boolean(classDoc) || ca?.status === "Disetujui";
          if (!approved) { toast(S.detToastGate, "info"); return; }
        }
      // Gate kontrak: tahap awal dikunci bila proyek hasil konversi belum punya kontrak.
      if (idx <= 2 && project.quotationId && !hasContract(project, data.contracts ?? [])) {
        toast(`Tahap ${from} dikunci - buat kontrak untuk quotation ${project.quotationId} dulu`, "info");
        return;
      }
      // Aturan silang tahap×status: masuk Handover wajib lolos cek tutup proyek,
      // lalu status otomatis ikut Selesai (Handover wajib status Selesai).
      if (to === "Handover") {
        const block = closeBlockReason();
        if (block) { toast(`Masuk Handover ditolak: ${block}`, "info"); return; }
      }
    }
    try {
      await update("projects", pid, {
        tahap: to,
        ...(to === "Handover" && tahapMove.dir === 1 ? { status: "Selesai" } : {}),
        tahapLog: [...(project.tahapLog ?? []), { from: tahapOf(project), to, date: todayISO(), by: "Anda", reason: tahapReason.trim() }],
      });
      log(tahapMove.dir === 1 ? "memajukan tahap" : "menurunkan tahap", `${pid} → ${to} (alasan: ${tahapReason.trim()})${to === "Handover" && tahapMove.dir === 1 ? " + status Selesai" : ""}`, "Proyek");
      toast(S.detToastStage.replace("{a}", pid).replace("{b}", to));
      setTahapMove(null);
      setTahapReason("");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };
  const [showCo, setShowCo] = useState(false);
  /* D7: CO bisa revisi item BoQ yang ada atau menambah item BoQ baru.
     impact dihitung otomatis dari delta/total item, bukan angka bebas saja. */
  const [coForm, setCoForm] = useState({
    title: "", impact: "", requestedBy: "", date: "",
    boqAction: "none" as "none" | "revise" | "add",
    boqItemId: "",
    boqName: "", boqDesc: "", boqQty: "1", boqUnit: "pcs", boqPrice: "", boqSurat: "", boqCategory: "Mechanical",
  });
  const [docFile, setDocFile] = useState("");
  const [showDelBaseline, setShowDelBaseline] = useState(false);
  const [showBast, setShowBast] = useState(false);
  const [bastForm, setBastForm] = useState({ milestone: "", tanggal: todayISO(), signer: "", lampiran: "", amount: "" });
  const [showTrial, setShowTrial] = useState(false);
  const [trialForm, setTrialForm] = useState({ tanggal: todayISO(), parameter: "", punchList: "", hasil: "Lolos", baRef: "", kondisi: "Baik" as "Baik" | "Perlu Perbaiki" | "Rusak", checklist: [] as { wbsTask: string; done: boolean; note: string }[] });
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [wbsQ, setWbsQ] = useState("");
  /* Tiga tabel lain di halaman ini juga panjang: baseline WBS per tahap dan
     rincian biaya equipment (booking + maintenance). Satu state per tabel
     supaya mengetik di tabel A tidak menyaring tabel B yang kebetulan
     terlihat di layar yang sama. */
  const [baselineQ, setBaselineQ] = useState("");
  const [detailBkQ, setDetailBkQ] = useState("");
  const [cardBkQ, setCardBkQ] = useState("");
  const [cardMaintQ, setCardMaintQ] = useState("");
  const [breakdownMaintQ, setBreakdownMaintQ] = useState("");
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });
  /* Tabel rincian biaya equipment (card HPP equipment). */
  const [sort4, setSort4] = useState<SortState>({ key: null, dir: "asc" });

  const weightedProgress = (items: { progress: number; weight: number }[]): number => {
    const totalW = items.reduce((s, w) => s + Number(w.weight || 0), 0);
    if (totalW <= 0) return 0;
    return Math.round(items.reduce((s, w) => s + (Number(w.progress || 0) * Number(w.weight || 0)), 0) / totalW);
  };

  const createsCycle = (items: WbsExt[], task: string, pred: string): boolean => {
    const map = new Map(items.map((w) => [String(w.task), String(w.predecessor ?? "")]));
    let cur = pred;
    const seen = new Set<string>();
    while (cur) {
      if (cur === task) return true;
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = map.get(cur) ?? "";
    }
    return false;
  };

  const parseYM = (v: string): { y: number; m: number } | null => {
    const m = String(v ?? "").match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]) };
  };

  const monthEndDate = (v: string): Date | null => {
    const m = String(v ?? "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return null;
    return m[3] ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(Number(m[1]), Number(m[2]), 0);
  };

  useEffect(() => {
    if (!project) return;
    // Hanya proyek dengan WBS nyata (tersimpan) yang progresnya diturunkan
    // otomatis - template fallback tidak boleh menimpa progres seed/manual.
    if (!data.wbsByProject?.[project.id]) return;
    const wbs = wbsFor(project.id);
    const newProgress = weightedProgress(wbs);
    if (newProgress !== project.progress) {
      update("projects", project.id, { progress: newProgress });
    }
    // D8: risiko otomatis dari WBS dan milestone WO.
    // Dipanggil bersamaan dengan update progres karena keduanya membaca
    // data WBS yang sama - satu kali baca, dua kali manfaat.
    const today = todayISO();
    const msDays = getSetting(data, "ALERT_MILESTONE_DAYS", 7);
    const existingRisks = data.risks.filter((r) => r.project === project.id);
    const wbsResult = generateRisksFromWbs(project.id, wbs, existingRisks, today, msDays);
    const woResult = generateRisksFromWo(project.id, data.workOrders.filter((w) => w.project === project.id), existingRisks, today, msDays);
    for (const draft of [...wbsResult.add, ...woResult.add]) {
      void add("risks", draft, { action: "risiko otomatis dari WBS/WO", module: "Proyek" }).catch(() => {});
    }
    for (const id of [...wbsResult.close, ...woResult.close]) {
      void update("risks", id, { status: "Tertutup" }).catch(() => {});
    }
  }, [data.projects]);

// Terlambat otomatis dari due (P8: bisa di-override manual).
    useEffect(() => {
      if (!project) return;
      const today = todayISO();
      // Override sudah tidak relevan (mis. end diperbaiki) → clear.
      if (shouldClearOverride(project as Record<string, unknown>, today, isOverdue as (p: Record<string, unknown>, t: string) => boolean)) {
        void update("projects", project.id, { statusOverride: null }).catch(() => {});
      }
      // Auto-logic hanya menulis "Terlambat" kalau tidak ada override aktif.
      if (shouldAutoSetLate(project as Record<string, unknown>, today, isOverdue as (p: Record<string, unknown>, t: string) => boolean)) {
        /* .catch(() => {}) yang dulu dipakai di sini menelan kegagalan tanpa
           umpan balik: kalau backend menolak (403/422) atau offline, proyek
           tetap tampil Running padahal sebenarnya sudah lewat tanggal, dan
           tidak ada yang tahu kenapa. Sekarang error dikembalikan ke
           pendingSync - Monitoring sudah menampilkannya sebagai banner
           "Data belum tersinkron", jadi user tetap diberi tahu. */
        void update("projects", project.id, { status: "Terlambat" }).catch((err) => {
          log("gagal menandai proyek terlambat", `${project.id} · ${err instanceof Error ? err.message : String(err)}`, "Proyek");
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.status, project?.end, project?.progress, project?.statusOverride]);

  if (!project) return <p className="text-sm text-steel-500">{S.detNotFound}</p>;
  const pid = project.id;

  const wbs = wbsFor(pid) as WbsExt[];
  const teamIds = teamFor(pid);
  const team = data.employees.filter((e) => teamIds.includes(e.id));
  const vessel = data.vessels.find((v) => sameName(v.name, project.vessel));
  const invoices = data.invoices.filter((i) => i.project === pid);
  const ncrs = data.ncr.filter((n) => n.project === pid);

  /* Kandidat rujukan QC untuk form dokumen proyek. Sumbernya `qcCertCandidates`
     yang sama dengan modul Dokumen - sebelumnya form ini tidak punya cek
     apa pun, jadi tidak ada cara menunjuk sertifikat mana yang sudah
     diperiksa tim QC. */
  const docQcOptions = useMemo(
    () => qcCertCandidates(data.documents ?? [], pid, "", docSubType),
    [data.documents, pid, docSubType],
  );
  const docNeedsQc = NEEDS_QC_LINK.has(docSubType);

  /* Nama pengguna yang sedang login, dipakai sebagai penanggung jawab
     bawaan. `name` bisa kosong di mode offline/lama, jadi ada fallback ke
     username agar tidak pernah tersimpan string kosong. */
  const sessionName = String(session?.name ?? "").trim() || String(session?.username ?? "").trim();
const docOwnerOptions = useMemo(() => employeeOptions(data.employees), [data.employees]);
  const slots = data.dockSlots.filter((s) => s.project === pid);
  const docs = data.documents.filter((d) => d.project === pid);
  const wos = data.workOrders.filter((w) => w.project === pid);
  const coList = data.changeOrders.filter((c) => c.project === pid);
  const riskList = data.risks.filter((r) => r.project === pid);
  /* D15: data subkon untuk tab Subkon. WO sudah ada; subcontractors dan
     termins perlu diakses dari store global. */
  const subkonList = (data.subcontractors ?? []).filter((s) => wos.some((w) => String(w.sub ?? "") === String(s.name ?? "")));
  const subkonTermins = (data.termins ?? []).filter((t) => wos.some((w) => String(w.id ?? "") === String(t.woId ?? "")));
  const warrantyList = (data.warranties ?? []).filter((w) => String(w.projectId ?? "") === pid);
  const coApproved = coList.filter((c) => c.status === "Disetujui" || c.status === "Diterapkan");
  const coApprovedImpact = coApproved.reduce((s, c) => s + Number(c.impact || 0), 0);

  const riskScore = (r: StoreItem): number =>
    (RISK_LEVEL.indexOf(String(r.likelihood ?? "")) + 1) * (RISK_LEVEL.indexOf(String(r.impact ?? "")) + 1);
  const riskTone = (score: number): "green" | "amber" | "red" => (score >= 6 ? "red" : score >= 3 ? "amber" : "green");

  const ganttRange = (() => {
    const pts = wbs.flatMap((w) => [parseYM(w.start), parseYM(w.end)]).filter((p): p is { y: number; m: number } => p !== null);
    if (pts.length === 0) return null;
    let min = pts[0];
    let max = pts[0];
    for (const p of pts) {
      if (p.y * 12 + p.m < min.y * 12 + min.m) min = p;
      if (p.y * 12 + p.m > max.y * 12 + max.m) max = p;
    }
    return { min, max, total: max.y * 12 + max.m - (min.y * 12 + min.m) + 1 };
  })();

  const ganttBar = (start: string, end: string): { left: number; width: number } | null => {
    if (!ganttRange) return null;
    const s = parseYM(start) ?? ganttRange.min;
    const e = parseYM(end) ?? s;
    const base = ganttRange.min.y * 12 + ganttRange.min.m;
    const left = ((s.y * 12 + s.m - base) / ganttRange.total) * 100;
    const width = Math.max(((e.y * 12 + e.m - (s.y * 12 + s.m) + 1) / ganttRange.total) * 100, 3);
    return { left, width };
  };

  const milestoneDays = getSetting(data, "ALERT_MILESTONE_DAYS", 30);
  const milestonesNear = wbs.filter((w) => {
    const d = monthEndDate(w.end);
    if (!d || Number(w.progress) >= 100) return false;
    const diff = Math.round((d.getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000);
    return diff >= 0 && diff <= milestoneDays;
  });

  const baseline = (project.wbsBaseline ?? null) as WbsBaseline | null;

  const snapshotBaseline = async () => {
    try {
      await update("projects", pid, { wbsBaseline: { at: todayISO(), wbs: JSON.parse(JSON.stringify(wbs)) as WbsExt[] } });
      log("membuat baseline WBS", `${pid} · ${wbs.length} tahapan`, "Proyek");
      toast(S.detToastBaseline);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const coBoqItems = (data.boq ?? []).filter((b) => String(b.projectId ?? "") === pid);
  const coReviseTarget = coBoqItems.find((b) => String(b.id) === coForm.boqItemId) ?? null;
  /* Impact otomatis D7: revise = (hargaBaru − hargaLama) × qty; add = qty × harga. */
  const coAutoImpact = (() => {
    if (coForm.boqAction === "revise" && coReviseTarget) {
      const old = Number(coReviseTarget.unitPrice || 0);
      const next = Number(coForm.boqPrice) || 0;
      const q = Number(coForm.boqQty) || Number(coReviseTarget.quantity || 1);
      return Math.round((next - old) * q);
    }
    if (coForm.boqAction === "add") {
      return Math.round((Number(coForm.boqQty) || 0) * (Number(coForm.boqPrice) || 0));
    }
    return null;
  })();
  const coImpactVal = coAutoImpact !== null ? coAutoImpact : Number(coForm.impact) || 0;

  const saveCo = async () => {
    if (!coForm.title.trim()) { toast(S.detToastCoTitle, "info"); return; }
    if (coForm.boqAction === "revise" && !coForm.boqItemId) {
      toast(locale === "en" ? "Pick a BoQ item to revise" : "Pilih item BoQ yang akan direvisi", "info"); return;
    }
    if (coForm.boqAction === "add" && !coForm.boqName.trim()) {
      toast(locale === "en" ? "New BoQ item name is required" : "Nama item BoQ baru wajib diisi", "info"); return;
    }
    if (coForm.boqAction === "revise" && (!coForm.boqPrice || Number(coForm.boqPrice) <= 0)) {
      toast(locale === "en" ? "New unit price must be > 0" : "Harga satuan baru harus > 0", "info"); return;
    }
    if (coForm.boqAction === "add" && (Number(coForm.boqQty) <= 0 || Number(coForm.boqPrice) <= 0)) {
      toast(locale === "en" ? "Qty and price must be > 0" : "Qty dan harga harus > 0", "info"); return;
    }
    if (!Number.isFinite(coImpactVal)) { toast(S.detToastCoImpact, "info"); return; }
    if (!coForm.requestedBy.trim()) { toast(S.detToastCoBy, "info"); return; }
    try {
      await add("changeOrders", {
        project: pid, title: coForm.title.trim(), impact: coImpactVal,
        status: "Diajukan", requestedBy: coForm.requestedBy.trim(), date: coForm.date || todayISO(),
        boqAction: coForm.boqAction,
        ...(coForm.boqAction === "revise" ? {
          boqItemId: coForm.boqItemId,
          boqPayload: {
            unitPrice: Number(coForm.boqPrice),
            quantity: Number(coForm.boqQty) || Number(coReviseTarget?.quantity || 1),
          },
        } : {}),
        ...(coForm.boqAction === "add" ? {
          boqPayload: {
            name: coForm.boqName.trim(),
            description: coForm.boqDesc.trim(),
            quantity: Number(coForm.boqQty),
            unit: coForm.boqUnit,
            unitPrice: Number(coForm.boqPrice),
            category: coForm.boqCategory,
            suratNo: coForm.boqSurat.trim() || "-",
          },
        } : {}),
      }, { action: "mengajukan change order", module: "Proyek" });
      toast(S.detToastCoSent);
      setCoForm({ title: "", impact: "", requestedBy: "", date: "", boqAction: "none", boqItemId: "", boqName: "", boqDesc: "", boqQty: "1", boqUnit: "pcs", boqPrice: "", boqSurat: "", boqCategory: "Mechanical" });
      setShowCo(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const setCoStatus = async (id: string, status: string) => {
    /* D7: approve/apply CO butuh peran target - sama seperti status BoQ. */
    if ((status === "Disetujui" || status === "Diterapkan" || status === "Ditolak") && !canSetTarget(session?.role)) {
      toast(locale === "en" ? "Your role cannot approve/apply change orders" : "Peran Anda tidak bisa menyetujui/menerapkan change order", "info");
      return;
    }
    const co = (data.changeOrders ?? []).find((c) => String(c.id) === id);
    if (!co) return;
    if (status === "Diterapkan" && String(co.status ?? "") === "Diterapkan") {
      toast(locale === "en" ? "Change order already applied" : "Change order sudah pernah diterapkan", "info");
      return;
    }
    try {
      const boqAction = String(co.boqAction ?? "none");
      const payload = (co.boqPayload ?? {}) as Record<string, unknown>;
      const impact = Number(co.impact ?? 0);

      if (status === "Diterapkan") {
        /* Revisi item BoQ: boleh Approved/Completed - justru lewat CO + approval. */
        if (boqAction === "revise" && co.boqItemId) {
          const item = (data.boq ?? []).find((b) => String(b.id) === String(co.boqItemId));
          if (item) {
            const oldPrice = Number(item.unitPrice || 0);
            const newPrice = Number(payload.unitPrice || 0);
            const qty = Number(payload.quantity || item.quantity || 1);
            const hist = Array.isArray(item.priceHistory) ? (item.priceHistory as unknown[]) : [];
            await update("boq", String(item.id), {
              unitPrice: newPrice,
              totalPrice: qty * newPrice,
              quantity: qty,
              priceHistory: [...hist, {
                old: oldPrice, new: newPrice,
                reason: `CO ${co.id}: ${co.title}`,
                date: todayISO(), by: "Anda",
              }],
              revisedByCo: co.id,
            });
            log("merevisi BoQ via change order", `${item.id} · ${fmtRupiah(oldPrice)} → ${fmtRupiah(newPrice)} (${co.id})`, "Proyek");
          }
        }
        if (boqAction === "add" && payload.name) {
          await add("boq", {
            projectId: pid,
            suratNo: String(payload.suratNo || "-"),
            name: String(payload.name),
            description: String(payload.description || ""),
            quantity: Number(payload.quantity || 1),
            unit: String(payload.unit || "pcs"),
            unitPrice: Number(payload.unitPrice || 0),
            totalPrice: Number(payload.quantity || 1) * Number(payload.unitPrice || 0),
            category: String(payload.category || "Mechanical"),
            status: "Pending",
            requestedBy: String(co.requestedBy || "CO"),
            coRef: co.id,
          }, { action: "menambah item BoQ via change order", module: "Proyek" });
          log("menambah BoQ via change order", `${co.id} · ${String(payload.name)}`, "Proyek");
        }
        /* Budget & nilai kontrak ikut dampak CO (pola CRM contract→budget). */
        const budgetNow = Number(project.budget || 0);
        await update("projects", pid, { budget: budgetNow + impact });
        const contract = (() => {
          const qid = String(project.quotationId ?? "");
          if (qid) return (data.contracts ?? []).find((c) => String(c.id) === qid || String(c.projectId ?? "") === qid) ?? null;
          return (data.contracts ?? []).find((c) => String(c.projectId ?? "") === pid) ?? null;
        })();
        if (contract) {
          await update("contracts", String(contract.id), { value: Number(contract.value || 0) + impact });
        }
        log("sinkron budget dari change order", `${co.id} · impact ${fmtRupiah(impact)} → budget ${fmtRupiah(budgetNow + impact)}`, "Proyek");
        await update("changeOrders", id, {
          status,
          appliedAt: todayISO(),
          appliedBy: session?.name ?? "Anda",
        });
      } else {
        await update("changeOrders", id, { status });
      }
      log("mengubah change order", `${id} - ${status}`, "Proyek");
      toast(S.detToastCoStatus.replace("{a}", status.toLowerCase()));
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  // Garansi/DLP: dibuat sekali saat proyek Selesai (pintasan di tab Terkait).
const createWarranty = async (wbsTask?: string) => {
      const year = todayISO().slice(0, 4);
      const seq = (data.warranties ?? []).filter((w) => String(w.id ?? "").startsWith(`WRT-${year}-`)).length + 1;
      try {
        const created = await add("warranties", {
          id: `WRT-${year}-${String(seq).padStart(3, "0")}`,
          projectId: pid, vessel: project.vessel, start: todayISO(), months: 12,
          status: "Aktif", branch: String(project.branch ?? ""),
          ...(wbsTask ? { wbsTask } : {}),
        }, { action: "membuat garansi/DLP", module: "Proyek" });
        toast(S.detToastWarranty.replace("{a}", created.id));
      } catch (e) {
        toast(e instanceof Error ? e.message : S.saveFail, "info");
      }
    };

  /* Hapus risk / change order / trial / BAST. Tiga di antaranya sudah
     appet jadi dokumen resmi proyek, jadi Record yang sudah disetujui
     tidak boleh hilang diam-diam. */
  const recLocked = (kind: string, row: StoreItem): string | null => {
    if (kind === "bast" && String(row.status ?? "") === "Disetujui") {
      return locale === "en"
        ? "This BAST is approved - it already counts toward the contract balance and project closing. Create a correcting BAST instead."
        : "BAST ini sudah Disetujui - sudah masuk sisa kontrak dan syarat tutup proyek. Buat BAST koreksi.";
    }
    if (kind === "changeOrders" && String(row.status ?? "") === "Diterapkan") {
      return locale === "en"
        ? "This change order is already applied to the contract value. Reverse it through a new change order."
        : "Change order ini sudah Diterapkan ke nilai kontrak. Batalkan lewat change order baru.";
    }
    if (kind === "trials" && String(row.hasil ?? "") === "Lolos" && String(row.baRef ?? "") !== "") {
      return locale === "en"
        ? "This trial passed and is signed off (BA reference present) - it is a commissioning record."
        : "Trial ini Lolos dan sudah ditandatangani (ada nomor BA) - itu record commissioning.";
    }
    return null;
  };

  const confirmDelRec = async () => {
    if (!delRec) return;
    const { kind, row } = delRec;
    const locked = recLocked(kind, row);
    if (locked) { toast(locked, "info"); setDelRec(null); return; }
    try {
      await remove(kind, String(row.id));
      log(`menghapus ${kind}`, `${String(row.id)} - ${project.name}`, "Proyek");
      toast(locale === "en" ? `${String(row.id)} deleted` : `${String(row.id)} dihapus`);
      setDelRec(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const bastList = (data.bast ?? []).filter((b) => b.projectId === pid);
  const boqTotal = (data.boq ?? []).filter((b) => b.projectId === pid).reduce((s, b) => s + Number(b.totalPrice || 0), 0);

  /* ================= BIAYA EQUIPMENT -> HPP PROYEK =================
     Relasi ini SEBELUMNYA tidak ada di modul Proyek sama sekali: biaya
     sewa equipment (booking selesai) dan material servis hanya tampil di
     modul Equipment sebagai angka terpisah, tidak pernah masuk ke HPP.
     Akibatnya CPI/EAC di bawah terlihat lebih baik dari kenyataan -
     modal kerja crane/genset/sparepart hilang dari biaya.

     equipmentCostSummary() adalah SATU sumber angka yang juga dipakai
     tab "Biaya" modul Equipment, jadi kedua modul tidak bisa melenceng.
     Yang dibebankan:
       - rental  : hours × equipment.rate, dari booking Terpakai/Selesai
       - fuel    : fuelLiters × equipment.fuelPrice
       - maint.  : material maintenance yang statusnya sudah Selesai
     Yang BELUM terealisasi (maintenance berjalan) ditampilkan terpisah
     sebagai "committed" - bukan dicampur ke realized. */
  const equipCost = equipmentCostSummary(pid, data.bookings, data.maintenances, data.equipment);
  const [costDetail, setCostDetail] = useState(false);
  const equipHasCost = equipCost.totalRealized > 0 || equipCost.totalCommitted > 0;
  const hppWithEquip = Number(project.actual ?? 0) + equipCost.totalRealized;

  // SATU angka grand invoice: grandTotal bila ada, else amount dikurangi retensi.
  const invGrand = (i: StoreItem): number => {
    const g = Number(i.grandTotal) || 0;
    if (g > 0) return g;
    return Math.max(0, (Number(i.amount) || 0) - (Number(i.retentionAmt) || 0));
  };

  // Kontrak proyek ini (via quotationId hasil konversi, atau link projectId langsung).
  const contractOf = (data.contracts ?? []).find((c) =>
    (project.quotationId && String(c.quotationId ?? "") === String(project.quotationId)) ||
    String(c.projectId ?? "") === pid
  );
  const contractValue = Number(contractOf?.value) || 0;
  const bastApprovedSum = bastList
    .filter((b) => String(b.status) === "Disetujui")
    .reduce((s, b) => s + Number(b.amount || 0), 0);
  // Nominal default BAST = sisa kontrak (bukan BoQ buta); tanpa kontrak fallback ke BoQ.
  const sisaKontrak = contractValue > 0 ? Math.max(0, contractValue - bastApprovedSum) : boqTotal;

  // Tutup proyek cek: WBS 100% + BAST Disetujui + invoice Lunas (NCR dicek terpisah).
  const closeBlockReason = (): string | null => {
    if (weightedProgress(wbs) !== 100) return `WBS belum 100% (progres ${weightedProgress(wbs)}%)`;
    if (!bastList.some((b) => String(b.status) === "Disetujui")) return "belum ada BAST yang Disetujui";
    if (invoices.length === 0) return "belum ada invoice";
    const open = invoices.filter((i) => String(i.status) !== "Lunas");
    if (open.length > 0) return `${open.length} invoice belum Lunas (${open.map((i) => String(i.id)).join(", ")})`;
    return null;
  };

  const nextBastId = (tanggalISO: string): string => {
    const year = (tanggalISO || todayISO()).slice(0, 4);
    const prefix = `BAST-SMD-${year}-`;
    let max = 0;
    for (const b of (data.bast ?? [])) {
      const m = String(b.id ?? "").match(new RegExp(`^BAST-SMD-${year}-(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  // Nomor invoice tunggal format Finance (INV/<TIPE>-SMD-YYYY-NNN).
  const nextMilestoneInvId = (tanggalISO: string): string => {
    const year = (tanggalISO || todayISO()).slice(0, 4);
    const head = `INV/MS-SMD-${year}-`;
    let max = 0;
    for (const i of (data.invoices ?? [])) {
      const id = String(i.id ?? "");
      if (id.startsWith(head)) {
        const n = Number(id.slice(head.length));
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    let invId = `${head}${String(max + 1).padStart(3, "0")}`;
    let bump = 1;
    while ((data.invoices ?? []).some((i) => String(i.id) === invId)) {
      bump += 1;
      invId = `${head}${String(max + bump).padStart(3, "0")}`;
    }
    return invId;
  };

  // Gate anti-bypass: milestone BAST wajib cocok persis dengan satu task WBS.
  // Tanpa kecocokan (tanpa fuzzy) → tolak.
  const findLinkedWbs = (milestone: string): WbsExt | undefined => {
    const ms = String(milestone ?? "");
    return wbs.find((t) => t.task === ms);
  };

  const saveBast = async () => {
    if (!bastForm.milestone) { toast(S.detToastBastMile, "info"); return; }
    if (!bastForm.tanggal) { toast(S.detToastBastDate, "info"); return; }
    if (!bastForm.signer.trim()) { toast(S.detToastBastSigner, "info"); return; }
    const amt = bastForm.amount === "" ? 0 : Number(bastForm.amount);
    if (bastForm.amount !== "" && (!Number.isFinite(amt) || amt < 0)) { toast(S.detToastAmount, "info"); return; }
    if (!wbs.some((t) => t.task === bastForm.milestone)) {
      toast(`BAST ditolak: milestone tidak cocok dengan WBS mana pun`, "info");
      return;
    }
    const id = nextBastId(bastForm.tanggal);
    try {
      await add("bast", {
        id, projectId: pid, milestone: bastForm.milestone, tanggal: bastForm.tanggal,
        penandatangan: bastForm.signer.trim(), lampiran: bastForm.lampiran.trim(),
        amount: amt > 0 ? amt : sisaKontrak, status: "Draft",
      }, { action: "membuat BAST", target: `${id} · ${bastForm.milestone}`, module: "Proyek" });
      toast(S.detToastBastMade.replace("{a}", id));
      setBastForm({ milestone: "", tanggal: todayISO(), signer: "", lampiran: "", amount: "" });
      setShowBast(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const advanceBast = async (b: StoreItem, next: string) => {
    const order = ["Draft", "Diajukan", "Disetujui"];
    const curIdx = order.indexOf(String(b.status));
    const nextIdx = order.indexOf(next);
    if (nextIdx !== curIdx + 1) { toast(S.detToastBastFlow.replace("{a}", order.join(" → ")), "info"); return; }
    const linked = findLinkedWbs(String(b.milestone ?? ""));
    if (!linked) {
      toast(`BAST ${String(b.id)} ditolak: milestone tidak cocok dengan WBS mana pun`, "info");
      return;
    }
    if (next === "Disetujui" && Number(linked.progress) !== 100) {
      toast(S.detToastBastProg.replace("{a}", linked.task).replace("{b}", String(linked.progress)), "info");
      return;
    }
    try {
      if (next === "Disetujui") {
        const amount = Number(b.amount) > 0 ? Number(b.amount) : sisaKontrak;
        // Cegah tagih ganda manual-vs-auto per BAST: satu BAST satu invoice.
        const existing = (data.invoices ?? []).find((i) =>
          String(i.milestoneRef ?? "") === `BAST ${String(b.id)}` || String(i.bastId ?? "") === String(b.id)
        );
        if (existing) {
          await update("bast", String(b.id), { status: next, invoiceId: String(existing.id) });
          log("menyetujui BAST (invoice sudah ada)", `${String(b.id)} → ${String(existing.id)}`, "Proyek");
          toast(`BAST disetujui - memakai invoice ${String(existing.id)} yang sudah ada`);
          return;
        }
        const invId = nextMilestoneInvId(String(b.tanggal ?? todayISO()));
        let due = String(b.tanggal ?? todayISO());
        const d = new Date(`${due}T00:00:00`);
        if (!Number.isNaN(d.getTime())) {
          d.setDate(d.getDate() + 30);
          due = d.toISOString().slice(0, 10);
        } else {
          due = todayISO();
        }
        // Pajak/retensi ikut aturan Finance (sbInvoiceMath, tarif tidak ditulis ulang):
        // jasa = nominal BAST, retensi milestone 5%.
        const ppnRateUsed = getSetting(data, "PPN_INVOICE_RATE", PPN_INVOICE_DEFAULT);
        const pphRateUsed = getSetting(data, "PPH_JASA_RATE", PPH_JASA_DEFAULT);
        const sb = sbInvoiceMath({
          jasa: amount, material: 0,
          ppnRate: ppnRateUsed, pphRate: pphRateUsed,
          skdt: false, dpApplied: 0, retentionPct: 5,
        });
        try {
          await add("invoices", {
            id: invId, client: project.client, project: pid, amount,
            due, status: "Draft", paymentTerm: `Termin ${String(b.milestone)}`,
            billingType: "Milestone", type: "Milestone", milestoneRef: `BAST ${String(b.id)}`,
            bastId: String(b.id),
            dunning: "Belum Ditagih",
            jasaTotal: sb.jasa, matTotal: 0, dpp: sb.dpp, ppnAmt: sb.ppn, pphAmt: sb.pph,
            ppnRate: ppnRateUsed, pphRate: pphRateUsed, dpApplied: 0,
            grandTotal: sb.grand,
            retentionPct: 5, retentionAmt: sb.retentionAmt,
            retentionStatus: sb.retentionAmt > 0 ? "Ditahan" : "-",
            skdt: false,
          }, { action: "menerbitkan invoice milestone (BAST)", target: `${invId} ← ${String(b.id)}`, module: "Keuangan" });
          await update("bast", String(b.id), { status: next, invoiceId: invId });
          log("menyetujui BAST + auto-invoice", `${String(b.id)} → ${invId}`, "Proyek");
          toast(S.detToastBastInv.replace("{a}", invId));
        } catch {
          toast(S.detToastBastInvFail.replace("{a}", String(b.id)), "info");
          return;
        }
      } else {
        log("mengajukan BAST", `${String(b.id)} → ${next}`, "Proyek");
        toast(S.detToastBastStatus.replace("{a}", next.toLowerCase()));
        await update("bast", String(b.id), { status: next });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  // E1: sub-stage desain + class approval, tersimpan di project.designStages.
  // D1: blok edit dihapus; data tetap ada di store untuk backward compat.
  // Gate kini membaca dokumen Sertifikat Kelas + fallback ke designStages.
  const designStages = (project.designStages ?? []) as { name: string; status: string; society: string; date: string; doc: string }[];
  const classApproval = designStages.find((s) => s.name === "Class Approval");

  // D1: Class Approved = ada dokumen Sertifikat Kelas yang Disetujui,
  // ATAU designStages lama yang statusnya Disetujui (backward compat).
  const classDocApproved = data.documents.some(
    (d) => d.project === pid && d.type === "Sertifikat" && d.subType === "Sertifikat Kelas" && d.status === "Disetujui",
  );
  const classApproved = classDocApproved || classApproval?.status === "Disetujui";

  // D1: baris tabel Log Penawaran dan Tagihan.
  // Sumber: quotation terkait project, contract terkait project, invoices.
  interface LogRow { kind: "Penawaran" | "Kontrak" | "Tagihan"; id: string; date: string; ref: string; value: number; status: string; }
  const quotation = data.quotations.find((q) => q.id === project.quotationId);
  const contractsForProject = (data.contracts ?? []).filter(
    (c) => (project.quotationId && String(c.quotationId ?? "") === String(project.quotationId)) || String(c.projectId ?? "") === pid,
  );
  const logRows: LogRow[] = [
    ...(quotation ? [{ kind: "Penawaran" as const, id: String(quotation.id), date: String(quotation.date ?? ""), ref: String(quotation.id), value: Number(quotation.value ?? 0), status: String(quotation.stage ?? "Draft") }] : []),
    ...contractsForProject.map((c) => ({ kind: "Kontrak" as const, id: String(c.id), date: String(c.signedAt ?? ""), ref: String(c.id), value: Number(c.value ?? 0), status: String(c.status ?? "Aktif") })),
    ...invoices.map((i) => ({ kind: "Tagihan" as const, id: String(i.id), date: String(i.due ?? i.date ?? ""), ref: String(i.id), value: Number(i.grandTotal ?? i.amount ?? 0), status: String(i.status ?? "Draft") })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  /* saveDesignStage dihapus (D1): blok edit Desain & Class Approval sudah
     diganti dengan tabel Log Penawaran dan Tagihan. Class Approval kini
     diproses di modul Dokumen (tipe Sertifikat, subType Sertifikat Kelas).
     Data designStages lama tetap ada di store untuk backward compat dan
     masih dibaca sebagai fallback gate tahap. */

  // E4: trials (sea trial / commissioning) per proyek.
  const trialList = (data.trials ?? []).filter((t) => t.projectId === pid);
  const nextTrialId = (tanggalISO: string): string => {
    const year = (tanggalISO || todayISO()).slice(0, 4);
    const prefix = `STL-${year}-`;
    let max = 0;
    for (const t of (data.trials ?? [])) {
      const m = String(t.id ?? "").match(new RegExp(`^STL-${year}-(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  /* D10: buka form trial dengan checklist otomatis dari WBS task yang
     progress >= 100. User bisa centang/nota per task. */
  const openTrialNew = () => {
    const doneTasks = wbs.filter((w) => Number(w.progress ?? 0) >= 100);
    setTrialForm({
      tanggal: todayISO(), parameter: "", punchList: "", hasil: "Lolos", baRef: "", kondisi: "Baik",
      checklist: doneTasks.map((w) => ({ wbsTask: w.task, done: false, note: "" })),
    });
    setShowTrial(true);
  };

  const saveTrial = async () => {
    if (!trialForm.tanggal) { toast(S.detToastTrialDate, "info"); return; }
    if (!trialForm.parameter.trim()) { toast(S.detToastTrialParam, "info"); return; }
    const id = nextTrialId(trialForm.tanggal);
    try {
      await add("trials", {
        id, projectId: pid, tanggal: trialForm.tanggal, parameter: trialForm.parameter.trim(),
        punchList: trialForm.punchList.trim(), hasil: "Berjalan", baRef: trialForm.baRef.trim(),
        ...(trialForm.checklist.length > 0 ? { checklist: trialForm.checklist } : {}),
        ...(trialForm.kondisi !== "Baik" ? { kondisi: trialForm.kondisi } : {}),
      }, { action: "membuat sea trial", target: `${id} · ${pid}`, module: "Proyek" });
      toast(S.detToastTrialMade.replace("{a}", id));
      setTrialForm({ tanggal: todayISO(), parameter: "", punchList: "", hasil: "Lolos", baRef: "", kondisi: "Baik", checklist: [] });
      setShowTrial(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const advanceTrial = async (t: StoreItem, hasil: string) => {
    if (String(t.hasil) === hasil) return;
    if (hasil === "Lolos") {
      // E5: trial exit butuh Class Survey row yang ter-link ke trial ini.
      const linked = (data.surveys ?? []).some((s) => String(s.linkedTrial ?? "") === String(t.id));
      if (!linked) { toast(S.detToastSurvey, "info"); return; }
    }
    try {
      if (hasil === "Lolos") {
        const bastId = nextBastId(String(t.tanggal ?? todayISO()));
        // Milestone BAST wajib cocok persis dengan WBS (gate anti-bypass):
        // pakai task Trial bila ada, else string Sea Trial (persetujuan akan menolak
        // bila tak cocok sampai milestone diselaraskan ke WBS).
        const exactTrial = `Sea Trial - ${String(t.parameter ?? "")}`;
        const trialTask = wbs.find((w) => w.task === exactTrial) ?? wbs.find((w) => /trial/i.test(w.task));
        await add("bast", {
          id: bastId, projectId: pid, milestone: trialTask ? trialTask.task : exactTrial,
          tanggal: String(t.tanggal ?? todayISO()), penandatangan: "", lampiran: String(t.punchList ?? ""),
          amount: sisaKontrak, status: "Draft",
        }, { action: "membuat BAST draft dari trial", target: `${bastId} ← ${String(t.id)}`, module: "Proyek" });
        toast(S.detToastTrialPass.replace("{a}", bastId));
      } else {
        toast(S.detToastTrialMark.replace("{a}", String(t.id)).replace("{b}", hasil), "info");
      }
      await update("trials", String(t.id), { hasil });
      log("memperbarui hasil trial", `${String(t.id)} → ${hasil}`, "Proyek");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  // E7: QA gate + history otomatis saat Selesai.
  const saveScope = async () => {
    if (!scopeVal.service.trim()) { toast(S.detToastSvcReq, "info"); return; }
    const item = {
      service: scopeVal.service.trim(),
      ...(scopeVal.lokasi.trim() ? { lokasi: scopeVal.lokasi.trim() } : {}),
      ...(scopeVal.deskripsi.trim() ? { deskripsi: scopeVal.deskripsi.trim() } : {}),
    };
    try {
      await update("projects", pid, { scope: [...scopeList(project.scope), item] });
      log("menambah lingkup", `${pid} · ${item.service}`, "Proyek");
      toast(S.detToastScopeAdd);
      setScopeVal({ service: "", lokasi: "", deskripsi: "" });
      setShowScope(false);
    } catch {
      toast(S.detToastScopeFail, "info");
    }
  };

  const saveWbsTask = async () => {
    if (!wbsTaskUpdate) return;
    const hours = Number(wbsUpdateForm.hours) || 0;
    const prog = Math.max(0, Math.min(100, Number(wbsUpdateForm.progress)));
    if (wbsUpdateForm.progress === "" || Number.isNaN(prog)) { toast(S.detToastProgRange, "info"); return; }
    // E2: hull tasks wajib isi station.
    if (/hull/i.test(wbsTaskUpdate) && !wbsUpdateForm.station) { toast(S.detToastStation, "info"); return; }
    const dftNum = wbsUpdateForm.dft === "" ? undefined : Number(wbsUpdateForm.dft);
    if (wbsUpdateForm.dft !== "" && (!Number.isFinite(dftNum!) || dftNum! < 0)) { toast(S.detToastDft, "info"); return; }
    const pred = wbsUpdateForm.predecessor || "";
    if (pred && pred !== wbsTaskUpdate && createsCycle(wbs, wbsTaskUpdate, pred)) { toast(S.detToastCycle, "info"); return; }
    const status = prog >= 100 ? "Selesai" : wbsUpdateForm.status === "Selesai" && prog < 100 ? "Sedang" : wbsUpdateForm.status;
    const updated = wbs.map((w) =>
      w.task === wbsTaskUpdate
        ? {
            ...w, actualHours: hours, materialUsed: wbsUpdateForm.material, status, progress: prog, predecessor: pred || undefined,
            ...(wbsUpdateForm.station ? { station: wbsUpdateForm.station } : { station: undefined }),
...(wbsUpdateForm.photoNote.trim() || wbsUpdateForm.photoUrl.trim()
                ? { photos: [...(w.photos ?? []), ...(wbsUpdateForm.photoUrl.trim() ? [{ url: wbsUpdateForm.photoUrl.trim(), note: wbsUpdateForm.photoNote.trim(), date: todayISO() }] : [])] }
                : {}),
              ...(wbsUpdateForm.photoNote.trim() ? { photoNote: wbsUpdateForm.photoNote.trim() } : { photoNote: undefined }),
              ...(wbsUpdateForm.photoUrl.trim() ? { photoUrl: wbsUpdateForm.photoUrl.trim() } : { photoUrl: undefined }),
            ...(dftNum !== undefined ? { dft: dftNum } : { dft: undefined }),
          }
        : w
    );
try {
        await setWbs(pid, updated);
        await update("projects", pid, { progress: weightedProgress(updated) });
        /* D3: material terpilih → kurangi stok inventory + catat movement.
           Tanpa pengurangan stok, WBS dan inventory akan divergensi. */
        if (wbsUpdateForm.material) {
          const invItem = invList.find((inv) => String(inv.name ?? "") === wbsUpdateForm.material);
          if (invItem) {
            const curStock = Number(invItem.stock ?? 0);
            if (curStock > 0) {
              await update("inventory", String(invItem.id), { stock: curStock - 1 });
              await add("movements", {
                item: String(invItem.name ?? ""), itemId: String(invItem.id),
                type: "Pengeluaran", qty: 1, by: `WBS: ${wbsTaskUpdate}`,
                date: todayISO(), tone: "out",
              }, { action: "pemakaian material WBS", module: "Proyek" });
            }
          }
        }
        log("mengupdate progres WBS", `${wbsTaskUpdate} → ${prog}% (${status})`, "Proyek");
        toast(S.detToastWbsProg);
      setWbsTaskUpdate(null);
      setWbsUpdateForm({ hours: "", material: "", status: "Sedang", progress: "", predecessor: "", station: "", photoNote: "", photoUrl: "", dft: "" });
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const saveWbs = async () => {
    if (!wbsForm.task.trim()) { toast(S.detToastStageName, "info"); return; }
    if (wbs.some((w) => w.task === wbsForm.task.trim())) { toast(S.detToastStageDup, "info"); return; }
    const weight = Number(wbsForm.weight) || 0;
    if (weight <= 0) { toast(S.detToastWeight, "info"); return; }
    const pred = wbsForm.predecessor || "";
    if (pred && !wbs.some((w) => w.task === pred)) { toast(S.detToastPredUnknown, "info"); return; }
    const next = [...wbs, { task: wbsForm.task.trim(), start: wbsForm.start || "-", end: wbsForm.end || "-", progress: Number(wbsForm.progress) || 0, weight, ...(pred ? { predecessor: pred } : {}) }];
    const totalW = next.reduce((s, w) => s + Number(w.weight || 0), 0);
    if (totalW !== 100) { toast(S.detToastWeightTotal.replace("{n}", String(totalW)), "info"); return; }
    try {
      await setWbs(pid, next);
      await update("projects", pid, { progress: weightedProgress(next) });
      log("menambah tahapan WBS", `${pid} · ${wbsForm.task.trim()}`, "Proyek");
      toast(S.detToastStageAdd);
      setShowWbs(false);
      setWbsForm({ task: "", start: "", end: "", weight: "10", progress: "0", predecessor: "" });
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  return (
    <div>
      <Link to="/proyek" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> {S.detBack}
      </Link>
      <PageHeader
        title={project.vessel}
        subtitle={`${project.id} · ${project.type} · ${project.client}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Prioritas sebelumnya write-once: hanya ditulis saat proyek dibuat,
                tidak bisa diubah di halaman mana pun padahal ditampilkan sebagai
                badge & bisa difilter. */}
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-steel-500">{S.prjFieldPrioritas}</span>
              <select
                className="input w-auto py-1.5 text-sm"
                value={canonPrioritas(project.prioritas)}
                onChange={(e) => {
                  const next = e.target.value;
                  void busy.run("savePrioritas", () => savePrioritas(next));
                }}
                disabled={busy.isBusy("savePrioritas")}
                aria-label={S.prjFieldPrioritas}
              >
                {PRIORITAS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <select
              className="input w-auto py-1.5 text-sm"
              value={project.status}
              onChange={(e) => askStatus(e.target.value)}
              title="Terlambat terisi otomatis dari jatuh tempo"
            >
              {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <StatusBadge status={project.status} />
            {project.statusOverride && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                title={`${locale === "en" ? "Manual override" : "Override manual"}: ${String(project.statusOverride.reason ?? "")} (${String(project.statusOverride.at ?? "")})`}>
                {locale === "en" ? "Override" : "Override"}
              </span>
            )}
          </div>
        }
      />

      {/* Stepper tahap kaku: posisi + geser via modal beralasan. */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Tahap proyek">
        {TAHAP.map((t, i) => {
          const cur = TAHAP.indexOf(tahapOf(project));
          const done = i < cur;
          const on = i === cur;
          return (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${on ? "bg-navy-700 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-steel-100 text-steel-500"}`}>
                {i + 1}. {t}
              </span>
              {i < TAHAP.length - 1 && <span aria-hidden className="text-steel-300">→</span>}
            </span>
          );
        })}
        <span className="ml-1 flex gap-1.5">
          <button className="btn-secondary px-2 py-1 text-xs" disabled={TAHAP.indexOf(tahapOf(project)) <= 0} onClick={() => { setTahapMove({ dir: -1 }); setTahapReason(""); }}>{S.detTahapBack}</button>
          <button className="btn-secondary px-2 py-1 text-xs" disabled={TAHAP.indexOf(tahapOf(project)) >= TAHAP.length - 1} onClick={() => { setTahapMove({ dir: 1 }); setTahapReason(""); }}>{S.detTahapNext}</button>
        </span>
        <span className="ml-2 text-xs font-medium text-steel-500">
          Posisi tahap {TAHAP.indexOf(tahapOf(project)) + 1}/{TAHAP.length}: {tahapOf(project)} · Status {project.status}
        </span>
        {project.quotationId && !hasContract(project, data.contracts ?? []) ? (
          <Badge tone="amber">Belum ada kontrak</Badge>
        ) : null}
        {contractOf && (Number(contractOf.value) || 0) !== (Number(project.budget) || 0) ? (
          <Badge tone="red">Kontrak ≠ budget</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.colBudget} value={fmtMiliar(project.budget)} hint={S.detKpiBudgetHint} icon={<Calendar className="h-5 w-5" />} />
        <KpiCard label={S.colActual} value={fmtMiliar(project.actual)} delta={S.detKpiUsed.replace("{a}", String(project.budget ? Math.round((project.actual / project.budget) * 100) : 0))} deltaDirection={project.actual > project.budget ? "down" : "flat"} hint={S.detKpiActualHint} />
        {/* Angka keterlambatan di card progres (P14). Versi lama hanya menulis
            "Terlambat dari jadwal" tanpa angkanya, jadi pengguna harus pindah
            ke Monitoring untuk tahu seberapa jauh. Monitoring sudah menghitung
            ini; sekarang keduanya satu sumber (`utils/projectDelay`). */}
        <KpiCard
          label={S.progLabel}
          value={`${project.progress}%`}
          delta={project.status === "Terlambat" ? S.detKpiLate : S.detKpiOnTrack}
          deltaDirection={project.status === "Terlambat" ? "down" : "up"}
          hint={
            project.status === "Terlambat"
              ? (() => {
                  const lateDays = delayDaysOf(project.end, todayISO(), true);
                  return lateDays === null
                    ? S.detKpiAvgHint
                    : `${S.monDelayDays.replace("{n}", String(lateDays))} - ${S.detKpiAvgHint}`;
                })()
              : S.detKpiAvgHint
          }
        />
        <KpiCard label={S.detKpiPeriod} value={fmtRentang(project.start, project.end)} hint={project.branch} icon={<MapPin className="h-5 w-5" />} />
      </div>

      <div className="mt-5 card">
        <Tabs tabs={["Ringkasan", "WBS & Anggaran", "BoQ", "Dokumen & Laporan", "Equipment", "Perubahan & Risiko", "Subkon", "Terkait", ...(getSetting(data, "SHOW_3D_PROJECT", 0) === 1 ? ["3D Viewer"] : []), "Service", "Sparepart", "Tim"]} active={tab} onChange={setTab} labels={{ Ringkasan: S.tabRingkasan, "WBS & Anggaran": S.tabWbs, BoQ: S.tabBoq, "Dokumen & Laporan": S.tabDocs, Equipment: S.detEqTab, "Perubahan & Risiko": S.tabChange, Subkon: S.tabSubkon, Terkait: S.tabRelated, "3D Viewer": S.tabViewer, Service: S.tabService, Sparepart: S.tabSparepart, Tim: S.tabTeam }} />
        <div className="p-5">
          {tab === "Ringkasan" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.detScopeTitle}</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowScope(true)}><Plus className="h-3.5 w-3.5" /> {S.addBtn}</button>
                </div>
                <ul className="space-y-2">
                  {scopeList(project.scope).map((s, i) => (
                    <li key={`${s.service}-${i}`} className="group flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-50 text-xs font-bold text-navy-700">{i + 1}</span>
                      <span className="flex-1 text-sm text-steel-700">
                        <span className="font-medium text-navy-900">{s.service}</span>
                        {s.lokasi ? <span className="text-steel-500"> · {s.lokasi}</span> : null}
                        {s.deskripsi ? <span className="block text-xs text-steel-500">{s.deskripsi}</span> : null}
                      </span>
                      <button className="hidden rounded p-1 text-rose-400 hover:bg-rose-50 group-hover:block" onClick={() => setDelScope(i)} title={S.detScopeDelTitle}><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                  {scopeList(project.scope).length === 0 && <p className="text-sm text-steel-400">{S.detScopeEmpty}</p>}
                </ul>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy-900">{S.detLogTitle}</h3>
                    {classApproved
                      ? <Badge tone="green">{S.detClassOk}</Badge>
                      : <Badge tone="amber">{S.detClassPending.replace("{a}", "Belum")}</Badge>}
                  </div>
                  <p className="mb-2 text-xs text-steel-500">{S.detLogSubtitle}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr>
                          <th className="th">{S.detLogNo}</th>
                          <th className="th">{S.detLogDate}</th>
                          <th className="th">{S.detLogType}</th>
                          <th className="th">{S.detLogRef}</th>
                          <th className="th text-right">{S.detLogValue}</th>
                          <th className="th">{S.detLogStatus}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {logRows.length === 0 && (
                          <tr><td colSpan={6} className="td text-center text-steel-400">{S.detLogEmpty}</td></tr>
                        )}
                        {logRows.map((row, idx) => (
                          <tr key={`${row.kind}-${row.id}-${idx}`} className="hover:bg-surface">
                            <td className="td font-mono text-xs text-steel-500">{idx + 1}</td>
                            <td className="td text-xs text-steel-600">{fmtTanggal(row.date)}</td>
                            <td className="td text-xs">
                              <Badge tone={row.kind === "Penawaran" ? "navy" : row.kind === "Kontrak" ? "teal" : "amber"}>{row.kind}</Badge>
                            </td>
                            <td className="td font-mono text-xs font-semibold text-navy-900">{row.ref}</td>
                            <td className="td text-right text-xs font-semibold">{row.value > 0 ? fmtRupiah(row.value) : "-"}</td>
                            <td className="td"><StatusBadge status={row.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy-900">{S.detOverallTitle}</h3>
                    <span className="text-xs text-steel-500">{S.detKpiAvgHint}</span>
                  </div>
                   <ProgressBar value={project.progress} tone={project.status === "Terlambat" ? "red" : "navy"} />
                    <p className="mt-1 text-xs text-steel-500">{S.detOverallDone.replace("{a}", String(project.progress)).replace("{b}", fmtTanggal(project.end))}</p>
                </div>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy-900">{S.detMileTitle.replace("{n}", String(milestoneDays))}</h3>
                    <Link to="/proyek/monitoring" className="text-xs font-medium text-ocean-600 hover:underline">{S.detMonitoringLink}</Link>
                  </div>
                  {milestonesNear.length === 0 ? (
                    <p className="text-xs text-steel-400">{S.detMileEmpty.replace("{n}", String(milestoneDays))}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {milestonesNear.map((w) => (
                        <div key={w.task} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm">
                          <span className="font-medium text-navy-900">{w.task}</span>
                          <span className="text-xs text-steel-500">{S.detMileRow.replace("{a}", String(w.progress)).replace("{b}", fmtBulan(w.end))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {vessel && (
                  <div className="mt-6 rounded-xl border border-steel-100 bg-surface p-3 text-sm">
                    <span className="text-steel-500">{S.detVesselLink}</span>
                    <Link to={`/kapal/${vessel.id}`} className="font-semibold text-ocean-600 hover:underline">{vessel.name} ({vessel.imo})</Link>
                  </div>
                )}
              </div>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">{S.detInfoTitle}</h3>
                <dl className="dl-div text-sm">
                  <div className="flex justify-between"><dt className="text-steel-500">{S.detManager}</dt><dd className="font-medium">{project.manager}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">{S.branchLabel}</dt><dd className="font-medium">{project.branch}</dd></div>
                   <div className="flex justify-between"><dt className="text-steel-500">{S.detStart}</dt><dd className="font-medium">{fmtTanggal(project.start)}</dd></div>
                   <div className="flex justify-between"><dt className="text-steel-500">{S.detEnd}</dt><dd className="font-medium">{fmtTanggal(project.end)}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">{S.statusLabel}</dt><dd><StatusBadge status={project.status} /></dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">{S.detInvoices}</dt><dd className="font-medium">{S.detDocCount.replace("{n}", String(invoices.length))}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">{S.detNcrOpen}</dt><dd className="font-medium">{ncrs.filter((n) => n.status !== "Tertutup").length}</dd></div>
                </dl>
              </Card>
            </div>
          )}

          {tab === "WBS & Anggaran" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.detWbsTitle}</h3>
{/* Search WBS. Tabel lain di tab ini TIDAK diberi search dan itu disengaja:
              tabel baseline dibatasi jumlah tahap, tabel booking/maintenance
              sudah punya tombol Detail, dan matriks risiko 5x5 bukan daftar -
              memberi kotak search di sana cuma menambah noise tanpa pernah
              dipakai. Yang bisa tumbuh panjang tanpa batas adalah WBS. */}
              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <SearchBox value={wbsQ} onChange={setWbsQ} placeholder={locale === "en" ? "Search WBS..." : "Cari WBS..."} ariaLabel={locale === "en" ? "Search WBS" : "Cari WBS"} className="w-full max-w-xs" />
                <button className="btn-secondary text-xs" onClick={() => setShowWbs(true)}><Plus className="h-3.5 w-3.5" /> {S.detAddStage}</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><SortTh label={S.colStageName} sortKey="task" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.detStart} sortKey="start" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.detEnd} sortKey="end" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colWeight} sortKey="weight" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colPred} sortKey="predecessor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.progLabel} sortKey="progress" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.actionTh}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(wbs.filter((w) => rowMatches(w as unknown as Record<string, unknown>, wbsQ, ["task", "station", "dft", "predecessor"])), sort, (w: WbsExt, k) => k === "weight" ? Number(w.weight) : k === "progress" ? Number(w.progress) : String((w as unknown as Record<string, unknown>)[k] ?? "")).map((w) => (
                      <tr key={w.task}>
<td className="td font-medium text-navy-900">{w.task}
                            {w.station ? <span className="ml-2 rounded bg-navy-50 px-1.5 py-0.5 text-[11px] font-semibold text-navy-700">{w.station}</span> : null}
                            {w.dft !== undefined && w.dft !== null && String(w.dft) !== "" ? <span className="ml-1 text-[11px] text-steel-400">DFT {w.dft}</span> : null}
                            {/* D3: badge jumlah foto jika ada. */}
                            {w.photos && w.photos.length > 0 && <span className="ml-1 rounded bg-ocean-50 px-1.5 py-0.5 text-[11px] font-semibold text-ocean-700">📷 {w.photos.length}</span>}
                          </td>
                         <td className="td font-mono text-xs text-steel-500">{fmtBulan(w.start)}</td>
                         <td className="td font-mono text-xs text-steel-500">{fmtBulan(w.end)}</td>
                        <td className="td">{w.weight}%</td>
                        <td className="td text-xs text-steel-500">{w.predecessor || "-"}</td>
                        <td className="td">
                          <div className="flex items-center gap-3">
                            <ProgressBar value={w.progress} className="w-32" tone={w.progress >= 100 ? "green" : "navy"} />
                            <span className="text-xs font-medium">{w.progress}%</span>
                          </div>
                        </td>
                        <td className="td">
                            <RowAction
                              icon={Pencil}
                              tone="neutral"
                              label={`${S.detUpdateBtn} ${w.task}`}
                              onClick={() => { setWbsTaskUpdate(w.task); setWbsUpdateForm({ hours: String(w.actualHours ?? ""), material: w.materialUsed ?? "", status: w.status === "Selesai" ? "Selesai" : "Sedang", progress: String(w.progress ?? 0), predecessor: w.predecessor ?? "", station: w.station ?? "", photoNote: w.photoNote ?? "", photoUrl: String(w.photoUrl ?? ""), dft: w.dft === undefined || w.dft === null ? "" : String(w.dft) }); }}
                            />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ganttRange && wbs.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-navy-900">{S.detGantt}</h4>
                    <span className="text-[11px] text-steel-500">{fmtBulan(`${ganttRange.min.y}-${String(ganttRange.min.m).padStart(2, "0")}`)} → {fmtBulan(`${ganttRange.max.y}-${String(ganttRange.max.m).padStart(2, "0")}`)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {wbs.map((w) => {
                      const bar = ganttBar(w.start, w.end);
                      if (!bar) return null;
                      return (
                        <div key={`gantt-${w.task}`} className="flex items-center gap-2">
                          <span className="w-40 truncate text-[11px] text-steel-600">{w.task}</span>
                          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-steel-100">
                            <div className="absolute top-0 h-full rounded-full bg-ocean-300" style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
                            <div className="absolute top-0 h-full rounded-full bg-navy-700" style={{ left: `${bar.left}%`, width: `${(bar.width * Math.max(0, Math.min(100, Number(w.progress) || 0))) / 100}%` }} />
                          </div>
                          <span className="w-9 text-right text-[11px] font-medium text-steel-600">{w.progress}%</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* D4: tick bulan di bawah bar - label per bulan pada posisi
                      center-nya, sejajar dengan kolom bar (w-40 task + gap). */}
                  <div className="mt-1 flex items-center gap-2">
                    <span className="w-40 shrink-0" />
                    <div className="relative h-4 flex-1">
                      {(() => {
                        const ticks: { label: string; leftPct: number }[] = [];
                        let y = ganttRange.min.y;
                        let m = ganttRange.min.m;
                        for (;;) {
                          const base = ganttRange.min.y * 12 + ganttRange.min.m;
                          const cur = y * 12 + m;
                          const leftPct = ((cur - base) / ganttRange.total) * 100;
                          ticks.push({ label: fmtBulan(`${y}-${String(m).padStart(2, "0")}`), leftPct });
                          if (y === ganttRange.max.y && m === ganttRange.max.m) break;
                          m += 1;
                          if (m > 12) { m = 1; y += 1; }
                          if (ticks.length > 60) break;
                        }
                        return ticks.map((t) => (
                          <span
                            key={`${t.label}-${t.leftPct}`}
                            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] text-steel-400"
                            style={{ left: `${Math.min(98, Math.max(2, t.leftPct + (100 / Math.max(1, ganttRange.total)) / 2))}%` }}
                          >
                            {t.label}
                          </span>
                        ));
                      })()}
                    </div>
                    <span className="w-9 shrink-0" />
                  </div>
                </div>
              )}
              <div className="mt-4 rounded-xl border border-steel-100 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-navy-900">
                    {S.detBaseline}{baseline ? S.detBaselineSnap.replace("{a}", fmtTanggal(baseline.at)) : S.detBaselineNone}
                  </h4>
                  <div className="flex gap-2">
                    <button className="btn-secondary text-xs" onClick={snapshotBaseline}>{S.detSnapBtn}</button>
                    {baseline && <button className="btn-secondary text-xs" onClick={() => setShowDelBaseline(true)}>{S.detDelBaselineBtn}</button>}
                  </div>
                </div>
                {!baseline ? (
                  <p className="text-xs text-steel-400">{S.detBaselineEmpty}</p>
                ) : (
                  <>
                    <div className="mb-2 flex justify-end">
                      <SearchBox value={baselineQ} onChange={setBaselineQ} className="max-w-xs" placeholder={locale === "en" ? "Search baseline..." : "Cari baseline..."} ariaLabel={locale === "en" ? "Search baseline WBS" : "Cari baseline WBS"} />
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface">
                        <tr><SortTh label={S.colStageName} sortKey="task" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.detPlanBase} sortKey="planned" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.detActualCol} sortKey="actual" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.detDevCol} sortKey="dev" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(wbs.filter((w) => rowMatches(w as unknown as Record<string, unknown>, baselineQ, ["task", "station", "pic", "start", "end", "status", "progress", "catatan"])), sort2, (w: WbsExt, k) => { const base = baseline?.wbs.find((b) => b.task === w.task); const planned = base ? Number(base.progress) || 0 : 0; const actual = Number(w.progress) || 0; if (k === "planned") return planned; if (k === "actual") return actual; if (k === "dev") return actual - planned; return String(w.task); }).map((w) => {
                          const base = baseline.wbs.find((b) => b.task === w.task);
                          const planned = base ? Number(base.progress) || 0 : 0;
                          const actual = Number(w.progress) || 0;
                          const dev = actual - planned;
                          return (
                            <tr key={`base-${w.task}`}>
                              <td className="td font-medium text-navy-900">{w.task}</td>
                              <td className="td text-xs text-steel-500">{base ? S.detBaseRow.replace("{a}", String(planned)).replace("{b}", fmtTanggal(baseline.at)) : S.detNewOutside}</td>
                              <td className="td text-xs font-medium">{actual}%</td>
                              <td className={`td text-xs font-semibold ${dev < 0 ? "text-rose-600" : dev > 0 ? "text-emerald-600" : "text-steel-500"}`}>
                                {dev > 0 ? `+${dev}%` : `${dev}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "WBS & Anggaran" && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.detBudgetTitle}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.detBudgetVs}</h3>
                  <button className="btn-secondary text-xs" onClick={() => { setActualVal(String(project.actual ?? 0)); setShowActual(true); }}>{S.detRecordActual}</button>
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <p className="text-2xl font-bold text-navy-900">{fmtMiliar(project.actual)}</p>
                    <p className="text-xs text-steel-500">{S.detActualOf.replace("{a}", fmtMiliar(project.budget))}</p>
                  </div>
                  <Badge tone={project.actual > project.budget ? "red" : "green"}>
                    {project.budget ? Math.round((project.actual / project.budget) * 100) : 0}%
                  </Badge>
                </div>
                <ProgressBar value={project.budget ? (project.actual / project.budget) * 100 : 0} tone="ocean" className="mt-3" />
                <p className="mt-3 text-xs text-steel-500">
                  {S.detCoImpact.replace("{a}", fmtRupiah(coApprovedImpact)).replace("{n}", String(coApproved.length))}
                </p>
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.detEvmTitle}</h3>
                {(() => {
                  const pv = project.budget;
                  const ev = Math.round((project.budget * project.progress) / 100);
                  const ac = project.actual;
                  const spi = pv > 0 ? ev / pv : 0;
                  const cpi = ac > 0 ? ev / ac : 0;
                  const eac = cpi > 0 ? Math.round(ac / cpi) : ac;
                  return (
                    <>
                      <dl className="dl-div text-sm">
                        <div className="flex justify-between"><dt className="text-steel-500">{S.detPv}</dt><dd className="font-medium">{fmtMiliar(pv)}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">{S.detEv}</dt><dd className="font-medium">{fmtMiliar(ev)}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">{S.detAc}</dt><dd className="font-medium">{fmtMiliar(ac)}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">{S.detSpiCpi}</dt><dd className="font-medium">{spi.toFixed(2)} / {cpi.toFixed(2)}</dd></div>
                      </dl>
                      <p className="mt-3 text-sm text-steel-600">
                        {S.detEacPrefix}<span className="font-semibold text-amber-600">{fmtMiliar(eac)}</span>{" "}
                        {cpi < 1 && ac > 0 ? S.detEacOver : cpi >= 1 ? S.detEacOk : S.detEacNone}
                      </p>
                    </>
                  );
                })()}
                <h3 className="mb-2 mt-4 text-sm font-semibold text-navy-900">{S.detProjInv.replace("{n}", String(invoices.length))}</h3>
                <div className="space-y-1.5">
                  {invoices.map((i) => (
                    <div key={i.id} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-navy-900">{i.id}</span>
                      <span className="text-steel-600">{fmtMiliar(invGrand(i))}</span>
                      <StatusBadge status={i.status} />
                    </div>
                  ))}
                  {invoices.length === 0 && <p className="text-xs text-steel-400">{S.detNoInv}</p>}
                </div>
              </Card>
            </div>

            {/* ==== BIAYA EQUIPMENT YANG DIBEBANKAN KE HPP PROYEK ====
                Booking equipment (alokasi) + material maintenanceequipment
                ikut dibebankan ke HPP proyek ini. Sebelumnya tidak ada
                sama sekali, sehingga EAC/CPI terlihat terlalu optimis. */}
            <Card className="mt-4 p-5">
              <h3 className="mb-1 text-sm font-semibold text-navy-900">
                {locale === "en" ? "Equipment cost charged to this project (HPP)" : "Biaya Equipment yang Dibebankan ke Proyek Ini (HPP)"}
              </h3>
              <p className="text-xs text-steel-500">
                {locale === "en"
                  ? "From equipment allocation bookings and maintenance material. Same figures as the Equipment module, so the two cannot drift."
                  : "Dari alokasi/booking equipment dan material maintenance. Angka sama dengan modul Equipment, jadi keduanya tidak bisa melenceng."}
              </p>

              {!equipHasCost ? (
                <p className="mt-3 text-xs text-steel-400">
                  {locale === "en"
                    ? "No equipment cost booked to this project yet."
                    : "Belum ada biaya equipment yang dibebankan ke proyek ini."}
                </p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[11px] text-steel-500">{locale === "en" ? "Rental" : "Sewa"}</p>
                      <p className="text-sm font-semibold text-navy-900">{fmtRupiah(equipCost.rental)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-steel-500">{locale === "en" ? "Fuel" : "BBM"}</p>
                      <p className="text-sm font-semibold text-navy-900">{fmtRupiah(equipCost.fuel)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-steel-500">{locale === "en" ? "Maintenance" : "Maintenance"}</p>
                      <p className="text-sm font-semibold text-navy-900">{fmtRupiah(equipCost.maintenanceRealized)}</p>
                      {equipCost.maintenanceCommitted > 0 && (
                        <p className="text-[11px] text-amber-600">
                          + {fmtRupiah(equipCost.maintenanceCommitted)} {locale === "en" ? "in progress" : "berjalan"}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-steel-500">{locale === "en" ? "Charged to HPP" : "Dibebankan ke HPP"}</p>
                      <p className="text-sm font-bold text-navy-900">{fmtRupiah(equipCost.totalRealized)}</p>
                    </div>
                  </div>

                  {/* Rincian per booking - bisa diklik ke modul equipment. */}
                  <div className="mt-4 mb-2 flex flex-wrap items-center justify-end gap-2">
                    <SearchBox value={detailBkQ} onChange={setDetailBkQ} className="max-w-xs" placeholder={locale === "en" ? "Search bookings..." : "Cari booking..."} ariaLabel={locale === "en" ? "Search bookings" : "Cari booking"} />
                    <button className="btn-secondary text-xs" onClick={() => setCostDetail(true)}>
                      {locale === "en" ? "Detail" : "Detail"}
                    </button>
                  </div>
                  {equipCost.bookingRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-surface">
                          <tr>
                            <SortTh label={locale === "en" ? "Booking" : "Booking"} sortKey="id" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} />
                            <SortTh label={locale === "en" ? "Equipment" : "Equipment"} sortKey="eq" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} />
                            <th className="th">{locale === "en" ? "Date" : "Tanggal"}</th>
                            <SortTh label={locale === "en" ? "Hours" : "Jam"} sortKey="h" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} />
                            <SortTh label={locale === "en" ? "Cost" : "Biaya"} sortKey="c" sort={sort4} onSort={(k) => setSort4((s) => toggleSort(s, k))} />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {sortRows(equipCost.bookingRows.filter((r) => rowMatches(r as unknown as Record<string, unknown>, detailBkQ, ["id", "equipmentName", "date", "hours", "rental", "fuel", "cost"])), sort4, (r, k) => {
                            if (k === "eq") return r.equipmentName;
                            if (k === "h") return r.hours;
                            if (k === "c") return r.cost;
                            return r.id;
                          }).map((r) => (
                            <tr key={r.id} className="hover:bg-surface">
                              <td className="td font-mono text-xs text-navy-900">{r.id}</td>
                              <td className="td text-steel-600">{r.equipmentName}</td>
                              <td className="td text-steel-600 text-xs">{fmtTanggal(r.date)}</td>
                              <td className="td text-steel-600">{r.hours} jam</td>
                              <td className="td font-semibold">{fmtRupiah(r.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Rincian per siklus maintenance yang diproyekkan. */}
                  {equipCost.maintenanceRows.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {equipCost.maintenanceRows.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 py-1.5 text-sm">
                          <span className="min-w-0 truncate text-navy-900">
                            <span className="font-mono text-xs text-steel-500">{r.id}</span>{" "}
                            {r.equipmentName}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Badge tone={r.realized ? "green" : "amber"}>
                              {r.realized ? (locale === "en" ? "Charged" : "Terbebankan") : (locale === "en" ? "In progress" : "Berjalan")}
                            </Badge>
                            <span className="text-xs text-steel-500">{fmtTanggal(r.date)}</span>
                            {r.labor > 0 && (
                              <span className="text-[11px] text-steel-400">
                                {locale === "en"
                                  ? `${fmtRupiah(r.material)} + ${fmtRupiah(r.labor)} labour`
                                  : `${fmtRupiah(r.material)} + ${fmtRupiah(r.labor)} tenaga`}
                              </span>
                            )}
                            <span className="font-semibold">{fmtRupiah(r.cost)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Efek ke EAC: CPI dengan AC + equipment, bukan AC saja. */}
                  <p className="mt-4 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
                    {locale === "en"
                      ? `Actual cost used in EVM: ${fmtRupiah(Number(project.actual ?? 0))} + equipment ${fmtRupiah(equipCost.totalRealized)} = ${fmtRupiah(hppWithEquip)}.`
                      : `Biaya aktual dipakai untuk EVM: ${fmtRupiah(Number(project.actual ?? 0))} + equipment ${fmtRupiah(equipCost.totalRealized)} = ${fmtRupiah(hppWithEquip)}.`}
                    {equipCost.maintenanceCommitted > 0 && (
                      <span className="block text-amber-600">
                        {locale === "en"
                          ? `Plus ${fmtRupiah(equipCost.maintenanceCommitted)} committed but not yet realised.`
                          : `Plus ${fmtRupiah(equipCost.maintenanceCommitted)} terkunci tapi belum terealisasi.`}
                      </span>
                    )}
                  </p>
                </>
              )}
            </Card>
            </div>
          )}

          {tab === "Tim" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowTeam(true)}><Plus className="h-3.5 w-3.5" /> {S.detAddMember}</button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {team.map((e) => (
                  <Card key={e.id} className="flex items-center gap-3 p-4">
                    {e.photo ? (
                      <SecureImg src={String(e.photo)} alt={String(e.name)} name={String(e.name)} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <Avatar name={String(e.name)} className="h-10 w-10 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-900">{e.name}</p>
                      <p className="text-xs text-steel-500">{e.role} · {e.dept}</p>
                    </div>
                    <button className="rounded p-1 text-rose-400 hover:bg-rose-50" title={S.detRemoveTitle} onClick={async () => { try { await setTeam(pid, teamIds.filter((t) => t !== e.id)); log("mengeluarkan anggota tim", `${pid} · ${e.id} · ${e.name}`, "Proyek"); toast(S.detToastRemoved.replace("{a}", e.name), "info"); } catch (err) { toast(err instanceof Error ? err.message : S.saveFail, "info"); } }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Card>
                ))}
                {team.length === 0 && <p className="text-sm text-steel-400">{S.detNoTeam}</p>}
                {/* D14: id tim yang employee-nya sudah dihapus dari SDM -
                    jangan hilang diam-diam, tampilkan sebagai riwayat. */}
                {(() => {
                  const dangling = teamIds.filter((id) => !data.employees.some((e) => e.id === id));
                  if (dangling.length === 0) return null;
                  return (
                    <div className="col-span-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="font-semibold">
                        {locale === "en"
                          ? `${dangling.length} former member(s) no longer in SDM`
                          : `${dangling.length} anggota terdahulu sudah tidak ada di SDM`}
                      </p>
                      <p className="mt-1 font-mono text-[11px]">{dangling.join(", ")}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {tab === "Dokumen & Laporan" && (
            <div>
              <style>{`@media print { .doc-card, .bast-card, .report-card { break-inside: avoid; page-break-inside: avoid; } table, thead, tbody, tr { break-inside: auto; page-break-inside: auto; } }`}</style>
              <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.detDocTitle}</h3>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowDoc(true)}><Plus className="h-3.5 w-3.5" /> {S.detAddDoc}</button>
              </div>
              <div className="space-y-2">
                {docs.map((d) => {
                  const url = docUrlOf(d);
                  const fname = docBaseName(d, url);
                  const isNew = lastUploadedId === String(d.id);
                  /* PD2: ikon view membuka modal Detail (preview + Unduh di
                     dalam modal), bukan expand inline di kartu. `isNew` hanya
                     memberi tanda "Baru diunggah" + sorotan tepi. */
                  return (
                  <div key={d.id} className={`doc-card rounded-xl border p-3 text-sm ${isNew ? "border-ocean-400 ring-2 ring-ocean-100" : "border-steel-100"}`} style={{ breakInside: "avoid" }}>
                    <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900">{d.title} {isNew && <Badge tone="teal">Baru diunggah</Badge>}</p>
                      {/* Sub-tipe + rujukan QC ikut tampil di kartu. Tanpa ini
                          data yang baru disimpan ada di DB tapi tidak pernah
                          terlihat di halaman tempat user mengisinya. */}
                      {(d.subType !== undefined || d.qcCertId !== undefined) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {d.subType !== undefined && <Badge tone="gray">{String(d.subType)}</Badge>}
                          {d.qcCertId !== undefined && <Badge tone="blue">QC: {String(d.qcCertId)}</Badge>}
                        </span>
                      )}
                      <p className="text-xs text-steel-500">{d.id} · {d.type} · {d.version} · {d.updated}{fname !== "" ? ` · lampiran: ${fname}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button className="btn-secondary text-xs" aria-label={`${locale === "en" ? "Detail" : "Detail"}: ${d.title}`} onClick={() => setDocDetail(d)}>
                        <Eye className="h-3.5 w-3.5" /> {locale === "en" ? "Detail" : "Detail"}
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => { setShareForm({ docId: String(d.id), to: "" }); setShowShare(true); }}>{S.detShareBtn}</button>
                      <StatusBadge status={d.status} />
                    </div>
                    </div>
                    <div className="mt-2">
                      {url === "" ? (
                        <p className="text-xs text-steel-400">Belum ada lampiran file.</p>
                      ) : (
                        /* PD2: ikon view membuka MODAL (bukan expand inline).
                           Download ada di dalam modal + tetap di kartu. */
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100 hover:text-ocean-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
                            title={`Pratinjau: ${String(d.title ?? d.id)}`}
                            aria-label={`Pratinjau: ${String(d.title ?? d.id)}`}
                            onClick={() => setDocDetail(d)}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <DownloadFileButton url={url} fileName={fname !== "" ? fname : undefined} className="btn-secondary px-2 py-1 text-xs" />
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
                {docs.length === 0 && <p className="text-sm text-steel-400">{S.detNoDocs}</p>}
              </div>
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.detBastTitle.replace("{n}", String(bastList.length))}</h3>
                  <button className="btn-secondary text-xs" onClick={() => { setBastForm({ milestone: "", tanggal: todayISO(), signer: "", lampiran: "", amount: "" }); setShowBast(true); }}><Plus className="h-3.5 w-3.5" /> {S.detCreateBast}</button>
                </div>
                <div className="space-y-2">
                  {bastList.map((b) => {
                    const linked = findLinkedWbs(String(b.milestone ?? ""));
                    return (
                      <div key={String(b.id)} className="bast-card flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm" style={{ breakInside: "avoid" }}>
                        <div className="min-w-0">
                          <p className="font-medium text-navy-900">{String(b.id)} · {String(b.milestone)}</p>
                          <p className="text-xs text-steel-500">{fmtTanggal(String(b.tanggal))}{S.detBastSigner}{String(b.penandatangan ?? "-")}{b.lampiran ? `${S.detBastAttach}${String(b.lampiran)}` : ""} · {fmtRupiah(Number(b.amount || 0))}{linked ? S.detBastWbs.replace("{a}", linked.task).replace("{b}", String(linked.progress)) : ""}</p>
</div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={String(b.status)} />
                          {String(b.status) === "Draft" && (
                            <button className="btn-secondary text-xs" onClick={() => advanceBast(b, "Diajukan")}>{S.detProposeBtn}</button>
                          )}
                          {String(b.status) === "Diajukan" && (
                            <button className="btn-secondary text-xs" onClick={() => advanceBast(b, "Disetujui")}>{S.detApproveInvBtn}</button>
                          )}
                          {/* BAST boleh dicetak begitu sudah diajukan: suratnya
                              sedang ditandatangani. Draft tidak - isinya belum
                              pernah ditandatangani siapa pun, jadi salinannya
                              tidak ada nilainya. */}
                          {String(b.status) !== "Draft" && (
                            <button
                              className="btn-secondary text-xs"
                              onClick={() => void printBastPdf(b)}
                              title={locale === "en" ? "Print the handover certificate" : "Cetak Berita Acara Serah Terima"}
                            >
                              BAST PDF
                            </button>
                          )}
                          {String(b.status) === "Draft" && (
                            <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelRec({ kind: "bast", row: b })}>{locale === "en" ? "Delete" : "Hapus"}</button>
                          )}
                          {String(b.status) !== "Draft" && (
                            <span className="text-xs text-steel-400" title={String(b.status) === "Disetujui" ? (locale === "en" ? "Approved BAST is a signed record" : "BAST Disetujui sudah jadi dokumen bertanda tangan") : (locale === "en" ? "Already submitted for approval" : "Sudah diajukan untuk persetujuan")}>
                              {locale === "en" ? "Locked" : "Terkunci"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {bastList.length === 0 && <p className="text-sm text-steel-400">{S.detNoBast}</p>}
                </div>
              </div>
            </div>
          )}

          {tab === "Equipment" && (
            /* Item 5d revisi 2 Oktober: equipment yang dipakai PROYEK INI.
               Modul Equipment punya tab "Sedang Dipakai", tapi isinya
               seluruh yard - manajer proyek tidak bisa memilih unit
               miliknya sendiri tanpa menyaring manual.
               Sumbernya `equipCost`, yang sudah difilter per proyek, jadi
               tidak ada perhitungan baru di sini dan angkanya tidak mungkin
               berbeda dari kartu Biaya. */
            <div className="space-y-4">
              <Card>
                <CardHeader
                  title={locale === "en" ? "Equipment in use on this project" : "Equipment yang dipakai proyek ini"}
                  subtitle={locale === "en"
                    ? "Bookings and maintenance recorded against this project."
                    : "Booking dan maintenance yang tercatat pada proyek ini."}
                />
                <div className="p-4">
                  {equipCost.bookingRows.length === 0 && equipCost.maintenanceRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-steel-400">
                      {locale === "en" ? "No equipment used on this project yet." : "Belum ada equipment yang dipakai proyek ini."}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {equipCost.bookingRows.length > 0 && (
                        <div>
                          <SearchBox value={cardBkQ} onChange={setCardBkQ} className="mb-2 max-w-xs" placeholder={locale === "en" ? "Search bookings..." : "Cari booking..."} ariaLabel={locale === "en" ? "Search bookings" : "Cari booking"} />
                          <div className="overflow-x-auto">
                            <table className="w-full">
                            <thead className="bg-surface">
                              <tr>
                                <th className="th">{locale === "en" ? "Booking" : "Booking"}</th>
                                <th className="th">{locale === "en" ? "Equipment" : "Equipment"}</th>
                                <th className="th">{locale === "en" ? "Date" : "Tanggal"}</th>
                                <th className="th text-right">{locale === "en" ? "Hours" : "Jam"}</th>
                                <th className="th text-right">{locale === "en" ? "Cost" : "Biaya"}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-steel-100">
                              {equipCost.bookingRows.filter((r) => rowMatches(r as unknown as Record<string, unknown>, cardBkQ, ["id", "equipmentName", "date", "hours", "rental", "fuel", "cost"])).map((r) => (
                                <tr key={r.id} className="hover:bg-surface">
                                  <td className="td font-mono text-xs text-navy-900">{r.id}</td>
                                  <td className="td text-steel-600">{r.equipmentName}</td>
                                  <td className="td text-steel-600 text-xs">{fmtTanggal(r.date)}</td>
                                  <td className="td text-right">{r.hours}</td>
                                  <td className="td text-right font-semibold">{fmtRupiah(r.cost)}</td>
                                </tr>
                              ))}
                            </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {equipCost.maintenanceRows.length > 0 && (
                        <div>
                          <SearchBox value={cardMaintQ} onChange={setCardMaintQ} className="mb-2 max-w-xs" placeholder={locale === "en" ? "Search maintenance..." : "Cari maintenance..."} ariaLabel={locale === "en" ? "Search maintenance" : "Cari maintenance"} />
                          <div className="overflow-x-auto">
                            <table className="w-full">
                            <thead className="bg-surface">
                              <tr>
                                <th className="th">{locale === "en" ? "Maintenance" : "Maintenance"}</th>
                                <th className="th">{locale === "en" ? "Equipment" : "Equipment"}</th>
                                <th className="th">{locale === "en" ? "Status" : "Status"}</th>
                                <th className="th text-right">{locale === "en" ? "Cost" : "Biaya"}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-steel-100">
{equipCost.maintenanceRows.filter((r) => rowMatches(r as unknown as Record<string, unknown>, cardMaintQ, ["id", "equipmentName", "status", "date", "material", "labor", "cost", "realized"])).map((r) => (
                                  <tr key={r.id} className="hover:bg-surface">
                                  <td className="td font-mono text-xs text-navy-900">{r.id}</td>
                                  <td className="td text-steel-600">{r.equipmentName}</td>
                                  <td className="td"><StatusBadge status={r.status} /></td>
                                  <td className="td text-right font-semibold">{fmtRupiah(r.material + r.labor)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-4 border-t border-steel-100 pt-3">
                        <div className="text-right">
                          <p className="text-[11px] text-steel-500">{locale === "en" ? "Charged to COGS" : "Dibebankan ke HPP"}</p>
                          <p className="text-sm font-bold text-navy-900">{fmtRupiah(equipCost.totalRealized)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-steel-500">{locale === "en" ? "Incl. committed" : "Incl. komitmen"}</p>
                          <p className="text-sm font-bold text-navy-900">{fmtRupiah(equipCost.totalCommitted)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {tab === "Perubahan & Risiko" && (
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.detCoTitle.replace("{n}", String(coList.length))}</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowCo(true)}><Plus className="h-3.5 w-3.5" /> {S.detProposeCo}</button>
                </div>
                <div className="mb-3 rounded-xl border border-steel-100 bg-surface p-3 text-sm">
                  <span className="text-steel-500">{S.detCoTotalPrefix}</span>
                  <span className="font-semibold text-navy-900">{fmtRupiah(coApprovedImpact)}</span>
                  <span className="text-steel-500">{S.detCoTotalSuffix.replace("{n}", String(coApproved.length))}</span>
                </div>
                <div className="space-y-2">
                  {coList.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-navy-900">{c.title}</p>
                        <p className="text-xs text-steel-500">{c.id} · {fmtTanggal(c.date)} · {S.detCoRequester}{c.requestedBy} · {S.detCoImpactLbl}<span className={`font-semibold ${Number(c.impact) < 0 ? "text-emerald-600" : "text-navy-900"}`}>{fmtRupiah(Number(c.impact))}</span>
                          {String(c.boqAction ?? "none") !== "none" && (
                            <span className="ml-1">
                              <Badge tone="blue">{String(c.boqAction) === "revise" ? (locale === "en" ? "Revise BoQ" : "Revisi BoQ") : (locale === "en" ? "Add BoQ" : "Tambah BoQ")}</Badge>
                            </span>
                          )}
                          {c.appliedAt ? <span className="ml-1 text-steel-400">· {locale === "en" ? "applied" : "diterapkan"} {fmtTanggal(String(c.appliedAt))}</span> : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        {c.status === "Diajukan" && (
                          <>
                            <button className="btn-secondary text-xs" onClick={() => setCoStatus(c.id, "Disetujui")}>{S.detApproveBtn}</button>
                            <button className="btn-secondary text-xs" onClick={() => setCoStatus(c.id, "Ditolak")}>{S.detRejectBtn}</button>
                          </>
                        )}
                        {c.status === "Disetujui" && (
                            <button className="btn-secondary text-xs" onClick={() => setCoStatus(c.id, "Diterapkan")}>{S.detApplyBtn}</button>
                        )}
                        {c.status !== "Diterapkan" && (
                          <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelRec({ kind: "changeOrders", row: c })}>{locale === "en" ? "Delete" : "Hapus"}</button>
                        )}
                        {c.status === "Diterapkan" && (
                          <span className="text-xs text-steel-400" title={locale === "en" ? "Applied to contract value" : "Sudah masuk nilai kontrak"}>
                            {locale === "en" ? "Locked" : "Terkunci"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {coList.length === 0 && <p className="text-sm text-steel-400">{S.detNoCo}</p>}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.detRiskTitle.replace("{n}", String(riskList.length))}</h3>
                </div>
                <p className="mb-2 text-xs text-steel-400">{S.detRiskAutoNote}</p>
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full text-center text-xs">
                    <thead>
                      <tr>
                        <SortTh label={S.detMatrixCorner} sortKey="level" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                        {RISK_LEVEL.map((l) => <SortTh key={l} label={l} sortKey={l} sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(RISK_LEVEL, sort3, (lh, k) => k === "level" ? String(lh) : Number(riskList.filter((r) => String(r.likelihood) === String(lh) && String(r.impact) === String(k) && String(r.status) !== "Tertutup").length)).map((lh) => (
                        <tr key={lh}>
                          <td className="td text-left font-medium text-navy-900">{lh}</td>
                          {RISK_LEVEL.map((im) => {
                            const n = riskList.filter((r) => r.likelihood === lh && r.impact === im && r.status !== "Tertutup").length;
                            const score = (RISK_LEVEL.indexOf(lh) + 1) * (RISK_LEVEL.indexOf(im) + 1);
                            return (
                              <td key={im} className="td">
                                <Badge tone={n > 0 ? riskTone(score) : "gray"}>{S.detRiskCount.replace("{n}", String(n))}</Badge>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2">
                  {riskList.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-navy-900">{r.title}</p>
                        <p className="text-xs text-steel-500">{r.id} · {S.detMitigation}{r.mitigation || "-"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={riskTone(riskScore(r))}>{r.likelihood} × {r.impact}</Badge>
                        <StatusBadge status={r.status} />
                        <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelRec({ kind: "risks", row: r })}>{locale === "en" ? "Delete" : "Hapus"}</button>
                      </div>
                    </div>
                  ))}
                  {riskList.length === 0 && <p className="text-sm text-steel-400">{S.detNoRisk}</p>}
                </div>
              </div>
            </div>
          )}

          {/* D15: tab Subkon — ringkasan subkontraktor, WO, dan termin per proyek. */}
          {tab === "Subkon" && (
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">{S.detSubkonTitle.replace("{n}", String(subkonList.length))}</h3>
                {subkonList.length === 0 ? (
                  <p className="text-xs text-steel-400">{S.detNoSubkon}</p>
                ) : (
                  <div className="space-y-3">
                    {subkonList.map((s) => {
                      const subWos = wos.filter((w) => String(w.sub ?? "") === String(s.name ?? ""));
                      const subTermins = subkonTermins.filter((t) => subWos.some((w) => String(w.id ?? "") === String(t.woId ?? "")));
                      return (
                        <div key={s.id} className="rounded-xl border border-steel-100 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-navy-900">{String(s.name ?? "")}</p>
                            <Badge tone={s.status === "Aktif" ? "green" : s.status === "Blacklist" ? "red" : "amber"}>{String(s.status ?? "-")}</Badge>
                          </div>
                          <p className="mb-2 text-xs text-steel-500">
                            {S.detSubkonContract.replace("{a}", fmtRupiah(Number(s.contract ?? 0)))}
                            {s.k3 ? ` · K3 ${String(s.k3)}` : ""}
                          </p>
                          <div className="space-y-1">
                            {subWos.map((w) => {
                              const woTerms = subTermins.filter((t) => String(t.woId ?? "") === String(w.id ?? ""));
                              return (
                                <div key={w.id} className="rounded-lg bg-steel-50 px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <span className="font-mono text-xs font-semibold text-navy-900">{w.id}</span>
                                    <span className="text-xs text-steel-600">{String(w.scope ?? "")}</span>
                                    <Badge tone={w.status === "Selesai" ? "green" : "blue"}>{w.progress}%</Badge>
                                  </div>
                                  {woTerms.length > 0 && (
                                    <div className="mt-1.5 space-y-0.5">
                                      {woTerms.map((t) => (
                                        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-steel-500">
                                          <span>{String(t.milestone ?? "")}</span>
                                          <span className="font-semibold">{fmtRupiah(Number(t.amount ?? 0))}</span>
                                          <StatusBadge status={String(t.status ?? "Draf")} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === "Terkait" && (
            <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.detDockTitle.replace("{n}", String(slots.length))}</h3>
                {slots.map((s) => <p key={s.id} className="py-1 text-sm text-steel-600">{S.detDockRow.replace("{a}", s.dockId).replace("{b}", String(s.from)).replace("{c}", String(s.to))}</p>)}
                {slots.length === 0 && <p className="text-xs text-steel-400">{S.detNoDock}</p>}
              </Card>
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.detWoTitle.replace("{n}", String(wos.length))}</h3>
                {wos.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-steel-600">{w.id} · {w.sub}</span>
                    <Badge tone={w.status === "Selesai" ? "green" : "blue"}>{w.progress}%</Badge>
                  </div>
                ))}
                {wos.length === 0 && <p className="text-xs text-steel-400">{S.detNoWo}</p>}
              </Card>
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.detNcrTitle.replace("{n}", String(ncrs.length))}</h3>
                {ncrs.map((n) => (
                  <div key={n.id} className="flex items-center justify-between py-1 text-sm">
                    <span className="font-mono text-navy-900">{n.id}</span>
                    <StatusBadge status={n.status} />
                  </div>
                ))}
                {ncrs.length === 0 && <p className="text-xs text-steel-400">{S.detNoNcr}</p>}
              </Card>
            </div>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy-900">{S.detWarTitle.replace("{n}", String(warrantyList.length))}</h3>
{project.status === "Selesai" && (
                  <button className="btn-secondary text-xs" onClick={() => createWarranty()}><Plus className="h-3.5 w-3.5" /> {S.detCreateWar}</button>
                )}
              </div>
              {project.status !== "Selesai" && (
                <p className="mb-2 text-xs text-steel-500">{S.detWarHint}</p>
              )}
              {/* D11: garansi per WBS task yang sudah selesai. */}
              {project.status === "Selesai" && wbs.some((w) => Number(w.progress ?? 0) >= 100) && (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-medium text-steel-500">{S.detWarPerTask}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {wbs.filter((w) => Number(w.progress ?? 0) >= 100 && !warrantyList.some((wr) => String(wr.wbsTask ?? "") === w.task)).map((w) => (
                      <button key={w.task} className="btn-secondary text-xs" onClick={() => createWarranty(w.task)}>
                        <Plus className="h-3 w-3" /> {w.task}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {warrantyList.map((w) => (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900 font-mono">{w.id}</p>
                      {w.wbsTask && <p className="text-xs text-ocean-700">{w.wbsTask}</p>}
                      <p className="text-xs text-steel-500">{S.detWarRow.replace("{a}", fmtTanggal(String(w.start ?? ""))).replace("{b}", String(w.months ?? 12)).replace("{c}", String(w.status ?? "Aktif"))}</p>
                    </div>
                    <StatusBadge status={String(w.status ?? "Aktif")} />
                  </div>
                ))}
                {warrantyList.length === 0 && <p className="text-xs text-steel-400">{S.detNoWar}</p>}
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy-900">{S.detTrialTitle.replace("{n}", String(trialList.length))}</h3>
                <button className="btn-secondary text-xs" onClick={openTrialNew}><Plus className="h-3.5 w-3.5" /> {S.detCreateTrial}</button>
              </div>
              <p className="mb-2 text-xs text-steel-500">{S.detTrialHint}</p>
              <div className="space-y-2">
                {trialList.map((t) => (
                  <div key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900">{String(t.id)} · {fmtTanggal(String(t.tanggal))}</p>
                      <p className="text-xs text-steel-500">{S.detTrialParam}{String(t.parameter ?? "-")}{t.punchList ? `${S.detTrialPunch}${String(t.punchList)}` : ""}{t.baRef ? `${S.detTrialBa}${String(t.baRef)}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={String(t.hasil ?? "Berjalan")} />
                      {String(t.hasil) !== "Lolos" && (
                        <button className="btn-secondary text-xs" onClick={() => advanceTrial(t, "Lolos")}>{S.detTrialPassBtn}</button>
                      )}
                      {String(t.hasil) !== "Gagal" && (
                        <button className="btn-secondary text-xs" onClick={() => advanceTrial(t, "Gagal")}>{S.detTrialFailBtn}</button>
                      )}
                      {!t.baRef && (
                        <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelRec({ kind: "trials", row: t })}>{locale === "en" ? "Delete" : "Hapus"}</button>
                      )}
                      {String(t.baRef ?? "") !== "" && (
                        <span className="text-xs text-steel-400" title={locale === "en" ? "Signed off with a BA reference" : "Sudah ditandatangani dengan nomor BA"}>
                          {locale === "en" ? "Locked" : "Terkunci"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {trialList.length === 0 && <p className="text-xs text-steel-400">{S.detNoTrial}</p>}
              </div>
            </Card>
            </div>
          )}
          {tab === "BoQ" && <BoQSection projectId={pid} />}
          {tab === "Dokumen & Laporan" && <div className="report-print mt-6" style={{ breakInside: "auto" }}><ReportSection projectId={pid} /></div>}
          {tab === "3D Viewer" && getSetting(data, "SHOW_3D_PROJECT", 0) === 1 && <SparepartServiceSection projectId={pid} view="3d" />}
          {tab === "Service" && <SparepartServiceSection projectId={pid} view="service" />}
          {tab === "Sparepart" && <SparepartServiceSection projectId={pid} view="sparepart" />}
        </div>
      </div>

      {/* Modal Trial */}
      <Modal open={showTrial} onClose={() => setShowTrial(false)} title={S.detCreateTrial} subtitle={`${pid} · ${nextTrialId(trialForm.tanggal || todayISO())}`}
        footer={<><button className="btn-secondary" onClick={() => setShowTrial(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveTrial}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.dateField}><input type="date" className="input" value={trialForm.tanggal} onChange={(e) => setTrialForm({ ...trialForm, tanggal: e.target.value })} /></Field>
          <Field label={S.detParamField}><input className="input" value={trialForm.parameter} onChange={(e) => setTrialForm({ ...trialForm, parameter: e.target.value })} placeholder={S.detParamPh} /></Field>
          <Field label={S.detPunchField}><input className="input" value={trialForm.punchList} onChange={(e) => setTrialForm({ ...trialForm, punchList: e.target.value })} placeholder={S.detPunchPh} /></Field>
          <Field label={S.detBaField}><input className="input" value={trialForm.baRef} onChange={(e) => setTrialForm({ ...trialForm, baRef: e.target.value })} placeholder={S.detBaPh} /></Field>
          <Field label={S.detTrialKondisi}>
            <select className="input" value={trialForm.kondisi} onChange={(e) => setTrialForm({ ...trialForm, kondisi: e.target.value as "Baik" | "Perlu Perbaiki" | "Rusak" })}>
              <option value="Baik">{locale === "en" ? "Good" : "Baik"}</option>
              <option value="Perlu Perbaiki">{locale === "en" ? "Needs Fixing" : "Perlu Perbaiki"}</option>
              <option value="Rusak">{locale === "en" ? "Damaged" : "Rusak"}</option>
            </select>
          </Field>
          {/* D10: checklist dari WBS task yang sudah selesai. */}
          {trialForm.checklist.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-steel-500">{S.detTrialChecklist}</p>
              <div className="space-y-1.5">
                {trialForm.checklist.map((item, idx) => (
                  <div key={item.wbsTask} className="flex items-center gap-2 rounded-lg border border-steel-100 px-2.5 py-1.5">
                    <input type="checkbox" checked={item.done} onChange={(e) => {
                      const next = [...trialForm.checklist];
                      next[idx] = { ...next[idx], done: e.target.checked };
                      setTrialForm({ ...trialForm, checklist: next });
                    }} />
                    <span className="flex-1 text-xs font-medium text-navy-900">{item.wbsTask}</span>
                    <input className="input max-w-40 !py-0.5 text-xs" value={item.note} placeholder={locale === "en" ? "Note" : "Catatan"} onChange={(e) => {
                      const next = [...trialForm.checklist];
                      next[idx] = { ...next[idx], note: e.target.value };
                      setTrialForm({ ...trialForm, checklist: next });
                    }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Detail Biaya Equipment (item 8d revisi 2 Oktober).
          Angkanya SAMA dengan kartu di atas - keduanya diambil dari
          `equipCost`, jadi tidak mungkin melenceng. Yang ditambah di sini
          adalah dua hal yang perlu dibuka: pekerjaan maintenance yang
          dihitung sebagai komitmen, dan baris detail per maintenance yang
          di halaman hanya diringkas jadi satu angka. */}
      <Modal
        open={costDetail}
        onClose={() => setCostDetail(false)}
        wide
        title={locale === "en" ? "Equipment cost detail" : "Detail Biaya Equipment"}
        subtitle={pid}
        footer={<button className="btn-secondary" onClick={() => setCostDetail(false)}>{S.cancelBtn}</button>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([
              { label: locale === "en" ? "Rental" : "Sewa", value: equipCost.rental, bold: false },
              { label: locale === "en" ? "Fuel" : "BBM", value: equipCost.fuel, bold: false },
              { label: locale === "en" ? "Maintenance (realized)" : "Maintenance (terealisasi)", value: equipCost.maintenanceRealized, bold: false },
              { label: locale === "en" ? "Maintenance (committed)" : "Maintenance (komitmen)", value: equipCost.maintenanceCommitted, bold: false },
              { label: locale === "en" ? "Charged to COGS" : "Dibebankan ke HPP", value: equipCost.totalRealized, bold: true },
              { label: locale === "en" ? "Budget incl. committed" : "Anggaran incl. komitmen", value: equipCost.totalCommitted, bold: true },
            ] as { label: string; value: number; bold: boolean }[]).map((k) => (
                <div key={k.label} className="rounded-xl border border-steel-100 p-2.5">
                  <p className="text-[11px] text-steel-500">{k.label}</p>
                  <p className={`text-sm ${k.bold ? "font-bold" : "font-semibold"} text-navy-900`}>{fmtRupiah(k.value)}</p>
                </div>
              ))}
          </div>

          {equipCost.maintenanceRows.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-navy-900">
                {locale === "en" ? "Maintenance breakdown" : "Rincian maintenance"}
              </p>
              <SearchBox value={breakdownMaintQ} onChange={setBreakdownMaintQ} className="mb-2 max-w-xs" placeholder={locale === "en" ? "Search maintenance..." : "Cari maintenance..."} ariaLabel={locale === "en" ? "Search maintenance" : "Cari maintenance"} />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr>
                      <th className="th">{locale === "en" ? "ID" : "ID"}</th>
                      <th className="th">{locale === "en" ? "Equipment" : "Equipment"}</th>
                      <th className="th">{locale === "en" ? "Status" : "Status"}</th>
                      <th className="th text-right">{locale === "en" ? "Material" : "Material"}</th>
                      <th className="th text-right">{locale === "en" ? "Labor" : "Tenaga"}</th>
                      <th className="th text-right">{locale === "en" ? "Total" : "Total"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {equipCost.maintenanceRows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface">
                        <td className="td font-mono text-xs text-navy-900">{r.id}</td>
                        <td className="td text-steel-600">{r.equipmentName}</td>
                        <td className="td"><StatusBadge status={r.status} /></td>
                        <td className="td text-right">{fmtRupiah(r.material)}</td>
                        <td className="td text-right">{fmtRupiah(r.labor)}</td>
                        <td className="td text-right font-semibold">{fmtRupiah(r.material + r.labor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[11px] text-steel-400">
            {locale === "en"
              ? "Realized figures are already charged to project COGS. Committed figures are ongoing work not yet charged."
              : "Angka terealisasi sudah dibebankan ke HPP proyek. Angka komitmen adalah pekerjaan berjalan yang belum dibebankan."}
          </p>
        </div>
      </Modal>

      {/* Modal BAST */}
      <Modal open={showBast} onClose={() => setShowBast(false)} title={S.detCreateBast} subtitle={`${pid} · ${nextBastId(bastForm.tanggal || todayISO())}`}
        footer={<><button className="btn-secondary" onClick={() => setShowBast(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveBast}>{S.detSaveDraft}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.detMileField} hint={S.detMileHint}>
            <select className="input" value={bastForm.milestone} onChange={(e) => setBastForm({ ...bastForm, milestone: e.target.value })}>
              <option value="">{S.detPickMile}</option>
              {wbs.map((t) => <option key={t.task} value={t.task}>{t.task} · {t.progress}%</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.dateField}><input type="date" className="input" value={bastForm.tanggal} onChange={(e) => setBastForm({ ...bastForm, tanggal: e.target.value })} /></Field>
            <Field label={S.detAmountField} hint={contractValue > 0 ? `Sisa kontrak ${fmtRupiah(sisaKontrak)}` : (boqTotal > 0 ? S.detAmountHintBoq.replace("{a}", fmtRupiah(boqTotal)) : S.detAmountHintPlain)}>
              <NumInput min={0} className="input" value={bastForm.amount} onChange={(e) => setBastForm({ ...bastForm, amount: e.target.value })} placeholder={contractValue > 0 ? String(sisaKontrak) : (boqTotal > 0 ? String(boqTotal) : S.detAmountPh)} />
            </Field>
          </FormGrid>
          <Field label={S.detSignerField}><input className="input" value={bastForm.signer} onChange={(e) => setBastForm({ ...bastForm, signer: e.target.value })} placeholder={S.detSignerPh} /></Field>
          <Field label={S.detAttachField}><input className="input" value={bastForm.lampiran} onChange={(e) => setBastForm({ ...bastForm, lampiran: e.target.value })} placeholder={S.detAttachPh} /></Field>
          <FileUploadButton label={S.detAttachUpload} onUploaded={(url) => setBastForm((v) => ({ ...v, lampiran: url }))} />
        </div>
      </Modal>

      {/* Modal change order */}
      <Modal open={showCo} onClose={() => setShowCo(false)} title={S.detCoModal} subtitle={pid}
        footer={<><button className="btn-secondary" onClick={() => setShowCo(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveCo}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.detCoTitleField}><input className="input" value={coForm.title} onChange={(e) => setCoForm({ ...coForm, title: e.target.value })} placeholder={S.detCoTitlePh} /></Field>
          <FormGrid>
            <Field label={locale === "en" ? "BoQ action" : "Aksi BoQ"}>
              <select className="input" value={coForm.boqAction} onChange={(e) => setCoForm({ ...coForm, boqAction: e.target.value as "none" | "revise" | "add" })}>
                <option value="none">{locale === "en" ? "No BoQ change" : "Tanpa perubahan BoQ"}</option>
                <option value="revise">{locale === "en" ? "Revise existing BoQ item" : "Revisi item BoQ"}</option>
                <option value="add">{locale === "en" ? "Add new BoQ item" : "Tambah item BoQ baru"}</option>
              </select>
            </Field>
            <Field label={S.dateField}><input type="date" className="input" value={coForm.date} onChange={(e) => setCoForm({ ...coForm, date: e.target.value })} /></Field>
          </FormGrid>
          {coForm.boqAction === "revise" && (
            <Field label={locale === "en" ? "BoQ item" : "Item BoQ"}>
              <select className="input" value={coForm.boqItemId} onChange={(e) => {
                const item = coBoqItems.find((b) => String(b.id) === e.target.value);
                setCoForm({
                  ...coForm,
                  boqItemId: e.target.value,
                  boqPrice: item ? String(item.unitPrice ?? "") : "",
                  boqQty: item ? String(item.quantity ?? 1) : "1",
                });
              }}>
                <option value="">{locale === "en" ? "-- pick item --" : "-- pilih item --"}</option>
                {coBoqItems.map((b) => <option key={b.id} value={b.id}>{String(b.id)} · {String(b.name)} · {fmtRupiah(Number(b.unitPrice || 0))}</option>)}
              </select>
            </Field>
          )}
          {coForm.boqAction === "add" && (
            <>
              <FormGrid>
                <Field label={locale === "en" ? "Item name" : "Nama item"}><input className="input" value={coForm.boqName} onChange={(e) => setCoForm({ ...coForm, boqName: e.target.value })} /></Field>
                <Field label={locale === "en" ? "Letter no" : "No surat"}><input className="input font-mono" value={coForm.boqSurat} onChange={(e) => setCoForm({ ...coForm, boqSurat: e.target.value })} placeholder="SPK/..." /></Field>
              </FormGrid>
              <Field label={locale === "en" ? "Description" : "Deskripsi"}><input className="input" value={coForm.boqDesc} onChange={(e) => setCoForm({ ...coForm, boqDesc: e.target.value })} /></Field>
            </>
          )}
          {coForm.boqAction !== "none" && (
            <FormGrid>
              <Field label={locale === "en" ? "Qty" : "Qty"}><NumInput min={1} className="input" value={coForm.boqQty} onChange={(e) => setCoForm({ ...coForm, boqQty: e.target.value })} /></Field>
              <Field label={locale === "en" ? "Unit price" : "Harga satuan"}><NumInput min={0} className="input" value={coForm.boqPrice} onChange={(e) => setCoForm({ ...coForm, boqPrice: e.target.value })} /></Field>
            </FormGrid>
          )}
          {coForm.boqAction === "add" && (
            <FormGrid>
              <Field label={locale === "en" ? "Unit" : "Satuan"}>
                <select className="input" value={coForm.boqUnit} onChange={(e) => setCoForm({ ...coForm, boqUnit: e.target.value })}>
                  {["pcs", "unit", "set", "ton", "kg", "m", "service", "package"].map((u) => <option key={u}>{u}</option>)}
                </select>
              </Field>
              <Field label={locale === "en" ? "Category" : "Kategori"}>
                <select className="input" value={coForm.boqCategory} onChange={(e) => setCoForm({ ...coForm, boqCategory: e.target.value })}>
                  {["Mechanical", "Paint", "Survey", "Fabrikasi", "Electrical", "Piping", "Rigging"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </FormGrid>
          )}
          <Field
            label={S.detCoImpactField}
            hint={coAutoImpact !== null
              ? (locale === "en" ? `Auto-calculated from BoQ: ${fmtRupiah(coAutoImpact)}` : `Otomatis dari BoQ: ${fmtRupiah(coAutoImpact)}`)
              : S.detCoImpactHint}
          >
            <NumInput
              className="input"
              value={coAutoImpact !== null ? String(coAutoImpact) : coForm.impact}
              onChange={(e) => setCoForm({ ...coForm, impact: e.target.value })}
              placeholder={S.detCoImpactPh}
              readOnly={coAutoImpact !== null}
            />
          </Field>
          <Field label={S.detRequester}><input className="input" value={coForm.requestedBy} onChange={(e) => setCoForm({ ...coForm, requestedBy: e.target.value })} placeholder={S.detRequesterPh} /></Field>
        </div>
      </Modal>

      {/* Modal risiko dihapus (D8): risiko kini dihasilkan otomatis dari WBS
          dan milestone WO. Form input manual tidak diperlukan lagi. */}

      {/* Modal catat realisasi (R2: tombol toast-only dijadikan tulis beneran) */}
      <Modal open={showActual} onClose={() => setShowActual(false)} title={S.detActualModal}
        footer={<><button className="btn-secondary" onClick={() => setShowActual(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveActual}>{S.saveBtn}</AsyncButton></>}>
        <Field label={S.detActualAmount}>
          <NumInput min={0} className="input" value={actualVal} onChange={(e) => setActualVal(e.target.value)} placeholder={S.detActualPh} />
        </Field>
        <p className="mt-2 text-xs text-steel-500">{S.detActualNow.replace("{a}", fmtRupiah(Number(project.actual ?? 0)))}</p>
      </Modal>

      {/* Modal ubah status (kaku: konfirmasi + alasan wajib) */}
      <Modal open={statusPending !== null} onClose={() => { setStatusPending(null); setStatusReason(""); }} title={S.detStatusTitle.replace("{a}", statusPending ?? "")}
        footer={<><button className="btn-secondary" onClick={() => { setStatusPending(null); setStatusReason(""); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmStatus}>{S.saveBtn}</AsyncButton></>}>
        <p className="text-sm text-steel-600">{project.id} · {project.status} → {statusPending}</p>
        <Field label={S.detStatusReason}>
          <textarea className="input" rows={3} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
        </Field>
      </Modal>

      {/* Modal geser tahap (kaku: E1 gate + alasan wajib) */}
      <Modal open={tahapMove !== null} onClose={() => { setTahapMove(null); setTahapReason(""); }} title={S.detTahapTitle.replace("{a}", pid)}
        footer={<><button className="btn-secondary" onClick={() => { setTahapMove(null); setTahapReason(""); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmTahapMove}>{S.saveBtn}</AsyncButton></>}>
        <p className="text-sm text-steel-600">{tahapOf(project)} → {tahapMove ? TAHAP[TAHAP.indexOf(tahapOf(project)) + tahapMove.dir] : "-"}</p>
        <Field label={S.detTahapReason}>
          <textarea className="input" rows={3} value={tahapReason} onChange={(e) => setTahapReason(e.target.value)} />
        </Field>
      </Modal>

      {/* Modal share */}
      <Modal open={docDetail !== null} onClose={() => setDocDetail(null)} wide
        title={docDetail ? String(docDetail.title) : ""}
        subtitle={docDetail ? `${String(docDetail.id)} · ${String(docDetail.type)} · ${String(docDetail.version)}` : undefined}
        footer={<>
          <button className="btn-secondary" onClick={() => setDocDetail(null)}>{S.cancelBtn}</button>
          {docDetail && docAttachment(docDetail).url !== "" && (
            <DownloadFileButton
              url={docAttachment(docDetail).url}
              fileName={docAttachment(docDetail).fileName || undefined}
              className="btn-primary"
            />
          )}
          {docDetail && (
            /* Excel tetap ada, tapi sebagai aksi ketiga di dalam modal. */
            <button className="btn-secondary" onClick={() => {
              const d = docDetail;
              void exportExcel(
                [["Kolom", "Nilai"], ["ID", d.id], ["Judul", d.title], ["Tipe", d.type], ["Proyek", pid], ["Versi", d.version], ["Status", d.status], ["Diperbarui", d.updated], ["Pemilik", d.owner]],
                `${d.id}-ringkasan`,
              ).then(() => toast(S.detToastExported.replace("{a}", String(d.id)))).catch(() => toast(S.saveFail, "info"));
            }}>
              <FileDown className="h-3.5 w-3.5" /> {S.excelBtn}
            </button>
          )}
        </>}
      >
        {docDetail && (() => {
          const d = docDetail;
          const att = docAttachment(d);
          const revs = Array.isArray(d.revisions) ? (d.revisions as Array<Record<string, unknown>>) : [];
          const fields: Array<[string, string]> = [
            [locale === "en" ? "Document ID" : "ID dokumen", String(d.id)],
            [locale === "en" ? "Title" : "Judul", String(d.title)],
            [locale === "en" ? "Type" : "Tipe", String(d.type)],
            [locale === "en" ? "Project" : "Proyek", pid],
            [locale === "en" ? "Version" : "Versi", String(d.version)],
            [locale === "en" ? "Status" : "Status", String(d.status)],
            [locale === "en" ? "Owner" : "Pemilik", String(d.owner)],
            [locale === "en" ? "Updated" : "Diperbarui", fmtTanggal(String(d.updated))],
            [locale === "en" ? "Copy" : "Salinan", String(d.docCopy ?? "Terkendali")],
          ];
          const approval = [d.approvalStatus, d.approvedBy, d.approvedAt ? fmtTanggal(String(d.approvedAt)) : ""].filter((x) => x !== "" && x !== undefined && String(x) !== "-").map(String).join(" · ");
          return (
            <div className="space-y-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {fields.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-steel-500">{k}</dt>
                    <dd className="text-right font-medium text-navy-900">{v}</dd>
                  </div>
                ))}
                {approval !== "" && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-steel-500">{locale === "en" ? "Approval" : "Persetujuan"}</dt>
                    <dd className="text-right font-medium text-navy-900">{approval}</dd>
                  </div>
                )}
              </dl>
              {att.url !== "" && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-navy-900">{locale === "en" ? "Attachment" : "Lampiran"}</h4>
                  <DocumentPreviewPanel doc={{ title: String(d.title), fileUrl: att.url, fileName: att.fileName, subtitle: String(d.id) }} />
                </div>
              )}
              {revs.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-navy-900">{locale === "en" ? "Revision history" : "Riwayat revisi"}</h4>
                  <div className="space-y-1 text-xs text-steel-600">
                    {revs.map((r, i) => (
                      <p key={`${String(r.version)}-${i}`}>
                        <span className="font-mono text-navy-900">{String(r.version ?? "-")}</span>
                        {" · "}{fmtTanggal(String(r.at ?? ""))}
                        {" · "}{String(r.by ?? "-")}
                        {r.note ? ` · ${String(r.note)}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal open={showShare} onClose={() => setShowShare(false)} title={S.detShareModal}
        footer={<><button className="btn-secondary" onClick={() => setShowShare(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={async () => {
          if (!shareForm.docId || !shareForm.to) { toast(S.detToastPickDoc, "info"); return; }
          const doc = docs.find((d: any) => d.id === shareForm.docId);
          try {
            await update("documents", shareForm.docId, { sharedWith: [...(doc?.sharedWith ?? []), shareForm.to] });
            log("berbagi dokumen dengan atasan", `${shareForm.docId} → ${shareForm.to}`, "Dokumen");
            toast(S.detToastShared.replace("{a}", shareForm.to));
            setShowShare(false);
            setShareForm({ docId: "", to: "" });
          } catch (e) {
            toast(e instanceof Error ? e.message : S.saveFail, "info");
          }
        }}>{S.detSendBtn}</button></>}>
        <FormGrid>
          <Field label={S.detDocField}>
            <select className="input" value={shareForm.docId} onChange={(e) => setShareForm({ ...shareForm, docId: e.target.value })}>
              <option value="">{S.detPickDoc}</option>
              {docs.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
          <Field label={S.detShareTo}><input className="input" value={shareForm.to} onChange={(e) => setShareForm({ ...shareForm, to: e.target.value })} placeholder={S.detShareToPh} /></Field>
        </FormGrid>
      </Modal>

      {/* Modal update WBS task */}
      <Modal open={wbsTaskUpdate !== null} onClose={() => setWbsTaskUpdate(null)} title={S.detWbsUpdateTitle.replace("{a}", wbsTaskUpdate ?? "")}
        footer={<><button className="btn-secondary" onClick={() => setWbsTaskUpdate(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveWbsTask}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.detProgField} hint={S.detProgHint}><NumInput min={0} max={100} className="input" value={wbsUpdateForm.progress} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, progress: e.target.value })} placeholder={S.detProgPh} /></Field>
          <FormGrid>
            <Field label={S.detHours}><NumInput className="input" value={wbsUpdateForm.hours} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, hours: e.target.value })} placeholder={S.detHoursPh} /></Field>
            <Field label={S.detDft} hint={S.detDftHint}><NumInput min={0} className="input" value={wbsUpdateForm.dft} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, dft: e.target.value })} placeholder={S.detDftPh} /></Field>
          </FormGrid>
          <Field label={S.detMaterial}>
            <select className="input" value={wbsUpdateForm.material} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, material: e.target.value })}>
              <option value="">{locale === "en" ? "-- select material --" : "-- pilih material --"}</option>
              {invList.map((inv) => (
                <option key={inv.id} value={String(inv.name ?? "")}>
                  {String(inv.name ?? "")} — stok: {String(inv.stock ?? 0)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={S.detStation} hint={wbsTaskUpdate && /hull/i.test(wbsTaskUpdate) ? S.detStationReq : S.detStationOpt}>
            <select className="input" value={wbsUpdateForm.station} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, station: e.target.value })}>
              <option value="">{S.detPickStation}</option>
              {STATIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label={S.detPhotoNote} hint={S.detPhotoHint}><input className="input" value={wbsUpdateForm.photoNote} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, photoNote: e.target.value })} placeholder={S.detPhotoPh} /></Field>
          <div className="flex items-center gap-2">
            <FileUploadButton accept=".png,.jpg,.jpeg" label={S.detPhotoUpload} onUploaded={(url) => setWbsUpdateForm((v) => ({ ...v, photoUrl: url }))} />
            {wbsUpdateForm.photoUrl ? (
              <span className="flex flex-wrap items-center gap-2">
                <SecureImg src={wbsUpdateForm.photoUrl} alt="Foto WBS" name="WBS" className="h-14 w-20 rounded-lg border border-steel-200 object-cover" />
                <DocumentPreviewCell
                  doc={{
                    title: "Foto WBS",
                    fileUrl: wbsUpdateForm.photoUrl,
                  }}
                />
              </span>
            ) : null}
          </div>
          <Field label={S.statusLabel}>
            <select className="input" value={wbsUpdateForm.status} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, status: e.target.value as "Sedang" | "Selesai" })}>
              <option value="Sedang">Sedang Dikerjakan</option>
              <option value="Selesai">Selesai</option>
            </select>
          </Field>
          <Field label={S.detPred} hint={S.detPredHint}>
            <select className="input" value={wbsUpdateForm.predecessor} onChange={(e) => setWbsUpdateForm({ ...wbsUpdateForm, predecessor: e.target.value })}>
              <option value="">{S.detNoPred}</option>
              {wbs.filter((w) => w.task !== wbsTaskUpdate).map((w) => <option key={w.task} value={w.task}>{w.task}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal WBS */}
      <Modal open={showWbs} onClose={() => setShowWbs(false)} title={S.detWbsModal}
        footer={<><button className="btn-secondary" onClick={() => setShowWbs(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveWbs}>{S.addBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.detStageName}><input className="input" value={wbsForm.task} onChange={(e) => setWbsForm({ ...wbsForm, task: e.target.value })} /></Field>
          <FormGrid>
            <Field label={S.detStart}><input type="date" className="input" placeholder={S.detWbsStartPh} value={wbsForm.start === "-" ? "" : wbsForm.start} onChange={(e) => setWbsForm({ ...wbsForm, start: e.target.value })} /></Field>
            <Field label={S.detEnd}><input type="date" className="input" placeholder={S.detWbsEndPh} value={wbsForm.end === "-" ? "" : wbsForm.end} onChange={(e) => setWbsForm({ ...wbsForm, end: e.target.value })} /></Field>
            <Field label={S.detWeight}><NumInput className="input" value={wbsForm.weight} onChange={(e) => setWbsForm({ ...wbsForm, weight: e.target.value })} /></Field>
            <Field label={S.detProgField}><NumInput className="input" value={wbsForm.progress} onChange={(e) => setWbsForm({ ...wbsForm, progress: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.detPred} hint={S.detPredHint}>
            <select className="input" value={wbsForm.predecessor} onChange={(e) => setWbsForm({ ...wbsForm, predecessor: e.target.value })}>
              <option value="">{S.detNoPred}</option>
              {wbs.map((w) => <option key={w.task} value={w.task}>{w.task}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal tim */}
      <Modal open={showTeam} onClose={() => setShowTeam(false)} title={S.detTeamModal}
        footer={<><button className="btn-secondary" onClick={() => setShowTeam(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={async () => {
          if (!teamPick) { toast(S.detToastPickEmp, "info"); return; }
          if (teamIds.includes(teamPick)) { toast(S.detToastDupMember, "info"); return; }
          try {
            await setTeam(pid, [...teamIds, teamPick]);
            log("menambah anggota tim", `${pid} · ${data.employees.find((e) => e.id === teamPick)?.name}`, "Proyek");
            toast(S.detToastMemberAdd); setShowTeam(false); setTeamPick("");
          } catch (e) {
            toast(e instanceof Error ? e.message : S.saveFail, "info");
          }
        }}>{S.addBtn}</button></>}>
        <Field label={S.detEmployee}>
          <select className="input" value={teamPick} onChange={(e) => setTeamPick(e.target.value)}>
            <option value="">{S.detPickEmployee}</option>
            {data.employees.filter((e) => !teamIds.includes(e.id)).map((e) => (
              <option key={e.id} value={e.id}>{e.name} · {e.role}</option>
            ))}
          </select>
        </Field>
      </Modal>

      {/* Modal dokumen proyek */}
      <Modal open={showDoc} onClose={() => setShowDoc(false)} title={S.detDocModal} subtitle={pid}
        footer={<><button className="btn-secondary" onClick={() => setShowDoc(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={async () => {
          if (!docTitle.trim()) { toast(S.detToastDocTitle, "info"); return; }
          try {
            /* Nilai yang diketik user disimpan sesuai sifatnya: kalau berbentuk
               URL, ini lampiran yang bisa langsung dipratinjau; kalau hanya
               nama berkas, itu metadata dan disimpan di `fileName`. Versi lama
               selalu menulis ke `fileName`, jadi lampiran yang diketik sebagai
               URL tidak pernah bisa dibuka. */
            const typed = docFile.trim();
            const created = await add("documents", {
              title: docTitle.trim(),
              type: docType,
              ...(docSubType.trim() !== "" ? { subType: docSubType.trim() } : {}),
              ...(docQcCertId.trim() !== "" ? { qcCertId: docQcCertId.trim() } : {}),
              project: pid,
              vessel: project.vessel,
              version: "v1.0",
              status: "Draft",
              updated: new Date().toISOString().slice(0, 10),
              owner: docOwner.trim() !== "" ? docOwner.trim() : sessionName,
              sharedWith: [],
              approvalStatus: "Draft",
              ...(looksLikeUrl(typed) ? { fileUrl: typed } : { fileName: typed || "-" }),
            }, { action: "mengarsipkan dokumen", module: "Dokumen" });
            toast(S.detToastDocAdd); setShowDoc(false); setDocTitle(""); setDocFile("");
            /* Pratinjau TIDAK dibuka otomatis lagi (item 6 revisi 2 Oktober).
               Sebelumnya `setOpenDocId` + `setLastUploadedId` langsung memuat
               berkas di dalam kartu begitu disimpan, jadi pengguna tidak
               pernah bisa menutup apa pun untuk melanjutkan pekerjaan - dan
               modal yang baru saja ditutup ikut dibuka lagi dari bawah.

               `lastUploadedId` tetap diisi: itu yang memberi ringkasan "Baru
               diunggah" dan sorotan tepi pada kartu, jadi pengguna tahu
               dokumen mana yang baru, tanpa isinya merebut layar. */
             setLastUploadedId(String(created.id));
            setTab("Dokumen & Laporan");
          } catch (e) {
            toast(e instanceof Error ? e.message : S.saveFail, "info");
          }
        }} >{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.detDocTitleField}><input className="input" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} /></Field>
          {/* Tipe + sub-tipe + rujukan QC (item 5e revisi 2 Oktober).
              Ketiganya satu form yang sama dengan modul Dokumen: daftar tipe
              dari `DOC_TYPES`, bukan 8 nilai yang ditulis manual di sini -
              dokumen Penawaran/Dock Space/Surat Jalan/Tanda Terima tidak bisa
              dibuat dari tab proyek sebelumnya. "Kontrak Kerja" kini sub-tipe
              dari Kontrak, bukan tipe sendiri. */}
          <Field label={S.detDocType}>
            <select
              className="input"
              value={docType}
              onChange={(e) => { setDocType(e.target.value); setDocSubType(""); setDocQcCertId(""); }}
            >
              {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          {subTypesOf(docType).length > 0 && (
            <Field label={locale === "en" ? "Sub-type" : "Sub-tipe"}>
              <select className="input" value={docSubType} onChange={(e) => { setDocSubType(e.target.value); setDocQcCertId(""); }}>
                <option value="">-</option>
                {subTypesOf(docType).map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}
          {docNeedsQc && (
            <Field
              label={locale === "en" ? "QC certificate reference" : "Rujukan Sertifikat QC"}
              hint={locale === "en"
                ? "Required so the archive can prove QC inspected this."
                : "Wajib diisi agar arsip bisa membuktikan tim QC sudah memeriksanya."}
            >
              <select className="input" value={docQcCertId} onChange={(e) => setDocQcCertId(e.target.value)}>
                <option value="">-</option>
                {docQcOptions.map((d) => (
                  <option key={String(d.id)} value={String(d.id)}>{String(d.id)} · {String(d.title ?? "")}</option>
                ))}
              </select>
              {docQcOptions.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  {locale === "en"
                    ? "No QC certificate in this project yet."
                    : "Belum ada Sertifikat QC di proyek ini."}
                </p>
              )}
            </Field>
          )}
          <Field label={locale === "en" ? "Owner (person in charge)" : "Penanggung jawab"}>
            <EntityPicker
              value={docOwner}
              onChange={setDocOwner}
              options={docOwnerOptions}
              placeholder={locale === "en" ? "Search employee..." : "Cari karyawan..."}
              ariaLabel={locale === "en" ? "Owner" : "Penanggung jawab"}
              emptyText={locale === "en" ? "No matching employee." : "Tidak ada karyawan yang cocok."}
            />
          </Field>
          <Field label={S.detDocFile} hint={S.detDocFileHint}>
            <input className="input" value={docFile} onChange={(e) => setDocFile(e.target.value)} placeholder={S.detDocFilePh} />
          </Field>
          <FileUploadButton label={S.detAttachUpload} onUploaded={(url) => setDocFile(url)} />
          {/* Pratinjau langsung muncul begitu ada URL di field di atas -_Unggah_
              sudah mengisinya, dan mengetik URL juga langsung menambah pratinjau.
              Tidak ada tombol "tampilkan pratinjau" terpisah. Kalau yang diketik
              cuma nama berkas (bukan URL), panelnya sengaja tidak muncul dan
              field-nya diberi catatan, karena tidak ada berkas yang bisa
              diambil. */}
          {looksLikeUrl(docFile) ? (
            <div className="rounded-xl border border-steel-100 bg-surface p-2">
              <p className="mb-1 text-[11px] font-semibold text-steel-500">Pratinjau sebelum simpan</p>
              <InlineDocPreview url={docFile.trim()} height={/\.pdf(\?|$)/i.test(docFile) ? "h-64" : "h-44"} />
            </div>
          ) : docFile.trim() !== "" ? (
            <p className="text-[11px] text-amber-700">
              &ldquo;{docFile.trim()}&rdquo; dibaca sebagai nama berkas, bukan URL, jadi tidak bisa dipratinjau. Gunakan tombol Unggah bila ingin melampirkan berkasnya.
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Modal scope */}
      <Modal open={showScope} onClose={() => setShowScope(false)} title={S.detScopeModal}
        footer={<><button className="btn-secondary" onClick={() => setShowScope(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveScope}>{S.addBtn}</button></>}>
        <div className="grid gap-3">
          <Field label={S.prjScopeType}>
            <input className="input" placeholder={S.detScopeTypePh2} value={scopeVal.service} onChange={(e) => setScopeVal((v) => ({ ...v, service: e.target.value }))} />
          </Field>
          <Field label={S.prjScopeLoc}>
            <input className="input" placeholder={S.detScopeLocPh} value={scopeVal.lokasi} onChange={(e) => setScopeVal((v) => ({ ...v, lokasi: e.target.value }))} />
          </Field>
          <Field label={S.prjScopeDesc}>
            <input className="input" placeholder={S.detScopeDescPh} value={scopeVal.deskripsi} onChange={(e) => setScopeVal((v) => ({ ...v, deskripsi: e.target.value }))} />
          </Field>
        </div>
      </Modal>
      <ConfirmModal open={delRec !== null}
        title={delRec ? (locale === "en" ? `Delete ${delRec.kind.slice(0, -1)} ${String(delRec.row.id)}?` : `Hapus ${delRec.row.id}?`) : ""}
        desc={delRec ? (recLocked(delRec.kind, delRec.row) ?? (locale === "en"
          ? "This record will be permanently removed from the project."
          : "Record ini akan dihapus permanen dari proyek.")) : ""}
        confirmLabel={S.detConfirmDelete} danger
        confirmDisabled={delRec ? recLocked(delRec.kind, delRec.row) !== null : false}
        onCancel={() => setDelRec(null)}
        onConfirm={confirmDelRec}
      />

      <ConfirmModal open={delScope !== null} title={S.detDelScopeTitle} desc={S.detDelScopeDesc}
        confirmLabel={S.detConfirmDelete} danger onCancel={() => setDelScope(null)}
        onConfirm={async () => {
          try {
            if (delScope !== null) await update("projects", pid, { scope: scopeList(project.scope).filter((_, i) => i !== delScope) });
          } catch {
            toast(S.detToastScopeDelFail, "info");
          }
          setDelScope(null);
        }} />
      <ConfirmModal open={showDelBaseline} title={S.detDelBaseTitle} desc={S.detDelBaseDesc}
        confirmLabel={S.detConfirmDelete} danger onCancel={() => setShowDelBaseline(false)}
        onConfirm={async () => { try { await update("projects", pid, { wbsBaseline: undefined }); log("menghapus baseline WBS", pid, "Proyek"); toast(S.detToastBaseDel, "info"); setShowDelBaseline(false); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } }} />
    </div>
  );
}
