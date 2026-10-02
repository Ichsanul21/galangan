import { q, closeDb } from "./db.js";

/* Audit duplikat untuk koleksi yang punya field unik.
 *
 *Mengapa alat ini perlu ada:
 *
 * checkUniqueField() di routes/crud.ts MEMANG bekerja sekarang - tapi ia baru
 * bekerja sejak commit 32d2893. Sebelumnya checkNameUnique() menulis SQL
 *
 *     SELECT id FROM warehouses WHERE LOWER(name) = ?
 *
 * padahal kolom `name` tidak pernah ada di tabel mana pun (001_init.sql dan
 * 006_batch_akhir.sql sama-sama hanya punya id/branch/data/updated_at, dengan
 * `data` berisi JSON di kolom TEXT). MySQL selalu melempar Unknown column,
 * catch lama menelan errornya, lalu mengembalikan null.
 *
 * Artinya: guard nama gudang TIDAK PERNAH menolak apa pun di server selama
 * semua waktu ia aktif. Duplicate bisa saja sudah tertulis di database
 * production - tidak ada yang tahu, karena tidak ada error dan tidak ada yang
 * memeriksa.
 *
 * Alat ini READ-ONLY. Ia tidak memperbaiki apa pun: memperbaiki berarti
 * memutuskan gudang mana yang benar dan mana yang salah, dan itu keputusan
 * bisnis, bukan keputusan skrip. Lihat output, lalu perbaiki manual.
 *
 * Jalankan: npm run audit:duplicates
 */

interface DupRow {
  value: string;
  ids: string[];
}

/* Koleksi + field yang dijaga uniqueness-nya. Harus sinkron dengan
   UNIQUE_FIELD di routes/crud.ts - kalau ditambah di sana, tambahkan juga
   di sini, karena duplikat yang sudah terlanjur tertulis tidak akan
   pernah ditemukan tool ini. */
const GUARDED: { table: string; field: string; label: string }[] = [
  { table: "warehouses", field: "name", label: "nama gudang" },
  { table: "taxPeriods", field: "period", label: "periode pajak" },
];

function pickString(data: unknown, field: string): string {
  if (typeof data !== "object" || data === null) return "";
  return String((data as Record<string, unknown>)[field] ?? "").trim();
}

async function findDuplicates(table: string, field: string): Promise<DupRow[]> {
  const rows = await q<{ id: string; data: string }>(`SELECT id, data FROM ${table}`);
  const byValue = new Map<string, string[]>();
  for (const r of rows) {
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(r.data) as unknown;
    } catch {
      /* JSON korup: tidak bisa dinilai, tapi tidak boleh menggagalkan audit. */
      continue;
    }
    const value = pickString(parsed, field);
    /* Nilai kosong tidak masuk hitungan - checkUniqueField() juga
       meloloskan string kosong, jadi tidak ada ketidaksesuaian. */
    if (value === "") continue;
    const key = value.toLowerCase();
    const list = byValue.get(key);
    if (list) list.push(r.id);
    else byValue.set(key, [r.id]);
  }
  return [...byValue.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([value, ids]) => ({ value, ids }))
    .sort((a, b) => b.ids.length - a.ids.length);
}

async function main(): Promise<void> {
  let totalProblems = 0;

  console.log("Audit duplikat field unik (READ-ONLY, tidak menulis apa pun)\n");

  for (const g of GUARDED) {
    let dups: DupRow[];
    try {
      dups = await findDuplicates(g.table, g.field);
    } catch (e) {
      /* Tabel belum ada di DB lama = belum dimigrasi. Bukan error. */
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ${g.table}.${g.field}: tidak bisa dibaca (${msg}) - lewati`);
      continue;
    }

    if (dups.length === 0) {
      console.log(`  ${g.table}.${g.field}: bersih (tidak ada duplikat ${g.label})`);
      continue;
    }

    totalProblems += dups.length;
    console.log(`  ${g.table}.${g.field}: ${dups.length} nilai ${g.label} muncul lebih dari sekali`);
    for (const d of dups) {
      console.log(`      "${d.value}" -> ${d.ids.length} baris: ${d.ids.join(", ")}`);
    }
  }

  await closeDb();

  if (totalProblems > 0) {
    console.log(
      `\n${totalProblems} kelompok duplikat ditemukan. Guard server sekarang MENCEGAH yang baru\n` +
      `tetapi tidak menghapus yang sudah terlanjur ada. Perbaiki manual - jangan\n` +
      `hapus row secara buta, karena relasi (movement.fromWh/toWh) memakai NAMA.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nSemua bersih.");
}

await main();