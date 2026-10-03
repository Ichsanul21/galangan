/* SPT (Surat Pemberitahuan Pajak) - dokumen pelaporan pajak.
 *
 * Digunakan di modul Finance untuk melaporkan pajak bulanan/tahunan.
 * Memuat: periode pajak, rincian PPN/PPh, dan bukti setor.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, spacer, callout } from "../blocks.js";
import { COLOR } from "../theme.js";
import { companyKop, docTitle, longDate, rupiah, L, type Locale } from "./shared.js";

export interface SptInput {
  periode: string;
  tanggal: string;
  jenisPajak: string;
  masaPajak: string;
  npwp: string;
  namaWajibPajak: string;
  alamat: string;
  ppnKeluaran?: number;
  ppnMasukan?: number;
  pphPotongan?: number;
  pphSetoran?: number;
  totalSetor: number;
  buktiSetor?: string;
  namaPenandatangan: string;
  jabatanPenandatangan: string;
  locale?: Locale;
}

export function spt(input: SptInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `SPT ${input.periode}`,
    subject: `Surat Pemberitahuan Pajak - ${input.periode}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "SURAT PEMBERITAHUAN PAJAK", "TAX NOTIFICATION LETTER"),
      ref: `${L(locale, "Periode", "Period")}: ${input.periode}`,
    }),
  );

  d.add(
    keyValue({
      labelW: 45,
      pairs: [
        { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggal) },
        { label: L(locale, "Jenis Pajak", "Tax Type"), value: input.jenisPajak, bold: true },
        { label: L(locale, "Masa Pajak", "Tax Period"), value: input.masaPajak },
        { label: "NPWP", value: input.npwp },
        { label: L(locale, "Nama Wajib Pajak", "Taxpayer Name"), value: input.namaWajibPajak, bold: true },
        { label: L(locale, "Alamat", "Address"), value: input.alamat },
      ],
    }),
  );

  d.add(spacer(3));
  d.add(
    paragraph({
      text: L(locale, "Rincian Pajak:", "Tax Details:"),
      size: 10,
      font: "bold",
    }),
  );

  const rows: Array<[string, string]> = [];
  if (input.ppnKeluaran !== undefined) {
    rows.push([L(locale, "PPN Keluaran", "Output VAT"), rupiah(input.ppnKeluaran)]);
  }
  if (input.ppnMasukan !== undefined) {
    rows.push([L(locale, "PPN Masukan", "Input VAT"), rupiah(input.ppnMasukan)]);
  }
  if (input.pphPotongan !== undefined) {
    rows.push([L(locale, "PPh Potongan", "Income Tax Withheld"), rupiah(input.pphPotongan)]);
  }
  if (input.pphSetoran !== undefined) {
    rows.push([L(locale, "PPh Setoran", "Income Tax Paid"), rupiah(input.pphSetoran)]);
  }
  rows.push([L(locale, "Total Setor", "Total Payable"), rupiah(input.totalSetor)]);

  d.add(
    table({
      head: [L(locale, "Uraian", "Description"), L(locale, "Jumlah (Rp)", "Amount (Rp)")],
      widths: ["auto", 45],
      align: ["left", "right"],
      rows,
      totalRow: rows.length - 1,
    }),
  );

  if (input.buktiSetor) {
    d.add(spacer(2));
    d.add(
      callout([`${L(locale, "Bukti Setor", "Payment Proof")}: ${input.buktiSetor}`], {
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
        "Demikian surat pemberitahuan pajak ini dibuat dengan sebenar-benarnya.",
        "This tax notification letter is made truthfully.",
      ),
      size: 10,
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: input.jabatanPenandatangan, name: input.namaPenandatangan, rows: 5 },
    ]),
  );

  return d;
}