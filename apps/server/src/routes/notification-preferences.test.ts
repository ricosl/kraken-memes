import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetTestData } from "../test/db-helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetTestData();
});

describe("notification preferences", () => {
  it("returns V1 defaults for a freshly created user", async () => {
    const res = await request(app).get("/api/notification-preferences");
    expect(res.status).toBe(200);
    expect(res.body.minScore).toBe(75);
    expect(res.body.newSetupEnabled).toBe(true);
    expect(res.body.invalidationEnabled).toBe(false);
    expect(res.body.cooldownMinutes).toBe(60);
  });

  it("persists an update", async () => {
    await request(app).get("/api/notification-preferences"); // ensure user exists
    const update = await request(app).put("/api/notification-preferences").send({ minScore: 82, quietStart: "22:00", quietEnd: "07:00" });
    expect(update.status).toBe(200);
    expect(update.body.minScore).toBe(82);
    expect(update.body.quietStart).toBe("22:00");

    const refetch = await request(app).get("/api/notification-preferences");
    expect(refetch.body.minScore).toBe(82);
  });

  it("rejects an invalid quiet-hours format", async () => {
    const res = await request(app).put("/api/notification-preferences").send({ quietStart: "not-a-time" });
    expect(res.status).toBe(400);
  });

  it("rejects a minScore outside [0, 100]", async () => {
    const res = await request(app).put("/api/notification-preferences").send({ minScore: 150 });
    expect(res.status).toBe(400);
  });
});
