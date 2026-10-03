/* Render probe: menjalankan SETIAP factory useMemo di seluruh halaman.
 *
 * Kenapa ada: `tsc` dan `vite build` TIDAK bisa menangkap temporal dead zone
 * (const yang dibaca di dalam closure tapi dideklarasikan lebih bawah).
 * Bug seperti "Cannot access 'numOf' before initialization" lolos build
 * lalu blank page di production. Satu-satunya cara mendeteksi kelas bug ini
 * adalah benar-benar merender komponennya.
 *
 * Cara pakai: npm run probe:render
 * Exit code bukan 0 kalau ada halaman yang gagal render.
 */
/* WAJIB import pertama: StoreProvider membaca localStorage saat render. */
import "./browser-shims";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "../src/i18n/LanguageContext";
import { StoreProvider, applyPulled } from "../src/data/store";
import { projects, vessels, inventory, employees, quotations } from "../src/data/index";
import { todayISO } from "../src/utils/format";
import { isPdfHead, renderPdfFrom } from "../src/services/pdfClient";

import Login from "../src/pages/Login";
import Dashboard from "../src/pages/Dashboard";
import Analytics from "../src/pages/Analytics";
import Projects from "../src/pages/proyek/Projects";
import ProjectDetail from "../src/pages/proyek/ProjectDetail";
import Monitoring from "../src/pages/proyek/Monitoring";
import Inventory from "../src/pages/inventori/Inventory";
import BomDetail from "../src/pages/inventori/BomDetail";
import Finance from "../src/pages/keuangan/Finance";
import { asOfOrToday, kasAsOfReport, liveAsOf, matchHist, histFromParam, histToParam } from "../src/pages/keuangan/Finance";
import type { HistFilter } from "../src/pages/keuangan/Finance";
import Payroll from "../src/pages/payroll/Payroll";
import HR from "../src/pages/sdm/HR";
import KaryawanDetail from "../src/pages/sdm/KaryawanDetail";
import Absensi from "../src/pages/absensi/Absensi";
import CRM from "../src/pages/crm/CRM";
import QuotationDetail from "../src/pages/crm/QuotationDetail";
import Procurement from "../src/pages/procurement/Procurement";
import QCSafety from "../src/pages/qc/QCSafety";
import Drydock from "../src/pages/drydock/Drydock";
import Subcontractor from "../src/pages/subkontraktor/Subcontractor";
import Vessels from "../src/pages/kapal/Vessels";
import VesselDetail from "../src/pages/kapal/VesselDetail";
import EquipmentPage from "../src/pages/equipment/Equipment";
import Documents from "../src/pages/dokumen/Documents";
import Laporan from "../src/pages/laporan/Laporan";
import Settings from "../src/pages/pengaturan/Settings";
import Peran from "../src/pages/pengaturan/Peran";
import Notifikasi from "../src/pages/notifikasi/Notifikasi";
import Audit from "../src/pages/audit/Audit";

/* Dipakai untuk exit code tanpa menambah @types/node sebagai dependency. */
declare const process: { exit(code: number): never };

/* ID diambil dari seed supaya probe tidak usang kalau id berubah. */
const firstId = (rows: { id?: unknown }[] | undefined, fallback: string): string =>
  String(rows?.[0]?.id ?? fallback);

