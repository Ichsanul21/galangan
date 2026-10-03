/* Surat Jalan (Goods Note) - dokumen pengiriman barang dari gudang.
 *
 * Digunakan saat barang keluar dari gudang untuk dikirim ke proyek atau
 * vendor. Memuat: tanggal, tujuan, daftar barang dengan kuantitas, dan
 * tanda tangan penerima + penyerah.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, spacer } from "../blocks.js";
import { companyKop, docTitle, longDate, L, type Locale } from "./shared.js";

export interface SuratJalanInput {
  no: string;
  tanggal: string;
  tujuan?: string;
  projectName?: string;
  items: Array<{ name: string; qty: string }>;
  receiver: string;
  giver: string;
  locale?: Locale;
}

export function suratJalan(input: SuratJalanInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Surat Jalan ${input.no}`,
    subject: `Pengiriman barang - ${input.no}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "SURAT JALAN", "DELIVERY NOTE"),
      ref: `${L(locale, "No", "No")}. ${input.no}`,
    }),
  );

  const pairs = [
    { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggal) },
  ];
  if (input.tujuan) pairs.push({ label: L(locale, "Tujuan", "Destination"), value: input.tujuan });
  if (input.projectName) pairs.push({ label: L(locale, "Proyek", "Project"), value: input.projectName });

  d.add(keyValue({ labelW: 35, pairs }));
  d.add(spacer(2));

  const rows = input.items.map((item, i) => [String(i + 1), item.name, item.qty]);
  d.add(
    table({
      head: [L(locale, "No", "No"), L(locale, "Nama Barang", "Item Name"), L(locale, "Jumlah", "Qty")],
      widths: [10, "auto", 26],
      align: ["center", "left", "right"],
      rows,
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Penerima", "Receiver"), name: input.receiver, rows: 5 },
      { role: L(locale, "Penyerah", "Giver"), name: input.giver, rows: 5 },
    ]),
  );

  return d;
}