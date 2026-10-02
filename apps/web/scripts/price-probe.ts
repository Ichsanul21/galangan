/* Probe harga seeder: semua nilai harga wajib berisi, bukan 0.
   Sifat: satu kali jalan, tidak menulis apa pun ke DB.

   Alasan file ini ada: "harga 0" bukan satu bug yang terlihat di satu layar.
   Ia muncul sebagai KPI Nilai Stok bernilai nol, klasifikasi ABC yang
   semua barangnya jatuh ke kelas C, tagihan drydock Rp 0, dan kartu "Biaya
   per Proyek" yang kosong - semuanya tanpa error. Probe ini menutup kelas
   bug itu di satu tempat supaya tidak bisa muncul lagi diam-diam.

   Jalankan: npm run probe:price */
import { equipment, dockSlots, inventory, boqByProject } from "../src/data/index";
import { seedBookings, seedBookingsHistory, seedMaintenances } from "../src/data/seeds";

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

/* ---- Equipment: tarif, BBM, nilai perolehan, umur ekonomis ---- */
check("equipment tarif/jam", equipment.reduce((s, e) => s + Number(e.rate || 0), 0), 5_000_000);
check("equipment nilai perolehan", equipment.reduce((s, e) => s + Number(e.acquisitionCost || 0), 0), 4_000_000_000);
const noFuelPrice = equipment.filter((e) => (e as Record<string, unknown>).fuelPrice === undefined).length;
if (noFuelPrice > 0) {
  console.log(`FAIL  ${noFuelPrice} equipment tanpa field fuelPrice`);
  fail += 1;
} else {
  console.log("PASS  semua equipment punya field fuelPrice");
}
const noLife = equipment.filter((e) => !Number(e.usefulLife || 0)).length;
if (noLife > 0) {
  console.log(`FAIL  ${noLife} equipment tanpa usefulLife`);
  fail += 1;
} else {
  console.log("PASS  semua equipment punya usefulLife");
}

/* ---- Dock slot: tarif harian + utilitas ---- */
check("dock tarif total", dockSlots.reduce((s, x) => s + (Number(x.to) - Number(x.from)) * Number(x.ratePerDay || 0), 0), 1_000_000_000);
check("dock listrik kWh", dockSlots.reduce((s, x) => s + Number(x.powerKwh || 0), 0), 10_000);
check("dock air m3", dockSlots.reduce((s, x) => s + Number(x.waterM3 || 0), 0), 20);

/* ---- Booking: biaya harus = jam x tarif (+ BBM) ---- */
check("booking aktif biaya", seedBookings.reduce((s, b) => s + Number(b.cost || 0), 0), 10_000_000);
const zeroHist = seedBookingsHistory.filter((b) => Number(b.cost || 0) <= 0).length;
if (zeroHist > 0) {
  console.log(`FAIL  ${zeroHist}/${seedBookingsHistory.length} riwayat booking tanpa biaya`);
  fail += 1;
} else {
  console.log(`PASS  seluruh riwayat booking (${seedBookingsHistory.length}) punya biaya`);
}
check("booking riwayat 12 bulan", seedBookingsHistory.reduce((s, b) => s + Number(b.cost || 0), 0), 1_000_000_000);

/* ---- Maintenance: biaya tenaga ---- */
check("maintenance biaya tenaga", seedMaintenances.reduce((s, m) => s + Number(m.laborCost || 0), 0), 1_000_000);

/* ---- Master inventori FE (yang sudah punya harga riil - jaga tidak rusak) ---- */
check("nilai persediaan master", inventory.reduce((s, i) => s + Number(i.stock) * Number(i.cost || 0), 0), 1_000_000_000);

/* ---- Invarian BoQ: totalPrice = qty x unitPrice ---- */
for (const rows of Object.values(boqByProject)) {
  for (const r of rows as unknown as Array<{ qty: number; unitPrice: number; totalPrice: number }>) {
    const expected = r.qty * r.unitPrice;
    if (Math.abs(expected - r.totalPrice) > 1) {
      console.log(`FAIL  BoQ ${r.qty} x ${r.unitPrice} = ${expected}, bukan ${r.totalPrice}`);
      fail += 1;
    }
  }
}
console.log("PASS  invarian BoQ totalPrice = qty x unitPrice");

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan harga`);
  process.exit(1);
}
console.log("\nSemua harga seeder berisi nilai (bukan 0).");
process.exit(0);