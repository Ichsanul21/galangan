import { SB_KOP } from "./sb";
import { PdfDoc, pdfNum, pdfDate, sanitizePdf } from "./pdfLayout";

/* ==========================================================================
   DEFINISI DOKUMEN RESMI
   ==========================================================================

   Semua dokumen yang dicetak di aplikasi ini dikumpulkan di sini, bukan
   tersebar di tiap halaman. Alasannya: sebelumnya setiap dokumen dirakit
   tangan sebagai array `unknown[][]` di call site, sehingga kop, urutan
   baris, dan judul kolom ditulis ulang di setiap halaman. PO dan Kop
   Penawaran berakhir dengan tata letak lima kolom yang berbeda padahal
   isinya sama.

   Setiap fungsi menerima data biasa dan mengembalikan PdfDoc yang belum
   disimpan, jadi pemanggil bisa menambah halaman atau memeriksa dulu.
   Menyimpan tetap tugas pemanggil.

   Konvensi: portrait A4 kecuali dokumennya memang lebar. Label selalu
   datang dari kamus halaman pemanggil (meja `L`), jadi fungsi di sini
   tidak mengarang teks baru - hanya menata apa yang diberi.
   ========================================================================== */

export interface DocLocale {
  id: string;
  en: string;
}

/** Ambil label sesuai bahasa aktif. */
export function L(l: DocLocale, en: "id" | "en"): string {
  return l[en];
}


/* ---------------------------------------------------------------- PO ----- */

export interface PoLine {
  name: string;
  qty: string;
  unit: string;
  price: string | number;
}

export interface PoDocLabels {
  tipe: string; vendor: string; refPr: string; project: string; vessel: string;
  tanggal: string; eta: string; status: string; approvalLevel: string; approvals: string;
  noFaktur: string; tglFaktur: string; denda: string; baris: string; qty: string;
  satuan: string; harga: string; subtotal: string; total: string; dpp: string; ppn: string;
  mengetahui: string; tandaTangan: string;
}

export interface PoDocInput {
  no: string;
  tipe: string;
  vendor: string;
  refPr: string;
  project: string;
  vessel: string;
  tanggal: string;
  eta: string;
  status: string;
  approvalLevel: string;
  approvals: string;
  noFaktur: string;
  tglFaktur: string;
  denda: string | number;
  lines: PoLine[];
  total: number;
  /** Hasil sbSplitIncludePpn; null berarti PO tanpa PPN. */
  split: { dpp: number; ppn: number } | null;
  labels: PoDocLabels;
  signer?: string;
}

/**
 * Purchase Order. Kolom terlebar dipakai untuk nama barang supaya nama
 * panjang membungkus, bukan kolom harga.
 *
 * Baris DPP/PPN memakai bentuk [label, "", "", "", nilai] - persis seperti
 * baris Total - itu yang dilayani opsi `labelCol` supaya tidak perlu
 * primitive terpisah untuk "baris berlabel dengan nilai di ujung kanan".
 */
