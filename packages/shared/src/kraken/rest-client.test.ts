import { describe, expect, it, vi } from "vitest";
import { KrakenApiError, KrakenRestClient } from "./rest-client.js";

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("KrakenRestClient", () => {
  it("parses a successful AssetPairs response", async () => {
    const fetchImpl = fakeFetch({ error: [], result: { XDGUSD: { altname: "DOGEUSD" } } });
    const client = new KrakenRestClient({ fetchImpl, minRequestIntervalMs: 0 });
    const result = await client.assetPairs();
    expect(result.XDGUSD).toBeDefined();
  });

  it("throws KrakenApiError when Kraken returns an error array", async () => {
    const fetchImpl = fakeFetch({ error: ["EQuery:Unknown asset pair"], result: {} });
    const client = new KrakenRestClient({ fetchImpl, minRequestIntervalMs: 0 });
    await expect(client.assetPairs()).rejects.toThrow(KrakenApiError);
  });

  it("throws when the HTTP response is not ok", async () => {
    const fetchImpl = fakeFetch({}, false, 503);
    const client = new KrakenRestClient({ fetchImpl, minRequestIntervalMs: 0 });
    await expect(client.systemStatus()).rejects.toThrow(/503/);
  });

  it("throttles consecutive requests to respect Kraken's public rate limits", async () => {
    const fetchImpl = fakeFetch({ error: [], result: {} });
    const client = new KrakenRestClient({ fetchImpl, minRequestIntervalMs: 50 });
    const start = Date.now();
    await client.assetPairs();
    await client.assetPairs();
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("passes query parameters through to the request URL", async () => {
    const fetchImpl = fakeFetch({ error: [], result: { last: 0 } });
    const client = new KrakenRestClient({ fetchImpl, minRequestIntervalMs: 0 });
    await client.ohlc("XDGUSD", 15);
    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("pair=XDGUSD");
    expect(calledUrl).toContain("interval=15");
  });
});
