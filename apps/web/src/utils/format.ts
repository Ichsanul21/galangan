// Sistem format tunggal - semua tampilan tanggal/angka/uah lewat sini.
// Data mentah tetap ISO (YYYY-MM-DD / YYYY-MM / "-"), UI selalu lokal id-ID.

import { ID_MON } from "./monthAxis";

const BULAN = ID_MON;

function parseISO(v: string | null | undefined): { y: string; m: string; d: string } | null {
  if (!v || v === "-") return null;
  const m = String(v).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return null;
  return { y: m[1], m: m[2], d: m[3] ?? "" };
}

/** "2026-08-01" → "1 Agu 2026" · "2026-08" → "Agu 2026" · "-" → "-" */
export function fmtTanggal(v: string | null | undefined): string {
  const p = parseISO(v);
  if (!p) return "-";
  const mi = Number(p.m) - 1;
  const bulan = BULAN[mi] ?? p.m;
  if (!p.d) return `${bulan} ${p.y}`;
  return `${Number(p.d)} ${bulan} ${p.y}`;
}

/** "2026-08-01" → "Agu 2026" */
export function fmtBulan(v: string | null | undefined): string {
  const p = parseISO(v);
  if (!p) return "-";
  return `${BULAN[Number(p.m) - 1] ?? p.m} ${p.y}`;
}

/** "2026-08-01" → "2026-08-31" jadi "1 → 31 Agu 2026", beda bulan/tahun ditulis penuh */
export function fmtRentang(a: string | null | undefined, b: string | null | undefined): string {
  const pa = parseISO(a);
  const pb = parseISO(b);
  if (!pa && !pb) return "-";
  if (!pa) return fmtTanggal(b);
  if (!pb) return `${fmtTanggal(a)} → …`;
  if (pa.y === pb.y && pa.m === pb.m && pa.d && pb.d) {
    return `${Number(pa.d)} → ${Number(pb.d)} ${BULAN[Number(pa.m) - 1]} ${pa.y}`;
  }
  return `${fmtTanggal(a)} → ${fmtTanggal(b)}`;
}

export function fmtRupiah(n: number): string {
  const v = parseIdNumber(n);
  if (!Number.isFinite(v)) return "Rp 0";
  return "Rp " + Math.round(v).toLocaleString("id-ID");
}

/**
 * Parser angka aman untuk seluruh app (id-ID).
 *
 * Menangani:
 * - number mentah          → dipertahankan
 * - "1000000" / "1.000.000" / "1,000,000" / "Rp 1.000.000" → 1000000
 * - "" / null / undefined / NaN → 0
 *
 * Kenapa penting: MoneyInput dan sebagian data server/import menyimpan
 * STRING berformat titik. `Number("1.000.000")` = NaN di JS, lalu
 * `fmtMiliar(NaN)` membalas "Rp 0 M" - itulah gejala "angka hilang /
 * jadi nol" yang tidak pernah error di console.
 */
export function parseIdNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (s === "" || s === "-" || s.toLowerCase() === "nan") return 0;
  // Buang prefiks non-angka (Rp, satuan) lalu sisakan digit, tanda minus, titik/koma.
  let t = s.replace(/[^\d.,-]/g, "");
  if (t === "" || t === "-" || t === "." || t === ",") return 0;
  // Negatif: "-" di depan saja.
  const neg = t.startsWith("-");
  if (neg) t = t.slice(1);
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  // Pemisah ribuan = titik (id-ID). "1.000.000" → 1000000.
  // "1,000,000" (en import) → 1000000.
  // "1.5" / "1,5" (desimal) → 1.5 (hanya bila pemisah terakhir + ≤3 digit di kanan
  // DAN tidak ada pemisah ribuan lain sebelumnya dengan pola 3-digit).
  if (lastDot >= 0 && lastComma >= 0) {
    // Keduanya ada: pemisah yang LEBIH BELAKANG adalah desimal.
    if (lastDot > lastComma) {
      t = t.replace(/,/g, "");
    } else {
      t = t.replace(/\./g, "").replace(",", ".");
    }
  } else if (lastDot >= 0) {
    const right = t.length - lastDot - 1;
    const groups = t.slice(0, lastDot).split(".").filter(Boolean);
    // Pola ribuan: semua grup kiri 1–3 digit, dan ada ≥1 grup (mis. 1.000 / 1.000.000)
    const thousandLike = right === 3 && groups.length >= 1 && groups.every((g) => g.length >= 1 && g.length <= 3) && (groups.length > 1 || /^[1-9]\d{0,2}$/.test(groups[0] ?? ""));
    // "1.000" = 1000 (id). "1.50" / "0.75" = desimal (bukan ribuan).
    if (thousandLike && groups.length >= 1 && (groups.length > 1 || right === 3)) {
      // Satu grup + 3 digit kanan: "1.000" → 1000 (id-ID). "12.34" tetap desimal.
      if (groups.length > 1 || right === 3) {
        t = t.replace(/\./g, "");
      }
    }
  } else if (lastComma >= 0) {
    const right = t.length - lastComma - 1;
    const groups = t.slice(0, lastComma).split(",").filter(Boolean);
    const thousandLike = right === 3 && groups.length >= 1 && groups.every((g) => g.length >= 1 && g.length <= 3);
    if (thousandLike && (groups.length > 1 || right === 3)) {
      t = t.replace(/,/g, "");
    } else {
      t = t.replace(/,/g, ".");
    }
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

/** Parser pembalik fmtRupiah: "1.000.000" → 1000000. */
export function parseRupiah(input: string): number {
  return parseIdNumber(input);
}

export function fmtMiliar(n: number): string {
  const v = parseIdNumber(n);
  if (!Number.isFinite(v)) return "Rp 0 M";
  return "Rp " + (v / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
}

export function fmtJumlah(n: number): string {
  const v = parseIdNumber(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("id-ID");
}

export function fmtPersen(n: number): string {
  const v = parseIdNumber(n);
  if (!Number.isFinite(v)) return "0%";
  return v.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Timestamp penuh ISO-8601 dengan milidetik. Dipakai untuk `createdAt`/
 * `updatedAt`: urutan leksikografis sama dengan urutan waktu, jadi `sortRows`
 * bisa mengurutkannya tanpa parsing. `todayISO()` hanya tanggal, tidak bisa
 * membedakan dua edit di hari yang sama.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

export function monthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Kamus satuan baku seluruh aplikasi */
export const SATUAN = ["pcs", "unit", "set", "ton", "kg", "m", "m²", "m³", "liter", "meter", "batang", "roll", "package", "jam", "service"] as const;

/** Label Indonesia untuk status yang disimpan dalam EN di data */
export const STATUS_BOQ_ID: Record<string, string> = {
  Draft: "Draf",
  Pending: "Menunggu",
  Approved: "Disetujui",
  Completed: "Selesai",
  Rejected: "Ditolak",
};

export const STATUS_SVC_ID: Record<string, string> = {
  Scheduled: "Dijadwalkan",
  "In Progress": "Sedang",
  Done: "Selesai",
};
