import { describe, expect, it } from "vitest";
import { discoverMarketsFromKraken, normalizeAsset } from "./market-discovery.js";
import type { KrakenAssetPair } from "./types.js";

function pair(overrides: Partial<KrakenAssetPair>): KrakenAssetPair {
  return {
    altname: "DOGEUSD",
    wsname: "DOGE/USD",
    base: "XDG",
    quote: "ZUSD",
    status: "online",
    pair_decimals: 5,
    lot_decimals: 8,
    ordermin: "10",
    ...overrides,
  };
}

describe("discoverMarketsFromKraken", () => {
  it("includes only pairs quoted in the configured quote asset", () => {
    const markets = discoverMarketsFromKraken(
      {
        XDGUSD: pair({ wsname: "DOGE/USD", quote: "ZUSD" }),
        XDGEUR: pair({ wsname: "DOGE/EUR", quote: "ZEUR" }),
      },
      { quoteAsset: "USD" },
    );
    expect(markets).toHaveLength(1);
    expect(markets[0]!.symbol).toBe("DOGE/USD");
  });

  it("marks non-online pairs inactive with a reason, but still includes them", () => {
    const markets = discoverMarketsFromKraken(
      { XDGUSD: pair({ status: "delisted" }) },
      { quoteAsset: "USD" },
    );
    expect(markets[0]!.active).toBe(false);
    expect(markets[0]!.ineligibleReason).toContain("delisted");
  });

  it("excludes dark-pool (.d) pairs", () => {
    const markets = discoverMarketsFromKraken(
      { "XDGUSD.d": pair({ wsname: "DOGE/USD.d" }) },
      { quoteAsset: "USD" },
    );
    expect(markets).toHaveLength(0);
  });

  it("preserves a known firstSeen timestamp across re-discovery runs", () => {
    const markets = discoverMarketsFromKraken(
      { XDGUSD: pair({}) },
      { quoteAsset: "USD", knownFirstSeen: { XDGUSD: "2020-01-01T00:00:00.000Z" } },
    );
    expect(markets[0]!.firstSeen).toBe("2020-01-01T00:00:00.000Z");
  });

  it("defaults new markets to PENDING_REVIEW meme classification, never hard-coded", () => {
    const markets = discoverMarketsFromKraken({ XDGUSD: pair({}) }, { quoteAsset: "USD" });
    expect(markets[0]!.memeClassification).toBe("PENDING_REVIEW");
  });
});

describe("normalizeAsset", () => {
  it("strips Kraken's legacy X/Z prefixes", () => {
    expect(normalizeAsset("XXBT")).toBe("BTC");
    expect(normalizeAsset("XXDG")).toBe("DOGE");
    expect(normalizeAsset("ZUSD")).toBe("USD");
  });

  it("leaves modern asset codes unchanged", () => {
    expect(normalizeAsset("SOL")).toBe("SOL");
    expect(normalizeAsset("PEPE")).toBe("PEPE");
  });
});
