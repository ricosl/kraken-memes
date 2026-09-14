import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { markets, signals } from "../db/schema.js";

/** Truncates all tables that tests might have written to, resetting for the next test. Never touches scan_config/monitor_health singletons' existence, only resets other rows via cascade. */
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

export async function createTestSignal(marketId: string, overrides: Partial<typeof signals.$inferInsert> = {}) {
  const [signal] = await db
    .insert(signals)
    .values({
      marketId,
      timestamp: new Date(),
      state: "HIGH_PRIORITY",
      score: 85,
      snapshot: { note: "test fixture" },
      entryPriceRef: 100,
      targetPrice: 107,
      invalidationPrice: 97,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      ...overrides,
    })
    .returning();
  if (!signal) throw new Error("Failed to create test signal");
  return signal;
}
