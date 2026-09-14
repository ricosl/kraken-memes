import { Router } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { signalEvents, signals } from "../db/schema.js";
import { db } from "../db/client.js";

export const signalsRouter = Router();

const ACTIVE_STATES = ["WATCH", "QUALIFIED", "HIGH_PRIORITY", "ACTIVE", "STRENGTHENING", "WEAKENING"] as const;
const COMPLETED_STATES = ["INVALIDATED", "TARGET_REACHED", "EXPIRED", "REJECTED"] as const;

/**
 * Alerts screen: New (recently high-priority), Active (currently valid),
 * Completed (invalidated/expired/target-reached) (spec section 26).
 */
signalsRouter.get("/signals", async (req, res) => {
  const bucket = req.query.bucket as string | undefined;

  let stateFilter: readonly string[] | undefined;
  if (bucket === "active") stateFilter = ACTIVE_STATES;
  else if (bucket === "completed") stateFilter = COMPLETED_STATES;
  else if (bucket === "new") stateFilter = ["HIGH_PRIORITY"];

  const rows = await db.query.signals.findMany({
    where: stateFilter ? inArray(signals.state, stateFilter as (typeof signals.state.enumValues)[number][]) : undefined,
    orderBy: desc(signals.timestamp),
    limit: 100,
    with: { market: true },
  });

  res.json(rows);
});

/** Home screen: top current setups, ranked by score, among active (non-terminal) signals. */
signalsRouter.get("/signals/top", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const rows = await db.query.signals.findMany({
    where: inArray(signals.state, ["HIGH_PRIORITY", "ACTIVE", "STRENGTHENING", "QUALIFIED"]),
    orderBy: desc(signals.score),
    limit,
    with: { market: true },
  });
  res.json(rows);
});

signalsRouter.get("/signals/:id", async (req, res) => {
  const signal = await db.query.signals.findFirst({
    where: eq(signals.id, req.params.id),
    with: { market: true, events: { orderBy: desc(signalEvents.timestamp) }, outcome: true },
  });
  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }
  res.json(signal);
});