const PAGES: { name: string; path: string; el: () => ReactElement }[] = [
  { name: "Login", path: "/login", el: () => <Login /> },
  { name: "Dashboard", path: "/dashboard", el: () => <Dashboard /> },
  { name: "Analytics", path: "/analytics", el: () => <Analytics /> },
  { name: "Projects", path: "/proyek", el: () => <Projects /> },
  { name: "ProjectDetail", path: `/proyek/${firstId(projects, "NB-2025-012")}`, el: () => <ProjectDetail /> },
  { name: "Monitoring", path: "/proyek/monitoring", el: () => <Monitoring /> },
  { name: "Inventory", path: "/inventori", el: () => <Inventory /> },
  { name: "BomDetail", path: `/inventori/bom/${firstId(inventory, "INV-SB-001")}`, el: () => <BomDetail /> },
  { name: "Finance", path: "/keuangan", el: () => <Finance /> },
  { name: "Payroll", path: "/payroll", el: () => <Payroll /> },
  { name: "HR", path: "/sdm", el: () => <HR /> },
  { name: "KaryawanDetail", path: `/sdm/karyawan/${firstId(employees, "EMP-001")}`, el: () => <KaryawanDetail /> },
  { name: "Absensi", path: "/absensi", el: () => <Absensi /> },
  { name: "CRM", path: "/crm", el: () => <CRM /> },
  { name: "QuotationDetail", path: `/crm/quotation/${firstId(quotations, "QUO-SB-001")}`, el: () => <QuotationDetail /> },
  { name: "Procurement", path: "/procurement", el: () => <Procurement /> },
  { name: "QCSafety", path: "/qc-safety", el: () => <QCSafety /> },
  { name: "Drydock", path: "/drydock", el: () => <Drydock /> },
  { name: "Subcontractor", path: "/subkontraktor", el: () => <Subcontractor /> },
  { name: "Vessels", path: "/kapal", el: () => <Vessels /> },
  { name: "VesselDetail", path: `/kapal/${firstId(vessels, "VND-001")}`, el: () => <VesselDetail /> },
  { name: "Equipment", path: "/equipment", el: () => <EquipmentPage /> },
  { name: "Documents", path: "/dokumen", el: () => <Documents /> },
  { name: "Laporan", path: "/laporan", el: () => <Laporan /> },
  { name: "Settings", path: "/pengaturan", el: () => <Settings /> },
  { name: "Peran", path: "/pengaturan/peran", el: () => <Peran /> },
  { name: "Notifikasi", path: "/notifikasi", el: () => <Notifikasi /> },
  { name: "Audit", path: "/audit", el: () => <Audit /> },
];

let pass = 0;
const failures: string[] = [];

for (const { name, path, el } of PAGES) {
  try {
    renderToString(
      <LanguageProvider>
        <StoreProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={path} element={el()} />
            </Routes>
          </MemoryRouter>
        </StoreProvider>
      </LanguageProvider>,
    );
    console.log(`PASS  ${name}`);
    pass += 1;
  } catch (e) {
    const err = e as Error;
    console.log(`FAIL  ${name} *** ${err.constructor.name} *** ${err.message}`);
    console.log(
      "      " + (err.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim()).join(" | "),
    );
    failures.push(name);
  }
}

console.log(`\n${pass}/${PAGES.length} halaman render tanpa error.`);

/* Ringkasan portofolio TIDAK lagi dipotret dari DOM.

   dulu `exportPDF("dashboard-pdf", ...)` memotret elemen itu dengan
   html2canvas, dan pemeriksaan ini mengunci `id="dashboard-pdf"` supaya
   targetnya benar-benar membungkus dashboard utuh. Sekarang PDF-nya dirakit
   server dari baris DB, jadi id itu sudah tidak ada - dan pemeriksa lama akan
   gagal terus although tidak ada yang salah.

   Yang dijaga di sini justru kebalikannya: tidak boleh ada area cetak
   tersembunyi di dashboard, dan tidak boleh ada pemanggilan exportPDF. Kalau
   salah satunya kembali, angka di PDF bisa lagi berbeda dari pembukuan karena
   HTML sudah dirender ulang atau difilter berbeda dari data server. */
