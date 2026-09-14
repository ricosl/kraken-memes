import type { Candle, LiquidityInput, OrderBookInput, SocialSignalProvider, VolumeInput } from "@kraken-memes/shared";
import { logger } from "@kraken-memes/core";
import {
  createSignal,
  getAllNotificationPreferences,
  getEligibleMarkets,
  getLastNotificationForMarket,
  getLatestOrderBookSnapshot,
  getOpenSignal,
  getRecentCandles,
  getScanConfig,
  getTradeStats,
  recordFeatures,
  recordNotification,
  updateSignalState,
  upsertSignalOutcome,
} from "./repository.js";
import { evaluateMarketCycle, finalizeStateAfterNotification, type MarketCycleContext } from "./scan-cycle.js";
import { buildRegimeInput } from "./regime-builder.js";
import { buildNotificationPayload, dispatchNotification } from "./notifier.js";

function pctReturn(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2]!;
  const last = candles[candles.length - 1]!;
  return prev.close !== 0 ? (last.close - prev.close) / prev.close : null;
}

function computeVolumeInput(candles15m: Candle[], baselineWindow = 20): VolumeInput {
  if (candles15m.length < 2) {
    return { currentVolume: 0, baselineVolume: 0, currentTradeCount: 0, baselineTradeCount: 0, currentAvgTradeSize: 0, baselineAvgTradeSize: 0 };
  }
  const current = candles15m[candles15m.length - 1]!;
  const baselineCandles = candles15m.slice(-(baselineWindow + 1), -1);
  const n = baselineCandles.length || 1;
  const baselineVolume = baselineCandles.reduce((s, c) => s + c.volume, 0) / n;
  const baselineTradeCount = baselineCandles.reduce((s, c) => s + (c.tradeCount ?? 0), 0) / n;
  const baselineAvgTradeSize = baselineTradeCount > 0 ? baselineVolume / baselineTradeCount : 0;
  const currentTradeCount = current.tradeCount ?? 0;
  const currentAvgTradeSize = currentTradeCount > 0 ? current.volume / currentTradeCount : 0;

  return { currentVolume: current.volume, baselineVolume, currentTradeCount, baselineTradeCount, currentAvgTradeSize, baselineAvgTradeSize };
}

export interface ScanCycleSummary {
  marketsScanned: number;
  marketsSkippedInsufficientData: number;
  signalsCreated: number;
  stateTransitions: number;
  notificationsSent: number;
}

/**
 * The core 15-minute decision cycle (spec sections 8-19, 32): for every
 * eligible market, computes features/liquidity/score from already-ingested
 * data, advances its signal state machine, and dispatches any warranted
 * push notification. Never mutates a signal's original creation snapshot —
 * only state/score/notification bookkeeping are updated on existing rows.
 */
