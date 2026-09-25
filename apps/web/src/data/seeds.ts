// Sumber tunggal seed operasional (dipakai FE via store.tsx DAN dicerminkan ke
// backend via services/api script seed:mirror → seedFeMirror.ts).
// Modul murni: tanpa impor React/browser agar bisa dimuat tsx maupun Vite.
// Baris RawData PT Syukur Bersaudara: id berawalan INV-SB / AP-SB / WO-SB /
// TRM-SB / M-SB / DS-SB / SJ-SMD / TT-SMD / C-SB / VND-SB / V-SB / QT-SB / KTR-SB.
import type { StoreItem } from "./store";

/* ============ SEED TAMBAHAN (pindahan inline page + data baru) ============ */

export const seedWorkOrders: StoreItem[] = [
  { id: "WO-2026-041", sub: "PT Baja Utama Steel", project: "NB-2025-012", scope: "Fabrikasi & blasting section 4-7", progress: 70, status: "Dalam Proses" },
  { id: "WO-2026-042", sub: "CV Pengecatan Marine", project: "RP-2026-003", scope: "Coating lambung & deck", progress: 55, status: "Dalam Proses" },
  { id: "WO-2026-043", sub: "PT Mesinindo Perkasa", project: "RP-2026-005", scope: "Overhaul main engine", progress: 40, status: "Dalam Proses" },
  { id: "WO-2026-044", sub: "CV Scaffold Aman", project: "NB-2025-012", scope: "Perancah hull assembly", progress: 100, status: "Selesai" },
  { id: "WO-2026-045", sub: "PT Kelistrikan Bahari", project: "RF-2026-001", scope: "Instalasi panel & cabling", progress: 25, status: "Dalam Proses" },
  // RawData INVOICE SUBKONTRAKTOR (Pak Yusuf, BG RMN 3324).
  { id: "WO-SB-001", sub: "Pak Yusuf", project: "RP-2026-006", scope: "Outfitting Deck BG RMN 3324 (Ban Daprah, Tanda Selar, pressure test tank)", progress: 100, status: "Selesai", date: "2026-08-20" },
];

export const seedTermins: StoreItem[] = [
  { id: "TRM-001", sub: "PT Baja Utama Steel", woId: "WO-2026-041", progress: "WO-2026-041 (70%)", amount: 2100000000, pph23: "2%", retention: "5%", status: "Belum Dibayar" },
  { id: "TRM-002", sub: "PT Mesinindo Perkasa", woId: "WO-2026-043", progress: "WO-2026-043 (40%)", amount: 1568000000, pph23: "2%", retention: "5%", status: "Disetujui" },
  { id: "TRM-003", sub: "CV Scaffold Aman", woId: "WO-2026-044", progress: "WO-2026-044 (100%)", amount: 450000000, pph23: "2%", retention: "5%", status: "Lunas" },
  { id: "TRM-004", sub: "CV Pengecatan Marine", woId: "WO-2026-042", progress: "WO-2026-042 (55%)", amount: 940000000, pph23: "2%", retention: "5%", status: "Belum Dibayar" },
  // RawData: subtotal 300.000 − PPh 0,5% (1.500) = 298.500 lunas.
  { id: "TRM-SB-001", sub: "Pak Yusuf", woId: "WO-SB-001", milestone: "Outfitting Deck BG RMN 3324", progress: "WO-SB-001 (100%)", amount: 300000, pphPct: 0.5, pphAmt: 1500, retPct: 0, retAmt: 0, status: "Lunas", date: "2026-09-01", paidAt: "2026-09-01", paidMethod: "Transfer BRI SB" },
];

