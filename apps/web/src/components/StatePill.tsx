import type { SignalState } from "../lib/types";

const LABELS: Record<SignalState, string> = {
  WATCH: "Watch",
  QUALIFIED: "Qualified",
  HIGH_PRIORITY: "High Priority",
  ACTIVE: "Active",
  STRENGTHENING: "Strengthening",
  WEAKENING: "Weakening",
  INVALIDATED: "Invalidated",
  TARGET_REACHED: "Target Reached",
  EXPIRED: "Expired",
  REJECTED: "Rejected",
};

const STYLES: Record<SignalState, string> = {
  WATCH: "text-text-faint bg-white/5",
  QUALIFIED: "text-score-mid bg-score-mid/10",
  HIGH_PRIORITY: "text-accent bg-accent/15",
  ACTIVE: "text-risk-on bg-risk-on/10",
  STRENGTHENING: "text-risk-on bg-risk-on/10",
  WEAKENING: "text-score-mid bg-score-mid/10",
  INVALIDATED: "text-risk-off bg-risk-off/10",
  TARGET_REACHED: "text-risk-on bg-risk-on/10",
  EXPIRED: "text-text-faint bg-white/5",
  REJECTED: "text-text-faint bg-white/5",
};

export function StatePill({ state }: { state: SignalState }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLES[state]}`}>{LABELS[state]}</span>;
}
