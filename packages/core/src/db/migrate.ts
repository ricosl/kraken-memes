import "../env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

// Resolved from this file's own location, not process.cwd() — so this works
// identically whether invoked as a CLI script (any cwd) or imported and
// called from another package's runtime (e.g. the server running it on boot).
const migrationsFolder = path.resolve(fileURLToPath(import.meta.url), "../../../drizzle");

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log("Running migrations...");
  runMigrations()
    .then(async () => {
      console.log("Migrations complete.");
      await pool.end();
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
