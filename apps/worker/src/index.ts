import { logger, pool } from "@kraken-memes/core";
import { NoopSocialSignalProvider, type SocialSignalProvider } from "@kraken-memes/shared";
import { createKrakenRestClient, createKrakenWsClient } from "./kraken-clients.js";
import { runMarketDiscovery } from "./market-discovery.js";
import { getAllMarkets, getEligibleMarkets } from "./repository.js";
import { ingestMarketData } from "./data-ingestion.js";
import { runScanCycle } from "./scan-runner.js";
import { reportHealth, type WsConnectionStatus } from "./health-reporter.js";

const QUOTE_ASSET = process.env.KRAKEN_QUOTE_ASSET ?? "USD";
const SCAN_INTERVAL_MS = (Number(process.env.WORKER_SCAN_INTERVAL_MINUTES) || 15) * 60 * 1000;
const MARKET_DISCOVERY_INTERVAL_MS = 30 * 60 * 1000;
const DATA_INGESTION_INTERVAL_MS = 60 * 1000;
const HEALTH_REPORT_INTERVAL_MS = 30 * 1000;

function selectSocialProvider(): SocialSignalProvider {
  const configured = process.env.SOCIAL_PROVIDER ?? "none";
  if (configured !== "none") {
    logger.warn("social_provider_not_implemented", { configured, message: "Falling back to no-op provider; social signals will be marked unavailable." });
  }
  return new NoopSocialSignalProvider();
}

async function main() {
  logger.info("worker_starting", { scanIntervalMs: SCAN_INTERVAL_MS, quoteAsset: QUOTE_ASSET });

  const restClient = createKrakenRestClient();
  const socialProvider = selectSocialProvider();

  const health = {
    wsStatus: "CONNECTING" as WsConnectionStatus,
    lastKrakenConnection: null as Date | null,
    lastMarketDataUpdate: null as Date | null,
    lastCompletedScan: null as Date | null,
  };

  const tradeCursors = new Map<string, string | null>();

  const wsClient = createKrakenWsClient(
    (msg) => {
      health.lastMarketDataUpdate = new Date();
      if ("channel" in msg && msg.channel === "heartbeat") {
        logger.info("kraken_ws_heartbeat");
      }
    },
    (status) => {
      health.wsStatus = status;
      if (status === "CONNECTED") health.lastKrakenConnection = new Date();
      logger.info("kraken_ws_status_change", { status });
    },
  );

  async function discoveryTick() {
    const result = await runMarketDiscovery(restClient, QUOTE_ASSET);
    if (result) {
      // (Re)subscribe the WS client to ticker updates for every known market so
      // health.lastMarketDataUpdate reflects real Kraken activity, not just our
      // own REST polling.
      const allMarkets = await getAllMarkets();
      const symbols = allMarkets.map((m) => m.symbol);
      if (symbols.length > 0) wsClient.subscribe({ channel: "ticker", symbol: symbols });
    }
  }

  async function ingestionTick() {
    const eligibleMarkets = await getEligibleMarkets();
    for (const market of eligibleMarkets) {
      const cursor = tradeCursors.get(market.id) ?? null;
      const result = await ingestMarketData(restClient, market.id, market.krakenPairName, cursor);
      tradeCursors.set(market.id, result.newTradeCursor);
    }
    if (eligibleMarkets.length > 0) health.lastMarketDataUpdate = new Date();
  }

  async function scanTick() {
    try {
      await runScanCycle(socialProvider);
      health.lastCompletedScan = new Date();
    } catch (err) {
      logger.error("scan_cycle_failed", { error: String(err) });
    }
  }

  async function healthTick() {
    try {
      await reportHealth(health);
    } catch (err) {
      logger.error("health_report_failed", { error: String(err) });
    }
  }

  wsClient.connect();

  await discoveryTick();
  await ingestionTick();
  await healthTick();

  const timers = [
    setInterval(() => void discoveryTick(), MARKET_DISCOVERY_INTERVAL_MS),
    setInterval(() => void ingestionTick(), DATA_INGESTION_INTERVAL_MS),
    setInterval(() => void scanTick(), SCAN_INTERVAL_MS),
    setInterval(() => void healthTick(), HEALTH_REPORT_INTERVAL_MS),
  ];

  logger.info("worker_started");

  async function shutdown(signal: string) {
    logger.info("worker_shutting_down", { signal });
    for (const timer of timers) clearInterval(timer);
    wsClient.close();
    await pool.end();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("worker_fatal_error", { error: String(err) });
  process.exit(1);
});
