import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, q, closeDb, getDialect } from "./db.js";

function checksumOf(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function isIgnorableMigrationError(sql: string, err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // ADD COLUMN is not idempotent on its own: SQLite reports
  // "duplicate column name", MySQL reports "Duplicate column name" (ER 1060).
  if (/^\s*alter\s+table/i.test(sql) && /duplicate column/i.test(message)) return true;
  // CREATE INDEX is plain (no IF NOT EXISTS: MySQL syntax has none), so
  // reruns must tolerate duplicates: SQLite "already exists",
  // MySQL "Duplicate key name" (ER_DUP_KEYNAME / errno 1061).
  if (/^\s*create\s+(unique\s+)?index/i.test(sql)) {
    if (/already exists/i.test(message)) return true;
    if (/duplicate/i.test(message)) return true;
    const code = (err as { code?: unknown; errno?: unknown } | null | undefined)?.code;
    const errno = (err as { code?: unknown; errno?: unknown } | null | undefined)?.errno;
    if (code === "ER_DUP_KEYNAME" || errno === 1061) return true;
  }
  return false;
}

export async function migrate(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, "../migrations");

  await exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(128) PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );

  let applied = new Map<string, string>();
  try {
    const rows = await q<{ name: string; checksum: string }>("SELECT name, checksum FROM schema_migrations");
    applied = new Map(rows.map((r) => [String(r.name), String(r.checksum)]));
  } catch (err) {
    console.warn("[migrate] could not read schema_migrations, proceeding without skip:", err);
  }

  const dialect = getDialect();
  const beginSql = dialect === "mysql" ? "START TRANSACTION" : "BEGIN";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const checksum = checksumOf(raw);
    const recorded = applied.get(file);
    if (recorded !== undefined) {
      if (recorded !== checksum) {
        console.warn(
          `[migrate] checksum mismatch for ${file} (recorded ${recorded.slice(0, 12)} vs current ${checksum.slice(0, 12)}); file changed since applied — skipping re-apply`,
        );
      } else {
        console.log(`[migrate] skip ${file} (already applied)`);
      }
      continue;
    }
    await exec(beginSql);
    try {
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
      await exec("INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)", [
        file,
        checksum,
        new Date().toISOString(),
      ]);
      await exec("COMMIT");
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      try {
        await exec("ROLLBACK");
      } catch {
        // ignore rollback failure (e.g. MySQL DDL implicit commit)
      }
      throw err;
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
