function scoreColor(score: number): string {
  if (score >= 75) return "text-score-high border-score-high/40 bg-score-high/10";
  if (score >= 60) return "text-score-mid border-score-mid/40 bg-score-mid/10";
  return "text-score-low border-score-low/40 bg-score-low/10";
}

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-14 w-14 text-xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className={`flex ${dims} shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums ${scoreColor(score)}`}>
      {Math.round(score)}
    </div>
  );
}
