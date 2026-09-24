// Bulk-seed rows for POST /api/admin/seed dan npm run seed. Sumber:
// - settings: 36 baris (halaman Pengaturan membaca semuanya; JANGAN dikurangi)
// - coa: apps/web/src/data/financeExcel.ts COA_EXCEL (98 akun, sama dengan FE)
// - branches/journals/assets: sama dengan FE (financeExcel + seeds.ts)
// - koleksi operasional: CERMIN apps/web (data/seeds.ts + data/index.ts) via
//   `npm run seed:mirror` → seedFeMirror.ts. Id SAMA dengan FE sehingga
//   mode lokal dan mode remote menampilkan data identik.
// - EX: hanya baris tambahan khusus backend (saat ini kosong).
// - wbs/team: proyek NB-2025-012 + RP-2026-003 (selaras TEAM_SEED FE).
import { FE_MIRROR_ROWS } from "./seedFeMirror.js";
export interface SeedRow { table: string; id: string; branch: string; data: Record<string, unknown> }

export interface WbsSeed { projectId: string; wbs: Array<Record<string, unknown>> }
export interface TeamSeed { projectId: string; memberIds: string[] }

const S = (id: string, key: string, value: number, label: string, group: string): SeedRow =>
  ({ table: "settings", id, branch: "", data: { key, value, label, group } });

const SETTINGS: SeedRow[] = [
  S("SET-PPN","PPN_RATE",12,"PPN Keluaran/Masukan hutang-belanja (%)","Pajak"),
  S("SET-PPNINV","PPN_INVOICE_RATE",12,"PPN invoice jasa+material, DPP=TOTAL×11/12 (%)","Pajak"),
  S("SET-PPHJASA","PPH_JASA_RATE",2,"PPh invoice (% dari jasa)","Pajak"),
  S("SET-PPHSUB","PPH_SUBKON_DEFAULT",0.5,"PPh subkontraktor default (0.5/2)","Pajak"),
  S("SET-PPH23","PPH23_RATE",2,"PPh 23 jasa (%)","Pajak"),
  S("SET-PPH21-1","PPH21_T1_RATE",5,"PPh21 lapis 1 (%)","Payroll"),
  S("SET-PPH21-1B","PPH21_T1_MAX",60000000,"PPh21 batas lapis 1 (Rp/thn)","Payroll"),
  S("SET-PPH21-2","PPH21_T2_RATE",15,"PPh21 lapis 2 (%)","Payroll"),
  S("SET-PPH21-2B","PPH21_T2_MAX",250000000,"PPh21 batas lapis 2 (Rp/thn)","Payroll"),
  S("SET-PPH21-3","PPH21_T3_RATE",25,"PPh21 lapis 3 (%)","Payroll"),
  S("SET-PPH21-3B","PPH21_T3_MAX",500000000,"PPh21 batas lapis 3 (Rp/thn)","Payroll"),
  S("SET-PPH21-4","PPH21_T4_RATE",30,"PPh21 lapis 4 (%)","Payroll"),
  S("SET-PTKP0","PTKP_TK0",54000000,"PTKP TK/0 (Rp/thn)","Payroll"),
  S("SET-PTKP1","PTKP_K0",58500000,"PTKP K/0 (Rp/thn)","Payroll"),
  S("SET-PTKPT","PTKP_TANGGUNGAN",4500000,"PTKP per tanggungan (Rp/thn, maks 3)","Payroll"),
  S("SET-BPJSK","BPJS_KES_KAR",1,"BPJS Kes karyawan (%)","Payroll"),
  S("SET-BPJSP","BPJS_KES_PER",4,"BPJS Kes perusahaan (%)","Payroll"),
  S("SET-BPJSTK","BPJS_TK_KAR",2,"BPJS TK karyawan JHT (%)","Payroll"),
  S("SET-OT","OVERTIME_DIV",173,"Pembagi tarif lembur","Payroll"),
  S("SET-POKECIL","PO_KECIL_LIMIT",50000000,"Batas PO Kecil (Rp)","Procurement"),
  S("SET-APPINV","APPROVE_INVOICE",5000000,"Ambang Director invoice (Rp)","Approval"),
  S("SET-APPTERM","APPROVE_TERMIN",2000000,"Ambang Director termin (Rp)","Approval"),
  S("SET-APPPO","APPROVE_PO",1000000,"Ambang Director PO (Rp)","Approval"),
  S("SET-ALBUD","ALERT_BUDGET_PCT",80,"Alert serapan budget (%)","Alert"),
  S("SET-ALOVR","ALERT_OVERRUN_PCT",10,"Alert overrun di atas (%)","Alert"),
  S("SET-ALCERT","ALERT_CERT_DAYS",90,"Alert sertifikat H- (hari)","Alert"),
  S("SET-ALCERT60","ALERT_CERT_60",60,"Alert sertifikat warning H- (hari)","Alert"),
  S("SET-ALCERT30","ALERT_CERT_30",30,"Alert sertifikat critical H- (hari)","Alert"),
  S("SET-ALMS","ALERT_MILESTONE_DAYS",7,"Alert milestone H- (hari)","Alert"),
  S("SET-ALCP","ALERT_CP_DAYS",3,"Alert critical-path delay > (hari)","Alert"),
  S("SET-CUTI","CUTI_JATAH",12,"Jatah cuti tahunan (hari)","HR"),
  S("SET-WHATIF-G","WHATIF_GROWTH",0,"What-if pertumbuhan pasar (%)","Analytics"),
  S("SET-WHATIF-C","WHATIF_COST",0,"What-if biaya, menekan margin (%)","Analytics"),
  S("SET-WHATIF-P","WHATIF_PROG",0,"What-if progres, menggeser forecast (%)","Analytics"),
  S("SET-3D-PROJ","SHOW_3D_PROJECT",0,"Tampilkan 3D Viewer di modul Proyek (0/1)","Modul"),
  S("SET-3D-VES","SHOW_3D_VESSEL",0,"Tampilkan 3D Viewer di modul Kapal (0/1)","Modul"),
];

