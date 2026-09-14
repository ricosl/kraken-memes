import { eq } from "drizzle-orm";
import { db, markets } from "@kraken-memes/core";
import type { RegimeInput } from "@kraken-memes/shared";
import { getRecentCandles } from "./repository.js";

async function findMarketId(baseAsset: string, quoteAsset: string): Promise<string | null> {
  const row = await db.query.markets.findFirst({ where: eq(markets.baseAsset, baseAsset) });
  return row && row.quoteAsset === quoteAsset ? row.id : null;
}

function return1hAndVolatility(closes: number[]): { return1h: number; volatility: number } {
  if (closes.length < 2) return { return1h: 0, volatility: 0 };
  const first = closes[0]!;
  const last = closes[closes.length - 1]!;
  const return1h = first !== 0 ? (last - first) / first : 0;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    if (prev !== 0) returns.push((closes[i]! - prev) / prev);
  }
  const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0 ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length : 0;
  return { return1h, volatility: Math.sqrt(variance) };
}

/**
 * Builds the broader-market regime input (spec section 14) from persisted
 * BTC/USD and SOL/USD candles plus the meme basket's own 1h returns. When
 * BTC/SOL data isn't yet available (e.g. a cold start, or Kraken
 * unreachable), this degrades to a neutral (all-zero) reading rather than
 * fabricating a trend — the resulting regime classification will simply be
 * NEUTRAL until real data arrives.
 */
export async function buildRegimeInput(quoteAsset: string, memeBasketReturns1h: number[], now: string): Promise<RegimeInput> {
  const [btcMarketId, solMarketId] = await Promise.all([findMarketId("BTC", quoteAsset), findMarketId("SOL", quoteAsset)]);

  const [btcCandles1h, btcCandles24h, solCandles1h] = await Promise.all([
    btcMarketId ? getRecentCandles(btcMarketId, "1h", 2) : Promise.resolve([]),
    btcMarketId ? getRecentCandles(btcMarketId, "24h", 2) : Promise.resolve([]),
    solMarketId ? getRecentCandles(solMarketId, "1h", 2) : Promise.resolve([]),
  ]);

  const btc = return1hAndVolatility(btcCandles1h.map((c) => c.close));
  const sol = return1hAndVolatility(solCandles1h.map((c) => c.close));

  const btcCurrentPrice = btcCandles1h.at(-1)?.close ?? 0;
  const btcHigh24h = btcCandles24h.length > 0 ? Math.max(...btcCandles24h.map((c) => c.high)) : btcCurrentPrice;

  return {
    timestamp: now,
    btcReturn1h: btc.return1h,
    btcVolatility: btc.volatility,
    btcHigh24h,
    btcCurrentPrice,
    solReturn1h: sol.return1h,
    solVolatility: sol.volatility,
    memeBasketReturns1h,
  };
}
