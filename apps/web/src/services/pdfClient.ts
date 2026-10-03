/* Klien PDF: meminta dokumen ke server dan mengubahnya jadi Blob URL.
 *
 * Kenapa PDF pindah ke server, bukan tetap di browser:
 *   1. INTEGRITAS. Dokumen resmi dirakit dari baris DB milik server. Kalau
 *      dirakit di browser, siapa pun bisa mencetak kwitansi dengan nominal
 *      yang tidak ada di pembukuan.
 *   2. KONSISTENSI. Satu mesin, satu hasil. Dulu ada dua jalur (mesin jsPDF
 *      dan mesin html2canvas) yang bisa saling berbeda untuk dokumen yang
 *      sama.
 *   3. YANG DILIHAT PENGGUNA. Byte PDF kembali sebagai Blob, jadi pratinjau
 *      dan tombol unduh tetap bekerja persis seperti sebelumnya.
 *
 * Berkas TIDAK pernah disimpan di server: endpoint mengembalikan stream,
 * dan hanya jejak audit yang ditulis. Lihat todo3.md.
 */
import { BASE, getJwt, isBackendConfigured } from "./http";

/** Magic bytes PDF: "%PDF-". Panjang 5, DAN dariCharCode wajib 5 argumen. */
const PDF_MAGIC = "%PDF-";

/**
 * True bila `head` diawali magic bytes PDF.
 *
 * Dipisah jadi fungsi sendiri supaya bisa diuji tanpa browser. Versi
 * sebelumnya inline di dua tempat, dan di keduanya hanya 4 byte yang
 * dirangkai (`head[0..3]`) lalu dibandingkan dengan literal 5 karakter
 * ("%PDF-") - yang tidak akan pernah sama. Akibatnya SETIAP ekspor PDF
 * gagal dengan "Respons server bukan berkas PDF" walaupun server
 * mengirim PDF yang benar, di semua modul.
 *
 * Bugnya lolos karena tidak ada satu pun gate yang menjalankan kode ini:
 * probe PDF ada di server (mesin vektor), probe render hanya SSR, dan
 * keduanya tidak pernah memanggil fetch ke /api/pdf/render.
 */
