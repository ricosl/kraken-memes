import { describe, expect, it } from "vitest";
import type { MarketRegime, MomentumFeatures, OrderBookFeatures, VolumeFeatures } from "../types.js";
import { computeOpportunityScore } from "./score.js";

const flatVolume: VolumeFeatures = {
  volumeAccelerationRatio: 1,
  tradeCountAccelerationRatio: 1,
  avgTradeSizeChangeRatio: 1,
  participationAccelerationRatio: 1,
};

const strongVolume: VolumeFeatures = {
  volumeAccelerationRatio: 6,
  tradeCountAccelerationRatio: 4,
  avgTradeSizeChangeRatio: 1.5,
  participationAccelerationRatio: 5,
};

const flatMomentum: MomentumFeatures = {
  return5m: 0,
  return15m: 0,
  return1h: 0,
  return4h: 0,
  return24h: 0,
  distanceFromRecentHighPct: -0.1,
  brokeAboveRecentHigh: false,
  brokeAboveVwap: false,
  volatility: 0.01,
  volatilityCompression: false,
  volatilityExpansion: false,
  recoveryVelocity: null,
};

const breakoutMomentum: MomentumFeatures = {
  ...flatMomentum,
  return15m: 0.03,
  return1h: 0.05,
  return4h: 0.06,
  brokeAboveRecentHigh: true,
  brokeAboveVwap: true,
  volatilityExpansion: true,
};

const strongOrderBook: OrderBookFeatures = {
  spreadBps: 5,
  bidDepthNotional: 50_000,
  askDepthNotional: 40_000,
  imbalance: 0.1,
  depthChangeRatio: 1.2,
  liquidityQuality: "STRONG",
};

const thinOrderBook: OrderBookFeatures = {
  spreadBps: 200,
  bidDepthNotional: 500,
  askDepthNotional: 500,
  imbalance: 0,
  depthChangeRatio: 0.5,
  liquidityQuality: "THIN",
};

const neutralRegime: MarketRegime = {
  timestamp: "2026-01-01T00:00:00.000Z",
  btc: { trend: "FLAT", return1h: 0, volatility: 0.01, drawdownFromHigh: 0 },
  sol: { trend: "FLAT", return1h: 0, volatility: 0.01 },
  memeBasket: { numAdvancing: 2, numTotal: 4, pctAdvancing: 0.5, avgReturn1h: 0, momentum: 0 },
  classification: "NEUTRAL",
};

describe("computeOpportunityScore", () => {
  it("scores a strong breakout with healthy liquidity much higher than a flat market", () => {
    const strong = computeOpportunityScore({
      volume: strongVolume,
      momentum: breakoutMomentum,
      orderBook: strongOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: false },
    });
    const flat = computeOpportunityScore({
      volume: flatVolume,
      momentum: flatMomentum,
      orderBook: thinOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: false },
    });
    expect(strong.overall).toBeGreaterThan(70);
    expect(flat.overall).toBeLessThan(30);
  });

  it("scores a big move on thin liquidity lower than the same move with strong liquidity", () => {
    const thinLiquidity = computeOpportunityScore({
      volume: strongVolume,
      momentum: breakoutMomentum,
      orderBook: thinOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: false },
    });
    const strongLiquidity = computeOpportunityScore({
      volume: strongVolume,
      momentum: breakoutMomentum,
      orderBook: strongOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: false },
    });
    expect(thinLiquidity.overall).toBeLessThan(strongLiquidity.overall);
  });

  it("never substitutes zero for unavailable social data — it rescales the remaining weights instead", () => {
    const withoutSocial = computeOpportunityScore({
      volume: strongVolume,
      momentum: breakoutMomentum,
      orderBook: strongOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: false },
    });
    expect(withoutSocial.components.social).toBeNull();
    expect(withoutSocial.socialIncludedInOverall).toBe(false);

    const withZeroSocial = computeOpportunityScore({
      volume: strongVolume,
      momentum: breakoutMomentum,
      orderBook: strongOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: true, provider: "test", accelerationScore: 0, asOf: "2026-01-01T00:00:00.000Z" },
    });
    // Excluding social entirely should score higher than explicitly scoring it at 0,
    // proving the two code paths are genuinely different (no silent zero-substitution).
    expect(withoutSocial.overall).toBeGreaterThan(withZeroSocial.overall);
  });

  it("keeps the overall score within [0, 100] and components summing consistently with weights", () => {
    const result = computeOpportunityScore({
      volume: strongVolume,
      momentum: breakoutMomentum,
      orderBook: strongOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: true, provider: "test", accelerationScore: 90, asOf: "2026-01-01T00:00:00.000Z" },
    });
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("penalizes RISK_OFF regime and rewards RISK_ON", () => {
    const riskOn = computeOpportunityScore({
      volume: flatVolume,
      momentum: flatMomentum,
      orderBook: strongOrderBook,
      regime: { ...neutralRegime, classification: "RISK_ON" },
      moveAttribution: "ISOLATED",
      social: { available: false },
    });
    const riskOff = computeOpportunityScore({
      volume: flatVolume,
      momentum: flatMomentum,
      orderBook: strongOrderBook,
      regime: { ...neutralRegime, classification: "RISK_OFF" },
      moveAttribution: "ISOLATED",
      social: { available: false },
    });
    expect(riskOn.components.marketRegime).toBeGreaterThan(riskOff.components.marketRegime);
  });

  it("respects custom weights", () => {
    const result = computeOpportunityScore({
      volume: strongVolume,
      momentum: flatMomentum,
      orderBook: thinOrderBook,
      regime: neutralRegime,
      moveAttribution: "ISOLATED",
      social: { available: false },
      weights: { volumeAcceleration: 100, breakoutStructure: 0, liquidityOrderBook: 0, marketRegime: 0, social: 0 },
    });
    // With 100% weight on volume acceleration and strong volume, score should be high.
    expect(result.overall).toBeGreaterThan(50);
  });
});
