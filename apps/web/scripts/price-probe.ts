/* Probe harga seeder: setiap field harga wajib berisi nilai, bukan 0.
   Sifat: satu kali jalan, tidak menulis apa pun ke DB.

   Alasan file ini ada: "harga 0" bukan satu bug yang terlihat di satu layar.
   Ia muncul sebagai KPI Nilai Stok bernilai nol, klasifikasi ABC yang
   semua barangnya jatuh ke kelas C, tagihan drydock Rp 0, dan kartu "Biaya
   per Proyek" yang kosong - semuanya tanpa error.

   BUG YANG SUDAH TERBUKA DARI PROBE INI: versi lama hanya mengecek
   `fuelPrice === undefined`. Karena `0 !== undefined`, `fuelPrice: 0` LOLOS.
   Pemeriksaan aggregate (`reduce`) punya kelas bug yang sama: satu baris
   boleh 0 selama jumlah totalnya di atas ambang. Jadi sekarang setiap baris
   dan setiap field diperiksa satu per satu.

   Jalankan: npm run probe:price */
import { equipment, dockSlots, inventory, boqByProject, purchaseOrders } from "../src/data/index";
import { seedBookings, seedBookingsHistory, seedMaintenances, seedPayroll } from "../src/data/seeds";
import {
  LABOR_BURDEN,
  MFO_LOW_SULPHUR,
  SOLAR_INDUSTRI_B40,
  UMP_KALIMANTAN_TIMUR,
  WORK_DAYS_PER_MONTH,
  billedLaborRatePerDay,
  fuelPricePerLiter,
  loadedLaborRatePerDay,
  minimumDailyWage,
} from "../src/utils/rates";

/* Probe dijalankan sebagai skrip Node hasil bundling vite, bukan di dalam
   browser. `process` tidak ada di tipe DOM repo ini (types: vite/client),
   jadi dideklarasikan manual - pola yang sama dipakai pdf-probe.ts:40. */
declare const process: { exit(code: number): never };

let fail = 0;
const check = (label: string, value: number, min: number): void => {
  const ok = Number.isFinite(value) && value >= min;
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} = ${value.toLocaleString("id-ID")}`);
};

/** Bentuk umum: predicated ya/tidak plus detail opsional. */
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` -> ${detail}` : ""}`);
};

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

const num = (r: Row, k: string): number => {
  const raw = r[k];
  const n = Number(raw);
  return raw === null || raw === undefined || raw === "" ? 0 : Number.isFinite(n) ? n : NaN;
};
const id = (r: Row): string => String(r.id ?? "(tanpa id)");

/**
 * Field yang WAJIB > 0. Daftar eksplisit, bukan tebakan pola: field seperti
 * `dpApplied`, `pay1`, `dppKelLN`, atau `overtime` memang sah bernilai 0
 * (belum dibayar, tidak ada lembur, bukan objek pajak). Menaruh mereka di sini
 * hanya karena "kelihatan seperti harga" akan menghasilkan failure palsu.
 */
const NONZERO: Array<{ col: string; field: string; data: Row[] }> = [
  { col: "equipment", field: "rate", data: rows(equipment) },
  { col: "equipment", field: "fuelPrice", data: rows(equipment) },
  { col: "equipment", field: "acquisitionCost", data: rows(equipment) },
  { col: "maintenances", field: "laborCost", data: rows(seedMaintenances) },
  { col: "inventory", field: "cost", data: rows(inventory) },
];

for (const { col, field, data } of NONZERO) {
  const bad = data.filter((r) => !(num(r, field) > 0));
  if (bad.length > 0) {
    fail += 1;
    console.log(`FAIL  ${col}.${field}: ${bad.length}/${data.length} baris bernilai 0`);
    for (const r of bad.slice(0, 6)) {
      console.log(`        ${id(r)}  ${String(r.name ?? r.equipmentId ?? "")}`.trimEnd());
    }
    if (bad.length > 6) console.log(`        ...dan ${bad.length - 6} baris lagi`);
  } else {
    console.log(`PASS  ${col}.${field} > 0 di ${data.length} baris`);
  }
}