export function isPdfHead(head: ArrayLike<number>): boolean {
  if (head.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i += 1) {
    if (head[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

export interface PdfRenderResult {
  /** Object URL untuk <iframe>/<a download>. Caller harus meng-revoke-nya. */
  url: string;
  kind: string;
  pages: number;
  embeddedFont: boolean;
  /** Jumlah huruf CJK yang tidak punya glyph. >0 = ada kotak di dokumen. */
  cjkChars: number;
  bytes: number;
  /** Id snapshot model di server; dipakai untuk cetak ulang yang identik. */
  modelId: string;
}

/** true bila server punya mesin PDF (backend terkonfigurasi). */
export function pdfServerReady(): boolean {
  return isBackendConfigured();
}

export class PdfRenderError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PdfRenderError";
    this.status = status;
  }
}

/**
 * Render dokumen dan kembalikan Object URL.
 *
 * Caller WAJIB menyimpan URL-nya lalu meng-revoke-nya saat tidak dipakai:
 * setiap render menahan seluruh byte PDF di memori per Blob. Pola pemakaian
 * ada di `usePdfDoc`.
 */
export interface PdfRequest {
  kind: string;
  id?: string;
  locale?: string;
  /** Cabang untuk LAPORAN saja (dokumen tanpa entitas: ringkasan, analitik,
   *  laporan proyek, rekap payroll). Server hanya menerima nilai yang
   *  benar-benar ada di DB; string bebas ditolak 400.
   *  Untuk dokumen resmi field ini DIABAIKAN server - cabang diambil dari
   *  baris dokumennya, supaya isi PDF tidak mungkin mencampur cabang. */
  branch?: string;
  /** Filter laporan: periode, mode, projectId, months. Server menghitung
   *  angkanya sendiri - filter hanya memilih periode, tidak mengarang isi. */
  filters?: Record<string, string | number>;
}

export async function renderPdf(req: PdfRequest): Promise<PdfRenderResult> {
  if (!isBackendConfigured()) {
    throw new PdfRenderError("Server PDF belum aktif - ekspor memakai mesin lokal.", 0);
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const jwt = getJwt();
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/pdf/render`, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
    });
  } catch {
    throw new PdfRenderError("Server PDF tidak dapat dihubungi - cek koneksi.", 0);
  }

  if (!res.ok) {
    let message = `Server menolak permintaan (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* badan bukan JSON - pesan default dipakai */
    }
    throw new PdfRenderError(message, res.status);
  }

  const blob = await res.blob();
  /* Pemeriksaan magis: endpoint yang salah atau proxy yang mengembalikan
     HTML akan menghasilkan blob yang bukan PDF, dan UI akan menampilkan
     "pratinjau rusak" tanpa penjelasan apa pun. */
  const head = new Uint8Array(await blob.slice(0, PDF_MAGIC.length).arrayBuffer());
  if (!isPdfHead(head)) {
    throw new PdfRenderError("Respons server bukan berkas PDF - periksa konfigurasi VITE_API_URL.", res.status);
  }

  return {
    url: URL.createObjectURL(blob),
    kind: req.kind,
    pages: Number(res.headers.get("X-Doc-Pages") ?? 0),
    embeddedFont: res.headers.get("X-Doc-Embedded-Font") === "1",
    /* Jumlah huruf CJK di dokumen. >0 berarti ada karakter yang kemungkinan
       tercetak sebagai kotak karena font tidak punya glyph-nya. Dokumen tetap
       keluar tanpa error, jadi ini satu-satunya cara mengetahuinya. */
    cjkChars: Number(res.headers.get("X-Doc-Cjk") ?? 0),
    bytes: blob.size,
    modelId: res.headers.get("X-Doc-Model-Id") ?? "",
  };
}

/**
 * Cetak ulang dari snapshot cetakan sebelumnya.
 *
 * Server memakai model yang tersimpan, bukan baris terbaru - jadi hasilnya
 * sama dengan cetakan pertama walau datanya sudah dikoreksi. Itu berbeda dari
 * `renderPdf` yang selalu membaca data terkini.
 */
export async function reprintPdf(modelId: string): Promise<PdfRenderResult> {
  if (!isBackendConfigured()) {
    throw new PdfRenderError("Server PDF belum aktif - tidak bisa mencetak ulang.", 0);
  }
  const jwt = getJwt();
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/pdf/render/${encodeURIComponent(modelId)}`, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    });
  } catch {
    throw new PdfRenderError("Server PDF tidak dapat dihubungi - cek koneksi.", 0);
  }
  if (!res.ok) {
    let message = `Cetak ulang ditolak (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* badan bukan JSON - pesan default dipakai */
    }
    throw new PdfRenderError(message, res.status);
  }
  const blob = await res.blob();
  const head = new Uint8Array(await blob.slice(0, PDF_MAGIC.length).arrayBuffer());
  if (!isPdfHead(head)) {
    throw new PdfRenderError("Respons server bukan berkas PDF - periksa konfigurasi VITE_API_URL.", res.status);
  }
  return {
    url: URL.createObjectURL(blob),
    kind: res.headers.get("X-Doc-Kind") ?? "",
    pages: Number(res.headers.get("X-Doc-Pages") ?? 0),
    embeddedFont: res.headers.get("X-Doc-Embedded-Font") === "1",
    cjkChars: Number(res.headers.get("X-Doc-Cjk") ?? 0),
    bytes: blob.size,
    modelId,
  };
}

/** Daftar jenis dokumen yang didukung server. */
export async function pdfKinds(): Promise<string[]> {
  if (!isBackendConfigured()) return [];
  const jwt = getJwt();
  const res = await fetch(`${BASE}/api/pdf/kinds`, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: { kinds?: string[] } };
  return body?.data?.kinds ?? [];
}

/**
 * Unduh dokumen hasil render langsung ke peramban.
 * Dipakai tombol "Unduh" di popup pratinjau.
 */
export function downloadBlobUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}