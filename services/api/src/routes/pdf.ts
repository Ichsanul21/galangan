/* Route PDF: server merakit dokumen resmi dari datanya sendiri.
 *
 * Prinsip integritas - ini alasan kenapa PDF pindah ke server sama sekali:
 * kalau PDF dirakit di browser dari payload yang dikirim klien, siapa pun
 * bisa membuat kwitansi dengan nominal yang tidak ada di pembukuan lalu
 * mencetaknya sebagai dokumen resmi. Dengan render di server:
 *   - `kind` adalah enum tertutup (registry.ts), bukan nama bebas
 *   - `id` wajib untuk dokumen resmi; server memuat barisnya sendiri
 *   - payload klien tidak pernah dipercaya untuk isi dokumen
 *
 * Yang dikembalikan adalah STREAM (application/pdf), bukan file di disk.
 * Yang disimpan hanya dua jejak: audit (siapa mencetak apa) dan MODEL
 * render (apa yang benar-benar tercetak) - lihat pdf/renderStore.ts.
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth.js";
import { ok } from "../envelope.js";
import { findRecipe, DOC_KINDS, buildFromModel, type RenderContext } from "../pdf/registry.js";
import { getDialect } from "../db.js";
import { writeAudit, requestActor, requestIp } from "../audit.js";
import { saveRenderModel, loadRenderModel } from "../pdf/renderStore.js";
import type { RenderResult } from "../pdf/document.js";

interface RenderBody {
  kind?: string;
  id?: string;
  locale?: string;
}

export function registerPdfRoutes(app: FastifyInstance): void {
  /** Daftar jenis dokumen yang didukung - untuk FE. */
  app.get("/api/pdf/kinds", { preHandler: [requireAuth] }, async () => ok({ kinds: DOC_KINDS }));

  app.post("/api/pdf/render", { preHandler: [requireAuth] }, async (req, reply) => {
    const body = (req.body ?? {}) as RenderBody;
    const kind = String(body.kind ?? "").trim();
    const recipe = findRecipe(kind);
    if (!recipe) {
      return reply.status(400).send({
        ok: false,
        error: { message: `Jenis dokumen tidak dikenal: ${kind || "(kosong)"}`, code: "VALIDATION_ERROR" },
      });
    }
    const id = String(body.id ?? "").trim();
    if (recipe.requiresEntity && id === "") {
      return reply.status(400).send({
        ok: false,
        error: { message: `Dokumen ${kind} wajib menyertakan id entitas`, code: "VALIDATION_ERROR" },
      });
    }
    const ctx: RenderContext = {
      locale: body.locale === "en" ? "en" : "id",
      branch: "SEMUA",
    };

    try {
      /* Tahap 1: model dibaca dari baris DB server. Snapshot ini yang
         disimpan - bukan byte PDF, dan bukan isi dari klien. */
      const model = await recipe.prepare(id, ctx);
      /* Tahap 2: model dirakit jadi dokumen. */
      const doc = buildFromModel(recipe, model, ctx);
      const res = doc.render();

      const modelId = await saveRenderModel({
        kind,
        entityField: recipe.entity.field,
        entityId: id || "-",
        locale: ctx.locale,
        branch: ctx.branch,
        model,
        pages: res.pages,
        bytes: res.bytes.byteLength,
        font: res.embeddedFont ? "ttf" : "std14",
        actor: requestActor(req),
      });

      await writeAudit({
        actor: requestActor(req),
        action: "render_pdf",
        table: recipe.entity.field,
        rowId: id || "-",
        ip: requestIp(req),
        diff: {
          kind,
          pages: res.pages,
          bytes: res.bytes.byteLength,
          engine: "pdf-v2",
          font: res.embeddedFont ? "ttf" : "std14",
          model: modelId ?? "-",
          dialect: getDialect(),
          at: new Date().toISOString(),
        },
      });

      return sendPdf(reply, kind, id, res, modelId, "inline");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ ok: false, error: { message, code: "RENDER_FAILED" } });
    }
  });

  /**
   * Cetak ulang dari snapshot.
   *
   * Endpoint ini TIDAK membaca tabel dokumen - dia memakai model yang
   * tersimpan saat cetakan pertama dibuat. Itu satu-satunya cara cetak ulang
   * bisa dipertanggungjawabkan: kalau terminnya sudah dikoreksi, arsipnya
   * tetap mencerminkan angka yang benar-benar dibayarkan waktu itu.
   */
  app.get("/api/pdf/render/:modelId", { preHandler: [requireAuth] }, async (req, reply) => {
    const params = req.params as { modelId?: string };
    const modelId = String(params.modelId ?? "").trim();
    const snap = modelId === "" ? null : await loadRenderModel(modelId);
    if (!snap) {
      return reply.status(404).send({
        ok: false,
        error: { message: `Snapshot cetakan ${modelId || "(kosong)"} tidak ditemukan`, code: "NOT_FOUND" },
      });
    }
    const recipe = findRecipe(snap.kind);
    if (!recipe || snap.model === null) {
      return reply.status(409).send({
        ok: false,
        error: {
          message: `Snapshot ${modelId} tidak bisa dirakit ulang - jenis dokumen atau model tidak lengkap.`,
          code: "SNAPSHOT_INVALID",
        },
      });
    }
    const ctx: RenderContext = { locale: snap.locale === "en" ? "en" : "id", branch: snap.branch || "SEMUA" };
    try {
      const res = buildFromModel(recipe, snap.model, ctx).render();
      await writeAudit({
        actor: requestActor(req),
        action: "reprint_pdf",
        table: snap.entityField,
        rowId: snap.entityId,
        ip: requestIp(req),
        diff: {
          kind: snap.kind,
          model: modelId,
          originalCreatedAt: snap.createdAt,
          originalActor: snap.actor,
          pages: res.pages,
          bytes: res.bytes.byteLength,
          at: new Date().toISOString(),
        },
      });
      return sendPdf(reply, snap.kind, snap.entityId, res, modelId, "inline");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ ok: false, error: { message, code: "RENDER_FAILED" } });
    }
  });
}

/** Header + body PDF. Satu tempat supaya render dan cetak ulang tidak berbeda. */
function sendPdf(
  reply: { header: (k: string, v: string) => unknown; send: (b: Buffer) => unknown },
  kind: string,
  id: string,
  res: RenderResult,
  modelId: string | null,
  disposition: "inline" | "attachment",
): unknown {
  reply.header("Content-Type", "application/pdf");
  reply.header("Content-Length", String(res.bytes.byteLength));
  reply.header("Content-Disposition", `${disposition}; filename="${safeFileName(kind, id)}.pdf"`);
  /* Header kustom: FE memakai ini untuk ditampilkan tanpa parses berkas. */
  reply.header("X-Doc-Kind", kind);
  reply.header("X-Doc-Pages", String(res.pages));
  reply.header("X-Doc-Embedded-Font", res.embeddedFont ? "1" : "0");
  /* Id snapshot: inilah yang dipakai endpoint cetak ulang. */
  reply.header("X-Doc-Model-Id", modelId ?? "");
  reply.header("Cache-Control", "no-store");
  return reply.send(Buffer.from(res.bytes));
}

function safeFileName(kind: string, id: string): string {
  return `${kind}-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`.slice(0, 80);
}