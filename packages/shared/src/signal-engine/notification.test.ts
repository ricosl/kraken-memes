import { describe, expect, it } from "vitest";
import { decideNotification, isWithinQuietHours, type NotificationPreferencesInput } from "./notification.js";

const basePrefs: NotificationPreferencesInput = {
  enabled: true,
  minScore: 75,
  quietStart: null,
  quietEnd: null,
  cooldownMinutes: 60,
  newSetupEnabled: true,
  invalidationEnabled: false,
};

describe("isWithinQuietHours", () => {
  it("handles a same-day window", () => {
    expect(isWithinQuietHours("22:00", "23:00", new Date("2026-01-01T22:30:00Z"))).toBe(true);
    expect(isWithinQuietHours("22:00", "23:00", new Date("2026-01-01T21:00:00Z"))).toBe(false);
  });

  it("handles an overnight wraparound window", () => {
    expect(isWithinQuietHours("23:00", "07:00", new Date("2026-01-01T02:00:00Z"))).toBe(true);
    expect(isWithinQuietHours("23:00", "07:00", new Date("2026-01-01T12:00:00Z"))).toBe(false);
  });

  it("returns false when quiet hours are not configured", () => {
    expect(isWithinQuietHours(null, null, new Date())).toBe(false);
  });
});

describe("decideNotification", () => {
  it("sends a first-time high-priority notification that meets the score threshold", () => {
    const decision = decideNotification({
      preferences: basePrefs,
      notificationType: "NEW_HIGH_PRIORITY",
      score: 87,
      toState: "HIGH_PRIORITY",
      lastNotifiedState: null,
      lastNotificationAt: null,
      now: new Date("2026-01-01T12:00:00Z"),
    });
    expect(decision.shouldSend).toBe(true);
  });

  it("blocks when notifications are disabled", () => {
    const decision = decideNotification({
      preferences: { ...basePrefs, enabled: false },
      notificationType: "NEW_HIGH_PRIORITY",
      score: 90,
      toState: "HIGH_PRIORITY",
      lastNotifiedState: null,
      lastNotificationAt: null,
      now: new Date(),
    });
    expect(decision.shouldSend).toBe(false);
  });

  it("blocks a new-setup notification when the score is below the configured minimum", () => {
    const decision = decideNotification({
      preferences: { ...basePrefs, minScore: 82 },
      notificationType: "NEW_HIGH_PRIORITY",
      score: 81,
      toState: "HIGH_PRIORITY",
      lastNotifiedState: null,
      lastNotificationAt: null,
      now: new Date(),
    });
    expect(decision.shouldSend).toBe(false);
  });

  it("suppresses a duplicate notification for the same resulting state within the cooldown window", () => {
    const decision = decideNotification({
      preferences: basePrefs,
      notificationType: "NEW_HIGH_PRIORITY",
      score: 90,
      toState: "HIGH_PRIORITY",
      lastNotifiedState: "HIGH_PRIORITY",
      lastNotificationAt: new Date("2026-01-01T12:00:00Z").toISOString(),
      now: new Date("2026-01-01T12:30:00Z"),
    });
    expect(decision.shouldSend).toBe(false);
    expect(decision.reason).toMatch(/cooldown/i);
  });

  it("allows a meaningful state transition (QUALIFIED -> HIGH_PRIORITY) to bypass the cooldown", () => {
    const decision = decideNotification({
      preferences: basePrefs,
      notificationType: "NEW_HIGH_PRIORITY",
      score: 90,
      toState: "HIGH_PRIORITY",
      lastNotifiedState: "QUALIFIED",
      lastNotificationAt: new Date("2026-01-01T12:00:00Z").toISOString(),
      now: new Date("2026-01-01T12:05:00Z"),
    });
    expect(decision.shouldSend).toBe(true);
  });

  it("allows the same state again once the cooldown has elapsed", () => {
    const decision = decideNotification({
      preferences: basePrefs,
      notificationType: "NEW_HIGH_PRIORITY",
      score: 90,
      toState: "HIGH_PRIORITY",
      lastNotifiedState: "HIGH_PRIORITY",
      lastNotificationAt: new Date("2026-01-01T10:00:00Z").toISOString(),
      now: new Date("2026-01-01T12:00:00Z"),
    });
    expect(decision.shouldSend).toBe(true);
  });

  it("respects quiet hours", () => {
    const decision = decideNotification({
      preferences: { ...basePrefs, quietStart: "22:00", quietEnd: "07:00" },
      notificationType: "NEW_HIGH_PRIORITY",
      score: 90,
      toState: "HIGH_PRIORITY",
      lastNotifiedState: null,
      lastNotificationAt: null,
      now: new Date("2026-01-01T23:00:00Z"),
    });
    expect(decision.shouldSend).toBe(false);
  });

  it("respects the invalidation notification type toggle", () => {
    const decision = decideNotification({
      preferences: basePrefs, // invalidationEnabled: false
      notificationType: "INVALIDATED",
      score: 0,
      toState: "INVALIDATED",
      lastNotifiedState: "HIGH_PRIORITY",
      lastNotificationAt: null,
      now: new Date(),
    });
    expect(decision.shouldSend).toBe(false);
  });
});
