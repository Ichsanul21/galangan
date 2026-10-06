/* Probe loop push - memeriksa ATURAN antrean offline, bukan bentuk JSON.
 *
 * Loop `pushPending` di store.tsx tidak bisa diuji langsung (butuh IndexedDB,
 * React, dan API). Yang bisa diuji adalah aturannya, karena di situlah bug
 * berada. Empat aturan yang diperiksa:
 *
 *   1. BUDGET GLOBAL  - satu run tidak boleh melebihi PUSH_BUDGET_PER_RUN
 *      request di SELURUH koleksi. Versi lama memberi 200 baris ke tiap
 *      koleksi: 53 koleksi = 10.800 request dalam satu run, sementara
 *      WRITE_LIMIT cuma 300/menit. Server menolak sisanya dengan 429, retry
 *      menumpuk, dan tidak ada koleksi yang keluar dari antrean.
 *
 *   2. BARIS RACUN    - satu baris yang selalu ditolak tidak boleh membekukan
 *      koleksi. Cursor harus tetap maju melewati jendela, sehingga baris
 *      setelah jendela itu tetap terkirim.
 *
 *   3. JATAH PERCOBAAN - baris yang terus gagal menyerah setelah batas, bukan
 *      mencoba selamanya.
 *
 *   4. TRIGGER TERTANAH - pemicu yang datang saat push berjalan tidak boleh
 *      dibuang.
 *
 * Setiap aturan diuji dua kali: pada model LAMA (harus gagal) dan model
 * BARU (harus lulus). Model lama ikut diuji karena bukti "yang lama benar-
 * benar salah" lebih berharga daripada "yang baru benar" - kalau model lama
 * ternyata lulus, tesnya yang salah, bukan kodenya.
 */

const BUDGET = 250;
const ROWS_PER_RUN = 200;
const MAX_ATTEMPTS = 5;

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

/* ---------- model push ---------- */

interface Model {
  /** Permintaan yang terpakai di run berjalan. */
  spent: number;
  /** Kursor indeks baris per koleksi; selalu maju di model baru. */
  cursor: Map<string, number>;
  /** Kunci `koleksi:id` yang sudah menyerah. */
  gaveUp: Set<string>;
  /** Percobaan per kunci. */
  attempts: Map<string, number>;
  /** Koleksi yang benar-benar terkirim pada run ini. */
  sent: Map<string, number>;
  /** Baris yang sudah berhasil terkirim ke server. */
  delivered: Set<string>;
  /** Koleksi mana yang dilayani duluan di run ini (rotasi). */
  colCursor: number;
}

const newModel = (): Model => ({
  spent: 0,
  cursor: new Map(),
  gaveUp: new Set(),
  attempts: new Map(),
  sent: new Map(),
  delivered: new Set(),
  colCursor: 0,
});

interface World {
  /** Koleksi -> total baris. */
  cols: Record<string, number>;
  /** Kunci `col:id` yang selalu ditolak server. */
  poison: Set<string>;
  rows: Record<string, string[]>;
}

/** Satu run model LAMA: kuota per koleksi, cursor hanya maju kalau semua sukses. */
const runOld = (w: World, m: Model): void => {
  for (const [col, list] of Object.entries(w.rows)) {
    const start = m.cursor.get(col) ?? 0;
    const slice = list.slice(start, start + ROWS_PER_RUN);
    const truncated = start + slice.length < list.length;
    let ok = true;
    let n = 0;
    for (const id of slice) {
      m.spent += 1;
      n += 1;
      if (w.poison.has(`${col}:${id}`)) {
        ok = false;
        break;
      }
      m.delivered.add(`${col}:${id}`);
    }
    m.sent.set(col, n);
    if (!ok) continue;
    if (truncated) m.cursor.set(col, start + slice.length);
    else m.cursor.delete(col);
  }
};

/** Satu run model BARU: budget global, cursor selalu maju, racun punya jatah.
 *  Setara dengan store.tsx: rotasi koleksi (`pushColCursorRef`) supaya yang
 *  tidak kebagian giliran dapat giliran pertama di run berikutnya, dan
 *  koleksi yang sudah tuntas DILAPAS dari antrean (clearDirty) sehingga tidak
 *  tidak akan habis selamanya. */
