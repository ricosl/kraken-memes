// Mirrors the server's response shapes (apps/server/src/routes/*, apps/core/src/db/schema.ts).
// Kept local to the web app (not imported from @kraken-memes/shared) because these are
// wire/DB-row shapes (plain JSON, dates as strings) rather than the domain types shared
// with the worker.

export type MemeClassification = "AUTO_CLASSIFIED" | "INCLUDED" | "EXCLUDED" | "PENDING_REVIEW";

export interface Market {
  id: string;
  krakenPairName: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  active: boolean;
  memeClassification: MemeClassification;
  classificationOverridden: boolean;
  firstSeen: string;
  priceDecimals: number;
  quantityDecimals: number;
  minOrderSize: number;
  ineligibleReason: string | null;
  updatedAt: string;
}

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

export interface ComponentScores {
  volumeAcceleration: number;
  breakoutStructure: number;
  liquidityOrderBook: number;
  marketRegime: number;
  social: number | null;
}

export interface OpportunityScore {
  overall: number;
  components: ComponentScores;
  weights: Record<string, number>;
  socialIncludedInOverall: boolean;
}

export interface SignalSnapshot {
  momentum: {
    return5m: number | null;
    return15m: number | null;
    return1h: number | null;
    return4h: number | null;
    return24h: number | null;
    distanceFromRecentHighPct: number;
    brokeAboveRecentHigh: boolean;
    brokeAboveVwap: boolean | null;
    volatility: number;
    volatilityCompression: boolean;
    volatilityExpansion: boolean;
    recoveryVelocity: number | null;
  };
  volume: {
    volumeAccelerationRatio: number;
    tradeCountAccelerationRatio: number;
    avgTradeSizeChangeRatio: number;
    participationAccelerationRatio: number;
  };
  orderBook: {
    spreadBps: number;
    bidDepthNotional: number;
    askDepthNotional: number;
    imbalance: number;
    liquidityQuality: "STRONG" | "MODERATE" | "THIN";
  };
  liquidity: {
    passed: boolean;
    rejectionReasons: string[];
  };
  regime: {
    classification: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
    btc: { trend: string; return1h: number };
    sol: { trend: string; return1h: number };
    memeBasket: { pctAdvancing: number; avgReturn1h: number };
  };
  moveAttribution?: "BROAD_MARKET_DRIVEN" | "MEME_SECTOR_DRIVEN" | "ISOLATED";
  social: { available: boolean; accelerationScore?: number };
  score: OpportunityScore;
}

export interface SignalEvent {
  id: string;
  signalId: string;
  timestamp: string;
  fromState: SignalState | null;
  toState: SignalState;
  reason: string;
}

export interface Signal {
  id: string;
  marketId: string;
  timestamp: string;
  state: SignalState;
  score: number;
  snapshot: SignalSnapshot;
  entryPriceRef: number;
  targetPrice: number;
  invalidationPrice: number;
  expiresAt: string;
  lastNotifiedState: SignalState | null;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  market?: Market;
  events?: SignalEvent[];
  outcome?: SignalOutcome | null;
}

export interface SignalOutcome {
  id: string;
  signalId: string;
  observedAt: string;
  maxFavorableMovePct: number;
  maxAdverseMovePct: number;
  outcome: "OPEN" | "TARGET_HIT" | "INVALIDATED" | "EXPIRED" | "MANUAL_CLOSE";
  hoursToOutcome: number | null;
}

export interface Candle {
  id: string;
  marketId: string;
  timeframe: "5m" | "15m" | "1h" | "4h" | "24h";
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
  tradeCount: number | null;
}

export interface OrderBookSnapshot {
  marketId: string;
  timestamp: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadBps: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number;
}

export interface MarketDetail {
  market: Market;
  candles: Candle[];
  latestOrderBook: OrderBookSnapshot | null;
  latestFeatures: unknown;
  signalHistory: Signal[];
}

export interface ScannerRow {
  market: Market;
  signal: Signal | null;
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

export interface ScoreWeights {
  volumeAcceleration: number;
  breakoutStructure: number;
  liquidityOrderBook: number;
  marketRegime: number;
  social: number;
}

export interface ScanConfig {
  id: number;
  quoteCurrency: string;
  targetPct: number;
  invalidationPct: number;
  observationWindowHours: number;
  decisionIntervalMinutes: number;
  weights: ScoreWeights;
  scoreThresholds: { watchScore: number; qualifyScore: number; highPriorityScore: number };
  liquidityThresholds: { minQuoteVolume24h: number; maxSpreadBps: number; minDepthNotional: number; minTradeCount1h: number };
  updatedAt: string;
}

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  minScore: number;
  quietStart: string | null;
  quietEnd: string | null;
  cooldownMinutes: number;
  newSetupEnabled: boolean;
  invalidationEnabled: boolean;
  updatedAt: string;
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
  market?: Market;
  signal?: Signal;
}

export interface PerformanceStats {
  totalSignals: number;
  qualifiedSetups: number;
  resolvedSignals: number;
  targetHitPct: number | null;
  invalidationPct: number | null;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  maxDrawdownPct: number | null;
  worstLosingStreak: number;
  falsePositiveRate: number | null;
  scoreCalibration: Array<{ scoreRange: string; sampleSize: number; targetHitRate: number | null }>;
  disclaimer: string;
}
