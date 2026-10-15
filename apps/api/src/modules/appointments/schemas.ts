import { z } from "zod";

/** Only the slot. The patient comes from the session; status, price, and availability are decided by the server. */
export const bookAppointmentSchema = z.strictObject({ slotId: z.uuid() });

export const listAppointmentsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  status: z.enum(["confirmed", "cancelled"]).optional(),
});
