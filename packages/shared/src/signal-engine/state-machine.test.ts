import { describe, expect, it } from "vitest";
import { isValidTransition, nextSignalState, type SignalEvaluation } from "./state-machine.js";

function evaluation(overrides: Partial<SignalEvaluation>): SignalEvaluation {
  return {
    liquidityPassed: true,
    scoreTier: "WATCH",
    notificationSent: false,
    priceOutcome: "NONE",
    expired: false,
    scoreTrend: "FLAT",
    ...overrides,
  };
}

describe("nextSignalState", () => {
  it("moves WATCH -> QUALIFIED -> HIGH_PRIORITY -> ACTIVE -> TARGET_REACHED", () => {
    let state = nextSignalState("WATCH", evaluation({ scoreTier: "QUALIFIED" }));
    expect(state.toState).toBe("QUALIFIED");

    state = nextSignalState(state.toState, evaluation({ scoreTier: "HIGH_PRIORITY" }));
    expect(state.toState).toBe("HIGH_PRIORITY");

    state = nextSignalState(state.toState, evaluation({ scoreTier: "HIGH_PRIORITY", notificationSent: true }));
    expect(state.toState).toBe("ACTIVE");

    state = nextSignalState(state.toState, evaluation({ priceOutcome: "TARGET_HIT" }));
    expect(state.toState).toBe("TARGET_REACHED");
  });

  it("moves WATCH -> QUALIFIED -> INVALIDATED when liquidity fails before high priority", () => {
    let state = nextSignalState("WATCH", evaluation({ scoreTier: "QUALIFIED" }));
    expect(state.toState).toBe("QUALIFIED");

    state = nextSignalState(state.toState, evaluation({ liquidityPassed: false }));
    expect(state.toState).toBe("REJECTED");
  });

  it("invalidates an ACTIVE signal when price hits the invalidation level", () => {
    const state = nextSignalState("ACTIVE", evaluation({ priceOutcome: "INVALIDATED_HIT" }));
    expect(state.toState).toBe("INVALIDATED");
  });

  it("expires an ACTIVE signal once the observation window elapses without an outcome", () => {
    const state = nextSignalState("ACTIVE", evaluation({ expired: true }));
    expect(state.toState).toBe("EXPIRED");
  });

  it("tracks STRENGTHENING/WEAKENING while active based on score trend", () => {
    expect(nextSignalState("ACTIVE", evaluation({ scoreTrend: "UP" })).toState).toBe("STRENGTHENING");
    expect(nextSignalState("STRENGTHENING", evaluation({ scoreTrend: "DOWN" })).toState).toBe("WEAKENING");
    expect(nextSignalState("WEAKENING", evaluation({ scoreTrend: "FLAT" })).toState).toBe("ACTIVE");
  });

  it("never transitions out of a terminal state", () => {
    for (const terminal of ["INVALIDATED", "TARGET_REACHED", "EXPIRED", "REJECTED"] as const) {
      const state = nextSignalState(terminal, evaluation({ scoreTier: "HIGH_PRIORITY", priceOutcome: "TARGET_HIT" }));
      expect(state.toState).toBe(terminal);
    }
  });

  it("drops a QUALIFIED signal back to WATCH if its score falls", () => {
    const state = nextSignalState("QUALIFIED", evaluation({ scoreTier: "WATCH" }));
    expect(state.toState).toBe("WATCH");
  });

  it("every transition the reducer can produce is in the valid-transitions whitelist", () => {
    const states = ["WATCH", "QUALIFIED", "HIGH_PRIORITY", "ACTIVE", "STRENGTHENING", "WEAKENING"] as const;
    const evaluations: SignalEvaluation[] = [
      evaluation({ scoreTier: "WATCH" }),
      evaluation({ scoreTier: "QUALIFIED" }),
      evaluation({ scoreTier: "HIGH_PRIORITY" }),
      evaluation({ scoreTier: "HIGH_PRIORITY", notificationSent: true }),
      evaluation({ liquidityPassed: false }),
      evaluation({ priceOutcome: "TARGET_HIT" }),
      evaluation({ priceOutcome: "INVALIDATED_HIT" }),
      evaluation({ expired: true }),
      evaluation({ scoreTrend: "UP" }),
      evaluation({ scoreTrend: "DOWN" }),
    ];
    for (const from of states) {
      for (const evalCase of evaluations) {
        const { toState } = nextSignalState(from, evalCase);
        expect(isValidTransition(from, toState)).toBe(true);
      }
    }
  });
});
