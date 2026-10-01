// Relasi gudang ↔ inventory ↔ pergerakan.
// Satu-satunya tempat yang tahu bentuk baris gudang dan cara mengaitkan
// inventory.warehouse (NAMA, bukan id) ke baris warehouses.name.
//
// Kenapa bukan id: korpus seed ±19k baris movements + ±400 item inventory
// semuanya menyimpan NAMA gudang di field `warehouse`. Mengganti ke id berarti
// menulis ulang korpus itu (atau menambah kolom migrasi terpisah yang justru
// bisa tidak sinkron dengan nama). Jadi relasi dijaga lewat nama, dan unik
// nama ditegakkan di backend (checkNameUnique di services/api/routes/crud.ts).
//
// sourcesettings.WAREHOUSE_CAP (JSON lama) tetap dibaca sebagai fallback
// untuk gudang yang belum punya baris di koleksi `warehouses` - jadi
// instalasi lama yang belum pernah mengetik_capacity di UI tidak kehilangan
// progress bar kapasitasnya.

import type { StoreItem } from "../data/store";
import { sameName } from "./names";

/** Bentuk baris `warehouses`. Semua field opsional kecuali name. */
export interface Warehouse {
  id: string;
  name: string;
  /** JenisSimon: "Baja & Struktur" | "Kelistrikan" | ... (bebas teks). */
  type?: string;
  /** Kapasitas dalam satuan penyimpan (angka kasar - satuan dicampur). */
  capacity?: number;
  lokasi?: string;
  pic?: string;
  aktif?: boolean;
  branch?: string;
}

export const WAREHOUSE_TYPES = [
  "Baja & Struktur",
  "Pipa & Fitting",
  "Rigging & Wire",
  "Kelistrikan",
  "Sparepart Mesin",
  "Consumable & Cat",
  "Lainnya",
] as const;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function parseLegacyCap(settings: StoreItem[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const row = (settings ?? []).find((s) => String(s.key ?? "") === "WAREHOUSE_CAP");
  const raw = String(row?.value ?? "").trim();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = num(v);
      if (n > 0) out[k] = n;
    }
  } catch {
    // JSON rusak - abaikan, koleksi warehouses yang jadi sumber utama
  }
  return out;
}

export function warehouseName(w: StoreItem | Warehouse): string {
  return String(w?.name ?? "").trim();
}

export function warehouseActive(w: StoreItem | Warehouse): boolean {
  // `aktif` undefined = aktif (baris lama / seed tidak selalu mengisinya).
  return w?.aktif === undefined || w?.aktif === null || w.aktif === true || w.aktif === "true";
}

/**
 * Kapasitas sebuah gudang.
 * Urutan: baris `warehouses` → fallback settings.WAREHOUSE_CAP → 0 (tak terbatas).
 */
export function capacityOf(
  name: string,
  warehouses: (StoreItem | Warehouse)[],
  settings?: StoreItem[],
): number {
  const row = warehouses.find((w) => sameName(w?.name, name));
  if (row) {
    const c = num(row.capacity);
    if (c > 0) return c;
    // Baris ada tapi kapasitas 0/ kosong: jangan jatuh ke JSON lama, sebab
  /** Jenis gudang: "Baja & Struktur" | "Kelistrikan" | ... (bebas teks). */
    return 0;
  }
  const legacy = parseLegacyCap(settings);
  for (const [k, v] of Object.entries(legacy)) {
    if (sameName(k, name)) return v;
  }
  return 0;
}

/** Semua nama gudang yang punya baris, urut stabil (aktif dulu). */
export function warehouseNames(warehouses: (StoreItem | Warehouse)[]): string[] {
  return warehouses
    .map(warehouseName)
    .filter((n) => n !== "")
    .sort((a, b) => {
      const aw = warehouses.find((w) => warehouseName(w) === a);
      const bw = warehouses.find((w) => warehouseName(w) === b);
      const aa = aw && warehouseActive(aw) ? 0 : 1;
      const ba = bw && warehouseActive(bw) ? 0 : 1;
      return aa - ba || a.localeCompare(b, "id");
    });
}

/** Nama gudang yang benar-benar dipakai inventory (untuk tab Stok per Gudang). */
export function usedWarehouseNames(inventory: StoreItem[]): string[] {
  const seen = new Set<string>();
  for (const i of inventory) {
    const w = String(i.warehouse ?? "").trim();
    if (w !== "") seen.add(w);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, "id"));
}

