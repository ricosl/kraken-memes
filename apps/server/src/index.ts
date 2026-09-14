import { configureWebPush, logger, runMigrations, runSeed } from "@kraken-memes/core";
import { createApp } from "./app.js";

async function main() {
  // Run migrations + seed on every boot rather than relying on a platform's
  // separate "pre-deploy" step (some free tiers, e.g. Render's, don't support
  // one). Both are idempotent, so this is safe on every restart, not just the
  // first.
  logger.info("running_startup_migrations");
  await runMigrations();
  await runSeed();
  logger.info("startup_migrations_complete");

  configureWebPush();

  const app = createApp();
  // Render (and most PaaS hosts) assign the port via $PORT; SERVER_PORT remains
  // for local/dev use where that convention doesn't apply.
  const port = Number(process.env.PORT) || Number(process.env.SERVER_PORT) || 4000;

  app.listen(port, () => {
    logger.info("server_started", { port });
  });
}

main().catch((err) => {
  logger.error("server_startup_failed", { error: String(err) });
  process.exit(1);
});
