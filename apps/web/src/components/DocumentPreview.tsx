// Pratinjau dokumen universal (Dokumen / BoQ / Drawing / lampiran apa pun).
// Prinsip:
// 1. Baris tabel & kartu hanya menampilkan ikon Pratinjau + Unduh - tidak ada
//    iframe/gambar yang dirender otomatis (hemat bandwidth & RAM).
// 2. Klik ikon Pratinjau = isi langsung tampil. TIDAK ada tombol kedua untuk
//    "menampilkan pratinjau"; begitu panelterbuka, berkasnya sudah dimuat
//    (lihat autoLoad di DocumentPreviewPanel). Ini yang diminta modul
//    Proyek / BoQ / QC / Dokumen.
// 3. Unduhan mempertahankan format file PERSIS seperti saat diunggah
//    (byte asli + nama & ekstensi asli), bukan ekspor Excel/default lain.

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2 } from "lucide-react";
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

/** Panel pratinjau + Unduh.
 *
 *  Pratinjau dimuat OTOMATIS begitu panel ini tampil (autoLoad), jadi begitu
 *  ikon Pratinjau diklik dokumennya SUDAH terlihat - tidak ada langkah kedua.
 *  Yang tersisa hanya tombol Unduh, yang memuat ulang byte sendiri sehingga
 *  tidak perlu memuat ulang pratinjau untuk menyimpan berkas.
 *
 *  `autoLoad` tetap ada sebagai escape hatch: DocumentPreviewCell memasang
 *  ulang `startedRef` saat dokumen berganti, sehingga panel yang dipakai ulang
 *  untuk baris lain tidak menampilkan berkas baris sebelumnya. */
export function DocumentPreviewPanel({ doc, autoLoad = true }: { doc: PreviewDoc; autoLoad?: boolean }) {
  const { locale } = useT();
  const T = locale === "en" ? L.en : L.id;
  const url = String(doc.fileUrl ?? "").trim();
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

  const load = useCallback(async (): Promise<void> => {
    if (!url) {
      setView({ status: "error", message: T.noFile });
      return;
    }
    const k = fileKindOf(url);
    if (k === "other") {
      setView({ status: "unsupported", ext: fileExtOf(url) || "?" });
      return;
    }
    setView({ status: "loading" });
    try {
      const blob = await fetchFileBlob(url);
      if (!aliveRef.current) return;
      if (k === "text") {
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
      setView({ status: "media", kind: k, objectUrl });
    } catch (e) {
      if (aliveRef.current) {
        setView({ status: "error", message: e instanceof Error ? e.message : T.loadFail });
      }
    }
  }, [url, releaseObjectUrl, T.loadFail, T.noFile]);

  /* Muat seketika saat panel tampil - inilah yang menghapus klik ganda. */
  const startedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoLoad || !url) return;
    if (startedRef.current === url) return;
    startedRef.current = url;
    void load();
  }, [autoLoad, url, load]);

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

  /* Tombol "Pratinjau"/"Sembunyikan pratinjau" DIHAPUS.
     Panel ini sudah memuat berkas otomatis (autoLoad di atas), jadi tombol itu
     hanya menampilkan "Sembunyikan pratinjau" - yaitu klik kedua yang sama
     persis dengan ikon mata yang baru saja diklik pengguna. Empat modul
     (Proyek, BoQ, QC, Dokumen) semuanya menumpang komponen ini, jadi satu
     tombol di sini berarti empat tombol di layar. */
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
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

/** Pratinjau ringkas untuk form: gambar / PDF / teks yang langsung ikut
 *  berubah saat URL diketik, tanpa tombol Pratinjau/Unduh.
 *
 *  Ini menutup celah JWT yang soal lama tinggalkan: <iframe src={fileUrl}>
 *  dan <img src={fileUrl}> milik browser TIDAK mengirim header
 *  Authorization, jadi berkas yang dilindungi backend muncul sebagai kotak
 *  kosong atau 401. Yang dipakai di sini selalu blob hasil fetch ber-JWT,
 *  persis seperti DocumentPreviewPanel. */
