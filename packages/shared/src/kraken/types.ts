// Types mirroring Kraken's public REST and WebSocket v2 API schemas.
// Reference: https://docs.kraken.com/api/docs/rest-api/get-tradable-asset-pairs
//            https://docs.kraken.com/api/docs/websocket-v2/

export interface KrakenAssetPair {
  altname: string;
  wsname?: string;
  base: string;
  quote: string;
  status?: string; // "online", "cancel_only", "post_only", "limit_only", "reduce_only", "delisted"
  pair_decimals: number;
  lot_decimals: number;
  ordermin?: string;
  costmin?: string;
  tick_size?: string;
}

export interface KrakenAssetPairsResponse {
  error: string[];
  result: Record<string, KrakenAssetPair>;
}

/** [<price>, <volume>, <time>, <buy/sell>, <market/limit>, <miscellaneous>, <trade_id>] */
export type KrakenRestTradeTuple = [string, string, number, string, string, string, number];

export interface KrakenTradesResponse {
  error: string[];
  result: Record<string, KrakenRestTradeTuple[] | string> & { last: string };
}

/** [time, open, high, low, close, vwap, volume, count] */
export type KrakenOhlcTuple = [number, string, string, string, string, string, string, number];

export interface KrakenOhlcResponse {
  error: string[];
  result: Record<string, KrakenOhlcTuple[] | number> & { last: number };
}

export interface KrakenDepthLevel {
  0: string; // price
  1: string; // volume
  2: number; // timestamp
}

export interface KrakenDepthResponse {
  error: string[];
  result: Record<
    string,
    {
      asks: KrakenDepthLevel[];
      bids: KrakenDepthLevel[];
    }
  >;
}

export interface KrakenSystemStatusResponse {
  error: string[];
  result: { status: string; timestamp: string };
}

// --- WebSocket v2 ---

export interface KrakenWsTickerMessage {
  channel: "ticker";
  type: "snapshot" | "update";
  data: Array<{
    symbol: string;
    bid: number;
    bid_qty: number;
    ask: number;
    ask_qty: number;
    last: number;
    volume: number;
    vwap: number;
    low: number;
    high: number;
    change: number;
    change_pct: number;
  }>;
}

export interface KrakenWsOhlcMessage {
  channel: "ohlc";
  type: "snapshot" | "update";
  data: Array<{
    symbol: string;
    open: number;
    high: number;
    low: number;
    close: number;
    trades: number;
    volume: number;
    vwap: number;
    interval_begin: string;
    interval: number;
  }>;
}

export interface KrakenWsTradeMessage {
  channel: "trade";
  type: "snapshot" | "update";
  data: Array<{
    symbol: string;
    side: "buy" | "sell";
    price: number;
    qty: number;
    ord_type: string;
    trade_id: number;
    timestamp: string;
  }>;
}

export interface KrakenWsBookMessage {
  channel: "book";
  type: "snapshot" | "update";
  data: Array<{
    symbol: string;
    bids: Array<{ price: number; qty: number }>;
    asks: Array<{ price: number; qty: number }>;
    checksum?: number;
  }>;
}

export type KrakenWsMessage =
  | KrakenWsTickerMessage
  | KrakenWsOhlcMessage
  | KrakenWsTradeMessage
  | KrakenWsBookMessage
  | { channel: "heartbeat" }
  | { channel: "status"; type: string; data: unknown[] }
  | { method: string; success?: boolean; result?: unknown; error?: string };
