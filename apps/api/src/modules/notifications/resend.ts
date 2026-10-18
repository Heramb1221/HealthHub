import type { Env } from "../../config/env.js";
import { log } from "../../lib/logger.js";

export interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Dispatches an email via Resend REST API using Node.js built-in fetch.
 * Does not depend on heavy third-party SDKs and respects API keys safely.
 */
export async function sendResendEmail(env: Env, payload: SendEmailPayload): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    log("info", "Resend email delivery skipped: RESEND_API_KEY is not configured", {
      to: payload.to,
      subject: payload.subject,
    });
    return { success: false, error: "RESEND_API_KEY_NOT_CONFIGURED" };
  }

  try {
    const from = env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `HealthHub <${from}>`,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      log("warn", "Resend API returned error status", { status: res.status, errorText });
      return { success: false, error: errorText };
    }

    const data = (await res.json()) as { id?: string };
    log("info", "Resend email sent successfully", { messageId: data.id ?? "resend-msg", to: payload.to });
    return { success: true, messageId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Failed to dispatch email through Resend", { error: message });
    return { success: false, error: message };
  }
}
