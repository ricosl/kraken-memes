import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { candles, features, markets, orderBookSnapshots, signalEvents, signals } from "../db/schema.js";
import { logger } from "../logger.js";

export const marketsRouter = Router();

/**
 * Scanner screen: every currently-eligible market (Kraken-active + meme-classified)
 * with its latest score/signal state, if one exists. Markets never analyzed yet
 * simply have a null `signal`.
 */
marketsRouter.get("/markets", async (req, res) => {
  const eligibleOnly = req.query.eligibleOnly !== "false";

  const marketRows = await db.query.markets.findMany({
    where: eligibleOnly
      ? (t, { eq: eqOp, and: andOp, or: orOp }) => andOp(eqOp(t.active, true), orOp(eqOp(t.memeClassification, "AUTO_CLASSIFIED"), eqOp(t.memeClassification, "INCLUDED")))
      : undefined,
    orderBy: (t, { asc }) => asc(t.symbol),
  });

  const results = await Promise.all(
    marketRows.map(async (market) => {
      const latestSignal = await db.query.signals.findFirst({
        where: eq(signals.marketId, market.id),
        orderBy: desc(signals.timestamp),
      });
      return { market, signal: latestSignal ?? null };
    }),
  );

  res.json(results);
});

const classificationSchema = z.object({
  classification: z.enum(["AUTO_CLASSIFIED", "INCLUDED", "EXCLUDED", "PENDING_REVIEW"]),
});

/** Manual meme-classification override (spec section 7) — always wins over the auto-classifier going forward. */
marketsRouter.patch("/markets/:id/classification", async (req, res) => {
  const parsed = classificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid classification", details: parsed.error.flatten() });
    return;
  }

  const [updated] = await db
    .update(markets)
    .set({ memeClassification: parsed.data.classification, classificationOverridden: true, updatedAt: new Date() })
    .where(eq(markets.id, req.params.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  logger.info("market_classification_overridden", { marketId: updated.id, classification: parsed.data.classification });
  res.json(updated);
});

/** Coin detail screen: market info, recent candles, latest order book, feature/signal history. */
marketsRouter.get("/markets/:id", async (req, res) => {
  const market = await db.query.markets.findFirst({ where: eq(markets.id, req.params.id) });
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  const [recentCandles, latestOrderBook, recentFeatures, signalHistory] = await Promise.all([
    db.query.candles.findMany({
      where: and(eq(candles.marketId, market.id), eq(candles.timeframe, "15m")),
      orderBy: desc(candles.timestamp),
      limit: 200,
    }),
    db.query.orderBookSnapshots.findFirst({
      where: eq(orderBookSnapshots.marketId, market.id),
      orderBy: desc(orderBookSnapshots.timestamp),
    }),
    db.query.features.findMany({
      where: eq(features.marketId, market.id),
      orderBy: desc(features.timestamp),
      limit: 1,
    }),
    db.query.signals.findMany({
      where: eq(signals.marketId, market.id),
      orderBy: desc(signals.timestamp),
      limit: 20,
      with: { events: true },
    }),
  ]);

  res.json({
    market,
    candles: recentCandles.reverse(), // ascending for charting
    latestOrderBook: latestOrderBook ?? null,
    latestFeatures: recentFeatures[0] ?? null,
    signalHistory,
  });
});