export function poDoc(input: PoDocInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait" });
  doc.kop();
  doc.title("Purchase Order", `NO. ${input.no}`);
  doc.kv([
    { label: t.tipe, value: input.tipe },
    { label: t.vendor, value: input.vendor },
    { label: t.refPr, value: input.refPr },
    { label: t.project, value: input.project },
    { label: t.vessel, value: input.vessel },
    { label: t.tanggal, value: pdfDate(input.tanggal) },
    { label: t.eta, value: input.eta ? pdfDate(input.eta) : "-" },
    { label: t.status, value: input.status },
    { label: t.approvalLevel, value: input.approvalLevel },
    { label: t.approvals, value: input.approvals || "-" },
    { label: t.noFaktur, value: input.noFaktur || "-" },
    { label: t.tglFaktur, value: input.tglFaktur ? pdfDate(input.tglFaktur) : "-" },
    { label: t.denda, value: pdfNum(input.denda) },
  ]);

  const rows: (string | number)[][] = input.lines.map((l) => [
    l.name,
    l.qty,
    l.unit,
    pdfNum(l.price),
    pdfNum(Number(l.qty) * Number(l.price)),
  ]);
  const totalRows: (string | number)[][] = [...rows, [t.total, "", "", "", pdfNum(input.total)]];
  if (input.split) {
    totalRows.push([t.dpp, "", "", "", pdfNum(input.split.dpp)]);
    totalRows.push([t.ppn, "", "", "", pdfNum(input.split.ppn)]);
  }

  doc.table({
    head: [t.baris, t.qty, t.satuan, t.harga, t.subtotal],
    rows: totalRows,
    /* Kolom pertama adalah NAMA BARANG, bukan nomor baris - head-nya memang
       menulis "Baris"/"Line" di atas kolom deskripsi tanpa ada kolom nomor
       sama sekali (warisan format PO lama). Karena itu kolom ini yang
       diberi lebar penuh. Versi pertama di sini memberi kolom ini hanya
       10mm, sehingga tiap baris pecah jadi puluhan baris teks dan satu
       PO 60 baris Occupy 13 halaman. */
    widths: ["auto", 16, 18, 30, 32],
    align: ["left", "right", "left", "right", "right"],
    totalRow: rows.length,
    labelCol: 0,
  });

  doc.space(6);
  doc.signatures([
    { role: t.mengetahui, name: input.signer ?? SB_KOP.director },
    { role: t.tandaTangan, name: "" },
  ]);
  return doc;
}

/* --------------------------------------------------------- PENAWARAN ----- */

export interface KopPenawaranDocLabels {
  no: string; desc: string; qty: string; harga: string; jumlah: string;
  total: string; terms: string; cabang: string; tanggal: string; client: string;
  vessel: string;
}

export interface KopPenawaranInput {
  no: string;
  version: string;
  client: string;
  vessel: string;
  cabang: string;
  tanggal: string;
  lines: { desc: string; qty: number; price: number }[];
  total: number;
  terms: string;
  labels: KopPenawaranDocLabels;
}

export function kopPenawaranDoc(input: KopPenawaranInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait" });
  doc.kop();
  doc.title("Penawaran", `NO. ${input.no}  -  v${input.version}`);
  doc.kv([
    { label: t.cabang, value: input.cabang },
    { label: t.tanggal, value: pdfDate(input.tanggal) },
    { label: t.client, value: input.client },
    { label: t.vessel, value: input.vessel },
  ], { labelW: 34 });

  const rows: (string | number)[][] = input.lines.map((l, i) => [
    i + 1,
    l.desc || "-",
    pdfNum(l.qty),
    pdfNum(l.price),
    pdfNum(l.qty * l.price),
  ]);
  doc.table({
    head: [t.no, t.desc, t.qty, t.harga, t.jumlah],
    rows: [...rows, ["", "", "", t.total, pdfNum(input.total)]],
    widths: [10, "auto", 14, 30, 32],
    align: ["center", "left", "right", "right", "right"],
    totalRow: rows.length,
    labelCol: 3,
  });

  doc.para(`${t.terms}: ${input.terms}`);
  return doc;
}

/* ------------------------------------------------------ DELIVERY ORDER ---- */

export interface DeliveryOrderDocLabels {
  tanggal: string; tujuan: string; driver: string; suratJalan: string;
  no: string; namaBarang: string; jumlah: string;
}

export interface DeliveryOrderInput {
  no: string;
  tanggal: string;
  tujuan: string;
  driver: string;
  suratJalan: string;
  items: { name: string; qty: string }[];
  labels: DeliveryOrderDocLabels;
}

export function deliveryOrderDoc(input: DeliveryOrderInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait" });
  doc.kop();
  doc.title("Delivery Order", `NO. ${input.no}`);
  doc.kv([
    { label: t.tanggal, value: pdfDate(input.tanggal) },
    { label: t.tujuan, value: input.tujuan },
    { label: t.driver, value: input.driver },
    { label: t.suratJalan, value: input.suratJalan },
  ]);
  doc.table({
    head: [t.no, t.namaBarang, t.jumlah],
    rows: input.items.map((x, i) => [i + 1, x.name, x.qty]),
    widths: [10, "auto", 26],
    align: ["center", "left", "right"],
  });
  doc.signatures([
    { role: "Penerima", name: input.tujuan },
    { role: "Sopir", name: input.driver },
  ]);
  return doc;
}

