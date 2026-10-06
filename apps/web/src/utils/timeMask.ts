/* Aturan masking input jam - dipisah dari komponen supaya bisa diuji tanpa
 * browser.
 *
 * Fungsi-fungsi ini adalah satu-satunya tempat logika "kapan yang diketik
 * dianggap sudah jadi jam" berada. Kalau aturan ini diduplikasi di dalam JSX,
 * satu modul bisa berubah diam-diam dan tidak ada yang mengetahuinya.
 */

/**
 * Bentuk yang tampil di field saat pengguna mengetik.
 *
 * Digit dipadatkan dan titik dua otomatis muncul setelah dua digit pertama.
 * Karakter selain digit dibuang, dan digit kelima ke atas diabaikan - jadi
 * field tidak mungkin berisi teks yang tidak bisa jadi jam.
 *
 * PENTING: fungsi ini tidak menolak nilai di luar rentang. "25:00" tetap
 * tampil sebagai "25:00" supaya pengguna bisa mengoreksinya sendiri;
 * penolakan terjadi di `shouldEmitTime` saat nilai-naik ke atas.
 */
export function maskTimeDigits(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

/**
 * Apa yang harus dikirim ke atas saat pengguna mengetik.
 *
 * Mengembalikan:
 *   - `null`  = belum boleh emit (nilai belum lengkap, atau di luar rentang).
 *               Penting: draf lokal tetap berubah supaya angka yang diketik
 *               tidak hilang sebelum sempat diketik sisanya.
 *   - `""`    = pengguna mengosongkan field; ini sah dan harus diteruskan.
 *   - `"HH:MM"` = sudah jam yang sah.
 *
 * Nilai di luar rentang (`25:00`) sengaja TIDAK dijepit jadi `23:00`:
 * menjepit membuat jam ngawur tersimpan seolah-olah benar, dan tidak ada
 * jejak bahwa ada yang salah.
 */
export function shouldEmitTime(masked: string): string | null {
  if (masked === "") return "";
  if (!/^\d{2}:\d{2}$/.test(masked)) return null;
  const h = Number(masked.slice(0, 2));
  const min = Number(masked.slice(3));
  if (h > 23 || min > 59) return null;
  return masked;
}