try {
  const html = renderToString(
    <LanguageProvider>
      <StoreProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </StoreProvider>
    </LanguageProvider>,
  );

  const problems: string[] = [];
  /* Tidak boleh ada area cetak tersembunyi lagi: PDF-nya dirakit server, jadi
     elemen yang dipotret hanya menambah satu sumber angka yang bisa berbeda. */
  if (/id="dashboard-pdf"/.test(html)) problems.push('id="dashboard-pdf" masih ada - PDF tidak lagi dipotret dari DOM');
  /* Sebaliknya, dashboard tetap harus utuh di layar: chart dan kartunya
     tidak boleh ikut hilang saat area cetaknya dihapus. */
  if (!/recharts/i.test(html)) problems.push("chart dashboard hilang");
  const cards = (html.match(/class="[^"]*\bcard\b/g) ?? []).length;
  if (cards < 5) problems.push(`hanya ${cards} kartu di dashboard`);

  if (problems.length === 0) {
    console.log("PASS  ringkasan portofolio tidak punya area cetak DOM dan diminta ke server");
    pass += 1;
  } else {
    console.log(`FAIL  target export PDF *** ${problems.join("; ")}`);
    failures.push("target export PDF");
  }
} catch (e) {
  const err = e as Error;
  console.log(`FAIL  target export PDF *** ${err.message}`);
  failures.push("target export PDF");
}


/* Logika penggabungan hasil tarikan - akar-most dari "POST sukses lalu
   beberapa detik kemudian data hilang".
   Aturan yang diuji persis apa yang dijalankan resync/resyncCollections:
   server jadi acuan untuk id yang dia kenal, baris lokal yang belum ada di
   snapshot TIDAK BOLEH hilang.
   Repo ini belum punya satu pun file test, jadi kasus ini dikunci di probe:
   merge yang salah hanya muncul sebagai kehilangan data di lapangan, tidak
   pernah sebagai error. */
try {
  const sync: string[] = [];
  const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

  // 1. Baris yang dibuat SETELAH snapshot tiba harus bertahan.
  {
    const local = [row("A"), row("BARU")];
    const incoming = [row("A"), row("B")];
    const out = applyPulled(local, incoming);
    const ids = out.map((r) => r.id);
    if (!ids.includes("BARU")) sync.push("baris lokal yang dibuat setelah snapshot hilang");
    if (!ids.includes("B")) sync.push("baris server tidak ikut masuk");
    if (out.length !== 3) sync.push(`harus 3 baris, dapat ${out.length}`);
  }

  // 2. Id yang dikenal server: versi server yang menang (server otoritatif).
  {
    const out = applyPulled([row("A", { status: "lokal" })], [row("A", { status: "server" })]);
    if (out.length !== 1) sync.push("id yang sama terduplikasi saat digabung");
    if (String((out[0] as { status?: string }).status) !== "server") sync.push("server tidak menang untuk id yang sama");
  }

  // 3. Urutan lokal dipertahankan - tidak ada lompatan urutan di tabel UI.
  {
    const out = applyPulled([row("A"), row("B"), row("C")], [row("Z")]);
    const ids = out.map((r) => r.id).join(",");
    if (ids !== "A,B,C,Z") sync.push(`urutan berubah: ${ids}`);
  }

  // 4. Koleksi lokal kosong = tarikan menjadi acuan apa adanya.
  {
    const out = applyPulled(undefined, [row("X"), row("Y")]);
    if (out.length !== 2) sync.push("koleksi lokal kosong tidak menerima hasil tarikan");
  }

  // 5. Dua perangkat: baris yang sama sama di kedua sisi tidak hilang.
  {
    const local = [row("MTE-1", { status: "Selesai", updated_at: "2026-10-02T10:00:00" })];
    const incoming = [row("MTE-1", { status: "Berjalan" }), row("MTE-2")];
    const out = applyPulled(local, incoming);
    if (out.length !== 2) sync.push("baris perangkat lain hilang saat digabung");
  }

  if (sync.length === 0) {
    console.log("PASS  penggabungan tarikan tidak kehilangan baris lokal");
    pass += 1;
  } else {
    console.log(`FAIL  penggabungan tarikan *** ${sync.join("; ")}`);
    failures.push("penggabungan tarikan");
  }
} catch (e) {
  const err = e as Error;
  console.log(`FAIL  penggabungan tarikan *** ${err.message}`);
  failures.push("penggabungan tarikan");
}

