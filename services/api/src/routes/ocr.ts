// OCR lampiran (TANDA TERIMA / PO blanko hasil scan): POST /api/ocr.
// Memakai binary `tesseract-ocr` bila terinstal di server
// (apt install tesseract-ocr tesseract-ocr-ind); bila tidak ada → 501
// OCR_UNAVAILABLE dengan instruksi, bukan error misterius.
// Batasan: gambar png/jpg/jpeg ≤10MB, bahasa ind+eng, timeout 60 dtk.
// Dieksekusi via execFile (tanpa shell) ke file temp acak — nama file user
// tak pernah menyentuh command line; file temp selalu dihapus.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth.js";
import { createRateLimiter, getClientIp } from "../rateLimit.js";
import { requestActor, requestIp, writeAudit } from "../audit.js";
import { hasMagic } from "./files.js";
import { fail, ok } from "../envelope.js";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg"]);

/* OCR menjalankan tesseract sebagai proses terpisah dengan timeout 60 dtk.
   Pembatas tulis global 300/menit terlalu longgar untuk ini: 300 proses
   tesseract yang berjalan bersamaan bisa menjatuhkan server. */
const OCR_LIMIT = 10;
const OCR_WINDOW_MS = 60_000;
const ocrLimiter = createRateLimiter(OCR_LIMIT, OCR_WINDOW_MS);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function tesseractAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("tesseract", ["--version"], { timeout: 10000 }, (err) => resolve(!err));
  });
}

function runOcr(png: Buffer, ext: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `isms-ocr-${randomUUID()}${ext}`);
    fs.writeFile(tmp, png, (writeErr) => {
      if (writeErr) {
        reject(writeErr);
        return;
      }
      execFile("tesseract", [tmp, "stdout", "-l", "ind+eng"], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        fs.unlink(tmp, () => undefined);
        if (err) reject(err);
        else resolve(String(stdout ?? ""));
      });
    });
  });
}

export function registerOcrRoutes(app: FastifyInstance): void {
  app.get("/api/ocr/status", { preHandler: [requireAuth] }, async () => {
    return ok({ available: await tesseractAvailable() });
  });

  app.post("/api/ocr", { preHandler: [requireAuth] }, async (req, reply) => {
    const limited = ocrLimiter(getClientIp(req));
    if (!limited.allowed) {
      reply.header("Retry-After", String(limited.retryAfterSec));
      return reply.status(429).send(fail("Terlalu banyak permintaan OCR - coba lagi nanti", "RATE_LIMITED"));
    }
    let part: Awaited<ReturnType<typeof req.file>>;
    try {
      part = await req.file();
    } catch {
      return reply.status(400).send(fail("No file uploaded (field: file)", "VALIDATION_ERROR"));
    }
    if (!part) return reply.status(400).send(fail("No file uploaded (field: file)", "VALIDATION_ERROR"));
    const ext = extOf(part.filename ?? "");
    if (!ALLOWED_EXT.has(ext)) {
      try { await part.toBuffer(); } catch { /* drain */ }
      return reply.status(400).send(fail("OCR hanya untuk gambar png/jpg/jpeg (PDF dikonversi dulu)", "VALIDATION_ERROR"));
    }
    let buf: Buffer;
    try {
      buf = await part.toBuffer();
    } catch {
      return reply.status(400).send(fail("Upload gagal atau file terlalu besar (maks 10MB)", "VALIDATION_ERROR"));
    }
    if (buf.length === 0) return reply.status(400).send(fail("Empty file", "VALIDATION_ERROR"));
    if (buf.length > MAX_BYTES) return reply.status(413).send(fail("File too large (max 10MB)", "PAYLOAD_TOO_LARGE"));
    /* Validasi magic byte. Versi lama hanya memakai nama ekstensi, jadi file
       apa pun yang di-rename jadi .png langsung ditulis ke file temp dan
       diserahkan ke parser gambar tesseract. routes/files.ts sudah lama punya
       cek ini - permukaannya sama, standarnya tidak boleh beda. */
    if (!hasMagic(buf, ext)) {
      return reply.status(400).send(fail("Isi file tidak cocok dengan ekstensi .png/.jpg", "VALIDATION_ERROR"));
    }
    if (!(await tesseractAvailable())) {
      return reply.status(501).send(fail("OCR belum tersedia di server (apt install tesseract-ocr tesseract-ocr-ind)", "OCR_UNAVAILABLE"));
    }
    try {
      const text = await runOcr(buf, ext);
      await writeAudit({
        actor: requestActor(req),
        action: "ocr",
        table: "documents",
        rowId: "-",
        diff: { filename: part.filename ?? "", bytes: buf.length, chars: text.trim().length },
        ip: requestIp(req),
      });
      return ok({ text: text.trim(), chars: text.trim().length, filename: part.filename ?? "" });
    } catch {
      return reply.status(500).send(fail("OCR gagal memproses gambar", "OCR_FAILED"));
    }
  });
}
