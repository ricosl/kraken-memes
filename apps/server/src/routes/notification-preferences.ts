import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, getOrCreateDefaultUserId, notificationPreferences } from "@kraken-memes/core";

export const notificationPreferencesRouter = Router();

notificationPreferencesRouter.get("/notification-preferences", async (_req, res) => {
  const userId = await getOrCreateDefaultUserId();
  const prefs = await db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, userId) });
  res.json(prefs);
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  minScore: z.number().min(0).max(100).optional(),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
  newSetupEnabled: z.boolean().optional(),
  invalidationEnabled: z.boolean().optional(),
});

notificationPreferencesRouter.put("/notification-preferences", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid preferences payload", details: parsed.error.flatten() });
    return;
  }

  const userId = await getOrCreateDefaultUserId();
  const [updated] = await db
    .update(notificationPreferences)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, userId))
    .returning();

  res.json(updated);
});
