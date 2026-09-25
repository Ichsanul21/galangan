// Upload berkas ke backend (POST /api/files, multipart).
// Dipakai tombol "Upload" di sebelah input URL (Inventori foto, Dokumen lampiran).
// Bila backend belum dikonfigurasi (mode lokal), panggil isBackendConfigured()
// dulu dan biarkan input URL manual sebagai fallback.

import { getJwt, isBackendConfigured } from "./http";

export class UploadNotConfigured extends Error {
  constructor() {
    super("Backend belum dikonfigurasi — isi URL manual atau atur VITE_API_URL.");
    this.name = "UploadNotConfigured";
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export async function uploadFile(file: File): Promise<string> {
  if (!isBackendConfigured() || !BASE) throw new UploadNotConfigured();
  const form = new FormData();
  form.append("file", file);
  const jwt = getJwt();
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/files`, {
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
    const msg =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: { message?: string } | string }).error ?? text)
        : text || `Upload gagal (HTTP ${res.status})`;
    throw new Error(typeof msg === "string" ? msg : `Upload gagal (HTTP ${res.status})`);
  }
  const data = (json as { ok?: boolean; data?: { url?: string } } | null)?.data;
  const rel = data?.url;
  if (!rel) throw new Error("Respons upload tak valid (tanpa url).");
  return rel.startsWith("http") ? rel : `${BASE}${rel}`;
}

/** OCR gambar lampiran via backend (POST /api/ocr). `url` boleh relatif
 *  (/files/...) — diambil dulu dengan JWT lalu dikirim ulang sebagai file.
 *  501 = tesseract belum terinstal di server. */
export async function ocrImageUrl(url: string): Promise<string> {
  if (!isBackendConfigured() || !BASE) throw new UploadNotConfigured();
  const jwt = getJwt();
  const abs = url.startsWith("http") ? url : `${BASE}${url.split("?")[0]}`;
  let blob: Blob;
  try {
    const res = await fetch(abs, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
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
    res = await fetch(`${BASE}/api/ocr`, {
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
    const env = json as { error?: { message?: string } | string } | null;
    const msg = env && typeof env === "object" && "error" in env
      ? String((env.error as { message?: string } | string) ?? text)
      : text || `OCR gagal (HTTP ${res.status})`;
    throw new Error(typeof msg === "string" ? msg : `OCR gagal (HTTP ${res.status})`);
  }
  const out = (json as { ok?: boolean; data?: { text?: string } } | null)?.data?.text;
  if (typeof out !== "string" || out.trim() === "") throw new Error("OCR tidak menemukan teks pada gambar.");
  return out;
}
