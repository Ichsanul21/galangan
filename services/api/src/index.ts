import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { migrate } from "./migrate.js";

async function main(): Promise<void> {
  const env = loadEnv();
  await migrate();
  const app = buildApp();
  await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("[api] fatal:", err);
  process.exit(1);
});
