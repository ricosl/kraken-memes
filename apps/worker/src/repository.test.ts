import { beforeEach, describe, expect, it } from "vitest";
import { db, markets, signalEvents } from "@kraken-memes/core";
import { eq } from "drizzle-orm";
import {
  createSignal,
  getEligibleMarkets,
  getLastNotificationForMarket,
  getOpenSignal,
  getRecentCandles,
  insertCandles,
  recordNotification,
  updateSignalState,
  upsertMarketFromDiscovery,
  upsertSignalOutcome,
} from "./repository.js";
import { createTestMarket, resetTestData } from "./test/db-helpers.js";

beforeEach(async () => {
  await resetTestData();
});

describe("getEligibleMarkets", () => {
  it("only returns active markets with a meme-eligible classification", async () => {
    await createTestMarket({ krakenPairName: "A", active: true, memeClassification: "INCLUDED" });
    await createTestMarket({ krakenPairName: "B", active: true, memeClassification: "AUTO_CLASSIFIED" });
    await createTestMarket({ krakenPairName: "C", active: true, memeClassification: "EXCLUDED" });
    await createTestMarket({ krakenPairName: "D", active: false, memeClassification: "INCLUDED" });

    const eligible = await getEligibleMarkets();
    expect(eligible.map((m) => m.krakenPairName).sort()).toEqual(["A", "B"]);
  });
});

