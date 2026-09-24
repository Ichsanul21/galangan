import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, closeDb } from "./db.js";

export async function migrate(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sqlPath = path.resolve(here, "../migrations/001_init.sql");
  const raw = fs.readFileSync(sqlPath, "utf8");
  const statements = raw.split(";");
  for (const chunk of statements) {
    const sql = chunk.trim();
    if (!sql) continue;
    await exec(sql);
  }
  console.log("[migrate] done");
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("migrate.ts") || entry.endsWith("migrate.js")) {
  migrate()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch((err) => {
      console.error("[migrate] failed:", err);
      process.exit(1);
    });
}
