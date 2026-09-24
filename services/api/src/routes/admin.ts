import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { exec, q } from "../db.js";
import { fail, ok } from "../envelope.js";
import { createRateLimiter, getClientIp } from "../rateLimit.js";
import { requestIp, writeAudit } from "../audit.js";
import { buildSeedRows, buildTeamSeeds, buildWbsSeeds } from "../seedData.js";

const seedLimiter = createRateLimiter(20, 60_000);

function isSetupTokenValid(expected: string | undefined, provided: unknown): boolean {
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/api/admin/seed", async (req, reply) => {
    const check = seedLimiter(getClientIp(req));
    if (!check.allowed) {
      reply.header("Retry-After", String(check.retryAfterSec));
      return reply.status(429).send(fail("Too many requests, try again later", "RATE_LIMITED"));
    }
    const expected = process.env.SETUP_TOKEN;
    const provided = req.headers["x-setup-token"];
    if (!isSetupTokenValid(expected, provided)) {
      await writeAudit({
        actor: "anonymous",
        action: "admin.seed_denied",
        table: "-",
        rowId: "-",
        diff: {},
        ip: requestIp(req),
      });
      return reply.status(403).send(fail("Forbidden", "FORBIDDEN"));
    }
    const query = (req.query ?? {}) as { force?: string | string[] };
    const forceRaw = Array.isArray(query.force) ? query.force[0] : query.force;
    // ?force=1 refreshes existing envelope rows (COA corrections, etc.)
    // instead of skipping. Applies to envelope tables only — wbs/team
    // seeds stay skip-if-exists.
    const force = forceRaw === "1" || forceRaw === "true";
    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    const recordError = (context: string, err: unknown): void => {
      const message = err instanceof Error ? err.message : String(err);
      const full = `${context}: ${message}`;
      if (errors.length < 5) errors.push(full);
      console.error("[admin/seed]", full);
    };
    for (const row of buildSeedRows()) {
      try {
        const exists = await q("SELECT id FROM " + row.table + " WHERE id = ?", [row.id]);
        if (exists.length > 0) {
          if (force) {
            await exec(`UPDATE ${row.table} SET branch = ?, data = ?, updated_at = ? WHERE id = ?`, [
              row.branch, JSON.stringify(row.data), now, row.id,
            ]);
            inserted += 1;
          } else {
            skipped += 1;
          }
          continue;
        }
        await exec(`INSERT INTO ${row.table} (id, branch, data, updated_at) VALUES (?, ?, ?, ?)`, [
          row.id, row.branch, JSON.stringify(row.data), now,
        ]);
        inserted += 1;
      } catch (err) {
        skipped += 1;
        recordError(`${row.table}/${row.id}`, err);
      }
    }
    for (const w of buildWbsSeeds()) {
      try {
        const exists = await q("SELECT project_id FROM wbs_by_project WHERE project_id = ?", [w.projectId]);
        if (exists.length > 0) { skipped += 1; continue; }
        await exec("INSERT INTO wbs_by_project (project_id, data) VALUES (?, ?)", [w.projectId, JSON.stringify(w.wbs)]);
        inserted += 1;
      } catch (err) {
        skipped += 1;
        recordError(`wbs_by_project/${w.projectId}`, err);
      }
    }
    for (const t of buildTeamSeeds()) {
      try {
        const exists = await q("SELECT project_id FROM team_by_project WHERE project_id = ?", [t.projectId]);
        if (exists.length > 0) { skipped += 1; continue; }
        await exec("INSERT INTO team_by_project (project_id, data) VALUES (?, ?)", [t.projectId, JSON.stringify(t.memberIds)]);
        inserted += 1;
      } catch (err) {
        skipped += 1;
        recordError(`team_by_project/${t.projectId}`, err);
      }
    }
    await writeAudit({
      actor: "admin-seed",
      action: "admin.seed_success",
      table: "-",
      rowId: "-",
      diff: { inserted, skipped },
      ip: requestIp(req),
    });
    return ok({ inserted, skipped, errors });
  });
}
