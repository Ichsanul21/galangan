/* Surat Persetujuan Cuti/Izin.
 *
 * Dokumen resmi yang diterbitkan HR setelah pengajuan cuti/izin disetujui.
 * Memuat: data karyawan, jenis pengajuan, periode, durasi, alasan, dan
 * tanda tangan atasan + direksi.
 *
 * Client requirement 2 Oktober: "saat disetujui maka generate surat
 * persetujuan cuti/izin berdasarkan nama, tipe pengajuan, durasi, dari dan
 * sampai kapan, dll."
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, signatures, spacer, callout } from "../blocks.js";
import { COLOR } from "../theme.js";
import { companyKop, docTitle, longDate, L, loadEntity, str, num, type Locale } from "./shared.js";

export interface SuratCutiInput {
  no: string;
  tanggal: string;
  namaKaryawan: string;
  nip?: string;
  jabatan: string;
  departemen?: string;
  jenis: "Cuti" | "Izin";
  alasan?: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  jumlahHari: number;
  namaAtasan: string;
  namaDireksi: string;
  locale?: Locale;
}

export function suratCuti(input: SuratCutiInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `Surat Persetujuan ${input.jenis}`,
    subject: `${input.jenis} karyawan ${input.namaKaryawan}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "SURAT PERSETUJUAN", "APPROVAL LETTER"),
      ref: `${L(locale, "No", "No")}. ${input.no}   ${L(locale, "Tanggal", "Date")} ${longDate(input.tanggal)}`,
    }),
  );

  d.add(
    paragraph({
      text: L(
        locale,
        "Dengan ini kami memberitahukan bahwa pengajuan cuti/izin atas nama karyawan berikut telah disetujui:",
        "We hereby inform that the leave/permission request for the following employee has been approved:",
      ),
      size: 10,
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Nama", "Name"), value: input.namaKaryawan, bold: true },
        { label: "NIP", value: input.nip ?? "-" },
        { label: L(locale, "Jabatan", "Position"), value: input.jabatan },
        { label: L(locale, "Departemen", "Department"), value: input.departemen ?? "-" },
      ],
    }),
  );

  d.add(spacer(2));
  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Jenis", "Type"), value: input.jenis, bold: true },
        { label: L(locale, "Dari", "From"), value: longDate(input.tanggalMulai) },
        { label: L(locale, "Sampai", "To"), value: longDate(input.tanggalSelesai) },
        { label: L(locale, "Durasi", "Duration"), value: `${input.jumlahHari} ${L(locale, "hari", "days")}` },
      ],
    }),
  );

  if (input.alasan && input.alasan.trim() !== "") {
    d.add(spacer(2));
    d.add(
      callout([`${L(locale, "Alasan", "Reason")}: ${input.alasan}`], {
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
        "Demikian surat persetujuan ini diterbitkan untuk dipergunakan sebagaimana mestinya.",
        "This approval letter is issued for proper use.",
      ),
      size: 10,
    }),
  );

  d.add(spacer(4));
  d.add(
    signatures([
      { role: L(locale, "Atasan Langsung", "Direct Supervisor"), name: input.namaAtasan, rows: 5 },
      { role: L(locale, "Direksi", "Director"), name: input.namaDireksi, rows: 5 },
    ]),
  );

  return d;
}