// ===== Mock data ISMS Galangan =====
// Data realistis untuk 13 modul; angka dalam Rupiah (IDR).

export type ProjectStatus =
  | "Sedang Berjalan"
  | "Dalam Proses"
  | "Selesai"
  | "Terlambat"
  | "Tertunda";

export interface Project {
  id: string;
  vessel: string;
  type: "New Build" | "Repair" | "Retrofit";
  client: string;
  status: ProjectStatus;
  branch: string;
  start: string;
  end: string;
  progress: number;
  budget: number;
  actual: number;
  manager: string;
  scope: string[];
}

export const clients = [
  { id: "C-001", name: "PT Samudra Jaya Perkasa", fleet: 12, rating: 92, since: 2015 },
  { id: "C-002", name: "PT Pelayaran Nusantara Abadi", fleet: 8, rating: 88, since: 2018 },
  { id: "C-003", name: "PT Karya Bahari Sejahtera", fleet: 15, rating: 95, since: 2012 },
  { id: "C-004", name: "PT Laut Timur Mandiri", fleet: 6, rating: 78, since: 2019 },
  { id: "C-005", name: "PT Mitra Samudra Raya", fleet: 10, rating: 85, since: 2016 },
];

export const projects: Project[] = [
  {
    id: "NB-2025-012",
    vessel: "TB Samudra Jaya 07",
    type: "New Build",
    client: "PT Samudra Jaya Perkasa",
    status: "Sedang Berjalan",
    branch: "Samarinda",
    start: "2025-11-10",
    end: "2026-09-30",
    progress: 62,
    budget: 48000000000,
    actual: 29600000000,
    manager: "Ir. Hendra Wijaya",
    scope: ["Desain", "Fabrikasi Baja", "Hull Assembly", "Mesin & Kelistrikan", "Pengecatan", "Sea Trial"],
  },
  {
    id: "NB-2025-014",
    vessel: "TB Nusantara 22",
    type: "New Build",
    client: "PT Pelayaran Nusantara Abadi",
    status: "Sedang Berjalan",
    branch: "Samarinda",
    start: "2026-01-15",
    end: "2026-12-20",
    progress: 41,
    budget: 46500000000,
    actual: 19800000000,
    manager: "Budi Santoso",
    scope: ["Desain", "Fabrikasi Baja", "Hull Assembly", "Mesin & Kelistrikan"],
  },
  {
    id: "RP-2026-003",
    vessel: "TB Karya Bahari 12",
    type: "Repair",
    client: "PT Karya Bahari Sejahtera",
    status: "Dalam Proses",
    branch: "Samarinda",
    start: "2026-07-01",
    end: "2026-08-05",
    progress: 78,
    budget: 4200000000,
    actual: 3310000000,
    manager: "Rudi Hartono",
    scope: ["Survey Docking", "Pengecatan Lambung", "Perbaikan Poros", "Sea Valve", "Propeller"],
  },
  {
    id: "RP-2026-005",
    vessel: "TB Samudra Jaya 04",
    type: "Repair",
    client: "PT Samudra Jaya Perkasa",
    status: "Terlambat",
    branch: "Samarinda",
    start: "2026-06-20",
    end: "2026-07-25",
    progress: 55,
    budget: 3800000000,
    actual: 2400000000,
    manager: "Agus Setiawan",
    scope: ["Overhaul Mesin", "Kelistrikan", "Pengecatan"],
  },
  {
    id: "RF-2026-001",
    vessel: "TB Karya Bahari 15",
    type: "Retrofit",
    client: "PT Karya Bahari Sejahtera",
    status: "Sedang Berjalan",
    branch: "Samarinda",
    start: "2026-05-01",
    end: "2026-08-30",
    progress: 84,
    budget: 9800000000,
    actual: 8420000000,
    manager: "Ir. Hendra Wijaya",
    scope: ["Sistem Navigasi", "Mesin AUX", "Sistem Pendingin", "Kelistrikan"],
  },
  {
    id: "NB-2026-001",
    vessel: "TB Laut Timur 01",
    type: "New Build",
    client: "PT Laut Timur Mandiri",
    status: "Tertunda",
    branch: "Samarinda",
    start: "2026-02-01",
    end: "2027-01-15",
    progress: 23,
    budget: 45000000000,
    actual: 10800000000,
    manager: "Budi Santoso",
    scope: ["Desain", "Fabrikasi Baja"],
  },
  {
    id: "RP-2026-002",
    vessel: "TB Mitra Raya 09",
    type: "Repair",
    client: "PT Mitra Samudra Raya",
    status: "Selesai",
    branch: "Samarinda",
    start: "2026-06-01",
    end: "2026-06-28",
    progress: 100,
    budget: 3600000000,
    actual: 3490000000,
    manager: "Rudi Hartono",
    scope: ["Docking", "Pengecatan", "Rudder"],
  },
];

