import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.strictObject({
  email,
  password: z.string().min(10).max(128),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});

export const devLoginSchema = z.strictObject({ email });
