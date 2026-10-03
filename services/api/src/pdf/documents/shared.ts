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

/** Cabang entitas saja, tanpa parses `data`.
 *  Dipakai routes/pdf.ts untuk mengunci RenderContext.branch ke cabang dokumen
 *  yang sedang dicetak, supaya isi PDF tidak bisa mencampur cabang. */
export async function entityBranch(field: string, id: string): Promise<string | null> {
  const rows = await q<{ branch: string }>(`SELECT branch FROM ${field} WHERE id = ?`, [id]);
  const b = String(rows[0]?.branch ?? "");
  return b === "" ? null : b;
}

/**
 * Daftar cabang yang benar-benar ada di sistem.
 *
 * PENTING: kosakata cabang di aplikasi ini adalah NAMA KOTA
 * ("Samarinda", "Balikpapan", "Banjarmasin"), bukan kode cabang dan bukan
 * nilai kolom `branch`. Kolom itu hampir kosong - invoice dan jurnal punya
 * `branch = ""`, hanya projects/employees yang mengisi - sedangkan nama
 * kota disimpan di dalam JSON `data.city` pada koleksi `branches`.
 *
 * Versi pertama fungsi ini membaca kolom `branch` saja, jadi hanya
 * mengembalikan ["Samarinda"]: memilih "Balikpapan" di dropdown cabang lalu
 * ekspor laporan akan ditolak 400, padahal Balikpapan cabang yang sah.
 * Karena itu tiga sumber ikut dibaca: kolom branch, city di branches, dan
 * nama/id cabang sebagai cadangan.
 */
export async function knownBranches(): Promise<string[]> {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    const s = String(v ?? "").trim();
    /* "-" dan string kosong berarti "baris tidak punya cabang", bukan nama
       cabang - menerimanya akan membuat filter yang tidak pernah menghasilkan
       apa pun lolos validasi. */
    if (s !== "" && s !== "-" && s !== "SEMUA") out.add(s);
  };
  for (const field of ["projects", "employees", "invoices"]) {
    for (const r of await q<{ branch: string }>(`SELECT DISTINCT branch FROM ${field}`, [])) add(r.branch);
  }
  for (const r of await q<{ id: string; data: unknown }>("SELECT id, data FROM branches", [])) {
    const raw: Record<string, unknown> = typeof r.data === "string"
      ? JSON.parse(r.data) as Record<string, unknown>
      : ((r.data ?? {}) as Record<string, unknown>);
    /* Urutan sesuai select di FE: city, lalu name, lalu id. */
    add(raw.city);
    add(raw.name);
    add(r.id);
  }
  return [...out].sort();
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

/**
 * Baca field berupa daftar objek.
 *
 * Field daftar di baris dokumen bisa datang dalam tiga bentuk: array objek
 * (hasil simpan normal), JSON string (beberapa baris lama), atau object map.
 * Ketiganya bercampur dalam satu tabel `documents` yang umurnya sudah beberapa
 * kali, jadi pemanggil tidak boleh memakai `as Array<...>` telanjang - satu
 * baris rusak akan membuat seluruh dokumen gagal dirakit.
 */
export function arr(src: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  for (const k of keys) {
    const v = src[k];
    if (Array.isArray(v)) {
      return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
    }
    if (typeof v === "string" && v.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(v) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
        }
      } catch {
        /* bukan JSON -Fields lain yang dicoba. */
      }
    }
  }
  return [];
}

/** Baris "{ nama, qty }" untuk tabel goods note; qty boleh string atau angka. */
export function itemRows(src: Record<string, unknown>, ...keys: string[]): Array<{ name: string; qty: string }> {
  return arr(src, ...keys)
    .map((r) => ({
      name: String(r.name ?? r.item ?? r.title ?? "-").trim() || "-",
      qty: String(r.qty ?? r.jumlah ?? r.quantity ?? "").trim(),
    }))
    .filter((r) => r.name !== "" || r.qty !== "");
}

/** Buang baris kosong di awal/akhir daftar barang. */
export function trimItems(items: Array<{ name: string; qty: string }>): Array<{ name: string; qty: string }> {
  return items.filter((i) => i.name.trim() !== "" || i.qty.trim() !== "");
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