// Akses berkas lampiran terpusat: normalisasi URL, deteksi jenis, unduh dengan
// format asli, dan muat blob ber-JWT (file backend dilindungi Authorization).
// Dipakai DocumentPreview (pratinjau malas + unduh) dan SecureImg.

import { BASE, getJwt } from "./http";

export type FileKind = "image" | "pdf" | "text" | "other";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i;
const PDF_EXT = /\.pdf$/i;
const TEXT_EXT = /\.(txt|csv|log|json|md)$/i;

/** Timeout unduh/pratinjau berkas (file lampiran bisa besar). */
const FILE_TIMEOUT_MS = 60000;

function stripQuery(url: string): string {
  return url.split("?")[0].split("#")[0];
}

/** Normalisasi URL lama relatif (/files/...) → absolut terhadap BASE backend.
 *  URL absolut / blob: / data: dikembalikan apa adanya. */
export function toAbsoluteUrl(url: unknown): string {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (/^(https?:|blob:|data:)/i.test(u)) return u;
  if (!BASE) return u;
  return `${BASE}${u.startsWith("/") ? u : `/${u}`}`;
}

/** Ekstensi file huruf kecil tanpa titik; "" bila URL tak berekstensi. */
export function fileExtOf(url: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(stripQuery(String(url ?? "").trim()));
  return (m?.[1] ?? "").toLowerCase();
}

/** Jenis pratinjau yang didukung browser dari ekstensi file. */
export function fileKindOf(url: string): FileKind {
  const clean = stripQuery(String(url ?? "").trim());
  if (!clean) return "other";
  if (IMAGE_EXT.test(clean)) return "image";
  if (PDF_EXT.test(clean)) return "pdf";
  if (TEXT_EXT.test(clean)) return "text";
  return "other";
}

/** Nama file asli dari URL (segmen path terakhir, ter-decode).
 *  Dipakai agar unduhan mempertahankan nama + ekstensi format unggahan. */
export function fileNameOf(url: string, fallback = "dokumen"): string {
  const clean = stripQuery(String(url ?? "").trim());
  const base = clean.split("/").pop() ?? "";
  try {
    const decoded = decodeURIComponent(base);
    if (decoded && decoded !== "/" && /[^\s]/.test(decoded)) return decoded;
  } catch {
    if (base) return base;
  }
  return fallback;
}

/** Ambil berkas sebagai Blob; kirim JWT bila ada (file backend terproteksi). */
export async function fetchFileBlob(url: string): Promise<Blob> {
  const abs = toAbsoluteUrl(url);
  if (!abs) throw new Error("URL berkas kosong.");
  const jwt = getJwt();
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FILE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(abs, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`Berkas tidak merespons dalam ${FILE_TIMEOUT_MS / 1000} detik - periksa koneksi.`);
    }
    throw new Error("Berkas tidak dapat dijangkau - periksa koneksi atau URL.");
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Gagal mengambil berkas (HTTP ${res.status}).`);
  return res.blob();
}

function clickDownload(href: string, name: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Unduh berkas dengan format PERSIS seperti diunggah: byte asli diambil via
 *  fetch (ber-JWT bila backend), disimpan dengan nama + ekstensi aslinya.
 *  Gagal fetch (mis. URL eksternal tanpa CORS) → fallback tautan langsung. */
export async function downloadFileUrl(url: string, filename?: string): Promise<void> {
  const abs = toAbsoluteUrl(url);
  if (!abs) throw new Error("URL berkas kosong.");
  const name = String(filename ?? "").trim() || fileNameOf(abs);
  try {
    const blob = await fetchFileBlob(abs);
    const obj = URL.createObjectURL(blob);
    clickDownload(obj, name);
    window.setTimeout(() => URL.revokeObjectURL(obj), 30000);
  } catch {
    const a = document.createElement("a");
    a.href = abs;
    a.download = name;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
