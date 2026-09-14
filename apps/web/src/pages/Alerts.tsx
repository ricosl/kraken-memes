import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { SetupCard } from "../components/SetupCard";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";

const TABS = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function Alerts() {
  const [tab, setTab] = useState<TabKey>("new");
  const { data, loading } = usePoll(() => api.signals(tab), 15_000, [tab]);

  return (
    <div>
      <PageHeader title="Alerts" subtitle="What happened while you were away" />

      <div className="flex gap-1 border-b border-border px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2.5 text-sm font-medium ${
              tab === t.key ? "border-b-2 border-accent text-text" : "text-text-faint"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 p-4">
        {loading && !data && <p className="text-sm text-text-faint">Loading…</p>}
        {data?.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-faint">
            {tab === "new" && "No new high-priority setups yet."}
            {tab === "active" && "Nothing currently active."}
            {tab === "completed" && "No completed setups yet."}
          </div>
        )}
        {data?.map((signal) => <SetupCard key={signal.id} signal={signal} />)}
      </div>
    </div>
  );
}
