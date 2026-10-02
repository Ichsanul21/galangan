/* Registri dokumen PDF.
 *
 * `kind` adalah enum TERTUTUP - server tidak menerima nama dokumen bebas dari
 * klien. Kalau klien boleh mengarang nama, dia juga boleh mengarang isi.
 * Untuk dokumen resmi yang tidak dapat diterima:渲染-model dibangun dari
 * baris DB milik server, dan pemanggil hanya menyebut dokumen mana yang mau.
 */
import type { Document } from "./document.js";
import { kwitansi } from "./documents/kwitansi.js";
import { loadEntity, loadMany, num, str, text, longDate, money, rupiah, qty, L, type Locale } from "./documents/shared.js";

export interface RenderContext {
  locale: Locale;
  /** Cabang pengguna; laporan dibatasi ke cabang ini. */
  branch: string;
}

/** Definisi satu jenis dokumen. */
interface Recipe {
  /** Nama untuk route + audit. */
  kind: string;
  /** Judul dokumen, ditampilkan di audit. */
  title: string;
  /** true = laporan (data hidup, tidak perlu snapshot untuk cetak ulang). */
  report?: boolean;
  /** Entitas DB yang jadi sumber utama; menentukan apakah `id` wajib. */
  entity: { field: string; prefix: string };
  /** true = payload req/id wajib; false = laporan boleh tanpa id. */
  requiresEntity: boolean;
  build: (id: string, ctx: RenderContext) => Promise<Document>;
}

/* ==========================================================================
   Helper
   ========================================================================== */

async function terminDoc(id: string, ctx: RenderContext): Promise<Document> {
  const t = await loadEntity({ field: "termins", prefix: "TRM" }, id);
  if (!t) throw new Error(`Termin ${id} tidak ditemukan`);
  const amount = num(t, "amount");
  const pph = Math.round(num(t, "pphAmt"));
  const ret = Math.round(num(t, "retAmt"));
  const penalty = Math.round(num(t, "penaltyApplied"));
  const pphPct = num(t, "pphPct");
  const retPct = num(t, "retPct");
  const net = Math.max(0, amount - pph - ret - penalty);

  const breakdown: Array<{ label: string; value: number }> = [
    { label: L(ctx.locale, "Nilai termin", "Term value"), value: amount },
  ];
  if (pph > 0) {
    breakdown.push({ label: `${L(ctx.locale, "PPh dipotong", "Income tax withheld")} (${pphPct}%)`, value: -pph });
  }
  if (ret > 0) {
    breakdown.push({ label: `${L(ctx.locale, "Retensi ditahan", "Retention held")} (${retPct}%)`, value: -ret });
  }
  if (penalty > 0) {
    breakdown.push({ label: L(ctx.locale, "Denda keterlambatan", "Late penalty"), value: -penalty });
  }
  breakdown.push({ label: L(ctx.locale, "Dibayar", "Net paid"), value: net });

  const notes: string[] = [];
  if (str(t, "withholdingRef") !== "-") notes.push(`${L(ctx.locale, "Bukti potong PPh", "Tax receipt no")}: ${str(t, "withholdingRef")}`);
  if (str(t, "paidRef") !== "-") {
    notes.push(`${L(ctx.locale, "Referensi pembayaran", "Payment reference")}: ${str(t, "paidRef")} (${str(t, "paidMethod")})`);
  }
  /* Requirement baru client 2 Oktober: invoice & BAST wajib ada sebelum
     kwitansi diterbitkan. Kalau salah satu kosong, kwitansi tetap boleh
     dicetak (dokumensometimes dibutuhkan untuk arsip) tetapi diberi catatan
     yang jujur - bukan diam-diam terlihat lengkap. */
  if (str(t, "invoiceNo") === "-") notes.push(L(ctx.locale, "Belum ada nomor invoice - kwitansi ini belum dapat dicocokkan ke invoice.", "Invoice number missing - this receipt cannot be matched to an invoice."));
  if (str(t, "bastNo") === "-") notes.push(L(ctx.locale, "Belum ada nomor BAST - serah terima pekerjaan belum terdokumentasi.", "BAST number missing - the handover is not documented."));
  if (ret > 0) notes.push(L(ctx.locale, "Retensi dilepas setelah work order selesai.", "Retention is released after the work order closes."));

  const sub = await loadMany({ field: "subcontractors", prefix: "SUB" }, { ids: [str(t, "subId")] })
    .then((rows) => rows[0]);

  return kwitansi(
    {
      no: `KW/${id.replaceAll("/", "-")}`,
      tanggal: str(t, "paidAt"),
      diterimaDari: str(t, "sub"),
      untuk: [id, str(t, "milestone")].filter((s) => s !== "-").join(" - "),
      breakdown,
      netLabel: L(ctx.locale, "Dibayar", "Net paid"),
      catatan: notes.join("\n"),
      locale: ctx.locale,
    },
    { footer: (p, total) => `Halaman ${p} dari ${total} · Termin ${id}` },
  );
  void sub;
}

/* ==========================================================================
   Registri
   ========================================================================== */

const RECIPES: Recipe[] = [
  { kind: "kwitansi", title: "Kwitansi pembayaran termin", entity: { field: "termins", prefix: "TRM" }, requiresEntity: true, build: terminDoc },
];

export const DOC_KINDS = RECIPES.map((r) => r.kind);

export function findRecipe(kind: string): Recipe | undefined {
  return RECIPES.find((r) => r.kind === kind);
}

/** Ekspor helper agar route tidak perlu tahu detail internal. */
export { longDate, money, rupiah, qty, text, num, str, loadEntity, loadMany };