// Core domain types shared between the worker, server, and web app.
// These describe the persistent shape of the system's data, independent of
// how any one app stores or transmits it.

export type Timeframe = "5m" | "15m" | "1h" | "4h" | "24h";

export type MemeClassification =
  | "AUTO_CLASSIFIED"
  | "INCLUDED"
  | "EXCLUDED"
  | "PENDING_REVIEW";

/** A Kraken-listed spot market, as discovered from Kraken's AssetPairs endpoint. */
export interface Market {
  id: string;
  /** Kraken's own wsname/altname pair symbol, e.g. "DOGE/USD" */
  symbol: string;
  /** Kraken's REST pair name, e.g. "XDGUSD" — needed to call REST endpoints */
  krakenPairName: string;
  baseAsset: string;
  quoteAsset: string;
  active: boolean;
  memeClassification: MemeClassification;
  firstSeen: string; // ISO timestamp of when we first observed this pair
  priceDecimals: number;
  quantityDecimals: number;
  minOrderSize: number;
  /** Reason this market currently fails eligibility, if any. Null when eligible. */
  ineligibleReason: string | null;
}

export interface Candle {
  marketId: string;
  timeframe: Timeframe;
  timestamp: string; // ISO, candle open time; only ever a *completed* candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
  tradeCount: number | null;
}

export type TradeAggressor = "BUY" | "SELL" | "UNKNOWN";

export interface Trade {
  marketId: string;
  timestamp: string;
  price: number;
  volume: number;
  aggressor: TradeAggressor;
}

export interface OrderBookSnapshot {
  marketId: string;
  timestamp: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadBps: number;
  bidDepth: number; // notional depth within configured bps band
  askDepth: number;
  imbalance: number; // (bidDepth - askDepth) / (bidDepth + askDepth), range [-1, 1]
}

/** Result of the hard liquidity gate. A market failing this can never become high-priority. */
export interface LiquidityCheck {
  passed: boolean;
  rejectionReasons: string[]; // e.g. "Insufficient volume", "Spread too wide"
  quoteVolume24h: number;
  spreadBps: number;
  depthNotional: number;
  tradeCount1h: number;
}

export interface MomentumFeatures {
  return5m: number | null;
  return15m: number | null;
  return1h: number | null;
  return4h: number | null;
  return24h: number | null;
  distanceFromRecentHighPct: number; // negative = below recent high
  brokeAboveRecentHigh: boolean;
  brokeAboveVwap: boolean | null; // null when VWAP unavailable
  volatility: number; // stdev of returns over lookback, as a fraction
  volatilityCompression: boolean;
  volatilityExpansion: boolean;
  recoveryVelocity: number | null; // fraction of drawdown recovered per hour
}

export interface VolumeFeatures {
  volumeAccelerationRatio: number; // current / baseline
  tradeCountAccelerationRatio: number;
  avgTradeSizeChangeRatio: number;
  participationAccelerationRatio: number;
}

export interface OrderBookFeatures {
  spreadBps: number;
  bidDepthNotional: number;
  askDepthNotional: number;
  imbalance: number;
  depthChangeRatio: number | null; // vs prior snapshot, null if unavailable
  liquidityQuality: "STRONG" | "MODERATE" | "THIN";
}

export type MarketRegimeClass = "RISK_ON" | "NEUTRAL" | "RISK_OFF";
export type MoveAttribution = "BROAD_MARKET_DRIVEN" | "MEME_SECTOR_DRIVEN" | "ISOLATED";

export interface MarketRegime {
  timestamp: string;
  btc: { trend: "UP" | "DOWN" | "FLAT"; return1h: number; volatility: number; drawdownFromHigh: number };
  sol: { trend: "UP" | "DOWN" | "FLAT"; return1h: number; volatility: number };
  memeBasket: { numAdvancing: number; numTotal: number; pctAdvancing: number; avgReturn1h: number; momentum: number };
  classification: MarketRegimeClass;
}

