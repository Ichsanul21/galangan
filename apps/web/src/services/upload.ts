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