const COA: Array<[string, string, string, string]> = [
  ["1-000","A K T I V A","-","-"],["1-100","A K T I V A   L A N C A R","-","-"],
  ["1-110","Kas - Kecil","D","NR"],["1-111","Kas - Kantor","D","NR"],
  ["1-120","Bank Rakyat Indonesia","D","NR"],["1-121","Bank Mandiri","D","NR"],
  ["1-122","Bank Negara Indonesia","D","NR"],["1-123","Bank Rakyat Indonesia - Non Pajak","D","NR"],
  ["1-124","Bank Kaltimtara","D","NR"],["1-130","Piutang Usaha","D","NR"],
  ["1-140","Piutang Direksi","D","NR"],["1-150","Piutang Karyawan","D","NR"],
  ["1-160","Piutang Antar Perusahaan","D","NR"],["1-161","Persediaan","D","NR"],
  ["1-170","PPn Masukan","D","NR"],["1-180","Asuransi Dibayar Dimuka","D","NR"],
  ["1-190","PPh Dibayar Dimuka","D","NR"],["1-199","PPN Lebih Bayar","D","NR"],
  ["1-200","A K T I V A   T E T A P","-","-"],["1-210","Tanah","D","NR"],
  ["1-220","Bangunan","D","NR"],["1-230","Kendaraan","D","NR"],
  ["1-231","Alat Berat","D","NR"],["1-232","Mesin dan Alat Kerja","D","NR"],
  ["1-240","Inventaris Kantor dan Peralatan Proyek","D","NR"],["1-270","Akum. Penyusutan Bangunan","K","NR"],
  ["1-280","Akum. Penyusutan Kendaraan","K","NR"],["1-281","Akum. Penyusutan Alat Berat","K","NR"],
  ["1-282","Akum. Penyusutan Mesin dan Alat Kerja","K","NR"],["1-290","Akum. Penyusutan Inventaris Kantor dan Peralatan Proyek","K","NR"],
  ["2-000","K E W A J I B A N","-","-"],["2-100","K E W A J I B A N   L A N C A R","-","-"],
  ["2-110","Hutang Usaha","K","NR"],["2-120","PPn Keluaran","K","NR"],
  ["2-130","Hutang Direksi","K","NR"],["2-140","Hutang Pemborong","K","NR"],
  ["2-150","Uang Muka Penjualan","K","NR"],["2-200","K E W A J I B A N   J A N G K A   P A N J A N G","-","-"],
  ["2-210","Hutang Bank","K","NR"],["2-220","Hutang Leasing","K","NR"],
  ["2-230","Hutang Pajak PPh 25","K","NR"],["2-231","Hutang Pajak PPh 21","K","NR"],
  ["2-232","Hutang Pajak PPh 23","K","NR"],["2-233","Hutang Pajak PPh Pasal 4 Ayat 2","K","NR"],
  ["2-234","Hutang Pajak PPN","K","NR"],["2-235","Hutang Pajak STP","K","NR"],
  ["2-240","Hutang Antar Perusahaan","K","NR"],["3-000","E K U I T A S","-","-"],
  ["3-100","Modal Usaha","K","NR"],["3-200","Laba Ditahan","K","NR"],
  ["4-000","P E N D A P A T A N","-","-"],["4-100","Pendapatan Jasa Pembuatan Kapal","K","LR"],
  ["4-101","Pendapatan Jasa Repair dan Docking","K","LR"],["4-102","Pendapatan Jasa Lainnya","K","LR"],
  ["5-000","B E B A N  P O K O K  P E N D A P A T A N","-","-"],["5-100","Beban Pokok Pemborong","D","LR"],
  ["5-101","Beban Pokok Pembelian Material, Sparepart","D","LR"],["5-102","Beban Pokok Pembelian Material, Sparepart (Non PPn)","D","LR"],
  ["5-200","Beban Pokok Bahan Bakar Minyak","D","LR"],["5-300","Beban Pokok Pembelian Minyak Pelumas (Oli)","D","LR"],
  ["5-400","Beban Pengurusan Dokumen Kapal","D","LR"],["5-500","Beban APD Safety, Kelengkapan Unit & Seragam","D","LR"],
  ["5-600","Beban Operasional Workshop","D","LR"],["5-700","Beban Ekspedisi / Mobilisasi Unit","D","LR"],
  ["6-000","B I A Y A   U S A H A","-","-"],["6-001","Biaya Gaji  & Tunjangan Direksi","D","LR"],
  ["6-002","Biaya Gaji  & Tunjangan Administrasi","D","LR"],["6-003","Biaya ATK & Materai","D","LR"],
  ["6-004","Biaya Rumah Tangga Kantor","D","LR"],["6-005","Biaya Parkir, Transportasi, Kirim Barang/Dokumen","D","LR"],
  ["6-006","Biaya Fotocopy & Percetakan","D","LR"],["6-007","Biaya Sewa","D","LR"],
  ["6-008","BPJS Kesehatan dan Tenaga Kerja","D","LR"],["6-009","Biaya Pemeliharaan Inventaris Kantor","D","LR"],
  ["6-010","Biaya Listrik dan Air","D","LR"],["6-011","Biaya Natura, Konsumsi & Logistik Karyawan","D","LR"],
  ["6-012","Biaya Internet, Telepon, dan Pulsa","D","LR"],["6-013","Biaya BBM Kendaraan Kantor","D","LR"],
  ["6-014","Jasa Profesional","D","LR"],["6-015","Entertainment, Perjamuan Tamu, Fee & Komisi","D","LR"],
  ["6-016","Biaya PPH 21","D","LR"],["6-017","Biaya PPH 23","D","LR"],
  ["6-018","Biaya PPH 25","D","LR"],["6-019","Biaya Pemeliharaan Kendaraan","D","LR"],
  ["6-020","Sumbangan dan Bantuan Sosial","D","LR"],["6-021","Biaya Penyusutan Kendaraan","D","LR"],
  ["6-021 A","Biaya Penyusutan Alat Berat","D","LR"],["6-021 B","Beban Penyusutan Mesin dan Alat Kerja","D","LR"],
  ["6-021 C","Biaya Penyusutan Bangunan","D","LR"],["6-022","Biaya Penyusutan Inventaris Kantor dan Peralatan Kerja","D","LR"],
  ["6-023","Biaya Operasional Dirut","D","LR"],["6-024","Beban Pajak, Denda, Daerah","D","LR"],
  ["6-025","PPh Deviden dan PPh Final","D","LR"],["7-000","P E N D A P A T A N   &   B I A Y A   L A I N - L A I N","-","-"],
  ["7-100","Pendapatan Jasa Giro","K","LR"],["7-200","Pendapatan Diluar Usaha","K","LR"],
  ["7-300","Biaya Administrasi Bank","D","LR"],["7-400","Dividen","D","LR"],
];

