import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";
import { formatPct, formatPrice, formatUsd, timeAgo } from "../lib/format";
import type { PaperTrade } from "../lib/types";

function OutcomeTag({ outcome }: { outcome: PaperTrade["outcome"] }) {
  const styles: Record<PaperTrade["outcome"], string> = {
    OPEN: "text-accent bg-accent/15",
    TARGET_HIT: "text-risk-on bg-risk-on/10",
    INVALIDATED: "text-risk-off bg-risk-off/10",
    EXPIRED: "text-text-faint bg-white/5",
    MANUAL_CLOSE: "text-text-muted bg-white/5",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${styles[outcome]}`}>{outcome.replace("_", " ")}</span>;
}

export function Paper() {
  const { data, loading, refresh } = usePoll(api.paperTrades, 20_000);
  const performance = usePoll(api.performance, 30_000);

  async function close(id: string) {
    await api.closePaperTrade(id);
    refresh();
  }

  const open = data?.filter((t) => t.outcome === "OPEN") ?? [];
  const closed = data?.filter((t) => t.outcome !== "OPEN") ?? [];

  return (
    <div>
      <PageHeader title="Paper Trading" subtitle="Simulated positions — no real trades" />

      {loading && !data && <p className="p-4 text-sm text-text-faint">Loading…</p>}

      <section className="px-4 pt-4">
        <h2 className="mb-2 text-sm font-semibold text-text-muted">Open ({open.length})</h2>
        {open.length === 0 && <p className="text-sm text-text-faint">No open positions. Open one from a coin's detail page.</p>}
        <ul className="flex flex-col gap-2.5">
          {open.map((trade) => (
            <li key={trade.id} className="rounded-xl border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <Link to={`/coin/${trade.marketId}`} className="font-semibold text-text">
                  {trade.market?.symbol ?? trade.marketId}
                </Link>
                <OutcomeTag outcome={trade.outcome} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-text-muted">
                <span>Entry {formatPrice(trade.entryPrice)}</span>
                <span>{formatUsd(trade.positionSizeUsd)}</span>
              </div>
              <button onClick={() => close(trade.id)} className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs font-medium text-text">
                Close now
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 px-4 pb-4">
        <h2 className="mb-2 text-sm font-semibold text-text-muted">History ({closed.length})</h2>
        {closed.length === 0 && <p className="text-sm text-text-faint">No closed positions yet.</p>}
        <ul className="flex flex-col gap-2.5">
          {closed.map((trade) => (
            <li key={trade.id} className="rounded-xl border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <Link to={`/coin/${trade.marketId}`} className="font-semibold text-text">
                  {trade.market?.symbol ?? trade.marketId}
                </Link>
                <OutcomeTag outcome={trade.outcome} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-text-muted">
                <span>{trade.exitTimestamp ? timeAgo(trade.exitTimestamp) : "—"}</span>
                <span className={`font-semibold ${((trade.realizedPnlUsd ?? 0) >= 0 ? "text-risk-on" : "text-risk-off")}`}>
                  {trade.realizedPnlUsd != null ? formatUsd(trade.realizedPnlUsd) : "—"} ({formatPct(trade.realizedPnlPct)})
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {performance.data && (
        <section className="px-4 pb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-muted">Performance</h2>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="grid grid-cols-2 gap-y-3">
              <div>
                <div className="text-sm font-semibold tabular-nums text-text">{performance.data.totalSignals}</div>
                <div className="text-[11px] text-text-muted">Total signals</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular-nums text-text">
                  {performance.data.targetHitPct != null ? formatPct(performance.data.targetHitPct, 0) : "—"}
                </div>
                <div className="text-[11px] text-text-muted">Target-hit rate</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular-nums text-text">
                  {performance.data.invalidationPct != null ? formatPct(performance.data.invalidationPct, 0) : "—"}
                </div>
                <div className="text-[11px] text-text-muted">Invalidation rate</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular-nums text-text">{formatPct(performance.data.avgReturnPct)}</div>
                <div className="text-[11px] text-text-muted">Average return</div>
              </div>
            </div>

            <h3 className="mb-2 mt-4 text-xs font-semibold text-text-muted">Does a higher score actually do better?</h3>
            <ul className="flex flex-col gap-1.5">
              {performance.data.scoreCalibration.map((bucket) => (
                <li key={bucket.scoreRange} className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">{bucket.scoreRange}</span>
                  <span className="text-text-faint">n={bucket.sampleSize}</span>
                  <span className="tabular-nums text-text">{bucket.targetHitRate != null ? formatPct(bucket.targetHitRate, 0) : "—"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-text-faint">{performance.data.disclaimer}</p>
          </div>
        </section>
      )}
    </div>
  );
}
