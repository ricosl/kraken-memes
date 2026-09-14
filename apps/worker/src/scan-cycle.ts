import {
  checkLiquidity,
  classifyMoveAttribution,
  computeMarketRegime,
  computeMomentumFeatures,
  computeOpportunityScore,
  computeOrderBookFeatures,
  computeSetupLevels,
  computeVolumeFeatures,
  decideNotification,
  evaluatePriceOutcome,
  nextSignalState,
  scoreToTier,
  type Candle,
  type LiquidityCheck,
  type LiquidityInput,
  type LiquidityThresholds,
  type MarketRegime,
  type MomentumFeatures,
  type MoveAttribution,
  type NotificationDecision,
  type NotificationPreferencesInput,
  type NotificationType,
  type OpportunityScore,
  type OrderBookFeatures,
  type OrderBookInput,
  type RegimeInput,
  type ScoreThresholds,
  type ScoreTier,
  type ScoreWeights,
  type ScoreTrend,
  type SetupParameters,
  type SignalEvaluation,
  type SignalState,
  type SocialSignal,
  type VolumeFeatures,
  type VolumeInput,
} from "@kraken-memes/shared";

export interface ExistingSignalRecord {
  id: string;
  state: SignalState;
  score: number;
  targetPrice: number;
  invalidationPrice: number;
  expiresAt: string;
  lastNotifiedState: SignalState | null;
  entryPriceRef: number;
  createdAt: string;
}

export interface ScanConfigSnapshot {
  weights: ScoreWeights;
  scoreThresholds: ScoreThresholds;
  liquidityThresholds: LiquidityThresholds;
  setupParams: SetupParameters;
}

export interface MarketCycleContext {
  currentPrice: number;
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
  candles24h: Candle[];
  volumeStats: VolumeInput;
  liquidityRaw: LiquidityInput;
  orderBook: OrderBookInput;
  regimeInput: RegimeInput;
  /** The coin's own 1h return, used to classify whether its move is broad-market/sector/isolated. */
  coinReturn1h: number;
  social: SocialSignal;
  existingSignal: ExistingSignalRecord | null;
  now: Date;
  scanConfig: ScanConfigSnapshot;
  notificationPreferences: NotificationPreferencesInput;
  /** Most recent notification timestamp for this market, across its signal history (for cooldown). */
  lastNotificationAtForMarket: string | null;
}

export interface MarketCycleNotification {
  type: NotificationType;
  decision: NotificationDecision;
}

export interface MarketCycleOutcome {
  liquidity: LiquidityCheck;
  momentum: MomentumFeatures;
  volume: VolumeFeatures;
  orderBook: OrderBookFeatures;
  regime: MarketRegime;
  moveAttribution: MoveAttribution;
  score: OpportunityScore;
  tier: ScoreTier;
  evaluation: SignalEvaluation;
  fromState: SignalState | null;
  toState: SignalState;
  stateChanged: boolean;
  isNewSignal: boolean;
  newSignalLevels: { targetPrice: number; invalidationPrice: number; expiresAt: string } | null;
  notification: MarketCycleNotification | null;
  /** True when no signal exists yet and the market isn't interesting enough to create one (avoids row spam). */
  skipped: boolean;
  transitionReason: string;
}

const SCORE_TREND_EPSILON = 2;

function computeScoreTrend(currentScore: number, previousScore: number | null): ScoreTrend {
  if (previousScore === null) return "FLAT";
  const delta = currentScore - previousScore;
  if (delta > SCORE_TREND_EPSILON) return "UP";
  if (delta < -SCORE_TREND_EPSILON) return "DOWN";
  return "FLAT";
}

/**
 * Pure per-market, per-15m-cycle evaluation (spec sections 8-19): computes
 * every feature/score/state-machine step for one market from already-fetched
 * data. Contains no I/O — the worker (scan-runner.ts) fetches inputs from
 * Kraken/Postgres, calls this, then persists the result and performs the
 * actual push send. Kept pure so it's fully unit-testable.
 */
