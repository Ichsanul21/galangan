/* Token desain tunggal untuk seluruh dokumen PDF.
 *
 * Kenapa file ini ada: warna, ukuran halaman, margin, dan skala tipografi
 * sebelumnya tersebar di setiap factory. Akibatnya dokumen resmi berbeda
 *AWAL satu sama lain dalam hal yang paling kelihatan - nomor 하나 punya
 * margin 15 mm, nomor dua 12 mm, dan "biru" berarti hex yang berbeda di dua
 * tempat. Semua token dikumpulkan di sini supaya tidak ada keputusan
 * yang bisa diambil dua kali.
 *
 * SEMUA satuan dalam milimeter. jsPDF dikonfigurasi `unit: "mm"`.
 */

export interface PageSpec {
  format: "a4" | "letter" | "legal" | "f4";
  width: number;
  height: number;
}

/** Ukuran halaman dalam mm (96dpi ≈ 3,7795 px/mm). */
export const PAGES: Record<PageSpec["format"], PageSpec> = {
  a4: { format: "a4", width: 210, height: 297 },
  letter: { format: "letter", width: 215.9, height: 279.4 },
  legal: { format: "legal", width: 215.9, height: 355.6 },
  f4: { format: "f4", width: 215, height: 330 },
};

export const MARGIN_MM = 15;

/** Palet. Urutan warna di sini = urutan prioritas di dokumen resmi. */
export const COLOR = {
  /* Identitas: kop, judul, garis pemisah utama. */
  navy: [11, 58, 99] as RGB,
  /* Teks sekunder: subjudul, label nilai, catatan kaki. */
  steel: [82, 105, 124] as RGB,
  /* Isian header tabel. */
  headFill: [233, 239, 244] as RGB,
  /* Garis grid dan pemisah. */
  rule: [150, 150, 150] as RGB,
  hair: [208, 216, 224] as RGB,
  /* Isian callout / ringkasan. */
  softFill: [245, 248, 251] as RGB,
  /* Semantic. */
  danger: [190, 42, 42] as RGB,
  warn: [180, 118, 12] as RGB,
  ok: [26, 122, 74] as RGB,
  /* Chart. Dipakai juga oleh grafik di layar supaya PDF dan UI satu warna. */
  series: [
    [11, 58, 99],      // navy
    [13, 148, 136],    // teal - margin/profit
    [217, 119, 6],     // amber - peripher
    [190, 42, 42],     // red - masalah
    [107, 114, 128],   // slate - netral
    [43, 108, 176],    // blue
    [146, 64, 14],     // brown
    [22, 163, 74],     // green
  ] as RGB[],
  /* Garis bantu chart. Di layar memakai #e9eff4 yang kontrasnya 1,06:1 -
     tidak terlihat setelah JPEG. Di PDF memakai token yang jauh lebih gelap
     supaya garis benar-benar ada di kertas. */
  grid: [148, 163, 184] as RGB,
  axis: [71, 85, 105] as RGB,
  zero: [100, 116, 139] as RGB,
};

export type RGB = [number, number, number];

/* Skala tipografi. Font default 9 pt; judul 15 pt. Semua turunan dari
   DEFAULT_SIZE supaya mengubah satu angka mengubah seluruh dokumen. */
export const TYPE = {
  /** Isi tabel & paragraf. */
  base: 9,
  /** Tabel yang sangat padat (banyak kolom). */
  dense: 7.5,
  /** Baris kepala tabel. */
  head: 8,
  /** Kop: nama perusahaan. */
  kop: 15,
  /** Kop: subjudul & alamat. */
  kopSub: 9,
  /** Judul dokumen. */
  title: 12,
  /** Subjudul dokumen (nomor/tanggal). */
  subtitle: 9,
  /** Nama section di dalam laporan. */
  section: 10.5,
  /** Label nilai (kiri kolom kv). */
  label: 9,
  /** Total / angka menonjol. */
  emphasis: 11,
  /** Footer halaman. */
  footer: 7.5,
  /** Label sumbu chart. */
  axis: 7,
} as const;

/* Ruang vertikal dalam mm. */
export const SPACE = {
  /** Jarak antar paragraf. */
  para: 1.6,
  /** Jarak sebelum/ sesudah block besar. */
  block: 3.2,
  /** Padding vertikal sel tabel. */
  cellPadY: 1.3,
  /** Padding horizontal sel tabel. */
  cellPadX: 1.5,
  /** Jarak kop -> konten. */
  afterKop: 5,
  /** Ketinggian reserved untuk blok tanda tangan. */
  sigRole: 8,
  /** Jarak per baris kosong area tanda tangan. */
  sigRow: 5.2,
} as const;

/** Lebar garis dalam mm (bukan pt). jsPDF memakai unit dokumen, jadi mm.
 *  Tipe widened ke number supaya bisa dipakai di mana saja. */
export const STROKE: Record<string, number> = {
  hair: 0.15,
  thin: 0.2,
  medium: 0.45,
  heavy: 0.9,
};