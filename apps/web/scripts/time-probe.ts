/* Probe input jam 24 jam - memeriksa ATURAN masking dan normalisasi.
 *
 * Komponen `TimeInput` dan util `utils/time24.ts` menentukan data absensi dan
 * booking equipment. Kesalahan di sini tidak merusak:layout jam sudah dipakai
 * di mana pun. Yang checked di sini adalah aturan yang menjaga
 * `TimeInput` benar:
 *
 *   1. MASKING   - "1730" jadi "17:30", "7" jadi "07", dan digit kelima
 *                  tidak pernah bisa masuk
 *   2. EMIT      - nilai naik ke atas HANYA kalau sudah "HH:MM" yang sah;
 *                  kalau tidak, draf lokal yang berubah supaya angka yang
 *                  diketik tidak hilang sebelum sempat diketik sisanya
 *   3. REJECT    - "25:00" dan "10:75" ditolak, bukan dijepit jadi 23:00
 *   4. IDEMPOTEN - masked yang sama dua kali tidak mengubah apa pun
 *
 * Fungsi masking diekstrak dari komponen supaya bisa diuji tanpa browser:
 * `maskTimeDigits` adalah tempat logikanya, komponen hanya memanggilnya.
 */

import { maskTimeDigits, shouldEmitTime } from "../src/utils/timeMask";
import { fmtJam24, jamOverlap, norm24, parseJam, toMinutes, durasiJam } from "../src/utils/time24";

declare const process: { exit(code: number): never };

let fail = 0;
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (ok) {
    console.log(`PASS  ${label}`);
    return;
  }
  fail += 1;
  console.log(`FAIL  ${label}${detail === "" ? "" : ` -> ${detail}`}`);
};

/* ---------- 1. MASKING ---------- */

assert(maskTimeDigits("") === "", "input kosong tetap kosong");
assert(maskTimeDigits("1") === "1", "satu digit belum dipadatkan", maskTimeDigits("1"));
assert(maskTimeDigits("17") === "17", "dua digit = jam, belum ada titik dua", maskTimeDigits("17"));
assert(maskTimeDigits("173") === "17:3", "digit ketiga memicu titik dua", maskTimeDigits("173"));
assert(maskTimeDigits("1730") === "17:30", "empat digit = jam lengkap", maskTimeDigits("1730"));
assert(maskTimeDigits("17300") === "17:30", "digit kelima dibuang, bukan menambah", maskTimeDigits("17300"));
assert(maskTimeDigits("0000") === "00:00", "tengah malam", maskTimeDigits("0000"));
assert(maskTimeDigits("2359") === "23:59", "jam terakhir", maskTimeDigits("2359"));
assert(maskTimeDigits("2400") === "24:00", "masking tidak menolak - itu urusan norm24", maskTimeDigits("2400"));

/* Karakter non-digit dibuang: user tidak bisa mengetik huruf atau tanda. */
assert(maskTimeDigits("ab:cd") === "", "huruf dibuang", maskTimeDigits("ab:cd"));
/* Tanda hubung yang diketik pengguna bukan bagian dari jam, jadi dibuang -
   lalu digit yang tersisa tetap membentuk jam yang benar. */
assert(maskTimeDigits("17-30") === "17:30", "tanda hubung dibuang, jam tetap terbentuk", maskTimeDigits("17-30"));
assert(maskTimeDigits(" 08:30 ") === "08:30", "spasi dibuang, jam tetap terbaca", maskTimeDigits(" 08:30 "));

/* Yang sudah dipadatkan user tidak boleh dirusak jadi ganda. */
assert(maskTimeDigits("08:30") === "08:30", "nilai yang sudah HH:MM tidak berubah", maskTimeDigits("08:30"));

/* ---------- 2. EMIT ---------- */

/* Belum lengkap -> jangan emit, kalau tidak angka yang diketik hilang. */
assert(shouldEmitTime("") === "", "kosong mengosongkan form", String(shouldEmitTime("")));
assert(shouldEmitTime("1") === null, "satu digit: belum emit", String(shouldEmitTime("1")));
assert(shouldEmitTime("17") === null, "dua digit: belum emit", String(shouldEmitTime("17")));
assert(shouldEmitTime("17:3") === null, "menit satu digit: belum emit", String(shouldEmitTime("17:3")));

/* Sudah lengkap -> emit hasil norm24. */
assert(shouldEmitTime("08:30") === "08:30", "08:30 lolos utuh", String(shouldEmitTime("08:30")));
assert(shouldEmitTime("17:30") === "17:30", "17:30 lolos utuh", String(shouldEmitTime("17:30")));
assert(shouldEmitTime("00:00") === "00:00", "tengah malam lolos", String(shouldEmitTime("00:00")));

/* ---------- 3. REJECT ---------- */

/* Di luar rentang: norm24 menolak, dan karena tidak jadi HH:MM yang sah,
   nilainya TIDAK boleh ikut naik ke atas - bukan dijepit. */
