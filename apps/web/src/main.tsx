import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@google/model-viewer";
import "./index.css";
import { AuthProvider, RequireAuth } from "./auth/auth";
import { StoreProvider } from "./data/store";
import { SecurityGuards } from "./security/watermark";
import AppShell from "./layouts/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Projects from "./pages/proyek/Projects";
import ProjectDetail from "./pages/proyek/ProjectDetail";
import Inventory from "./pages/inventori/Inventory";
import Finance from "./pages/keuangan/Finance";
import HR from "./pages/sdm/HR";
import CRM from "./pages/crm/CRM";
import Procurement from "./pages/procurement/Procurement";
import QCSafety from "./pages/qc/QCSafety";
import Drydock from "./pages/drydock/Drydock";
import Subcontractor from "./pages/subkontraktor/Subcontractor";
import Vessels from "./pages/kapal/Vessels";
import VesselDetail from "./pages/kapal/VesselDetail";
import EquipmentPage from "./pages/equipment/Equipment";
import Documents from "./pages/dokumen/Documents";
import Absensi from "./pages/absensi/Absensi";
import Payroll from "./pages/payroll/Payroll";
import Laporan from "./pages/laporan/Laporan";
import Monitoring from "./pages/proyek/Monitoring";
import BomDetail from "./pages/inventori/BomDetail";
import KaryawanDetail from "./pages/sdm/KaryawanDetail";
import QuotationDetail from "./pages/crm/QuotationDetail";
import { ErrorBoundary } from "./components/ui";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <SecurityGuards />
      <StoreProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<ErrorBoundary title="Dashboard gagal dimuat"><Dashboard /></ErrorBoundary>} />
              <Route path="/dashboard" element={<ErrorBoundary title="Dashboard gagal dimuat"><Dashboard /></ErrorBoundary>} />
              <Route path="/analytics" element={<ErrorBoundary title="Analytics gagal dimuat"><Analytics /></ErrorBoundary>} />
              <Route path="/proyek" element={<ErrorBoundary title="Proyek gagal dimuat"><Projects /></ErrorBoundary>} />
              <Route path="/proyek/monitoring" element={<ErrorBoundary title="Monitoring gagal dimuat"><Monitoring /></ErrorBoundary>} />
              <Route path="/proyek/:id" element={<ErrorBoundary title="Detail proyek gagal dimuat"><ProjectDetail /></ErrorBoundary>} />
              <Route path="/inventori" element={<ErrorBoundary title="Inventori gagal dimuat"><Inventory /></ErrorBoundary>} />
              <Route path="/inventori/bom/:id" element={<ErrorBoundary title="BOM gagal dimuat"><BomDetail /></ErrorBoundary>} />
              <Route path="/absensi" element={<ErrorBoundary title="Absensi gagal dimuat"><Absensi /></ErrorBoundary>} />
              <Route path="/payroll" element={<ErrorBoundary title="Payroll gagal dimuat"><Payroll /></ErrorBoundary>} />
              <Route path="/laporan" element={<ErrorBoundary title="Laporan gagal dimuat"><Laporan /></ErrorBoundary>} />
              <Route path="/keuangan" element={<ErrorBoundary title="Keuangan gagal dimuat"><Finance /></ErrorBoundary>} />
              <Route path="/sdm" element={<ErrorBoundary title="SDM gagal dimuat"><HR /></ErrorBoundary>} />
              <Route path="/sdm/karyawan/:id" element={<ErrorBoundary title="Karyawan gagal dimuat"><KaryawanDetail /></ErrorBoundary>} />
              <Route path="/crm" element={<ErrorBoundary title="CRM gagal dimuat"><CRM /></ErrorBoundary>} />
              <Route path="/crm/quotation/:id" element={<ErrorBoundary title="Penawaran gagal dimuat"><QuotationDetail /></ErrorBoundary>} />
              <Route path="/procurement" element={<ErrorBoundary title="Procurement gagal dimuat"><Procurement /></ErrorBoundary>} />
              <Route path="/qc-safety" element={<ErrorBoundary title="QC & Safety gagal dimuat"><QCSafety /></ErrorBoundary>} />
              <Route path="/drydock" element={<ErrorBoundary title="Drydock gagal dimuat"><Drydock /></ErrorBoundary>} />
              <Route path="/subkontraktor" element={<ErrorBoundary title="Subkontraktor gagal dimuat"><Subcontractor /></ErrorBoundary>} />
              <Route path="/kapal" element={<ErrorBoundary title="Kapal gagal dimuat"><Vessels /></ErrorBoundary>} />
              <Route path="/kapal/:id" element={<ErrorBoundary title="Detail kapal gagal dimuat"><VesselDetail /></ErrorBoundary>} />
              <Route path="/equipment" element={<ErrorBoundary title="Equipment gagal dimuat"><EquipmentPage /></ErrorBoundary>} />
              <Route path="/dokumen" element={<ErrorBoundary title="Dokumen gagal dimuat"><Documents /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </AuthProvider>
  </React.StrictMode>
);

