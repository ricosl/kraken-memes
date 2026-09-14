import type { SignalState } from "../types.js";

export type ScoreTier = "BELOW_WATCH" | "WATCH" | "QUALIFIED" | "HIGH_PRIORITY";
export type PriceOutcome = "NONE" | "TARGET_HIT" | "INVALIDATED_HIT";
export type ScoreTrend = "UP" | "DOWN" | "FLAT";

export interface SignalEvaluation {
  liquidityPassed: boolean;
  scoreTier: ScoreTier;
  /** True once a high-priority push notification has actually been dispatched for this signal. */
  notificationSent: boolean;
  priceOutcome: PriceOutcome;
  expired: boolean;
  scoreTrend: ScoreTrend;
}

export interface StateTransitionResult {
  toState: SignalState;
  reason: string;
}

const TERMINAL_STATES: ReadonlySet<SignalState> = new Set(["INVALIDATED", "TARGET_REACHED", "EXPIRED", "REJECTED"]);

/** Whitelist of valid (from -> to) edges, used to validate every transition the reducer produces. */
export const VALID_TRANSITIONS: ReadonlyArray<[SignalState, SignalState]> = [
  ["WATCH", "WATCH"],
  ["WATCH", "QUALIFIED"],
  ["WATCH", "HIGH_PRIORITY"], // score can jump two tiers in a single 15m cycle
  ["WATCH", "REJECTED"],
  ["QUALIFIED", "WATCH"],
  ["QUALIFIED", "QUALIFIED"],
  ["QUALIFIED", "HIGH_PRIORITY"],
  ["QUALIFIED", "REJECTED"],
  ["HIGH_PRIORITY", "HIGH_PRIORITY"],
  ["HIGH_PRIORITY", "QUALIFIED"],
  ["HIGH_PRIORITY", "WATCH"],
  ["HIGH_PRIORITY", "ACTIVE"],
  ["HIGH_PRIORITY", "REJECTED"],
  ["ACTIVE", "ACTIVE"],
  ["ACTIVE", "STRENGTHENING"],
  ["ACTIVE", "WEAKENING"],
  ["ACTIVE", "TARGET_REACHED"],
  ["ACTIVE", "INVALIDATED"],
  ["ACTIVE", "EXPIRED"],
  ["STRENGTHENING", "STRENGTHENING"],
  ["STRENGTHENING", "ACTIVE"],
  ["STRENGTHENING", "WEAKENING"],
  ["STRENGTHENING", "TARGET_REACHED"],
  ["STRENGTHENING", "INVALIDATED"],
  ["STRENGTHENING", "EXPIRED"],
  ["WEAKENING", "WEAKENING"],
  ["WEAKENING", "ACTIVE"],
  ["WEAKENING", "STRENGTHENING"],
  ["WEAKENING", "TARGET_REACHED"],
  ["WEAKENING", "INVALIDATED"],
  ["WEAKENING", "EXPIRED"],
];

const validTransitionSet = new Set(VALID_TRANSITIONS.map(([from, to]) => `${from}->${to}`));

export function isValidTransition(from: SignalState, to: SignalState): boolean {
  if (from === to) return true;
  return validTransitionSet.has(`${from}->${to}`);
}

const PRE_ACTIVE_STATES: ReadonlySet<SignalState> = new Set(["WATCH", "QUALIFIED", "HIGH_PRIORITY"]);
const ACTIVE_STATES: ReadonlySet<SignalState> = new Set(["ACTIVE", "STRENGTHENING", "WEAKENING"]);

/**
 * Pure signal state-machine reducer (spec section 18). Given the current
 * state and this cycle's evaluation, returns the next state and a
 * human-readable reason (persisted to signal_events for auditability).
 * Terminal states never transition further — a new signal is created for a
 * market that becomes interesting again later.
 */
export function nextSignalState(current: SignalState, evaluation: SignalEvaluation): StateTransitionResult {
  if (TERMINAL_STATES.has(current)) {
    return { toState: current, reason: "Signal is in a terminal state; no further transitions." };
  }

  if (ACTIVE_STATES.has(current)) {
    if (evaluation.priceOutcome === "TARGET_HIT") {
      return { toState: "TARGET_REACHED", reason: "Price reached the target level." };
    }
    if (evaluation.priceOutcome === "INVALIDATED_HIT") {
      return { toState: "INVALIDATED", reason: "Price reached the invalidation level." };
    }
    if (evaluation.expired) {
      return { toState: "EXPIRED", reason: "Observation window elapsed without reaching target or invalidation." };
    }
    if (evaluation.scoreTrend === "UP") {
      return { toState: "STRENGTHENING", reason: "Opportunity score is rising while the setup remains active." };
    }
    if (evaluation.scoreTrend === "DOWN") {
      return { toState: "WEAKENING", reason: "Opportunity score is falling while the setup remains active." };
    }
    return { toState: "ACTIVE", reason: "Setup remains active with a stable score." };
  }

  // PRE_ACTIVE_STATES: WATCH, QUALIFIED, HIGH_PRIORITY
  if (PRE_ACTIVE_STATES.has(current)) {
    if (!evaluation.liquidityPassed) {
      return { toState: "REJECTED", reason: "Market failed the hard liquidity filter." };
    }
    if (current === "HIGH_PRIORITY" && evaluation.notificationSent) {
      return { toState: "ACTIVE", reason: "High-priority alert sent; now tracking the setup toward an outcome." };
    }
    switch (evaluation.scoreTier) {
      case "HIGH_PRIORITY":
        return { toState: "HIGH_PRIORITY", reason: "Score crossed the high-priority threshold." };
      case "QUALIFIED":
        return { toState: "QUALIFIED", reason: "Score crossed the qualification threshold." };
      default:
        return { toState: "WATCH", reason: "Market is eligible but has not yet qualified." };
    }
  }

  return { toState: current, reason: "No applicable transition rule; holding current state." };
}
