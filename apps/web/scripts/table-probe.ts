/* Probe F6: kolom tanggal + search per tabel.
   Sifat: satu kali jalan, tidak menulis apa pun ke DB.

   Alasan file ini ada: F6 menambah kolom "Dibuat"/"Diubah" dan mengganti
   pencarian manual dengan komponen bersama. Dua kelas kesalahan muncul dari
   pekerjaan sejenis:

   1. Search yang terlihat ada tapi tidak berguna. Pola lama menulis
      `${a} ${b}`.toLowerCase().includes(q) - jadi hanya beberapa field yang
      disebut yang bisa dicari. Di Finance, `noInv` (nomor resmi yang
      tercetak di kertas) tidak ada di daftar itu, padahal itu yang dicari
      akuntansi. Search ada, tidak error, tidak berguna.

   2. Sort tanggal yang mengurut terbalik. `updated_at` server adalah ISO
      penuh, `createdAt` bisa "YYYY-MM-DD", dan `date` bisa "2026-1-5".
      Dibandingkan sebagai teks, "2026-1-5" lebih kecil dari "2026-10-2".
      Kolomnya terlihat benar, urutannya salah, tidak ada error.

   Probe ini memakai SHAPE data yang sebenarnya dipakai tabel, bukan fixture
   yang dibuat-buat, supaya coefisien tidak bisa benar di probe tapi salah
   di data.

   Jalankan: npm run probe:table */
import { createdAtOf, lastTouchedAt, createdAtRaw } from "../src/utils/timestamps";
import { rowMatches, sortRows } from "../src/components/ui";
import type { StoreItem } from "../src/data/store";
import { seedInvoices } from "../src/data/seeds";

declare const process: { exit(code: number): never };

