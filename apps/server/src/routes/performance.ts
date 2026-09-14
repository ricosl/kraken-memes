import { Router } from "express";
import { db } from "@kraken-memes/core";

export const performanceRouter = Router();

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
}

/**
 * Performance/backtesting screen (spec section 29). Computed from
 * signal_outcomes, which the worker writes once a signal reaches a terminal
 * state — never look-ahead adjusted, always the outcome as actually observed.
 */
performanceRouter.get("/performance", async (_req, res) => {
  const totalSignalsResult = await db.query.signals.findMany({ columns: { id: true, score: true, state: true } });
  const totalSignals = totalSignalsResult.length;
  const qualifiedSetups = totalSignalsResult.filter((s) => s.state !== "WATCH" && s.state !== "REJECTED").length;

  const outcomes = await db.query.signalOutcomes.findMany({ with: { signal: { columns: { score: true } } } });

  const targetHit = outcomes.filter((o) => o.outcome === "TARGET_HIT").length;
  const invalidated = outcomes.filter((o) => o.outcome === "INVALIDATED").length;
  const resolved = outcomes.filter((o) => o.outcome === "TARGET_HIT" || o.outcome === "INVALIDATED" || o.outcome === "EXPIRED");

  const returns = resolved.map((o) => (o.outcome === "TARGET_HIT" ? o.maxFavorableMovePct : o.maxAdverseMovePct));
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const medianReturn = median(returns);

  // Max drawdown across the sequence of resolved-signal returns, taken in chronological order.
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  for (const r of returns) {
    cumulative += r;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
  }

  let worstLosingStreak = 0;
  let currentStreak = 0;
  for (const o of resolved) {
    if (o.outcome === "INVALIDATED") {
      currentStreak++;
      worstLosingStreak = Math.max(worstLosingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const falsePositiveRate = resolved.length > 0 ? invalidated / resolved.length : 0;

  // Score calibration: does a higher score actually correlate with a better outcome?
  const buckets = [
    { label: "0-59", min: 0, max: 60 },
    { label: "60-74", min: 60, max: 75 },
    { label: "75-89", min: 75, max: 90 },
    { label: "90-100", min: 90, max: 101 },
  ];
  const scoreCalibration = buckets.map((bucket) => {
    const inBucket = resolved.filter((o) => {
      const score = o.signal?.score ?? 0;
      return score >= bucket.min && score < bucket.max;
    });
    const wins = inBucket.filter((o) => o.outcome === "TARGET_HIT").length;
    return {
      scoreRange: bucket.label,
      sampleSize: inBucket.length,
      targetHitRate: inBucket.length > 0 ? wins / inBucket.length : null,
    };
  });

  res.json({
    totalSignals,
    qualifiedSetups,
    resolvedSignals: resolved.length,
    targetHitPct: resolved.length > 0 ? targetHit / resolved.length : null,
    invalidationPct: resolved.length > 0 ? invalidated / resolved.length : null,
    avgReturnPct: avgReturn,
    medianReturnPct: medianReturn,
    maxDrawdownPct: maxDrawdown,
    worstLosingStreak,
    falsePositiveRate,
    scoreCalibration,
    disclaimer: "These are observed outcomes from this system's own signal history, not probabilities or guarantees of future performance.",
  });
});

