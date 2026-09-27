import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, ScrollText, FileText, Eye, Pencil, Trash2, Archive, RotateCcw, Download, Upload } from "lucide-react";
import { Card, PageHeader, Badge, KpiCard, Modal, Field, FormGrid, ConfirmModal, SortTh, toggleSort, sortRows, toast, StatusBadge, usePager } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { FilterPopover } from "../../components/FilterPopover";
import { useStore, type StoreItem } from "../../data/store";
import { isBackendConfigured } from "../../services/http";
import { ocrImageUrl } from "../../services/upload";
import { uploadFile } from "../../services/upload";
import { fmtTanggal, todayISO } from "../../utils/format";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { sbDsNumber, sbSjNumber, sbTtNumber, maxSeq, parseSjSeq } from "../../utils/sb";
import { exportExcel } from "../../utils/export";
import { n_dry } from "../../i18n/n_dry";
import { useT } from "../../i18n/LanguageContext";

const TYPES = ["Kontrak", "Drawing", "Prosedur", "Sertifikat", "Laporan", "Invoice", "NCR", "Penawaran", "Dock Space", "Surat Jalan", "Tanda Terima"];
const FILTERS = ["Semua", ...TYPES, "Arsip"];
const EXPIRY_WINDOW = 30;

const DOC_MONTHS = ["Sep", "Okt", "Nov", "Des", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags"];
const DOC_MNUM = ["09", "10", "11", "12", "01", "02", "03", "04", "05", "06", "07", "08"];

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

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

const emptyForm = { title: "", type: "Laporan", project: "", vessel: "", owner: "", berlakuHingga: "", revNote: "", fileUrl: "" };

export default function Documents() {
  const { data, add, update, remove, log, branch, inBranch } = useStore();
  const { locale } = useT();
  const S = n_dry[locale];
  const modAlert = useModuleAlert("dokumen");
  const flash = useNotifFlash();
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
  const [relSel, setRelSel] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const docPreview = nextDocId(form.type, data.documents);

  const active = inBranch(data.documents.filter((d) => !d.archived));
  const archived = inBranch(data.documents.filter((d) => d.archived));

  const list = (type === "Arsip" ? archived : active.filter((d) => type === "Semua" || d.type === type)).filter((d) => {
    return `${d.title} ${d.id} ${d.project} ${d.vessel}`.toLowerCase().includes(q.toLowerCase());
  });
  const sortedDocs = useMemo(() => sortRows(list, sort, (d, key) =>
    key === "dokumen" ? String(d.title ?? "") : key === "tipe" ? String(d.type ?? "") : key === "proyek" ? String(d.project ?? "") : key === "versi" ? String(d.version ?? "") : key === "status" ? String(d.status ?? "") : String(d.updated ?? "")
  ), [list, sort]);
  const docPager = usePager(list.length);
  const pickNotif = (rowId: string) => {
    const key = String(rowId);
    const idx = sortedDocs.findIndex((d) => String(d.id) === key);
    if (idx >= 0) flash.pick(key, idx, docPager.go, docPager.size);
    else flash.pick(key, -1, () => {}, 100);
  };
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
    setEditing(d);
    setRelSel(Array.isArray(d.related) ? d.related.map(String) : []);
    setForm({ title: d.title, type: d.type, project: d.project, vessel: d.vessel ?? "", owner: d.owner, berlakuHingga: d.berlakuHingga ?? "", revNote: "", fileUrl: String(d.fileUrl ?? "") });
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
    if (!data.employees.some((e) => String(e.name).toLowerCase() === form.owner.trim().toLowerCase())) {
      toast(S.tOwnerEmployee, "info");
      return false;
    }
    if (form.type === "Sertifikat" && !form.berlakuHingga) { toast(S.tCertExpiry, "info"); return false; }
    if (editing && !form.revNote.trim()) { toast(S.tRevNoteReq, "info"); return false; }
    return true;
  };

  const save = async () => {
    if (!validForm()) return;
    if (editing) {
      const dupe = data.documents.some((d) => d.id !== editing.id && d.type === form.type && String(d.title).toLowerCase() === form.title.trim().toLowerCase());
      if (dupe) { toast(S.tTitleDupe, "info"); return; }
      const version = nextVersion(String(editing.version ?? "v1.0"));
      const revisions = [...(editing.revisions ?? []), { version, at: todayISO(), by: form.owner.trim(), note: form.revNote.trim() }];
      await update("documents", editing.id, {
        title: form.title.trim(), type: form.type, project: form.project, vessel: form.vessel,
        owner: form.owner.trim(), berlakuHingga: form.berlakuHingga || undefined,
        version, revisions, updated: todayISO(), related: [...relSel],
        fileUrl: form.fileUrl.trim(),
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
        title: form.title.trim(), type: form.type, project: form.project, vessel: form.vessel,
        owner: form.owner.trim(), berlakuHingga: form.berlakuHingga || undefined,
        version: "v1.0", status: "Draft", updated: todayISO(), archived: false, docCopy: "Terkendali",
        related: [...relSel],
        fileUrl: form.fileUrl.trim(),
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
  };

  const runOcr = async (d: StoreItem) => {
    const url = String(d.fileUrl ?? "");
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
    await update("documents", String(d.id), { ocrText: ocrText.trim(), updated: todayISO() });
    log("menyimpan hasil OCR", String(d.id), "Dokumen");
    toast(S.tOcrSaved.replace("{a}", String(d.id)));
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, ocrText: ocrText.trim(), updated: todayISO() } : cur));
    setOcrText("");
  };

  const toggleCopy = async (d: StoreItem) => {    const next = String(d.docCopy ?? "Terkendali") === "Salinan" ? "Terkendali" : "Salinan";
    await update("documents", d.id, { docCopy: next, updated: todayISO() });
    log(`menandai dokumen sebagai ${next}`, d.id, "Dokumen");
    toast(S.tCopyMarked.replace("{a}", String(d.id)).replace("{b}", next));
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, docCopy: next, updated: todayISO() } : cur));
  };

  const flowTo = async (d: StoreItem, next: string) => {
    const ok = window.confirm(S.flowConfirm.replace("{a}", String(d.id)).replace("{b}", next));
    if (!ok) return;
    const revisions = [...(d.revisions ?? []), { version: String(d.version ?? "v1.0"), at: todayISO(), by: String(d.owner ?? ""), note: `Status → ${next}` }];
    await update("documents", d.id, { status: next, updated: todayISO(), revisions });
    log(`mengubah status dokumen ke ${next}`, d.id, "Dokumen");
    toast(S.movedTo.replace("{a}", String(d.id)).replace("{b}", next));
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, status: next, updated: todayISO(), revisions } : cur));
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    await update("documents", archiving.id, { archived: true });
    log("mengarsipkan dokumen", archiving.id, "Dokumen");
    toast(S.tArchived.replace("{a}", String(archiving.id)), "info");
    setArchiving(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove("documents", deleting.id);
      log("menghapus permanen dokumen", deleting.id, "Dokumen");
      toast(S.tDeletedPerm.replace("{a}", String(deleting.id)), "info");
      setDeleting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.tDeleteDocFail, "info");
    }
  };

  const doExport = () => {
    const rows = list.map((d) => [d.id, d.title, d.type, d.project, d.version, d.status, d.owner, d.updated, d.berlakuHingga ?? "", Array.isArray(d.related) ? d.related.length : 0]);
    exportExcel([["ID", "Judul", "Tipe", "Proyek", "Versi", "Status", "Owner", "Updated", "Berlaku Hingga", "Jml Terkait"], ...rows], `register-dokumen-${todayISO()}`);
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

  const trendOf = (pred: (d: StoreItem) => boolean) =>
    DOC_MONTHS.map((name, i) => ({ name, v: active.filter((d) => pred(d) && String(d.updated ?? "").slice(5, 7) === DOC_MNUM[i]).length }));

  return (
    <div>
      <PageHeader
        title={S.docPageTitle}
        subtitle={S.docPageSubtitle}
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}><Download className="h-4 w-4" /> {S.exportExcelBtn}</button>
            <button className="btn-primary-gradient" onClick={openAdd}><Plus className="h-4 w-4" /> {S.btnArchiveDoc}</button>
          </>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

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
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input className="input pl-9 w-full" placeholder={S.searchPh} aria-label={S.searchAria} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
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
              <tr><SortTh label={S.colDoc} sortKey="dokumen" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colType} sortKey="tipe" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colProjectShip} sortKey="proyek" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colVersion} sortKey="versi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.colUpdated} sortKey="diperbarui" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.colAction}</th></tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {docPager.slice(sortedDocs).map((d) => (
                <tr key={d.id} id={notifRowId(String(d.id))} className={flash.flashId === String(d.id) ? "notif-flash hover:bg-surface" : "hover:bg-surface"}>
                  <td className="td max-w-[260px]">
                    <p className="truncate font-medium text-navy-900" title={String(d.title)}>{d.title}</p>
                    <p className="font-mono text-xs text-steel-500">{d.id} · {d.owner}{d.berlakuHingga ? S.untilSuffix.replace("{a}", fmtTanggal(d.berlakuHingga)) : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={String(d.docCopy ?? "Terkendali") === "Salinan" ? "amber" : "teal"}>{String(d.docCopy ?? "Terkendali")}</Badge>
                      {lewatRetensi(d) && <Badge tone="red">{S.overRetensi}</Badge>}
                    </div>
                  </td>
                  <td className="td"><Badge tone="navy">{d.type}</Badge></td>
                  <td className="td text-steel-600 text-xs font-mono max-w-[180px] truncate" title={`${String(d.project)} · ${String(d.vessel)}`}>{d.project} · {d.vessel}</td>
                  <td className="td text-steel-600">{d.version}</td>
                  <td className="td"><StatusBadge status={d.status} /></td>
                  <td className="td text-steel-600">{fmtTanggal(d.updated)}</td>
                  <td className="td">
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.detailBtn} aria-label={S.detailOf.replace("{a}", String(d.id))} onClick={() => setDetail(d)}><Eye className="h-4 w-4" /></button>
                      {type === "Arsip" ? (
                        <>
                          <button className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50" title={S.actRestore} aria-label={S.actRestoreOf.replace("{a}", String(d.id))} onClick={async () => { await update("documents", d.id, { archived: false }); log("memulihkan dokumen dari arsip", d.id, "Dokumen"); toast(S.tRestored.replace("{a}", String(d.id))); }}><RotateCcw className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title={S.actDeletePerm} aria-label={S.actDeletePermOf.replace("{a}", String(d.id))} onClick={() => setDeleting(d)}><Trash2 className="h-4 w-4" /></button>
                        </>
                      ) : (
                        <>
                          <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.actEdit} aria-label={S.actEditOf.replace("{a}", String(d.id))} onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.actArchive} aria-label={S.actArchiveOf.replace("{a}", String(d.id))} onClick={() => setArchiving(d)}><Archive className="h-4 w-4" /></button>
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
            <button className="btn-primary" onClick={save}>{S.btnSaveDoc}</button>
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
              <select className="input" value={form.type} onChange={(e) => setF("type", e.target.value)}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
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
            <Field label={S.lblOwner}>
              <input className="input" placeholder={S.phOwner} value={form.owner} onChange={(e) => setF("owner", e.target.value)} />
            </Field>
            <Field label={S.lblValidUntil}>
              <input type="date" className="input" value={form.berlakuHingga} onChange={(e) => setF("berlakuHingga", e.target.value)} />
            </Field>
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
      <Modal open={detail !== null} onClose={() => { setDetail(null); setOcrText(""); }} title={detail ? String(detail.title) : ""} subtitle={detail ? `${detail.id} · ${detail.type}` : ""} wide>
        {detail && (
          <div>
            <dl className="dl-div text-sm">
              {[
                [S.colProject, detail.project],
                [S.lblVessel, detail.vessel],
                [S.colVersion, detail.version],
                [S.lblValidUntil2, fmtTanggal(detail.berlakuHingga)],
                [S.colUpdated, fmtTanggal(detail.updated)],
                [S.lblOwner, detail.owner],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4"><dt className="text-steel-500">{S.colStatus}</dt><dd><StatusBadge status={detail.status} /></dd></div>
              <div className="flex justify-between gap-4">
                <dt className="text-steel-500">{S.lblAttachShort}</dt>
                <dd className="max-w-[60%] truncate text-right">
                  {detail.fileUrl ? (
                    <a className="font-medium text-navy-700 underline" href={String(detail.fileUrl)} target="_blank" rel="noreferrer" title={String(detail.fileUrl)}>
                      {String(detail.fileUrl)}
                    </a>
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
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary text-xs" onClick={() => toggleCopy(detail)}>
                {String(detail.docCopy ?? "Terkendali") === "Salinan" ? S.toControlled : S.toCopy}
              </button>
              {isBackendConfigured() && /\.(png|jpe?g)(\?|$)/i.test(String(detail.fileUrl ?? "")) && (
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
        desc={S.deleteDesc}
        confirmLabel={S.confirmDeletePerm}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
