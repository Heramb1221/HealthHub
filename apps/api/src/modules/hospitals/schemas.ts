import { z } from "zod";
import { hasNoControlChars } from "../../lib/text.js";

const text = (max: number) => z.string().trim().min(1).max(max).refine(hasNoControlChars);
const phone = z.string().trim().regex(/^\+?[0-9][0-9 ()-]{5,18}[0-9]$/);
const specialties = z
  .array(text(60))
  .max(20)
  .transform((items) => {
    const seen = new Set<string>();
    return items.filter((item) => (seen.has(item.toLowerCase()) ? false : (seen.add(item.toLowerCase()), true)));
  });

/** isDemo is deliberately not accepted: only the seed can create demo-labelled rows. */
export const createHospitalSchema = z.strictObject({
  name: text(120),
  address: text(300).nullable().optional(),
  city: text(80).nullable().optional(),
  phone: phone.nullable().optional(),
  specialties: specialties.optional(),
});

export const updateHospitalSchema = z
  .strictObject({
    name: text(120).optional(),
    address: text(300).nullable().optional(),
    city: text(80).nullable().optional(),
    phone: phone.nullable().optional(),
    specialties: specialties.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

export const listHospitalsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  q: text(80).optional(),
  city: text(80).optional(),
  specialty: text(60).optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
});

export const availabilityQuerySchema = z
  .strictObject({
    from: z.iso.datetime({ offset: true }).transform((v) => new Date(v)).optional(),
    to: z.iso.datetime({ offset: true }).transform((v) => new Date(v)).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.uuid().optional(),
  })
  .refine((v) => !v.from || !v.to || v.to.getTime() > v.from.getTime())
  .refine((v) => !v.from || !v.to || v.to.getTime() - v.from.getTime() <= 31 * 86_400_000);
