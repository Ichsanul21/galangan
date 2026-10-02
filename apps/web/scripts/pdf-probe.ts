/* Probe generator PDF.
 *
 * Setiap dokumen resmi di src/utils/pdfDocs.ts dirakit di sini dengan data
 * contoh, lalu hasilnya diperiksa: header PDF harus benar, jumlah halaman
 * harus masuk akal, dan ukuran filenya tidak boleh suspiciously kecil
 * (PDF yang "cuma" 400 byte berarti tidak ada yang benar-benar tergambar).
 *
 * Ini menangkap kelas bug yang tsc tidak bisa: teks yang keluar dari area
 * halaman, tabel yang tidak pernah menggambar baris, dan primitive yang
 * melempar karena koordinat di luar milimeter.
 *
 * Dijalankan lewat `npm run probe:pdf` (vite build --ssr, sama seperti
 * probe:render). Tidak memakai save() supaya tidak memicu unduhan.
 */

import {
  assertSanitizeSafe,
  goodsNoteDoc,
  kopPenawaranDoc,
  kwitansiDoc,
  deliveryOrderDoc,
  poDoc,
  slipGajiDoc,
  sptDoc,
  suratHrDoc,
  transmittalDoc,
  type PoDocLabels,
  type KopPenawaranDocLabels,
  type DeliveryOrderDocLabels,
  type GoodsNoteDocLabels,
  type SlipGajiDocLabels,
  type SptDocLabels,
  type SuratHrDocLabels,
  type KwitansiDocLabels,
} from "../src/utils/pdfDocs";
import { PdfDoc, pdfDate, pdfNum, sanitizePdf } from "../src/utils/pdfLayout";

/* Repo ini tidak memasang @types/node; probe render mendeklarasikan
   `process` sendiri (ssr-probe.tsx:51). Ikuti pola yang sama. */
declare const process: { exit(code: number): never };

const LABELS_PO: PoDocLabels = {
  tipe: "Jenis", vendor: "Vendor", refPr: "Ref PR", project: "Proyek",
  vessel: "Untuk", tanggal: "Tanggal", eta: "ETA", status: "Status",
  approvalLevel: "Level Approval", approvals: "Disetujui", noFaktur: "No. Faktur",
  tglFaktur: "Tgl. Faktur", denda: "Denda", baris: "No", qty: "Qty",
  satuan: "Satuan", harga: "Harga", subtotal: "Jumlah", total: "TOTAL",
  dpp: "DPP (11/12)", ppn: "PPN 12%", mengetahui: "Mengetahui",
  tandaTangan: "Tanda Tangan",
};

const LABELS_KOP: KopPenawaranDocLabels = {
  no: "No", desc: "Deskripsi", qty: "Qty", harga: "Harga (Rp)", jumlah: "Jumlah (Rp)",
  total: "Total", terms: "Syarat pembayaran", cabang: "Cabang", tanggal: "Tanggal",
  client: "Client", vessel: "Kapal",
};

const LABELS_DO: DeliveryOrderDocLabels = {
  tanggal: "Tanggal", tujuan: "Tujuan", driver: "Driver", suratJalan: "Surat Jalan",
  no: "No", namaBarang: "Nama Barang", jumlah: "Jumlah",
};

const LABELS_NOTE: GoodsNoteDocLabels = {
  no: "No", namaBarang: "Nama Barang", jumlah: "Jumlah", tanggal: "Tanggal",
  tujuan: "Tujuan", penerima: "Yang Menerima", penyerah: "Yang Menyerahkan",
};

const LABELS_SLIP: SlipGajiDocLabels = {
  komponen: "Komponen", nilai: "Nilai", karyawan: "Karyawan", periode: "Periode",
  tipe: "Tipe", id: "ID", status: "Status", tandaTerima: "Tanda terima",
};

