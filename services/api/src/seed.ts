import { exec, q, closeDb } from "./db.js";
import { seedUsers } from "./auth.js";
import { buildSeedRows, buildTeamSeeds, buildWbsSeeds } from "./seedData.js";

// Full DB seed (idempotent, skip-if-exists): users + all seedData rows +
// wbs/team. Same content as POST /api/admin/seed (without force).
// Run with the production .env loaded: set -a; source .env; set +a
async function main(): Promise<void> {
  await seedUsers(exec, q);
  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  for (const row of buildSeedRows()) {
    const exists = await q("SELECT id FROM " + row.table + " WHERE id = ?", [row.id]);
    if (exists.length > 0) {
      skipped += 1;
      continue;
    }
    await exec(`INSERT INTO ${row.table} (id, branch, data, updated_at) VALUES (?, ?, ?, ?)`, [
      row.id,
      row.branch,
      JSON.stringify(row.data),
      now,
    ]);
    inserted += 1;
  }
  for (const w of buildWbsSeeds()) {
    const exists = await q("SELECT project_id FROM wbs_by_project WHERE project_id = ?", [w.projectId]);
    if (exists.length > 0) {
      skipped += 1;
      continue;
    }
    await exec("INSERT INTO wbs_by_project (project_id, data) VALUES (?, ?)", [w.projectId, JSON.stringify(w.wbs)]);
    inserted += 1;
  }
  for (const t of buildTeamSeeds()) {
    const exists = await q("SELECT project_id FROM team_by_project WHERE project_id = ?", [t.projectId]);
    if (exists.length > 0) {
      skipped += 1;
      continue;
    }
    await exec("INSERT INTO team_by_project (project_id, data) VALUES (?, ?)", [t.projectId, JSON.stringify(t.memberIds)]);
    inserted += 1;
  }
  // Tautkan akun seed ke karyawan (default; bisa diubah via /api/users):
  // direktur@galangan.com → EMP-001 (Andi Darman, Direktur).
  try {
    const emp = await q("SELECT id FROM employees WHERE id = ?", ["EMP-001"]);
    if (emp.length > 0) {
      await exec("UPDATE users SET employee_id = ? WHERE username = ? AND (employee_id IS NULL OR employee_id = '')", [
        "EMP-001",
        "direktur@galangan.com",
      ]);
    }
  } catch {
    // DB lama tanpa kolom employee_id — migrasi akan menambahkannya saat boot.
  }
  console.log(`[seed] done (inserted=${inserted} skipped=${skipped})`);
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("seed.ts") || entry.endsWith("seed.js")) {
  main()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch((err) => {
      console.error("[seed] failed:", err);
      process.exit(1);
    });
}
