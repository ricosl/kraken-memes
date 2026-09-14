import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { ScoreBadge } from "../components/ScoreBadge";
import { StatePill } from "../components/StatePill";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";
import { formatPct, formatRatio } from "../lib/format";
import type { ScannerRow } from "../lib/types";

type SortKey = "score" | "return15m" | "volume";

function sortRows(rows: ScannerRow[], key: SortKey): ScannerRow[] {
  return [...rows].sort((a, b) => {
    if (key === "score") return (b.signal?.score ?? -1) - (a.signal?.score ?? -1);
    if (key === "return15m") return (b.signal?.snapshot?.momentum.return15m ?? -1) - (a.signal?.snapshot?.momentum.return15m ?? -1);
    return (b.signal?.snapshot?.volume.volumeAccelerationRatio ?? -1) - (a.signal?.snapshot?.volume.volumeAccelerationRatio ?? -1);
  });
}

export function Scanner() {
  const { data, loading } = usePoll(() => api.markets(true), 20_000);
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const rows = useMemo(() => (data ? sortRows(data, sortKey) : []), [data, sortKey]);

  return (
    <div>
      <PageHeader title="Scanner" subtitle={`${data?.length ?? 0} eligible markets`} />

      <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
        {(["score", "return15m", "volume"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              sortKey === key ? "border-accent bg-accent/15 text-accent" : "border-border text-text-muted"
            }`}
          >
            {key === "score" ? "Score" : key === "return15m" ? "15m Move" : "Volume ×"}
          </button>
        ))}
      </div>

      {loading && !data && <p className="px-4 text-sm text-text-faint">Loading markets…</p>}
      {data?.length === 0 && <p className="px-4 text-sm text-text-faint">No eligible markets yet. Check back once discovery completes.</p>}

      <ul className="flex flex-col gap-2 px-4 pb-4">
        {rows.map(({ market, signal }) => (
          <li key={market.id}>
            <Link
              to={`/coin/${market.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 active:bg-surface-raised"
            >
              <ScoreBadge score={signal?.score ?? 0} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-text">{market.symbol}</span>
                  {signal ? <StatePill state={signal.state} /> : <span className="text-[10px] text-text-faint">No signal yet</span>}
                </div>
                <div className="mt-0.5 flex gap-3 text-[11px] text-text-muted">
                  <span>{formatPct(signal?.snapshot?.momentum.return15m)} 15m</span>
                  <span>{signal ? formatRatio(signal.snapshot.volume.volumeAccelerationRatio) : "—"} vol</span>
                  <span>{signal ? `${Math.round(signal.snapshot.orderBook.spreadBps)}bps` : "—"}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
