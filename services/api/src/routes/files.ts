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
    const month = new Date().toISOString().slice(0, 7);
    const dir = path.join(root, month);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${randomUUID().replace(/-/g, "")}${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return reply.status(201).send(ok({ url: `/files/${month}/${name}`, name: part.filename ?? name, size: buf.length }));
  });
}
