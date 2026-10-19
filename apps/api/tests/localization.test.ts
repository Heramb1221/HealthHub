import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES, translateContent } from "../src/modules/localization/bhashini.js";
import { sendTelegramNotification } from "../src/modules/notifications/telegram.js";
import type { Env } from "../src/config/env.js";

const mockEnv = {
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",
  BHASHINI_API_KEY: "",
  BHASHINI_USER_ID: "",
} as unknown as Env;

describe("Bhashini Localization & Multi-Language Dictionary", () => {
  it("supports all 6 specified regional languages", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toEqual(["en", "hi", "ta", "te", "mr", "bn"]);
  });

  it("translates core clinical and navigation terms instantly across languages", async () => {
    // English to Hindi
    const hi = await translateContent(mockEnv, { text: "dashboard", targetLang: "hi" });
    expect(hi.translatedText).toBe("डैशबोर्ड");
    expect(hi.provider).toBe("curated_dictionary");

    // English to Tamil
    const ta = await translateContent(mockEnv, { text: "prescriptions", targetLang: "ta" });
    expect(ta.translatedText).toBe("மருந்து சீட்டு");

    // English to Telugu
    const te = await translateContent(mockEnv, { text: "medications", targetLang: "te" });
    expect(te.translatedText).toBe("మందులు & వేళలు");

    // English to Marathi
    const mr = await translateContent(mockEnv, { text: "health_card", targetLang: "mr" });
    expect(mr.translatedText).toBe("डिजिटल हेल्थ कार्ड");

    // English to Bengali
    const bn = await translateContent(mockEnv, { text: "emergency_call", targetLang: "bn" });
    expect(bn.translatedText).toBe("জরুরী কল 112 / 108");
  });

  it("handles identical source and target language without modification", async () => {
    const res = await translateContent(mockEnv, { text: "Dashboard", sourceLang: "en", targetLang: "en" });
    expect(res.translatedText).toBe("Dashboard");
  });
});

describe("Telegram Bot Notification Service", () => {
  it("operates in safe simulation mode when unconfigured without throwing errors", async () => {
    const result = await sendTelegramNotification(mockEnv, {
      text: "Test notification",
    });
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
  });
});
