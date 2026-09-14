import { describe, expect, it } from "vitest";
import { classifyMoveAttribution, computeMarketRegime } from "./regime.js";

const baseInput = {
  timestamp: "2026-01-01T00:00:00.000Z",
  btcReturn1h: 0,
  btcVolatility: 0.01,
  btcHigh24h: 100,
  btcCurrentPrice: 100,
  solReturn1h: 0,
  solVolatility: 0.01,
  memeBasketReturns1h: [0, 0, 0],
};

describe("computeMarketRegime", () => {
  it("classifies RISK_ON when BTC is up and most of the meme basket is advancing", () => {
    const regime = computeMarketRegime({
      ...baseInput,
      btcReturn1h: 0.01,
      memeBasketReturns1h: [0.02, 0.03, 0.01, -0.01],
    });
    expect(regime.classification).toBe("RISK_ON");
    expect(regime.memeBasket.pctAdvancing).toBeCloseTo(0.75);
  });

  it("classifies RISK_OFF when BTC drops meaningfully", () => {
    const regime = computeMarketRegime({ ...baseInput, btcReturn1h: -0.02 });
    expect(regime.classification).toBe("RISK_OFF");
  });

  it("classifies RISK_OFF on a large drawdown from the 24h high even without a sharp 1h drop", () => {
    const regime = computeMarketRegime({ ...baseInput, btcCurrentPrice: 90, btcHigh24h: 100 });
    expect(regime.classification).toBe("RISK_OFF");
  });

  it("classifies NEUTRAL otherwise", () => {
    const regime = computeMarketRegime({ ...baseInput, memeBasketReturns1h: [0.01, -0.01] });
    expect(regime.classification).toBe("NEUTRAL");
  });
});

describe("classifyMoveAttribution", () => {
  it("attributes a coin move to broad market when it tracks BTC's direction and magnitude", () => {
    const regime = computeMarketRegime({ ...baseInput, btcReturn1h: 0.05, memeBasketReturns1h: [0.01] });
    expect(classifyMoveAttribution(0.06, regime)).toBe("BROAD_MARKET_DRIVEN");
  });

  it("attributes a coin move to the meme sector when the basket is moving similarly", () => {
    const regime = computeMarketRegime({ ...baseInput, btcReturn1h: 0, memeBasketReturns1h: [0.05, 0.06, 0.04] });
    expect(classifyMoveAttribution(0.06, regime)).toBe("MEME_SECTOR_DRIVEN");
  });

  it("attributes a large isolated move to the coin itself", () => {
    const regime = computeMarketRegime({ ...baseInput, btcReturn1h: 0.001, memeBasketReturns1h: [0.001, -0.001] });
    expect(classifyMoveAttribution(0.15, regime)).toBe("ISOLATED");
  });
});
