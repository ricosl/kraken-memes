import { useState } from "react";
import { useParams } from "react-router-dom";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "../components/PageHeader";
import { ScoreBadge } from "../components/ScoreBadge";
import { StatePill } from "../components/StatePill";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";
import { formatPct, formatPrice, formatRatio, formatUsd, timeAgo } from "../lib/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 px-4">
      <h2 className="mb-2 text-sm font-semibold text-text-muted">{title}</h2>
      <div className="rounded-xl border border-border bg-surface p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  const color = tone === "up" ? "text-risk-on" : tone === "down" ? "text-risk-off" : "text-text";
  return (
    <div>
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}

export function CoinDetail() {
  const { marketId } = useParams<{ marketId: string }>();
  const { data } = usePoll(() => api.marketDetail(marketId!), 15_000, [marketId]);
  const [positionSize, setPositionSize] = useState(500);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);

  if (!data) return <p className="p-4 text-sm text-text-faint">Loading…</p>;

  const { market, candles, latestOrderBook, signalHistory } = data;
  const latestSignal = signalHistory[0];
  const chartData = candles.map((c) => ({ t: new Date(c.timestamp).getTime(), close: c.close }));

  async function openPaperTrade() {
    if (!latestSignal) return;
    try {
      await api.openPaperTrade(latestSignal.id, positionSize);
      setTradeMessage("Paper position opened.");
    } catch (err) {
      setTradeMessage(err instanceof Error ? err.message : "Failed to open paper trade.");
    }
  }

  return (
    <div>
      <PageHeader title={market.symbol} subtitle={market.krakenPairName} />

      <div className="flex items-center gap-3 px-4 pt-4">
        <ScoreBadge score={latestSignal?.score ?? 0} size="lg" />
        <div>
          {latestSignal ? <StatePill state={latestSignal.state} /> : <span className="text-xs text-text-faint">No signal yet</span>}
          <div className="mt-1 text-2xl font-semibold tabular-nums text-text">{formatPrice(candles.at(-1)?.close ?? 0, market.priceDecimals)}</div>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="mt-4 h-40 px-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="t" hide />
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip
                contentStyle={{ background: "#161b28", border: "1px solid #232838", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => [formatPrice(v, market.priceDecimals), "Price"]}
              />
              {latestSignal && <ReferenceLine y={latestSignal.targetPrice} stroke="#3ddc97" strokeDasharray="4 4" />}
              {latestSignal && <ReferenceLine y={latestSignal.invalidationPrice} stroke="#e5566d" strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="close" stroke="#f5b942" strokeWidth={1.75} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {latestSignal && (
            <div className="flex justify-between px-2 text-[11px] text-text-muted">
              <span className="text-risk-off">Invalidation {formatPrice(latestSignal.invalidationPrice, market.priceDecimals)}</span>
              <span className="text-risk-on">Target {formatPrice(latestSignal.targetPrice, market.priceDecimals)}</span>
            </div>
          )}
        </div>
      )}

      {latestSignal && (
        <Section title="Signal breakdown">
          <div className="grid grid-cols-2 gap-y-3">
            <Stat label={`Volume accel. (${latestSignal.snapshot.score.components.volumeAcceleration.toFixed(0)}/${latestSignal.snapshot.score.weights.volumeAcceleration})`} value={formatRatio(latestSignal.snapshot.volume.volumeAccelerationRatio)} />
            <Stat
              label={`Breakout (${latestSignal.snapshot.score.components.breakoutStructure.toFixed(0)}/${latestSignal.snapshot.score.weights.breakoutStructure})`}
              value={latestSignal.snapshot.momentum.brokeAboveRecentHigh ? "Confirmed" : "Building"}
            />
            <Stat
              label={`Liquidity (${latestSignal.snapshot.score.components.liquidityOrderBook.toFixed(0)}/${latestSignal.snapshot.score.weights.liquidityOrderBook})`}
              value={latestSignal.snapshot.orderBook.liquidityQuality}
            />
            <Stat
              label={`Regime (${latestSignal.snapshot.score.components.marketRegime.toFixed(0)}/${latestSignal.snapshot.score.weights.marketRegime})`}
              value={latestSignal.snapshot.regime.classification}
            />
          </div>
          <p className="mt-3 text-[11px] text-text-faint">
            Overall score {Math.round(latestSignal.score)}/100 — a transparent weighted composite, not a probability.
          </p>
        </Section>
      )}

      {latestSignal && (
        <Section title="Market context">
          <div className="grid grid-cols-2 gap-y-3">
            <Stat label="BTC 1h" value={formatPct(latestSignal.snapshot.regime.btc.return1h)} tone={latestSignal.snapshot.regime.btc.return1h >= 0 ? "up" : "down"} />
            <Stat label="SOL 1h" value={formatPct(latestSignal.snapshot.regime.sol.return1h)} tone={latestSignal.snapshot.regime.sol.return1h >= 0 ? "up" : "down"} />
            <Stat label="Meme basket advancing" value={formatPct(latestSignal.snapshot.regime.memeBasket.pctAdvancing, 0)} />
            <Stat label="Move attribution" value={latestSignal.snapshot.moveAttribution?.replace(/_/g, " ") ?? "—"} />
          </div>
        </Section>
      )}

      {latestOrderBook && (
        <Section title="Liquidity">
          <div className="grid grid-cols-2 gap-y-3">
            <Stat label="Spread" value={`${latestOrderBook.spreadBps.toFixed(1)} bps`} />
            <Stat label="Imbalance" value={formatPct(latestOrderBook.imbalance, 0)} />
            <Stat label="Bid depth" value={formatUsd(latestOrderBook.bidDepth)} />
            <Stat label="Ask depth" value={formatUsd(latestOrderBook.askDepth)} />
          </div>
        </Section>
      )}

      {latestSignal && (
        <Section title="Paper trade">
          <label className="mb-2 block text-xs text-text-muted">Position size (USD)</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={positionSize}
              onChange={(e) => setPositionSize(Number(e.target.value))}
              className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text"
            />
            <button onClick={openPaperTrade} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg">
              Open
            </button>
          </div>
          {tradeMessage && <p className="mt-2 text-xs text-text-muted">{tradeMessage}</p>}
          <p className="mt-2 text-[11px] text-text-faint">Simulated only — no real order is ever placed.</p>
        </Section>
      )}

      <Section title="Signal history">
        {signalHistory.length === 0 && <p className="text-sm text-text-faint">No prior signals for this coin.</p>}
        <ul className="flex flex-col gap-3">
          {signalHistory.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <StatePill state={s.state} />
                <span className="text-text-muted">{timeAgo(s.timestamp)}</span>
              </div>
              <span className="tabular-nums text-text-muted">{Math.round(s.score)}/100</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