export async function runScanCycle(socialProvider: SocialSignalProvider): Promise<ScanCycleSummary> {
  const [eligibleMarkets, scanConfig, allPreferences] = await Promise.all([getEligibleMarkets(), getScanConfig(), getAllNotificationPreferences()]);

  const quoteAsset = process.env.KRAKEN_QUOTE_ASSET ?? "USD";
  const now = new Date();

  const candlesByMarket = new Map<string, { c15: Candle[]; c1h: Candle[]; c4h: Candle[]; c24h: Candle[] }>();
  const basketReturns1h: number[] = [];

  for (const market of eligibleMarkets) {
    const [c15, c1h, c4h, c24h] = await Promise.all([
      getRecentCandles(market.id, "15m", 100),
      getRecentCandles(market.id, "1h", 40),
      getRecentCandles(market.id, "4h", 40),
      getRecentCandles(market.id, "24h", 10),
    ]);
    candlesByMarket.set(market.id, { c15, c1h, c4h, c24h });
    const r1h = pctReturn(c1h);
    if (r1h !== null) basketReturns1h.push(r1h);
  }

  const regimeInput = await buildRegimeInput(quoteAsset, basketReturns1h, now.toISOString());

  const summary: ScanCycleSummary = { marketsScanned: 0, marketsSkippedInsufficientData: 0, signalsCreated: 0, stateTransitions: 0, notificationsSent: 0 };

  for (const market of eligibleMarkets) {
    try {
      const candleSet = candlesByMarket.get(market.id);
      const orderBookSnapshot = await getLatestOrderBookSnapshot(market.id);

      if (!candleSet || candleSet.c15.length < 2 || !orderBookSnapshot) {
        summary.marketsSkippedInsufficientData++;
        continue;
      }

      const currentPrice = candleSet.c15.at(-1)!.close;
      const coinReturn1h = pctReturn(candleSet.c1h) ?? 0;

      const tradeStats1h = await getTradeStats(market.id, now.getTime() - 60 * 60 * 1000, now.getTime());

      const quoteVolume24h = candleSet.c24h.length > 0 ? candleSet.c24h.at(-1)!.volume * currentPrice : null;

      const liquidityRaw: LiquidityInput = {
        quoteVolume24h,
        spreadBps: orderBookSnapshot.spreadBps,
        depthNotional: orderBookSnapshot.bidDepth + orderBookSnapshot.askDepth,
        tradeCount1h: tradeStats1h.count,
        marketActive: market.active,
      };

      const orderBookInput: OrderBookInput = {
        // We only persist a snapshot's aggregate depth, not raw levels, so
        // reconstruct single synthetic levels that reproduce the same
        // spread/depth features already computed at ingestion time.
        bids: [{ price: orderBookSnapshot.bestBid, volume: orderBookSnapshot.bestBid > 0 ? orderBookSnapshot.bidDepth / orderBookSnapshot.bestBid : 0 }],
        asks: [{ price: orderBookSnapshot.bestAsk, volume: orderBookSnapshot.bestAsk > 0 ? orderBookSnapshot.askDepth / orderBookSnapshot.bestAsk : 0 }],
      };

      const social = await socialProvider.fetchSignal(market.baseAsset);
      const existingSignal = await getOpenSignal(market.id);
      const lastNotificationAtForMarket = await getLastNotificationForMarket(market.id);
      const preferences = allPreferences[0]; // V1: single local user

      if (!preferences) {
        logger.warn("scan_cycle_no_notification_preferences", { marketId: market.id });
        continue;
      }

      const ctx: MarketCycleContext = {
        currentPrice,
        candles15m: candleSet.c15,
        candles1h: candleSet.c1h,
        candles4h: candleSet.c4h,
        candles24h: candleSet.c24h,
        volumeStats: computeVolumeInput(candleSet.c15),
        liquidityRaw,
        orderBook: orderBookInput,
        regimeInput,
        coinReturn1h,
        social,
        existingSignal,
        now,
        scanConfig,
        notificationPreferences: preferences,
        lastNotificationAtForMarket,
      };

      const outcome = evaluateMarketCycle(ctx);
      summary.marketsScanned++;

      await recordFeatures({
        marketId: market.id,
        timestamp: now,
        momentum: outcome.momentum,
        volume: outcome.volume,
        orderBook: outcome.orderBook,
        liquidity: outcome.liquidity,
        regime: outcome.regime,
        social,
      });

      if (outcome.skipped) continue;

      // Send the notification first (if warranted), then finalize the state
      // machine step so a HIGH_PRIORITY->ACTIVE transition only happens once
      // the alert has actually been (attempted to be) dispatched.
      let notificationSentThisCycle = false;
      let deliveryStats = { targeted: 0, delivered: 0 };

      if (outcome.notification?.decision.shouldSend) {
        const payload = buildNotificationPayload({ symbol: market.symbol, score: outcome.score.overall, outcome, signalId: existingSignal?.id ?? "pending" });
        deliveryStats = await dispatchNotification(preferences.userId, payload);
        notificationSentThisCycle = true;
      }

      const finalState = notificationSentThisCycle ? finalizeStateAfterNotification(outcome.fromState, outcome.evaluation) : outcome.toState;

      let signalId: string;
      let entryPriceRef: number;
      let signalCreatedAt: Date;

      if (outcome.isNewSignal && outcome.newSignalLevels) {
        signalId = await createSignal({
          marketId: market.id,
          timestamp: now,
          state: finalState,
          score: outcome.score.overall,
          snapshot: {
            momentum: outcome.momentum,
            volume: outcome.volume,
            orderBook: outcome.orderBook,
            liquidity: outcome.liquidity,
            regime: outcome.regime,
            moveAttribution: outcome.moveAttribution,
            social,
            score: outcome.score,
          },
          entryPriceRef: currentPrice,
          targetPrice: outcome.newSignalLevels.targetPrice,
          invalidationPrice: outcome.newSignalLevels.invalidationPrice,
          expiresAt: new Date(outcome.newSignalLevels.expiresAt),
        });
        summary.signalsCreated++;
        entryPriceRef = currentPrice;
        signalCreatedAt = now;

        if (notificationSentThisCycle) {
          await updateSignalState({
            signalId,
            fromState: finalState,
            toState: finalState,
            score: outcome.score.overall,
            reason: "Notification dispatched.",
            lastNotifiedState: outcome.toState,
            lastNotifiedAt: now,
          });
        }
      } else if (existingSignal) {
        signalId = existingSignal.id;
        entryPriceRef = existingSignal.entryPriceRef;
        signalCreatedAt = new Date(existingSignal.createdAt);

        await updateSignalState({
          signalId: existingSignal.id,
          fromState: existingSignal.state,
          toState: finalState,
          score: outcome.score.overall,
          reason: outcome.transitionReason,
          ...(notificationSentThisCycle ? { lastNotifiedState: outcome.toState, lastNotifiedAt: now } : {}),
        });
        if (finalState !== existingSignal.state) summary.stateTransitions++;
      } else {
        continue; // unreachable: evaluateMarketCycle guarantees isNewSignal xor existingSignal, unless skipped
      }

      if (notificationSentThisCycle && outcome.notification) {
        await recordNotification({
          signalId,
          marketId: market.id,
          type: outcome.notification.type,
          toState: outcome.toState,
          score: outcome.score.overall,
          subscriptionsTargeted: deliveryStats.targeted,
          subscriptionsDelivered: deliveryStats.delivered,
        });
        summary.notificationsSent++;
      }

      const isTrackedOutcomeState = (["ACTIVE", "STRENGTHENING", "WEAKENING", "TARGET_REACHED", "INVALIDATED", "EXPIRED"] as const).includes(
        finalState as never,
      );
      if (isTrackedOutcomeState) {
        const outcomeStatus: "OPEN" | "TARGET_HIT" | "INVALIDATED" | "EXPIRED" =
          finalState === "TARGET_REACHED" ? "TARGET_HIT" : finalState === "INVALIDATED" ? "INVALIDATED" : finalState === "EXPIRED" ? "EXPIRED" : "OPEN";
        await upsertSignalOutcome({
          signalId,
          entryPrice: entryPriceRef,
          currentPrice,
          outcome: outcomeStatus,
          createdAt: signalCreatedAt,
          now,
        });
      }
    } catch (err) {
      logger.error("scan_cycle_market_failed", { marketId: market.id, symbol: market.symbol, error: String(err) });
    }
  }

  logger.info("scan_cycle_complete", { ...summary });
  return summary;
}
