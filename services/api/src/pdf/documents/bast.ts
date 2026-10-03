/* Berita Acara Serah Terima (BAST).
 *
 * Dokumen resmi yang mencatat penyerahan pekerjaan dari subkontraktor ke
 * perusahaan. Memuat: identitas pihak, ruang lingkup pekerjaan yang
 * diserahkan, tanggal serah terima, dan tanda tangan kedua belah pihak.
 *
 * Client requirement 2 Oktober: "pada tab section termin saat bayar,
 * tambahkan requirement invoice dan bast, lalu terbitkan bukti bayar."
 * BAST adalah syarat wajib sebelum kwitansi diterbitkan.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, spacer, callout } from "../blocks.js";
import { COLOR } from "../theme.js";
import { companyKop, docTitle, longDate, rupiah, L, type Locale } from "./shared.js";

export interface BastInput {
  no: string;
  tanggal: string;
  projectName: string;
  /** Milestone WBS yang diserahterimakan; dicetak sebagai uraian pekerjaan. */
  milestone?: string;
  subcontractorName: string;
  subcontractorAddress?: string;
  scopeOfWork: string;
  /** Nilai serah terima; boleh 0 (BAST tanpa nilai tetap sah). */
  nilai?: number;
  deliverables: Array<{ description: string; qty?: number; unit?: string; status: string }>;
  notes?: string;
  nameReceiver: string;
  nameGiver: string;
  locale?: Locale;
}

export function bast(input: BastInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `BAST ${input.no}`,
    subject: `Berita Acara Serah Terima - ${input.projectName}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "BERITA ACARA SERAH TERIMA", "HANDOVER CERTIFICATE"),
      ref: `${L(locale, "No", "No")}. ${input.no}   ${L(locale, "Tanggal", "Date")} ${longDate(input.tanggal)}`,
    }),
  );

  d.add(
    paragraph({
      text: L(
        locale,
        "Pada hari ini, telah dilakukan serah terima pekerjaan dengan rincian sebagai berikut:",
        "Today, the handover of work has been completed with the following details:",
      ),
      size: 10,
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Proyek", "Project"), value: input.projectName, bold: true },
        ...(input.milestone ? [{ label: L(locale, "Milestone", "Milestone"), value: input.milestone }] : []),
        { label: L(locale, "Subkontraktor", "Subcontractor"), value: input.subcontractorName },
        { label: L(locale, "Alamat", "Address"), value: input.subcontractorAddress ?? "-" },
        /* Nilai serah terima ikut tercetak: BAST tanpa nominal tidak bisa
           dipertanggungjawabkan sebagai dasar terminated. */
        ...(input.nilai !== undefined
          ? [{ label: L(locale, "Nilai", "Value"), value: rupiah(input.nilai), bold: true }]
          : []),
      ],
    }),
  );

  d.add(spacer(2));
  d.add(
    paragraph({
      text: L(locale, "Ruang Lingkup Pekerjaan:", "Scope of Work:"),
      size: 10,
      font: "bold",
    }),
  );
  d.add(paragraph({ text: input.scopeOfWork, size: 10 }));

  d.add(spacer(2));
  d.add(
    paragraph({
      text: L(locale, "Rincian Penyerahan:", "Deliverables:"),
      size: 10,
      font: "bold",
    }),
  );

  const rows = input.deliverables.map((item) => [
    item.description,
    item.qty !== undefined ? String(item.qty) : "-",
    item.unit ?? "-",
    item.status,
  ]);

  d.add(
    table({
      head: [
        L(locale, "Uraian", "Description"),
        L(locale, "Jumlah", "Qty"),
        L(locale, "Satuan", "Unit"),
        L(locale, "Status", "Status"),
      ],
      widths: ["auto", 20, 20, 25],
      align: ["left", "right", "left", "left"],
      rows,
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
        "Demikian berita acara serah terima ini dibuat untuk dipergunakan sebagaimana mestinya.",
        "This handover certificate is made for proper use.",
      ),
      size: 10,
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Penerima", "Receiver"), name: input.nameReceiver, rows: 5 },
      { role: L(locale, "Penyerah", "Giver"), name: input.nameGiver, rows: 5 },
    ]),
  );

  return d;
}