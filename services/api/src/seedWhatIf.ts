import { exec, q, closeDb } from "./db.js";
import { seedUsers } from "./auth.js";

// Generator data simulasi "what-if": >=100 baris per koleksi, semua ID
// berprefix SIM-, saling tertaut koheren (proyek→WBS→PO→GR→invoice→lunas,
// karyawan→absen→gaji→pajak). BUKAN data dokumen (lihat seed.ts+seedBulk.ts).
// Guard: tolak bila DB tidak kosong, kecuali flag --force.
// Jalankan: npm run seed:whatif [-- --force]
// Deterministik (PRNG seed tetap) agar hasil stabil antar run.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260929);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));
const pad = (n: number, w = 3): string => String(n).padStart(w, "0");
const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];

const VESSELS = ["TB SIM Aji", "BG SIM Barokah", "TB SIM Cakra", "KM SIM Damai", "BG SIM Elang", "TB SIM Fajar", "KM SIM Gagak", "BG SIM Halim", "TB SIM Iman", "KM SIM Jaya", "BG SIM Kencana", "TB SIM Lestari"];
const CLIENTS = ["PT Simulasi Samudra", "PT Contoh Bahari", "PT Dummy Pelindo", "PT Uji Coba Line", "PT Fiktif Marine"];
const GOODS = ["Plat Baja 12mm", "Pipa Schedule 40", "Cat Epoxy Primer", "Baut Marine M20", "Kabel Listrik", "Anoda Zink", "Elektroda LB-52U", "Oli Mesin SAE-40", "Thinner", "Kawat Las"];
const UNITS = ["pcs", "kg", "liter", "meter", "batang", "set"];
const FIRST = ["Agus", "Budi", "Citra", "Dedi", "Eka", "Fajar", "Gita", "Hadi", "Irma", "Joko", "Kirana", "Lukman"];
const LAST = ["Saputra", "Wijaya", "Pratama", "Kusuma", "Santoso", "Nugroho", "Rahayu", "Setiawan"];
const STATUSES = ["Diajukan", "Disetujui", "Ditolak"];

interface Row { table: string; id: string; branch: string; data: Record<string, unknown> }

