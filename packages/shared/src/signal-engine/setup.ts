import type { OpportunityScore, SetupParameters } from "../types.js";
import type { PriceOutcome, ScoreTier } from "./state-machine.js";

export interface ScoreThresholds {
  watchScore: number; // minimum score to leave BELOW_WATCH and become WATCH-worthy of tracking
  qualifyScore: number;
  highPriorityScore: number;
}

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
  watchScore: 40,
  qualifyScore: 60,
  highPriorityScore: 75,
};

export function scoreToTier(score: OpportunityScore, thresholds: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS): ScoreTier {
  if (score.overall >= thresholds.highPriorityScore) return "HIGH_PRIORITY";
  if (score.overall >= thresholds.qualifyScore) return "QUALIFIED";
  if (score.overall >= thresholds.watchScore) return "WATCH";
  return "BELOW_WATCH";
}

/** Computes target/invalidation price levels and expiry for a new signal, from the reference price. */
export function computeSetupLevels(referencePrice: number, timestamp: string, params: SetupParameters) {
  const targetPrice = referencePrice * (1 + params.targetPct);
  const invalidationPrice = referencePrice * (1 + params.invalidationPct);
  const expiresAt = new Date(new Date(timestamp).getTime() + params.observationWindowHours * 60 * 60 * 1000).toISOString();
  return { targetPrice, invalidationPrice, expiresAt };
}

/** Given a signal's stored levels and the latest price, determines whether target or invalidation has been hit. */
export function evaluatePriceOutcome(currentPrice: number, targetPrice: number, invalidationPrice: number): PriceOutcome {
  if (currentPrice >= targetPrice) return "TARGET_HIT";
  if (currentPrice <= invalidationPrice) return "INVALIDATED_HIT";
  return "NONE";
}
