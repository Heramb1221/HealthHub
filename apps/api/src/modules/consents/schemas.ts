import { z } from "zod";

export const CONSENT_SCOPES = ["profile:read", "prescriptions:read", "health_history:read", "medication_schedules:read"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const createConsentSchema = z.strictObject({
  granteeUserId: z.uuid(),
  resourceScope: z.enum(CONSENT_SCOPES),
  purpose: z.string().trim().min(1).max(200),
  expiresAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
});

export const listConsentsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});
