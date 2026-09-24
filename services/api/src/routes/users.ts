import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { comparePassword, hashPassword, requireAuth, requireRole } from "../auth.js";
import { exec, q } from "../db.js";
import { fail, ok } from "../envelope.js";

// Seed roles are lowercase ("direktur"); callers may send title case
// ("Direktur") — accept both, mirroring routes/crud.ts PRIVILEGED_ROLES.
const MANAGE_ROLES = ["direktur", "developer", "Direktur", "Developer"];
const manageGuards = [requireAuth, requireRole(...MANAGE_ROLES)];

function isPrivileged(role: unknown): boolean {
  return typeof role === "string" && MANAGE_ROLES.includes(role);
}

interface UserRow {
  id: string;
  username: string;
  pass_hash: string;
  name: string;
  role: string;
  email: string;
  is_active: number | null;
}

function toPublic(row: UserRow): {
  id: string;
  username: string;
  name: string;
  role: string;
  email: string;
  isActive: boolean;
} {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    email: row.email,
    isActive: (row.is_active ?? 1) !== 0,
  };
}

const CreateSchema = z.object({
  username: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  role: z.string().min(1).max(64),
  email: z.string().max(256).optional().default(""),
  password: z.string().min(6),
});

const PatchSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    role: z.string().min(1).max(64).optional(),
    email: z.string().max(256).optional(),
    isActive: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined || v.role !== undefined || v.email !== undefined || v.isActive !== undefined,
    { message: "Nothing to update" },
  );

const PasswordSchema = z.object({
  oldPassword: z.string().optional(),
  newPassword: z.string().min(6),
});

const SELECT_COLS = "id, username, pass_hash, name, role, email, is_active FROM users";

export function registerUserRoutes(app: FastifyInstance): void {
  app.get("/api/users", { preHandler: manageGuards }, async () => {
    const rows = await q<UserRow>(`SELECT ${SELECT_COLS} ORDER BY username ASC`);
    return ok({ users: rows.map(toPublic) });
  });

  app.post("/api/users", { preHandler: manageGuards }, async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    const dup = await q(`SELECT id FROM users WHERE username = ?`, [parsed.data.username]);
    if (dup.length > 0) return reply.status(409).send(fail("Username sudah dipakai", "CONFLICT"));
    const id = randomUUID();
    const passHash = await hashPassword(parsed.data.password);
    await exec(
      "INSERT INTO users (id, username, pass_hash, name, role, email, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
      [id, parsed.data.username, passHash, parsed.data.name, parsed.data.role, parsed.data.email],
    );
    const created = {
      id,
      username: parsed.data.username,
      name: parsed.data.name,
      role: parsed.data.role,
      email: parsed.data.email,
      isActive: true,
    };
    return reply.status(201).send(ok(created));
  });

  app.patch("/api/users/:id", { preHandler: manageGuards }, async (req, reply) => {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    if ("password" in raw || "pass_hash" in raw || "newPassword" in raw) {
      return reply
        .status(400)
        .send(fail("Gunakan endpoint password khusus untuk ganti password", "VALIDATION_ERROR"));
    }
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    const { id } = req.params as { id: string };
    const rows = await q<UserRow>(`SELECT ${SELECT_COLS} WHERE id = ?`, [id]);
    if (rows.length === 0) return reply.status(404).send(fail("Not found", "NOT_FOUND"));
    const current = rows[0] as UserRow;
    const deactivating = parsed.data.isActive === false || parsed.data.isActive === 0;
    if (deactivating && req.user?.id === current.id) {
      return reply.status(400).send(fail("Tidak dapat menonaktifkan akun sendiri", "VALIDATION_ERROR"));
    }
    const next = {
      name: parsed.data.name ?? current.name,
      role: parsed.data.role ?? current.role,
      email: parsed.data.email ?? current.email,
      isActive:
        parsed.data.isActive === undefined
          ? (current.is_active ?? 1) !== 0
          : parsed.data.isActive === true || parsed.data.isActive === 1,
    };
    await exec("UPDATE users SET name = ?, role = ?, email = ?, is_active = ? WHERE id = ?", [
      next.name,
      next.role,
      next.email,
      next.isActive ? 1 : 0,
      current.id,
    ]);
    return ok({ id: current.id, username: current.username, ...next });
  });

  app.post("/api/users/:id/password", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const targetId = id === "me" ? req.user?.id : id;
    const parsed = PasswordSchema.safeParse(req.body);
    if (!parsed.success || !targetId) {
      return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    }
    const rows = await q<UserRow>(`SELECT ${SELECT_COLS} WHERE id = ?`, [targetId]);
    if (rows.length === 0) return reply.status(404).send(fail("Not found", "NOT_FOUND"));
    const target = rows[0] as UserRow;
    const self = req.user?.id === target.id;
    const privileged = isPrivileged(req.user?.role);
    if (!self && !privileged) {
      return reply.status(403).send(fail("Butuh peran Direktur / Developer", "FORBIDDEN"));
    }
    if (self && !privileged) {
      const oldOk =
        typeof parsed.data.oldPassword === "string" &&
        parsed.data.oldPassword.length > 0 &&
        (await comparePassword(parsed.data.oldPassword, target.pass_hash));
      if (!oldOk) return reply.status(401).send(fail("Password lama salah", "UNAUTHORIZED"));
    }
    await exec("UPDATE users SET pass_hash = ? WHERE id = ?", [
      await hashPassword(parsed.data.newPassword),
      target.id,
    ]);
    return ok({ id: target.id, updated: true });
  });

  // Never hard delete — deactivate instead.
  app.delete("/api/users/:id", { preHandler: manageGuards }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await q<UserRow>(`SELECT ${SELECT_COLS} WHERE id = ?`, [id]);
    if (rows.length === 0) return reply.status(404).send(fail("Not found", "NOT_FOUND"));
    const target = rows[0] as UserRow;
    if (req.user?.id === target.id) {
      return reply.status(400).send(fail("Tidak dapat menonaktifkan akun sendiri", "VALIDATION_ERROR"));
    }
    await exec("UPDATE users SET is_active = 0 WHERE id = ?", [target.id]);
    return ok({ id: target.id, isActive: false });
  });
}