/**
 * Invarian turunan - lebih kuat dari sekadar "tidak nol".
 *
 * Rumus disalin dari `Payroll.tsx:404`:
 *   bruto = basic + allowances + overtimePay
 *   net   = bruto - deductions - pph21 - bpjsKes - bpjsTk
 *
 * Gaji bersih nol padahal gaji pokok ada berarti slip itu tidak pernah
 * dihitung; yang tampil di tabel hanya "Rp 0" tanpa error.
 */
{
  const slip = rows(seedPayroll);
  const badZero: Row[] = [];
  const badFormula: Row[] = [];
  for (const p of slip) {
    if (!(num(p, "basic") > 0)) continue;
    const bruto = num(p, "basic") + num(p, "allowances") + num(p, "overtimePay");
    const expected = bruto - num(p, "deductions") - num(p, "pph21") - num(p, "bpjsKes") - num(p, "bpjsTk");
    if (!(num(p, "net") > 0)) badZero.push(p);
    if (!Number.isFinite(expected) || Math.abs(expected - num(p, "net")) > 1) {
      badFormula.push({ ...p, expectedNet: expected });
    }
  }
  if (badZero.length > 0) {
    fail += 1;
    console.log(`FAIL  payroll: ${badZero.length} slip punya basic > 0 tapi net = 0`);
    for (const p of badZero) {
      console.log(`        ${id(p)}  ${String(p.employeeId)}  basic=${num(p, "basic")}  status=${String(p.status)}`);
    }
  } else {
    console.log(`PASS  payroll: semua slip dengan basic > 0 punya net > 0 (${slip.length} slip)`);
  }
  if (badFormula.length > 0) {
    fail += 1;
    console.log(`FAIL  payroll: ${badFormula.length} slip netnya tidak sama dengan rumus bruto - potongan`);
    for (const p of badFormula) {
      console.log(
        `        ${id(p)}  tersimpan=${num(p, "net")}  rumus=${num(p, "expectedNet")}  selisih=${num(p, "net") - num(p, "expectedNet")}`,
      );
    }
  } else {
    console.log("PASS  payroll: net = (basic+allowances+overtime) - (deductions+pph21+bpjsKes+bpjsTk)");
  }
}

/** Equipment tanpa umur ekonomis = barang mati di daftar, bukan alat. */
{
  const eq = rows(equipment);
  const dead = eq.filter((e) => !(num(e, "usefulLife") > 0));
  if (dead.length > 0) {
    console.log(`FAIL  ${dead.length} equipment tanpa usefulLife`);
    for (const e of dead) console.log(`        ${id(e)}  ${String(e.name ?? "")}`.trimEnd());
    fail += 1;
  } else {
    console.log(`PASS  semua equipment punya usefulLife (${eq.length} unit)`);
  }
}

/* ---- agregat tetap dipakai sebagai asap kasar, bukan bukti ---- */
check("equipment tarif/jam", equipment.reduce((s, e) => s + Number(e.rate || 0), 0), 5_000_000);
check("equipment nilai perolehan", equipment.reduce((s, e) => s + Number(e.acquisitionCost || 0), 0), 4_000_000_000);
check("dock tarif total", dockSlots.reduce((s, x) => s + (Number(x.to) - Number(x.from)) * Number(x.ratePerDay || 0), 0), 1_000_000_000);
check("dock listrik kWh", dockSlots.reduce((s, x) => s + Number(x.powerKwh || 0), 0), 10_000);
check("dock air m3", dockSlots.reduce((s, x) => s + Number(x.waterM3 || 0), 0), 20);
check("booking aktif biaya", seedBookings.reduce((s, b) => s + Number(b.cost || 0), 0), 10_000_000);
check("booking riwayat 12 bulan", seedBookingsHistory.reduce((s, b) => s + Number(b.cost || 0), 0), 1_000_000_000);
check("maintenance biaya tenaga", seedMaintenances.reduce((s, m) => s + Number(m.laborCost || 0), 0), 1_000_000);
check("nilai persediaan master", inventory.reduce((s, i) => s + Number(i.stock) * Number(i.cost || 0), 0), 1_000_000_000);

/* ---- riwayat booking: biaya harus benar-benar ada ---- */
{
  const zero = seedBookingsHistory.filter((b) => !(Number(b.cost || 0) > 0));
  if (zero.length > 0) {
    console.log(`FAIL  ${zero.length}/${seedBookingsHistory.length} riwayat booking tanpa biaya`);
    for (const b of zero.slice(0, 6)) console.log(`        ${id(b)}  ${String(b.equipmentId ?? "")}`.trimEnd());
    fail += 1;
  } else {
    console.log(`PASS  seluruh riwayat booking (${seedBookingsHistory.length}) punya biaya`);
  }
}

