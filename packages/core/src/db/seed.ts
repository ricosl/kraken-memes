import "../env.js";
import { fileURLToPath } from "node:url";
import { db, pool } from "./client.js";
import { notificationPreferences, scanConfig, users } from "./schema.js";

/**
 * Seeds the minimum state the app needs to boot: the singleton scan_config
 * row (V1 defaults per spec section 46) and one local user with default
 * notification preferences, since V1 has no multi-tenant auth. Idempotent —
 * safe to call on every server boot, not just once.
 */
export async function runSeed(): Promise<void> {
  await db.insert(scanConfig).values({ id: 1 }).onConflictDoNothing();

  const existingUser = await db.query.users.findFirst();
  if (!existingUser) {
    const [user] = await db.insert(users).values({}).returning();
    if (user) {
      await db.insert(notificationPreferences).values({ userId: user.id }).onConflictDoNothing();
    }
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log("Seeding default scan_config...");
  runSeed()
    .then(async () => {
      console.log("Seed complete.");
      await pool.end();
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
