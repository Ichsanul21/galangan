import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { loadEnv } from "./env.js";

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function getSecret(): string {
  // Single source of truth: the env module (throws at boot if JWT_SECRET is missing).
  return loadEnv().jwtSecret;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "8h" });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, getSecret()) as AuthUser;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
  }
  const token = header.slice("Bearer ".length);
  try {
    req.user = verifyToken(token);
  } catch {
    return reply.status(401).send({ ok: false, error: { message: "Invalid token", code: "UNAUTHORIZED" } });
  }
}

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    }
    if (!roles.includes(req.user.role)) {
      const labels = [...new Set(roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()))];
      return reply
        .status(403)
        .send({ ok: false, error: { message: `Butuh peran ${labels.join(" / ")}`, code: "FORBIDDEN" } });
    }
  };
}

export type ExecFn = (sql: string, params: unknown[]) => Promise<void>;
export type QueryFn<T = Record<string, unknown>> = (sql: string, params: unknown[]) => Promise<T[]>;

interface SeedAccount {
  username: string;
  password: string;
  name: string;
  role: string;
  email: string;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  { username: "demo@galangan.com", password: "password@123", name: "Client Viewer", role: "viewer", email: "demo@galangan.com" },
  { username: "dev@alk.id", password: "KucingTerbang", name: "Developer", role: "developer", email: "dev@alk.id" },
  { username: "direktur@galangan.com", password: "direktur123", name: "Direktur", role: "direktur", email: "direktur@galangan.com" },
  { username: "manager@galangan.com", password: "manager123", name: "Manager", role: "manager", email: "manager@galangan.com" },
];

export async function seedUsers(
  dbInsert: ExecFn,
  dbQuery?: QueryFn,
  queryImpl?: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>,
): Promise<void> {
  const query = dbQuery ?? queryImpl;
  for (const account of SEED_ACCOUNTS) {
    let exists = false;
    if (query) {
      const rows = await query("SELECT id FROM users WHERE username = ?", [account.username]);
      exists = rows.length > 0;
    }
    if (exists) continue;
    const passHash = await hashPassword(account.password);
    try {
      await dbInsert("INSERT INTO users (id, username, pass_hash, name, role, email) VALUES (?, ?, ?, ?, ?, ?)", [
        randomUUID(),
        account.username,
        passHash,
        account.name,
        account.role,
        account.email,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE") || message.includes("Duplicate")) continue;
      throw err;
    }
  }
}
