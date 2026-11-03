import { DICTIONARY, DEFAULT_LANGUAGE, LOCALE_TAGS, type SupportedLanguage } from "./languages";

/** Values for `{name}` placeholders. `count` also selects the plural form. */
export type TranslationParams = Record<string, string | number>;

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

const pluralRulesCache = new Map<SupportedLanguage, Intl.PluralRules>();

/** CLDR plural category ("one", "other", ...) for a count in the given language. */
export function pluralCategory(lang: SupportedLanguage, count: number): Intl.LDMLPluralRule {
  let rules = pluralRulesCache.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_TAGS[lang]);
    pluralRulesCache.set(lang, rules);
  }
  return rules.select(count);
}

/**
 * Replaces `{name}` placeholders. Unknown placeholders are left visible so a missing
 * value is obvious in review rather than silently blank.
 */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    hasOwn(params, name) ? String(params[name]) : match,
  );
}

function lookupIn(lang: SupportedLanguage, key: string): string | undefined {
  const dict = DICTIONARY[lang];
  return dict && hasOwn(dict, key) ? dict[key] : undefined;
}

/**
 * Resolves a UI string.
 *
 * Order: the language's own entry (plural form first when `params.count` is numeric),
 * then the caller's English `fallback`, then the English dictionary entry, then the key.
 * A missing translation therefore never shows a raw key such as `sign_out`.
 */
export function translate(
  lang: SupportedLanguage,
  key: string,
  fallback?: string,
  params?: TranslationParams,
): string {
  let template: string | undefined;

  if (params && typeof params.count === "number") {
    const category = pluralCategory(lang, params.count);
    template =
      lookupIn(lang, `${key}_${category}`) ??
      lookupIn(lang, `${key}_other`) ??
      lookupIn(DEFAULT_LANGUAGE, `${key}_${category}`) ??
      lookupIn(DEFAULT_LANGUAGE, `${key}_other`);
  }

  template ??= lookupIn(lang, key) ?? fallback ?? lookupIn(DEFAULT_LANGUAGE, key) ?? key;
  return interpolate(template, params);
}
