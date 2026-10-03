/* Slip Gaji - dokumen gaji karyawan.
 *
 * Dokumen pribadi yang diberikan ke karyawan. Memuat: periode, komponen
 * gaji (gaji pokok, tunjangan, potongan), total, dan tanda tangan karyawan.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, spacer } from "../blocks.js";
import { companyKop, docTitle, L, type Locale } from "./shared.js";

export interface SlipGajiInput {
  id: string;
  karyawan: string;
  periode: string;
  tipe: string;
  rows: Array<{ komponen: string; nilai: string }>;
  netLabel: string;
  net: string;
  status: string;
  locale?: Locale;
}

export function slipGaji(input: SlipGajiInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Slip Gaji ${input.id}`,
    subject: `Slip Gaji - ${input.karyawan}`,
    ...opts,
  });

  d.add(
    docTitle({
      title: L(locale, "SLIP GAJI", "PAY SLIP"),
      ref: `${L(locale, "No", "No")}. ${input.id}`,
    }),
  );

  d.add(
    keyValue({
      labelW: 35,
      pairs: [
        { label: L(locale, "Karyawan", "Employee"), value: input.karyawan, bold: true },
        { label: L(locale, "Periode", "Period"), value: input.periode },
        { label: L(locale, "Tipe", "Type"), value: input.tipe },
      ],
    }),
  );

  d.add(spacer(2));
  const rows = input.rows.map((r) => [r.komponen, r.nilai]);
  rows.push([input.netLabel, input.net]);

  d.add(
    table({
      head: [L(locale, "Komponen", "Component"), L(locale, "Nilai", "Amount")],
      widths: ["auto", 42],
      align: ["left", "right"],
      rows,
      totalRow: rows.length - 1,
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 35,
      pairs: [{ label: L(locale, "Status", "Status"), value: input.status }],
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Tanda Tangan Karyawan", "Employee Signature"), name: "", rows: 5 },
    ]),
  );

  return d;
}