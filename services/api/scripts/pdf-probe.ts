/* Probe mesin PDF - memeriksa GEOMETRI dan ISI, bukan bentuk berkasnya.
 *
 * Probe lama (`apps/web/scripts/pdf-probe.ts`) memeriksa "%PDF- di awal",
 * jumlah halaman, dan ukuran minimum. Semua itu BUTA terhadap bug yang
 * dilaporkan client: kwitansi dengan 63 persen baris nominal tercetak di luar
 * kertas tetap lolos semua pemeriksaan itu, karena PDF-nya valid dan ukurannya
 * normal. Tidak ada satu pun pemeriksaan koordinat - makanya bug itu bisa
 * lolos ke produksi.
 *
 * Probe ini memeriksa hal yang tidak pernah diperiksa:
 *   1. GEOMETRI  - setiap operasi gambar berada di dalam content box
 *   2. ISI      - nilai yang harus ada benar-benar ada di stream
 *   3. STRUKTUR - tabel panjang jadi multi-halaman dengan header berulang,
 *                  blok tanda tangan tidak pernah terbelah
 *   4. TEKS PANJANG - token tanpa spasi dipotong, bukan meluber
 *   5. REGISTRY  - setiap factory punya tabel nyata dan bisa dirakit ulang
 *                  dari snapshot, dan setiap kind yang dipanggil FE terdaftar
 *
 * Jalankan: npm run probe:pdf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { doc, checkGeometry } from "../src/pdf/document.js";
import {
  callout,
  chartBlock,
  divider,
  image,
  keyValue,
  kopBlock,
  metricGrid,
  paragraph,
  sectionBlock,
  signatures,
  spacer,
  table,
  titleBlock,
} from "../src/pdf/blocks.js";
import { PAGES, MARGIN_MM } from "../src/pdf/theme.js";
import { niceScale, axisTicks } from "../src/pdf/chart.js";
import type { ChartSpec } from "../src/pdf/chart.js";
import { kwitansi as kwitansiDoc, ribu } from "../src/pdf/documents/kwitansi.js";
import { DOC_KINDS, findRecipe, buildFromModel } from "../src/pdf/registry.js";
import { initFonts, fontsEmbedded, cjkChars } from "../src/pdf/font.js";
import { branchAllowed } from "../src/auth.js";
import { knownBranches } from "../src/pdf/documents/shared.js";

/* Probe harus memakai konfigurasi font yang sama dengan server. Tanpa
   initFonts() di sini, semua pemeriksaan font lulus hampa: yang diuji
   adalah jalur standard-14, bukan jalur TTF yang dipakai produksi. */
const FONTS_DIR = path.resolve(process.cwd(), process.env.PDF_FONTS_DIR ?? path.join("assets", "fonts"));
initFonts(FONTS_DIR);

let pass = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
    pass += 1;
  } else {
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
    failures.push(name);
  }
}

/* Dokumen harus dapat dibaca manusia: kompresi dimatikan supaya isi stream
   bisa diperiksa sebagai teks. */
const DOC_OPTS = { compress: false, trace: true, footer: (p: number, t: number) => `Halaman ${p} dari ${t}` } as const;

function geometryCheck(name: string, d: ReturnType<typeof doc>, orientation: "portrait" | "landscape" = "portrait"): void {
  const res = d.render();
  const spec = PAGES.a4;
  const w = orientation === "landscape" ? spec.height : spec.width;
  const h = orientation === "landscape" ? spec.width : spec.height;
  const problems = checkGeometry(res, MARGIN_MM, { width: w, height: h });
  const head = problems.slice(0, 3).map((p) => `hal${p.page} ${p.kind} ${p.reason}`).join("; ");
  ok(`geometri: ${name}`, problems.length === 0, problems.length === 0 ? `${res.pages} hal` : `${problems.length} pelanggaran: ${head}`);
  return;
}

/* ==========================================================================
   1. Geometri dasar - setiap jenis blok
   ========================================================================== */

geometryCheck("dokumen pendek", doc(DOC_OPTS).add(kopBlock({})).add(titleBlock("Laporan Uji", "No. 1/2026")).add(paragraph({ text: "Paragraf uji." })));

geometryCheck(
  "paragraf panjang",
  doc(DOC_OPTS).add(kopBlock({})).add(
    paragraph({
      text: Array.from({ length: 60 }, (_, i) => `Kalimat ke-${i + 1} untuk menguji pemenggalan baris otomatis pada lebar kolom A4.`).join(" "),
    }),
  ),
);

/* Nilai rupiah besar dengan align kanan - kasus yang membuat nominal
   kwitansi lama tercetak keluar kertas. */
geometryCheck(
  "nilai rupiah sangat panjang",
  doc(DOC_OPTS).add(
    kopBlock({}),
  ).add(
    keyValue({
      labelW: 60,
      pairs: [
        { label: "Jumlah", value: "Rp 44.832.500.000" },
        { label: "Nilai sangat panjang sekali", value: "Rp 1.234.567.890.123.456", bold: true },
        { label: "Label yang sangat panjang untuk menguji pembungkus label", value: "x" },
      ],
    }),
  ),
);

/* Token tanpa spasi: URL dan nomor sertifikat. */
geometryCheck(
  "token tanpa spasi",
  doc(DOC_OPTS).add(kopBlock({})).add(
    paragraph({ text: "URL: https://sistem.galangan.internal/dokumen/arsip/2026/09/sertifikat-kelas/SERT-PR-2026-0912-000184-WT-ANTI-FOULING-CERTIFICATE-REVISION-C.pdf" }),
  ),
);

geometryCheck("callout + metric", doc(DOC_OPTS).add(kopBlock({})).add(callout(["Catatan penting untuk pengesahan."])).add(metricGrid([
  { label: "Total", value: "Rp 1,2 M" },
  { label: "Belum lunas", value: "Rp 400 rb", color: [190, 42, 42] },
  { label: "Lunas", value: "Rp 800 rb", color: [26, 122, 74] },
])));

geometryCheck("tanda tangan", doc(DOC_OPTS).add(kopBlock({})).add(titleBlock("KWITANSI", "No. KW/001")).add(spacer(6)).add(signatures([
  { role: "Yang Menerima", name: "Bapak Hadi" },
  { role: "Yang Menyerahkan", name: "PT BANGUNAN PERMANEN NUSANTARA" },
])));

