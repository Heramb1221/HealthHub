import { z } from "zod";

export const bookAppointmentSchema = z.strictObject({ slotId: z.uuid() });

export const listAppointmentsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  status: z.enum(["confirmed", "cancelled"]).optional(),
});
