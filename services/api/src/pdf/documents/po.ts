/* Purchase Order (PO).
 *
 * Dokumen resmi pemesanan barang/jasa ke vendor/supplier. Memuat: identitas
 * vendor, daftar item dengan kuantitas dan harga, total nilai, syarat
 * pembayaran, syarat pengiriman, dan tanda tangan.
 *
 * Client requirement 2 Oktober: "generated documents persetujuan po wo kwitansi
 * dll" - PO adalah dokumen pemesanan yang wajib ada sebelum barang/jasa
 * diterima.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, spacer, callout } from "../blocks.js";
import { COLOR } from "../theme.js";
import { companyKop, docTitle, longDate, rupiah, money, L, type Locale } from "./shared.js";

export interface PoInput {
  no: string;
  tanggal: string;
  vendorName: string;
  vendorAddress?: string;
  vendorNPWP?: string;
  projectName?: string;
  items: Array<{
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  totalAmount: number;
  paymentTerms: string;
  deliveryTerms?: string;
  notes?: string;
  nameOrderer: string;
  nameApprover: string;
  locale?: Locale;
}

export function po(input: PoInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `PO ${input.no}`,
    subject: `Purchase Order - ${input.vendorName}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "PURCHASE ORDER", "PURCHASE ORDER"),
      ref: `${L(locale, "No", "No")}. ${input.no}   ${L(locale, "Tanggal", "Date")} ${longDate(input.tanggal)}`,
    }),
  );

  d.add(
    paragraph({
      text: L(locale, "Dengan ini kami memesan:", "We hereby order:"),
      size: 10,
      font: "bold",
    }),
  );

  d.add(spacer(1));
  d.add(
    keyValue({
      labelW: 35,
      pairs: [
        { label: L(locale, "Vendor", "Vendor"), value: input.vendorName, bold: true },
        { label: "NPWP", value: input.vendorNPWP ?? "-" },
        { label: L(locale, "Alamat", "Address"), value: input.vendorAddress ?? "-" },
      ],
    }),
  );

  if (input.projectName) {
    d.add(spacer(1));
    d.add(
      paragraph({
        text: `${L(locale, "Proyek", "Project")}: ${input.projectName}`,
        size: 10,
      }),
    );
  }

  d.add(spacer(2));
  d.add(
    paragraph({
      text: L(locale, "Dengan ini kami memesan:", "We hereby order:"),
      size: 10,
    }),
  );

  const rows = input.items.map((item) => [
    item.description,
    money(item.qty),
    item.unit,
    rupiah(item.unitPrice),
    rupiah(item.total),
  ]);

  d.add(
    table({
      head: [
        L(locale, "Uraian", "Description"),
        L(locale, "Jumlah", "Qty"),
        L(locale, "Satuan", "Unit"),
        L(locale, "Harga Satuan", "Unit Price"),
        L(locale, "Total", "Total"),
      ],
      widths: ["auto", 18, 20, 30, 35],
      align: ["left", "right", "left", "right", "right"],
      rows,
      totalRow: rows.length,
      labelCol: 3,
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 50,
      pairs: [
        { label: L(locale, "Subtotal", "Subtotal"), value: rupiah(input.subtotal) },
        ...(input.taxAmount !== undefined
          ? [{ label: `${L(locale, "PPN", "VAT")} (${input.taxRate ?? 11}%)`, value: rupiah(input.taxAmount) }]
          : []),
        { label: L(locale, "Total Nilai", "Total Amount"), value: rupiah(input.totalAmount), bold: true },
      ],
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Syarat Pembayaran", "Payment Terms"), value: input.paymentTerms },
        { label: L(locale, "Syarat Pengiriman", "Delivery Terms"), value: input.deliveryTerms ?? "-" },
      ],
    }),
  );

  if (input.notes && input.notes.trim() !== "") {
    d.add(spacer(2));
    d.add(
      callout([`${L(locale, "Catatan", "Notes")}: ${input.notes}`], {
        fill: COLOR.softFill,
        border: COLOR.hair,
      }),
    );
  }

  d.add(spacer(3));
  d.add(
    paragraph({
      text: L(
        locale,
        "Demikian purchase order ini diterbitkan untuk dilaksanakan.",
        "This purchase order is issued for execution.",
      ),
      size: 10,
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Pemesan", "Orderer"), name: input.nameOrderer, rows: 5 },
      { role: L(locale, "Menyetujui", "Approver"), name: input.nameApprover, rows: 5 },
    ]),
  );

  return d;
}