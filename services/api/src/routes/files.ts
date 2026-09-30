import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { requireAuth } from "../auth.js";
import { fail, ok } from "../envelope.js";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".pdf", ".xlsx", ".xls", ".csv", ".txt"]);

export function hasMagic(buf: Buffer, ext: string): boolean {
  if (ext === ".png") {
    return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (ext === ".pdf") {
    return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  }
  if (ext === ".xlsx") {
    return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
  }
  if (ext === ".xls") {
    // OLE warisan: D0 CF 11 E0 (bukan PK zip seperti xlsx).
    return (
      buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0
    );
  }
  if (ext === ".csv" || ext === ".txt") {
    // Text formats: reject binary (NUL bytes) and invalid UTF-8.
    if (buf.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      return false;
    }
    return true;
  }
  return false;
}

/** Validasi ISI (bukan sekadar magic): skrip/injeksi/makro. null = bersih,
 * string = alasan penolakan (400). Tanpa dep baru, scan bytes cepat. */
export function scanContent(buf: Buffer, ext: string): string | null {
  const head = buf.subarray(0, 256 * 1024).toString("latin1");
  if (ext === ".csv" || ext === ".txt") {
    const lines = head.split(/\r?\n/).slice(0, 200);
    for (const ln of lines) {
      for (const cell of ln.split(/[,;\t|]/)) {
        const c = cell.trimStart();
        if (!c) continue;
        // Angka negatif ("-5", "-12.5") wajar di finance - bukan injeksi.
        if (/^-[\d.]/.test(c)) continue;
        if (c.startsWith("=") || c.startsWith("+") || c.startsWith("-") || c.startsWith("@")) {
          return "Sel terlarang injeksi formula (awalan = + - @) - bersihkan dulu";
        }
      }
    }
    return null;
  }
  if (ext === ".pdf") {
    if (/\/JavaScript|\/AA\b|\/OpenAction|\/EmbeddedFiles|\/Launch/i.test(head)) {
      return "PDF mengandung skrip/aksi tertanam - tidak diizinkan";
    }
    return null;
  }
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
    if (/<script|<\?php|<html/i.test(head)) {
      return "Gambar mengandung muatan skrip - tidak diizinkan";
    }
    return null;
  }
  if (ext === ".xlsx") {
    // ZIP: tolak entri berekstensi executable di central directory.
    if (/\.(exe|bat|cmd|js|jse|vbs|vbe|ps1|msi|com|scr|pif)["']/i.test(head)) {
      return "Arsip xlsx mengandung file executable - tidak diizinkan";
    }
    return null;
  }
  if (ext === ".xls") {
    if (/vbaProject|Attribute\s+VB_|VBA/i.test(head)) {
      return "File .xls mengandung makro - simpan ulang sebagai .xlsx tanpa makro";
    }
    return null;
  }
  return null;
}

export function uploadsRoot(): string {
  const raw = process.env.UPLOADS_DIR ?? "./data/uploads";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function registerFileRoutes(app: FastifyInstance): void {
  void app.register(multipart, {
    limits: { fileSize: MAX_BYTES, files: 1 },
  });
  const root = uploadsRoot();
  fs.mkdirSync(root, { recursive: true });
  void app.register(fastifyStatic, { root, prefix: "/files/" });

  // Static /files/* has no per-route guard: enforce auth here (GET/HEAD → 401 anon).
  app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0] ?? "";
    if ((req.method === "GET" || req.method === "HEAD") && (url === "/files" || url.startsWith("/files/"))) {
      return requireAuth(req, reply);
    }
    return undefined;
  });

  // Force downloads as attachments + block MIME sniffing on served uploads.
  app.addHook("onSend", async (req, reply, payload) => {
    const url = req.url.split("?")[0] ?? "";
    if (url === "/files" || url.startsWith("/files/")) {
      reply.header("Content-Disposition", "attachment");
      reply.header("X-Content-Type-Options", "nosniff");
    }
    return payload;
  });

  app.post("/api/files", { preHandler: [requireAuth] }, async (req, reply) => {
    let part: Awaited<ReturnType<typeof req.file>>;
    try {
      part = await req.file();
    } catch {
      return reply.status(400).send(fail("No file uploaded (field: file)", "VALIDATION_ERROR"));
    }
    if (!part) return reply.status(400).send(fail("No file uploaded (field: file)", "VALIDATION_ERROR"));
    const ext = path.extname(part.filename ?? "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      try { await part.toBuffer(); } catch { /* drain */ }
      return reply
        .status(400)
        .send(fail(`File type not allowed: ${ext || "(none)"}. Allowed: png, jpg, pdf, xlsx, csv, txt`, "VALIDATION_ERROR"));
    }
    let buf: Buffer;
    try {
      buf = await part.toBuffer();
    } catch {
      return reply.status(400).send(fail("Upload failed or file too large (max 10MB)", "VALIDATION_ERROR"));
    }
    if (buf.length === 0) return reply.status(400).send(fail("Empty file", "VALIDATION_ERROR"));
    if (buf.length > MAX_BYTES) return reply.status(413).send(fail("File too large (max 10MB)", "PAYLOAD_TOO_LARGE"));
    if (!hasMagic(buf, ext)) {
      return reply.status(400).send(fail("File content does not match its extension", "VALIDATION_ERROR"));
    }
    const contentError = scanContent(buf, ext);
    if (contentError) {
      return reply.status(400).send(fail(contentError, "VALIDATION_ERROR"));
    }
    const month = new Date().toISOString().slice(0, 7);
    const dir = path.join(root, month);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${randomUUID().replace(/-/g, "")}${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return reply.status(201).send(ok({ url: `/files/${month}/${name}`, name: part.filename ?? name, size: buf.length }));
  });
}
