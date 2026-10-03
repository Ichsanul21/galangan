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
import { requireAuth, branchAllowed } from "../auth.js";
import { ok } from "../envelope.js";
import { findRecipe, DOC_KINDS, buildFromModel, type RenderContext } from "../pdf/registry.js";
import { getDialect } from "../db.js";
import { writeAudit, requestActor, requestIp } from "../audit.js";
import { saveRenderModel, loadRenderModel } from "../pdf/renderStore.js";
import { entityBranch, knownBranches } from "../pdf/documents/shared.js";
import type { RenderResult } from "../pdf/document.js";

interface RenderBody {
  kind?: string;
  id?: string;
  locale?: string;
  /** Cabang untuk laporan (dokumen tanpa entitas). Untuk dokumen resmi
   *  DIABAIKAN - cabang diambil dari baris dokumennya sendiri. */
  branch?: string;
  /** Filter laporan: periode, mode, projectId, months. Tidak pernah berisi
   *  nilai laporan - angka tetap dibaca server dari DB. */
  filters?: Record<string, unknown>;
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
      filters: readFilters(body.filters),
    };

    try {
      /* Cabang dokumen resmi diambil dari baris yang dicetak, BUKAN dari
         filter klien. Sebelumnya ctx.branch selalu "SEMUA", jadi bagian
         agregat dalam PDF (mis. rekap termin pada kwitansi) bisa
         menjumlahkan cabang lain. Dengan dikunci ke cabang entitas,
         menebak id milik cabang lain tidak menghasilkan dokumen campuran -
         dokumen ikut cabang yang salah, atau gagal, bukan mencuri angka.

         Batas user ditegakkan di sini juga: kalau akun punya cabang,
         meminta "SEMUA" berarti meminta seluruh perusahaan dan itu 403. */
      if (recipe.requiresEntity) {
        const own = await entityBranch(recipe.entity.field, id);
        if (own !== null && !branchAllowed(req.user, own)) {
          return reply.status(403).send({
            ok: false,
            error: { message: `Dokumen ini milik cabang ${own}, di luar cakupan akun Anda.`, code: "FORBIDDEN" },
          });
        }
        ctx.branch = own ?? "SEMUA";
      } else {
        /* Laporan tidak punya entitas tunggal, jadi cabang diminta dari
           klien - tapi hanya nilai yang benar-benar ada. "SEMUA" tetap
           diperbolehkan untuk akun tanpa batas cabang, dan sekarang
           tercatat di audit sebagai pilihan eksplisit, bukan keputusan
           server yang diam-diam. */
        const asked = String(body.branch ?? "").trim();
        const target = asked === "" ? "SEMUA" : asked;
        if (!branchAllowed(req.user, target)) {
          return reply.status(403).send({
            ok: false,
            error: { message: `Cabang ${target} di luar cakupan akun Anda.`, code: "FORBIDDEN" },
          });
        }
        if (asked !== "" && asked !== "SEMUA") {
          const known = await knownBranches();
          if (!known.includes(asked)) {
            return reply.status(400).send({
              ok: false,
              error: { message: `Cabang tidak dikenal: ${asked}`, code: "VALIDATION_ERROR" },
            });
          }
          ctx.branch = asked;
        }
      }

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
          branch: ctx.branch,
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
    /* Cetak ulang memakai cabang yang TERSIMPAN di snapshot, bukan filter
       klien saat ini. Kalau snapshot cetakan pertama sudah dibatasi ke satu
       cabang, arsipnya harus tetap begitu - kalau tidak, dokumen lama bisa
       "diperbaiki" isinya hanya dengan mencetaknya ulang. */
    const snapBranch = snap.branch || "SEMUA";
    if (!branchAllowed(req.user, snapBranch)) {
      return reply.status(403).send({
        ok: false,
        error: { message: `Cetakan ini milik cabang ${snapBranch}, di luar cakupan akun Anda.`, code: "FORBIDDEN" },
      });
    }
    const ctx: RenderContext = { locale: snap.locale === "en" ? "en" : "id", branch: snapBranch, filters: {} };
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
          branch: ctx.branch,
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
  /* Huruf CJK yang tidak punya glyph tercetak sebagai kotak: dokumen tetap
     keluar, ukurannya wajar, dan tidak ada error apa pun. Header ini
    * Supaya FE bisa memberi tahu, bukan membiarkan arsip resmi berisi kotak
     lolos tanpa keterangan. */
  reply.header("X-Doc-Cjk", res.cjkChars.length > 0 ? String(res.cjkChars.length) : "0");
  /* Id snapshot: inilah yang dipakai endpoint cetak ulang. */
  reply.header("X-Doc-Model-Id", modelId ?? "");
  reply.header("Cache-Control", "no-store");
  return reply.send(Buffer.from(res.bytes));
}

/**
 * Filter yang diterima server.
 *
 * Hanya daftar putih. Tanpa itu, klien bisa mengirim filter bertingkat
 * bebas (deep object, array besar) yang nanti ikut disimpan ke snapshot dan
 * membuat baris pdfDocs membengkak tanpa batas.
 */
const FILTER_KEYS = new Set([
  "mode",
  "period",
  "projectId",
  "months",
  "scope",
  "signatureName",
  "signatureRole",
  "signatureDate",
]);

function readFilters(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!FILTER_KEYS.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 64);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function safeFileName(kind: string, id: string): string {
  return `${kind}-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`.slice(0, 80);
}