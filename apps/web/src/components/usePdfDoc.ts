/* Hook: render PDF sekali, pratinjau di popup, tombol unduh, dan pembersihan
 * Blob URL yang benar.
 *
 * Kenapa hook: setiap render menahan SELURUH byte PDF di memori sebagai Blob
 * URL. Kalau URL tidak di-revoke saat modal ditutup, satu pengguna yang
 * mencetak 20 kwitansi akan menahan 20 berkas penuh di RAM tanpa batas -
 * dan di ponsel galangan itu berarti tab mati. Pola revoke ini harus di satu
 * tempat supaya tidak ada pemanggil yang lupa.
 *
 * Tidak ada lagi mesin PDF lokal. Semua dokumen resmi dirakit server dari
 * baris DB-nya sendiri, dan mesin html2canvas yang lama sudah dihapus: PDF
 * yang dirakit dari DOM bisa berbeda dari pembukuan, dan tidak ada satu pun
 * gate yang bisa menangkapnya.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { renderPdf, reprintPdf, downloadBlobUrl, PdfRenderError, type PdfRequest } from "../services/pdfClient";
import { toast } from "../components/ui";

export interface PdfDocState {
  busy: boolean;
  error: string;
  /** Object URL siap dipakai pratinjau/unduh. */
  url: string;
  filename: string;
  pages: number;
  /** true bila dibuat mesin lokal karena server tidak tersedia. */
  local: boolean;
  /** Id snapshot server - sumber cetak ulang identik. */
  modelId: string;
}

const EMPTY: PdfDocState = { busy: false, error: "", url: "", filename: "", pages: 0, local: false, modelId: "" };

export function usePdfDoc(): {
  state: PdfDocState;
  /** Minta dokumen; memunculkan popup bila `open` true. */
  request: (req: PdfRequest, filename: string, open: boolean) => Promise<boolean>;
  /** Cetak ulang snapshot sebelumnya; hasil tetap melewati popup/unduh yang sama. */
  reprint: (modelId: string, filename: string, open: boolean) => Promise<boolean>;
  download: (filename: string) => void;
  close: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<PdfDocState>(EMPTY);
  const urlRef = useRef("");

  const release = useCallback(() => {
    if (urlRef.current !== "") {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }, []);

  useEffect(() => release, [release]);

  const close = useCallback(() => {
    release();
    setState(EMPTY);
  }, [release]);

  const reset = useCallback(() => {
    /* Hanya state error/busy yang dibersihkan tanpa menyentuh Blob yang
       sedang dipakai pratinjau. */
    setState((s) => ({ ...s, busy: false, error: "" }));
  }, []);

  const download = useCallback((filename: string) => {
    if (!urlRef.current) return;
    downloadBlobUrl(urlRef.current, filename);
  }, []);

  const request = useCallback(
    async (req: PdfRequest, filename: string, open: boolean): Promise<boolean> => {
      setState((s) => ({ ...s, busy: true, error: "" }));
      try {
        const res = await renderPdf(req);
        release();
        urlRef.current = res.url;
        setState({
          busy: false,
          error: "",
          url: res.url,
          filename,
          pages: res.pages,
          local: false,
          modelId: res.modelId,
        });
        if (!open) downloadBlobUrl(res.url, filename);
        return true;
      } catch (e) {
        const message =
          e instanceof PdfRenderError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Gagal membuat PDF";
        setState((s) => ({ ...s, busy: false, error: message }));
        toast(message, "info");
        return false;
      }
    },
    [download, release],
  );

  const reprint = useCallback(
    async (modelId: string, filename: string, open: boolean): Promise<boolean> => {
      setState((s) => ({ ...s, busy: true, error: "" }));
      try {
        const res = await reprintPdf(modelId);
        release();
        urlRef.current = res.url;
        setState({
          busy: false,
          error: "",
          url: res.url,
          filename,
          pages: res.pages,
          local: false,
          modelId: res.modelId,
        });
        if (!open) downloadBlobUrl(res.url, filename);
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal mencetak ulang";
        setState((s) => ({ ...s, busy: false, error: message }));
        toast(message, "info");
        return false;
      }
    },
    [download, release],
  );

  return { state, request, reprint, download, close, reset };
}