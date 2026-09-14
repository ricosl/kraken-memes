# Deployment Guide — Render (backend) + GitHub Actions (scanner) + Netlify (frontend)

This deploys:
- **Render**: Postgres + the API server (`apps/server`) — both genuinely
  free plans
- **GitHub Actions**: a free scheduled workflow that runs the periodic
  Kraken scan (`apps/worker/src/cron.ts`) every 15 minutes, connecting
  directly to the same Render Postgres database
- **Netlify**: the mobile PWA (`apps/web`), proxying `/api/*` to Render so
  the browser never talks cross-origin

Read `STATUS.md` first if you haven't — it documents what's actually been
verified versus what needs a real internet-connected host to confirm (this
repo was built in a sandboxed dev environment that couldn't reach Kraken).
This deployment is exactly how you get past that limitation.

## Why GitHub Actions instead of Render for the scan itself

`apps/worker` was designed as an always-on daemon (spec: "the worker must
continue operating... browser must NEVER be responsible for continuous
monitoring"). Render has no free plan for either an always-on background
process *or* a scheduled Cron Job — both require a paid plan there, since
free compute on Render only exists for request-driven web services that can
spin down when idle.

GitHub Actions' scheduled workflows solve this for free: 2,000 minutes/month
on a private repo (unlimited on a public one), and this job takes seconds
per run — nowhere close to that limit at a 15-minute cadence. It runs
`apps/worker/src/cron.ts`, the same single-pass discovery → ingest → scan →
notify pipeline, connecting straight to your Render Postgres database over
the internet (Render Postgres supports external connections; see Step 2).

Two caveats worth knowing:
- GitHub disables a scheduled workflow after **60 days with no repository
  activity** (any commit, or manually running the workflow, resets this).
- GitHub says schedules "can be delayed during periods of high load" —
  fine for a 15-minute cadence aimed at 4–24 hour setups, not something to
  rely on for sub-minute precision.

It still watches Kraken without you having the app open — the core promise
holds — but it checks in every 15 minutes instead of continuously, and it
never holds a live Kraken WebSocket connection between runs (health
reporting accounts for this: it won't falsely claim `MONITORING` status, it
just uses a 15-minute-appropriate staleness window instead of the daemon's
sub-minute one).

**If you'd rather have the real persistent daemon** (tighter monitoring,
live WS ticker updates, no GitHub Actions dependency): add a Render
Background Worker service (~$7/mo on Render's Starter plan, since it's
never idle) with start command `npm run start -w apps/worker` (the
persistent daemon, `apps/worker/src/index.ts`), point its `DATABASE_URL` at
the same `kraken-memes-db`, disable the GitHub Actions workflow (delete
`.github/workflows/scan.yml` or disable it from the repo's Actions tab),
and remove the three `HEALTH_*_STALE_SECONDS` overrides from the server's
env vars so it falls back to the tighter defaults meant for a
continuously-updating daemon.

## Step 1 — Generate production VAPID keys

Web Push needs its own keypair (never reuse the repo's local-dev `.env`
values). Run this locally or use ones already generated for you earlier in
this conversation:

```
npx web-push generate-vapid-keys
```

Keep the private key secret — you'll paste both into Render's dashboard
(Step 2) and GitHub's repo secrets (Step 3), never into a committed file.

## Step 2 — Deploy the backend to Render

1. Push this repo to GitHub if you haven't (it already is, on
   `claude/kraken-meme-coin-pwa-xwptih`).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** →
   **Blueprint**.
3. Connect your GitHub account if prompted, then select the `kraken-memes`
   repo. Render will detect `render.yaml` at the repo root and show you two
   resources: a Postgres database (`kraken-memes-db`) and a web service
   (`kraken-memes-server`) — both free.
4. Render will ask you to fill in `VAPID_PUBLIC_KEY` and
   `VAPID_PRIVATE_KEY` (marked `sync: false` in `render.yaml`). Paste the
   keys from Step 1.
5. Click **Apply**. Render provisions the database, then builds and deploys
   the web service (it runs migrations + seed itself on every boot — see
   `apps/server/src/index.ts` — since Render's free web services don't
   support a separate pre-deploy step).
6. Once deployed, confirm `/api/health` responds:
   ```
   curl https://kraken-memes-server.onrender.com/api/health
   ```
   (If Render assigned a different subdomain due to a name collision, use
   that instead — check the dashboard.) You should get JSON back with
   `"status"` set to `OFFLINE` (correct — nothing has scanned yet).
7. **Get the external database connection string** for Step 3: Render
   dashboard → `kraken-memes-db` → **Connect** → copy the **External
   Database URL** (not the "Internal" one — that only works from other
   Render services in the same private network, not from GitHub's
   runners). Also check the database's **Access Control** tab and make
   sure external connections aren't restricted to a specific IP allowlist
   (GitHub Actions runners use rotating IPs) — the default "allow from
   anywhere" setting is what you want here.
8. **If Render assigned a different subdomain** than
   `kraken-memes-server`, update the `to` URL in `netlify.toml`
   (`[[redirects]]` for `/api/*`) to match, and redeploy the Netlify site
   after Step 4.

Render's free Postgres plan expires after 90 days and needs to be
recreated — a known limitation of the free tier, not something to fix in
code. You'll get a warning email from Render before it happens.

## Step 3 — Set up the GitHub Actions scan

1. In the GitHub repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**. Add three secrets:
   - `DATABASE_URL` — the **External Database URL** from Step 2.7
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — same values as Step 1/2.4
2. `.github/workflows/scan.yml` is already in the repo and will start
   running on its `*/15 * * * *` schedule automatically once these secrets
   exist (GitHub only runs scheduled workflows from the repo's default
   branch — right now that's `claude/kraken-meme-coin-pwa-xwptih`, since
   it's the only branch that exists; if you later create and switch to a
   `main` branch, make sure this workflow file exists there too).
3. To test immediately rather than waiting up to 15 minutes: repo →
   **Actions** tab → **Kraken scan** workflow → **Run workflow** (this is
   the `workflow_dispatch` trigger already in the file).
4. Check the run's logs — you should see the same structured JSON lines
   you'd see running it locally (`cron_run_starting`,
   `market_discovery_complete`, `scan_cycle_complete`,
   `cron_run_complete`). A `market_discovery_failed` with an HTTP error
   means something's blocking the runner from reaching Kraken (unlikely
   for a GitHub-hosted runner) or your `DATABASE_URL` is wrong.

