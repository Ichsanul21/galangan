import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { newId as newPrefixedId } from "../services/ids";
import { ApiError, apiFetch, getJwt, isBackendConfigured } from "../services/http";
import { remoteRepository } from "../services/repositories";
import {
  projects as seedProjects,
  vessels as seedVessels,
  drydocks as seedDrydocks,
  dockSlots as seedDockSlots,
  inventory as seedInventory,
  equipment as seedEquipment,
  subcontractors as seedSubcontractors,
  employees as seedEmployees,
  ncrList as seedNcr,
  incidents as seedIncidents,
  purchaseOrders as seedPO,
  quotations as seedQuotations,
  clients as seedClients,
  inventoryMovement as seedMovements,
  surveyTimeline as seedSurveys,
  activities as seedActivities,
  services as seedServices,
  spareparts as seedSpareparts,
  seedBoq as seedBoq,
} from "./index";
import { COA_EXCEL, JU_PENYESUAIAN_EXCEL, ASET_EXCEL } from "./financeExcel";

/* ============ TIPE ============ */

export interface StoreItem {
  id: string;
  [key: string]: any;
}

export interface WbsItem {
  task: string;
  start: string;
  end: string;
  progress: number;
  weight: number;
  actualHours?: number;
  materialUsed?: string;
  completedBy?: string;
  completionDate?: string;
  status?: "Sedang" | "Selesai";
  station?: string;
  photoNote?: string;
  dft?: number;
}

export interface StoreShape {
  projects: StoreItem[];
  vessels: StoreItem[];
  drydocks: StoreItem[];
  dockSlots: StoreItem[];
  inventory: StoreItem[];
  movements: StoreItem[];
  equipment: StoreItem[];
  bookings: StoreItem[];
  subcontractors: StoreItem[];
  workOrders: StoreItem[];
  termins: StoreItem[];
  employees: StoreItem[];
  invoices: StoreItem[];
  payables: StoreItem[];
  ncr: StoreItem[];
  incidents: StoreItem[];
  inspections: StoreItem[];
  purchaseOrders: StoreItem[];
  requisitions: StoreItem[];
  vendors: StoreItem[];
  quotations: StoreItem[];
  clients: StoreItem[];
  documents: StoreItem[];
  surveys: StoreItem[];
  activities: StoreItem[];
  services: StoreItem[];
  spareparts: StoreItem[];
  boq: StoreItem[];
  branches: StoreItem[];
  attendance: StoreItem[];
  payroll: StoreItem[];
  taxPeriods: StoreItem[];
  rfqs: StoreItem[];
  changeOrders: StoreItem[];
  risks: StoreItem[];
  leaves: StoreItem[];
  trainings: StoreItem[];
  timesheets: StoreItem[];
  drawings: StoreItem[];
  toolbox: StoreItem[];
  warranties: StoreItem[];
  calibrations: StoreItem[];
  communications: StoreItem[];
  contracts: StoreItem[];
  bast: StoreItem[];
  trials: StoreItem[];
  requests: StoreItem[];
  clientPos: StoreItem[];
  settings: StoreItem[];
  coa: StoreItem[];
  journals: StoreItem[];
  assets: StoreItem[];
  wbsByProject: Record<string, WbsItem[]>;
  teamByProject: Record<string, string[]>;
}

/* ============ SEED TAMBAHAN (pindahan inline page + data baru) ============ */

const seedWorkOrders: StoreItem[] = [
  { id: "WO-2026-041", sub: "PT Baja Utama Steel", project: "NB-2025-012", scope: "Fabrikasi & blasting section 4-7", progress: 70, status: "Dalam Proses" },
  { id: "WO-2026-042", sub: "CV Pengecatan Marine", project: "RP-2026-003", scope: "Coating lambung & deck", progress: 55, status: "Dalam Proses" },
  { id: "WO-2026-043", sub: "PT Mesinindo Perkasa", project: "RP-2026-005", scope: "Overhaul main engine", progress: 40, status: "Dalam Proses" },
  { id: "WO-2026-044", sub: "CV Scaffold Aman", project: "NB-2025-012", scope: "Perancah hull assembly", progress: 100, status: "Selesai" },
  { id: "WO-2026-045", sub: "PT Kelistrikan Bahari", project: "RF-2026-001", scope: "Instalasi panel & cabling", progress: 25, status: "Dalam Proses" },
];

const seedTermins: StoreItem[] = [
  { id: "TRM-001", sub: "PT Baja Utama Steel", progress: "WO-041 (70%)", amount: 2100000000, pph23: "2%", retention: "5%", status: "Belum Dibayar" },
  { id: "TRM-002", sub: "PT Mesinindo Perkasa", progress: "WO-043 (40%)", amount: 1568000000, pph23: "2%", retention: "5%", status: "Disetujui" },
  { id: "TRM-003", sub: "CV Scaffold Aman", progress: "WO-044 (100%)", amount: 450000000, pph23: "2%", retention: "5%", status: "Lunas" },
  { id: "TRM-004", sub: "CV Pengecatan Marine", progress: "WO-042 (55%)", amount: 940000000, pph23: "2%", retention: "5%", status: "Belum Dibayar" },
];

const seedVendors: StoreItem[] = [
  { id: "V-001", name: "PT Bahana Baja", cat: "Baja & Struktur", onTime: 92, quality: 95, po: 12, status: "Aktif" },
  { id: "V-002", name: "PT Indo Diesel", cat: "Mesin & Engine", onTime: 96, quality: 90, po: 5, status: "Aktif" },
  { id: "V-003", name: "PT Jotun Indonesia", cat: "Cat & Coating", onTime: 88, quality: 93, po: 8, status: "Aktif" },
  { id: "V-004", name: "PT Steel Rig", cat: "Rigging & Wire", onTime: 84, quality: 87, po: 6, status: "Aktif" },
  { id: "V-005", name: "PT Primabaja", cat: "Baja & Struktur", onTime: 81, quality: 86, po: 3, status: "Kualifikasi" },
];

const seedRequisitions: StoreItem[] = [
  { id: "PR-2026-201", item: "Aux Engine MAK", by: "Budi Santoso", amount: 1700000000, status: "Sudah PO" },
  { id: "PR-2026-203", item: "Pelat Baja AH36", by: "Fajar N.", amount: 4120000000, status: "Sudah PO" },
  { id: "PR-2026-207", item: "Cat Epoxy", by: "Rudi H.", amount: 480000000, status: "Menunggu Approval" },
  { id: "PR-2026-209", item: "Wire Rope", by: "Sari W.", amount: 210000000, status: "RFQ" },
  { id: "PR-2026-211", item: "Anoda Zink", by: "Agus S.", amount: 94000000, status: "Menunggu Approval" },
];

const seedInspections: StoreItem[] = [
  { id: "INS-2026-118", project: "NB-2025-012", point: "Welding seam section 4", itp: "ITP-012", status: "Lulus", date: "2026-07-20" },
  { id: "INS-2026-119", project: "RP-2026-003", point: "Ketebalan cat lambung", itp: "ITP-003", status: "NCR", date: "2026-07-22" },
  { id: "INS-2026-120", project: "RF-2026-001", point: "Anoda & hull survey", itp: "ITP-001", status: "Dalam Proses", date: "2026-07-26" },
  { id: "INS-2026-121", project: "NB-2025-014", point: "Pemeriksaan prop shaft", itp: "ITP-014", status: "Terjadwal", date: "2026-08-02" },
  { id: "INS-2026-122", project: "RP-2026-005", point: "Toleransi bearing overhaul", itp: "ITP-005", status: "NCR", date: "2026-07-25" },
];

