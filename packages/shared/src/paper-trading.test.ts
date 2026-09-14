import { describe, expect, it } from "vitest";
import { closePaperTrade, DEFAULT_PAPER_TRADE_COSTS, updateExcursion } from "./paper-trading.js";

describe("closePaperTrade", () => {
  it("computes a positive net P/L for a winning trade after fees and slippage", () => {
    const result = closePaperTrade({
      entryPrice: 100,
      rawExitPrice: 107,
      positionSizeUsd: 1000,
      outcome: "TARGET_HIT",
    });
    expect(result.realizedPnlUsd).toBeGreaterThan(0);
    // Gross would be +7% = $70; fees+slippage should eat into it but not eliminate it.
    expect(result.realizedPnlUsd).toBeLessThan(70);
  });

  it("computes a negative net P/L for a losing trade, worse than the raw move due to costs", () => {
    const result = closePaperTrade({
      entryPrice: 100,
      rawExitPrice: 97,
      positionSizeUsd: 1000,
      outcome: "INVALIDATED",
    });
    expect(result.realizedPnlUsd).toBeLessThan(-30); // raw -3% = -$30, costs make it worse
  });

  it("a trade with zero fees and slippage matches the raw percentage move exactly", () => {
    const result = closePaperTrade({
      entryPrice: 100,
      rawExitPrice: 110,
      positionSizeUsd: 1000,
      outcome: "TARGET_HIT",
      costs: { feesBps: 0, slippageBps: 0 },
    });
    expect(result.realizedPnlUsd).toBeCloseTo(100, 5);
    expect(result.realizedPnlPct).toBeCloseTo(0.1, 5);
  });

  it("default cost model is Kraken-realistic (non-zero fees and slippage)", () => {
    expect(DEFAULT_PAPER_TRADE_COSTS.feesBps).toBeGreaterThan(0);
    expect(DEFAULT_PAPER_TRADE_COSTS.slippageBps).toBeGreaterThan(0);
  });
});

describe("updateExcursion", () => {
  it("tracks the running maximum favorable and adverse excursion", () => {
    let excursion = { mfePct: 0, maePct: 0 };
    excursion = updateExcursion(100, 105, excursion.mfePct, excursion.maePct);
    expect(excursion.mfePct).toBeCloseTo(0.05);
    excursion = updateExcursion(100, 98, excursion.mfePct, excursion.maePct);
    expect(excursion.mfePct).toBeCloseTo(0.05); // unchanged, still the best so far
    expect(excursion.maePct).toBeCloseTo(-0.02);
    excursion = updateExcursion(100, 110, excursion.mfePct, excursion.maePct);
    expect(excursion.mfePct).toBeCloseTo(0.1);
  });
});
