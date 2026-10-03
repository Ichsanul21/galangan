/* Delivery Order - dokumen pengiriman barang dari vendor ke perusahaan.
 *
 * Digunakan saat barang diterima dari vendor. Memuat: tanggal, asal barang,
 * daftar barang dengan kuantitas, dan tanda tangan penerima + pengirim.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, table, signatures, spacer } from "../blocks.js";
import { companyKop, docTitle, longDate, L, type Locale } from "./shared.js";

export interface DeliveryOrderInput {
  no: string;
  tanggal: string;
  /** Asal barang (DO dari vendor). */
  asal?: string;
  /** TujuanDO milik gudang: barang dikirim ke kapal/proyek, bukan diterima. */
  tujuan?: string;
  /** Driver pengantar;SJ dan DO Departemen Logistik selalu menyebutnya. */
  driver?: string;
  /** Nomor surat jalan yang dilayani. */
  sjRef?: string;
  projectName?: string;
  items: Array<{ name: string; qty: string }>;
  receiver: string;
  sender: string;
  locale?: Locale;
}

export function deliveryOrder(input: DeliveryOrderInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `DO ${input.no}`,
    subject: `Delivery Order - ${input.no}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "DELIVERY ORDER", "DELIVERY ORDER"),
      ref: `${L(locale, "No", "No")}. ${input.no}`,
    }),
  );

  const pairs = [
    { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggal) },
  ];
  if (input.asal) pairs.push({ label: L(locale, "Asal", "From"), value: input.asal });
  if (input.tujuan) pairs.push({ label: L(locale, "Tujuan", "Destination"), value: input.tujuan });
  if (input.driver) pairs.push({ label: L(locale, "Driver", "Driver"), value: input.driver });
  if (input.sjRef) pairs.push({ label: L(locale, "Surat Jalan", "Delivery note"), value: input.sjRef });
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
      { role: L(locale, "Pengirim", "Sender"), name: input.sender, rows: 5 },
    ]),
  );

  return d;
}