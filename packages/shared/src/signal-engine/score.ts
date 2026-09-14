import {
  DEFAULT_SCORE_WEIGHTS,
  type ComponentScores,
  type MarketRegime,
  type MomentumFeatures,
  type MoveAttribution,
  type OpportunityScore,
  type OrderBookFeatures,
  type ScoreWeights,
  type SocialSignal,
  type VolumeFeatures,
} from "../types.js";

/** Clamp to [0, 100]. */
function clamp100(x: number): number {
  return Math.max(0, Math.min(100, x));
}

/**
 * Maps a "how many multiples of baseline" ratio onto 0-100 using a log scale,
 * so 1x (no acceleration) -> 0, 2x -> ~40, 4x -> ~70, 8x+ -> 100.
 */
function accelerationToScore(ratio: number, saturateAt = 8): number {
  if (!Number.isFinite(ratio) || ratio <= 1) return 0;
  const capped = Math.min(ratio, saturateAt);
  return clamp100((Math.log2(capped) / Math.log2(saturateAt)) * 100);
}

export function scoreVolumeAcceleration(volume: VolumeFeatures): number {
  const volumeScore = accelerationToScore(volume.volumeAccelerationRatio);
  const tradeCountScore = accelerationToScore(volume.tradeCountAccelerationRatio);
  const participationScore = accelerationToScore(volume.participationAccelerationRatio);
  // Volume itself matters most; trade count and participation confirm it's real activity, not one whale print.
  return clamp100(volumeScore * 0.5 + tradeCountScore * 0.25 + participationScore * 0.25);
}

export function scoreBreakoutStructure(momentum: MomentumFeatures): number {
  let score = 0;
  if (momentum.brokeAboveRecentHigh) score += 40;
  if (momentum.brokeAboveVwap === true) score += 15;
  if (momentum.volatilityExpansion) score += 15;
  if (momentum.volatilityCompression) score += 5; // compression just before a move is a mild positive setup signal

  // Reward positive, accelerating short-term momentum without over-rewarding
  // a single-candle spike: blend the 15m/1h/4h returns.
  const returns = [momentum.return15m, momentum.return1h, momentum.return4h].filter((r): r is number => r !== null);
  if (returns.length > 0) {
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    score += clamp100(avgReturn * 400); // +5% average return contributes ~20 points, capped by overall clamp
  }

  if (momentum.recoveryVelocity !== null && momentum.recoveryVelocity > 0) {
    score += clamp100(momentum.recoveryVelocity * 20);
  }

  return clamp100(score);
}

export function scoreLiquidityOrderBook(orderBook: OrderBookFeatures): number {
  let score = 0;
  if (orderBook.liquidityQuality === "STRONG") score += 55;
  else if (orderBook.liquidityQuality === "MODERATE") score += 30;

  // Tighter spread is better; 0bps -> full marks, maxSpread(50bps) -> 0.
  score += clamp100((1 - orderBook.spreadBps / 50) * 25);

  // A positive (bid-heavy) imbalance modestly supports upside continuation.
  score += clamp100(orderBook.imbalance * 20);

  if (orderBook.depthChangeRatio !== null && orderBook.depthChangeRatio >= 1) {
    score += 10; // liquidity is growing into the move, not draining
  }

  return clamp100(score);
}

export function scoreMarketRegime(regime: MarketRegime, moveAttribution: MoveAttribution): number {
  let score = 50; // neutral baseline
  if (regime.classification === "RISK_ON") score += 25;
  else if (regime.classification === "RISK_OFF") score -= 30;

  // Isolated (coin-specific) strength in a neutral/risk-on tape is the
  // highest-conviction pattern; broad-market-driven moves are less
  // differentiated and more likely to reverse with the market.
  if (moveAttribution === "ISOLATED") score += 10;
  else if (moveAttribution === "BROAD_MARKET_DRIVEN") score -= 10;

  return clamp100(score);
}

/** Returns null score (not zero) when social data is unavailable. */
export function scoreSocial(social: SocialSignal): number | null {
  if (!social.available) return null;
  return clamp100(social.accelerationScore);
}

export interface ScoreInput {
  volume: VolumeFeatures;
  momentum: MomentumFeatures;
  orderBook: OrderBookFeatures;
  regime: MarketRegime;
  moveAttribution: MoveAttribution;
  social: SocialSignal;
  weights?: ScoreWeights;
}

/**
 * Transparent, explainable 0-100 opportunity score (spec section 16).
 * This is NOT a probability — it is a weighted composite of rule-based
 * component scores. Probability claims require statistical calibration and
 * out-of-sample validation, which V1 does not attempt.
 */
export function computeOpportunityScore(input: ScoreInput): OpportunityScore {
  const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;

  const volumeScore = scoreVolumeAcceleration(input.volume);
  const breakoutScore = scoreBreakoutStructure(input.momentum);
  const liquidityScore = scoreLiquidityOrderBook(input.orderBook);
  const regimeScore = scoreMarketRegime(input.regime, input.moveAttribution);
  const socialScore = scoreSocial(input.social);

  const components: ComponentScores = {
    volumeAcceleration: (volumeScore / 100) * weights.volumeAcceleration,
    breakoutStructure: (breakoutScore / 100) * weights.breakoutStructure,
    liquidityOrderBook: (liquidityScore / 100) * weights.liquidityOrderBook,
    marketRegime: (regimeScore / 100) * weights.marketRegime,
    social: socialScore === null ? null : (socialScore / 100) * weights.social,
  };

  const socialIncludedInOverall = components.social !== null;

  // When social is unavailable, its weight is explicitly excluded and the
  // remaining weights are rescaled so the score still spans 0-100 — we never
  // silently substitute a zero for missing social data.
  const usedWeight =
    weights.volumeAcceleration +
    weights.breakoutStructure +
    weights.liquidityOrderBook +
    weights.marketRegime +
    (socialIncludedInOverall ? weights.social : 0);

  const rawTotal = components.volumeAcceleration + components.breakoutStructure + components.liquidityOrderBook + components.marketRegime + (components.social ?? 0);

  const overall = usedWeight > 0 ? clamp100((rawTotal / usedWeight) * 100) : 0;

  return {
    overall,
    components,
    weights,
    socialIncludedInOverall,
  };
}
