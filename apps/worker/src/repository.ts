import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import {
  candles,
  db,
  features,
  markets,
  monitorHealth,
  notificationHistory,
  notificationPreferences,
  orderBookSnapshots,
  scanConfig,
  signalEvents,
  signalOutcomes,
  signals,
  trades,
} from "@kraken-memes/core";
import type {
  Candle as SharedCandle,
  LiquidityThresholds,
  ScoreThresholds,
  ScoreWeights,
  SetupParameters,
  SignalState,
  Timeframe,
} from "@kraken-memes/shared";
import { isMemeEligible } from "@kraken-memes/shared";
import type { ExistingSignalRecord, ScanConfigSnapshot } from "./scan-cycle.js";

export async function getEligibleMarkets() {
  const rows = await db.query.markets.findMany({ where: eq(markets.active, true) });
  return rows.filter((m) => isMemeEligible(m.memeClassification));
}

export async function getAllMarkets() {
  return db.query.markets.findMany();
}

function toSharedCandle(row: typeof candles.$inferSelect): SharedCandle {
  return {
    marketId: row.marketId,
    timeframe: row.timeframe as Timeframe,
    timestamp: row.timestamp.toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    vwap: row.vwap,
    tradeCount: row.tradeCount,
  };
}

export async function getRecentCandles(marketId: string, timeframe: Timeframe, limit: number): Promise<SharedCandle[]> {
  const rows = await db.query.candles.findMany({
    where: and(eq(candles.marketId, marketId), eq(candles.timeframe, timeframe as never)),
    orderBy: desc(candles.timestamp),
    limit,
  });
  return rows.reverse().map(toSharedCandle);
}

export async function getLatestCompletedCandleTimestamp(marketId: string, timeframe: Timeframe): Promise<Date | null> {
  const row = await db.query.candles.findFirst({
    where: and(eq(candles.marketId, marketId), eq(candles.timeframe, timeframe as never)),
    orderBy: desc(candles.timestamp),
  });
  return row?.timestamp ?? null;
}

export async function insertCandles(rows: Array<typeof candles.$inferInsert>): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(candles)
    .values(rows)
    .onConflictDoUpdate({
      target: [candles.marketId, candles.timeframe, candles.timestamp],
      set: {
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        close: sql`excluded.close`,
        volume: sql`excluded.volume`,
        vwap: sql`excluded.vwap`,
        tradeCount: sql`excluded.trade_count`,
      },
    });
}

export async function insertOrderBookSnapshot(row: typeof orderBookSnapshots.$inferInsert): Promise<void> {
  await db.insert(orderBookSnapshots).values(row);
}

export async function getLatestOrderBookSnapshot(marketId: string) {
  return db.query.orderBookSnapshots.findFirst({
    where: eq(orderBookSnapshots.marketId, marketId),
    orderBy: desc(orderBookSnapshots.timestamp),
  });
}

export async function insertTrades(rows: Array<typeof trades.$inferInsert>): Promise<void> {
  if (rows.length === 0) return;
  // onConflictDoNothing on (marketId, krakenTradeId) so re-fetching an overlapping
  // time window — e.g. a cron-mode worker with no in-memory cursor between runs —
  // never inserts duplicate trade rows.
  await db.insert(trades).values(rows).onConflictDoNothing({ target: [trades.marketId, trades.krakenTradeId] });
}

export async function getTradeStats(marketId: string, sinceMs: number, untilMs: number) {
  const rows = await db.query.trades.findMany({
    where: and(eq(trades.marketId, marketId), gt(trades.timestamp, new Date(sinceMs)), lt(trades.timestamp, new Date(untilMs))),
  });
  const count = rows.length;
  const totalVolume = rows.reduce((sum, r) => sum + r.volume, 0);
  return { count, totalVolume, avgTradeSize: count > 0 ? totalVolume / count : 0 };
}

