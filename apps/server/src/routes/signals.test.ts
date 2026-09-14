import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { createTestMarket, createTestSignal, resetTestData } from "../test/db-helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetTestData();
});

describe("GET /api/signals", () => {
  it("filters by bucket=active vs bucket=completed", async () => {
    const market = await createTestMarket();
    await createTestSignal(market.id, { state: "HIGH_PRIORITY" });
    await createTestSignal(market.id, { state: "TARGET_REACHED" });
    await createTestSignal(market.id, { state: "WATCH" });

    const active = await request(app).get("/api/signals?bucket=active");
    expect(active.body.map((s: { state: string }) => s.state).sort()).toEqual(["HIGH_PRIORITY", "WATCH"]);

    const completed = await request(app).get("/api/signals?bucket=completed");
    expect(completed.body.map((s: { state: string }) => s.state)).toEqual(["TARGET_REACHED"]);
  });

  it("includes the related market in each signal", async () => {
    const market = await createTestMarket();
    await createTestSignal(market.id);
    const res = await request(app).get("/api/signals");
    expect(res.body[0].market.id).toBe(market.id);
  });
});

describe("GET /api/signals/top", () => {
  it("ranks by score descending and excludes terminal states", async () => {
    const market = await createTestMarket();
    await createTestSignal(market.id, { score: 60, state: "QUALIFIED" });
    await createTestSignal(market.id, { score: 90, state: "HIGH_PRIORITY" });
    await createTestSignal(market.id, { score: 99, state: "REJECTED" }); // excluded: terminal

    const res = await request(app).get("/api/signals/top");
    expect(res.body[0].score).toBe(90);
    expect(res.body.some((s: { state: string }) => s.state === "REJECTED")).toBe(false);
  });
});

describe("GET /api/signals/:id", () => {
  it("returns 404 for a nonexistent signal", async () => {
    const res = await request(app).get("/api/signals/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