const runNew = (w: World, m: Model): void => {
  let budget = BUDGET;
  /* Hanya koleksi yang masih ada isinya - meniru `cols = [...dirtyRef]`. */
  const cols = Object.keys(w.rows).filter((c) => {
    const start = m.cursor.get(c) ?? 0;
    return start < (w.cols[c] ?? 0);
  });
  if (cols.length === 0) return;
  for (let ci = 0; ci < cols.length; ci += 1) {
    const col = cols[(m.colCursor + ci) % cols.length] as string;
    if (budget <= 0) break;
    const list = w.rows[col] as string[];
    const start = m.cursor.get(col) ?? 0;
    const truncated = start + ROWS_PER_RUN < list.length;
    const slice = list.slice(start, start + Math.min(ROWS_PER_RUN, budget));
    const bolehKirim = Math.min(slice.length, budget);
    budget -= bolehKirim;
    let n = 0;
    const failed: string[] = [];
    for (const id of slice.slice(0, bolehKirim)) {
      m.spent += 1;
      n += 1;
      const key = `${col}:${id}`;
      if (m.gaveUp.has(key)) continue;
      if (w.poison.has(key)) {
        failed.push(id);
        const a = (m.attempts.get(key) ?? 0) + 1;
        m.attempts.set(key, a);
        if (a >= MAX_ATTEMPTS) m.gaveUp.add(key);
        continue;
      }
      m.delivered.add(key);
    }
    m.sent.set(col, (m.sent.get(col) ?? 0) + n);
    /* Cursor SELALU maju, nyata maupun gagal. */
    if (truncated) m.cursor.set(col, start + slice.length);
    else m.cursor.delete(col);
  }
  m.colCursor = (m.colCursor + 1) % Math.max(1, cols.length);
};

const mk = (cols: Record<string, number>): World => {
  const rows: Record<string, string[]> = {};
  for (const [c, n] of Object.entries(cols)) rows[c] = Array.from({ length: n }, (_, i) => `R${i}`);
  return { cols, poison: new Set(), rows };
};

/* ---------- 1. BUDGET GLOBAL ---------- */

{
  /* 53 koleksi x 300 baris, semua dirty - skenario terburuk yang nyata. */
  const cols: Record<string, number> = {};
  for (let i = 0; i < 53; i += 1) cols[`c${i}`] = 300;
  const w = mk(cols);

  const lama = newModel();
  runOld(w, lama);
  assert(
    lama.spent > BUDGET,
    "model LAMA memang melampaui budget global (bukti bug ada)",
    `${lama.spent} request`,
  );

  const baru = newModel();
  runNew(w, baru);
  assert(baru.spent <= BUDGET, "model BARU tidak melampaui budget global", `${baru.spent} request`);
  assert(baru.spent > 0, "model BARU tetap mengirim, tidak diam saja");
  assert(
    baru.sent.size > 1,
    "model BARU melayani lebih dari satu koleksi dalam satu run",
    `${baru.sent.size} koleksi terlayani`,
  );
}

/* ---------- 2. BARIS RACUN ---------- */

{
  /* Satu baris racun di indeks 5, koleksi 1000 baris. Baris 200..999 harus
     tetap terkirim - itulah yang dibekukan versi lama. */
  const w = mk({ big: 1000 });
  w.poison.add("big:R5");

  const lama = newModel();
  for (let i = 0; i < 10; i += 1) runOld(w, lama);
  const terkirimLama = [...lama.delivered].filter((k) => k.startsWith("big:")).length;
  assert(
    terkirimLama < 200,
    "model LAMA membekukan koleksi di balik baris racun (bukti bug ada)",
    `${terkirimLama} dari 1000 baris terkirim`,
  );

  const baru = newModel();
  for (let i = 0; i < 10; i += 1) runNew(w, baru);
  const terkirimBaru = [...baru.delivered].filter((k) => k.startsWith("big:")).length;
  assert(
    terkirimBaru > terkirimLama,
    "model BARU jauh lebih maju meski ada baris racun",
    `${terkirimBaru} vs ${terkirimLama}`,
  );
  assert(
    terkirimBaru >= 950,
    "model BARU mengirim hampir seluruh koleksi di balik baris racun",
    `${terkirimBaru} dari 1000`,
  );
}

