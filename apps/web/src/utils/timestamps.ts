import { nowIso } from "./format";

/**
 * Satu-satunya sumber nama field tanggal rekam. Dipakai store saat menulis,
 * tabel saat menampilkan, dan probe saat memverifikasi.
 *
 * Kenapa BUKAN kolom `created_at` di SQL: setiap tabel hanya punya
 * `id, branch, data, updated_at`, dan seluruh isi rekam disimpan sebagai JSON
 * di kolom `data`. Menambah kolom berarti ALTER di ~25 tabel untuk data yang
 * sebenarnya sudah muat di dalam `data` - dan `updated_at` yang ada sekarang
 * tidak bisa dipakai karena nilainya ditimpa setiap PATCH (hanya concurrency
 * token, bukan "terakhir diubah").
 */
export const CREATED_FIELD = "createdAt";
export const UPDATED_FIELD = "updatedAt";

function isStamp(v: unknown): v is string {
  return typeof v === "string" && v !== "" && Number.isFinite(Date.parse(v));
}

/** Tanggal buat record, atau `null` untuk record lama yang belum di-backfill. */
export function createdAtOf(row: Record<string, unknown> | null | undefined): string | null {
  const v = row?.[CREATED_FIELD];
  return isStamp(v) ? v : null;
}

/** Terakhir diubah oleh aksi pengguna. `null` = belum pernah diedit sejak dibuat. */
export function updatedAtOf(row: Record<string, unknown> | null | undefined): string | null {
  const v = row?.[UPDATED_FIELD];
  return isStamp(v) ? v : null;
}

/**
 * Mengisi `createdAt` kalau belum ada. Sengaja tidak menimpa nilai yang sudah
 * ada: seed, impor, dan hasil restore semuanya menyertakan timestamp mereka
 * sendiri, dan `add()` juga dipakai saat sinkronisasi.
 */
export function stampCreated<T extends Record<string, unknown>>(row: T): T {
  const r = row as Record<string, unknown>;
  if (!isStamp(r[CREATED_FIELD])) r[CREATED_FIELD] = nowIso();
  return row;
}

/** Mengisi `updatedAt` pada patch. Tidak menyentuh `createdAt` - patch tidak boleh. */
export function stampUpdated<T extends Record<string, unknown>>(patch: T): T {
  (patch as Record<string, unknown>)[UPDATED_FIELD] = nowIso();
  return patch;
}

/**
 * Kolom `updated_at` milik server selalu ada di rekam yang berasal dari API,
 * tapi store lokal/seed bisa tidak memilikinya. UI "diubah" harus pakai
 * `updatedAt` dulu, baru jatuh ke `updated_at`, lalu ke `updated` (field
 * tanggal lama yang hanya menyimpan YYYY-MM-DD) supaya tabel lama tidak kosong.
 */
export function lastTouchedAt(row: Record<string, unknown> | null | undefined): string | null {
  const u = updatedAtOf(row);
  if (u !== null) return u;
  const legacy = row?.[UPDATED_FIELD] ?? row?.updated_at ?? row?.updated;
  return typeof legacy === "string" && legacy !== "" && Number.isFinite(Date.parse(legacy)) ? legacy : null;
}

/**
 * Kandidat field tanggal milik rekam itu sendiri, urutan szerint paling dekat
 * ke "kapan record ini dibuat". Diambil dari nama field yang BENAR-BENAR ada di
 * `data/index.ts` + `data/seeds.ts`, bukan tebakan.
 *
 * Sengaja TIDAK dipakai: `due`, `end`, `expires`, `pay1date`, `pay2date`.
 * Semuanya tanggal BATAS, dan memakainya sebagai "dibuat" menampilkan
 * tanggal yang lebih akhir dari kenyataan - lebih merusak daripada "—".
 *
 * `built` (tahun-built kapal), `period` ("2026-07"), dan `time` ("2 menit
 * lalu") juga tidak dipakai: bukan tanggal sama sekali. `leaves.from` juga
 * dikecualikan karena tanggal cuti mulai selalu SESUDAH pengajuan, bukan
 * saat rekam dibuat.
 *
 * Master data (vessel, karyawan, equipment, gudang, vendor, cabang) memang
 * tidak punya tanggal buat. Untuk koleksi itu "—" adalah jawaban yang benar,
 * dan angka hasil tebakan akan lebih buruk daripada kosong.
 */
export const CREATED_FALLBACK_FIELDS = [
  "date",
  "tanggal",
  "start",
  "signedAt",
  "requestDate",
  "issued",
  "repairDate",
  "tanggalSetor",
  "receivedDate",
  "since",
] as const;

/**
 * Tanggal buat yang diturunkan dari field tanggal milik rekam sendiri.
 * `null` kalau tidak ada kandidat yang valid - pemanggil harus menampilkan
 * "—", bukan menebak.
 */
export function deriveCreatedAt(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  for (const f of CREATED_FALLBACK_FIELDS) {
    const v = row[f];
    if (typeof v === "string" && v !== "" && Number.isFinite(Date.parse(v))) {
      return new Date(Date.parse(v)).toISOString();
    }
    /* `date` kadang diisi "2026-01-05T00:00:00.000Z", kadang "2026-01-05",
       kadang angka epoch. Ketiganya harus tetap terbaca. */
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      return new Date(v).toISOString();
    }
  }
  return null;
}

/**
 * Satu pass untuk seluruh bentuk seed. Dijalankan sekali di akhir
 * `buildSeeds()`, bukan per koleksi, supaya menambah koleksi baru tidak
 * membuat tempat lain lupa memanggilnya.
 * `createdAt` yang sudah ada (5 rekam seed punya) tidak ditimpa.
 */
export function stampDerivedCreatedAt(
  shape: Record<string, unknown[]>,
): { stamped: number; unresolved: Record<string, number> } {
  let stamped = 0;
  const unresolved: Record<string, number> = {};
  for (const [col, rows] of Object.entries(shape)) {
    if (!Array.isArray(rows)) continue;
    let miss = 0;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (isStamp(r[CREATED_FIELD])) {
        stamped += 1;
        continue;
      }
      const derived = deriveCreatedAt(r);
      if (derived === null) {
        miss += 1;
        continue;
      }
      r[CREATED_FIELD] = derived;
      stamped += 1;
    }
    if (miss > 0) unresolved[col] = miss;
  }
  return { stamped, unresolved };
}
