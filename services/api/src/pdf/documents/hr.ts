/* Dokumen HR: surat persetujuan cuti/izin dan surat HR (SP1/SP2/SP3).
 *
 * Permintaan client 2 Oktober untuk surat persetujuan cuti: "generate surat
 * persetujuan cuti/izin berdasarkan nama, tipe pengajuan, durasi, dari dan
 * sampai kapan, dll." Semua field itu ada di baris `leaves` - yang belum ada
 * adalah dokumennya, jadi factory ini merakit dari data itu apa adanya,
 * tidak menebak dan tidak membaca dari layar.
 *
 * Surat persetujuan adalah dokumen yang dibaca karyawan, jadi dua hal
 * dijaga: nama dan tanggal pengajuan HARUS tercetak (surat tanpa nama tidak
 * berlaku), dan durasi harus terhitung sendiri dari tanggal - bukan
 * menampilkan angka yang diketik user, karena angka itulah yang paling sering
 * tidak sinkron dengan rentang tanggal.
 */
import { Document, type DocOptions } from "../document.js";
import { keyValue, paragraph, table, signatures, divider, callout } from "../blocks.js";
import { COLOR, TYPE } from "../theme.js";
import { companyKop, docTitle, longDate, shortDate, L, type Locale } from "./shared.js";

export interface CutiDocInput {
  no: string;
  /** Nama lengkap karyawan. */
  nama: string;
  /** NIK / NIP. */
  nik: string;
  jabatan: string;
  unit: string;
  /** "Tahunan" | "Sakit" | "Izin" | "Melahirkan" | "Lainnya". */
  tipe: string;
  from: string;
  to: string;
  /** Alasan; boleh kosong. */
  alasan: string;
  /** Nama & jabatan pemberi persetujuan HRD. */
  approverNama: string;
  approverJabatan: string;
  /** Tanggal persetujuan. */
  tanggalPersetujuan: string;
  locale?: Locale;
}

/** Jumlah hari inklusif antara dua tanggal ISO; 0 bila tidak valid. */
export function durationDays(from: string, to: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(from ?? ""));
  const b = /^(\d{4})-(\d{2})(-(\d{2}))?/.exec(String(to ?? ""));
  if (!a || !b) return 0;
  const start = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const end = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3] ?? "01"));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function suratPersetujuanCutiDoc(input: CutiDocInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const days = durationDays(input.from, input.to);
  const d = new Document({
    title: `Surat Persetujuan Cuti/Izin ${input.no}`,
    subject: "Persetujuan pengajuan cuti dan izin",
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: L(locale, "SURAT PERSETUJUAN CUTI/IZIN", "LEAVE/PERMISSION APPROVAL LETTER"),
      ref: `${L(locale, "No", "No")}. ${input.no}`,
    }),
  );

  d.add(
    paragraph({
      text: L(
        locale,
        "Yang bertanda tangan di bawah ini menerangkan bahwa:",
        "The undersigned hereby certifies that:",
      ),
      size: TYPE.base,
    }),
  );

  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Nama", "Name"), value: input.nama, bold: true },
        { label: "NIK/NIP", value: input.nik },
        { label: L(locale, "Jabatan", "Position"), value: input.jabatan },
        { label: L(locale, "Unit Kerja", "Work Unit"), value: input.unit },
      ],
    }),
  );

  d.add(divider());

  d.add(
    paragraph({
      text: L(locale, "Telah disetujui pengajuan:", "The following request has been approved:"),
      size: TYPE.base,
      font: "bold",
    }),
  );

  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Jenis", "Type"), value: input.tipe, bold: true },
        { label: L(locale, "Periode", "Period"), value: `${shortDate(input.from)} - ${shortDate(input.to)}` },
        { label: L(locale, "Durasi", "Duration"), value: `${days} ${L(locale, "hari", "days")}`, bold: true },
        { label: L(locale, "Alasan", "Reason"), value: input.alasan || "-" },
      ],
    }),
  );

  if (input.alasan.trim() !== "") {
    d.add(
      callout([
        L(
          locale,
          "Surat ini diterbitkan sebagai bukti persetujuan resmi. Karyawan yang bersangkutan diharapkan menyelesaikan tugas-tugas yang tertunda sebelum meninggalkan pekerjaan.",
          "This letter is issued as proof of official approval. The employee is expected to complete pending tasks before leaving work.",
        ),
      ]),
    );
  }

  d.add(divider());

  d.add(
    paragraph({
      text: L(
        locale,
        `Demikian surat persetujuan ini diterbitkan pada ${longDate(input.tanggalPersetujuan)} untuk dipergunakan sebagaimana mestinya.`,
        `This approval letter is issued on ${longDate(input.tanggalPersetujuan)} for proper use.`,
      ),
      size: TYPE.base,
    }),
  );

  d.add(
    signatures([
      { role: L(locale, "Disetujui oleh", "Approved by"), name: input.approverNama, rows: 4 },
    ]),
  );

  d.add(
    paragraph({
      text: `${input.approverNama}\n${input.approverJabatan}`,
      size: TYPE.base - 1,
      align: "right",
    }),
  );

  return d;
}

