/* Probe F2: geometri Peta Fasilitas Drydock.
   Sifat: satu kali jalan, hanya menghitung geometri; tidak menulis apa pun.

   Aliasan file ini ada: peta fasilitas paling mungkin salah bukan karena tidak
   bisa digambar, tapi karena terlihat benar padahal mengukur hal yang berbeda.
   Empat kelas kesalahan yang nyata terjadi di sini:

   1. Skala per baris. Kalau tiap fasilitas memakai px-per-meter sendiri,
      drydock 120 m dan slipway 80 m sama panjang di layar. Peta jadi berbohong
      tanpa error.
   2. Fasilities diperbesar supaya kapal muat. lengthwise masalah hilang dari
      layar, bukan dari dunia.
   3. Dimensi kapal dikarang. Kapal tanpa LOA diberi panjang "kira-kira" supaya
      pita terlihat rapi.
   4. Batas "tidak muat" memakai >=, sehingga kapal yang pas persis dianggap
      tidak muat - atau sebaliknya, yang melebihi lolos.

   Jalankan: npm run probe:facility */
import {
  facilityOf,
  niceScaleDistance,
  parseCapacityMeters,
  ribbonFor,
  scaleFor,
  violations,
  type Facility,
  type VesselDim,
} from "../src/utils/facilityMap";
import { drydocks, dockSlots, vessels } from "../src/data/index";

declare const process: { exit(code: number): never };

