// Konstanta bisnis terpusat — baca dari koleksi settings (halaman Pengaturan).
// Semua rumus WAJIB pakai helper ini, bukan angka literal.

import type { StoreShape, StoreItem } from "../data/store";

export function getSetting(data: StoreShape, key: string, fallback: number): number {
  const row = (data.settings ?? []).find((s: StoreItem) => s.key === key);
  const v = Number(row?.value);
  return Number.isFinite(v) ? v : fallback;
}

export function settingLabel(data: StoreShape, key: string): string {
  return String((data.settings ?? []).find((s: StoreItem) => s.key === key)?.label ?? key);
}