export function evaluateMarketCycle(ctx: MarketCycleContext): MarketCycleOutcome {
  const liquidity = checkLiquidity(ctx.liquidityRaw, ctx.scanConfig.liquidityThresholds);
  const momentum = computeMomentumFeatures({
    candlesByTimeframe: { "15m": ctx.candles15m, "1h": ctx.candles1h, "4h": ctx.candles4h, "24h": ctx.candles24h },
    currentPrice: ctx.currentPrice,
  });
  const volume = computeVolumeFeatures(ctx.volumeStats);
  const orderBook = computeOrderBookFeatures(ctx.orderBook);
  const regime = computeMarketRegime(ctx.regimeInput);
  const moveAttribution = classifyMoveAttribution(ctx.coinReturn1h, regime);
  const score = computeOpportunityScore({
    volume,
    momentum,
    orderBook,
    regime,
    moveAttribution,
    social: ctx.social,
    weights: ctx.scanConfig.weights,
  });
  const tier = scoreToTier(score, ctx.scanConfig.scoreThresholds);

  const fromState = ctx.existingSignal?.state ?? null;
  const baseState: SignalState = fromState ?? "WATCH";

  const priceOutcome = ctx.existingSignal
    ? evaluatePriceOutcome(ctx.currentPrice, ctx.existingSignal.targetPrice, ctx.existingSignal.invalidationPrice)
    : "NONE";
  const expired = ctx.existingSignal ? ctx.now.getTime() > new Date(ctx.existingSignal.expiresAt).getTime() : false;
  const scoreTrend = computeScoreTrend(score.overall, ctx.existingSignal?.score ?? null);

  const evaluation: SignalEvaluation = {
    liquidityPassed: liquidity.passed,
    scoreTier: tier,
    notificationSent: false,
    priceOutcome,
    expired,
    scoreTrend,
  };

  const isNewSignal = !ctx.existingSignal;

  // Don't create a persisted signal for a market that isn't interesting yet, or
  // one that fails the hard liquidity gate before it was ever tracked — either
  // would otherwise get a fresh row every single cycle forever: a not-yet-tracked
  // market has no open signal for getOpenSignal to find next time, so without this
  // guard a REJECTED (terminal) row would be re-created every 15m indefinitely.
  // An *already-tracked* signal that later fails liquidity still transitions to
  // REJECTED normally below — that happens once, on its one open row.
  if (isNewSignal && (tier === "BELOW_WATCH" || !liquidity.passed)) {
    return {
      liquidity,
      momentum,
      volume,
      orderBook,
      regime,
      moveAttribution,
      score,
      tier,
      evaluation,
      fromState: null,
      toState: "WATCH",
      stateChanged: false,
      isNewSignal: false,
      newSignalLevels: null,
      notification: null,
      skipped: true,
      transitionReason: liquidity.passed ? "Score below the watch threshold; no signal created." : "Market fails the liquidity gate; no signal created.",
    };
  }

  const { toState, reason } = nextSignalState(baseState, evaluation);
  const stateChanged = isNewSignal || toState !== baseState;

  const newSignalLevels = isNewSignal ? computeSetupLevels(ctx.currentPrice, ctx.now.toISOString(), ctx.scanConfig.setupParams) : null;

  let notification: MarketCycleNotification | null = null;
  if (toState === "HIGH_PRIORITY" || toState === "INVALIDATED") {
    const notificationType: NotificationType = toState === "HIGH_PRIORITY" ? "NEW_HIGH_PRIORITY" : "INVALIDATED";
    const decision = decideNotification({
      preferences: ctx.notificationPreferences,
      notificationType,
      score: score.overall,
      toState,
      lastNotifiedState: ctx.existingSignal?.lastNotifiedState ?? null,
      lastNotificationAt: ctx.lastNotificationAtForMarket,
      now: ctx.now,
    });
    notification = { type: notificationType, decision };
  }

  return {
    liquidity,
    momentum,
    volume,
    orderBook,
    regime,
    moveAttribution,
    score,
    tier,
    evaluation,
    fromState,
    toState,
    stateChanged,
    isNewSignal,
    newSignalLevels,
    notification,
    skipped: false,
    transitionReason: reason,
  };
}

/** After a notification is actually (attempted to be) sent, re-derives the final state for this cycle. */
export function finalizeStateAfterNotification(fromState: SignalState | null, evaluation: SignalEvaluation): SignalState {
  const baseState = fromState ?? "WATCH";
  return nextSignalState(baseState, { ...evaluation, notificationSent: true }).toState;
}
