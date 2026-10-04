// Klasifikasi notifikasi warning inventory BERDASARKAN KATEGORI BARANG.
//
//requirement: "Hilangkan warning notification pada katalog. Klasifikasikan
// notifikasi warning inventory berdasarkan kategori barang."
//
// Dua bagian yang berbeda:
//
//  1. BANNER KATALOG DIHAPUS. Sebelumnya tab Katalog menampilkan satu baris
//     amber per kategori yang punya item menipis (Inventory.tsx lowByCat).
//     Masalahnya: banner itu muncul begitu ada SATU item menyentuh minStok -
//     jadi 1 dari 400 item memunculkan peringatan untuk kategori yang
//     sebenarnya baik-baik saja, dan user tidak bisa.company tahu item mana
//     yang harus diprioritaskan. Sekaligus managers tidak punya daftar
//    entiel "yang benar-benar kritis".
//
//  2. SEBAGAI GANTI: setiap item dapat TINGKAT warning yang dihitung dari
//     (a) rasio stok terhadap minStok di gudangnya, dan (b) KATEGORI
//     barang yang punya toleransi berbeda. Kategori "habis pakai" dengan
//     lead time panjang wajib di-buffer; "service/jasa" tidak punya stok
//     fisik sehingga minStok tidak berlaku sama sekali.
//
// NOTA: baris badge per-item di tabel Katalog (Status Menipis/Aman) TETAP
// ada - itu informasi langsung per baris, bukan banner yang memenuhi layar.
// Yang dihapus adalah banner agregat per kategori.

import type { StoreItem } from "../data/store";
import { sameName } from "./names";

export type WarnLevel = "none" | "watch" | "low" | "critical" | "overstock";

export interface WarnTone {
  level: WarnLevel;
  /** tone Badge: none=green, watch=gray, low=amber, critical=red. */
  tone: "green" | "gray" | "amber" | "red" | "blue";
  label: string;
  labelEn: string;
  /** Angka 0..3, dipakai untuk mengurutkan yang paling mendesak. */
  rank: number;
}

/**
 * Kategori barang + parameter warning-nya.
 * `criticalRatio` : stok ≤ rasio ini × minStok → Kritis (langsung blokir
 *                    produksi / buat PR).
 * `watchRatio`    : stok ≤ rasio ini × minStok → Waspada.
 * `leadTimeDays`  : lead time supply; kategori lead-time panjang diberi
 *                    buffer lebih lebar sehingga tidak alarm palsu.
 * `maxRatio`      : stok > rasio ini × minStok → Overstock (uang tertidur).
 * `ignoresMin`    : kategori tanpa stok fisik (jasa/service) → minStok
 *                    tidak berlaku, tidak pernah "menipis".
 */
export interface CategoryRule {
  key: string;
  leadTimeDays: number;
  watchRatio: number;
  criticalRatio: number;
  maxRatio: number;
  ignoresMin: boolean;
}

const BASE: CategoryRule = {
  key: "",
  leadTimeDays: 14,
  watchRatio: 1.5,
  criticalRatio: 1,
  maxRatio: 6,
  ignoresMin: false,
};

export const CATEGORY_RULES: Record<string, CategoryRule> = {
  /* Baja & pipa: lead time panjang, nilai besar, tidak boleh habis mendadak.
     Rasio kritis diperketat (0,8) karena satu shortage=oncomposite ulang
     yang mahal, bukan sekadar_delay. */
  baja: { key: "Baja", leadTimeDays: 45, watchRatio: 2, criticalRatio: 0.8, maxRatio: 5, ignoresMin: false },
  "baja & struktur": { key: "Baja", leadTimeDays: 45, watchRatio: 2, criticalRatio: 0.8, maxRatio: 5, ignoresMin: false },
  pipa: { key: "Pipa", leadTimeDays: 60, watchRatio: 2.5, criticalRatio: 0.9, maxRatio: 4, ignoresMin: false },
  "pipa & fitting": { key: "Pipa", leadTimeDays: 60, watchRatio: 2.5, criticalRatio: 0.9, maxRatio: 4, ignoresMin: false },
  rigging: { key: "Rigging", leadTimeDays: 30, watchRatio: 2, criticalRatio: 0.85, maxRatio: 4, ignoresMin: false },
  "rigging & wire": { key: "Rigging", leadTimeDays: 30, watchRatio: 2, criticalRatio: 0.85, maxRatio: 4, ignoresMin: false },
  kelistrikan: { key: "Kelistrikan", leadTimeDays: 21, watchRatio: 1.8, criticalRatio: 1, maxRatio: 6, ignoresMin: false },
  /* Consumable cepat habis & sering punya safety stock besar (tidak bisa
     di-break kalau habis di tengah galvanis). */
  consumable: { key: "Consumable", leadTimeDays: 10, watchRatio: 2.5, criticalRatio: 1.2, maxRatio: 8, ignoresMin: false },
  cat: { key: "Cat & Coating", leadTimeDays: 14, watchRatio: 2, criticalRatio: 1, maxRatio: 6, ignoresMin: false },
  /* Sparepart mesin: scars, sering dipakai mendadak. */
  sparepart: { key: "Sparepart", leadTimeDays: 35, watchRatio: 2, criticalRatio: 0.9, maxRatio: 4, ignoresMin: false },
  "sparepart mesin": { key: "Sparepart", leadTimeDays: 35, watchRatio: 2, criticalRatio: 0.9, maxRatio: 4, ignoresMin: false },
  /* Jasa/service: TIDAK ada stok fisik. Stok di katalog berarti "jatah
     jam/kontingen yang sudah dibayar", bukan barang di rak. minStok tidak
     berlaku - memotong alarm di sini membuang alert palsu yang muncul
     setiap kali kolom stock = 0. */
  service: { key: "Service", leadTimeDays: 0, watchRatio: 0, criticalRatio: 0, maxRatio: 0, ignoresMin: true },
  jasa: { key: "Service", leadTimeDays: 0, watchRatio: 0, criticalRatio: 0, maxRatio: 0, ignoresMin: true },
  /* Kategori tidak dikenal: aturan konservatif, alarm tetap muncul. */
  default: BASE,
};