const LABELS_SPT: SptDocLabels = {
  jenis: "Jenis", dasar: "Dasar", tarif: "Tarif", nilai: "Nilai (Rp)",
  ppnTerutang: "PPN Terutang", npwp: "NPWP Perusahaan", npwpPenyetor: "NPWP Penyetor",
  tanggalSetor: "Tanggal Setor", formulir: "Nomor Formulir", bank: "Bank",
  teller: "Teller", period: "Masa Pajak",
};

const LABELS_HR: SuratHrDocLabels = {
  nomor: "Nomor", tanggal: "Tanggal", kepada: "Kepada Yth", jabatan: "Jabatan",
  departemen: "Departemen", cabang: "Cabang", disetujui: "Disetujui oleh", nama: "Nama",
};

const LABELS_KWIT: KwitansiDocLabels = {
  no: "No", tanggal: "Tanggal", diterimaDari: "Diterima dari", untuk: "Untuk",
  jumlah: "Jumlah", catatan: "Catatan", tandaTangan: "Tanda Tangan", penerima: "Penerima",
  rincian: "Rincian", uraian: "Uraian",
};

/* manyLineages: dipakai untuk menguji paginasi - tabel harus pindah halaman
   dan MENGULANG header, bukan memotong baris. */
const LONG_LINES = Array.from({ length: 60 }, (_, i) => ({
  name: `Pelat Baja AH36 ukuran ${(i % 9) + 1} x ${(i % 4) + 2} meter - batch ${i + 1}`,
  qty: String((i % 7) + 1),
  unit: "lbr",
  price: 1_250_000 + i * 3_000,
}));

