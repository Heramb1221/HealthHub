import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { loadEnv, type Env } from "../../src/config/env.js";
import type { Db } from "../../src/db/client.js";
import type { ExtractionProvider } from "../../src/extraction/types.js";
import type { PrivateFileStore } from "../../src/storage/types.js";
import { hashPassword } from "../../src/lib/auth/password.js";
import { uniq } from "./helpers.js";

export const PASSWORD = "Correct-horse-12";
export const JWT_SECRET = "t".repeat(48);

export function testEnv(url: string, overrides: Record<string, string> = {}): Env {
  return loadEnv({
    DATABASE_URL: url,
    JWT_SECRET,
    NODE_ENV: "test",
    RATE_LIMIT_MAX: "100000",
    AUTH_RATE_LIMIT_MAX: "100000",
    UPLOAD_RATE_LIMIT_MAX: "100000",
    PROCESS_RATE_LIMIT_MAX: "100000",
    QR_RATE_LIMIT_MAX: "100000",
    ...overrides,
  });
}

export function buildApp(
  db: Db,
  env: Env,
  register?: Parameters<typeof createApp>[1],
  store?: PrivateFileStore,
  extraction?: ExtractionProvider | null,
): Express {
  return createApp(env, register, { db, ...(store ? { store } : {}), ...(extraction !== undefined ? { extraction } : {}) });
}

export async function seedUser(db: Db, role: "patient" | "admin" | "provider", extra: { isActive?: boolean } = {}) {
  const email = `${uniq(role)}@example.test`;
  const user = await db.user.create({
    data: { email, passwordHash: await hashPassword(PASSWORD), role, isActive: extra.isActive ?? true },
  });

  let patientId: string | undefined;
  if (role === "patient") {
    const patient = await db.patient.create({ data: { userId: user.id, healthId: uniq("HID") } });
    patientId = patient.id;
  }
  return { id: user.id, email, patientId };
}

export async function loginToken(app: Express, email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed in test helper: ${res.status}`);
  return res.body.data.accessToken as string;
}

export async function registerPatient(app: Express, db: Db) {
  const email = `${uniq("pat")}@example.test`;
  const res = await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed in test helper: ${res.status}`);
  const patient = await db.patient.findUniqueOrThrow({ where: { userId: res.body.data.user.id } });
  return { email, token: res.body.data.accessToken as string, userId: res.body.data.user.id as string, patientId: patient.id };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
