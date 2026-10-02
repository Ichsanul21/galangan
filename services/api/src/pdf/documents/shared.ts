/* Helper yang dipakai semua factory dokumen resmi.
 *
 * Isi di sini - kop perusahaan, format angka/tanggal, pemuat baris dari DB -
 * TIDAK duplikat di 21 factory. Kesalahan seperti "kwitansi pakai ejaan
 * tanggal berbeda dari PO" tidak mungkin terjadi kalau semua lewat sini.
 */
import { q } from "../../db.js";
import { kopBlock, titleBlock, paragraph, type Block } from "../blocks.js";
import type { Document } from "../document.js";

/* Identitas perusahaan untuk dokumen resmi.
 *
 * DISALIN dari apps/web/src/utils/sb.ts, bukan di-import. Alasan teknis:
 * services/api/tsconfig.json punya rootDir "src" dan hanya menyertakan berkas
 * di dalam folder src, sehingga import statis ke apps/web membuat tsc tidak
 * bisa memetakan keluaran build sama sekali. seedMirror.ts menghadapi hal
 * yang sama dan menyelesaikannya dengan path.resolve() saat runtime - pola
 * yang tidak bisa dipakai di sini karena blok PDF butuh nilai ini saat
 * modul diimpor.
 *
 * Konsekuensi duplikasi ini dijaga oleh probe: scripts/pdf-probe.ts
 * membandingkan setiap baris di sini dengan SB_KOP frontend, sehingga
 * keduanya tidak bisa berbeda diam-diam. Kalau perusahaan ganti nama atau
 * alamat, dua file itu harus berubah bersama - dan probe yang akan
 * menjatuhkan kalau salah satu lupa. */
export const KOP = {
  name: "PT. SYUKUR BERSAUDARA",
  line1: "PERUSAHAAN GALANGAN DAN INDUSTRI KAPAL",
  hq: "KANTOR PUSAT SAMARINDA - KALIMANTAN TIMUR",
  addr1: "Jl. Mulawarman No.23 Telp. (0541) 6246750, Admin 08115524456",
  addr2: "Shipyard: Jl. Olah Bebaya Kampung Tengah Pulau Atas (Samarinda Ilir)",
  hp: "0811 552 4456",
  director: "H. Syarif Sarapping",
} as const;

/** Baris yang harus sama persis dengan KOP di atas - dipakai probe. */
export const KOP_LINES: Record<keyof typeof KOP, string> = {
  name: KOP.name,
  line1: KOP.line1,
  hq: KOP.hq,
  addr1: KOP.addr1,
  addr2: KOP.addr2,
  hp: KOP.hp,
  director: KOP.director,
};

/** Kop perusahaan. Semua dokumen resmi memakai ini tanpa variasi. */
export function companyKop(): Block {
  return kopBlock({
    name: KOP.name,
    line1: KOP.line1,
    hq: KOP.hq,
    addr: `${KOP.addr1} · ${KOP.addr2} · ${KOP.hp}`,
  });
}

const BULAN_PENUH = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** ISO -> "2 Oktober 2026". Tanggal kosong tetap "-". */
export function longDate(iso: unknown): string {
  const s = String(iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s === "" ? "-" : s;
  return `${Number(m[3])} ${BULAN_PENUH[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** ISO -> "2 Okt 2026". */
export function shortDate(iso: unknown): string {
  const s = String(iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s === "" ? "-" : s;
  const short = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${Number(m[3])} ${short[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Angka dengan pemisah ribuan titik; negatif jadi "(1.234.567)" - notase akuntansi. */
export function money(v: unknown, decimals = 0): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const body = Math.abs(n).toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return n < 0 ? `(${body})` : body;
}

/** Rupiah penuh dengan notase. */
export function rupiah(v: unknown, decimals = 0): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "Rp -";
  return n < 0 ? `(Rp ${money(Math.abs(n), decimals)})` : `Rp ${money(n, decimals)}`;
}

/** Angka bulat + satuan. */
export function qty(v: unknown, unit = ""): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const s = n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return unit === "" ? s : `${s} ${unit}`;
}

/** Persen 1 desimal. */
export function pct(v: unknown, decimals = 1): string {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(decimals)}%` : "-";
}

export type Locale = "id" | "en";

/** Pilih teks sesuai locale - dipakai untuk label dokumen resmi. */
export function L(locale: Locale, id: string, en: string): string {
  return locale === "en" ? en : id;
}

/* ==========================================================================
   Akses data
   ========================================================================== */

export interface Row {
  id: string;
  branch: string;
  data: Record<string, unknown>;
  updated_at: string;
}

export function toItem(r: Row): Record<string, unknown> {
  const data = typeof r.data === "string" ? (JSON.parse(r.data) as Record<string, unknown>) : (r.data ?? {});
  return { ...data, id: r.id, branch: r.branch, updated_at: r.updated_at };
}

export interface RowSpec {
  /** Nama field yang harus ada. */
  field: string;
  /** Format id. */
  prefix: string;
}

/**
 * Muat satu entitas dari DB.
 *
 * PENTING untuk integritas: server TIDAK menerima isi dokumen dari klien.
 * Kalau payload klien yang dirakit, kwitansi bisa dicetak dengan nominal
 * yang tidak ada di pembukuan - dan dokumen resmi seperti ini tidak boleh
 * bisa dipalsukan dari browser.
 */
export async function loadEntity(spec: RowSpec, id: string): Promise<Record<string, unknown> | null> {
  const rows = await q<Row>(`SELECT id, branch, data, updated_at FROM ${spec.field} WHERE id = ?`, [id]);
  const first = rows[0];
  return first ? toItem(first) : null;
}

/** Muat banyak entitas terfilter; dipakai dokumen yang butuh relasi. */
export async function loadMany(
  spec: RowSpec,
  opts: { ids?: string[]; branch?: string } = {},
): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [];
  let sql = `SELECT id, branch, data, updated_at FROM ${spec.field}`;
  const where: string[] = [];
  if (opts.ids && opts.ids.length > 0) {
    where.push(`id IN (${opts.ids.map(() => "?").join(",")})`);
    params.push(...opts.ids);
  }
  if (opts.branch !== undefined && opts.branch !== "" && opts.branch !== "SEMUA") {
    where.push("branch = ?");
    params.push(opts.branch);
  }
  if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
  const rows = await q<Row>(sql, params);
  return rows.map(toItem);
}

/** Ambil nilai teks dari entitas. */
export function str(src: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = src[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "-";
}

/** Ambil nilai angka; 0 bila tidak ada. */
export function num(src: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(src[k]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

/** Baca teks panjang dari baris apa pun. */
export function text(v: unknown, fallback = "-"): string {
  const s = String(v ?? "").trim();
  return s === "" ? fallback : s;
}

/* ==========================================================================
   Kop dokumen
   ========================================================================== */

export interface DocTitle {
  /** Judul besar, mis. "KWITANSI". */
  title: string;
  /** Nomor dan tanggal di bawah judul. */
  ref?: string;
}

/** Judul + nomor/tanggal. Semua dokumen resmi memakai pola ini. */
export function docTitle(t: DocTitle): Block {
  return titleBlock(t.title, t.ref);
}

/** Catatan kaki dokumen (syarat pembayaran, dll). */
export function docNote(lines: string[]): Block[] {
  if (lines.length === 0) return [];
  return lines.map((t) => paragraph({ text: t, size: 8, color: [82, 105, 124] }));
}

export { KOP as SB_KOP };
export type { Document };