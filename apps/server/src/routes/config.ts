import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { scanConfig } from "../db/schema.js";
import { logger } from "../logger.js";

export const configRouter = Router();

const weightsSchema = z.object({
  volumeAcceleration: z.number().min(0).max(100),
  breakoutStructure: z.number().min(0).max(100),
  liquidityOrderBook: z.number().min(0).max(100),
  marketRegime: z.number().min(0).max(100),
  social: z.number().min(0).max(100),
});

const scoreThresholdsSchema = z.object({
  watchScore: z.number().min(0).max(100),
  qualifyScore: z.number().min(0).max(100),
  highPriorityScore: z.number().min(0).max(100),
});

const liquidityThresholdsSchema = z.object({
  minQuoteVolume24h: z.number().min(0),
  maxSpreadBps: z.number().min(0),
  minDepthNotional: z.number().min(0),
  minTradeCount1h: z.number().min(0),
});

const updateConfigSchema = z.object({
  targetPct: z.number().gt(0).max(1).optional(),
  invalidationPct: z.number().lt(0).min(-1).optional(),
  observationWindowHours: z.number().gt(0).max(168).optional(),
  decisionIntervalMinutes: z.number().int().positive().optional(),
  weights: weightsSchema.optional(),
  scoreThresholds: scoreThresholdsSchema.optional(),
  liquidityThresholds: liquidityThresholdsSchema.optional(),
});

configRouter.get("/config", async (_req, res) => {
  const config = await db.query.scanConfig.findFirst({ where: (t, { eq }) => eq(t.id, 1) });
  if (!config) {
    res.status(404).json({ error: "Scan config not found. Run the db:seed script." });
    return;
  }
  res.json(config);
});

configRouter.put("/config", async (req, res) => {
  const parsed = updateConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid config payload", details: parsed.error.flatten() });
    return;
  }

  const [updated] = await db
    .update(scanConfig)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(scanConfig.id, 1))
    .returning();

  logger.info("scan_config_updated", { fields: Object.keys(parsed.data) });
  res.json(updated);
});
