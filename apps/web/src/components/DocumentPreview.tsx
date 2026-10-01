// Pratinjau dokumen universal (Dokumen / BoQ / Drawing / lampiran apa pun).
// Prinsip:
// 1. Baris tabel & kartu HANYA menampilkan tombol/ikon Pratinjau + Unduh -
//    tidak ada iframe/gambar yang dirender otomatis (hemat bandwidth & RAM).
// 2. Isi pratinjau baru dimuat SETELAH tombol Pratinjau diklik (lazy).
// 3. Unduhan mempertahankan format file PERSIS seperti saat diunggah
//    (byte asli + nama & ekstensi asli), bukan ekspor Excel/default lain.

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, EyeOff, FileText, Loader2 } from "lucide-react";
import { Modal, toast, useAsyncAction } from "./ui";
import { useT } from "../i18n/LanguageContext";
import {
  downloadFileUrl,
  fetchFileBlob,
  fileExtOf,
  fileKindOf,
  fileNameOf,
} from "../services/files";

export interface PreviewDoc {
  title: string;
  fileUrl: string;
  /** Baris kedua judul modal (mis. "DOC-2026-001 · Kontrak"). */
  subtitle?: string;
  /** Nama unduhan eksplisit; default = nama file asli dari URL. */
  fileName?: string;
}

const L = {
  id: {
    preview: "Pratinjau",
    hidePreview: "Sembunyikan pratinjau",
    download: "Unduh",
    loadingFile: "Memuat berkas…",
    downloading: "Mengunduh…",
    downloaded: "Berkas diunduh sesuai format aslinya",
    downloadFail: "Gagal mengunduh berkas",
    unsupported: "Pratinjau tidak tersedia untuk format .{ext}",
    unsupportedHint: "Gunakan tombol Unduh - file tersimpan persis dengan format aslinya.",
    loadFail: "Gagal memuat pratinjau - gunakan tombol Unduh.",
    noFile: "Belum ada lampiran file.",
  },
  en: {
    preview: "Preview",
    hidePreview: "Hide preview",
    download: "Download",
    loadingFile: "Loading file…",
    downloading: "Downloading…",
    downloaded: "File downloaded in its original format",
    downloadFail: "Failed to download file",
    unsupported: "Preview is not available for .{ext} format",
    unsupportedHint: "Use the Download button - the file is saved exactly in its original format.",
    loadFail: "Failed to load preview - use the Download button.",
    noFile: "No file attached yet.",
  },
} as const;

/** Batas karakter pratinjau berkas teks agar modal tetap responsif. */
const TEXT_LIMIT = 20000;

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "media"; kind: "image" | "pdf"; objectUrl: string }
  | { status: "text"; text: string }
  | { status: "unsupported"; ext: string }
  | { status: "error"; message: string };

/** Panel aksi Pratinjau + Unduh dengan pemuatan malas.
 *  Bisa dipasang berdiri sendiri di dalam modal/detail apa pun. */
