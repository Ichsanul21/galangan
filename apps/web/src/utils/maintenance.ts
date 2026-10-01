// Siklus hidup maintenance equipment - satu baris `maintenances` = satu siklus.
//
// Kenapa koleksi baru (bukan lagi field di equipment):
//   Dulu jadwal + hasil servis dijejalkan ke equipment.{scheduledService,
//   lastServiceMaterials, maintenanceNote, maintenanceEta}. Akibatnya:
//   - hanya satu siklus yang bisa diingat per equipment (riwayat hilang),
//   - "ubah/hapus hasil servis" berarti menimpa equipment.lastServiceMaterials
//     tanpa bisa mengembalikan stok yang sudah terpotong,
//   - tidak ada status berurutan, jadi tidak bisa tahu pekerjaan sedang jalan.
// Sekarang: satu baris per siklus, status berurutan, materials[] snapshot.

import type { StoreItem } from "../data/store";

/** Status siklus, sesuai urutan proses. */
export const MAINT_STATUS = ["Terjadwal", "Sedang Proses", "Selesai", "Dibatalkan"] as const;
export type MaintStatus = (typeof MAINT_STATUS)[number];

/** Jenis pekerjaan. */
export const MAINT_JENIS = ["Preventif", "Korektif", "Overhaul", "Kalibrasi", "Inspeksi"] as const;
export type MaintJenis = (typeof MAINT_JENIS)[number];

export const MAINT_STATUS_TONE: Record<MaintStatus, "gray" | "blue" | "green" | "red"> = {
  Terjadwal: "gray",
  "Sedang Proses": "blue",
  Selesai: "green",
  Dibatalkan: "red",
};

export function isMaintStatus(v: unknown): v is MaintStatus {
  return typeof v === "string" && (MAINT_STATUS as readonly string[]).includes(v);
}

export function statusOf(m: Partial<StoreItem>): MaintStatus {
  const s = String(m.status ?? "");
  return isMaintStatus(s) ? s : "Terjadwal";
}

/**
 * Transisi status yang SAH dari status sekarang.
 * Maju satu langkah; "Dibatalkan" boleh dari mana saja kecuali sudah Selesai.
 * Selesai TIDAK bisa dibatalkan dari sini (pemakai harus pakai cancelTo
 * di UI yang juga mengembalikan stok) - lihat canTransition.
 */
export function nextStatuses(from: MaintStatus): MaintStatus[] {
  if (from === "Dibatalkan") return [];
  if (from === "Selesai") return [];
  if (from === "Terjadwal") return ["Sedang Proses", "Dibatalkan"];
  return ["Selesai", "Dibatalkan"];
}

export function canTransition(from: MaintStatus, to: MaintStatus): boolean {
  return nextStatuses(from).includes(to);
}

/** Label untuk audit trail satu baris perubahan status. */
export interface MaintHistoryEntry {
  at: string;
  from: string;
  to: string;
  by: string;
  note?: string;
}

export function historyOf(m: Partial<StoreItem>): MaintHistoryEntry[] {
  const raw = m.history;
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .filter((h) => h && typeof h === "object")
    .map((h) => ({
      at: String(h.at ?? ""),
      from: String(h.from ?? "-"),
      to: String(h.to ?? ""),
      by: String(h.by ?? ""),
      note: h.note === undefined || h.note === null ? "" : String(h.note),
    }));
}

/* ============================================================
   MATERIAL SNAPSHOT
   ============================================================ */

export interface MaintMaterial {
  /** id baris inventory; "" untuk material bebas (tanpa stok). */
  itemId: string;
  name: string;
  qty: number;
  unit: string;
  /** biaya satuan saat servis terjadi (snapshot - bukan harga terkini). */
  cost: number;
}

/**
 * materials[] sudah di-normalisasi saat baris dibuat, tapi baris lama bisa
 * belum punya kolom ini. Baca defensif: qty/cost dibuang bila bukan angka,
 * itemId kosong Means material bebas (tidak memotong stok).
 */
