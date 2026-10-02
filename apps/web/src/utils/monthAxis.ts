// Sumbu bulan untuk SEMUA grafik rentang-bulan.
//
// requirements yang jadi alasan file ini ada:
//   1. Rentang bulan harus SPESIFIK - bulan + tahun, bukan "Jan", "Feb", ...
//      Sumbu 12 titik full-year tanpa tahun bisa dibaca salah saat data
//      melewati pergantian tahun (mis. "Des 2.1" lalu "Jan 4.6" - naiknya
//      kelihatan seperti growth padahal beda tahun).
//   2. "Bulan Berjalan" harus di UJUNG KANAN sumbu X (titik terakhir).
//      Versi lama memakai rotasi array seed (Analytics.withMonthLabels):
//      series di-putar supaya label bulan-berjalan menempel ke nilai yang
  //      sebenarnya milik bulan lain. Nilai sudah benar tapi labelnya tidak -
//      sehingga grafik menampilkan pertumbuhan fiktif.
//   3. Modern: label harus dihitung dari TANGGAL, bukan dari nama bulan di data.
//      Kalau nama bulan tidak ada di seri, sumbu lama diam-diam fallback ke
//      array apa adanya - sehingga "bulan berjalan" hilang diam-diam.
// Kontrak: monthAxis() mengembalikan N titik, KRONOLOGIS, dengan titik
// terakhir = bulan berjalan. Nilai seri di-bucket oleh monthKeyOf(tanggal)
// sehingga angka dan label selalu berasal dari bulan yang sama.

/* Daftar bulan ini SATU-SATUNYA sumber kebenaran ejaan nama bulan.
   Sebelumnya setiap modul punya salinan sendiri, dan August ditulis tiga
   cara: "Ags" (Dashboard, Analytics, Finance, Documents), "Agu" (format.ts,
   Inventory, Equipment, QCSafety, Drydock), dan "Agt" (Absensi).

   Akibatnya helper rotasi seperti `arr.findIndex(d => d.month === M[cur])`
   gagal match saat bulan berjalan adalah August, sehingga seri tidak
   terotasi tanpa error - dan grafik tetap tampil meyakinkan dengan label
   yang salah. Semua modul sekarang mengimpor dari sini; jangan deklarasikan
   ulang daftar bulan di file lain. */
export const ID_MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"] as const;
export const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type Locale = "id" | "en";

function monthsOf(locale: Locale): readonly string[] {
  return locale === "en" ? EN_MON : ID_MON;
}

/** "2026-08-01" | "2026-08" → "2026-08". "" bila tidak bisa dibaca. */
export function monthKeyOf(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : "";
}

/** Key bulan dari objek Date (pakai timezone lokal, bukan UTC). */
export function monthKeyOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Geser satu bulan dari key "YYYY-MM".
 * Aman untuk pergantian tahun: Jan - 1 → Des tahun sebelumnya.
 */
export function shiftMonthKey(key: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return key;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
  return monthKeyOfDate(d);
}

export interface MonthPoint {
  /** "YYYY-MM" - kunci bucket. */
  key: string;
  /** Sumbu X: bulan + tahun. Default "Okt 2026" (tahun 4 digit). */
  label: string;
  /** Sumbu X ringkas: "Okt 26". */
  shortLabel: string;
  /** "2026-10-01" - untuk <Tooltip> tanggal penuh. */
  iso: string;
  year: number;
  /** 1..12 */
  month: number;
  /** true hanya untuk bulan berjalan - dipakai penyorotan titik. */
  isCurrent: boolean;
  /** true untuk bulan pertama (garis pemisah tahun bila menyeberang). */
  isYearStart: boolean;
}

export interface MonthAxisOptions {
  /** Lokal nama bulan. Default "id". */
  locale?: Locale;
  /** Jumlah titik, termasuk bulan berjalan. Default 12. */
  months?: number;
  /** Titik awal opsional ("YYYY-MM"). Default = bulan berjalan - (months-1). */
  start?: string;
  /** Base "saat ini". Default new Date(). Dipakai test & re-export PDF. */
  now?: Date;
  /** Format label. "long" = "Okt 2026" (default), "short" = "Okt 26". */
  labelFormat?: "long" | "short";
}

/**
 * Bangun sumbu bulan.
 *
 * Contoh (locale id, months=12, now = 1 Okt 2026):
 *   Sep 2025 … Okt 2026   <- titik TERAKHIR = bulan berjalan
 *
 * Pokretak yearsExplicitly=false untuk format lama "Sep 25"? Tidak - default
 * selalu tahun eksplisit karena requirement "rentang bulan & tahun spesifik".
 * Pakai labelFormat:"short" hanya untuk grafik sempit (mobile).
 */
export function monthAxis(opts: MonthAxisOptions = {}): MonthPoint[] {
  const locale = opts.locale ?? "id";
  const mon = monthsOf(locale);
  const n = Math.max(1, Math.trunc(opts.months ?? 12));
  const now = opts.now ?? new Date();
  const curKey = monthKeyOfDate(now);
  const first = opts.start ? shiftMonthKey(opts.start, 0) : shiftMonthKey(curKey, -(n - 1));

  const out: MonthPoint[] = [];
  let key = first;
  for (let i = 0; i < n; i += 1) {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    const y = Number(m?.[1] ?? 0);
    const mo = Number(m?.[2] ?? 1) - 1;
    const name = mon[mo] ?? String(mo + 1);
    out.push({
      key,
      label: `${name} ${y}`,
      shortLabel: `${name} ${String(y).slice(2)}`,
      iso: `${key}-01`,
      year: y,
      month: mo + 1,
      isCurrent: key === curKey,
      isYearStart: mo === 0,
    });
    key = shiftMonthKey(key, 1);
  }
  return out;
}