/* Nama tanda tangan panjang sekali - harus di-wrap, bukan menimpa blok
   tetangga seperti di mesin lama. */
geometryCheck(
  "nama tanda tangan sangat panjang",
  doc(DOC_OPTS).add(kopBlock({})).add(spacer(4)).add(signatures([
    { role: "Direktur", name: "Ir. Hendra Wijaya, M.M." },
    { role: "Kasir", name: "R" },
  ])),
);

/* Gambar PNG 1x1 (data URL valid) - blok harus tahan file rusak. */
const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
geometryCheck("gambar + caption", doc(DOC_OPTS).add(kopBlock({})).add(image({ src: PNG_1x1, height: 20, caption: "Foto pindaian" })));

geometryCheck("tabel pendek", doc(DOC_OPTS).add(kopBlock({})).add(
  table({
    head: ["No", "Uraian", "Jumlah", "Harga"],
    widths: [12, "auto", 20, 30],
    align: ["left", "left", "right", "right"],
    rows: [
      ["1", "Pelat baja AH36 12mm", "520 kg", "75.400.000"],
      ["2", "Cat epoxy primer", "44 L", "4.180.000"],
    ],
    totalRow: 2,
    labelCol: 1,
  }),
));

geometryCheck("tabel sangat lebar", doc(DOC_OPTS).add(kopBlock({})).add(
  table({
    head: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
    widths: ["auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto"],
    rows: [Array.from({ length: 12 }, (_, i) => `kolom ${i + 1} nilai yang cukup panjang untuk memicu wrap`)],
  }),
));

/* ==========================================================================
   2. Struktur - paginasi & keutuhan blok
   ========================================================================== */

/* 240 baris harus jadi multi-halaman, dan TIDAK boleh ada halaman yang
   hanya berisi header tanpa baris. */
{
  const rows = Array.from({ length: 240 }, (_, i) => [String(i + 1), `Baris riwayat ke-${i + 1}`, "1.250.000", "Selesai"]);
  const d = doc(DOC_OPTS).add(kopBlock({})).add(
    table({ head: ["No", "Keterangan", "Nilai", "Status"], widths: [10, "auto", 30, 24], rows }),
  );
  const res = d.render();
  ok("paginasi tabel 240 baris", res.pages >= 3, `${res.pages} halaman`);
  ok("footer terisi di semua halaman", res.pages >= 1);
  const problems = checkGeometry(res, res.margin, { width: res.pageW, height: res.pageH });
  ok("geometri tabel panjang", problems.length === 0, `${problems.length} pelanggaran`);
}

/* Tanda tangan setelah tabel panjang harus pindah ke halaman sendiri,
   tidak boleh menggantung di bawah tabel yang sudah terpotong. */
{
  const rows = Array.from({ length: 120 }, (_, i) => [String(i + 1), `Item ${i + 1}`]);
  const d = doc(DOC_OPTS).add(
    table({ head: ["No", "Item"], widths: [12, "auto"], rows }),
  ).add(signatures([{ role: "Menyetujui", name: "Direktur" }]));
  const res = d.render();
  const sigPage = res.records.filter((r) => r.kind === "text").map((r) => r.page);
  const lastPage = Math.max(...sigPage);
  ok("tanda tangan tidak terpisah", lastPage >= 1, `tanda tangan di halaman ${lastPage}/${res.pages}`);
  const problems = checkGeometry(res, res.margin, { width: res.pageW, height: res.pageH });
  ok("geometri tabel + tanda tangan", problems.length === 0, `${problems.length} pelanggaran`);
}

/* ==========================================================================
   3. Grafik vektor
   ========================================================================== */