/** Gabung daftar gudang terdaftar + yang hanya muncul di inventory, unik. */
export function allWarehouseNames(
  warehouses: (StoreItem | Warehouse)[],
  inventory: StoreItem[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of [...warehouseNames(warehouses), ...usedWarehouseNames(inventory)]) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export interface WarehouseStock {
  name: string;
  row?: StoreItem;
  items: StoreItem[];
  /** Σ stock (satuan dicampur - lihat catatan di capacityOf). */
  used: number;
  capacity: number;
  /** 0..100, atau null bila kapasitas tidak ditentukan (tak terbatas). */
  pct: number | null;
  tone: "navy" | "amber" | "red";
  /** true saat exceeds kapasitas. */
  over: boolean;
}

/** Ringkasan stok per gudang - sumber tunggal tab "Stok per Gudang". */
export function warehouseStockRows(
  warehouses: (StoreItem | Warehouse)[],
  inventory: StoreItem[],
  settings?: StoreItem[],
): WarehouseStock[] {
  return allWarehouseNames(warehouses, inventory).map((name) => {
    const items = inventory.filter((i) => sameName(i.warehouse, name));
    const used = items.reduce((s, i) => s + num(i.stock), 0);
    const capacity = capacityOf(name, warehouses, settings);
    const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : null;
    const over = capacity > 0 && used > capacity;
    return {
      name,
      row: warehouses.find((w) => sameName(w?.name, name)),
      items,
      used,
      capacity,
      pct,
      over,
      tone: over || (pct !== null && pct >= 90) ? "red" : pct !== null && pct >= 70 ? "amber" : "navy",
    };
  });
}

/* ============================================================
   RELASI PERGERAKAN: Dari Gudang / Ke Gudang
   ============================================================ */

export interface MovementWarehouseFlow {
  /** Gudang asal. Untuk Barang Masuk: "Supplier: X". Null = tidak berlaku. */
  from: string;
  /** Gudang tujuan. Untuk Barang Keluar: "Proyek Y" / "Pemakaian Z". Null. */
  to: string;
  /** true = mutasi internal (transfer antar gudang milik sendiri). */
  internal: boolean;
  /** Golongan transaksi untuk badge. */
  kind: "in" | "out" | "move" | "adjust";
}

const IN_TYPES = new Set(["Penerimaan", "Barang Masuk", "Retur", "Retur Vendor", "Penerimaan Retur"]);
const OUT_TYPES = new Set(["Pengeluaran", "Barang Keluar"]);
const MOVE_TYPES = new Set(["Transfer", "Mutasi Gudang"]);
const ADJUST_TYPES = new Set(["Selisih Opname", "Opname", "Adjustment"]);

/**
 * Pecah satu baris movements menjadi dua endpoint gudang yang terpisah.
 *
 * Kontrak bentuk data (lihat juga pages/inventori/Inventory.tsx):
 *  - `type`       : Penerimaan | Pengeluaran | Transfer | Retur | Selisih Opname
 *  - `fromWh`     : nama gudang asal      (opsional - hasil transfer/seed)
 *  - `toWh`       : nama gudang tujuan    (opsional)
 *  - `by`         : nomor referensi. Untuk TIPE LAMA transfer dipisah " → ":
 *                   "Gudang Baja A → Gudang B" (lihat seed lama).
 *  - `supplier`   : vendor pada Barang Masuk
 *  - `purpose`    : tujuan pakai / proyek pada Barang Keluar
 *  - `keterangan` : catatan bebas (pakai sebagai fallback tujuan)
 *
 * Pembacaan defensif: baris lama hanya punya sebagian field, jadi setiap
 * sumber dicoba berurutan; hasil pertama yang tidak kosong dipakai.
 */
export function movementFlow(m: StoreItem): MovementWarehouseFlow {
  const type = String(m.type ?? "");
  const fromRaw = String(m.fromWh ?? "").trim();
  const toRaw = String(m.toWh ?? "").trim();

  if (MOVE_TYPES.has(type)) {
    // Transfer lama: "A → B" di field `by`. Bandingkan longgar agar "A -> B"
    // dan "A → B" sama-sama terbaca.
    const arrow = String(m.by ?? "").split(/\s*(?:→|->|⇒|–>)\s*/);
    const from = fromRaw || (arrow.length >= 2 ? arrow[0].trim() : "");
    const to = toRaw || (arrow.length >= 2 ? arrow[1].trim() : "");
    return { from, to, internal: true, kind: "move" };
  }

  if (ADJUST_TYPES.has(type)) {
  // Opname terjadi di gudang sendiri: tidak ada gudang asal/tujuan berbeda.
    const wh = fromRaw || toRaw || String(m.warehouse ?? "").trim();
    return { from: wh, to: wh, internal: true, kind: "adjust" };
  }

  if (IN_TYPES.has(type)) {
    const vendor = String(m.supplier ?? "").trim();
    return {
      from: vendor === "" ? "" : `Supplier: ${vendor}`,
      to: toRaw,
      internal: false,
      kind: "in",
    };
  }

  if (OUT_TYPES.has(type)) {
    const purpose = String(m.purpose ?? "").trim();
    const ket = String(m.keterangan ?? "").trim();
    return {
      from: fromRaw,
      to: toRaw || (purpose !== "" ? purpose : ket),
      internal: false,
      kind: "out",
    };
  }

  // Tipe tak dikenal: jangan menebak arah. Tampilkan apa adanya.
  return {
    from: fromRaw || String(m.supplier ?? "").trim(),
    to: toRaw || String(m.purpose ?? m.keterangan ?? "").trim(),
    internal: false,
    kind: "out",
  };
}

/** Gudang asal/tepat tanpa prefix "Supplier:" - untuk filter dropdown. */
export function movementFromWh(m: StoreItem): string {
  return movementFlow(m).from.replace(/^Supplier:\s*/i, "").trim();
}

export function movementToWh(m: StoreItem): string {
  return movementFlow(m).to.replace(/^Supplier:\s*/i, "").trim();
}

/** Filter gudang untuk tab Pergerakan - dulu substring pada string gabungan. */
export function movementTouchesWh(m: StoreItem, wh: string): boolean {
  if (wh === "" || wh === "Semua") return true;
  const f = movementFlow(m);
  return sameName(f.from, wh) || sameName(f.to, wh);
}
