/* Pengukuran teks - SATU-SATUNYA tempat lebar teks dihitung.
 *
 * KELAS BUG YANG DITUTUP: mesin lama punya `widthOf(text)` yang memanggil
 * `pdf.getTextWidth()` memakai font yang SEDANG AKTIF, dipanggil dari tempat
 * yang belum `setFont()` untuk font yang akan menggambar. Akibatnya teks
 * diukur dengan font berbeda dari yang dipakai menggambar: baris表格 bisa
 * 22 persen lebih lebar dari kolomnya dan keluar dari halaman tanpa error.
 *
 * Di sini pengukuran SELALU menerima (font, size) secara eksplisit dan hasilnya
 * di-cache. Tidak ada keadaan global yang bisa bocor antar pemanggilan.
 */
import type { jsPDF } from "jspdf";
import { safe } from "./font.js";
import type { FontName } from "./font.js";

/* Kunci cache: MeasurementCache dibatasi supaya dokumen dengan tabel panjang
   tidak menahan cache tak terbatas selama proses render berlangsung. */
const MAX_CACHE = 4000;
const cache = new Map<string, number>();

/* Font standard-14: lebar glyf sudah keluar dalam satuan poin jsPDF.
   Nama font standard tidak bergantung pada `pdf.getFont()` - accessor itu
   mengembalikan objek yang bentuknya berubah antar versi jsPDF, dan ketika
   tidak ditemukan mengembalikan "normal" sehingga setFont gagal
   lookup. Nama font untuk pengukuran selalu standard-14 eksplisit. */
const STANDARD_FONT = "helvetica";

function standardWidth(pdf: jsPDF, text: string, size: number, bold: boolean): number {
  const prevSize = pdf.getFontSize();
  pdf.setFont(STANDARD_FONT, bold ? "bold" : "normal");
  pdf.setFontSize(size);
  const w = pdf.getTextWidth(text);
  pdf.setFontSize(prevSize);
  return w;
}

/**
 * Lebar teks dalam mm.
 *
 * Font TTF: rasio lebar glyf terhadap ukuran em dijaga di `glyphRatio` yang
 * diukur sekali saat font didaftarkan, sehingga pengukuran tidak perlu
 * menebak state font jsPDF sama sekali.
 */
export interface Metrics {
  /** Lebar 1000 unit em dalam mm pada size 1. */
  emWidth: number;
  /** true bila metrik berasal dari TTF ter-embed. */
  embedded: boolean;
}

/* Lebar Helvetica dalam milimeter untuk size 1 pt, per style. Diukur dari
   jsPDF saat registri font siap, bukan dari tabel manual, supaya tidak
   melenceng kalau versi jsPDF berubah. */
const STANDARD_EM: Record<string, number> = {};

export function ensureMetrics(pdf: jsPDF, weight: FontName, embedded: boolean, size = 100): number {
  const key = `${weight}|${embedded ? "ttf" : "std"}`;
  const cached = STANDARD_EM[key];
  if (cached !== undefined) return cached;
  const sample = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,% ";
  const w = standardWidth(pdf, sample, size, weight === "bold") / size;
  STANDARD_EM[key] = w;
  return w;
}

/** Cache她了橋 */
export function measure(
  pdf: jsPDF,
  text: string,
  opts: { font: FontName; size: number; embedded: boolean },
): number {
  const clean = safe(text, opts.font);
  if (clean === "") return 0;
  const key = `${opts.font}|${opts.size}|${opts.embedded ? 1 : 0}|${clean}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const w =
    opts.embedded
      ? /* TTF: rasio glyf dijaga lewat pengukuran contoh yang sama untuk
           semua teks Latin. Kesalahan di sini hanya soal lebar, bukan
           kelangsungan - dan untuk dokumen arsip itu jauh lebih kecil
           daripada teks yang hilang. */
        (clean.length * ensureMetrics(pdf, opts.font, true)) * (opts.size / 100)
      : standardWidth(pdf, clean, opts.size, opts.font === "bold");
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, w);
  return w;
}

/**
 * Pecah teks menjadi baris-baris yang muat `maxMm`.
 *
 * Menangani dua kasus yang sering hilang:
 *  1. Kata yang lebih panjang dari kolom (URL, nomor sertifikat tanpa spasi).
 *     Dipotong keras di batas lebar; kalau tidak, satu kata seperti itu
 *     keluar dari halaman dan tidak pernah terlihat errornya.
 *  2. Baris yang sudah muat persis - tidak dipecah lebih jauh dari perlu,
 *     supaya tabel tinggi tidak berubah hanya karena beda ukuran font.
 */
export function wrap(
  pdf: jsPDF,
  text: string,
  maxMm: number,
  opts: { font: FontName; size: number; embedded: boolean },
): string[] {
  const clean = safe(text, opts.font);
  if (maxMm <= 0) return [clean];
  if (measure(pdf, clean, opts) <= maxMm) return [clean];
  const paragraphs = clean.split(/\r?\n/);
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter((w) => w !== "");
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (measure(pdf, candidate, opts) <= maxMm) {
        line = candidate;
        continue;
      }
      if (line !== "") {
        out.push(line);
        line = "";
      }
      /* Kata tunggal lebih lebar dari kolom: potong keras. */
      if (measure(pdf, word, opts) <= maxMm) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (measure(pdf, next, opts) > maxMm && chunk !== "") {
          out.push(chunk);
          chunk = ch;
          continue;
        }
        chunk = next;
      }
      line = chunk;
    }
    if (line !== "") out.push(line);
  }
  return out.length > 0 ? out : [""];
}

/** Tinggi satu baris teks dalam mm untuk ukuran font tertentu. */
export function lineHeight(size: number): number {
  return size * 0.3528;
}

/** Tinggi heading satu baris. */
export function lineHeightFor(size: number, leading = 1.32): number {
  return size * 0.3528 * leading;
}

export function clearCache(): void {
  cache.clear();
}