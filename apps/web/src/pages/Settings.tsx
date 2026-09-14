import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";
import { disablePushNotifications, enablePushNotifications, getNotificationPermission, isIos, isStandalonePwa } from "../lib/push";
import type { MemeClassification } from "../lib/types";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-2.5">
      <span className="text-sm text-text">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`h-6 w-11 rounded-full transition-colors ${checked ? "bg-accent" : "bg-white/10"}`}
      >
        <span className={`block h-5 w-5 translate-x-0.5 rounded-full bg-bg transition-transform ${checked ? "translate-x-[22px]" : ""}`} />
      </button>
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-text">{label}</span>
      {children}
    </div>
  );
}

export function Settings() {
  const prefsPoll = usePoll(api.notificationPreferences, 60_000);
  const configPoll = usePoll(api.config, 60_000);
  const marketsPoll = usePoll(() => api.markets(false), 30_000);

  const [permission, setPermission] = useState(getNotificationPermission());
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  async function handleEnablePush() {
    const result = await enablePushNotifications();
    setPermission(getNotificationPermission());
    setPushMessage(result.ok ? "Notifications enabled." : result.reason);
  }

  async function handleDisablePush() {
    await disablePushNotifications();
    setPushMessage("Notifications disabled on this device.");
  }

  async function updatePref(patch: Parameters<typeof api.updateNotificationPreferences>[0]) {
    await api.updateNotificationPreferences(patch);
    prefsPoll.refresh();
  }

  async function updateConfig(patch: Parameters<typeof api.updateConfig>[0]) {
    await api.updateConfig(patch);
    configPoll.refresh();
  }

  async function setClassification(id: string, classification: MemeClassification) {
    await api.setMarketClassification(id, classification);
    marketsPoll.refresh();
  }

  const prefs = prefsPoll.data;
  const config = configPoll.data;
  const pendingReview = marketsPoll.data?.filter((r) => r.market.memeClassification === "PENDING_REVIEW") ?? [];

  return (
    <div className="pb-6">
      <PageHeader title="Settings" />

      <section className="mx-4 mt-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-text">Push notifications</h2>
        {isIos() && !isStandalonePwa() && (
          <p className="mb-3 text-xs text-score-mid">
            On iPhone/iPad, install this app to your Home Screen first (Share → Add to Home Screen) — Web Push only works from the
            installed app, not a browser tab.
          </p>
        )}
        {permission === "granted" ? (
          <button onClick={handleDisablePush} className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-text">
            Disable on this device
          </button>
        ) : (
          <button onClick={handleEnablePush} className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-bg">
            Enable Notifications
          </button>
        )}
        {pushMessage && <p className="mt-2 text-xs text-text-muted">{pushMessage}</p>}
      </section>

      {prefs && (
        <section className="mx-4 mt-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold text-text">Notification preferences</h2>
          <Toggle checked={prefs.enabled} onChange={(v) => updatePref({ enabled: v })} label="Notifications on" />
          <Toggle checked={prefs.newSetupEnabled} onChange={(v) => updatePref({ newSetupEnabled: v })} label="New high-priority setup" />
          <Toggle checked={prefs.invalidationEnabled} onChange={(v) => updatePref({ invalidationEnabled: v })} label="Setup invalidated" />
          <Row label="Minimum score">
            <input
              type="number"
              defaultValue={prefs.minScore}
              onBlur={(e) => updatePref({ minScore: Number(e.target.value) })}
              className="w-16 rounded border border-border bg-surface-raised px-2 py-1 text-right text-sm text-text"
            />
          </Row>
          <Row label="Cooldown (minutes)">
            <input
              type="number"
              defaultValue={prefs.cooldownMinutes}
              onBlur={(e) => updatePref({ cooldownMinutes: Number(e.target.value) })}
              className="w-16 rounded border border-border bg-surface-raised px-2 py-1 text-right text-sm text-text"
            />
          </Row>
          <Row label="Quiet hours start (UTC)">
            <input
              type="time"
              defaultValue={prefs.quietStart ?? ""}
              onChange={(e) => updatePref({ quietStart: e.target.value || null })}
              className="rounded border border-border bg-surface-raised px-2 py-1 text-sm text-text"
            />
          </Row>
          <Row label="Quiet hours end (UTC)">
            <input
              type="time"
              defaultValue={prefs.quietEnd ?? ""}
              onChange={(e) => updatePref({ quietEnd: e.target.value || null })}
              className="rounded border border-border bg-surface-raised px-2 py-1 text-sm text-text"
            />
          </Row>
        </section>
      )}

      {config && (
        <section className="mx-4 mt-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold text-text">Setup parameters</h2>
          <Row label="Target">
            <input
              type="number"
              step="0.01"
              defaultValue={config.targetPct}
              onBlur={(e) => updateConfig({ targetPct: Number(e.target.value) })}
              className="w-20 rounded border border-border bg-surface-raised px-2 py-1 text-right text-sm text-text"
            />
          </Row>
          <Row label="Invalidation">
            <input
              type="number"
              step="0.01"
              defaultValue={config.invalidationPct}
              onBlur={(e) => updateConfig({ invalidationPct: Number(e.target.value) })}
              className="w-20 rounded border border-border bg-surface-raised px-2 py-1 text-right text-sm text-text"
            />
          </Row>
          <Row label="Observation window (hours)">
            <input
              type="number"
              defaultValue={config.observationWindowHours}
              onBlur={(e) => updateConfig({ observationWindowHours: Number(e.target.value) })}
              className="w-16 rounded border border-border bg-surface-raised px-2 py-1 text-right text-sm text-text"
            />
          </Row>
          <p className="mt-2 text-[11px] text-text-faint">These are research parameters, not promises of a specific outcome.</p>
        </section>
      )}

      {pendingReview.length > 0 && (
        <section className="mx-4 mt-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-text">Meme classification — pending review</h2>
          <ul className="flex flex-col gap-2">
            {pendingReview.map(({ market }) => (
              <li key={market.id} className="flex items-center justify-between text-sm">
                <span className="text-text">{market.symbol}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setClassification(market.id, "INCLUDED")}
                    className="rounded border border-risk-on/40 px-2 py-1 text-xs text-risk-on"
                  >
                    Include
                  </button>
                  <button
                    onClick={() => setClassification(market.id, "EXCLUDED")}
                    className="rounded border border-risk-off/40 px-2 py-1 text-xs text-risk-off"
                  >
                    Exclude
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