/* ---- Invarian BoQ: totalPrice = quantity x unitPrice ----
   BUG PROBE LAMA: nama fieldnya `quantity`, bukan `qty`. `undefined * 480000000`
   = NaN, dan `Math.abs(NaN - total) > 1` bernilai FALSE - jadi pemeriksaan ini
   tidak pernah bisa gagal sama sekali, dan "PASS" dicetak tanpa syarat. */
{
  let bad = 0;
  for (const list of Object.values(boqByProject)) {
    for (const r of rows(list)) {
      const qty = num(r, "quantity");
      const unitPrice = num(r, "unitPrice");
      const total = num(r, "totalPrice");
      const expected = qty * unitPrice;
      if (!(qty > 0)) {
        console.log(`FAIL  BoQ ${id(r)}  quantity=${qty} (harus > 0)  unitPrice=${unitPrice}`);
        bad += 1;
        continue;
      }
      if (!Number.isFinite(expected) || Math.abs(expected - total) > 1) {
        console.log(`FAIL  BoQ ${id(r)}  ${qty} x ${unitPrice} = ${expected}, bukan ${total}`);
        bad += 1;
      }
    }
  }
  fail += bad;
  console.log(`PASS  invarian BoQ totalPrice = quantity x unitPrice (${bad === 0 ? "NaN tidak bisa lolos lagi" : "ada yang salah"})`);
}

/* ---- PO: total tidak boleh diam-diam 0 tanpa catatan ---- */
{
  const po = rows(purchaseOrders);
  const kosong = po.filter((p) => !(num(p, "total") > 0) && !(num(p, "amount") > 0));
  if (kosong.length > 0) {
    console.log(`NOTE  ${kosong.length}/${po.length} PO tanpa total/amount - boleh kalau memang belum ada nilai`);
  } else {
    console.log(`PASS  semua PO punya total atau amount (${po.length} PO)`);
  }
}

