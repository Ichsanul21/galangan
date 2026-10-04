/* Invoice/tagihan galangan.
 *
 * Dokumen ini SAH karena uangnya dan harus cocok dengan pembukuan, jadi
 * dirakit server dari baris `invoices` - bukan dari state klien. Kalau PDF
 * dirakit di browser, angka yang terlihat di layar dan angka yang ditandatangani
 * bisa berbeda, dan tidak ada satu pun gerbang yang bisa menangkapnya.
 *
 * Dua bentuk sumber data, dan keduanya harus menghasilkan dokumen yang sama
 * bentuknya:
 *
 *   1. Invoice yang dibuat di aplikasiFinance -> punya `lines` (baris per
 *      pekerjaan: desc/qty/unit/price/rate/hours).
 *   2. Invoice hasil impor dari data Excel lama -> TIDAK punya `lines`, hanya
 *      agregat (jasaTotal/matTotal/amount). Invoice dengan baris kosong akan
 *      tercetak sebagai dokumen tanpa rincian, jadi di sini agregat itu
 *      dijadikan dua baris supaya tetap bisa diperiksa.
 *
 * Neto mengikuti aturan yang sama dengan `invNeto()` di Finance.tsx:
 * `grandTotal` bila ada, kalau tidak `amount` dikurangi retensi yang ditahan.
 * Kalau angka neto di PDF berbeda dari kartu di tabel, pembukuan jadi tidak
 * bisa diaudit.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, table, callout, signatures, spacer, divider } from "../blocks.js";
import { companyKop, docNote, docTitle, longDate, L, type Locale } from "./shared.js";

export interface InvoiceLine {
  desc: string;
  qty: string;
  unit: string;
  /** Harga satuan untuk material; tarif/jam untuk jasa. */
  price: string;
  /** Jam kerja - hanya untuk baris jasa. */
  hours: string;
  kategori: string;
}

export interface InvoiceInput {
  no: string;
  tanggal: string;
  client: string;
  project: string;
  vessel?: string;
  /** Termin pembayaran, mis. "NET 30". */
  paymentTerm?: string;
  billingType?: string;
  milestoneRef?: string;
  due: string;
  status: string;
  lines: InvoiceLine[];
  /** Fallback kalau `lines` kosong: dua baris agregat dari impor Excel. */
  jasaTotal: number;
  matTotal: number;
  amount: number;
  dpp: number;
  ppnAmt: number;
  pphAmt: number;
  ppnRate: number;
  pphRate: number;
  dpApplied: number;
  dpRef?: string;
  retentionAmt: number;
  grandTotal: number;
  /** Neto final - sudah termasuk potong DP dan retensi. */
  neto: number;
  skdt: boolean;
  paidAt?: string;
  paidRef?: string;
  signer: string;
  locale?: Locale;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "" || String(v).trim() === "-";
}