/* ----------------------------------------------------- SURAT JALAN / TT ---- */

export interface GoodsNoteDocLabels {
  no: string; namaBarang: string; jumlah: string; tanggal: string; tujuan: string;
  penerima: string; penyerah: string;
}

export interface GoodsNoteInput {
  /** Judul dokumen, mis. "Surat Jalan" atau "Tanda Terima". */
  title: string;
  no: string;
  tanggal: string;
  /** SJ punya tujuan; TT tidak, jadi boleh string kosong. */
  tujuan: string;
  /** Baris label tambahan. SJ: Kendaraan, No. Pollis, Driver. */
  extra: { label: string; value: string }[];
  items: { name: string; qty: string }[];
  receiver: string;
  giver: string;
  labels: GoodsNoteDocLabels;
}

/**
 * Surat Jalan dan Tanda Terima bentuknya sama: kop, judul plus nomor, blok
 * label, tabel barang, dua tanda tangan. Keduanya memakai fungsi ini dengan
 * `extra` berbeda. Sebelumnya keduanya punya blok baris yang diketik manual
 * di dua tempat, sehingga urutannya bisa berbeda tanpa ada yang menyadari.
 */
export function goodsNoteDoc(input: GoodsNoteInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait" });
  doc.kop();
  doc.title(input.title, `NO REF: ${input.no}`);
  doc.kv([
    { label: t.tanggal, value: pdfDate(input.tanggal) },
    ...(input.tujuan ? [{ label: t.tujuan, value: input.tujuan }] : []),
    ...input.extra,
  ]);
  doc.table({
    head: [t.no, t.namaBarang, t.jumlah],
    rows: input.items.map((x, i) => [i + 1, x.name, x.qty]),
    widths: [10, "auto", 26],
    align: ["center", "left", "right"],
  });
  doc.signatures([
    { role: t.penerima, name: input.receiver },
    { role: t.penyerah, name: input.giver },
  ]);
  return doc;
}

/* ------------------------------------------------------------ SLIP GAJI ---- */

export interface SlipGajiDocLabels {
  komponen: string; nilai: string; karyawan: string; periode: string;
  tipe: string; id: string; status: string; tandaTerima: string;
}

export interface SlipGajiInput {
  id: string;
  karyawan: string;
  periode: string;
  tipe: string;
  rows: { komponen: string; nilai: string }[];
  netLabel: string;
  net: string;
  status: string;
  tandaTerima: string;
  labels: SlipGajiDocLabels;
}

/**
 * Slip gaji sengaja TANPA kop perusahaan: dokumen ini diberikan ke karyawan,
 * jadi yang dibaca adalah angkanya. Baris net (gaji bersih atau nominal
 * diterima) ditebalkan lewat `totalRow`, dan `totalRow` bekerja dengan
 * indeks - jadi indeksnya dihitung setelah baris net ditambahkan.
 */
export function slipGajiDoc(input: SlipGajiInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait", marginMm: 18 });
  doc.title("Slip Gaji", `NO. ${input.id}`);
  doc.kv([
    { label: t.id, value: input.id },
    { label: t.karyawan, value: input.karyawan },
    { label: t.periode, value: input.periode },
    { label: t.tipe, value: input.tipe },
  ]);

  const body: (string | number)[][] = input.rows.map((r) => [r.komponen, r.nilai]);
  body.push([input.netLabel, input.net]);

  doc.table({
    head: [t.komponen, t.nilai],
    rows: body,
    widths: ["auto", 42],
    align: ["left", "right"],
    totalRow: body.length - 1,
  });

  doc.space(2);
  doc.paraKV(t.status, input.status);
  doc.paraKV(t.tandaTerima, input.tandaTerima);
  doc.space(8);
  doc.signatures([{ role: "Tanda tangan karyawan", name: "" }]);
  return doc;
}

/* --------------------------------------------------------- TRANSMITTAL ---- */

export interface TransmittalInput {
  to: string;
  date: string;
  drawings: {
    id: string; project: string; judul: string; revisi: string;
    status: string; holder: string; diperbarui: string;
  }[];
  head: string[];
  signer?: string;
}