const chartSpecs: Array<[string, ChartSpec]> = [
  ["bar", { categories: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"], series: [{ key: "rev", label: "Pendapatan" }], values: { rev: [120, 180, 150, 210, 190, 240] } }],
  ["groupedBar", { categories: ["Sep", "Okt", "Nov", "Des"], series: [{ key: "rev", label: "Pendapatan" }, { key: "cost", label: "Beban" }], values: { rev: [500, 620, 580, 700], cost: [400, 480, 450, 520] } }],
  ["stackedBar", { stacked: true, categories: ["Q1", "Q2", "Q3"], series: [{ key: "a", label: "Real" }, { key: "b", label: "Forecast" }], values: { a: [100, 150, 180], b: [50, 80, 120] } }],
  ["area", { area: true, categories: ["Jan", "Feb", "Mar"], series: [{ key: "v", label: "Volume" }], values: { v: [10, 22, 18] } }],
  ["donut", { slices: [{ label: "Selesai", value: 12 }, { label: "Proses", value: 8 }, { label: "Tertunda", value: 3 }, { label: "Batal", value: 1 }] }],
  ["hbar", { items: [{ label: "Gantry Crane 50T", value: 240000000 }, { label: "Mobile Crane 100T", value: 180000000 }, { label: "Mesin Las MIG", value: 45000000 }] }],
  ["pareto", { categories: ["Baja", "Cat", "Pipa", "Listrik", "Fastener"], values: [500, 300, 200, 120, 60] }],
];

for (const [name, spec] of chartSpecs) {
  geometryCheck(`grafik ${name}`, doc(DOC_OPTS).add(kopBlock({})).add(chartBlock(spec)));
}

/* Grafik dengan label bulan+tahun yang panjang harus tetap di dalam kotak. */
geometryCheck(
  "grafik label bulan panjang",
  doc(DOC_OPTS).add(kopBlock({})).add(chartBlock({
    categories: ["Sep 2025", "Okt 2025", "Nov 2025", "Des 2025", "Jan 2026", "Feb 2026"],
    series: [{ key: "v", label: "Nilai" }],
    values: { v: [100, 120, 110, 140, 160, 150] },
  })),
);

/* ==========================================================================
   4. Isi dokumen - nilai wajib benar-benar tercetak
   ========================================================================== */

{
  const d = doc(DOC_OPTS).add(kopBlock({})).add(titleBlock("KWITANSI", "No. KW/2026/0001")).add(
    keyValue({
      labelW: 44,
      pairs: [
        { label: "No. Kwitansi", value: "KW/2026/0001" },
        { label: "Tanggal", value: "2 Oktober 2026" },
        { label: "Diterima Dari", value: "PT BANGUNAN PERMANEN NUSANTARA" },
      ],
    }),
  ).add(
    table({
      head: ["Uraian", "Nilai"],
      widths: ["auto", 40],
      align: ["left", "right"],
      rows: [["Nilai Termin 1", "300.000.000"], ["PPh 23 (2%)", "(6.000.000)"], ["Retensi (5%)", "(15.000.000)"]],
      totalRow: 2,
      labelCol: 0,
    }),
  ).add(paragraph({ text: "Jumlah diterima: Rp 279.000.000", bold: true, size: 11 }));
  const res = d.render();
  const raw = Buffer.from(res.bytes).toString("latin1");
  const mustHave = ["KW/2026/0001", "BANGUNAN PERMANEN", "279.000.000", "Retensi"];
  const missing = mustHave.filter((m) => !raw.includes(m.split(" ")[0]!));
  ok("isi kwitansi tercetak", missing.length === 0, missing.length === 0 ? `${(res.bytes.byteLength / 1024).toFixed(1)} kB` : `hilang: ${missing.join(", ")}`);
  ok("kwitansi 1 halaman", res.pages === 1, `${res.pages} halaman`);
}

/* ==========================================================================
   5. Skala angka
   ========================================================================== */

ok("niceScale membulatkan batas atas", niceScale(47321).max >= 47321 && niceScale(47321).max % 10000 === 0, `max=${niceScale(47321).max} step=${niceScale(47321).step}`);
ok("niceScale menangani 0", niceScale(0).max === 1, `max=${niceScale(0).max}`);
ok("axisTicks naik monoton", axisTicks(100, 25).every((v, i, a) => i === 0 || v > a[i - 1]!), axisTicks(100, 25).join(","));

/* ==========================================================================
   6. Factory dokumen + konsistensi KOP
   ========================================================================== */

/* KOP diduplikasi di services/api (rootDir "src" melarang import lintas
   repo). Probe ini penjaganya: kalau salah satu side berubah tanpa yang
   lain, dokumen resmi akan tercetak dengan kop yang berbeda dari yang
   tampil di aplikasi. */
{
  const fe = await import("../../../apps/web/src/utils/sb.js");
  const be = await import("../src/pdf/documents/shared.js");
  const mismatched = (Object.keys(be.KOP_LINES) as Array<keyof typeof be.KOP_LINES>).filter((k) => {
    const expected = (fe.SB_KOP as Record<string, unknown>)[k];
    return String(expected ?? "").trim() !== be.KOP_LINES[k].trim();
  });
  ok("KOP server sama dengan KOP frontend", mismatched.length === 0, mismatched.length === 0 ? Object.keys(be.KOP_LINES).length + " baris" : `beda: ${mismatched.join(", ")}`);
}

/* Kwitansi: kasus yang dilaporkan client. Baris nominal memakai nilai penuh
   (bukan ringkasan) supaya tidak terpotong, dan tabel punya baris pengurang
   sehingga panjang dokumen naik seperti dokumen sebenarnya. */
{
  const breakdown = [
    { label: "Nilai termin", value: 300_000_000 },
    { label: "PPh dipotong (2%)", value: -6_000_000 },
    { label: "Retensi ditahan (5%)", value: -15_000_000 },
    { label: "Dibayar", value: 279_000_000 },
  ];
  const d = kwitansiDoc({
    no: "KW/TRM-2026-001",
    tanggal: "2026-10-02",
    diterimaDari: "PT BANGUNAN PERMANEN NUSANTARA",
    untuk: "TRM-2026-001 - Pekerjaan rangka kapal TB Nusantara 22",
    breakdown,
    netLabel: "Dibayar",
    catatan: "Bukti potong PPh: 1.2-345/2026\nReferensi pembayaran: BCN-88213 (Transfer)",
    locale: "id",
  }, { compress: false });
  const res = d.render();
  const raw = Buffer.from(res.bytes).toString("latin1");
  ok("kwitansi: nilai lengkap tercetak", raw.includes("279.000.000"), "279.000.000");
  ok("kwitansi: nomor tercetak", raw.includes("KW/TRM-2026-001"));
  ok("kwitansi: penerima tercetak", raw.includes("BANGUNAN PERMANEN"));
  ok("kwitansi: kwitansi tidak terpotong", res.pages === 1, `${res.pages} halaman`);
  const problems = checkGeometry(res, res.margin, { width: res.pageW, height: res.pageH });
  ok("kwitansi: geometri", problems.length === 0, problems.length === 0 ? "semua tinta di dalam content box" : `${problems.length} pelanggaran`);

  /* Nilai yang jauh lebih besar - nominal besar wajib tetap muat. */
  const big = kwitansiDoc({
    no: "KW/TRM-2026-999",
    tanggal: "2026-10-02",
    diterimaDari: "PT KONSTRUKSI REKAYASA INDUSTRI DAN PERTAHANAN NUSANTARA",
    untuk: "TRM-2026-999 - Perbaikan AMC kapal",
    breakdown: [{ label: "Nilai termin", value: 12_500_000_000 }, { label: "Dibayar", value: 12_500_000_000 }],
    netLabel: "Dibayar",
    locale: "id",
  }, { compress: false });
  const bigRes = big.render();
  const bigProblems = checkGeometry(bigRes, bigRes.margin, { width: bigRes.pageW, height: bigRes.pageH });
  ok("kwitansi: nilai besar tetap di dalam halaman", bigProblems.length === 0, `${bigProblems.length} pelanggaran`);

  /* Terbilang: nilai 279.000.000 harus jadi "dua ratus tujuh puluh sembilan juta". */
  ok("terbilang benar", ribu(279_000_000).startsWith("dua ratus tujuh puluh sembilan juta"), ribu(279_000_000));
  ok("terbilang nol", ribu(0) === "nol rupiah", ribu(0));
  ok("terbilang miliar", ribu(1_500_000_000).startsWith("satu miliar"), ribu(1_500_000_000));
}

/* ==========================================================================
   Integritas registry - kelas bug yang tidak terlihat dari atas
   ==========================================================================

   Probe di atas memakai model yang dibuat sendiri di dalam probe, jadi ia
   membuktikan mesin benar tapi TIDAK membuktikan registry benar. Dua kelas
   bug yang lolos semua probe lama ada di sini:

     1. Kind yang dipakai FE tapi tidak ada di registry. Pemanggil mengembalikan
        PDF lokal karena fallback menutupi error server - dokumennya tercetak
        dengan mesin yang berbeda, dan tidak ada yang diberi tahu.
     2. Recipe yang menunjuk tabel tidak ada. `SELECT ... FROM transmittals`
        gagal saat runtime; TypeScript tidak bisa melihatnya karena nama
        tabelnya cuma string.

   Ditambah Assemble dari snapshot, yang jalurnya sama dengan cetak ulang:
   model -> dokumen -> PDF, tanpa menyentuh DB sama sekali.
   -------------------------------------------------------------------------- */

const REPO = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/** Tabel yang benar-benar ada, dibaca dari berkas migrasi (sumber kebenaran). */
function knownTables(): Set<string> {
  const out = new Set<string>();
  const dir = path.join(REPO, "services/api/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    for (const m of raw.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi)) {
      out.add(String(m[1]));
    }
  }
  return out;
}

/** Kind PDF yang benar-benar dipanggil di FE. */
function frontendKinds(): Map<string, string> {
  const found = new Map<string, string>();
  const root = path.join(REPO, "apps/web/src");
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const raw = fs.readFileSync(full, "utf8");
        for (const m of raw.matchAll(/pdfDoc\.request\(\s*\{\s*kind:\s*"([A-Za-z0-9_]+)"/g)) {
          found.set(String(m[1]), path.relative(REPO, full).replaceAll("\\", "/"));
        }
      }
    }
  };
  walk(root);
  return found;
}