/* Invariant saldo historikal: saldo harus KUMULATIF s.d. tanggal yang
   dipilih, sementara mutasi tetap period-scoped.
   Bug yang dikunci di sini: Kas & Bank menjumlahkan jurnal yang ada di
   dalam window filter, jadi memilih Juni hanya menjumlahkan mutasi Juni -
   saldo awal Mei hilang dan angka yang tampil bukan saldo. Karena saldo
   awal dari snapshot hanya tersedia untuk Agu-2026, setiap bulan lain
   menampilkan angka yang salah tanpa error apa pun. */
try {
  const asof: string[] = [];
  const KAS_BANK = /^(1-11|1-12)/;
  const j = (date: string, db: string, kr: string, amount: number, sumber = "Kas") => ({
    id: `J-${date}-${db}`, date, db, kr, amount, status: "Posted", sumber,
  });
  const journals = [
    j("2026-05-10", "1-1101", "4-101", 500),
    j("2026-05-20", "4-101", "1-1101", 200),
    j("2026-06-05", "1-1101", "5-101", 300),
  ];
  const juni = { mode: "Bulan", hari: "", bulan: "2026-06", tahun: "" } as const;
  const empty: Record<string, number> = {};

  /* liveAsOf: akhir bulan yang BENAR - bukan tanggal 31 untuk semua bulan.
     Juni hanya 30 hari, jadi `${bulan}-31` menghasilkan tanggal yang tidak
     ada dan badge di UI menampilkannya ke pengguna. */
  if (liveAsOf({ ...juni }) !== "2026-06-30") asof.push(`as-of bulan: ${liveAsOf({ ...juni })}`);
  if (liveAsOf({ mode: "Bulan", hari: "", bulan: "2026-02", tahun: "" }) !== "2026-02-28") asof.push("as-of Februari tidak ikut tahun kabisat");
  if (liveAsOf({ mode: "Bulan", hari: "", bulan: "2024-02", tahun: "" }) !== "2024-02-29") asof.push("as-of Februari 2024 bukan 29 (tahun kabisat)");
  if (liveAsOf({ mode: "Tahun", hari: "", bulan: "", tahun: "2026" }) !== "2026-12-31") asof.push("as-of tahun bukan 31 Desember");

  /* Mode "Semua" TIDAK boleh memakai konstanta. Versi lama return
     "2026-08-31" apa pun datanya, jadi transaksi setelah Agustus 2026 tidak
     pernah ikut terhitung dan tidak ada yang memberi tahu. Sekarang
     mengikuti transaksi terakhir yang benar-benar ada. */
  const semua = { mode: "Semua", hari: "", bulan: "", tahun: "" } as const;
  if (liveAsOf(semua) !== "") asof.push("mode Semua tanpa data seharusnya kosong, bukan konstanta");
  if (liveAsOf(semua, "2026-11-14") !== "2026-11-14") asof.push(`mode Semua memakai data terakhir: dapat ${liveAsOf(semua, "2026-11-14")}`);
  if (liveAsOf(semua, "bukan tanggal") !== "") asof.push("tanggal rusak tidak boleh jadi as-of");
  /* Guard terakhir: transaksi setelah as-of tidak boleh masuk hitungan. */
  const lewat = kasAsOfReport([...journals, j("2026-12-31", "1-1101", "5-101", 5000)] as never, liveAsOf(semua, "2026-06-30"), semua, empty, KAS_BANK);
  if (Math.abs((lewat.saldo["1-1101"] ?? 0) - 600) > 0.5) asof.push("mode Semua mengabaikan batas transaksi terakhir");

  /* Filter historikal harus survive reload -> harus bisa lewat URL.
     Round-trip diuji karena tautan yang rusak_total justru lebih buruk:
     penerima membuka halaman dengan angka orang lain tanpa sadar. */
  const codec: [string, HistFilter][] = [
    ["bulan:2026-06", { ...juni }],
    ["tahun:2026", { mode: "Tahun", hari: "", bulan: "", tahun: "2026" }],
    ["hari:2026-06-15", { mode: "Hari", hari: "2026-06-15", bulan: "", tahun: "" }],
  ];
  for (const [param, want] of codec) {
    if (histToParam(want) !== param) asof.push(`encode ${param}: dapat ${histToParam(want)}`);
    const back = histFromParam(param);
    if (histToParam(back) !== param) asof.push(`round-trip ${param} rusak: kembali jadi ${histToParam(back)}`);
  }
  /* Parameter tak sah / dari luar harus jatuh ke default, bukan setengah
     dipakai - filter dengan tanggal acuan salah lebih berbahaya daripada
     filter kosong karena terlihat sah. */
  for (const bad of ["", "bulan:", "bulan:2026-13", "hari:2026-02-30", "tahun:26", "../../etc", "bulan:2026-06&x"]) {
    if (histToParam(histFromParam(bad)) !== "") asof.push(`parameter tak sah diterima: ${bad}`);
  }

  /* matchHist tetap period-scoped - itu memang Behavior yang benar untuk
     kolom mutasi, dan harus terus begitu. */
  if (!matchHist("2026-06-05", juni)) asof.push("mutasi Juni tidak masuk periode Juni");
  if (matchHist("2026-05-10", juni)) asof.push("mutasi Mei ikut terhitung di periode Juni");

  const rep = kasAsOfReport(journals as never, liveAsOf({ ...juni }), { ...juni }, empty, KAS_BANK);
  /* Saldo kumulatif 1-1101 = +500 -200 +300 = 600. Kalau hanya mutasi
     Juni yang dijumlahkan, hasilnya 300 - dan itulah bug aslinya. */
  if (Math.abs((rep.saldo["1-1101"] ?? 0) - 600) > 0.5) asof.push(`saldo kumulatif: dapat ${rep.saldo["1-1101"] ?? 0}, harus 600`);
  /* Mutasi periode hanya Juni: masuk 300, keluar 0. */
  if ((rep.masuk["1-1101"] ?? 0) !== 300) asof.push(`mutasi masuk Juni: dapat ${rep.masuk["1-1101"] ?? 0}, harus 300`);
  if ((rep.keluar["1-1101"] ?? 0) !== 0) asof.push(`mutasi keluar Juni: dapat ${rep.keluar["1-1101"] ?? 0}, harus 0`);
  if (rep.hitung !== 1) asof.push(`baris terhitung: dapat ${rep.hitung}, harus 1 (hanya Juni)`);

  /* Saldo benar-benar bergerak seiring tanggal: Mei lebih kecil dari Juni. */
  const mei = kasAsOfReport(journals as never, liveAsOf({ mode: "Bulan", hari: "", bulan: "2026-05", tahun: "" }), { mode: "Bulan", hari: "", bulan: "2026-05", tahun: "" }, empty, KAS_BANK);
  if (!((mei.saldo["1-1101"] ?? 0) < (rep.saldo["1-1101"] ?? 0))) asof.push("saldo Mei tidak lebih kecil dari saldo Juni");

  /* Opening balance snapshot hanya boleh dipakai untuk bulan snapshot. */
  const withOpening = kasAsOfReport(journals as never, "2026-08-31", { mode: "Semua", hari: "", bulan: "", tahun: "" }, { "1-1101": 1000 }, KAS_BANK);
  if (Math.abs((withOpening.saldo["1-1101"] ?? 0) - 1600) > 0.5) asof.push(`opening balance tidak ditambahkan: ${withOpening.saldo["1-1101"] ?? 0}`);

  /* Jurnal Void tidak boleh mengubah saldo. */
  const withVoid = kasAsOfReport([...journals, { ...j("2026-06-10", "1-1101", "5-101", 999), status: "Void" }] as never, "2026-06-30", { ...juni }, empty, KAS_BANK);
  if (Math.abs((withVoid.saldo["1-1101"] ?? 0) - 600) > 0.5) asof.push("jurnal Void ikut mengubah saldo");

  /* Jurnal setelah tanggal as-of tidak boleh ikut. */
  const withFuture = kasAsOfReport([...journals, j("2026-07-15", "1-1101", "5-101", 7777)] as never, "2026-06-30", { ...juni }, empty, KAS_BANK);
  if (Math.abs((withFuture.saldo["1-1101"] ?? 0) - 600) > 0.5) asof.push("jurnal setelah tanggal as-of ikut dihitung");

  /* Rekening non-Kas tidak boleh masuk. */
  if (Object.keys(rep.saldo).some((k) => !KAS_BANK.test(k))) asof.push("rekening selain Kas/Bank ikut terhitung");

  /* Data kosong tidak boleh meledak jadi as-of sekarang - asOfOrToday
     sengaja memakai hari ini sebagai jaring pengaman, jadi yang diuji di
     sini hanya konvensi itu, bukan kebenaran datanya. */
  if (asOfOrToday(semua) !== todayISO()) asof.push("asOfOrToday tanpa data bukan hari ini");

  if (asof.length === 0) {
    console.log("PASS  saldo historikal kumulatif s.d. as-of, mutasi tetap period-scoped");
    pass += 1;
  } else {
    console.log(`FAIL  saldo historikal *** ${asof.join("; ")}`);
    failures.push("saldo historikal");
  }
} catch (e) {
  const err = e as Error;
  console.log(`FAIL  saldo historikal *** ${err.message}`);
  failures.push("saldo historikal");
}

