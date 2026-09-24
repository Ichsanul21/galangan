export interface Env {
  port: number;
  dialect: "sqlite" | "mysql";
  sqlitePath: string;
  mysqlUrl: string | undefined;
  jwtSecret: string;
  webOrigin: string | undefined;
}

export function loadEnv(): Env {
  const rawDialect = (process.env.DB_DIALECT ?? "sqlite").toLowerCase();
  const dialect: "sqlite" | "mysql" = rawDialect === "mysql" ? "mysql" : "sqlite";

  const sqlitePath = process.env.SQLITE_PATH ?? "./data/isms.db";
  const mysqlUrl = process.env.MYSQL_URL;

  if (dialect === "mysql" && !mysqlUrl) {
    throw new Error("MYSQL_URL is required when DB_DIALECT=mysql");
  }

  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    jwtSecret = "dev-secret-change-me";
    console.warn("[env] JWT_SECRET missing, using insecure dev fallback. Set JWT_SECRET in production.");
  }

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);

  return {
    port: Number.isNaN(port) ? 3000 : port,
    dialect,
    sqlitePath,
    mysqlUrl,
    jwtSecret,
    webOrigin: process.env.WEB_ORIGIN,
  };
}
