/* Transmittal - dokumen pengiriman gambar/dokumen teknis.
 *
 * Digunakan di modul QC untuk mendistribusikan gambar teknis ke pihak terkait.
 * Memuat: tanggal, daftar dokumen yang dikirim, tujuan, dan tanda tangan.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, spacer } from "../blocks.js";
import { companyKop, docTitle, longDate, L, type Locale } from "./shared.js";

export interface TransmittalInput {
  no: string;
  tanggal: string;
  projectName?: string;
  to: string;
  attention?: string;
  items: Array<{ code: string; title: string; revision: string; status: string }>;
  notes?: string;
  sender: string;
  locale?: Locale;
}

export function transmittal(input: TransmittalInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Transmittal ${input.no}`,
    subject: `Pengiriman dokumen - ${input.no}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "TRANSMITTAL", "TRANSMITTAL"),
      ref: `${L(locale, "No", "No")}. ${input.no}`,
    }),
  );

  const pairs = [
    { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggal) },
    { label: L(locale, "Kepada", "To"), value: input.to, bold: true },
  ];
  if (input.attention) pairs.push({ label: L(locale, "u.p.", "Attn"), value: input.attention });
  if (input.projectName) pairs.push({ label: L(locale, "Proyek", "Project"), value: input.projectName });

  d.add(keyValue({ labelW: 35, pairs }));
  d.add(spacer(2));

  d.add(
    paragraph({
      text: L(locale, "Bersama ini kami kirimkan dokumen berikut:", "We hereby transmit the following documents:"),
      size: 10,
    }),
  );

  const rows = input.items.map((item, i) => [
    String(i + 1),
    item.code,
    item.title,
    item.revision,
    item.status,
  ]);

  d.add(
    table({
      head: [
        L(locale, "No", "No"),
        L(locale, "Kode", "Code"),
        L(locale, "Judul", "Title"),
        L(locale, "Revisi", "Rev"),
        L(locale, "Status", "Status"),
      ],
      widths: [10, 25, "auto", 18, 25],
      align: ["center", "left", "left", "center", "left"],
      rows,
    }),
  );

  if (input.notes && input.notes.trim() !== "") {
    d.add(spacer(2));
    d.add(paragraph({ text: `${L(locale, "Catatan", "Notes")}: ${input.notes}`, size: 9 }));
  }

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Pengirim", "Sender"), name: input.sender, rows: 5 },
    ]),
  );

  return d;
}