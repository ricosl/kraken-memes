import { describe, expect, it } from "vitest";
import { checkLiquidity, DEFAULT_LIQUIDITY_THRESHOLDS } from "./liquidity.js";

describe("checkLiquidity", () => {
  it("passes a healthy, liquid market", () => {
    const result = checkLiquidity({
      quoteVolume24h: 1_000_000,
      spreadBps: 10,
      depthNotional: 50_000,
      tradeCount1h: 100,
      marketActive: true,
    });
    expect(result.passed).toBe(true);
    expect(result.rejectionReasons).toEqual([]);
  });

  it("rejects insufficient volume with the correct reason", () => {
    const result = checkLiquidity({
      quoteVolume24h: 1_000,
      spreadBps: 10,
      depthNotional: 50_000,
      tradeCount1h: 100,
      marketActive: true,
    });
    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain("Insufficient volume");
  });

  it("rejects a spread wider than the threshold", () => {
    const result = checkLiquidity({
      quoteVolume24h: 1_000_000,
      spreadBps: 500,
      depthNotional: 50_000,
      tradeCount1h: 100,
      marketActive: true,
    });
    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain("Spread too wide");
  });

  it("rejects insufficient order-book depth", () => {
    const result = checkLiquidity({
      quoteVolume24h: 1_000_000,
      spreadBps: 10,
      depthNotional: 100,
      tradeCount1h: 100,
      marketActive: true,
    });
    expect(result.rejectionReasons).toContain("Insufficient order-book depth");
  });

  it("rejects insufficient trade activity", () => {
    const result = checkLiquidity({
      quoteVolume24h: 1_000_000,
      spreadBps: 10,
      depthNotional: 50_000,
      tradeCount1h: 1,
      marketActive: true,
    });
    expect(result.rejectionReasons).toContain("Insufficient trade activity");
  });

  it("rejects an inactive market and treats missing data as failing, not passing", () => {
    const result = checkLiquidity({
      quoteVolume24h: null,
      spreadBps: null,
      depthNotional: null,
      tradeCount1h: null,
      marketActive: false,
    });
    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toEqual([
      "Market inactive",
      "Missing volume data",
      "Missing order-book data",
      "Missing order-book depth data",
      "Missing trade activity data",
    ]);
  });

  it("respects custom thresholds", () => {
    const strict = { ...DEFAULT_LIQUIDITY_THRESHOLDS, minQuoteVolume24h: 10_000_000 };
    const result = checkLiquidity(
      { quoteVolume24h: 1_000_000, spreadBps: 10, depthNotional: 50_000, tradeCount1h: 100, marketActive: true },
      strict,
    );
    expect(result.passed).toBe(false);
  });
});
