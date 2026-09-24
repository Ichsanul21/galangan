import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";
import { loadEnv } from "./env.js";
import { fail, ok, registerErrorHandler } from "./envelope.js";
import { createRateLimiter, getClientIp } from "./rateLimit.js";
import { comparePassword, requireAuth, SEED_ACCOUNTS, signToken } from "./auth.js";
import { getAuditErrorCount, requestIp, writeAudit } from "./audit.js";
import { q } from "./db.js";
import { COLLECTIONS, registerCrud } from "./routes/crud.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerWbsRoutes } from "./routes/wbs.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerUserRoutes } from "./routes/users.js";

const LoginSchema = z.object({
  username: z.string().min(1),
  // Max only (no min beyond 1): caps bcrypt input to prevent CPU-DoS via huge payloads.
  password: z.string().min(1).max(72),
});

interface UserRow {
  id: string;
  username: string;
  pass_hash: string;
  name: string;
  role: string;
  email: string;
  is_active: number | null;
}

const LOGIN_LIMIT = 20;
const LOGIN_WINDOW_MS = 60_000;
const WRITE_LIMIT = 300;
const WRITE_WINDOW_MS = 60_000;

const loginLimiter = createRateLimiter(LOGIN_LIMIT, LOGIN_WINDOW_MS);
const writeLimiter = createRateLimiter(WRITE_LIMIT, WRITE_WINDOW_MS);

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Seeded demo accounts cannot log in in production unless explicitly allowed
// (ALLOW_SEED_LOGIN=true). Minimal guard: match the 4 seed usernames.
const SEED_USERNAMES = new Set(SEED_ACCOUNTS.map((a) => a.username.toLowerCase()));

function isSeedLoginDisabled(): boolean {
  const raw = (process.env.ALLOW_SEED_LOGIN ?? "").toLowerCase().trim();
  if (raw === "true" || raw === "1") return false;
  return (process.env.NODE_ENV ?? "").toLowerCase().trim() === "production";
}

function denyRateLimited(reply: FastifyReply, retryAfterSec: number, message: string): unknown {
  reply.header("Retry-After", String(retryAfterSec));
  return reply.status(429).send(fail(message, "RATE_LIMITED"));
}

// Contract: bump together with package.json "version". FE is minor-tolerant
// (blocks sync on major mismatch only).
const MIN_WEB_VERSION = "0.2.0";

function getApiVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: unknown };
    if (typeof pkg.version === "string" && pkg.version.trim() !== "") return pkg.version.trim();
  } catch {
    /* abaikan — fallback di bawah */
  }
  return "0.2.0";
}

