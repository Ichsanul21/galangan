/* Uji ujung-ke-ujungcetakan ulang PDF terhadap database sungguhan.
 *
 * Probe (`pdf-probe.ts`) membuktikan mesin dan registry benar dengan model
 * buatan. Probe ini membuktikan hal yang tidak bisa dibuktikan model buatan:
 * baris NYATA dari tabel nyata dibaca `prepare()`, snapshot-nya disimpan,
 * lalu dicetak ulang - dan hasilnya harus identik dengan cetakan pertama.
 *
 * Yang diperiksa:
 *   1. setiap prepare() yang punya baris di DB bisa dirakit jadi PDF
 *   2. snapshot tersimpan dan bisa dibaca kembali
 *   3. reprint dari snapshot menghasilkan byte identik dengan cetakan pertama
 *   4. data yang diubah SESUDAH cetakan pertama tidak mengubah cetakan ulang
 *      (ini inti dari keputusan "cetak ulang dari model", dan mustahil Dicek
 *      kalau tidak diuji)
 *
 * Jalankan: npm run probe:pdf-db
 */
import { migrate } from "../src/migrate.js";
import { closeDb, q } from "../src/db.js";
import { findRecipe, DOC_KINDS, buildFromModel } from "../src/pdf/registry.js";
import { saveRenderModel, loadRenderModel } from "../src/pdf/renderStore.js";
import { exec } from "../src/db.js";
import type { Row } from "../src/pdf/documents/shared.js";

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

/** Satu baris nyata per kind yang punya data di DB. */
async function samples(): Promise<Sample[]> {
  const out: Sample[] = [];
  for (const kind of DOC_KINDS) {
    const recipe = findRecipe(kind);
    if (!recipe) continue;
    /* Satu baris pertama per jenis dokumen: untuk SJ/DO/TT/transmittal semua
      living di `documents`, jadi disaring per `type` supaya tidak mengambil
       baris yang bukan dokumen itu. */
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
      sql += ` WHERE data LIKE ?`;
      const rows = await q<{ id: string }>(sql, [`%"${type}"%`]);
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
 * Dua render dari input yang sama TIDAK pernah menghasilkan byte identik: jsPDF
 * menulis `/CreationDate` dan `/ID` yang mengandung waktu. Tanpa dua field itu,
 * "cetak ulang identik" akan selalu gagal dan probe ini akan teaches orang
 * untuk menolak assertion yang benar - itu lebih buruk daripada tidak punya
 * probe. Jadi yang dibandingkan adalah isi dokumennya, bukan stempel waktunya.
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

async function main(): Promise<void> {
  await migrate();
  const found = await samples();
  ok("ada baris nyata untuk diuji", found.length > 0, `${found.length}/${DOC_KINDS.length} kind`);

  const ctx = { locale: "id" as const, branch: "SEMUA" };

  for (const s of found) {
    const recipe = findRecipe(s.kind)!;
    let model: unknown = null;
    try {
      model = await recipe.prepare(s.id, ctx);
    } catch (err) {
      ok(`prepare ${s.kind} (${s.id})`, false, err instanceof Error ? err.message : String(err));
      continue;
    }
    /* Guard: model harus berisi isi, bukan semua "-" - inilah data kosong yang
       lolos dari probe biasa karena probe itu memakai model buatan. */
    const json = JSON.stringify(model);
    ok(`prepare ${s.kind} menghasilkan isi`, json.length > 40 && !/"[-]{4,}"/.test(json), `${json.length} B`);
    if (json.length <= 40) {
      /* tetap lanjut: uji struktur tetap jalan, hanya isi yang kosong. */
    }

    let first: Uint8Array;
    try {
      first = buildFromModel(recipe, model, ctx).render().bytes;
    } catch (err) {
      ok(`render ${s.kind} dari data nyata`, false, err instanceof Error ? err.message : String(err));
      continue;
    }
    ok(`render ${s.kind} dari data nyata`, Buffer.from(first.subarray(0, 5)).toString() === "%PDF-", `${first.byteLength} B`);

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
       model disimpan. Baris diuji harus bisa ditulis ulang kembali setelahnya. */
    const backup = await q<Row>(`SELECT id, branch, data, updated_at FROM ${recipe.entity.field} WHERE id = ?`, [s.id]);
    if (backup[0]) {
      const original = backup[0];
      const mutated = { ...original, data: JSON.stringify({ __probe: true, note: "probe mutate" }) };
      try {
        await exec(`UPDATE ${recipe.entity.field} SET data = ? WHERE id = ?`, [mutated.data, s.id]);
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

  console.log("");
  /* Snapshot probe dibersihkan: database dev tidak boleh dipenuhi baris
     pdfDocs milik probe yang terlihat seperti cetakan sungguhan saat dibuka
     lewat endpoint. Baris audit (writeAudit) tidak disentuh - jejak uji
     memang harus tetap terlihat. */
  await exec("DELETE FROM pdfDocs WHERE actor = ?", ["probe"]);
  await closeDb();
  if (failures.length > 0) {
    console.log(`GAGAL ${failures.length}/${pass + failures.length}: ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${pass} pemeriksaan PDF-DB lolos (render nyata + snapshot + cetak ulang).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[probe:pdf-db] gagal:", err);
  process.exit(1);
});