// Alasan dead stock - dari teks bebas jadi LABEL BERBADGE.
//
// Complaint yang addressed: "tambahkan badge/label alasan/keterangan penyebab
// dead stock (bukan sekadar teks biasa)". Sebelumnya alasannya cuma <select>
// berisi teks polos di dalam kartu, tanpa:
//   - kode alasan (tidak bisa difilter/agregasi),
//   - tingkat dampak nilai (manajer tidak tahu mana yangRp 2 M vs Rp 5 jt),
//   - tindakan tindak lanjut (recycle / return / write-off),
//   - siapa yang mengisi & kapan (keterlacakan audit).
//
// Modelled di sini sebagai KODE alasan + metadata, disimpan di
// `inventory.deadReasonCode` (kode) + `inventory.deadNote` (catatan bebas).
// Field lama `inventory.deadReason` (teks) tetap dibaca sebagai fallback
// supaya data yang sudah ada tidak hilang.

import type { StoreItem } from "../data/store";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type DeadImpact = "low" | "medium" | "high" | "critical";

export interface DeadReason {
  code: string;
  label: string;
  labelEn: string;
  /** Dampak ke modal kerja. */
  impact: DeadImpact;
  /** Dampak default: "hold" = tahan dulu, "release" = lepas (write-off). */
  action: "hold" | "recycle" | "return" | "release";
  /** Saran tindakan yang ditampilkan di tooltip badge. */
  hint: string;
  hintEn: string;
}

/**
 * Katalog alasan. Kode stabil (bukan label) supaya analytics bisa menghitung
 * "5 dari 23 dead item karena Proyek Batal".
 */
export const DEAD_REASONS: DeadReason[] = [
  {
    code: "OVERSTOCK",
    label: "Overstock",
    labelEn: "Overstock",
    impact: "medium",
    action: "hold",
    hint: "Stok jauh di atas minStok karena pemesanan groot. Turunkan minStok atau alihkan ke gudang lain.",
    hintEn: "Bought in bulk above min stock. Lower min stock or rebalance to another warehouse.",
  },
  {
    code: "WRONG_SPEC",
    label: "Salah Spesifikasi",
    labelEn: "Wrong Spec",
    impact: "critical",
    action: "return",
    hint: "Spesifikasi tidak sesuai kebutuhan. Kembalikan ke vendor atau tukar sepihak bila ada MOQ.",
    hintEn: "Spec does not match requirement. Return to vendor or swap if MOQ applies.",
  },
  {
    code: "PROJ_CANCEL",
    label: "Proyek Dibatalkan",
    labelEn: "Project Cancelled",
    impact: "high",
    action: "recycle",
    hint: "Kebutuhan proyek batal. Alihkan ke proyek aktif atau tawarkan ke workshop lain.",
    hintEn: "Demand cancelled. Redirect to an active project or offer to other workshops.",
  },
  {
    code: "NO_MOVE_180D",
    label: "Tidak Dipakai >180 Hari",
    labelEn: "Idle >180 Days",
    impact: "medium",
    action: "hold",
    hint: "180 hari tanpa pengeluaran. Tinjau apakah item masih relevan dengan WBS aktif.",
    hintEn: "No issue for 180 days. Review whether the item still matches any active WBS.",
  },
  {
    code: "ZERO_STOCK",
    label: "Sisa Stok Nol",
    labelEn: "Zero Balance",
    impact: "low",
    action: "release",
    hint: "Baris sisa dengan stok 0. Bersihkan dari katalog agar tidakorption keracunan data.",
    hintEn: "Leftover row with zero stock. Clean from catalog to avoid polluting stock reports.",
  },
  {
    code: "NEVER_RECEIVED",
    label: "Belum Pernah Masuk",
    labelEn: "Never Received",
    impact: "medium",
    action: "hold",
    hint: "Baris katalog tanpa satu pun penerimaan. Tutup bila memang bukan barang galangan.",
    hintEn: "Catalog row with no goods receipt ever. Close it if it is not a shipyard item.",
  },
  {
    code: "OBSOLETE_SPEC",
    label: "Spesifikasi Usang",
    labelEn: "Obsolete Spec",
    impact: "high",
    action: "release",
    hint: "Standar/kelas sudah diganti (mis. AH36 menjadi AH36 TDK). Tulis off atau jual sebagai barang sisa.",
    hintEn: "Standard/class superseded. Write off or sell as leftover.",
  },
  {
    code: "DAMAGED",
    label: "Rusak / Kadaluarsa",
    labelEn: "Damaged / Expired",
    impact: "high",
    action: "release",
    hint: "Ada kedaluwarsa/expired. Pisahkan ke lokasi khusus agar tidak dipakai lagi.",
    hintEn: "Shelf-life or validity expired. Move to quarantine so it cannot be issued.",
  },
  {
    code: "OTHER",
    label: "Lainnya",
    labelEn: "Other",
    impact: "low",
    action: "hold",
    hint: "Alasannya manual. Tulis keterangan singkat supaya bisa diaudit.",
    hintEn: "Manual reason. Write a short note so it can be audited.",
  },
];

const BY_CODE = new Map(DEAD_REASONS.map((r) => [r.code, r]));

/** Label lama (Inventory.tsx lama) → kode. Untuk migrasi data existing. */
const LEGACY_LABEL_TO_CODE: Record<string, string> = {
  "Overstock": "OVERSTOCK",
  "Salah spesifikasi": "WRONG_SPEC",
  "Proyek batal": "PROJ_CANCEL",
  "Tidak dipakai >180 hari": "NO_MOVE_180D",
  "Stok nol": "ZERO_STOCK",
  "Belum pernah masuk": "NEVER_RECEIVED",
};