/* Pemeriksaan magic bytes PDF.

   Bug nyata di pdfClient.ts: 4 byte dirangkai ("%PDF") dibandingkan dengan
   literal 5 karakter ("%PDF-"), jadi tidak akan pernah sama dan SETIAP
   ekspor PDF gagal di semua modul - padahal server mengirim PDF yang
   benar. Tidak ada gate yang menangkapnya: probe PDF berjalan di server
   (mesin vektor), probe render hanya SSR, dan tidak ada yang pernah memanggil
   fetch ke /api/pdf/render. Diuji di sini supaya kelas bug ini tertutup.

   magic.pdf ini juga diberi tanda `pure` supaya tidak ikut ter-collect
   sebagai halaman - ia fungsi, bukan komponen. */
{
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const sync: string[] = [];
  if (!isPdfHead(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))) sync.push("5 byte magic PDF ditolak");
  if (!isPdfHead(enc("%PDF-1.7"))) sync.push("PDF asli 6 byte ditolak");
  /* 4 byte harus DITOLAK - inilah bug yang pernah ada. */
  if (isPdfHead(enc("%PDF"))) sync.push("PDF 4 byte diterima: perbandingan magic salah panjang");
  if (isPdfHead(enc(""))) sync.push("body kosong diterima sebagai PDF");
  if (isPdfHead(enc("<!DOCTYPE html>"))) sync.push("HTML diterima sebagai PDF");
  if (isPdfHead(enc("%PDG-"))) sync.push("magic mirip tapi salah diterima");

  if (sync.length === 0) {
    console.log("PASS  magic bytes PDF dikenali dan tidak salah panjang");
    pass += 1;
  } else {
    console.log(`FAIL  magic bytes PDF *** ${sync.join("; ")}`);
    failures.push("magic bytes PDF");
  }
}