/** Drawing transmittal: tabel murni tanpa kop, tujuh kolom auto-lebar. */
export function transmittalDoc(input: TransmittalInput): PdfDoc {
  const doc = new PdfDoc({ orientation: "portrait", marginMm: 12, fontSize: 8 });
  doc.title("Transmittal Drawing", `Kepada: ${input.to}  -  ${pdfDate(input.date)}`);
  doc.table({
    head: input.head,
    rows: input.drawings.map((d) => [d.id, d.project, d.judul, d.revisi, d.status, d.holder, d.diperbarui]),
    widths: ["auto", "auto", "auto", "auto", "auto", "auto", "auto"],
    align: ["left", "left", "left", "center", "center", "left", "center"],
    headFontSize: 7.5,
  });
  doc.space(4);
  doc.signatures([{ role: "Dikirim oleh", name: input.signer ?? SB_KOP.director }]);
  return doc;
}

/* ------------------------------------------------------------------ SPT ---- */

export interface SptDocLabels {
  jenis: string; dasar: string; tarif: string; nilai: string; ppnTerutang: string;
  npwp: string; npwpPenyetor: string; tanggalSetor: string; formulir: string;
  bank: string; teller: string; period: string;
}

export interface SptInput {
  period: string;
  status: string;
  rows: { jenis: string; dasar: string; tarif: string; nilai: number }[];
  ppnTerutang: number;
  npwp: string;
  npwpPenyetor: string;
  tanggalSetor: string;
  formulir: string;
  bank: string;
  teller: string;
  labels: SptDocLabels;
}

/**
 * SPT ringkas. Satu-satunya dokumen di daftar ini yang kolomnya angka semua,
 * jadi semua rata kanan kecuali kolom "Jenis". Bagian identitas dan setor
 * dipisah oleh garis, karena itu blok berbeda - bukan kelanjutan tabel.
 */
export function sptDoc(input: SptInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait" });
  doc.kop();
  doc.title("SPT Ringkas", `${t.period}: ${input.period}  -  Status: ${input.status}`);
  doc.table({
    head: [t.jenis, t.dasar, t.tarif, t.nilai],
    rows: [
      ...input.rows.map((r) => [r.jenis, r.dasar, r.tarif, pdfNum(r.nilai)]),
      [t.ppnTerutang, "", "", pdfNum(input.ppnTerutang)],
    ],
    widths: ["auto", "auto", 22, 40],
    align: ["left", "right", "center", "right"],
    totalRow: input.rows.length,
    labelCol: 0,
  });

  doc.rule();
  doc.kv([
    { label: t.npwp, value: input.npwp || "-" },
    { label: t.npwpPenyetor, value: input.npwpPenyetor || "-" },
    { label: t.tanggalSetor, value: input.tanggalSetor ? pdfDate(input.tanggalSetor) : "-" },
    { label: t.formulir, value: input.formulir || "-" },
    { label: t.bank, value: input.bank || "-" },
    { label: t.teller, value: input.teller || "-" },
  ], { labelW: 40 });
  return doc;
}

/* ------------------------------------------------------------- SURAT HR ---- */

export interface SuratHrDocLabels {
  nomor: string; tanggal: string; kepada: string; jabatan: string;
  departemen: string; cabang: string; disetujui: string; nama: string;
}

export interface SuratHrInput {
  nomor: string;
  jenis: string;
  tanggal: string;
  nama: string;
  nik: string;
  jabatan: string;
  departemen: string;
  cabang: string;
  isi: string;
  approvedBy: string;
  approvedAt: string;
  labels: SuratHrDocLabels;
  signer?: string;
  signerRole?: string;
}

/**
 * Surat peringatan dan mutasi.
 *
 * Blok "disetujui" sengaja ada di dalam dokumen, bukan hanya di UI. SP1,
 * SP2, dan SP3 tanpa nama serta tanggal persetujuan tidak sah, dan arsip
 * surat tidak bisa dibuka ulang untuk membuktikan siapa yang menyetujuinya
 * kalau yang tercatat cuma isi suratnya.
 */
