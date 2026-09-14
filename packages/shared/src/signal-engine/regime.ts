import type { MarketRegime, MoveAttribution } from "../types.js";

export interface RegimeInput {
  timestamp: string;
  btcReturn1h: number;
  btcVolatility: number;
  btcHigh24h: number;
  btcCurrentPrice: number;
  solReturn1h: number;
  solVolatility: number;
  memeBasketReturns1h: number[]; // one entry per meme coin in the basket
}

function trendFromReturn(return1h: number): "UP" | "DOWN" | "FLAT" {
  if (return1h > 0.005) return "UP";
  if (return1h < -0.005) return "DOWN";
  return "FLAT";
}

/**
 * Classifies the broader market environment (spec section 14). Meme setups
 * are evaluated in this context so a rising tide isn't mistaken for
 * coin-specific strength, and vice versa.
 */
export function computeMarketRegime(input: RegimeInput): MarketRegime {
  const drawdownFromHigh = input.btcHigh24h > 0 ? (input.btcCurrentPrice - input.btcHigh24h) / input.btcHigh24h : 0;

  const numAdvancing = input.memeBasketReturns1h.filter((r) => r > 0).length;
  const numTotal = input.memeBasketReturns1h.length;
  const pctAdvancing = numTotal > 0 ? numAdvancing / numTotal : 0;
  const avgReturn1h = numTotal > 0 ? input.memeBasketReturns1h.reduce((a, b) => a + b, 0) / numTotal : 0;

  let classification: MarketRegime["classification"] = "NEUTRAL";
  if (input.btcReturn1h > 0.005 && pctAdvancing > 0.6 && drawdownFromHigh > -0.03) classification = "RISK_ON";
  else if (input.btcReturn1h < -0.01 || pctAdvancing < 0.35 || drawdownFromHigh < -0.06) classification = "RISK_OFF";

  return {
    timestamp: input.timestamp,
    btc: {
      trend: trendFromReturn(input.btcReturn1h),
      return1h: input.btcReturn1h,
      volatility: input.btcVolatility,
      drawdownFromHigh,
    },
    sol: {
      trend: trendFromReturn(input.solReturn1h),
      return1h: input.solReturn1h,
      volatility: input.solVolatility,
    },
    memeBasket: {
      numAdvancing,
      numTotal,
      pctAdvancing,
      avgReturn1h,
      momentum: avgReturn1h * pctAdvancing,
    },
    classification,
  };
}

/**
 * Classifies whether a candidate's move looks broad-market-driven,
 * meme-sector-driven, or isolated to the coin itself (spec section 14).
 */
export function classifyMoveAttribution(coinReturn1h: number, regime: MarketRegime): MoveAttribution {
  if (coinReturn1h === 0) return "ISOLATED";

  const btcContribution = Math.abs(regime.btc.return1h) / Math.abs(coinReturn1h);
  const basketContribution = Math.abs(regime.memeBasket.avgReturn1h) / Math.abs(coinReturn1h);

  if (btcContribution > 0.5 && Math.sign(regime.btc.return1h) === Math.sign(coinReturn1h)) return "BROAD_MARKET_DRIVEN";
  if (basketContribution > 0.5 && Math.sign(regime.memeBasket.avgReturn1h) === Math.sign(coinReturn1h)) return "MEME_SECTOR_DRIVEN";
  return "ISOLATED";
}