/* Uji jalur klien PDF sampai habis, dengan hanya transport yang dipalsukan.

   Yang diuji adalah kode renderPdfFrom yang BENAR-BENAR dipakai aplikasi:
   pembentukan URL, header, penanganan status non-2xx, res.blob(), dan
   pemeriksaan magic bytes. Hanya `fetch` yang diganti, karena itu bagian
   yang tidak pernah jadi penyebab bug dan butuh server nyala.

   Ini menutup celah yang membuat ekspor PDF gagal 100% di semua modul
   tanpa ada gate yang menyadarinya: probe PDF ada di server, probe render
   hanya SSR, dan tidak ada yang pernah memanggil jalur klien ini. */
{
  const problems: string[] = [];
  const realFetch = globalThis.fetch;
  /* PDF sungguhan dari server dimulai "%PDF-1.3"; sisanya boleh apa saja
     karena yang diperiksa hanya magic-nya. */
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x33, 0x0a, 0x25, 0xe2, 0xe3]);

  const stub = (body: BodyInit | null, status: number, headers: Record<string, string>): void => {
    globalThis.fetch = (async () =>
      new Response(body, { status, headers: { "Content-Type": "application/pdf", ...headers } })) as typeof fetch;
  };

  /* 1. PDF asli harus diterima, dan semua header harus terbaca. */
  try {
    stub(pdfBytes, 200, {
      "X-Doc-Pages": "3",
      "X-Doc-Embedded-Font": "1",
      "X-Doc-Cjk": "4",
      "X-Doc-Model-Id": "PDF-TEST-1",
    });
    const r = await renderPdfFrom("https://contoh.test", "jwt-token", { kind: "kwitansi", id: "TRM-001" });
    if (!r.url.startsWith("blob:")) problems.push(`url bukan blob: ${r.url}`);
    if (r.pages !== 3) problems.push(`pages: dapat ${r.pages}, harus 3`);
    if (r.embeddedFont !== true) problems.push("embeddedFont tidak terbaca");
    if (r.cjkChars !== 4) problems.push(`cjkChars: dapat ${r.cjkChars}, harus 4`);
    if (r.modelId !== "PDF-TEST-1") problems.push(`modelId: dapat ${r.modelId}`);
    if (r.bytes !== pdfBytes.length) problems.push(`bytes: dapat ${r.bytes}, harus ${pdfBytes.length}`);
    URL.revokeObjectURL(r.url);
  } catch (e) {
    problems.push(`PDF asli ditolak: ${e instanceof Error ? e.message : String(e)}`);
  }

  /* 2. Header wajib ikut pada request - tanpa Authorization server akan 401. */
  try {
    let seenAuth = "";
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      return new Response(pdfBytes, { status: 200 });
    }) as typeof fetch;
    await renderPdfFrom("https://contoh.test", "jwt-token", { kind: "kwitansi", id: "TRM-001" });
    if (seenAuth !== "Bearer jwt-token") problems.push(`Authorization tidak dikirim: "${seenAuth}"`);
  } catch (e) {
    problems.push(`cek header gagal: ${e instanceof Error ? e.message : String(e)}`);
  }

  /* 3. Error server harus meneruskan pesannya, bukan "bukan berkas PDF".
        Salah Label membuat orang dikirim ke arah yang salah. */
  try {
    stub(JSON.stringify({ ok: false, error: { message: "Termin TRM-001 tidak ditemukan" } }), 500, {
      "Content-Type": "application/json",
    });
    await renderPdfFrom("https://contoh.test", "", { kind: "kwitansi", id: "TRM-001" });
    problems.push("error 500 tidak melempar");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("tidak ditemukan")) problems.push(`pesan server hilang: "${msg}"`);
    if (msg.includes("VITE_API_URL")) problems.push("error 500 salah dilabeli sebagai konfigurasi URL");
  }

  /* 4. Proxy yang membalas HTML harus ditolak - inilah pesan aslinya. */
  try {
    stub("<!DOCTYPE html><html>SPA fallback</html>", 200, { "Content-Type": "text/html" });
    await renderPdfFrom("https://contoh.test", "", { kind: "kwitansi", id: "TRM-001" });
    problems.push("HTML 200 diterima sebagai PDF");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("bukan berkas PDF")) problems.push("HTML ditolak dengan pesan yang salah");
  }

  /* 5. Body kosong harus ditolak, bukan dianggap PDF. */
  try {
    stub("", 200, {});
    await renderPdfFrom("https://contoh.test", "", { kind: "kwitansi", id: "TRM-001" });
    problems.push("body kosong diterima sebagai PDF");
  } catch {
    /* menolak = benar */
  }

  globalThis.fetch = realFetch;

  if (problems.length === 0) {
    console.log("PASS  jalur klien PDF: PDF diterima, header terbaca, error diteruskan");
    pass += 1;
  } else {
    console.log(`FAIL  jalur klien PDF *** ${problems.join("; ")}`);
    failures.push("jalur klien PDF");
  }
}

console.log(`\n${pass}/${PAGES.length + 5} pemeriksaan lolos.`);
if (failures.length > 0) {
  console.log(`GAGAL: ${failures.join(", ")}`);
  process.exit(1);
}
process.exit(0);