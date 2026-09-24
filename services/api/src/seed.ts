import { exec, q, closeDb } from "./db.js";
import { seedUsers } from "./auth.js";

async function main(): Promise<void> {
  await seedUsers(exec, q);
  console.log("[seed] done");
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("seed.ts") || entry.endsWith("seed.js")) {
  main()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch((err) => {
      console.error("[seed] failed:", err);
      process.exit(1);
    });
}
