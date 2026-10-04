/* Probe notifikasi F1: tiga tingkat severity, group, cap, dan badge.
   Sifat: satu kali jalan, tidak menulis apa pun ke DB.

   Alasan file ini ada: `level` ditambahkan ke `ModuleAlertItem` tanpa mengubah
   satu pun builder lama. Builder yang lupa mengesetnya menghasilkan
   `undefined`, dan gejalanya SENGAJA tidak terlihat sendiri:

     - group Dashboard pakai `filter(it => it.level === "kritis")`, jadi item
       `undefined` TIDAK muncul di group mana pun -> hilang.
     - badge badge menjumlahkan, jadi `undefined` TETAP terhitung.

   Hasilnya banner, group, dan badge menampilkan tiga angka berbeda untuk data
   yang sama. Tidak ada error, tidak ada stack trace - hanya angka yang salah.

   Jalankan: npm run probe:alert */
import {
  buildModuleAlertItemsFor,
  countByLevel,
  badgeCount,
  groupByLevel,
  sortByLevel,
  ALERT_LEVELS,
  ALERT_LEVEL_RANK,
  type AlertLevel,
  type ModuleAlertItem,
} from "../src/utils/moduleAlerts";
import type { StoreShape, StoreItem } from "../src/data/store";
import { createdAtOf } from "../src/utils/timestamps";

declare const process: { exit(code: number): never };

