import { discoverMarketsFromKraken, suggestMemeClassification, type KrakenRestClient } from "@kraken-memes/shared";
import { logger } from "@kraken-memes/core";
import { upsertMarketFromDiscovery } from "./repository.js";

/**
 * Refreshes the markets table from Kraken's live AssetPairs list (spec
 * section 6: Kraken is the authoritative source, nothing hard-coded).
 * Failures are logged and swallowed — market discovery running late doesn't
 * bring the worker down, it just means the market list goes stale until the
 * next successful run (surfaced via monitor health/data freshness).
 */
export async function runMarketDiscovery(restClient: KrakenRestClient, quoteAsset: string): Promise<{ discovered: number } | null> {
  try {
    const assetPairs = await restClient.assetPairs();
    const discovered = discoverMarketsFromKraken(assetPairs, { quoteAsset });

    for (const market of discovered) {
      await upsertMarketFromDiscovery({
        krakenPairName: market.krakenPairName,
        symbol: market.symbol,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        active: market.active,
        priceDecimals: market.priceDecimals,
        quantityDecimals: market.quantityDecimals,
        minOrderSize: market.minOrderSize,
        ineligibleReason: market.ineligibleReason,
        suggestedClassification: suggestMemeClassification(market.baseAsset),
      });
    }

    logger.info("market_discovery_complete", { discovered: discovered.length });
    return { discovered: discovered.length };
  } catch (err) {
    logger.error("market_discovery_failed", { error: String(err) });
    return null;
  }
}