export function DocumentPreviewPanel({ doc }: { doc: PreviewDoc }) {
  const { locale } = useT();
  const T = locale === "en" ? L.en : L.id;
  const url = String(doc.fileUrl ?? "").trim();
  const kind = fileKindOf(url);
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const objectUrlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const dl = useAsyncAction();

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      releaseObjectUrl();
    };
  }, [releaseObjectUrl]);

  /* Dokumen berganti (modal dipakai ulang untuk baris lain) → reset total. */
  useEffect(() => {
    setView({ status: "idle" });
    releaseObjectUrl();
  }, [url, releaseObjectUrl]);

  const togglePreview = async (): Promise<void> => {
    if (view.status === "loading") return;
    if (view.status !== "idle") {
      releaseObjectUrl();
      setView({ status: "idle" });
      return;
    }
    if (!url) {
      setView({ status: "error", message: T.noFile });
      return;
    }
    if (kind === "other") {
      setView({ status: "unsupported", ext: fileExtOf(url) || "?" });
      return;
    }
    setView({ status: "loading" });
    try {
      const blob = await fetchFileBlob(url);
      if (!aliveRef.current) return;
      if (kind === "text") {
        setView({ status: "text", text: (await blob.text()).slice(0, TEXT_LIMIT) });
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      if (!aliveRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      releaseObjectUrl();
      objectUrlRef.current = objectUrl;
      setView({ status: "media", kind, objectUrl });
    } catch (e) {
      if (aliveRef.current) {
        setView({ status: "error", message: e instanceof Error ? e.message : T.loadFail });
      }
    }
  };

  const onDownload = (): void => {
    void dl.run(async () => {
      if (!url) {
        toast(T.noFile, "info");
        return;
      }
      try {
        await downloadFileUrl(url, doc.fileName);
        toast(T.downloaded);
      } catch (e) {
        toast(e instanceof Error ? e.message : T.downloadFail, "info");
      }
    });
  };

  const open = view.status !== "idle";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => void togglePreview()}
          disabled={!url || view.status === "loading"}
          aria-expanded={open}
        >
          {view.status === "loading"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            : open
              ? <EyeOff className="h-3.5 w-3.5" aria-hidden />
              : <Eye className="h-3.5 w-3.5" aria-hidden />}
          {view.status === "loading" ? T.loadingFile : open ? T.hidePreview : T.preview}
        </button>
        <button type="button" className="btn-primary text-xs" onClick={onDownload} disabled={!url || dl.pending}>
          {dl.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
          {dl.pending ? T.downloading : T.download}
        </button>
        {url && (
          <span className="min-w-0 truncate text-[11px] text-steel-400" title={url}>
            {doc.fileName?.trim() || fileNameOf(url, doc.title)}
          </span>
        )}
      </div>

      {!url && <p className="text-xs text-steel-400">{T.noFile}</p>}

      {view.status === "loading" && (
        <div className="flex h-40 items-center justify-center rounded-xl border border-steel-200 bg-surface text-sm text-steel-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> {T.loadingFile}
        </div>
      )}

      {view.status === "unsupported" && (
        <div className="rounded-xl border border-dashed border-steel-300 bg-surface p-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-steel-300" aria-hidden />
          <p className="mt-2 text-sm text-steel-600">{T.unsupported.replace("{ext}", view.ext)}</p>
          <p className="mt-1 text-xs text-steel-400">{T.unsupportedHint}</p>
        </div>
      )}

      {view.status === "error" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-700">{view.message}</p>
          <p className="mt-1 text-xs text-steel-500">{T.loadFail}</p>
        </div>
      )}

      {view.status === "media" && view.kind === "image" && (
        <img
          src={view.objectUrl}
          alt={doc.title}
          className="max-h-[60vh] w-full rounded-xl border border-steel-200 bg-surface object-contain"
        />
      )}
      {view.status === "media" && view.kind === "pdf" && (
        <iframe title={doc.title} src={view.objectUrl} className="h-[65vh] w-full rounded-xl border border-steel-200 bg-white" />
      )}
      {view.status === "text" && (
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl border border-steel-200 bg-surface p-3 font-mono text-xs text-steel-700">{view.text}</pre>
      )}
    </div>
  );
}

/** Modal reusable: judul dokumen + panel Pratinjau/Unduh malas.
 *  Isi modal dipertahankan selama animasi keluar agar tidak berkedip kosong. */
export function DocumentPreviewModal({ doc, onClose }: { doc: PreviewDoc | null; onClose: () => void }) {
  const lastDoc = useRef<PreviewDoc | null>(null);
  if (doc) lastDoc.current = doc;
  const shown = doc ?? lastDoc.current;
  return (
    <Modal open={doc !== null} onClose={onClose} title={shown?.title ?? ""} subtitle={shown?.subtitle} wide>
      {shown && <DocumentPreviewPanel doc={shown} />}
    </Modal>
  );
}

/** Sel tabel/kartu: HANYA ikon Pratinjau + Unduh (tanpa render file otomatis).
 *  Klik Pratinjau membuka DocumentPreviewModal; Unduh langsung menyimpan file
 *  dengan format aslinya. `doc` null / tanpa fileUrl → tampil "-". */
export function DocumentPreviewCell({ doc, className = "" }: { doc: PreviewDoc | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const { locale } = useT();
  const T = locale === "en" ? L.en : L.id;
  const dl = useAsyncAction();
  const url = String(doc?.fileUrl ?? "").trim();
  if (!doc || !url) return <span className={`text-xs text-steel-400 ${className}`}>-</span>;
  const target: PreviewDoc = { title: doc.title, fileUrl: url, subtitle: doc.subtitle, fileName: doc.fileName };
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <button
        type="button"
        className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100 hover:text-ocean-600"
        title={T.preview}
        aria-label={`${T.preview}: ${target.title}`}
        onClick={() => setOpen(true)}
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100 hover:text-emerald-600"
        title={T.download}
        aria-label={`${T.download}: ${target.title}`}
        disabled={dl.pending}
        onClick={() =>
          void dl.run(async () => {
            try {
              await downloadFileUrl(url, target.fileName);
              toast(T.downloaded);
            } catch (e) {
              toast(e instanceof Error ? e.message : T.downloadFail, "info");
            }
          })
        }
      >
        {dl.pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
      </button>
      {open && <DocumentPreviewModal doc={target} onClose={() => setOpen(false)} />}
    </span>
  );
}
