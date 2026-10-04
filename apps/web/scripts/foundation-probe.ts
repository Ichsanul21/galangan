/* Probe fondasi F0: timestamp rekam + pencarian daftar.
   Sifat: satu kali jalan, tidak menulis apa pun ke DB.

   Alasan file ini ada: `createdAt`/`updatedAt` Looks like a trivially simple
   field, but the failure mode is silent - when the stamp doesn't exist, the
   "Dibuat" column just displays "—" and no one reports a bug. Likewise
   `rowMatches`: a search box that only matches on one field still "works", it
   just fails to find a document by its number, and that gets mistaken for
   "the data is wrong".

   Every assertion below is a case that has actually broken. Jalankan:
   npm run probe:foundation */
import { createdAtOf, deriveCreatedAt, stampCreated, stampUpdated, lastTouchedAt, CREATED_FIELD, UPDATED_FIELD } from "../src/utils/timestamps";
import { rowMatches } from "../src/components/ui";
import { DOC_TYPES, SUB_TYPES, subTypesOf, NEEDS_QC_LINK, QC_CERT_SUBTYPE, qcCertCandidates } from "../src/utils/docTypes";
import type { StoreItem } from "../src/data/store";
import { woMilestonesOf, woProgressOf, woProgressLabel, terminMilestoneOptions } from "../src/utils/woMilestones";

declare const process: { exit(code: number): never };

