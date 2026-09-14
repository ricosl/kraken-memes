import type { KrakenWsMessage } from "./types.js";

/** Minimal structural type so we can inject the `ws` package or a fake in tests. */
export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "open" | "message" | "close" | "error", cb: (...args: any[]) => void): void;
}

export type WsFactory = (url: string) => WsLike;

export interface KrakenWsClientOptions {
  url?: string;
  wsFactory: WsFactory;
  /** Called with parsed messages as they arrive. */
  onMessage: (msg: KrakenWsMessage) => void;
  onStatusChange?: (status: "CONNECTING" | "CONNECTED" | "DISCONNECTED") => void;
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface KrakenSubscription {
  channel: "ticker" | "ohlc" | "trade" | "book";
  symbol: string[];
  interval?: number; // for ohlc, in minutes
  depth?: number; // for book
}

/**
 * Reconnecting Kraken WebSocket v2 client with exponential backoff.
 * The transport is injected (WsFactory) so this is fully unit-testable without
 * a real network connection — production code passes a factory backed by the
 * `ws` package, tests pass a fake in-memory implementation.
 */
export class KrakenWsClient {
  private readonly url: string;
  private readonly wsFactory: WsFactory;
  private readonly onMessage: (msg: KrakenWsMessage) => void;
  private readonly onStatusChange?: KrakenWsClientOptions["onStatusChange"];
  private readonly logger: NonNullable<KrakenWsClientOptions["logger"]>;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  private ws: WsLike | null = null;
  private backoffMs: number;
  private closedByUser = false;
  private subscriptions: KrakenSubscription[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: KrakenWsClientOptions) {
    this.url = options.url ?? "wss://ws.kraken.com/v2";
    this.wsFactory = options.wsFactory;
    this.onMessage = options.onMessage;
    this.onStatusChange = options.onStatusChange;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60000;
    this.backoffMs = this.initialBackoffMs;
    this.logger = options.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  connect(): void {
    this.closedByUser = false;
    this.onStatusChange?.("CONNECTING");
    this.logger.info("kraken_ws_connecting", { url: this.url });

    let socket: WsLike;
    try {
      socket = this.wsFactory(this.url);
    } catch (err) {
      this.logger.error("kraken_ws_connect_threw", { error: String(err) });
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.on("open", () => {
      this.logger.info("kraken_ws_connected");
      this.backoffMs = this.initialBackoffMs;
      this.onStatusChange?.("CONNECTED");
      for (const sub of this.subscriptions) this.sendSubscribe(sub);
    });

    socket.on("message", (data) => {
      try {
        const text = typeof data === "string" ? data : data instanceof Buffer ? data.toString("utf8") : String(data);
        const parsed = JSON.parse(text) as KrakenWsMessage;
        this.onMessage(parsed);
      } catch (err) {
        this.logger.warn("kraken_ws_parse_error", { error: String(err) });
      }
    });

    socket.on("close", (code, reason) => {
      this.logger.warn("kraken_ws_closed", { code, reason: reason?.toString() });
      this.onStatusChange?.("DISCONNECTED");
      if (!this.closedByUser) this.scheduleReconnect();
    });

    socket.on("error", (err) => {
      this.logger.error("kraken_ws_error", { error: err.message });
    });
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.logger.info("kraken_ws_reconnect_scheduled", { delayMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      this.connect();
    }, delay);
  }

  subscribe(sub: KrakenSubscription): void {
    this.subscriptions.push(sub);
    if (this.ws && this.ws.readyState === 1) this.sendSubscribe(sub);
  }

  private sendSubscribe(sub: KrakenSubscription): void {
    const params: Record<string, unknown> = { channel: sub.channel, symbol: sub.symbol };
    if (sub.interval !== undefined) params.interval = sub.interval;
    if (sub.depth !== undefined) params.depth = sub.depth;
    this.ws?.send(JSON.stringify({ method: "subscribe", params }));
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, "client_closing");
  }

  get currentBackoffMs(): number {
    return this.backoffMs;
  }
}
