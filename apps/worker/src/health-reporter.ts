import { logger } from "@kraken-memes/core";
import { getEligibleMarkets, updateMonitorHealth } from "./repository.js";
import { db, signals } from "@kraken-memes/core";
import { inArray } from "drizzle-orm";

export type WsConnectionStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";

export interface HealthState {
  wsStatus: WsConnectionStatus;
  lastKrakenConnection: Date | null;
  lastMarketDataUpdate: Date | null;
  lastCompletedScan: Date | null;
}

/**
 * Derives the overall MONITORING/DEGRADED/OFFLINE status (spec section 33)
 * and writes it to monitor_health. Never reports MONITORING when the
 * underlying WS connection is down or data has gone stale — the PWA must
 * never be told the system is watching the market when it isn't.
 */
export async function reportHealth(state: HealthState): Promise<void> {
  const eligibleMarkets = await getEligibleMarkets();
  const activeSignals = await db.query.signals.findMany({
    where: inArray(signals.state, ["HIGH_PRIORITY", "ACTIVE", "STRENGTHENING", "WEAKENING"]),
    columns: { id: true },
  });

  const now = Date.now();
  const scanIsStale = !state.lastCompletedScan || now - state.lastCompletedScan.getTime() > 20 * 60 * 1000;
  const wsIsDown = state.wsStatus !== "CONNECTED";

  const status: "MONITORING" | "DEGRADED" | "OFFLINE" = wsIsDown && scanIsStale ? "OFFLINE" : wsIsDown || scanIsStale ? "DEGRADED" : "MONITORING";

  await updateMonitorHealth({
    status,
    lastKrakenConnection: state.lastKrakenConnection,
    lastMarketDataUpdate: state.lastMarketDataUpdate,
    lastCompletedScan: state.lastCompletedScan,
    eligibleMarketCount: eligibleMarkets.length,
    activeSetupCount: activeSignals.length,
  });

  logger.info("health_reported", { status, eligibleMarketCount: eligibleMarkets.length, activeSetupCount: activeSignals.length });
}
