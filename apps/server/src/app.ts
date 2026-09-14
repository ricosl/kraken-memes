import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { configRouter } from "./routes/config.js";
import { marketsRouter } from "./routes/markets.js";
import { signalsRouter } from "./routes/signals.js";
import { pushRouter } from "./routes/push.js";
import { notificationPreferencesRouter } from "./routes/notification-preferences.js";
import { paperTradesRouter } from "./routes/paper-trades.js";
import { performanceRouter } from "./routes/performance.js";
import { logger } from "@kraken-memes/core";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
  app.use(express.json());

  app.use((req, _res, next) => {
    logger.info("http_request", { method: req.method, path: req.path });
    next();
  });

  app.use("/api", healthRouter);
  app.use("/api", configRouter);
  app.use("/api", marketsRouter);
  app.use("/api", signalsRouter);
  app.use("/api", pushRouter);
  app.use("/api", notificationPreferencesRouter);
  app.use("/api", paperTradesRouter);
  app.use("/api", performanceRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("unhandled_request_error", { error: String(err) });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
