import type { Candle, MomentumFeatures, Timeframe } from "../types.js";

export interface MomentumInput {
  /** Completed candles only, ascending by timestamp, per timeframe. Never include the forming candle. */
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  currentPrice: number;
  /** How many 15m candles define "recent" for high/breakout detection. Default 96 (24h). */
  recentHighLookback?: number;
  /** How many 15m candles for the short volatility window. Default 8 (2h). */
  shortVolatilityLookback?: number;
  /** How many 15m candles for the baseline volatility window. Default 32 (8h). */
  baselineVolatilityLookback?: number;
  compressionRatio?: number; // short/baseline below this => compression
  expansionRatio?: number; // short/baseline above this => expansion
}

function pctReturn(candles: Candle[] | undefined): number | null {
  if (!candles || candles.length < 2) return null;
  const prev = candles[candles.length - 2]!;
  const last = candles[candles.length - 1]!;
  if (prev.close === 0) return null;
  return (last.close - prev.close) / prev.close;
}

function stdevOfReturns(closes: number[]): number {
  if (closes.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const curr = closes[i]!;
    if (prev !== 0) returns.push((curr - prev) / prev);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

/**
 * Computes recovery velocity: given the most recent peak->trough drawdown in
 * the window, what fraction of that drawdown has been recovered, per hour,
 * since the trough. Returns null when there's no meaningful drawdown to
 * recover from (i.e. price has been monotonically at/near its high).
 */
function computeRecoveryVelocity(candles15m: Candle[], currentPrice: number): number | null {
  if (candles15m.length < 3) return null;

  let peakIdx = 0;
  let peak = candles15m[0]!.high;
  let troughIdx = 0;
  let trough = candles15m[0]!.low;
  let bestDrawdown = 0;
  let bestPeak = peak;
  let bestTrough = trough;
  let bestTroughIdx = 0;

  for (let i = 1; i < candles15m.length; i++) {
    const c = candles15m[i]!;
    if (c.high > peak) {
      peak = c.high;
      peakIdx = i;
      trough = c.low;
      troughIdx = i;
    } else if (c.low < trough) {
      trough = c.low;
      troughIdx = i;
    }
    const drawdown = peak > 0 ? (peak - trough) / peak : 0;
    if (drawdown > bestDrawdown) {
      bestDrawdown = drawdown;
      bestPeak = peak;
      bestTrough = trough;
      bestTroughIdx = troughIdx;
    }
    void peakIdx;
  }

  if (bestDrawdown < 0.01 || bestPeak === bestTrough) return null;
  if (currentPrice <= bestTrough) return 0;

  const recoveredFraction = (currentPrice - bestTrough) / (bestPeak - bestTrough);
  const candlesSinceTrough = candles15m.length - 1 - bestTroughIdx;
  const hoursSinceTrough = (candlesSinceTrough * 15) / 60;
  if (hoursSinceTrough <= 0) return null;

  return recoveredFraction / hoursSinceTrough;
}

export function computeMomentumFeatures(input: MomentumInput): MomentumFeatures {
  const recentHighLookback = input.recentHighLookback ?? 96;
  const shortLookback = input.shortVolatilityLookback ?? 8;
  const baselineLookback = input.baselineVolatilityLookback ?? 32;
  const compressionRatio = input.compressionRatio ?? 0.7;
  const expansionRatio = input.expansionRatio ?? 1.3;

  const c15 = input.candlesByTimeframe["15m"] ?? [];
  const windowed = c15.slice(-recentHighLookback);

  // "Recent high" excludes the very latest candle so a breakout is measured
  // against prior structure, not against itself.
  const priorCandles = windowed.slice(0, -1);
  const recentHigh = priorCandles.length > 0 ? Math.max(...priorCandles.map((c) => c.high)) : (windowed[0]?.high ?? input.currentPrice);

  const distanceFromRecentHighPct = recentHigh > 0 ? (input.currentPrice - recentHigh) / recentHigh : 0;
  const brokeAboveRecentHigh = priorCandles.length > 0 && input.currentPrice > recentHigh;

  const latestCandle = c15[c15.length - 1];
  const brokeAboveVwap = latestCandle?.vwap != null ? input.currentPrice > latestCandle.vwap : null;

  const shortCloses = c15.slice(-shortLookback).map((c) => c.close);
  const baselineCloses = c15.slice(-baselineLookback).map((c) => c.close);
  const shortVol = stdevOfReturns(shortCloses);
  const baselineVol = stdevOfReturns(baselineCloses);

  const volatilityCompression = baselineVol > 0 && shortVol / baselineVol < compressionRatio;
  const volatilityExpansion = baselineVol > 0 && shortVol / baselineVol > expansionRatio;

  return {
    return5m: pctReturn(input.candlesByTimeframe["5m"]),
    return15m: pctReturn(input.candlesByTimeframe["15m"]),
    return1h: pctReturn(input.candlesByTimeframe["1h"]),
    return4h: pctReturn(input.candlesByTimeframe["4h"]),
    return24h: pctReturn(input.candlesByTimeframe["24h"]),
    distanceFromRecentHighPct,
    brokeAboveRecentHigh,
    brokeAboveVwap,
    volatility: shortVol,
    volatilityCompression,
    volatilityExpansion,
    recoveryVelocity: computeRecoveryVelocity(windowed, input.currentPrice),
  };
}
