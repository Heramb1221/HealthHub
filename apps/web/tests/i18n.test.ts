import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  BRAND_NAME,
  BRAND_TAGLINE,
  DEFAULT_LANGUAGE,
  DICTIONARY,
  LOCALE_TAGS,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  lookupTranslation,
  type SupportedLanguage,
} from "../src/lib/i18n/languages";
import { formatDate, formatNumber, formatRupees, formatTime, toDate } from "../src/lib/i18n/format";
import { hasTranslatableContent, translateExact } from "../src/lib/i18n/dom-translation";
import { interpolate, pluralCategory, translate } from "../src/lib/i18n/translate";
import { LANGUAGE_STORAGE_KEY, readStoredLanguage, writeStoredLanguage, type KeyValueStore } from "../src/lib/i18n/storage";

const CODES = SUPPORTED_LANGUAGES.map((l) => l.code);
const NON_ENGLISH = CODES.filter((c): c is Exclude<SupportedLanguage, "en"> => c !== "en");

// Same sentence-end rule the translation audit uses (Latin, Devanagari danda, Bengali danda).
const SENTENCE_END = /[.।!?](?=\s|$)/g;
const sentences = (text: string) => (text.match(SENTENCE_END) ?? []).length;

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("supported languages", () => {
  it("declares six unique codes, each with a dictionary and a locale tag", () => {
    assert.equal(new Set(CODES).size, CODES.length);
    assert.deepEqual([...CODES].sort(), ["bn", "en", "hi", "mr", "ta", "te"]);
    for (const code of CODES) {
      assert.ok(DICTIONARY[code], `missing dictionary for ${code}`);
      assert.match(LOCALE_TAGS[code], /^[a-z]{2}-IN$/);
    }
    assert.equal(DEFAULT_LANGUAGE, "en");
  });

  it("validates language codes and rejects prototype names", () => {
    for (const code of CODES) assert.equal(isSupportedLanguage(code), true);
    for (const bad of ["", "xx", "EN", "constructor", "__proto__", "toString", null, undefined, 3]) {
      assert.equal(isSupportedLanguage(bad), false, `should reject ${String(bad)}`);
    }
  });

  it("has no duplicate keys in any dictionary block (object literals silently keep the last one)", () => {
    const source = readFileSync(path.join(__dirname, "../src/lib/i18n/languages.ts"), "utf8");
    const start = source.indexOf("export const DICTIONARY");
    const body = source.slice(start, source.indexOf("\n};", start));
    let current = "";
    const seen = new Map<string, Set<string>>();
    const duplicates: string[] = [];
    for (const line of body.split("\n")) {
      const block = /^ {2}(\w+): \{\s*$/.exec(line);
      if (block) {
        current = block[1];
        seen.set(current, new Set());
        continue;
      }
      const entry = /^\s*"((?:[^"\\]|\\.)*)"\s*:/.exec(line);
      if (entry && current) {
        const keys = seen.get(current)!;
        if (keys.has(entry[1])) duplicates.push(`${current}:${entry[1]}`);
        keys.add(entry[1]);
      }
    }
    assert.deepEqual(duplicates, []);
  });
});

describe("lookup and fallback", () => {
  it("returns exact translations and never for English", () => {
    assert.equal(lookupTranslation("hi", "Dashboard"), DICTIONARY.hi["Dashboard"]);
    assert.equal(lookupTranslation("hi", "  Dashboard  "), DICTIONARY.hi["Dashboard"]);
    assert.equal(lookupTranslation("en", "Dashboard"), null);
  });

  it("does not case-fold or match substrings, so a near match cannot change meaning", () => {
    assert.equal(lookupTranslation("hi", "DASHBOARD"), null);
    assert.equal(translateExact("hi", "Upload a prescription for Insurance Plan 2"), null);
    assert.equal(translateExact("hi", "Dashboards"), null);
  });

  it("falls back to the caller's English text, then the English dictionary, then the key", () => {
    assert.equal(translate("hi", "no_such_key_xyz"), "no_such_key_xyz");
    assert.equal(translate("hi", "no_such_key_xyz", "Fallback text"), "Fallback text");
    assert.equal(translate("bn", "sign_out"), DICTIONARY.bn["sign_out"]);
    assert.notEqual(translate("bn", "sign_out"), "sign_out");
    assert.equal(translate("en", "sign_out"), DICTIONARY.en["sign_out"]);
  });

  it("keeps surrounding whitespace when translating a text node", () => {
    const out = translateExact("hi", "  Dashboard ");
    assert.equal(out, `  ${DICTIONARY.hi["Dashboard"]} `);
  });

  it("does not translate values that are only numbers, units or punctuation", () => {
    assert.equal(hasTranslatableContent("500 mg"), true);
    assert.equal(hasTranslatableContent("12/10/2026"), false);
    assert.equal(hasTranslatableContent("1-0-1"), false);
    assert.equal(hasTranslatableContent("  "), false);
    assert.equal(translateExact("hi", "1-0-1"), null);
  });
});

