import { Router } from "express";
import { db, logger } from "@kraken-memes/core";

export const healthRouter = Router();

// Defaults assume the persistent daemon (apps/worker/src/index.ts), which
// updates these on a sub-minute cadence. A free-tier deployment running
// apps/worker/src/cron.ts on a scheduled interval instead should override
// these via env vars to match that interval — otherwise a correctly-working
// cron deployment would always read as stale/DEGRADED between runs.
const STALE_AFTER_SECONDS = {
  krakenConnection: Number(process.env.HEALTH_KRAKEN_CONNECTION_STALE_SECONDS) || 120,
  marketData: Number(process.env.HEALTH_MARKET_DATA_STALE_SECONDS) || 60,
  scan: Number(process.env.HEALTH_SCAN_STALE_SECONDS) || 60 * 20, // a scan should complete at least every ~20 min (15m cycle + buffer)
};

healthRouter.get("/health", async (_req, res) => {
  try {
    const row = await db.query.monitorHealth.findFirst({ where: (t, { eq }) => eq(t.id, 1) });
    const now = Date.now();

    function freshness(lastUpdate: Date | null, staleAfterSeconds: number) {
      const stale = !lastUpdate || now - lastUpdate.getTime() > staleAfterSeconds * 1000;
      return { lastUpdate: lastUpdate?.toISOString() ?? null, staleAfterSeconds, stale };
    }

    const dataFreshness = {
      krakenConnection: freshness(row?.lastKrakenConnection ?? null, STALE_AFTER_SECONDS.krakenConnection),
      marketData: freshness(row?.lastMarketDataUpdate ?? null, STALE_AFTER_SECONDS.marketData),
      scan: freshness(row?.lastCompletedScan ?? null, STALE_AFTER_SECONDS.scan),
    };

    const anyStale = Object.values(dataFreshness).some((f) => f.stale);
    // Never claim MONITORING if the underlying data is stale or the worker has never reported in.
    const status = !row ? "OFFLINE" : anyStale ? "DEGRADED" : row.status;

    res.json({
      status,
      lastKrakenConnection: row?.lastKrakenConnection?.toISOString() ?? null,
      lastMarketDataUpdate: row?.lastMarketDataUpdate?.toISOString() ?? null,
      lastCompletedScan: row?.lastCompletedScan?.toISOString() ?? null,
      eligibleMarketCount: row?.eligibleMarketCount ?? 0,
      activeSetupCount: row?.activeSetupCount ?? 0,
      dataFreshness,
    });
  } catch (err) {
    logger.error("health_check_failed", { error: String(err) });
    res.status(500).json({ status: "OFFLINE", error: "Health check failed." });
  }
});