const CASES: { name: string; build: () => PdfDoc }[] = [
  {
    name: "Purchase Order",
    build: () => poDoc({
      no: "114/PO-SB/SMD/X/2026", tipe: "Besar (Kantor)", vendor: "PT Bahana Baja",
      refPr: "PR-2026-203", project: "NB-2025-012", vessel: "U/STOCK",
      tanggal: "2026-07-15", eta: "2026-08-15", status: "Dalam Pengiriman",
      approvalLevel: "Director", approvals: "Manager: Budi (2026-07-14)",
      noFaktur: "", tglFaktur: "", denda: 0,
      lines: LONG_LINES, total: 4_120_000_000,
      split: { dpp: 3_775_000_000, ppn: 453_000_000 },
      labels: LABELS_PO,
    }),
  },
  {
    name: "Kop Penawaran",
    build: () => kopPenawaranDoc({
      no: "QT-2026-041", version: "2", client: "PT Pelayaran Nusantara",
      vessel: "TB Karya Bahari 12", cabang: "Samarinda", tanggal: "2026-10-02",
      lines: Array.from({ length: 12 }, (_, i) => ({ desc: `Pekerjaan Repair Hull Section ${i + 1}`, qty: i + 1, price: 3_500_000 + i * 250_000 })),
      total: 148_750_000, terms: "NET 30", labels: LABELS_KOP,
    }),
  },
  {
    name: "Delivery Order",
    build: () => deliveryOrderDoc({
      no: "DO-2026-088", tanggal: "2026-09-12", tujuan: "U/TK. RMN 3317",
      driver: "Rudi Hartono", suratJalan: "SJ/SMD/2026/IX/042",
      items: LONG_LINES.slice(0, 8).map((l) => ({ name: l.name, qty: l.qty })),
      labels: LABELS_DO,
    }),
  },
  {
    name: "Surat Jalan",
    build: () => goodsNoteDoc({
      title: "Surat Jalan", no: "SJ/SMD/2026/X/007", tanggal: "2026-10-02",
      tujuan: "Gudang Harbour",
      extra: [
        { label: "Kendaraan", value: "Truck Container 20ft" },
        { label: "No. Pollis", value: "B 9123 KJU" },
        { label: "Driver", value: "Ahmad Suryadi" },
      ],
      items: LONG_LINES.slice(0, 6).map((l) => ({ name: l.name, qty: l.qty })),
      receiver: "Budi Santoso", giver: "Siti Rahayu", labels: LABELS_NOTE,
    }),
  },
  {
    name: "Tanda Terima",
    build: () => goodsNoteDoc({
      title: "Tanda Terima", no: "TT/SMD/2026/X/003", tanggal: "2026-10-01",
      tujuan: "", extra: [{ label: "Surat Jalan", value: "SJ/SMD/2026/IX/042" }],
      items: LONG_LINES.slice(0, 4).map((l) => ({ name: l.name, qty: l.qty })),
      receiver: "Budi Santoso", giver: "Siti Rahayu", labels: LABELS_NOTE,
    }),
  },
  {
    name: "Slip Gaji",
    build: () => slipGajiDoc({
      id: "PAY-2026-09-0007", karyawan: "Andi Prasetyo", periode: "September 2026",
      tipe: "Gaji",
      rows: [
        { komponen: "Gaji pokok", nilai: `Rp ${pdfNum(18_500_000)}` },
        { komponen: "Tunjangan transport", nilai: `Rp ${pdfNum(1_200_000)}` },
        { komponen: "Tunjangan makan", nilai: `Rp ${pdfNum(900_000)}` },
        { komponen: "Upah lembur", nilai: `Rp ${pdfNum(1_750_000)}` },
        { komponen: "Cicilan kasbon", nilai: `Rp ${pdfNum(500_000)}` },
        { komponen: "PPh 21 (progresif disetahunkan)", nilai: `Rp ${pdfNum(742_000)}` },
        { komponen: "BPJS Kesehatan karyawan (4%)", nilai: `Rp ${pdfNum(828_000)}` },
        { komponen: "BPJS Ketenagakerjaan JHT (3,7%)", nilai: `Rp ${pdfNum(766_000)}` },
      ],
      netLabel: "Gaji bersih", net: `Rp ${pdfNum(18_614_000)}`,
      status: "Dibayar", tandaTerima: "Belum diterima", labels: LABELS_SLIP,
    }),
  },
  {
    name: "Transmittal Drawing",
    build: () => transmittalDoc({
      to: "BKI Samarinda", date: "2026-10-01",
      head: ["ID", "Proyek", "Judul", "Revisi", "Status", "Holder", "Diperbarui"],
      drawings: Array.from({ length: 14 }, (_, i) => ({
        id: `DWG-${2026}-${String(i + 1).padStart(3, "0")}`,
        project: "NB-2025-012", judul: `General Arrangement Block ${i + 1}`,
        revisi: `v${(i % 3) + 1}`, status: "Disetujui", holder: "Sari Dewi",
        diperbarui: "2026-09-28",
      })),
    }),
  },
  {
    name: "SPT Ringkas",
    build: () => sptDoc({
      period: "2026-09", status: "Draft",
      rows: [
        { jenis: "PPN Keluaran", dasar: pdfNum(8_800_000_000), tarif: "12%", nilai: 1_056_000_000 },
        { jenis: "PPN Masukan", dasar: pdfNum(3_766_666_666), tarif: "12%", nilai: 452_000_000 },
        { jenis: "PPh 23", dasar: pdfNum(6_200_000_000), tarif: "2%", nilai: 124_000_000 },
        { jenis: "PPh 21", dasar: "Total payroll", tarif: "-", nilai: 38_500_000 },
      ],
      ppnTerutang: 604_000_000,
      npwp: "01.234.567.8-901.000", npwpPenyetor: "01.234.567.8-901.000",
      tanggalSetor: "2026-10-15", formulir: "1.1-08-000-1.2-23-24/26",
      bank: "Bank Syariah Indonesia", teller: "0123", labels: LABELS_SPT,
    }),
  },
  {
    name: "Surat HR SP 2",
    build: () => suratHrDoc({
      nomor: "SRT-20261002-001", jenis: "Peringatan Kedua", tanggal: "2026-10-02",
      nama: "Andi Prasetyo", nik: "3273011209880001",
      jabatan: "Welder", departemen: "Produksi", cabang: "Samarinda",
      isi: "Berdasarkan hasil inspeksi mingguan, ditemukan tiga sambungan las yang "
        + "tidak memenuhi standar ukuran dan harus diperbaiki pada unit yang sama. "
        + "Berkas ini merupakan peringatan tertulis kedua. Apabila ditemukan "
        + "ketidaksesuaian serupa pada periode berikutnya, sanksi berikut akan "
        + "diberikan sesuai ketentuan perusahaan.",
      approvedBy: "H. Syarif Sarapping", approvedAt: "2026-10-01",
      labels: LABELS_HR,
    }),
  },
  {
    name: "Kwitansi termin (dengan rincian potong)",
    build: () => kwitansiDoc({
      no: "KW/TERM-2026-08-004",
      tanggal: "2026-08-14",
      diterimaDari: "CV KARYA BERSAMA",
      untuk: "TERM-2026-08-004 - Pemeriksaan dan perbaikan hull section 12",
      breakdown: [
        { label: "Nilai termin", value: 48_500_000 },
        { label: "PPh dipotong (0,5%)", value: -242_500 },
        { label: "Retensi ditahan (5%)", value: -2_425_000 },
        { label: "Denda keterlambatan", value: -1_000_000 },
        { label: "Dibayar", value: 44_832_500 },
      ],
      netLabel: "Dibayar",
      catatan: "Bukti potong PPh: 0.5/2026/000123\nReferensi pembayaran: TRF-778120 (Transfer)\nRetensi dilepas setelah work order selesai.",
      labels: LABELS_KWIT,
    }),
  },
  {
    name: "Tabel sangat panjang (uji paginasi)",
    build: () => poDoc({
      no: "999/PO-SB/SMD/X/2026", tipe: "Besar (Kantor)", vendor: "PT Uji Coba",
      refPr: "PR-999", project: "-", vessel: "-", tanggal: "2026-01-01",
      eta: "", status: "Draf", approvalLevel: "-", approvals: "", noFaktur: "",
      tglFaktur: "", denda: 0,
      lines: Array.from({ length: 200 }, (_, i) => ({
        name: `Item uji coba nomor ${i + 1} dengan nama yang sengaja dibuat panjang untuk memaksa pembungkusan baris`,
        qty: String(i + 1), unit: "pcs", price: 1000 + i,
      })),
      total: 20_100_000, split: null, labels: LABELS_PO,
    }),
  },
];

