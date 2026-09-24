import type { FastifyInstance } from "fastify";
import { exec, q } from "../db.js";
import { fail, ok } from "../envelope.js";
import { buildSeedRows } from "../seedData.js";

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/api/admin/seed", async (req, reply) => {
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
    return ok({ inserted, skipped });
  });
}