function build(): { rows: Row[]; wbsRows: Array<{ projectId: string; wbs: unknown }>; teamRows: Array<{ projectId: string; memberIds: string[] }> } {
  const rows: Row[] = [];
  const put = (table: string, id: string, data: Record<string, unknown>, branch = ""): void => {
    rows.push({ table, id, branch, data: { id, ...data } });
  };

  // --- branches (100) ---
  const branchCities = ["Samarinda", "Balikpapan", "Banjarmasin", "Makassar", "Surabaya", "Jakarta"];
  for (let i = 1; i <= 100; i++) {
    put("branches", `SIM-BR-${pad(i)}`, { name: `${branchCities[i % branchCities.length]} ${pad(Math.ceil(i / branchCities.length), 2)}` });
  }

  // --- vendors (100): 60% Baja & Struktur dsb ---
  const VCats = ["Baja & Struktur", "Mesin & Engine", "Cat & Coating", "Rigging & Wire", "Listrik", "Jasa"];
  const vendors: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const id = `SIM-VND-${pad(i)}`;
    vendors.push(id);
    put("vendors", id, {
      name: `${pick(["PT", "CV"])} Simulasi ${pick(LAST)} ${pick(["Steel", "Marine", "Teknik", "Bahari", "Jaya"])}`,
      cat: pick(VCats), onTime: int(70, 99), quality: int(70, 99), po: int(0, 20), status: "Aktif",
    });
  }

  // --- clients (100) ---
  const clients: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const id = `SIM-CLN-${pad(i)}`;
    clients.push(id);
    put("clients", id, { name: `${pick(CLIENTS)} ${pad(i, 2)}`, fleet: int(1, 12), rating: int(60, 98), since: int(2015, 2026) });
  }

  // --- vessels (100) ---
  const vessels: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const id = `SIM-VSL-${pad(i)}`;
    vessels.push(id);
    put("vessels", id, {
      name: `${VESSELS[(i - 1) % VESSELS.length]} ${pad(Math.ceil(i / VESSELS.length), 2)}`,
      type: pick(["Tugboat", "Barge", "Landing Craft", "Ferry"]), owner: clients[i % clients.length],
      gt: int(200, 3000), status: "Aktif",
      certificates: [{ name: "Klas BKI", expires: iso(2027, int(1, 12), int(1, 28)) }],
    });
  }

  // --- employees (100) ---
  const employees: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const id = `SIM-EMP-${pad(i)}`;
    employees.push(id);
    const nm = `${pick(FIRST)} ${pick(LAST)}`;
    put("employees", id, {
      name: nm, username: `sim.user${i}`, role: pick(["Produksi", "QC", "Gudang", "Finance", "HR", "Proyek"]),
      email: `sim.user${i}@example.test`, isActive: true, basic: int(3500000, 15000000),
    });
  }

  // --- projects (100) + wbs --- + clients requests/quotations/contracts/clientPos/communications
  const wbsRows: Array<{ projectId: string; wbs: unknown }> = [];
  const teamRows: Array<{ projectId: string; memberIds: string[] }> = [];
  for (let i = 1; i <= 100; i++) {
    const pid = `SIM-PRJ-${pad(i)}`;
    const vessel = vessels[(i * 7) % vessels.length];
    const client = clients[(i * 3) % clients.length];
    const status = i <= 60 ? pick(["Berjalan", "Berjalan", "Berjalan", "Terlambat"]) : pick(["Selesai", "Berjalan", "Perencanaan"]);
    put("projects", pid, {
      vessel, client, type: pick(["New Build", "Repair", "Retrofit"]), status,
      budget: int(500, 9000) * 1000000, actual: int(100, 4000) * 1000000,
      progress: status === "Selesai" ? 100 : int(5, 95),
      start: iso(2026, int(1, 9), int(1, 28)), end: iso(2026, int(6, 12), int(1, 28)),
    });
    const tasks = ["Persiapan Dock", "Blasting & Painting", "Plat & Struktur", "Pipa & Sistem", "Listrik", "Sea Trial"];
    wbsRows.push({
      projectId: pid,
      wbs: tasks.map((t, k) => ({ task: `${pad(k + 1, 2)} ${t}`, weight: k === 0 ? 20 : 16, progress: status === "Selesai" ? 100 : int(0, 100) })),
    });
    teamRows.push({ projectId: pid, memberIds: [employees[i % 100], employees[(i + 1) % 100]] });

    // CRM chain per project (subset coerced to reach 100 each below via extra loop)
    if (i <= 34) {
      const qid = `SIM-QT-${pad(i)}`;
      put("quotations", qid, { vessel, client, type: "Repair", value: int(500, 9000) * 1000000, stage: "Menang", date: iso(2026, int(1, 8), 10) });
      put("contracts", `SIM-KTR-${pad(i)}`, { quotationId: qid, projectId: pid, value: int(500, 9000) * 1000000, status: "Aktif" });
      put("requests", `SIM-REQ-${pad(i)}`, { vessel, client, kind: "Repair Request", scope: "Docking + repair", value: int(500, 9000) * 1000000, status: "Disetujui", date: iso(2026, int(1, 8), 5) });
      put("clientPos", `SIM-CPO-${pad(i)}`, { quotationId: qid, projectId: pid, amount: int(500, 9000) * 1000000 });
      put("communications", `SIM-COM-${pad(i)}`, { quotationId: qid, channel: "Email", date: iso(2026, int(1, 8), 12), summary: "Simulasi tindak lanjut", by: "Sim User" });
    }
  }
  // top-up CRM tables to 100
  for (let i = 35; i <= 100; i++) {
    put("quotations", `SIM-QTX-${pad(i)}`, { vessel: pick(vessels), client: pick(clients), type: "Repair", value: int(300, 5000) * 1000000, stage: pick(["Lead", "Penawaran", "Negosiasi", "Menang", "Kalah"]), date: iso(2026, int(1, 9), 15) });
    put("requests", `SIM-RQX-${pad(i)}`, { vessel: pick(vessels), client: pick(clients), kind: "Repair Request", scope: "Simulasi", value: int(300, 5000) * 1000000, status: pick(["Baru", "Disetujui", "Ditolak"]), date: iso(2026, int(1, 9), 3) });
    put("clientPos", `SIM-CPX-${pad(i)}`, { quotationId: `SIM-QTX-${pad(i)}`, projectId: `SIM-PRJ-${pad(i)}`, amount: int(300, 5000) * 1000000 });
    put("communications", `SIM-CMX-${pad(i)}`, { quotationId: `SIM-QTX-${pad(i)}`, channel: pick(["Email", "Telepon", "Meeting"]), date: iso(2026, int(1, 9), 20), summary: "Simulasi", by: "Sim User" });
    put("contracts", `SIM-KTX-${pad(i)}`, { quotationId: `SIM-QTX-${pad(i)}`, projectId: `SIM-PRJ-${pad(i)}`, value: int(300, 5000) * 1000000, status: pick(["Aktif", "Selesai"]) });
  }

  // --- procurement chain: requisitions(100) -> rfqs(100) -> purchaseOrders(100) -> payables
  for (let i = 1; i <= 100; i++) {
    const prid = `SIM-PR-${pad(i)}`;
    const item = pick(GOODS);
    const amt = int(5, 800) * 1000000;
    const st = i <= 70 ? pick(["Disetujui", "Disetujui", "Sudah PO"]) : pick(STATUSES);
    put("requisitions", prid, { item, by: employees[i % 100], amount: amt, status: st });
    const rfid = `SIM-RFQ-${pad(i)}`;
    const qv = [int(4, 750) * 1000000, int(4, 750) * 1000000, int(4, 750) * 1000000];
    put("rfqs", rfid, {
      prId: prid, item, vendors: [vendors[i % 100], vendors[(i + 1) % 100], vendors[(i + 2) % 100]],
      status: i <= 60 ? "Diputuskan" : pick(["Draf", "Terkirim", "Evaluasi"]),
      quotes: qv.map((p, k) => ({ vendor: vendors[(i + k) % 100], price: p, eta: iso(2026, int(6, 12), 15) })),
      winner: i <= 60 ? vendors[i % 100] : "",
    });
    const poid = `SIM-PO-${pad(i)}`;
    const qty = int(1, 50);
    const price = Math.round(amt / qty);
    const post = i <= 55 ? pick(["Disetujui", "Dikirim", "Diterima"]) : pick(["Draft", "Diajukan", "Ditolak"]);
    put("purchaseOrders", poid, {
      vendor: vendors[i % 100], item, qty, unit: pick(UNITS), price, amount: amt,
      status: post, date: iso(2026, int(1, 9), 10), eta: iso(2026, int(7, 12), 20),
      docNo: `${pad(i)}/PO-SIM/SMD/IX/2026`,
      receivedQty: post === "Diterima" ? qty : post === "Dikirim" ? Math.floor(qty / 2) : 0,
      lines: [{ name: item, qty, unit: "pcs", price }],
    });
    const pst = post === "Diterima" ? "Lunas" : pick(["Belum Dibayar", "Belum Dibayar", "Lunas"]);
    put("payables", `SIM-AP-${pad(i)}`, {
      v: vendors[i % 100], po: `${poid} / ${pad(i)}/PO-SIM/SMD/IX/2026`, amt, openAwal: amt,
      due: iso(2026, int(8, 12), 28), pph: "2%", st: pst, vessel: pick(vessels), item,
      pay1: pst === "Lunas" ? amt : 0, pay1date: pst === "Lunas" ? iso(2026, 9, 10) : "",
    });
  }

  // --- invoices (100, linked to projects) ---
  for (let i = 1; i <= 100; i++) {
    const pid = `SIM-PRJ-${pad(((i * 13) % 100) + 1)}`;
    const jasa = int(100, 1500) * 1000000;
    const mat = int(100, 1200) * 1000000;
    const total = jasa + mat;
    const dpp = Math.round((total * 11) / 12);
    const ppn = Math.round(dpp * 0.12);
    const pph = Math.round(jasa * 0.02);
    const st = i <= 55 ? pick(["Belum Dibayar", "Belum Dibayar", "Lunas"]) : pick(["Draft", "Diajukan", "Disetujui", "Terlambat"]);
    put("invoices", `SIM-INV-${pad(i)}`, {
      client: clients[i % 100], project: pid, noInv: `${pad(i)}/INV-SIM/SMD/IX/2026`,
      vessel: pick(vessels), jasaTotal: jasa, matTotal: mat, amount: total, dpp,
      ppnAmt: ppn, pphAmt: pph, grandTotal: total + ppn - pph, skdt: false,
      ppnRate: 12, pphRate: 2, due: iso(2026, int(9, 12), 25), status: st,
      paymentTerm: "NET 30", billingType: "Milestone", paidAt: st === "Lunas" ? iso(2026, 9, 12) : "",
    });
  }

  // --- inventory (100) + movements (100) ---
  const invIds: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const id = `SIM-BRG-${pad(i)}`;
    invIds.push(id);
    const stock = int(0, 500);
    put("inventory", id, {
      name: `${pick(GOODS)} SIM-${pad(i)}`, category: pick(["Baja", "Mesin", "Cat", "Pipa", "Listrik", "Umum"]),
      sku: `SIMSKU${pad(i, 4)}`, warehouse: pick(["Gudang Baja A", "Gudang Mesin", "Gudang B"]),
      stock, minStock: int(5, 50), unit: pick(UNITS), cost: int(10000, 5000000), avgCost: int(10000, 5000000),
    });
  }
  for (let i = 1; i <= 100; i++) {
    const it = invIds[i % 100];
    const isIn = i % 2 === 0;
    put("movements", `SIM-MV-${pad(i, 4)}`, {
      item: it, itemId: it, type: isIn ? "Penerimaan" : "Pengeluaran", qty: int(1, 60),
      by: isIn ? vendors[i % 100] : `SIM-PRJ-${pad((i % 100) + 1)}`, date: iso(2026, int(1, 9), int(1, 28)),
      tone: isIn ? "in" : "out",
    });
  }

  // --- HR: attendance (100), leaves (100), payroll (100), trainings (100), timesheets (100) ---
  for (let i = 1; i <= 100; i++) {
    const emp = employees[i % 100];
    put("attendance", `SIM-ABS-${pad(i)}`, {
      employeeId: emp, date: iso(2026, 9, int(1, 28)), status: pick(["Hadir", "Hadir", "Hadir", "Izin", "Sakit"]),
      checkIn: "08:00", checkOut: "17:00", overtime: pick([0, 0, 0, 1, 2]),
    });
    put("leaves", `SIM-CUTI-${pad(i)}`, {
      employeeId: emp, type: pick(["Tahunan", "Sakit", "Izin"]), from: iso(2026, 9, 5), to: iso(2026, 9, int(5, 8)),
      days: int(1, 4), status: pick(["Diajukan", "Disetujui", "Disetujui", "Ditolak"]),
    });
    const basic = int(4000000, 12000000);
    const net = Math.round(basic * 0.9);
    put("payroll", `SIM-PAY-${pad(i)}`, {
      employeeId: emp, period: "2026-09", type: "Gaji", basic, allowances: [{ label: "Tunjangan", amount: 1000000 }],
      overtimePay: 0, deductions: Math.round(basic * 0.05), pph21: Math.round(basic * 0.05),
      bpjsKesKar: Math.round(basic * 0.01), bpjsTkKar: Math.round(basic * 0.02), net,
      status: i <= 60 ? pick(["Dibayar", "Dibayar", "Disetujui"]) : "Draft",
    });
    put("trainings", `SIM-TRN-${pad(i)}`, {
      title: `Pelatihan K3 SIM-${pad(i)}`, date: iso(2026, int(3, 9), 10), participants: [emp], status: pick(["Terjadwal", "Selesai"]),
    });
    put("timesheets", `SIM-TS-${pad(i)}`, {
      woId: `SIM-WO-${pad((i % 100) + 1)}`, employeeId: emp, date: iso(2026, 9, int(1, 28)), hours: int(4, 10),
    });
  }

  // --- subcontractors (100) + workOrders (100) + termins (100) ---
  for (let i = 1; i <= 100; i++) {
    const sub = `SIM-SUB-${pad(i)}`;
    put("subcontractors", sub, {
      name: `Borongan SIM ${pick(LAST)}`, rating: int(70, 98), k3: pick(["A", "A", "B", "C"]), status: "Aktif",
    });
    const wo = `SIM-WO-${pad(i)}`;
    const prog = i <= 60 ? 100 : int(0, 90);
    put("workOrders", wo, {
      sub, project: `SIM-PRJ-${pad((i % 100) + 1)}`, scope: `Pekerjaan simulasi ${pad(i)}`,
      progress: prog, status: prog === 100 ? "Selesai" : "Berjalan", date: iso(2026, int(2, 8), 1),
    });
    const amt = int(10, 300) * 1000000;
    put("termins", `SIM-TRM-${pad(i)}`, {
      sub, woId: wo, milestone: `Termin SIM-${pad(i)}`, amount: amt,
      pphPct: 0.5, pphAmt: Math.round(amt * 0.005), status: i <= 55 ? pick(["Lunas", "Lunas", "Disetujui"]) : pick(["Draf", "Diajukan"]),
      date: iso(2026, int(4, 9), 1),
    });
  }

  // --- drydocks (100) + slots (100) ---
  const docks: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const id = `SIM-DD-${pad(i)}`;
    docks.push(id);
    put("drydocks", id, { name: `Dock Simulasi ${pad(i)} - Panjang ${60 + (i % 8) * 10}m`, capacity: `${60 + (i % 8) * 10}m`, status: pick(["Terpakai", "Kosong"]) });
  }
  for (let i = 1; i <= 100; i++) {
    const from = int(1, 70);
    put("dockSlots", `SIM-DS-${pad(i)}`, {
      dockId: docks[i % 10], project: `SIM-PRJ-${pad((i % 100) + 1)}`, vessel: pick(VESSELS),
      from, to: from + int(5, 20), priority: pick(["Normal", "Normal", "Tinggi", "Kritis"]),
      ratePerDay: 5000000, dsRef: `${pad(i)}/DS-SIM/SMD/IX/2026`, status: "Terjadwal",
    });
  }

  // --- equipment (100) + bookings (100) + calibrations (100) ---
  for (let i = 1; i <= 100; i++) {
    const eq = `SIM-EQP-${pad(i)}`;
    put("equipment", eq, {
      name: `${pick(["Crane", "Welding Set", "Kompresor", "Genset", "Forklift"])} SIM-${pad(i)}`,
      code: `SIM-${pad(i, 4)}`, category: "Alat Berat", status: pick(["Tersedia", "Tersedia", "Terpakai", "Maintenance"]),
      util: int(30, 95), rate: 1500000,
    });
    put("bookings", `SIM-BK-${pad(i)}`, {
      equip: eq, proyek: `SIM-PRJ-${pad((i % 100) + 1)}`, jam: "08:00-17:00",
      mulai: "08:00", selesai: "17:00", date: iso(2026, 9, int(1, 28)),
      priority: "Normal", status: pick(["Aktif", "Selesai"]),
    });
    put("calibrations", `SIM-CAL-${pad(i)}`, {
      equipmentId: eq, item: "Pressure Gauge", due: iso(2026, int(10, 12), 15), status: pick(["Terjadwal", "Selesai"]),
    });
  }

  // --- QC: ncr (100) + incidents (100) + inspections (100) + drawings (100) + toolbox (100) + walks (100) + auditPlans (100) ---
  for (let i = 1; i <= 100; i++) {
    const pid = `SIM-PRJ-${pad((i % 100) + 1)}`;
    put("ncr", `SIM-NCR-${pad(i)}`, {
      project: pid, vessel: pick(VESSELS), type: pick(["Welding", "Painting", "Struktur"]),
      severity: pick(["Minor", "Major", "Critical"]), status: i <= 60 ? pick(["Tertutup", "Tertutup", "Dalam Perbaikan"]) : "Terbuka",
      issue: `Simulasi temuan ${pad(i)}`, due: iso(2026, int(9, 12), 20),
    });
    put("incidents", `SIM-INC-${pad(i)}`, {
      project: pid, type: pick(["Nearmiss", "Kecelakaan Ringan", "Kebakaran Kecil"]),
      date: iso(2026, int(1, 9), int(1, 28)), location: pick(["Dock 1", "Workshop", "Gudang"]), desc: `Simulasi insiden ${pad(i)}`,
    });
    put("inspections", `SIM-INSP-${pad(i)}`, {
      project: pid, point: `Titik SIM-${pad(i)}`, itp: `ITP-${pad(i, 4)}`, date: iso(2026, int(1, 9), 12),
      inspector: employees[i % 100], sampleSize: 50, defectsAllowed: 1, defectsFound: i % 7 === 0 ? 3 : 0,
      status: i % 7 === 0 ? "NCR" : "Lulus",
    });
    put("drawings", `SIM-DRW-${pad(i)}`, {
      project: pid, title: `Gambar SIM-${pad(i)}`, revision: "A", status: pick(["Diajukan", "Disetujui", "Distribusi"]),
      holder: employees[i % 100], updated: iso(2026, 8, 15),
    });
    put("toolbox", `SIM-TBM-${pad(i)}`, {
      project: pid, topic: `TBM simulasi ${pad(i)}`, date: iso(2026, 9, int(1, 28)), attendees: int(5, 30),
    });
    put("walks", `SIM-WLK-${pad(i)}`, {
      project: pid, area: pick(["Dock", "Workshop", "Gudang"]), date: iso(2026, 9, int(1, 28)),
      findings: i % 5 === 0 ? 2 : 0, status: pick(["Selesai", "Terjadwal"]),
    });
    put("auditPlans", `SIM-AUD-${pad(i)}`, {
      date: iso(2026, int(10, 12), 10), area: pick(["Produksi", "Gudang", "QC"]), auditor: employees[i % 100],
      findings: int(0, 5), status: pick(["Terjadwal", "Selesai"]),
    });
  }

  // --- vessels surveys/warranties/trials + services/spareparts/boq ---
  for (let i = 1; i <= 100; i++) {
    const v = vessels[i % 100];
    put("surveys", `SIM-SRV-${pad(i)}`, {
      vessel: v, type: pick(["Tahunan", "Docking", "Khusus"]), date: iso(2026, int(1, 9), 10), inspector: employees[i % 100],
    });
    put("warranties", `SIM-WAR-${pad(i)}`, {
      vessel: v, item: pick(GOODS), start: iso(2026, 1, 5), months: 12, status: "Aktif",
    });
    put("trials", `SIM-TRL-${pad(i)}`, {
      vessel: v, parameter: "Kecepatan", hasil: pick(["Lolos", "Ulang"]), date: iso(2026, int(6, 9), 1),
    });
    put("services", `SIM-SVC-${pad(i)}`, {
      vessel: v, projectId: `SIM-PRJ-${pad((i % 100) + 1)}`, description: `Servis simulasi ${pad(i)}`,
      date: iso(2026, int(2, 8), 1), cost: int(5, 100) * 1000000, status: pick(["Scheduled", "Done"]),
    });
    put("spareparts", `SIM-SPR-${pad(i)}`, {
      vessel: v, name: pick(GOODS), stock: int(0, 100), minStock: 10, usedDate: "", technician: "",
    });
    put("boq", `SIM-BOQ-${pad(i)}`, {
      projectId: `SIM-PRJ-${pad((i % 100) + 1)}`, item: pick(GOODS), quantity: int(1, 100),
      unitPrice: int(100000, 5000000), status: pick(["Draft", "Diajukan", "Disetujui"]),
    });
  }

  // --- CRM extra: surveys? (no table) trainings done; risks/changeOrders/bast/trials done partially ---
  for (let i = 1; i <= 100; i++) {
    const pid = `SIM-PRJ-${pad((i % 100) + 1)}`;
    put("risks", `SIM-RSK-${pad(i)}`, {
      projectId: pid, title: `Risiko simulasi ${pad(i)}`, likelihood: pick(["Rendah", "Sedang", "Tinggi"]),
      impact: pick(["Rendah", "Sedang", "Tinggi"]), status: pick(["Aktif", "Dipantau", "Tertutup"]),
    });
    put("changeOrders", `SIM-CO-${pad(i)}`, {
      projectId: pid, title: `CO simulasi ${pad(i)}`, impact: (i % 2 === 0 ? 1 : -1) * int(10, 500) * 1000000,
      status: pick(["Diajukan", "Disetujui", "Ditolak", "Diterapkan"]),
    });
    put("bast", `SIM-BAST-${pad(i)}`, {
      projectId: pid, milestone: `Serah terima SIM-${pad(i)}`, tanggal: iso(2026, 9, 1),
      penandatangan: employees[i % 100], amount: int(100, 1500) * 1000000,
      status: i <= 50 ? "Disetujui" : pick(["Draf", "Diajukan"]),
    });
  }

  // --- documents (100) ---
  for (let i = 1; i <= 100; i++) {
    put("documents", `SIM-DOC-${pad(i)}`, {
      title: `Dokumen simulasi ${pad(i)}`, type: pick(["Laporan", "Kontrak", "Drawing", "SOP"]),
      project: `SIM-PRJ-${pad((i % 100) + 1)}`, vessel: pick(VESSELS), version: "v1.0",
      status: pick(["Berlaku", "Draft", "Diajukan"]), updated: iso(2026, 8, 20), owner: employees[i % 100],
    });
  }

  // --- settings/coa/journals/assets/activities/taxPeriods ---
  for (let i = 1; i <= 100; i++) {
    put("settings", `SIM-SET-${pad(i)}`, { key: `SIM_KEY_${pad(i)}`, value: i * 1000, label: `Simulasi ${pad(i)}`, group: "simulasi" });
  }
  const coaSeed: Array<[string, string]> = [["1-100", "Kas"], ["1-121", "Bank"], ["2-110", "Hutang"], ["4-101", "Pendapatan"], ["5-101", "Beban"]];
  for (let i = 1; i <= 100; i++) {
    const [kode, nama] = coaSeed[i % coaSeed.length];
    put("coa", `SIM-COA-${pad(i)}`, { kode: `${kode}.${pad(i, 2)}`, nama: `${nama} SIM-${pad(i)}`, dk: i % 2 ? "D" : "K", nrlr: "LR" });
    put("journals", `SIM-JU-${pad(i)}`, {
      date: iso(2026, 9, int(1, 28)), uraian: `Jurnal simulasi ${pad(i)}`,
      lines: [{ akun: "1-100", db: int(1, 50) * 1000000, kr: 0 }, { akun: "4-101", db: 0, kr: int(1, 50) * 1000000 }],
      status: "Posted",
    });
    put("assets", `SIM-AST-${pad(i)}`, {
      nama: `Aset simulasi ${pad(i)}`, kelompok: "B", nilai: int(50, 2000) * 1000000, susutTahun: int(5, 100) * 1000000,
    });
    put("activities", `SIM-ACT-${pad(i, 4)}`, {
      actor: employees[i % 100], action: pick(["membuat", "mengubah", "membayar", "menyetujui"]),
      target: `SIM-PRJ-${pad((i % 100) + 1)}`, module: pick(["Proyek", "Keuangan", "Procurement"]), time: iso(2026, 9, int(1, 28)),
    });
    if (i <= 12) {
      put("taxPeriods", `SIM-TAX-2026-${pad(i, 2)}`, { period: `2026-${pad(i, 2)}`, status: i <= 8 ? "Lapor" : "Draft" });
    }
  }
  // taxPeriods top-up to 100
  for (let i = 13; i <= 100; i++) {
    put("taxPeriods", `SIM-TAXS-${pad(i)}`, { period: `2025-${pad(((i % 12) + 1), 2)}`, status: "Lapor" });
  }

  return { rows, wbsRows, teamRows };
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  // Guard: tolak bila DB tidak kosong (kecuali --force).
  let existing = 0;
  try {
    const r = await q<{ c: number }>("SELECT COUNT(*) AS c FROM projects");
    existing = Number(r[0]?.c ?? 0);
  } catch {
    existing = 0;
  }
  const simCount = await q<{ c: number }>("SELECT COUNT(*) AS c FROM projects WHERE id LIKE 'SIM-%'").catch(() => [{ c: 0 }]);
  if (existing > 0 && !force) {
    console.error(`[seed:whatif] ditolak: tabel projects sudah berisi ${existing} baris (SIM: ${simCount[0]?.c ?? 0}). Gunakan --force untuk lanjut (skip-if-exists per id).`);
    process.exit(2);
  }
  await seedUsers(exec, q);
  const { rows, wbsRows, teamRows } = build();
  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const total = rows.length + wbsRows.length + teamRows.length;
  let done = 0;
  const bump = (): void => {
    done += 1;
    if (done % 2000 === 0 || done === total) {
      console.log(`[seed:whatif] ${done}/${total} (${Math.round((done / total) * 100)}%) ins=${inserted} skip=${skipped}`);
    }
  };
  for (const row of rows) {
    const exists = await q(`SELECT id FROM ${row.table} WHERE id = ?`, [row.id]);
    if (exists.length > 0) { skipped += 1; bump(); continue; }
    try {
      await exec(`INSERT INTO ${row.table} (id, branch, data, updated_at) VALUES (?, ?, ?, ?)`, [
        row.id, row.branch, JSON.stringify(row.data), now,
      ]);
      inserted += 1;
    } catch {
      skipped += 1;
    }
    bump();
  }
  for (const w of wbsRows) {
    const exists = await q("SELECT project_id FROM wbs_by_project WHERE project_id = ?", [w.projectId]);
    if (exists.length === 0) {
      await exec("INSERT INTO wbs_by_project (project_id, data) VALUES (?, ?)", [w.projectId, JSON.stringify(w.wbs)]);
      inserted += 1;
    } else skipped += 1;
    bump();
  }
  for (const t of teamRows) {
    const exists = await q("SELECT project_id FROM team_by_project WHERE project_id = ?", [t.projectId]);
    if (exists.length === 0) {
      await exec("INSERT INTO team_by_project (project_id, data) VALUES (?, ?)", [t.projectId, JSON.stringify(t.memberIds)]);
      inserted += 1;
    } else skipped += 1;
    bump();
  }
  // audit_log + sessions (di luar COLLECTIONS generik): 100 baris SIM-.
  try {
    const uids = await q<{ id: string; username: string }>("SELECT id, username FROM users");
    const actors = uids.length > 0 ? uids : [{ id: "SIM-USR-001", username: "sim.user1" }];
    for (let i = 1; i <= 100; i++) {
      const u = actors[i % actors.length];
      const aid = `SIM-AUD-${pad(i, 4)}`;
      const exA = await q("SELECT id FROM audit_log WHERE id = ?", [aid]);
      if (exA.length === 0) {
        await exec("INSERT INTO audit_log (id, actor, action, table_name, row_id, diff, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
          aid, u.username, pick(["create", "update", "login"]), pick(["projects", "invoices", "users"]),
          `SIM-PRJ-${pad((i % 100) + 1)}`, JSON.stringify({ sim: true }), "127.0.0.1", iso(2026, 9, int(1, 28)),
        ]);
        inserted += 1;
      } else skipped += 1;
      const sid = `SIM-SES-${pad(i, 4)}`;
      const exS = await q("SELECT id FROM sessions WHERE id = ?", [sid]).catch(() => [{ id: "x" }]);
      if (exS.length === 0) {
        await exec("INSERT INTO sessions (id, user_id, username, role, login_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
          sid, u.id, u.username, "Simulasi", iso(2026, 9, 20), iso(2026, 9, int(20, 28)), "127.0.0.1", "SIM-agent",
        ]).catch(() => undefined);
        inserted += 1;
      } else skipped += 1;
    }
  } catch (e) {
    console.error("[seed:whatif] audit/sessions dilewati:", (e as Error).message);
  }
  console.log(`[seed:whatif] done (inserted=${inserted} skipped=${skipped})`);
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("seedWhatIf.ts") || entry.endsWith("seedWhatIf.js")) {
  main()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch((err) => {
      console.error("[seed:whatif] failed:", err);
      process.exit(1);
    });
}
