import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { loadEnv } from "./env.js";
import { fail, ok, registerErrorHandler } from "./envelope.js";
import { comparePassword, requireAuth, signToken } from "./auth.js";
import { q } from "./db.js";
import { COLLECTIONS, registerCrud } from "./routes/crud.js";
import { registerWbsRoutes } from "./routes/wbs.js";
import { registerAdminRoutes } from "./routes/admin.js";

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
}

const LOGIN_LIMIT = 20;
const LOGIN_WINDOW_MS = 60_000;
const loginHits = new Map<string, { count: number; resetAt: number }>();

function loginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginHits.get(ip);
  if (!entry || now > entry.resetAt) {
    loginHits.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= LOGIN_LIMIT;
}

export function buildApp(): FastifyInstance {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  const corsOrigin = env.webOrigin ?? (process.env.NODE_ENV === "production" ? undefined : "*");

  app.addHook("onSend", async (req, reply) => {
    if (corsOrigin) {
      reply.header("Access-Control-Allow-Origin", corsOrigin === "true" ? "*" : corsOrigin);
      reply.header("Vary", "Origin");
    }
    return undefined;
  });

  app.options("*", async (_req, reply) => {
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return reply.status(204).send();
  });

  registerErrorHandler(app);

  app.get("/health", async () => ok({ status: "ok" }));

  app.post("/api/auth/login", async (req, reply) => {
    const ip = req.ip ?? req.headers["x-forwarded-for"]?.toString() ?? "unknown";
    if (!loginRateLimit(ip)) {
      return reply.status(429).send(fail("Too many login attempts, try again later", "RATE_LIMITED"));
    }
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    }
    const { username, password } = parsed.data;
    const rows = await q<UserRow>("SELECT id, username, pass_hash, name, role, email FROM users WHERE username = ?", [
      username,
    ]);
    const user = rows[0];
    if (!user || !(await comparePassword(password, user.pass_hash))) {
      return reply.status(401).send(fail("Invalid credentials", "UNAUTHORIZED"));
    }
    const token = signToken({ id: user.id, username: user.username, role: user.role });
    return ok({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email } });
  });

  app.get("/api/auth/me", { preHandler: [requireAuth] }, async (req) => {
    return ok({ user: req.user });
  });

  for (const table of COLLECTIONS) registerCrud(app, table);
  registerWbsRoutes(app);
  registerAdminRoutes(app);

  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send(fail("Not found", "NOT_FOUND"));
  });

  return app;
}
