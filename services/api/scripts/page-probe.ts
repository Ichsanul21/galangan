/* Probe pagination - memeriksa SKEMA cursor, bukan bentuk responsnya.
 *
 * Bug yang ditutup probe ini: `GET /api/:table` memakai OFFSET di atas
 * `ORDER BY updated_at ASC, id ASC`. Urutannya deterministik untuk satu
 * snapshot, tapi `updated_at` BERUBAH setiap kali ada penulisan. Kalau
 * perangkat A sedang menarik seluruh tabel sementara perangkat B menulis,
 * baris yang baru ditulis melompat melewati jendela OFFSET dan TIDAK PERNAH
 * dikirimkan ke perangkat mana pun - tidak ada error, tidak ada 409, tidak ada
 * jejak apa pun. Gejalanya persis "data hilang setelah POST sukses".
 *
 * Cursor keyset menyelesaikan ini karena menandai "sudah baca sampai baris
 * ini", bukan "lewati N baris". Baris yang baru diperbarui hanya tertunda ke
 * tarikan berikutnya.
 *
 * Yang diperiksa di sini:
 *   1. KURUSI cursor   - encode/decode, termasuk input rusak
 *   2. KASUS LEBAR     - id berisi tanda pisah tidak boleh mengacaukan decode
 *   3. SKENARIO SKIP   - simulasi penulisan di tengah pagination:
 *                         keyset tidak boleh kehilangan baris, OFFSET wajib
 *                         kehilangan (dan itu alasan Gomez ini ada)
 *   4. KONSISTENSI     - klausa WHERE cursor ekuivalen dengan comparator
 *                         tuple yang disimulasikan di sini
 *
 * Tanpa DB: yang diuji adalah aturan paginasi yang dipakai klien dan server,
 * bukan performa SQL-nya.
 */

import { cursorOf, parseCursor } from "../src/routes/crudCursor";

let fail = 0;
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (ok) {
    console.log(`PASS  ${label}`);
    return;
  }
  fail += 1;
  console.log(`FAIL  ${label}${detail === "" ? "" : ` -> ${detail}`}`);
};

/* ---------- 1. KURUSI CURSOR ---------- */

const row = { id: "MOV-001", updated_at: "2026-10-05T08:15:00.000Z" };
const cur = cursorOf(row);
assert(cur === "2026-10-05T08:15:00.000Z|MOV-001", "cursor dibentuk sebagai updated_at|id", cur);

const back = parseCursor(cur);
assert(back !== null && back.updatedAt === row.updated_at && back.id === row.id, "cursor diputar-balik tanpa berubah", JSON.stringify(back));

/* Input rusak harus ditolak, bukan diterima dengan nilai setengah jadi -
   cursor setengah jadi berarti melompati baris tanpa ada yang realizes. */
assert(parseCursor(undefined) === null, "cursor kosong -> null");
assert(parseCursor("") === null, "string kosong -> null");
assert(parseCursor("   ") === null, "spasi saja -> null");
assert(parseCursor("tanpa-pemisah") === null, "tanpa tanda pisah -> null");
assert(parseCursor("|MOV-001") === null, "updated_at kosong -> null");
assert(parseCursor("2026-10-05T08:15:00.000Z|") === null, "id kosong -> null");
assert(parseCursor("   |MOV-001") === null, "updated_at hanya spasi -> null");
assert(parseCursor("2026-10-05T08:15:00.000Z|   ") === null, "id hanya spasi -> null");
assert(parseCursor(null) === null, "null -> null");
assert(parseCursor(42) === null, "angka -> null");

/* ---------- 2. KASUS LEBAR ---------- */

/* Id berDasar hash (prefix + acak) tidak pernah memuat tanda pisah, tapi
   parser harus tetap benar kalau id mengandung tanda hubung dan garis bawah. */
const aneh = { id: "a-b_c.d-e_f", updated_at: "2026-10-05T08:15:00.000Z" };
const backAneh = parseCursor(cursorOf(aneh));
assert(backAneh !== null && backAneh.id === aneh.id, "id berisi tanda hubung dan garis bawah utuh", JSON.stringify(backAneh));

/* Spasi tepi di-trim. Itu perilaku yang BENAR: id di database tidak pernah
   punya spasi di ujung, jadi menormalkan membuat cursor lebih mungkin cocok
   daripada preservesinya. Yang ditolak adalah cursor yang SETENGAH jadi. */
const spasi = { id: "  MOV-002  ", updated_at: "2026-10-05T08:15:00.000Z" };
const backSpasi = parseCursor(cursorOf(spasi));
assert(backSpasi !== null && backSpasi.id === "MOV-002", "spasi tepi di id di-trim", JSON.stringify(backSpasi));

/* ---------- 3 & 4. SKENARIO SKIP ---------- */

interface Row {
  id: string;
  updated_at: string;
}

/** Comparator tuple yang setara dengan klausa WHERE server:
 *  (updated_at > ?) OR (updated_at = ? AND id > ?) */
const after = (r: Row, c: { updatedAt: string; id: string }): boolean =>
  r.updated_at > c.updatedAt || (r.updated_at === c.updatedAt && r.id > c.id);

const byOrder = (a: Row, b: Row): number =>
  a.updated_at === b.updated_at ? (a.id < b.id ? -1 : 1) : a.updated_at < b.updated_at ? -1 : 1;

/** Tarik seluruh tabel dengan keyset. Setiap "halaman" opportunity bagi
 *  penulis lain untuk mengubah satu baris di tengah pembacaan. */
