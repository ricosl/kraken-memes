import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { closePaperTrade, DEFAULT_PAPER_TRADE_COSTS, simulateEntryFill } from "@kraken-memes/shared";
import { candles, db, getOrCreateDefaultUserId, logger, paperTrades, signals } from "@kraken-memes/core";

export const paperTradesRouter = Router();

paperTradesRouter.get("/paper-trades", async (req, res) => {
  const userId = await getOrCreateDefaultUserId();
  const rows = await db.query.paperTrades.findMany({
    where: eq(paperTrades.userId, userId),
    orderBy: desc(paperTrades.entryTimestamp),
    with: { market: true, signal: true },
  });
  res.json(rows);
});

const createSchema = z.object({
  signalId: z.string().uuid(),
  positionSizeUsd: z.number().positive().max(1_000_000),
});

/** Opens a simulated position from a qualifying setup (spec section 28). No real order is ever placed. */
paperTradesRouter.post("/paper-trades", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid paper trade request", details: parsed.error.flatten() });
    return;
  }

  const signal = await db.query.signals.findFirst({ where: eq(signals.id, parsed.data.signalId) });
  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  const costs = DEFAULT_PAPER_TRADE_COSTS;
  const entryPrice = simulateEntryFill(signal.entryPriceRef, costs);

  const [trade] = await db
    .insert(paperTrades)
    .values({
      userId: await getOrCreateDefaultUserId(),
      signalId: signal.id,
      marketId: signal.marketId,
      entryPrice,
      positionSizeUsd: parsed.data.positionSizeUsd,
      targetPrice: signal.targetPrice,
      invalidationPrice: signal.invalidationPrice,
      feesBps: costs.feesBps,
      slippageBps: costs.slippageBps,
      outcome: "OPEN",
    })
    .returning();

  logger.info("paper_trade_opened", { tradeId: trade?.id, signalId: signal.id });
  res.status(201).json(trade);
});

const closeSchema = z.object({
  exitPrice: z.number().positive().optional(),
});

/** Closes an open paper trade. Uses the current market price when no explicit exit price is given. */
paperTradesRouter.post("/paper-trades/:id/close", async (req, res) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid close request", details: parsed.error.flatten() });
    return;
  }

  const trade = await db.query.paperTrades.findFirst({ where: eq(paperTrades.id, req.params.id) });
  if (!trade) {
    res.status(404).json({ error: "Paper trade not found" });
    return;
  }
  if (trade.outcome !== "OPEN") {
    res.status(409).json({ error: "Paper trade is already closed" });
    return;
  }

  let rawExitPrice = parsed.data.exitPrice;
  if (rawExitPrice === undefined) {
    const latestCandle = await db.query.candles.findFirst({
      where: eq(candles.marketId, trade.marketId),
      orderBy: desc(candles.timestamp),
    });
    if (!latestCandle) {
      res.status(422).json({ error: "No market price available to close this trade; provide exitPrice explicitly." });
      return;
    }
    rawExitPrice = latestCandle.close;
  }

  const outcome = rawExitPrice >= trade.targetPrice ? "TARGET_HIT" : rawExitPrice <= trade.invalidationPrice ? "INVALIDATED" : "MANUAL_CLOSE";

  const result = closePaperTrade({
    entryPrice: trade.entryPrice,
    rawExitPrice,
    positionSizeUsd: trade.positionSizeUsd,
    outcome,
    costs: { feesBps: trade.feesBps, slippageBps: trade.slippageBps },
  });

  const [updated] = await db
    .update(paperTrades)
    .set({
      exitPrice: result.exitPrice,
      exitTimestamp: new Date(),
      realizedPnlUsd: result.realizedPnlUsd,
      realizedPnlPct: result.realizedPnlPct,
      outcome: result.outcome,
    })
    .where(eq(paperTrades.id, trade.id))
    .returning();

  logger.info("paper_trade_closed", { tradeId: trade.id, outcome: result.outcome, pnlUsd: result.realizedPnlUsd });
  res.json(updated);
});