/* ---- pemeriksaan helper ---- */

const MIN_BYTES = 1500;

function pageCount(doc: PdfDoc): number {
  const raw = doc.raw();
  return raw.getNumberOfPages();
}

function bytesOf(doc: PdfDoc): Uint8Array {
  return new Uint8Array(doc.raw().output("arraybuffer") as ArrayBuffer);
}

function check(name: string, doc: PdfDoc): { pages: number; size: number } {
  const pages = pageCount(doc);
  const bytes = bytesOf(doc);
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== "%PDF-") throw new Error(`${name}: header bukan %PDF- (dapat "${head}")`);
  if (pages < 1) throw new Error(`${name}: 0 halaman`);
  if (bytes.length < MIN_BYTES) {
    throw new Error(`${name}: hanya ${bytes.length} byte - kemungkinan tidak ada yang tergambar`);
  }
  // PDF harus punya minimal satu objek halaman; cari penanda "/Type /Page".
  const asText = new TextDecoder("latin1").decode(bytes);
  if (!asText.includes("/Type /Page") && !asText.includes("/Type/Page")) {
    throw new Error(`${name}: tidak ada objek halaman di dalam PDF`);
  }
  return { pages, size: bytes.length };
}

/* ---- jalankan ---- */

let failures = 0;

console.log("Probe dokumen PDF\n");

