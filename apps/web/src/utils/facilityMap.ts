/* Geometri Peta Fasilitas Drydock.
 *
 * Semua fungsi di sini murni: tidak menyentuh DOM, tidak membaca storage.
 * Compositor React hanya memakai hasilnya untuk menggambar SVG. Alasannya
 * yang paling mungkin salah di bagian ini adalah UKURAN - denominator nol,
 * skala yang berbeda antar-baris, atau "tidak cocok" yang lolos diam-diam -
 * dan semuanya bisa dibuktikan tanpa browser.
 *
 * Aturan gambar:
 * 1. satu px-per-meter untuk SELURUH peta. Kalau tiap baris memakai skalanya
 *    sendiri, drydock 120m dan slipway 80m akan sama panjang di layar, dan
 *    peta justru jadi berbohong.
 * 2. kapal yang tidak muat digambar pada ukuran aslinya (membanjiri keluar
 *    fasilitas) dan facilities-nya diberi outline merah. Batas facilities
 *    tidak boleh diperbesar agar muat - itu membuat masalah hilang.
 * 3. dimensi kapal yang tidak diketahui TIDAK dikarang. Kapal tanpa LOA tetap
 *    tampil namanya tanpa pita, karena pita dengan panjang tebakan lebih buruk
 *    daripada tidak ada pita.
 */

export type FacilityKind = "graving" | "slipway" | "berth";

export interface Facility {
  id: string;
  name: string;
  kind: FacilityKind;
  /** Panjang dalam meter. Dipakai sebagai sumbu panjang. */
  lengthM: number;
  /** Lebar dalam meter. Dipakai sebagai sumbu melintang. */
  widthM: number;
  /** Kedalaman dalam meter; null = tidak ada kedalaman (mis. slipway). */
  depthM: number | null;
}

export interface VesselDim {
  name: string;
  loa: number | null;
  beam: number | null;
  draft: number | null;
}

export type ViolationKind = "loa" | "beam" | "draft";

export interface Violation {
  kind: ViolationKind;
  /** Selisih lebih dalam meter, positif = tidak muat. */
  overBy: number;
  message: string;
}

/** Pecah teks kapasitas lama ("120m / 12m / 6m draft") jadi angka meter. */
export function parseCapacityMeters(capacity: unknown): number[] {
  const out: number[] = [];
  for (const m of String(capacity ?? "").matchAll(/(\d+(?:[.,]\d+)?)\s*m\b/gi)) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/**
 * Fasilitas yang bisa digambar. Fasilitas tanpa panjang yang bisa dibaca
 * TIDAK dikembalikan: peta dengan skala yang tidak bisa ditentukan lebih buruk
 * daripada tidak menampilkan apa-apa.
 */
export function facilityOf(row: {
  id?: unknown;
  name?: unknown;
  capacity?: unknown;
  lengthM?: unknown;
  widthM?: unknown;
  depthM?: unknown;
}): Facility | null {
  const id = String(row.id ?? "").trim();
  if (id === "") return null;

  const nums = parseCapacityMeters(row.capacity);
  const lengthM = Number(row.lengthM) > 0 ? Number(row.lengthM) : (nums[0] ?? 0);
  if (!(lengthM > 0)) return null;

  const widthM = Number(row.widthM) > 0 ? Number(row.widthM) : (nums[1] ?? lengthM / 10);
  const depthRaw = row.depthM === null || row.depthM === undefined || row.depthM === "" ? null : Number(row.depthM);
  const depthM = depthRaw !== null && Number.isFinite(depthRaw) && depthRaw > 0 ? depthRaw : (nums[2] ?? null);

  const name = String(row.name ?? id).trim();
  const kind: FacilityKind = /slipway/i.test(name) ? "slipway" : /berth/i.test(name) ? "berth" : "graving";

  return { id, name, kind, lengthM, widthM, depthM };
}

/** Dimensi kapal; angka yang tidak ada jadi null, bukan 0. */
export function vesselDimOf(row: { name?: unknown; loa?: unknown; beam?: unknown; draft?: unknown }): VesselDim {
  const n = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  return { name: String(row.name ?? "").trim(), loa: n(row.loa), beam: n(row.beam), draft: n(row.draft) };
}

/** Satu skala untuk seluruh peta: piksel per meter. */
export function scaleFor(longestM: number, targetPx: number, maxPxPerM = 24): number {
  if (!(longestM > 0) || !(targetPx > 0)) return 0;
  return Math.min(targetPx / longestM, maxPxPerM);
}

export interface Ribbon {
  /** Panjang pita dalam piksel; boleh lebih panjang dari fasilitas. */
  widthPx: number;
  /** Berapa piksel pita melewati ujung facilities. */
  overflowPx: number;
  /** Dimensi diketahui semua atau tidak. */
  known: boolean;
}

export function ribbonFor(facility: Facility, vessel: VesselDim, scale: number): Ribbon {
  /* `loa <= 0` diperlakukan tidak diketahui, bukan nol meter. Pemanggil yang
     lupa menormalisasi akan dapat pita selebar 0 px yang terlihat seperti
     "kapal ini sangat pendek" - bukan "kita tidak tahu". */
  if (!(scale > 0) || vessel.loa === null || !(vessel.loa > 0)) {
    return { widthPx: 0, overflowPx: 0, known: false };
  }
  const widthPx = vessel.loa * scale;
  return { widthPx, overflowPx: Math.max(0, widthPx - facility.lengthM * scale), known: true };
}

/** Kenapa kapal tidak muat di fasilitas ini. Kosong = muat. */
export function violations(facility: Facility, vessel: VesselDim): Violation[] {
  const out: Violation[] = [];
  const round = (n: number): number => Math.round(n * 10) / 10;

  if (vessel.loa !== null && vessel.loa > facility.lengthM) {
    out.push({
      kind: "loa",
      overBy: round(vessel.loa - facility.lengthM),
      message: `Panjang kapal ${vessel.loa} m melebihi ${facility.name} ${facility.lengthM} m (selisih ${round(vessel.loa - facility.lengthM)} m)`,
    });
  }
  if (vessel.beam !== null && facility.widthM > 0 && vessel.beam > facility.widthM) {
    out.push({
      kind: "beam",
      overBy: round(vessel.beam - facility.widthM),
      message: `Lebar kapal ${vessel.beam} m melebihi lebar fasilitas ${facility.widthM} m (selisih ${round(vessel.beam - facility.widthM)} m)`,
    });
  }
  if (vessel.draft !== null && facility.depthM !== null && vessel.draft > facility.depthM) {
    out.push({
      kind: "draft",
      overBy: round(vessel.draft - facility.depthM),
      message: `Draft kapal ${vessel.draft} m melebihi kedalaman ${facility.depthM} m (selisih ${round(vessel.draft - facility.depthM)} m)`,
    });
  }
  return out;
}

/**
 * Panjang "bulat" untuk skala: 1, 2, atau 5 x 10^n yang paling pas untuk
 * lebar target dalam piksel. Tanpa ini, skalanya bisa jadi 37,4 m dan
 * angka di bawah peta tidak berarti apa-apa.
 */
export function niceScaleDistance(targetPx: number, scale: number): number {
  if (!(targetPx > 0) || !(scale > 0)) return 0;
  const raw = targetPx / scale;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return step * pow;
}
