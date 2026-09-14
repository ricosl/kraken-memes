import { PageHeader } from "../components/PageHeader";
import { StatusPill } from "../components/StatusPill";
import { SetupCard } from "../components/SetupCard";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";
import { formatClock, timeAgo } from "../lib/format";

export function Home() {
  const health = usePoll(api.health, 15_000);
  const topSignals = usePoll(() => api.topSignals(8), 15_000);

  return (
    <div>
      <PageHeader title="Home" subtitle="Is anything interesting happening right now?" />

      <section className="mx-4 mt-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          {health.data ? <StatusPill status={health.data.status} /> : <span className="text-xs text-text-faint">Loading status…</span>}
          <span className="text-[11px] text-text-faint">Last scan: {formatClock(health.data?.lastCompletedScan ?? null)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xl font-semibold tabular-nums text-text">{health.data?.eligibleMarketCount ?? "—"}</div>
            <div className="text-[11px] text-text-muted">Eligible markets</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums text-text">{health.data?.activeSetupCount ?? "—"}</div>
            <div className="text-[11px] text-text-muted">Qualified setups</div>
          </div>
        </div>
        {health.data?.status === "DEGRADED" && (
          <p className="mt-3 text-xs text-score-mid">
            Data freshness is degraded — some signals may be based on slightly stale market data.
          </p>
        )}
        {health.data?.status === "OFFLINE" && (
          <p className="mt-3 text-xs text-risk-off">
            The monitoring worker isn't reporting in. Signals shown may be stale or unavailable.
          </p>
        )}
      </section>

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold text-text-muted">Top setups</h2>
        {topSignals.loading && !topSignals.data && <p className="text-sm text-text-faint">Loading…</p>}
        {topSignals.data?.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-faint">
            Nothing qualifies right now. The scanner is watching — you'll get a push notification the moment a setup crosses your
            threshold.
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          {topSignals.data?.map((signal) => <SetupCard key={signal.id} signal={signal} />)}
        </div>
      </section>

      {health.data?.lastMarketDataUpdate && (
        <p className="mt-6 px-4 text-center text-[11px] text-text-faint">
          Market data updated {timeAgo(health.data.lastMarketDataUpdate)}
        </p>
      )}
    </div>
  );
}