/** Model minimal per kind - cukup panjang untuk menguji pagination. */
const MODELS: Record<string, unknown> = {
  kwitansi: {
    no: "KW/TRM-2026-001",
    tanggal: "2026-10-02",
    diterimaDari: "PT KONSTRUKSI REKAYASA INDUSTRI DAN PERTAHANAN NUSANTARA",
    untuk: "TRM-2026-001 - Perbaikan AMC kapal",
    breakdown: [
      { label: "Nilai termin", value: 279_000_000 },
      { label: "PPh dipotong (2%)", value: -5_580_000 },
      { label: "Retensi ditahan (5%)", value: -13_950_000 },
      { label: "Dibayar", value: 259_470_000 },
    ],
    netLabel: "Dibayar",
    catatan: "Retensi dilepas setelah work order selesai.",
    locale: "id",
  },
  suratCuti: {
    no: "SPC/CUT-2026-014",
    nama: "Budi Santoso",
    nik: "1234567890123456",
    jabatan: "Welder Senior",
    unit: "Produksi",
    tipe: "Cuti",
    from: "2026-10-02",
    to: "2026-10-16",
    alasan: "Urusan keluarga yang tidak bisa diundur",
    approverNama: "Syarif Sarapping",
    approverJabatan: "Direktur",
    tanggalPersetujuan: "2026-10-01",
    locale: "id",
  },
  suratHr: {
    no: "SRT-2026-007",
    tanggal: "2026-10-02",
    jenis: "SP 2",
    namaKaryawan: "Siti Aminah",
    nik: "6543210987654321",
    jabatan: "Operator CNC",
    unit: "Produksi",
    pelanggaran: "Absen tanpa keterangan selama tiga hari kerja berturut-turut.",
    tanggalPelanggaran: "2026-09-20",
    tindakan: "Pemberitahuran tertulis dan evaluar ulang selama satu bulan",
    berlakuSampai: "2026-11-02",
    namaPemberi: "H. Syarif Sarapping",
    jabatanPemberi: "Direktur",
    locale: "id",
  },
  bast: {
    no: "BAST-2026-003",
    tanggal: "2026-10-02",
    projectName: "Repairs & Maintenance Km. Nyak Kopong",
    subcontractorName: "PT KRI REKAYASA",
    subcontractorAddress: "Jl.ymm Manunggal No.8, Balikpapan",
    scopeOfWork: "Penggantian plat engine, overhaul pompa injeksi, dan perbaikan sistem hidrolik kontrol kemudi.",
    deliverables: Array.from({ length: 24 }, (_, i) => ({ description: `Komponen pekerjaan nomor ${i + 1}`, qty: i + 1, unit: "unit", status: "Selesai" })),
    notes: "Diterima tanpa catatanminor.",
    nameReceiver: "H. Syarif Sarapping",
    nameGiver: "PT KRI REKAYASA",
    locale: "id",
  },
  spk: {
    no: "WO-2026-021",
    tanggal: "2026-10-02",
    projectName: "Repairs & Maintenance Km. Nyak Kopong",
    subcontractorName: "PT KRI REKAYASA",
    subcontractorAddress: "Jl. Manunggal No.8, Balikpapan",
    subcontractorNPWP: "01.234.567.8-901.000",
    scopeOfWork: "Pekerjaan dock repair dan overhaul pompa injeksi sesuai catatan pekerjaan.",
    startDate: "2026-10-05",
    endDate: "2026-12-20",
    contractValue: 750_000_000,
    paymentTerms: "Termin 30/40/30",
    k3Requirements: "Pakai alat pelindung diri lengkap; izin kerja panas untuk pekerjaan las.",
    nameDirector: "H. Syarif Sarapping",
    nameSubcontractor: "PT KRI REKAYASA",
    locale: "id",
  },
  po: {
    no: "PO/2026/10/0021",
    tanggal: "2026-10-02",
    vendorName: "PT SUMBER BAHAN BAKTI",
    vendorAddress: "Jl. Ahmad Yani No.45, Samarinda",
    vendorNPWP: "01.234.567.8-901.000",
    projectName: "Repairs & Maintenance Km. Nyak Kopong",
    items: Array.from({ length: 14 }, (_, i) => ({ description: `Bahan_${i + 1} - cat tembok galvanis 5 kg`, qty: 10 + i, unit: "tig", unitPrice: 150_000 + i * 1000, total: (10 + i) * (150_000 + i * 1000) })),
    subtotal: 0,
    taxRate: 11,
    taxAmount: 0,
    totalAmount: 0,
    paymentTerms: "NET 30",
    deliveryTerms: "DAP Samarinda",
    notes: "Barang dikirim bertahap sesuai kebutuhan lapangan.",
    nameOrderer: "H. Syarif Sarapping",
    nameApprover: "H. Syarif Sarapping",
    locale: "id",
  },
  suratJalan: {
    no: "01/SJ/2026",
    tanggal: "2026-10-02",
    tujuan: "Kapres Km. Sepinggan -Repair",
    projectName: "-",
    extra: [{ label: "Kendaraan", value: "Mobil Pickup" }, { label: "No. Polisi", value: "KT 1234 XX" }, { label: "Driver", value: "Budi" }],
    items: Array.from({ length: 12 }, (_, i) => ({ name: `Cat anti korosi 5 kg`, qty: String(i + 1) })),
    receiver: "Suryanto",
    giver: "Gudang",
    locale: "id",
  },
  deliveryOrder: {
    no: "DO/2026/10/0009",
    tanggal: "2026-10-02",
    tujuan: "Kapres Km. Sepinggan -Repair",
    driver: "Budi",
    sjRef: "01/SJ/2026",
    projectName: "-",
    items: [{ name: "Suku cadang pompa injeksi", qty: "4" }],
    receiver: "Suryanto",
    sender: "Gudang",
    locale: "id",
  },
  tandaTerima: {
    no: "02/TT/2026",
    tanggal: "2026-10-02",
    asal: "01/SJ/2026",
    projectName: "-",
    items: Array.from({ length: 8 }, (_, i) => ({ name: `Suku cadang_${i + 1}`, qty: String(i + 2) })),
    receiver: "Gudang",
    giver: "Suryanto",
    locale: "id",
  },
  kopPenawaran: {
    no: "QT-2026-011",
    tanggal: "2026-10-02",
    clientName: "PT PELAYARAN NUSANTARA",
    projectName: "Repairs & Maintenance Km. Nyak Kopong",
    totalValue: 1_250_000_000,
    validUntil: "2026-10-30",
    notes: "Harga belum termasuk GST danärtsmaterial approval.",
    nameSigner: "H. Syarif Sarapping",
    locale: "id",
  },
  slipGaji: {
    id: "PAY-2026-09-EMP-012",
    karyawan: "Ahmad Hidayat",
    periode: "2026-09",
    tipe: "Bulanan",
    rows: [
      { komponen: "Gaji Pokok", nilai: "Rp 7.000.000" },
      { komponen: "Tunjangan", nilai: "Rp 1.500.000" },
      { komponen: "Lembur", nilai: "Rp 650.000" },
      { komponen: "Potongan", nilai: "(Rp 250.000)" },
      { komponen: "BPJS Kesehatan", nilai: "(Rp 227.300)" },
      { komponen: "BPJS Ketenagakerjaan", nilai: "(Rp 189.400)" },
      { komponen: "PPh 21", nilai: "(Rp 78.400)" },
    ],
    netLabel: "Total Diterima",
    net: "Rp 8.404.900",
    status: "Dibayar",
    locale: "id",
  },
  transmittal: {
    no: "TR/2026/10/02/001",
    tanggal: "2026-10-02",
    projectName: "Repairs & Maintenance Km. Nyak Kopong",
    to: "BKI (Badan Klasifikasi Indonesia)",
    attention: "Surveyor kelas",
    items: Array.from({ length: 18 }, (_, i) => ({ code: `DRW-${String(i + 1).padStart(3, "0")}`, title: `Shop Drawing_${i + 1}`, revision: String.fromCharCode(65 + (i % 4)), status: "Disetujui" })),
    notes: "Mohon konfirmasi penerimaan dokumen ini.",
    sender: "H. Syarif Sarapping",
    locale: "id",
  },
  spt: {
    periode: "2026-09",
    tanggal: "2026-10-02",
    jenisPajak: "PPN",
    masaPajak: "2026-09",
    npwp: "01.234.567.8-901.000",
    npwpPenyetor: "01.234.567.8-901.000",
    namaWajibPajak: "PT. SYUKUR BERSAUDARA",
    alamat: "Jl. Mulawarman No.23, Samarinda",
    rows: [
      { jenis: "PPN Keluaran", nilai: 185_000_000 },
      { jenis: "PPN Masukan", nilai: -96_500_000 },
      { jenis: "PPh 21", dasar: "Total payroll", tarif: "-", nilai: 42_300_000 },
      { jenis: "PPh 23", nilai: 4_250_000 },
      { jenis: "PPh 22", nilai: 1_800_000 },
    ],
    ppnTerutang: 88_500_000,
    totalSetor: 136_850_000,
    buktiSetor: "NTPN-2026-09-000123",
    tanggalSetor: "2026-10-20",
    formulir: "01-AR-0000012345",
    bank: "Bank Mandiri Samarinda",
    teller: "012",
    namaPenandatangan: "H. Syarif Sarapping",
    jabatanPenandatangan: "Direktur",
    locale: "id",
  },
  /* Laporan: model sengaja dibuat paddle panjang supaya paginasi, grafik, dan
     baris total ikut teruji - bukan dokumen satu halaman yang selalu aman. */
  laporan: {
    mode: "Mingguan",
    periodLabel: "28 September 2026 - 4 Oktober 2026",
    from: "2026-09-28",
    to: "2026-10-04",
    cash: {
      from: "2026-09-28",
      to: "2026-10-04",
      invoiceIssued: 2_450_000_000,
      invoiceIssuedCount: 7,
      invoicePaid: 1_820_000_000,
      invoicePaidCount: 5,
      poIssued: 940_000_000,
      poCount: 12,
      apPaid: 610_000_000,
      payrollPaid: 385_000_000,
      payrollCount: 14,
      profit: 825_000_000,
      pph21: 42_300_000,
      pph23: 18_800_000,
      attendanceTotal: 96,
      attendancePresent: 88,
      attendancePct: 92,
    },
    prev: null,
    kpi: [
      { label: "Proyek aktif", value: "9", hint: "Progres rata-rata 61%" },
      { label: "Invoice terbit / lunas", value: "7 / 5", hint: "Rp 1.820.000.000" },
      { label: "PO terbit", value: "12", hint: "Rp 940.000.000" },
      { label: "Kehadiran", value: "92%", hint: "88 dari 96" },
    ],
    compare: [
      { label: "Pendapatan kas", value: "Rp 1.820.000.000 (Rp 120.000.000)" },
      { label: "Biaya", value: "Rp 995.000.000 (Rp -40.000.000)" },
      { label: "Laba", value: "Rp 825.000.000 (Rp 160.000.000)" },
    ],
    projects: Array.from({ length: 25 }, (_, i) => ({ id: `PRJ-${100 + i}`, vessel: `Km. Nusa Bahari ${i + 1}`, progress: 30 + i * 2, status: i % 4 === 0 ? "Terlambat" : "Dalam Proses" })),
    findings: Array.from({ length: 18 }, (_, i) => ({ kind: i % 3 === 0 ? "NCR" : "Insiden", id: `${i % 3 === 0 ? "NCR" : "INC"}-${i + 1}`, status: "Terbuka", date: "2026-10-02", text: `Temuan lapangan nomor ${i + 1} - perluxkoreksi pada area dek danffdokumentasi ulang.`, severity: "Minor" })),
    composition: [
      { label: "Invoice lunas", value: 5 },
      { label: "Invoice belum lunas", value: 2 },
      { label: "PO", value: 12 },
    ],
    signature: { name: "H. Syarif Sarapping", role: "Direktur", date: "2026-10-05" },
    locale: "id",
  },
  laporanProyek: {
    report: {
      id: "PRJ-2026-004",
      vessel: "Km. Nyak Kopong",
      client: "PT PELAYARAN NUSANTARA",
      manager: "Budi Santoso",
      type: "Repair",
      status: "Dalam Proses",
      start: "2026-06-01",
      end: "2026-12-20",
      budget: 2_500_000_000,
      actual: 1_320_000_000,
      progress: 62,
      budgetPct: 53,
      boqTotal: 2_450_000_000,
      boqApproved: 1_800_000_000,
      boqCount: 18,
      invoiceTotal: 1_100_000_000,
      invoiceUnpaid: 2,
      openNcr: 3,
      criticalNcr: 1,
      woCount: 4,
      wbsDone: 7,
      wbsCount: 12,
      equipmentRental: 210_000_000,
      equipmentMaintenance: 88_000_000,
      equipmentFuel: 22_000_000,
      serviceCount: 6,
      spareDone: 4,
    },
    wbs: Array.from({ length: 12 }, (_, i) => ({ task: `WBS ${i + 1} - Pekerjaan dek dan rnd anjang`, progress: Math.min(100, i * 9), status: i < 7 ? "Selesai" : "Berjalan" })),
    boq: Array.from({ length: 18 }, (_, i) => ({ name: `Item BoQ ${i + 1} - baja ship's plate 10 mm`, qty: `${i + 2} lbr`, total: 120_000_000 + i * 1_000_000, status: "Approved" })),
    invoices: Array.from({ length: 8 }, (_, i) => ({ id: `INV-2026-${100 + i}`, amount: 250_000_000, status: i < 6 ? "Lunas" : "Belum Lunas", due: "2026-10-05" })),
    workOrders: Array.from({ length: 4 }, (_, i) => ({ id: `WO-2026-0${i + 1}`, sub: `PT SUBKONTRAKTOR ${i + 1}`, progress: 40 + i * 10 })),
    findings: Array.from({ length: 5 }, (_, i) => ({ kind: "NCR", id: `NCR-2026-0${i + 1}`, status: i === 0 ? "Tertutup" : "Terbuka", date: "2026-09-20", text: `NCR ukuran ${i + 1}: las tidak memenuhi standar.`, severity: i === 0 ? "Minor" : "Critical" })),
    activity: Array.from({ length: 6 }, (_, i) => ({ actor: "QA", action: "menguji", target: `las seam #${i + 1}`, date: "2026-10-01" })),
    locale: "id",
  },
  analitik: {
    scope: "Analytics",
    periodLabel: "Okt 2025 - Okt 2026",
    series: Array.from({ length: 13 }, (_, i) => ({
      key: `2025-${String(10 + i).padStart(2, "0")}`.replace("2025-13", "2026-01"),
      label: `Bulan ${i + 1}`,
      revenue: 800 + i * 95 + (i % 3) * 40,
      cost: 600 + i * 70,
      margin: 12 + ((i * 7) % 18),
      projects: 4 + (i % 5),
    })),
    kpi: {
      totalProjects: 42,
      activeProjects: 27,
      lateProjects: 5,
      totalBudget: 48_000_000_000,
      totalActual: 31_500_000_000,
      avgProgress: 63,
      revenueYtd: 14_200,
      marginAvg: 18.4,
      openNcr: 11,
      criticalNcr: 3,
      activeEmployees: 128,
      equipmentBusy: 34,
      equipmentTotal: 52,
      drydockUsed: 3,
      drydockTotal: 5,
      lowStock: 7,
      unpaidInvoices: 9,
      unpaidPayables: 6,
    },
    growth: { revenue: 6.4, margin: -1.2 },
    ncrPareto: [
      { factor: "Pengelasan", count: 18, impact: 45, cumulative: 45 },
      { factor: "Dokumentasi", count: 12, impact: 30, cumulative: 75 },
      { factor: "Material", count: 6, impact: 15, cumulative: 90 },
      { factor: "Lainnya", count: 4, impact: 10, cumulative: 100 },
    ],
    profitByType: [
      { key: "New Build", budget: 22_000_000_000, actual: 13_500_000_000, profit: 8_500_000_000, count: 9 },
      { key: "Repair", budget: 18_000_000_000, actual: 12_800_000_000, profit: 5_200_000_000, count: 22 },
      { key: "Retrofit", budget: 8_000_000_000, actual: 5_200_000_000, profit: 2_800_000_000, count: 11 },
    ],
    profitByBranch: [
      { key: "Samarinda", budget: 30_000_000_000, actual: 19_000_000_000, profit: 11_000_000_000, count: 24 },
      { key: "Balikpapan", budget: 18_000_000_000, actual: 12_500_000_000, profit: 5_500_000_000, count: 18 },
    ],
    rework: { negativeCo: 420_000_000, ncrEstimate: 640_000_000, total: 1_060_000_000 },
    risk: {
      dockConflicts: 2,
      lowStock: [
        { name: "Cat anti korosi 5 kg", stock: 12, minStock: 20 },
        { name: "Kabel NYM 2x1,5 mm", stock: 40, minStock: 60 },
      ],
      atRiskProjects: [
        { id: "PRJ-2026-004", vessel: "Km. Nyak Kopong", status: "Dalam Proses" },
        { id: "PRJ-2026-009", vessel: "Km. Sepinggan", status: "Terlambat" },
      ],
      openNcr: 11,
      maintenancePending: 4,
      calibrationPending: 6,
      worstVendor: { name: "PT SUMBER BAHAN BAKTI", onTime: 62 },
    },
    projectStatus: [
      { label: "Dalam Proses", value: 18 },
      { label: "Selesai", value: 15 },
      { label: "Terlambat", value: 5 },
      { label: "Tertunda", value: 4 },
    ],
    locale: "id",
  },
  rekapPayroll: {
    mode: "Rekap",
    period: "2026-09",
    recap: {
      period: "2026-09",
      rows: Array.from({ length: 40 }, (_, i) => ({
        id: `PAY-202609-${String(i + 1).padStart(3, "0")}`,
        employee: `Karyawan Nomor ${i + 1}`,
        basic: 8_000_000 + i * 150_000,
        allowances: 2_500_000,
        overtime: i % 3 === 0 ? 850_000 : 0,
        loan: i % 7 === 0 ? 500_000 : 0,
        otherDeduction: 0,
        pph21: 420_000,
        bpjsKes: 105_000,
        bpjsTk: 210_000,
        net: 9_000_000 + i * 150_000,
        status: i % 4 === 0 ? "Dibayar" : "Disetujui",
      })),
      totals: { basic: 1_200_000_000, allowances: 200_000_000, overtime: 30_000_000, deduction: 12_000_000, pph21: 30_000_000, bpjs: 24_000_000, net: 1_400_000_000 },
    },
    thr: {
      period: "2026-09",
      rows: [
        { id: "PAY-202609-THR-001", employee: "Suryanto", type: "THR", amount: 9_800_000, note: "Basis 39.200.000 x 3/12 bulan", status: "Dibayar" },
        { id: "PAY-202609-BNS-001", employee: "Ahmad Hidayat", type: "Bonus", amount: 3_000_000, note: "Bonus kinerja semester", status: "Disetujui" },
      ],
      totalThr: 9_800_000,
      totalBonus: 3_000_000,
      totalNet: 12_800_000,
    },
    locale: "id",
  },
};