const seedBookings: StoreItem[] = [
  { equip: "Mobile Crane 100T", proyek: "NB-2025-012", jam: "08:00–17:00", status: "Terpakai", id: "BK-001", date: "2026-08-02" },
  { equip: "Mesin Las MIG-12", proyek: "RP-2026-003", jam: "07:00–16:00", status: "Terpakai", id: "BK-002", date: "2026-08-02" },
  { equip: "Forklift 10T", proyek: "RP-2026-005", jam: "09:00–15:00", status: "Terpakai", id: "BK-003", date: "2026-08-02" },
  { equip: "Gantry Crane 50T", proyek: "NB-2025-014", jam: "08:00–12:00", status: "Terjadwal", id: "BK-004", date: "2026-08-03" },
];

// Seed dari docs/RawData/DataPencatatanFinance.xlsx — sheet Hutang, Agustus 2026.
// amt = saldo akhir (outstanding), openAwal = saldo awal bulan, po OPEN-0826 = saldo awal (tanpa PO).
const seedPayables: StoreItem[] = [
  { id: "AP-EX-001", v: "CV BERLIAN JAYA GAS", po: "OPEN-0826", amt: 502116000.32999945, openAwal: 701808000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-002", v: "CV KALINDO MITRA BERSAMA", po: "OPEN-0826", amt: 119319450, openAwal: 162109950, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-003", v: "PT MURNI GAS RAYA", po: "OPEN-0826", amt: 1665000, openAwal: 14985000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-004", v: "PT SAPTA SUMBER LANCAR", po: "OPEN-0826", amt: 174796000, openAwal: 355575999, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-006", v: "PT MANDALIKA VARUNA PERKASA", po: "OPEN-0826", amt: 73267500, openAwal: 73267500, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-007", v: "DW SAMARINDA", po: "OPEN-0826", amt: 425000, openAwal: 850000, due: "2026-08-31", pph: "Non-PPn", st: "Belum Dibayar" },
  { id: "AP-EX-008", v: "CV SUMBER GAS ABADI", po: "OPEN-0826", amt: 19719150, openAwal: 53779500, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-009", v: "CV MASEBA TEKNIK", po: "OPEN-0826", amt: 21654399.48, openAwal: 0, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-010", v: "PT SEMERU TEKNIK", po: "OPEN-0826", amt: 140000000, openAwal: 190000000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-012", v: "PT PRASETYA UTAMA ENERGI", po: "OPEN-0826", amt: 218670000, openAwal: 189810000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-013", v: "PT SURYA BIRU MURNI", po: "OPEN-0826", amt: 24975000, openAwal: 23310000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-014", v: "PT CITRA MUSI LESTARI", po: "OPEN-0826", amt: 143500000.38, openAwal: 200900000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-016", v: "PT BUKIT PUTRI INDAH PERMAI", po: "OPEN-0826", amt: 7520705, openAwal: 23869035, due: "2026-08-31", pph: "Non-PPn", st: "Belum Dibayar" },
  { id: "AP-EX-017", v: "PT SANJAYA PUTRA KENCANA", po: "OPEN-0826", amt: 4225770, openAwal: 4225770, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-018", v: "CV SANGA SANGA INTERIOR", po: "OPEN-0826", amt: 20000000, openAwal: 35000000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-019", v: "THAMRIN ELEKTRICAL", po: "OPEN-0826", amt: 22925000, openAwal: 37925000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-020", v: "PT SAMUDRA MITRA SERVICE", po: "OPEN-0826", amt: 24034500, openAwal: 24034500, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-022", v: "CV MAKKADAE ABADI", po: "OPEN-0826", amt: 618048000, openAwal: 753246000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-024", v: "PT WAHYU MANDIRI AMARA CIPTA", po: "OPEN-0826", amt: 66137130, openAwal: 0, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-025", v: "BFI Finance - Sany Rough Crane", po: "OPEN-0826", amt: 85336000, openAwal: 85336000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-026", v: "BFI Finance - Loader", po: "OPEN-0826", amt: 716950000, openAwal: 745628000, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
  { id: "AP-EX-027", v: "BFI Finance - Truck", po: "OPEN-0826", amt: 129471000, openAwal: 151049500, due: "2026-08-31", pph: "2%", st: "Belum Dibayar" },
];

// Seed dari docs/RawData/DataPencatatanFinance.xlsx — sheet Piutang, Agustus 2026.
// Satu baris per customer bersaldo akhir > 0; amount = saldo akhir, openAwal = saldo awal bulan.
const seedInvoices: StoreItem[] = [
  { id: "INV/OPEN-2026-001", client: "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA", project: "", amount: 2512091953.9700003, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-002", client: "PT MUTIARA EXPRESS LINES", project: "", amount: 717806058, openAwal: 717806058, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-003", client: "PT TIRTA MAHAKAM RESOURCES TBK", project: "", amount: 1323312036.67, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-004", client: "PT MITRA KEMAKMURAN LINE", project: "", amount: 725000000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-005", client: "PT PELAYARAN PELANGI SINDUMULIA", project: "", amount: 50000000, openAwal: 100000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-006", client: "PT PELAYARAN GLOBAL LINTAS", project: "", amount: 882081202.6199999, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-007", client: "IBU LILI KANTIN", project: "", amount: 15000000, openAwal: 15000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-008", client: "NORIS", project: "", amount: 6000000, openAwal: 7000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-009", client: "SABRAN", project: "", amount: 2000000, openAwal: 3000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-010", client: "AHMAD JAYADI", project: "", amount: 8000000, openAwal: 9000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-011", client: "ADILLA", project: "", amount: 9000000, openAwal: 9000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-012", client: "BUDIANSYAH", project: "", amount: 10000000, openAwal: 11000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-013", client: "ASEP", project: "", amount: 500000, openAwal: 1000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-014", client: "DONY", project: "", amount: 500000, openAwal: 1000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-015", client: "TARMAN", project: "", amount: 2500000, openAwal: 1000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-016", client: "JESI", project: "", amount: 1000000, openAwal: 1500000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-017", client: "AGUS RIONO", project: "", amount: 1500000, openAwal: 2000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-018", client: "SUKARMAN", project: "", amount: 2000000, openAwal: 3000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-019", client: "PASHA", project: "", amount: 1500000, openAwal: 2000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-020", client: "SAFARUDIN", project: "", amount: 1500000, openAwal: 2000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-021", client: "ALUS", project: "", amount: 5000000, openAwal: 1000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-022", client: "HAIRUDIN", project: "", amount: 2000000, openAwal: 2500000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-023", client: "RAHMAD", project: "", amount: 2000000, openAwal: 2500000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-024", client: "SUPIAN AGUS", project: "", amount: 2000000, openAwal: 4000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-025", client: "AKBAR", project: "", amount: 1000000, openAwal: 1500000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-026", client: "IHSAN", project: "", amount: 2500000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-027", client: "AULIA", project: "", amount: 3500000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-028", client: "AGUSRIYANTO", project: "", amount: 3000000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-029", client: "SUNARJI", project: "", amount: 3000000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-030", client: "BUDI", project: "", amount: 2500000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-031", client: "GORDON", project: "", amount: 750000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-032", client: "ALI HUSNI", project: "", amount: 500000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-033", client: "SUGIHARTO", project: "", amount: 5000000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-034", client: "FENY", project: "", amount: 3500000, openAwal: 0, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: true },
  { id: "INV/OPEN-2026-035", client: "PT BUNGA TERATAI", project: "", amount: 7322331403, openAwal: 7322331403, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-036", client: "PT Teratai Sejahtera Line.", project: "", amount: 135000000, openAwal: 135000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-037", client: "PT Saha Agropalm Mandiri", project: "", amount: 812692000, openAwal: 841370000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
];

const seedDocuments: StoreItem[] = [
  { id: "DOC-001", title: "Kontrak NB-2025-012 — TB Samudra Jaya 07", type: "Kontrak", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v3.0", status: "Berlaku", updated: "2026-07-28", owner: "Andi Darman" },
  { id: "DOC-002", title: "General Arrangement Drawing", type: "Drawing", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "Rev C", status: "Disetujui", updated: "2026-07-20", owner: "Hendra Wijaya" },
  { id: "DOC-003", title: "ITP-012 Welding Procedure", type: "Prosedur", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.2", status: "Berlaku", updated: "2026-07-15", owner: "Sari Wulandari" },
  { id: "DOC-004", title: "Certificate of Class — TB Karya Bahari 12", type: "Sertifikat", project: "RP-2026-003", vessel: "TB Karya Bahari 12", version: "2023", status: "Kedaluwarsa", updated: "2023-08-15", owner: "Sari Wulandari" },
  { id: "DOC-005", title: "Docking Report RP-2026-003", type: "Laporan", project: "RP-2026-003", vessel: "TB Karya Bahari 12", version: "v1.0", status: "Draft", updated: "2026-08-01", owner: "Rudi Hartono" },
  { id: "DOC-006", title: "Kontrak NB-2025-014 — TB Nusantara 22", type: "Kontrak", project: "NB-2025-014", vessel: "TB Nusantara 22", version: "v2.0", status: "Berlaku", updated: "2026-06-30", owner: "Andi Darman" },
  { id: "DOC-007", title: "Sea Trial Procedure NB-2025-012", type: "Prosedur", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.0", status: "Menunggu Approval", updated: "2026-08-02", owner: "Budi Santoso" },
  { id: "DOC-008", title: "Invoice INV/OPEN-2026-035 (Saldo Awal Piutang)", type: "Invoice", project: "-", vessel: "-", version: "v1.0", status: "Berlaku", updated: "2026-08-31", owner: "Dewi Lestari" },
  { id: "DOC-009", title: "NCR-2026-031 Corrective Action", type: "NCR", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.1", status: "Dalam Proses", updated: "2026-07-25", owner: "Sari Wulandari" },
  { id: "DOC-010", title: "Stability Booklet — TB Nusantara 22", type: "Drawing", project: "NB-2025-014", vessel: "TB Nusantara 22", version: "Rev A", status: "Disetujui", updated: "2026-07-10", owner: "Hendra Wijaya" },
  { id: "DOC-011", title: "HSE Plan 2026", type: "Prosedur", project: "-", vessel: "-", version: "v4.0", status: "Berlaku", updated: "2026-01-05", owner: "Sari Wulandari" },
  { id: "DOC-012", title: "Quotation QT-2026-052", type: "Penawaran", project: "-", vessel: "TB Baru RJ-03", version: "v2.0", status: "Negosiasi", updated: "2026-07-20", owner: "Hendra Wijaya" },
];

/* ============ SEED REMAKE: cabang, absensi, payroll, pajak, RFQ, CO, risiko,
   cuti, training, timesheet, drawing, toolbox, kalibrasi, komunikasi, kontrak ============ */

const seedBranches: StoreItem[] = [
  { id: "BR-01", name: "Samarinda — Kantor Pusat", city: "Samarinda", isHQ: true },
  { id: "BR-02", name: "Balikpapan — Galangan", city: "Balikpapan", isHQ: false },
  { id: "BR-03", name: "Banjarmasin — Workshop", city: "Banjarmasin", isHQ: false },
];

const seedAttendance: StoreItem[] = [
  { id: "ABS-20260801-001", employeeId: "EMP-002", date: "2026-08-01", shift: "Pagi", status: "Hadir", checkIn: "07:55", checkOut: "17:05", overtime: 1 },
  { id: "ABS-20260801-002", employeeId: "EMP-004", date: "2026-08-01", shift: "Pagi", status: "Hadir", checkIn: "08:02", checkOut: "17:00", overtime: 0 },
  { id: "ABS-20260801-003", employeeId: "EMP-005", date: "2026-08-01", shift: "Siang", status: "Sakit", checkIn: "", checkOut: "", overtime: 0 },
  { id: "ABS-20260802-001", employeeId: "EMP-002", date: "2026-08-02", shift: "Pagi", status: "Hadir", checkIn: "07:50", checkOut: "19:30", overtime: 2.5 },
  { id: "ABS-20260802-002", employeeId: "EMP-006", date: "2026-08-02", shift: "Pagi", status: "Izin", checkIn: "", checkOut: "", overtime: 0 },
];

const seedPayroll: StoreItem[] = [
  { id: "PAY-202607-002", employeeId: "EMP-002", period: "2026-07", basic: 18000000, allowances: 4500000, overtimePay: 1200000, deductions: 500000, pph21: 1875000, bpjsKes: 540000, bpjsTk: 666000, net: 19569000, status: "Dibayar", paidAt: "2026-07-31" },
  { id: "PAY-202607-004", employeeId: "EMP-004", period: "2026-07", basic: 12000000, allowances: 3000000, overtimePay: 800000, deductions: 200000, pph21: 950000, bpjsKes: 360000, bpjsTk: 444000, net: 13846000, status: "Dibayar", paidAt: "2026-07-31" },
  { id: "PAY-202608-002", employeeId: "EMP-002", period: "2026-08", basic: 18000000, allowances: 4500000, overtimePay: 0, deductions: 0, pph21: 0, bpjsKes: 0, bpjsTk: 0, net: 0, status: "Draft", paidAt: "" },
];

const seedTaxPeriods: StoreItem[] = [
  { id: "TAX-202607", period: "2026-07", ppnKeluar: 1056000000, ppnMasuk: 452000000, pph23: 124000000, pph21: 38500000, status: "Lapor" },
  // Agustus 2026 dikunci dari JU penyesuaian Excel: PPN Keluaran 455,63jt, Masukan 73,75jt; PPh23 = NL 2-232.
  { id: "TAX-202608", period: "2026-08", ppnKeluar: 455632169.08, ppnMasuk: 73753513.46, pph23: 11737820, pph21: 0, status: "Lapor", reportedAt: "2026-08-31" },
];

const seedRfqs: StoreItem[] = [
  { id: "RFQ-2026-031", prId: "PR-2026-207", item: "Cat Epoxy", vendors: ["PT Jotun Indonesia", "PT Bahana Baja", "PT Steel Rig"], quotes: [{ vendor: "PT Jotun Indonesia", price: 480000000, eta: "2026-08-12" }, { vendor: "PT Bahana Baja", price: 495000000, eta: "2026-08-10" }], status: "Evaluasi", winner: "" },
  { id: "RFQ-2026-032", prId: "PR-2026-209", item: "Wire Rope", vendors: ["PT Steel Rig", "PT Primabaja"], quotes: [], status: "Terkirim", winner: "" },
];

const seedChangeOrders: StoreItem[] = [
  { id: "CO-2026-011", project: "NB-2025-012", title: "Tambah Fi-Fi system deck", impact: 1850000000, status: "Diajukan", requestedBy: "Budi Santoso", date: "2026-07-28" },
  { id: "CO-2026-010", project: "RP-2026-003", title: "Ganti scope propeller polishing", impact: -120000000, status: "Disetujui", requestedBy: "Rudi Hartono", date: "2026-07-15" },
];

const seedRisks: StoreItem[] = [
  { id: "RSK-001", project: "NB-2025-012", title: "Keterlambatan baja AH36", likelihood: "Sedang", impact: "Tinggi", mitigation: "Dual vendor + buffer 2 minggu", status: "Dipantau" },
  { id: "RSK-002", project: "RP-2026-005", title: "Overrun overhaul bearing", likelihood: "Tinggi", impact: "Sedang", mitigation: "Inspeksi toleransi per shift", status: "Aktif" },
];

const seedLeaves: StoreItem[] = [
  { id: "CUT-2026-018", employeeId: "EMP-006", type: "Tahunan", from: "2026-08-10", to: "2026-08-12", days: 3, status: "Disetujui", note: "Keperluan keluarga" },
  { id: "CUT-2026-019", employeeId: "EMP-005", type: "Sakit", from: "2026-08-01", to: "2026-08-01", days: 1, status: "Diajukan", note: "Surat dokter terlampir" },
];

const seedTrainings: StoreItem[] = [
  { id: "TRN-2026-006", title: "Welding Inspector Refresh", date: "2026-09-05", participants: ["EMP-002", "EMP-006"], provider: "B4T", status: "Terjadwal" },
  { id: "TRN-2026-005", title: "Basic Safety & Fire Fighting", date: "2026-07-12", participants: ["EMP-004", "EMP-005"], provider: "Internal HSE", status: "Selesai" },
];

const seedTimesheets: StoreItem[] = [
  { id: "TS-20260801-01", woId: "WO-2026-041", employeeId: "EMP-005", date: "2026-08-01", hours: 8, note: "Fabrikasi section 5" },
  { id: "TS-20260801-02", woId: "WO-2026-043", employeeId: "EMP-004", date: "2026-08-01", hours: 6, note: "Overhaul cylinder 3" },
];

const seedDrawings: StoreItem[] = [
  { id: "DRW-GA-012-C", project: "NB-2025-012", title: "General Arrangement", revision: "C", status: "Disetujui", updated: "2026-07-20", holder: "Hendra Wijaya" },
  { id: "DRW-ST-004-B", project: "NB-2025-012", title: "Structural Section 4-7", revision: "B", status: "Diajukan", updated: "2026-08-01", holder: "Budi Santoso" },
];

const seedToolbox: StoreItem[] = [
  { id: "TBM-20260801", project: "NB-2025-012", topic: "Lifting & rigging aman", date: "2026-08-01", attendees: 24, pic: "Agus Setiawan" },
  { id: "TBM-20260802", project: "RP-2026-003", topic: "Confined space entry", date: "2026-08-02", attendees: 18, pic: "Rudi Hartono" },
];

const seedCalibrations: StoreItem[] = [
  { id: "CAL-2026-021", equipmentId: "EQ-003", item: "Mesin Las MIG", due: "2026-08-20", status: "Terjadwal", cert: "" },
  { id: "CAL-2026-020", equipmentId: "EQ-002", item: "Load cell Mobile Crane", due: "2026-08-05", status: "Selesai", cert: "CAL-0501" },
];

const seedCommunications: StoreItem[] = [
  { id: "COM-2026-101", quotationId: "QT-2026-052", channel: "Email", date: "2026-07-22", summary: "Kirim revisi v2 + negosiasi termin", by: "Hendra Wijaya" },
  { id: "COM-2026-102", quotationId: "QT-2026-053", channel: "Meeting", date: "2026-07-25", summary: "Presentasi teknis, minta penawaran final", by: "Budi Santoso" },
];

const seedContracts: StoreItem[] = [
  { id: "KTR-2026-009", quotationId: "QT-2026-054", projectId: "RP-2026-002", client: "PT Mitra Samudra Raya", value: 3100000000, signedAt: "2026-07-12", status: "Aktif" },
];

const seedBast: StoreItem[] = [
  { id: "BAST-SMD-2026-001", projectId: "NB-2025-012", milestone: "Hull Assembly — BG RMN 3324", tanggal: "2026-08-02", penandatangan: "Hendra Wijaya / Owner BG RMN 3324", lampiran: "Checklist hull + foto section 4-7", amount: 540000000, status: "Disetujui" },
  { id: "BAST-SMD-2026-002", projectId: "RP-2026-003", milestone: "Docking Completion — V2 AWB SEA HAVEN 2", tanggal: "2026-08-04", penandatangan: "Rudi Hartono / Master V2 AWB SEA HAVEN 2", lampiran: "Docking report + thickness report", amount: 102000000, status: "Diajukan" },
];

const seedTrials: StoreItem[] = [];
const seedRequests: StoreItem[] = [
  { id: "REQ-2026-001", vessel: "TB Karya Bahari 12", client: "PT Karya Bahari Sejahtera", kind: "Repair Request", scope: "Overhaul main engine + coating lambung", value: 4200000000, status: "Baru", date: "2026-08-01" },
];
const seedClientPos: StoreItem[] = [];

/* Seed dari docs/RawData/DataPencatatanFinance.xlsx — sheet Akun (98 akun). */
const seedCoa: StoreItem[] = COA_EXCEL.map((c) => ({
  id: `COA-${c.kode}`,
  kode: c.kode,
  nama: c.nama,
  dk: c.dk,
  nrlr: c.nrlr,
}));

/* Seed dari sheet JU — jurnal penyesuaian Agustus 2026 (sudah posted, berimbang). */
const seedJournals: StoreItem[] = JU_PENYESUAIAN_EXCEL.map((j, i) => ({
  id: `JU-EX-${String(i + 1).padStart(2, "0")}`,
  date: j.tgl,
  kodePembantu: "",
  dokumen: "JUM-0831",
  uraian: j.uraian,
  db: j.db,
  kr: j.kr,
  amount: j.dbAmt || j.krAmt,
  sumber: "JU",
  status: "Posted",
}));

/* Seed dari sheet Aset — ringkasan fiskal 2025 per golongan, metode garis lurus (GL). */
const seedAssets: StoreItem[] = ASET_EXCEL.map((a, i) => ({
  id: `AST-EX-0${i + 1}`,
  nama: a.gol,
  kelompok: a.gol === "Bangunan" ? "BP" : a.gol.includes("Inventaris") ? "1" : "2",
  bulan: "-",
  tahun: "2025",
  nilai: a.perolehan,
  sisaAwal: a.sisaAwal,
  susutTahun: a.susut,
  metode: "GL",
}));

/* Konstanta bisnis terpusat — semua rumus baca dari sini via utils/settings.
   Ubah lewat halaman Pengaturan; kalibrasi saat dokumen client datang. */
const seedSettings: StoreItem[] = [
  { id: "SET-PPN", key: "PPN_RATE", value: 12, label: "PPN Keluaran/Masukan hutang-belanja (%)", group: "Pajak" },
  { id: "SET-PPNINV", key: "PPN_INVOICE_RATE", value: 12, label: "PPN invoice jasa+material, DPP=TOTAL×11/12 (%)", group: "Pajak" },
  { id: "SET-PPHJASA", key: "PPH_JASA_RATE", value: 2, label: "PPh invoice (% dari jasa)", group: "Pajak" },
  { id: "SET-PPHSUB", key: "PPH_SUBKON_DEFAULT", value: 0.5, label: "PPh subkontraktor default (0.5/2)", group: "Pajak" },
  { id: "SET-PPH23", key: "PPH23_RATE", value: 2, label: "PPh 23 jasa (%)", group: "Pajak" },
  { id: "SET-PPH21-1", key: "PPH21_T1_RATE", value: 5, label: "PPh21 lapis 1 (%)", group: "Payroll" },
  { id: "SET-PPH21-1B", key: "PPH21_T1_MAX", value: 60000000, label: "PPh21 batas lapis 1 (Rp/thn)", group: "Payroll" },
  { id: "SET-PPH21-2", key: "PPH21_T2_RATE", value: 15, label: "PPh21 lapis 2 (%)", group: "Payroll" },
  { id: "SET-PPH21-2B", key: "PPH21_T2_MAX", value: 250000000, label: "PPh21 batas lapis 2 (Rp/thn)", group: "Payroll" },
  { id: "SET-PPH21-3", key: "PPH21_T3_RATE", value: 25, label: "PPh21 lapis 3 (%)", group: "Payroll" },
  { id: "SET-PPH21-3B", key: "PPH21_T3_MAX", value: 500000000, label: "PPh21 batas lapis 3 (Rp/thn)", group: "Payroll" },
  { id: "SET-PPH21-4", key: "PPH21_T4_RATE", value: 30, label: "PPh21 lapis 4 (%)", group: "Payroll" },
  { id: "SET-PTKP0", key: "PTKP_TK0", value: 54000000, label: "PTKP TK/0 (Rp/thn)", group: "Payroll" },
  { id: "SET-PTKP1", key: "PTKP_K0", value: 58500000, label: "PTKP K/0 (Rp/thn)", group: "Payroll" },
  { id: "SET-PTKPT", key: "PTKP_TANGGUNGAN", value: 4500000, label: "PTKP per tanggungan (Rp/thn, maks 3)", group: "Payroll" },
  { id: "SET-BPJSK", key: "BPJS_KES_KAR", value: 1, label: "BPJS Kes karyawan (%)", group: "Payroll" },
  { id: "SET-BPJSP", key: "BPJS_KES_PER", value: 4, label: "BPJS Kes perusahaan (%)", group: "Payroll" },
  { id: "SET-BPJSTK", key: "BPJS_TK_KAR", value: 2, label: "BPJS TK karyawan JHT (%)", group: "Payroll" },
  { id: "SET-OT", key: "OVERTIME_DIV", value: 173, label: "Pembagi tarif lembur", group: "Payroll" },
  { id: "SET-POKECIL", key: "PO_KECIL_LIMIT", value: 50000000, label: "Batas PO Kecil (Rp)", group: "Procurement" },
  { id: "SET-APPINV", key: "APPROVE_INVOICE", value: 5000000, label: "Ambang Director invoice (Rp)", group: "Approval" },
  { id: "SET-APPTERM", key: "APPROVE_TERMIN", value: 2000000, label: "Ambang Director termin (Rp)", group: "Approval" },
  { id: "SET-APPPO", key: "APPROVE_PO", value: 1000000, label: "Ambang Director PO (Rp)", group: "Approval" },
  { id: "SET-ALBUD", key: "ALERT_BUDGET_PCT", value: 80, label: "Alert serapan budget (%)", group: "Alert" },
  { id: "SET-ALOVR", key: "ALERT_OVERRUN_PCT", value: 10, label: "Alert overrun di atas (%)", group: "Alert" },
  { id: "SET-ALCERT", key: "ALERT_CERT_DAYS", value: 90, label: "Alert sertifikat H- (hari)", group: "Alert" },
  { id: "SET-ALCERT60", key: "ALERT_CERT_60", value: 60, label: "Alert sertifikat warning H- (hari)", group: "Alert" },
  { id: "SET-ALCERT30", key: "ALERT_CERT_30", value: 30, label: "Alert sertifikat critical H- (hari)", group: "Alert" },
  { id: "SET-ALMS", key: "ALERT_MILESTONE_DAYS", value: 7, label: "Alert milestone H- (hari)", group: "Alert" },
  { id: "SET-ALCP", key: "ALERT_CP_DAYS", value: 3, label: "Alert critical-path delay > (hari)", group: "Alert" },
  { id: "SET-CUTI", key: "CUTI_JATAH", value: 12, label: "Jatah cuti tahunan (hari)", group: "HR" },
  { id: "SET-WHATIF-G", key: "WHATIF_GROWTH", value: 0, label: "What-if pertumbuhan pasar (%)", group: "Analytics" },
  { id: "SET-WHATIF-C", key: "WHATIF_COST", value: 0, label: "What-if biaya, menekan margin (%)", group: "Analytics" },
  { id: "SET-WHATIF-P", key: "WHATIF_PROG", value: 0, label: "What-if progres, menggeser forecast (%)", group: "Analytics" },
  { id: "SET-3D-PROJ", key: "SHOW_3D_PROJECT", value: 0, label: "Tampilkan 3D Viewer di modul Proyek (0/1)", group: "Modul" },
  { id: "SET-3D-VES", key: "SHOW_3D_VESSEL", value: 0, label: "Tampilkan 3D Viewer di modul Kapal (0/1)", group: "Modul" },
];

export const wbsTemplate: WbsItem[] = [
  // Migrasi E3/E4: template New Build dipecah (Outfitting per sistem + Painting per tahap)
  // + Commissioning. Total bobot tetap 100. WBS proyek lama (seed/wbsByProject)
  // TIDAK dimigrasi — hanya template untuk proyek baru.
  { task: "Desain & Persetujuan Class", start: "2026-01", end: "2026-03", progress: 100, weight: 8 },
  { task: "Pengadaan Material", start: "2026-02", end: "2026-05", progress: 85, weight: 10 },
  { task: "Fabrikasi Baja", start: "2026-03", end: "2026-07", progress: 70, weight: 12 },
  { task: "Hull Assembly", start: "2026-05", end: "2026-08", progress: 45, weight: 12 },
  { task: "Outfitting — Machinery", start: "2026-07", end: "2026-09", progress: 20, weight: 8 },
  { task: "Outfitting — Piping", start: "2026-07", end: "2026-09", progress: 20, weight: 7 },
  { task: "Outfitting — Electrical", start: "2026-07", end: "2026-09", progress: 20, weight: 7 },
  { task: "Outfitting — Nav & Comm", start: "2026-07", end: "2026-09", progress: 20, weight: 5 },
  { task: "Outfitting — Accommodation", start: "2026-07", end: "2026-09", progress: 20, weight: 5 },
  { task: "Painting — Surface Prep", start: "2026-08", end: "2026-09", progress: 5, weight: 5 },
  { task: "Painting — Priming", start: "2026-08", end: "2026-09", progress: 5, weight: 4 },
  { task: "Painting — Topcoat", start: "2026-08", end: "2026-09", progress: 5, weight: 4 },
  { task: "Painting — Final Inspection", start: "2026-08", end: "2026-09", progress: 5, weight: 3 },
  { task: "Commissioning", start: "2026-09", end: "2026-09", progress: 0, weight: 6 },
  { task: "Sea Trial & Delivery", start: "2026-09", end: "2026-09", progress: 0, weight: 4 },
];

const seedTeamByProject: Record<string, string[]> = {
  "NB-2025-012": ["EMP-002", "EMP-004", "EMP-006"],
  "NB-2025-014": ["EMP-003", "EMP-005"],
  "RP-2026-003": ["EMP-004", "EMP-006"],
  "RP-2026-005": ["EMP-005"],
  "RF-2026-001": ["EMP-002", "EMP-006"],
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function buildSeeds(): StoreShape {
  return {
    projects: clone(seedProjects) as StoreItem[],
    vessels: clone(seedVessels) as StoreItem[],
    drydocks: clone(seedDrydocks) as StoreItem[],
    dockSlots: clone(seedDockSlots) as StoreItem[],
    inventory: clone(seedInventory) as StoreItem[],
    movements: clone(seedMovements) as StoreItem[],
    equipment: clone(seedEquipment) as StoreItem[],
    bookings: clone(seedBookings),
    subcontractors: clone(seedSubcontractors) as StoreItem[],
    workOrders: clone(seedWorkOrders),
    termins: clone(seedTermins),
    employees: clone(seedEmployees) as StoreItem[],
    invoices: clone(seedInvoices) as StoreItem[],
    payables: clone(seedPayables),
    ncr: clone(seedNcr) as StoreItem[],
    incidents: clone(seedIncidents) as StoreItem[],
    inspections: clone(seedInspections),
    purchaseOrders: clone(seedPO) as StoreItem[],
    requisitions: clone(seedRequisitions),
    vendors: clone(seedVendors),
    quotations: clone(seedQuotations) as StoreItem[],
    clients: clone(seedClients) as StoreItem[],
    documents: clone(seedDocuments),
     surveys: clone(seedSurveys) as StoreItem[],
     activities: clone(seedActivities) as StoreItem[],
     services: clone(seedServices) as StoreItem[],
     spareparts: clone(seedSpareparts) as StoreItem[],
     boq: clone(seedBoq) as StoreItem[],
     branches: clone(seedBranches),
     attendance: clone(seedAttendance),
     payroll: clone(seedPayroll),
     taxPeriods: clone(seedTaxPeriods),
     rfqs: clone(seedRfqs),
     changeOrders: clone(seedChangeOrders),
     risks: clone(seedRisks),
     leaves: clone(seedLeaves),
     trainings: clone(seedTrainings),
     timesheets: clone(seedTimesheets),
     drawings: clone(seedDrawings),
     toolbox: clone(seedToolbox),
     warranties: [],
     calibrations: clone(seedCalibrations),
       communications: clone(seedCommunications),
        contracts: clone(seedContracts),
        bast: clone(seedBast),
        trials: clone(seedTrials),
        requests: clone(seedRequests),
        clientPos: clone(seedClientPos),
        settings: clone(seedSettings),
      coa: clone(seedCoa),
      journals: clone(seedJournals),
      assets: clone(seedAssets),
     wbsByProject: {},
     teamByProject: clone(seedTeamByProject),
  };
}

/* ============ CONTEXT ============ */

const STORE_KEY = "isms.store.v4";
const LEGACY_KEYS = ["isms.store.v3", "isms.store.v2", "isms.store.v1"];
const BRANCH_KEY = "isms.branch";
const PREFIX: Record<string, string> = {
  projects: "PRJ",
  vessels: "V",
  inventory: "INV",
  movements: "M",
  equipment: "EQ",
  bookings: "BK",
  subcontractors: "SUB",
  workOrders: "WO",
  termins: "TRM",
  employees: "EMP",
  invoices: "INV",
  payables: "AP",
  ncr: "NCR",
  incidents: "INC",
  inspections: "INS",
  purchaseOrders: "PO",
  requisitions: "PR",
  vendors: "VND",
  quotations: "QT",
  clients: "C",
  documents: "DOC",
   surveys: "S",
   activities: "A",
   services: "SRV",
   spareparts: "SP",
   boq: "BQ",
   branches: "BR",
   attendance: "ABS",
   payroll: "PAY",
   taxPeriods: "TAX",
   rfqs: "RFQ",
   changeOrders: "CO",
   risks: "RSK",
   leaves: "CUT",
   trainings: "TRN",
   timesheets: "TS",
   drawings: "DRW",
   toolbox: "TBM",
   warranties: "WRT",
   calibrations: "CAL",
    communications: "COM",
      contracts: "KTR",
      bast: "BAST",
      trials: "STL",
      requests: "REQ",
      clientPos: "CPO",
    settings: "SET",
    coa: "COA",
    journals: "JU",
    assets: "AST",
 };

const ARRAY_KEYS: (keyof StoreShape)[] = [
  "projects", "vessels", "drydocks", "dockSlots", "inventory", "movements",
  "equipment", "bookings", "subcontractors", "workOrders", "termins",
  "employees", "invoices", "payables", "ncr", "incidents", "inspections",
  "purchaseOrders", "requisitions", "vendors", "quotations", "clients",
  "documents", "surveys", "activities", "services", "spareparts", "boq",
  "branches", "attendance", "payroll", "taxPeriods", "rfqs", "changeOrders",
  "risks", "leaves", "trainings", "timesheets", "drawings", "toolbox",
  "warranties",
  "calibrations", "communications", "contracts", "bast", "trials", "requests", "clientPos", "settings", "coa", "journals", "assets",
];

function sanitizeStore(parsed: Partial<StoreShape>): StoreShape {
  const seeds = buildSeeds();
  const merged = { ...seeds, ...parsed } as StoreShape;
  for (const k of ARRAY_KEYS) {
    const rec = merged as unknown as Record<string, unknown>;
    if (!Array.isArray(rec[k as string])) {
      rec[k as string] = seeds[k];
    }
  }
  if (!merged.wbsByProject || typeof merged.wbsByProject !== "object") merged.wbsByProject = {};
  if (!merged.teamByProject || typeof merged.teamByProject !== "object") merged.teamByProject = seeds.teamByProject;
  return merged;
}

function loadStore(): StoreShape {
  // Persistensi localStorage (migrasi dari sessionStorage: kunci sama, baca sesi lama sekali).
  const read = (storage: Storage, key: string): Partial<StoreShape> | null => {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoreShape>;
        if (parsed && Array.isArray(parsed.projects)) return parsed;
      }
    } catch {
      /* abaikan, coba key berikutnya */
    }
    return null;
  };
  const candidates = [STORE_KEY, ...LEGACY_KEYS];
  for (const key of candidates) {
    const parsed = read(localStorage, key);
    if (parsed) return sanitizeStore(parsed);
  }
  for (const key of candidates) {
    const parsed = read(sessionStorage, key);
    if (parsed) return sanitizeStore(parsed);
  }
  return buildSeeds();
}

export type CollectionKey = Exclude<keyof StoreShape, "wbsByProject" | "teamByProject">;

export type BackendMode = "local" | "remote";

interface StoreCtx {
  data: StoreShape;
  backendMode: BackendMode;
  backendError: string | null;
  pendingSync: string[];
  pushPending: () => Promise<void>;
  add: (col: CollectionKey, item: Omit<StoreItem, "id"> & { id?: string }, activity?: { action: string; target?: string; module: string }) => Promise<StoreItem>;
  update: (col: CollectionKey, id: string, patch: Record<string, any>) => Promise<void>;
  remove: (col: CollectionKey, id: string) => Promise<void>;
  log: (action: string, target: string, module: string) => void;
  reset: () => void;
  resync: () => Promise<void>;
  wbsFor: (projectId: string) => WbsItem[];
  setWbs: (projectId: string, wbs: WbsItem[]) => Promise<void>;
  teamFor: (projectId: string) => string[];
  setTeam: (projectId: string, ids: string[]) => Promise<void>;
  branch: string;
  setBranch: (b: string) => void;
  inBranch: (rows: StoreItem[]) => StoreItem[];
}

const Ctx = createContext<StoreCtx | null>(null);

function newId(col: CollectionKey): string {
  const p = PREFIX[col] ?? "X";
  return newPrefixedId(p);
}

const ACTOR_TONE: Record<string, "navy" | "teal" | "rose" | "violet" | "amber"> = {
  Proyek: "violet",
  Keuangan: "amber",
  QC: "teal",
  Safety: "rose",
  Procurement: "navy",
  CRM: "navy",
  Drydock: "teal",
  Equipment: "amber",
  Inventori: "navy",
  SDM: "violet",
  Kapal: "teal",
  Dokumen: "navy",
   Subkontraktor: "amber",
   Service: "teal",
   Sparepart: "amber",
   BoQ: "navy",
   Absensi: "violet",
   Payroll: "amber",
   Pajak: "navy",
   Laporan: "teal",
   Monitoring: "violet",
 };

/* Toast tanpa mengimpor ui (hindari sirkular): <Toaster/> di ui.tsx mendengarkan event ini. */
function notifyBackendFallback(): void {
  try {
    window.dispatchEvent(
      new CustomEvent("isms:toast", { detail: { message: "Backend tak terjangkau — mode lokal", tone: "info" } }),
    );
  } catch {
    /* abaikan */
  }
}

/* Toast alasan penolakan backend (mis. 403 "Butuh peran Direktur") — tiap kejadian. */
function notifyForbidden(reason: string): void {
  try {
    window.dispatchEvent(new CustomEvent("isms:toast", { detail: { message: reason, tone: "info" } }));
  } catch {
    /* abaikan */
  }
}

/* Remote dipakai bila backend dikonfigurasi DAN ada JWT — seluruh CRUD BE wajib
   auth. Tanpa JWT (belum login) operasi berjalan lokal senyap, tanpa semburan 401. */
function remoteActive(): boolean {
  return isBackendConfigured() && getJwt() !== null;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreShape>(() => loadStore());
  const [backendMode] = useState<BackendMode>(() => (isBackendConfigured() ? "remote" : "local"));
  const [backendError, setBackendError] = useState<string | null>(null);
  const fallbackToasted = useRef(false);
  /* Anti-clobber: koleksi yang diubah lokal saat fallback tidak boleh ditimpa resync. */
  const dirtyRef = useRef<Set<string>>(new Set());
  const [pendingSync, setPendingSync] = useState<string[]>([]);
  const dataRef = useRef(data);
  dataRef.current = data;

  const markDirty = useCallback((col: string) => {
    if (!isBackendConfigured()) return;
    if (!dirtyRef.current.has(col)) {
      dirtyRef.current.add(col);
      setPendingSync([...dirtyRef.current]);
    }
  }, []);

  const clearDirty = useCallback((col: string) => {
    if (dirtyRef.current.delete(col)) {
      setPendingSync([...dirtyRef.current]);
    }
  }, []);
  const [branch, setBranchState] = useState<string>(() => {
    // Cabang global di localStorage (migrasi dari sessionStorage, kunci sama).
    try {
      return localStorage.getItem(BRANCH_KEY) ?? sessionStorage.getItem(BRANCH_KEY) ?? "SEMUA";
    } catch {
      return "SEMUA";
    }
  });

  const setBranch = (b: string) => {
    setBranchState(b);
    try {
      localStorage.setItem(BRANCH_KEY, b);
    } catch {
      /* abaikan */
    }
  };

  const inBranch = (rows: StoreItem[]): StoreItem[] =>
    branch === "SEMUA" ? rows : rows.filter((r) => !r.branch || r.branch === branch);

  useEffect(() => {
    try {
      // Persistensi localStorage (migrasi dari sessionStorage, kunci sama).
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      for (const k of LEGACY_KEYS) {
        if (k !== STORE_KEY) {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        }
      }
    } catch {
      /* storage penuh — abaikan */
    }
  }, [data]);

  /* Tarik ulang semua koleksi + WBS/team dari backend (dipakai saat boot dan
     tepat setelah login berhasil, karena JWT baru tersedia saat itu).
     Koleksi kotor (dirty) dilewati agar perubahan lokal tidak tertimpa. */
  const resync = useCallback(async (): Promise<void> => {
    if (!remoteActive()) return;
    const dirty = dirtyRef.current;
    const pulled: Partial<Record<CollectionKey, StoreItem[]>> = {};
    await Promise.all(
      ARRAY_KEYS.map(async (key) => {
        if (key === "wbsByProject" || key === "teamByProject") return;
        if (dirty.has(key as string)) return;
        try {
          pulled[key] = await remoteRepository(key).list();
        } catch {
          /* koleksi ini tetap memakai seed lokal */
        }
      }),
    );
    setData((prev) => ({ ...prev, ...pulled }));
    const projectIds = ((pulled.projects as StoreItem[] | undefined) ?? []).map((p) => p.id);
    const wbsDirty = dirty.has("wbsByProject");
    const teamDirty = dirty.has("teamByProject");
    await Promise.all(
      projectIds.map(async (projectId) => {
        if (dirty.has(`wbs:${projectId}`) || wbsDirty) return;
        try {
          const wbs = await apiFetch<{ projectId: string; wbs: WbsItem[] }>(
            `/api/projects/${encodeURIComponent(projectId)}/wbs`,
          );
          if (Array.isArray(wbs.wbs)) {
            const rows = wbs.wbs;
            setData((prev) => ({ ...prev, wbsByProject: { ...prev.wbsByProject, [projectId]: rows } }));
          }
        } catch {
          /* cache lokal/template tetap dipakai */
        }
        if (dirty.has(`team:${projectId}`) || teamDirty) return;
        try {
          const team = await apiFetch<{ projectId: string; memberIds: string[] }>(
            `/api/projects/${encodeURIComponent(projectId)}/team`,
          );
          if (Array.isArray(team.memberIds)) {
            const ids = team.memberIds;
            setData((prev) => ({ ...prev, teamByProject: { ...prev.teamByProject, [projectId]: ids } }));
          }
        } catch {
          /* cache lokal tetap dipakai */
        }
      }),
    );
  }, []);

  /* Dorong perubahan lokal yang tertunda ke backend: tiap baris coba POST,
     bila 409 (sudah ada) coba PATCH. Bersihkan dirty per koleksi bila sukses. */
  const pushPending = useCallback(async (): Promise<void> => {
    if (!remoteActive()) return;
    const cols = [...dirtyRef.current];
    for (const col of cols) {
      try {
        if (col === "wbsByProject" || col.startsWith("wbs:")) {
          const entries = Object.entries(dataRef.current.wbsByProject ?? {});
          const targets =
            col === "wbsByProject"
              ? entries
              : entries.filter(([pid]) => col === `wbs:${pid}`);
          for (const [projectId, wbs] of targets) {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/wbs`, {
              method: "PUT",
              body: JSON.stringify({ wbs }),
            });
          }
          clearDirty(col);
          setBackendError(null);
          continue;
        }
        if (col === "teamByProject" || col.startsWith("team:")) {
          const entries = Object.entries(dataRef.current.teamByProject ?? {});
          const targets =
            col === "teamByProject"
              ? entries
              : entries.filter(([pid]) => col === `team:${pid}`);
          for (const [projectId, memberIds] of targets) {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/team`, {
              method: "PUT",
              body: JSON.stringify({ memberIds }),
            });
          }
          clearDirty(col);
          setBackendError(null);
          continue;
        }
        const rows = ((dataRef.current as unknown as Record<string, StoreItem[]>)[col] ?? []) as StoreItem[];
        let ok = true;
        for (const row of rows) {
          try {
            await remoteRepository(col).create(row);
          } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
              try {
                await remoteRepository(col).patch(row.id, row);
              } catch {
                ok = false;
                break;
              }
            } else {
              ok = false;
              break;
            }
          }
        }
        if (ok) {
          clearDirty(col);
          setBackendError(null);
        }
      } catch {
        /* koleksi ini tetap dirty — coba lagi nanti */
      }
    }
  }, [clearDirty]);

  /* Boot backend-first: bila backend dikonfigurasi dan sudah login (JWT),
     tarik semua koleksi dari BE; tiap koleksi yang gagal → biarkan seed lokal. */
  useEffect(() => {
    void resync();
  }, [resync]);

  const api = useMemo<StoreCtx>(() => {
    const buildActivity = (action: string, target: string, module: string): StoreItem => ({
      id: `A-${Date.now().toString(36).toUpperCase()}`,
      actor: "Anda",
      action,
      target,
      module,
      time: "baru saja",
      tone: ACTOR_TONE[module] ?? "navy",
    });

    const pushActivity = (prev: StoreShape, action: string, target: string, module: string): StoreItem[] =>
      [buildActivity(action, target, module), ...prev.activities].slice(0, 30);

    /* Gagal remote → fallback lokal + tandai error + toast sekali per sesi.
       Khusus 403 (mis. butuh peran Direktur): JANGAN tulis lokal / tandai dirty,
       cukup toast alasan dari backend. Kembalikan true bila 403. */
    const degrade = (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 403) {
        const reason = err.message || "Akses ditolak — butuh peran yang sesuai";
        setBackendError(reason);
        notifyForbidden(reason);
        return true;
      }
      setBackendError(err instanceof Error && err.message ? err.message : "Backend tak terjangkau — mode lokal");
      if (!fallbackToasted.current) {
        fallbackToasted.current = true;
        notifyBackendFallback();
      }
      return false;
    };

    return {
      data,
      backendMode,
      backendError,
      pendingSync,
      pushPending,
      add: async (col, item, activity) => {
        const full: StoreItem = { ...item, id: item.id || newId(col) };
        if (remoteActive()) {
          try {
            const saved = await remoteRepository(col).create(full);
            const finalItem = saved && saved.id ? saved : full;
            setData((prev) => ({
              ...prev,
              [col]: [finalItem, ...((prev[col] as StoreItem[] | undefined) ?? [])],
              activities: activity
                ? pushActivity(prev, activity.action, activity.target ?? finalItem.id, activity.module)
                : prev.activities,
            }));
            setBackendError(null);
            return finalItem;
          } catch (err) {
            if (degrade(err)) throw err;
          }
        }
        markDirty(col as string);
        setData((prev) => ({
          ...prev,
          [col]: [full, ...((prev[col] as StoreItem[] | undefined) ?? [])],
          activities: activity
            ? pushActivity(prev, activity.action, activity.target ?? full.id, activity.module)
            : prev.activities,
        }));
        return full;
      },
      update: async (col, id, patch) => {
        if (remoteActive()) {
          try {
            const saved = await remoteRepository(col).patch(id, patch);
            setData((prev) => ({
              ...prev,
              [col]: ((prev[col] as StoreItem[] | undefined) ?? []).map((r) => (r.id === id ? saved : r)),
            }));
            setBackendError(null);
            return;
          } catch (err) {
            if (degrade(err)) return;
          }
        }
        markDirty(col as string);
        setData((prev) => ({
          ...prev,
          [col]: ((prev[col] as StoreItem[] | undefined) ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      },
      remove: async (col, id) => {
        if (remoteActive()) {
          try {
            await remoteRepository(col).remove(id);
            setData((prev) => ({
              ...prev,
              [col]: ((prev[col] as StoreItem[] | undefined) ?? []).filter((r) => r.id !== id),
            }));
            setBackendError(null);
            return;
          } catch (err) {
            if (degrade(err)) return;
          }
        }
        markDirty(col as string);
        setData((prev) => ({
          ...prev,
          [col]: ((prev[col] as StoreItem[] | undefined) ?? []).filter((r) => r.id !== id),
        }));
      },
      log: (action, target, module) => {
        const entry = buildActivity(action, target, module);
        setData((prev) => ({ ...prev, activities: [entry, ...prev.activities].slice(0, 30) }));
        if (remoteActive()) {
          // Best-effort mirror tanpa await — langsung via HTTP (bukan add())
          // agar tidak terjadi rekursi; kegagalan diabaikan senyap.
          remoteRepository("activities").create(entry).catch(() => undefined);
        }
      },
      reset: () => {
        setData(buildSeeds());
      },
      resync,
      wbsFor: (projectId) => data.wbsByProject[projectId] ?? clone(wbsTemplate),
      setWbs: async (projectId, wbs) => {
        const prevWbs = dataRef.current.wbsByProject[projectId];
        setData((prev) => ({ ...prev, wbsByProject: { ...prev.wbsByProject, [projectId]: wbs } }));
        if (remoteActive()) {
          try {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/wbs`, {
              method: "PUT",
              body: JSON.stringify({ wbs }),
            });
            setBackendError(null);
            return;
          } catch (err) {
            if (degrade(err)) {
              // 403: kembalikan optimistik, jangan tandai dirty.
              setData((prev) => {
                const next = { ...prev.wbsByProject };
                if (prevWbs === undefined) delete next[projectId];
                else next[projectId] = prevWbs;
                return { ...prev, wbsByProject: next };
              });
              return;
            }
          }
        }
        markDirty("wbsByProject");
        markDirty(`wbs:${projectId}`);
      },
      teamFor: (projectId) => data.teamByProject[projectId] ?? [],
      setTeam: async (projectId, ids) => {
        const prevTeam = dataRef.current.teamByProject[projectId];
        setData((prev) => ({ ...prev, teamByProject: { ...prev.teamByProject, [projectId]: ids } }));
        if (remoteActive()) {
          try {
            await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/team`, {
              method: "PUT",
              body: JSON.stringify({ memberIds: ids }),
            });
            setBackendError(null);
            return;
          } catch (err) {
            if (degrade(err)) {
              // 403: kembalikan optimistik, jangan tandai dirty.
              setData((prev) => {
                const next = { ...prev.teamByProject };
                if (prevTeam === undefined) delete next[projectId];
                else next[projectId] = prevTeam;
                return { ...prev, teamByProject: next };
              });
              return;
            }
          }
        }
        markDirty("teamByProject");
        markDirty(`team:${projectId}`);
      },
      branch,
      setBranch,
      inBranch,
    };
  }, [data, branch, inBranch, backendMode, backendError, resync, pendingSync, pushPending, markDirty]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore harus dipakai di dalam <StoreProvider>");
  return ctx;
}
