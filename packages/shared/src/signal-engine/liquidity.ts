import type { LiquidityCheck } from "../types.js";

export interface LiquidityThresholds {
  minQuoteVolume24h: number;
  maxSpreadBps: number;
  minDepthNotional: number; // within configured bps band, both sides summed
  minTradeCount1h: number;
}

export const DEFAULT_LIQUIDITY_THRESHOLDS: LiquidityThresholds = {
  minQuoteVolume24h: 250_000, // USD
  maxSpreadBps: 50, // 0.50%
  minDepthNotional: 15_000, // USD, bid+ask combined within ~50bps
  minTradeCount1h: 20,
};

export interface LiquidityInput {
  quoteVolume24h: number | null;
  spreadBps: number | null;
  depthNotional: number | null;
  tradeCount1h: number | null;
  marketActive: boolean;
}

/**
 * Hard liquidity gate (spec section 11). A market that fails this can never
 * become a high-priority setup, regardless of score. Missing inputs are
 * treated as failing (never assumed to pass) and reported as their own reason.
 */
export function checkLiquidity(input: LiquidityInput, thresholds: LiquidityThresholds = DEFAULT_LIQUIDITY_THRESHOLDS): LiquidityCheck {
  const reasons: string[] = [];

  if (!input.marketActive) reasons.push("Market inactive");

  if (input.quoteVolume24h === null) reasons.push("Missing volume data");
  else if (input.quoteVolume24h < thresholds.minQuoteVolume24h) reasons.push("Insufficient volume");

  if (input.spreadBps === null) reasons.push("Missing order-book data");
  else if (input.spreadBps > thresholds.maxSpreadBps) reasons.push("Spread too wide");

  if (input.depthNotional === null) reasons.push("Missing order-book depth data");
  else if (input.depthNotional < thresholds.minDepthNotional) reasons.push("Insufficient order-book depth");

  if (input.tradeCount1h === null) reasons.push("Missing trade activity data");
  else if (input.tradeCount1h < thresholds.minTradeCount1h) reasons.push("Insufficient trade activity");

  return {
    passed: reasons.length === 0,
    rejectionReasons: reasons,
    quoteVolume24h: input.quoteVolume24h ?? 0,
    spreadBps: input.spreadBps ?? Number.POSITIVE_INFINITY,
    depthNotional: input.depthNotional ?? 0,
    tradeCount1h: input.tradeCount1h ?? 0,
  };
}
