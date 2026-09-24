export interface Env {
  port: number;
  dialect: "sqlite" | "mysql";
  sqlitePath: string;
  mysqlUrl: string | undefined;
  jwtSecret: string;
  webOrigins: string[];
}

function parseOrigins(): string[] {
  const rawList = process.env.WEB_ORIGINS;
  if (rawList !== undefined && rawList.trim() !== "") {
    return rawList.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  const single = process.env.WEB_ORIGIN;
  if (single !== undefined && single.trim() !== "") return [single.trim()];
  return [];
}

export function loadEnv(): Env {
  const rawDialect = (process.env.DB_DIALECT ?? "sqlite").toLowerCase();
  const dialect: "sqlite" | "mysql" = rawDialect === "mysql" ? "mysql" : "sqlite";

  const sqlitePath = process.env.SQLITE_PATH ?? "./data/isms.db";
  const mysqlUrl = process.env.MYSQL_URL;

  if (dialect === "mysql" && !mysqlUrl) {
    throw new Error("MYSQL_URL is required when DB_DIALECT=mysql");
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim() === "") {
    throw new Error("JWT_SECRET is required (set it in the environment, no dev fallback).");
  }

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);

  return {
    port: Number.isNaN(port) ? 3000 : port,
    dialect,
    sqlitePath,
    mysqlUrl,
    jwtSecret,
    webOrigins: parseOrigins(),
  };
}