export function InlineDocPreview({ url, height = "h-40" }: { url: string; height?: string }) {
  const clean = String(url ?? "").trim();
  const [state, setState] = useState<ViewState>({ status: "idle" });

  /* Pembatal memakai closure LOKAL, bukan ref bersama.
     Versi lama memakai `aliveRef` bersama yang di-set false pada cleanup
     efek [clean]. Tapi efek yang menyalakannya lagi punya deps [], jadi
     setelah URL pertama berubah ref itu TIDAK pernah true lagi: fetch yang
     sedang berjalan dihentikan di `if (!aliveRef.current) return`, state
     tidak pernah naik dari "loading", dan panelnya menggantung di spinner
     selamanya. Itu persis yang terjadi begitu pengguna mengunggah file kedua
     atau mengoreksi URL di form. */
  useEffect(() => {
    if (!clean) {
      setState({ status: "idle" });
      return;
    }
    const kind = fileKindOf(clean);
    if (kind === "other") {
      setState({ status: "unsupported", ext: fileExtOf(clean) || "?" });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: "loading" });
    void (async () => {
      try {
        const blob = await fetchFileBlob(clean);
        if (cancelled) return;
        if (kind === "text") {
          setState({ status: "text", text: (await blob.text()).slice(0, TEXT_LIMIT) });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "media", kind, objectUrl });
      } catch {
        if (!cancelled) setState({ status: "error", message: L.id.loadFail });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [clean]);

  if (!clean) return null;
  const box = `mt-2 w-full rounded-lg border border-steel-200 ${height}`;
  if (state.status === "loading") {
    return (
      <div className={`${box} flex items-center justify-center bg-surface text-xs text-steel-500`}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> {L.id.loadingFile}
      </div>
    );
  }
  if (state.status === "unsupported") return null;
  if (state.status === "error") {
    return <p className="mt-2 text-xs text-rose-600">{state.message}</p>;
  }
  if (state.status === "media" && state.kind === "image") {
    return <img src={state.objectUrl} alt="Pratinjau dokumen" className={`${box} object-contain`} />;
  }
  if (state.status === "media" && state.kind === "pdf") {
    return <iframe title="Pratinjau dokumen" src={state.objectUrl} className={`${box} bg-white`} />;
  }
  if (state.status === "text") {
    return <pre className={`${box} overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px] text-steel-700`}>{state.text}</pre>;
  }
  return null;
}

/** Tombol Unduh mandiri untuk dipakai di samping InlineDocPreview.
 *
 *  InlineDocPreview sengaja tidak punya tombol apa pun (itu permintaan modul
 *  QC & Dokumen), sehingga pratinjau inline menjadi satu-satunya jalan melihat
 *  berkas tanpa opsi menyimpannya. Komponen ini menutup celah itu tanpa
 *  menghidupkan kembali tombol "tampilkan pratinjau".
 *
 *  Galat TIDAK ditelan: downloadFileUrl sudah melempar untuk URL yang butuh
 *  JWT, jadi toast di sini selalu berarti ada yang benar-benar salah.
 */
export function DownloadFileButton({
  url,
  fileName,
  label,
  className = "btn-secondary",
}: {
  url: string;
  fileName?: string;
  label?: string;
  className?: string;
}) {
  const { locale } = useT();
  const T = locale === "en" ? L.en : L.id;
  const dl = useAsyncAction();
  const clean = String(url ?? "").trim();
  return (
    <button
      type="button"
      className={className}
      disabled={clean === "" || dl.pending}
      aria-busy={dl.pending || undefined}
      onClick={() =>
        void dl.run(async () => {
          if (clean === "") {
            toast(T.noFile, "info");
            return;
          }
          try {
            await downloadFileUrl(clean, fileName);
            toast(T.downloaded);
          } catch (e) {
            toast(e instanceof Error ? e.message : T.downloadFail, "info");
          }
        })
      }
    >
      {dl.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
      {dl.pending ? T.downloading : label ?? T.download}
    </button>
  );
}

/** Sel tabel/kartu: HANYA ikon Pratinjau + Unduh (tanpa render file otomatis).
 *  Klik Pratinjau membuka DocumentPreviewModal yang isinya SUDAH termuat
 *  (autoLoad) - tidak ada langkah kedua. Unduh langsung menyimpan file dengan
 *  format aslinya. `doc` null / tanpa fileUrl -> tampil "-". */
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
