import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP_PARAMETERS } from "../types.js";
import { computeSetupLevels, evaluatePriceOutcome, DEFAULT_SCORE_THRESHOLDS, scoreToTier } from "./setup.js";
import type { OpportunityScore } from "../types.js";

function score(overall: number): OpportunityScore {
  return {
    overall,
    components: { volumeAcceleration: 0, breakoutStructure: 0, liquidityOrderBook: 0, marketRegime: 0, social: null },
    weights: { volumeAcceleration: 35, breakoutStructure: 25, liquidityOrderBook: 20, marketRegime: 10, social: 10 },
    socialIncludedInOverall: false,
  };
}

describe("computeSetupLevels", () => {
  it("computes +7% target and -3% invalidation from the reference price using default params", () => {
    const levels = computeSetupLevels(100, "2026-01-01T00:00:00.000Z", DEFAULT_SETUP_PARAMETERS);
    expect(levels.targetPrice).toBeCloseTo(107);
    expect(levels.invalidationPrice).toBeCloseTo(97);
  });

  it("computes expiry as reference timestamp + observation window", () => {
    const levels = computeSetupLevels(100, "2026-01-01T00:00:00.000Z", DEFAULT_SETUP_PARAMETERS);
    expect(levels.expiresAt).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("evaluatePriceOutcome", () => {
  it("detects target hit", () => {
    expect(evaluatePriceOutcome(108, 107, 97)).toBe("TARGET_HIT");
  });
  it("detects invalidation hit", () => {
    expect(evaluatePriceOutcome(96, 107, 97)).toBe("INVALIDATED_HIT");
  });
  it("returns NONE while price is between the two levels", () => {
    expect(evaluatePriceOutcome(102, 107, 97)).toBe("NONE");
  });
});

describe("scoreToTier", () => {
  it("maps scores to tiers using default thresholds", () => {
    expect(scoreToTier(score(80), DEFAULT_SCORE_THRESHOLDS)).toBe("HIGH_PRIORITY");
    expect(scoreToTier(score(65), DEFAULT_SCORE_THRESHOLDS)).toBe("QUALIFIED");
    expect(scoreToTier(score(45), DEFAULT_SCORE_THRESHOLDS)).toBe("WATCH");
    expect(scoreToTier(score(10), DEFAULT_SCORE_THRESHOLDS)).toBe("BELOW_WATCH");
  });
});