function normKey(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

/** Cocokkan nama kategori ke rule. Coba persis dulu, lalu contains. */
export function ruleOf(category: unknown): CategoryRule {
  const k = normKey(category);
  if (k === "") return CATEGORY_RULES.default as CategoryRule;
  const direct = CATEGORY_RULES[k];
  if (direct) return direct;
  for (const [key, rule] of Object.entries(CATEGORY_RULES)) {
    if (key === "default") continue;
    if (k.includes(key)) return rule;
  }
  return CATEGORY_RULES.default as CategoryRule;
}

const TONE: Record<WarnLevel, { tone: WarnTone["tone"]; label: string; labelEn: string; rank: number }> = {
  none: { tone: "green", label: "Aman", labelEn: "OK", rank: 0 },
  watch: { tone: "gray", label: "Waspada", labelEn: "Watch", rank: 1 },
  low: { tone: "amber", label: "Menipis", labelEn: "Low", rank: 2 },
  critical: { tone: "red", label: "Kritis", labelEn: "Critical", rank: 3 },
  overstock: { tone: "blue", label: "Berlebih", labelEn: "Overstock", rank: -1 },
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Stok minimum yang berlaku untuk satu item DI GUDANG tertentu.
 * minStockByWarehouseoverride minStock global; kolom minStock per gudang
 * sudah jadi fitur existing (Inventory.tsx minWhOf) - logika ini dipindah
 * ke sini supaya klasifikasi warning memakai angka yang sama dengan kartu
 * "Stok per Gudang".
 */
export function effectiveMinStock(item: StoreItem, warehouse?: string): number {
  const byWh = item.minStockByWarehouse;
  if (byWh && typeof byWh === "object" && !Array.isArray(byWh)) {
    const rec = byWh as Record<string, unknown>;
    const key = String(warehouse ?? item.warehouse ?? "");
    const v = num(rec[key]);
    if (v > 0) return v;
    // Cari tolerant: nama gudang mungkin beda kapital/spasi.
    for (const [k, val] of Object.entries(rec)) {
      if (sameName(k, key)) return num(val);
    }
  }
  return num(item.minStock);
}

/**
 * Tingkat warning satu item. Memakai kategori sebagai pengali ambang.
 */
export function warnLevelOf(item: StoreItem, warehouse?: string): WarnTone {
  const rule = ruleOf(item.category);
  const stock = num(item.stock);
  const min = effectiveMinStock(item, warehouse);

  /* Kategori tanpa stok fisik: minStok tidak berlaku. Stok nol di sini
     berarti "belum ada paket jasa terjual", bukan barang hilang. */
  if (rule.ignoresMin) {
    return { level: "none", ...TONE.none };
  }

  /* minStok 0 = manage-by-eye. Tanpa acuan, tidak ada warning (tidak ada
     agreed-upon safety stock). Satu-satunya sinyal yang tersisa overstock. */
  if (min <= 0) {
    return { level: "none", ...TONE.none };
  }

  const ratio = stock / min;
  if (ratio <= rule.criticalRatio) return { level: "critical", ...TONE.critical };
  if (ratio <= rule.watchRatio) return { level: "low", ...TONE.low };
  if (ratio > rule.maxRatio) return { level: "overstock", ...TONE.overstock };
  //-ratio antara watchRatio dan maxRatio = zona sehat; "waspada" dipakai
  // hanya jika lead time kategori panjang DAN stok di bawah 2× min (stok
  // akan habis sebelum pesanan berikutnya datang).
  if (rule.leadTimeDays >= 30 && ratio < 2) return { level: "watch", ...TONE.watch };
  return { level: "none", ...TONE.none };
}

/** true bila item layak masuk daftar prioritas. */
export function needsAction(item: StoreItem, warehouse?: string): boolean {
  const lv = warnLevelOf(item, warehouse).level;
  return lv === "critical" || lv === "low" || lv === "overstock";
}

/* ============================================================
   RINGKASAN PER KATEGORI (pengganti banner lama)
   ============================================================ */

export interface CategoryWarningSummary {
  category: string;
  ruleKey: string;
  leadTimeDays: number;
  /** total item di kategori ini. */
  total: number;
  counts: Record<WarnLevel, number>;
  /** item paling mendesak (critical dulu, lalu low). */
  urgent: StoreItem[];
  /** level Tertinggi di kategori ini. */
  top: WarnLevel;
}

const EMPTY_COUNTS = (): Record<WarnLevel, number> => ({
  none: 0, watch: 0, low: 0, critical: 0, overstock: 0,
});

/**
 * Jumlah item per tingkat warning.
 *
 * Filter di UI sebelumnya hanya bisa memilih KATEGORI, padahal yang ingin
 * dicari stirip actually "yang kritis" atau "yang berlebih" - dua hal yang
 * tidak ada padanan kategori. Klasifikasinya sudah lengkap di `warnLevelOf`,
 * jadi angka di sini dibaca dari situ, bukan dihitung ulang dengan ambang
 * yang berbeda.
 */
export function levelTally(inventory: StoreItem[], warehouse?: string): Record<WarnLevel, number> {
  const out = EMPTY_COUNTS();
  for (const item of inventory) {
    const lv = warnLevelOf(item, warehouse).level;
    out[lv] += 1;
  }
  return out;
}

/** Tingkat yang layak masuk daftar prioritas (bukan "sehat"/"waspada"). */
export const ACTION_LEVELS: readonly WarnLevel[] = ["critical", "low", "overstock"] as const;

/**
 * Ringkasan warning PER KATEGORI - inilah yang menggantikan banner.
 * Urutan: kategori dengan item Kritis dulu, lalu jumlah item low, lalu nama.
 * Kategori yang bersih total TIDAK ikut ditampilkan (tidak ada yang perlu
 * diperhatikan) - ini yang menghilangkan banner Categories "0 masalah".
 */
export function categoryWarnings(
  inventory: StoreItem[],
  opts: { maxUrgentPerCategory?: number; onlyWithAction?: boolean } = {},
): CategoryWarningSummary[] {
  const maxUrgent = opts.maxUrgentPerCategory ?? 5;
  const onlyAction = opts.onlyWithAction ?? true;
  const map = new Map<string, CategoryWarningSummary>();

  for (const item of inventory) {
    const cat = String(item.category ?? "-").trim() || "-";
    const rule = ruleOf(item.category);
    const level = warnLevelOf(item).level;
    let entry = map.get(cat);
    if (!entry) {
      entry = {
        category: cat,
        ruleKey: rule.key || "Umum",
        leadTimeDays: rule.leadTimeDays,
        total: 0,
        counts: EMPTY_COUNTS(),
        urgent: [],
        top: "none",
      };
      map.set(cat, entry);
    }
    entry.total += 1;
    entry.counts[level] += 1;
    if (level === "critical" || level === "low" || level === "overstock") {
      entry.urgent.push(item);
    }
    if (TONE[level].rank > TONE[entry.top].rank) entry.top = level;
  }

  const out = Array.from(map.values());
  for (const e of out) {
    e.urgent.sort((a, b) => {
      const d = TONE[warnLevelOf(b).level].rank - TONE[warnLevelOf(a).level].rank;
      if (d !== 0) return d;
      return effectiveMinStock(b) - effectiveMinStock(a) > 0
        ? (num(b.stock) / Math.max(1, effectiveMinStock(b))) - (num(a.stock) / Math.max(1, effectiveMinStock(a)))
        : 0;
    });
    e.urgent = e.urgent.slice(0, maxUrgent);
  }

  const filtered = onlyAction ? out.filter((e) => e.urgent.length > 0 || e.top === "watch") : out;
  return filtered.sort((a, b) => {
    const d = TONE[b.top].rank - TONE[a.top].rank;
    if (d !== 0) return d;
    const ua = a.counts.critical + a.counts.low;
    const ub = b.counts.critical + b.counts.low;
    if (ub !== ua) return ub - ua;
    return a.category.localeCompare(b.category, "id");
  });
}

/** Badge tone untuk badge Katalog (mengganti ternary stock<=minStock). */
export function katalogBadge(item: StoreItem): { tone: WarnTone["tone"]; text: string; textEn: string } {
  const w = warnLevelOf(item);
  return { tone: w.tone, text: w.label, textEn: w.labelEn };
}

/**
 * Angka prioritas untuk sorting: makin besar makin mendesak.
 * Kritis=5, Menipis=4, Berlebih=3, Waspada=2, Aman=1.
 * ("Berlebih" diberi nilai di atas Waspada karena uangnya tertidur, meski
 * tidak kondisi darurat - urutan inilah yang dipakai kolom Status Katalog.)
 */
export function warnRankOf(item: StoreItem, warehouse?: string): number {
  const lv = warnLevelOf(item, warehouse).level;
  switch (lv) {
    case "critical": return 5;
    case "low": return 4;
    case "overstock": return 3;
    case "watch": return 2;
    default: return 1;
  }
}
