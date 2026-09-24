import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { closeDb, getDialect, q } from "./db.js";
import { COLLECTIONS } from "./routes/crud.js";
import { uploadsRoot } from "./routes/files.js";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const prefixed = process.argv.find((a) => a.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return undefined;
}

function resolveSqlitePath(): string {
  const raw = process.env.SQLITE_PATH ?? "./data/isms.db";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function sanitizeTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

async function tablesCount(): Promise<{ count: number; tables: string[] }> {
  try {
    if (getDialect() === "mysql") {
      const rows = await q<{ cnt: number | string }>(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE()",
      );
      const count = Number(rows[0]?.cnt ?? COLLECTIONS.length);
      return { count, tables: [...COLLECTIONS, "users", "audit_log", "schema_migrations"] };
    }
    const rows = await q<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    const tables = rows.map((r) => String(r.name));
    return { count: tables.length, tables };
  } catch {
    return { count: COLLECTIONS.length, tables: [...COLLECTIONS] };
  }
}

function runMysqldump(mysqlUrl: string, outFile: string): Promise<void> {
  const url = new URL(mysqlUrl);
  const host = url.hostname || "localhost";
  const port = url.port || "3306";
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("MYSQL_URL must include a database name (…/dbname)");
  if (!user) throw new Error("MYSQL_URL must include a user (mysql://user:pass@host/db)");
  return new Promise((resolve, reject) => {
    const args = [
      `--host=${host}`,
      `--port=${port}`,
      `--user=${user}`,
      "--single-transaction",
      "--quick",
      "--lock-tables=false",
      database,
    ];
    const child = spawn("mysqldump", args, {
      env: { ...process.env, MYSQL_PWD: password },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = fs.createWriteStream(outFile);
    let stderr = "";
    child.stdout.pipe(out);
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      out.close();
      reject(new Error(`mysqldump failed to start (is it installed on PATH?): ${String(err)}`));
    });
    child.on("close", (code) => {
      out.close();
      if (code === 0) resolve();
      else reject(new Error(`mysqldump exited with code ${code}: ${stderr.slice(0, 2000)}`));
    });
  });
}

async function main(): Promise<void> {
  const timestamp = new Date().toISOString();
  const dialect = getDialect();
  // Accept both `--out <dir>` and a bare positional `<dir>` (npm may strip
  // unknown `--out` flags when invoked as `npm run backup -- --out <dir>`).
  const positional = process.argv.slice(2).find((a) => !a.startsWith("-") && !a.endsWith(".ts") && !a.endsWith(".js"));
  const outDir = path.resolve(
    process.cwd(),
    argValue("--out") ?? positional ?? path.join("backups", sanitizeTimestamp(timestamp)),
  );
  fs.mkdirSync(outDir, { recursive: true });

  let dbFile = "";
  if (dialect === "sqlite") {
    const src = resolveSqlitePath();
    if (!fs.existsSync(src)) {
      throw new Error(`SQLite file not found at ${src} (run npm run migrate first)`);
    }
    dbFile = "isms.db";
    const dest = path.join(outDir, dbFile);
    // VACUUM INTO writes a consistent snapshot without blocking longer than needed.
    const db = new Database(src, { readonly: true });
    try {
      const escaped = dest.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escaped}'`);
    } finally {
      db.close();
    }
  } else {
    const mysqlUrl = process.env.MYSQL_URL;
    if (!mysqlUrl) throw new Error("MYSQL_URL is required when DB_DIALECT=mysql");
    dbFile = "dump.sql";
    await runMysqldump(mysqlUrl, path.join(outDir, dbFile));
  }

  // Copy uploads dir (best-effort: empty/missing uploads still produce a valid backup).
  let uploadsBackedUp = false;
  const uploads = uploadsRoot();
  if (fs.existsSync(uploads)) {
    fs.cpSync(uploads, path.join(outDir, "uploads"), { recursive: true });
    uploadsBackedUp = true;
  }

  const { count, tables } = await tablesCount();
  const manifest = {
    timestamp,
    dialect,
    tablesCount: count,
    tables,
    dbFile,
    uploadsBackedUp,
    note: dialect === "mysql" ? "Requires mysqldump on PATH to create this backup." : undefined,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[backup] ${dialect} → ${outDir} (tables: ${count}, uploads: ${uploadsBackedUp ? "yes" : "empty"})`);
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("backup.ts") || entry.endsWith("backup.js")) {
  main()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch((err) => {
      console.error("[backup] failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