let fail = 0;
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` -> ${detail}` : ""}`);
};

const asRec = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

/* ---- Urutan tanggal: harus benar, bukan sekadar bisa diurutkan ---- */
{
  const urut = (xs: string[]): string[] =>
    [...xs].sort((a, b) => (createdAtOf(asRec({ createdAt: a })) ?? "").localeCompare(createdAtOf(asRec({ createdAt: b })) ?? ""));

  /* Bentuk tanggal yang BENAR-BENAR ada di data: ISO lengkap, ISO dengan
     nol di depan, dan angka tanpa nol. */
  const mix = ["2026-10-2", "2026-1-5", "2026-02-20", "2026-10-02"];
  const gotRaw = urut(mix);
  const got = gotRaw.map((g) => createdAtOf(asRec({ createdAt: g })) ?? "");
  assert(
    got[0]?.startsWith("2026-01-05") === true,
    "tanggal tanpa nol di depan tidak mendahului tanggal yang lebih akhir",
    got.map((g) => g.slice(0, 10)).join(", "),
  );
  assert(
    got[got.length - 1]?.startsWith("2026-10-02") === true,
    "tanggal terakhir benar-benar yang paling akhir",
    got[got.length - 1]?.slice(0, 10) ?? "kosong",
  );

  /* Bukti bahwa pengurutan TEKS mentah memang salah. Kalau ini ikut benar,
     berarti `parseStamp` tidak melakukan apa-apa dan kolom tanggal akan
     salah urutan tanpa ada yang melihatnya. */
  const mentah = [...mix].sort((a, b) => a.localeCompare(b));
  assert(
    mentah.indexOf("2026-02-20") < mentah.indexOf("2026-1-5"),
    "pengurutan teks mentah salah urutan (Februari didahului 5 Januari)",
    mentah.join(", "),
  );
  assert(
    mentah.indexOf("2026-1-5") !== gotRaw.indexOf("2026-1-5"),
    "hasil ternormalisasi BERBEDA dari pengurutan mentah (normalisasi bekerja)",
    `mentah=${mentah.join(",")} | normal=${gotRaw.join(",")}`,
  );

  /* Tanpa timestamp, baris harus mengurut ke AKHIR bukan ke depan. */
  assert(
    createdAtOf(asRec({ createdAt: "bukan tanggal" })) === null,
    "tanggal tidak terbaca -> null",
  );
  /* Baris tanpa tanggal harus mengurut paling akhir. `urut` di atas hanya
     membandingkan string, jadi di sini yang diuji adalah hasil setelah
     `sortRows` yang benar - lihat blok `sortRows` di bawah. */
  assert(
    createdAtOf(asRec({ createdAt: "bukan tanggal" })) === null,
    "tanggal tidak terbaca -> null (lihat uji sortRows untuk posisinya)",
  );

  /* `createdAtRaw` dipakai untuk tampilan; harus mempertahankan bentuk
     aslinya supaya tanggal yang sudah punya jam tidak ikut dipotong. */
  assert(
    (createdAtRaw(asRec({ createdAt: "2026-01-05T08:30:00.000Z" })) ?? "").includes("08:30"),
    "createdAtRaw tidak memotong jam (dipakai untuk tampilan/ekspor)",
  );
}

/* ---- lastTouchedAt: prioritas sumber, semua sudah ternormalisasi ---- */
{
  const jumlah = lastTouchedAt(asRec({ updatedAt: "2026-05-05T08:00:00.000Z", updated_at: "2026-05-04T00:00:00.000Z" })) ?? "";
  assert(jumlah.startsWith("2026-05-05"), "updatedAt menang atas updated_at server", jumlah);

  const dariServer = lastTouchedAt(asRec({ updated_at: "2026-05-04T00:00:00.000Z" })) ?? "";
  assert(dariServer.startsWith("2026-05-04"), "jatuh ke updated_at kalau updatedAt kosong", dariServer);

  const dariLama = lastTouchedAt(asRec({ updated: "2026-05-04" })) ?? "";
  assert(dariLama.startsWith("2026-05-04"), "jatuh ke field updated yang lawas (YYYY-MM-DD)", dariLama);
  assert(dariLama.length === jumlah.length, "semua sumber ternormalisasi ke panjang sama");
}

/* ---- Baris tanpa tanggal harus mengurut AKHIR di kedua arah ---- */
{
  /* Bug nyata yang ditemukan probe ini: nilai kosong jatuh ke perbandingan
     teks, dan string kosong lebih kecil dari apa pun - jadi semua baris
     tanpa tanggal menduduki ATAS daftar setiap kali kolom tanggal
     diurutkan. Di urutan menurun keadaannya sama saja, jadi
     "kosong di akhir" tidak otomatis benar di salah satu arah pun. */
  type R = { id: string; t: string };
  const data: R[] = [
    { id: "kosong-1", t: "" },
    { id: "akhir", t: "2026-12-31T00:00:00.000Z" },
    { id: "awal", t: "2026-01-01T00:00:00.000Z" },
    { id: "tengah", t: "2026-06-15T00:00:00.000Z" },
    { id: "kosong-2", t: "" },
  ];
  const urut = (dir: "asc" | "desc") => sortRows(data, { key: "t", dir }, (r) => r.t).map((r) => r.id);

  const asc = urut("asc");
  assert(asc.indexOf("kosong-1") >= asc.length - 2, "asc: dua baris kosong mengurut dua terakhir", asc.join(", "));
  assert(asc[0] === "awal", "asc: yang paling awal tetap di atas", asc.join(", "));

  const desc = urut("desc");
  assert(desc.indexOf("kosong-1") >= desc.length - 2, "desc: dua baris kosong tetap mengurut dua terakhir", desc.join(", "));
  assert(desc[0] === "akhir", "desc: yang paling akhir jadi di atas", desc.join(", "));

  /* Tanpa perbaikan ini, "kosong di akhir" benar hanya di satu arah. */
  const semuaKosong = data.filter((r) => r.t === "").map((r) => r.id);
  for (const dir of ["asc", "desc"] as const) {
    const urutNow = urut(dir);
    const posisi = semuaKosong.map((id) => urutNow.indexOf(id));
    const duaTerakhir = posisi.every((p) => p >= urutNow.length - 2);
    assert(duaTerakhir, `${dir}: semua baris kosong benar-benar di ujung`, urutNow.join(", "));
  }

  /* Perbaikannya di `cmpVal` berlaku untuk kolom angka juga, bukan hanya
     tanggal - jadi diuji di sini dengan kolom yang isinya angka. */
  const campur = [
    { id: "a", n: "10" },
    { id: "b", n: "" },
    { id: "c", n: "2" },
  ];
  const byNum = sortRows(campur, { key: "n", dir: "asc" }, (r) => r.n).map((r) => r.id);
  assert(byNum.join(",") === "c,a,b", "kolom angka juga mengurutkan kosong ke akhir", byNum.join(","));

  /* Nilai yang sama tidak boleh berubah urutan relatifnya (sort harus stabil
     di sisi tie-break). */
  const seri = [
    { id: "x", n: 5 },
    { id: "y", n: 5 },
    { id: "z", n: 5 },
  ];
  assert(sortRows(seri, { key: "n", dir: "desc" }, (r) => r.n).map((r) => r.id).join(",") === "x,y,z", "sort stabil saat semua nilai sama");
}

/* ---- Search: field yang tidak disebut TIDAK boleh ikut dicari ---- */
{
  const inv = asRec({
    id: "INV-SB-2026-058",
    noInv: "058/INV-SB/SMD/IX/2026",
    client: "PT PELAYARAN KARTIKA",
    project: "RP-2026-006",
    vessel: "BG RMN 3324",
    status: "Belum Dibayar",
  });
  const fields = ["id", "noInv", "client", "project", "vessel", "status"];

  assert(rowMatches(inv, "058/INV", fields), "cari sebagian nomor invoice resmi");
  assert(rowMatches(inv, "bg rmn", fields), "cari nama kapal (tidak ada di pola lama)");
  assert(rowMatches(inv, "kARTIKA rp-2026", fields), "dua kata dari dua field berbeda");
  assert(rowMatches(inv, "belum dibayar", fields), "cari status");

  /* Yang TIDAK ada di daftar field tidak boleh ditemukan - inilah bug yang
     diperbaiki: pola lama hanya memakai id, client, dan project. */
  assert(!rowMatches(inv, "milestone", fields), "field tak disebut tidak ikut dicari (milestone)");
  assert(!rowMatches(inv, "skdt", fields), "field tak disebut tidak ikut dicari (skdt)");
}

/* ---- Search terhadap data seed invoice yang sebenarnya ---- */
{
  const list = seedInvoices as StoreItem[];
  assert(list.length > 0, `ada ${list.length} invoice seed untuk diuji`);

  const fields = ["id", "noInv", "client", "project", "vessel", "status", "milestoneRef", "billingType", "paymentTerm"];

  /* Untuk setiap invoice, minimal ID-nya sendiri harus bisa ditemukan. Ini
    menjamin minimal yang harus berlaku untuk SEMUA baris, bukan hanya contoh. */
  const takKetemu = list.filter((i) => !rowMatches(asRec(i), String(i.id ?? ""), fields));
  assert(takKetemu.length === 0, "setiap invoice bisa dicari lewat id-nya sendiri", takKetemu.map((i) => String(i.id)).join(","));

  /* Nomor resmi juga harus bisa dicari - ini yang tidak bisa sebelumnya. */
  const denganNoInv = list.filter((i) => String(i.noInv ?? "") !== "");
  const noGagal = denganNoInv.filter((i) => !rowMatches(asRec(i), String(i.noInv), fields));
  assert(noGagal.length === 0, `nomor invoice resmi bisa dicari (${denganNoInv.length} baris punya noInv)`, noGagal.map((i) => String(i.id)).join(","));

  /* Search tidak boleh membuat baris hilang: query kosong = semua lolos. */
  const semuaLolos = list.filter((i) => rowMatches(asRec(i), "", fields));
  assert(semuaLolos.length === list.length, "query kosong tidak memblokir baris mana pun", `${semuaLolos.length}/${list.length}`);

  /* Query yang tidak ada hasil harus benar-benar nol, bukan "hampir nol". */
  const mustahil = list.filter((i) => rowMatches(asRec(i), "zzzzzz-tidak-mungkin-ada", fields));
  assert(mustahil.length === 0, "query yang tidak ada hasil -> 0 baris", String(mustahil.length));
}

/* ---- Search isi array & objek, bukan cuma field skalar ----
   Bug nyata dari pekerjaan ini: pola lama menulis `poLines(po).map(l => l.name)
   .join(" ")` per modul. Kalau diganti `rowMatches` tanpa CCA, field
   `lines` jadi "[object Object]" dan pencarian nama baris PO hilang -
   search tetap ada, tidak error, tidak berguna. Probe ini mengunci
   perilaku flatten-nya. */
{
  const po = asRec({
    id: "PO-2026-116",
    item: "Cat Epoxy",
    vendor: "PT Jotun Indonesia",
    status: "Diterima",
    lines: [
      { name: "Cat Epoxy Anti Korosi", unit: "Pail", spec: "5 gal" },
      { name: "Thinner Xylene", unit: "Drum", spec: "20 L" },
    ],
  });
  const poFields = ["id", "item", "vendor", "status", "lines"];
  assert(rowMatches(po, "cat epoxy", poFields), "cari nama baris di dalam array lines");
  assert(rowMatches(po, "xylene", poFields), "cari baris kedua saja dari array lines");
  assert(rowMatches(po, "5 gal", poFields), "cari spec di dalam objek baris");
  assert(rowMatches(po, "jotun cat", poFields), "kata dari field skalar dan lines digabung");
  assert(!rowMatches(po, "pelat baja", poFields), "isi lines tidak membuat semua PO cocok");

  const rfq = asRec({
    id: "RFQ-2026-031",
    prId: "PR-2026-207",
    item: "Cat Epoxy",
    vendors: ["PT Jotun Indonesia", "PT Bahana Baja"],
    quotes: [{ vendor: "PT Bahana Baja", price: 495000000, eta: "2026-08-10" }],
    status: "Evaluasi",
  });
  const rfqFields = ["id", "item", "prId", "vendors", "quotes", "winner", "status"];
  assert(rowMatches(rfq, "bahana baja", rfqFields), "cari nama vendor dari array of string");
  assert(rowMatches(rfq, "495000000", rfqFields), "cari angka di dalam array of object");

  /* Kedalaman dibatasi: nilai bersarangpanish tidak boleh membuat render
     halaman lambat atau meledak. */
  const dalam = (n: number): Record<string, unknown> =>
    n === 0 ? { leaf: "tanda-terdalam" } : { nest: dalam(n - 1) };
  const bersarang = asRec({ id: "X", doc: dalam(9) });
  const mulai = Date.now();
  rowMatches(bersarang, "tanda", ["doc"]);
  assert(Date.now() - mulai < 50, "objek bersarang sangat dalam tidak meledak", `${Date.now() - mulai}ms`);
}

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan kolom tanggal + search`);
  process.exit(1);
}
console.log(`\nF6 lolos: timestamp + search diuji terhadap data seed invoice yang sebenarnya.`);
process.exit(0);
