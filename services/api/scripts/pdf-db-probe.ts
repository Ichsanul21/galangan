/* Uji ujung-ke-ujung cetakan ulang PDF terhadap database sungguhan.
 *
 * Probe (`pdf-probe.ts`) membuktikan mesin dan registry benar dengan model
 * buatan. Probe ini membuktikan hal yang tidak bisa dibuktikan model buatan:
 * baris NYATA dari tabel nyata dibaca `prepare()`, snapshot-nya disimpan,
 * lalu dicetak ulang - dan hasilnya harus identik dengan cetakan pertama.
 *
 * Yang diperiksa:
 *   1. setiap prepare() yang punya baris di DB bisa dirakit jadi PDF
 *   2. snapshot tersimpan dan bisa dibaca kembali
 *   3. reprint dari snapshot menghasilkan isi identik dengan cetakan pertama
 *   4. data yang diubah SESUDAH cetakan pertama tidak mengubah cetakan ulang
 *      (ini inti dari keputusan "cetak ulang dari model")
 *   5. nomor slip gaji cocok dengan baris payroll di DB
 *   6. laporan (mingguan/bulanan/proyek/analitik/rekap) dirakit dari data
 *      nyata, tidak kosong, dan tidak meluber dari halaman
 *
 * Jalankan: npm run probe:pdf-db
 */
import { migrate } from "../src/migrate.js";
import { closeDb, exec, q } from "../src/db.js";
import { findRecipe, DOC_KINDS, buildFromModel } from "../src/pdf/registry.js";
import { checkGeometry } from "../src/pdf/document.js";
import { saveRenderModel, loadRenderModel } from "../src/pdf/renderStore.js";
import { rupiah, type Row } from "../src/pdf/documents/shared.js";

let pass = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
    pass += 1;
  } else {
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
    failures.push(name);
  }
}

interface Sample {
  kind: string;
  id: string;
}

type Ctx = { locale: "id"; branch: string; filters: Record<string, unknown> };

function ctxWith(filters: Record<string, unknown>): Ctx {
  return { locale: "id", branch: "SEMUA", filters };
}

/** Satu baris nyata per kind dokumen yang punya data di DB. */
async function samples(): Promise<Sample[]> {
  const out: Sample[] = [];
  for (const kind of DOC_KINDS) {
    const recipe = findRecipe(kind);
    if (!recipe) continue;
    /* Surat jalan/DO/Tanda Terima/transmittal semua living di `documents`,
       jadi disaring per `type` supaya tidak mengambil baris lain. */
    let sql = `SELECT id FROM ${recipe.entity.field}`;
    if (recipe.entity.field === "documents") {
      const byKind: Record<string, string> = {
        suratJalan: "Surat Jalan",
        deliveryOrder: "Delivery Order",
        tandaTerima: "Tanda Terima",
        transmittal: "Transmittal",
      };
      const type = byKind[kind];
      if (!type) continue;
      const rows = await q<{ id: string }>(`${sql} WHERE data LIKE ?`, [`%"${type}"%`]);
      if (rows[0]) out.push({ kind, id: String(rows[0].id) });
      continue;
    }
    const rows = await q<{ id: string }>(`${sql} LIMIT 1`);
    if (rows[0]) out.push({ kind, id: String(rows[0].id) });
  }
  return out;
}

/**
 * Normalisasi byte PDF sebelum dibandingkan.
 *
 * Dua render dari input yang sama tidak pernah menghasilkan byte identik:
 * jsPDF menulis `/CreationDate` dan `/ID` yang mengandung waktu. Tanpa dua
 * field itu, "cetak ulang identik" akan selalu gagal dan probe ini akan
 * melatih orang untuk menolak assertion yang benar - lebih buruk daripada tidak
 * punya probe. Yang dibandingkan isi dokumennya, bukan stempel waktunya.
 */
function normalizePdf(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("latin1")
    .replace(/\/CreationDate\s*\(D:[^)]*\)/g, "/CreationDate (D:0)")
    .replace(/\/ID\s*\[[^\]]*\]/g, "/ID []");
}

function samePdf(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return normalizePdf(a) === normalizePdf(b);
}

/* ==========================================================================
   Dokumen resmi terhadap baris nyata
   ========================================================================== */

