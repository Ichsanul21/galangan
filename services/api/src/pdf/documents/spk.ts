/* Surat Perintah Kerja (SPK).
 *
 * Dokumen resmi yang memerintahkan subkontraktor untuk melaksanakan pekerjaan.
 * Memuat: identitas pihak, ruang lingkup pekerjaan, jadwal pelaksanaan,
 * nilai kontrak, syarat pembayaran, dan tanda tangan kedua belah pihak.
 *
 * Client requirement 2 Oktober: "generated documents persetujuan po wo kwitansi
 * dll" - SPK adalah dokumen perintah kerja (work order) yang wajib ada sebelum
 * pekerjaan dimulai.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, signatures, spacer, callout } from "../blocks.js";
import { COLOR } from "../theme.js";
import { companyKop, docTitle, longDate, rupiah, L, type Locale } from "./shared.js";

export interface SpkInput {
  no: string;
  tanggal: string;
  projectName: string;
  subcontractorName: string;
  subcontractorAddress?: string;
  subcontractorNPWP?: string;
  scopeOfWork: string;
  startDate: string;
  endDate: string;
  contractValue: number;
  paymentTerms: string;
  k3Requirements?: string;
  nameDirector: string;
  nameSubcontractor: string;
  locale?: Locale;
}

export function spk(input: SpkInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `SPK ${input.no}`,
    subject: `Surat Perintah Kerja - ${input.projectName}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "SURAT PERINTAH KERJA", "WORK ORDER"),
      ref: `${L(locale, "No", "No")}. ${input.no}   ${L(locale, "Tanggal", "Date")} ${longDate(input.tanggal)}`,
    }),
  );

  d.add(
    paragraph({
      text: L(
        locale,
        "Dengan ini kami memerintahkan kepada:",
        "We hereby order the following:",
      ),
      size: 10,
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Subkontraktor", "Subcontractor"), value: input.subcontractorName, bold: true },
        { label: "NPWP", value: input.subcontractorNPWP ?? "-" },
        { label: L(locale, "Alamat", "Address"), value: input.subcontractorAddress ?? "-" },
      ],
    }),
  );

  d.add(spacer(2));
  d.add(
    paragraph({
      text: L(
        locale,
        `Untuk melaksanakan pekerjaan pada proyek ${input.projectName} dengan ketentuan sebagai berikut:`,
        `To carry out work on the project ${input.projectName} with the following terms:`,
      ),
      size: 10,
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Ruang Lingkup", "Scope"), value: input.scopeOfWork },
        { label: L(locale, "Mulai", "Start"), value: longDate(input.startDate) },
        { label: L(locale, "Selesai", "End"), value: longDate(input.endDate) },
        { label: L(locale, "Nilai Kontrak", "Contract Value"), value: rupiah(input.contractValue), bold: true },
        { label: L(locale, "Syarat Pembayaran", "Payment Terms"), value: input.paymentTerms },
      ],
    }),
  );

  if (input.k3Requirements && input.k3Requirements.trim() !== "") {
    d.add(spacer(2));
    d.add(
      callout([`${L(locale, "Persyaratan K3", "HSE Requirements")}: ${input.k3Requirements}`], {
        fill: COLOR.softFill,
        border: COLOR.warn,
      }),
    );
  }

  d.add(spacer(3));
  d.add(
    paragraph({
      text: L(
        locale,
        "Demikian surat perintah kerja ini diterbitkan untuk dilaksanakan dengan penuh tanggung jawab.",
        "This work order is issued to be carried out with full responsibility.",
      ),
      size: 10,
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Direksi", "Director"), name: input.nameDirector, rows: 5 },
      { role: L(locale, "Subkontraktor", "Subcontractor"), name: input.nameSubcontractor, rows: 5 },
    ]),
  );

  return d;
}