export function buildApp(): FastifyInstance {
  const env = loadEnv();
  // Structured logs to stdout (default pino). Secrets are redacted before
  // they reach the log stream: auth headers, passwords/hashes, any
  // *token* fields, and MYSQL_URL. See README "Logging".
  const app = Fastify({
    logger: {
      level: env.nodeEnv === "production" ? "info" : "debug",
      redact: {
        paths: [
          "req.headers.authorization",
          'req.headers["x-setup-token"]',
          "req.body.password",
          "req.body.oldPassword",
          "req.body.newPassword",
          "req.body.pass_hash",
          "req.body.token",
          "req.body.accessToken",
          "req.body.refreshToken",
          "req.body.setupToken",
          "req.body.MYSQL_URL",
          "req.body.mysqlUrl",
          "*.password",
          "*.pass_hash",
          "*.MYSQL_URL",
        ],
        censor: "[Redacted]",
      },
    },
    // Accept client-supplied correlation id; echoed back in onSend below.
    requestIdHeader: "x-request-id",
  });

  // CORS allowlist: WEB_ORIGINS (comma-separated) → WEB_ORIGIN (single) → "*" in non-prod.
  // The request Origin is validated against the list; no credentials (JWT header-based).
  const allowAll = env.webOrigins.length === 0 && env.nodeEnv !== "production";
  const allowedOrigins: string[] = allowAll ? ["*"] : env.webOrigins;

  function resolveCorsOrigin(req: { headers: { origin?: unknown } }): string | undefined {
    if (allowedOrigins.includes("*")) return "*";
    const origin = req.headers.origin;
    if (typeof origin === "string" && allowedOrigins.includes(origin)) return origin;
    return undefined;
  }

  app.addHook("onSend", async (req, reply) => {
    reply.header("Vary", "Origin");
    const origin = resolveCorsOrigin(req);
    if (origin) reply.header("Access-Control-Allow-Origin", origin);
    // Correlation id: echo inbound X-Request-Id (or generated req.id).
    try {
      reply.header("X-Request-Id", String(req.id));
    } catch {
      /* abaikan */
    }
    return undefined;
  });

  app.options("*", async (req, reply) => {
    const origin = resolveCorsOrigin(req);
    if (origin) reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
    reply.header("Access-Control-Expose-Headers", "X-Request-Id");
    reply.header("Access-Control-Max-Age", "86400");
    return reply.status(204).send();
  });

  registerErrorHandler(app);

  app.get("/health", async () => {
    let db: "ok" | "error" = "ok";
    try {
      await q("SELECT 1 AS ok");
    } catch {
      db = "error";
    }
    const uploadsRaw = process.env.UPLOADS_DIR ?? "./data/uploads";
    const uploadsRoot = path.isAbsolute(uploadsRaw) ? uploadsRaw : path.resolve(process.cwd(), uploadsRaw);
    let uploadsWritable = false;
    try {
      fs.mkdirSync(uploadsRoot, { recursive: true });
      fs.accessSync(uploadsRoot, fs.constants.W_OK);
      uploadsWritable = true;
    } catch {
      uploadsWritable = false;
    }
    const degraded = db !== "ok" || !uploadsWritable;
    return ok({
      status: degraded ? "degraded" : "ok",
      auditErrors: getAuditErrorCount(),
      db,
      uploads: { writable: uploadsWritable },
      uptimeSec: Math.floor(process.uptime()),
      version: getApiVersion(),
      dialect: env.dialect,
    });
  });

  // Contract version for FE sync gating (minor-tolerant: FE blocks on major mismatch only).
  app.get("/api/version", async () => ok({ api: getApiVersion(), minWeb: MIN_WEB_VERSION }));

  // Pembatas ringan untuk semua rute tulis (300/mnt per IP) + header Retry-After saat 429.
  app.addHook("onRequest", async (req, reply) => {
    if (!WRITE_METHODS.has(req.method)) return undefined;
    const check = writeLimiter(getClientIp(req));
    if (!check.allowed) {
      return denyRateLimited(reply, check.retryAfterSec, "Too many requests, try again later");
    }
    return undefined;
  });

  app.post("/api/auth/login", async (req, reply) => {
    const check = loginLimiter(getClientIp(req));
    if (!check.allowed) {
      return denyRateLimited(reply, check.retryAfterSec, "Too many login attempts, try again later");
    }
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    }
    const { username, password } = parsed.data;
    const rows = await q<UserRow>("SELECT id, username, pass_hash, name, role, email, is_active FROM users WHERE username = ?", [
      username,
    ]);
    const user = rows[0];
    if (!user || !(await comparePassword(password, user.pass_hash))) {
      await writeAudit({
        actor: username,
        action: "auth.login_failed",
        table: "users",
        rowId: user?.id ?? "",
        diff: { username },
        ip: requestIp(req),
      });
      return reply.status(401).send(fail("Invalid credentials", "UNAUTHORIZED"));
    }
    if (isSeedLoginDisabled() && SEED_USERNAMES.has(username.toLowerCase())) {
      await writeAudit({
        actor: username,
        action: "auth.seed_login_blocked",
        table: "users",
        rowId: user?.id ?? "",
        diff: { username },
        ip: requestIp(req),
      });
      return reply.status(403).send(fail("Akun demo dinonaktifkan", "FORBIDDEN"));
    }
    if ((user.is_active ?? 1) === 0) {
      return reply.status(403).send(fail("Akun dinonaktifkan. Hubungi administrator.", "FORBIDDEN"));
    }
    await writeAudit({
      actor: user.username,
      action: "auth.login_success",
      table: "users",
      rowId: user.id,
      diff: { username: user.username },
      ip: requestIp(req),
    });
    const token = signToken({ id: user.id, username: user.username, role: user.role });
    return ok({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email } });
  });

  app.get("/api/auth/me", { preHandler: [requireAuth] }, async (req) => {
    return ok({ user: req.user });
  });

  for (const table of COLLECTIONS) registerCrud(app, table);
  registerAuditRoutes(app);
  registerFileRoutes(app);
  registerWbsRoutes(app);
  registerAdminRoutes(app);
  registerUserRoutes(app);

  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send(fail("Not found", "NOT_FOUND"));
  });

  return app;
}