/* ==========================================================================
   Surat Peringatan (SP1/SP2/SP3)
   ========================================================================== */

export interface SuratHrInput {
  no: string;
  tanggal: string;
  /** "SP1" | "SP2" | "SP3" | "Surat Teguran" | dll. */
  jenis: string;
  namaKaryawan: string;
  nik: string;
  jabatan: string;
  unit: string;
  /** Pelanggaran yang dilakukan. */
  pelanggaran: string;
  /** Tanggal pelanggaran. */
  tanggalPelanggaran: string;
  /** Tindakan yang diambil. */
  tindakan: string;
  /** Berlaku sampai kapan (untuk SP dengan masa berlaku). */
  berlakuSampai?: string;
  namaPemberi: string;
  jabatanPemberi: string;
  locale?: Locale;
}

export function suratHrDoc(input: SuratHrInput, opts: DocOptions = {}): Document {
  const locale = input.locale ?? "id";
  const d = new Document({
    title: `${input.jenis} ${input.no}`,
    subject: `${input.jenis} - ${input.namaKaryawan}`,
    ...opts,
  });

  d.add(companyKop());
  d.add(
    docTitle({
      title: input.jenis.toUpperCase(),
      ref: `${L(locale, "No", "No")}. ${input.no}`,
    }),
  );

  d.add(
    paragraph({
      text: L(locale, "Kepada Yth,", "To,"),
      size: TYPE.base,
    }),
  );
  d.add(
    paragraph({
      text: input.namaKaryawan,
      size: TYPE.base,
      font: "bold",
    }),
  );
  d.add(
    paragraph({
      text: `${input.jabatan} - ${input.unit}`,
      size: TYPE.base - 1,
    }),
  );

  d.add(divider());

  d.add(
    paragraph({
      text: L(
        locale,
        "Dengan ini kami sampaikan bahwa berdasarkan evaluasi terhadap kinerja dan perilaku Saudara, ditemukan pelanggaran sebagai berikut:",
        "We hereby inform you that based on evaluation of your performance and conduct, the following violation has been found:",
      ),
      size: TYPE.base,
    }),
  );

  d.add(
    keyValue({
      labelW: 40,
      pairs: [
        { label: L(locale, "Jenis Pelanggaran", "Violation Type"), value: input.pelanggaran, bold: true },
        { label: L(locale, "Tanggal", "Date"), value: longDate(input.tanggalPelanggaran) },
        { label: L(locale, "Tindakan", "Action"), value: input.tindakan, bold: true },
      ],
    }),
  );

  if (input.berlakuSampai) {
    d.add(
      callout([
        L(
          locale,
          `Surat peringatan ini berlaku hingga ${longDate(input.berlakuSampai)}. Apabila dalam masa tersebut Saudara mengulangi pelanggaran yang sama atau melakukan pelanggaran lain, maka akan dikenakan tindakan yang lebih tegas.`,
          `This warning letter is valid until ${longDate(input.berlakuSampai)}. If you repeat the same violation or commit another violation during this period, stricter action will be taken.`,
        ),
      ]),
    );
  }

  d.add(divider());

  d.add(
    paragraph({
      text: L(
        locale,
        "Kami mengharapkan Saudara dapat memperbaiki kinerja dan perilaku sesuai dengan ketentuan yang berlaku di perusahaan. Demikian surat ini disampaikan untuk menjadi perhatian dan dilaksanakan sebagaimana mestinya.",
        "We expect you to improve your performance and conduct in accordance with company regulations. This letter is conveyed for your attention and proper implementation.",
      ),
      size: TYPE.base,
    }),
  );

  d.add(
    signatures([
      { role: L(locale, "Hormat kami", "Sincerely"), name: input.namaPemberi, rows: 4 },
    ]),
  );

  d.add(
    paragraph({
      text: `${input.namaPemberi}\n${input.jabatanPemberi}`,
      size: TYPE.base - 1,
      align: "right",
    }),
  );

  return d;
}