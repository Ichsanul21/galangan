/* Angka keterlambatan satu proyek, dipakai bersama.
 *
 * Dulu `delayDaysOf` hidup di dalam Monitoring.tsx sebagai helper lokal,
 * sehingga ProjectDetail tidak bisa menampilkan angka yang sama di card
 * progresnya - padahal yang diminta justru "tambah detail saat terlambat" di
 * halaman detail. Dua tempat menghitungnya sendiri akan berbeda begitu
 * definisi "terlambat" berubah, jadi perhitungannya harus punya satu sumber.
 */

/** Sisa hari sampai tanggal selesai; negatif = sudah lewat. */
export function endInDays(end: unknown, today: string): number | null {
  const m = String(end ?? "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return null;
  const day = m[3]
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(Number(m[1]), Number(m[2]), 0);
  const from = new Date(`${today}T00:00:00`);
  return Math.round((day.getTime() - from.getTime()) / 86400000);
}

/**
 * Berapa hari proyek terlambat, atau null kalau tidak terlambat.
 *
 * Penentuan "terlambat" milik pemanggil: Monitoring memakai status badge ATAU
 * lewat jatuh tempo, sedangkan detail proyek sudah punya status yang
 * definitive. Fungsi ini hanya menghitung angkanya.
 */
export function delayDaysOf(end: unknown, today: string, isLate: boolean): number | null {
  if (!isLate) return null;
  const d = endInDays(end, today);
  if (d === null) return null;
  return Math.max(0, -d);
}