describe("candle storage", () => {
  it("inserts candles and reads them back in ascending order, upserting on conflict", async () => {
    const market = await createTestMarket();
    await insertCandles([
      { marketId: market.id, timeframe: "15m", timestamp: new Date("2026-01-01T00:00:00Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
      { marketId: market.id, timeframe: "15m", timestamp: new Date("2026-01-01T00:15:00Z"), open: 1.5, high: 2, low: 1, close: 1.8, volume: 120 },
    ]);
    // Re-insert the same timestamp with a different close to verify upsert (not duplicate) behavior.
    await insertCandles([
      { marketId: market.id, timeframe: "15m", timestamp: new Date("2026-01-01T00:00:00Z"), open: 1, high: 2.5, low: 0.5, close: 2.0, volume: 200 },
    ]);

    const candles = await getRecentCandles(market.id, "15m", 10);
    expect(candles).toHaveLength(2);
    expect(candles[0]!.timestamp < candles[1]!.timestamp).toBe(true);
    expect(candles[0]!.close).toBe(2.0); // updated, not duplicated
  });
});

describe("signal lifecycle", () => {
  it("creates a signal with an initial signal_event and can transition its state with a new event", async () => {
    const market = await createTestMarket();
    const signalId = await createSignal({
      marketId: market.id,
      timestamp: new Date(),
      state: "WATCH",
      score: 45,
      snapshot: { note: "test" },
      entryPriceRef: 100,
      targetPrice: 107,
      invalidationPrice: 97,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const open = await getOpenSignal(market.id);
    expect(open?.id).toBe(signalId);
    expect(open?.state).toBe("WATCH");

    await updateSignalState({ signalId, fromState: "WATCH", toState: "QUALIFIED", score: 62, reason: "test transition" });

    const updated = await getOpenSignal(market.id);
    expect(updated?.state).toBe("QUALIFIED");
    expect(updated?.score).toBe(62);

    const events = await db.query.signalEvents.findMany({ where: eq(signalEvents.signalId, signalId) });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.toState).sort()).toEqual(["QUALIFIED", "WATCH"]);
  });

  it("does not treat a terminal-state signal as open", async () => {
    const market = await createTestMarket();
    await createSignal({
      marketId: market.id,
      timestamp: new Date(),
      state: "TARGET_REACHED",
      score: 90,
      snapshot: {},
      entryPriceRef: 100,
      targetPrice: 107,
      invalidationPrice: 97,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await getOpenSignal(market.id)).toBeNull();
  });

  it("preserves the original entryPriceRef/targetPrice/invalidationPrice across state updates", async () => {
    const market = await createTestMarket();
    const signalId = await createSignal({
      marketId: market.id,
      timestamp: new Date(),
      state: "HIGH_PRIORITY",
      score: 80,
      snapshot: { original: true },
      entryPriceRef: 100,
      targetPrice: 107,
      invalidationPrice: 97,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await updateSignalState({ signalId, fromState: "HIGH_PRIORITY", toState: "ACTIVE", score: 85, reason: "notified" });

    const open = await getOpenSignal(market.id);
    expect(open?.targetPrice).toBe(107);
    expect(open?.invalidationPrice).toBe(97);
    expect(open?.entryPriceRef).toBe(100);
  });
});

describe("notification history", () => {
  it("returns null when a market has never been notified, then the timestamp after one is recorded", async () => {
    const market = await createTestMarket();
    expect(await getLastNotificationForMarket(market.id)).toBeNull();

    const signalId = await createSignal({
      marketId: market.id,
      timestamp: new Date(),
      state: "HIGH_PRIORITY",
      score: 85,
      snapshot: {},
      entryPriceRef: 100,
      targetPrice: 107,
      invalidationPrice: 97,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await recordNotification({ signalId, marketId: market.id, type: "NEW_HIGH_PRIORITY", toState: "HIGH_PRIORITY", score: 85, subscriptionsTargeted: 1, subscriptionsDelivered: 1 });

    expect(await getLastNotificationForMarket(market.id)).not.toBeNull();
  });
});

describe("signal outcome tracking", () => {
  it("tracks running max favorable/adverse excursion and finalizes on a terminal outcome", async () => {
    const market = await createTestMarket();
    const signalId = await createSignal({
      marketId: market.id,
      timestamp: new Date("2026-01-01T00:00:00Z"),
      state: "ACTIVE",
      score: 80,
      snapshot: {},
      entryPriceRef: 100,
      targetPrice: 110,
      invalidationPrice: 95,
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });

    await upsertSignalOutcome({ signalId, entryPrice: 100, currentPrice: 103, outcome: "OPEN", createdAt: new Date("2026-01-01T00:00:00Z"), now: new Date("2026-01-01T01:00:00Z") });
    await upsertSignalOutcome({ signalId, entryPrice: 100, currentPrice: 98, outcome: "OPEN", createdAt: new Date("2026-01-01T00:00:00Z"), now: new Date("2026-01-01T02:00:00Z") });
    await upsertSignalOutcome({ signalId, entryPrice: 100, currentPrice: 111, outcome: "TARGET_HIT", createdAt: new Date("2026-01-01T00:00:00Z"), now: new Date("2026-01-01T05:00:00Z") });

    const outcome = await db.query.signalOutcomes.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.signalId, signalId) });
    expect(outcome?.maxFavorableMovePct).toBeCloseTo(0.11, 2); // from the 111 price point
    expect(outcome?.maxAdverseMovePct).toBeCloseTo(-0.02, 2); // from the 98 price point
    expect(outcome?.outcome).toBe("TARGET_HIT");
    expect(outcome?.hoursToOutcome).toBeCloseTo(5, 1);
  });
});

describe("upsertMarketFromDiscovery", () => {
  it("creates a new market with the suggested classification", async () => {
    await upsertMarketFromDiscovery({
      krakenPairName: "NEWUSD",
      symbol: "NEW/USD",
      baseAsset: "NEW",
      quoteAsset: "USD",
      active: true,
      priceDecimals: 5,
      quantityDecimals: 8,
      minOrderSize: 1,
      ineligibleReason: null,
      suggestedClassification: "PENDING_REVIEW",
    });
    const row = await db.query.markets.findFirst({ where: eq(markets.krakenPairName, "NEWUSD") });
    expect(row?.memeClassification).toBe("PENDING_REVIEW");
  });

  it("never overwrites a manually-overridden classification on rediscovery", async () => {
    const market = await createTestMarket({ krakenPairName: "OVERRIDDENUSD", memeClassification: "EXCLUDED" });
    await db.update(markets).set({ classificationOverridden: true }).where(eq(markets.id, market.id));

    await upsertMarketFromDiscovery({
      krakenPairName: "OVERRIDDENUSD",
      symbol: market.symbol,
      baseAsset: market.baseAsset,
      quoteAsset: "USD",
      active: true,
      priceDecimals: 5,
      quantityDecimals: 8,
      minOrderSize: 1,
      ineligibleReason: null,
      suggestedClassification: "AUTO_CLASSIFIED", // would normally flip it, but override wins
    });

    const row = await db.query.markets.findFirst({ where: eq(markets.krakenPairName, "OVERRIDDENUSD") });
    expect(row?.memeClassification).toBe("EXCLUDED");
  });
});
