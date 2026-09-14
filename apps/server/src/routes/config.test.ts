import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { db } from "../db/client.js";
import { scanConfig } from "../db/schema.js";
import { createApp } from "../app.js";

const app = createApp();

beforeEach(async () => {
  await db.insert(scanConfig).values({ id: 1 }).onConflictDoUpdate({
    target: scanConfig.id,
    set: {
      targetPct: 0.07,
      invalidationPct: -0.03,
      observationWindowHours: 24,
      weights: { volumeAcceleration: 35, breakoutStructure: 25, liquidityOrderBook: 20, marketRegime: 10, social: 10 },
    },
  });
});

describe("GET /api/config", () => {
  it("returns the V1 defaults", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.targetPct).toBeCloseTo(0.07);
    expect(res.body.invalidationPct).toBeCloseTo(-0.03);
    expect(res.body.observationWindowHours).toBe(24);
  });
});

describe("PUT /api/config", () => {
  it("updates target/invalidation/observation window", async () => {
    const res = await request(app).put("/api/config").send({ targetPct: 0.1, invalidationPct: -0.05, observationWindowHours: 12 });
    expect(res.status).toBe(200);
    expect(res.body.targetPct).toBeCloseTo(0.1);
    expect(res.body.observationWindowHours).toBe(12);
  });

  it("updates score weights", async () => {
    const weights = { volumeAcceleration: 50, breakoutStructure: 20, liquidityOrderBook: 15, marketRegime: 10, social: 5 };
    const res = await request(app).put("/api/config").send({ weights });
    expect(res.status).toBe(200);
    expect(res.body.weights).toEqual(weights);
  });

  it("rejects an invalid target percentage", async () => {
    const res = await request(app).put("/api/config").send({ targetPct: 1.5 });
    expect(res.status).toBe(400);
  });

  it("rejects a positive invalidation percentage (must be negative)", async () => {
    const res = await request(app).put("/api/config").send({ invalidationPct: 0.05 });
    expect(res.status).toBe(400);
  });
});