for (const c of CASES) {
  try {
    const { pages, size } = check(c.name, c.build());
    console.log(`PASS  ${c.name}  (${pages} hal, ${(size / 1024).toFixed(1)} kB)`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL  ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ---- pemeriksaan utilitas ---- */

try {
  // Teks yang sudah WinAnsi harus utuh.
  for (const s of ["Pelat Baja x 14 mm", "Total: Rp 1.234.567", "Lampiran · Lampiran", "50% — 60%"]) {
    assertSanitizeSafe(s);
  }
  // Karakter di luar WinAnsi harus dipetakan, bukan dibuang diam-diam.
  const mapped = sanitizePdf("A → B ≤ C ≥ D ≈ E ✓");
  if (/[\u2192\u2264\u2265\u2248\u2713]/.test(mapped)) {
    throw new Error(`sanitizePdf tidak memetakan semua karakter: "${mapped}"`);
  }
  if (mapped !== "A -> B <= C >= D ~ E v") throw new Error(`hasil sanitizePdf tak terduga: "${mapped}"`);
  console.log("\nPASS  sanitizePdf");
} catch (e) {
  failures += 1;
  console.log(`\nFAIL  sanitizePdf: ${e instanceof Error ? e.message : String(e)}`);
}

try {
  if (pdfDate("2026-10-02") !== "2 Oktober 2026") throw new Error(`pdfDate salah: ${pdfDate("2026-10-02")}`);
  if (pdfDate("") !== "-") throw new Error("pdfDate kosong harus '-'");
  if (pdfDate("bukan tanggal") !== "bukan tanggal") throw new Error("pdfDate harus passthrough teks");
  if (pdfNum(1234567.891) !== "1.234.568") throw new Error(`pdfNum salah: ${pdfNum(1234567.891)}`);
  if (pdfNum(1234567.891, 2) !== "1.234.567,89") throw new Error(`pdfNum desimal salah: ${pdfNum(1234567.891, 2)}`);
  if (pdfNum("bukan angka") !== "-") throw new Error("pdfNum non-angka harus '-'");
  console.log("PASS  pdfDate / pdfNum");
} catch (e) {
  failures += 1;
  console.log(`FAIL  pdfDate / pdfNum: ${e instanceof Error ? e.message : String(e)}`);
}

/* ---- pemeriksaan paginasi ----
   Paginasi adalah bagian yang paling mudah rusak secara diam-diam: kalau
   tinggi baris salah, dokumen 200 baris bisa jadi 100 halaman (satu baris
   per halaman) atau tetap 1 halaman (baris menumpuk keluar area). Dua
   batas di bawah menangkap keduanya tanpa perlu membedah isi PDF.

   Diuji pada PdfDoc polos tanpa kop/kv/signatures supaya yang diukur benar-
   benar hanya primitive tabel. (PO lengkap dengan 13 baris label occupying
   ~70mm, jadi jumlah halamannya tidak bisa dipakai sebagai patokan.) */

try {
  const tableOnly = (n: number): PdfDoc => {
    const d = new PdfDoc({ orientation: "portrait" });
    d.table({
      head: ["No", "Nama Barang", "Qty", "Harga"],
      rows: Array.from({ length: n }, (_, i) => [
        i + 1,
        `Item nomor ${i + 1} dengan nama panjang untuk memaksa pembungkusan baris`,
        "1",
        pdfNum(1000 + i),
      ]),
      widths: [10, "auto", 18, 30],
      align: ["center", "left", "right", "right"],
    });
    return d;
  };

  const small = pageCount(tableOnly(12));
  const big = pageCount(tableOnly(240));

  if (small !== 1) throw new Error(`12 baris harus 1 halaman, dapat ${small}`);
  if (big < 4) throw new Error(`240 baris harus >3 halaman, dapat ${big} - baris menumpuk keluar area`);
  if (big > 24) throw new Error(`240 baris harus <24 halaman, dapat ${big} - satu baris per halaman`);
  console.log(`PASS  paginasi tabel  (12 baris = ${small} hal, 240 baris = ${big} hal)`);
} catch (e) {
  failures += 1;
  console.log(`FAIL  paginasi tabel: ${e instanceof Error ? e.message : String(e)}`);
}

if (failures > 0) {
  console.log(`\n${failures} pemeriksaan gagal.`);
  process.exit(1);
}
console.log(`\n${CASES.length + 3} pemeriksaan lolos, tidak ada dokumen gagal.`);