describe("interpolation and plurals", () => {
  it("fills named placeholders and leaves unknown ones visible", () => {
    assert.equal(interpolate("Hello {name}", { name: "Asha" }), "Hello Asha");
    assert.equal(interpolate("Hello {name}, {missing}", { name: "Asha" }), "Hello Asha, {missing}");
    assert.equal(interpolate("No params {x}"), "No params {x}");
  });

  it("uses the fallback template with interpolation when no translation exists", () => {
    assert.equal(translate("hi", "missing_greeting", "Hello {name}", { name: "Ravi" }), "Hello Ravi");
  });

  it("selects plural forms per language from the dictionary", () => {
    const dict = DICTIONARY.en as Record<string, string>;
    dict["test_reminder_one"] = "{count} reminder";
    dict["test_reminder_other"] = "{count} reminders";
    try {
      assert.equal(translate("en", "test_reminder", undefined, { count: 1 }), "1 reminder");
      assert.equal(translate("en", "test_reminder", undefined, { count: 3 }), "3 reminders");
    } finally {
      delete dict["test_reminder_one"];
      delete dict["test_reminder_other"];
    }
  });

  it("uses CLDR plural categories", () => {
    assert.equal(pluralCategory("en", 1), "one");
    assert.equal(pluralCategory("en", 2), "other");
    assert.equal(pluralCategory("bn", 1), "one");
  });
});

describe("product name and tagline", () => {
  it("keeps the product name in Latin script in every language", () => {
    const transliterations = ["मेद", "मेड्स", "சேஹத்", "సేహత్", "মেদ", "सेहत"];
    for (const lang of CODES) {
      for (const value of Object.values(DICTIONARY[lang])) {
        for (const bad of transliterations) {
          assert.ok(!value.includes(bad), `${lang} transliterates the product name: ${value}`);
        }
      }
    }
    assert.equal(BRAND_NAME, "Sehat Meds");
  });

  it("uses the official tagline in every language", () => {
    for (const lang of CODES) {
      assert.equal(translate(lang, "Bharat ka apna Saathi"), BRAND_TAGLINE);
    }
    for (const lang of NON_ENGLISH) {
      assert.equal(DICTIONARY[lang]["Sehat Meds - Bharat ka apna Saathi"], `${BRAND_NAME} - ${BRAND_TAGLINE}`);
    }
  });
});

describe("clinical text completeness", () => {
  it("never shows a translation with fewer sentences than the English it replaces", () => {
    const short: string[] = [];
    for (const lang of NON_ENGLISH) {
      for (const [key, value] of Object.entries(DICTIONARY[lang])) {
        const english = DICTIONARY.en[key];
        if (english !== undefined && sentences(english) > sentences(value)) {
          short.push(`${lang}: ${key}`);
        }
      }
    }
    assert.deepEqual(short, []);
  });

  it("translates the critical navigation and medical workflow labels in every language", () => {
    const critical = ["Dashboard", "Prescriptions", "Medications", "Medical history", "Insurance", "Profile", "Sign out", "Emergency Warning"];
    for (const key of critical) {
      assert.ok(DICTIONARY.en[key] !== undefined, `English key missing: ${key}`);
      for (const lang of NON_ENGLISH) {
        const value = DICTIONARY[lang][key];
        assert.ok(value, `${lang} has no translation for ${key}`);
        assert.notEqual(value, key, `${lang} still shows English for ${key}`);
      }
    }
  });
});

describe("locale formatting", () => {
  it("parses calendar dates in local time, so they do not shift a day", () => {
    const date = toDate("2026-10-31");
    assert.ok(date);
    assert.equal(date.getDate(), 31);
    assert.equal(date.getMonth(), 9);
  });

  it("formats dates with Latin digits in every language", () => {
    for (const lang of CODES) {
      const out = formatDate("2026-10-31", lang);
      assert.match(out, /2026/, `${lang}: ${out}`);
      assert.match(out, /31/, `${lang}: ${out}`);
      assert.doesNotMatch(out, /[०-९০-৯௦-௯౦-౯]/, `${lang} used native digits: ${out}`);
    }
  });

  it("formats times with Latin digits", () => {
    const out = formatTime(new Date(2026, 9, 31, 8, 5), "hi");
    assert.match(out, /8:05/);
  });

  it("uses Indian digit grouping and rupee symbol, with Latin digits", () => {
    assert.equal(formatNumber(1234567, "en"), "12,34,567");
    assert.equal(formatNumber(1234567, "hi"), "12,34,567");
    assert.equal(formatRupees(1250, "en"), "₹1,250.00");
  });

  it("returns the fallback for missing or invalid values", () => {
    assert.equal(formatDate("not a date", "en", undefined, "FB"), "FB");
    assert.equal(formatDate(null, "en"), "");
    assert.equal(formatNumber(Number.NaN, "en"), "");
  });
});

describe("language persistence", () => {
  it("reads back a saved, supported language", () => {
    assert.equal(readStoredLanguage(memoryStore({ [LANGUAGE_STORAGE_KEY]: "ta" })), "ta");
  });

  it("ignores unsupported or missing values", () => {
    assert.equal(readStoredLanguage(memoryStore({ [LANGUAGE_STORAGE_KEY]: "xx" })), null);
    assert.equal(readStoredLanguage(memoryStore()), null);
    assert.equal(readStoredLanguage(null), null);
  });

  it("survives blocked storage without throwing", () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    assert.equal(readStoredLanguage(blocked), null);
    assert.equal(writeStoredLanguage(blocked, "hi"), false);
  });

  it("writes the chosen language under the existing key", () => {
    const store = memoryStore();
    assert.equal(writeStoredLanguage(store, "mr"), true);
    assert.equal(store.data[LANGUAGE_STORAGE_KEY], "mr");
    assert.equal(readStoredLanguage(store), "mr");
  });
});

describe("language switching", () => {
  it("changes the rendered text when the language changes, and returns to English", () => {
    const english = translate("en", "Dashboard");
    for (const lang of NON_ENGLISH) {
      assert.notEqual(translate(lang, "Dashboard"), english, `${lang} did not change the label`);
    }
    assert.equal(translate("en", "Dashboard"), english);
  });
});
