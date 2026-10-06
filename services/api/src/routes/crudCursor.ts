/* Cursor keyset untuk pagination - dipisah dari crud.ts supaya bisa diuji
 * tanpa menarik Fastify.
 *
 * Kenapa cursor, bukan OFFSET: `ORDER BY updated_at ASC, id ASC` memang
 * deterministik untuk satu snapshot, tapi `updated_at` BERUBAH setiap kali ada
 * penulisan. Dengan OFFSET, baris yang diperbarui di tengah pagination
 * melompat melewati jendela dan tidak pernah dikirimkan ke perangkat mana pun.
 * Tidak ada error, tidak ada 409 - hanya baris yang hilang diam-diam.
 *
 * Cursor menandai "sudah baca sampai baris ini", jadi baris yang baru
 * diperbarui hanya tertunda ke tarikan berikutnya, tidak hilang.
 */

/** Satu cursor: `updated_at|id`. `|` tidak mungkin muncul di ISO timestamp. */
export interface PageCursor {
  updatedAt: string;
  id: string;
}

/** Bentuk cursor dari baris database. */
export function cursorOf(row: { updated_at: string; id: string }): string {
  return `${row.updated_at}|${row.id}`;
}

/**
 * Baca cursor dari query string. Mengembalikan null untuk apa pun yang tidak
 * berbentuk cursor utuh - cursor setengah jadi lebih berbahaya daripada
 * tidak ada cursor, karena itu berarti melompati baris tanpa jejak.
 */
export function parseCursor(raw: unknown): PageCursor | null {
  if (typeof raw !== "string") return null;
  const cut = raw.indexOf("|");
  if (cut < 0) return null;
  const updatedAt = raw.slice(0, cut).trim();
  const id = raw.slice(cut + 1).trim();
  if (updatedAt === "" || id === "") return null;
  return { updatedAt, id };
}