// Koleksi operasional dicerminkan dari FE (FE_MIRROR_ROWS). Tidak ada baris
// khusus backend saat ini.
const EX: Array<[string, string, string, Record<string, unknown>]> = [];

// Mirrors JU_PENYESUAIAN_EXCEL (financeExcel.ts) via seedJournals mapping:
// id JU-EX-01.., dokumen JUM-0831, amount = dbAmt || krAmt.
const JU_EX: Array<[string, string, string, number, string, number]> = [
  ["2026-08-31","Penyesuaian PPN Agustus","2-120",455632169.08,"1-170",73753513.46],
  ["2026-08-31","Penyesuaian PPN Agustus","",0,"2-234",381878655.62],
  ["2026-08-31","Penyesuaian Beban Penyusutan Aktiva","6-021",15499343.09,"1-280",15499343.09],
  ["2026-08-31","Penyesuaian Beban Penyusutan Aktiva","6-021 A",42105958.33,"1-281",42105958.33],
  ["2026-08-31","Penyesuaian Beban Penyusutan Aktiva","6-021 B",44471008.25,"1-282",44471008.25],
  ["2026-08-31","Penyesuaian Beban Penyusutan Aktiva","6-021 C",6250000,"1-270",6250000],
  ["2026-08-31","Penyesuaian Beban Penyusutan Aktiva","6-022",19893258.33,"1-290",19893258.33],
];