## Step 4 — Deploy the frontend to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** →
   **Import an existing project** → connect GitHub → select the
   `kraken-memes` repo, branch `claude/kraken-meme-coin-pwa-xwptih` (or
   whichever branch you want live).
2. Netlify reads `netlify.toml` automatically — build command, publish
   directory, and the `/api/*` proxy redirect are all already configured.
   You shouldn't need to change anything in Netlify's UI.
3. Deploy. Once it's live, open the Netlify URL on your phone.

## Step 5 — Install it and enable notifications

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
  should start climbing above 0 within ~15 minutes of the first successful
  Actions run (once Kraken market discovery succeeds — this requires the
  GitHub-hosted runner to actually reach `api.kraken.com`, which it will,
  unlike the sandboxed dev environment this was built in).
- The Home screen's status pill should read `MONITORING` (not `DEGRADED`/
  `OFFLINE`) once at least one scan has completed successfully.
- GitHub repo → **Actions** tab → **Kraken scan** → any run's logs is the
  fastest way to confirm it's actually reaching Kraken and finding markets.

## Updating any part of this later

Render and Netlify redeploy automatically on push to the branch they're
tracking. GitHub Actions picks up workflow file changes on push to the
default branch. To ship a change: commit, push, wait for the relevant
piece(s) to finish (a minute or two each).
