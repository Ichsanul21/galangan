import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { closeDb } from "./db.js";
import { uploadsRoot } from "./routes/files.js";

interface Manifest {
  timestamp?: string;
  dialect?: string;
  tablesCount?: number;
  dbFile?: string;
  uploadsBackedUp?: boolean;
}

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

function runMysqlRestore(mysqlUrl: string, dumpFile: string): Promise<void> {
  const url = new URL(mysqlUrl);
  const host = url.hostname || "localhost";
  const port = url.port || "3306";
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("MYSQL_URL must include a database name (…/dbname)");
  if (!user) throw new Error("MYSQL_URL must include a user (mysql://user:pass@host/db)");
  return new Promise((resolve, reject) => {
    const args = [`--host=${host}`, `--port=${port}`, `--user=${user}`, database];
    const child = spawn("mysql", args, {
      env: { ...process.env, MYSQL_PWD: password },
      stdio: ["pipe", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      reject(new Error(`mysql client failed to start (is it installed on PATH?): ${String(err)}`));
    });
    const input = fs.createReadStream(dumpFile);
    input.on("error", (err) => reject(err));
    input.pipe(child.stdin);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mysql restore exited with code ${code}: ${stderr.slice(0, 2000)}`));
    });
  });
}

async function main(): Promise<void> {
  // Accept `--from <dir>` or a bare positional `<dir>` (npm may strip
  // unknown flags when invoked as `npm run restore -- --from <dir>`).
  const positional = process.argv.slice(2).find((a) => !a.startsWith("-") && !a.endsWith(".ts") && !a.endsWith(".js"));
  const fromRaw = argValue("--from") ?? argValue("--dir") ?? argValue("--in") ?? positional;
  if (!fromRaw) {
    throw new Error("Usage: npm run restore -- --from ./backups/<timestamp>");
  }
  const fromDir = path.isAbsolute(fromRaw) ? fromRaw : path.resolve(process.cwd(), fromRaw);
  const manifestPath = path.join(fromDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest.json not found in ${fromDir}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  const dialect = (manifest.dialect ?? (process.env.DB_DIALECT ?? "sqlite").toLowerCase()) as "sqlite" | "mysql";
  const dbFile = manifest.dbFile ?? (dialect === "mysql" ? "dump.sql" : "isms.db");
  const srcDb = path.join(fromDir, dbFile);
  if (!fs.existsSync(srcDb)) throw new Error(`DB artifact not found: ${srcDb}`);

  if (dialect === "sqlite") {
    const dest = resolveSqlitePath();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcDb, dest);
    const srcUploads = path.join(fromDir, "uploads");
    if (fs.existsSync(srcUploads)) {
      const destUploads = uploadsRoot();
      fs.rmSync(destUploads, { recursive: true, force: true });
      fs.cpSync(srcUploads, destUploads, { recursive: true });
    }
    console.log(`[restore] sqlite ← ${fromDir} (db → ${dest})`);
  } else {
    const mysqlUrl = process.env.MYSQL_URL;
    if (!mysqlUrl) throw new Error("MYSQL_URL is required when DB_DIALECT=mysql");
    await runMysqlRestore(mysqlUrl, srcDb);
    const srcUploads = path.join(fromDir, "uploads");
    if (fs.existsSync(srcUploads)) {
      const destUploads = uploadsRoot();
      fs.rmSync(destUploads, { recursive: true, force: true });
      fs.cpSync(srcUploads, destUploads, { recursive: true });
    }
    console.log(`[restore] mysql ← ${fromDir} (dump piped via mysql client)`);
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("restore.ts") || entry.endsWith("restore.js")) {
  main()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch((err) => {
      console.error("[restore] failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
