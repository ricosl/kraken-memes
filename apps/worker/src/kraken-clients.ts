import WebSocket from "ws";
import { KrakenRestClient, KrakenWsClient, type KrakenWsClientOptions, type WsLike } from "@kraken-memes/shared";
import { logger } from "@kraken-memes/core";

export function createKrakenRestClient(): KrakenRestClient {
  return new KrakenRestClient({ baseUrl: process.env.KRAKEN_REST_BASE_URL ?? "https://api.kraken.com" });
}

export function createKrakenWsClient(
  onMessage: KrakenWsClientOptions["onMessage"],
  onStatusChange: KrakenWsClientOptions["onStatusChange"],
): KrakenWsClient {
  return new KrakenWsClient({
    url: process.env.KRAKEN_WS_URL ?? "wss://ws.kraken.com/v2",
    wsFactory: (url) => new WebSocket(url) as unknown as WsLike,
    onMessage,
    onStatusChange,
    logger,
  });
}