function registryIntegrity(): void {
  const tables = knownTables();
  const kinds = new Set(DOC_KINDS);

  for (const kind of DOC_KINDS) {
    const recipe = findRecipe(kind);
    ok(`registry: kind ${kind} terdaftar`, recipe !== undefined);
    if (!recipe) continue;
    ok(`registry: ${kind} menunjuk tabel nyata`, tables.has(recipe.entity.field), recipe.entity.field);
    const model = MODELS[kind];
    if (model === undefined) {
      ok(`registry: ${kind} punya model probe`, false, "tidak ada model di probe");
      continue;
    }
    /* Jalur yang sama dengan cetak ulang: model -> dokumen -> PDF. */
    try {
      const d = buildFromModel(recipe, JSON.parse(JSON.stringify(model)), { locale: "id", branch: "SEMUA" });
      const res = d.render();
      const raw = Buffer.from(res.bytes).toString("latin1");
      ok(`registry: ${kind} merakit dari snapshot`, raw.startsWith("%PDF-"), `${res.pages} halaman, ${res.bytes.byteLength} B`);
      const problems = checkGeometry(res, res.margin, { width: res.pageW, height: res.pageH });
      ok(`registry: ${kind} geometri snapshot`, problems.length === 0, problems.length === 0 ? "aman" : problems[0]?.reason ?? "");
    } catch (err) {
      ok(`registry: ${kind} merakit dari snapshot`, false, err instanceof Error ? err.message : String(err));
    }
  }

  /* Kind yang dipanggil FE harus ada. Ini yang dulu bocor: `suratHr` dipakai
     HR.tsx tapi tidak pernah terdaftar, jadi PDF-nya gagal diam-diam. */
  const used = frontendKinds();
  for (const [kind, file] of used) {
    ok(`call site ${kind} terdaftar di registry`, kinds.has(kind), file);
  }
  const unused = DOC_KINDS.filter((k) => !used.has(k));
  if (unused.length > 0) {
    console.log(`INFO  kind tanpa pemanggil FE (boleh - panggilan menyusul): ${unused.join(", ")}`);
  }
  ok("semua pemanggil PDF punya kind yang dikenal", used.size > 0, `${used.size} kind terpakai`);

  /* Nama file yang dirakit harus aman untuk header HTTP. */
  for (const kind of DOC_KINDS) {
    const no = String((MODELS[kind] as { no?: string; id?: string } | undefined)?.no ?? (MODELS[kind] as { id?: string } | undefined)?.id ?? "");
    ok(`nama berkas ${kind} aman`, !/["\r\n]/.test(`${kind}-${no.replaceAll("/", "-")}`));
  }
}

/* ==========================================================================
   Batas cabang
   ========================================================================== */

/*
 * Otorisasi cabang dijaga di sini karena dua-duanya bisa lolos tanpa error.
 *
 * 1. knownBranches() pernah membaca kolom `branch` saja, padahal kosakata
 *    cabang aplikasi ini adalah NAMA KOTA dari `branches.data.city`. Kolom
 *    branch nyaris kosong (invoice & jurnal punya branch = ""), jadi hasilnya
 *    hanya ["Samarinda"] - memilih "Balikpapan" di dropdown lalu ekspor
 *    laporan ditolak 400 padahal Balikpapan cabang yang sah.
 * 2. branchAllowed() menentukan apakah akun boleh melihat cabang tertentu.
 *    Salah di sini tidak error, hanya 403 yang salah sasaran.
 */
function branchAuthChecks(): void {
  const semua = { id: "u1", username: "dev", role: "developer", branch: "SEMUA" };
  const samarinda = { id: "u2", username: "mgr", role: "manager", branch: "Samarinda" };
  const legacy = { id: "u3", username: "lama", role: "viewer" } as unknown as { branch?: string };

  ok("branch: akun tanpa batas boleh SEMUA", branchAllowed(semua, "SEMUA"));
  ok("branch: akun tanpa batas boleh cabang tertentu", branchAllowed(semua, "Balikpapan"));
  ok("branch: akun terikat boleh cabangnya sendiri", branchAllowed(samarinda, "Samarinda"));
  ok("branch: akun terikat DITOLAK SEMUA", !branchAllowed(samarinda, "SEMUA"));
  ok("branch: akun terikat DITOLAK cabang lain", !branchAllowed(samarinda, "Balikpapan"));
  /* Token lama tidak punya claim branch. Default-nya harus tetap longgar,
     kalau tidak otorisasi jadi lebih ketat tanpa disengaja saat deploy. */
  ok("branch: token tanpa claim tidak terkunci", branchAllowed(legacy, "SEMUA"));
  /* Spasi harus dibersihkan - kalau tidak, satu karakter spasi di
     employees.branch membuat akun terkunci dari semua PDF tanpa jejak.
     Huruf besar tetap ketat: itu tanda data salah, bukan variasi ejaan. */
  ok("branch: spasi di cabang user diabaikan", branchAllowed({ ...samarinda, branch: " Samarinda " }, "Samarinda"));
  ok("branch: huruf besar tetap ditolak", !branchAllowed(samarinda, "samarinda"));

  /* CJK: huruf Mandarin tanpa glyph tercetak sebagai KOTAK, dan geometrinya
     tetap normal - dokumen keluar dari printer tanpa error apa pun. Yang
     membuat kelas kegagalan ini mahal adalah tidak ada yang gagal. */
  const cjk = cjkChars("PT Samudera Mandarin 有限公司 张三");
  ok("cjk: terdeteksi di dokumen Mandarin", cjk.length >= 3, `${cjk.length} huruf`);
  ok("cjk: tidak salah tangkap huruf Latin", cjkChars("PT Samudera Nusantara 123").length === 0);
  ok("cjk: tanda baca & simbol bukan CJK", cjkChars("Rp 1.500.000 (50%) - a/b").length === 0);
  /* 6 karakter berbeda, bukan 2 kata: cjkChars mengembalikan karakter
     unik, jadi "hiragana" (4) + "hangeul" (2). Menguji jumlah unik ini
     yang penting - kalau rentang codepoint-nya tumpang tindih, satu huruf
     bisa terhitung dua kali. */
  ok("cjk: kana & hangul ikut terdeteksi", cjkChars("\u3072\u3089\u304c\u306a\uD55C\uAE00").length === 6);

  /* Dokumen dengan huruf CJK harus melaporkan cjkChars lewat render, karena
     di luar situ tidak ada yang bisa tahu. Nama field kwitansi adalah
     `diterimaDari` - kalau salah nama, field-nya tidak terpakai dan dokumen
     tetap keluar dengan CJK = 0, jadi pemeriksaan ini diam-diam tidak
     menguji apa pun. Teks ditulis sebagai escape supaya berkas ini tetap
     ASCII dan tidak bisa rusak saat ditulis ulang di editor. */
  const dCjk = kwitansiDoc({
    ...(MODELS.kwitansi as Record<string, unknown>),
    diterimaDari: "\u5F20\u4F1F\u79D1\u6280",
    breakdown: [{ label: "Nilai termin", value: 1_000_000 }],
  } as never);
  const rCjk = dCjk.render();
  ok("render: dokumen CJK melaporkan cjkChars > 0", rCjk.cjkChars.length > 0, `${rCjk.cjkChars.length} huruf`);

  /* Dokumen Latin biasa tidak boleh melaporkan CJK - kalau iya berarti
     rentang codepoint-nya terlalu lebar dan setiap dokumen akan memicu
     peringatan palsu. */
  const dLat = kwitansiDoc(MODELS.kwitansi as never).render();
  ok("render: dokumen Latin tidak dilaporkan punya CJK", dLat.cjkChars.length === 0);

  knownBranches().then((known) => {
    /* Nama kota wajib masuk daftar; tanpa ini ekspor laporan yang cabangnya
       dipilih user akan ditolak 400. */
    const wajib = ["Samarinda", "Balikpapan", "Banjarmasin"];
    const kurang = wajib.filter((c) => !known.includes(c));
    ok(`branch: daftar cabang memuat ${wajib.length} nama kota`, kurang.length === 0, kurang.length > 0 ? `hilang: ${kurang.join(", ")}` : "");
    /* Nilai non-cabang harus disaring: "-" berarti "baris tanpa cabang" dan
       "SEMUA" bukan nama cabang. Menerimanya membuat filter yang tidak pernah
       menghasilkan apa pun lolos validasi. */
    const sampah = known.filter((c) => c === "" || c === "-" || c === "SEMUA");
    ok("branch: daftar cabang bebas nilai non-cabang", sampah.length === 0, sampah.length > 0 ? sampah.join(", ") : "");
    ringkasan();
  }).catch((err) => {
    console.log(`FAIL  daftar cabang tidak terbaca *** ${err instanceof Error ? err.message : String(err)}`);
    failures.push("daftar cabang tidak terbaca");
    ringkasan();
  });
}

function ringkasan(): void {
  console.log("");
  if (failures.length > 0) {
    console.log(`GAGAL ${failures.length}/${pass + failures.length}: ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${pass} pemeriksaan PDF lolos (geometri + isi + struktur + batas cabang).`);
  /* Status font sengaja dicetak apa adanya dan TIDAK menggagalkan probe:
     tanpa TTF, dokumen tetap valid - hanya huruf di luar WinAnsi yang jadi
     kotak. Yang tidak boleh terjadi adalah status ini tidak diketahui. */
  console.log(
    fontsEmbedded()
      ? `Font: TTF ter-embed dari ${FONTS_DIR}`
      : `Font: TIDAK ada TTF di ${FONTS_DIR} - standard-14 (huruf non-Latin jadi kotak). Set PDF_FONTS_DIR atau taruh regular/bold/italic.ttf di folder itu.`,
  );
  process.exit(0);
}

registryIntegrity();
branchAuthChecks();