let fail = 0;
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` -> ${detail}` : ""}`);
};

const TODAY = ((): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const dayOffset = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Fixture dibuat per kasus, bukan satu data besar: kalau satu builder salah,
 * test-nya masih bisa menunjuk builder mana.
 */
const shape = (over: Record<string, unknown[]>): StoreShape =>
  ({ settings: [], ...over }) as unknown as StoreShape;

const levelOf = (items: ModuleAlertItem[], idPart: string): AlertLevel | "HILANG" => {
  const hit = items.find((i) => i.id.includes(idPart));
  return hit ? hit.level : "HILANG";
};

/* ---- severity diturunkan dari data yang sudah ada ---- */
{
  const items = buildModuleAlertItemsFor(
    shape({
      ncr: [
        { id: "NCR-A", status: "Terbuka", severity: "Critical", raised: dayOffset(-10), issue: "bearing" },
        { id: "NCR-B", status: "Terbuka", severity: "Major", raised: dayOffset(-5), issue: "cat" },
        { id: "NCR-C", status: "Terbuka", severity: "Minor", raised: dayOffset(-2), issue: "kabel" },
        { id: "NCR-D", status: "Tertutup", severity: "Critical", raised: dayOffset(-30), issue: "sudah" },
      ],
    }),
    "qc",
  );
  assert(levelOf(items, "NCR-A") === "kritis", "NCR severity Critical -> kritis");
  assert(levelOf(items, "NCR-B") === "perhatian", "NCR severity Major -> perhatian");
  assert(levelOf(items, "NCR-C") === "info", "NCR severity Minor -> info");
  assert(items.every((i) => !i.id.includes("NCR-D")), "NCR Tertutup tidak jadi alert sama sekali");
  const ncrA = items.find((i) => i.id.includes("NCR-A"));
  assert(ncrA?.since === dayOffset(-10), "NCR memakai `raised` untuk since", String(ncrA?.since));
}

{
  const items = buildModuleAlertItemsFor(
    shape({
      incidents: [
        { id: "INC-A", severity: "Tinggi", date: dayOffset(-1), desc: " sling" },
        { id: "INC-B", severity: "Sedang", date: dayOffset(-1), desc: "luka" },
        { id: "INC-C", severity: "Rendah", date: dayOffset(-1), desc: "mata" },
      ],
    }),
    "qc",
  );
  assert(levelOf(items, "INC-A") === "kritis", "insiden Tinggi -> kritis");
  assert(levelOf(items, "INC-B") === "perhatian", "insiden Sedang -> perhatian");
  assert(levelOf(items, "INC-C") === "info", "insiden Rendah -> info");
}

{
  const items = buildModuleAlertItemsFor(
    shape({
      invoices: [
        { id: "INV-L", status: "Terlambat", due: dayOffset(-3), client: "A", amount: 1000 },
        { id: "INV-S", status: "Belum Dibayar", due: dayOffset(10), client: "B", amount: 2000 },
        { id: "INV-D", status: "Lunas", due: dayOffset(-9), client: "C", amount: 3000 },
      ],
      payables: [],
    }),
    "keuangan",
  );
  assert(levelOf(items, "INV-L") === "kritis", "invoice Terlambat -> kritis");
  assert(levelOf(items, "INV-S") === "perhatian", "invoice Belum Dibayar yang belum jatuh tempo -> perhatian");
  assert(items.every((i) => !i.id.includes("INV-D")), "invoice Lunas tidak jadi alert");
  assert(items.find((i) => i.id.includes("INV-L"))?.due === dayOffset(-3), "invoice menyimpan `due` untuk kartu");
  assert(items.find((i) => i.id.includes("INV-L"))?.impact === "Rp 1.000", "invoice menyimpan nominal sebagai impact", String(items.find((i) => i.id.includes("INV-L"))?.impact));
}

{
  /* Status belum diperbarui tapi tanggal sudah lewat - uangnya tetap menua,
     jadi harus kritis walau statusnya masih "Belum Dibayar". */
  const items = buildModuleAlertItemsFor(
    shape({
      invoices: [{ id: "INV-X", status: "Belum Dibayar", due: dayOffset(-1), client: "A", amount: 5000 }],
      payables: [],
    }),
    "keuangan",
  );
  assert(levelOf(items, "INV-X") === "kritis", "Belum Dibayar yang sudah lewat tanggal -> kritis");
}

{
  const items = buildModuleAlertItemsFor(
    shape({
      vessels: [
        { id: "V-1", name: "TB A", certificates: [{ name: "Sertifikat Kelas", expires: dayOffset(-5) }] },
        { id: "V-2", name: "TB B", certificates: [{ name: "Sertifikat K3", expires: dayOffset(20) }] },
        { id: "V-3", name: "TB C", certificates: [{ name: "Sertifikat Otoritas", expires: dayOffset(300) }] },
      ],
    }),
    "kapal",
  );
  assert(levelOf(items, "V-1") === "kritis", "sertifikat lewat -> kritis");
  assert(levelOf(items, "V-2") === "perhatian", "sertifikat < 60 hari -> perhatian");
  assert(items.every((i) => !i.id.includes("V-3")), "sertifikat masih > 60 hari tidak jadi alert");
}

{
  const items = buildModuleAlertItemsFor(
    shape({
      dockSlots: [
        { id: "SL-1", dockId: "DD-1", from: 0, to: 5, vessel: "TB A" },
        { id: "SL-2", dockId: "DD-1", from: 3, to: 8, vessel: "TB B" },
        { id: "SL-3", dockId: "DD-2", from: 0, to: 5, vessel: "TB C" },
      ],
    }),
    "drydock",
  );
  assert(items.length === 2, "hanya 2 slot yang konflik (SL-1, SL-2)", String(items.length));
  assert(items.every((i) => i.level === "kritis"), "konflik jadwal -> kritis");
}

{
  const items = buildModuleAlertItemsFor(shape({ requests: [{ id: "REQ-1", status: "Baru", vessel: "TB A", client: "PT X" }] }), "crm");
  assert(levelOf(items, "REQ-1") === "info", "request CRM baru -> info");
  const payrollItems = buildModuleAlertItemsFor(
    shape({ payroll: [{ id: "PAY-1", status: "Draft", employeeId: "EMP-1", period: "2026-08", net: 22500000 }] }),
    "payroll",
  );
  assert(levelOf(payrollItems, "PAY-1") === "info", "payroll Draft -> info");
  const sdm = buildModuleAlertItemsFor(
    shape({ leaves: [{ id: "LV-1", status: "Diajukan", employeeId: "EMP-2", type: "Tahunan", from: dayOffset(5), to: dayOffset(7), days: 3 }] }),
    "sdm",
  );
  assert(levelOf(sdm, "LV-1") === "info", "cuti menunggu -> info");
}

/* ---- tidak ada satupun level yang undefined di 13 builder ---- */
{
  const data = shape({
    projects: [{ id: "P-1", vessel: "TB A", status: "Terlambat", budget: 100, actual: 200 }],
    dockSlots: [{ id: "SL-1", dockId: "DD-1", from: 0, to: 5, vessel: "TB A" }],
    inventory: [{ id: "INV-1", name: "Baja", category: "Baja", stock: 0, minStock: 10, unit: "kg", warehouse: "G1" }],
    equipment: [{ id: "EQ-1", name: "Crane", status: "Maintenance", rate: 1000 }],
    termins: [{ id: "TRM-1", status: "Diajukan", sub: "PT A", milestone: "M", amount: 500 }],
    ncr: [{ id: "NCR-A", status: "Terbuka", severity: "Major", raised: dayOffset(-2) }],
    incidents: [{ id: "INC-A", severity: "Tinggi", date: dayOffset(-1), desc: "d" }],
    requests: [{ id: "REQ-1", status: "Baru" }],
    requisitions: [{ id: "PR-1", status: "Menunggu Persetujuan", item: "Cat", by: "B", amount: 900 }],
    purchaseOrders: [{ id: "PO-1", status: "Diajukan", vendor: "V", item: "I", total: 700 }],
    invoices: [{ id: "INV-L", status: "Terlambat", due: dayOffset(-3), client: "A", amount: 100 }],
    payables: [{ id: "AP-1", st: "Belum Bayar", due: dayOffset(-2), po: "PO-1", v: "V", total: 800 }],
    leaves: [{ id: "LV-1", status: "Diajukan", employeeId: "E" }],
    payroll: [{ id: "PAY-1", status: "Draft", employeeId: "E", period: "2026-08" }],
    vessels: [{ id: "V-1", name: "TB", certificates: [{ name: "C", expires: dayOffset(-1) }] }],
    documents: [{ id: "DOC-1", status: "Kedaluwarsa", title: "Sertifikat", berlakuHingga: dayOffset(-1) }],
  });
  const keys = ["proyek", "drydock", "inventori", "equipment", "subkontraktor", "qc", "crm", "procurement", "keuangan", "sdm", "payroll", "kapal", "dokumen"] as const;

  const bad: string[] = [];
  let total = 0;
  for (const k of keys) {
    for (const it of buildModuleAlertItemsFor(data, k)) {
      total += 1;
      if (!ALERT_LEVELS.includes(it.level)) bad.push(`${k}/${it.id}=${String(it.level)}`);
    }
  }
  assert(bad.length === 0, `13 builder: semua alert punya level valid (${total} alert diuji)`, bad.join(", "));

  /* group + badge harus melihat jumlah yang SAMA. Kalau tidak, banner dan
     angka di sidebar berbeda untuk data yang sama. */
  const semua = keys.flatMap((k) => buildModuleAlertItemsFor(data, k));
  const counts = countByLevel(semua);
  const sum = counts.kritis + counts.perhatian + counts.info;
  assert(sum === semua.length, "countByLevel total = jumlah alert (tidak ada yang hilang/dihitung dua)", `${sum} vs ${semua.length}`);
  assert(badgeCount(counts) === counts.kritis + counts.perhatian, "badge = kritis + perhatian");
  assert(badgeCount(counts) <= semua.length, "badge tidak pernah lebih dari jumlah alert");
}

/* ---- group + cap: yang lewat cap disembunyikan, BUKAN dihapus ---- */
{
  const items: ModuleAlertItem[] = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `k${i}`, rowId: `k${i}`, label: `kritis ${i}`, detail: "", level: "kritis" as const })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, rowId: `p${i}`, label: `perhatian ${i}`, detail: "", level: "perhatian" as const })),
    { id: "i0", rowId: "i0", label: "info 0", detail: "", level: "info" as const },
  ];
  const g = groupByLevel(items, 5);
  assert(g.length === 3, "tiga group dibuat (kritis/perhatian/info)", String(g.length));
  const kritis = g.find((x) => x.level === "kritis");
  assert(kritis?.items.length === 5, "cap 5 di grup kritis");
  assert(kritis?.total === 7, "total kritis = 7");
  assert(kritis?.hidden === 2, "hidden kritis = 2");
  const shown = g.reduce((s, x) => s + x.items.length, 0) + g.reduce((s, x) => s + x.hidden, 0);
  assert(shown === items.length, "cap tidak menghapus alert, hanya menyembunyikan", `${shown} vs ${items.length}`);

  assert(g[0]?.level === "kritis", "kritis selalu group pertama");
  assert(groupByLevel(items, 99).every((x) => x.hidden === 0), "cap besar -> tidak ada yang tersembunyi");
  assert(groupByLevel([], 5).length === 0, "data kosong -> tanpa group");
}

/* ---- sortByLevel ---- */
{
  const items: ModuleAlertItem[] = [
    { id: "i", rowId: "i", label: "info", detail: "", level: "info" },
    { id: "k", rowId: "k", label: "kritis b", detail: "", level: "kritis", due: "2026-12-31" },
    { id: "p", rowId: "p", label: "perhatian", detail: "", level: "perhatian" },
    { id: "k2", rowId: "k2", label: "kritis a", detail: "", level: "kritis", due: "2026-01-01" },
  ];
  const s = sortByLevel(items);
  assert(s[0]?.level === "kritis" && s[1]?.level === "kritis", "dua kritis mendahului yang lain");
  assert(s[0]?.id === "k2", "di dalam level yang sama, yang jatuh tempo paling awal dulu");
  assert(s[2]?.level === "perhatian" && s[3]?.level === "info", "urutan kritis < perhatian < info");
  assert(ALERT_LEVEL_RANK.kritis < ALERT_LEVEL_RANK.perhatian && ALERT_LEVEL_RANK.perhatian < ALERT_LEVEL_RANK.info, "rank urut benar");
  assert(sortByLevel(items).length === items.length, "sort tidak mengubah jumlah");
  assert(sortByLevel([]).length === 0, "sort array kosong aman");
}

/* ---- since/due rusak dibuang, bukan ditampilkan salah ---- */
{
  /* `documents` dengan `berlakuHingga` yang tidak bisa diparse. Kalau
     diteruskan, UI menampilkan "Invalid Date" atau "NaN hari". */
  const items = buildModuleAlertItemsFor(
    shape({ documents: [{ id: "DOC-BAD", status: "Kedaluwarsa", title: "X", berlakuHingga: "bukan tanggal" }] }),
    "dokumen",
  );
  const it = items[0];
  assert(it !== undefined, "alert tetap dibuat walau due tidak valid");
  assert(it.due === undefined, "due tidak valid dibuang (bukan 'Invalid Date')", String(it.due));
}

/* ---- rowMatches di tabel nyata: kolom tanggal harus bisa diurutkan ---- */
{
  /* Kolom "Dibuat"/"Diubah" tidak berguna kalau tidak bisa diurutkan. Yang
     diuji di sini bukan komponennya, tapi BENTUK datanya: `updated_at` server
     adalah ISO penuh ("2026-10-04T08:00:00.000Z") sementara `createdAt` bisa
     "2026-10-04" saja. Dicampur dalam satu pengurutan leksikografis,
     "2026-1-5" akan muncul SEBELUM "2026-10-2" - urutan tanggal terbalik
     dan tidak ada yang melihatnya salah. */
  const es = (d: string): StoreItem => ({ id: "P-1", createdAt: d });

const created = [es("2026-1-5"), es("2026-10-2"), es("2026-2-20")];
  /* Bukti masalahnya: pengurutan leksikografis MENTAH salah urutan tanggal. */
  const mentah = [...created].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  assert(
    mentah[0]?.createdAt !== "2026-01-05",
    "localeCompare mentah memang salah urutan (tahap 5 didahului tahap 2)",
    String(mentah.map((x) => x.createdAt).join(", ")),
  );

  /* Yang dipakai tabel: `createdAtOf` mengembalikan ISO penuh kalau bisa,
     jadi kedua bentuk tanggal di atas jadi sama-sama bisa dibandingkan.
     Panjang ISO berubah dari 10 karakter ("2026-01-05") jadi 24 - yang
     diuji adalah AWALNYA sama dan panjangnya sama, bukan nilai harinya. */
  const norm = (d: string): string => createdAtOf({ createdAt: d }) ?? "";
  assert(norm("2026-1-5").startsWith("2026-01-05"), "createdAt singkat dinormalisasi ke ISO penuh", norm("2026-1-5"));
  assert(norm("2026-10-2").startsWith("2026-10-02"), "createdAt 2 digit dinormalisasi", norm("2026-10-2"));
  assert(
    norm("2026-01-05").length === norm("2026-10-02").length,
    "semua tanggal ternormalisasi ke panjang yang sama",
  );
  assert(
    norm("2026-01-05") < norm("2026-10-02"),
    "setelah normalisasi, urutan leksikografis = urutan waktu",
  );

  /* Baris tanpa tanggal harus mengurut ke akhir, bukan ke awal - kalau tidak,
     data lama menduduki puncak daftar setiap kali kolom tanggal diurutkan. */
  assert(createdAtOf({ createdAt: "bukan tanggal" }) === null, "tanggal rusak -> null, bukan string yang ikut terurut");
  assert(
    (createdAtOf({ createdAt: "bukan tanggal" }) ?? "") === "",
    "nilai fallback untuk pengurutan adalah string kosong (mengurut ke akhir)",
  );

  /* BENTUK TANGGAL TANPA JAM HARUS BEBAS ZONA WAKTU. Ini bug nyata:
     `Date.parse("2026-01-05")` dibaca UTC, tapi `Date.parse("2026-1-5")`
     (tanpa nol di depan) dibaca sebagai waktu LOKAL. Di mesin UTC-8 hasilnya
     berbeda 8 jam - cukup untuk menggeser tanggal ke hari sebelumnya, jadi
     "2026-1-5" tampil jadi 4 Januari. Kolom tanggal yang salah sehari
     dipakai buat filter dan sort, jadi ini bukan cosmetic. */
  const a = createdAtOf({ createdAt: "2026-1-5" }) ?? "";
  const b = createdAtOf({ createdAt: "2026-01-05" }) ?? "";
  assert(a === b, "tanggal tanpa nol di depan = tanggal dengan nol di depan", `${a} vs ${b}`);
  assert(a.startsWith("2026-01-05"), "tidak bergeser ke hari sebelumnya", a);
  assert(
    (createdAtOf({ createdAt: "2026-10-2" }) ?? "") === (createdAtOf({ createdAt: "2026-10-02" }) ?? ""),
    "dua digit bulan/hari juga konsisten",
    `${createdAtOf({ createdAt: "2026-10-2" })} vs ${createdAtOf({ createdAt: "2026-10-02" })}`,
  );
  /* Tanggal dengan jam tetap harus dihormati persis. */
  assert(
    (createdAtOf({ createdAt: "2026-01-05T08:30:00.000Z" }) ?? "").startsWith("2026-01-05T08:30"),
    "tanggal bertanda jam tidak digeser atau dipotong",
    createdAtOf({ createdAt: "2026-01-05T08:30:00.000Z" }) ?? "",
  );
}

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan notifikasi`);
  process.exit(1);
}
console.log(`\nNotifikasi F1 lolos (today=${TODAY}).`);
process.exit(0);
