/* Tanda Terima - dokumen penerimaan barang/dokumen.
 *
 * Digunakan saat menerima barang atau dokumen dari pihak lain. Memuat:
 * tanggal, asal, daftar item/dokumen, dan tanda tangan penerima + pemberi.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, table, signatures, spacer } from "../blocks.js";
import { companyKop, docTitle, longDate, L, type Locale } from "./shared.js";

export interface TandaTerimaInput {
  no: string;
  tanggal: string;
  asal?: string;
  projectName?: string;
  /* Baris tambahan sesuai konteks penerimaan (mis. nomor surat jalan yang
     dilayani, nama kapal). */
  extra?: Array<{ label: string; value: string }>;
  items: Array<{ name: string; qty: string }>;
  receiver: string;
  giver: string;
  locale?: Locale;
}

export function tandaTerima(input: TandaTerimaInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Tanda Terima ${input.no}`,
    subject: `Tanda Terima - ${input.no}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "TANDA TERIMA", "RECEIPT"),
      ref: `${L(locale, "No", "No")}. ${input.no}`,
    }),
  );

  const pairs = [
    { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggal) },
  ];
  if (input.asal) pairs.push({ label: L(locale, "Dari", "From"), value: input.asal });
  if (input.projectName) pairs.push({ label: L(locale, "Proyek", "Project"), value: input.projectName });
  for (const e of input.extra ?? []) {
    if (e.value.trim() !== "") pairs.push({ label: e.label, value: e.value });
  }

  d.add(keyValue({ labelW: 35, pairs }));
  d.add(spacer(2));

  const rows = input.items.map((item, i) => [String(i + 1), item.name, item.qty]);
  d.add(
    table({
      head: [L(locale, "No", "No"), L(locale, "Nama", "Name"), L(locale, "Jumlah", "Qty")],
      widths: [10, "auto", 26],
      align: ["center", "left", "right"],
      rows,
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Penerima", "Receiver"), name: input.receiver, rows: 5 },
      { role: L(locale, "Pemberi", "Giver"), name: input.giver, rows: 5 },
    ]),
  );

  return d;
}