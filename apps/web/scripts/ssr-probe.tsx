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

import Login from "../src/pages/Login";
import Dashboard from "../src/pages/Dashboard";
import Analytics from "../src/pages/Analytics";
import Projects from "../src/pages/proyek/Projects";
import ProjectDetail from "../src/pages/proyek/ProjectDetail";
import Monitoring from "../src/pages/proyek/Monitoring";
import Inventory from "../src/pages/inventori/Inventory";
import BomDetail from "../src/pages/inventori/BomDetail";
import Finance from "../src/pages/keuangan/Finance";
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

/* Target export PDF harus BENAR-BENAR membungkus dashboard, bukan ringkasan
   yang ditulis tangan terpisah.

   Bug yang paling mungkin berulang di sini: id="dashboard-pdf" dipindah ke
   elemen lain - atau dipakai dua kali - tanpa ada yang gagal. exportPDF
   tetap mengembalikan PDF yang valid, toast tetap hijau, dan tidak ada satu
   pun gate yang protes; hanya isinya diam-diam jadi halaman lain. Karena
   itu id-nya dikunci di sini, bukan cuma dipercaya.

   Yang diperiksa: id itu ada tepat sekali di hasil render Dashboard, dan
   ada DI DALAM-nya -_chart recharts_ dan lebih dari satu kartu. Kalau suatu
   saat orang Collapse ke section_off-screen_, kartu hilang dari id itu dan
   pemeriksa ini yang akan lebih dulu menyadarinya. */
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
  const occurrences = html.split('id="dashboard-pdf"').length - 1;
  if (occurrences !== 1) {
    problems.push(`id="dashboard-pdf" muncul ${occurrences}x, harus tepat 1`);
  } else {
    const start = html.indexOf('id="dashboard-pdf"');
    /* Ambil sampai </div> penutup terluar seadanya: untuk keperluan ini
       cukup memastikan ada isi substensial SETELAH id itu, bukan hanya
       elemen kosong. */
    const inner = html.slice(start, start + 400000);
    const end = inner.lastIndexOf("</div>");
    const body = end > 0 ? inner.slice(0, end) : inner;
    if (!/recharts/i.test(body)) problems.push("tidak ada chart recharts di dalam target export");
    const cards = (body.match(/class="[^"]*\bcard\b/g) ?? []).length;
    if (cards < 5) problems.push(`hanya ${cards} kartu di dalam target export, dashboard punya 17`);
  }

  if (problems.length === 0) {
    console.log("PASS  target export PDF membungkus dashboard utuh");
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

console.log(`\n${pass}/${PAGES.length + 2} pemeriksaan lolos.`);
if (failures.length > 0) {
  console.log(`GAGAL: ${failures.join(", ")}`);
  process.exit(1);
}
process.exit(0);