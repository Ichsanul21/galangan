/* Probe P8: override status "Terlambat".
   Sifat: satu kali jalan, hanya menghitung; tidak menulis apa pun.

   Aliasan file ini ada karena override status bisa diam-diam tidak
   bekerja (auto-logic tetap menulis balik) atau override justru
   memblokir auto-logic yang seharusnya jalan:

   1. shouldAutoSetLate harus mengembalikan false saat override aktif
      dan override-nya bukan "Terlambat".
   2. shouldClearOverride harus mengembalikan true saat override ada
      tapi proyek sudah tidak lagi overdue.
   3. shouldAutoSetLate harus tetap true saat proyek overdue dan tidak
      ada override.

   Jalankan: npm run probe:p8 */
import { shouldAutoSetLate, shouldClearOverride } from "../src/utils/projectDelay";

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

const TODAY = "2026-10-06";

/* isOverdue sederhana: end < today dan progress < 100. */
const isOverdue = (p: Record<string, unknown>, today: string): boolean => {
  const end = String(p.end ?? "");
  const progress = Number(p.progress ?? 0);
  if (!end) return false;
  return end < today && progress < 100;
};

/* Kasus 1: overdue + tidak ada override → shouldAutoSetLate true. */
const p1 = { status: "Dalam Proses", end: "2026-09-30", progress: 50 };
cek("overdue + tanpa override → auto true", shouldAutoSetLate(p1, TODAY, isOverdue) === true);

/* Kasus 2: overdue + override ke status lain → shouldAutoSetLate false. */
const p2 = { status: "Terlambat", end: "2026-09-30", progress: 50, statusOverride: { status: "Dalam Proses", reason: "end diperbaiki", at: TODAY, by: "Anda" } };
cek("overdue + override ke lain → auto false", shouldAutoSetLate(p2, TODAY, isOverdue) === false);

/* Kasus 3: status sudah "Terlambat" + override ke "Terlambat" → auto false.
   Auto-logic hanya menulis "Terlambat" ke status {Dalam Proses, Sedang
   Berjalan, Tertunda}. Kalau status sudah "Terlambat", tidak perlu ditulis
   ulang — override ke "Terlambat" berarti user memilihnya secara sadar. */
const p3 = { status: "Terlambat", end: "2026-09-30", progress: 50, statusOverride: { status: "Terlambat", reason: "manual", at: TODAY, by: "Anda" } };
cek("status Terlambat + override ke Terlambat → auto false", shouldAutoSetLate(p3, TODAY, isOverdue) === false);

/* Kasus 4: tidak overdue + tidak ada override → shouldAutoSetLate false. */
const p4 = { status: "Dalam Proses", end: "2026-11-30", progress: 50 };
cek("tidak overdue + tanpa override → auto false", shouldAutoSetLate(p4, TODAY, isOverdue) === false);

/* Kasus 5: tidak overdue + ada override → shouldAutoSetLate false. */
const p5 = { status: "Dalam Proses", end: "2026-11-30", progress: 50, statusOverride: { status: "Dalam Proses", reason: "manual", at: TODAY, by: "Anda" } };
cek("tidak overdue + override → auto false", shouldAutoSetLate(p5, TODAY, isOverdue) === false);

/* Kasus 6: tidak overdue + progress 100 → shouldAutoSetLate false. */
const p6 = { status: "Dalam Proses", end: "2026-09-30", progress: 100 };
cek("progress 100 → auto false", shouldAutoSetLate(p6, TODAY, isOverdue) === false);

/* Kasus 7: status Selesai + overdue → shouldAutoSetLate false. */
const p7 = { status: "Selesai", end: "2026-09-30", progress: 80 };
cek("status Selesai + overdue → auto false", shouldAutoSetLate(p7, TODAY, isOverdue) === false);

/* Kasus 8: tidak overdue + ada override → shouldClearOverride true. */
const p8 = { status: "Dalam Proses", end: "2026-11-30", progress: 50, statusOverride: { status: "Dalam Proses", reason: "manual", at: TODAY, by: "Anda" } };
cek("tidak overdue + override → clear true", shouldClearOverride(p8, TODAY, isOverdue) === true);

/* Kasus 9: overdue + ada override → shouldClearOverride false. */
const p9 = { status: "Terlambat", end: "2026-09-30", progress: 50, statusOverride: { status: "Dalam Proses", reason: "manual", at: TODAY, by: "Anda" } };
cek("overdue + override → clear false", shouldClearOverride(p9, TODAY, isOverdue) === false);

/* Kasus 10: tidak overdue + tidak ada override → shouldClearOverride false. */
const p10 = { status: "Dalam Proses", end: "2026-11-30", progress: 50 };
cek("tidak overdue + tanpa override → clear false", shouldClearOverride(p10, TODAY, isOverdue) === false);

/* Kasus 11: progress 100 + ada override → shouldClearOverride true. */
const p11 = { status: "Terlambat", end: "2026-09-30", progress: 100, statusOverride: { status: "Dalam Proses", reason: "manual", at: TODAY, by: "Anda" } };
cek("progress 100 + override → clear true", shouldClearOverride(p11, TODAY, isOverdue) === true);

/* Kasus 12: end kosong + ada override → shouldClearOverride true. */
const p12 = { status: "Terlambat", end: "", progress: 50, statusOverride: { status: "Dalam Proses", reason: "manual", at: TODAY, by: "Anda" } };
cek("end kosong + override → clear true", shouldClearOverride(p12, TODAY, isOverdue) === true);

console.log(`p8-probe: ${lulus} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
process.exit(0);