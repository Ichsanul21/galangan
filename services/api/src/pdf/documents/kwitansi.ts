/* Kwitansi (bukti pembayaran termin subkontraktor).
 *
 * Dokumen ini yang dilaporkan client "konten pdf nya terpotong". Akarnya
 * bukan kwitansi ini, tapi mesin PDF: `align: "right"` pada baris nominal
 * menganchor tepi kanan baris itu di margin KIRI, jadi Rp 44.832.500 yang
 * lebarnya 40 mm mulai dari x = -25 mm dan lebih dari separuhnya tercetak di
 * luar kertas. Factory ini tidak pernah memakai perataan berbasis anchor -
 * nilai selalu lewat kolom tabel atau keyValue yang kolomnya dihitung dari
 * lebar yang terukur.
 *
 * Isi dokumen mengikuti rumus yang dipakai seluruh aplikasi:
 *   neto = nilai termin - PPh - retensi - denda
 * Retensi dan PPh ditampilkan sebagai baris pengurang bernilai negatif,
 * bukan disembunyikan, supaya orang yang menerima kwitansi bisa cocokkan
 * dengan milik di di pembukuan.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, callout, signatures, spacer } from "../blocks.js";
import { COLOR } from "../theme.js";
import { companyKop, docNote, docTitle, longDate, money, rupiah, L, type Locale } from "./shared.js";

export interface KwitansiInput {
  no: string;
  tanggal: string;
  /** Nama subkontraktor penerima. */
  diterimaDari: string;
  /** Untuk apa pembayaran ini. */
  untuk: string;
  /** Rincian: label + nilai (boleh negatif untuk pengurang). */
  breakdown: Array<{ label: string; value: number }>;
  /** Label baris total. */
  netLabel: string;
  catatan?: string;
  locale?: Locale;
}

export function kwitansi(input: KwitansiInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Kwitansi ${input.no}`,
    subject: "Bukti pembayaran termin subkontraktor",
    ...opts,
  });
  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "KWITANSI", "PAYMENT RECEIPT"),
      ref: `${L(locale, "No", "No")}. ${input.no}   ${L(locale, "Tanggal", "Date")} ${longDate(input.tanggal)}`,
    }),
  );

  d.add(
    keyValue({
      labelW: 32,
      pairs: [
        { label: L(locale, "Diterima Dari", "Paid To"), value: input.diterimaDari, bold: true },
        { label: L(locale, "Untuk", "For"), value: input.untuk },
      ],
    }),
  );

  const rows = input.breakdown.map((b) => [b.label, b.value < 0 ? `(${money(Math.abs(b.value))})` : money(b.value)]);
  const net = input.breakdown.reduce((s, b) => s + b.value, 0);
  d.add(
    table({
      head: [L(locale, "Uraian", "Description"), L(locale, "Nilai (Rp)", "Amount (Rp)")],
      /* Kolom uraian "auto": lebarnya dihitung dari sisa ruang, bukan angka
         tetap, jadi label panjang tidak mendorong kolom nilai keluar halaman. */
      widths: ["auto", 42],
      align: ["left", "right"],
      rows,
      totalRow: rows.length - 1,
      labelCol: 0,
      zebra: false,
    }),
  );

  /* Nominal dibayar: satu blok callout supaya jelas di mata, dan lebarnya
     penuh halaman - tidak pernah dianchor ke tepi yang salah. */
  d.add(
    callout(
      [
        `${input.netLabel}: ${rupiah(net)}`,
        L(locale, "Terbilang", "In words") + `: ${ribu(net)}`,
      ],
      { fill: COLOR.softFill, border: COLOR.hair, size: 10, bold: false },
    ),
  );

  if (input.catatan && input.catatan.trim() !== "") {
    for (const line of input.catatan.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== "")) {
      d.add(paragraph({ text: line, size: 8, color: COLOR.steel }));
    }
  }

  d.addAll(docNote([L(locale, "Kwitansi ini sah tanpa tanda tangan basah apabila disertai nomor referensi pembayaran.", "This receipt is valid without a wet signature when payment reference number is present.")]));
  d.add(spacer(2));
  d.add(
    signatures([
      { role: L(locale, "Yang Menerima", "Received by"), name: input.diterimaDari, rows: 5 },
      { role: L(locale, "Untuk Perusahaan", "For the company"), name: "", rows: 5 },
    ]),
  );
  return d;
}

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas", "dua belas"];
const BELASAN = ["", "sepuluh", "sebelas", "dua belas", "tiga belas", "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas"];
/* Indeks = (digit tens) - 2. Versi pertama memakai array yang dimulai dari
   elemen kosong, sehingga setiap angka salah satu tingkat: 70 keluar sebagai
   "enam puluh", 60 sebagai "lima puluh", dan seterusnya - termasuk pengujian
   corresponded dengan angka yang salah. */
const PULUHAN = ["dua puluh", "tiga puluh", "empat puluh", "lima puluh", "enam puluh", "tujuh puluh", "delapan puluh", "sembilan puluh"];

/** Bilangan dalam bahasa Indonesia untuk baris "Terbilang". */
/** Bilangan dalam bahasa Indonesia untuk baris "Terbilang" pada kwitansi.
 *
 * Tanpa ini kwitansi hanya boleh dicetak dengan uang nominal - padahal
 * kwitansi pembayaran adalah dokumen yang biasanya wajib bertulis "Terbilang"
 * agar bisa dicocokkan dengan cek bank. Nilai negatif tidak mungkin di
 * kwitansi (baris pengurang sudah jadi nilai positif di tabel), jadi fungsi
 * ini hanya menerima nilai >= 0. */
export function ribu(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "nol rupiah";
  return `${terbilangAngka(v)} rupiah`;
}

function terbilangAngka(v: number): string {
  if (v < 12) return SATUAN[v] ?? "";
  if (v < 20) return `${BELASAN[v - 10]} belas`;
  if (v < 100) {
    const tens = Math.floor(v / 10);
    const ones = v % 10;
    return ones === 0 ? `${PULUHAN[tens - 2] ?? ""}` : `${PULUHAN[tens - 2] ?? ""} ${SATUAN[ones]}`;
  }
  if (v < 200) return `seratus${v % 100 === 0 ? "" : ` ${terbilangAngka(v % 100)}`}`;
  if (v < 1000) {
    const hundreds = Math.floor(v / 100);
    const rest = v % 100;
    return `${SATUAN[hundreds] ?? ""} ratus${rest === 0 ? "" : ` ${terbilangAngka(rest)}`}`;
  }
  if (v < 1_000_000) {
    const thousands = Math.floor(v / 1000);
    const rest = v % 1000;
    const head = thousands < 10 ? "seribu" : `${terbilangAngka(thousands)} ribu`;
    return `${head}${rest === 0 ? "" : ` ${terbilangAngka(rest)}`}`;
  }
  if (v < 1_000_000_000) {
    const millions = Math.floor(v / 1_000_000);
    const rest = v % 1_000_000;
    return `${terbilangAngka(millions)} juta${rest === 0 ? "" : ` ${terbilangAngka(rest)}`}`;
  }
  const billions = Math.floor(v / 1_000_000_000);
  const rest = v % 1_000_000_000;
  return `${terbilangAngka(billions)} miliar${rest === 0 ? "" : ` ${terbilangAngka(rest)}`}`;
}