export function suratHrDoc(input: SuratHrInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait" });
  doc.kop();
  doc.title(`Surat ${input.jenis}`, `${t.nomor}: ${input.nomor}`);
  doc.paraKV(t.tanggal, pdfDate(input.tanggal));
  doc.space(2);

  doc.kv([
    { label: t.kepada, value: `${input.nama}${input.nik ? ` (NIK ${input.nik})` : ""}` },
    { label: t.jabatan, value: input.jabatan || "-" },
    { label: t.departemen, value: input.departemen || "-" },
    { label: t.cabang, value: input.cabang || "-" },
  ], { labelW: 34 });

  doc.space(4);
  doc.para(input.isi);

  doc.space(6);
  doc.para(`${t.disetujui}:`, { fontSize: 8.5 });
  doc.paraKV(t.nama, input.approvedBy || "-", { fontSize: 8.5 });
  doc.paraKV(t.tanggal, input.approvedAt ? pdfDate(input.approvedAt) : "-", { fontSize: 8.5 });

  doc.space(8);
  doc.signatures([
    { role: input.signerRole ?? "Hormat kami", name: input.signer ?? SB_KOP.director },
  ]);
  return doc;
}

/* ------------------------------------------------------------ KWITANSI ---- */

export interface KwitansiDocLabels {
  no: string; tanggal: string; diterimaDari: string; untuk: string;
  jumlah: string; catatan: string; tandaTangan: string; penerima: string;
  rincian: string; uraian: string;
}

export interface KwitansiInput {
  no: string;
  tanggal: string;
  diterimaDari: string;
  untuk: string;
  /** Baris rincian. Baris terakhir dianggap NETO dan otomatis ditebalkan
   *  kalau `netLabel` diberikan - kwitansi tanpa rincian tidak bisa
   *  dipertanggungjawabkan saat sengketa. */
  breakdown: { label: string; value: number }[];
  netLabel: string;
  catatan: string;
  labels: KwitansiDocLabels;
  signer?: string;
}

/**
 * Kwitansi pembayaran.
 *
 * Rinciannya wajib berisi peng-potongan apa pun: PPh, retensi, dan denda.
 * Menaruh hanya nominal bersih membuat subkontraktor menghitung ulang
 * sendiri dari-diff, dan itu justru sumber paling sering sengketa. Jadi
 * semua potongan ditampilkan di atas net, lalu net ditebalkan.
 */
export function kwitansiDoc(input: KwitansiInput): PdfDoc {
  const t = input.labels;
  const doc = new PdfDoc({ orientation: "portrait" });
  doc.kop();
  doc.title("Kwitansi", `${t.no}: ${input.no}`);
  doc.kv([
    { label: t.tanggal, value: pdfDate(input.tanggal) },
    { label: t.diterimaDari, value: input.diterimaDari },
    { label: t.untuk, value: input.untuk },
  ], { labelW: 42 });

  const net = Number(input.breakdown[input.breakdown.length - 1]?.value ?? 0);

  if (input.breakdown.length > 0) {
    doc.table({
      head: [t.uraian, t.jumlah],
      rows: input.breakdown.map((b) => [b.label, pdfNum(b.value)]),
      widths: ["auto", 46],
      align: ["left", "right"],
      totalRow: input.breakdown.length - 1,
    });
  }

  doc.space(2);
  doc.rule(0.6);
  doc.para(`${t.jumlah}: Rp ${pdfNum(net)}`, { align: "right", fontSize: 11 });
  doc.rule(0.6);

  if (input.catatan.trim() !== "") {
    doc.space(4);
    doc.para(input.catatan, { fontSize: 8.5 });
  }

  doc.space(10);
  doc.signatures([
    { role: t.tandaTangan, name: input.signer ?? SB_KOP.director },
    { role: t.penerima, name: input.diterimaDari },
  ]);
  return doc;
}

/** Guard untuk probe: teks yang sudah WinAnsi tidak boleh ikut berubah. */
export function assertSanitizeSafe(s: string): void {
  const out = sanitizePdf(s);
  if (out !== s) {
    throw new Error(`sanitizePdf mengubah teks: ${JSON.stringify(s)} -> ${JSON.stringify(out)}`);
  }
}
