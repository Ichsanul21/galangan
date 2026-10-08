// Akses aman atas seri deret-waktu untuk SEMUA grafik rentang bulan.
//
// Dua kelas bug muncul berulang di halaman analitik, dan keduanya berakhir
// sebagai "halaman putih" yang menjatuhkan seluruh pohon React:
//
//   1. EKOR KOSONG. `const last = rows[rows.length - 1]` menghasilkan
//      `undefined` saat seri kosong, lalu `last.bln` melempar TypeError.
//      Analytics lama menaruh `lastRevPoint.bln` tanpa penjaga (lihat
//      forecast di Analytics.tsx). Karena fallback ke seed lewat
//      rebindLegacyMonthSeries() mengembalikan `rows.map(...)`, begitu seed
//      itu kosong, seri fallback ikut kosong dan halamannya crash.
//
//   2. PEMBAGIAN NOL. `((cur - prev) / prev) * 100` menghasilkan NaN atau
//      Infinity, dan NaN meracuni seluruh label yang mengikutinya (menjadi
//      "Rp NaN M") tanpa error sama sekali - lebih sulit dilacak daripada
//      crash.
//
// Helper di sini membuat kedua kelas itu jadi eksplisit di satu tempat.
// Jangan akses ekor/ekor-1 deret secara langsung di JSX.

// Bentuk minimum baris seri rentang bulan (lihat utils/monthAxis.ts).
export interface MonthSeriesRow {
  bln: string;
  key: string;
  isCurrent: boolean;
}

/** Titik terakhir seri; `null` bila seri kosong (bukan undefined). */
export function lastPoint<T>(rows: readonly T[] | null | undefined): T | null {
  return rows !== null && rows !== undefined && rows.length > 0 ? rows[rows.length - 1] : null;
}

/** Titik sebelum terakhir; `null` bila deret kurang dari 2 titik. */
export function prevPoint<T>(rows: readonly T[] | null | undefined): T | null {
  return rows !== null && rows !== undefined && rows.length > 1 ? rows[rows.length - 2] : null;
}

/**
 * Persentase perubahan yang aman terhadap pembagi nol.
 * `prev === 0` -> 0, bukan Infinity/NaN yang akan meracuni label turunan.
 */
export function pctChange(curr: number, prev: number): number {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return 0;
  return ((curr - prev) / prev) * 100;
}

/** Teks aman: `undefined`/null jadi "-", bukan error saat dipanggil .split(). */
export function safeText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
}

import { parseIdNumber } from "./format";

/** Angka aman dari field yang bisa null/"" / string berformat "1.000.000".
 *  NaN dan undefined jadi 0. String id-ID diparse (bukan Number() telanjang
 *  yang menghasilkan NaN → tampilan "Rp 0"). */
export const numOf = (v: unknown): number => parseIdNumber(v);

/** Label singkat dari sebuah nilai, N kata pertama saja. Aman untuk undefined. */
export function briefOf(value: unknown, words = 2): string {
  const s = safeText(value, "");
  return s === "" ? "" : s.split(/\s+/).slice(0, words).join(" ");
}