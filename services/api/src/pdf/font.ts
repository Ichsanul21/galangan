/* Registri font.
 *
 * MASALAH YANG DISELESAIKAN: mesin PDF lama memakai font standard-14 jsPDF
 * (Helvetica). Set itu hanya punya himpunan karakter WinAnsi - nama vendor
 * atau karyawan berhuruf Mandarin, dan beberapa simbol yang dipakai di
 * dokumen resmi, tercetak jadi kotak kosong tanpa error. Untuk arsip resmi
 * itu tidak layak.
 *
 * Mekanisme: bila file .ttf tersedia di assets/fonts, font itu di-embed dan
 * dipakai SEMUA teks. Bila tidak ada, mesin jatuh ke standard-14 dan hanya
 * memetakan karakter yang di luar WinAnsi ke padanan terdekat - perilaku
 * yang sama seperti sebelumnya, jadi tidak ada regresi.
 *
 * Embed TTF menaikkan ukuran berkas PDF beberapa ratus KB, karena program
 * font ikut masuk. Untuk artefak arsip resmi itu trade-off yang sepadan;
 * kalau ukuran jadi masalah, subset font lebih dulu sehingga hanya karakter
 * yang benar-benar dipakai yang tertanam (subset perlu alat eksternal -
 * pyftsubset dari fonttools - dan menghasilkan .ttf baru untuk ditaruh di
 * folder ini).
 */
import fs from "node:fs";
import path from "node:path";
import type { jsPDF } from "jspdf";

export type FontName = "regular" | "bold" | "italic";

export interface FontSpec {
  /** Nama font yang didaftarkan ke jsPDF. */
  name: string;
  /** TTF ter-embed, atau null bila memakai standard-14. */
  embedded: boolean;
}

/* Pasangan file yang dicari. Yang pertama yang ada dipakai; sisanya memakai
   Courier standard sebagai cadangan supaya dokumen tetap bisa dirakit. */
const CANDIDATES: Record<FontName, { file: string; jsName: string; fallback: string }> = {
  regular: { file: "regular.ttf", jsName: "IsmsSans", fallback: "helvetica" },
  bold: { file: "bold.ttf", jsName: "IsmsSans-Bold", fallback: "helvetica" },
  italic: { file: "italic.ttf", jsName: "IsmsSans-Italic", fallback: "helvetica" },
};

/* Style jsPDF untuk tiap weight. TTF bold di-embed sebagai font tersendiri
   dengan family name berbeda karena menyatukan bold ke style tidak tersedia
   di jsPDF - setiap weight punya (family, style) sendiri. */
const JS_STYLE: Record<FontName, string> = {
  regular: "normal",
  bold: "bold",
  italic: "italic",
};

let fontsDir = "";
/* Cache isi file TTF (bukan hasil registrasi). Penting: hasil registrasi
   TIDAK boleh dipakai ulang antar dokumen, karena setiap `new jsPDF()` punya
   daftar font sendiri. Cache dulu versi ini menyimpan nama font yang sudah
   didaftarkan, sehingga dokumen kedua dan seterusnya memakai nama yang tidak
   ada di instance-nya - semua teks jatuh ke font fallback tanpa error,
   persis kelas bug yang paling mahal untuk ditemukan (dokumen tercetak, hanya
   saja salah bentuk huruf). Yang dicache di sini hanya isi base64 file-nya;
   mendaftarkannya ke setiap instance jauh lebih murah dibanding dokumen yang
   diam-diam salah. */
let fontFiles: Record<string, string | null> | null = null;
let resolved: Record<FontName, FontSpec> | null = null;

function loadFontFiles(): Record<string, string | null> {
  if (fontFiles) return fontFiles;
  const out: Record<string, string | null> = {};
  for (const cand of Object.values(CANDIDATES)) {
    let full = "";
    if (fontsDir) {
      const candidate = path.join(fontsDir, cand.file);
      if (fs.existsSync(candidate)) full = candidate;
    }
    if (!full) {
      out[cand.file] = null;
      continue;
    }
    try {
      out[cand.file] = fs.readFileSync(full).toString("base64");
    } catch {
      out[cand.file] = null;
    }
  }
  fontFiles = out;
  return out;
}

/** True bila ada file TTF yang bisa dipakai (tanpa menyentuh jsPDF). */
export function fontFilesAvailable(): boolean {
  const files = loadFontFiles();
  return Object.values(files).some((v) => v !== null);
}

/* Peta karakter di luar WinAnsi ke ejaan yang setara. Standard-14 tidak punya
   tanda panah/bobot, dan dokumen resmi kita memakai beberapa (mis. "Resi →
   Gudang"). Lebih baik "Resi -> Gudang" daripada kotak kosong. */