export function materialsOf(m: Partial<StoreItem>): MaintMaterial[] {
  const raw = m.materials;
  if (!Array.isArray(raw)) return [];
  const out: MaintMaterial[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const qty = Number(r.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const cost = Number(r.cost);
    out.push({
      itemId: String(r.itemId ?? ""),
      name: String(r.name ?? ""),
      qty,
      unit: String(r.unit ?? ""),
      cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    });
  }
  return out;
}

/** Material yang benar-benar memotong stok ( punya itemId valid ). */
export function stockMaterials(m: Partial<StoreItem>): MaintMaterial[] {
  return materialsOf(m).filter((r) => r.itemId !== "");
}

export function materialsCost(materials: MaintMaterial[]): number {
  return Math.round(materials.reduce((s, r) => s + r.qty * r.cost, 0));
}

/* ============================================================
   BIAYA
   ============================================================ */

export interface MaintCostBreakdown {
  /** Σ qty × cost dari materials[]. */
  material: number;
  /** Tarif harian teknisi × durasi hari (0 bila belum diisi). */
  labor: number;
  /** Sewa equipment lain sepadan bila ada (bisa 0). */
  other: number;
  total: number;
}

/**
 * Hitung rincian biaya servis.
 * Tarif teknisi & tarif equipment lain diambil dari argumen (memallow caller
 * memakai nilai yang sudah di-resolve dari equipment/proyek), bukan dari
 * settings, supaya satu siklus tidak berubah nilainya saat tarif global berubah.
 */
export function costBreakdown(
  m: Partial<StoreItem>,
  opts: { laborRatePerDay?: number; otherCost?: number } = {},
): MaintCostBreakdown {
  const material = materialsCost(materialsOf(m));
  const rate = Number(opts.laborRatePerDay ?? 0);
  const days = workDaysOf(m);
  const labor = Number.isFinite(rate) && rate > 0 && days > 0 ? Math.round(rate * days) : 0;
  const other = Number.isFinite(Number(opts.otherCost)) ? Math.max(0, Math.round(Number(opts.otherCost))) : 0;
  const total = material + labor + other;
  return { material, labor, other, total };
}

/** Durasi kerja inklusif (mulai..selesai). 0 bila belum mulai / belum selesai. */
export function workDaysOf(m: Partial<StoreItem>): number {
  const from = String(m.mulai ?? "").trim();
  const to = String(m.selesai ?? "").trim();
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/* ============================================================
   PENGECILAN STOK
   ============================================================ */

export interface StockPlanItem {
  itemId: string;
  name: string;
  qty: number;
  unit: string;
  /** stok saat ini di inventory. */
  available: number;
  /** true bila qty melebihi stok (harus ditolak sebelum write). */
  short: boolean;
}

/**
 * Rencanakan pemotongan stok untuk materials[]. Dibaca sebelum writes apa pun
 * supaya validasi bisa menolak SELURUH siklus bila ada material kurang,
 * bukan memotong separuh lalu gagal (stok jadi tidak sinkron dengan movements).
 */
export function planStockCut(m: Partial<StoreItem>, inventory: StoreItem[]): StockPlanItem[] {
  const byId = new Map<string, StoreItem>();
  for (const i of inventory) byId.set(String(i.id), i);
  const out: StockPlanItem[] = [];
  //materials bisa memotong item yang sama dua kali (mis. dua roll kawat).
  const claimed = new Map<string, number>();
  for (const r of materialsOf(m)) {
    if (r.itemId === "") continue;
    const it = byId.get(r.itemId);
    const available = Number(it?.stock ?? 0);
    const already = claimed.get(r.itemId) ?? 0;
    out.push({
      itemId: r.itemId,
      name: r.name || String(it?.name ?? r.itemId),
      qty: r.qty,
      unit: r.unit || String(it?.unit ?? ""),
      available,
      short: already + r.qty > available,
    });
    claimed.set(r.itemId, already + r.qty);
  }
  return out;
}

export function planShortages(plan: StockPlanItem[]): StockPlanItem[] {
  return plan.filter((p) => p.short);
}

/**
 * Pengembalian stok saat satu siklus dibatalkan / dihapus setelah stok
 * terpotong. Stok bertambah KEMBALI; movements dicatat sebagai Retur agar
 * nilai inventori tetap bisa ditelusuri.
 *
 * onlyIfDeducted: baris yang statusnya pernah "Selesai" (atau yang punya
 * flag deducted=true) sudah memotong stok. Memanggilnya dua kali akan
 * menggandakan stok - jadi pemanggil WAJIB mengunci lewat flag ini.
 */
export function canRestoreStock(m: Partial<StoreItem>): boolean {
  return m.deducted === true || m.deducted === "true";
}

export function markDeducted(m: Partial<StoreItem>): boolean {
  return !canRestoreStock(m);
}
