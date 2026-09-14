import type {
  KrakenAssetPairsResponse,
  KrakenDepthResponse,
  KrakenOhlcResponse,
  KrakenSystemStatusResponse,
  KrakenTradesResponse,
} from "./types.js";

export interface KrakenRestClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Minimum ms between requests, to stay well under Kraken's public rate limits. */
  minRequestIntervalMs?: number;
}

export class KrakenApiError extends Error {
  constructor(
    message: string,
    public readonly krakenErrors: string[],
  ) {
    super(message);
    this.name = "KrakenApiError";
  }
}

/**
 * Thin wrapper around Kraken's public REST API. No authentication, no trading
 * endpoints are used or supported by this client — read-only market data only.
 */
export class KrakenRestClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minRequestIntervalMs: number;
  private lastRequestAt = 0;

  constructor(options: KrakenRestClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://api.kraken.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 1100;
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minRequestIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestIntervalMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  private async get<T extends { error: string[] }>(path: string, params: Record<string, string> = {}): Promise<T> {
    await this.throttle();
    const url = new URL(`/0/public/${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const res = await this.fetchImpl(url.toString());
    if (!res.ok) {
      throw new KrakenApiError(`Kraken REST ${path} returned HTTP ${res.status}`, []);
    }
    const body = (await res.json()) as T;
    if (body.error?.length) {
      throw new KrakenApiError(`Kraken REST ${path} returned errors: ${body.error.join(", ")}`, body.error);
    }
    return body;
  }

  async systemStatus(): Promise<KrakenSystemStatusResponse["result"]> {
    const res = await this.get<KrakenSystemStatusResponse>("SystemStatus");
    return res.result;
  }

  async assetPairs(): Promise<KrakenAssetPairsResponse["result"]> {
    const res = await this.get<KrakenAssetPairsResponse>("AssetPairs");
    return res.result;
  }

  async ohlc(pair: string, interval: number, since?: number): Promise<KrakenOhlcResponse["result"]> {
    const params: Record<string, string> = { pair, interval: String(interval) };
    if (since !== undefined) params.since = String(since);
    const res = await this.get<KrakenOhlcResponse>("OHLC", params);
    return res.result;
  }

  async trades(pair: string, since?: string): Promise<KrakenTradesResponse["result"]> {
    const params: Record<string, string> = { pair };
    if (since !== undefined) params.since = since;
    const res = await this.get<KrakenTradesResponse>("Trades", params);
    return res.result;
  }

  async depth(pair: string, count = 100): Promise<KrakenDepthResponse["result"]> {
    const res = await this.get<KrakenDepthResponse>("Depth", { pair, count: String(count) });
    return res.result;
  }
}
