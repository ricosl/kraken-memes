import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetTestData } from "../test/db-helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetTestData();
});

describe("push subscription endpoints", () => {
  it("exposes the public VAPID key (never the private key)", async () => {
    const res = await request(app).get("/api/push/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/private/i);
  });

  it("accepts a valid subscription", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ endpoint: "https://fcm.googleapis.com/fcm/send/abc123", keys: { p256dh: "test-p256dh", auth: "test-auth" } });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("rejects a subscription missing keys", async () => {
    const res = await request(app).post("/api/push/subscribe").send({ endpoint: "https://fcm.googleapis.com/fcm/send/abc123" });
    expect(res.status).toBe(400);
  });

  it("upserts on the same endpoint rather than erroring", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/dup";
    const first = await request(app).post("/api/push/subscribe").send({ endpoint, keys: { p256dh: "a", auth: "b" } });
    const second = await request(app).post("/api/push/subscribe").send({ endpoint, keys: { p256dh: "c", auth: "d" } });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("deactivates a subscription on unsubscribe", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/unsub-me";
    await request(app).post("/api/push/subscribe").send({ endpoint, keys: { p256dh: "a", auth: "b" } });
    const res = await request(app).post("/api/push/unsubscribe").send({ endpoint });
    expect(res.status).toBe(204);
  });
});
