import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, ScrollText, FileText, Eye, Pencil, Trash2, Archive, RotateCcw, Download, Upload } from "lucide-react";
import { Card, PageHeader, Badge, KpiCard, Modal, Field, FormGrid, ConfirmModal, SortTh, toggleSort, sortRows, toast, StatusBadge, usePager, AsyncButton, EntityPicker, SearchBox, rowMatches } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { FilterPopover } from "../../components/FilterPopover";
import { useStore, type StoreItem, type CollectionKey } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { DocumentPreviewCell, DocumentPreviewPanel, InlineDocPreview } from "../../components/DocumentPreview";
import { isBackendConfigured } from "../../services/http";
import { ocrImageUrl } from "../../services/upload";
import { uploadFile } from "../../services/upload";
import { fmtTanggal, todayISO } from "../../utils/format";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import { AlertBannerView, flashPick, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { rowHighlightClass } from "../../components/rowHighlight";
import { sbDsNumber, sbSjNumber, sbTtNumber, maxSeq, parseSjSeq } from "../../utils/sb";
import { exportExcel } from "../../utils/export";
import { findUsages } from "../../utils/usages";
import { docAttachment, docFileNameOf, docUrlOf, looksLikeUrl } from "../../utils/docAttachment";
import { n_dry } from "../../i18n/n_dry";
import { useT } from "../../i18n/LanguageContext";
import { monthAxis, monthKeyOf } from "../../utils/monthAxis";
import { DOC_TYPES, NEEDS_QC_LINK, qcCertCandidates, subTypesOf } from "../../utils/docTypes";

const TYPES: readonly string[] = DOC_TYPES;
const FILTERS = ["Semua", ...TYPES, "Arsip"];

/* Item 5e revisi 2 Oktober: sub-tipe dokumen.
 *
 * Sebelumnya semua sertifikat tersimpan sebagai `Sertifikat` polos, sehingga
 * "Sertifikat K3", "Sertifikat Kelas", dan "Sertifikat Otoritas" tidak bisa
 * dibedakan: hitungan masa berlaku tetap benar, tapi sertifikat mana yang
 * perlu dipesan ulang tidak jelas, dan arsip tidak bisa diaudit per jenis.
 *
 * Definisi TYPES/SUB_TYPES/NEEDS_QC_LINK sekarang tinggal di
 * `utils/docTypes.ts` supaya form dokumen di Detail Proyek memakai daftar yang
 * sama - sebelumnya keduanya ditulis terpisah dan sudah berkhianat. Detail
 * pemindahannya ada di sana. */
export { SUB_TYPES, subTypesOf, NEEDS_QC_LINK } from "../../utils/docTypes";

/* Tinggi pratinjau PDF perlu lebih lega daripada gambar supaya halaman pertama
   terbaca tanpa perlu menggulir di dalam iframe. */
const PDF_HEIGHT_RE = /\.pdf(\?|$)/i;
/* OCR backend hanya menangani gambar, jadi tombolnya disembunyikan untuk PDF. */
const IMAGE_URL_RE = /\.(png|jpe?g|webp|bmp)(\?|$)/i;

/* Batch koleksi modul Dokumen untuk useModuleSync (pengganti resync penuh). */
const DOC_COLS: CollectionKey[] = ["activities", "documents", "vessels", "projects"];
const EXPIRY_WINDOW = 30;


const FLOW_NEXT: Record<string, string[]> = {
  Draft: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Berlaku"],
  Ditolak: [],
  Berlaku: ["Kedaluwarsa"],
  Kedaluwarsa: [],
};

const PREFIX: Record<string, string> = {
  Kontrak: "CTR", Drawing: "DRW", Prosedur: "SOP", Sertifikat: "SRT",
  Laporan: "LAP", Invoice: "INV", NCR: "NCR", Penawaran: "QTN",
  "Dock Space": "DS-SB", "Surat Jalan": "SJ-SMD", "Tanda Terima": "TT-SMD",
};

const RETENSI: Record<string, number | null> = {
  Kontrak: 10, Sertifikat: 5, Laporan: 5, Invoice: 10, NCR: 5,
  Drawing: null, Prosedur: 5, Penawaran: 3,
  "Dock Space": 5, "Surat Jalan": 5, "Tanda Terima": 5,
};

function nextDocId(type: string, docs: StoreItem[]): string {
  const prefix = PREFIX[type] ?? "DOC";
  const year = todayISO().slice(0, 4);
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let max = 0;
  for (const d of docs) {
    const m = re.exec(String(d.id ?? ""));
    if (m) max = Math.max(max, Number(m[1]) || 0);
    const m2 = new RegExp(`^${prefix}-(\\d+)$`).exec(String(d.id ?? ""));
    if (m2) max = Math.max(max, 0);
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

function lewatRetensi(d: StoreItem): boolean {
  const tahun = RETENSI[String(d.type)];
  if (tahun === null || tahun === undefined) return false;
  const upd = String(d.updated ?? "");
  const t = new Date(`${upd.length === 7 ? `${upd}-01` : upd}T00:00:00`).getTime();
  if (Number.isNaN(t)) return false;
  const years = (Date.now() - t) / (365.25 * 86400000);
  return years > tahun;
}

const LEGACY_MAP: Record<string, string> = {
  "Menunggu Approval": "Diajukan",
};

function canonStatus(s: string): string {
  if (LEGACY_MAP[s]) return LEGACY_MAP[s];
  return FLOW_NEXT[s] !== undefined ? s : "";
}

function nextVersion(v: string): string {
  const m = /^v(\d+)\.(\d+)$/.exec(String(v).trim());
  if (m) return `v${m[1]}.${Number(m[2]) + 1}`;
  const m2 = /^v(\d+)$/.exec(String(v).trim());
  if (m2) return `v${m2[1]}.1`;
  return "v1.1";
}

function daysUntil(iso: string | null | undefined): number | null {  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

const emptyForm = { title: "", type: "Laporan", subType: "", project: "", vessel: "", owner: "", berlakuHingga: "", revNote: "", fileUrl: "", qcCertId: "" };

/* Teks cari mencakup owner / tipe / OCR / lampiran, bukan cuma judul.
   Lampiran dibaca lewat docAttachment supaya pencarian tetap menemukan dokumen
   yang lampirannya hanya tersimpan di `fileName` (seed lama). */
function docHay(d: StoreItem): string {
  const att = docAttachment(d);
  return `${d.title ?? ""} ${d.id ?? ""} ${d.project ?? ""} ${d.vessel ?? ""} ${d.owner ?? ""} ${d.type ?? ""} ${d.ocrText ?? ""} ${att.url} ${att.fileName}`.toLowerCase();
}

/**
 * Pisahkan nilai input lampiran sesuai sifatnya saat disimpan.
 *
 * Kalau nilainya URL, ia jadi `fileUrl` (bisa langsung dipratinjau/diunduh).
 * Kalau hanya nama berkas, ia jadi `fileName` (metadata). Versi lama selalu
 * menulis apa pun ke `fileUrl`, jadi mengetik "kontrak.pdf" menghasilkan
 * dokumen yang tombol pratinjau-nya pasti 404 - dan tidak pernah bisa
 * diperbaiki karena sumbernya sudah salah bentuk.
 */
function attachFields(typed: string): { fileUrl?: string; fileName?: string } {
  if (typed === "") return {};
  return looksLikeUrl(typed) ? { fileUrl: typed } : { fileName: typed };
}

export default function Documents() {
  const { data, add, update, remove, log, branch, inBranch } = useStore();
  const { locale } = useT();
  const S = n_dry[locale];
  const modAlert = useModuleAlert("dokumen");
  const flash = useNotifFlash();
  const deepParams = useDeepLinkParams();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  /* Fetch per-batch modul (pengganti resync penuh): dokumen + vessels + projects. */
  useModuleSync(DOC_COLS);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [type, setType] = useState("Semua");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [detail, setDetail] = useState<StoreItem | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [archiving, setArchiving] = useState<StoreItem | null>(null);
  const [deleting, setDeleting] = useState<StoreItem | null>(null);
  const [form, setForm] = useState(emptyForm);

  /* Dokumen Sertifikat yang boleh dipilih sebagai dasar QC untuk sertifikat
     yang sedang dibuat. Hanya proyek yang sedang dikerjakan dan dokumen
     bertipe Sertifikat - dua filter ini yang membuat tautan berarti: tanpa
     itu, users bisa menautkan sertifikat K3 ke sertifikat palang kapal lain. */
const qcCertOptions = useMemo(
    () => qcCertCandidates(data.documents ?? [], form.project, String(editing?.id ?? ""), form.subType),
    [data.documents, form.project, editing?.id, form.subType],
  );

  /* Penanggung jawab disimpan sebagai NAMA (bukan id) - `owner` sudah
     tercetak di banyak dokumen dan seed lama semuanya berisi nama. Jadi nilai
     picker = nama, sedangkan id employee dipakai sebagai hint pencarian. */
  const ownerOptions = useMemo(
    () => data.employees.map((e) => ({
      value: String(e.name ?? "").trim(),
      label: String(e.name ?? "").trim(),
      hint: [String(e.role ?? "").trim(), String(e.nip ?? "").trim(), String(e.id ?? "")].filter((x) => x !== "").join(" · "),
    })).filter((o) => o.value !== ""),
    [data.employees],
  );
  const [relSel, setRelSel] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [distTo, setDistTo] = useState("");

  const distLog = (Array.isArray(detail?.distribusi) ? detail.distribusi : []) as { to: string; at: string; by?: string }[];
  /* Lampiran baris yang sedang dibuka detail, dihitung sekali supaya panel
     pratinjau dan baris "Lampiran" di bawahnya tidak pernah berbeda pendapat. */
  const detailAttach = useMemo(() => docAttachment(detail), [detail]);

  const sendDist = async () => {
    if (!detail) return;
    if (!distTo.trim()) { toast(S.tDistToReq, "info"); return; }
    const entry = { to: distTo.trim(), at: todayISO(), by: String(detail.owner ?? "") };
    const next = [...distLog, entry];
    try {
      await update("documents", detail.id, { distribusi: next, updated: todayISO() });
      log(`mendistribusikan dokumen ke ${entry.to}`, String(detail.id), "Dokumen");
      toast(S.tDistSent.replace("{a}", String(detail.id)).replace("{b}", entry.to));
      setDetail((cur) => (cur && cur.id === detail.id ? { ...cur, distribusi: next, updated: todayISO() } : cur));
      setDistTo("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const docPreview = nextDocId(form.type, data.documents);

  const active = inBranch(data.documents.filter((d) => !d.archived));
  const archived = inBranch(data.documents.filter((d) => d.archived));

/* `docHay` masih dipakai untuk pencarian isi lampiran/OCR - field yang bukan
       properti rekam. Pencarian properti memakai `rowMatches` supaya multi-kata
       ("kontrak 2026") bisa dicocokkan lintas field, dan supaya field yang
       tidak disebut tidak ikut terambil. */
    const list = (type === "Arsip" ? archived : active.filter((d) => type === "Semua" || d.type === type)).filter((d) => {
      if (q.trim() === "") return true;
      const fields = ["id", "title", "project", "vessel", "owner", "type", "subType"];
      if (rowMatches(d as unknown as Record<string, unknown>, q, fields)) return true;
      /* Satu kata kunci = cocokkan juga isi lampiran/OCR, supaya "kontrak.pdf"
         tetap ditemukan. Dua kata atau lebih TIDAK, karena itu akan membuat
         dokumen yang hanya punya satu dari dua kata ikut cocok. */
      const terms = q.trim().split(/\s+/);
      return terms.length === 1 && docHay(d).includes(terms[0].toLowerCase());
    });
  const sortedDocs = useMemo(() => sortRows(list, sort, (d, key) => {
    if (key === "createdAt") return createdAtOf(d) ?? "";
    if (key === "updatedAt") return lastTouchedAt(d) ?? "";
    return key === "dokumen" ? String(d.title ?? "") : key === "tipe" ? String(d.type ?? "") : key === "proyek" ? String(d.project ?? "") : key === "versi" ? String(d.version ?? "") : key === "status" ? String(d.status ?? "") : String(d.updated ?? "");
  }), [list, sort]);
  const docPager = usePager(list.length);
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const idx = sortedDocs.findIndex((d) => ids.includes(String(d.id)));
    if (idx >= 0) { flashPick(flash, ids, idx, docPager.go, docPager.size); return; }
    const doc = data.documents.find((d) => ids.includes(String(d.id)));
    if (!doc) { flashPick(flash, ids, -1, () => {}, 100); return; }
    /* Arsip adalah tab terpisah: dokumen yang diarsipkan tidak mungkin
       disorot dari tab aktif, jadi tab tujuan harus diganti lebih dulu. */
    const target = doc.archived ? "Arsip" : "Semua";
    if (type === target) { flashPick(flash, ids, -1, () => {}, 100); return; }
    const targetBase = target === "Arsip" ? archived : active;
    const targetSorted = sortRows(
      targetBase.filter((d) => docHay(d).includes(q.toLowerCase())),
      sort,
      (d, k) => {
        if (k === "createdAt") return createdAtOf(d) ?? "";
        if (k === "updatedAt") return lastTouchedAt(d) ?? "";
        return k === "dokumen" ? String(d.title ?? "") : k === "tipe" ? String(d.type ?? "") : k === "proyek" ? String(d.project ?? "") : k === "versi" ? String(d.version ?? "") : k === "status" ? String(d.status ?? "") : String(d.updated ?? "");
      },
    );
    const targetIdx = targetSorted.findIndex((d) => ids.includes(String(d.id)));
    setType(target);
    window.setTimeout(() => flashPick(flash, ids, targetIdx, docPager.go, docPager.size), 250);
  };
  const pickNotif = (rowId: string) => pickNotifIds([rowId]);
  /* Filter `type` berperan seperti tab di modul lain (Semua / Arsip). */
  useDeepLinkTarget("", deepParams.highlight, (next) => setType(next), pickNotifIds);
  useEffect(() => {
    docPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, branch]);

  const expiring = active
    .map((d) => ({ doc: d, days: daysUntil(d.berlakuHingga) }))
    .filter((x) => x.days !== null && (x.days as number) <= EXPIRY_WINDOW)
    .sort((a, b) => (a.days as number) - (b.days as number));

  const openAdd = () => { setForm(emptyForm); setRelSel([]); setShowAdd(true); };
  const openEdit = (d: StoreItem) => {
    /* Detail/Ubah/Arsip/Hapus semuanya dibuka dari baris tabel yang sama dan
       berbagi overlay. Kalau tidak saling menutup, ketiganya bisa terbuka
       bersamaan dan panel Detail tertinggal menampilkan dokumen yang baru
       saja diarsipkan atau dihapus. */
    setDetail(null); setArchiving(null); setDeleting(null);
    setOcrText(""); setDistTo("");
    setEditing(d);
    setRelSel(Array.isArray(d.related) ? d.related.map(String) : []);
    setForm({ title: d.title, type: d.type, subType: String(d.subType ?? ""), project: d.project, vessel: d.vessel ?? "", owner: d.owner, berlakuHingga: d.berlakuHingga ?? "", revNote: "", fileUrl: docUrlOf(d) || docFileNameOf(d), qcCertId: String(d.qcCertId ?? "") });
  };

  const openDetail = (d: StoreItem) => {
    setEditing(null); setArchiving(null); setDeleting(null);
    setOcrText(""); setDistTo("");
    setDetail(d);
  };

  const openArchive = (d: StoreItem) => {
    setEditing(null); setDetail(null); setDeleting(null);
    setOcrText(""); setDistTo("");
    setArchiving(d);
  };

  const openDelete = (d: StoreItem) => {
    setEditing(null); setDetail(null); setArchiving(null);
    setOcrText(""); setDistTo("");
    setDeleting(d);
  };

  /* Upload lampiran ke backend (/api/files); mode lokal tetap pakai URL manual. */
  const onLampiranFile = async (f: File | undefined) => {
    if (!f) return;
    if (!isBackendConfigured()) { toast(S.tLocalMode, "info"); return; }
    setUploadingFile(true);
    try {
      const url = await uploadFile(f);
      setF("fileUrl", url);
      toast(S.tUploaded);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.tUploadFail, "info");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const validForm = (): boolean => {
    if (!form.title.trim()) { toast(S.tTitleReq, "info"); return false; }
    if (!form.type) { toast(S.tTypeReq, "info"); return false; }
    if (!form.project) { toast(S.tProjectReq, "info"); return false; }
    if (!form.owner.trim()) { toast(S.tOwnerReq, "info"); return false; }
    /* Nama harus salah satu karyawan terdaftar. Yang dicek di sini hanya
       kasus data lama: dokumen tersimpan sebelum picker ini ada, atau nama
       karyawan yang sudah dihapus. Form-nya sendiri tidak mungkin menyimpan
       nama baru - `EntityPicker` hanya menawarkan pilihan dari daftar. */
    if (!ownerOptions.some((o) => o.value === form.owner.trim())) {
      toast(S.tOwnerEmployee, "info");
      return false;
    }
    if (form.type === "Sertifikat" && !form.berlakuHingga) { toast(S.tCertExpiry, "info"); return false; }
    /* Sertifikat wajib menunjuk dokumen Sertifikat QC-nya (item 5e). Tanpa
       relasi ini, arsip tidak bisa membuktikan sertifikat pernah diperiksa
       - dan tautan ke proyek yang salah sama saja tidak berguna. */
    if (NEEDS_QC_LINK.has(form.subType) && !qcCertOptions.some((o) => o.id === form.qcCertId.trim())) {
      toast(S.tQcCertLinkWajib, "info");
      return false;
    }
    if (editing && !form.revNote.trim()) { toast(S.tRevNoteReq, "info"); return false; }
    return true;
  };

  const save = async () => {
    if (!validForm()) return;
    try {
    if (editing) {
      const dupe = data.documents.some((d) => d.id !== editing.id && d.type === form.type && String(d.title).toLowerCase() === form.title.trim().toLowerCase());
      if (dupe) { toast(S.tTitleDupe, "info"); return; }
const version = nextVersion(String(editing.version ?? "v1.0"));
      const revisions = [...(editing.revisions ?? []), { version, at: todayISO(), by: form.owner.trim(), note: form.revNote.trim() }];
      await update("documents", editing.id, {
        title: form.title.trim(), type: form.type, subType: form.subType || undefined,
        project: form.project, vessel: form.vessel,
        owner: form.owner.trim(), berlakuHingga: form.berlakuHingga || undefined,
        qcCertId: form.qcCertId.trim() || undefined,
        version, revisions, updated: todayISO(), related: [...relSel],
        ...attachFields(form.fileUrl.trim()),
      });
      log(`merevisi dokumen ke ${version}`, editing.id, "Dokumen");
      toast(S.tVersionUp.replace("{a}", editing.id).replace("{b}", version));
      setEditing(null);
    } else {
      const dupe = data.documents.some((d) => d.type === form.type && String(d.title).toLowerCase() === form.title.trim().toLowerCase());
      if (dupe) { toast(S.tTitleDupe, "info"); return; }
      if (data.documents.some((d) => d.id === docPreview)) { toast(S.tIdDupe, "info"); return; }
const created = await add("documents", {
        id: docPreview,
        title: form.title.trim(), type: form.type, subType: form.subType || undefined,
        project: form.project, vessel: form.vessel,
        owner: form.owner.trim(), berlakuHingga: form.berlakuHingga || undefined,
        qcCertId: form.qcCertId.trim() || undefined,
        version: "v1.0", status: "Draft", updated: todayISO(), archived: false, docCopy: "Terkendali",
        related: [...relSel],
        ...attachFields(form.fileUrl.trim()),
        branch: String(data.projects.find((p) => p.id === form.project)?.branch ?? (branch !== "SEMUA" ? branch : "")),
        // Ref format SB untuk arsip operasional (cth DS: 001/DS-SB/SMD/I/2024).
        sbRef: form.type === "Dock Space" ? sbDsNumber(sbSeq("Dock Space"))
          : form.type === "Surat Jalan" ? sbSjNumber(sbSeq("Surat Jalan"))
          : form.type === "Tanda Terima" ? sbTtNumber(sbSeq("Tanda Terima"))
          : "",
        revisions: [{ version: "v1.0", at: todayISO(), by: form.owner.trim(), note: "Dokumen dibuat" }],
      }, { action: "mengarsipkan dokumen", module: "Dokumen" });
      toast(S.tAdded.replace("{a}", created.id));
      setShowAdd(false);
    }
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const runOcr = async (d: StoreItem) => {
    /* URL lampiran resolved satu cara (docUrlOf), sama seperti pratinjaunya,
       supaya OCR tidak pernah membaca field yang berbeda dari yang diunduh. */
    const url = docUrlOf(d);
    if (!url) { toast(S.tNoImage, "info"); return; }
    setOcrBusy(true);
    try {
      const text = await ocrImageUrl(url);
      setOcrText(text);
      toast(S.tOcrDone.replace("{n}", String(text.length)));
    } catch (e) {
      toast(e instanceof Error ? e.message : S.tOcrFail, "info");
    } finally {
      setOcrBusy(false);
    }
  };

  const saveOcr = async (d: StoreItem) => {
    if (!ocrText.trim()) return;
    try {
    await update("documents", String(d.id), { ocrText: ocrText.trim(), updated: todayISO() });
    log("menyimpan hasil OCR", String(d.id), "Dokumen");
    toast(S.tOcrSaved.replace("{a}", String(d.id)));
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, ocrText: ocrText.trim(), updated: todayISO() } : cur));
    setOcrText("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const toggleCopy = async (d: StoreItem) => {    const next = String(d.docCopy ?? "Terkendali") === "Salinan" ? "Terkendali" : "Salinan";
    try {
    await update("documents", d.id, { docCopy: next, updated: todayISO() });
    log(`menandai dokumen sebagai ${next}`, d.id, "Dokumen");
    toast(S.tCopyMarked.replace("{a}", String(d.id)).replace("{b}", next));
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, docCopy: next, updated: todayISO() } : cur));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const flowTo = async (d: StoreItem, next: string) => {
    const ok = window.confirm(S.flowConfirm.replace("{a}", String(d.id)).replace("{b}", next));
    if (!ok) return;
    const revisions = [...(d.revisions ?? []), { version: String(d.version ?? "v1.0"), at: todayISO(), by: String(d.owner ?? ""), note: `Status → ${next}` }];
    try {
    await update("documents", d.id, { status: next, updated: todayISO(), revisions });
    log(`mengubah status dokumen ke ${next}`, d.id, "Dokumen");
    toast(S.movedTo.replace("{a}", String(d.id)).replace("{b}", next));
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, status: next, updated: todayISO(), revisions } : cur));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    try {
    await update("documents", archiving.id, { archived: true });
    log("mengarsipkan dokumen", archiving.id, "Dokumen");
    toast(S.tArchived.replace("{a}", String(archiving.id)), "info");
    setDetail((cur) => (cur && String(cur.id) === String(archiving.id) ? null : cur));
    setArchiving(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
      const usedBy = findUsages(data, "documents", String(deleting.id));
      if (usedBy.length > 0) {
        toast(`Hapus diblokir - ${deleting.id} dipakai di: ${usedBy.join(", ")}`, "info");
        log("gagal hapus dokumen", `${deleting.id} · masih dipakai di: ${usedBy.join(", ")}`, "Dokumen");
        return;
      }
    try {
      await remove("documents", deleting.id);
      log("menghapus permanen dokumen", deleting.id, "Dokumen");
      toast(S.tDeletedPerm.replace("{a}", String(deleting.id)), "info");
      setDetail((cur) => (cur && String(cur.id) === String(deleting.id) ? null : cur));
      setDeleting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.tDeleteDocFail, "info");
    }
  };

const doExport = () => {
    const rows = list.map((d) => [d.id, d.title, d.type, d.project, d.version, d.status, d.owner, d.updated, d.berlakuHingga ?? "", Array.isArray(d.related) ? d.related.length : 0]);
    /* Header Indonesian semua. Kolom "Owner" dan "Updated" sebelumnya tercampur
       di antara Judul/Tipe/Proyek/Status, jadi sheet yang sama punya dua
       gaya penamaan. */
    exportExcel([["ID", "Judul", "Tipe", "Proyek", "Versi", "Status", "Pemilik", "Diperbarui", "Berlaku Hingga", "Jml Terkait"], ...rows], `register-dokumen-${todayISO()}`);
    toast(S.tExported.replace("{n}", String(rows.length)));
  };

  const sbSeq = (tipe: string): number => {
    const rows = data.documents.filter((d) => d.type === tipe);
    if (tipe === "Surat Jalan" || tipe === "Tanda Terima") {
      // Dash format SJ/TT-SMD-YYYY-nnn: scan trailing digits di sbRef + id.
      const nums = rows.flatMap((d) => [parseSjSeq(d.sbRef), parseSjSeq(d.id)]);
      return Math.max(0, ...nums) + 1;
    }
    const nums = rows
      .filter((d) => typeof d.sbRef === "string")
      .map((d) => String(d.sbRef));
    return maxSeq(nums, /^(\d+)\//) + 1;
  };

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /* Tren dokumen SEBULAN-SETAHUN.

   Versi lama memakai dua konstanta yang harus saling menjaga urutan:

     DOC_MONTHS = ["Sep", "Okt", ... "Ags"]
     DOC_MNUM   = ["09", "10", ... "08"]

   lalu mencocokkan `d.updated.slice(5, 7)` - NOMOR BULAN SAJA, tanpa
   tahun - ke DOC_MNUM. Dua akibat yang tidak terlihat dari grafiknya:

   1. Jendelanya terkunci Sep..Ags tanpa tahun. Di luar Agustus, sumbu itu
      bukan 12 bulan terakhir, jadi grafik menampilkan jendela yang sudah
      lewat dan tidak akan berubah sampai tahun depan.
   2. Pengelompokannya lintas tahun. Dokumen yang diperbarui 2025-09 dan
      2026-09 masuk ke batang yang sama, karena "09" sama dengan "09".

   Sekarang memakai monthAxis() (12 bulan berjalan, berurutan, berakhir di
   bulan berjalan) dan monthKeyOf() yang membaca YYYY-MM lengkap. */
  const docAxis = useMemo(() => monthAxis({ months: 12, locale: locale as "id" | "en" }), [locale]);

  const trendOf = (pred: (d: StoreItem) => boolean) =>
    docAxis.map((pt) => ({
      name: pt.label,
      v: active.filter((d) => pred(d) && monthKeyOf(d.updated) === pt.key).length,
    }));

  return (
    <div>
      <PageHeader
        title={S.docPageTitle}
        subtitle={S.docPageSubtitle}
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <>
            <AsyncButton className="btn-secondary" onAction={doExport}><Download className="h-4 w-4" /> {S.exportExcelBtn}</AsyncButton>
            <button className="btn-primary-gradient" onClick={openAdd}><Plus className="h-4 w-4" /> {S.btnArchiveDoc}</button>
          </>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} dismiss={modAlert.dismiss} />}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiTotal} value={String(active.length)} icon={<ScrollText className="h-5 w-5" />} chip="navy" hint={S.kpiTotalHint} spark={trendOf(() => true)} />
        <KpiCard label={S.kpiValid} value={String(active.filter((d) => d.status === "Berlaku" || d.status === "Disetujui").length)} icon={<FileText className="h-5 w-5" />} chip="teal" hint={S.kpiValidHint} spark={trendOf((d) => d.status === "Berlaku" || d.status === "Disetujui")} />
        <KpiCard label={S.kpiPending} value={String(active.filter((d) => canonStatus(d.status) === "Diajukan" || d.status === "Draft").length)} icon={<FileText className="h-5 w-5" />} chip="amber" hint={S.kpiPendingHint} spark={trendOf((d) => canonStatus(d.status) === "Diajukan" || d.status === "Draft")} />
        <KpiCard label={S.kpiExpired} value={String(active.filter((d) => d.status === "Kedaluwarsa").length)} icon={<FileText className="h-5 w-5" />} chip="rose" hint={S.kpiExpiredHint} spark={trendOf((d) => d.status === "Kedaluwarsa")} />
      </div>

      {expiring.length > 0 && type !== "Arsip" && (
        <Card className="mb-4 p-4">
          <h3 className="text-sm font-semibold text-navy-900">{S.expiringTitle.replace("{n}", String(EXPIRY_WINDOW))}</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            {expiring.slice(0, 6).map((x) => (
              <div key={x.doc.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-steel-600" title={S.expiryTip.replace("{a}", String(x.doc.title)).replace("{b}", fmtTanggal(x.doc.berlakuHingga))}>{x.doc.title}</span>
                <Badge tone={(x.days as number) < 0 ? "red" : "amber"}>
                  {(x.days as number) < 0 ? S.overdueBy.replace("{n}", String(Math.abs(x.days as number))) : S.remainAt.replace("{a}", fmtTanggal(x.doc.berlakuHingga)).replace("{b}", String(x.days))}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={S.searchPh}
          ariaLabel={S.searchAria}
          className="min-w-52 flex-1 sm:max-w-xs"
        />
        <FilterPopover
          activeCount={[type !== "Semua"].filter(Boolean).length}
          initial={{ type }}
          onReset={() => { setQ(""); setType("Semua"); }}
          onApply={(d) => { setType(d.type); }}
        >
          {(draft, setDraft) => (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 block text-xs font-medium text-steel-600">{S.filterTypeLabel}</p>
                <div className="flex flex-wrap gap-1">
                  {FILTERS.map((t) => (
                    <button key={t} onClick={() => setDraft({ ...draft, type: t })}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${draft.type === t ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                      {t}{t === "Arsip" ? ` (${String(archived.length)})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </FilterPopover>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface sticky top-0 z-10">
              <tr><SortTh label={S.colDoc} sortKey="dokumen" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colType} sortKey="tipe" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colProjectShip} sortKey="proyek" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colVersion} sortKey="versi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colRevUpdated} sortKey="diperbarui" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colCreated} sortKey="createdAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colUpdated} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.colAction}</th></tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {docPager.slice(sortedDocs).map((d) => (
                <tr key={d.id} id={notifRowId(String(d.id))} className={rowHighlightClass({ id: String(d.id), flash, notified: notified.has(String(d.id)), base: "hover:bg-surface" })}>
                  <td className="td max-w-[260px]">
                    <p className="truncate font-medium text-navy-900" title={String(d.title)}>{d.title}</p>
                    <p className="font-mono text-xs text-steel-500">{d.id} · {d.owner}{d.berlakuHingga ? S.untilSuffix.replace("{a}", fmtTanggal(d.berlakuHingga)) : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={String(d.docCopy ?? "Terkendali") === "Salinan" ? "amber" : "teal"}>{String(d.docCopy ?? "Terkendali")}</Badge>
                      {d.subType ? <Badge tone="gray">{String(d.subType)}</Badge> : null}
                      {d.qcCertId ? <Badge tone="blue">{locale === "en" ? "QC" : "QC"}: {String(d.qcCertId)}</Badge> : null}
                      {lewatRetensi(d) && <Badge tone="red">{S.overRetensi}</Badge>}
                    </div>
                  </td>
                  <td className="td"><Badge tone="navy">{d.type}</Badge></td>
                  <td className="td text-steel-600 text-xs font-mono max-w-[180px] truncate" title={`${String(d.project)} · ${String(d.vessel)}`}>{d.project} · {d.vessel}</td>
                  <td className="td text-steel-600">{d.version}</td>
                  <td className="td"><StatusBadge status={d.status} /></td>
                  <td className="td text-steel-600">{fmtTanggal(d.updated)}</td>
                  <td className="td text-xs text-steel-600">{createdAtOf(d) !== null ? fmtTanggal(createdAtOf(d)) : <span className="text-steel-400">-</span>}</td>
                  <td className="td text-xs text-steel-600">{lastTouchedAt(d) !== null ? fmtTanggal(lastTouchedAt(d)) : <span className="text-steel-400">-</span>}</td>
                  <td className="td">
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.detailBtn} aria-label={S.detailOf.replace("{a}", String(d.id))} onClick={() => openDetail(d)}><Eye className="h-4 w-4" /></button>
                      {/* Sel aksi tabel arsip hanya punya Detail - tidak ada
                          tombol Pratinjau lagi (item 14 revisi 2 Oktober).
                          Sebelumnya `DocumentPreviewCell` menaruh Eye di sini
                          juga, sehingga dua ikon mata berdiri bersebelahan
                          tanpa bedanya jelas: yang satu membuka modal detail,
                          yang satu membuka berkas. Pratinjau tetap ada di
                          dalam modal Detail (`DocumentPreviewPanel`).
                          Unduh sengaja TETAP ada - ia aksi berbeda: menyimpan
                          berkas, bukan membuka pratinjau. */}
                      <DocumentPreviewCell
                        preview={false}
                        doc={{
                          title: String(d.title),
                          fileUrl: docUrlOf(d),
                          fileName: docFileNameOf(d),
                          subtitle: `${d.id} · ${d.type}`,
                        }}
                      />
                      {type === "Arsip" ? (
                        <>
                          <button className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50" title={S.actRestore} aria-label={S.actRestoreOf.replace("{a}", String(d.id))} onClick={async () => { try { await update("documents", d.id, { archived: false }); log("memulihkan dokumen dari arsip", d.id, "Dokumen"); toast(S.tRestored.replace("{a}", String(d.id))); } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); } }}><RotateCcw className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title={S.actDeletePerm} aria-label={S.actDeletePermOf.replace("{a}", String(d.id))} onClick={() => openDelete(d)}><Trash2 className="h-4 w-4" /></button>
                        </>
                      ) : (
                        <>
                          <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.actEdit} aria-label={S.actEditOf.replace("{a}", String(d.id))} onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.actArchive} aria-label={S.actArchiveOf.replace("{a}", String(d.id))} onClick={() => openArchive(d)}><Archive className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">{S.emptyDocs}</p>}
          {docPager.bar}
        </div>
      </Card>

      {/* Modal tambah/ubah */}
      <Modal
        open={showAdd || editing !== null}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        title={editing ? S.editTitle.replace("{a}", editing.id) : S.addTitle}
        subtitle={editing ? S.editSub.replace("{a}", nextVersion(String(editing.version ?? "v1.0"))) : S.addSub}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>{S.cancelBtn}</button>
            <AsyncButton className="btn-primary" onAction={save}>{S.btnSaveDoc}</AsyncButton>
          </>
        }
      >
        <div className="space-y-3">
          {!editing && (
            <p className="rounded-xl bg-surface p-3 text-sm text-steel-600">
              {S.autoNo} <span className="font-mono font-bold text-navy-900">{docPreview}</span>
              <span className="block text-xs text-steel-400">{S.autoNoHint.replace("{a}", PREFIX[form.type] ?? "DOC")}</span>
            </p>
          )}
          <Field label={S.lblDocTitle}>
            <input className="input" placeholder={S.phDocTitle} value={form.title} onChange={(e) => setF("title", e.target.value)} />
          </Field>
          <FormGrid>
            <Field label={S.colType}>
              <select className="input" value={form.type} onChange={(e) => { setF("type", e.target.value); setForm({ ...form, type: e.target.value, subType: "" }); }}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            {subTypesOf(form.type).length > 0 && (
              <Field label={S.subTypeLbl}>
                <select className="input" value={form.subType} onChange={(e) => setF("subType", e.target.value)}>
                  <option value="">-</option>
                  {subTypesOf(form.type).map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            )}
            <Field label={S.lblRelProject}>
              <select className="input" value={form.project} onChange={(e) => setF("project", e.target.value)}>
                <option value="">{S.optPickProject}</option>
                <option value="-">{S.optGeneral}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.lblRelVessel}>
              <select className="input" value={form.vessel} onChange={(e) => setF("vessel", e.target.value)}>
                <option value="">-</option>
                <option value="-">{S.optGeneralShort}</option>
                {data.vessels.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </Field>
<Field label={S.lblOwner} hint={S.hintOwnerPick}>
{/* Item 15 revisi 2 Oktober. Sebelumnya ini input teks bebas dengan
              cek `e.name.toLowerCase() === owner.trim().toLowerCase()`, jadi
              nama harus diketik persis - termasuk kapitalisasi dan spasi.
              Dropdown memaksa pengguna menebak ejaan untuk memilih orang yang
              sudah ada di sistem; picker membuat pilihan itu eksplisit dan
              menyimpan nama yang persis sama dengan yang tercatat di
              `employees`, sehingga pencocokan di tempat lain tidak goyah. */}
          <EntityPicker
            value={form.owner}
            onChange={(v) => setF("owner", v)}
            options={ownerOptions}
            placeholder={S.phOwner}
            ariaLabel={S.lblOwner}
            emptyText={locale === "en" ? "No matching employee." : "Tidak ada karyawan yang cocok."}
            required
            invalid={form.owner.trim() !== "" && !ownerOptions.some((o) => o.value === form.owner.trim())}
          />
        </Field>
<Field label={S.lblValidUntil}>
              <input type="date" className="input" value={form.berlakuHingga} onChange={(e) => setF("berlakuHingga", e.target.value)} />
            </Field>
            {NEEDS_QC_LINK.has(form.subType) && (
              <Field label={S.qcCertLinkLbl} hint={qcCertOptions.length === 0 ? S.qcCertNone : undefined}>
                <select className="input" value={form.qcCertId} onChange={(e) => setF("qcCertId", e.target.value)}>
                  <option value="">{S.optPickProject}</option>
                  {qcCertOptions.map((o) => (
                    <option key={String(o.id)} value={String(o.id)}>
                      {String(o.id)} · {String(o.title)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {editing && (
              <Field label={S.lblRevNote}>
                <input className="input" placeholder={S.phRevNote} value={form.revNote} onChange={(e) => setF("revNote", e.target.value)} />
              </Field>
            )}
          </FormGrid>
          <Field label={S.lblAttachment} hint={S.hintAttachment}>
            <div className="flex items-center gap-2">
              <input className="input font-mono" value={form.fileUrl} onChange={(e) => setF("fileUrl", e.target.value)} placeholder={S.phFileUrl} />
              <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.pdf,.xlsx,.csv" className="hidden" aria-label={S.attachAria}
                onChange={(e) => { void onLampiranFile(e.target.files?.[0]); }} />
              <button type="button" className="btn-secondary shrink-0 text-xs" disabled={uploadingFile}
                title={isBackendConfigured() ? S.uploadBackendTitle : S.uploadLocalTitle}
                onClick={() => {
                  if (!isBackendConfigured()) { toast(S.tLocalMode, "info"); return; }
                  fileInputRef.current?.click();
                }}>
                <Upload className="h-4 w-4" /> {uploadingFile ? S.uploadingNow : S.uploadBtn}
              </button>
            </div>
            {/* Pratinjau langsung muncul begitu ada URL -_Unggah_ sudah
                mengisi kolom di atas, dan mengetik URL juga langsung menambah
                pratinjau. Tidak ada tombol "tampilkan pratinjau" tambahan.
                InlineDocPreview mengambil berkasnya lewat fetch ber-JWT, jadi
                <img>/<iframe> telanjang tidak akan tampil kosong untuk berkas
                yang dilindungi backend. */}
            {looksLikeUrl(form.fileUrl) ? (
              <div className="mt-2 rounded-xl border border-steel-100 bg-surface p-2">
                <p className="mb-1 text-[11px] font-semibold text-steel-500">{S.previewTitle}</p>
                <InlineDocPreview url={form.fileUrl.trim()} height={PDF_HEIGHT_RE.test(form.fileUrl) ? "h-56" : "h-40"} />
              </div>
            ) : form.fileUrl.trim() !== "" ? (
              /* Nilai non-URL (mis. hanya "kontrak.pdf") tidak bisa dipratinjau.
                katakan begitu eksplisit - diam-diam menampilkan kotak 404 membuat
                 pengguna mengira tombolnya rusak. */
              <p className="mt-1.5 text-[11px] text-amber-700">
                &ldquo;{form.fileUrl.trim()}&rdquo; dibaca sebagai nama berkas, bukan URL. Gunakan tombol Unggah untuk melampirkan berkasnya.
              </p>
            ) : null}
          </Field>
          <Field label={S.lblRelated} hint={S.hintRelated}>
            <select
              multiple
              className="input min-h-[96px]"
              value={relSel}
              onChange={(e) => setRelSel([...e.target.selectedOptions].map((o) => o.value))}
            >
              {data.documents.filter((d) => !editing || d.id !== editing.id).map((d) => (
                <option key={d.id} value={d.id}>{d.id} · {String(d.title)}</option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => { setDetail(null); setOcrText(""); setDistTo(""); }} title={detail ? String(detail.title) : ""} subtitle={detail ? `${detail.id} · ${detail.type}` : ""} wide>
        {detail && (
          <div>
            <dl className="dl-div text-sm">
              {[
                [S.colProject, detail.project],
                [S.lblVessel, detail.vessel],
                [S.colVersion, detail.version],
                [S.lblValidUntil2, fmtTanggal(detail.berlakuHingga)],
                [S.colRevUpdated, fmtTanggal(detail.updated)],
                [S.lblOwner, detail.owner],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4"><dt className="text-steel-500">{S.colStatus}</dt><dd><StatusBadge status={detail.status} /></dd></div>
              {detail.subType ? (
                <div className="flex justify-between gap-4"><dt className="text-steel-500">{S.subTypeLbl}</dt><dd><Badge tone="gray">{String(detail.subType)}</Badge></dd></div>
              ) : null}
              {detail.qcCertId ? (
                /* Tautan ke dokumen Sertifikat QC harus bisa diklik: audit
                   selalu berakhir di "mana berkas pemeriksaannya?". */
                <div className="flex justify-between gap-4">
                  <dt className="text-steel-500">{S.qcCertLinkLbl}</dt>
                  <dd className="text-right">
                    <button
                      className="font-mono font-medium text-ocean-600 hover:underline"
                      onClick={() => {
                        const src = (data.documents ?? []).find((x) => String(x.id) === String(detail.qcCertId));
                        if (src) openDetail(src);
                      }}
                    >
                      {String(detail.qcCertId)}
                    </button>
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-steel-500">{S.lblAttachShort}</dt>
                <dd className="max-w-[60%] truncate text-right">
                  {/* Nama berkas, bukan URL mentah. URL `/files/2026-10/uuid.pdf`
                      tidak pernah berguna dibaca orang, dan menampilkan kolom
                      kosong di sini padahal lampirannya ada. */}
                  {detailAttach.fileName !== "" || detailAttach.url !== "" ? (
                    <span className="break-all font-medium text-navy-700" title={detailAttach.url || detailAttach.fileName}>
                      {detailAttach.fileName || detailAttach.url}
                    </span>
                  ) : (
                    <span className="font-medium text-steel-400">-</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-steel-500">{S.lblRetention}</dt>
                <dd className="flex items-center gap-1.5">
                  <span className="font-medium text-navy-900">{RETENSI[String(detail.type)] === null || RETENSI[String(detail.type)] === undefined ? S.permanentNow : S.yearsCount.replace("{n}", String(RETENSI[String(detail.type)]))}</span>
                  {lewatRetensi(detail) && <Badge tone="red">{S.overRetensi}</Badge>}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-steel-500">{S.lblCopy}</dt>
                <dd><Badge tone={String(detail.docCopy ?? "Terkendali") === "Salinan" ? "amber" : "teal"}>{String(detail.docCopy ?? "Terkendali")}</Badge></dd>
              </div>
            </dl>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">{S.previewTitle}</h4>
            <DocumentPreviewPanel
              doc={{
                title: String(detail.title),
                fileUrl: docUrlOf(detail),
                fileName: docFileNameOf(detail),
                subtitle: `${detail.id} · ${detail.type}`,
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary text-xs" onClick={() => toggleCopy(detail)}>
                {String(detail.docCopy ?? "Terkendali") === "Salinan" ? S.toControlled : S.toCopy}
              </button>
              {isBackendConfigured() && IMAGE_URL_RE.test(detailAttach.url) && (
                <button className="btn-secondary text-xs" disabled={ocrBusy} onClick={() => void runOcr(detail)}>
                  {ocrBusy ? S.ocrRunning : S.ocrExtract}
                </button>
              )}
            </div>
            {ocrText !== "" && (
              <div className="mt-3 rounded-xl border border-steel-200 bg-surface p-3">
                <p className="mb-1 text-xs font-semibold text-navy-900">{S.ocrResult}</p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-steel-700">{ocrText}</pre>
                <div className="mt-2 flex gap-2">
                  <button className="btn-secondary text-xs" onClick={() => void saveOcr(detail)}>{S.ocrSave}</button>
                  <button className="btn-secondary text-xs" onClick={() => setOcrText("")}>{S.ocrDiscard}</button>
                </div>
              </div>
            )}
            {String(detail.ocrText ?? "") !== "" && (
              <p className="mt-3 whitespace-pre-wrap text-xs text-steel-500">{S.ocrStored.replace("{a}", `${String(detail.ocrText).slice(0, 300)}${String(detail.ocrText).length > 300 ? "…" : ""}`)}</p>
            )}
            {canonStatus(detail.status) && FLOW_NEXT[canonStatus(detail.status)].length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {FLOW_NEXT[canonStatus(detail.status)].map((n) => (
                  <button key={n} className="btn-secondary text-xs" onClick={() => flowTo(detail, n)}>{n}</button>
                ))}
              </div>
            ) : !canonStatus(detail.status) ? (
              <p className="mt-3 text-xs text-steel-400">{S.legacyStatus}</p>
            ) : null}
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">{S.relatedTitle}</h4>
            <div className="space-y-1.5 text-sm">
              {((Array.isArray(detail.related) ? detail.related : []) as unknown[]).map((rel, i) => {
                const rid = String(rel);
                const found = data.documents.find((d) => d.id === rid);
                return (
                  <div key={`${rid}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                    <span className="truncate font-mono text-xs font-semibold text-navy-900" title={found ? String(found.title) : rid}>{rid}{found ? ` · ${String(found.title)}` : ""}</span>
                    {found && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setOcrText(""); setDetail(found); }}>{S.openBtn}</button>}
                  </div>
                );
              })}
              {(!Array.isArray(detail.related) || detail.related.length === 0) && <p className="text-xs text-steel-400">{S.noRelated}</p>}
            </div>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">{S.historyTitle}</h4>
            <div className="space-y-1.5 text-sm">
              {((detail.revisions ?? []) as { version: string; at: string; by: string; note: string }[]).map((r) => (
                <div key={r.version} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                  <span className="font-mono font-semibold text-navy-900">{r.version}</span>
                  <span className="truncate text-xs text-steel-500" title={`${r.note} - ${r.by}`}>{r.note} - {r.by}</span>
                  <span className="text-xs text-steel-500 whitespace-nowrap">{fmtTanggal(r.at)}</span>
                </div>
              ))}
              {((detail.revisions ?? []) as unknown[]).length === 0 && <p className="text-xs text-steel-400">{S.noHistory}</p>}
            </div>
            <h4 className="mb-1 mt-4 text-sm font-semibold text-navy-900">{S.distTitle}</h4>
            <p className="mb-2 text-xs text-steel-400">{S.distSub}</p>
            <div className="flex gap-2">
              <input className="input flex-1" value={distTo} onChange={(e) => setDistTo(e.target.value)} placeholder={S.distToPh} aria-label={S.distToLabel} />
              <button className="btn-primary shrink-0 text-xs" onClick={() => void sendDist()}>{S.distSendBtn}</button>
            </div>
            <div className="mt-2 space-y-1.5 text-sm">
              {distLog.map((g, i) => (
                <div key={`${g.to}-${g.at}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                  <span className="truncate font-medium text-navy-900" title={g.to}>{g.to}</span>
                  <span className="whitespace-nowrap text-xs text-steel-500">{fmtTanggal(g.at)}{g.by ? ` · ${g.by}` : ""}</span>
                </div>
              ))}
              {distLog.length === 0 && <p className="text-xs text-steel-400">{S.distEmpty}</p>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={archiving !== null}
        title={S.archiveTitle.replace("{a}", archiving?.id ?? "")}
        desc={S.archiveDesc}
        confirmLabel={S.confirmArchive}
        onCancel={() => setArchiving(null)}
        onConfirm={confirmArchive}
      />

      <ConfirmModal
        open={deleting !== null}
        title={S.deleteTitle.replace("{a}", deleting?.id ?? "")}
        desc={(() => {
          const used = deleting ? findUsages(data, "documents", String(deleting.id)) : [];
          return used.length > 0 ? `${S.deleteDesc} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.` : S.deleteDesc;
        })()}
        confirmLabel={deleting && findUsages(data, "documents", String(deleting.id)).length > 0 ? "Diblokir - masih dipakai" : S.confirmDeletePerm}
        danger
        confirmDisabled={deleting ? findUsages(data, "documents", String(deleting.id)).length > 0 : false}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