export const seedVendors: StoreItem[] = [
  { id: "VND-001", name: "PT Bahana Baja", cat: "Baja & Struktur", onTime: 92, quality: 95, po: 12, status: "Aktif" },
  { id: "VND-002", name: "PT Indo Diesel", cat: "Mesin & Engine", onTime: 96, quality: 90, po: 5, status: "Aktif" },
  { id: "VND-003", name: "PT Jotun Indonesia", cat: "Cat & Coating", onTime: 88, quality: 93, po: 8, status: "Aktif" },
  { id: "VND-004", name: "PT Steel Rig", cat: "Rigging & Wire", onTime: 84, quality: 87, po: 6, status: "Aktif" },
  { id: "VND-005", name: "PT Primabaja", cat: "Baja & Struktur", onTime: 81, quality: 86, po: 3, status: "Kualifikasi" },
  // RawData: vendor subkontraktor WO (nama = sub di workOrders).
  { id: "VND-041", name: "PT Baja Utama Steel", cat: "Fabrikasi & Blasting", onTime: 90, quality: 90, po: 4, status: "Aktif" },
  { id: "VND-042", name: "CV Pengecatan Marine", cat: "Pengecatan / Coating", onTime: 84, quality: 84, po: 2, status: "Aktif" },
  { id: "VND-043", name: "PT Mesinindo Perkasa", cat: "Overhaul Mesin", onTime: 88, quality: 88, po: 3, status: "Aktif" },
  { id: "VND-044", name: "CV Scaffold Aman", cat: "Perancah & Staging", onTime: 92, quality: 92, po: 2, status: "Aktif" },
  { id: "VND-045", name: "PT Kelistrikan Bahari", cat: "Elektrikal & Panel", onTime: 76, quality: 76, po: 1, status: "Kualifikasi" },
  // RawData CONTOH HUTANG + FORMAT PO MATERIAL.
  { id: "VND-SB-001", name: "PT KALTIM LESTARI UNGGUL", cat: "Baja & Pipa", onTime: 90, quality: 91, po: 9, status: "Aktif" },
];

export const seedRequisitions: StoreItem[] = [
  { id: "PR-2026-201", item: "Aux Engine MAK", by: "Budi Santoso", amount: 1700000000, status: "Sudah PO" },
  { id: "PR-2026-203", item: "Pelat Baja AH36", by: "Fajar N.", amount: 4120000000, status: "Sudah PO" },
  { id: "PR-2026-207", item: "Cat Epoxy", by: "Rudi H.", amount: 480000000, status: "Menunggu Approval" },
  { id: "PR-2026-209", item: "Wire Rope", by: "Sari W.", amount: 210000000, status: "RFQ" },
  { id: "PR-2026-211", item: "Anoda Zink", by: "Agus S.", amount: 94000000, status: "Menunggu Approval" },
  // RawData: PR yang menjadi PO-SB (CONTOH HUTANG + FORMAT PO).
  { id: "PR-SB-2024-006", item: "Besi WF (250/150/200)", by: "Fajar N.", amount: 27811050, status: "Sudah PO" },
  { id: "PR-SB-2026-004", item: "PLAT 14MM", by: "Agus S.", amount: 36341622, status: "Sudah PO" },
  { id: "PR-SB-2026-012", item: "SIKU PRESS + ROUNDBAR", by: "Agus S.", amount: 409492875, status: "Sudah PO" },
  { id: "PR-SB-2026-036", item: "PLAT 12MM/8MM", by: "Fajar N.", amount: 982905000, status: "Sudah PO" },
];

export const seedInspections: StoreItem[] = [
  { id: "INS-2026-118", project: "NB-2025-012", point: "Welding seam section 4", itp: "ITP-012", status: "Lulus", date: "2026-07-20" },
  { id: "INS-2026-119", project: "RP-2026-003", point: "Ketebalan cat lambung", itp: "ITP-003", status: "NCR", date: "2026-07-22" },
  { id: "INS-2026-120", project: "RF-2026-001", point: "Anoda & hull survey", itp: "ITP-001", status: "Dalam Proses", date: "2026-07-26" },
  { id: "INS-2026-121", project: "NB-2025-014", point: "Pemeriksaan prop shaft", itp: "ITP-014", status: "Terjadwal", date: "2026-08-02" },
  { id: "INS-2026-122", project: "RP-2026-005", point: "Toleransi bearing overhaul", itp: "ITP-005", status: "NCR", date: "2026-07-25" },
];

