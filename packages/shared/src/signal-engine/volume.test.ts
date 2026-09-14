import { describe, expect, it } from "vitest";
import { computeVolumeFeatures } from "./volume.js";

describe("computeVolumeFeatures", () => {
  it("computes acceleration ratios relative to baseline, not absolute volume", () => {
    const features = computeVolumeFeatures({
      currentVolume: 400,
      baselineVolume: 100,
      currentTradeCount: 80,
      baselineTradeCount: 40,
      currentAvgTradeSize: 5,
      baselineAvgTradeSize: 2.5,
    });
    expect(features.volumeAccelerationRatio).toBeCloseTo(4);
    expect(features.tradeCountAccelerationRatio).toBeCloseTo(2);
    expect(features.avgTradeSizeChangeRatio).toBeCloseTo(2);
    expect(features.participationAccelerationRatio).toBeCloseTo(4);
  });

  it("a market with high absolute volume but no acceleration scores as flat (ratio ~1)", () => {
    const features = computeVolumeFeatures({
      currentVolume: 10_000_000,
      baselineVolume: 10_000_000,
      currentTradeCount: 5000,
      baselineTradeCount: 5000,
      currentAvgTradeSize: 2000,
      baselineAvgTradeSize: 2000,
    });
    expect(features.volumeAccelerationRatio).toBeCloseTo(1);
  });

  it("handles a zero baseline without dividing by zero", () => {
    const features = computeVolumeFeatures({
      currentVolume: 500,
      baselineVolume: 0,
      currentTradeCount: 10,
      baselineTradeCount: 0,
      currentAvgTradeSize: 50,
      baselineAvgTradeSize: 0,
    });
    expect(features.volumeAccelerationRatio).toBe(Number.POSITIVE_INFINITY);
  });
});