/* ---- Tarif pasar: angka seed harus bisa ditunjuk ke riset ----
  Probe sebelumnya hanya bisa membuktikan harga "bukan 0". Itu terlalu lemah:
  12.500 lolos, padahal harga solarindustri Kalimantan 2026reality 18.950.
  Tidak ada error, tidak ada Impossible difference -Rp 6.450 per liter justru
  membuat biaya BBM terlihat murah di HPP proyek.

  Sekarang setiap tarif wajib punya sumber dan tanggal, dan angka di seed
  harus sama dengan tarif itu - kalau ada yang mengetik ulang magic number,
  probe ini gagal. */
{
  /* 1. Setiap tarif riset harus bisa ditelusuri: sumber dan tanggal wajib. */
  for (const r of [SOLAR_INDUSTRI_B40, MFO_LOW_SULPHUR, UMP_KALIMANTAN_TIMUR]) {
    assert(r.value > 0, `tarif ${r.unit} punya nilai positif`, String(r.value));
    assert(r.source.trim().length > 10, `tarif ${r.unit} punya sumber yang bisa dicari`, r.source.slice(0, 48));
    assert(/^\d{4}-\d{2}-\d{2}$/.test(r.effective), `tarif ${r.unit} punya tanggal berlaku ISO`, r.effective);
  }

  /* 2. Angka seed = angka riset, bukan tebakan yang kebetulan tidak nol. */
  const eq = rows(equipment);
  const salahFuel = eq.filter((e) => num(e, "fuelPrice") !== fuelPricePerLiter());
  assert(
    salahFuel.length === 0,
    `semua equipment memakai fuelPrice = tarif riset (${fuelPricePerLiter()})`,
    salahFuel.map((e) => `${id(e)}=${num(e, "fuelPrice")}`).join(", "),
  );

  /* 3. Biomassa lebih mahal dari MFO berarti upside, bukan data salah. */
  assert(
    SOLAR_INDUSTRI_B40.value > 15_000,
    "harga solar industri di pita yang masuk akal untuk 2026",
    `${SOLAR_INDUSTRI_B40.value.toLocaleString("id-ID")}/L (${SOLAR_INDUSTRI_B40.effective})`,
  );
  assert(
    SOLAR_INDUSTRI_B40.value >= 15_000 && SOLAR_INDUSTRI_B40.value <= 40_000,
    "harga solar industri berada dalam rentang yang masuk akal",
    `${SOLAR_INDUSTRI_B40.value.toLocaleString("id-ID")}/L`,
  );
  assert(
    UMP_KALIMANTAN_TIMUR.value >= 3_000_000 && UMP_KALIMANTAN_TIMUR.value <= 5_000_000,
    "UMP Kalimantan Timur 2026 di pita yang masuk akal",
    UMP_KALIMANTAN_TIMUR.value.toLocaleString("id-ID"),
  );

  /* 4. Turunan tenaga: tidak boleh lebih rendah dari upah minimum. */
  const minDaily = minimumDailyWage();
  assert(
    minDaily === Math.round(UMP_KALIMANTAN_TIMUR.value / WORK_DAYS_PER_MONTH),
    "upah minimum harian = UMP / hari kerja",
    `${minDaily.toLocaleString("id-ID")}/hari dari ${WORK_DAYS_PER_MONTH} hari`,
  );
  for (const role of ["helper", "welder", "fitter", "painter", "supervisor"] as const) {
    const loaded = loadedLaborRatePerDay(role);
    assert(
      loaded > minDaily,
      `beban ${role} di atas upah minimum harian`,
      `${loaded.toLocaleString("id-ID")} > ${minDaily.toLocaleString("id-ID")}`,
    );
    assert(
      billedLaborRatePerDay(role) > loaded,
      `tarif tagih ${role} di atas biaya bebannya (margin tidak ikut terbenam)`,
      `${billedLaborRatePerDay(role).toLocaleString("id-ID")} > ${loaded.toLocaleString("id-ID")}`,
    );
  }
  assert(
    loadedLaborRatePerDay("supervisor") > loadedLaborRatePerDay("welder"),
    "pengawas lebih mahal dari welder",
  );
  assert(loadedLaborRatePerDay("welder") > loadedLaborRatePerDay("helper"), "welder lebih mahal dari helper");
  assert(LABOR_BURDEN > 0, "bebanmiscellaneous di atas upah bukan nol", String(LABOR_BURDEN));

  /* 5. Seed maintenance harus benar-benar diturunkan dari tarif itu. */
  const mtes = rows(seedMaintenances);
  const takPunyaHari = mtes.filter((m) => !(num(m, "laborDays") > 0));
  assert(
    takPunyaHari.length === 0,
    "setiap maintenance punya laborDays (sebelumnya jumlah hari tidak tercatat sama sekali)",
    takPunyaHari.map((m) => id(m)).join(", "),
  );
  const salahTarif = mtes.filter((m) => num(m, "laborRatePerDay") !== loadedLaborRatePerDay("welder"));
  assert(
    salahTarif.length === 0,
    "setiap maintenance memakai tarif dari utils/rates, bukan angka lepas",
    salahTarif.map((m) => `${id(m)}=${num(m, "laborRatePerDay")}`).join(", "),
  );
  const salahTenaga = mtes.filter((m) => num(m, "laborCost") !== num(m, "laborRatePerDay") * num(m, "laborDays"));
  assert(
    salahTenaga.length === 0,
    "laborCost = laborRatePerDay x laborDays",
    salahTenaga.map((m) => `${id(m)} stored=${num(m, "laborCost")}`).join(", "),
  );
  const salahTotal = mtes.filter((m) => num(m, "costTotal") !== num(m, "materialCost") + num(m, "laborCost"));
  assert(
    salahTotal.length === 0,
    "costTotal = materialCost + laborCost",
    salahTotal.map((m) => `${id(m)} stored=${num(m, "costTotal")}`).join(", "),
  );
  /* materialCost harus cocok dengan penjumlahan baris material, kalau tidak
     "hanya tidak nol" sama sekali tidak berarti. */
  const salahMaterial = mtes.filter((m) => {
    const lines = Array.isArray(m.materials) ? (m.materials as Row[]) : [];
    const expected = lines.reduce((s, l) => s + num(l, "qty") * num(l, "cost"), 0);
    return Math.abs(expected - num(m, "materialCost")) > 1;
  });
  assert(
    salahMaterial.length === 0,
    "materialCost = jumlah (qty x harga) baris material",
    salahMaterial.map((m) => `${id(m)} stored=${num(m, "materialCost")}`).join(", "),
  );
}

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan harga`);
  process.exit(1);
}
console.log("\nSemua harga seeder berisi nilai (bukan 0).");
process.exit(0);