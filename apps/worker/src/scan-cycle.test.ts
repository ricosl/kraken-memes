import { describe, expect, it } from "vitest";
import type { Candle } from "@kraken-memes/shared";
import { DEFAULT_LIQUIDITY_THRESHOLDS, DEFAULT_SCORE_WEIGHTS, DEFAULT_SETUP_PARAMETERS } from "@kraken-memes/shared";
import { DEFAULT_SCORE_THRESHOLDS } from "@kraken-memes/shared";
import { evaluateMarketCycle, finalizeStateAfterNotification, type MarketCycleContext } from "./scan-cycle.js";

function candle(close: number, high = close, low = close): Candle {
  return {
    marketId: "m1",
    timeframe: "15m",
    timestamp: new Date().toISOString(),
    open: close,
    high,
    low,
    close,
    volume: 1000,
    vwap: close,
    tradeCount: 20,
  };
}

const scanConfig = {
  weights: DEFAULT_SCORE_WEIGHTS,
  scoreThresholds: DEFAULT_SCORE_THRESHOLDS,
  liquidityThresholds: DEFAULT_LIQUIDITY_THRESHOLDS,
  setupParams: DEFAULT_SETUP_PARAMETERS,
};

const goodLiquidity = { quoteVolume24h: 1_000_000, spreadBps: 10, depthNotional: 50_000, tradeCount1h: 100, marketActive: true };
const goodOrderBook = { bids: [{ price: 99.99, volume: 1000 }], asks: [{ price: 100.01, volume: 1000 }] };
const flatRegime = {
  timestamp: "2026-01-01T00:00:00.000Z",
  btcReturn1h: 0,
  btcVolatility: 0.01,
  btcHigh24h: 100,
  btcCurrentPrice: 100,
  solReturn1h: 0,
  solVolatility: 0.01,
  memeBasketReturns1h: [0, 0],
};

const basePrefs = {
  enabled: true,
  minScore: 75,
  quietStart: null,
  quietEnd: null,
  cooldownMinutes: 60,
  newSetupEnabled: true,
  invalidationEnabled: true,
};

function baseContext(overrides: Partial<MarketCycleContext> = {}): MarketCycleContext {
  return {
    currentPrice: 100,
    candles15m: [candle(98), candle(99), candle(100)],
    candles1h: [candle(95), candle(100)],
    candles4h: [candle(90), candle(100)],
    candles24h: [candle(85), candle(100)],
    volumeStats: {
      currentVolume: 100,
      baselineVolume: 100,
      currentTradeCount: 20,
      baselineTradeCount: 20,
      currentAvgTradeSize: 5,
      baselineAvgTradeSize: 5,
    },
    liquidityRaw: goodLiquidity,
    orderBook: goodOrderBook,
    regimeInput: flatRegime,
    coinReturn1h: 0.01,
    social: { available: false },
    existingSignal: null,
    now: new Date("2026-01-01T00:00:00.000Z"),
    scanConfig,
    notificationPreferences: basePrefs,
    lastNotificationAtForMarket: null,
    ...overrides,
  };
}

