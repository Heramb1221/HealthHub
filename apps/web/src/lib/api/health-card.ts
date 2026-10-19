
import { request } from "./http";
import type { HealthCard } from "./types";

export interface HealthCardApi {
  get(): Promise<HealthCard>;
}

function normalizeCard(raw: unknown): HealthCard {
  const card = (raw ?? {}) as Record<string, unknown>;
  const healthId = String(card.healthId ?? "");
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const rawQr = card.qr as { reference?: string; url?: string } | undefined;
  const qr = {
    reference: rawQr?.reference ?? healthId,
    url: rawQr?.url ?? `${baseUrl}/qr/${encodeURIComponent(healthId)}`,
  };
  return {
    healthId,
    fullName: String(card.fullName ?? ""),
    dateOfBirth: card.dateOfBirth ? String(card.dateOfBirth) : null,
    gender: card.gender ? String(card.gender) : null,
    bloodGroup: card.bloodGroup ? String(card.bloodGroup) : null,
    phone: card.phone ? String(card.phone) : null,
    emergencyContactName: card.emergencyContactName ? String(card.emergencyContactName) : null,
    emergencyContactPhone: card.emergencyContactPhone ? String(card.emergencyContactPhone) : null,
    issuer: String(card.issuer ?? "HealthHub Digital Health Network"),
    notice: String(card.notice ?? "Authorized Digital Health Identity Card"),
    issuedAt: String(card.issuedAt ?? card.generatedAt ?? new Date().toISOString()),
    qr,
    isDemo: Boolean(card.isDemo),
  };
}

const liveHealthCardApi: HealthCardApi = {
  get: async () => normalizeCard(await request<HealthCard>("/patients/me/health-card")),
};

export const healthCardApi: HealthCardApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveHealthCardApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/health-card") as typeof import("@/lib/demo/health-card")).demoHealthCardApi;