export const vessels = [
  {
    id: "V-001",
    name: "TB Samudra Jaya 07",
    imo: "IMO 9912345",
    type: "Tugboat ASD 2x1600 HP",
    class: "BKI",
    flag: "Indonesia",
    built: 2026,
    owner: "PT Samudra Jaya Perkasa",
    loa: 31.5,
    beam: 9.8,
    draft: 4.2,
    bollard: 45,
    status: "Dalam Pembangunan",
    certificates: [
      { name: "Certificate of Class", issued: "2026-09", expires: "2031-09", tone: "green" },
      { name: "BWTS Compliance", issued: "2026-09", expires: "2029-09", tone: "green" },
      { name: "Radio License", issued: "2026-09", expires: "2027-09", tone: "amber" },
    ],
    history: [
      { date: "2025-11-10", event: "Keel laying & kontrak", type: "Kontrak" },
      { date: "2026-03-15", event: "Hull assembly selesai", type: "Produksi" },
      { date: "2026-09-30", event: "Sea trial terjadwal", type: "Uji" },
    ],
  },
  {
    id: "V-002",
    name: "TB Karya Bahari 12",
    imo: "IMO 9811123",
    type: "Tugboat ASD 2x1200 HP",
    class: "BKI",
    flag: "Indonesia",
    built: 2019,
    owner: "PT Karya Bahari Sejahtera",
    loa: 29.4,
    beam: 9.2,
    draft: 4.0,
    bollard: 38,
    status: "Dalam Docking",
    certificates: [
      { name: "Certificate of Class", issued: "2023-08", expires: "2026-08", tone: "red" },
      { name: "SOPEP", issued: "2024-02", expires: "2027-02", tone: "amber" },
    ],
    history: [
      { date: "2019-06-01", event: "Delivered", type: "Delivery" },
      { date: "2023-08-15", event: "Special survey", type: "Survey" },
      { date: "2026-07-01", event: "Drydocking & repair", type: "Docking" },
    ],
  },
  {
    id: "V-003",
    name: "TB Nusantara 22",
    imo: "IMO 9923456",
    type: "Tugboat ASD 2x1800 HP",
    class: "BKI",
    flag: "Indonesia",
    built: 2026,
    owner: "PT Pelayaran Nusantara Abadi",
    loa: 32.0,
    beam: 10.1,
    draft: 4.4,
    bollard: 52,
    status: "Dalam Pembangunan",
    certificates: [],
    history: [
      { date: "2026-01-15", event: "Kontrak & desain", type: "Kontrak" },
      { date: "2026-06-20", event: "Keel laying", type: "Produksi" },
    ],
  },
];

export const drydocks = [
  { id: "DD-1", name: "Drydock 1 — Panjang 120m", capacity: "120m / 12m / 6m draft", status: "Terpakai" },
  { id: "DD-2", name: "Drydock 2 — Panjang 90m", capacity: "90m / 10m / 5m draft", status: "Terpakai" },
  { id: "SL-1", name: "Slipway 1", capacity: "80m / bearer", status: "Tersedia" },
  { id: "BH-1", name: "Berth 1", capacity: "New build assembly", status: "Terpakai" },
];

// Slot jadwal docking: id, dockId, project, vessel, from, to (day indexes relative), color
export const dockSlots = [
  { id: "S1", dockId: "DD-1", project: "RP-2026-003", vessel: "TB Karya Bahari 12", from: 1, to: 35, color: "bg-ocean-500" },
  { id: "S2", dockId: "DD-2", project: "RP-2026-005", vessel: "TB Samudra Jaya 04", from: 1, to: 22, color: "bg-amber-500" },
  { id: "S3", dockId: "DD-1", project: "NB-2026-001", vessel: "TB Laut Timur 01", from: 44, to: 62, color: "bg-steel-400" },
  { id: "S4", dockId: "BH-1", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", from: 1, to: 90, color: "bg-navy-700" },
  { id: "S5", dockId: "BH-1", project: "NB-2025-014", vessel: "TB Nusantara 22", from: 10, to: 90, color: "bg-ocean-500" },
];

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  warehouse: string;
  stock: number;
  minStock: number;
  unit: string;
  cost: number;
  location: string;
}