let fail = 0;
const assert = (ok: boolean, label: string, detail = ""): void => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` -> ${detail}` : ""}`);
};

const dim = (name: string, loa: number | null, beam: number | null, draft: number | null): VesselDim => ({
  name,
  loa,
  beam,
  draft,
});

const GRAVING: Facility = { id: "DD-1", name: "Drydock 1", kind: "graving", lengthM: 120, widthM: 12, depthM: 6 };

/* ---- 1. Kapasitas legacy tidak boleh jadi sumber dimensi ---- */
{
  assert(parseCapacityMeters("120m / 12m / 6m draft").join(",") === "120,12,6", "uraikan '120m / 12m / 6m draft'", parseCapacityMeters("120m / 12m / 6m draft").join(","));
  assert(parseCapacityMeters("80m / bearer").join(",") === "80", "uraikan '80m / bearer'", parseCapacityMeters("80m / bearer").join(","));
  assert(parseCapacityMeters("New build assembly").length === 0, "'New build assembly' tidak menghasilkan angka", String(parseCapacityMeters("New build assembly").length));
  assert(parseCapacityMeters(undefined).length === 0, "kapasitas kosong tidak menghasilkan angka");
  assert(parseCapacityMeters("12,5m").join(",") === "12.5", "koma desimal diterima", parseCapacityMeters("12,5m").join(","));

  /* Fasilitas tanpa panjang yang terbaca harus DITOLAK, bukan digambar dengan
     panjang tebakan. */
  const tanpaPanjang = facilityOf({ id: "BH-1", name: "Berth 1", capacity: "New build assembly" });
  assert(tanpaPanjang === null, "fasilitas tanpa panjang terbaca ditolak (tidak dikarang)", String(tanpaPanjang));

  /* Angka eksplisit menang atas teks: capacity bisa saja sudah usang. */
  const eksplisit = facilityOf({ id: "DD-1", name: "Drydock 1", capacity: "999m / 1m", lengthM: 120, widthM: 12, depthM: 6 });
  assert(eksplisit?.lengthM === 120, "lengthM eksplisit menang atas capacity", String(eksplisit?.lengthM));

  const jenis = facilityOf({ id: "SL-1", name: "Slipway 1", lengthM: 80, widthM: 10 });
  assert(jenis?.kind === "slipway", "jenis slipway terdeteksi dari nama", jenis?.kind);
  assert(jenis?.depthM === null, "slipway tidak punya kedalaman", String(jenis?.depthM));
  const berth = facilityOf({ id: "BH-1", name: "Berth 1", lengthM: 150, widthM: 30, depthM: 8 });
  assert(berth?.kind === "berth", "jenis berth terdeteksi", berth?.kind);
  const graving = facilityOf({ id: "DD-2", name: "Drydock 2 - Panjang 90m", lengthM: 90 });
  assert(graving?.kind === "graving", "drydock default-nya graving", graving?.kind);
}

/* ---- 2. Skala: satu untuk semua, dan tidak pernah nol ---- */
{
  assert(scaleFor(0, 500) === 0, "panjang 0 -> skala 0, bukan NaN atau Infinity", String(scaleFor(0, 500)));
  assert(scaleFor(120, 0) === 0, "target 0 -> skala 0", String(scaleFor(120, 0)));
  const scale = scaleFor(150, 600);
  assert(scale > 0, "skala positif untuk input wajar", String(scale));

  /* Yang menentukan: perbandingan panjang harus persis proporsional. */
  const dd1 = 120 * scale;
  const sl1 = 80 * scale;
  assert(Math.abs(dd1 / sl1 - 120 / 80) < 1e-9, "rasio panjang facility persis proporsional", `${dd1.toFixed(2)} vs ${sl1.toFixed(2)}`);

  /* Batas atas px-per-meter: tanpa itu drydock pendek bisa jadi raksasa. */
  const capped = scaleFor(10, 600, 24);
  assert(capped === 24, "skala dihBATAS maxPxPerM", String(capped));
}

/* ---- 3. Pita kapal: panjang asli, tidak diperkecil ---- */
{
  const scale = 4;
  const muat = ribbonFor(GRAVING, dim("muat", 90, 9, 4), scale);
  assert(muat.widthPx === 360, "pita kapal 90 m = 90 x skala", String(muat.widthPx));
  assert(muat.overflowPx === 0, "kapal muat tidak meluber", String(muat.overflowPx));
  assert(muat.known === true, "pita Known saat ada LOA");

  const lebih = ribbonFor(GRAVING, dim("lebih", 150, 9, 4), scale);
  assert(lebih.widthPx === 600, "pita kapal 150 m tetap 150 x skala (tidak dikecilkan)", String(lebih.widthPx));
  assert(lebih.overflowPx === 120, "keluberan = panjang pita - panjang fasilitas", String(lebih.overflowPx));
  assert(lebih.overflowPx === 30 * scale, "keluberan 30 m terhitung dalam piksel", String(lebih.overflowPx));

  /* Tanpa LOA tidak ada pita; panjang dikarang justru lebih buruk. */
  const tanpa = ribbonFor(GRAVING, dim("?", null, 9, 4), scale);
  assert(tanpa.widthPx === 0 && tanpa.known === false, "kapal tanpa LOA tidak dapat pita", `${tanpa.widthPx}/${tanpa.known}`);

  const nol = ribbonFor(GRAVING, dim("nol", 0, 9, 4), scale);
  assert(nol.known === false, "LOA 0 diperlakukan tidak diketahui, bukan nol meter");

  /* Skala rusak tidak boleh menghasilkan pitafake. */
  assert(ribbonFor(GRAVING, dim("x", 90, 9, 4), 0).widthPx === 0, "skala 0 -> tanpa pita");
}

/* ---- 4. Deteksi tidak muat, termasuk batasnya ---- */
{
  /* Kapal PAS PERSIS = muat, bukan tidak muat. Ini batas yang paling mudah
     salah dan paling sering disalahartikan. */
  assert(violations(GRAVING, dim("pas", 120, 12, 6)).length === 0, "kapal pas persis dianggap muat", violations(GRAVING, dim("pas", 120, 12, 6)).map((v) => v.kind).join(","));

  const panjang = violations(GRAVING, dim("panjang", 121, 9, 4));
  assert(panjang.length === 1 && panjang[0]?.kind === "loa", "121 m pada dock 120 m = tidak muat", panjang.map((v) => v.kind).join(","));
  assert(panjang[0]?.overBy === 1, "selisih 1 m tercatat", String(panjang[0]?.overBy));
  assert((panjang[0]?.message ?? "").includes("120"), "pesan menyebut panjang fasilitas", panjang[0]?.message ?? "");

  const lebar = violations(GRAVING, dim("lebar", 100, 13, 4));
  assert(lebar.some((v) => v.kind === "beam"), "beam 13 m pada lebar 12 m = tidak muat");

  const draft = violations(GRAVING, dim("draft", 100, 9, 6.5));
  assert(draft.some((v) => v.kind === "draft"), "draft 6,5 m pada kedalaman 6 m = tidak muat");

  /* Dimensi tidak diketahui TIDAK boleh dihitung sebagai pelanggaran. */
  const unknowns = violations(GRAVING, dim("?", null, null, null));
  assert(unknowns.length === 0, "dimensi tidak diketahui bukan pelanggaran", unknowns.map((v) => v.kind).join(","));

  /* Slipway tidak punya kedalaman: draft tidak boleh dibandingkan. */
  const slip: Facility = { id: "SL-1", name: "Slipway 1", kind: "slipway", lengthM: 80, widthM: 10, depthM: null };
  const diSlip = violations(slip, dim("dalam", 70, 8, 5));
  assert(!diSlip.some((v) => v.kind === "draft"), "slipway tanpa kedalaman tidak menolak draft", diSlip.map((v) => v.kind).join(","));

  /* Beberapa pelanggaran sekaligus harus semuanya dilaporkan. */
  const semua = violations(GRAVING, dim("ganda", 130, 14, 7));
  assert(semua.length === 3, "pelanggaran ganda dilaporkan semua", semua.map((v) => v.kind).join(","));
}

/* ---- 5. Skala panjang di bawah peta harus angka yang berarti ---- */
{
  const scale = 4;
  assert(niceScaleDistance(120, scale) === 20, "skala 30 m jadi 20 m", String(niceScaleDistance(120, scale)));
  assert(niceScaleDistance(90, scale) === 20, "skala 22,5 m jadi 20 m", String(niceScaleDistance(90, scale)));
  assert(niceScaleDistance(200, scale) === 50, "skala 50 m tetap 50 m", String(niceScaleDistance(200, scale)));
  assert(niceScaleDistance(30, scale) === 5, "skala 7,5 m jadi 5 m", String(niceScaleDistance(30, scale)));
  /* Selalu 1, 2, atau 5 x 10^n. */
  for (const px of [10, 33, 77, 120, 300, 640]) {
    const d = niceScaleDistance(px, scale);
    const mantissa = d / Math.pow(10, Math.floor(Math.log10(d)));
    const ok = Math.abs(mantissa - 1) < 1e-9 || Math.abs(mantissa - 2) < 1e-9 || Math.abs(mantissa - 5) < 1e-9;
    assert(ok, `skala ${px}px -> ${d} m (1/2/5 x 10^n)`, String(mantissa));
  }
  assert(niceScaleDistance(0, scale) === 0, "target 0 -> skala 0");
  assert(niceScaleDistance(120, 0) === 0, "skala 0 -> jarak 0");
}

/* ---- 6. Data seed nyata: peta harus bisa digambar dari data yang ada ---- */
{
  const facilities = (drydocks as Record<string, unknown>[]).map(facilityOf).filter((f): f is Facility => f !== null);
  assert(facilities.length === drydocks.length, `semua ${drydocks.length} fasilitas punya panjang yang bisa digambar`, `${facilities.length} dari ${drydocks.length}`);

  const byId = new Map(facilities.map((f) => [f.id, f]));
  assert(byId.get("DD-1")?.lengthM === 120, "DD-1 = 120 m", String(byId.get("DD-1")?.lengthM));
  assert(byId.get("DD-2")?.lengthM === 90, "DD-2 = 90 m", String(byId.get("DD-2")?.lengthM));
  assert(byId.get("SL-1")?.lengthM === 80, "SL-1 = 80 m", String(byId.get("SL-1")?.lengthM));

  /* Satu skala dipakai bersama: panjang terpanjang jadi acuan. */
  const longest = facilities.reduce((m, f) => Math.max(m, f.lengthM), 0);
  const scale = scaleFor(longest, 600);
  assert(scale > 0, "skala bersama terhitung dari fasilitas terpanjang", `${longest} m -> ${scale.toFixed(3)} px/m`);
  assert(120 * scale <= 600 + 1e-9, "fasilitas terpanjang muat di lebar peta", `${(120 * scale).toFixed(1)} px`);

  /* Kapal di slot harus ada di master, kalau tidak pitanya kosong dan tidak
     ada yang mengetahuinya. */
  const master = new Map(vessels.map((v) => [String(v.name).trim().toLowerCase(), v]));
  const missing: string[] = [];
  const withoutLoa: string[] = [];
  for (const s of dockSlots as Record<string, unknown>[]) {
    const name = String(s.vessel ?? "").trim();
    if (name === "") continue;
    const v = master.get(name.toLowerCase());
    if (v === undefined) {
      missing.push(`${String(s.id)}=${name}`);
      continue;
    }
    if (!(Number(v.loa) > 0)) withoutLoa.push(`${String(s.id)}=${name}`);
  }
  assert(missing.length === 0, `semua ${dockSlots.length} kapal slot ada di master vessels`, missing.join(", "));
  assert(withoutLoa.length === 0, "setiap kapal slot punya LOA (pita bisa digambar)", withoutLoa.join(", "));

  /* Dan setiap fasilitas yang dipakai slot benar-benar ada. */
  const dockIds = new Set(dockSlots.map((s) => String(s.dockId)));
  const takAda = [...dockIds].filter((id) => !byId.has(id));
  assert(takAda.length === 0, "setiap dockId di slot punya fasilitas", takAda.join(", "));
}

if (fail > 0) {
  console.log(`\nGAGAL: ${fail} pemeriksaan geometri peta`);
  process.exit(1);
}
console.log("\nPeta fasilitas F2 lolos: skala tunggal, pita proporsional, batas tidak muat tegas.");
process.exit(0);
