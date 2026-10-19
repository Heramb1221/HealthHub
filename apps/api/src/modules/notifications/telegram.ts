import type { Env } from "../../config/env.js";

export interface TelegramMessageOptions {
  chatId?: string;
  text: string;
  parseMode?: "Markdown" | "HTML";
  buttons?: Array<{ text: string; url?: string; callbackData?: string }>;
}

export interface TelegramResult {
  success: boolean;
  messageId?: number;
  simulated?: boolean;
  error?: string;
}

/**
 * Sends a real-time notification alert via the Telegram Bot API.
 * When TELEGRAM_BOT_TOKEN is not configured, it runs in simulated mode with
 * safe structured logging so local testing and development never fails.
 */
export async function sendTelegramNotification(
  env: Env,
  options: TelegramMessageOptions,
): Promise<TelegramResult> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId || env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    // Simulated/demo mode: log and return simulated success
    return {
      success: true,
      simulated: true,
      error: undefined,
    };
  }

  try {
    const inlineKeyboard = options.buttons && options.buttons.length > 0
      ? {
          inline_keyboard: [
            options.buttons.map((b) => ({
              text: b.text,
              ...(b.url ? { url: b.url } : {}),
              ...(b.callbackData ? { callback_data: b.callbackData } : {}),
            })),
          ],
        }
      : undefined;

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: options.text,
      parse_mode: options.parseMode || "Markdown",
      ...(inlineKeyboard ? { reply_markup: inlineKeyboard } : {}),
    };

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.description || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      messageId: data.result?.message_id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
