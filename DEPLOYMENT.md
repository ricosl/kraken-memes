# Deployment Guide — Render (backend) + Netlify (frontend)

This deploys:
- **Render**: Postgres + the API server (`apps/server`) + the monitoring
  worker as a free Cron Job (`apps/worker/src/cron.ts`)
- **Netlify**: the mobile PWA (`apps/web`), proxying `/api/*` to Render so
  the browser never talks cross-origin

Read `STATUS.md` first if you haven't — it documents what's actually been
verified versus what needs a real internet-connected host to confirm (this
repo was built in a sandboxed dev environment that couldn't reach Kraken).
This deployment is exactly how you get past that limitation.

## Why a Cron Job instead of the persistent worker

`apps/worker` was designed as an always-on daemon (spec: "the worker must
continue operating... browser must NEVER be responsible for continuous
monitoring"). Render's **free** tier doesn't support always-on background
processes — free services spin down when idle, which only works for
request-driven web services, not a process that's supposed to never stop.

So by default this deploys `apps/worker/src/cron.ts`: a single-pass version
of the same discovery → ingest → scan → notify pipeline, run on a schedule
instead of in a loop. It still watches Kraken without you having the app
open — the core promise holds — but it checks in every 15 minutes instead
of continuously, and it never holds a live Kraken WebSocket connection
between runs (health reporting accounts for this: it won't falsely claim
`MONITORING` status, it just uses a 15-minute-appropriate staleness window
instead of the daemon's sub-minute one).

**If you'd rather have the real persistent daemon** (tighter monitoring,
live WS ticker updates): change `kraken-memes-worker-cron` in the Render
dashboard from a Cron Job to a **Background Worker** (~$7/mo on Render's
Starter plan, since it's never idle), set its start command to
`npm run start -w apps/worker` (already runs the persistent daemon,
`apps/worker/src/index.ts`), drop the `schedule` field, and remove the
three `HEALTH_*_STALE_SECONDS` overrides from the server's env vars so it
falls back to the tighter defaults meant for a continuously-updating daemon.

## Step 1 — Generate production VAPID keys

Web Push needs its own keypair (never reuse the repo's local-dev `.env`
values). Run this locally or use the ones already generated for you in this
session's chat response:

```
npx web-push generate-vapid-keys
```

Keep the private key secret — you'll paste both into Render's dashboard in
Step 2, never into a committed file.

## Step 2 — Deploy the backend to Render

1. Push this repo to GitHub if you haven't (it already is, on
   `claude/kraken-meme-coin-pwa-xwptih`).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** →
   **Blueprint**.
3. Connect your GitHub account if prompted, then select the `kraken-memes`
   repo. Render will detect `render.yaml` at the repo root and show you
   three resources: a Postgres database, a web service
   (`kraken-memes-server`), and a cron job (`kraken-memes-worker-cron`).
4. Render will ask you to fill in the env vars marked `sync: false` in
   `render.yaml` — that's `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on
   **both** the web service and the cron job (same values on each). Paste
   the keys from Step 1.
5. Click **Apply**. Render will provision the database, then build and
   deploy the web service (it runs migrations + seed itself on every boot —
   see `apps/server/src/index.ts` — since Render's free web services don't
   support a separate pre-deploy step), then set up the cron job on its
   schedule.
6. **Check the plan/cost Render shows for the cron job before confirming.**
   Postgres and the web service should show as free. The cron job's exact
   plan naming/pricing can change on Render's side; each run is brief (a
   few seconds), so cost should be minimal even if it isn't literally free
   — but confirm what Render actually shows you, and use the persistent
   Background Worker section above instead if you'd rather have a fixed
   known cost.
7. Once deployed, open the web service's URL
   (`https://kraken-memes-server.onrender.com` unless Render assigned a
   different subdomain due to a name collision — check the dashboard) and
   confirm `/api/health` responds:
   ```
   curl https://kraken-memes-server.onrender.com/api/health
   ```
   You should get JSON back with `"status"` set to `OFFLINE` (correct —
   the cron job hasn't run yet) or `MONITORING` once it has.
8. **If Render assigned a different subdomain** than
   `kraken-memes-server`, update the `to` URL in `netlify.toml`
   (`[[redirects]]` for `/api/*`) to match, and redeploy the Netlify site
   after Step 3.

Render's free Postgres plan expires after 90 days and needs to be
recreated — a known limitation of the free tier, not something to fix in
code. You'll get a warning email from Render before it happens.

## Step 3 — Deploy the frontend to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** →
   **Import an existing project** → connect GitHub → select the
   `kraken-memes` repo, branch `claude/kraken-meme-coin-pwa-xwptih` (or
   whichever branch you want live).
2. Netlify reads `netlify.toml` automatically — build command, publish
   directory, and the `/api/*` proxy redirect are all already configured.
   You shouldn't need to change anything in Netlify's UI.
3. Deploy. Once it's live, open the Netlify URL on your phone.

## Step 4 — Install it and enable notifications

1. Open the Netlify URL on your phone's browser.
2. **iPhone/iPad**: Share → Add to Home Screen, then open it from the Home
   Screen icon (Web Push doesn't work from a plain Safari tab on iOS).
   **Android**: Chrome will offer an "Install app" prompt, or use the menu
   → Install app.
3. Go through onboarding, tap **Enable Notifications** when prompted (this
   requests permission and creates a push subscription against your live
   Render backend).
4. Go to Settings and confirm your notification preferences match what you
   want (default: min score 75, 60-minute cooldown, new-setup alerts on,
   invalidation alerts off).

## Verifying it's actually working

- `GET https://<your-render-url>/api/health` — `eligibleMarketCount`
  should start climbing above 0 within ~15 minutes of the first cron run
  (once Kraken market discovery succeeds — this requires the Render host
  to actually reach `api.kraken.com`, which it will, unlike the sandboxed
  dev environment this was built in).
- The Home screen's status pill should read `MONITORING` (not `DEGRADED`/
  `OFFLINE`) once at least one cron run has completed successfully.
- Render's dashboard → the cron job → **Logs** shows each run's structured
  JSON log lines (`cron_run_starting`, `market_discovery_complete`,
  `scan_cycle_complete`, `cron_run_complete`) — this is the fastest way to
  confirm it's actually reaching Kraken and finding markets.

## Updating either deployment later

Both Render and Netlify redeploy automatically on push to the branch
they're tracking. To ship a change: commit, push, wait for both to finish
building (a minute or two each).
