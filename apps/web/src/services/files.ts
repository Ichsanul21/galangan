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

/** Galat HTTP dari server (404/401/403/5xx).
 *
 *  Dibedakan dari galat jaringan/CORS karena keduanya menuntut tindakan yang
 *  BERLAINAN: galat HTTP berarti tautan apa pun ke URL itu akan gagal juga,
 *  sedangkan galat CORS masih bisa dicoba lewat <a> yang tidak mengirim
 *  header Authorization. Tanpa pemisahan ini, satu try/catch tidak bisa
 *  memutuskan kapan aman jatuh ke tautan biasa. */
export class FileHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Gagal mengambil berkas (HTTP ${status}).`);
    this.name = "FileHttpError";
    this.status = status;
  }
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
  if (!res.ok) throw new FileHttpError(res.status);
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

/** Buka berkas di tab baru SEDANG tetap membawa JWT.
 *
 *  `window.open(url)` biasa gagal untuk berkas yang dilindungi backend:
 *  request tab baru tidak ikut membawa header Authorization, jadi server
 *  membalas 401 dan pengguna melihat halaman login, bukan dokumennya.
 *
 *  Popup harus dibuka sinkron di dalam handler klik, kalau ditunggu sampai
 *  fetch selesai browser akan memblokirnya. Jadi tabnya dibuka lebih dulu
 *  (kosong), lalu lokasinya diisi object URL begitu byte asli tiba.
 *
 *  Galat HTTP TIDAK lagi dialihkan ke URL mentah: itu persis jebakan 401 yang
 *  fungsi ini dibuat untuk dihindari. Tab yang sudah terlanjur terbuka
 *  ditutup, lalu galatnya dilempar ke pemanggil. */
export async function openFileUrl(url: string): Promise<void> {
  const abs = toAbsoluteUrl(url);
  if (!abs) throw new Error("URL berkas kosong.");
  const tab = window.open("", "_blank", "noopener,noreferrer");
  if (!tab) throw new Error("Pop-up diblokir browser - izinkan pop-up untuk situs ini.");
  try {
    const blob = await fetchFileBlob(abs);
    const obj = URL.createObjectURL(blob);
    tab.location.replace(obj);
    /* Beri peramban waktu membaca blob sebelum dicabut. */
    window.setTimeout(() => URL.revokeObjectURL(obj), 60000);
  } catch (err) {
    /* Galat jaringan/CORS masih mungkin ditangani tab baru; galat HTTP tidak. */
    if (err instanceof FileHttpError) {
      tab.close();
      throw err;
    }
    tab.location.replace(abs);
  }
}

/** Unduh berkas dengan format PERSIS seperti diunggah: byte asli diambil via
 *  fetch (ber-JWT bila backend), disimpan dengan nama + ekstensi aslinya.
 *
 *  BUG YANG DIPERBAIKI: fallback lama menelan galat lalu mengklik tautan
 *  polos apa pun hasilnya. Untuk berkas backend hal itu MUSTAHIL bekerja:
 *
 *    1. request <a href> milik peramban TIDAK membawa header Authorization,
 *       dan services/api/src/routes/files.ts memanggil requireAuth() untuk
 *       GET /files/* -> 401. Browser diam-diam membuka halaman login di tab
 *       baru; tidak ada berkas, tidak ada toast, tidak ada error.
 *    2. route yang sama memasang `Content-Disposition: attachment`, jadi
 *       hasilnya memaksa peramban mengunduh, bukan menampilkan.
 *
 *  Kapan fallback masih BOLEH dipakai? Hanya ketika fetch gagal karena
 *  jaringan atau CORS - mis. berkas di origin lain tanpa header CORS.
 *  Galat HTTP (401/403/404/5xx) berarti tautan apa pun ke URL itu akan gagal
 *  dengan cara yang sama, jadi galatnya dilempar supaya pemanggil bisa
 *  menampilkan toast yang jujur.
 *
 *  PENTING: batas TIDAK boleh memakai perbandingan origin. Backend pada
 *  konfigurasi repo (apps/web/.env.example) berjalan di origin lain dari
 *  aplikasinya sendiri (localhost:3000 vs localhost:5173), jadi backend kita
 *  sendiri akan terbaca "origin lain" - persis kasus yang harus DITOLAK
 *  fallbacknya.
 */
export async function downloadFileUrl(url: string, filename?: string): Promise<void> {
  const abs = toAbsoluteUrl(url);
  if (!abs) throw new Error("URL berkas kosong.");
  const name = String(filename ?? "").trim() || fileNameOf(abs);
  try {
    const blob = await fetchFileBlob(abs);
    const obj = URL.createObjectURL(blob);
    clickDownload(obj, name);
    window.setTimeout(() => URL.revokeObjectURL(obj), 30000);
    return;
  } catch (err) {
    /* Galat HTTP = server menjawab, hanya menjawab "tidak boleh". <a> tidak
       akan mengubah jawaban itu, jadi lempar. */
    if (err instanceof FileHttpError) throw err;
    /* Galat jaringan/CORS: <a> masih mungkin berhasil, jadi lanjut ke bawah. */
  }
  const a = document.createElement("a");
  a.href = abs;
  a.download = name;
  a.target = "_blank";
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
