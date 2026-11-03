import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  BRAND_NAME,
  BRAND_TAGLINE,
  DEFAULT_LANGUAGE,
  LOCALE_TAGS,
  MOBILE_DICTIONARY,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  lookupTranslation,
  type SupportedLanguage,
} from "../src/i18n/languages.ts";
import { formatDate, formatNumber, formatRupees, formatTime, toDate } from "../src/i18n/format.ts";
import { interpolate, pluralCategory, translate } from "../src/i18n/translate.ts";

const CODES = SUPPORTED_LANGUAGES.map((l) => l.code);
const NON_ENGLISH = CODES.filter((c): c is Exclude<SupportedLanguage, "en"> => c !== "en");
const SENTENCE_END = /[.।!?](?=\s|$)/g;
const sentences = (text: string) => (text.match(SENTENCE_END) ?? []).length;

describe("supported languages", () => {
  it("declares six unique codes, each with a dictionary and a locale tag", () => {
    assert.equal(new Set(CODES).size, CODES.length);
    assert.deepEqual([...CODES].sort(), ["bn", "en", "hi", "mr", "ta", "te"]);
    for (const code of CODES) {
      assert.ok(MOBILE_DICTIONARY[code], `missing dictionary for ${code}`);
      assert.match(LOCALE_TAGS[code], /^[a-z]{2}-IN$/);
    }
    assert.equal(DEFAULT_LANGUAGE, "en");
  });

  it("validates language codes and rejects prototype names", () => {
    for (const code of CODES) assert.equal(isSupportedLanguage(code), true);
    for (const bad of ["", "xx", "EN", "constructor", "__proto__", null, undefined, 7]) {
      assert.equal(isSupportedLanguage(bad), false, `should reject ${String(bad)}`);
    }
  });

  it("has no duplicate keys in any dictionary block", () => {
    const source = readFileSync(path.join(__dirname, "../src/i18n/languages.ts"), "utf8");
    const start = source.indexOf("export const MOBILE_DICTIONARY");
    const body = source.slice(start, source.indexOf("\n};", start));
    let current = "";
    const seen = new Map<string, Set<string>>();
    const duplicates: string[] = [];
    for (const line of body.split("\n")) {
      const block = /^ {2}(\w+): \{\s*$/.exec(line);
      if (block?.[1]) {
        current = block[1];
        seen.set(current, new Set());
        continue;
      }
      const entry = /^\s*"((?:[^"\\]|\\.)*)"\s*:/.exec(line);
      const key = entry?.[1];
      if (key !== undefined && current) {
        const keys = seen.get(current) ?? new Set<string>();
        seen.set(current, keys);
        if (keys.has(key)) duplicates.push(`${current}:${key}`);
        keys.add(key);
      }
    }
    assert.deepEqual(duplicates, []);
  });
});

describe("lookup and fallback", () => {
  it("returns exact translations, and null for English or unknown text", () => {
    assert.equal(lookupTranslation("hi", "Dashboard"), MOBILE_DICTIONARY.hi["Dashboard"]);
    assert.equal(lookupTranslation("en", "Dashboard"), null);
    assert.equal(lookupTranslation("hi", "Something not in the dictionary"), null);
  });

  it("does not case-fold or match substrings", () => {
    assert.equal(lookupTranslation("hi", "DASHBOARD"), null);
    assert.equal(lookupTranslation("hi", "Upload a prescription for Insurance Plan 2"), null);
  });

  it("falls back to the caller's English text, then the English entry, then the key", () => {
    assert.equal(translate("ta", "no_such_key_xyz"), "no_such_key_xyz");
    assert.equal(translate("ta", "no_such_key_xyz", "Fallback text"), "Fallback text");
    assert.equal(translate("ta", "sign_out"), MOBILE_DICTIONARY.ta["sign_out"]);
    assert.equal(translate("en", "sign_out"), MOBILE_DICTIONARY.en["sign_out"]);
  });
});

describe("interpolation and plurals", () => {
  it("fills named placeholders and leaves unknown ones visible", () => {
    assert.equal(interpolate("Hello {name}", { name: "Asha" }), "Hello Asha");
    assert.equal(interpolate("Hello {name}, {missing}", { name: "Asha" }), "Hello Asha, {missing}");
  });

  it("uses the fallback template with interpolation when no translation exists", () => {
    assert.equal(translate("hi", "missing_greeting", "Hello {name}", { name: "Ravi" }), "Hello Ravi");
  });

  it("selects plural forms from the dictionary", () => {
    const dict = MOBILE_DICTIONARY.en as Record<string, string>;
    dict["test_dose_one"] = "{count} dose";
    dict["test_dose_other"] = "{count} doses";
    try {
      assert.equal(translate("en", "test_dose", undefined, { count: 1 }), "1 dose");
      assert.equal(translate("en", "test_dose", undefined, { count: 4 }), "4 doses");
    } finally {
      delete dict["test_dose_one"];
      delete dict["test_dose_other"];
    }
    assert.equal(pluralCategory("en", 1), "one");
    assert.equal(pluralCategory("en", 0), "other");
  });
});

describe("product name and tagline", () => {
  it("keeps the product name in Latin script in every language", () => {
    const transliterations = ["मेद", "மேட்", "మేడ్", "মেদ", "सेहत"];
    for (const lang of CODES) {
      for (const value of Object.values(MOBILE_DICTIONARY[lang])) {
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
  });
});

describe("clinical text completeness", () => {
  it("never shows a translation with fewer sentences than the English it replaces", () => {
    const short: string[] = [];
    for (const lang of NON_ENGLISH) {
      for (const [key, value] of Object.entries(MOBILE_DICTIONARY[lang])) {
        const english = MOBILE_DICTIONARY.en[key];
        if (english !== undefined && sentences(english) > sentences(value)) {
          short.push(`${lang}: ${key}`);
        }
      }
    }
    assert.deepEqual(short, []);
  });

  it("translates the critical navigation and medical workflow labels in every language", () => {
    const critical = ["Dashboard", "Prescriptions", "Medications", "Medical history", "Insurance", "Profile", "Sign out", "Emergency contact"];
    for (const key of critical) {
      assert.ok(MOBILE_DICTIONARY.en[key] !== undefined, `English key missing: ${key}`);
      for (const lang of NON_ENGLISH) {
        const value = MOBILE_DICTIONARY[lang][key];
        assert.ok(value, `${lang} has no translation for ${key}`);
        assert.notEqual(value, key, `${lang} still shows English for ${key}`);
      }
    }
  });
});

describe("locale formatting", () => {
  it("parses calendar dates in local time", () => {
    const date = toDate("2026-10-31");
    assert.ok(date);
    assert.equal(date.getDate(), 31);
  });

  it("formats dates with Latin digits in every language", () => {
    for (const lang of CODES) {
      const out = formatDate("2026-10-31", lang);
      assert.match(out, /2026/, `${lang}: ${out}`);
      assert.doesNotMatch(out, /[०-९০-৯௦-௯౦-౯]/, `${lang} used native digits: ${out}`);
    }
  });

  it("formats times with Latin digits", () => {
    assert.match(formatTime(new Date(2026, 9, 31, 8, 5), "bn"), /8:05/);
  });

  it("uses Indian digit grouping, the rupee symbol, and returns fallbacks for invalid input", () => {
    assert.equal(formatNumber(1234567, "mr"), "12,34,567");
    assert.equal(formatRupees(1250, "en"), "₹1,250.00");
    assert.equal(formatDate("not a date", "en", undefined, "FB"), "FB");
    assert.equal(formatNumber(Number.NaN, "en"), "");
  });
});
