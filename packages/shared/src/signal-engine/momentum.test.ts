import { describe, expect, it } from "vitest";
import type { Candle } from "../types.js";
import { computeMomentumFeatures } from "./momentum.js";

function makeCandle(overrides: Partial<Candle> & { close: number }): Candle {
  const defaults: Candle = {
    marketId: "TEST",
    timeframe: "15m",
    timestamp: new Date().toISOString(),
    open: overrides.close,
    high: overrides.close,
    low: overrides.close,
    close: overrides.close,
    volume: 1000,
    vwap: overrides.close,
    tradeCount: 10,
  };
  return { ...defaults, ...overrides };
}

describe("computeMomentumFeatures", () => {
  it("computes returns per timeframe from the last two completed candles", () => {
    const features = computeMomentumFeatures({
      candlesByTimeframe: {
        "15m": [makeCandle({ close: 100 }), makeCandle({ close: 105 })],
        "1h": [makeCandle({ close: 100 }), makeCandle({ close: 110 })],
      },
      currentPrice: 105,
    });
    expect(features.return15m).toBeCloseTo(0.05);
    expect(features.return1h).toBeCloseTo(0.1);
    expect(features.return5m).toBeNull();
  });

  it("detects a breakout above the recent high (excluding the latest candle)", () => {
    const candles = [
      makeCandle({ close: 100, high: 100 }),
      makeCandle({ close: 102, high: 103 }),
      makeCandle({ close: 101, high: 102 }),
      makeCandle({ close: 110, high: 110 }), // breakout candle
    ];
    const features = computeMomentumFeatures({
      candlesByTimeframe: { "15m": candles },
      currentPrice: 110,
    });
    expect(features.brokeAboveRecentHigh).toBe(true);
    expect(features.distanceFromRecentHighPct).toBeCloseTo((110 - 103) / 103);
  });

  it("does not flag a breakout when price is still below the recent high", () => {
    const candles = [makeCandle({ close: 100, high: 120 }), makeCandle({ close: 105, high: 106 })];
    const features = computeMomentumFeatures({
      candlesByTimeframe: { "15m": candles },
      currentPrice: 105,
    });
    expect(features.brokeAboveRecentHigh).toBe(false);
  });

  it("flags VWAP breakout only when VWAP data is present", () => {
    const withVwap = computeMomentumFeatures({
      candlesByTimeframe: { "15m": [makeCandle({ close: 100, vwap: 98 })] },
      currentPrice: 100,
    });
    expect(withVwap.brokeAboveVwap).toBe(true);

    const withoutVwap = computeMomentumFeatures({
      candlesByTimeframe: { "15m": [makeCandle({ close: 100, vwap: null })] },
      currentPrice: 100,
    });
    expect(withoutVwap.brokeAboveVwap).toBeNull();
  });

  it("flags volatility expansion when recent volatility spikes vs baseline", () => {
    const flat = Array.from({ length: 30 }, () => makeCandle({ close: 100 }));
    const spike = [
      ...flat,
      makeCandle({ close: 100 }),
      makeCandle({ close: 130 }),
      makeCandle({ close: 90 }),
      makeCandle({ close: 140 }),
    ];
    const features = computeMomentumFeatures({
      candlesByTimeframe: { "15m": spike },
      currentPrice: 140,
      shortVolatilityLookback: 4,
      baselineVolatilityLookback: 34,
    });
    expect(features.volatilityExpansion).toBe(true);
    expect(features.volatilityCompression).toBe(false);
  });

  it("returns null recovery velocity when there is no meaningful drawdown", () => {
    const candles = Array.from({ length: 5 }, (_, i) => makeCandle({ close: 100 + i, high: 100 + i, low: 100 + i }));
    const features = computeMomentumFeatures({ candlesByTimeframe: { "15m": candles }, currentPrice: 104 });
    expect(features.recoveryVelocity).toBeNull();
  });

  it("computes a positive recovery velocity after a drawdown and bounce", () => {
    const candles = [
      makeCandle({ close: 100, high: 100, low: 99 }),
      makeCandle({ close: 100, high: 100, low: 99 }),
      makeCandle({ close: 80, high: 90, low: 80 }), // trough
      makeCandle({ close: 95, high: 96, low: 94 }), // recovering
    ];
    const features = computeMomentumFeatures({ candlesByTimeframe: { "15m": candles }, currentPrice: 95 });
    expect(features.recoveryVelocity).not.toBeNull();
    expect(features.recoveryVelocity!).toBeGreaterThan(0);
  });
});
