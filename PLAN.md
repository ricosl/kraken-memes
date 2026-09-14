# Kraken Meme Coin Breakout Intelligence — Implementation Plan

## 0. Repository state at start

Empty git repository (branch `claude/kraken-meme-coin-pwa-xwptih`, no commits). No
existing framework to reuse, so this is a greenfield build using the stack
requested in the spec.

## 1. Known environment constraint (read this first)

This sandbox's outbound network policy **blocks `api.kraken.com`** (HTTPS CONNECT
returns 403) and does not support raw WebSocket upgrades through its proxy at all.
This means:

- All Kraken client code is written against Kraken's real, documented public
  REST (`https://api.kraken.com/0/public/...`) and WebSocket
  (`wss://ws.kraken.com/v2`) APIs, exactly as it would run in production.
- It **cannot be exercised against the live Kraken API from this session**.
  Instead it is covered by unit/integration tests that mock the HTTP/WS layer
  with realistic fixture payloads (shaped like Kraken's real schemas).
- When this is deployed to an environment with normal internet access (any
  regular server/VM/container host), no code changes should be required for
  it to talk to the real Kraken API — only environment variables.
- This limitation is called out again in STATUS.md and must not be papered
  over with fabricated "it works" claims. No fake market data is ever mixed
  into live code paths — mock data only exists inside test files and is
  never reachable from the running app.

## 2. Architecture

Monorepo (npm workspaces), TypeScript throughout:

```
kraken-memes/
  packages/
    shared/          # Pure, framework-free domain logic + types (tested in isolation)
      src/
        types.ts             # Domain types: Market, Candle, Signal, etc.
        kraken/               # Kraken API response types + REST/WS client
        signal-engine/
          liquidity.ts        # Hard liquidity filter
          momentum.ts         # Price/momentum features
          volume.ts           # Volume/trade acceleration features
          orderbook.ts        # Order-book features
          regime.ts           # BTC/SOL/meme-basket market regime
          score.ts            # Weighted opportunity score (0-100)
          state-machine.ts    # Signal state transitions
          setup.ts            # Orchestrates one decision-cycle evaluation
        social/              # Pluggable social-signal provider interface (no-op default)
  apps/
    server/          # Express + TypeScript REST API, Postgres via Drizzle ORM
      src/
        db/                   # schema.ts, migrations, client
        routes/               # markets, signals, alerts, paper-trades, performance,
                               # push, settings, health
        push/                 # web-push sending, VAPID
    worker/           # Persistent background monitor (separate Node process)
      src/
        kraken-ingest.ts      # REST polling + WS subscription, reconnect/backoff
        scan-cycle.ts         # 15m decision cycle: features -> filter -> score -> state
        notifier.ts           # Dedup + cooldown + quiet hours + push dispatch
        index.ts              # Process entrypoint, health reporting
    web/              # Vite + React + TS + Tailwind PWA
      src/
        pages/                # Home, Scanner, Alerts, CoinDetail, Paper, Settings, Onboarding
        components/
        sw.ts                 # Service worker (push, cache, notification click)
        lib/api.ts            # Typed API client
  docker-compose.yml  # Postgres for local/dev
  PLAN.md
  STATUS.md           # Running log of what's implemented vs pending, updated as we go
```

### Why this stack
- Node/TS everywhere → one language, matches "prefer existing conventions" (none
  exist) and the spec's stack preference. No Python service is needed: nothing
  here needs a quant library Node lacks.
- Drizzle ORM chosen over Prisma for a normalized, migration-first Postgres
  schema with minimal runtime overhead in the worker's hot path.
- Vite + React + TS + Tailwind + `vite-plugin-pwa` for the PWA (manifest,
  service worker, offline shell) exactly as requested.
- `web-push` npm package for standards-based Web Push + VAPID.

### Non-negotiable boundaries (from spec, restated as build constraints)
- Worker process is independent of the web app; browser never polls Kraken.
- No trading, no order placement, no Kraken credentials of any kind.
- Every signal snapshot is immutable once written (append-only signal_events,
  no retroactive mutation of stored feature/score inputs).
- Liquidity filter is a hard gate before scoring.
- Missing social data is `unavailable`, never coerced to 0.
- All scoring weights/thresholds configurable, not hard-coded magic numbers
  spread through the code.

## 3. Build order (mirrors spec section 40)

1. Repo foundation: workspaces, TS config, lint/test tooling, Postgres via
   docker-compose + Drizzle, env config, CI-less local test scripts.
2. Database schema + migrations (spec section 30) via Drizzle.
3. Shared domain types + Kraken API client (REST first; WS client written and
   unit-tested against a fake WS server since real Kraken WS is unreachable
   here).
4. Signal engine: liquidity filter, momentum/volume/orderbook features,
   regime classification, weighted score, state machine — each with unit
   tests (spec section 41).
5. Worker process: ingestion loop, scan cycle wiring, reconnect/backoff,
   health reporting.
6. Server API: REST endpoints backing every screen, push subscription
   storage, web-push sending, notification preferences/dedup/cooldown/quiet
   hours logic with tests.
7. Web PWA: mobile-first screens (Home, Scanner, Alerts, Coin Detail, Paper,
   Settings, Onboarding), bottom nav, service worker, install + push
   subscription flow, offline shell.
8. Paper trading simulation (fees/spread/slippage).
9. Performance/analytics screen and queries.
10. Wire it all together, run the test suites, document verified vs.
    not-verifiable-in-sandbox items in STATUS.md.

## 4. Test strategy
- `vitest` for `packages/shared` (pure logic — the most important tests: score
  math, liquidity gating, state transitions, dedup/cooldown logic) and for
  `apps/server` (route logic, notification rules) using a real local Postgres
  (started in this sandbox) for integration tests.
- Kraken REST/WS clients tested against mocked HTTP responses / a local fake
  WebSocket server — never against the real Kraken host (unreachable here).
- Explicitly out of scope for automated verification in this session: actual
  delivery of a push notification to a real phone, and live Kraken data.
  These are flagged in STATUS.md as "implemented, needs live-environment
  verification."

## 5. Defaults (spec section 46)
Quote currency USD; min score 75; target +7%; invalidation -3%; observation
window 24h; decision interval 15m; cooldown 60m/coin; high-priority
notifications ON; invalidation notifications OFF. All stored in a
`scan_config` table / settings API, editable from the Settings screen.
