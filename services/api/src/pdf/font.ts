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
 * font ikut masuk. Untukartefak arsip resmi itu trade-off yang sepadan; untuk
 * laporan yang diunduh berulang kali, jalankan `npm run fonts:subset`
 * (lihat README di folder ini) untuk memangkas font ke karakter yang benar-
 * benar dipakai.
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
let registered: Record<FontName, FontSpec> | null = null;

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
  registered = null;
}

/**
 * Daftarkan font ke dokumen. Idempoten per file jsPDF.
 * Mengembalikan peta font yang harus dipakai pemanggil.
 */
export function registerFonts(pdf: jsPDF): Record<FontName, FontSpec> {
  if (registered) return registered;
  const out = {} as Record<FontName, FontSpec>;
  for (const [weight, cand] of Object.entries(CANDIDATES) as Array<[FontName, (typeof CANDIDATES)["regular"]]>) {
    let file = "";
    if (fontsDir) {
      const full = path.join(fontsDir, cand.file);
      if (fs.existsSync(full)) file = full;
    }
    if (!file) {
      out[weight] = { name: cand.fallback, embedded: false };
      continue;
    }
    try {
      pdf.addFileToVFS(cand.file, fs.readFileSync(file).toString("base64"));
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
  registered = out;
  return out;
}

/** True bila font TTF benar-benar terpasang (berguna untuk diagnostics). */
export function fontsEmbedded(): boolean {
  return registered?.regular.embedded === true;
}

/** Nama font untuk jsPDF. */
export function fontName(weight: FontName): string {
  return registered?.[weight]?.name ?? CANDIDATES[weight].fallback;
}

/** Bersihkan teks memakai font yang sedang aktif. */
export function safe(text: unknown, weight: FontName): string {
  return safeText(text, registered?.[weight]);
}