import type { FastifyInstance } from "fastify";
import { exec, q } from "../db.js";
import { fail, ok } from "../envelope.js";
import { createRateLimiter, getClientIp } from "../rateLimit.js";
import { buildSeedRows, buildTeamSeeds, buildWbsSeeds } from "../seedData.js";

const seedLimiter = createRateLimiter(20, 60_000);

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/api/admin/seed", async (req, reply) => {
    const check = seedLimiter(getClientIp(req));
    if (!check.allowed) {
      reply.header("Retry-After", String(check.retryAfterSec));
      return reply.status(429).send(fail("Too many requests, try again later", "RATE_LIMITED"));
    }
    const expected = process.env.SETUP_TOKEN;
    const provided = req.headers["x-setup-token"];
    if (!expected || provided !== expected) {
      return reply.status(403).send(fail("Forbidden", "FORBIDDEN"));
    }
    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    for (const row of buildSeedRows()) {
      const exists = await q("SELECT id FROM " + row.table + " WHERE id = ?", [row.id]);
      if (exists.length > 0) { skipped += 1; continue; }
      try {
        await exec(`INSERT INTO ${row.table} (id, branch, data, updated_at) VALUES (?, ?, ?, ?)`, [
          row.id, row.branch, JSON.stringify(row.data), now,
        ]);
        inserted += 1;
      } catch {
        skipped += 1;
      }
    }
    for (const w of buildWbsSeeds()) {
      const exists = await q("SELECT project_id FROM wbs_by_project WHERE project_id = ?", [w.projectId]);
      if (exists.length > 0) { skipped += 1; continue; }
      try {
        await exec("INSERT INTO wbs_by_project (project_id, data) VALUES (?, ?)", [w.projectId, JSON.stringify(w.wbs)]);
        inserted += 1;
      } catch {
        skipped += 1;
      }
    }
    for (const t of buildTeamSeeds()) {
      const exists = await q("SELECT project_id FROM team_by_project WHERE project_id = ?", [t.projectId]);
      if (exists.length > 0) { skipped += 1; continue; }
      try {
        await exec("INSERT INTO team_by_project (project_id, data) VALUES (?, ?)", [t.projectId, JSON.stringify(t.memberIds)]);
        inserted += 1;
      } catch {
        skipped += 1;
      }
    }
    return ok({ inserted, skipped });
  });
}
