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

/** Tarif listrik PLN golongan industri/daya besar (paket I-3), Jawa-Bali+Kaltim. */
export const TARIF_LISTRIK_KWH: MarketRate = {
  value: 1_445,
  unit: "Rp/kWh",
  source: "PLN, Penyesuaian Tarif Tenaga Listrik Golongan I-3 (Industri), 2026",
  effective: "2026-01-01",
  note: "Dasar beban listrik dock/workshop. Nilai seed 1.650 sudah mendekati; pakai 1.445 bila mau angka tariff resmi.",
};

/** Air industri PDAM / sumur bor untuk sandblasting & fire main. */
export const TARIF_AIR_M3: MarketRate = {
  value: 15_000,
  unit: "Rp/m³",
  source: "Rata-rata tarif air industri PDAM Kaltim 2026 (golongan niaga/besar)",
  effective: "2026-01-01",
  note: "Sudah sesuai seed; dipertahankan sebagai baseline yang bisa diaudit.",
};

/** Sewa harian alat berat galangan (rental market Samarinda/Balikpapan). */
export const SEWA_ALAT: Record<string, MarketRate> = {
  crane50T: {
    value: 1_200_000,
    unit: "Rp/hari",
    source: "Rental market crane 50T Kalimantan Timur 2026 (survei internal galangan + penawaran vendor)",
    effective: "2026-01-01",
    note: "Gantry/stationary crane 50 ton, operator belum termasuk.",
  },
  crane100T: {
    value: 2_500_000,
    unit: "Rp/hari",
    source: "Rental market mobile crane 100T Kaltim 2026",
    effective: "2026-01-01",
    note: "All-terrain/mobile crane 100T, termasuk mobilisasi dalam kota.",
  },
  forklift10T: {
    value: 350_000,
    unit: "Rp/hari",
    source: "Rental market forklift 10T Kaltim 2026",
    effective: "2026-01-01",
  },
};

/** Tarif dock/slipway harian (dock dues + utilities), galangan Kaltim. */
export const TARIF_DOCK: Record<string, MarketRate> = {
  graving: {
    value: 28_000_000,
    unit: "Rp/hari",
    source: "Tarif dok kering (graving) tugboat 50-70m, galangan Kaltim 2026",
    effective: "2026-01-01",
    note: "Termasuk listrik & air dasar; biaya blasting/coating terpisah.",
  },
  berth: {
    value: 9_500_000,
    unit: "Rp/hari",
    source: "Tarif dermaga (berth) untuk kapal kerja/auxiliary, Kaltim 2026",
    effective: "2026-01-01",
  },
  slipway: {
    value: 12_000_000,
    unit: "Rp/hari",
    source: "Tarif slipway unit kecil-menengah, Kaltim 2026",
    effective: "2026-01-01",
  },
};

/** Harga baja plat SHIP / kapal (spot, Samarinda). */
export const HARGA_BAJA_PLAT: MarketRate = {
  value: 12_000_000,
  unit: "Rp/ton",
  source: "Harga spot plat baja shipbuilding Kaltim 2026 (survei vendor + kuotasi)",
  effective: "2026-06-01",
  note: "Pembanding seed inventory PLAT; harga closing PO bisa beda.",
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

/** Tarif listrik industri (Rp/kWh) - dipakai settings TARIF_LISTRIK_KWH. */
export function tarifListrikPerKwh(): number {
  return TARIF_LISTRIK_KWH.value;
}

/** Tarif air industri (Rp/m³). */
export function tarifAirPerM3(): number {
  return TARIF_AIR_M3.value;
}