export function invoiceDoc(input: InvoiceInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Invoice ${input.no}`,
    subject: `Invoice - ${input.no}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "INVOICE", "INVOICE"),
      ref: `${L(locale, "No", "No")}. ${input.no}`,
    }),
  );

  const pairs = [
    { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggal) },
    { label: L(locale, "Kepada", "Bill to"), value: input.client },
    { label: L(locale, "Proyek", "Project"), value: input.project },
  ];
  if (!isBlank(input.vessel)) pairs.push({ label: L(locale, "Kapal", "Vessel"), value: String(input.vessel) });
  if (!isBlank(input.paymentTerm)) {
    pairs.push({ label: L(locale, "Termin", "Term"), value: String(input.paymentTerm) });
  }
  if (!isBlank(input.billingType)) {
    pairs.push({ label: L(locale, "Jenis", "Type"), value: String(input.billingType) });
  }
  pairs.push({ label: L(locale, "Jatuh Tempo", "Due Date"), value: longDate(input.due) });

  d.add(keyValue({ labelW: 35, pairs }));
  if (!isBlank(input.milestoneRef)) {
    d.add(spacer(1));
    d.add(keyValue({ labelW: 35, pairs: [{ label: L(locale, "Milestone", "Milestone"), value: String(input.milestoneRef) }] }));
  }
  d.add(spacer(2));

  /* Baris rincian. Invoice impor tidak punya `lines`, jadi agregat
     jasa/material-nya diturunkan jadi dua baris supaya dokumen tetap
     bisa diperiksa tanpa melihat aplikasi. */
  const detail =
    input.lines.length > 0
      ? input.lines
      : [
          { desc: L(locale, "Jasa perbaikan & pemeliharaan", "Repair & maintenance services"), qty: "1", unit: L(locale, "Paket", "Lot"), price: String(input.jasaTotal), hours: "", kategori: "Jasa" },
          { desc: L(locale, "Material & suku cadang", "Materials & spare parts"), qty: "1", unit: L(locale, "Paket", "Lot"), price: String(input.matTotal), hours: "", kategori: "Material" },
        ].filter((l) => Number(l.price) > 0);

  if (detail.length > 0) {
    d.add(
      table({
        head: [
          L(locale, "No", "No"),
          L(locale, "Uraian", "Description"),
          L(locale, "Ket", "Unit"),
          L(locale, "Harga", "Price"),
        ],
        widths: [10, "auto", 16, 30],
        align: ["center", "left", "center", "right"],
        rows: detail.map((l, i) => [
          String(i + 1),
          l.desc,
          l.unit === "" ? l.qty : `${l.qty} ${l.unit}`,
          l.price,
        ]),
      }),
    );
  } else {
    /* Tidak ada rincian DAN tidak ada agregat. Dicetak apa adanya - dokumen
       kosong lebih jujur daripada dokumen yang terlihat lengkap. */
    d.add(callout([L(locale, "Invoice ini tidak memiliki rincian: baik baris pekerjaan maupun nilai jasa/material.", "This invoice has no line items and no service/material totals.")]));
  }

  d.add(spacer(2));
  d.add(divider());

  /* Rincian pajak. SKDT berarti Structured Invoice - PPN 0 itu disengaja,
     jadi angkanya tetap dicetak apa adanya supaya selisih 0 bisa terlihat
     dan bukan disalahartikan sebagai bug. */
  const taxRows: string[][] = [
    [L(locale, "Nilai Invoice (DPP)", "Invoice base (taxable)"), String(input.dpp)],
  ];
  if (input.ppnAmt > 0 || input.ppnRate > 0) {
    taxRows.push([`PPN ${input.ppnRate}%`, String(input.ppnAmt)]);
  }
  if (input.pphAmt > 0 || input.pphRate > 0) {
    taxRows.push([`PPh ${input.pphRate}%`, String(input.pphAmt)]);
  }
  taxRows.push([L(locale, "Neto Invoice", "Invoice total"), input.neto.toString()]);
  d.add(
    table({
      head: ["", ""],
      widths: ["auto", 34],
      align: ["left", "right"],
      rows: taxRows,
    }),
  );

  /* Potongan DP dan retensi dicetak terpisah dari neto supaya pembaca tahu
     selisih "amount != neto" itu disengaja, bukan kesalahan aritmetika. */
  if (input.dpApplied > 0) {
    const ref = isBlank(input.dpRef) ? "" : ` (${String(input.dpRef)})`;
    d.add(spacer(1));
    d.add(
      callout([
        `${L(locale, "Sudah termasuk dipotong", "Deducted upfront")}: ${input.dpApplied.toLocaleString(locale === "en" ? "en-US" : "id-ID")}${ref}`,
      ]),
    );
  }
  if (input.retentionAmt > 0) {
    d.add(spacer(1));
    d.add(
      callout([
        `${L(locale, "Retensi ditahan", "Retention withheld")}: ${input.retentionAmt.toLocaleString(locale === "en" ? "en-US" : "id-ID")}`,
      ]),
    );
  }

  if (input.skdt) {
    d.add(spacer(1));
    d.add(callout([L(locale, "SKDT - Structured Invoice, tanpa PPN.", "SKDT - Structured Invoice, no VAT.")]));
  }

  if (!isBlank(input.paidAt)) {
    d.add(spacer(1));
    d.add(
      callout([
        `${L(locale, "LUNAS", "PAID")} - ${longDate(String(input.paidAt))}${isBlank(input.paidRef) ? "" : ` / ${String(input.paidRef)}`}`,
      ]),
    );
  }

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Mengetahui", "Approved by"), name: input.signer, rows: 5 },
      { role: L(locale, "Pelanggan", "Customer"), name: "", rows: 5 },
    ]),
  );

  d.addAll(
    docNote([
      L(
        locale,
        "Invoice ini dibuat dari data pembukuan sistem. Nominal, pajak, dan tempo pembayaran mengikuti baris invoice yang tercatat.",
        "This invoice is generated from the system's billing records. Amounts, taxes, and payment term follow the recorded invoice row.",
      ),
    ]),
  );

  return d;
}