export const inventory: InventoryItem[] = [
  { id: "INV-001", name: "Pelat Baja AH36 12mm", category: "Baja", sku: "AH36-12", warehouse: "Gudang Baja A", stock: 5200, minStock: 2000, unit: "kg", cost: 14500, location: "A1-01" },
  { id: "INV-002", name: "Mesin Bantu (Aux Engine)", category: "Mesin", sku: "AUX-MAK", warehouse: "Gudang Mesin", stock: 3, minStock: 2, unit: "unit", cost: 850000000, location: "M-02" },
  { id: "INV-003", name: "Cat Epoxy Primer", category: "Cat", sku: "EPO-PRIM", warehouse: "Gudang B", stock: 44, minStock: 20, unit: "liter", cost: 95000, location: "B2-11" },
  { id: "INV-004", name: "Pipa Schedule 40 6 inch", category: "Pipa", sku: "PIP-S40-6", warehouse: "Gudang Pipa", stock: 18, minStock: 30, unit: "batang", cost: 780000, location: "P-04" },
  { id: "INV-005", name: "Anoda Zink", category: "Perlindungan", sku: "ZN-ANODE", warehouse: "Gudang B", stock: 8, minStock: 12, unit: "pcs", cost: 210000, location: "B3-07" },
  { id: "INV-006", name: "Kabel Listrik Marine 4x50", category: "Listrik", sku: "KBL-4X50", warehouse: "Gudang Listrik", stock: 1200, minStock: 800, unit: "meter", cost: 185000, location: "L-01" },
  { id: "INV-007", name: "Baut Marine M20", category: "Fastener", sku: "BLT-M20", warehouse: "Gudang B", stock: 1500, minStock: 2000, unit: "pcs", cost: 4500, location: "B1-05" },
  { id: "INV-008", name: "Winch Wire Rope", category: "Rigging", sku: "WIRE-ROPE", warehouse: "Gudang Rig", stock: 6, minStock: 4, unit: "roll", cost: 3200000, location: "R-02" },
];

export const equipment = [
  { id: "EQ-001", name: "Gantry Crane 50T", category: "Pengangkat", code: "CRN-50", branch: "Samarinda", status: "Tersedia", util: 68, nextService: "2026-09-15", lastHours: 12450, model: "DEMAG 50T" },
  { id: "EQ-002", name: "Mobile Crane 100T", category: "Pengangkat", code: "MCR-100", branch: "Samarinda", status: "Terpakai", util: 82, nextService: "2026-08-05", lastHours: 18320, model: "Liebherr MK100" },
  { id: "EQ-003", name: "Mesin Las MIG", category: "Pengelasan", code: "WLD-MIG-12", branch: "Samarinda", status: "Terpakai", util: 74, nextService: "2026-08-20", lastHours: 2500, model: "Fronius TPS 400i" },
  { id: "EQ-004", name: "Mesin Las SMAW", category: "Pengelasan", code: "WLD-SMAW-05", branch: "Samarinda", status: "Maintenance", util: 45, nextService: "2026-07-30", lastHours: 4100, model: "Miller XMT" },
  { id: "EQ-005", name: "Air Compressor", category: "Tenaga", code: "AIR-COMP-2", branch: "Samarinda", status: "Tersedia", util: 58, nextService: "2026-09-01", lastHours: 8900, model: "Atlas Copco" },
  { id: "EQ-006", name: "Forklift 10T", category: "Transportasi", code: "FLT-10", branch: "Samarinda", status: "Terpakai", util: 71, nextService: "2026-08-12", lastHours: 7200, model: "Toyota 10FD" },
  { id: "EQ-007", name: "Blast Machine", category: "Pengecatan", code: "BLST-01", branch: "Samarinda", status: "Tersedia", util: 63, nextService: "2026-09-10", lastHours: 3200, model: "Blastrac" },
  { id: "EQ-008", name: "Generator Set 500kVA", category: "Tenaga", code: "GEN-500", branch: "Samarinda", status: "Tersedia", util: 52, nextService: "2026-10-01", lastHours: 15600, model: "Caterpillar" },
];

export const subcontractors = [
  { id: "SUB-001", name: "PT Baja Utama Steel", services: "Fabrikasi & Blasting", rating: 90, active: 4, contract: 15000000000, status: "Aktif", k3: "A+" },
  { id: "SUB-002", name: "CV Pengecatan Marine", services: "Pengecatan / Coating", rating: 84, active: 2, contract: 6200000000, status: "Aktif", k3: "A" },
  { id: "SUB-003", name: "PT Mesinindo Perkasa", services: "Overhaul Mesin", rating: 88, active: 3, contract: 9800000000, status: "Aktif", k3: "A" },
  { id: "SUB-004", name: "PT Kelistrikan Bahari", services: "Elektrikal & Panel", rating: 76, active: 1, contract: 3400000000, status: "Kualifikasi", k3: "B+" },
  { id: "SUB-005", name: "CV Scaffold Aman", services: "Perancah & Staging", rating: 92, active: 2, contract: 1800000000, status: "Aktif", k3: "A+" },
];

