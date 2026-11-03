import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Passwords are never trimmed or rewritten: spaces (leading, trailing, inner) and any Unicode are
 * significant. The upper bounds only exist to stop absurd inputs reaching the argon2id hasher.
 * Login allows a higher bound than registration so no previously valid password is ever refused.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 256;
export const LOGIN_PASSWORD_MAX = 1024;

export const registerSchema = z.strictObject({
  email,
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(LOGIN_PASSWORD_MAX),
});

export const devLoginSchema = z.strictObject({ email });
