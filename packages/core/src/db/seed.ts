import "../env.js";
import { db, pool } from "./client.js";
import { notificationPreferences, scanConfig, users } from "./schema.js";

/**
 * Seeds the minimum state the app needs to boot: the singleton scan_config
 * row (V1 defaults per spec section 46) and one local user with default
 * notification preferences, since V1 has no multi-tenant auth.
 */
async function main() {
  console.log("Seeding default scan_config...");
  await db.insert(scanConfig).values({ id: 1 }).onConflictDoNothing();

  const existingUser = await db.query.users.findFirst();
  if (!existingUser) {
    console.log("Creating default local user...");
    const [user] = await db.insert(users).values({}).returning();
    if (user) {
      await db.insert(notificationPreferences).values({ userId: user.id }).onConflictDoNothing();
      console.log(`Created user ${user.id}`);
    }
  } else {
    console.log(`Default user already exists: ${existingUser.id}`);
  }

  console.log("Seed complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
