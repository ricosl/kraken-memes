import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetTestData, createTestMarket } from "../test/db-helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetTestData();
});

describe("GET /api/markets", () => {
  it("only returns eligible (active + meme-classified) markets by default", async () => {
    await createTestMarket({ krakenPairName: "AUTOUSD", memeClassification: "AUTO_CLASSIFIED", active: true });
    await createTestMarket({ krakenPairName: "PENDINGUSD", memeClassification: "PENDING_REVIEW", active: true });
    await createTestMarket({ krakenPairName: "EXCLUDEDUSD", memeClassification: "EXCLUDED", active: true });
    await createTestMarket({ krakenPairName: "INACTIVEUSD", memeClassification: "INCLUDED", active: false });

    const res = await request(app).get("/api/markets");
    expect(res.status).toBe(200);
    const symbols = res.body.map((r: { market: { krakenPairName: string } }) => r.market.krakenPairName);
    expect(symbols).toContain("AUTOUSD");
    expect(symbols).not.toContain("PENDINGUSD");
    expect(symbols).not.toContain("EXCLUDEDUSD");
    expect(symbols).not.toContain("INACTIVEUSD");
  });

  it("returns everything when eligibleOnly=false", async () => {
    await createTestMarket({ krakenPairName: "PENDINGUSD", memeClassification: "PENDING_REVIEW" });
    const res = await request(app).get("/api/markets?eligibleOnly=false");
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe("PATCH /api/markets/:id/classification", () => {
  it("overrides the classification and marks it as manually overridden", async () => {
    const market = await createTestMarket({ memeClassification: "PENDING_REVIEW" });
    const res = await request(app).patch(`/api/markets/${market.id}/classification`).send({ classification: "INCLUDED" });
    expect(res.status).toBe(200);
    expect(res.body.memeClassification).toBe("INCLUDED");
    expect(res.body.classificationOverridden).toBe(true);
  });

  it("rejects an invalid classification value", async () => {
    const market = await createTestMarket();
    const res = await request(app).patch(`/api/markets/${market.id}/classification`).send({ classification: "NOT_A_REAL_VALUE" });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown market", async () => {
    const res = await request(app).patch("/api/markets/00000000-0000-0000-0000-000000000000/classification").send({ classification: "INCLUDED" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/markets/:id", () => {
  it("returns coin-detail payload shape", async () => {
    const market = await createTestMarket();
    const res = await request(app).get(`/api/markets/${market.id}`);
    expect(res.status).toBe(200);
    expect(res.body.market.id).toBe(market.id);
    expect(res.body).toHaveProperty("candles");
    expect(res.body).toHaveProperty("signalHistory");
  });
});
