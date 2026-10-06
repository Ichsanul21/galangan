import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { requireCollectionWrite } from "../rbac.js";
import { exec, getDialect, q } from "../db.js";
import { fail, ok } from "../envelope.js";

const WbsSchema = z.object({ wbs: z.array(z.unknown()), baseData: z.unknown().optional() });
const TeamSchema = z.object({
  memberIds: z.array(z.string().min(1)).max(500),
  baseData: z.unknown().optional(),
});

interface SideRow {
  project_id: string;
  data: string;
}

/**
 * Compare-and-swap tanpa kolom `updated_at`.
 *
 * Tabel `wbs_by_project` / `team_by_project` hanya punya `project_id` + `data`,
 * jadi `ON DUPLICATE KEY UPDATE data = VALUES(data)` adalah penimpaan buta:
 * dua perangkat yang sama-sama menyimpan WBS akan saling menimpa, dan yang
 * kalah hilang tanpa satu pun jejak. Tidak ada error, tidak ada 409.
 *
 * Menambah kolom `updated_at` berarti migrasi produksi, sementara tabel ini
 * menyimpan blob kecil. Jadi klien mengirim `baseData` - isi yang ia yakini
 * masih ada di server - dan server menolak dengan 409 STALE kalau isinya sudah
 * berbeda. Ini persis pola `baseUpdatedAt` yang sudah dipakai tabel utama,
 * jadi klien sudah punya jalur penanganan 409 STALE.
 *
 * `baseData` yang tidak dikirim berarti "menimpa buta" - dipakai klien lama
 * yang belum tahu soal fitur ini, dan tidak boleh dibalas 409 demi
 * backwards compatibility.
 */
async function detectConflict(table: string, projectId: string, baseData: unknown): Promise<SideRow | null> {
  if (baseData === undefined) return null;
  const rows = await q<SideRow>(`SELECT project_id, data FROM ${table} WHERE project_id = ?`, [projectId]);
  const current = rows[0] as SideRow | undefined;
  /* Tidak ada baris di server: tidak ada apa pun untuk dibentroakkan. */
  if (current === undefined) return null;
  return JSON.stringify(baseData) === current.data ? null : current;
}

async function assertProjectExists(projectId: string): Promise<boolean> {
  const rows = await q("SELECT id FROM projects WHERE id = ?", [projectId]);
  return rows.length > 0;
}

async function upsert(table: string, projectId: string, payload: unknown): Promise<void> {
  const json = JSON.stringify(payload);
  if (getDialect() === "mysql") {
    await exec(
      `INSERT INTO ${table} (project_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [projectId, json],
    );
    return;
  }
  await exec(
    `INSERT INTO ${table} (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data`,
    [projectId, json],
  );
}

export function registerWbsRoutes(app: FastifyInstance): void {
  app.get("/api/projects/:id/wbs", { preHandler: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const rows = await q<SideRow>("SELECT project_id, data FROM wbs_by_project WHERE project_id = ?", [id]);
    const wbs = rows.length > 0 ? (JSON.parse((rows[0] as SideRow).data) as unknown) : [];
    return ok({ projectId: id, wbs });
  });

  app.put("/api/projects/:id/wbs", { preHandler: [requireAuth, requireCollectionWrite("wbs_by_project")] }, async (req, reply) => {
    const parsed = WbsSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    const { id } = req.params as { id: string };
    if (!(await assertProjectExists(id))) {
      return reply.status(422).send(fail(`Proyek ${id} tidak ada`, "UNPROCESSABLE"));
    }
    const bentrok = await detectConflict("wbs_by_project", id, parsed.data.baseData);
    if (bentrok !== null) {
      return reply.status(409).send({
        ok: false,
        error: { message: `WBS ${id} sudah diubah perangkat lain`, code: "STALE" },
        data: { projectId: id, wbs: JSON.parse(bentrok.data) as unknown },
      });
    }
    await upsert("wbs_by_project", id, parsed.data.wbs);
    return ok({ projectId: id, wbs: parsed.data.wbs });
  });

  app.get("/api/projects/:id/team", { preHandler: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const rows = await q<SideRow>("SELECT project_id, data FROM team_by_project WHERE project_id = ?", [id]);
    const memberIds = rows.length > 0 ? (JSON.parse((rows[0] as SideRow).data) as unknown) : [];
    return ok({ projectId: id, memberIds });
  });

  app.put("/api/projects/:id/team", { preHandler: [requireAuth, requireCollectionWrite("team_by_project")] }, async (req, reply) => {
    const parsed = TeamSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    const { id } = req.params as { id: string };
    if (!(await assertProjectExists(id))) {
      return reply.status(422).send(fail(`Proyek ${id} tidak ada`, "UNPROCESSABLE"));
    }
    for (const memberId of parsed.data.memberIds) {
      const rows = await q("SELECT id FROM employees WHERE id = ?", [memberId]);
      if (rows.length === 0) {
        return reply.status(422).send(fail(`Karyawan ${memberId} tidak ada`, "UNPROCESSABLE"));
      }
    }
    const bentrok = await detectConflict("team_by_project", id, parsed.data.baseData);
    if (bentrok !== null) {
      return reply.status(409).send({
        ok: false,
        error: { message: `Tim proyek ${id} sudah diubah perangkat lain`, code: "STALE" },
        data: { projectId: id, memberIds: JSON.parse(bentrok.data) as unknown },
      });
    }
    await upsert("team_by_project", id, parsed.data.memberIds);
    return ok({ projectId: id, memberIds: parsed.data.memberIds });
  });
}
