/* Tarif pasar acuan untuk galangan Samarinda.
 *
 * Dua hal sengaja dipisah di file ini, karena mencampur keduanya adalah
 * penyebab utama angka terasa melonjak sendiri tanpa bisa dijelaskan:
 *
 * 1. RISET - nilai yang ada sumbernya, ditulis lengkap dengan sumber dan
 *    tanggal berlakunya.
 * 2. ASUMSI - pengali, jumlah hari kerja, dan beban. Ini keputusan bisnis,
 *    bukan hasil riset, dan tidak boleh disalin jadi angka jadi di seed.
 *
 * Aturan main: kalau sebuah angka di seed tidak bisa ditunjuk ke salah satu
 * baris di file ini, angka itu belum bertanggal dan belum bisa diaudit.
 */

export interface MarketRate {
  /** Nilai dalam satuan pembulatan yang disebutkan pada `unit`. */
  readonly value: number;
  readonly unit: string;
  /** Sumber yang bisa dicari ulang oleh pembaca lain. */
  readonly source: string;
  /** Tanggal mulai berlaku, ISO. */
  readonly effective: string;
  readonly note?: string;
}

/* ----------------------------- RISET ----------------------------- */

/** Bio Solar Industri B40 non-subsidy, Wilayah 2 = Kalimantan. */
export const SOLAR_INDUSTRI_B40: MarketRate = {
  value: 18_950,
  unit: "Rp/liter",
  source: "Pertamina, Bio Solar Industri B40, Wilayah 2 (Kalimantan), periode 01-14 September 2026",
  effective: "2026-09-01",
  note:
    "Naik Rp 750 dari periode Agustus (Rp 18.200). Biodiesel B50 sudah wajib sejak 1 Juli 2026 " +
    "dan harga B50 dipatok setara B40, jadi angka ini masih relevan.",
};

/** Marine Fuel Oil - bahan bakar kapal, bukan alat berat di dock. */
export const MFO_LOW_SULPHUR: MarketRate = {
  value: 18_900,
  unit: "Rp/liter",
  source: "Pertamina, Marine Fuel Oil Low Sulphur, periode April 2026",
  effective: "2026-04-01",
  note: "Pembanding saat mengisi tangki bunker kapal, bukan untuk alat workshop.",
};

/** Upah Minimum Provinsi Kalimantan Timur 2026. */
export const UMP_KALIMANTAN_TIMUR: MarketRate = {
  value: 3_680_000,
  unit: "Rp/bulan",
  source: "UMP Provinsi Kalimantan Timur 2026, ditetapkan gubernur",
  effective: "2026-01-01",
  note: "Dasar semua tarif tenaga kerja di bawah; ditayang ulang tiap tahun.",
};

/* ---------------------------- ASUMSI ----------------------------- */

/**
 * Hari kerja efektif per bulan. 22, bukan 30: upah bulanan dibayar untuk
 * hari kerja, dan angka 30 membuat tarif harian terlihat murah 26%.
 */
export const WORK_DAYS_PER_MONTH = 22;

/**
 * Pengali keterampilan di atas upah minimum. ASUMSI, bukan riset: kalau
 * tarif weld maritim naik, angka di sini yang dinaikkan, bukan UMP.
 */
export const SKILL_MULTIPLIER = {
  welder: 2.4,
  fitter: 2.1,
  painter: 1.8,
  helper: 1.2,
  supervisor: 2.6,
} as const;

/**
 * Beban miscellaneous di atas upah: BPJS, THR/12, pengawas, tools, PPE.
 * Pengali total = 1 + angka ini.
 */
export const LABOR_BURDEN = 0.55;

export type SkillRole = keyof typeof SKILL_MULTIPLIER;

/** Upah minimum harian bruto, sebelum pengali keterampilan dan beban. */
export function minimumDailyWage(): number {
  return Math.round(UMP_KALIMANTAN_TIMUR.value / WORK_DAYS_PER_MONTH);
}

/**
 * Biaya tenaga per hari kerja untuk satu peran, sudah termasuk beban.
 * Angka ini BIAYA (HPP), bukan tarif yang ditagih ke client.
 */
export function loadedLaborRatePerDay(role: SkillRole): number {
  const wage = minimumDailyWage() * SKILL_MULTIPLIER[role];
  return Math.round(wage * (1 + LABOR_BURDEN));
}

/**
 * Tarif yang ditawarkan ke client. Dipisah dari `loadedLaborRatePerDay`
 * supaya margin tidak pernah ikut terbenam di dalam angka biaya.
 */
export const CLIENT_MARKUP = 1.6;

export function billedLaborRatePerDay(role: SkillRole): number {
  return Math.round(loadedLaborRatePerDay(role) * CLIENT_MARKUP);
}

/** Harga BBM per liter untuk alat berat di dock dan workshop. */
export function fuelPricePerLiter(): number {
  return SOLAR_INDUSTRI_B40.value;
}
