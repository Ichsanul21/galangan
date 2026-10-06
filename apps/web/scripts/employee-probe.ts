/* Probe H3: EmployeePicker / employeeOptions.
   Sifat: satu kali jalan, hanya menghitung; tidak menulis apa pun.

   Aliasan file ini ada karena H3 kelihatan selesai begitu `<input>` berubah
   jadi `<EntityPicker>`, padahal dua hal bisa rusak tanpa error kompilasi:

   1. Opsi ikut memotong nama yang bermargin. `String(e.name ?? "").trim()`
      yang lupa ditulis jadi `String(e.name)` memunculkan pilihan dengan
      spasi depan; nilainya disimpan apa adanya, lalu cocoknya gagal diam-diam
      - persis masalah yang H3 seharusnya perbaiki.
   2. Opsi keluar dengan nama yang dinormalisasi dengan cara berbeda dari
      pembacaan di tempat lain, jadi "Agus " lolos sebagai opsi tapi tidak
      pernah dianggap sama oleh mana pun.
   3. `isKnownEmployee` harus case-insensitive, karena form lama bisa
      menyimpan "agus setiawan" dan users tetap harus bisa menyimpan/membaca
      data lama itu tanpa dibersihkan duluan.

   Jalankan: npm run probe:employee */
import { employeeOptions, isKnownEmployee } from "../src/utils/employeeOptions";
declare const process: { exit(code: number): never };

let lulus = 0;
let gagal = 0;

function cek(nama: string, ok: boolean, detail = ""): void {
  if (ok) {
    lulus++;
  } else {
    gagal++;
    console.error(`  GAGAL ${nama}${detail ? ` - ${detail}` : ""}`);
  }
}

type E = Record<string, unknown>;

const employees: E[] = [
  { id: "EMP001", name: "Agus Setiawan", role: "Welder", nip: "19850101" },
  { id: "EMP002", name: "  Budi Santoso  ", role: "QC Inspector" },
  { id: "EMP003", name: "Siti Rahayu", role: "Project Manager", nip: "19900202" },
  { id: "EMP004", name: "", role: "Orphan" },
  { id: "EMP005", role: "Tanpa Nama" },
  { id: "EMP006", name: "   ", role: "Spasi dobel" },
];

/* Nama di-trim di kedua sisi: opsi dan nilai yang disimpan harus identik,
   kalau tidak maka selecting "Agus Setiawan" menyimpan string berbeda dari
   yang dibaca modul lain. */
const opts = employeeOptions(employees as never);
cek("opsi tidak memuat nama kosong", opts.every((o) => o.value.trim() !== ""), JSON.stringify(opts.map((o) => o.value)));
cek("nama.Trim() dipakai", opts.some((o) => o.value === "Budi Santoso"), JSON.stringify(opts.map((o) => o.value)));
cek("baris tanpa nama dilewati", opts.length === 3, `panjang=${opts.length}`);

/* Nilai opsi harus persis sama dengan label supaya picker menampilkan dan
   menyimpan string yang sama. */
cek("value === label", opts.every((o) => o.value === o.label));

/* Hint harus bisa searched: role dan NIP adalah dua hal yang paling sering
   diketik user ketika tidak ingat nama. */
const budi = opts.find((o) => o.value === "Budi Santoso");
cek("hint berisi role", budi?.hint?.includes("QC Inspector") === true, budi?.hint);
cek("hint berisi id", budi?.hint?.includes("EMP002") === true, budi?.hint);

const siti = opts.find((o) => o.value === "Siti Rahayu");
cek("withNip=false tidak menaruh NIP", siti?.hint?.includes("19900202") === false, siti?.hint);
cek("withNip=false tetap ada role", siti?.hint?.includes("Project Manager") === true, siti?.hint);

const withNip = employeeOptions(employees as never, { withNip: true });
const sitiNip = withNip.find((o) => o.value === "Siti Rahayu");
cek("withNip=true menaruh NIP", sitiNip?.hint?.includes("19900202") === true, sitiNip?.hint);

/* withNip tidak boleh mengubah nilai yang disimpan - hanya hint. */
cek("withNip tidak mengubah value", withNip.every((o) => opts.some((x) => x.value === o.value)));

/* Nilai opsi sudah unik per nama, jadi `find` di dalam picker tidak ambigu
   meski urutan master berubah. */
cek("tanpa duplikat nama", new Set(opts.map((o) => o.value)).size === opts.length);

/* isKnownEmployee: pencocokan nama case-insensitive dan tahan margin,
   karena data lama sudah terlanjur ditulis manual. */
cek("known: nama persis", isKnownEmployee(employees as never, "Agus Setiawan") === true);
cek("known: huruf kecil", isKnownEmployee(employees as never, "agus setiawan") === true);
cek("known: huruf besar", isKnownEmployee(employees as never, "AGUS SETIAWAN") === true);
cek("known: dengan margin", isKnownEmployee(employees as never, "  Agus Setiawan  ") === true);
cek("known:beda kapitalisasi tetap cocok", isKnownEmployee(employees as never, "Agus setiawan") === true);
cek("unknown: orang lain", isKnownEmployee(employees as never, "Budi") === false);
cek("unknown: substring bukan kecocokan", isKnownEmployee(employees as never, "Agus") === false);
cek("unknown: kosong", isKnownEmployee(employees as never, "") === false);
cek("unknown: null", isKnownEmployee(employees as never, null) === false);
cek("unknown: undefined", isKnownEmployee(employees as never, undefined) === false);
cek("unknown: hanya spasi", isKnownEmployee(employees as never, "   ") === false);

/* Master kosong tidak boleh melempar - form harus tetap bisa dibuka dan
   allowCustom tetap harus bisa menyimpan nama. */
cek("master kosong -> opsi kosong", employeeOptions([] as never).length === 0);
cek("master kosong -> semua unknown", isKnownEmployee([] as never, "Agus Setiawan") === false);

console.log(`employee-probe: ${lulus} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);