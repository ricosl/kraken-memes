import { Link } from "react-router-dom";
import type { Signal } from "../lib/types";
import { ScoreBadge } from "./ScoreBadge";
import { StatePill } from "./StatePill";
import { formatPct, formatRatio } from "../lib/format";

export function SetupCard({ signal }: { signal: Signal }) {
  const symbol = signal.market?.symbol ?? "—";
  const momentum = signal.snapshot?.momentum;
  const volume = signal.snapshot?.volume;
  const orderBook = signal.snapshot?.orderBook;

  return (
    <Link
      to={`/coin/${signal.marketId}`}
      className="block rounded-xl border border-border bg-surface p-3.5 transition-colors active:bg-surface-raised"
    >
      <div className="flex items-center gap-3">
        <ScoreBadge score={signal.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-text">{symbol}</span>
            <StatePill state={signal.state} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
            {momentum?.return15m != null && (
              <span className={momentum.return15m >= 0 ? "text-risk-on" : "text-risk-off"}>{formatPct(momentum.return15m)} 15m</span>
            )}
            {volume && <span>{formatRatio(volume.volumeAccelerationRatio)} volume</span>}
            {orderBook && <span>{Math.round(orderBook.spreadBps)} bps spread</span>}
          </div>
        </div>
      </div>
      {momentum?.brokeAboveRecentHigh && (
        <div className="mt-2 inline-flex items-center rounded bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Breakout confirmed
        </div>
      )}
    </Link>
  );
}
