// GENERATED — jangan edit manual. Dibuat oleh `npm run seed:mirror`
// dari apps/web/src/data/seeds.ts + data/index.ts (295 baris).
export interface MirrorRow {
  table: string;
  id: string;
  branch: string;
  data: Record<string, unknown>;
}

export const FE_MIRROR_ROWS: MirrorRow[] = [
  {
    "table": "workOrders",
    "id": "WO-2026-041",
    "branch": "",
    "data": {
      "sub": "PT Baja Utama Steel",
      "project": "NB-2025-012",
      "scope": "Fabrikasi & blasting section 4-7",
      "progress": 70,
      "status": "Dalam Proses"
    }
  },
  {
    "table": "workOrders",
    "id": "WO-2026-042",
    "branch": "",
    "data": {
      "sub": "CV Pengecatan Marine",
      "project": "RP-2026-003",
      "scope": "Coating lambung & deck",
      "progress": 55,
      "status": "Dalam Proses"
    }
  },
  {
    "table": "workOrders",
    "id": "WO-2026-043",
    "branch": "",
    "data": {
      "sub": "PT Mesinindo Perkasa",
      "project": "RP-2026-005",
      "scope": "Overhaul main engine",
      "progress": 40,
      "status": "Dalam Proses"
    }
  },
  {
    "table": "workOrders",
    "id": "WO-2026-044",
    "branch": "",
    "data": {
      "sub": "CV Scaffold Aman",
      "project": "NB-2025-012",
      "scope": "Perancah hull assembly",
      "progress": 100,
      "status": "Selesai"
    }
  },
  {
    "table": "workOrders",
    "id": "WO-2026-045",
    "branch": "",
    "data": {
      "sub": "PT Kelistrikan Bahari",
      "project": "RF-2026-001",
      "scope": "Instalasi panel & cabling",
      "progress": 25,
      "status": "Dalam Proses"
    }
  },
  {
    "table": "workOrders",
    "id": "WO-SB-001",
    "branch": "",
    "data": {
      "sub": "Pak Yusuf",
      "project": "RP-2026-006",
      "scope": "Outfitting Deck BG RMN 3324 (Ban Daprah, Tanda Selar, pressure test tank)",
      "progress": 100,
      "status": "Selesai",
      "date": "2026-08-20"
    }
  },
  {
    "table": "termins",
    "id": "TRM-001",
    "branch": "",
    "data": {
      "sub": "PT Baja Utama Steel",
      "woId": "WO-2026-041",
      "progress": "WO-2026-041 (70%)",
      "amount": 2100000000,
      "pph23": "2%",
      "retention": "5%",
      "status": "Belum Dibayar"
    }
  },
  {
    "table": "termins",
    "id": "TRM-002",
    "branch": "",
    "data": {
      "sub": "PT Mesinindo Perkasa",
      "woId": "WO-2026-043",
      "progress": "WO-2026-043 (40%)",
      "amount": 1568000000,
      "pph23": "2%",
      "retention": "5%",
      "status": "Disetujui"
    }
  },
  {
    "table": "termins",
    "id": "TRM-003",
    "branch": "",
    "data": {
      "sub": "CV Scaffold Aman",
      "woId": "WO-2026-044",
      "progress": "WO-2026-044 (100%)",
      "amount": 450000000,
      "pph23": "2%",
      "retention": "5%",
      "status": "Lunas"
    }
  },
  {
    "table": "termins",
    "id": "TRM-004",
    "branch": "",
    "data": {
      "sub": "CV Pengecatan Marine",
      "woId": "WO-2026-042",
      "progress": "WO-2026-042 (55%)",
      "amount": 940000000,
      "pph23": "2%",
      "retention": "5%",
      "status": "Belum Dibayar"
    }
  },
  {
    "table": "termins",
    "id": "TRM-SB-001",
    "branch": "",
    "data": {
      "sub": "Pak Yusuf",
      "woId": "WO-SB-001",
      "milestone": "Outfitting Deck BG RMN 3324",
      "progress": "WO-SB-001 (100%)",
      "amount": 300000,
      "pphPct": 0.5,
      "pphAmt": 1500,
      "retPct": 0,
      "retAmt": 0,
      "status": "Lunas",
      "date": "2026-09-01",
      "paidAt": "2026-09-01",
      "paidMethod": "Transfer BRI SB"
    }
  },
  {
    "table": "vendors",
    "id": "VND-001",
    "branch": "",
    "data": {
      "name": "PT Bahana Baja",
      "cat": "Baja & Struktur",
      "onTime": 92,
      "quality": 95,
      "po": 12,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-002",
    "branch": "",
    "data": {
      "name": "PT Indo Diesel",
      "cat": "Mesin & Engine",
      "onTime": 96,
      "quality": 90,
      "po": 5,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-003",
    "branch": "",
    "data": {
      "name": "PT Jotun Indonesia",
      "cat": "Cat & Coating",
      "onTime": 88,
      "quality": 93,
      "po": 8,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-004",
    "branch": "",
    "data": {
      "name": "PT Steel Rig",
      "cat": "Rigging & Wire",
      "onTime": 84,
      "quality": 87,
      "po": 6,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-005",
    "branch": "",
    "data": {
      "name": "PT Primabaja",
      "cat": "Baja & Struktur",
      "onTime": 81,
      "quality": 86,
      "po": 3,
      "status": "Kualifikasi"
    }
  },
  {
    "table": "vendors",
    "id": "VND-041",
    "branch": "",
    "data": {
      "name": "PT Baja Utama Steel",
      "cat": "Fabrikasi & Blasting",
      "onTime": 90,
      "quality": 90,
      "po": 4,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-042",
    "branch": "",
    "data": {
      "name": "CV Pengecatan Marine",
      "cat": "Pengecatan / Coating",
      "onTime": 84,
      "quality": 84,
      "po": 2,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-043",
    "branch": "",
    "data": {
      "name": "PT Mesinindo Perkasa",
      "cat": "Overhaul Mesin",
      "onTime": 88,
      "quality": 88,
      "po": 3,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-044",
    "branch": "",
    "data": {
      "name": "CV Scaffold Aman",
      "cat": "Perancah & Staging",
      "onTime": 92,
      "quality": 92,
      "po": 2,
      "status": "Aktif"
    }
  },
  {
    "table": "vendors",
    "id": "VND-045",
    "branch": "",
    "data": {
      "name": "PT Kelistrikan Bahari",
      "cat": "Elektrikal & Panel",
      "onTime": 76,
      "quality": 76,
      "po": 1,
      "status": "Kualifikasi"
    }
  },
  {
    "table": "vendors",
    "id": "VND-SB-001",
    "branch": "",
    "data": {
      "name": "PT KALTIM LESTARI UNGGUL",
      "cat": "Baja & Pipa",
      "onTime": 90,
      "quality": 91,
      "po": 9,
      "status": "Aktif"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-2026-201",
    "branch": "",
    "data": {
      "item": "Aux Engine MAK",
      "by": "Budi Santoso",
      "amount": 1700000000,
      "status": "Sudah PO"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-2026-203",
    "branch": "",
    "data": {
      "item": "Pelat Baja AH36",
      "by": "Fajar N.",
      "amount": 4120000000,
      "status": "Sudah PO"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-2026-207",
    "branch": "",
    "data": {
      "item": "Cat Epoxy",
      "by": "Rudi H.",
      "amount": 480000000,
      "status": "Menunggu Approval"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-2026-209",
    "branch": "",
    "data": {
      "item": "Wire Rope",
      "by": "Sari W.",
      "amount": 210000000,
      "status": "RFQ"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-2026-211",
    "branch": "",
    "data": {
      "item": "Anoda Zink",
      "by": "Agus S.",
      "amount": 94000000,
      "status": "Menunggu Approval"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-SB-2024-006",
    "branch": "",
    "data": {
      "item": "Besi WF (250/150/200)",
      "by": "Fajar N.",
      "amount": 27811050,
      "status": "Sudah PO"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-SB-2026-004",
    "branch": "",
    "data": {
      "item": "PLAT 14MM",
      "by": "Agus S.",
      "amount": 36341622,
      "status": "Sudah PO"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-SB-2026-012",
    "branch": "",
    "data": {
      "item": "SIKU PRESS + ROUNDBAR",
      "by": "Agus S.",
      "amount": 409492875,
      "status": "Sudah PO"
    }
  },
  {
    "table": "requisitions",
    "id": "PR-SB-2026-036",
    "branch": "",
    "data": {
      "item": "PLAT 12MM/8MM",
      "by": "Fajar N.",
      "amount": 982905000,
      "status": "Sudah PO"
    }
  },
  {
    "table": "inspections",
    "id": "INS-2026-118",
    "branch": "",
    "data": {
      "project": "NB-2025-012",
      "point": "Welding seam section 4",
      "itp": "ITP-012",
      "status": "Lulus",
      "date": "2026-07-20"
    }
  },
  {
    "table": "inspections",
    "id": "INS-2026-119",
    "branch": "",
    "data": {
      "project": "RP-2026-003",
      "point": "Ketebalan cat lambung",
      "itp": "ITP-003",
      "status": "NCR",
      "date": "2026-07-22"
    }
  },
  {
    "table": "inspections",
    "id": "INS-2026-120",
    "branch": "",
    "data": {
      "project": "RF-2026-001",
      "point": "Anoda & hull survey",
      "itp": "ITP-001",
      "status": "Dalam Proses",
      "date": "2026-07-26"
    }
  },
  {
    "table": "inspections",
    "id": "INS-2026-121",
    "branch": "",
    "data": {
      "project": "NB-2025-014",
      "point": "Pemeriksaan prop shaft",
      "itp": "ITP-014",
      "status": "Terjadwal",
      "date": "2026-08-02"
    }
  },
  {
    "table": "inspections",
    "id": "INS-2026-122",
    "branch": "",
    "data": {
      "project": "RP-2026-005",
      "point": "Toleransi bearing overhaul",
      "itp": "ITP-005",
      "status": "NCR",
      "date": "2026-07-25"
    }
  },
  {
    "table": "bookings",
    "id": "BK-001",
    "branch": "",
    "data": {
      "equip": "Mobile Crane 100T",
      "proyek": "NB-2025-012",
      "jam": "08:00–17:00",
      "status": "Terpakai",
      "date": "2026-08-02"
    }
  },
  {
    "table": "bookings",
    "id": "BK-002",
    "branch": "",
    "data": {
      "equip": "Mesin Las MIG",
      "proyek": "RP-2026-003",
      "jam": "07:00–16:00",
      "status": "Terpakai",
      "date": "2026-08-02"
    }
  },
  {
    "table": "bookings",
    "id": "BK-003",
    "branch": "",
    "data": {
      "equip": "Forklift 10T",
      "proyek": "RP-2026-005",
      "jam": "09:00–15:00",
      "status": "Terpakai",
      "date": "2026-08-02"
    }
  },
  {
    "table": "bookings",
    "id": "BK-004",
    "branch": "",
    "data": {
      "equip": "Gantry Crane 50T",
      "proyek": "NB-2025-014",
      "jam": "08:00–12:00",
      "status": "Terjadwal",
      "date": "2026-08-03"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-001",
    "branch": "",
    "data": {
      "v": "CV BERLIAN JAYA GAS",
      "po": "OPEN-0826",
      "amt": 502116000.32999945,
      "openAwal": 701808000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-002",
    "branch": "",
    "data": {
      "v": "CV KALINDO MITRA BERSAMA",
      "po": "OPEN-0826",
      "amt": 119319450,
      "openAwal": 162109950,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-003",
    "branch": "",
    "data": {
      "v": "PT MURNI GAS RAYA",
      "po": "OPEN-0826",
      "amt": 1665000,
      "openAwal": 14985000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-004",
    "branch": "",
    "data": {
      "v": "PT SAPTA SUMBER LANCAR",
      "po": "OPEN-0826",
      "amt": 174796000,
      "openAwal": 355575999,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-006",
    "branch": "",
    "data": {
      "v": "PT MANDALIKA VARUNA PERKASA",
      "po": "OPEN-0826",
      "amt": 73267500,
      "openAwal": 73267500,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-007",
    "branch": "",
    "data": {
      "v": "DW SAMARINDA",
      "po": "OPEN-0826",
      "amt": 425000,
      "openAwal": 850000,
      "due": "2026-08-31",
      "pph": "Non-PPn",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-008",
    "branch": "",
    "data": {
      "v": "CV SUMBER GAS ABADI",
      "po": "OPEN-0826",
      "amt": 19719150,
      "openAwal": 53779500,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-009",
    "branch": "",
    "data": {
      "v": "CV MASEBA TEKNIK",
      "po": "OPEN-0826",
      "amt": 21654399.48,
      "openAwal": 0,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-010",
    "branch": "",
    "data": {
      "v": "PT SEMERU TEKNIK",
      "po": "OPEN-0826",
      "amt": 140000000,
      "openAwal": 190000000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-012",
    "branch": "",
    "data": {
      "v": "PT PRASETYA UTAMA ENERGI",
      "po": "OPEN-0826",
      "amt": 218670000,
      "openAwal": 189810000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-013",
    "branch": "",
    "data": {
      "v": "PT SURYA BIRU MURNI",
      "po": "OPEN-0826",
      "amt": 24975000,
      "openAwal": 23310000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-014",
    "branch": "",
    "data": {
      "v": "PT CITRA MUSI LESTARI",
      "po": "OPEN-0826",
      "amt": 143500000.38,
      "openAwal": 200900000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-016",
    "branch": "",
    "data": {
      "v": "PT BUKIT PUTRI INDAH PERMAI",
      "po": "OPEN-0826",
      "amt": 7520705,
      "openAwal": 23869035,
      "due": "2026-08-31",
      "pph": "Non-PPn",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-017",
    "branch": "",
    "data": {
      "v": "PT SANJAYA PUTRA KENCANA",
      "po": "OPEN-0826",
      "amt": 4225770,
      "openAwal": 4225770,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-018",
    "branch": "",
    "data": {
      "v": "CV SANGA SANGA INTERIOR",
      "po": "OPEN-0826",
      "amt": 20000000,
      "openAwal": 35000000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-019",
    "branch": "",
    "data": {
      "v": "THAMRIN ELEKTRICAL",
      "po": "OPEN-0826",
      "amt": 22925000,
      "openAwal": 37925000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-020",
    "branch": "",
    "data": {
      "v": "PT SAMUDRA MITRA SERVICE",
      "po": "OPEN-0826",
      "amt": 24034500,
      "openAwal": 24034500,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-022",
    "branch": "",
    "data": {
      "v": "CV MAKKADAE ABADI",
      "po": "OPEN-0826",
      "amt": 618048000,
      "openAwal": 753246000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-024",
    "branch": "",
    "data": {
      "v": "PT WAHYU MANDIRI AMARA CIPTA",
      "po": "OPEN-0826",
      "amt": 66137130,
      "openAwal": 0,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-025",
    "branch": "",
    "data": {
      "v": "BFI Finance - Sany Rough Crane",
      "po": "OPEN-0826",
      "amt": 85336000,
      "openAwal": 85336000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-026",
    "branch": "",
    "data": {
      "v": "BFI Finance - Loader",
      "po": "OPEN-0826",
      "amt": 716950000,
      "openAwal": 745628000,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-EX-027",
    "branch": "",
    "data": {
      "v": "BFI Finance - Truck",
      "po": "OPEN-0826",
      "amt": 129471000,
      "openAwal": 151049500,
      "due": "2026-08-31",
      "pph": "2%",
      "st": "Belum Dibayar"
    }
  },
  {
    "table": "payables",
    "id": "AP-SB-001",
    "branch": "",
    "data": {
      "v": "PT KALTIM LESTARI UNGGUL",
      "po": "PO-SB-2026-004 / 04/PO-SB/SMD/I/2026",
      "amt": 36341622,
      "openAwal": 36341622,
      "due": "2026-04-30",
      "pph": "2%",
      "st": "Lunas",
      "vessel": "U/TK. RMN 3317",
      "item": "PLAT 14MM 2 lbr",
      "pay1": 36341622,
      "pay1date": "2026-04-17",
      "pay2": 0,
      "pay2date": "",
      "paidAt": "2026-04-17"
    }
  },
  {
    "table": "payables",
    "id": "AP-SB-002",
    "branch": "",
    "data": {
      "v": "PT KALTIM LESTARI UNGGUL",
      "po": "PO-SB-2026-012 / 12/PO-SB/SMD/I/2026",
      "amt": 409492875,
      "openAwal": 409492875,
      "due": "2026-06-30",
      "pph": "2%",
      "st": "Lunas",
      "vessel": "U/BG. KBT 26, BG. MEGA POWER 8, TB. KARYA STAR 35",
      "item": "SIKU PRESS + ROUNDBAR",
      "pay1": 309906340,
      "pay1date": "2026-06-02",
      "pay2": 99586535,
      "pay2date": "2026-07-22",
      "paidAt": "2026-07-22"
    }
  },
  {
    "table": "payables",
    "id": "AP-SB-003",
    "branch": "",
    "data": {
      "v": "PT KALTIM LESTARI UNGGUL",
      "po": "PO-SB-2026-036 / 36/PO-SB/SMD/IV/2026",
      "amt": 982905000,
      "openAwal": 982905000,
      "due": "2026-09-30",
      "pph": "2%",
      "st": "Belum Dibayar",
      "vessel": "U/TK. ARTHA SARANA XI & U/TK. MHKL 35",
      "item": "PLAT 12MM/8MM",
      "pay1": 432000,
      "pay1date": "2026-09-09",
      "pay2": 0,
      "pay2date": ""
    }
  },
  {
    "table": "payables",
    "id": "AP-2026-116",
    "branch": "",
    "data": {
      "v": "PT Jotun Indonesia",
      "po": "PO-2026-116",
      "amt": 480000000,
      "openAwal": 480000000,
      "due": "2026-08-28",
      "pph": "2%",
      "st": "Belum Dibayar",
      "vessel": "-",
      "item": "Cat Epoxy",
      "pay1": 0,
      "pay1date": "",
      "pay2": 0,
      "pay2date": ""
    }
  },
  {
    "table": "payables",
    "id": "AP-2026-117",
    "branch": "",
    "data": {
      "v": "PT Steel Rig",
      "po": "PO-2026-117",
      "amt": 210000000,
      "openAwal": 210000000,
      "due": "2026-08-29",
      "pph": "2%",
      "st": "Belum Dibayar",
      "vessel": "-",
      "item": "Wire Rope",
      "pay1": 0,
      "pay1date": "",
      "pay2": 0,
      "pay2date": ""
    }
  },
  {
    "table": "payables",
    "id": "AP-SB-T1",
    "branch": "",
    "data": {
      "v": "Pak Yusuf",
      "po": "TERM-TRM-SB-001",
      "amt": 298500,
      "openAwal": 298500,
      "due": "2026-09-15",
      "pph": "Non-PPn",
      "st": "Lunas",
      "vessel": "BG RMN 3324",
      "item": "Outfitting Deck BG RMN 3324",
      "pay1": 298500,
      "pay1date": "2026-09-01",
      "pay2": 0,
      "pay2date": "",
      "paidAt": "2026-09-01"
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-001",
    "branch": "",
    "data": {
      "client": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "project": "",
      "amount": 2512091953.9700003,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-002",
    "branch": "",
    "data": {
      "client": "PT MUTIARA EXPRESS LINES",
      "project": "",
      "amount": 717806058,
      "openAwal": 717806058,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-003",
    "branch": "",
    "data": {
      "client": "PT TIRTA MAHAKAM RESOURCES TBK",
      "project": "",
      "amount": 1323312036.67,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-004",
    "branch": "",
    "data": {
      "client": "PT MITRA KEMAKMURAN LINE",
      "project": "",
      "amount": 725000000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-005",
    "branch": "",
    "data": {
      "client": "PT PELAYARAN PELANGI SINDUMULIA",
      "project": "",
      "amount": 50000000,
      "openAwal": 100000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-006",
    "branch": "",
    "data": {
      "client": "PT PELAYARAN GLOBAL LINTAS",
      "project": "",
      "amount": 882081202.6199999,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-007",
    "branch": "",
    "data": {
      "client": "IBU LILI KANTIN",
      "project": "",
      "amount": 15000000,
      "openAwal": 15000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-008",
    "branch": "",
    "data": {
      "client": "NORIS",
      "project": "",
      "amount": 6000000,
      "openAwal": 7000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-009",
    "branch": "",
    "data": {
      "client": "SABRAN",
      "project": "",
      "amount": 2000000,
      "openAwal": 3000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-010",
    "branch": "",
    "data": {
      "client": "AHMAD JAYADI",
      "project": "",
      "amount": 8000000,
      "openAwal": 9000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-011",
    "branch": "",
    "data": {
      "client": "ADILLA",
      "project": "",
      "amount": 9000000,
      "openAwal": 9000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-012",
    "branch": "",
    "data": {
      "client": "BUDIANSYAH",
      "project": "",
      "amount": 10000000,
      "openAwal": 11000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-013",
    "branch": "",
    "data": {
      "client": "ASEP",
      "project": "",
      "amount": 500000,
      "openAwal": 1000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-014",
    "branch": "",
    "data": {
      "client": "DONY",
      "project": "",
      "amount": 500000,
      "openAwal": 1000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-015",
    "branch": "",
    "data": {
      "client": "TARMAN",
      "project": "",
      "amount": 2500000,
      "openAwal": 1000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-016",
    "branch": "",
    "data": {
      "client": "JESI",
      "project": "",
      "amount": 1000000,
      "openAwal": 1500000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-017",
    "branch": "",
    "data": {
      "client": "AGUS RIONO",
      "project": "",
      "amount": 1500000,
      "openAwal": 2000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-018",
    "branch": "",
    "data": {
      "client": "SUKARMAN",
      "project": "",
      "amount": 2000000,
      "openAwal": 3000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-019",
    "branch": "",
    "data": {
      "client": "PASHA",
      "project": "",
      "amount": 1500000,
      "openAwal": 2000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-020",
    "branch": "",
    "data": {
      "client": "SAFARUDIN",
      "project": "",
      "amount": 1500000,
      "openAwal": 2000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-021",
    "branch": "",
    "data": {
      "client": "ALUS",
      "project": "",
      "amount": 5000000,
      "openAwal": 1000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-022",
    "branch": "",
    "data": {
      "client": "HAIRUDIN",
      "project": "",
      "amount": 2000000,
      "openAwal": 2500000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-023",
    "branch": "",
    "data": {
      "client": "RAHMAD",
      "project": "",
      "amount": 2000000,
      "openAwal": 2500000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-024",
    "branch": "",
    "data": {
      "client": "SUPIAN AGUS",
      "project": "",
      "amount": 2000000,
      "openAwal": 4000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-025",
    "branch": "",
    "data": {
      "client": "AKBAR",
      "project": "",
      "amount": 1000000,
      "openAwal": 1500000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-026",
    "branch": "",
    "data": {
      "client": "IHSAN",
      "project": "",
      "amount": 2500000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-027",
    "branch": "",
    "data": {
      "client": "AULIA",
      "project": "",
      "amount": 3500000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-028",
    "branch": "",
    "data": {
      "client": "AGUSRIYANTO",
      "project": "",
      "amount": 3000000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-029",
    "branch": "",
    "data": {
      "client": "SUNARJI",
      "project": "",
      "amount": 3000000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-030",
    "branch": "",
    "data": {
      "client": "BUDI",
      "project": "",
      "amount": 2500000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-031",
    "branch": "",
    "data": {
      "client": "GORDON",
      "project": "",
      "amount": 750000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-032",
    "branch": "",
    "data": {
      "client": "ALI HUSNI",
      "project": "",
      "amount": 500000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-033",
    "branch": "",
    "data": {
      "client": "SUGIHARTO",
      "project": "",
      "amount": 5000000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-034",
    "branch": "",
    "data": {
      "client": "FENY",
      "project": "",
      "amount": 3500000,
      "openAwal": 0,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": true
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-035",
    "branch": "",
    "data": {
      "client": "PT BUNGA TERATAI",
      "project": "",
      "amount": 7322331403,
      "openAwal": 7322331403,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-036",
    "branch": "",
    "data": {
      "client": "PT Teratai Sejahtera Line.",
      "project": "",
      "amount": 135000000,
      "openAwal": 135000000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV/OPEN-2026-037",
    "branch": "",
    "data": {
      "client": "PT Saha Agropalm Mandiri",
      "project": "",
      "amount": 812692000,
      "openAwal": 841370000,
      "due": "2026-08-31",
      "status": "Belum Dibayar",
      "paymentTerm": "Saldo Awal Agu-2026",
      "billingType": "Saldo Awal",
      "dunning": "Belum Ditagih",
      "nonPpn": false
    }
  },
  {
    "table": "invoices",
    "id": "INV-SB-2026-058",
    "branch": "",
    "data": {
      "client": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "project": "RP-2026-006",
      "noInv": "058/INV-SB/SMD/IX/2026",
      "vessel": "BG RMN 3324",
      "jasaTotal": 808550650,
      "matTotal": 711613605,
      "amount": 1520164255,
      "dpp": 1393483901,
      "ppnAmt": 167218068,
      "pphAmt": 16171013,
      "dpApplied": 0,
      "grandTotal": 1671211310,
      "skdt": false,
      "ppnRate": 12,
      "pphRate": 2,
      "due": "2026-09-30",
      "status": "Belum Dibayar",
      "paymentTerm": "NET 30",
      "billingType": "Milestone",
      "milestoneRef": "Pelunasan Docking & Repair BG RMN 3324",
      "dunning": "Ditagih",
      "nonPpn": false,
      "date": "2026-09-01"
    }
  },
  {
    "table": "invoices",
    "id": "INV-SB-2026-049",
    "branch": "",
    "data": {
      "client": "PT PELAYARAN ROYLEA MARINE LINE",
      "project": "RP-2026-007",
      "noInv": "049/INV-SB/SMD/VII/2026",
      "vessel": "AWB SEA HAVEN 2",
      "jasaTotal": 1501469657,
      "matTotal": 1357158023,
      "amount": 2858627680,
      "dpp": 2620408707,
      "ppnAmt": 314449045,
      "pphAmt": 30029393,
      "dpApplied": 1098000000,
      "dpRef": "045/INV-SB/SMD/VI/2026",
      "grandTotal": 2045047332,
      "skdt": false,
      "ppnRate": 12,
      "pphRate": 2,
      "due": "2026-08-13",
      "status": "Belum Dibayar",
      "paymentTerm": "NET 30",
      "billingType": "Milestone",
      "milestoneRef": "Pelunasan V2 (potong DP-1)",
      "dunning": "Ditagih",
      "nonPpn": false,
      "date": "2026-07-13"
    }
  },
  {
    "table": "invoices",
    "id": "INV-SB-2026-037",
    "branch": "",
    "data": {
      "client": "PT ALVI CIPTA SENTOSA",
      "project": "RP-2026-008",
      "noInv": "037/INV-SB/SMD/V/2026",
      "vessel": "BG MHKL 35",
      "jasaTotal": 184349645,
      "matTotal": 543356806,
      "amount": 727706451,
      "dpp": 727706451,
      "ppnAmt": 0,
      "pphAmt": 3686993,
      "dpApplied": 0,
      "grandTotal": 724019458,
      "skdt": true,
      "ppnRate": 12,
      "pphRate": 2,
      "due": "2026-06-08",
      "status": "Belum Dibayar",
      "paymentTerm": "NET 30",
      "billingType": "Milestone",
      "milestoneRef": "Pelunasan BG MHKL 35 (SKDT, tanpa PPN)",
      "dunning": "Ditagih",
      "nonPpn": false,
      "date": "2026-05-08"
    }
  },
  {
    "table": "invoices",
    "id": "INV-SB-2026-045",
    "branch": "",
    "data": {
      "client": "PT PELAYARAN ROYLEA MARINE LINE",
      "project": "RP-2026-007",
      "noInv": "045/INV-SB/SMD/VI/2026",
      "vessel": "AWB SEA HAVEN 2",
      "jasaTotal": 600000000,
      "matTotal": 400000000,
      "amount": 1000000000,
      "dpp": 916666667,
      "ppnAmt": 110000000,
      "pphAmt": 12000000,
      "dpApplied": 0,
      "grandTotal": 1098000000,
      "skdt": false,
      "ppnRate": 12,
      "pphRate": 2,
      "due": "2026-07-25",
      "status": "Lunas",
      "paymentTerm": "NET 30",
      "billingType": "Uang Muka",
      "milestoneRef": "DP-1 AWB SEA HAVEN 2",
      "dunning": "Ditagih",
      "nonPpn": false,
      "date": "2026-06-25",
      "paidAt": "2026-07-10"
    }
  },
  {
    "table": "documents",
    "id": "DOC-001",
    "branch": "",
    "data": {
      "title": "Kontrak NB-2025-012 — TB Samudra Jaya 07",
      "type": "Kontrak",
      "project": "NB-2025-012",
      "vessel": "TB Samudra Jaya 07",
      "version": "v3.0",
      "status": "Berlaku",
      "updated": "2026-07-28",
      "owner": "Andi Darman"
    }
  },
  {
    "table": "documents",
    "id": "DOC-002",
    "branch": "",
    "data": {
      "title": "General Arrangement Drawing",
      "type": "Drawing",
      "project": "NB-2025-012",
      "vessel": "TB Samudra Jaya 07",
      "version": "Rev C",
      "status": "Disetujui",
      "updated": "2026-07-20",
      "owner": "Hendra Wijaya"
    }
  },
  {
    "table": "documents",
    "id": "DOC-003",
    "branch": "",
    "data": {
      "title": "ITP-012 Welding Procedure",
      "type": "Prosedur",
      "project": "NB-2025-012",
      "vessel": "TB Samudra Jaya 07",
      "version": "v1.2",
      "status": "Berlaku",
      "updated": "2026-07-15",
      "owner": "Sari Wulandari"
    }
  },
  {
    "table": "documents",
    "id": "DOC-004",
    "branch": "",
    "data": {
      "title": "Certificate of Class — TB Karya Bahari 12",
      "type": "Sertifikat",
      "project": "RP-2026-003",
      "vessel": "TB Karya Bahari 12",
      "version": "2023",
      "status": "Kedaluwarsa",
      "updated": "2023-08-15",
      "owner": "Sari Wulandari"
    }
  },
  {
    "table": "documents",
    "id": "DOC-005",
    "branch": "",
    "data": {
      "title": "Docking Report RP-2026-003",
      "type": "Laporan",
      "project": "RP-2026-003",
      "vessel": "TB Karya Bahari 12",
      "version": "v1.0",
      "status": "Draft",
      "updated": "2026-08-01",
      "owner": "Rudi Hartono"
    }
  },
  {
    "table": "documents",
    "id": "DOC-006",
    "branch": "",
    "data": {
      "title": "Kontrak NB-2025-014 — TB Nusantara 22",
      "type": "Kontrak",
      "project": "NB-2025-014",
      "vessel": "TB Nusantara 22",
      "version": "v2.0",
      "status": "Berlaku",
      "updated": "2026-06-30",
      "owner": "Andi Darman"
    }
  },
  {
    "table": "documents",
    "id": "DOC-007",
    "branch": "",
    "data": {
      "title": "Sea Trial Procedure NB-2025-012",
      "type": "Prosedur",
      "project": "NB-2025-012",
      "vessel": "TB Samudra Jaya 07",
      "version": "v1.0",
      "status": "Diajukan",
      "updated": "2026-08-02",
      "owner": "Ir. Hendra Wijaya"
    }
  },
  {
    "table": "documents",
    "id": "DOC-008",
    "branch": "",
    "data": {
      "title": "Invoice INV/OPEN-2026-035 (Saldo Awal Piutang)",
      "type": "Invoice",
      "project": "-",
      "vessel": "-",
      "version": "v1.0",
      "status": "Berlaku",
      "updated": "2026-08-31",
      "owner": "Dewi Lestari"
    }
  },
  {
    "table": "documents",
    "id": "DOC-009",
    "branch": "",
    "data": {
      "title": "NCR-2026-031 Corrective Action",
      "type": "NCR",
      "project": "NB-2025-012",
      "vessel": "TB Samudra Jaya 07",
      "version": "v1.1",
      "status": "Diajukan",
      "updated": "2026-07-25",
      "owner": "Sari Wulandari"
    }
  },
  {
    "table": "documents",
    "id": "DOC-010",
    "branch": "",
    "data": {
      "title": "Stability Booklet — TB Nusantara 22",
      "type": "Drawing",
      "project": "NB-2025-014",
      "vessel": "TB Nusantara 22",
      "version": "Rev A",
      "status": "Disetujui",
      "updated": "2026-07-10",
      "owner": "Hendra Wijaya"
    }
  },
  {
    "table": "documents",
    "id": "DOC-011",
    "branch": "",
    "data": {
      "title": "HSE Plan 2026",
      "type": "Prosedur",
      "project": "-",
      "vessel": "-",
      "version": "v4.0",
      "status": "Berlaku",
      "updated": "2026-01-05",
      "owner": "Sari Wulandari"
    }
  },
  {
    "table": "documents",
    "id": "DOC-012",
    "branch": "",
    "data": {
      "title": "Quotation QT-2026-052",
      "type": "Penawaran",
      "project": "-",
      "vessel": "TB Baru RJ-03",
      "version": "v2.0",
      "status": "Berlaku",
      "updated": "2026-07-20",
      "owner": "Ir. Hendra Wijaya"
    }
  },
  {
    "table": "documents",
    "id": "DS-SB-2026-001",
    "branch": "",
    "data": {
      "title": "Dock Space — BG RMN 3324",
      "type": "Dock Space",
      "project": "RP-2026-006",
      "vessel": "BG RMN 3324",
      "version": "v1.0",
      "status": "Berlaku",
      "updated": "2026-08-10",
      "owner": "Rudi Hartono",
      "sbRef": "000/DS-SB/SMD/VIII/2026"
    }
  },
  {
    "table": "documents",
    "id": "SJ-SMD-2026-001",
    "branch": "",
    "data": {
      "title": "Surat Jalan — Material BG RMN 3324",
      "type": "Surat Jalan",
      "project": "RP-2026-006",
      "vessel": "BG RMN 3324",
      "version": "v1.0",
      "status": "Berlaku",
      "updated": "2026-08-15",
      "owner": "Santi",
      "sbRef": "001/SJ-SMD/SMD/VIII/2026"
    }
  },
  {
    "table": "documents",
    "id": "TT-SMD-2026-001",
    "branch": "",
    "data": {
      "title": "Tanda Terima — BG RMN 3324",
      "type": "Tanda Terima",
      "project": "RP-2026-006",
      "vessel": "BG RMN 3324",
      "version": "v1.0",
      "status": "Berlaku",
      "updated": "2026-08-15",
      "owner": "Santi",
      "sbRef": "001/TT-SMD/SMD/VIII/2026"
    }
  },
  {
    "table": "branches",
    "id": "BR-01",
    "branch": "",
    "data": {
      "name": "Samarinda — Kantor Pusat",
      "city": "Samarinda",
      "isHQ": true
    }
  },
  {
    "table": "branches",
    "id": "BR-02",
    "branch": "",
    "data": {
      "name": "Balikpapan — Galangan",
      "city": "Balikpapan",
      "isHQ": false
    }
  },
  {
    "table": "branches",
    "id": "BR-03",
    "branch": "",
    "data": {
      "name": "Banjarmasin — Workshop",
      "city": "Banjarmasin",
      "isHQ": false
    }
  },
  {
    "table": "attendance",
    "id": "ABS-20260801-001",
    "branch": "",
    "data": {
      "employeeId": "EMP-002",
      "date": "2026-08-01",
      "shift": "Pagi",
      "status": "Hadir",
      "checkIn": "07:55",
      "checkOut": "17:05",
      "overtime": 1,
      "otStatus": "Disetujui"
    }
  },
  {
    "table": "attendance",
    "id": "ABS-20260801-002",
    "branch": "",
    "data": {
      "employeeId": "EMP-004",
      "date": "2026-08-01",
      "shift": "Pagi",
      "status": "Hadir",
      "checkIn": "08:02",
      "checkOut": "17:00",
      "overtime": 0
    }
  },
  {
    "table": "attendance",
    "id": "ABS-20260801-003",
    "branch": "",
    "data": {
      "employeeId": "EMP-005",
      "date": "2026-08-01",
      "shift": "Siang",
      "status": "Sakit",
      "checkIn": "",
      "checkOut": "",
      "overtime": 0
    }
  },
  {
    "table": "attendance",
    "id": "ABS-20260802-001",
    "branch": "",
    "data": {
      "employeeId": "EMP-002",
      "date": "2026-08-02",
      "shift": "Pagi",
      "status": "Hadir",
      "checkIn": "07:50",
      "checkOut": "19:30",
      "overtime": 2.5
    }
  },
  {
    "table": "attendance",
    "id": "ABS-20260802-002",
    "branch": "",
    "data": {
      "employeeId": "EMP-006",
      "date": "2026-08-02",
      "shift": "Pagi",
      "status": "Izin",
      "checkIn": "",
      "checkOut": "",
      "overtime": 0
    }
  },
  {
    "table": "payroll",
    "id": "PAY-202607-002",
    "branch": "",
    "data": {
      "employeeId": "EMP-002",
      "period": "2026-07",
      "basic": 18000000,
      "allowances": 4500000,
      "overtimePay": 1200000,
      "deductions": 500000,
      "pph21": 1875000,
      "bpjsKes": 540000,
      "bpjsTk": 666000,
      "net": 19569000,
      "status": "Dibayar",
      "paidAt": "2026-07-31"
    }
  },
  {
    "table": "payroll",
    "id": "PAY-202607-004",
    "branch": "",
    "data": {
      "employeeId": "EMP-004",
      "period": "2026-07",
      "basic": 12000000,
      "allowances": 3000000,
      "overtimePay": 800000,
      "deductions": 200000,
      "pph21": 950000,
      "bpjsKes": 360000,
      "bpjsTk": 444000,
      "net": 13846000,
      "status": "Dibayar",
      "paidAt": "2026-07-31"
    }
  },
  {
    "table": "payroll",
    "id": "PAY-202608-002",
    "branch": "",
    "data": {
      "employeeId": "EMP-002",
      "period": "2026-08",
      "basic": 18000000,
      "allowances": 4500000,
      "overtimePay": 0,
      "deductions": 0,
      "pph21": 0,
      "bpjsKes": 0,
      "bpjsTk": 0,
      "net": 0,
      "status": "Draft",
      "paidAt": ""
    }
  },
  {
    "table": "taxPeriods",
    "id": "TAX-202607",
    "branch": "",
    "data": {
      "period": "2026-07",
      "ppnKeluar": 1056000000,
      "ppnMasuk": 452000000,
      "pph23": 124000000,
      "pph21": 38500000,
      "status": "Lapor"
    }
  },
  {
    "table": "taxPeriods",
    "id": "TAX-202608",
    "branch": "",
    "data": {
      "period": "2026-08",
      "ppnKeluar": 455632169.08,
      "ppnMasuk": 73753513.46,
      "pph23": 11737820,
      "pph21": 0,
      "status": "Lapor",
      "reportedAt": "2026-08-31"
    }
  },
  {
    "table": "rfqs",
    "id": "RFQ-2026-031",
    "branch": "",
    "data": {
      "prId": "PR-2026-207",
      "item": "Cat Epoxy",
      "vendors": [
        "PT Jotun Indonesia",
        "PT Bahana Baja",
        "PT Steel Rig"
      ],
      "quotes": [
        {
          "vendor": "PT Jotun Indonesia",
          "price": 480000000,
          "eta": "2026-08-12"
        },
        {
          "vendor": "PT Bahana Baja",
          "price": 495000000,
          "eta": "2026-08-10"
        }
      ],
      "status": "Evaluasi",
      "winner": ""
    }
  },
  {
    "table": "rfqs",
    "id": "RFQ-2026-032",
    "branch": "",
    "data": {
      "prId": "PR-2026-209",
      "item": "Wire Rope",
      "vendors": [
        "PT Steel Rig",
        "PT Primabaja",
        "PT Bahana Baja"
      ],
      "quotes": [],
      "status": "Terkirim",
      "winner": ""
    }
  },
  {
    "table": "changeOrders",
    "id": "CO-2026-011",
    "branch": "",
    "data": {
      "project": "NB-2025-012",
      "title": "Tambah Fi-Fi system deck",
      "impact": 1850000000,
      "status": "Diajukan",
      "requestedBy": "Budi Santoso",
      "date": "2026-07-28"
    }
  },
  {
    "table": "changeOrders",
    "id": "CO-2026-010",
    "branch": "",
    "data": {
      "project": "RP-2026-003",
      "title": "Ganti scope propeller polishing",
      "impact": -120000000,
      "status": "Disetujui",
      "requestedBy": "Rudi Hartono",
      "date": "2026-07-15"
    }
  },
  {
    "table": "risks",
    "id": "RSK-001",
    "branch": "",
    "data": {
      "project": "NB-2025-012",
      "title": "Keterlambatan baja AH36",
      "likelihood": "Sedang",
      "impact": "Tinggi",
      "mitigation": "Dual vendor + buffer 2 minggu",
      "status": "Dipantau"
    }
  },
  {
    "table": "risks",
    "id": "RSK-002",
    "branch": "",
    "data": {
      "project": "RP-2026-005",
      "title": "Overrun overhaul bearing",
      "likelihood": "Tinggi",
      "impact": "Sedang",
      "mitigation": "Inspeksi toleransi per shift",
      "status": "Aktif"
    }
  },
  {
    "table": "leaves",
    "id": "CUT-2026-018",
    "branch": "",
    "data": {
      "employeeId": "EMP-006",
      "type": "Tahunan",
      "from": "2026-08-10",
      "to": "2026-08-12",
      "days": 3,
      "status": "Disetujui",
      "note": "Keperluan keluarga"
    }
  },
  {
    "table": "leaves",
    "id": "CUT-2026-019",
    "branch": "",
    "data": {
      "employeeId": "EMP-005",
      "type": "Sakit",
      "from": "2026-08-01",
      "to": "2026-08-01",
      "days": 1,
      "status": "Diajukan",
      "note": "Surat dokter terlampir"
    }
  },
  {
    "table": "trainings",
    "id": "TRN-2026-006",
    "branch": "",
    "data": {
      "title": "Welding Inspector Refresh",
      "date": "2026-09-05",
      "participants": [
        "EMP-002",
        "EMP-006"
      ],
      "provider": "B4T",
      "status": "Terjadwal"
    }
  },
  {
    "table": "trainings",
    "id": "TRN-2026-005",
    "branch": "",
    "data": {
      "title": "Basic Safety & Fire Fighting",
      "date": "2026-07-12",
      "participants": [
        "EMP-004",
        "EMP-005"
      ],
      "provider": "Internal HSE",
      "status": "Selesai"
    }
  },
  {
    "table": "timesheets",
    "id": "TS-20260801-01",
    "branch": "",
    "data": {
      "woId": "WO-2026-041",
      "employeeId": "EMP-005",
      "date": "2026-08-01",
      "hours": 8,
      "note": "Fabrikasi section 5",
      "status": "Disetujui",
      "rate": 125000
    }
  },
  {
    "table": "timesheets",
    "id": "TS-20260801-02",
    "branch": "",
    "data": {
      "woId": "WO-2026-043",
      "employeeId": "EMP-004",
      "date": "2026-08-01",
      "hours": 6,
      "note": "Overhaul cylinder 3",
      "status": "Disetujui",
      "rate": 150000
    }
  },
  {
    "table": "drawings",
    "id": "DRW-GA-012-C",
    "branch": "",
    "data": {
      "project": "NB-2025-012",
      "title": "General Arrangement",
      "revision": "C",
      "status": "Disetujui",
      "updated": "2026-07-20",
      "holder": "Hendra Wijaya"
    }
  },
  {
    "table": "drawings",
    "id": "DRW-ST-004-B",
    "branch": "",
    "data": {
      "project": "NB-2025-012",
      "title": "Structural Section 4-7",
      "revision": "B",
      "status": "Diajukan",
      "updated": "2026-08-01",
      "holder": "Budi Santoso"
    }
  },
  {
    "table": "toolbox",
    "id": "TBM-20260801",
    "branch": "",
    "data": {
      "project": "NB-2025-012",
      "topic": "Lifting & rigging aman",
      "date": "2026-08-01",
      "attendees": 24,
      "pic": "Agus Setiawan"
    }
  },
  {
    "table": "toolbox",
    "id": "TBM-20260802",
    "branch": "",
    "data": {
      "project": "RP-2026-003",
      "topic": "Confined space entry",
      "date": "2026-08-02",
      "attendees": 18,
      "pic": "Rudi Hartono"
    }
  },
  {
    "table": "calibrations",
    "id": "CAL-2026-021",
    "branch": "",
    "data": {
      "equipmentId": "EQ-003",
      "item": "Mesin Las MIG",
      "due": "2026-08-20",
      "status": "Terjadwal",
      "cert": ""
    }
  },
  {
    "table": "calibrations",
    "id": "CAL-2026-020",
    "branch": "",
    "data": {
      "equipmentId": "EQ-002",
      "item": "Load cell Mobile Crane",
      "due": "2026-08-05",
      "status": "Selesai",
      "cert": "CAL-0501"
    }
  },
  {
    "table": "communications",
    "id": "COM-2026-101",
    "branch": "",
    "data": {
      "quotationId": "QT-2026-052",
      "channel": "Email",
      "date": "2026-07-22",
      "summary": "Kirim revisi v2 + negosiasi termin",
      "by": "Hendra Wijaya"
    }
  },
  {
    "table": "communications",
    "id": "COM-2026-102",
    "branch": "",
    "data": {
      "quotationId": "QT-2026-053",
      "channel": "Meeting",
      "date": "2026-07-25",
      "summary": "Presentasi teknis, minta penawaran final",
      "by": "Budi Santoso"
    }
  },
  {
    "table": "communications",
    "id": "COM-SB-001",
    "branch": "",
    "data": {
      "quotationId": "QT-SB-001",
      "channel": "Email",
      "date": "2026-07-28",
      "summary": "Penawaran disetujui → kontrak KTR-SB-001",
      "by": "Hendra Wijaya"
    }
  },
  {
    "table": "contracts",
    "id": "KTR-2026-009",
    "branch": "",
    "data": {
      "quotationId": "QT-2026-054",
      "projectId": "RP-2026-002",
      "client": "PT Mitra Samudra Raya",
      "value": 3100000000,
      "signedAt": "2026-07-12",
      "status": "Aktif"
    }
  },
  {
    "table": "contracts",
    "id": "KTR-SB-001",
    "branch": "",
    "data": {
      "quotationId": "QT-SB-001",
      "projectId": "RP-2026-006",
      "client": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "value": 1671211310,
      "signedAt": "2026-08-01",
      "status": "Aktif"
    }
  },
  {
    "table": "bast",
    "id": "BAST-SMD-2026-001",
    "branch": "",
    "data": {
      "projectId": "NB-2025-012",
      "milestone": "Hull Assembly — BG RMN 3324",
      "tanggal": "2026-08-02",
      "penandatangan": "Hendra Wijaya / Owner BG RMN 3324",
      "lampiran": "Checklist hull + foto section 4-7",
      "amount": 540000000,
      "status": "Disetujui"
    }
  },
  {
    "table": "bast",
    "id": "BAST-SMD-2026-002",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "milestone": "Docking Completion — V2 AWB SEA HAVEN 2",
      "tanggal": "2026-08-04",
      "penandatangan": "Rudi Hartono / Master V2 AWB SEA HAVEN 2",
      "lampiran": "Docking report + thickness report",
      "amount": 102000000,
      "status": "Diajukan"
    }
  },
  {
    "table": "bast",
    "id": "BAST-SMD-2026-003",
    "branch": "",
    "data": {
      "projectId": "RP-2026-006",
      "milestone": "Docking & Repair BG RMN 3324",
      "tanggal": "2026-09-01",
      "penandatangan": "Rudi Hartono / Owner BG RMN 3324",
      "lampiran": "Docking report + invoice 058/INV-SB/SMD/IX/2026",
      "amount": 1671211310,
      "status": "Diajukan"
    }
  },
  {
    "table": "trials",
    "id": "TRIAL-001",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "parameter": "Speed & bollard pull trial",
      "tanggal": "2026-08-20",
      "hasil": "Lulus",
      "punchList": [],
      "baRef": "BAST-SMD-2026-002"
    }
  },
  {
    "table": "requests",
    "id": "REQ-2026-001",
    "branch": "",
    "data": {
      "vessel": "TB Karya Bahari 12",
      "client": "PT Karya Bahari Sejahtera",
      "kind": "Repair Request",
      "scope": "Overhaul main engine + coating lambung",
      "value": 4200000000,
      "status": "Baru",
      "date": "2026-08-01"
    }
  },
  {
    "table": "requests",
    "id": "REQ-SB-001",
    "branch": "",
    "data": {
      "vessel": "AWB SEA HAVEN 2",
      "client": "PT PELAYARAN ROYLEA MARINE LINE",
      "kind": "Repair Request",
      "scope": "Docking + repair (DP-1 → pelunasan V2)",
      "value": 3143047332,
      "status": "Disetujui",
      "date": "2026-06-20"
    }
  },
  {
    "table": "requests",
    "id": "REQ-SB-002",
    "branch": "",
    "data": {
      "vessel": "BG RMN 3324",
      "client": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "kind": "Repair Request",
      "scope": "Docking/Undocking & Repair BG RMN 3324",
      "value": 1671211310,
      "status": "Disetujui",
      "date": "2026-07-20"
    }
  },
  {
    "table": "clientPos",
    "id": "CPO-SB-001",
    "branch": "",
    "data": {
      "contractId": "KTR-SB-001",
      "projectId": "RP-2026-006",
      "no": "PO-KTR-001/SB/VIII/2026",
      "amount": 1671211310,
      "date": "2026-08-01"
    }
  },
  {
    "table": "projects",
    "id": "NB-2025-012",
    "branch": "Samarinda",
    "data": {
      "vessel": "TB Samudra Jaya 07",
      "type": "New Build",
      "client": "PT Samudra Jaya Perkasa",
      "status": "Sedang Berjalan",
      "start": "2025-11-10",
      "end": "2026-09-30",
      "progress": 62,
      "budget": 48000000000,
      "actual": 29600000000,
      "manager": "Ir. Hendra Wijaya",
      "scope": [
        "Desain",
        "Fabrikasi Baja",
        "Hull Assembly",
        "Mesin & Kelistrikan",
        "Pengecatan",
        "Sea Trial"
      ],
      "designStages": [
        {
          "name": "Basic Design",
          "status": "Disetujui",
          "society": "BKI",
          "date": "2025-12-10",
          "doc": "BD-012 Rev C"
        },
        {
          "name": "Detail Design",
          "status": "Disetujui",
          "society": "BKI",
          "date": "2026-02-18",
          "doc": "DD-012 Rev B"
        },
        {
          "name": "Class Approval",
          "status": "Disetujui",
          "society": "BKI",
          "date": "2026-03-25",
          "doc": "BKI-APPR-012/26"
        },
        {
          "name": "Production Drawing",
          "status": "Diajukan",
          "society": "BKI",
          "date": "2026-04-02",
          "doc": "PD-012 Rev A"
        }
      ]
    }
  },
  {
    "table": "projects",
    "id": "NB-2025-014",
    "branch": "Samarinda",
    "data": {
      "vessel": "TB Nusantara 22",
      "type": "New Build",
      "client": "PT Pelayaran Nusantara Abadi",
      "status": "Sedang Berjalan",
      "start": "2026-01-15",
      "end": "2026-12-20",
      "progress": 41,
      "budget": 46500000000,
      "actual": 19800000000,
      "manager": "Budi Santoso",
      "scope": [
        "Desain",
        "Fabrikasi Baja",
        "Hull Assembly",
        "Mesin & Kelistrikan"
      ]
    }
  },
  {
    "table": "projects",
    "id": "RP-2026-003",
    "branch": "Samarinda",
    "data": {
      "vessel": "TB Karya Bahari 12",
      "type": "Repair",
      "client": "PT Karya Bahari Sejahtera",
      "status": "Dalam Proses",
      "start": "2026-07-01",
      "end": "2026-08-05",
      "progress": 78,
      "budget": 4200000000,
      "actual": 3310000000,
      "manager": "Rudi Hartono",
      "scope": [
        "Survey Docking",
        "Pengecatan Lambung",
        "Perbaikan Poros",
        "Sea Valve",
        "Propeller"
      ]
    }
  },
  {
    "table": "projects",
    "id": "RP-2026-005",
    "branch": "Samarinda",
    "data": {
      "vessel": "TB Samudra Jaya 04",
      "type": "Repair",
      "client": "PT Samudra Jaya Perkasa",
      "status": "Terlambat",
      "start": "2026-06-20",
      "end": "2026-07-25",
      "progress": 55,
      "budget": 3800000000,
      "actual": 2400000000,
      "manager": "Agus Setiawan",
      "scope": [
        "Overhaul Mesin",
        "Kelistrikan",
        "Pengecatan"
      ]
    }
  },
  {
    "table": "projects",
    "id": "RF-2026-001",
    "branch": "Samarinda",
    "data": {
      "vessel": "TB Karya Bahari 15",
      "type": "Retrofit",
      "client": "PT Karya Bahari Sejahtera",
      "status": "Sedang Berjalan",
      "start": "2026-05-01",
      "end": "2026-08-30",
      "progress": 84,
      "budget": 9800000000,
      "actual": 8420000000,
      "manager": "Ir. Hendra Wijaya",
      "scope": [
        "Sistem Navigasi",
        "Mesin AUX",
        "Sistem Pendingin",
        "Kelistrikan"
      ]
    }
  },
  {
    "table": "projects",
    "id": "NB-2026-001",
    "branch": "Samarinda",
    "data": {
      "vessel": "TB Laut Timur 01",
      "type": "New Build",
      "client": "PT Laut Timur Mandiri",
      "status": "Tertunda",
      "start": "2026-02-01",
      "end": "2027-01-15",
      "progress": 23,
      "budget": 45000000000,
      "actual": 10800000000,
      "manager": "Budi Santoso",
      "scope": [
        "Desain",
        "Fabrikasi Baja"
      ]
    }
  },
  {
    "table": "projects",
    "id": "RP-2026-002",
    "branch": "Samarinda",
    "data": {
      "vessel": "TB Mitra Raya 09",
      "type": "Repair",
      "client": "PT Mitra Samudra Raya",
      "status": "Selesai",
      "start": "2026-06-01",
      "end": "2026-06-28",
      "progress": 100,
      "budget": 3600000000,
      "actual": 3490000000,
      "manager": "Rudi Hartono",
      "scope": [
        "Docking",
        "Pengecatan",
        "Rudder"
      ]
    }
  },
  {
    "table": "projects",
    "id": "RP-2026-006",
    "branch": "Samarinda",
    "data": {
      "vessel": "BG RMN 3324",
      "type": "Repair",
      "client": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "status": "Dalam Proses",
      "start": "2026-08-01",
      "end": "2026-09-15",
      "progress": 90,
      "budget": 2000000000,
      "actual": 1650000000,
      "manager": "Rudi Hartono",
      "scope": [
        "Docking",
        "Outfitting Deck",
        "Painting"
      ]
    }
  },
  {
    "table": "projects",
    "id": "RP-2026-007",
    "branch": "Samarinda",
    "data": {
      "vessel": "AWB SEA HAVEN 2",
      "type": "Repair",
      "client": "PT PELAYARAN ROYLEA MARINE LINE",
      "status": "Dalam Proses",
      "start": "2026-06-15",
      "end": "2026-08-15",
      "progress": 95,
      "budget": 3400000000,
      "actual": 3100000000,
      "manager": "Budi Santoso",
      "scope": [
        "Docking",
        "Repair",
        "DP-1 → Pelunasan V2"
      ]
    }
  },
  {
    "table": "projects",
    "id": "RP-2026-008",
    "branch": "Samarinda",
    "data": {
      "vessel": "BG MHKL 35",
      "type": "Repair",
      "client": "PT ALVI CIPTA SENTOSA",
      "status": "Selesai",
      "start": "2026-04-10",
      "end": "2026-05-08",
      "progress": 100,
      "budget": 900000000,
      "actual": 724019458,
      "manager": "Rudi Hartono",
      "scope": [
        "Docking",
        "Repair (SKDT)"
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-001",
    "branch": "",
    "data": {
      "name": "TB Samudra Jaya 07",
      "imo": "IMO 9912345",
      "type": "Tugboat ASD 2x1600 HP",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2026,
      "owner": "PT Samudra Jaya Perkasa",
      "loa": 31.5,
      "beam": 9.8,
      "draft": 4.2,
      "bollard": 45,
      "status": "Dalam Pembangunan",
      "certificates": [
        {
          "name": "Certificate of Class",
          "issued": "2026-09",
          "expires": "2031-09",
          "tone": "green"
        },
        {
          "name": "BWTS Compliance",
          "issued": "2026-09",
          "expires": "2029-09",
          "tone": "green"
        },
        {
          "name": "Radio License",
          "issued": "2026-09",
          "expires": "2027-09",
          "tone": "amber"
        }
      ],
      "history": [
        {
          "date": "2025-11-10",
          "event": "Keel laying & kontrak",
          "type": "Kontrak"
        },
        {
          "date": "2026-03-15",
          "event": "Hull assembly selesai",
          "type": "Produksi"
        },
        {
          "date": "2026-09-30",
          "event": "Sea trial terjadwal",
          "type": "Uji"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-002",
    "branch": "",
    "data": {
      "name": "TB Karya Bahari 12",
      "imo": "IMO 9811123",
      "type": "Tugboat ASD 2x1200 HP",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2019,
      "owner": "PT Karya Bahari Sejahtera",
      "loa": 29.4,
      "beam": 9.2,
      "draft": 4,
      "bollard": 38,
      "status": "Dalam Docking",
      "certificates": [
        {
          "name": "Certificate of Class",
          "issued": "2023-08",
          "expires": "2026-08",
          "tone": "red"
        },
        {
          "name": "SOPEP",
          "issued": "2024-02",
          "expires": "2027-02",
          "tone": "amber"
        }
      ],
      "history": [
        {
          "date": "2019-06-01",
          "event": "Delivered",
          "type": "Delivery"
        },
        {
          "date": "2023-08-15",
          "event": "Special survey",
          "type": "Survey"
        },
        {
          "date": "2026-07-01",
          "event": "Drydocking & repair",
          "type": "Docking"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-003",
    "branch": "",
    "data": {
      "name": "TB Nusantara 22",
      "imo": "IMO 9923456",
      "type": "Tugboat ASD 2x1800 HP",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2026,
      "owner": "PT Pelayaran Nusantara Abadi",
      "loa": 32,
      "beam": 10.1,
      "draft": 4.4,
      "bollard": 52,
      "status": "Dalam Pembangunan",
      "certificates": [],
      "history": [
        {
          "date": "2026-01-15",
          "event": "Kontrak & desain",
          "type": "Kontrak"
        },
        {
          "date": "2026-06-20",
          "event": "Keel laying",
          "type": "Produksi"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-SB-001",
    "branch": "",
    "data": {
      "name": "BG RMN 3324",
      "imo": "-",
      "type": "Barge 28.5x8x3.8M",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2018,
      "owner": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "loa": 28.5,
      "beam": 8,
      "draft": 3.8,
      "bollard": 0,
      "status": "Dalam Docking",
      "certificates": [],
      "history": [
        {
          "date": "2026-08-01",
          "event": "Docking & repair di SB",
          "type": "Docking"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-SB-002",
    "branch": "",
    "data": {
      "name": "AWB SEA HAVEN 2",
      "imo": "-",
      "type": "AWB",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2020,
      "owner": "PT PELAYARAN ROYLEA MARINE LINE",
      "loa": 30,
      "beam": 9,
      "draft": 4,
      "bollard": 0,
      "status": "Dalam Docking",
      "certificates": [],
      "history": [
        {
          "date": "2026-06-15",
          "event": "Docking & repair di SB (DP-1)",
          "type": "Docking"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-SB-003",
    "branch": "",
    "data": {
      "name": "BG MHKL 35",
      "imo": "-",
      "type": "Barge",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2019,
      "owner": "PT ALVI CIPTA SENTOSA",
      "loa": 27,
      "beam": 8,
      "draft": 3.5,
      "bollard": 0,
      "status": "Dalam Operasi",
      "certificates": [],
      "history": [
        {
          "date": "2026-05-08",
          "event": "Pelunasan SKDT",
          "type": "Delivery"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-004",
    "branch": "",
    "data": {
      "name": "TB Samudra Jaya 04",
      "imo": "IMO 9934567",
      "type": "Tugboat ASD 2x1400 HP",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2021,
      "owner": "PT Samudra Jaya Perkasa",
      "loa": 30.2,
      "beam": 9.5,
      "draft": 4.1,
      "bollard": 42,
      "status": "Dalam Docking",
      "certificates": [],
      "history": [
        {
          "date": "2026-06-20",
          "event": "Masuk program repair RP-2026-005",
          "type": "Docking"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-005",
    "branch": "",
    "data": {
      "name": "TB Karya Bahari 15",
      "imo": "IMO 9945678",
      "type": "Tugboat ASD 2x1500 HP",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2022,
      "owner": "PT Karya Bahari Sejahtera",
      "loa": 30.8,
      "beam": 9.6,
      "draft": 4.2,
      "bollard": 44,
      "status": "Dalam Operasi",
      "certificates": [],
      "history": [
        {
          "date": "2026-05-01",
          "event": "Mulai retrofit RF-2026-001",
          "type": "Kontrak"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-006",
    "branch": "",
    "data": {
      "name": "TB Laut Timur 01",
      "imo": "IMO 9956789",
      "type": "Tugboat ASD 2x1600 HP",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2026,
      "owner": "PT Laut Timur Mandiri",
      "loa": 31,
      "beam": 9.8,
      "draft": 4.2,
      "bollard": 46,
      "status": "Dalam Pembangunan",
      "certificates": [],
      "history": [
        {
          "date": "2026-02-01",
          "event": "Keel laying NB-2026-001",
          "type": "Produksi"
        }
      ]
    }
  },
  {
    "table": "vessels",
    "id": "V-007",
    "branch": "",
    "data": {
      "name": "TB Mitra Raya 09",
      "imo": "IMO 9967890",
      "type": "Tugboat ASD 2x1300 HP",
      "class": "BKI",
      "flag": "Indonesia",
      "built": 2020,
      "owner": "PT Mitra Samudra Raya",
      "loa": 29.8,
      "beam": 9.4,
      "draft": 4,
      "bollard": 40,
      "status": "Dalam Operasi",
      "certificates": [],
      "history": [
        {
          "date": "2026-06-28",
          "event": "Serah terima RP-2026-002",
          "type": "Delivery"
        }
      ]
    }
  },
  {
    "table": "drydocks",
    "id": "DD-1",
    "branch": "",
    "data": {
      "name": "Drydock 1 — Panjang 120m",
      "capacity": "120m / 12m / 6m draft",
      "status": "Terpakai"
    }
  },
  {
    "table": "drydocks",
    "id": "DD-2",
    "branch": "",
    "data": {
      "name": "Drydock 2 — Panjang 90m",
      "capacity": "90m / 10m / 5m draft",
      "status": "Terpakai"
    }
  },
  {
    "table": "drydocks",
    "id": "SL-1",
    "branch": "",
    "data": {
      "name": "Slipway 1",
      "capacity": "80m / bearer",
      "status": "Tersedia"
    }
  },
  {
    "table": "drydocks",
    "id": "BH-1",
    "branch": "",
    "data": {
      "name": "Berth 1",
      "capacity": "New build assembly",
      "status": "Terpakai"
    }
  },
  {
    "table": "dockSlots",
    "id": "S1",
    "branch": "",
    "data": {
      "dockId": "DD-1",
      "project": "RP-2026-003",
      "vessel": "TB Karya Bahari 12",
      "from": 1,
      "to": 35,
      "color": "bg-ocean-500"
    }
  },
  {
    "table": "dockSlots",
    "id": "S2",
    "branch": "",
    "data": {
      "dockId": "DD-2",
      "project": "RP-2026-005",
      "vessel": "TB Samudra Jaya 04",
      "from": 1,
      "to": 22,
      "color": "bg-amber-500"
    }
  },
  {
    "table": "dockSlots",
    "id": "S3",
    "branch": "",
    "data": {
      "dockId": "DD-1",
      "project": "NB-2026-001",
      "vessel": "TB Laut Timur 01",
      "from": 44,
      "to": 62,
      "color": "bg-steel-400"
    }
  },
  {
    "table": "dockSlots",
    "id": "S4",
    "branch": "",
    "data": {
      "dockId": "BH-1",
      "project": "NB-2025-012",
      "vessel": "TB Samudra Jaya 07",
      "from": 1,
      "to": 90,
      "color": "bg-navy-700"
    }
  },
  {
    "table": "dockSlots",
    "id": "S5",
    "branch": "",
    "data": {
      "dockId": "SL-1",
      "project": "NB-2025-014",
      "vessel": "TB Nusantara 22",
      "from": 10,
      "to": 90,
      "color": "bg-ocean-500"
    }
  },
  {
    "table": "dockSlots",
    "id": "DS-SB-001",
    "branch": "",
    "data": {
      "dockId": "DD-1",
      "project": "RP-2026-006",
      "vessel": "BG RMN 3324",
      "from": 40,
      "to": 55,
      "color": "bg-teal-500",
      "dsRef": "000/DS-SB/SMD/VIII/2026",
      "status": "Terjadwal"
    }
  },
  {
    "table": "inventory",
    "id": "INV-001",
    "branch": "",
    "data": {
      "name": "Pelat Baja AH36 12mm",
      "category": "Baja",
      "sku": "AH36-12",
      "warehouse": "Gudang Baja A",
      "stock": 5200,
      "minStock": 2000,
      "unit": "kg",
      "cost": 14500,
      "location": "A1-01"
    }
  },
  {
    "table": "inventory",
    "id": "INV-002",
    "branch": "",
    "data": {
      "name": "Mesin Bantu (Aux Engine)",
      "category": "Mesin",
      "sku": "AUX-MAK",
      "warehouse": "Gudang Mesin",
      "stock": 3,
      "minStock": 2,
      "unit": "unit",
      "cost": 850000000,
      "location": "M-02"
    }
  },
  {
    "table": "inventory",
    "id": "INV-003",
    "branch": "",
    "data": {
      "name": "Cat Epoxy Primer",
      "category": "Cat",
      "sku": "EPO-PRIM",
      "warehouse": "Gudang B",
      "stock": 44,
      "minStock": 20,
      "unit": "liter",
      "cost": 95000,
      "location": "B2-11"
    }
  },
  {
    "table": "inventory",
    "id": "INV-004",
    "branch": "",
    "data": {
      "name": "Pipa Schedule 40 6 inch",
      "category": "Pipa",
      "sku": "PIP-S40-6",
      "warehouse": "Gudang Pipa",
      "stock": 18,
      "minStock": 30,
      "unit": "batang",
      "cost": 780000,
      "location": "P-04"
    }
  },
  {
    "table": "inventory",
    "id": "INV-005",
    "branch": "",
    "data": {
      "name": "Anoda Zink",
      "category": "Perlindungan",
      "sku": "ZN-ANODE",
      "warehouse": "Gudang B",
      "stock": 8,
      "minStock": 12,
      "unit": "pcs",
      "cost": 210000,
      "location": "B3-07"
    }
  },
  {
    "table": "inventory",
    "id": "INV-006",
    "branch": "",
    "data": {
      "name": "Kabel Listrik Marine 4x50",
      "category": "Listrik",
      "sku": "KBL-4X50",
      "warehouse": "Gudang Listrik",
      "stock": 1200,
      "minStock": 800,
      "unit": "meter",
      "cost": 185000,
      "location": "L-01"
    }
  },
  {
    "table": "inventory",
    "id": "INV-007",
    "branch": "",
    "data": {
      "name": "Baut Marine M20",
      "category": "Fastener",
      "sku": "BLT-M20",
      "warehouse": "Gudang B",
      "stock": 1500,
      "minStock": 2000,
      "unit": "pcs",
      "cost": 4500,
      "location": "B1-05"
    }
  },
  {
    "table": "inventory",
    "id": "INV-008",
    "branch": "",
    "data": {
      "name": "Winch Wire Rope",
      "category": "Rigging",
      "sku": "WIRE-ROPE",
      "warehouse": "Gudang Rig",
      "stock": 6,
      "minStock": 4,
      "unit": "roll",
      "cost": 3200000,
      "location": "R-02"
    }
  },
  {
    "table": "inventory",
    "id": "INV-SB-001",
    "branch": "",
    "data": {
      "name": "AMRIL",
      "category": "Umum",
      "sku": "A0000A1",
      "warehouse": "Gudang Santi",
      "stock": 8,
      "minStock": 5,
      "unit": "pcs",
      "cost": 50000,
      "location": "S-01"
    }
  },
  {
    "table": "inventory",
    "id": "INV-SB-002",
    "branch": "",
    "data": {
      "name": "HEMPALIN ENAMEL GREEN 40640 @5LTR",
      "category": "Cat",
      "sku": "AL0000CAT40",
      "warehouse": "Gudang Santi",
      "stock": 2,
      "minStock": 4,
      "unit": "KLG",
      "cost": 400000,
      "location": "S-02"
    }
  },
  {
    "table": "inventory",
    "id": "INV-SB-003",
    "branch": "",
    "data": {
      "name": "PLAT 8MM 5x20",
      "category": "Baja",
      "sku": "EO0000LAT15",
      "warehouse": "Gudang Santi",
      "stock": 6,
      "minStock": 4,
      "unit": "LBR",
      "cost": 6500000,
      "location": "S-03"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-001",
    "branch": "Samarinda",
    "data": {
      "name": "Gantry Crane 50T",
      "category": "Pengangkat",
      "code": "CRN-50",
      "status": "Tersedia",
      "util": 68,
      "nextService": "2026-09-15",
      "lastHours": 12450,
      "model": "DEMAG 50T"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-002",
    "branch": "Samarinda",
    "data": {
      "name": "Mobile Crane 100T",
      "category": "Pengangkat",
      "code": "MCR-100",
      "status": "Terpakai",
      "util": 82,
      "nextService": "2026-08-05",
      "lastHours": 18320,
      "model": "Liebherr MK100"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-003",
    "branch": "Samarinda",
    "data": {
      "name": "Mesin Las MIG",
      "category": "Pengelasan",
      "code": "WLD-MIG-12",
      "status": "Terpakai",
      "util": 74,
      "nextService": "2026-08-20",
      "lastHours": 2500,
      "model": "Fronius TPS 400i"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-004",
    "branch": "Samarinda",
    "data": {
      "name": "Mesin Las SMAW",
      "category": "Pengelasan",
      "code": "WLD-SMAW-05",
      "status": "Maintenance",
      "util": 45,
      "nextService": "2026-07-30",
      "lastHours": 4100,
      "model": "Miller XMT"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-005",
    "branch": "Samarinda",
    "data": {
      "name": "Air Compressor",
      "category": "Tenaga",
      "code": "AIR-COMP-2",
      "status": "Tersedia",
      "util": 58,
      "nextService": "2026-09-01",
      "lastHours": 8900,
      "model": "Atlas Copco"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-006",
    "branch": "Samarinda",
    "data": {
      "name": "Forklift 10T",
      "category": "Transportasi",
      "code": "FLT-10",
      "status": "Terpakai",
      "util": 71,
      "nextService": "2026-08-12",
      "lastHours": 7200,
      "model": "Toyota 10FD"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-007",
    "branch": "Samarinda",
    "data": {
      "name": "Blast Machine",
      "category": "Pengecatan",
      "code": "BLST-01",
      "status": "Tersedia",
      "util": 63,
      "nextService": "2026-09-10",
      "lastHours": 3200,
      "model": "Blastrac"
    }
  },
  {
    "table": "equipment",
    "id": "EQ-008",
    "branch": "Samarinda",
    "data": {
      "name": "Generator Set 500kVA",
      "category": "Tenaga",
      "code": "GEN-500",
      "status": "Tersedia",
      "util": 52,
      "nextService": "2026-10-01",
      "lastHours": 15600,
      "model": "Caterpillar"
    }
  },
  {
    "table": "subcontractors",
    "id": "SUB-001",
    "branch": "",
    "data": {
      "name": "PT Baja Utama Steel",
      "services": "Fabrikasi & Blasting",
      "rating": 90,
      "active": 4,
      "contract": 15000000000,
      "status": "Aktif",
      "k3": "A+"
    }
  },
  {
    "table": "subcontractors",
    "id": "SUB-002",
    "branch": "",
    "data": {
      "name": "CV Pengecatan Marine",
      "services": "Pengecatan / Coating",
      "rating": 84,
      "active": 2,
      "contract": 6200000000,
      "status": "Aktif",
      "k3": "A"
    }
  },
  {
    "table": "subcontractors",
    "id": "SUB-003",
    "branch": "",
    "data": {
      "name": "PT Mesinindo Perkasa",
      "services": "Overhaul Mesin",
      "rating": 88,
      "active": 3,
      "contract": 9800000000,
      "status": "Aktif",
      "k3": "A"
    }
  },
  {
    "table": "subcontractors",
    "id": "SUB-004",
    "branch": "",
    "data": {
      "name": "PT Kelistrikan Bahari",
      "services": "Elektrikal & Panel",
      "rating": 76,
      "active": 1,
      "contract": 3400000000,
      "status": "Kualifikasi",
      "k3": "B+"
    }
  },
  {
    "table": "subcontractors",
    "id": "SUB-005",
    "branch": "",
    "data": {
      "name": "CV Scaffold Aman",
      "services": "Perancah & Staging",
      "rating": 92,
      "active": 2,
      "contract": 1800000000,
      "status": "Aktif",
      "k3": "A+"
    }
  },
  {
    "table": "subcontractors",
    "id": "SUB-SB-001",
    "branch": "",
    "data": {
      "name": "Pak Yusuf",
      "services": "Outfitting Deck (Borongan)",
      "rating": 85,
      "active": 1,
      "contract": 300000,
      "status": "Aktif",
      "k3": "B"
    }
  },
  {
    "table": "employees",
    "id": "EMP-001",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000001",
      "name": "Andi Darman",
      "role": "Direktur",
      "dept": "Direksi",
      "status": "Aktif",
      "join": "2012-03-01",
      "certs": []
    }
  },
  {
    "table": "employees",
    "id": "EMP-002",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000002",
      "name": "Ir. Hendra Wijaya",
      "role": "Project Manager",
      "dept": "Proyek",
      "status": "Aktif",
      "join": "2015-07-12",
      "certs": [
        "PMP",
        "Welding Inspector"
      ]
    }
  },
  {
    "table": "employees",
    "id": "EMP-003",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000003",
      "name": "Budi Santoso",
      "role": "Project Manager",
      "dept": "Proyek",
      "status": "Aktif",
      "join": "2016-02-20",
      "certs": [
        "PMP"
      ]
    }
  },
  {
    "table": "employees",
    "id": "EMP-004",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000004",
      "name": "Rudi Hartono",
      "role": "Superintendent",
      "dept": "Produksi",
      "status": "Aktif",
      "join": "2014-09-01",
      "certs": [
        "Marine Surveyor"
      ]
    }
  },
  {
    "table": "employees",
    "id": "EMP-005",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000005",
      "name": "Agus Setiawan",
      "role": "Foreman",
      "dept": "Produksi",
      "status": "Aktif",
      "join": "2018-05-14",
      "certs": []
    }
  },
  {
    "table": "employees",
    "id": "EMP-006",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000006",
      "name": "Sari Wulandari",
      "role": "QC Engineer",
      "dept": "Quality",
      "status": "Aktif",
      "join": "2017-11-03",
      "certs": [
        "NDT Level II",
        "CWI"
      ]
    }
  },
  {
    "table": "employees",
    "id": "EMP-007",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000007",
      "name": "Dewi Lestari",
      "role": "Finance Manager",
      "dept": "Finance",
      "status": "Aktif",
      "join": "2013-08-25",
      "certs": [
        "Brevet A/B"
      ]
    }
  },
  {
    "table": "employees",
    "id": "EMP-008",
    "branch": "Samarinda",
    "data": {
      "username": "6474010101000008",
      "name": "Fajar Nugroho",
      "role": "Procurement",
      "dept": "Procurement",
      "status": "Aktif",
      "join": "2019-01-10",
      "certs": []
    }
  },
  {
    "table": "services",
    "id": "SRV-001",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "vesselId": "V-002",
      "date": "2026-07-01",
      "type": "Drydock",
      "description": "Inspection & repair kickoff",
      "status": "Done",
      "technician": "Rudi Hartono",
      "cost": 150000000
    }
  },
  {
    "table": "services",
    "id": "SRV-002",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "vesselId": "V-002",
      "date": "2026-07-15",
      "type": "Repair",
      "description": "Overhaul main engine",
      "status": "In Progress",
      "technician": "Agus Setiawan",
      "cost": 480000000
    }
  },
  {
    "table": "services",
    "id": "SRV-003",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "vesselId": "V-002",
      "date": "2026-07-22",
      "type": "Inspection",
      "description": "Coating thickness check",
      "status": "Scheduled",
      "technician": "Sari Wulandari",
      "cost": 75000000
    }
  },
  {
    "table": "services",
    "id": "SRV-004",
    "branch": "",
    "data": {
      "projectId": "NB-2025-012",
      "vesselId": "V-001",
      "date": "2026-06-10",
      "type": "Survey",
      "description": "Pre-construction survey",
      "status": "Done",
      "technician": "Budi Santoso",
      "cost": 50000000
    }
  },
  {
    "table": "services",
    "id": "SRV-005",
    "branch": "",
    "data": {
      "projectId": "RP-2026-005",
      "vesselId": "V-004",
      "date": "2026-07-25",
      "type": "Overhaul",
      "description": "Bearing replacement",
      "status": "In Progress",
      "technician": "Fajar Nugroho",
      "cost": 320000000
    }
  },
  {
    "table": "spareparts",
    "id": "SP-001",
    "branch": "",
    "data": {
      "name": "Bearing Hub ASW-22",
      "partNumber": "ASW-22-01",
      "category": "Mechanical",
      "projectId": "RP-2026-003",
      "vesselId": "V-002",
      "status": "Akan",
      "requestDate": "2026-08-20",
      "cost": 18500000,
      "notes": "Order untuk overhaul engine"
    }
  },
  {
    "table": "spareparts",
    "id": "SP-002",
    "branch": "",
    "data": {
      "name": "Seal Kit Hydraulic",
      "partNumber": "HK-450",
      "category": "Hydraulic",
      "projectId": "RP-2026-003",
      "vesselId": "V-002",
      "status": "Sedang",
      "requestDate": "2026-08-10",
      "repairDate": "2026-08-15",
      "technician": "Rudi Hartono",
      "cost": 9200000,
      "notes": "Sedang dipasang di cylinder"
    }
  },
  {
    "table": "spareparts",
    "id": "SP-003",
    "branch": "",
    "data": {
      "name": "Gasket Head Cylinder",
      "partNumber": "GH-120",
      "category": "Mechanical",
      "projectId": "RP-2026-003",
      "vesselId": "V-002",
      "status": "Selesai",
      "requestDate": "2026-07-20",
      "repairDate": "2026-07-28",
      "technician": "Agus Setiawan",
      "cost": 4500000,
      "notes": "Terpasang, test run OK"
    }
  },
  {
    "table": "spareparts",
    "id": "SP-004",
    "branch": "",
    "data": {
      "name": "Insulasi Thermal Blanket",
      "partNumber": "ITB-300",
      "category": "Insulation",
      "projectId": "NB-2025-012",
      "vesselId": "V-001",
      "status": "Akan",
      "requestDate": "2026-09-01",
      "cost": 22000000,
      "notes": "Daftar untuk pembangunan baru"
    }
  },
  {
    "table": "spareparts",
    "id": "SP-005",
    "branch": "",
    "data": {
      "name": "Paint Primer Epoxy 5L",
      "partNumber": "EPO-PRIM-5",
      "category": "Paint",
      "projectId": "RP-2026-005",
      "vesselId": "V-004",
      "status": "Sedang",
      "requestDate": "2026-07-25",
      "repairDate": "2026-07-26",
      "technician": "Fajar Nugroho",
      "cost": 475000,
      "notes": "Sedang diapply di section 3"
    }
  },
  {
    "table": "spareparts",
    "id": "SP-006",
    "branch": "",
    "data": {
      "name": "Wire Rope 12mm",
      "partNumber": "WR-12-050",
      "category": "Rigging",
      "projectId": "NB-2025-014",
      "vesselId": "V-003",
      "status": "Selesai",
      "requestDate": "2026-06-15",
      "repairDate": "2026-06-20",
      "technician": "Sari Wulandari",
      "cost": 8500000,
      "notes": "Terpasang di cargo system"
    }
  },
  {
    "table": "ncr",
    "id": "NCR-2026-031",
    "branch": "",
    "data": {
      "project": "NB-2025-012",
      "vessel": "TB Samudra Jaya 07",
      "type": "Pengelasan",
      "status": "Terbuka",
      "severity": "Major",
      "raised": "2026-07-18",
      "issue": "Porosity pada seam weld section 4"
    }
  },
  {
    "table": "ncr",
    "id": "NCR-2026-032",
    "branch": "",
    "data": {
      "project": "RP-2026-003",
      "vessel": "TB Karya Bahari 12",
      "type": "Pengecatan",
      "status": "Dalam Perbaikan",
      "severity": "Minor",
      "raised": "2026-07-22",
      "issue": "Ketebalan cat lambung di bawah spec"
    }
  },
  {
    "table": "ncr",
    "id": "NCR-2026-033",
    "branch": "",
    "data": {
      "project": "RF-2026-001",
      "vessel": "TB Karya Bahari 15",
      "type": "Kelistrikan",
      "status": "Tertutup",
      "severity": "Major",
      "raised": "2026-07-05",
      "issue": "Kabel grounding kurang kencang"
    }
  },
  {
    "table": "ncr",
    "id": "NCR-2026-034",
    "branch": "",
    "data": {
      "project": "RP-2026-005",
      "vessel": "TB Samudra Jaya 04",
      "type": "Mesin",
      "status": "Terbuka",
      "severity": "Critical",
      "raised": "2026-07-25",
      "issue": "Overhaul bearing tidak sesuai toleransi"
    }
  },
  {
    "table": "incidents",
    "id": "INC-2026-009",
    "branch": "",
    "data": {
      "type": "Near Miss",
      "date": "2026-07-20",
      "location": "Area Fabrikasi",
      "desc": "Mata rantai sling hampir putus saat lifting",
      "severity": "Rendah"
    }
  },
  {
    "table": "incidents",
    "id": "INC-2026-010",
    "branch": "",
    "data": {
      "type": "First Aid",
      "date": "2026-07-24",
      "location": "Dock 1",
      "desc": "Pekerja terluka ringan pada tangan saat grinder",
      "severity": "Sedang"
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-2026-114",
    "branch": "",
    "data": {
      "item": "Pelat Baja AH36",
      "vendor": "PT Bahana Baja",
      "req": "PR-2026-203",
      "amount": 4120000000,
      "status": "Dalam Pengiriman",
      "date": "2026-07-15"
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-2026-115",
    "branch": "",
    "data": {
      "item": "Aux Engine MAK",
      "vendor": "PT Indo Diesel",
      "req": "PR-2026-201",
      "amount": 1700000000,
      "status": "Diterima",
      "date": "2026-07-05"
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-2026-116",
    "branch": "",
    "data": {
      "item": "Cat Epoxy",
      "vendor": "PT Jotun Indonesia",
      "req": "PR-2026-207",
      "amount": 480000000,
      "status": "Menunggu Persetujuan",
      "date": "2026-07-28"
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-2026-117",
    "branch": "",
    "data": {
      "item": "Wire Rope",
      "vendor": "PT Steel Rig",
      "req": "PR-2026-209",
      "amount": 210000000,
      "status": "Dikirim",
      "date": "2026-07-30"
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-SB-2024-006",
    "branch": "",
    "data": {
      "item": "Besi WF (250/150/200)",
      "vendor": "PT KALTIM LESTARI UNGGUL",
      "req": "PR-SB-2024-006",
      "amount": 27811050,
      "qty": 23,
      "unit": "btg",
      "status": "Diterima",
      "date": "2024-01-26",
      "docNo": "06/PO-SB/SMD/I/2024",
      "vessel": "U/STOCK",
      "includePpn": true,
      "tujuan": "stok",
      "receivedQty": 23,
      "lines": [
        {
          "name": "Besi WF 250",
          "qty": 10,
          "unit": "btg",
          "price": 1150000
        },
        {
          "name": "Besi WF 150",
          "qty": 8,
          "unit": "btg",
          "price": 850000
        },
        {
          "name": "Besi WF 200",
          "qty": 5,
          "unit": "btg",
          "price": 1351000
        }
      ]
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-SB-2026-004",
    "branch": "",
    "data": {
      "item": "PLAT 14MM",
      "vendor": "PT KALTIM LESTARI UNGGUL",
      "req": "PR-SB-2026-004",
      "amount": 36341622,
      "qty": 2,
      "unit": "lbr",
      "status": "Diterima",
      "date": "2026-01-07",
      "docNo": "04/PO-SB/SMD/I/2026",
      "vessel": "U/TK. RMN 3317",
      "includePpn": true,
      "tujuan": "kapal",
      "receivedQty": 2
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-SB-2026-012",
    "branch": "",
    "data": {
      "item": "SIKU PRESS + ROUNDBAR",
      "vendor": "PT KALTIM LESTARI UNGGUL",
      "req": "PR-SB-2026-012",
      "amount": 409492875,
      "qty": 130,
      "unit": "btg",
      "status": "Diterima",
      "date": "2026-01-29",
      "docNo": "12/PO-SB/SMD/I/2026",
      "vessel": "U/BG. KBT 26",
      "includePpn": true,
      "tujuan": "kapal",
      "receivedQty": 130
    }
  },
  {
    "table": "purchaseOrders",
    "id": "PO-SB-2026-036",
    "branch": "",
    "data": {
      "item": "PLAT 12MM/8MM",
      "vendor": "PT KALTIM LESTARI UNGGUL",
      "req": "PR-SB-2026-036",
      "amount": 982905000,
      "qty": 75,
      "unit": "lbr",
      "status": "Diterima",
      "date": "2026-04-15",
      "docNo": "36/PO-SB/SMD/IV/2026",
      "vessel": "U/TK. ARTHA SARANA XI",
      "includePpn": true,
      "tujuan": "kapal",
      "receivedQty": 75
    }
  },
  {
    "table": "quotations",
    "id": "QT-2026-052",
    "branch": "",
    "data": {
      "client": "PT Samudra Jaya Perkasa",
      "vessel": "TB Baru RJ-03",
      "type": "New Build",
      "value": 48500000000,
      "stage": "Negosiasi",
      "date": "2026-07-20"
    }
  },
  {
    "table": "quotations",
    "id": "QT-2026-053",
    "branch": "",
    "data": {
      "client": "PT Laut Timur Mandiri",
      "vessel": "TB LT-06",
      "type": "New Build",
      "value": 45200000000,
      "stage": "Penawaran",
      "date": "2026-07-18"
    }
  },
  {
    "table": "quotations",
    "id": "QT-2026-054",
    "branch": "",
    "data": {
      "client": "PT Mitra Samudra Raya",
      "vessel": "Repair MR-02",
      "type": "Repair",
      "value": 3100000000,
      "stage": "Menang",
      "date": "2026-07-12"
    }
  },
  {
    "table": "quotations",
    "id": "QT-2026-055",
    "branch": "",
    "data": {
      "client": "PT Pelayaran Nusantara Abadi",
      "vessel": "TB PN-05 Retrofit",
      "type": "Retrofit",
      "value": 8200000000,
      "stage": "Lead",
      "date": "2026-07-25"
    }
  },
  {
    "table": "quotations",
    "id": "QT-SB-001",
    "branch": "",
    "data": {
      "client": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "vessel": "BG RMN 3324",
      "type": "Repair",
      "value": 1671211310,
      "stage": "Menang",
      "date": "2026-07-28",
      "requestId": "REQ-SB-002"
    }
  },
  {
    "table": "clients",
    "id": "C-001",
    "branch": "",
    "data": {
      "name": "PT Samudra Jaya Perkasa",
      "fleet": 12,
      "rating": 92,
      "since": 2015
    }
  },
  {
    "table": "clients",
    "id": "C-002",
    "branch": "",
    "data": {
      "name": "PT Pelayaran Nusantara Abadi",
      "fleet": 8,
      "rating": 88,
      "since": 2018
    }
  },
  {
    "table": "clients",
    "id": "C-003",
    "branch": "",
    "data": {
      "name": "PT Karya Bahari Sejahtera",
      "fleet": 15,
      "rating": 95,
      "since": 2012
    }
  },
  {
    "table": "clients",
    "id": "C-004",
    "branch": "",
    "data": {
      "name": "PT Laut Timur Mandiri",
      "fleet": 6,
      "rating": 78,
      "since": 2019
    }
  },
  {
    "table": "clients",
    "id": "C-005",
    "branch": "",
    "data": {
      "name": "PT Mitra Samudra Raya",
      "fleet": 10,
      "rating": 85,
      "since": 2016
    }
  },
  {
    "table": "clients",
    "id": "C-SB-001",
    "branch": "",
    "data": {
      "name": "PT PELAYARAN KARTIKA SAMUDRA ADIJAYA",
      "fleet": 6,
      "rating": 90,
      "since": 2024
    }
  },
  {
    "table": "clients",
    "id": "C-SB-002",
    "branch": "",
    "data": {
      "name": "PT PELAYARAN ROYLEA MARINE LINE",
      "fleet": 9,
      "rating": 87,
      "since": 2023
    }
  },
  {
    "table": "clients",
    "id": "C-SB-003",
    "branch": "",
    "data": {
      "name": "PT ALVI CIPTA SENTOSA",
      "fleet": 4,
      "rating": 89,
      "since": 2024
    }
  },
  {
    "table": "movements",
    "id": "M-0901",
    "branch": "",
    "data": {
      "item": "Pelat Baja AH36 12mm",
      "type": "Pengeluaran",
      "qty": 420,
      "by": "NB-2025-012",
      "date": "2026-08-01",
      "tone": "out"
    }
  },
  {
    "table": "movements",
    "id": "M-0902",
    "branch": "",
    "data": {
      "item": "Cat Epoxy Primer",
      "type": "Penerimaan",
      "qty": 60,
      "by": "PO-2026-116",
      "date": "2026-08-01",
      "tone": "in"
    }
  },
  {
    "table": "movements",
    "id": "M-0903",
    "branch": "",
    "data": {
      "item": "Baut Marine M20",
      "type": "Pengeluaran",
      "qty": 850,
      "by": "RP-2026-003",
      "date": "2026-07-31",
      "tone": "out"
    }
  },
  {
    "table": "movements",
    "id": "M-0904",
    "branch": "",
    "data": {
      "item": "Kabel Listrik Marine 4x50",
      "type": "Pengeluaran",
      "qty": 540,
      "by": "RF-2026-001",
      "date": "2026-07-30",
      "tone": "out"
    }
  },
  {
    "table": "movements",
    "id": "M-0905",
    "branch": "",
    "data": {
      "item": "Winch Wire Rope",
      "type": "Penerimaan",
      "qty": 3,
      "by": "PO-2026-117",
      "date": "2026-07-29",
      "tone": "in"
    }
  },
  {
    "table": "movements",
    "id": "M-0906",
    "branch": "",
    "data": {
      "item": "Anoda Zink",
      "type": "Pengeluaran",
      "qty": 14,
      "by": "RP-2026-005",
      "date": "2026-07-29",
      "tone": "out"
    }
  },
  {
    "table": "movements",
    "id": "M-0907",
    "branch": "",
    "data": {
      "item": "Mesin Bantu (Aux Engine)",
      "type": "Penerimaan",
      "qty": 1,
      "by": "PO-2026-115",
      "date": "2026-07-28",
      "tone": "in"
    }
  },
  {
    "table": "movements",
    "id": "M-SB-IN-001",
    "branch": "",
    "data": {
      "item": "PLAT 8MM 5x20",
      "itemId": "INV-SB-003",
      "type": "Penerimaan",
      "qty": 6,
      "by": "UD TIGA BERLIAN",
      "date": "2024-01-02",
      "tone": "in",
      "supplier": "UD TIGA BERLIAN",
      "purpose": "TB SYUKUR 75",
      "pic": "SANTI"
    }
  },
  {
    "table": "movements",
    "id": "M-SB-OUT-001",
    "branch": "",
    "data": {
      "item": "HEMPALIN ENAMEL GREEN 40640 @5LTR",
      "itemId": "INV-SB-002",
      "type": "Pengeluaran",
      "qty": 2,
      "by": "TB SYUKUR 72",
      "date": "2024-01-02",
      "tone": "out",
      "purpose": "TB SYUKUR 72",
      "pic": "ABK"
    }
  },
  {
    "table": "surveys",
    "id": "S-01",
    "branch": "",
    "data": {
      "vessel": "TB Karya Bahari 12",
      "type": "Special Survey",
      "status": "Terjadwal",
      "date": "2026-08-25",
      "classSurveyor": "BKI",
      "linkedTrial": "TRIAL-001"
    }
  },
  {
    "table": "surveys",
    "id": "S-02",
    "branch": "",
    "data": {
      "vessel": "TB Samudra Jaya 04",
      "type": "Annual Survey",
      "status": "Dalam Proses",
      "date": "2026-08-10",
      "classSurveyor": "BKI"
    }
  },
  {
    "table": "surveys",
    "id": "S-03",
    "branch": "",
    "data": {
      "vessel": "TB Mitra Raya 09",
      "type": "Docking Survey",
      "status": "Selesai",
      "date": "2026-07-30",
      "classSurveyor": "BKI"
    }
  },
  {
    "table": "activities",
    "id": "A1",
    "branch": "",
    "data": {
      "actor": "Sari Wulandari",
      "action": "menutup NCR",
      "target": "NCR-2026-033",
      "module": "QC",
      "time": "2 menit lalu",
      "tone": "teal"
    }
  },
  {
    "table": "activities",
    "id": "A2",
    "branch": "",
    "data": {
      "actor": "Fajar Nugroho",
      "action": "mengajukan PO",
      "target": "PO-2026-117",
      "module": "Procurement",
      "time": "18 menit lalu",
      "tone": "navy"
    }
  },
  {
    "table": "activities",
    "id": "A3",
    "branch": "",
    "data": {
      "actor": "Budi Santoso",
      "action": "mengupdate progres",
      "target": "NB-2025-014 → 41%",
      "module": "Proyek",
      "time": "42 menit lalu",
      "tone": "violet"
    }
  },
  {
    "table": "activities",
    "id": "A4",
    "branch": "",
    "data": {
      "actor": "Agus Setiawan",
      "action": "mencatat incident",
      "target": "INC-2026-010",
      "module": "Safety",
      "time": "1 jam lalu",
      "tone": "rose"
    }
  },
  {
    "table": "activities",
    "id": "A5",
    "branch": "",
    "data": {
      "actor": "Dewi Lestari",
      "action": "mengimpor saldo awal",
      "target": "Piutang Excel Agu-2026 (37 customer)",
      "module": "Keuangan",
      "time": "2 jam lalu",
      "tone": "amber"
    }
  },
  {
    "table": "activities",
    "id": "A6",
    "branch": "",
    "data": {
      "actor": "Rudi Hartono",
      "action": "mengalokasikan dock",
      "target": "DD-1 untuk RP-2026-003",
      "module": "Drydock",
      "time": "3 jam lalu",
      "tone": "teal"
    }
  },
  {
    "table": "activities",
    "id": "A7",
    "branch": "",
    "data": {
      "actor": "Hendra Wijaya",
      "action": "membuat quotation",
      "target": "QT-2026-052",
      "module": "CRM",
      "time": "5 jam lalu",
      "tone": "navy"
    }
  },
  {
    "table": "activities",
    "id": "A8",
    "branch": "",
    "data": {
      "actor": "System",
      "action": "otomatis mengingatkan servis",
      "target": "EQ-002 Mobile Crane",
      "module": "Equipment",
      "time": "6 jam lalu",
      "tone": "amber"
    }
  },
  {
    "table": "boq",
    "id": "BQ-001",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "name": "Overhaul Main Engine",
      "description": "Overhaul & replacement main engine bearing",
      "quantity": 1,
      "unit": "set",
      "unitPrice": 480000000,
      "totalPrice": 480000000,
      "category": "Mechanical",
      "status": "Pending",
      "requestedBy": "Rudi Hartono"
    }
  },
  {
    "table": "boq",
    "id": "BQ-002",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "name": "Coating Lambung",
      "description": "Epoxy coating hull exterior",
      "quantity": 120,
      "unit": "m²",
      "unitPrice": 850000,
      "totalPrice": 102000000,
      "category": "Paint",
      "status": "Approved",
      "requestedBy": "Sari Wulandari",
      "approvedBy": "Andi Darman",
      "approvedAt": "2026-07-20"
    }
  },
  {
    "table": "boq",
    "id": "BQ-003",
    "branch": "",
    "data": {
      "projectId": "RP-2026-003",
      "name": "Inspection Docking",
      "description": "Survey & inspection during drydock",
      "quantity": 1,
      "unit": "service",
      "unitPrice": 150000000,
      "totalPrice": 150000000,
      "category": "Survey",
      "status": "Completed",
      "requestedBy": "Rudi Hartono",
      "approvedBy": "Budi Santoso",
      "approvedAt": "2026-07-05"
    }
  },
  {
    "table": "boq",
    "id": "BQ-004",
    "branch": "",
    "data": {
      "projectId": "NB-2025-012",
      "name": "Fabrikasi Baja Section 4-7",
      "description": "Steel fabrication for hull section",
      "quantity": 45,
      "unit": "ton",
      "unitPrice": 12000000,
      "totalPrice": 540000000,
      "category": "Fabrikasi",
      "status": "Approved",
      "requestedBy": "Hendra Wijaya",
      "approvedBy": "Andi Darman",
      "approvedAt": "2025-11-01"
    }
  },
  {
    "table": "boq",
    "id": "BQ-005",
    "branch": "",
    "data": {
      "projectId": "NB-2025-012",
      "name": "Mesin & Kelistrikan",
      "description": "Aux engine & electrical installation",
      "quantity": 1,
      "unit": "package",
      "unitPrice": 850000000,
      "totalPrice": 850000000,
      "category": "Mechanical",
      "status": "Pending",
      "requestedBy": "Budi Santoso"
    }
  },
  {
    "table": "boq",
    "id": "BQ-006",
    "branch": "",
    "data": {
      "projectId": "RP-2026-005",
      "name": "Bearing Overhaul",
      "description": "Replace bearing on main propulsion",
      "quantity": 4,
      "unit": "pcs",
      "unitPrice": 80000000,
      "totalPrice": 320000000,
      "category": "Mechanical",
      "status": "Pending",
      "requestedBy": "Fajar Nugroho"
    }
  }
];
