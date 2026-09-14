import type { OrderBookFeatures } from "../types.js";

export interface OrderBookLevel {
  price: number;
  volume: number;
}

export interface OrderBookInput {
  bids: OrderBookLevel[]; // sorted descending by price
  asks: OrderBookLevel[]; // sorted ascending by price
  /** Depth band around mid price, in bps, to sum notional within. Default 50 (~25-100bps range midpoint). */
  depthBandBps?: number;
  previousBidDepth?: number | null;
  previousAskDepth?: number | null;
}

export function depthWithinBand(levels: OrderBookLevel[], midPrice: number, bandBps: number, side: "bid" | "ask"): number {
  const bandFraction = bandBps / 10_000;
  const boundary = side === "bid" ? midPrice * (1 - bandFraction) : midPrice * (1 + bandFraction);
  let notional = 0;
  for (const level of levels) {
    const withinBand = side === "bid" ? level.price >= boundary : level.price <= boundary;
    if (!withinBand) break;
    notional += level.price * level.volume;
  }
  return notional;
}

/**
 * Order-book features (spec section 10) used to distinguish a strong breakout
 * with healthy liquidity from a large move on thin liquidity.
 */
export function computeOrderBookFeatures(input: OrderBookInput): OrderBookFeatures {
  const bandBps = input.depthBandBps ?? 50;
  const bestBid = input.bids[0]?.price ?? 0;
  const bestAsk = input.asks[0]?.price ?? 0;
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadBps = midPrice > 0 ? (spread / midPrice) * 10_000 : Number.POSITIVE_INFINITY;

  const bidDepthNotional = depthWithinBand(input.bids, midPrice, bandBps, "bid");
  const askDepthNotional = depthWithinBand(input.asks, midPrice, bandBps, "ask");
  const totalDepth = bidDepthNotional + askDepthNotional;
  const imbalance = totalDepth > 0 ? (bidDepthNotional - askDepthNotional) / totalDepth : 0;

  const depthChangeRatio =
    input.previousBidDepth != null && input.previousAskDepth != null && input.previousBidDepth + input.previousAskDepth > 0
      ? totalDepth / (input.previousBidDepth + input.previousAskDepth)
      : null;

  let liquidityQuality: OrderBookFeatures["liquidityQuality"] = "THIN";
  if (spreadBps <= 15 && totalDepth >= 30_000) liquidityQuality = "STRONG";
  else if (spreadBps <= 40 && totalDepth >= 10_000) liquidityQuality = "MODERATE";

  return {
    spreadBps,
    bidDepthNotional,
    askDepthNotional,
    imbalance,
    depthChangeRatio,
    liquidityQuality,
  };
}