export const seedBookings: StoreItem[] = [
  { equip: "Mobile Crane 100T", proyek: "NB-2025-012", jam: "08:00–17:00", status: "Terpakai", id: "BK-001", date: "2026-08-02" },
  { equip: "Mesin Las MIG", proyek: "RP-2026-003", jam: "07:00–16:00", status: "Terpakai", id: "BK-002", date: "2026-08-02" },
  { equip: "Forklift 10T", proyek: "RP-2026-005", jam: "09:00–15:00", status: "Terpakai", id: "BK-003", date: "2026-08-02" },
  { equip: "Gantry Crane 50T", proyek: "NB-2025-014", jam: "08:00–12:00", status: "Terjadwal", id: "BK-004", date: "2026-08-03" },
];

// Seed dari docs/RawData/DataPencatatanFinance.xlsx — sheet Hutang, Agustus 2026.
// amt = saldo akhir (outstanding), openAwal = saldo awal bulan, po OPEN-0826 = saldo awal (tanpa PO).
export const seedPayables: StoreItem[] = [
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
  // RawData CONTOH HUTANG (PT KALTIM LESTARI UNGGUL): bayar 2 tahap, No PO-SB, ref U/TK kapal.
  { id: "AP-SB-001", v: "PT KALTIM LESTARI UNGGUL", po: "PO-SB-2026-004 / 04/PO-SB/SMD/I/2026", amt: 36341622, openAwal: 36341622, due: "2026-04-30", pph: "2%", st: "Lunas", vessel: "U/TK. RMN 3317", item: "PLAT 14MM 2 lbr", pay1: 36341622, pay1date: "2026-04-17", pay2: 0, pay2date: "", paidAt: "2026-04-17" },
  { id: "AP-SB-002", v: "PT KALTIM LESTARI UNGGUL", po: "PO-SB-2026-012 / 12/PO-SB/SMD/I/2026", amt: 409492875, openAwal: 409492875, due: "2026-06-30", pph: "2%", st: "Lunas", vessel: "U/BG. KBT 26, BG. MEGA POWER 8, TB. KARYA STAR 35", item: "SIKU PRESS + ROUNDBAR", pay1: 309906340, pay1date: "2026-06-02", pay2: 99586535, pay2date: "2026-07-22", paidAt: "2026-07-22" },
  { id: "AP-SB-003", v: "PT KALTIM LESTARI UNGGUL", po: "PO-SB-2026-036 / 36/PO-SB/SMD/IV/2026", amt: 982905000, openAwal: 982905000, due: "2026-09-30", pph: "2%", st: "Belum Dibayar", vessel: "U/TK. ARTHA SARANA XI & U/TK. MHKL 35", item: "PLAT 12MM/8MM", pay1: 432000, pay1date: "2026-09-09", pay2: 0, pay2date: "" },
  // Hutang dari GR runtime (PO-2026-116/117 → M-0902/M-0905).
  { id: "AP-2026-116", v: "PT Jotun Indonesia", po: "PO-2026-116", amt: 480000000, openAwal: 480000000, due: "2026-08-28", pph: "2%", st: "Belum Dibayar", vessel: "-", item: "Cat Epoxy", pay1: 0, pay1date: "", pay2: 0, pay2date: "" },
  { id: "AP-2026-117", v: "PT Steel Rig", po: "PO-2026-117", amt: 210000000, openAwal: 210000000, due: "2026-08-29", pph: "2%", st: "Belum Dibayar", vessel: "-", item: "Wire Rope", pay1: 0, pay1date: "", pay2: 0, pay2date: "" },
  // Hutang neto termin Pak Yusuf (TRM-SB-001 lunas 298.500).
  { id: "AP-SB-T1", v: "Pak Yusuf", po: "TERM-TRM-SB-001", amt: 298500, openAwal: 298500, due: "2026-09-15", pph: "Non-PPn", st: "Lunas", vessel: "BG RMN 3324", item: "Outfitting Deck BG RMN 3324", pay1: 298500, pay1date: "2026-09-01", pay2: 0, pay2date: "", paidAt: "2026-09-01" },
];