async function probeDocuments(): Promise<void> {
  const found = await samples();
  ok("ada baris nyata untuk diuji", found.length > 0, `${found.length}/${DOC_KINDS.length} kind`);
  const ctx = ctxWith({});

  for (const s of found) {
    const recipe = findRecipe(s.kind);
    if (!recipe) continue;
    /* Laporan tidak punya satu baris asal: isinya agregasi. Uji mutasi di
       bawah menulis ulang baris DB, jadi laporan dilewati di sini - laporan
       diuji di bagian sendiri dengan cara yang tidak merusak data. */
    if (recipe.report) continue;
    let model: unknown = null;
    try {
      model = await recipe.prepare(s.id, ctx);
    } catch (err) {
      ok(`prepare ${s.kind} (${s.id})`, false, err instanceof Error ? err.message : String(err));
      continue;
    }
    /* Model harus berisi isi, bukan semua "-". Model kosong yang lolos dari
       probe biasa karena probe itu memakai data buatan. */
    const json = JSON.stringify(model);
    ok(`prepare ${s.kind} menghasilkan isi`, json.length > 40 && !/"[-]{4,}"/.test(json), `${json.length} B`);

    let first: Uint8Array;
    try {
      first = buildFromModel(recipe, model, ctx).render().bytes;
    } catch (err) {
      ok(`render ${s.kind} dari data nyata`, false, err instanceof Error ? err.message : String(err));
      continue;
    }
    ok(`render ${s.kind} dari data nyata`, Buffer.from(first.subarray(0, 5)).toString() === "%PDF-", `${first.byteLength} B`);

    /* Slip gaji pernah membaca `basicSalary`/`bpjsKes` - nama yang tidak pernah
       ditulis aplikasi, sehingga semua nominal slip jadi nol dan tidak ada yang
       sadar karena dokumen tetap tercetak. */
    if (s.kind === "slipGaji") {
      const rows = (model as { rows?: Array<{ komponen: string; nilai: string }> }).rows ?? [];
      const pokok = rows.find((r) => /Gaji Pokok|Basic salary/i.test(r.komponen));
      const raw = await q<Row>(`SELECT data FROM ${recipe.entity.field} WHERE id = ?`, [s.id]);
      const parsed = raw[0]
        ? ((typeof raw[0].data === "string" ? JSON.parse(raw[0].data) : (raw[0].data ?? {})) as Record<string, unknown>)
        : {};
      const basic = Number(parsed.basic ?? parsed.basicSalary ?? 0);
      ok(
        "slip gaji: gaji pokok sama persis dengan baris DB",
        pokok !== undefined && pokok.nilai === rupiah(basic),
        `${pokok?.nilai ?? "tidak ada"} vs DB ${rupiah(basic)}`,
      );
    }

    const modelId = await saveRenderModel({
      kind: s.kind,
      entityField: recipe.entity.field,
      entityId: s.id,
      locale: ctx.locale,
      branch: ctx.branch,
      model,
      pages: 1,
      bytes: first.byteLength,
      font: "std14",
      actor: "probe",
    });
    ok(`snapshot ${s.kind} tersimpan`, modelId !== null, modelId ?? "-");
    if (!modelId) continue;

    const snap = await loadRenderModel(modelId);
    ok(`snapshot ${s.kind} terbaca`, snap !== null && snap.kind === s.kind, snap === null ? "-" : snap.entityId);
    if (!snap) continue;

    /* Cetak ulang dari snapshot harus identik (di luar stempel waktu). */
    const again = buildFromModel(recipe, snap.model, ctx).render().bytes;
    const same = samePdf(again, first);
    ok(`cetak ulang ${s.kind} identik`, same, same ? "isi sama" : `${first.byteLength} vs ${again.byteLength} B`);

    /* Dan harus tetap identik meski baris asalnya berubah - inilah alasan
       model disimpan. Baris yang diuji dikembalikan seperti semula. */
    const backup = await q<Row>(`SELECT id, branch, data, updated_at FROM ${recipe.entity.field} WHERE id = ?`, [s.id]);
    if (backup[0]) {
      const original = backup[0];
      try {
        await exec(`UPDATE ${recipe.entity.field} SET data = ? WHERE id = ?`, [JSON.stringify({ __probe: true }), s.id]);
        const mutatedFresh = await recipe.prepare(s.id, ctx);
        const fromFresh = buildFromModel(recipe, mutatedFresh, ctx).render().bytes;
        const fromSnap = buildFromModel(recipe, snap.model, ctx).render().bytes;
        ok(
          `cetak ulang ${s.kind} kebal perubahan data`,
          samePdf(fromSnap, first) && !samePdf(fromFresh, first),
          samePdf(fromFresh, first) ? "data baru kebetulan sama (lemah)" : "data baru berbeda, snapshot tetap",
        );
      } catch (err) {
        ok(`uji mutasi ${s.kind}`, false, err instanceof Error ? err.message : String(err));
      } finally {
        await exec(`UPDATE ${recipe.entity.field} SET data = ?, updated_at = ? WHERE id = ?`, [
          typeof original.data === "string" ? original.data : JSON.stringify(original.data),
          original.updated_at,
          s.id,
        ]);
      }
    }
  }
}

