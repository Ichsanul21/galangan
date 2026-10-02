// Resolusi lampiran dokumen dari satu baris store.
//
// Bug yang ditutup file ini (terjadi di 4 modul sekaligus):
//
//   ProjectDetail.docUrlOf() mencoba `fileName` SEBELUM `fileUrl`.
//
// `fileName` bukan URL - itu metadata nama berkas ("kontrak-kerja.pdf").
// Field itu ditulis dari input teks form ("Lampiran (nama file)"), bukan
// dari unggahan. Akibatnya baris yang lampirannya diisi manual
// menghasilkan fileUrl = "kontrak-kerja.pdf", lalu toAbsoluteUrl()
// menempelkan BASE dan meminta GET /kontrak-kerja.pdf - 404, karena berkas
// di backend hanya dilayani di bawah /files/.
//
// Modul lain (Documents, QC Sertifikat) membaca `d.fileUrl ?? d.fileName`
// - urutan benar, tapi HANYA KALAU fileUrl terisi. Seed lama menyimpan
// lampiran hanya di `fileName`, sehingga baris itu menampilkan "-" pada kolom
// Pratinjau: tombol Pratinjau dan Unduh hilang total, dan itu dibaca sebagai
// "tombolnya rusak".
//
// Jadi aturannya satu tempat: coba setiap kandidat, ambil yang PERTAMA yang
// benar-benar berbentuk URL. Nama berkas polos bukan URL, jadi dilewati.

/** Kandidat field lampiran, urut dari paling kanonik. */
const URL_FIELDS = ["fileUrl", "lampiran", "url", "attachment", "path", "file"] as const;

/** Field yang jelas metadata, bukan URL - dipakai paling akhir. */
const NAME_FIELDS = ["fileName", "namaFile", "originalName"] as const;

/** Heuristik "ini URL": punya skema, atau path relatif berawalan /. */
export function looksLikeUrl(v: unknown): boolean {
  const s = String(v ?? "").trim();
  if (s === "" || s === "-") return false;
  if (/^(https?:|blob:|data:)/i.test(s)) return true;
  // Path relatif backend: /files/2026-10/abc.pdf (WAJIB diawali slash supaya
  // "kontrak-kerja.pdf" tidak dianggap path - itulah penyebab 404 di atas).
  return s.startsWith("/");
}

export interface Attachment {
  /** URL siap pakai; "" bila baris tidak punya lampiran yang bisa diambil. */
  url: string;
  /** Nama berkas untuk judul unduhan; "" bila tidak diketahui. */
  fileName: string;
}

/**
 * Ambil URL lampiran + nama berkas dari satu baris store.
 *
 * Aturannya sengaja KETAT: sebuah nilai hanya dianggap URL kalau punya skema
 * (http/blob/data) atau berupa path relatif yang diawali "/" - persis bentuk
 * yang dilayani backend di /files/*. Nama berkas polos ("kontrak-kerja.pdf")
 * TIDAK pernah dianggap URL, karena memakainya sebagai URL menghasilkan
 * BASE + "/kontrak-kerja.pdf" yang 404, dan itulah kegagalan yang berulang
 * di seed lama.
 *
 * Kenapa tidak ada longgaran berbasis ekstensi: field `lampiran` dipakai juga
 * sebagai catatan bebas ("Checklist hull + foto section 4-7" di seed BAST),
 * jadi pencocokan ekstensi akan mengubah catatan menjadi tombol yang 404.
 * Nama berkas tetap dikembalikan sebagai `fileName` supaya judul unduhan dan
 * label di UI tidak hilang - hanya URL-nya yang kosong, dan itu jujur.
 */
export function docAttachment(row: unknown): Attachment {
  if (row === null || typeof row !== "object") return { url: "", fileName: "" };
  const r = row as Record<string, unknown>;

  const read = (k: string): string => {
    const v = r[k];
    if (v === null || v === undefined) return "";
    const s = String(v).trim();
    return s === "-" ? "" : s;
  };

  for (const field of URL_FIELDS) {
    const v = read(field);
    if (looksLikeUrl(v)) return { url: v, fileName: nameFromUrl(v) };
  }
  for (const field of NAME_FIELDS) {
    const v = read(field);
    if (v !== "") return { url: "", fileName: nameFromUrl(v) };
  }
  return { url: "", fileName: "" };
}

/** URL lampiran saja; "" bila tidak ada. */
export function docUrlOf(row: unknown): string {
  return docAttachment(row).url;
}

/** Nama berkas untuk unduhan; "" bila tidak diketahui. */
export function docFileNameOf(row: unknown): string {
  return docAttachment(row).fileName;
}

/** Nama berkas dari URL (tanpa query string). Fallback ke `fallback`. */
export function nameFromUrl(url: string, fallback = "dokumen"): string {
  const clean = String(url ?? "").split(/[?#]/)[0] ?? "";
  const seg = clean.split("/").filter(Boolean).pop() ?? "";
  return seg === "" ? fallback : decodeURIComponent(seg);
}