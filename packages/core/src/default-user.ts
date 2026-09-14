import { db } from "./db/client.js";
import { notificationPreferences, users } from "./db/schema.js";

/**
 * V1 has no multi-tenant auth (spec: no trading accounts, no credentials).
 * There is exactly one local user per deployment; this returns (creating if
 * necessary) that user's id so routes have a stable owner for push
 * subscriptions and paper trades.
 */
export async function getOrCreateDefaultUserId(): Promise<string> {
  const existing = await db.query.users.findFirst();
  if (existing) return existing.id;

  const [user] = await db.insert(users).values({}).returning();
  if (!user) throw new Error("Failed to create default user");
  await db.insert(notificationPreferences).values({ userId: user.id }).onConflictDoNothing();
  return user.id;
}
