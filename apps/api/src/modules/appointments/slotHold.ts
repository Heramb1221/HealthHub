import { AppError } from "../../lib/errors.js";

export interface SlotHold {
  slotId: string;
  hospitalId: string;
  patientId: string;
  userId: string;
  lockedAt: number;
  expiresAt: number;
}

export const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// In-memory slot hold store (concurrency-safe within this instance)
const holds = new Map<string, SlotHold>();

function purgeExpired() {
  const now = Date.now();
  for (const [slotId, hold] of holds.entries()) {
    if (hold.expiresAt <= now) {
      holds.delete(slotId);
    }
  }
}

/**
 * Attempts to reserve/hold a slot for 5 minutes during checkout.
 */
export function acquireSlotHold(
  slotId: string,
  hospitalId: string,
  patientId: string,
  userId: string,
  ttlMs = HOLD_DURATION_MS,
): { held: boolean; expiresAt: string; secondsRemaining: number } {
  purgeExpired();
  const now = Date.now();
  const existing = holds.get(slotId);

  if (existing && existing.expiresAt > now) {
    if (existing.patientId !== patientId) {
      const waitSec = Math.ceil((existing.expiresAt - now) / 1000);
      throw new AppError(
        "CONFLICT",
        `This slot is temporarily held by another patient. It may become available in ${waitSec}s if not completed.`,
      );
    }
    // Refresh patient's own hold
    existing.expiresAt = now + ttlMs;
    return {
      held: true,
      expiresAt: new Date(existing.expiresAt).toISOString(),
      secondsRemaining: Math.ceil(ttlMs / 1000),
    };
  }

  const expiresAt = now + ttlMs;
  holds.set(slotId, {
    slotId,
    hospitalId,
    patientId,
    userId,
    lockedAt: now,
    expiresAt,
  });

  return {
    held: true,
    expiresAt: new Date(expiresAt).toISOString(),
    secondsRemaining: Math.ceil(ttlMs / 1000),
  };
}

/**
 * Releases a hold if the patient cancels selection or navigates away.
 */
export function releaseSlotHold(slotId: string, patientId: string): boolean {
  purgeExpired();
  const existing = holds.get(slotId);
  if (!existing) return false;
  if (existing.patientId === patientId) {
    holds.delete(slotId);
    return true;
  }
  return false;
}

/**
 * Clears hold unconditionally after successful booking.
 */
export function clearSlotHold(slotId: string): void {
  holds.delete(slotId);
}

/**
 * Gets hold status for a single slot from the perspective of a calling patient.
 */
export function getSlotHoldStatus(
  slotId: string,
  callingPatientId?: string | null,
): { isHeld: boolean; heldByMe: boolean; expiresAt?: string; secondsRemaining?: number } {
  purgeExpired();
  const existing = holds.get(slotId);
  if (!existing || existing.expiresAt <= Date.now()) {
    return { isHeld: false, heldByMe: false };
  }

  const heldByMe = Boolean(callingPatientId && existing.patientId === callingPatientId);
  return {
    isHeld: true,
    heldByMe,
    expiresAt: new Date(existing.expiresAt).toISOString(),
    secondsRemaining: Math.ceil((existing.expiresAt - Date.now()) / 1000),
  };
}

/**
 * Returns a map of all active slot holds for a hospital.
 */
export function getHospitalSlotHolds(
  hospitalId: string,
  callingPatientId?: string | null,
): Map<string, { heldByMe: boolean; expiresAt: string; secondsRemaining: number }> {
  purgeExpired();
  const result = new Map<string, { heldByMe: boolean; expiresAt: string; secondsRemaining: number }>();
  const now = Date.now();

  for (const [slotId, hold] of holds.entries()) {
    if (hold.hospitalId === hospitalId && hold.expiresAt > now) {
      result.set(slotId, {
        heldByMe: Boolean(callingPatientId && hold.patientId === callingPatientId),
        expiresAt: new Date(hold.expiresAt).toISOString(),
        secondsRemaining: Math.ceil((hold.expiresAt - now) / 1000),
      });
    }
  }

  return result;
}
