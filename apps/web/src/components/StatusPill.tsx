import type { MonitorHealth } from "../lib/types";

const CONFIG: Record<MonitorHealth["status"], { label: string; dot: string; text: string }> = {
  MONITORING: { label: "MONITORING", dot: "bg-risk-on", text: "text-risk-on" },
  DEGRADED: { label: "DEGRADED", dot: "bg-score-mid", text: "text-score-mid" },
  OFFLINE: { label: "OFFLINE", dot: "bg-risk-off", text: "text-risk-off" },
};

export function StatusPill({ status }: { status: MonitorHealth["status"] }) {
  const cfg = CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
