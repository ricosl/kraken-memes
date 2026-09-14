import { useState } from "react";
import { Bell, Radar, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { enablePushNotifications, isIos, isStandalonePwa } from "../lib/push";
import { api } from "../lib/api";

const TOTAL_STEPS = 5;

function Dots({ step }: { step: number }) {
  return (
    <div className="flex justify-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-accent" : "bg-white/15"}`} />
      ))}
    </div>
  );
}

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(75);
  const [targetPct, setTargetPct] = useState(7);
  const [invalidationPct, setInvalidationPct] = useState(3);

  async function finish() {
    try {
      await api.updateNotificationPreferences({ minScore });
      await api.updateConfig({ targetPct: targetPct / 100, invalidationPct: -invalidationPct / 100 });
    } catch {
      // Non-fatal: defaults remain in effect server-side even if this save fails.
    }
    onComplete();
  }

  async function handleEnableNotifications() {
    const result = await enablePushNotifications();
    setPushStatus(result.ok ? "Notifications enabled." : result.reason);
  }

  return (
    <div className="flex min-h-svh flex-col justify-between bg-bg px-6 pb-8 pt-[calc(env(safe-area-inset-top)+32px)] text-text">
      <div className="flex-1">
        {step === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Radar size={56} className="mb-6 text-accent" />
            <h1 className="text-2xl font-semibold">Kraken Breakout Intelligence</h1>
            <p className="mt-3 text-sm text-text-muted">An always-on market scanner for Kraken meme coins.</p>
          </div>
        )}

        {step === 1 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <ShieldCheck size={56} className="mb-6 text-accent" />
            <h1 className="text-2xl font-semibold">Always Watching</h1>
            <p className="mt-3 text-sm text-text-muted">
              The market monitor runs on the server, continuously — even when this app is closed, your phone is locked, or you're
              offline.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bell size={56} className="mb-6 text-accent" />
            <h1 className="text-2xl font-semibold">Enable Notifications</h1>
            <p className="mt-3 text-sm text-text-muted">Get notified when a qualifying setup appears. We'll never spam you.</p>
            {isIos() && !isStandalonePwa() && (
              <p className="mt-4 rounded-lg border border-score-mid/40 bg-score-mid/10 p-3 text-xs text-score-mid">
                On iPhone/iPad, Web Push only works once this app is installed to your Home Screen. Tap Share → Add to Home Screen,
                then reopen it from there before enabling notifications.
              </p>
            )}
            <button onClick={handleEnableNotifications} className="mt-6 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-bg">
              Enable Notifications
            </button>
            {pushStatus && <p className="mt-3 text-xs text-text-muted">{pushStatus}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="flex h-full flex-col justify-center">
            <div className="mb-6 flex flex-col items-center text-center">
              <SlidersHorizontal size={48} className="mb-4 text-accent" />
              <h1 className="text-2xl font-semibold">Configure</h1>
              <p className="mt-2 text-sm text-text-muted">You can change these anytime in Settings.</p>
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
              <label className="flex items-center justify-between text-sm">
                Minimum score
                <input
                  type="number"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-16 rounded border border-border bg-surface-raised px-2 py-1 text-right"
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                Target
                <span className="flex items-center gap-1">
                  +
                  <input
                    type="number"
                    value={targetPct}
                    onChange={(e) => setTargetPct(Number(e.target.value))}
                    className="w-14 rounded border border-border bg-surface-raised px-2 py-1 text-right"
                  />
                  %
                </span>
              </label>
              <label className="flex items-center justify-between text-sm">
                Invalidation
                <span className="flex items-center gap-1">
                  -
                  <input
                    type="number"
                    value={invalidationPct}
                    onChange={(e) => setInvalidationPct(Number(e.target.value))}
                    className="w-14 rounded border border-border bg-surface-raised px-2 py-1 text-right"
                  />
                  %
                </span>
              </label>
              <div className="flex items-center justify-between text-sm text-text-muted">
                <span>Observation</span>
                <span>24h</span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Radar size={56} className="mb-6 text-accent" />
            <h1 className="text-2xl font-semibold">You're set</h1>
            <p className="mt-3 text-sm text-text-muted">
              I don't watch the market. The app watches it for me.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Dots step={step} />
        <button
          onClick={() => (step === TOTAL_STEPS - 1 ? finish() : setStep(step + 1))}
          className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-bg"
        >
          {step === TOTAL_STEPS - 1 ? "Enter dashboard" : "Continue"}
        </button>
      </div>
    </div>
  );
}