// Mirrors ASET_EXCEL (financeExcel.ts) via seedAssets mapping:
// kelompok = Bangunan→BP, contains Inventaris→1, else 2.
const ASET_EX: Array<[string, number, number, number]> = [
  ["Bangunan",1500000000,450000000,6250000],
  ["Alat Berat",4667172000,2635964375,52887208.33],
  ["Kendaraan",2232936937,938942755,15499343.09],
  ["Mesin dan Alat Kerja",6060425618,3158555875,42687975.22],
  ["Inventaris Kantor dan Peralatan Proyek",1114376400,712588275,8221458.33],
];

// Mirrors store wbsTemplate (15 tasks, total weight 100).
const WBS_TEMPLATE: Array<[string, string, string, number, number]> = [
  ["Desain & Persetujuan Class","2026-01","2026-03",100,8],
  ["Pengadaan Material","2026-02","2026-05",85,10],
  ["Fabrikasi Baja","2026-03","2026-07",70,12],
  ["Hull Assembly","2026-05","2026-08",45,12],
  ["Outfitting — Machinery","2026-07","2026-09",20,8],
  ["Outfitting — Piping","2026-07","2026-09",20,7],
  ["Outfitting — Electrical","2026-07","2026-09",20,7],
  ["Outfitting — Nav & Comm","2026-07","2026-09",20,5],
  ["Outfitting — Accommodation","2026-07","2026-09",20,5],
  ["Painting — Surface Prep","2026-08","2026-09",5,5],
  ["Painting — Priming","2026-08","2026-09",5,4],
  ["Painting — Topcoat","2026-08","2026-09",5,4],
  ["Painting — Final Inspection","2026-08","2026-09",5,3],
  ["Commissioning","2026-09","2026-09",0,6],
  ["Sea Trial & Delivery","2026-09","2026-09",0,4],
];

// Mirrors store seedTeamByProject.
const TEAM_SEED: Array<[string, string[]]> = [
  ["NB-2025-012",["EMP-002","EMP-004","EMP-006"]],
  ["NB-2025-014",["EMP-003","EMP-005"]],
  ["RP-2026-003",["EMP-004","EMP-006"]],
  ["RP-2026-005",["EMP-005"]],
  ["RF-2026-001",["EMP-002","EMP-006"]],
];

const WBS_PROJECTS = ["NB-2025-012","RP-2026-003"];

export function buildSeedRows(): SeedRow[] {
  const rows: SeedRow[] = [...SETTINGS];
  for (const [kode, nama, dk, nrlr] of COA) {
    rows.push({ table: "coa", id: `COA-${kode}`, branch: "", data: { kode, nama, dk, nrlr } });
  }
  JU_EX.forEach(([tgl, uraian, db, dbAmt, kr, krAmt], i) => {
    rows.push({ table: "journals", id: `JU-EX-${String(i + 1).padStart(2, "0")}`, branch: "",
      data: { date: tgl, kodePembantu: "", dokumen: "JUM-0831", uraian, db, kr, amount: dbAmt || krAmt, sumber: "JU", status: "Posted" } });
  });
  ASET_EX.forEach(([gol, perolehan, sisaAwal, susut], i) => {
    rows.push({ table: "assets", id: `AST-EX-0${i + 1}`, branch: "",
      data: { nama: gol, kelompok: gol === "Bangunan" ? "BP" : gol.includes("Inventaris") ? "1" : "2",
        bulan: "-", tahun: "2025", nilai: perolehan, sisaAwal, susutTahun: susut, metode: "GL" } });
  });
  for (const [table, id, branch, data] of EX) {
    rows.push({ table, id, branch, data });
  }
  // Cermin FE: id sama persis → tampilan lokal & remote identik.
  // EX didahulukan bila ada id kembar (tidak ada saat ini).
  const seen = new Set(rows.map((r) => `${r.table}:${r.id}`));
  for (const m of FE_MIRROR_ROWS) {
    const key = `${m.table}:${m.id}`;
    if (seen.has(key)) continue;
    rows.push({ table: m.table, id: m.id, branch: m.branch, data: { ...m.data } });
    seen.add(key);
  }
  return rows;
}

export function buildWbsSeeds(): WbsSeed[] {
  return WBS_PROJECTS.map((projectId) => ({
    projectId,
    wbs: WBS_TEMPLATE.map(([task, start, end, progress, weight]) => ({ task, start, end, progress, weight })),
  }));
}

export function buildTeamSeeds(): TeamSeed[] {
  return TEAM_SEED.map(([projectId, memberIds]) => ({ projectId, memberIds: [...memberIds] }));
}
