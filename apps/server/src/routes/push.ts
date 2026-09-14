import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, getOrCreateDefaultUserId, logger, pushSubscriptions } from "@kraken-memes/core";

export const pushRouter = Router();

pushRouter.get("/push/vapid-public-key", (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    res.status(503).json({ error: "Push notifications are not configured on this server." });
    return;
  }
  res.json({ publicKey });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

pushRouter.post("/push/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid push subscription", details: parsed.error.flatten() });
    return;
  }

  const userId = await getOrCreateDefaultUserId();
  const userAgent = req.headers["user-agent"] ?? null;

  const [subscription] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      active: true,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, active: true, lastSeen: new Date(), userAgent },
    })
    .returning();

  logger.info("push_subscription_created", { subscriptionId: subscription?.id });
  res.status(201).json({ id: subscription?.id });
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

pushRouter.post("/push/unsubscribe", async (req, res) => {
  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  await db.update(pushSubscriptions).set({ active: false }).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));
  res.status(204).send();
});
