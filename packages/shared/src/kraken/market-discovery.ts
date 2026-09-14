import type { Market } from "../types.js";
import type { KrakenAssetPair } from "./types.js";

export interface MarketDiscoveryOptions {
  /** Only include markets quoted in this asset, e.g. "USD". */
  quoteAsset: string;
  now?: () => string;
  /** Existing firstSeen timestamps, keyed by krakenPairName, to preserve across re-discovery runs. */
  knownFirstSeen?: Record<string, string>;
}

const INACTIVE_STATUSES = new Set(["cancel_only", "post_only", "limit_only", "reduce_only", "delisted", "maintenance"]);

/**
 * Turns Kraken's raw AssetPairs response into our normalized Market list,
 * restricted to the configured quote asset (V1: USD) and active spot pairs.
 * Kraken is the source of truth here — nothing is hard-coded.
 */
export function discoverMarketsFromKraken(
  assetPairs: Record<string, KrakenAssetPair>,
  options: MarketDiscoveryOptions,
): Market[] {
  const now = options.now ?? (() => new Date().toISOString());
  const markets: Market[] = [];

  for (const [krakenPairName, pair] of Object.entries(assetPairs)) {
    const quote = normalizeAsset(pair.quote);
    if (quote !== options.quoteAsset) continue;

    // Kraken flags dark-pool / non-standard pairs with a ".d" suffix on wsname; skip those.
    if (pair.wsname?.includes(".d")) continue;

    const status = pair.status ?? "online";
    const active = status === "online";

    const symbol = pair.wsname ?? `${normalizeAsset(pair.base)}/${quote}`;
    const firstSeen = options.knownFirstSeen?.[krakenPairName] ?? now();

    markets.push({
      id: krakenPairName,
      symbol,
      krakenPairName,
      baseAsset: normalizeAsset(pair.base),
      quoteAsset: quote,
      active: active && !INACTIVE_STATUSES.has(status),
      memeClassification: "PENDING_REVIEW",
      firstSeen,
      priceDecimals: pair.pair_decimals,
      quantityDecimals: pair.lot_decimals,
      minOrderSize: pair.ordermin ? Number(pair.ordermin) : 0,
      ineligibleReason: active ? null : `Kraken status: ${status}`,
    });
  }

  return markets;
}

/** Kraken prefixes some legacy assets with X/Z (e.g. XXBT, ZUSD, XXDG). Strip those for display. */
export function normalizeAsset(krakenAsset: string): string {
  if (krakenAsset.length === 4 && (krakenAsset.startsWith("X") || krakenAsset.startsWith("Z"))) {
    const stripped = krakenAsset.slice(1);
    // Known legacy remaps
    if (stripped === "XBT") return "BTC";
    if (stripped === "XDG") return "DOGE";
    return stripped;
  }
  if (krakenAsset === "XBT") return "BTC";
  return krakenAsset;
}
