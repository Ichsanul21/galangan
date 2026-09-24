import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import mysql from "mysql2/promise";

export type Dialect = "sqlite" | "mysql";

export function getDialect(): Dialect {
  const raw = (process.env.DB_DIALECT ?? "sqlite").toLowerCase();
  return raw === "mysql" ? "mysql" : "sqlite";
}

function resolveSqlitePath(): string {
  const raw = process.env.SQLITE_PATH ?? "./data/isms.db";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

let sqliteDb: Database.Database | null = null;

function ensureSqlite(): Database.Database {
  if (sqliteDb) return sqliteDb;
  const file = resolveSqlitePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  sqliteDb = new Database(file);
  return sqliteDb;
}

let mysqlPool: mysql.Pool | null = null;

function ensureMysql(): mysql.Pool {
  if (mysqlPool) return mysqlPool;
  const url = process.env.MYSQL_URL;
  if (!url) throw new Error("MYSQL_URL is required when DB_DIALECT=mysql");
  mysqlPool = mysql.createPool(url);
  return mysqlPool;
}

export async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (getDialect() === "mysql") {
    const pool = ensureMysql();
    const [rows] = await pool.query(sql, params as never[]);
    return rows as T[];
  }
  const db = ensureSqlite();
  const stmt = db.prepare(sql);
  return stmt.all(...(params as unknown[])) as T[];
}

export async function exec(sql: string, params: unknown[] = []): Promise<void> {
  if (getDialect() === "mysql") {
    const pool = ensureMysql();
    // Use query (not execute): prepared-statement protocol rejects
    // START TRANSACTION / COMMIT / ROLLBACK with ER_UNSUPPORTED_PS 1295.
    await pool.query(sql, params as never[]);
    return;
  }
  const db = ensureSqlite();
  db.prepare(sql).run(...(params as unknown[]));
}

export async function closeDb(): Promise<void> {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
  if (mysqlPool) {
    await mysqlPool.end();
    mysqlPool = null;
  }
}
