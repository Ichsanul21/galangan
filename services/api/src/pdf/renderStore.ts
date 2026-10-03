/* Penyimpanan model render PDF - sumber tunggal untuk cetak ulang.
 *
 * Yang disimpan di sini BUKAN PDF dan BUKAN isi dokumen yang dikirim klien,
 * melainkan input final factory setelah server membaca baris DB-nya sendiri
 * (`prepare()` di registry.ts). Ada dua hal yang benar-benar butuh ini:
 *
 *   1. CETAK ULANG IDENTIK. Kalau kwitansi dicetak hari ini lalu barisnya
 *      dikoreksi besok, merender ulang dari tabel akan menghasilkan dokumen
 *      yang berbeda dari arsip - dan tidak ada cara membuktikan cetakan mana
 *      yang benar. Dengan model tersimpan, cetakan kedua memakai input yang
 *      sama persis dengan cetakan pertama.
 *   2. BUKTI AUDIT. Snapshot berisi apa yang sebenarnya dicetak: nomor,
 *      nama, nominal, item, tanggal. Jejak audit (routes/pdf.ts) mencatat
 *      siapa yang mencetaknya; baris di sini mencatat apa isinya.
 *
 * Berkas PDF tetap tidak pernah menyentuh disk: route merakit ulang dari
 * model lalu mengalirkan byte-nya ke klien.
 */
import { exec, getDialect, q } from "../db.js";
import { newAuditId } from "../audit.js";

export interface RenderModelRow {
  id: string;
  kind: string;
  entityField: string;
  entityId: string;
  locale: string;
  branch: string;
  model: unknown;
  pages: number;
  bytes: number;
  engine: string;
  font: string;
  actor: string;
  createdAt: string;
}

export interface RenderModelInput {
  kind: string;
  entityField: string;
  entityId: string;
  locale: string;
  branch: string;
  model: unknown;
  pages: number;
  bytes: number;
  font: string;
  actor: string;
}

/**
 * Simpan snapshot. Best-effort: kegagalan menulis snapshot tidak boleh
 * membatalkan cetakan yang sedang diminta - pengguna sudah menekan tombol,
 * dan dokumennya tetap sah karena dirakit dari DB, bukan dari model.
 */
export async function saveRenderModel(input: RenderModelInput): Promise<string | null> {
  const id = `PDF-${newAuditId()}`;
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify(input.model ?? null);
  try {
    /* SQLite bisa menimpa dengan INSERT OR REPLACE; MySQL memakai ON DUPLICATE
       KEY UPDATE. Id baru selalu unik, jadi keduanya praktis sama - bentuknya
       cuma dipilih supaya tidak perlu percabangan saat baca. */
    if (getDialect() === "mysql") {
      await exec(
        `INSERT INTO pdfDocs (id, kind, entity_field, entity_id, locale, branch, model, pages, bytes, engine, font, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE model = VALUES(model), pages = VALUES(pages)`,
        [
          id,
          input.kind,
          input.entityField,
          input.entityId,
          input.locale,
          input.branch,
          payload,
          input.pages,
          input.bytes,
          "pdf-v2",
          input.font,
          input.actor,
          createdAt,
        ],
      );
    } else {
      await exec(
        `INSERT OR REPLACE INTO pdfDocs (id, kind, entity_field, entity_id, locale, branch, model, pages, bytes, engine, font, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.kind,
          input.entityField,
          input.entityId,
          input.locale,
          input.branch,
          payload,
          input.pages,
          input.bytes,
          "pdf-v2",
          input.font,
          input.actor,
          createdAt,
        ],
      );
    }
    return id;
  } catch (err) {
    console.warn("[pdf] snapshot model gagal disimpan:", err instanceof Error ? err.message : err);
    return null;
  }
}

interface RawRow {
  id: string;
  kind: string;
  entity_field: string;
  entity_id: string;
  locale: string;
  branch: string | null;
  model: string;
  pages: number;
  bytes: number;
  engine: string;
  font: string;
  actor: string;
  created_at: string;
}

/** Baca satu snapshot untuk dicetak ulang. */
export async function loadRenderModel(id: string): Promise<RenderModelRow | null> {
  const rows = await q<RawRow>(
    "SELECT id, kind, entity_field, entity_id, locale, branch, model, pages, bytes, engine, font, actor, created_at FROM pdfDocs WHERE id = ?",
    [id],
  );
  const first = rows[0];
  if (!first) return null;
  let model: unknown = null;
  try {
    model = JSON.parse(first.model);
  } catch {
    /* Snapshot rusak tidak boleh membuat endpoint meledak; dicatat sebagai
       model null supaya pemanggil melaporkan kegagalan dengan jelas. */
    model = null;
  }
  return {
    id: String(first.id),
    kind: String(first.kind),
    entityField: String(first.entity_field),
    entityId: String(first.entity_id),
    locale: String(first.locale),
    branch: String(first.branch ?? "SEMUA"),
    model,
    pages: Number(first.pages ?? 0),
    bytes: Number(first.bytes ?? 0),
    engine: String(first.engine ?? "pdf-v2"),
    font: String(first.font ?? "std14"),
    actor: String(first.actor ?? ""),
    createdAt: String(first.created_at ?? ""),
  };
}

/** Riwayat cetak untuk satu entitas - dipakai audit, bukan untuk merender. */
export async function listRenderHistory(kind: string, entityId: string, limit = 20): Promise<RenderModelRow[]> {
  const rows = await q<RawRow>(
    "SELECT id, kind, entity_field, entity_id, locale, branch, model, pages, bytes, engine, font, actor, created_at FROM pdfDocs WHERE kind = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?",
    [kind, entityId, Math.max(1, Math.min(100, Math.floor(limit)))],
  );
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    entityField: String(r.entity_field),
    entityId: String(r.entity_id),
    locale: String(r.locale),
    branch: String(r.branch ?? "SEMUA"),
    model: null,
    pages: Number(r.pages ?? 0),
    bytes: Number(r.bytes ?? 0),
    engine: String(r.engine ?? "pdf-v2"),
    font: String(r.font ?? "std14"),
    actor: String(r.actor ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
}