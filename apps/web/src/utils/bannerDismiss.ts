/* Status "tutup banner" - SESSION ONLY, tidak seperti badge notifikasi.
 *
 * Bedanya disengaja dan penting:
 * - badge sidebar (utils/notifRead) di localStorage: "sudah pernah saya lihat"
 *   harus bertahan setelah browser ditutup, kalau tidak badge muncul lagi
 *   setiap login dan tidak pernah hilang.
 * - tutup banner di sessionStorage: menutup banner adalah keputusan untuk SESI
 *   INI. Kalau disimpan permanen, alert yang belum ditangani akan hilang
 *   diam-diam dan orang mengira sudah ditangani.
 *
 * Sifatnya per modul DAN per tingkat severity, bukan satu sakelar untuk
 * seluruh banner. Kalau satu sakelar, menutup `info` yang panjang ikut
 * menyembunyikan `kritis` - persis kebalikan dari tujuan F1, yaitu membuat
 * yang penting terlihat.
 *
 * Fungsi di bawah murni (tidak menyentuh storage) supaya bisa diuji tanpa
 * browser; AlertBanner.tsx yang membungkusnya dengan sessionStorage.
 */
import type { AlertLevel, ModuleAlertItem } from "./moduleAlerts";

export const BANNER_DISMISS_KEY = "isms.bannerDismiss";

/** moduleKey -> level yang ditutup di sesi ini. */
export type DismissMap = Record<string, AlertLevel[]>;

const LEVELS: readonly AlertLevel[] = ["kritis", "perhatian", "info"];

const isLevel = (v: unknown): v is AlertLevel =>
  typeof v === "string" && (LEVELS as readonly string[]).includes(v);

/** String rusak harus jadi "tidak ada yang ditutup", bukan crash seluruh app. */
export function parseDismissed(raw: string | null | undefined): DismissMap {
  if (raw === null || raw === undefined || raw === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DismissMap = {};
    for (const [mod, levels] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(levels)) continue;
      const clean = levels.filter(isLevel);
      /* Level yang tidak dikenal dibuang: kalau nanti daftar level berubah,
         data lama tidak boleh membuat banner crash atau tidak terfilter. */
      if (clean.length > 0) out[mod] = [...new Set(clean)];
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeDismissed(map: DismissMap): string {
  const clean: DismissMap = {};
  for (const [mod, levels] of Object.entries(map)) {
    const kept = levels.filter(isLevel);
    if (kept.length > 0) clean[mod] = [...new Set(kept)];
  }
  return JSON.stringify(clean);
}

export function dismissedFor(map: DismissMap, moduleKey: string): AlertLevel[] {
  return map[moduleKey] ?? [];
}

/** Tutup satu level. Idempoten, dan level lain tidak tersentuh. */
export function dismissLevel(map: DismissMap, moduleKey: string, level: AlertLevel): DismissMap {
  const cur = dismissedFor(map, moduleKey);
  if (cur.includes(level)) return map;
  return { ...map, [moduleKey]: [...cur, level] };
}

/** Kembalikan satu level yang tadi ditutup. */
export function restoreLevel(map: DismissMap, moduleKey: string, level: AlertLevel): DismissMap {
  const cur = dismissedFor(map, moduleKey);
  if (!cur.includes(level)) return map;
  const next = cur.filter((l) => l !== level);
  const out = { ...map };
  if (next.length === 0) delete out[moduleKey];
  else out[moduleKey] = next;
  return out;
}

/** Buka semua level yang ditutup di modul ini. */
export function restoreAll(map: DismissMap, moduleKey: string): DismissMap {
  if (!(moduleKey in map)) return map;
  const out = { ...map };
  delete out[moduleKey];
  return out;
}

/** Item yang masih terlihat setelah level ditutup. */
export function visibleItems(items: ModuleAlertItem[], dismissed: AlertLevel[]): ModuleAlertItem[] {
  if (dismissed.length === 0) return items;
  const hidden = new Set(dismissed);
  return items.filter((i) => !hidden.has(i.level));
}

/** Berapa item yang tersembunyi karena level ditutup. */
export function hiddenCount(items: ModuleAlertItem[], dismissed: AlertLevel[]): number {
  return items.length - visibleItems(items, dismissed).length;
}