let fail = 0;
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` -> ${detail}` : ""}`);
};

/* ---- Timestamp: stampCreated ---- */
{
  const row: Record<string, unknown> = { id: "X-1" };
  stampCreated(row);
  assert(typeof row[CREATED_FIELD] === "string" && row[CREATED_FIELD] !== "", "stampCreated mengisi createdAt saat kosong");
  assert(createdAtOf(row) !== null, "createdAtOf membaca back nilainya");
}

{
  /* Nilai yang sudah ada (5 rekam seed punya, hasil impor, hasil restore)
     tidak boleh ditimpa - kalau ditimpa, satu refresh browser menghapus
     seluruh riwayat tanggal. */
  const lama = "2020-01-02T03:04:05.000Z";
  const row: Record<string, unknown> = { id: "X-2", [CREATED_FIELD]: lama };
  stampCreated(row);
  assert(row[CREATED_FIELD] === lama, "stampCreated TIDAK menimpa createdAt yang sudah ada", String(row[CREATED_FIELD]));
}

{
  const row: Record<string, unknown> = { id: "X-3", [CREATED_FIELD]: "bukan tanggal" };
  stampCreated(row);
  assert(createdAtOf(row) !== null, "stampCreated MENGGANTI createdAt yang isinya bukan tanggal");
}

/* ---- Timestamp: stampUpdated ---- */
{
  const patch: Record<string, unknown> = { status: "Selesai" };
  stampUpdated(patch);
  assert(typeof patch[UPDATED_FIELD] === "string", "stampUpdated mengisi updatedAt");
  assert(!(CREATED_FIELD in patch), "stampUpdated TIDAK pernah menulis createdAt");
}

{
  const row: Record<string, unknown> = { id: "X-5" };
  stampUpdated(row);
  assert(lastTouchedAt(row) !== null, "lastTouchedAt membaca updatedAt");
}

/* ---- Fallback kolom `updated_at` milik server ---- */
{
  const row = { id: "X-6", updated_at: "2026-05-05T00:00:00.000Z", updated: "2026-05-04" };
  assert(lastTouchedAt(row) === "2026-05-05T00:00:00.000Z", "lastTouchedAt memprioritaskan updatedAt di atas updated_at server");
  assert(
    lastTouchedAt({ id: "X-7", updated: "2026-05-04" }) === "2026-05-04",
    "lastTouchedAt jatuh ke field `updated` lama (YYYY-MM-DD)",
  );
  assert(lastTouchedAt({ id: "X-8" }) === null, "lastTouchedAt null kalau tidak ada tanggal sama sekali");
}

/* ---- deriveCreatedAt ---- */
{
  assert(deriveCreatedAt({ date: "2026-03-04" }) === "2026-03-04T00:00:00.000Z", "deriveCreatedAt memakai `date`");
  assert(deriveCreatedAt({ tanggal: "2026-02-01" }) === "2026-02-01T00:00:00.000Z", "deriveCreatedAt memakai `tanggal`");
assert(deriveCreatedAt({ date: "1970-01-02T00:00:00.000Z" }) !== null, "deriveCreatedAt menerima ISO penuh");
  assert(deriveCreatedAt({ signedAt: "2026-06-11" }) === "2026-06-11T00:00:00.000Z", "deriveCreatedAt memakai `signedAt` (kontrak ditandatangani = rekam lahir)");

  /* `built` = tahun-built kapal, `period` = "2026-07", `time` = "2 menit lalu".
     Semuanya bukan tanggal. Kalau salah satu masuk daftar fallback, kolom
     "Dibuat" menampilkan angka yang tidak ada artinya. */
  assert(deriveCreatedAt({ built: 2026 }) === null, "deriveCreatedAt TOLAK `built` (tahun-built kapal)");
  assert(deriveCreatedAt({ period: "2026-07" }) === null, "deriveCreatedAt TOLAK `period` (bulan kerja)");
  assert(deriveCreatedAt({ time: "2 menit lalu" }) === null, "deriveCreatedAt TOLAK `time` (string relatif)");
  assert(deriveCreatedAt({ from: "2026-08-10" }) === null, "deriveCreatedAt TOLAK `from` (cuti mulai SESUDAH pengajuan)");

  /* INI yang membuat tabel menampilkan tanggal yang lebih akhir dari
     kenyataan. Field batas TIDAK boleh jadi createdAt - lebih baik "-". */
  assert(deriveCreatedAt({ due: "2026-12-31" }) === null, "deriveCreatedAt TOLAK `due` (tanggal batas)");
  assert(deriveCreatedAt({ end: "2026-12-31" }) === null, "deriveCreatedAt TOLAK `end`");
  assert(deriveCreatedAt({ expires: "2026-12-31" }) === null, "deriveCreatedAt TOLAK `expires`");
  assert(deriveCreatedAt({ pay1date: "2026-12-31" }) === null, "deriveCreatedAt TOLAK `pay1date`");
}

{
  assert(deriveCreatedAt({ date: "bukan tanggal" }) === null, "deriveCreatedAt tolak string bukan tanggal");
  assert(deriveCreatedAt({}) === null, "deriveCreatedAt null untuk rekam tanpa tanggal");
  assert(deriveCreatedAt(null) === null, "deriveCreatedAt null untuk null");
}

/* ---- rowMatches ---- */
type Baris = { id: string; title: string; total: number | null };
const inv: Baris = { id: "INV-001", title: "Kwitansi Perbaikan", total: 5_000_000 };

{
  assert(rowMatches(inv, "", ["id", "title"]), "rowMatches: query kosong = semua baris lolos");
  assert(rowMatches(inv, "kwitansi", ["id", "title"]), "rowMatches: case-insensitive");
  assert(rowMatches(inv, "INV-001", ["id"]), "rowMatches: cocok persis pada id");
  assert(rowMatches(inv, "kwitansi perbaikan", ["title"]), "rowMatches: beberapa kata (AND) pada satu field");
}

{
  /* Bug yang ditemukan di audit: kolom pratinjau dihapus tapi pencarian tetap
     tidak bisa menemukan invoice berdasarkan nomor dokumen, karena `id` tidak
     pernah ikut dicari. */
  assert(!rowMatches(inv, "INV-001", ["title"]), "rowMatches: TIDAK cocok pada field yang tidak diminta");
}

{
  /* Search lama masih dipakai di sebagian tabel dengan semantik berbeda.
     Kalau `rowMatches` ikut berubah, hasil filter di halaman yang sudah jadi
     ikut bergeser - itu fitur, bukan perbaikan. */
  assert(!rowMatches(inv, "kwitansi xyz", ["title"]), "rowMatches: semua kata harus cocok");
  assert(rowMatches(inv, "  ", ["id"]), "rowMatches: query spasi saja dianggap kosong");
  assert(rowMatches(inv, "5000000", ["total"]), "rowMatches: angka bisa dicari lewat String()");
}

{
  assert(!rowMatches({ id: "A", note: null } as Record<string, unknown>, "abc", ["note"]), "rowMatches: null tidak jadi 'abc'");
  assert(rowMatches({ id: "A", n: 0 } as Record<string, unknown>, "0", ["n"]), "rowMatches: angka 0 tetap bisa dicari (0 bukan falsy di sini)");
}

const asWo = (v: unknown): StoreItem => v as unknown as StoreItem;

/* ---- docTypes: daftar tipe & sub-tipe harus sinkron antar modul ---- */
{
  /* Dua daftar tipe yang tadinya ditulis terpisah (Documents 11 nilai,
     ProjectDetail 8 nilai) dan sudah berkhianat: Penawaran/Dock Space/Surat
     Jalan/Tanda Terima tidak bisa dibuat dari tab proyek. */
  assert(DOC_TYPES.length === 11, "DOC_TYPES = 11 jenis", String(DOC_TYPES.length));
  for (const t of ["Penawaran", "Dock Space", "Surat Jalan", "Tanda Terima", "NCR"]) {
    assert(DOC_TYPES.includes(t as (typeof DOC_TYPES)[number]), `tipe ${t} ada di daftar bersama`);
  }

  /* "Kontrak Kerja" dulu tipe sendiri di form proyek tanpa sub-tipe apa pun,
     sehingga dropdown sub-tipenya selalu kosong. Sekarang jadi sub-tipe. */
  assert(!DOC_TYPES.includes("Kontrak Kerja" as (typeof DOC_TYPES)[number]), "Kontrak Kerja BUKAN tipe lagi");
  assert(subTypesOf("Kontrak").includes("Kontrak Kerja"), "Kontrak Kerja ada di sub-tipe Kontrak");
  assert(subTypesOf("Kontrak Kerja").length === 0, "tipe yang sudah tidak ada tidak punya sub-tipe");
  assert(subTypesOf("Entah").length === 0, "tipe asing aman -> array kosong, bukan error");

  /* Setiap tipe yang punya sub-tipe harus punya >=1 nilai. Dropdown kosong
     persis kelihatan di UI sebagai "tidak ada pilihan". */
  for (const t of Object.keys(SUB_TYPES)) {
    assert(SUB_TYPES[t].length > 0, `sub-tipe ${t} tidak kosong`);
    assert(subTypesOf(t) === SUB_TYPES[t], `subTypesOf(${t}) konsisten dengan SUB_TYPES`);
  }

  assert(NEEDS_QC_LINK.has("Sertifikat K3"), "Sertifikat K3 wajib punya rujukan QC");
  assert(NEEDS_QC_LINK.has(QC_CERT_SUBTYPE), "Sertifikat QC sendiri masuk daftar yang butuh rujukan");
  assert(!NEEDS_QC_LINK.has("Sertifikat Lainnya"), "Sertifikat Lainnya tidak butuh rujukan QC");
}

/* ---- qcCertCandidates: kandidat tidak boleh salah makna ---- */
{
  type Doc = StoreItem;
  const docs: Doc[] = [
    { id: "D-QC", type: "Sertifikat", project: "P1", subType: "Sertifikat QC", title: "QC" },
    { id: "D-K3A", type: "Sertifikat", project: "P1", subType: "Sertifikat K3", title: "K3 a" },
    { id: "D-K3B", type: "Sertifikat", project: "P1", subType: "Sertifikat K3", title: "K3 b" },
    { id: "D-LEGACY", type: "Sertifikat", project: "P1", title: "tanpa subType" },
    { id: "D-OTHER", type: "Sertifikat", project: "P2", subType: "Sertifikat QC", title: "proyek lain" },
    { id: "D-REPORT", type: "Laporan", project: "P1", title: "bukan sertifikat" },
  ];

  /* Kalau sudah ada Sertifikat QC, hanya itu yang boleh dipilih - K3 lain
     bukan bukti QC. */
  const c1 = qcCertCandidates(docs, "P1", "", "Sertifikat K3").map((d) => String(d.id));
  assert(c1.length === 1 && c1[0] === "D-QC", "kandidat QC = hanya Sertifikat QC", c1.join(","));

  /* dokumen yang lagi diedit tidak boleh jadi rujukan dirinya sendiri. */
  const c2 = qcCertCandidates(docs, "P1", "D-QC", "Sertifikat K3").map((d) => String(d.id));
  assert(!c2.includes("D-QC"), "dokumen yang sedang diedit dikeluarkan dari kandidat");
  assert(c2.length === 0, "tidak ada Sertifikat QC lain di proyek itu", c2.join(","));

  /* Fallback untuk data lama: tidak ada dokumen ber-subType sama sekali,
     semua sertifikat proyek jadi kandidat. Tanpa ini dropdownnya kosong
     untuk seluruh data yang sudah ada. */
  const legacy: Doc[] = [
    { id: "L-1", type: "Sertifikat", project: "P9", title: "lama 1" },
    { id: "L-2", type: "Sertifikat", project: "P9", title: "lama 2" },
    { id: "L-3", type: "Laporan", project: "P9", title: "bukan sertifikat" },
  ];
  const c3 = qcCertCandidates(legacy, "P9", "").map((d) => String(d.id));
  assert(c3.length === 2, "fallback: sertifikat tanpa subType tetap bisa dipilih", `${c3.length} -> ${c3.join(",")}`);
  assert(!c3.includes("L-3"), "fallback tidak memasukkan dokumen non-sertifikat");

  /* Kandidat dengan sub-tipe yang sama dikecualikan: tanpa ini "Sertifikat K3"
     bisa dipilih sebagai bukti QC untuk "Sertifikat K3" lain - relasi yang
     secara makna tidak ada tapi tidak ada yang menolak. */
  const c4 = qcCertCandidates(
    [{ id: "S-1", type: "Sertifikat", project: "P8", subType: "Sertifikat K3" }],
    "P8",
    "",
    "Sertifikat K3",
  );
  assert(c4.length === 0, "sub-tipe yang sama dikecualikan dari kandidat", String(c4.length));

  assert(qcCertCandidates([], "P1", "").length === 0, "kandidat dari daftar kosong -> kosong");
  assert(qcCertCandidates(docs, "TIDAK-ADA", "").length === 0, "proyek tanpa sertifikat -> kosong");
}

/* ---- woMilestones: progress WO harus turunan, bukan teks ---- */
{
  /* Tanpa milestone, angka manual yang jadi. WO lama tidak boleh ikut 0%. */
  assert(woProgressOf({ id: "W-1", progress: 70 }) === 70, "WO tanpa milestone pakai progress manual", String(woProgressOf({ id: "W-1", progress: 70 })));
  assert(woProgressOf({ id: "W-2" }) === 0, "WO tanpa progress juga 0, bukan NaN");
  assert(woProgressOf({ id: "W-3", progress: 999 }) === 100, "progress manual di clamp ke 100", String(woProgressOf({ id: "W-3", progress: 999 })));
  assert(woProgressOf({ id: "W-4", progress: -5 }) === 0, "progress negatif di clamp ke 0");
  assert(woProgressOf({ id: "W-5", progress: "abc" }) === 0, "progress bukan angka -> 0, bukan NaN");
  assert(woProgressOf(null) === 0, "null aman -> 0");

  /* Pembagian memakai TOTAL bobot. Karena 30+30+40 = 100, hasilnya sama
     dengan membagi 100 - jadi yang membuktikan aturan ini adalah kasus
     totalnya bukan 100 (lihat bobot 1/1 di bawah). */
  const wo = (ms: unknown[], progress?: number): StoreItem => ({ id: "W-M", progress, milestones: ms }) as unknown as StoreItem;
  const m = (title: string, pct: number, done: boolean) => ({ title, pct, due: "2026-12-31", doneAt: done ? "2026-10-01" : "" });

  assert(woProgressOf(wo([m("A", 30, true), m("B", 30, false), m("C", 40, false)])) === 30, "1 dari 3 tahap (30/30/40) = 30%", String(woProgressOf(wo([m("A", 30, true), m("B", 30, false), m("C", 40, false)]))));
  assert(woProgressOf(wo([m("A", 30, true), m("B", 30, true), m("C", 40, false)])) === 60, "2 dari 3 tahap = 60%", String(woProgressOf(wo([m("A", 30, true), m("B", 30, true), m("C", 40, false)]))));
  assert(woProgressOf(wo([m("A", 30, true), m("B", 30, true), m("C", 40, true)])) === 100, "semua tahap selesai = 100%");
  assert(woProgressOf(wo([m("A", 1, true), m("B", 1, true)])) === 100, "total bobot 2, bukan 100 -> tetap 100% saat semua selesai", String(woProgressOf(wo([m("A", 1, true), m("B", 1, true)]))));

  /* Punya milestone tapi belum ada yang selesai = 0, BUKAN jatuh ke manual. */
  assert(woProgressOf(wo([m("A", 30, false), m("B", 70, false)], 90)) === 0, "milestone ada tapi belum selesai -> 0 (bukan angka manual 90)", String(woProgressOf(wo([m("A", 30, false), m("B", 70, false)], 90))));

  /* Data rusak tidak boleh membuat NaN terlihat di UI. */
  assert(woProgressOf(wo([m("A", 0, true), m("B", 0, false)])) === 0, "semua bobot 0 -> 0 (bukan NaN)");
  assert(woProgressOf(wo([{ title: "X", pct: "abc", due: "", doneAt: "2026-01-01" }])) === 0, "pct bukan angka -> 0");
  assert(woProgressOf(wo([null, undefined, "bukan objek", { title: "  ", pct: 50 }])) === 0, "baris milestone rusak dilewati, total 0");

  assert(woMilestonesOf(asWo({ milestones: "bukan array" })).length === 0, "milestones bukan array -> kosong, bukan error");
  assert(woMilestonesOf(asWo({ milestones: [{ pct: 50 }] })).length === 0, "milestone tanpa judul dibuang");
  assert(woMilestonesOf(undefined).length === 0, "WO undefined aman");
  assert(woMilestonesOf(null).length === 0, "WO null aman");
}

/* Label progress dulu teks bebas: "WO-2026-041 (70%)" diketik manual per
     termin, sehingga bisa tidak cocok dengan angka WO yang sebenarnya. */
{
  const wo = { id: "WO-2026-041", progress: 70 } as StoreItem;
  assert(woProgressLabel(wo) === "WO-2026-041 (70%)", "label progress mengikuti angka WO", woProgressLabel(wo));
  assert(woProgressLabel(null) === "- (0%)", "label WO null tidak meledak", woProgressLabel(null));
}

/* ---- Opsi milestone termin: SOW sub + WO, tanpa duplikat ---- */
{
  const sub = { milestones: [{ title: "Outfitting", pct: 50, due: "" }, { title: "Dokumen", pct: 20, due: "" }] } as unknown as StoreItem;
  const wo = { milestones: [{ title: "Fabrikasi", pct: 30, due: "", doneAt: "" }, { title: "Outfitting", pct: 50, due: "" }] } as unknown as StoreItem;

  const both = terminMilestoneOptions(sub, wo);
  assert(both.length === 3, "SOW sub 2 + WO 1 baru (judul sama digabung) = 3", String(both.length));
  assert(both.map((x) => x.title).join(",") === "Outfitting,Dokumen,Fabrikasi", "urutan: SOW sub dulu, lalu WO", both.map((x) => x.title).join(","));

  /* Judul sama dari sub DAN WO harus satu kali supaya cap termin tidak
     terhitung dua kali untuk tahap yang sama. */
  const dup = both.filter((x) => x.title === "Outfitting");
  assert(dup.length === 1, "judul identik sub+WO digabung jadi satu opsi", String(dup.length));

  assert(terminMilestoneOptions(sub, null).length === 2, "tanpa WO, tetap pakai SOW sub");
  assert(terminMilestoneOptions(null, wo).length === 2, "tanpa sub, tetap pakai milestone WO");
  assert(terminMilestoneOptions(null, null).length === 0, "tanpa keduanya -> tidak ada opsi");
  assert(terminMilestoneOptions(asWo({ milestones: "x" }), null).length === 0, "milestones rusak -> kosong");
}

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan fondasi`);
  process.exit(1);
}
console.log("\nFondasi F0 lolos: timestamp + pencarian daftar.");
process.exit(0);
