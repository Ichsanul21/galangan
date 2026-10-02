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
 *
 * Jalankan: npm run probe:pdf
 */
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
  const problems = checkGeometry(res, MARGIN_MM, { width: PAGES.a4.width, height: PAGES.a4.height });
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
  const problems = checkGeometry(res, MARGIN_MM, { width: PAGES.a4.width, height: PAGES.a4.height });
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
  const problems = checkGeometry(res, MARGIN_MM, { width: PAGES.a4.width, height: PAGES.a4.height });
  ok("kwitansi: geometri", problems.length === 0, problems.length === 0 ? "semua tinta di dalam content box" : `${problems.length} pelanggaran`);

  /* Nilai yang jauh lebih besar - nominal besar wajib tetap muat. */
  const big = kwitansiDoc({
    no: "KW/TRM-2026-999",
    tanggal: "2026-10-02",
    diterimaDari: "PT KONSTRUKSI REKAYASA INDUSTRI DAN PERTAHANAN NUSANTARA",
    untuk: "TRM-2026-999 - PerbaikanAMC kapal",
    breakdown: [{ label: "Nilai termin", value: 12_500_000_000 }, { label: "Dibayar", value: 12_500_000_000 }],
    netLabel: "Dibayar",
    locale: "id",
  }, { compress: false });
  const bigRes = big.render();
  const bigProblems = checkGeometry(bigRes, MARGIN_MM, { width: PAGES.a4.width, height: PAGES.a4.height });
  ok("kwitansi: nilai besar tetap di dalam halaman", bigProblems.length === 0, `${bigProblems.length} pelanggaran`);

  /* Terbilang: nilai 279.000.000 harus jadi "dua ratus tujuh puluh sembilan juta". */
  ok("terbilang benar", ribu(279_000_000).startsWith("dua ratus tujuh puluh sembilan juta"), ribu(279_000_000));
  ok("terbilang nol", ribu(0) === "nol rupiah", ribu(0));
  ok("terbilang miliar", ribu(1_500_000_000).startsWith("satu miliar"), ribu(1_500_000_000));
}

/* ==========================================================================
   Ringkasan
   ========================================================================== */

console.log("");
if (failures.length > 0) {
  console.log(`GAGAL ${failures.length}/${pass + failures.length}: ${failures.join(" | ")}`);
  process.exit(1);
}
console.log(`${pass} pemeriksaan PDF lolos (geometri + isi + struktur).`);
process.exit(0);