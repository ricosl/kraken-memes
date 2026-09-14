import { sql } from "drizzle-orm";
import { db, markets, notificationPreferences, scanConfig, users } from "@kraken-memes/core";

export async function resetTestData(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      push_subscriptions,
      notification_preferences,
      users,
      paper_trades,
      signal_outcomes,
      notification_history,
      signal_events,
      signals,
      features,
      order_book_snapshots,
      trades,
      candles,
      markets
    RESTART IDENTITY CASCADE
  `);
  await db.insert(scanConfig).values({ id: 1 }).onConflictDoUpdate({
    target: scanConfig.id,
    set: {
      targetPct: 0.07,
      invalidationPct: -0.03,
      observationWindowHours: 24,
      weights: { volumeAcceleration: 35, breakoutStructure: 25, liquidityOrderBook: 20, marketRegime: 10, social: 10 },
      scoreThresholds: { watchScore: 40, qualifyScore: 60, highPriorityScore: 75 },
      liquidityThresholds: { minQuoteVolume24h: 250_000, maxSpreadBps: 50, minDepthNotional: 15_000, minTradeCount1h: 20 },
    },
  });
}

export async function createTestUser(): Promise<string> {
  const [user] = await db.insert(users).values({}).returning();
  if (!user) throw new Error("Failed to create test user");
  await db
    .insert(notificationPreferences)
    .values({ userId: user.id, enabled: true, minScore: 75, cooldownMinutes: 60, newSetupEnabled: true, invalidationEnabled: true })
    .onConflictDoNothing();
  return user.id;
}

export async function createTestMarket(overrides: Partial<typeof markets.$inferInsert> = {}) {
  const [market] = await db
    .insert(markets)
    .values({
      krakenPairName: overrides.krakenPairName ?? `TESTUSD-${Math.random().toString(36).slice(2, 8)}`,
      symbol: overrides.symbol ?? "TEST/USD",
      baseAsset: overrides.baseAsset ?? "TEST",
      quoteAsset: "USD",
      active: true,
      memeClassification: "INCLUDED",
      ...overrides,
    })
    .returning();
  if (!market) throw new Error("Failed to create test market");
  return market;
}
