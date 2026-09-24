export interface Env {
  port: number;
  dialect: "sqlite" | "mysql";
  sqlitePath: string;
  mysqlUrl: string | undefined;
  jwtSecret: string;
  webOrigins: string[];
  setupToken: string | undefined;
  allowSeedLogin: boolean;
  trustProxy: boolean;
  uploadsDir: string;
  nodeEnv: string;
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
  const rawDialect = (process.env.DB_DIALECT ?? "sqlite").trim().toLowerCase();
  if (rawDialect !== "sqlite" && rawDialect !== "mysql") {
    throw new Error(`DB_DIALECT must be "sqlite" or "mysql" (got "${process.env.DB_DIALECT}").`);
  }
  const dialect: "sqlite" | "mysql" = rawDialect === "mysql" ? "mysql" : "sqlite";

  const sqlitePath = process.env.SQLITE_PATH ?? "./data/isms.db";
  if (dialect === "sqlite" && sqlitePath.trim() === "") {
    throw new Error('SQLITE_PATH must not be empty when DB_DIALECT=sqlite (e.g. "./data/isms.db").');
  }
  const mysqlUrl = process.env.MYSQL_URL;
  if (dialect === "mysql" && !mysqlUrl) {
    throw new Error("MYSQL_URL is required when DB_DIALECT=mysql (e.g. mysql://user:pass@localhost:3306/isms).");
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim() === "") {
    throw new Error("JWT_SECRET is required (set it in the environment, no dev fallback).");
  }

  const portRaw = process.env.PORT ?? "3000";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got "${portRaw}").`);
  }

  // SETUP_TOKEN guards POST /api/admin/seed (fail-closed when missing).
  // Warn at boot so weak/missing tokens are noticed; the route still 403s.
  const setupToken = process.env.SETUP_TOKEN;
  if (!setupToken || setupToken.trim() === "") {
    console.warn("[env] SETUP_TOKEN is missing — /api/admin/seed stays fail-closed (403).");
  } else if (setupToken.length < 32) {
    console.warn("[env] SETUP_TOKEN is shorter than 32 chars — use a long random value in production.");
  }

  const trustRaw = (process.env.TRUST_PROXY ?? "").toLowerCase().trim();
  if (trustRaw !== "" && !["true", "1", "false", "0"].includes(trustRaw)) {
    throw new Error(`TRUST_PROXY must be "true" or "false" (got "${process.env.TRUST_PROXY}").`);
  }
  const trustProxy = trustRaw === "true" || trustRaw === "1";

  // Demo seed accounts can only log in when explicitly allowed.
  const allowRaw = (process.env.ALLOW_SEED_LOGIN ?? "").toLowerCase().trim();
  if (allowRaw !== "" && !["true", "1", "false", "0"].includes(allowRaw)) {
    throw new Error(`ALLOW_SEED_LOGIN must be "true" or "false" (got "${process.env.ALLOW_SEED_LOGIN}").`);
  }
  const allowSeedLogin = allowRaw === "true" || allowRaw === "1";

  const uploadsDir = process.env.UPLOADS_DIR ?? "./data/uploads";
  if (uploadsDir.trim() === "") {
    throw new Error('UPLOADS_DIR must not be empty (e.g. "./data/uploads").');
  }

  const nodeEnvRaw = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  if (!["development", "test", "production"].includes(nodeEnvRaw)) {
    throw new Error(`NODE_ENV must be "development", "test", or "production" (got "${process.env.NODE_ENV}").`);
  }
  const nodeEnv = nodeEnvRaw;

  const origins = parseOrigins();
  for (const o of origins) {
    if (o === "*") continue;
    try {
      const u = new URL(o);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error(`WEB_ORIGINS entries must be http(s) URLs or "*": invalid "${o}".`);
      }
    } catch {
      throw new Error(`WEB_ORIGINS entries must be valid http(s) URLs or "*": invalid "${o}".`);
    }
  }

  return {
    port,
    dialect,
    sqlitePath,
    mysqlUrl,
    jwtSecret,
    webOrigins: origins,
    setupToken,
    allowSeedLogin,
    trustProxy,
    uploadsDir,
    nodeEnv,
  };
}
