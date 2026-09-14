import { sendPushToUser, type NotificationPayload } from "@kraken-memes/core";
import type { MarketCycleOutcome } from "./scan-cycle.js";

export interface BuildNotificationInput {
  symbol: string;
  score: number;
  outcome: MarketCycleOutcome;
  signalId: string;
}

/**
 * Builds the push notification content (spec section 20): concise, states
 * the detected setup and its levels, never uses hype language, never implies
 * a guaranteed outcome.
 */
export function buildNotificationPayload(input: BuildNotificationInput): NotificationPayload {
  const { symbol, score, outcome, signalId } = input;

  if (outcome.notification?.type === "INVALIDATED") {
    return {
      title: "Setup invalidated",
      body: `${symbol} moved past its invalidation level. Score was ${Math.round(score)}/100.`,
      url: `/alerts/${signalId}`,
      tag: `signal-${signalId}`,
      data: { signalId, type: "INVALIDATED" },
    };
  }

  const volumeRatio = outcome.volume.volumeAccelerationRatio;
  const volumeLine = Number.isFinite(volumeRatio) ? `Volume ${volumeRatio.toFixed(1)}x baseline` : "Volume sharply above baseline";
  const breakoutLine = outcome.momentum.brokeAboveRecentHigh ? "Breakout confirmed" : "Momentum building";
  const liquidityLine = `Liquidity: ${outcome.orderBook.liquidityQuality === "STRONG" ? "Strong" : outcome.orderBook.liquidityQuality === "MODERATE" ? "Moderate" : "Thin"}`;

  return {
    title: "🚨 High-Priority Setup",
    body: `${symbol}\nScore: ${Math.round(score)}/100\n${volumeLine}\n${breakoutLine}\n${liquidityLine}\n\nTap to view the evidence.`,
    url: `/alerts/${signalId}`,
    tag: `signal-${signalId}`,
    data: { signalId, type: "NEW_HIGH_PRIORITY" },
  };
}

export async function dispatchNotification(userId: string, payload: NotificationPayload) {
  return sendPushToUser(userId, payload);
}
