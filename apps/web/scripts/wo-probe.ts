/* Probe milestone WO (item 11) - memeriksa seed nyata, bukan fixture buatan.
   Sifat: satu kali jalan, tidak menulis apa pun ke DB.

   Alasan file ini terpisah: perubahan ini menyentuh definisi "seberapa jauh
   pekerjaan WO berjalan", dan pada akhirnya menentukan CAP TERMIN - angka
   uang yang boleh ditagih. Kalau progress WO melenceng, cap termin ikut
   melenceng, dan itu celah uang bukan tampilan.

   Yang diperiksa di sini adalah data seed yang benar-benar dipakai aplikasi,
   supaya coefisien tidak bisa "benar di probe" tapi salah di data.

   Jalankan: npm run probe:wo */
import { seedWorkOrders, seedTermins } from "../src/data/seeds";
import { subcontractors as seedSubcontractors } from "../src/data/index";
import { woMilestonesOf, woProgressOf, terminMilestoneOptions } from "../src/utils/woMilestones";
import type { StoreItem } from "../src/data/store";

declare const process: { exit(code: number): never };

let fail = 0;
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` -> ${detail}` : ""}`);
};

const wos = seedWorkOrders as StoreItem[];

/* ---- Setiap WO punya milestone, tidak ada yang jadi 0% diam-diam ---- */
{
  const tanpaMs = wos.filter((w) => woMilestonesOf(w).length === 0);
  assert(tanpaMs.length === 0, `${wos.length} WO seed punya milestone`, tanpaMs.map((w) => String(w.id)).join(","));

  for (const w of wos) {
    const ms = woMilestonesOf(w);
    const total = ms.reduce((s, m) => s + m.pct, 0);
    assert(total > 0, `${String(w.id)}: bobot milestone > 0`, String(total));
    /* Bobot total melebihi 100% berarti cap termin untuk tahap-tahap itu
       bisa melebihi nilai kontrak - termin melebihi pagu bisa lolos. */
    assert(total <= 100, `${String(w.id)}: total bobot <= 100 (tidak bisa melebihi kontrak)`, String(total));
  }
}

/* ---- Progress seed harus sesuai dengan milestone-nya ---- */
{
  for (const w of wos) {
    const ms = woMilestonesOf(w);
    const doneCount = ms.filter((m) => m.doneAt !== "").length;
    const v = woProgressOf(w);
    assert(v > 0, `${String(w.id)}: progress bukan 0 (${doneCount}/${ms.length} tahap selesai)`, `${v}%`);
    assert(!Number.isNaN(v), `${String(w.id)}: progress bukan NaN`);
    const status = String(w.status ?? "");
    /* Status harus konsisten dengan progress. WO 100% masih "Dalam Proses"
       membuat Termin melihat pagu penuh sementara pekerjaan belum jalan. */
    if (v >= 100) {
      assert(status === "Selesai", `${String(w.id)}: progress 100% -> status Selesai`, status);
    } else {
      assert(status === "Dalam Proses", `${String(w.id)}: progress <100% -> status Dalam Proses`, status);
    }
  }
}

/* ---- Tidak ada milestone SOW sub dan milestone WO yang bentrok judul ---- */
{
  for (const w of wos) {
    const sub = seedSubcontractors.find((s) => String(s.name ?? "") === String(w.sub ?? "")) as StoreItem | undefined;
    const opts = terminMilestoneOptions(sub, w);
    const titles = opts.map((o) => o.title.toLowerCase());
    const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
    assert(dup.length === 0, `${String(w.id)}: tidak ada judul milestone ganda di opsi termin`, dup.join(","));
    /* Milestone WO harus muncul di opsi termin - kalau tidak, form termin
       tidak bisa menagih per tahap dan user kembali ke input angka. */
    const own = woMilestonesOf(w).map((m) => m.title);
    const missing = own.filter((t) => !opts.some((o) => o.title === t));
    assert(missing.length === 0, `${String(w.id)}: semua milestone WO muncul di opsi termin`, missing.join(","));
  }
}

/* ---- Termin seed: tidak boleh ada teks progress manual lagi ---- */
{
  /* `termins.progress` dulu diisi teks "WO-2026-041 (70%)" per baris, terpisah
     dari angka progress WO. Dua sumber angka untuk hal yang sama, dan tidak
     ada yang memaksa keduanya sinkron - jadi labelnya bisa menampilkan 70%
     sementara milestone-nya baru 30%. Sekarang angka itu HARUS diturunkan
     (lihat `woProgressLabel`), jadi kemunculannya sendiri adalah kegagalan. */
  const manual = (seedTermins as StoreItem[]).filter((t) => String(t.progress ?? "") !== "");
  assert(manual.length === 0, "tidak ada seed termin yang mengetik progress manual", manual.map((t) => String(t.id)).join(","));

  /* Setiap termin harus menunjuk WO yang ada - kalau tidak, cap termin di
    hitung dari 0 dan tidak ada yang melihat. */
  const ids = new Set(wos.map((w) => String(w.id)));
  const orphan = (seedTermins as StoreItem[]).filter((t) => !ids.has(String(t.woId ?? "")));
  assert(orphan.length === 0, "setiap termin menunjuk WO yang ada", orphan.map((t) => String(t.id)).join(","));

  /* Setiap termin harus menunjuk milestone (item 11). Termin tanpa milestone
     berarti tagihan tidak terikat ke tahap pekerjaan tertentu, jadi cap
     pagunya tidak bisa dihitung. */
  const tanpaMs = (seedTermins as StoreItem[]).filter((t) => String(t.milestone ?? "") === "");
  assert(tanpaMs.length === 0, "setiap termin menunjuk milestone", tanpaMs.map((t) => String(t.id)).join(","));
}

/* ---- Termin yang menunjuk milestone harus ditemukan di sana ---- */
{
  const subByName = new Map(seedSubcontractors.map((s) => [String(s.name ?? ""), s as StoreItem]));
  const woById = new Map(wos.map((w) => [String(w.id), w]));
  for (const t of seedTermins as StoreItem[]) {
    const ms = String(t.milestone ?? "");
    if (ms === "") continue;
    const sub = subByName.get(String(t.sub ?? ""));
    const wo = woById.get(String(t.woId ?? ""));
    const opts = terminMilestoneOptions(sub, wo);
    assert(opts.some((o) => o.title === ms), `termin ${String(t.id)}: milestone "${ms}" ada di opsi`);
  }
}

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan milestone WO`);
  process.exit(1);
}
console.log(`\nMilestone WO lolos: ${wos.length} WO diperiksa.`);
process.exit(0);