export function deadReasonOf(code: string | null | undefined): DeadReason {
  const c = String(code ?? "").trim().toUpperCase();
  return BY_CODE.get(c) ?? (BY_CODE.get("OTHER") as DeadReason);
}

/**
 * Kode alasan yang berlaku untuk satu item.
 * Urutan: deadReasonCode (baru) → deadReason teks lama → turunan kondisi.
 */
export function deadCodeOf(item: StoreItem, derived: string): string {
  const explicit = String(item.deadReasonCode ?? "").trim();
  if (explicit !== "") return explicit.toUpperCase();
  const legacy = String(item.deadReason ?? "").trim();
  if (legacy !== "") {
    const mapped = LEGACY_LABEL_TO_CODE[legacy];
    if (mapped) return mapped;
    // Teks bebas yang tidak dikenal → OTHER, simpan teks aslinya di deadNote.
    return "OTHER";
  }
  return derived;
}

/** Alasan turunan dari kondisi (dipakai saat kode belum diisi manual). */
export function derivedDeadCode(item: StoreItem, hasAnyOut: boolean, lastOutDays: number): string {
  if (!hasAnyOut) return "NEVER_RECEIVED";
  if (num(item.stock) <= 0) return "ZERO_STOCK";
  if (lastOutDays > 180) return "NO_MOVE_180D";
  return num(item.stock) > num(item.minStock) * 6 ? "OVERSTOCK" : "NO_MOVE_180D";
}

const IMPACT_TONE: Record<DeadImpact, "gray" | "amber" | "rose" | "red"> = {
  low: "gray",
  medium: "amber",
  high: "rose",
  critical: "red",
};

const IMPACT_RANK: Record<DeadImpact, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function deadImpactTone(impact: DeadImpact): "gray" | "amber" | "rose" | "red" {
  return IMPACT_TONE[impact];
}

  /** Nilai rupiah yang tertidur di item ini - dasar badge prioritas. */
export function deadValueOf(item: StoreItem): number {
  const unit = num(item.avgCost) > 0 ? num(item.avgCost) : num(item.cost);
  return Math.round(num(item.stock) * unit);
}

export interface DeadStockRow {
  item: StoreItem;
  reason: DeadReason;
  /** Nilai rupiah tertidur. */
  value: number;
  /** true bila alasan diisi manual (bukan diturunkan). */
  manual: boolean;
  note: string;
}

/**
 * Bangun baris dead stock siap render - badge memakai `reason.impact`, dan
 * `reason.hint` jadi tooltip. Urutan: nilai tertidur terbesar dulu, karena
 * itulah yang paling hurts kalau tidak ditindaklanjuti.
 */
export function deadStockRows(
  inventory: StoreItem[],
  ctx: { hasOut: (item: StoreItem) => boolean; daysSinceLastOut: (item: StoreItem) => number },
): DeadStockRow[] {
  const out: DeadStockRow[] = [];
  for (const item of inventory) {
    const hasOut = ctx.hasOut(item);
    const days = ctx.daysSinceLastOut(item);
    const dead = !hasOut || days > 180;
    if (!dead) continue;
    const derived = derivedDeadCode(item, hasOut, days);
    const code = deadCodeOf(item, derived);
    const reason = deadReasonOf(code);
    const note = String(item.deadNote ?? "").trim();
    out.push({
      item,
      reason,
      value: deadValueOf(item),
      manual: String(item.deadReasonCode ?? "").trim() !== "" || String(item.deadReason ?? "").trim() !== "",
      note: note !== "" ? note : legacyNoteOf(item),
    });
  }
  return out.sort((a, b) => IMPACT_RANK[b.reason.impact] - IMPACT_RANK[a.reason.impact] || b.value - a.value);
}

/** Field `deadReason` versi lama mungkin sudah berisi kalimat penjelasan. */
function legacyNoteOf(item: StoreItem): string {
  const legacy = String(item.deadReason ?? "").trim();
  if (legacy === "") return "";
  const mapped = LEGACY_LABEL_TO_CODE[legacy];
  //mapped = label baku (sudah jadi reason), bukan catatan.
  return mapped ? "" : legacy;
}

/** Patch untuk menyimpan alasan + keterangan. */
export function deadPatch(reason: DeadReason, note: string): Record<string, unknown> {
  return {
    deadReasonCode: reason.code,
    deadNote: note.trim(),
    /* Field lama ikut ditulis agar laporan lama yang masih baca
       deadReason tidak kehilangan informasi. */
    deadReason: reason.label,
    deadAt: new Date().toISOString().slice(0, 10),
  };
}

/** Ringkasan per alasan untuk badge ringkasan di header card. */
export function deadSummaryByReason(rows: DeadStockRow[]): { reason: DeadReason; count: number; value: number }[] {
  const map = new Map<string, { reason: DeadReason; count: number; value: number }>();
  for (const r of rows) {
    const cur = map.get(r.reason.code) ?? { reason: r.reason, count: 0, value: 0 };
    cur.count += 1;
    cur.value += r.value;
    map.set(r.reason.code, cur);
  }
  return Array.from(map.values()).sort(
    (a, b) => IMPACT_RANK[b.reason.impact] - IMPACT_RANK[a.reason.impact] || b.value - a.value,
  );
}
