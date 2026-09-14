import type { PaperTradeOutcome } from "./types.js";

export interface PaperTradeCostModel {
  feesBps: number; // round-trip-per-side taker fee, in bps
  slippageBps: number; // assumed adverse slippage on entry/exit, in bps
}

export const DEFAULT_PAPER_TRADE_COSTS: PaperTradeCostModel = {
  feesBps: 26, // Kraken's typical taker fee for lower-volume tiers (~0.26%)
  slippageBps: 10,
};

/** Applies realistic entry slippage + fees to a raw signal price to get a simulated fill price. */
export function simulateEntryFill(rawPrice: number, costs: PaperTradeCostModel): number {
  const slippageFactor = 1 + costs.slippageBps / 10_000;
  return rawPrice * slippageFactor;
}

export function simulateExitFill(rawPrice: number, costs: PaperTradeCostModel): number {
  const slippageFactor = 1 - costs.slippageBps / 10_000;
  return rawPrice * slippageFactor;
}

export interface PaperTradeResult {
  exitPrice: number;
  realizedPnlUsd: number;
  realizedPnlPct: number;
  outcome: PaperTradeOutcome;
}

/**
 * Computes the realized result of a closed paper trade, including entry and
 * exit fees + slippage (spec section 28) so simulated P/L isn't fantasy.
 */
export function closePaperTrade(params: {
  entryPrice: number;
  rawExitPrice: number;
  positionSizeUsd: number;
  outcome: PaperTradeOutcome;
  costs?: PaperTradeCostModel;
}): PaperTradeResult {
  const costs = params.costs ?? DEFAULT_PAPER_TRADE_COSTS;
  const entryFill = simulateEntryFill(params.entryPrice, costs);
  const exitFill = simulateExitFill(params.rawExitPrice, costs);

  const quantity = params.positionSizeUsd / entryFill;
  const grossPnl = quantity * (exitFill - entryFill);

  const entryFee = params.positionSizeUsd * (costs.feesBps / 10_000);
  const exitFee = quantity * exitFill * (costs.feesBps / 10_000);
  const netPnl = grossPnl - entryFee - exitFee;

  return {
    exitPrice: exitFill,
    realizedPnlUsd: netPnl,
    realizedPnlPct: netPnl / params.positionSizeUsd,
    outcome: params.outcome,
  };
}

/** Tracks running max favorable/adverse excursion as new prices arrive during an open paper trade. */
export function updateExcursion(
  entryPrice: number,
  currentPrice: number,
  prevMfePct: number,
  prevMaePct: number,
): { mfePct: number; maePct: number } {
  const movePct = (currentPrice - entryPrice) / entryPrice;
  return {
    mfePct: Math.max(prevMfePct, movePct),
    maePct: Math.min(prevMaePct, movePct),
  };
}
