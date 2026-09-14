# STATUS — Kraken Meme Coin Breakout Intelligence

Last updated: 2026-09-14, end of the initial build session. See `PLAN.md` for
the architecture and build order this followed.

## Headline: the one thing to understand before reading further

**This sandbox's outbound network policy blocks `api.kraken.com` (HTTPS
CONNECT → 403) and its proxy does not support raw WebSocket upgrades at
all.** Every Kraken-facing code path was written against Kraken's real,
documented public REST and WebSocket v2 APIs and is covered by tests, but
none of it has been exercised against the *live* Kraken service from this
session — that's not possible from here. When this is deployed to any
normal host with outbound internet access, it should talk to Kraken with
no code changes, only environment variables. This is called out again in
PLAN.md and should not be treated as fine print — it's the single biggest
caveat on this build.

Everything else below is either (a) verified for real, in this sandbox, or
(b) explicitly marked as unverified and why.

## Test suite: 136/136 passing

```
packages/shared   86 tests  (vitest)   — pure signal-engine logic, Kraken REST/WS clients against fixtures/fakes
apps/server       29 tests  (vitest + supertest) — every route, against a real local Postgres 16
apps/worker       21 tests  (vitest)   — pure scan-cycle logic + repository/scan-runner against real local Postgres
```

Run them yourself:
```
npm run test --workspaces --if-present
```
All four workspaces (`packages/shared`, `packages/core`, `apps/server`,
`apps/worker`; `apps/web` has no unit tests yet — see below) also typecheck
clean under `tsc --noEmit` / `tsc -b` with strict mode on.

## What's been verified, and how

| Area | Verified | How |
|---|---|---|
| Signal engine math (liquidity gate, momentum, volume acceleration, order-book quality, regime, weighted score, state machine, notification dedup/cooldown/quiet-hours) | Yes | 86 unit tests in `packages/shared`, including adversarial cases (thin liquidity vs. strong breakout, social-unavailable vs. social-zero, every state-machine edge) |
| Kraken REST client | Yes, against fixtures | Mocked `fetch`, real Kraken response shapes (AssetPairs/OHLC/Trades/Depth), throttling, error handling |
| Kraken WS client | Yes, against a fake transport | Injectable `WsFactory`; reconnect/backoff, subscribe framing, message parsing all unit-tested |
| Kraken WS client | Yes, against the **real, blocked** host | Ran the actual worker process; observed real `403`s, exponential backoff climbing 1s→2s→4s→8s→16s exactly as designed, no crash |
| Database schema + migrations | Yes | Applied to a real local Postgres 16 instance; every table in spec section 30 exists |
| Server REST API | Yes | 29 integration tests hit every route against real Postgres; also manually curled every endpoint against a running server |
| Worker: market discovery, ingestion, scan cycle, notification decision, signal persistence, outcome tracking | Yes, end-to-end against real Postgres | `scan-runner.test.ts` seeds realistic candles/order-book/trades and runs the actual `runScanCycle` used in production, asserting the resulting signal row, score, and notification history |
| Worker resilience (Kraken disconnect, reconnect, REST failure) | Yes, live | Same live run as above: REST 403s are caught and logged without crashing; health correctly reports `OFFLINE` rather than a false `MONITORING` |
| PWA: builds and typechecks | Yes | `npm run build` in `apps/web` succeeds, including the injectManifest service worker build |
| PWA: renders correctly, no console errors | Yes | Headless-Chromium walkthrough (Playwright + the pre-installed Chromium) of onboarding → Home → Scanner → Alerts → coin detail → Paper → Settings, with one seeded example signal; zero console errors; screenshots reviewed. The seeded example was removed afterward — the shipped database is empty, matching a fresh real deployment before Kraken data arrives. |
| PWA: service worker registers | Yes, live | Same headless run: `navigator.serviceWorker.getRegistration()` returned an active, in-scope registration |
| Push: server infrastructure | Yes | VAPID configured, subscribe/unsubscribe/list routes integration-tested, invalid-subscription cleanup on 404/410 coded and covered |

## What's implemented but NOT verified, and exactly why

