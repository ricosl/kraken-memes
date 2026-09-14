import { configureWebPush, logger, pool } from "@kraken-memes/core";
import { NoopSocialSignalProvider, type SocialSignalProvider } from "@kraken-memes/shared";
import { createKrakenRestClient } from "./kraken-clients.js";
import { runMarketDiscovery } from "./market-discovery.js";
import { getEligibleMarkets } from "./repository.js";
import { ingestMarketData } from "./data-ingestion.js";
import { runScanCycle } from "./scan-runner.js";
import { reportHealth } from "./health-reporter.js";

const QUOTE_ASSET = process.env.KRAKEN_QUOTE_ASSET ?? "USD";
// How far back to ask Kraken for trades on every run. Must comfortably cover
// the interval between cron invocations (Render's free Cron Job schedule) so
// no trade window is missed; the unique (marketId, krakenTradeId) index means
// re-fetching an overlapping window never inserts a duplicate row.
const TRADE_LOOKBACK_MINUTES = Number(process.env.WORKER_CRON_TRADE_LOOKBACK_MINUTES) || 20;

function selectSocialProvider(): SocialSignalProvider {
  const configured = process.env.SOCIAL_PROVIDER ?? "none";
  if (configured !== "none") {
    logger.warn("social_provider_not_implemented", { configured, message: "Falling back to no-op provider; social signals will be marked unavailable." });
  }
  return new NoopSocialSignalProvider();
}

/**
 * Single-pass entrypoint for running the worker as a scheduled job (e.g. a
 * Render free-tier Cron Job) instead of a persistent daemon (index.ts).
 * Does one full discovery -> ingest -> scan -> health-report cycle, then
 * exits. Trades a live Kraken WebSocket connection (and the resulting
 * sub-minute data-freshness signal) for zero hosting cost — see
 * DEPLOYMENT.md for the tradeoff and how to switch to the persistent daemon.
 */
async function main() {
  const startedAt = Date.now();
  logger.info("cron_run_starting", { quoteAsset: QUOTE_ASSET });

  configureWebPush();
  const restClient = createKrakenRestClient();
  const socialProvider = selectSocialProvider();
  const sinceTimestamp = String(Math.floor(startedAt / 1000) - TRADE_LOOKBACK_MINUTES * 60);

  await runMarketDiscovery(restClient, QUOTE_ASSET);

  const eligibleMarkets = await getEligibleMarkets();
  let candlesIngested = 0;
  for (const market of eligibleMarkets) {
    const result = await ingestMarketData(restClient, market.id, market.krakenPairName, sinceTimestamp);
    candlesIngested += result.candlesIngested;
  }

  const scanSummary = await runScanCycle(socialProvider);

  const cronIntervalMinutes = Number(process.env.WORKER_CRON_INTERVAL_MINUTES) || 15;
  await reportHealth(
    {
      // A cron-mode worker never holds a live connection between runs; that's
      // expected (requireLiveConnection: false below), not a fault.
      wsStatus: "DISCONNECTED",
      lastKrakenConnection: eligibleMarkets.length > 0 ? new Date() : null,
      lastMarketDataUpdate: eligibleMarkets.length > 0 ? new Date() : null,
      lastCompletedScan: new Date(),
    },
    {
      requireLiveConnection: false,
      // Allow a bit more than one full interval before calling it stale, so a
      // single slightly-delayed cron tick doesn't flip the status to DEGRADED.
      scanStaleAfterMs: (cronIntervalMinutes * 2 + 5) * 60 * 1000,
    },
  );

  logger.info("cron_run_complete", { ...scanSummary, candlesIngested, marketsConsidered: eligibleMarkets.length, durationMs: Date.now() - startedAt });

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  logger.error("cron_run_failed", { error: String(err) });
  await pool.end().catch(() => {});
  process.exit(1);
});