assert(norm24("25:00") === "", "25:00 ditolak", norm24("25:00"));
assert(norm24("24:00") === "", "24:00 ditolak", norm24("24:00"));
assert(norm24("10:75") === "", "menit 75 ditolak", norm24("10:75"));
assert(norm24("23:59") === "23:59", "23:59 batas atas tetap sah");
assert(norm24("00:00") === "00:00", "00:00 batas bawah tetap sah");
assert(shouldEmitTime("25:00") === null, "25:00 tidak pernah naik ke atas", String(shouldEmitTime("25:00")));
assert(shouldEmitTime("10:75") === null, "10:75 tidak pernah naik ke atas", String(shouldEmitTime("10:75")));

/* ---------- 4. IDEMPOTEN ---------- */

for (const v of ["00:00", "07:05", "12:30", "23:59"]) {
  const once = maskTimeDigits(v);
  const twice = maskTimeDigits(once);
  assert(once === twice, `masking idempoten untuk "${v}"`, `${once} -> ${twice}`);
}

/* ---------- REGRESI util time24 ---------- */

/* Data warisan berformat AM/PM harus tetap bisa dibaca:users lama menyimpan
   "8:05 AM" sebelum normalisasi.strict 24 jam untuk INPUT tidak boleh
   Conversations menjauhkan ability untuk MEMBACA data lama. */
assert(norm24("8:05 AM") === "08:05", "AM/PM dinormalkan ke 24 jam", norm24("8:05 AM"));
assert(norm24("5:30 PM") === "17:30", "PM 12 jam jadi +12", norm24("5:30 PM"));
assert(norm24("12:00 AM") === "00:00", "tengah malam AM", norm24("12:00 AM"));
assert(norm24("12:00 PM") === "12:00", "tengah hari PM", norm24("12:00 PM"));
assert(norm24("not a time") === "", "bukan jam -> kosong", norm24("not a time"));

/* Data rusak ditampilkan apa adanya, bukan jadi string kosong - pengguna
   lebih baik melihat "8:05 AM" daripada melihat kolom kosong. */
assert(fmtJam24("8:05 AM") === "08:05", "fmtJam24 menormalkan", fmtJam24("8:05 AM"));
/* fmtJam24 menormalkan tanda pisah ke en-dash (konvensi tampilan aplikasi),
   jadi yang diuji adalah kontrak yang benar-benar dipakai: rentang yang
   ditampilkan harus bisa di-parse kembali jadi dua jam yang sama. */
const rentang = fmtJam24("08:00-17:00");
const rentangBalik = parseJam(rentang);
assert(
  rentangBalik !== null && rentangBalik.mulai === "08:00" && rentangBalik.selesai === "17:00",
  "rentang tampil normal dan bisa di-parse balik",
  rentang,
);
assert(fmtJam24("sampah") === "sampah", "nilai rusak ditampilkan apa adanya", fmtJam24("sampah"));

/* Perbandingan jam: ini yang dipakai Absensi untuk hitung telat. Versi lama
   membandingkan STRING, yang salah begitu ada sisi yang belum dipadatkan. */
assert(toMinutes("08:05") === 485, "08:05 = 485 menit", String(toMinutes("08:05")));
assert(toMinutes("8:05") === 485, "8:05 tanpa padding tetap 485", String(toMinutes("8:05")));
assert(toMinutes("sampah") === null, "nilai tidak valid -> null");
/* `jamOverlap` menerima menit, bukan string jam - jadi konversi dulu.
   Edge "hanya bersinggungan" penting: 08:00-12:00 dan 12:00-17:00 TIDAK
   tumpang tindih, dan kalau dihitung tumpang tindih salah, satu equipment
   bisa dijadwalkan dua kali. */
const m = (s: string): number => toMinutes(s) ?? Number.NaN;
assert(jamOverlap(m("08:00"), m("12:00"), m("11:00"), m("17:00")), "rentang beririsan terdeteksi");
assert(!jamOverlap(m("08:00"), m("12:00"), m("12:00"), m("17:00")), "yang hanya bersinggungan bukan irisan");
assert(!jamOverlap(m("08:00"), m("12:00"), m("12:01"), m("17:00")), "gap 1 menit bukan irisan");

assert(durasiJam("08:00", "17:00") === 9, "durasi 8-17 = 9 jam", String(durasiJam("08:00", "17:00")));
assert(durasiJam("22:00", "02:00") === 4, "rentang tengah malam = 4 jam", String(durasiJam("22:00", "02:00")));

const parsed = parseJam("8:00 AM-5:00 PM");
assert(parsed !== null && parsed.mulai === "08:00" && parsed.selesai === "17:00", "parseJam_AM/PM", JSON.stringify(parsed));
assert(parseJam("bukan rentang") === null, "parseJam menolak input rusak");

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan input jam`);
  process.exit(1);
}
console.log("\nInput jam 24 jam lolos: masking, emit, penolakan nilai di luar rentang, dan regresi data AM/PM.");
process.exit(0);