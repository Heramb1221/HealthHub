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
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  // Development-only login shortcut. Refused when NODE_ENV=production.
  DEV_AUTH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  // Private storage for uploaded prescription files. Never served publicly.
  STORAGE_DIR: z.string().min(1).default("./storage"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(26_214_400).default(10_485_760),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  PATIENT_PRESCRIPTION_LIMIT: z.coerce.number().int().min(1).default(100),
  // "disabled" refuses all processing. "mock" only understands synthetic fixture
  // documents. External OCR/AI providers (including Gemini) are intentionally
  // not available until their terms and clinical suitability are confirmed.
  EXTRACTION_PROVIDER: z.enum(["disabled", "mock"]).default("disabled"),
  PROCESS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEV_AUTH_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_AUTH_ENABLED"],
        message: "development-only login must not be enabled in production",
      });
    }
  });

export type Env = z.infer<typeof schema>;

/** Thrown when configuration is invalid. Lists variable names only, never values. */
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
