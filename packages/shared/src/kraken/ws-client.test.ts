import { describe, expect, it, vi } from "vitest";
import { KrakenWsClient, type WsFactory, type WsLike } from "./ws-client.js";

class FakeWs implements WsLike {
  readyState = 0; // CONNECTING
  listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  sent: string[] = [];
  closed = false;

  on(event: string, cb: (...args: unknown[]) => void): void {
    (this.listeners[event] ??= []).push(cb);
  }
  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.listeners[event] ?? []) cb(...args);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.emit("close", 1000, Buffer.from(""));
  }
  open(): void {
    this.readyState = 1;
    this.emit("open");
  }
}

function makeFactory(instances: FakeWs[]): WsFactory {
  return () => {
    const ws = new FakeWs();
    instances.push(ws);
    return ws;
  };
}

describe("KrakenWsClient", () => {
  it("subscribes to configured channels once connected", () => {
    const instances: FakeWs[] = [];
    const client = new KrakenWsClient({ wsFactory: makeFactory(instances), onMessage: () => {} });
    client.subscribe({ channel: "ticker", symbol: ["DOGE/USD"] });
    client.connect();
    instances[0]!.open();

    expect(instances[0]!.sent).toHaveLength(1);
    const sentMsg = JSON.parse(instances[0]!.sent[0]!);
    expect(sentMsg.method).toBe("subscribe");
    expect(sentMsg.params.channel).toBe("ticker");
    expect(sentMsg.params.symbol).toEqual(["DOGE/USD"]);
  });

  it("parses incoming messages and forwards them via onMessage", () => {
    const instances: FakeWs[] = [];
    const received: unknown[] = [];
    const client = new KrakenWsClient({ wsFactory: makeFactory(instances), onMessage: (m) => received.push(m) });
    client.connect();
    instances[0]!.open();
    instances[0]!.emit("message", JSON.stringify({ channel: "heartbeat" }));

    expect(received).toEqual([{ channel: "heartbeat" }]);
  });

  it("reports status transitions through onStatusChange", () => {
    const instances: FakeWs[] = [];
    const statuses: string[] = [];
    const client = new KrakenWsClient({
      wsFactory: makeFactory(instances),
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
    });
    client.connect();
    instances[0]!.open();
    expect(statuses).toEqual(["CONNECTING", "CONNECTED"]);
  });

  it("schedules a reconnect with exponential backoff after an unexpected close", async () => {
    vi.useFakeTimers();
    const instances: FakeWs[] = [];
    const client = new KrakenWsClient({
      wsFactory: makeFactory(instances),
      onMessage: () => {},
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
    });
    client.connect();
    instances[0]!.open();
    expect(client.currentBackoffMs).toBe(100);

    instances[0]!.emit("close", 1006, Buffer.from("abnormal"));
    // Backoff doubles as soon as a reconnect is scheduled.
    expect(client.currentBackoffMs).toBe(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(instances).toHaveLength(2);

    instances[1]!.emit("close", 1006, Buffer.from("abnormal again"));
    await vi.advanceTimersByTimeAsync(200);
    expect(instances).toHaveLength(3);

    vi.useRealTimers();
  });

  it("does not reconnect after an intentional close() call", async () => {
    vi.useFakeTimers();
    const instances: FakeWs[] = [];
    const client = new KrakenWsClient({ wsFactory: makeFactory(instances), onMessage: () => {}, initialBackoffMs: 50 });
    client.connect();
    instances[0]!.open();
    client.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(instances).toHaveLength(1);
    vi.useRealTimers();
  });
});
