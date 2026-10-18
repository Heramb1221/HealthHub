import type { Consent } from "../api/types.ts";
import { SCOPE_LABEL } from "./access.ts";

export type ConsentStatus = "active" | "expired" | "revoked";

/** A consent only authorises access while it is neither revoked nor past its expiry (backend notes A5/F4). */
export function consentStatus(c: Pick<Consent, "revokedAt" | "expiresAt">, now: Date = new Date()): ConsentStatus {
  if (c.revokedAt) return "revoked";
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export function scopeLabel(scope: string): string {
  const label = SCOPE_LABEL[scope];
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : scope;
}

/** Active first (soonest-created last), then expired, then revoked; stable within a group by newest first. */
export function sortConsents(list: Consent[], now: Date = new Date()): Consent[] {
  const rank: Record<ConsentStatus, number> = { active: 0, expired: 1, revoked: 2 };
  return [...list].sort((a, b) => rank[consentStatus(a, now)] - rank[consentStatus(b, now)] || b.createdAt.localeCompare(a.createdAt));
}

/** Short, non-identifying label for a provider account: only the last 4 characters of its id. */
export function providerLabel(granteeUserId: string): string {
  return `Provider account ending ${granteeUserId.slice(-4)}`;
}