export async function getOpenSignal(marketId: string): Promise<ExistingSignalRecord | null> {
  const row = await db.query.signals.findFirst({
    where: and(
      eq(signals.marketId, marketId),
      inArray(signals.state, ["WATCH", "QUALIFIED", "HIGH_PRIORITY", "ACTIVE", "STRENGTHENING", "WEAKENING"]),
    ),
    orderBy: desc(signals.timestamp),
  });
  if (!row) return null;
  return {
    id: row.id,
    state: row.state,
    score: row.score,
    targetPrice: row.targetPrice,
    invalidationPrice: row.invalidationPrice,
    expiresAt: row.expiresAt.toISOString(),
    lastNotifiedState: row.lastNotifiedState,
    entryPriceRef: row.entryPriceRef,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getLastNotificationForMarket(marketId: string): Promise<string | null> {
  const row = await db.query.notificationHistory.findFirst({
    where: eq(notificationHistory.marketId, marketId),
    orderBy: desc(notificationHistory.sentAt),
  });
  return row?.sentAt.toISOString() ?? null;
}

export interface CreateSignalInput {
  marketId: string;
  timestamp: Date;
  state: SignalState;
  score: number;
  snapshot: unknown;
  entryPriceRef: number;
  targetPrice: number;
  invalidationPrice: number;
  expiresAt: Date;
}

export async function createSignal(input: CreateSignalInput): Promise<string> {
  const [row] = await db.insert(signals).values(input).returning({ id: signals.id });
  if (!row) throw new Error("Failed to insert signal");
  await db.insert(signalEvents).values({ signalId: row.id, fromState: null, toState: input.state, reason: "Signal created." });
  return row.id;
}

export interface UpdateSignalStateInput {
  signalId: string;
  fromState: SignalState;
  toState: SignalState;
  score: number;
  reason: string;
  lastNotifiedState?: SignalState;
  lastNotifiedAt?: Date;
}

export async function updateSignalState(input: UpdateSignalStateInput): Promise<void> {
  await db
    .update(signals)
    .set({
      state: input.toState,
      score: input.score,
      updatedAt: new Date(),
      ...(input.lastNotifiedState !== undefined ? { lastNotifiedState: input.lastNotifiedState } : {}),
      ...(input.lastNotifiedAt !== undefined ? { lastNotifiedAt: input.lastNotifiedAt } : {}),
    })
    .where(eq(signals.id, input.signalId));

  if (input.fromState !== input.toState) {
    await db.insert(signalEvents).values({ signalId: input.signalId, fromState: input.fromState, toState: input.toState, reason: input.reason });
  }
}

export async function recordFeatures(row: typeof features.$inferInsert): Promise<void> {
  await db
    .insert(features)
    .values(row)
    .onConflictDoUpdate({
      target: [features.marketId, features.timestamp],
      set: {
        momentum: sql`excluded.momentum`,
        volume: sql`excluded.volume`,
        orderBook: sql`excluded.order_book`,
        liquidity: sql`excluded.liquidity`,
        regime: sql`excluded.regime`,
        social: sql`excluded.social`,
      },
    });
}

export interface RecordNotificationInput {
  signalId: string;
  marketId: string;
  type: "NEW_HIGH_PRIORITY" | "INVALIDATED";
  toState: SignalState;
  score: number;
  subscriptionsTargeted: number;
  subscriptionsDelivered: number;
}

export async function recordNotification(input: RecordNotificationInput): Promise<void> {
  await db.insert(notificationHistory).values(input);
}

/**
 * Tracks running max-favorable/max-adverse excursion for a signal as new
 * prices arrive, finalizing the outcome once the signal reaches a terminal
 * state. Reads its own prior MFE/MAE so each call only needs the latest
 * price — never rewrites the signal's original entry price or snapshot.
 */
export async function upsertSignalOutcome(input: {
  signalId: string;
  entryPrice: number;
  currentPrice: number;
  outcome: "OPEN" | "TARGET_HIT" | "INVALIDATED" | "EXPIRED" | "MANUAL_CLOSE";
  createdAt: Date;
  now: Date;
}): Promise<void> {
  const existing = await db.query.signalOutcomes.findFirst({ where: eq(signalOutcomes.signalId, input.signalId) });
  const movePct = input.entryPrice !== 0 ? (input.currentPrice - input.entryPrice) / input.entryPrice : 0;
  const maxFavorableMovePct = Math.max(existing?.maxFavorableMovePct ?? 0, movePct);
  const maxAdverseMovePct = Math.min(existing?.maxAdverseMovePct ?? 0, movePct);
  const isTerminal = input.outcome !== "OPEN";
  const hoursToOutcome = isTerminal ? (input.now.getTime() - input.createdAt.getTime()) / (60 * 60 * 1000) : null;

  if (existing) {
    await db
      .update(signalOutcomes)
      .set({ maxFavorableMovePct, maxAdverseMovePct, outcome: input.outcome, hoursToOutcome, observedAt: new Date() })
      .where(eq(signalOutcomes.signalId, input.signalId));
  } else {
    await db.insert(signalOutcomes).values({ signalId: input.signalId, maxFavorableMovePct, maxAdverseMovePct, outcome: input.outcome, hoursToOutcome });
  }
}

export async function getScanConfig(): Promise<ScanConfigSnapshot> {
  const row = await db.query.scanConfig.findFirst({ where: eq(scanConfig.id, 1) });
  if (!row) throw new Error("scan_config row missing; run db:seed.");
  return {
    weights: row.weights as ScoreWeights,
    scoreThresholds: row.scoreThresholds as ScoreThresholds,
    liquidityThresholds: row.liquidityThresholds as LiquidityThresholds,
    setupParams: {
      targetPct: row.targetPct,
      invalidationPct: row.invalidationPct,
      observationWindowHours: row.observationWindowHours,
    } satisfies SetupParameters,
  };
}

export async function getAllNotificationPreferences() {
  return db.query.notificationPreferences.findMany();
}

export async function updateMonitorHealth(patch: Partial<typeof monitorHealth.$inferInsert>): Promise<void> {
  await db
    .insert(monitorHealth)
    .values({ id: 1, ...patch })
    .onConflictDoUpdate({ target: monitorHealth.id, set: { ...patch, updatedAt: new Date() } });
}

export async function upsertMarketFromDiscovery(input: {
  krakenPairName: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  active: boolean;
  priceDecimals: number;
  quantityDecimals: number;
  minOrderSize: number;
  ineligibleReason: string | null;
  suggestedClassification: "AUTO_CLASSIFIED" | "PENDING_REVIEW";
}): Promise<void> {
  const existing = await db.query.markets.findFirst({ where: eq(markets.krakenPairName, input.krakenPairName) });

  if (!existing) {
    await db.insert(markets).values({
      krakenPairName: input.krakenPairName,
      symbol: input.symbol,
      baseAsset: input.baseAsset,
      quoteAsset: input.quoteAsset,
      active: input.active,
      memeClassification: input.suggestedClassification,
      priceDecimals: input.priceDecimals,
      quantityDecimals: input.quantityDecimals,
      minOrderSize: input.minOrderSize,
      ineligibleReason: input.ineligibleReason,
    });
    return;
  }

  // Never overwrite a manually-overridden classification with the auto-suggestion.
  await db
    .update(markets)
    .set({
      active: input.active,
      priceDecimals: input.priceDecimals,
      quantityDecimals: input.quantityDecimals,
      minOrderSize: input.minOrderSize,
      ineligibleReason: input.ineligibleReason,
      updatedAt: new Date(),
      ...(existing.classificationOverridden ? {} : { memeClassification: input.suggestedClassification }),
    })
    .where(eq(markets.id, existing.id));
}
