/* Probe D8: risiko otomatis dari WBS dan milestone WO.
   Sifat: satu kali jalan, hanya menghitung; tidak menulis apa pun.

   Aliasan file ini ada karena risiko otomatis bisa diam-diam tidak
   menghasilkan apa pun (aturan terlalu ketat) atau menghasilkan duplikat
   (deduplikasi gagal) tanpa error kompilasi:

   1. Deduplikasi harus berbasis `source` + `wbsTask`, bukan judul.
      Judul bisa sama untuk dua WO berbeda; wbsTask sudah unik per WO.
   2. Task yang sudah selesai harus MENUTUP risiko lama, bukan
      membiarkannya aktif selamanya.
   3. Milestone tanpa due valid harus diabaikan, bukan dianggap terlambat.

   Jalankan: npm run probe:risk */
import { generateRisksFromWbs, generateRisksFromWo } from "../src/utils/riskAuto";
import type { StoreItem } from "../src/data/store";

declare const process: { exit(code: number): never };

let lulus = 0;
let gagal = 0;

function cek(nama: string, ok: boolean, detail = ""): void {
  if (ok) {
    lulus++;
  } else {
    gagal++;
    console.error(`  GAGAL ${nama}${detail ? ` - ${detail}` : ""}`);
  }
}

const TODAY = "2026-10-06";

/* WBS fixtures — akhir Oktober = 2026-10-31, hari ini 2026-10-06 → 25 hari.
   milestoneDays default 7 → 25 > 7, jadi "Fabrikasi Baja" TIDAK trigger
   risiko (end terlalu jauh). Fixture disesuaikan supaya menguji logika: */
const wbsNear = { task: "Hull Assembly", start: "2026-09", end: "2026-10", progress: 45, weight: 12 };
const wbsLate = { task: "Painting", start: "2026-06", end: "2026-09", progress: 50, weight: 5 };
const wbsNotStarted = { task: "Ereksi", start: "2026-08", end: "2026-12", progress: 0, weight: 10 };
const wbsDone = { task: "Fabrikasi Baja", start: "2026-08", end: "2026-10", progress: 100, weight: 12 };
const wbsNoEnd = { task: "Tanpa End", start: "2026-08", end: "", progress: 50, weight: 5 };

/* Kasus 1: WBS kosong → tidak ada risiko, tidak ada close. */
const r1 = generateRisksFromWbs("PRJ-001", [], [], TODAY, 7);
cek("WBS kosong → add kosong", r1.add.length === 0, `add=${r1.add.length}`);
cek("WBS kosong → close kosong", r1.close.length === 0, `close=${r1.close.length}`);

/* Kasus 2: task mendekati jatuh tempo. end=2026-10 (akhir bulan=31), hari ini=2026-10-06 → 25 hari.
   milestoneDays=30 → 25 <= 30 → risiko dibuat, likelihood=Rendah (25 >= 7). */
const r2 = generateRisksFromWbs("PRJ-002", [wbsNear], [], TODAY, 30);
cek("task < 100% + end dekat → risiko dibuat", r2.add.length === 1, `add=${r2.add.length}`);
cek("risiko punya source=WBS", r2.add[0]?.source === "WBS");
cek("risiko punya wbsTask", r2.add[0]?.wbsTask === "Hull Assembly", `wbsTask=${r2.add[0]?.wbsTask}`);
cek("risiko punya title dengan prefix [WBS]", r2.add[0]?.title.startsWith("[WBS]") === true, r2.add[0]?.title);
cek("impact dari weight 12 → Tinggi", r2.add[0]?.impact === "Tinggi", `impact=${r2.add[0]?.impact}`);
cek("status Aktif", r2.add[0]?.status === "Aktif");

/* Kasus 3: task sudah ada risiko → tidak dibuat ulang. */
const existing = [{ id: "RSK-001", project: "PRJ-003", source: "WBS", wbsTask: "Hull Assembly", title: "old" }];
const r3 = generateRisksFromWbs("PRJ-003", [wbsNear], existing as StoreItem[], TODAY, 30);
cek("deduplikasi → add kosong", r3.add.length === 0, `add=${r3.add.length}`);
cek("deduplikasi → close kosong", r3.close.length === 0, `close=${r3.close.length}`);