export const employees = [
  { id: "EMP-001", name: "Andi Darman", role: "Direktur", dept: "Direksi", branch: "Samarinda", status: "Aktif", join: "2012-03-01", certs: [] },
  { id: "EMP-002", name: "Ir. Hendra Wijaya", role: "Project Manager", dept: "Proyek", branch: "Samarinda", status: "Aktif", join: "2015-07-12", certs: ["PMP", "Welding Inspector"] },
  { id: "EMP-003", name: "Budi Santoso", role: "Project Manager", dept: "Proyek", branch: "Samarinda", status: "Aktif", join: "2016-02-20", certs: ["PMP"] },
  { id: "EMP-004", name: "Rudi Hartono", role: "Superintendent", dept: "Produksi", branch: "Samarinda", status: "Aktif", join: "2014-09-01", certs: ["Marine Surveyor"] },
  { id: "EMP-005", name: "Agus Setiawan", role: "Foreman", dept: "Produksi", branch: "Samarinda", status: "Aktif", join: "2018-05-14", certs: [] },
  { id: "EMP-006", name: "Sari Wulandari", role: "QC Engineer", dept: "Quality", branch: "Samarinda", status: "Aktif", join: "2017-11-03", certs: ["NDT Level II", "CWI"] },
  { id: "EMP-007", name: "Dewi Lestari", role: "Finance Manager", dept: "Finance", branch: "Samarinda", status: "Aktif", join: "2013-08-25", certs: ["Brevet A/B"] },
  { id: "EMP-008", name: "Fajar Nugroho", role: "Procurement", dept: "Procurement", branch: "Samarinda", status: "Aktif", join: "2019-01-10", certs: [] },
];

export interface Invoice {
  id: string;
  client: string;
  project: string;
  amount: number;
  due: string;
  status: "Lunas" | "Belum Dibayar" | "Terlambat" | "Draft";
  paymentTerm: string;
}

export const invoices: Invoice[] = [
  { id: "INV-2607", client: "PT Samudra Jaya Perkasa", project: "NB-2025-012", amount: 9600000000, due: "2026-08-20", status: "Belum Dibayar", paymentTerm: "Milestone 3" },
  { id: "INV-2608", client: "PT Karya Bahari Sejahtera", project: "RP-2026-003", amount: 1680000000, due: "2026-08-05", status: "Belum Dibayar", paymentTerm: "Termin 2" },
  { id: "INV-2609", client: "PT Pelayaran Nusantara Abadi", project: "NB-2025-014", amount: 9300000000, due: "2026-07-28", status: "Terlambat", paymentTerm: "Milestone 2" },
  { id: "INV-2610", client: "PT Karya Bahari Sejahtera", project: "RF-2026-001", amount: 3920000000, due: "2026-09-15", status: "Draft", paymentTerm: "Progress" },
  { id: "INV-2598", client: "PT Mitra Samudra Raya", project: "RP-2026-002", amount: 3000000000, due: "2026-07-10", status: "Lunas", paymentTerm: "Final" },
];