/**
 * Bucket data bertanggal ke MonthPoint.
 *
 * `pick` membaca angka dari satu baris (mis. i.amount). Rows yang tanggalnya
 * di luar sumbu diabaikan; titik tanpa data bernilai 0 (grafik tidak boleh
 * bolong di tengah). `aggregate` menjumlahkan beberapa baris per bulan.
 */
export function bucketByMonth<T>(
  rows: T[],
  axis: MonthPoint[],
  dateOf: (row: T) => unknown,
  pick: (row: T) => number,
  aggregate: (values: number[]) => number = (v) => v.reduce((s, x) => s + x, 0),
): Record<string, number> {
  const out: Record<string, number> = {};
  const bucket: Record<string, number[]> = {};
  for (const p of axis) {
    out[p.key] = 0;
    bucket[p.key] = [];
  }
  for (const row of rows) {
    const key = monthKeyOf(dateOf(row));
    if (key === "" || !(key in out)) continue;
    const v = Number(pick(row));
    bucket[key]?.push(Number.isFinite(v) ? v : 0);
  }
  for (const p of axis) out[p.key] = aggregate(bucket[p.key] ?? []);
  return out;
}

/**
 * Bentuk SERIES dari axis + data, siap di-feed ke recharts.
 *
 * `T` adalah tipe baris keluaran (default shape minimal supaya field lain
 * tetap terbaca): `monthSeries(axis, vals, "revenue")` menghasilkan
 * `(T & { bln, key, isCurrent })[]` sehingga `row.revenue` tetap `number`.
 * Versi non-generic (T tidak diberikan) mengembalikan nilai `unknown` -
 * JANGAN pakai itu diTSX karena memaksa cast di setiap pemakaian.
 *
 * `axisField` default "bln" (mengikuti konvensi Analytics/Laporan yang sudah
 * dipakai). Nilai yang tidak ada di bucket ditulis 0, bukan undefined, supaya
 * recharts tidak bolong di tengah.
 */
export function monthSeries<
  T extends { bln: string; key: string; isCurrent: boolean },
>(axis: MonthPoint[], values: Record<string, number>, field: string, axisField = "bln"): T[] {
  return axis.map((p) => ({
    [axisField]: p.label,
    key: p.key,
    year: p.year,
    month: p.month,
    isCurrent: p.isCurrent,
    [field]: Number.isFinite(values[p.key]) ? values[p.key] : 0,
  })) as unknown as T[];
}

/* ============================================================
   KOMPATIBILITAS: series lama berbasis nama bulan
   ============================================================ */

/**
 * Pasangkan seri lama `{ month: "Sep", ... }` ke sumbu bulan BERJALAN.
 *
 * Untuk Analytics/Laporan yang masih memakai data seed (`revenueSeries`,
 * `marginSeries`, `inspectionTrend` di data/index.ts): seri itu ditulis
 * sebagai 12 nama bulan hardcode "Sep…Agu" tanpa tahun, jadi tahun
 * sebenarnya tidak diketahui. Kita asumsikan deret itu BERAKHIR di bulan
 * berjalan (konvensi yang sudah dipakai Dashboard), lalu pasangkan setiap
 * baris ke titik sumbu dengan NAMA BULAN yang sama.
 *
 * Hasil: label eksplisit "Agu 2026", bulan berjalan di ujung kanan, dan
 * setiap nilai tetap menempel pada barisnya sendiri - TIDAK ada rotasi
 * nilai seperti withMonthLabels() yang lama (itu menempelkan label
 * "Okt 2026" ke angka yang sebenarnya milik Oktober tahun lalu).
 *
 * Untuk data yang SUDAH bertanggal (invoice/payables/journal/payroll),
 * pakai bucketByMonth() - hasilnya benar karena diturunkan dari tanggal,
 * bukan dari tebakan.
 */
export function rebindLegacyMonthSeries<T extends { month: string }>(
  rows: T[],
  opts: MonthAxisOptions = {},
): (T & { bln: string; key: string; isCurrent: boolean })[] {
  const axis = monthAxis({ months: rows.length, ...opts });
  const mon = monthsOf(opts.locale ?? "id");
  const pointFor = (name: string, fallback: number): MonthPoint => {
    const target = mon.findIndex((m) => m.toLowerCase() === name.trim().toLowerCase());
    return axis[target >= 0 ? target : fallback] ?? axis[axis.length - 1] as MonthPoint;
  };
  return rows.map((r, i) => {
    const point = pointFor(r.month, i);
    return { ...r, bln: point.label, key: point.key, isCurrent: point.isCurrent };
  });
}

/** Label "Okt 2026" dari key/ISO - dipakai tabel & header laporan. */
export function fmtMonthKey(key: string, locale: Locale = "id"): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(key ?? "").trim());
  if (!m) return String(key ?? "-");
  const mon = monthsOf(locale);
  return `${mon[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "Sep 2025 → Okt 2026" - untuk header grafik rentang bulan. */
export function fmtMonthRange(axis: MonthPoint[]): string {
  if (axis.length === 0) return "-";
  const a = axis[0];
  const b = axis[axis.length - 1];
  if (a.key === b.key) return a.label;
  return `${a.label} → ${b.label}`;
}

/** Daftar tahun yang tersedia pada sebuah koleksi (untuk dropdown tahun). */
export function yearsIn<T>(rows: T[], dateOf: (row: T) => unknown): number[] {
  const out = new Set<number>();
  for (const r of rows) {
    const k = monthKeyOf(dateOf(r));
    if (k === "") continue;
    out.add(Number(k.slice(0, 4)));
  }
  return Array.from(out).sort((a, b) => b - a);
}
