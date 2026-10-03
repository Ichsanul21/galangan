/* SPT (Surat Pemberitahuan Pajak) - dokumen pelaporan pajak.
 *
 * Digunakan di modul Finance untuk melaporkan pajak bulanan/tahunan.
 * Memuat: periode pajak, rincian PPN/PPh, dan bukti setor.
 *
 * Bentuk rinciannya berupa BARIS, bukan empat field tetap. Modul Finance punya
 * PPh 21/22/23/24/25/26 plus PPN keluaran/masukan, dan kolom di SPT harus
 * memuat semua yang terutang - bukan empat yang happened to ada di factory.
 * Versi sebelumnya punya `ppnKeluaran`/`pphPotongan`/`pphSetoran` yang tidak
 * pernah ditulis modul Finance, jadi dokumen yang tercetak bisa kosong
 * padahal pembukuan mencatat pajak.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, spacer, callout } from "../blocks.js";
import { COLOR } from "../theme.js";
import { companyKop, docTitle, longDate, rupiah, L, type Locale } from "./shared.js";

export interface SptRow {
  jenis: string;
  /** Dasar pengenaan; string kosong berarti tidak punya dasar (mis. PPh 22). */
  dasar?: string;
  /** Persentase; string kosong berarti bukan persen (mis. PPh 21 = total payroll). */
  tarif?: string;
  nilai: number;
}

export interface SptInput {
  periode: string;
  tanggal: string;
  jenisPajak: string;
  masaPajak: string;
  npwp: string;
  /** NPWP penyetor kalau berbeda dari NPWP perusahaan. */
  npwpPenyetor?: string;
  namaWajibPajak: string;
  alamat: string;
  rows: SptRow[];
  /** PPN terutang setelah override manual; boleh berbeda dari penjumlahan baris. */
  ppnTerutang: number;
  totalSetor: number;
  buktiSetor?: string;
  tanggalSetor?: string;
  formulir?: string;
  bank?: string;
  teller?: string;
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

  const identity: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggal) },
    { label: L(locale, "Jenis Pajak", "Tax Type"), value: input.jenisPajak, bold: true },
    { label: L(locale, "Masa Pajak", "Tax Period"), value: input.masaPajak },
    { label: "NPWP", value: input.npwp, bold: true },
  ];
  if (input.npwpPenyetor) {
    identity.push({ label: L(locale, "NPWP Penyetor", "Depositor NPWP"), value: input.npwpPenyetor });
  }
  identity.push({ label: L(locale, "Nama Wajib Pajak", "Taxpayer Name"), value: input.namaWajibPajak, bold: true });
  identity.push({ label: L(locale, "Alamat", "Address"), value: input.alamat });
  if (input.formulir) {
    identity.push({ label: L(locale, "Nomor Formulir", "Form Number"), value: input.formulir });
  }
  if (input.tanggalSetor) {
    identity.push({ label: L(locale, "Tanggal Setor", "Payment Date"), value: longDate(input.tanggalSetor) });
  }
  if (input.bank) {
    identity.push({ label: L(locale, "Bank", "Bank"), value: input.bank });
  }
  if (input.teller) {
    identity.push({ label: L(locale, "Teller", "Teller"), value: input.teller });
  }
  d.add(keyValue({ labelW: 45, pairs: identity }));

  d.add(spacer(3));
  d.add(
    paragraph({
      text: L(locale, "Rincian Pajak:", "Tax Details:"),
      size: 10,
      font: "bold",
    }),
  );

  const body: Array<[string, string, string, string]> = input.rows.map((r) => [
    r.jenis,
    r.dasar ?? "-",
    r.tarif ?? "-",
    rupiah(r.nilai),
  ]);
  /* Baris PPN terutang dicetak eksplisit: kalau ada override manual, angkanya
     tidak sama dengan penjumlahan baris di atasnya, dan itu wajib terlihat -
     dokumen pajak yang angkanya tidak bisa ditelusuri tidak bisa diaudit. */
  body.push([L(locale, "PPN Terutang", "VAT Payable"), "-", "-", rupiah(input.ppnTerutang)]);
  body.push([L(locale, "Total Setor", "Total Payable"), "-", "-", rupiah(input.totalSetor)]);

  d.add(
    table({
      head: [
        L(locale, "Uraian", "Description"),
        L(locale, "Dasar Pengenaan", "Tax Base"),
        L(locale, "Tarif", "Rate"),
        L(locale, "Nilai (Rp)", "Amount (Rp)"),
      ],
      widths: ["auto", 34, 18, 34],
      align: ["left", "right", "right", "right"],
      rows: body,
      totalRow: body.length - 1,
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