// Seed dari docs/RawData/DataPencatatanFinance.xlsx — sheet Piutang, Agustus 2026.
// Satu baris per customer bersaldo akhir > 0; amount = saldo akhir, openAwal = saldo awal bulan.
export const seedInvoices: StoreItem[] = [
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
  { id: "INV/OPEN-2026-014", client: "DONY", project: "", amount: 500000, openAwal: 1000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-015", client: "TARMAN", project: "", amount: 2500000, openAwal: 1000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-016", client: "JESI", project: "", amount: 1000000, openAwal: 1500000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-017", client: "AGUS RIONO", project: "", amount: 1500000, openAwal: 2000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-018", client: "SUKARMAN", project: "", amount: 2000000, openAwal: 3000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-019", client: "PASHA", project: "", amount: 1500000, openAwal: 2000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-020", client: "SAFARUDIN", project: "", amount: 1500000, openAwal: 2000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
  { id: "INV/OPEN-2026-021", client: "ALUS", project: "", amount: 5000000, openAwal: 1000000, due: "2026-08-31", status: "Belum Dibayar", paymentTerm: "Saldo Awal Agu-2026", billingType: "Saldo Awal", dunning: "Belum Ditagih", nonPpn: false },
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
  // RawData Invoice/CONTOH INVOICE.xlsx — 4 pola Jasa+Material. Rumus: TOTAL=J+M,
  // DPP=TOTAL×11/12, PPN=12%×DPP, PPh=2%×Jasa, Grand=TOTAL+PPN−PPh−DP.
  { id: "INV-SB-2026-058", client: "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA", project: "RP-2026-006", noInv: "058/INV-SB/SMD/IX/2026", vessel: "BG RMN 3324", jasaTotal: 808550650, matTotal: 711613605, amount: 1520164255, dpp: 1393483901, ppnAmt: 167218068, pphAmt: 16171013, dpApplied: 0, grandTotal: 1671211310, skdt: false, ppnRate: 12, pphRate: 2, due: "2026-09-30", status: "Belum Dibayar", paymentTerm: "NET 30", billingType: "Milestone", milestoneRef: "Pelunasan Docking & Repair BG RMN 3324", dunning: "Ditagih", nonPpn: false, date: "2026-09-01" },
  { id: "INV-SB-2026-049", client: "PT PELAYARAN ROYLEA MARINE LINE", project: "RP-2026-007", noInv: "049/INV-SB/SMD/VII/2026", vessel: "AWB SEA HAVEN 2", jasaTotal: 1501469657, matTotal: 1357158023, amount: 2858627680, dpp: 2620408707, ppnAmt: 314449045, pphAmt: 30029393, dpApplied: 1098000000, dpRef: "045/INV-SB/SMD/VI/2026", grandTotal: 2045047332, skdt: false, ppnRate: 12, pphRate: 2, due: "2026-08-13", status: "Belum Dibayar", paymentTerm: "NET 30", billingType: "Milestone", milestoneRef: "Pelunasan V2 (potong DP-1)", dunning: "Ditagih", nonPpn: false, date: "2026-07-13" },
  { id: "INV-SB-2026-037", client: "PT ALVI CIPTA SENTOSA", project: "RP-2026-008", noInv: "037/INV-SB/SMD/V/2026", vessel: "BG MHKL 35", jasaTotal: 184349645, matTotal: 543356806, amount: 727706451, dpp: 727706451, ppnAmt: 0, pphAmt: 3686993, dpApplied: 0, grandTotal: 724019458, skdt: true, ppnRate: 12, pphRate: 2, due: "2026-06-08", status: "Belum Dibayar", paymentTerm: "NET 30", billingType: "Milestone", milestoneRef: "Pelunasan BG MHKL 35 (SKDT, tanpa PPN)", dunning: "Ditagih", nonPpn: false, date: "2026-05-08" },
  { id: "INV-SB-2026-045", client: "PT PELAYARAN ROYLEA MARINE LINE", project: "RP-2026-007", noInv: "045/INV-SB/SMD/VI/2026", vessel: "AWB SEA HAVEN 2", jasaTotal: 600000000, matTotal: 400000000, amount: 1000000000, dpp: 916666667, ppnAmt: 110000000, pphAmt: 12000000, dpApplied: 0, grandTotal: 1098000000, skdt: false, ppnRate: 12, pphRate: 2, due: "2026-07-25", status: "Lunas", paymentTerm: "NET 30", billingType: "Uang Muka", milestoneRef: "DP-1 AWB SEA HAVEN 2", dunning: "Ditagih", nonPpn: false, date: "2026-06-25", paidAt: "2026-07-10" },
];

export const seedDocuments: StoreItem[] = [
  { id: "DOC-001", title: "Kontrak NB-2025-012 — TB Samudra Jaya 07", type: "Kontrak", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v3.0", status: "Berlaku", updated: "2026-07-28", owner: "Andi Darman" },
  { id: "DOC-002", title: "General Arrangement Drawing", type: "Drawing", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "Rev C", status: "Disetujui", updated: "2026-07-20", owner: "Hendra Wijaya" },
  { id: "DOC-003", title: "ITP-012 Welding Procedure", type: "Prosedur", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.2", status: "Berlaku", updated: "2026-07-15", owner: "Sari Wulandari" },
  { id: "DOC-004", title: "Certificate of Class — TB Karya Bahari 12", type: "Sertifikat", project: "RP-2026-003", vessel: "TB Karya Bahari 12", version: "2023", status: "Kedaluwarsa", updated: "2023-08-15", owner: "Sari Wulandari" },
  { id: "DOC-005", title: "Docking Report RP-2026-003", type: "Laporan", project: "RP-2026-003", vessel: "TB Karya Bahari 12", version: "v1.0", status: "Draft", updated: "2026-08-01", owner: "Rudi Hartono" },
  { id: "DOC-006", title: "Kontrak NB-2025-014 — TB Nusantara 22", type: "Kontrak", project: "NB-2025-014", vessel: "TB Nusantara 22", version: "v2.0", status: "Berlaku", updated: "2026-06-30", owner: "Andi Darman" },
  { id: "DOC-007", title: "Sea Trial Procedure NB-2025-012", type: "Prosedur", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.0", status: "Diajukan", updated: "2026-08-02", owner: "Ir. Hendra Wijaya" },
  { id: "DOC-008", title: "Invoice INV/OPEN-2026-035 (Saldo Awal Piutang)", type: "Invoice", project: "-", vessel: "-", version: "v1.0", status: "Berlaku", updated: "2026-08-31", owner: "Dewi Lestari" },
  { id: "DOC-009", title: "NCR-2026-031 Corrective Action", type: "NCR", project: "NB-2025-012", vessel: "TB Samudra Jaya 07", version: "v1.1", status: "Diajukan", updated: "2026-07-25", owner: "Sari Wulandari" },
  { id: "DOC-010", title: "Stability Booklet — TB Nusantara 22", type: "Drawing", project: "NB-2025-014", vessel: "TB Nusantara 22", version: "Rev A", status: "Disetujui", updated: "2026-07-10", owner: "Hendra Wijaya" },
  { id: "DOC-011", title: "HSE Plan 2026", type: "Prosedur", project: "-", vessel: "-", version: "v4.0", status: "Berlaku", updated: "2026-01-05", owner: "Sari Wulandari" },
  { id: "DOC-012", title: "Quotation QT-2026-052", type: "Penawaran", project: "-", vessel: "TB Baru RJ-03", version: "v2.0", status: "Berlaku", updated: "2026-07-20", owner: "Ir. Hendra Wijaya" },
  // RawData: arsip operasional SB (DS + Surat Jalan + Tanda Terima BG RMN 3324).
  { id: "DS-SB-2026-001", title: "Dock Space — BG RMN 3324", type: "Dock Space", project: "RP-2026-006", vessel: "BG RMN 3324", version: "v1.0", status: "Berlaku", updated: "2026-08-10", owner: "Rudi Hartono", sbRef: "000/DS-SB/SMD/VIII/2026" },
  { id: "SJ-SMD-2026-001", title: "Surat Jalan — Material BG RMN 3324", type: "Surat Jalan", project: "RP-2026-006", vessel: "BG RMN 3324", version: "v1.0", status: "Berlaku", updated: "2026-08-15", owner: "Santi", sbRef: "001/SJ-SMD/SMD/VIII/2026" },
  { id: "TT-SMD-2026-001", title: "Tanda Terima — BG RMN 3324", type: "Tanda Terima", project: "RP-2026-006", vessel: "BG RMN 3324", version: "v1.0", status: "Berlaku", updated: "2026-08-15", owner: "Santi", sbRef: "001/TT-SMD/SMD/VIII/2026" },
];

/* ============ SEED REMAKE: cabang, absensi, payroll, pajak, RFQ, CO, risiko,
   cuti, training, timesheet, drawing, toolbox, kalibrasi, komunikasi, kontrak ============ */

export const seedBranches: StoreItem[] = [
  { id: "BR-01", name: "Samarinda — Kantor Pusat", city: "Samarinda", isHQ: true },
  { id: "BR-02", name: "Balikpapan — Galangan", city: "Balikpapan", isHQ: false },
  { id: "BR-03", name: "Banjarmasin — Workshop", city: "Banjarmasin", isHQ: false },
];

export const seedAttendance: StoreItem[] = [
  { id: "ABS-20260801-001", employeeId: "EMP-002", date: "2026-08-01", shift: "Pagi", status: "Hadir", checkIn: "07:55", checkOut: "17:05", overtime: 1, otStatus: "Disetujui" },
  { id: "ABS-20260801-002", employeeId: "EMP-004", date: "2026-08-01", shift: "Pagi", status: "Hadir", checkIn: "08:02", checkOut: "17:00", overtime: 0 },
  { id: "ABS-20260801-003", employeeId: "EMP-005", date: "2026-08-01", shift: "Siang", status: "Sakit", checkIn: "", checkOut: "", overtime: 0 },
  { id: "ABS-20260802-001", employeeId: "EMP-002", date: "2026-08-02", shift: "Pagi", status: "Hadir", checkIn: "07:50", checkOut: "19:30", overtime: 2.5 },
  { id: "ABS-20260802-002", employeeId: "EMP-006", date: "2026-08-02", shift: "Pagi", status: "Izin", checkIn: "", checkOut: "", overtime: 0 },
];

export const seedPayroll: StoreItem[] = [
  { id: "PAY-202607-002", employeeId: "EMP-002", period: "2026-07", basic: 18000000, allowances: 4500000, overtimePay: 1200000, deductions: 500000, pph21: 1875000, bpjsKes: 540000, bpjsTk: 666000, net: 19569000, status: "Dibayar", paidAt: "2026-07-31" },
  { id: "PAY-202607-004", employeeId: "EMP-004", period: "2026-07", basic: 12000000, allowances: 3000000, overtimePay: 800000, deductions: 200000, pph21: 950000, bpjsKes: 360000, bpjsTk: 444000, net: 13846000, status: "Dibayar", paidAt: "2026-07-31" },
  { id: "PAY-202608-002", employeeId: "EMP-002", period: "2026-08", basic: 18000000, allowances: 4500000, overtimePay: 0, deductions: 0, pph21: 0, bpjsKes: 0, bpjsTk: 0, net: 0, status: "Draft", paidAt: "" },
];

export const seedTaxPeriods: StoreItem[] = [
  { id: "TAX-202607", period: "2026-07", ppnKeluar: 1056000000, ppnMasuk: 452000000, pph23: 124000000, pph21: 38500000, status: "Lapor" },
  // Agustus 2026 dikunci dari JU penyesuaian Excel: PPN Keluaran 455,63jt, Masukan 73,75jt; PPh23 = NL 2-232.
  { id: "TAX-202608", period: "2026-08", ppnKeluar: 455632169.08, ppnMasuk: 73753513.46, pph23: 11737820, pph21: 0, status: "Lapor", reportedAt: "2026-08-31" },
];

export const seedRfqs: StoreItem[] = [
  { id: "RFQ-2026-031", prId: "PR-2026-207", item: "Cat Epoxy", vendors: ["PT Jotun Indonesia", "PT Bahana Baja", "PT Steel Rig"], quotes: [{ vendor: "PT Jotun Indonesia", price: 480000000, eta: "2026-08-12" }, { vendor: "PT Bahana Baja", price: 495000000, eta: "2026-08-10" }], status: "Evaluasi", winner: "" },
  { id: "RFQ-2026-032", prId: "PR-2026-209", item: "Wire Rope", vendors: ["PT Steel Rig", "PT Primabaja", "PT Bahana Baja"], quotes: [], status: "Terkirim", winner: "" },
];

export const seedChangeOrders: StoreItem[] = [
  { id: "CO-2026-011", project: "NB-2025-012", title: "Tambah Fi-Fi system deck", impact: 1850000000, status: "Diajukan", requestedBy: "Budi Santoso", date: "2026-07-28" },
  { id: "CO-2026-010", project: "RP-2026-003", title: "Ganti scope propeller polishing", impact: -120000000, status: "Disetujui", requestedBy: "Rudi Hartono", date: "2026-07-15" },
];

export const seedRisks: StoreItem[] = [
  { id: "RSK-001", project: "NB-2025-012", title: "Keterlambatan baja AH36", likelihood: "Sedang", impact: "Tinggi", mitigation: "Dual vendor + buffer 2 minggu", status: "Dipantau" },
  { id: "RSK-002", project: "RP-2026-005", title: "Overrun overhaul bearing", likelihood: "Tinggi", impact: "Sedang", mitigation: "Inspeksi toleransi per shift", status: "Aktif" },
];

export const seedLeaves: StoreItem[] = [
  { id: "CUT-2026-018", employeeId: "EMP-006", type: "Tahunan", from: "2026-08-10", to: "2026-08-12", days: 3, status: "Disetujui", note: "Keperluan keluarga" },
  { id: "CUT-2026-019", employeeId: "EMP-005", type: "Sakit", from: "2026-08-01", to: "2026-08-01", days: 1, status: "Diajukan", note: "Surat dokter terlampir" },
];

export const seedTrainings: StoreItem[] = [
  { id: "TRN-2026-006", title: "Welding Inspector Refresh", date: "2026-09-05", participants: ["EMP-002", "EMP-006"], provider: "B4T", status: "Terjadwal" },
  { id: "TRN-2026-005", title: "Basic Safety & Fire Fighting", date: "2026-07-12", participants: ["EMP-004", "EMP-005"], provider: "Internal HSE", status: "Selesai" },
];

export const seedTimesheets: StoreItem[] = [
  { id: "TS-20260801-01", woId: "WO-2026-041", employeeId: "EMP-005", date: "2026-08-01", hours: 8, note: "Fabrikasi section 5", status: "Disetujui", rate: 125000 },
  { id: "TS-20260801-02", woId: "WO-2026-043", employeeId: "EMP-004", date: "2026-08-01", hours: 6, note: "Overhaul cylinder 3", status: "Disetujui", rate: 150000 },
];

export const seedDrawings: StoreItem[] = [
  { id: "DRW-GA-012-C", project: "NB-2025-012", title: "General Arrangement", revision: "C", status: "Disetujui", updated: "2026-07-20", holder: "Hendra Wijaya" },
  { id: "DRW-ST-004-B", project: "NB-2025-012", title: "Structural Section 4-7", revision: "B", status: "Diajukan", updated: "2026-08-01", holder: "Budi Santoso" },
];

export const seedToolbox: StoreItem[] = [
  { id: "TBM-20260801", project: "NB-2025-012", topic: "Lifting & rigging aman", date: "2026-08-01", attendees: 24, pic: "Agus Setiawan" },
  { id: "TBM-20260802", project: "RP-2026-003", topic: "Confined space entry", date: "2026-08-02", attendees: 18, pic: "Rudi Hartono" },
];

export const seedCalibrations: StoreItem[] = [
  { id: "CAL-2026-021", equipmentId: "EQ-003", item: "Mesin Las MIG", due: "2026-08-20", status: "Terjadwal", cert: "" },
  { id: "CAL-2026-020", equipmentId: "EQ-002", item: "Load cell Mobile Crane", due: "2026-08-05", status: "Selesai", cert: "CAL-0501" },
];

export const seedCommunications: StoreItem[] = [
  { id: "COM-2026-101", quotationId: "QT-2026-052", channel: "Email", date: "2026-07-22", summary: "Kirim revisi v2 + negosiasi termin", by: "Hendra Wijaya" },
  { id: "COM-2026-102", quotationId: "QT-2026-053", channel: "Meeting", date: "2026-07-25", summary: "Presentasi teknis, minta penawaran final", by: "Budi Santoso" },
  { id: "COM-SB-001", quotationId: "QT-SB-001", channel: "Email", date: "2026-07-28", summary: "Penawaran disetujui → kontrak KTR-SB-001", by: "Hendra Wijaya" },
];

export const seedContracts: StoreItem[] = [
  { id: "KTR-2026-009", quotationId: "QT-2026-054", projectId: "RP-2026-002", client: "PT Mitra Samudra Raya", value: 3100000000, signedAt: "2026-07-12", status: "Aktif" },
  { id: "KTR-SB-001", quotationId: "QT-SB-001", projectId: "RP-2026-006", client: "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA", value: 1671211310, signedAt: "2026-08-01", status: "Aktif" },
];

export const seedBast: StoreItem[] = [
  { id: "BAST-SMD-2026-001", projectId: "NB-2025-012", milestone: "Hull Assembly — BG RMN 3324", tanggal: "2026-08-02", penandatangan: "Hendra Wijaya / Owner BG RMN 3324", lampiran: "Checklist hull + foto section 4-7", amount: 540000000, status: "Disetujui" },
  { id: "BAST-SMD-2026-002", projectId: "RP-2026-003", milestone: "Docking Completion — V2 AWB SEA HAVEN 2", tanggal: "2026-08-04", penandatangan: "Rudi Hartono / Master V2 AWB SEA HAVEN 2", lampiran: "Docking report + thickness report", amount: 102000000, status: "Diajukan" },
  { id: "BAST-SMD-2026-003", projectId: "RP-2026-006", milestone: "Docking & Repair BG RMN 3324", tanggal: "2026-09-01", penandatangan: "Rudi Hartono / Owner BG RMN 3324", lampiran: "Docking report + invoice 058/INV-SB/SMD/IX/2026", amount: 1671211310, status: "Diajukan" },
];

export const seedTrials: StoreItem[] = [
  { id: "TRIAL-001", projectId: "RP-2026-003", parameter: "Speed & bollard pull trial", tanggal: "2026-08-20", hasil: "Lulus", punchList: [], baRef: "BAST-SMD-2026-002" },
];
export const seedRequests: StoreItem[] = [
  { id: "REQ-2026-001", vessel: "TB Karya Bahari 12", client: "PT Karya Bahari Sejahtera", kind: "Repair Request", scope: "Overhaul main engine + coating lambung", value: 4200000000, status: "Baru", date: "2026-08-01" },
  { id: "REQ-SB-001", vessel: "AWB SEA HAVEN 2", client: "PT PELAYARAN ROYLEA MARINE LINE", kind: "Repair Request", scope: "Docking + repair (DP-1 → pelunasan V2)", value: 3143047332, status: "Disetujui", date: "2026-06-20" },
  { id: "REQ-SB-002", vessel: "BG RMN 3324", client: "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA", kind: "Repair Request", scope: "Docking/Undocking & Repair BG RMN 3324", value: 1671211310, status: "Disetujui", date: "2026-07-20" },
];
export const seedClientPos: StoreItem[] = [
  { id: "CPO-SB-001", contractId: "KTR-SB-001", projectId: "RP-2026-006", no: "PO-KTR-001/SB/VIII/2026", amount: 1671211310, date: "2026-08-01" },
];
