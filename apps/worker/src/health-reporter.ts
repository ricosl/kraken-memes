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

export interface ReportHealthOptions {
  /**
   * Whether this deployment mode is expected to hold a live Kraken WS
   * connection between health reports. The persistent daemon (index.ts) is;
   * a scheduled one-shot run (cron.ts) never is by design, so penalizing it
   * for `wsStatus !== "CONNECTED"` would make a correctly-working cron
   * deployment look permanently DEGRADED. Default true (daemon behavior).
   */
  requireLiveConnection?: boolean;
  /** How stale lastCompletedScan can be before health degrades, in ms. Should track the actual run cadence. */
  scanStaleAfterMs?: number;
}

/**
 * Derives the overall MONITORING/DEGRADED/OFFLINE status (spec section 33)
 * and writes it to monitor_health. Never reports MONITORING when data has
 * gone stale for *this deployment's own cadence* — the PWA must never be
 * told the system is watching the market when it isn't, but a scheduled
 * cron deployment's idea of "stale" is necessarily its own run interval, not
 * the persistent daemon's sub-minute one.
 */
export async function reportHealth(state: HealthState, options: ReportHealthOptions = {}): Promise<void> {
  const requireLiveConnection = options.requireLiveConnection ?? true;
  const scanStaleAfterMs = options.scanStaleAfterMs ?? 20 * 60 * 1000;

  const eligibleMarkets = await getEligibleMarkets();
  const activeSignals = await db.query.signals.findMany({
    where: inArray(signals.state, ["HIGH_PRIORITY", "ACTIVE", "STRENGTHENING", "WEAKENING"]),
    columns: { id: true },
  });

  const now = Date.now();
  const scanIsStale = !state.lastCompletedScan || now - state.lastCompletedScan.getTime() > scanStaleAfterMs;
  const wsIsDown = requireLiveConnection && state.wsStatus !== "CONNECTED";

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
