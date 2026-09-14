import type { VolumeFeatures } from "../types.js";

export interface VolumeInput {
  currentVolume: number; // volume over the current decision window (e.g. last 15m)
  baselineVolume: number; // average volume per equivalent window over a longer lookback (e.g. 20-period avg)
  currentTradeCount: number;
  baselineTradeCount: number;
  currentAvgTradeSize: number;
  baselineAvgTradeSize: number;
}

function safeRatio(current: number, baseline: number): number {
  if (baseline <= 0) return current > 0 ? Number.POSITIVE_INFINITY : 1;
  return current / baseline;
}

/**
 * Volume/participation acceleration relative to the coin's own baseline
 * (spec section 13) — never an absolute-volume ranking.
 */
export function computeVolumeFeatures(input: VolumeInput): VolumeFeatures {
  return {
    volumeAccelerationRatio: safeRatio(input.currentVolume, input.baselineVolume),
    tradeCountAccelerationRatio: safeRatio(input.currentTradeCount, input.baselineTradeCount),
    avgTradeSizeChangeRatio: safeRatio(input.currentAvgTradeSize, input.baselineAvgTradeSize),
    // Participation acceleration blends trade-count and size acceleration: a
    // market can accelerate either via more participants or bigger tickets.
    participationAccelerationRatio: safeRatio(
      input.currentTradeCount * input.currentAvgTradeSize,
      input.baselineTradeCount * input.baselineAvgTradeSize,
    ),
  };
}
