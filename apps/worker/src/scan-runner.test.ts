import { beforeEach, describe, expect, it } from "vitest";
import { NoopSocialSignalProvider } from "@kraken-memes/shared";
import { db, signals, trades as tradesTable } from "@kraken-memes/core";
import { eq } from "drizzle-orm";
import { insertCandles, insertOrderBookSnapshot } from "./repository.js";
import { runScanCycle } from "./scan-runner.js";
import { createTestMarket, createTestUser, resetTestData } from "./test/db-helpers.js";

beforeEach(async () => {
  await resetTestData();
  await createTestUser();
});

function iso(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60_000);
}

describe("runScanCycle (end-to-end against Postgres, no live Kraken required)", () => {
  it("creates a HIGH_PRIORITY signal for a market showing a strong, liquid breakout", async () => {
    const market = await createTestMarket({ krakenPairName: "BREAKOUTUSD", symbol: "BREAKOUT/USD", baseAsset: "BREAKOUT" });

    // 15m candles: quiet baseline, then a sharp breakout with a volume spike on the latest completed candle.
    const candles15m = [];
    for (let i = 6; i >= 2; i--) {
      candles15m.push({ marketId: market.id, timeframe: "15m" as const, timestamp: iso(i * 15), open: 0.95, high: 0.97, low: 0.94, close: 0.96, volume: 50, vwap: 0.96, tradeCount: 10 });
    }
    candles15m.push({ marketId: market.id, timeframe: "15m" as const, timestamp: iso(15), open: 0.96, high: 0.98, low: 0.95, close: 0.97, volume: 60, vwap: 0.97, tradeCount: 12 });
    candles15m.push({ marketId: market.id, timeframe: "15m" as const, timestamp: iso(0.001), open: 0.97, high: 1.3, low: 0.97, close: 1.29, volume: 6000, vwap: 1.1, tradeCount: 300 });
    await insertCandles(candles15m);

    await insertCandles([
      { marketId: market.id, timeframe: "1h", timestamp: iso(120), open: 0.9, high: 0.95, low: 0.88, close: 0.95, volume: 200, vwap: 0.92 },
      { marketId: market.id, timeframe: "1h", timestamp: iso(60), open: 0.95, high: 1.3, low: 0.95, close: 1.29, volume: 6200, vwap: 1.1 },
    ]);
    await insertCandles([
      { marketId: market.id, timeframe: "4h", timestamp: iso(480), open: 0.85, high: 0.9, low: 0.8, close: 0.9, volume: 800, vwap: 0.87 },
      { marketId: market.id, timeframe: "4h", timestamp: iso(240), open: 0.9, high: 1.3, low: 0.9, close: 1.29, volume: 6500, vwap: 1.05 },
    ]);
    await insertCandles([
      { marketId: market.id, timeframe: "24h", timestamp: iso(2880), open: 0.8, high: 0.9, low: 0.75, close: 0.85, volume: 5000, vwap: 0.82 },
      { marketId: market.id, timeframe: "24h", timestamp: iso(1440), open: 0.85, high: 1.3, low: 0.85, close: 1.29, volume: 600_000, vwap: 1.0 },
    ]);

    // Healthy order book: tight spread, strong depth on both sides.
    await insertOrderBookSnapshot({
      marketId: market.id,
      timestamp: new Date(),
      bestBid: 1.2895,
      bestAsk: 1.2905,
      spread: 0.001,
      spreadBps: 8,
      bidDepth: 40_000,
      askDepth: 35_000,
      imbalance: 0.07,
    });

    // Enough recent trade activity to pass the liquidity gate's trade-count requirement.
    const tradeRows = Array.from({ length: 40 }, (_, i) => ({
      marketId: market.id,
      timestamp: iso(i),
      price: 1.0 + i * 0.005,
      volume: 100,
      aggressor: "BUY" as const,
    }));
    await db.insert(tradesTable).values(tradeRows);

    const summary = await runScanCycle(new NoopSocialSignalProvider());

    expect(summary.marketsScanned).toBe(1);
    expect(summary.signalsCreated).toBe(1);

    const createdSignal = await db.query.signals.findFirst({ where: eq(signals.marketId, market.id) });
    expect(createdSignal).toBeDefined();
    expect(["HIGH_PRIORITY", "ACTIVE"]).toContain(createdSignal!.state);
    expect(createdSignal!.score).toBeGreaterThanOrEqual(75);

    if (createdSignal!.state === "ACTIVE") {
      expect(summary.notificationsSent).toBe(1);
      expect(createdSignal!.lastNotifiedState).toBe("HIGH_PRIORITY");
    }
  });

  it("skips a market with insufficient candle history without throwing", async () => {
    await createTestMarket({ krakenPairName: "EMPTYUSD" });
    const summary = await runScanCycle(new NoopSocialSignalProvider());
    expect(summary.marketsSkippedInsufficientData).toBeGreaterThanOrEqual(1);
    expect(summary.marketsScanned).toBe(0);
  });

  it("does not create a signal for a market that fails the liquidity gate despite a price spike", async () => {
    const market = await createTestMarket({ krakenPairName: "THINUSD" });
    const candles15m = [];
    for (let i = 3; i >= 0; i--) {
      candles15m.push({ marketId: market.id, timeframe: "15m" as const, timestamp: iso(i * 15), open: 1, high: 1.5, low: 0.9, close: 1.4, volume: 10, vwap: 1.2, tradeCount: 2 });
    }
    await insertCandles(candles15m);
    await insertCandles([{ marketId: market.id, timeframe: "1h", timestamp: iso(60), open: 1, high: 1.5, low: 1, close: 1.4, volume: 10 }]);
    await insertCandles([{ marketId: market.id, timeframe: "24h", timestamp: iso(1440), open: 1, high: 1.5, low: 1, close: 1.4, volume: 10 }]);

    await insertOrderBookSnapshot({
      marketId: market.id,
      timestamp: new Date(),
      bestBid: 1.0,
      bestAsk: 1.4,
      spread: 0.4,
      spreadBps: 3000,
      bidDepth: 50,
      askDepth: 50,
      imbalance: 0,
    });

    const summary = await runScanCycle(new NoopSocialSignalProvider());
    // A brand-new market that fails liquidity never gets a signal row at all —
    // otherwise it would get a fresh REJECTED row every single cycle forever.
    expect(summary.signalsCreated).toBe(0);
    const created = await db.query.signals.findFirst({ where: eq(signals.marketId, market.id) });
    expect(created).toBeUndefined();
  });
});