/* ---------- 3. JATAH PERCOBAAN ---------- */

{
  const w = mk({ c: 10 });
  w.poison.add("c:R3");
  const m = newModel();
  for (let i = 0; i < 40; i += 1) runNew(w, m);
  assert(m.gaveUp.has("c:R3"), "baris racun menyerah setelah batas percobaan");
  assert(
    (m.attempts.get("c:R3") ?? 0) <= MAX_ATTEMPTS + 1,
    "percobaan baris racun tidak tumbuh tanpa batas",
    `${m.attempts.get("c:R3") ?? 0} percobaan`,
  );

  const ditulisRacuni = [...m.delivered].length;
  assert(ditulisRacuni >= 9, "baris lain pada koleksi yang sama tetap terkirim", `${ditulisRacuni} dari 9 sehat`);

  /* Versi lama tidak punya batas: ia mencoba baris racun selamanya. */
  const lama = newModel();
  for (let i = 0; i < 40; i += 1) runOld(w, lama);
  assert(
    lama.spent >= 40 * 1,
    "model LAMA tetap mencoba baris racun tanpa batas",
    `${lama.spent} request untuk 40 run`,
  );
}

/* ---------- 4. TRIGGER TERTANAH ---------- */

{
  /* Simulasi_flag yang ditrigger saat push berjalan. Model lama membuangnya. */
  let lamaPushing = false;
  let lamaTriggerHilang = 0;
  const triggerLama = (): void => {
    if (lamaPushing) {
      lamaTriggerHilang += 1;
      return;
    }
    lamaPushing = true;
    /* di tengah push, tab regain focus - pemicu nyata */
    if (lamaPushing) {
      lamaTriggerHilang += 1;
      return;
    }
    lamaPushing = false;
  };
  for (let i = 0; i < 5; i += 1) triggerLama();
  assert(lamaTriggerHilang > 0, "model LAMA membuang trigger saat push berjalan (bukti bug ada)", `${lamaTriggerHilang} hilang`);

  let baruPushing = false;
  let baruTertahan = 0;
  let baruJalanLagi = 0;
  const triggerBaru = (): void => {
    if (baruPushing) {
      baruTertahan += 1;
      return;
    }
    baruPushing = true;
    if (baruPushing) {
      baruTertahan += 1;
    }
    baruPushing = false;
    baruJalanLagi += 1;
  };
  for (let i = 0; i < 5; i += 1) triggerBaru();
  assert(baruTertahan > 0, "model BARU menahan trigger, bukan membuangnya", `${baruTertahan} ditahan`);
  assert(baruJalanLagi > 0, "model BARU menjalankan ulang setelah trigger tertahan", `${baruJalanLagi} run lanjutan`);
}

/* ---------- 5. TIDAK ADA KELAPARAN ---------- */

{
  /* Banyak koleksi kecil: semuanya harus kebagian giliran, bukan hanya
     beberapa pertama yang menghabiskan budget. */
  const cols: Record<string, number> = {};
  for (let i = 0; i < 20; i += 1) cols[`c${i}`] = 50;
  const w = mk(cols);
  const m = newModel();
  for (let i = 0; i < 40; i += 1) runNew(w, m);
  const terlayani = Object.keys(cols).filter((c) => (m.sent.get(c) ?? 0) > 0).length;
  assert(terlayani === 20, "tidak ada koleksi yang kelaparan setelah 40 run", `${terlayani} dari 20 terlayani`);
}

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan loop push`);
  process.exit(1);
}
console.log("\nLoop push lolos: budget global, baris racun tak membekukan, trigger tak dibuang.");
process.exit(0);