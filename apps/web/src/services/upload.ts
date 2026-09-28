// Upload berkas ke backend (POST /api/files, multipart).
// Dipakai tombol "Upload" di sebelah input URL (Inventori foto, Dokumen lampiran).
// Bila backend belum dikonfigurasi (mode lokal), panggil isBackendConfigured()
// dulu dan biarkan input URL manual sebagai fallback.

import { getJwt, isBackendConfigured, BASE } from "./http";

export class UploadNotConfigured extends Error {
  constructor() {
    super("Backend belum dikonfigurasi - isi URL manual atau atur VITE_API_URL.");
    this.name = "UploadNotConfigured";
  }
}

/** Timeout 60 dtk (upload/OCR file bisa besar) + pesan error baca .message. */
const UPLOAD_TIMEOUT_MS = 60000;

function errMsg(json: unknown, text: string, fallback: string): string {
  if (json && typeof json === "object" && "error" in json) {
    const e = (json as { error?: { message?: string } | string }).error;
    if (typeof e === "string" && e) return e;
    if (e && typeof e === "object" && typeof e.message === "string" && e.message) return e.message;
  }
  return text || fallback;
}

async function fetchTimeout(input: string, init: RequestInit, ms = UPLOAD_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`Backend tidak merespons dalam ${ms / 1000} detik. Periksa koneksi atau coba file lebih kecil.`);
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function uploadFile(file: File): Promise<string> {
  if (!isBackendConfigured() || !BASE) throw new UploadNotConfigured();
  const form = new FormData();
  form.append("file", file);
  const jwt = getJwt();
  let res: Response;
  try {
    res = await fetchTimeout(`${BASE}/api/files`, {
      method: "POST",
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: form,
    });
  } catch {
    throw new Error("Backend tak terjangkau. Periksa koneksi atau VITE_API_URL.");
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(errMsg(json, text, `Upload gagal (HTTP ${res.status})`));
  }
  const data = (json as { ok?: boolean; data?: { url?: string } } | null)?.data;
  const rel = data?.url;
  if (!rel) throw new Error("Respons upload tak valid (tanpa url).");
  return rel.startsWith("http") ? rel : `${BASE}${rel}`;
}

/** OCR gambar lampiran via backend (POST /api/ocr). `url` boleh relatif
 *  (/files/...) - diambil dulu dengan JWT lalu dikirim ulang sebagai file.
 *  501 = tesseract belum terinstal di server. */
export async function ocrImageUrl(url: string): Promise<string> {
  if (!isBackendConfigured() || !BASE) throw new UploadNotConfigured();
  const jwt = getJwt();
  const abs = url.startsWith("http") ? url : `${BASE}${url.split("?")[0]}`;
  let blob: Blob;
  try {
    const res = await fetchTimeout(abs, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
    if (!res.ok) throw new Error(`Gagal mengunduh lampiran (HTTP ${res.status}).`);
    blob = await res.blob();
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Gagal mengunduh lampiran.");
  }
  const name = abs.split("/").pop() ?? "lampiran.png";
  const form = new FormData();
  form.append("file", blob, name);
  let res: Response;
  try {
    res = await fetchTimeout(`${BASE}/api/ocr`, {
      method: "POST",
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: form,
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Backend tak terjangkau. Periksa koneksi atau VITE_API_URL.");
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(errMsg(json, text, `OCR gagal (HTTP ${res.status})`));
  }
  const out = (json as { ok?: boolean; data?: { text?: string } } | null)?.data?.text;
  if (typeof out !== "string" || out.trim() === "") throw new Error("OCR tidak menemukan teks pada gambar.");
  return out;
}
