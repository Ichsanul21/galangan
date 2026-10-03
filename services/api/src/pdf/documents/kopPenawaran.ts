/* Kop Penawaran - halaman sampul quotation.
 *
 * Dokumen resmi yang menyertai quotation. Memuat: informasi quotation,
 * nilai total, masa berlaku, dan tanda tangan.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, signatures, spacer } from "../blocks.js";
import { companyKop, docTitle, longDate, rupiah, L, type Locale } from "./shared.js";

export interface KopPenawaranInput {
  no: string;
  tanggal: string;
  clientName: string;
  projectName: string;
  totalValue: number;
  validUntil: string;
  notes?: string;
  nameSigner: string;
  locale?: Locale;
}

export function kopPenawaran(input: KopPenawaranInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Kop Penawaran ${input.no}`,
    subject: `Quotation - ${input.no}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "PENAWARAN", "QUOTATION"),
      ref: `${L(locale, "No", "No")}. ${input.no}   ${L(locale, "Tanggal", "Date")} ${longDate(input.tanggal)}`,
    }),
  );

  d.add(
    paragraph({
      text: L(locale, "Kepada Yth:", "To:"),
      size: 10,
      font: "bold",
    }),
  );
  d.add(paragraph({ text: input.clientName, size: 10 }));

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Proyek", "Project"), value: input.projectName, bold: true },
        { label: L(locale, "Nilai Total", "Total Value"), value: rupiah(input.totalValue), bold: true },
        { label: L(locale, "Berlaku Sampai", "Valid Until"), value: longDate(input.validUntil) },
      ],
    }),
  );

  if (input.notes && input.notes.trim() !== "") {
    d.add(spacer(2));
    d.add(paragraph({ text: input.notes, size: 10 }));
  }

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Hormat Kami", "Sincerely"), name: input.nameSigner, rows: 5 },
    ]),
  );

  return d;
}