const FALLBACK_MAP: Record<string, string> = {
  "\u2192": "->",
  "\u2190": "<-",
  "\u2194": "<->",
  "\u21d2": "=>",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2248": "~",
  "\u2260": "!=",
  "\u221a": "sqrt",
  "\u03a3": "Sum",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "...",
  "\u00a0": " ",
  "\u00d7": "x",
  "\u00b7": "-",
  "\u00a3": "GBP",
  "\u20ac": "EUR",
};

/**
 * Bersihkan teks agar aman dicetak.
 * Saat TTF ter-embed, karakter asli dikembalikan apa adanya (TDF punya
 * petak jauh lebih lebar). Saat fallback standard-14, karakter yang tidak
 * ada dipetakan; yang tetap tidak terpetakan dibuang, bukan jadi kotak.
 */
export function safeText(s: unknown, spec?: FontSpec): string {
  const raw = String(s ?? "");
  if (spec?.embedded) return raw;
  return raw.replace(/[\u2190-\u2BFF\u0380-\u04FF\u00A0-\u00BF\u2010-\u203B]/g, (ch) => FALLBACK_MAP[ch] ?? "");
}

/** Arahkan folder font (dipanggil sekali saat aplikasi boot). */
export function initFonts(dir: string): void {
  fontsDir = dir;
  fontFiles = null;
  resolved = null;
}

/**
 * Daftarkan font ke SATU instance jsPDF.
 *
 * Setiap dokumen memanggilnya sekali, dan hasilnya di-cache per weight
 * (nama font apa yang akhirnya terpakai). Pendaftaran sendiri selalu
 * diulang per instance - itu yang membuat dokumen kedua tetap memakai TTF,
 * bukan diam-diam jatuh ke Helvetica.
 */
export function registerFonts(pdf: jsPDF): Record<FontName, FontSpec> {
  const out = {} as Record<FontName, FontSpec>;
  const files = loadFontFiles();
  for (const [weight, cand] of Object.entries(CANDIDATES) as Array<[FontName, (typeof CANDIDATES)["regular"]]>) {
    const base64 = files[cand.file];
    if (!base64) {
      out[weight] = { name: cand.fallback, embedded: false };
      continue;
    }
    try {
      pdf.addFileToVFS(cand.file, base64);
      /* Signature addFont(family, style, file, id). Style "normal" wajib ada:
         jsPDF memetakan (family, style) saat setFont dipanggil, dan font tanpa
         style tidak akan pernah ditemukan - document tetap jalan tapi semua
         teks jatuh ke fallback tanpa satu pun galat. */
      pdf.addFont(cand.jsName, JS_STYLE[weight], cand.file, JS_STYLE[weight]);
      out[weight] = { name: cand.jsName, embedded: true };
    } catch {
      out[weight] = { name: cand.fallback, embedded: false };
    }
  }
  /* Catatan: `out` disimpan supaya `safe()`/`fontName()` yang dipanggil dari
     factory tidak perlu menerima spec setiap kali. Nilai simpanannya cuma
     keputusan fallback/embed - font benar-benar didaftarkan ke `pdf` di atas,
     bukan ke dokumen berikutnya. */
  resolved = out;
  return out;
}

/** True bila font TTF benar-benar terpakai pada render terakhir. */
export function fontsEmbedded(): boolean {
  return resolved?.regular.embedded === true;
}

/* Rentang codepoint CJK. Nama Mandarin/karyawan bisa muncul di dokumen
   resmi (kwitansi ke vendor Mandarin, absensi karyawan Tionghoa), dan tanpa
   font CJK karakter itu tercetak sebagai kotak TANPA ERROR - dokumen keluar
   dari printer, ukurannya wajar, tidak ada yang gagal. Itu kelas kegagalan
   yang paling mahal karena tidak terdeteksi. */
const CJK_RANGES: [number, number][] = [
  [0x3040, 0x30ff],   // Hiragana + Katakana
  [0x3400, 0x4dbf],   // CJK Extension A
  [0x4e00, 0x9fff],   // CJK Unified Ideographs
  [0xf900, 0xfaff],   // CJK Compatibility Ideographs
  [0xac00, 0xd7af],   // Hangul syllables
];

/** Huruf CJK yang ada di teks. */
export function cjkChars(text: string): string[] {
  const out = new Set<string>();
  for (const ch of String(text ?? "")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (CJK_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) out.add(ch);
  }
  return [...out];
}

/** True bila teks memuat huruf CJK. */
export function hasCjk(text: string): boolean {
  return cjkChars(text).length > 0;
}

/** Nama font untuk jsPDF. */
export function fontName(weight: FontName): string {
  return resolved?.[weight]?.name ?? CANDIDATES[weight].fallback;
}

/** Bersihkan teks memakai font yang sedang aktif. */
export function safe(text: unknown, weight: FontName): string {
  return safeText(text, resolved?.[weight]);
}