import type { Db } from "../../db/client.js";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { ownPatientId } from "../patients/ownPatient.js";
import { createClerkClient } from "@clerk/express";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export interface CalendarStatusDto {
  isConfigured: boolean;
  connected: boolean;
  email?: string | null;
  provider?: "google_oauth" | "clerk" | null;
}

export interface SyncResultDto {
  syncedCount: number;
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

  // 1. Check local GoogleOAuthToken table
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

  // 2. Check Clerk OAuth tokens if user is linked to Clerk
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
      // Clerk OAuth token fetch failed or not authorized with Google scope
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
    // optional userinfo
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
    // fallback
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
  // Check local database
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

  // Check Clerk Google OAuth token
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
  input: { scheduleIds?: string[]; prescriptionId?: string },
): Promise<SyncResultDto> {
  const patientId = await ownPatientId(db, auth);
  const accessToken = await getValidAccessToken(db, auth, env);

  const schedules = await db.medicationSchedule.findMany({
    where: {
      patientId,
      isActive: true,
      ...(input.scheduleIds && input.scheduleIds.length > 0 ? { id: { in: input.scheduleIds } } : {}),
      ...(input.prescriptionId
        ? { sourceMedication: { version: { prescriptionId: input.prescriptionId } } }
        : {}),
    },
  });

  if (schedules.length === 0) {
    return { syncedCount: 0, events: [] };
  }

  const createdEvents: Array<{ medicationName: string; time: string; calendarLink?: string }> = [];

  for (const schedule of schedules) {
    const times = schedule.reminderTimes.length > 0 ? schedule.reminderTimes : ["08:00"];
    const tz = schedule.timezone || "Asia/Kolkata";
    const startIsoDate = schedule.startDate.toISOString().slice(0, 10);

    for (const time of times) {
      const [hourStr, minStr] = time.split(":");
      const startDateTime = `${startIsoDate}T${(hourStr || "08").padStart(2, "0")}:${(minStr || "00").padStart(2, "0")}:00`;
      
      const startD = new Date(`${startIsoDate}T${time}:00`);
      const endD = new Date(startD.getTime() + 15 * 60_000);
      const endDateTime = `${startIsoDate}T${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}:00`;

      // Recurrence rule
      const recurrenceRules: string[] = [];
      if (schedule.endDate) {
        const untilStr = schedule.endDate.toISOString().slice(0, 10).replace(/-/g, "");
        recurrenceRules.push(`RRULE:FREQ=DAILY;UNTIL=${untilStr}T235959Z`);
      } else {
        recurrenceRules.push("RRULE:FREQ=DAILY");
      }

      const eventPayload = {
        summary: `💊 Take ${schedule.medicationName}${schedule.strength ? ` ${schedule.strength}` : ""}`,
        description: [
          `HealthHub Medication Reminder`,
          `Medicine: ${schedule.medicationName}`,
          `Dose: ${schedule.dose}`,
          `Prescribed frequency: ${schedule.frequency}`,
          schedule.instructions ? `Instructions: ${schedule.instructions}` : null,
          `Take on time as advised by your doctor.`,
        ]
          .filter(Boolean)
          .join("\n"),
        start: {
          dateTime: startDateTime,
          timeZone: tz,
        },
        end: {
          dateTime: endDateTime,
          timeZone: tz,
        },
        recurrence: recurrenceRules,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 5 },
            { method: "popup", minutes: 0 },
          ],
        },
      };

      try {
        const calRes = await fetch(GOOGLE_CALENDAR_EVENTS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventPayload),
        });

        if (calRes.ok) {
          const created = (await calRes.json()) as { htmlLink?: string };
          createdEvents.push({
            medicationName: schedule.medicationName,
            time,
            calendarLink: created.htmlLink,
          });
        } else {
          const errBody = await calRes.text();
          log("error", "Google Calendar event creation failed", {
            status: calRes.status,
            error: errBody,
            scheduleId: schedule.id,
          });
        }
      } catch (err) {
        log("error", "Exception creating Google Calendar event", {
          error: (err as Error).message,
          scheduleId: schedule.id,
        });
      }
    }
  }

  return {
    syncedCount: createdEvents.length,
    events: createdEvents,
  };
}
