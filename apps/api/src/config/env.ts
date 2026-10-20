import { z } from "zod";

const schema = z
  .object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .refine((origins) => origins.every((origin) => origin !== "*"), {
      message: "wildcard origins are not allowed",
    }),
  DATABASE_URL: z
    .string()
    .refine((value) => /^postgres(ql)?:\/\//.test(value), { message: "must be a postgres connection string" }),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  CLERK_SECRET_KEY: z.string().default(""),
  CLERK_PUBLISHABLE_KEY: z.string().default(""),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),

  SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(720).default(168),

  DEV_AUTH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

  STORAGE_DIR: z.string().min(1).default("./storage"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(26_214_400).default(10_485_760),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  PATIENT_PRESCRIPTION_LIMIT: z.coerce.number().int().min(1).default(100),

  EXTRACTION_PROVIDER: z.enum(["disabled", "mock", "gemini"]).default("disabled"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  PROCESS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

  QR_LINK_BASE: z
    .string()
    .default("healthhub://")
    .refine((value) => /^[a-z][a-z0-9+.-]*:\/\/[^\s?#]*$/i.test(value) && value.endsWith("/"), {
      message: "must look like scheme://host/ and end with a slash",
    }),
  QR_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  QR_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM_EMAIL: z.string().default("onboarding@resend.dev"),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:3000/api/v1/calendar/google/callback"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_CHAT_ID: z.string().default(""),
  BHASHINI_API_KEY: z.string().default(""),
  BHASHINI_USER_ID: z.string().default(""),
  })

  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEV_AUTH_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_AUTH_ENABLED"],
        message: "development-only login must not be enabled in production",
      });
    }
    if (env.EXTRACTION_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY is required when EXTRACTION_PROVIDER=gemini",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly variables: string[]) {
    super(`Invalid environment configuration: ${variables.join(", ")}`);
    this.name = "EnvError";
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "unknown")))];
    throw new EnvError(names);
  }
  return result.data;
}
