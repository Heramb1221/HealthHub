import type { Db } from "../../db/client.js";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { loadScheduleDtos } from "../schedules/service.js";
import { ownPatientId } from "../patients/ownPatient.js";
import { reconcileScheduleEvents, wantedTimes } from "./events.js";
import { createClerkClient } from "@clerk/express";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export interface CalendarStatusDto {
  isConfigured: boolean;
  connected: boolean;
  email?: string | null;
  provider?: "google_oauth" | "clerk" | null;
}

export interface SyncResultDto {
  /** Calendar events now in place (created or updated). */
  syncedCount: number;
  /** Events removed because a schedule was paused, finished, out of date or had that time removed. */
  removedCount: number;
  /** Schedules with nothing to put on the calendar (reminders off, paused, finished, out of date). */
  skippedCount: number;
  failedCount: number;
  events: Array<{
    medicationName: string;
    time: string;
    calendarLink?: string;
  }>;
}

export async function getCalendarStatus(
  db: Db,
  auth: AuthContext,
  env: Env,
): Promise<CalendarStatusDto> {
  const isConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  const token = await db.googleOAuthToken.findUnique({
    where: { userId: auth.userId },
  });

  if (token) {
    return {
      isConfigured: true,
      connected: true,
      email: token.email,
      provider: "google_oauth",
    };
  }

  if (env.CLERK_SECRET_KEY) {
    try {
      const user = await db.user.findUnique({
        where: { id: auth.userId },
        select: { clerkUserId: true, email: true },
      });
      if (user?.clerkUserId) {
        const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
        const oauthTokens = await clerk.users.getUserOauthAccessToken(user.clerkUserId, "oauth_google");
        const googleToken = oauthTokens.data?.[0];
        if (googleToken?.token) {
          return {
            isConfigured: true,
            connected: true,
            email: user.email,
            provider: "clerk",
          };
        }
      }
    } catch {

    }
  }

  return {
    isConfigured,
    connected: false,
    email: null,
    provider: null,
  };
}

export function getGoogleOAuthUrl(env: Env, userId: string, redirectOrigin?: string): string {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError("PROVIDER_DISABLED", "Google Calendar OAuth is not configured on the server");
  }

  const redirectUri = redirectOrigin
    ? `${redirectOrigin.replace(/\/$/, "")}/api/v1/calendar/google/callback`
    : env.GOOGLE_REDIRECT_URI;

  const state = Buffer.from(JSON.stringify({ userId, redirectUri })).toString("base64url");

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${CALENDAR_SCOPE} openid email profile`,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function handleGoogleOAuthCallback(
  db: Db,
  env: Env,
  code: string,
  stateRaw: string,
): Promise<{ redirectUrl: string }> {
  let userId: string;
  let redirectUri: string;
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    userId = parsed.userId;
    redirectUri = parsed.redirectUri || env.GOOGLE_REDIRECT_URI;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid OAuth state parameter");
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    log("error", "Google token exchange failed", { status: res.status, body: errText });
    throw new AppError("UNAUTHENTICATED", "Failed to exchange Google OAuth code");
  }

  const tokenData = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  let email: string | null = null;
  try {
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userinfoRes.ok) {
      const info = (await userinfoRes.json()) as { email?: string };
      email = info.email ?? null;
    }
  } catch {

  }

  const expiryDate = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : new Date(Date.now() + 3600 * 1000);

  await db.googleOAuthToken.upsert({
    where: { userId },
    update: {
      accessToken: tokenData.access_token,
      ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
      expiryDate,
      scope: tokenData.scope,
      email,
    },
    create: {
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiryDate,
      scope: tokenData.scope,
      email,
    },
  });

  let targetOrigin = "http://localhost:3000";
  try {
    targetOrigin = new URL(redirectUri).origin;
  } catch {

  }

  return { redirectUrl: `${targetOrigin}/medications?calendarConnected=true` };
}

export async function disconnectGoogleCalendar(db: Db, auth: AuthContext): Promise<void> {
  await db.googleOAuthToken.deleteMany({
    where: { userId: auth.userId },
  });
}

async function getValidAccessToken(
  db: Db,
  auth: AuthContext,
  env: Env,
): Promise<string> {

  const tokenRecord = await db.googleOAuthToken.findUnique({
    where: { userId: auth.userId },
  });

  if (tokenRecord) {
    const now = Date.now();
    const isExpired = tokenRecord.expiryDate ? tokenRecord.expiryDate.getTime() - now < 60_000 : false;
    if (!isExpired) {
      return tokenRecord.accessToken;
    }

    if (tokenRecord.refreshToken && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      const refreshRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: tokenRecord.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as {
          access_token: string;
          expires_in?: number;
        };
        const expiryDate = refreshData.expires_in
          ? new Date(Date.now() + refreshData.expires_in * 1000)
          : new Date(Date.now() + 3600 * 1000);

        await db.googleOAuthToken.update({
          where: { userId: auth.userId },
          data: {
            accessToken: refreshData.access_token,
            expiryDate,
          },
        });
        return refreshData.access_token;
      }
    }
    return tokenRecord.accessToken;
  }

  if (env.CLERK_SECRET_KEY) {
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { clerkUserId: true },
    });
    if (user?.clerkUserId) {
      const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      const oauthTokens = await clerk.users.getUserOauthAccessToken(user.clerkUserId, "oauth_google");
      const googleToken = oauthTokens.data?.[0]?.token;
      if (googleToken) return googleToken;
    }
  }

  throw new AppError("UNAUTHENTICATED", "Google Calendar is not connected. Please connect your Google account.");
}

export async function syncMedicationSchedules(
  db: Db,
  auth: AuthContext,
  env: Env,
  input: { scheduleIds?: string[]; prescriptionId?: string; showMedicineNames?: boolean },
): Promise<SyncResultDto> {
  const patientId = await ownPatientId(db, auth);
  const accessToken = await getValidAccessToken(db, auth, env);

  // Every matching schedule is reconciled, including paused and finished ones, so their calendar events are removed.
  const schedules = await loadScheduleDtos(db, {
    patientId,
    ...(input.scheduleIds && input.scheduleIds.length > 0 ? { id: { in: input.scheduleIds } } : {}),
    ...(input.prescriptionId ? { sourceMedication: { version: { prescriptionId: input.prescriptionId } } } : {}),
  });

  const events: SyncResultDto["events"] = [];
  let removedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  for (const schedule of schedules) {
    if (wantedTimes(schedule).length === 0) skippedCount += 1;
    const result = await reconcileScheduleEvents(fetch, accessToken, schedule, { showMedicineNames: input.showMedicineNames === true });
    removedCount += result.removed;
    failedCount += result.failed;
    for (const l of result.links) events.push({ medicationName: schedule.medication.name ?? "Medicine", time: l.time, ...(l.link ? { calendarLink: l.link } : {}) });
  }
  if (failedCount > 0) log("error", "Google Calendar sync had failures", { failedCount });

  return { syncedCount: events.length, removedCount, skippedCount, failedCount, events };
}
