import type { SignalState } from "../types.js";

export type NotificationType = "NEW_HIGH_PRIORITY" | "INVALIDATED";

export interface NotificationPreferencesInput {
  enabled: boolean;
  minScore: number;
  /** "HH:MM" 24h UTC, or null for no quiet hours. */
  quietStart: string | null;
  quietEnd: string | null;
  cooldownMinutes: number;
  newSetupEnabled: boolean;
  invalidationEnabled: boolean;
}

export interface NotificationDecisionInput {
  preferences: NotificationPreferencesInput;
  notificationType: NotificationType;
  score: number;
  toState: SignalState;
  /** The state most recently notified for this same market, if any (across its signal history). */
  lastNotifiedState: SignalState | null;
  lastNotificationAt: string | null; // ISO, for this market
  now: Date;
}

export interface NotificationDecision {
  shouldSend: boolean;
  reason: string;
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True when `now` (UTC) falls within the [quietStart, quietEnd) window, handling overnight wraparound. */
export function isWithinQuietHours(quietStart: string | null, quietEnd: string | null, now: Date): boolean {
  if (!quietStart || !quietEnd) return false;
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = parseHHMM(quietStart);
  const end = parseHHMM(quietEnd);
  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end; // wraps past midnight
}

/**
 * Notification dedup/cooldown/quiet-hours gate (spec sections 21-22). A
 * meaningful state change (the resulting state differs from the last state
 * notified for this market) is allowed to bypass the cooldown; a repeat
 * notification for the same resulting state within the cooldown window is
 * suppressed as a duplicate.
 */
export function decideNotification(input: NotificationDecisionInput): NotificationDecision {
  const { preferences, notificationType, score, toState, lastNotifiedState, lastNotificationAt, now } = input;

  if (!preferences.enabled) return { shouldSend: false, reason: "Notifications disabled by user preference." };

  if (notificationType === "NEW_HIGH_PRIORITY" && !preferences.newSetupEnabled) {
    return { shouldSend: false, reason: "New-setup notifications disabled." };
  }
  if (notificationType === "INVALIDATED" && !preferences.invalidationEnabled) {
    return { shouldSend: false, reason: "Invalidation notifications disabled." };
  }

  if (notificationType === "NEW_HIGH_PRIORITY" && score < preferences.minScore) {
    return { shouldSend: false, reason: `Score ${score} is below the configured minimum of ${preferences.minScore}.` };
  }

  if (isWithinQuietHours(preferences.quietStart, preferences.quietEnd, now)) {
    return { shouldSend: false, reason: "Current time falls within quiet hours." };
  }

  const isMeaningfulStateChange = lastNotifiedState !== toState;

  if (!isMeaningfulStateChange && lastNotificationAt) {
    const elapsedMinutes = (now.getTime() - new Date(lastNotificationAt).getTime()) / 60_000;
    if (elapsedMinutes < preferences.cooldownMinutes) {
      return {
        shouldSend: false,
        reason: `Duplicate notification suppressed: same state within ${preferences.cooldownMinutes}-minute cooldown (${Math.round(elapsedMinutes)}m elapsed).`,
      };
    }
  }

  return { shouldSend: true, reason: isMeaningfulStateChange ? "Meaningful state transition." : "Cooldown elapsed." };
}