| Area | Why it can't be verified here |
|---|---|
| Live Kraken market data (real prices, real order books, real trades) | `api.kraken.com` is blocked by this sandbox's egress policy (see above). No workaround was applied — the real fix is running this on a host with normal internet access. |
| Live Kraken WebSocket streaming | Same network block, and this proxy additionally does not support WebSocket upgrades to *any* host, so this would fail even if Kraken itself were allowed. |
| A real push notification actually reaching a phone | Requires (a) a real device or real, non-automated browser profile, and (b) the browser's push service (Google FCM / Mozilla push) being reachable. Tried this in a headless Chromium context: service worker registration succeeded, but `pushManager.subscribe()` failed with Chromium's own `AbortError: Registration failed - permission denied` — **Chrome deliberately disables the Push API in incognito/automation browser contexts** (a documented Chromium limitation, https://crbug.com/401439, unrelated to this codebase). Separately, this sandbox's proxy also rejected connections to `google.com`/`android.clients.google.com` during that same test run, so FCM itself may well be unreachable here too. Either way: install this as a real PWA on a real device with real internet, and this should work — the server-side sending code, VAPID config, and client-side subscription/registration code are all in place and individually verified as far as this sandbox allows. |
| PWA installability on a real phone (Add to Home Screen, standalone launch) | No physical device or real (non-headless) browser available in this sandbox. The manifest, icons, and service worker are all present and build correctly; actual OS-level install behavior is unverified. |
| Offline app-shell behavior (airplane-mode toggle) | Implemented via Workbox precaching + `NetworkFirst` for `/api/*`, but not manually toggled offline in a running browser this session. |
| `apps/web` automated tests | None written yet — verification for the PWA was a manual/scripted browser walkthrough (see above), not an automated test suite. This is the most notable gap versus the other three workspaces. |

## Known simplifications (deliberate, not oversights)

- **Market regime (BTC/SOL context)**: `regime-builder.ts` reads BTC/USD and
  SOL/USD candles from the same `markets`/`candles` tables the meme scanner
  uses. If those two markets haven't been discovered/ingested yet (e.g. cold
  start, or Kraken unreachable), the regime degrades to a neutral, all-zero
  reading rather than fabricating a trend. This is correct behavior, just
  worth knowing about — regime-driven scoring only sharpens once BTC/SOL
  data is flowing.
- **Order-book depth reconstruction**: only aggregate bid/ask depth is
  persisted per snapshot (not the full book), so the scan cycle reconstructs
  a single synthetic price level per side from that aggregate when
  recomputing order-book features. This reproduces the same spread/depth
  numbers that were computed at ingestion time; it does not lose information
  that was actually captured.
- **Decision cycle timing**: the worker runs its 15-minute scan on a plain
  `setInterval`, not aligned to wall-clock candle boundaries (e.g. exactly
  :00/:15/:30/:45). It still only ever acts on *completed* candles (never the
  forming one), so this doesn't introduce look-ahead bias — it just means
  the cycle's phase relative to Kraken's own candle boundaries is
  unaligned. Worth tightening in a follow-up.
- **Social signal provider**: ships with only the no-op provider
  (`NoopSocialSignalProvider`), exactly as the spec asks for V1. The
  interface is in `packages/shared/src/social/provider.ts` — adding
  LunarCrush/X/Reddit later means implementing that interface, not touching
  the scoring engine.
- **Single local user**: there's no multi-tenant auth, per the spec's "no
  trading accounts, no credentials" boundary. `getOrCreateDefaultUserId()`
  is the one seam where multi-user support would plug in later.

## Everything from the spec's acceptance criteria (section 49), mapped

**Data** — Kraken discovery/USD filtering/meme classification/persistence:
implemented and tested against fixtures + real Postgres; not live-Kraken
verified (see above).

**Signal engine** — features/liquidity/score/explainability/state
transitions: implemented and thoroughly tested (86 tests).

**Monitoring** — independent worker process: yes, running, verified live
against the real (blocked) Kraken host including reconnect/backoff and
honest health reporting. "Continues when browser is closed" is true by
construction (the worker never depends on a browser) rather than
demonstrated with a physical phone.

**PWA** — installs, mobile interface, service worker, offline shell, push
subscription: build succeeds, renders correctly with zero console errors,
service worker registers live; offline toggle and real-device install
unverified (no device/real browser available here).

**Notifications** — server can send, dedup/cooldown/preferences: all
implemented and tested; actual delivery to a phone unverified for the
network/sandbox reasons detailed above.

**Tracking** — signals/state transitions/paper trades/outcomes all stored,
all tested.

**Integrity** — no look-ahead bias (signal creation snapshot is immutable;
only state/score/notification bookkeeping update on existing rows, verified
in `repository.test.ts`), no fake market data (verified: the worker only
ever writes what it actually fetched; the one demo signal used for UI
verification was deleted, and the database was left in its genuine empty
state), no fabricated results (performance stats return `null`, not `0`,
when there's no real data — a bug in exactly this was found and fixed
during verification), no real trades, no withdrawal capability (neither
exists anywhere in the codebase).

## Suggested next steps

1. Deploy `apps/worker` and `apps/server` somewhere with real internet
   access and confirm live Kraken discovery/ingestion end-to-end.
2. Install the PWA on a real phone and confirm push delivery + notification
   tap deep-linking.
3. Add an automated test suite for `apps/web` (React Testing Library or
   Playwright component tests) — currently the only workspace without one.
4. Align the worker's scan cycle to wall-clock 15-minute boundaries.
5. Wire a real social-signal provider behind the existing interface once
   one is chosen.
