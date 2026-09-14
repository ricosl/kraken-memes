import type { KrakenRestClient } from "@kraken-memes/shared";
import { logger } from "@kraken-memes/core";
import { computeOrderBookFeatures } from "@kraken-memes/shared";
import { getLatestOrderBookSnapshot, insertCandles, insertOrderBookSnapshot, insertTrades } from "./repository.js";

const INTERVAL_BY_TIMEFRAME = { "15m": 15, "1h": 60, "4h": 240, "24h": 1440 } as const;

/**
 * Fetches OHLC for one market/timeframe and persists only *completed*
 * candles — the currently-forming candle (openTime + interval > now) is
 * always excluded, per spec section 8: decisions happen after a completed
 * 15-minute candle, never on a still-forming one.
 */
export async function ingestOhlc(restClient: KrakenRestClient, marketId: string, krakenPairName: string, timeframe: keyof typeof INTERVAL_BY_TIMEFRAME): Promise<number> {
  const interval = INTERVAL_BY_TIMEFRAME[timeframe];
  const result = await restClient.ohlc(krakenPairName, interval);
  const seriesKey = Object.keys(result).find((k) => k !== "last");
  const tuples = seriesKey ? (result[seriesKey] as unknown as Array<[number, string, string, string, string, string, string, number]>) : [];

  const now = Date.now();
  const completed = tuples.filter(([openTimeSec]) => (openTimeSec + interval * 60) * 1000 <= now);

  const rows = completed.map(([openTimeSec, open, high, low, close, vwap, volume, count]) => ({
    marketId,
    timeframe,
    timestamp: new Date(openTimeSec * 1000),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
    vwap: Number(vwap),
    tradeCount: count,
  }));

  await insertCandles(rows);
  return rows.length;
}

/** Fetches the current order book and persists a snapshot, tracking depth change vs the prior snapshot. */
export async function ingestOrderBook(restClient: KrakenRestClient, marketId: string, krakenPairName: string): Promise<void> {
  const result = await restClient.depth(krakenPairName, 50);
  const bookKey = Object.keys(result)[0];
  const book = bookKey ? result[bookKey] : undefined;
  if (!book) return;

  const bids = book.bids.map((level) => ({ price: Number(level[0]), volume: Number(level[1]) }));
  const asks = book.asks.map((level) => ({ price: Number(level[0]), volume: Number(level[1]) }));

  const previous = await getLatestOrderBookSnapshot(marketId);
  const features = computeOrderBookFeatures({
    bids,
    asks,
    previousBidDepth: previous?.bidDepth ?? null,
    previousAskDepth: previous?.askDepth ?? null,
  });

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;

  await insertOrderBookSnapshot({
    marketId,
    timestamp: new Date(),
    bestBid,
    bestAsk,
    spread: bestAsk - bestBid,
    spreadBps: features.spreadBps,
    bidDepth: features.bidDepthNotional,
    askDepth: features.askDepthNotional,
    imbalance: features.imbalance,
  });
}

/** Fetches recent trades since the given Kraken trade-id cursor and persists them, returning the new cursor. */
export async function ingestTrades(restClient: KrakenRestClient, marketId: string, krakenPairName: string, sinceCursor: string | null): Promise<string | null> {
  const result = await restClient.trades(krakenPairName, sinceCursor ?? undefined);
  const seriesKey = Object.keys(result).find((k) => k !== "last");
  const tuples = seriesKey ? (result[seriesKey] as unknown as Array<[string, string, number, string, string, string, number]>) : [];

  const rows = tuples.map(([price, volume, time, side]) => ({
    marketId,
    timestamp: new Date(time * 1000),
    price: Number(price),
    volume: Number(volume),
    aggressor: side === "b" ? ("BUY" as const) : side === "s" ? ("SELL" as const) : ("UNKNOWN" as const),
  }));

  await insertTrades(rows);
  return result.last ?? sinceCursor;
}

export async function ingestMarketData(restClient: KrakenRestClient, marketId: string, krakenPairName: string, tradeCursor: string | null): Promise<{ candlesIngested: number; newTradeCursor: string | null }> {
  try {
    const [candles15m, candles1h, candles4h, candles24h] = await Promise.all([
      ingestOhlc(restClient, marketId, krakenPairName, "15m"),
      ingestOhlc(restClient, marketId, krakenPairName, "1h"),
      ingestOhlc(restClient, marketId, krakenPairName, "4h"),
      ingestOhlc(restClient, marketId, krakenPairName, "24h"),
    ]);
    await ingestOrderBook(restClient, marketId, krakenPairName);
    const newTradeCursor = await ingestTrades(restClient, marketId, krakenPairName, tradeCursor);

    return { candlesIngested: candles15m + candles1h + candles4h + candles24h, newTradeCursor };
  } catch (err) {
    logger.error("market_data_ingestion_failed", { marketId, krakenPairName, error: String(err) });
    return { candlesIngested: 0, newTradeCursor: tradeCursor };
  }
}
