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
import { StoreProvider } from "../src/data/store";
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
if (failures.length > 0) {
  console.log(`GAGAL: ${failures.join(", ")}`);
  process.exit(1);
}
process.exit(0);