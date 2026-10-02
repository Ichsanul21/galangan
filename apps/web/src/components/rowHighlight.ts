// Kelas CSS highlight baris notifikasi - SATU tempat supaya modul mana pun
// menandai baris dengan tampilan yang sama.
//
// Kenapa helper, bukan string langsung di tiap halaman:
//
//   1. Urutan kelas itu penting. Baris boleh punya DUA penanda sekaligus:
//      `.notif-hl` (warning modul yang permanen) dan penanda flash. Karena
//      dulu ditulis sebagai ternary,
//        flash ? "notif-hl notif-flash" : notified ? "notif-hl" : ""
//      tidak pernah bisa menyorot KELOMPOK baris: satu id saja yang bisa
//      flashing, jadi kartu Dashboard yang menghitung 5 NCR terbuka hanya
//      terlihat seperti 1 baris.
//
//   2. `notif-hl` tidak boleh hilang. Aturan di sini selalu menambahkan
//      `.notif-hl` lebih dulu bila salah satu penanda aktif, sehingga
//      notifikasi warning yang sudah ada tidak ikut terhapus - itu syarat
//      eksplisit dari pemilik modul.
//
//   3. Elemen tabel (`<tr>`) ditangani di CSS, bukan di sini: `box-shadow`
//      tidak di-andalkan untuk `<tr>`, jadi index.css memakai selektor
//      `tr.notif-flash-all > td`. Helper cukup mengembalikan nama kelas yang
//      sama untuk kartu maupun tabel.

/** Penanda aktif dari useNotifFlash. */
export interface FlashState {
  /** Id tunggal yang diklik (pola lama). */
  flashId: string | null;
  /** Kelompok id yang disorot (kartu Dashboard). */
  flashIds?: ReadonlySet<string>;
}

export interface RowHighlightInput {
  /** Id baris yang sedang diuji. */
  id: string;
  /** Id dari useNotifFlash. */
  flash: FlashState;
  /** true bila baris ini punya warning modul (dari useModuleAlert). */
  notified?: boolean;
  /** Kelas dasar penampil, mis. "hover:bg-surface". */
  base?: string;
}

/**
 * Rakit className penanda untuk satu baris.
 *
 * Prioritas: kelompok (flashIds) > tunggal (flashId) > warning notifikasi.
 * Keduanya boleh aktif bersamaan dan tidak saling menimpa.
 */
export function rowHighlightClass({ id, flash, notified = false, base = "" }: RowHighlightInput): string {
  const key = String(id);
  const inGroup = flash.flashIds !== undefined && flash.flashIds.has(key);
  const isFlash = inGroup || (flash.flashId !== null && flash.flashId === key);
  /* .notif-hl selalu ikut kalau ada penanda apa pun supaya notifikasi
     warning yang sudah ada tidak hilang, dan juga saat baris itu sendiri
     punya warning modul. */
  const parts: string[] = [];
  if (base) parts.push(base);
  if (isFlash || notified) parts.push("notif-hl");
  if (isFlash) parts.push(inGroup ? "notif-flash-all" : "notif-flash");
  return parts.join(" ");
}