import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import AppShell from "./layouts/AppShell";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/proyek" element={<Projects />} />
          <Route path="/proyek/:id" element={<ProjectDetail />} />
          <Route path="/inventori" element={<Inventory />} />
          <Route path="/keuangan" element={<Finance />} />
          <Route path="/sdm" element={<HR />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/procurement" element={<Procurement />} />
          <Route path="/qc-safety" element={<QCSafety />} />
          <Route path="/drydock" element={<Drydock />} />
          <Route path="/subkontraktor" element={<Subcontractor />} />
          <Route path="/kapal" element={<Vessels />} />
          <Route path="/kapal/:id" element={<VesselDetail />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/dokumen" element={<Inventory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
