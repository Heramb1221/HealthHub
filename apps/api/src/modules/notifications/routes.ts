import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import {
  getNotificationPreferences,
  sendTestNotification,
  updateNotificationPreferences,
} from "./service.js";

const updatePreferencesSchema = z.strictObject({
  emailEnabled: z.boolean().optional(),
  appointmentsEnabled: z.boolean().optional(),
  prescriptionsEnabled: z.boolean().optional(),
  medicationsEnabled: z.boolean().optional(),
  securityAlertsEnabled: z.boolean().optional(),
});

export function createNotificationRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(requireRole("patient"));

  router.get("/preferences", async (req, res) => {
    const data = await getNotificationPreferences(db, requireAuth(req));
    res.json({ data });
  });

  router.patch("/preferences", async (req, res) => {
    const input = parse(updatePreferencesSchema, req.body);
    const data = await updateNotificationPreferences(db, requireAuth(req), input);
    res.json({ data });
  });

  router.post("/test", async (req, res) => {
    const result = await sendTestNotification(db, env, requireAuth(req));
    res.json({ data: result });
  });

  router.post("/telegram/test", async (req, res) => {
    const auth = requireAuth(req);
    const { sendTelegramNotification } = await import("./telegram.js");
    const result = await sendTelegramNotification(env, {
      text: `🏥 *HealthHub Alert Test*\n\nYour profile is configured to receive automated clinical medication reminders and appointment alerts.\n\n*User ID:* \`${auth.userId}\``,
      buttons: [
        { text: "Open HealthHub Dashboard", url: "http://localhost:3000/dashboard" },
      ],
    });
    res.json({ data: result });
  });

  router.post("/whatsapp-reminder", async (req, res) => {
    const schema = z.object({
      phone: z.string().optional(),
      medicationName: z.string().min(1),
      dosage: z.string().min(1),
      instructions: z.string().optional(),
    });
    const parsed = schema.parse(req.body);
    const cleanPhone = parsed.phone ? parsed.phone.replace(/[^0-9]/g, "") : "";
    const text = `🏥 *HealthHub Medication Reminder*\n\n` +
      `Medicine: *${parsed.medicationName}*\n` +
      `Dosage: *${parsed.dosage}*\n` +
      (parsed.instructions ? `Instructions: ${parsed.instructions}\n` : "") +
      `\nPlease reply *TAKEN* once you have taken this dose.`;

    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    res.json({
      data: {
        whatsappUrl: url,
        text,
        cleanPhone,
      },
    });
  });

  return router;
}