describe("evaluateMarketCycle", () => {
  it("skips creating a signal for a brand-new, uninteresting market", () => {
    const outcome = evaluateMarketCycle(baseContext());
    expect(outcome.skipped).toBe(true);
    expect(outcome.isNewSignal).toBe(false);
  });

  it("creates a new signal directly at HIGH_PRIORITY when a strong breakout is detected on a new market", () => {
    const breakoutCandles = [candle(95), candle(96, 97), candle(97, 98), candle(130, 132)];
    const outcome = evaluateMarketCycle(
      baseContext({
        currentPrice: 130,
        candles15m: breakoutCandles,
        candles1h: breakoutCandles,
        candles4h: breakoutCandles,
        volumeStats: {
          currentVolume: 800,
          baselineVolume: 100,
          currentTradeCount: 200,
          baselineTradeCount: 40,
          currentAvgTradeSize: 4,
          baselineAvgTradeSize: 2.5,
        },
      }),
    );
    expect(outcome.skipped).toBe(false);
    expect(outcome.isNewSignal).toBe(true);
    expect(outcome.toState).toBe("HIGH_PRIORITY");
    expect(outcome.newSignalLevels).not.toBeNull();
    expect(outcome.notification?.type).toBe("NEW_HIGH_PRIORITY");
    expect(outcome.notification?.decision.shouldSend).toBe(true);
  });

  it("skips creating a signal for a brand-new market that fails the liquidity gate, even with a high score", () => {
    const breakoutCandles = [candle(95), candle(96, 97), candle(97, 98), candle(130, 132)];
    const outcome = evaluateMarketCycle(
      baseContext({
        currentPrice: 130,
        candles15m: breakoutCandles,
        candles1h: breakoutCandles,
        candles4h: breakoutCandles,
        liquidityRaw: { quoteVolume24h: 100, spreadBps: 10, depthNotional: 50_000, tradeCount1h: 100, marketActive: true },
        volumeStats: {
          currentVolume: 800,
          baselineVolume: 100,
          currentTradeCount: 200,
          baselineTradeCount: 40,
          currentAvgTradeSize: 4,
          baselineAvgTradeSize: 2.5,
        },
      }),
    );
    expect(outcome.skipped).toBe(true);
    expect(outcome.notification).toBeNull();
  });

  it("rejects an already-tracked signal, once, when it later fails the liquidity gate", () => {
    const outcome = evaluateMarketCycle(
      baseContext({
        currentPrice: 105,
        liquidityRaw: { quoteVolume24h: 100, spreadBps: 10, depthNotional: 50_000, tradeCount1h: 100, marketActive: true },
        existingSignal: { id: "s1", state: "QUALIFIED", score: 62, targetPrice: 110, invalidationPrice: 95, expiresAt: "2026-01-02T00:00:00.000Z", lastNotifiedState: null, entryPriceRef: 100, createdAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    expect(outcome.skipped).toBe(false);
    expect(outcome.toState).toBe("REJECTED");
    expect(outcome.notification).toBeNull();
  });

  it("progresses an existing WATCH signal to QUALIFIED as its score rises", () => {
    const outcome = evaluateMarketCycle(
      baseContext({
        currentPrice: 105,
        existingSignal: { id: "s1", state: "WATCH", score: 45, targetPrice: 110, invalidationPrice: 95, expiresAt: "2026-01-02T00:00:00.000Z", lastNotifiedState: null, entryPriceRef: 100, createdAt: "2026-01-01T00:00:00.000Z" },
        volumeStats: {
          currentVolume: 300,
          baselineVolume: 100,
          currentTradeCount: 60,
          baselineTradeCount: 20,
          currentAvgTradeSize: 5,
          baselineAvgTradeSize: 5,
        },
      }),
    );
    expect(["QUALIFIED", "HIGH_PRIORITY"]).toContain(outcome.toState);
    expect(outcome.stateChanged).toBe(true);
  });

  it("marks a signal TARGET_REACHED once price hits the target, from an ACTIVE state", () => {
    const outcome = evaluateMarketCycle(
      baseContext({
        currentPrice: 112,
        existingSignal: { id: "s1", state: "ACTIVE", score: 80, targetPrice: 110, invalidationPrice: 95, expiresAt: "2026-01-02T00:00:00.000Z", lastNotifiedState: "HIGH_PRIORITY", entryPriceRef: 100, createdAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    expect(outcome.toState).toBe("TARGET_REACHED");
    expect(outcome.notification).toBeNull();
  });

  it("recommends an INVALIDATED notification when price hits invalidation and preference allows it", () => {
    const outcome = evaluateMarketCycle(
      baseContext({
        currentPrice: 94,
        existingSignal: { id: "s1", state: "ACTIVE", score: 80, targetPrice: 110, invalidationPrice: 95, expiresAt: "2026-01-02T00:00:00.000Z", lastNotifiedState: "HIGH_PRIORITY", entryPriceRef: 100, createdAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    expect(outcome.toState).toBe("INVALIDATED");
    expect(outcome.notification?.type).toBe("INVALIDATED");
    expect(outcome.notification?.decision.shouldSend).toBe(true);
  });

  it("suppresses a duplicate HIGH_PRIORITY notification within cooldown, but still holds the state", () => {
    const outcome = evaluateMarketCycle(
      baseContext({
        currentPrice: 130,
        candles15m: [candle(95), candle(96, 97), candle(97, 98), candle(130, 132)],
        candles1h: [candle(95), candle(96, 97), candle(97, 98), candle(130, 132)],
        candles4h: [candle(95), candle(96, 97), candle(97, 98), candle(130, 132)],
        existingSignal: { id: "s1", state: "HIGH_PRIORITY", score: 90, targetPrice: 140, invalidationPrice: 126, expiresAt: "2026-01-02T00:00:00.000Z", lastNotifiedState: "HIGH_PRIORITY", entryPriceRef: 100, createdAt: "2026-01-01T00:00:00.000Z" },
        lastNotificationAtForMarket: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        now: new Date("2026-01-01T00:10:00.000Z"),
        volumeStats: {
          currentVolume: 800,
          baselineVolume: 100,
          currentTradeCount: 200,
          baselineTradeCount: 40,
          currentAvgTradeSize: 4,
          baselineAvgTradeSize: 2.5,
        },
      }),
    );
    expect(outcome.notification?.decision.shouldSend).toBe(false);
    expect(outcome.toState).toBe("HIGH_PRIORITY");
  });

  it("finalizeStateAfterNotification moves HIGH_PRIORITY to ACTIVE once a notification is sent", () => {
    const final = finalizeStateAfterNotification("HIGH_PRIORITY", {
      liquidityPassed: true,
      scoreTier: "HIGH_PRIORITY",
      notificationSent: false,
      priceOutcome: "NONE",
      expired: false,
      scoreTrend: "FLAT",
    });
    expect(final).toBe("ACTIVE");
  });
});
