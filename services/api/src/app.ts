import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { loadEnv } from "./env.js";
import { fail, ok, registerErrorHandler } from "./envelope.js";
import { createRateLimiter, getClientIp } from "./rateLimit.js";
import { comparePassword, requireAuth, signToken } from "./auth.js";
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
  password: z.string().min(1),
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

function denyRateLimited(reply: FastifyReply, retryAfterSec: number, message: string): unknown {
  reply.header("Retry-After", String(retryAfterSec));
  return reply.status(429).send(fail(message, "RATE_LIMITED"));
}

export function buildApp(): FastifyInstance {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  // CORS allowlist: WEB_ORIGINS (comma-separated) → WEB_ORIGIN (single) → "*" in non-prod.
  // The request Origin is validated against the list; no credentials (JWT header-based).
  const allowAll = env.webOrigins.length === 0 && process.env.NODE_ENV !== "production";
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
    return undefined;
  });

  app.options("*", async (req, reply) => {
    const origin = resolveCorsOrigin(req);
    if (origin) reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    reply.header("Access-Control-Max-Age", "86400");
    return reply.status(204).send();
  });

  registerErrorHandler(app);

  app.get("/health", async () => ok({ status: "ok", auditErrors: getAuditErrorCount() }));

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
