/* Route PDF: server merakit dokumen resmi dari datanya sendiri.
 *
 * Prinsip integritas - ini alasan kenapa PDF pindah ke server sama sekali:
 * kalau PDF dirakit di browser dari payload yang dikirim klien, siapa pun
 * bisa membuat kwitansi dengan nominal yang tidak ada di pembukuan lalu
 * mencetaknya sebagai dokumen resmi. Dengan render di server:
 *   - `kind` adalah enum tertutup (registry.ts), bukan nama bebas
 *   - `id` wajib untuk dokumen resmi; server memuat barisnya sendiri
 *   - payload klien tidak pernah Trusted untuk isi dokumen
 *
 * Yang dikembalikan adalah STREAM (application/pdf), bukan file di disk.
 * Yang disimpan hanya jejak audit - isi dokumen tidak pernah menjadi file
 * yang bisa menumpuk di storage server. Lihat todo3.md bagian "Model
 * penyimpanan".
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAuth } from "../auth.js";
import { ok } from "../envelope.js";
import { findRecipe, DOC_KINDS, type RenderContext } from "../pdf/registry.js";
import { getDialect } from "../db.js";
import { writeAudit, newAuditId, requestActor, requestIp } from "../audit.js";

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
      const doc = await recipe.build(id, ctx);
      const res = doc.render();
      /* Jejak audit: siapa mencetak dokumen apa, dari entitas mana, berapa
         halaman, dan mesin/font versi berapa yang dipakai. Tanpa file PDF
         yang tersimpan, baris audit inilah yang membuat "cetak ulang"
         bisa dipertanggungjawabkan. Kegagalan audit tidak boleh membatalkan
         cetakan - writeAudit sudah best-effort. */
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
          dialect: getDialect(),
          at: new Date().toISOString(),
        },
      });


      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Length", String(res.bytes.byteLength));
      reply.header("Content-Disposition", `inline; filename="${safeFileName(kind, id)}.pdf"`);
      /* Header kustom: FE memakai ini untuk ditampilkan tanpa parses berkas. */
      reply.header("X-Doc-Kind", kind);
      reply.header("X-Doc-Pages", String(res.pages));
      reply.header("X-Doc-Embedded-Font", res.embeddedFont ? "1" : "0");
      reply.header("Cache-Control", "no-store");
      return reply.send(Buffer.from(res.bytes));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ ok: false, error: { message, code: "RENDER_FAILED" } });
    }
  });
}

function safeFileName(kind: string, id: string): string {
  return `${kind}-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`.slice(0, 80);
}