/* Kasus 4: task selesai → risiko lama ditutup. */
const existingDone = [{ id: "RSK-002", project: "PRJ-004", source: "WBS", wbsTask: "Fabrikasi Baja", title: "old" }];
const r4 = generateRisksFromWbs("PRJ-004", [wbsDone], existingDone as StoreItem[], TODAY, 30);
cek("task 100% → close", r4.close.length === 1 && r4.close[0] === "RSK-002", `close=${JSON.stringify(r4.close)}`);
cek("task 100% → add kosong", r4.add.length === 0);

/* Kasus 5: end sudah lewat → likelihood Tinggi. */
const r5 = generateRisksFromWbs("PRJ-005", [wbsLate], [], TODAY, 30);
cek("end lewat → likelihood Tinggi", r5.add[0]?.likelihood === "Tinggi", `likelihood=${r5.add[0]?.likelihood}`);
cek("title mengandung 'terlambat'", r5.add[0]?.title.includes("terlambat") === true, r5.add[0]?.title);

/* Kasus 6: end kosong → tidak ada risiko, tidak ada close. */
const r6 = generateRisksFromWbs("PRJ-006", [wbsNoEnd], [], TODAY, 30);
cek("end kosong → add kosong", r6.add.length === 0, `add=${r6.add.length}`);

/* Kasus 7: progress 0 + start lewat → risiko "belum mulai". */
const r7 = generateRisksFromWbs("PRJ-007", [wbsNotStarted], [], TODAY, 30);
cek("progress 0 + start lewat → risiko", r7.add.length === 1, `add=${r7.add.length}`);
cek("title mengandung 'belum mulai'", r7.add[0]?.title.includes("belum mulai") === true, r7.add[0]?.title);

/* === WO fixtures === */
const woBasic = [
  { id: "WO-001", project: "PRJ-010", scope: "Fabrikasi section 4-6", milestones: [
    { title: "Material & marking", pct: 30, due: "2026-10-08", doneAt: undefined },
    { title: "Fabrikasi section", pct: 40, due: "2026-11-30", doneAt: undefined },
    { title: "Blasting & painting", pct: 30, due: "2026-09-15", doneAt: "2026-09-10" },
  ]},
];

/* Kasus 8: WO milestone mendekati jatuh tempo (due 2026-10-08, hari ini 2026-10-06 → H-2). */
const r8 = generateRisksFromWo("PRJ-010", woBasic as StoreItem[], [], TODAY, 7);
cek("WO milestone H-2 → risiko", r8.add.length === 1, `add=${r8.add.length}`);
cek("risiko punya source=WO", r8.add[0]?.source === "WO", `source=${r8.add[0]?.source}`);
cek("wbsTask = WO id + title", r8.add[0]?.wbsTask === "WO-001:Material & marking", `wbsTask=${r8.add[0]?.wbsTask}`);
cek("likelihood Tinggi (H-2 < 3)", r8.add[0]?.likelihood === "Tinggi", `likelihood=${r8.add[0]?.likelihood}`);

/* Kasus 9: WO milestone sudah selesai → close. */
const existingWo = [{ id: "RSK-010", project: "PRJ-010", source: "WO", wbsTask: "WO-001:Blasting & painting", title: "old" }];
const r9 = generateRisksFromWo("PRJ-010", woBasic as StoreItem[], existingWo as StoreItem[], TODAY, 7);
cek("WO milestone doneAt → close", r9.close.length === 1 && r9.close[0] === "RSK-010", `close=${JSON.stringify(r9.close)}`);

/* Kasus 10: WO tanpa milestones → tidak ada risiko. */
const woNoMs = [{ id: "WO-002", project: "PRJ-011", scope: "Overhaul", milestones: undefined }];
const r10 = generateRisksFromWo("PRJ-011", woNoMs as StoreItem[], [], TODAY, 7);
cek("WO tanpa milestone → add kosong", r10.add.length === 0, `add=${r10.add.length}`);

/* Kasus 11: WO milestone due kosong → diabaikan. */
const woNoDue = [{ id: "WO-003", project: "PRJ-012", scope: "Panel delivery", milestones: [
  { title: "Panel delivery", pct: 50, due: "", doneAt: undefined },
]}];
const r11 = generateRisksFromWo("PRJ-012", woNoDue as StoreItem[], [], TODAY, 7);
cek("milestone tanpa due → add kosong", r11.add.length === 0, `add=${r11.add.length}`);

console.log(`risk-auto-probe: ${lulus} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
process.exit(0);