export const ncrList = [
  { id: "NCR-2026-031", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", type: "Pengelasan", status: "Terbuka", severity: "Major", raised: "2026-07-18", issue: "Porosity pada seam weld section 4" },
  { id: "NCR-2026-032", project: "RP-2026-003", vessel: "TB Karya Bahari 12", type: "Pengecatan", status: "Dalam Perbaikan", severity: "Minor", raised: "2026-07-22", issue: "Ketebalan cat lambung di bawah spec" },
  { id: "NCR-2026-033", project: "RF-2026-001", vessel: "TB Karya Bahari 15", type: "Kelistrikan", status: "Tertutup", severity: "Major", raised: "2026-07-05", issue: "Kabel grounding kurang kencang" },
  { id: "NCR-2026-034", project: "RP-2026-005", vessel: "TB Samudra Jaya 04", type: "Mesin", status: "Terbuka", severity: "Critical", raised: "2026-07-25", issue: "Overhaul bearing tidak sesuai toleransi" },
];

export const incidents = [
  { id: "INC-2026-009", type: "Near Miss", date: "2026-07-20", location: "Area Fabrikasi", desc: "Mata rantai sling hampir putus saat lifting", severity: "Rendah" },
  { id: "INC-2026-010", type: "First Aid", date: "2026-07-24", location: "Dock 1", desc: "Pekerja terluka ringan pada tangan saat grinder", severity: "Sedang" },
];

// Purchase orders
export const purchaseOrders = [
  { id: "PO-2026-114", item: "Pelat Baja AH36", vendor: "PT Bahana Baja", req: "PR-2026-203", amount: 4120000000, status: "Dalam Pengiriman", date: "2026-07-15" },
  { id: "PO-2026-115", item: "Aux Engine MAK", vendor: "PT Indo Diesel", req: "PR-2026-201", amount: 1700000000, status: "Diterima", date: "2026-07-05" },
  { id: "PO-2026-116", item: "Cat Epoxy", vendor: "PT Jotun Indonesia", req: "PR-2026-207", amount: 480000000, status: "Menunggu Persetujuan", date: "2026-07-28" },
  { id: "PO-2026-117", item: "Wire Rope", vendor: "PT Steel Rig", req: "PR-2026-209", amount: 210000000, status: "Dikirim", date: "2026-07-30" },
];

export const quotations = [
  { id: "QT-2026-052", client: "PT Samudra Jaya Perkasa", vessel: "TB Baru RJ-03", type: "New Build", value: 48500000000, stage: "Negosiasi", date: "2026-07-20" },
  { id: "QT-2026-053", client: "PT Laut Timur Mandiri", vessel: "TB LT-06", type: "New Build", value: 45200000000, stage: "Penawaran", date: "2026-07-18" },
  { id: "QT-2026-054", client: "PT Mitra Samudra Raya", vessel: "Repair MR-02", type: "Repair", value: 3100000000, stage: "Menang", date: "2026-07-12" },
  { id: "QT-2026-055", client: "PT Pelayaran Nusantara", vessel: "TB PN-05 Retrofit", type: "Retrofit", value: 8200000000, stage: "Lead", date: "2026-07-25" },
];

export const monthlyRevenue = [
  { month: "Jan", value: 5.2 },
  { month: "Feb", value: 6.1 },
  { month: "Mar", value: 4.8 },
  { month: "Apr", value: 7.4 },
  { month: "Mei", value: 6.9 },
  { month: "Jun", value: 8.2 },
  { month: "Jul", value: 9.1 },
];

export function fmtRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export function fmtMiliar(n: number): string {
  return "Rp " + (n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
}

/* ====== EXTENDED 12-MONTH SERIES ====== */

export const revenueSeries = [
  { month: "Sep", revenue: 4.6, cost: 3.7, projects: 6 },
  { month: "Okt", revenue: 5.0, cost: 3.9, projects: 7 },
  { month: "Nov", revenue: 5.6, cost: 4.2, projects: 6 },
  { month: "Des", revenue: 6.3, cost: 4.8, projects: 8 },
  { month: "Jan", revenue: 5.2, cost: 4.0, projects: 7 },
  { month: "Feb", revenue: 6.1, cost: 4.5, projects: 8 },
  { month: "Mar", revenue: 4.8, cost: 3.6, projects: 6 },
  { month: "Apr", revenue: 7.4, cost: 5.4, projects: 9 },
  { month: "Mei", revenue: 6.9, cost: 5.1, projects: 8 },
  { month: "Jun", revenue: 8.2, cost: 6.0, projects: 10 },
  { month: "Jul", revenue: 9.1, cost: 6.6, projects: 10 },
  { month: "Ags", revenue: 9.8, cost: 7.0, projects: 11 },
];

export const marginSeries = [
  { month: "Sep", margin: 19.6 },
  { month: "Okt", margin: 22.0 },
  { month: "Nov", margin: 25.0 },
  { month: "Des", margin: 23.8 },
  { month: "Jan", margin: 23.1 },
  { month: "Feb", margin: 26.2 },
  { month: "Mar", margin: 25.0 },
  { month: "Apr", margin: 27.0 },
  { month: "Mei", margin: 26.1 },
  { month: "Jun", margin: 26.8 },
  { month: "Jul", margin: 27.5 },
  { month: "Ags", margin: 28.6 },
];

export const cashflowSeries = [
  { month: "Sep", masuk: 4.4, keluar: 4.8 },
  { month: "Okt", masuk: 5.2, keluar: 4.4 },
  { month: "Nov", masuk: 5.9, keluar: 5.0 },
  { month: "Des", masuk: 6.6, keluar: 5.9 },
  { month: "Jan", masuk: 5.4, keluar: 5.9 },
  { month: "Feb", masuk: 6.8, keluar: 6.1 },
  { month: "Mar", masuk: 5.0, keluar: 5.7 },
  { month: "Apr", masuk: 7.7, keluar: 6.8 },
  { month: "Mei", masuk: 7.1, keluar: 7.4 },
  { month: "Jun", masuk: 8.6, keluar: 7.8 },
  { month: "Jul", masuk: 9.4, keluar: 8.3 },
  { month: "Ags", masuk: 10.1, keluar: 8.6 },
];

export const utilSeries = [
  { month: "Sep", drydock: 72, equipment: 61 },
  { month: "Okt", drydock: 76, equipment: 63 },
  { month: "Nov", drydock: 70, equipment: 60 },
  { month: "Des", drydock: 78, equipment: 66 },
  { month: "Jan", drydock: 82, equipment: 68 },
  { month: "Feb", drydock: 80, equipment: 70 },
  { month: "Mar", drydock: 75, equipment: 64 },
  { month: "Apr", drydock: 84, equipment: 72 },
  { month: "Mei", drydock: 86, equipment: 71 },
  { month: "Jun", drydock: 88, equipment: 75 },
  { month: "Jul", drydock: 90, equipment: 78 },
  { month: "Ags", drydock: 92, equipment: 81 },
];

export const projectTypeDist = [
  { name: "New Build", value: 8, color: "#0b3a63" },
  { name: "Repair", value: 5, color: "#2e9ad4" },
  { name: "Retrofit", value: 4, color: "#22c55e" },
  { name: "Drydocking", value: 3, color: "#f59e0b" },
];

export const revenueByBranch = [
  { name: "Samarinda", value: 100, color: "#0b3a63" },
];

export const projectPipeline = [
  { name: "Q1", won: 4, pipeline: 9, target: 7 },
  { name: "Q2", won: 5, pipeline: 11, target: 8 },
  { name: "Q3", won: 6, pipeline: 12, target: 9 },
];

/* ====== KPI spark data ====== */

export const sparkRevenue = revenueSeries.map((d) => ({ name: d.month, v: d.revenue }));
export const sparkMargin = marginSeries.map((d) => ({ name: d.month, v: d.margin }));
export const sparkProjects = revenueSeries.map((d) => ({ name: d.month, v: d.projects }));
export const sparkUtil = utilSeries.map((d) => ({ name: d.month, v: d.equipment }));

/* ====== ACTIVITY FEED ====== */

export interface Activity {
  id: string;
  actor: string;
  action: string;
  target: string;
  module: string;
  time: string;
  tone: "navy" | "teal" | "rose" | "violet" | "amber";
}

export const activities: Activity[] = [
  { id: "A1", actor: "Sari Wulandari", action: "menutup NCR", target: "NCR-2026-033", module: "QC", time: "2 menit lalu", tone: "teal" },
  { id: "A2", actor: "Fajar Nugroho", action: "mengajukan PO", target: "PO-2026-117", module: "Procurement", time: "18 menit lalu", tone: "navy" },
  { id: "A3", actor: "Budi Santoso", action: "mengupdate progres", target: "NB-2025-014 → 41%", module: "Proyek", time: "42 menit lalu", tone: "violet" },
  { id: "A4", actor: "Agus Setiawan", action: "mencatat incident", target: "INC-2026-010", module: "Safety", time: "1 jam lalu", tone: "rose" },
  { id: "A5", actor: "Dewi Lestari", action: "menerbitkan invoice", target: "INV-2607", module: "Keuangan", time: "2 jam lalu", tone: "amber" },
  { id: "A6", actor: "Rudi Hartono", action: "mengalokasikan dock", target: "DD-1 untuk RP-2026-003", module: "Drydock", time: "3 jam lalu", tone: "teal" },
  { id: "A7", actor: "Hendra Wijaya", action: "membuat quotation", target: "QT-2026-052", module: "CRM", time: "5 jam lalu", tone: "navy" },
  { id: "A8", actor: "System", action: "otomatis mengingatkan servis", target: "EQ-002 Mobile Crane", module: "Equipment", time: "6 jam lalu", tone: "amber" },
];

/* ====== SMART INSIGHTS ====== */

export const insights = [
  {
    id: "I1",
    tone: "navy" as const,
    title: "Utilisasi Drydock 92%",
    desc: "Hampir penuh. 3 slot kompetitif untuk minggu depan — pertimbangkan prioritas proyek dan subkontraktor ekstra.",
  },
  {
    id: "I2",
    tone: "rose" as const,
    title: "4 Invoice Terlambat",
    desc: "Total Rp 12,4 M belum tertagih. Proyek RP-2026-005 melewati tenggat termin — perlu follow-up segera.",
  },
  {
    id: "I3",
    tone: "teal" as const,
    title: "Margin Naik ke 28,6%",
    desc: "Tren positif 6 bulan. Kontrol biaya fabrikasi dan efisiensi overtime berperan besar terhadap margin.",
  },
  {
    id: "I4",
    tone: "violet" as const,
    title: "Stok Pipa Menipis",
    desc: "Pipa Schedule 40 6\" di bawah minimum. Disarankan reorder sebelum proyek RP-2026-008 dimulai.",
  },
];

/* ====== ATTENDANCE / SDM EXTENSIONS ====== */

export const deptDistribution = [
  { name: "Produksi", value: 132, color: "#0b3a63" },
  { name: "Proyek", value: 48, color: "#2e9ad4" },
  { name: "QC & HSE", value: 24, color: "#22c55e" },
  { name: "Finance", value: 16, color: "#f59e0b" },
  { name: "Support", value: 30, color: "#8b5cf6" },
];

export const attendanceSeries = [
  { month: "Sep", tingkat: 96.2 },
  { month: "Okt", tingkat: 95.8 },
  { month: "Nov", tingkat: 96.6 },
  { month: "Des", tingkat: 94.9 },
  { month: "Jan", tingkat: 95.5 },
  { month: "Feb", tingkat: 96.8 },
  { month: "Mar", tingkat: 96.1 },
  { month: "Apr", tingkat: 97.0 },
  { month: "Mei", tingkat: 96.4 },
  { month: "Jun", tingkat: 97.2 },
  { month: "Jul", tingkat: 96.9 },
  { month: "Ags", tingkat: 97.4 },
];

export const employeeTrend = [
  { month: "Sep", count: 238 },
  { month: "Okt", count: 245 },
  { month: "Nov", count: 249 },
  { month: "Des", count: 244 },
  { month: "Jan", count: 248 },
  { month: "Feb", count: 252 },
  { month: "Mar", count: 250 },
  { month: "Apr", count: 256 },
  { month: "Mei", count: 260 },
  { month: "Jun", count: 264 },
  { month: "Jul", count: 268 },
  { month: "Ags", count: 272 },
];

/* ====== EQUIPMENT HEATMAP (jam per hari, sumbu hari x hari) ====== */

export const equipmentHeatmap = [
  { day: "Sen", senin: 4, selasa: 6, rabu: 7, kamis: 8, jumat: 7, sabtu: 5, minggu: 2 },
  { day: "Sel", senin: 6, selasa: 7, rabu: 8, kamis: 7, jumat: 6, sabtu: 4, minggu: 1 },
  { day: "Rab", senin: 7, selasa: 8, rabu: 6, kamis: 8, jumat: 5, sabtu: 3, minggu: 2 },
  { day: "Kam", senin: 5, selasa: 7, rabu: 8, kamis: 9, jumat: 7, sabtu: 4, minggu: 2 },
  { day: "Jum", senin: 6, selasa: 5, rabu: 7, kamis: 8, jumat: 8, sabtu: 5, minggu: 1 },
];

export const equipmentHours = [
  { month: "Sep", jam: 18200 },
  { month: "Okt", jam: 19400 },
  { month: "Nov", jam: 18100 },
  { month: "Des", jam: 20100 },
  { month: "Jan", jam: 17800 },
  { month: "Feb", jam: 21300 },
  { month: "Mar", jam: 19200 },
  { month: "Apr", jam: 22100 },
  { month: "Mei", jam: 20800 },
  { month: "Jun", jam: 23400 },
  { month: "Jul", jam: 24500 },
  { month: "Ags", jam: 25200 },
];

/* ====== INVENTORY MOVEMENT ====== */

export const inventoryMovement = [
  { id: "M-0901", item: "Pelat Baja AH36 12mm", type: "Pengeluaran", qty: 420, by: "NB-2025-012", date: "2026-08-01", tone: "out" },
  { id: "M-0902", item: "Cat Epoxy Primer", type: "Penerimaan", qty: 60, by: "PO-2026-116", date: "2026-08-01", tone: "in" },
  { id: "M-0903", item: "Baut Marine M20", type: "Pengeluaran", qty: 850, by: "RP-2026-003", date: "2026-07-31", tone: "out" },
  { id: "M-0904", item: "Kabel Listrik 4x50", type: "Pengeluaran", qty: 540, by: "RF-2026-001", date: "2026-07-30", tone: "out" },
  { id: "M-0905", item: "Wire Rope", type: "Penerimaan", qty: 3, by: "PO-2026-117", date: "2026-07-29", tone: "in" },
  { id: "M-0906", item: "Anoda Zink", type: "Pengeluaran", qty: 14, by: "RP-2026-005", date: "2026-07-29", tone: "out" },
  { id: "M-0907", item: "Mesin Bantu (Aux)", type: "Penerimaan", qty: 1, by: "PO-2026-115", date: "2026-07-28", tone: "in" },
];

export const stockTrend = [
  { month: "Sep", nilai: 148 },
  { month: "Okt", nilai: 152 },
  { month: "Nov", nilai: 146 },
  { month: "Des", nilai: 161 },
  { month: "Jan", nilai: 155 },
  { month: "Feb", nilai: 169 },
  { month: "Mar", nilai: 162 },
  { month: "Apr", nilai: 174 },
  { month: "Mei", nilai: 168 },
  { month: "Jun", nilai: 180 },
  { month: "Jul", nilai: 176 },
  { month: "Ags", nilai: 185 },
];

/* ====== DRYDOCK LOAD ====== */

export const drydockLoad = [
  { dock: "Drydock 1", kapasitas: 92 },
  { dock: "Drydock 2", kapasitas: 78 },
  { dock: "Slipway 1", kapasitas: 64 },
  { dock: "Berth 1", kapasitas: 88 },
];

/* ====== SUBCONTRACTOR EVALUATION ====== */

export const subcontractorScore = [
  { name: "PT Baja Utama Steel", cost: 88, quality: 92, delivery: 90, safety: 94 },
  { name: "PT Mesinindo Perkasa", cost: 84, quality: 90, delivery: 86, safety: 91 },
  { name: "CV Pengecatan Marine", cost: 82, quality: 85, delivery: 88, safety: 84 },
  { name: "CV Scaffold Aman", cost: 90, quality: 91, delivery: 93, safety: 96 },
];

/* ====== QC ITP / NCR STATS ====== */

export const ncrStats = [
  { name: "Pengelasan", value: 12, color: "#0b3a63" },
  { name: "Pengecatan", value: 8, color: "#2e9ad4" },
  { name: "Kelistrikan", value: 6, color: "#f59e0b" },
  { name: "Mesin", value: 5, color: "#8b5cf6" },
];

export const inspectionTrend = [
  { month: "Sep", inspeksi: 142, lulus: 138 },
  { month: "Okt", inspeksi: 150, lulus: 145 },
  { month: "Nov", inspeksi: 146, lulus: 142 },
  { month: "Des", inspeksi: 158, lulus: 152 },
  { month: "Jan", inspeksi: 151, lulus: 147 },
  { month: "Feb", inspeksi: 165, lulus: 160 },
  { month: "Mar", inspeksi: 154, lulus: 150 },
  { month: "Apr", inspeksi: 172, lulus: 166 },
  { month: "Mei", inspeksi: 168, lulus: 163 },
  { month: "Jun", inspeksi: 180, lulus: 175 },
  { month: "Jul", inspeksi: 185, lulus: 179 },
  { month: "Ags", inspeksi: 190, lulus: 184 },
];

/* ====== PROCUREMENT ====== */

export const spendByCategory = [
  { name: "Baja", value: 38, color: "#0b3a63" },
  { name: "Mesin", value: 26, color: "#2e9ad4" },
  { name: "Cat & Coating", value: 14, color: "#f59e0b" },
  { name: "Listrik", value: 12, color: "#8b5cf6" },
  { name: "Lainnya", value: 10, color: "#22c55e" },
];

export const procurementTrend = [
  { month: "Sep", pengadaan: 28, pengeluaran: 9.8 },
  { month: "Okt", pengadaan: 30, pengeluaran: 10.4 },
  { month: "Nov", pengadaan: 26, pengeluaran: 8.9 },
  { month: "Des", pengadaan: 33, pengeluaran: 11.5 },
  { month: "Jan", pengadaan: 29, pengeluaran: 10.1 },
  { month: "Feb", pengadaan: 34, pengeluaran: 12.0 },
  { month: "Mar", pengadaan: 28, pengeluaran: 9.6 },
  { month: "Apr", pengadaan: 36, pengeluaran: 12.8 },
  { month: "Mei", pengadaan: 33, pengeluaran: 11.7 },
  { month: "Jun", pengadaan: 38, pengeluaran: 13.4 },
  { month: "Jul", pengadaan: 37, pengeluaran: 13.1 },
  { month: "Ags", pengadaan: 40, pengeluaran: 14.2 },
];

/* ====== CRM FUNNEL ====== */

export const crmFunnel = [
  { stage: "Lead", count: 24, value: 98 },
  { stage: "Penawaran", count: 15, value: 61 },
  { stage: "Negosiasi", count: 8, value: 33 },
  { stage: "Menang", count: 12, value: 49 },
];

export const quotationStageDist = [
  { name: "Lead", value: 9, color: "#2e9ad4" },
  { name: "Penawaran", value: 12, color: "#f59e0b" },
  { name: "Negosiasi", value: 7, color: "#8b5cf6" },
  { name: "Menang", value: 6, color: "#22c55e" },
];

/* ====== PAYABLES / AGING ====== */

export const agingBuckets = [
  { name: "0-30 hari", value: 8.2, color: "#22c55e" },
  { name: "31-60 hari", value: 5.6, color: "#f59e0b" },
  { name: "61-90 hari", value: 3.4, color: "#f97316" },
  { name: ">90 hari", value: 2.1, color: "#ef4444" },
];

/* ====== P&L ====== */

export const plSummary = [
  { month: "Kuartal 1", revenue: 17.7, cost: 13.2, gross: 4.5, ebitda: 3.9 },
  { month: "Kuartal 2", revenue: 19.4, cost: 14.7, gross: 4.7, ebitda: 4.1 },
  { month: "Kuartal 3", revenue: 22.0, cost: 16.3, gross: 5.7, ebitda: 5.0 },
];

/* ====== VESSEL ADD-ONS ====== */

export const surveyTimeline = [
  { id: "S-01", vessel: "TB Karya Bahari 12", type: "Special Survey", status: "Terjadwal", date: "2026-08-25", classSurveyor: "BKI" },
  { id: "S-02", vessel: "TB Samudra Jaya 04", type: "Annual Survey", status: "Dalam Proses", date: "2026-08-10", classSurveyor: "BKI" },
  { id: "S-03", vessel: "TB Mitra Raya 09", type: "Docking Survey", status: "Selesai", date: "2026-07-30", classSurveyor: "BKI" },
];

export const certHealth = [
  { name: "Certificate of Class", value: 92, tone: "green" },
  { name: "SOPEP", value: 100, tone: "green" },
  { name: "Radio License", value: 88, tone: "amber" },
  { name: "BWTS Compliance", value: 96, tone: "green" },
];

export function fmtPersen(n: number): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
}