/* ==========================================================================
   Laporan terhadap database nyata
   ========================================================================== */

async function probeReports(): Promise<void> {
  const proj = await q<{ id: string }>("SELECT id FROM projects LIMIT 1");
  /* `period` ada di dalam JSON data, bukan sebagai kolom - asking kolomnya
     akan gagal di kedua dialek. */
  const payrollRows = await q<Row>("SELECT id, branch, data, updated_at FROM payroll LIMIT 5");
  const periods = payrollRows
    .map((r) => String((typeof r.data === "string" ? (JSON.parse(r.data) as Record<string, unknown>) : (r.data ?? {})).period ?? ""))
    .filter((p) => p !== "");
  const projectId = proj[0] ? String(proj[0].id) : "";
  const period = periods[0] ?? new Date().toISOString().slice(0, 7);

  const cases: Array<{ kind: string; ctx: Ctx }> = [
    { kind: "laporan", ctx: ctxWith({ mode: "Mingguan" }) },
    { kind: "laporan", ctx: ctxWith({ mode: "Bulanan", period }) },
    { kind: "laporanProyek", ctx: ctxWith({ projectId }) },
    { kind: "analitik", ctx: ctxWith({ scope: "Dashboard", months: 12 }) },
    { kind: "analitik", ctx: ctxWith({ scope: "Analytics", months: 6 }) },
    { kind: "rekapPayroll", ctx: ctxWith({ period }) },
    { kind: "rekapPayroll", ctx: ctxWith({ period, mode: "THR" }) },
  ];

  for (const c of cases) {
    if (c.kind === "laporanProyek" && projectId === "") continue;
    const recipe = findRecipe(c.kind);
    if (!recipe) {
      ok(`laporan ${c.kind} terdaftar`, false);
      continue;
    }
    const label = `${c.kind} (${String(c.ctx.filters.mode ?? c.ctx.filters.scope ?? "default")})`;
    try {
      const model = await recipe.prepare("", c.ctx);
      const res = buildFromModel(recipe, model, c.ctx).render();
      ok(`laporan ${label} dirakit`, Buffer.from(res.bytes.subarray(0, 5)).toString() === "%PDF-", `${res.pages} halaman, ${res.bytes.byteLength} B`);
      const problems = checkGeometry(res, res.margin, { width: res.pageW, height: res.pageH });
      ok(`laporan ${label} geometri`, problems.length === 0, problems.length === 0 ? "aman" : (problems[0]?.reason ?? ""));
    } catch (err) {
      ok(`laporan ${label} dirakit`, false, err instanceof Error ? err.message : String(err));
    }
  }

  /* Laporan yang tercetak kosong tanpa catatan adalah kegagalan diam-diam yang
     paling sering terjadi setelah pemindahan mesin. */
  const analitik = findRecipe("analitik");
  if (analitik && proj.length > 0) {
    const model = (await analitik.prepare("", ctxWith({ scope: "Analytics", months: 12 }))) as {
      kpi: { totalProjects: number };
      series: Array<{ revenue: number; cost: number }>;
    };
    ok("laporan analitik: jumlah proyek terbaca", model.kpi.totalProjects > 0, `${model.kpi.totalProjects} proyek`);
    ok(
      "laporan analitik: deret bulanan terisi",
      model.series.length === 12 && model.series.some((p) => p.revenue > 0 || p.cost > 0),
      `${model.series.filter((p) => p.revenue > 0).length} bulan berisi pendapatan`,
    );
  }

  const rekap = findRecipe("rekapPayroll");
  if (rekap && periods.length > 0) {
    const model = (await rekap.prepare("", ctxWith({ period }))) as { recap: { rows: unknown[] } };
    ok("laporan rekap: baris gaji terbaca", model.recap.rows.length > 0, `${model.recap.rows.length} baris ${period}`);
  }
}

async function main(): Promise<void> {
  await migrate();
  await probeDocuments();
  await probeReports();

  console.log("");
  /* Snapshot probe dibersihkan: database dev tidak boleh dipenuhi baris
     pdfDocs milik probe yang terlihat seperti cetakan sungguhan saat dibuka
     lewat endpoint. Baris audit tidak disentuh - jejaknya harus terlihat. */
  await exec("DELETE FROM pdfDocs WHERE actor = ?", ["probe"]);
  await closeDb();

  if (failures.length > 0) {
    console.log(`GAGAL ${failures.length}/${pass + failures.length}: ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${pass} pemeriksaan PDF-DB lolos (render nyata + snapshot + cetak ulang + laporan).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[probe:pdf-db] gagal:", err);
  process.exit(1);
});