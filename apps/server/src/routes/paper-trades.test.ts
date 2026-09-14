import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { createTestMarket, createTestSignal, resetTestData } from "../test/db-helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetTestData();
});

describe("paper trade lifecycle", () => {
  it("opens a paper trade from a signal and closes it as a winner at the target price", async () => {
    const market = await createTestMarket();
    const signal = await createTestSignal(market.id, { entryPriceRef: 100, targetPrice: 107, invalidationPrice: 97 });

    const openRes = await request(app).post("/api/paper-trades").send({ signalId: signal.id, positionSizeUsd: 1000 });
    expect(openRes.status).toBe(201);
    expect(openRes.body.outcome).toBe("OPEN");
    // Entry fill should include slippage, so it should not be exactly the raw reference price.
    expect(openRes.body.entryPrice).not.toBe(100);

    const closeRes = await request(app).post(`/api/paper-trades/${openRes.body.id}/close`).send({ exitPrice: 108 });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.outcome).toBe("TARGET_HIT");
    expect(closeRes.body.realizedPnlUsd).toBeGreaterThan(0);
  });

  it("closes a paper trade as invalidated with a negative P/L when exit is at/below the invalidation price", async () => {
    const market = await createTestMarket();
    const signal = await createTestSignal(market.id, { entryPriceRef: 100, targetPrice: 107, invalidationPrice: 97 });
    const openRes = await request(app).post("/api/paper-trades").send({ signalId: signal.id, positionSizeUsd: 1000 });

    const closeRes = await request(app).post(`/api/paper-trades/${openRes.body.id}/close`).send({ exitPrice: 96 });
    expect(closeRes.body.outcome).toBe("INVALIDATED");
    expect(closeRes.body.realizedPnlUsd).toBeLessThan(0);
  });

  it("rejects closing an already-closed trade", async () => {
    const market = await createTestMarket();
    const signal = await createTestSignal(market.id);
    const openRes = await request(app).post("/api/paper-trades").send({ signalId: signal.id, positionSizeUsd: 1000 });
    await request(app).post(`/api/paper-trades/${openRes.body.id}/close`).send({ exitPrice: 108 });

    const secondClose = await request(app).post(`/api/paper-trades/${openRes.body.id}/close`).send({ exitPrice: 108 });
    expect(secondClose.status).toBe(409);
  });

  it("404s when opening a trade for a nonexistent signal", async () => {
    const res = await request(app).post("/api/paper-trades").send({ signalId: "00000000-0000-0000-0000-000000000000", positionSizeUsd: 1000 });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid position size", async () => {
    const market = await createTestMarket();
    const signal = await createTestSignal(market.id);
    const res = await request(app).post("/api/paper-trades").send({ signalId: signal.id, positionSizeUsd: -50 });
    expect(res.status).toBe(400);
  });
});