/** Social signal is optional and must never be fabricated. */
export interface SocialFeatures {
  available: false;
}
export interface SocialFeaturesAvailable {
  available: true;
  provider: string;
  accelerationScore: number; // 0-100, provider-normalized
  asOf: string;
}
export type SocialSignal = SocialFeatures | SocialFeaturesAvailable;

export interface ComponentScores {
  volumeAcceleration: number; // out of configured weight
  breakoutStructure: number;
  liquidityOrderBook: number;
  marketRegime: number;
  social: number | null; // null when social unavailable (excluded, not zeroed)
}

export interface OpportunityScore {
  overall: number; // 0-100
  components: ComponentScores;
  weights: ScoreWeights;
  socialIncludedInOverall: boolean;
}

export interface ScoreWeights {
  volumeAcceleration: number;
  breakoutStructure: number;
  liquidityOrderBook: number;
  marketRegime: number;
  social: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  volumeAcceleration: 35,
  breakoutStructure: 25,
  liquidityOrderBook: 20,
  marketRegime: 10,
  social: 10,
};

export type SignalState =
  | "WATCH"
  | "QUALIFIED"
  | "HIGH_PRIORITY"
  | "ACTIVE"
  | "STRENGTHENING"
  | "WEAKENING"
  | "INVALIDATED"
  | "TARGET_REACHED"
  | "EXPIRED"
  | "REJECTED";

export interface SetupParameters {
  targetPct: number; // e.g. 0.07 for +7%
  invalidationPct: number; // e.g. -0.03 for -3%
  observationWindowHours: number; // e.g. 24
}

export const DEFAULT_SETUP_PARAMETERS: SetupParameters = {
  targetPct: 0.07,
  invalidationPct: -0.03,
  observationWindowHours: 24,
};

/** Immutable snapshot of everything known at signal-creation time. Never mutated later. */
export interface SignalSnapshot {
  price: number;
  quoteVolume24h: number;
  spreadBps: number;
  orderBook: OrderBookFeatures;
  momentum: MomentumFeatures;
  volume: VolumeFeatures;
  regime: MarketRegime;
  social: SocialSignal;
  score: OpportunityScore;
  setupParameters: SetupParameters;
}

export interface Signal {
  id: string;
  marketId: string;
  timestamp: string;
  state: SignalState;
  snapshot: SignalSnapshot;
  entryPriceRef: number; // reference price at signal creation, used for target/invalidation levels
  targetPrice: number;
  invalidationPrice: number;
  expiresAt: string;
}

export interface SignalEvent {
  id: string;
  signalId: string;
  timestamp: string;
  fromState: SignalState | null;
  toState: SignalState;
  reason: string;
}

export type PaperTradeOutcome = "OPEN" | "TARGET_HIT" | "INVALIDATED" | "EXPIRED" | "MANUAL_CLOSE";

export interface PaperTrade {
  id: string;
  signalId: string;
  marketId: string;
  entryPrice: number;
  entryTimestamp: string;
  positionSizeUsd: number;
  targetPrice: number;
  invalidationPrice: number;
  feesBps: number;
  slippageBps: number;
  exitPrice: number | null;
  exitTimestamp: string | null;
  realizedPnlUsd: number | null;
  realizedPnlPct: number | null;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  outcome: PaperTradeOutcome;
}

export interface SignalOutcome {
  id: string;
  signalId: string;
  observedAt: string;
  maxFavorableMovePct: number;
  maxAdverseMovePct: number;
  outcome: PaperTradeOutcome;
  hoursToOutcome: number | null;
}

export interface MonitorHealth {
  status: "MONITORING" | "DEGRADED" | "OFFLINE";
  lastKrakenConnection: string | null;
  lastMarketDataUpdate: string | null;
  lastCompletedScan: string | null;
  eligibleMarketCount: number;
  activeSetupCount: number;
  dataFreshness: Record<string, { lastUpdate: string | null; staleAfterSeconds: number; stale: boolean }>;
}
