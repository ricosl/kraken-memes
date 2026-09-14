import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { pushSubscriptions } from "../db/schema.js";
import { logger } from "../logger.js";

let configured = false;

/** Configures the web-push library with VAPID credentials. Never expose the private key to the client. */
export function configureWebPush(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:ops@example.com";

  if (!publicKey || !privateKey) {
    logger.warn("vapid_not_configured", { message: "Push notifications are disabled until VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set." });
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  logger.info("vapid_configured");
}

export function isWebPushConfigured(): boolean {
  return configured;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url: string; // deep link opened when the notification is tapped
  tag: string; // used for OS-level notification grouping/replacement
  data?: Record<string, unknown>;
}

export interface SendResult {
  targeted: number;
  delivered: number;
}

/**
 * Sends a Web Push notification to every active subscription for a user,
 * removing subscriptions Kraken^H^H the push service reports as gone
 * (410 Gone / 404 Not Found) so we don't keep retrying a dead endpoint.
 */
export async function sendPushToUser(userId: string, payload: NotificationPayload): Promise<SendResult> {
  if (!configured) {
    logger.warn("push_send_skipped_not_configured", { userId });
    return { targeted: 0, delivered: 0 };
  }

  const subscriptions = await db.query.pushSubscriptions.findMany({
    where: (table, { eq: eqOp, and }) => and(eqOp(table.userId, userId), eqOp(table.active, true)),
  });

  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        delivered++;
        await db.update(pushSubscriptions).set({ lastSeen: new Date() }).where(eq(pushSubscriptions.id, sub.id));
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          logger.info("push_subscription_invalidated", { subscriptionId: sub.id, statusCode });
          await db.update(pushSubscriptions).set({ active: false }).where(eq(pushSubscriptions.id, sub.id));
        } else {
          logger.error("push_send_failed", { subscriptionId: sub.id, error: String(err) });
        }
      }
    }),
  );

  return { targeted: subscriptions.length, delivered };
}
