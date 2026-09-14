import { describe, expect, it } from "vitest";
import { computeOrderBookFeatures } from "./orderbook.js";

describe("computeOrderBookFeatures", () => {
  it("distinguishes strong liquidity from thin liquidity at the same price", () => {
    const strong = computeOrderBookFeatures({
      bids: [{ price: 99.99, volume: 1000 }, { price: 99.98, volume: 1000 }],
      asks: [{ price: 100.01, volume: 1000 }, { price: 100.02, volume: 1000 }],
    });
    expect(strong.liquidityQuality).toBe("STRONG");
    expect(strong.spreadBps).toBeCloseTo(2, 0);

    const thin = computeOrderBookFeatures({
      bids: [{ price: 99, volume: 1 }],
      asks: [{ price: 101, volume: 1 }],
    });
    expect(thin.liquidityQuality).toBe("THIN");
  });

  it("computes bid/ask imbalance correctly", () => {
    const bidHeavy = computeOrderBookFeatures({
      bids: [{ price: 100, volume: 900 }],
      asks: [{ price: 100.1, volume: 100 }],
    });
    expect(bidHeavy.imbalance).toBeGreaterThan(0.5);

    const askHeavy = computeOrderBookFeatures({
      bids: [{ price: 100, volume: 100 }],
      asks: [{ price: 100.1, volume: 900 }],
    });
    expect(askHeavy.imbalance).toBeLessThan(-0.5);
  });

  it("computes depth change ratio when previous snapshot depth is provided", () => {
    const base = computeOrderBookFeatures({
      bids: [{ price: 100, volume: 100 }],
      asks: [{ price: 100.1, volume: 100 }],
    });
    const doubled = computeOrderBookFeatures({
      bids: [{ price: 100, volume: 200 }],
      asks: [{ price: 100.1, volume: 200 }],
      previousBidDepth: base.bidDepthNotional,
      previousAskDepth: base.askDepthNotional,
    });
    expect(doubled.depthChangeRatio).toBeCloseTo(2, 1);
  });

  it("returns null depth change ratio without prior snapshot data", () => {
    const result = computeOrderBookFeatures({
      bids: [{ price: 100, volume: 100 }],
      asks: [{ price: 100.1, volume: 100 }],
    });
    expect(result.depthChangeRatio).toBeNull();
  });

  it("only sums depth within the configured bps band", () => {
    const result = computeOrderBookFeatures({
      bids: [
        { price: 100, volume: 10 },
        { price: 50, volume: 10_000 }, // way outside the band, should be excluded
      ],
      asks: [{ price: 100.05, volume: 10 }],
      depthBandBps: 50,
    });
    expect(result.bidDepthNotional).toBeCloseTo(1000, 0);
  });
});
