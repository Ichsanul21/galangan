import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, closeDb } from "./db.js";

function isIgnorableMigrationError(sql: string, err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // ADD COLUMN is not idempotent on its own: SQLite reports
  // "duplicate column name", MySQL reports "Duplicate column name".
  if (/^\s*alter\s+table/i.test(sql) && /duplicate column/i.test(message)) return true;
  return false;
}

export async function migrate(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, "../migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const statements = raw.split(";");
    for (const chunk of statements) {
      const sql = chunk.trim();
      if (!sql) continue;
      try {
        await exec(sql);
      } catch (err) {
        if (isIgnorableMigrationError(sql, err)) continue;
        throw err;
      }
    }
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