const pullKeyset = (table: Row[], pageSize: number, mutate: () => void): string[] => {
  const seen: string[] = [];
  let c: { updatedAt: string; id: string } | null = null;
  for (let guard = 0; guard < 200; guard += 1) {
    const rest = table.filter((r) => c === null || after(r, c)).sort(byOrder);
    const page = rest.slice(0, pageSize);
    if (page.length === 0) break;
    for (const r of page) seen.push(r.id);
    mutate();
    if (page.length < pageSize) break;
    c = { updatedAt: page[page.length - 1]!.updated_at, id: page[page.length - 1]!.id };
  }
  return seen;
};

/** Tarik dengan OFFSET - cara lama, untuk membuktikan ia memang bocor.
 *  Mutasi harus terjadi SETELAH halaman dibaca; itu urutan dunia nyata:
 *  perangkat A sudah memegang halaman 1, lalu perangkat B menulis. */
const pullOffset = (table: Row[], pageSize: number, mutate: () => void): string[] => {
  const seen: string[] = [];
  for (let offset = 0, guard = 0; guard < 200; guard += 1) {
    const page = [...table].sort(byOrder).slice(offset, offset + pageSize);
    if (page.length === 0) break;
    for (const r of page) seen.push(r.id);
    mutate();
    offset += pageSize;
  }
  return seen;
};

const build = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `R-${String(i + 1).padStart(2, "0")}`,
    updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));

const belumSentuh = (): void => undefined;
/* Penulis lain mengubah baris ke-2 tepat setelah halaman pertama diambil:
   updated_at-nya naik, jadi diurutan ASC baris itu melompat ke ekor. */
const penanda = (table: Row[]): void => {
  table[1]!.updated_at = new Date(Date.UTC(2026, 5, 1)).toISOString();
};

const tabel = build(10);
const semua = tabel.map((r) => r.id);
const viaKeyset = pullKeyset(tabel, 5, belumSentuh);
assert(
  viaKeyset.length === 10 && new Set(viaKeyset).size === 10,
  "keyset tanpa gangguan: semua baris tepat satu kali",
  `${viaKeyset.length} baris, ${new Set(viaKeyset).size} unik`,
);

const tabel2 = build(10);
const lewatOffset = pullOffset(tabel2, 5, belumSentuh);
assert(
  lewatOffset.length === 10 && new Set(lewatOffset).size === 10,
  "offset tanpa gangguan: semua baris tepat satu kali (kontrol)",
  `${lewatOffset.length} baris, ${new Set(lewatOffset).size} unik`,
);

/* Begini skenario yang dilaporkan: penulisan terjadi DI TENGAH pagination. */
const tabel3 = build(10);
const offsetGanggu = pullOffset(tabel3, 5, () => penanda(tabel3));
const hilangOffset = semua.filter((id) => !offsetGanggu.includes(id));
assert(
  hilangOffset.length > 0,
  "offset MEMANG kehilangan baris saat ada penulisan di tengah (alasan bug ini ada)",
  `hilang: ${hilangOffset.join(", ") || "tidak ada"}`,
);

const tabel4 = build(10);
const keysetGanggu = pullKeyset(tabel4, 5, () => penanda(tabel4));
const hilangKeyset = semua.filter((id) => !keysetGanggu.includes(id));
assert(
  hilangKeyset.length === 0,
  "keyset TIDAK kehilangan baris pada skenario yang sama",
  `hilang: ${hilangKeyset.join(", ") || "tidak ada"}`,
);

/* Baris yang diperbarui mungkin terbaca dua kali (satu kali di halaman lama,
   sekali lagi setelah cursor lewat) - itu aman. Yang tidak boleh terjadi
   adalah hilang. */
const duplikatKeyset = keysetGanggu.length - new Set(keysetGanggu).size;
assert(
  keysetGanggu.every((id) => semua.includes(id)),
  "keyset tidak pernah mengembalikan baris di luar tabel",
  keysetGanggu.filter((id) => !semua.includes(id)).join(", "),
);
assert(
  hilangKeyset.length === 0,
  "pengulangan hasil baca karena penulisan boleh terjadi, kehilangan tidak",
  `${duplikatKeyset} baris terbaca dua kali (aman)`,
);

/* Penulisan agresif: banyak baris ditulis ulang berulang kali saat tarikan
   berjalan. Yang wajib tetap berlaku: tidak ada baris yang hilang, dan tidak
   ada baris di luar tabel yang muncul. Baris MAYALAH terbaca dua kali -
   pembacaan ulang jauh lebih murah daripada baris yang tidak pernah sampai. */
const tabel5 = build(20);
const semua5 = new Set(tabel5.map((r) => r.id));
let tick = 0;
const keysetAgresif = pullKeyset(tabel5, 4, () => {
  tick += 1;
  tabel5[tick % tabel5.length]!.updated_at = new Date(Date.UTC(2026, 5, 1 + tick)).toISOString();
});
const hilang5 = [...semua5].filter((id) => !keysetAgresif.includes(id));
const asing5 = keysetAgresif.filter((id) => !semua5.has(id));
assert(hilang5.length === 0, "penulisan agresif: tidak ada baris yang hilang", `hilang: ${hilang5.join(", ")}`);
assert(asing5.length === 0, "penulisan agresif: tidak ada baris asing yang muncul", `asing: ${asing5.join(", ")}`);
assert(keysetAgresif.length > 0, "penulisan agresif: tarikan tetap menghasilkan baris", `${keysetAgresif.length} baris`);

/* Tarikan yang selesai normal, bukan terjebak karena kursor tidak maju. */
const selesai = pullKeyset(build(10), 5, belumSentuh);
assert(selesai.length === 10, "tarikan berhenti saat data habis, bukan berulang", `${selesai.length} baris`);

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan pagination`);
  process.exit(1);
}
console.log("\nPagination cursor lolos: encode/decode utuh, keyset tidak kehilangan baris saat ada penulisan.");
process.exit(0);