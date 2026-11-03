# PART 11 — Translation and Localization Report

Scope: web (`apps/web/src/lib/i18n/`, `apps/web/src/components/layout/language-selector.tsx`) and mobile (`apps/mobile/src/i18n/`, `apps/mobile/src/ui/LanguageModal.tsx`), plus their tests. Screen files were not edited (see §9).

## 1. Summary

- **Supported languages are the same on both platforms:** English, Hindi, Tamil, Telugu, Marathi and Bengali. No locales were added.
- **Product name and tagline fixed.** The Hindi and Marathi name "सेहत मेद" transliterates "Meds" as a word meaning "fat", and the Tamil, Telugu and Bengali spellings also varied. All languages now use the Latin "Sehat Meds". Taglines were translated inconsistently; all languages now use the official "Bharat ka apna Saathi".
- **Partial clinical and safety translations withheld.** 34 web and 36 mobile entries omitted sentences from the English. Several of these dropped the verification disclaimer ("Sehat Meds always shows what has and hasn't been verified"), the "unclear readings stay marked until you review them" warning, the dose-logging sentence, and the "corrections are kept alongside the original reading" statement. Those entries are removed, so the complete English text shows. They are listed in Appendix A for native-speaker and clinical review.
- **Web translation layer made safe.** The old DOM translator had a stale-value bug (reproduced, see §4.1), replaced substrings inside longer text, and did not translate accessible names. It now matches exact strings only, tracks React updates, translates `aria-label`, `title`, `alt` and `placeholder`, and skips `translate="no"` subtrees.
- **Hydration mismatch fixed (web).** The saved language was read during the first render, so a user with Hindi saved would get a server/client mismatch. The saved language is now applied after hydration.
- **Mobile language is now persisted** in SecureStore, using the same mechanism as the reminder preferences. Previously it reset on every launch.
- **Interpolation, plural forms and locale formatting added** (both platforms) for use by the integration agent.
- **Tests:** web 82/82 passing (26 new), mobile 142/142 passing (17 new). All six required scripts exit 0.

## 2. Supported-language inventory (verified in code)

| Language | Code | Web (`SUPPORTED_LANGUAGES`) | Mobile (`SUPPORTED_LANGUAGES`) | Locale tag used for formatting |
|---|---|---|---|---|
| English | `en` | yes | yes | `en-IN` |
| Hindi | `hi` | yes | yes | `hi-IN` |
| Tamil | `ta` | yes | yes | `ta-IN` |
| Telugu | `te` | yes | yes | `te-IN` |
| Marathi | `mr` | yes | yes | `mr-IN` |
| Bengali | `bn` | yes | yes | `bn-IN` |

Web and mobile declare the same six codes. Neither platform declares or loads any other locale.

## 3. Dictionary inventory

Key counts were measured with a parser over the dictionary blocks. "Missing" means the English key has no entry in that language; those strings show English.

| Platform | English keys | hi | ta | te | mr | bn |
|---|---|---|---|---|---|---|
| Web (before) | 235 | 235 | 235 | 235 | 235 | 235 |
| Web (after) | 235 | 234 | 226 | 226 | 228 | 227 |
| Web coverage after | — | 99.6% | 96.2% | 96.2% | 97.0% | 96.6% |
| Mobile (before) | 181 | 181 | 181 | 181 | 181 | 181 |
| Mobile (after) | 181 | 179 | 171 | 172 | 174 | 173 |
| Mobile coverage after | — | 98.9% | 94.5% | 95.0% | 96.1% | 95.6% |

**Missing-translation inventory after this part.** These are the withheld clinical and safety strings (Appendix A). Each one shows English:
- Web: hi 1, ta 9, te 9, mr 7, bn 8 (total 34).
- Mobile: hi 2, ta 10, te 9, mr 7, bn 8 (total 36).

**Other checks**

| Check | Result |
|---|---|
| Duplicate keys within a language | 0 (before and after; now enforced by a test) |
| Empty values | 0 |
| Values identical to English | Only the two tagline keys, intentionally (see §5) |
| `t("…")` literal keys used in code but missing from the English dictionary | 0 (web 5 calls, mobile 9 calls) |
| Inconsistent product name (transliterated) and tagline | Fixed: 47 entries changed on each platform, including the tagline (see §5) |
| Devanagari characters inside Bengali text | One entry ("आপনার सेहत মেদ আইডি") — fixed |

The number of `t()` calls is small. Most web and mobile screens render English text directly, and the DOM layer (§4) translates it by exact match. Translating them through `t()` is the integration agents' job (§9).

## 4. Architecture review

### 4.1 DOM text-node translation (web)

The previous implementation walked the whole document on every mutation and rewrote text nodes. Assessment:

| # | Finding | Evidence | Status |
|---|---|---|---|
| 1 | **Stale-value bug.** The first value seen for a text node was cached as the "original". When React later updated that node to new English, the stale cached value was translated and written back. | Reproduced in headless Chromium with the original logic: after React set the node to "Prescriptions", the Hindi view showed the old translation of "Dashboard" (डैशबोर्ड), and switching back to English showed "Dashboard". | Fixed: a value we did not write is treated as the new original. Verified in Chromium: React's update shows "दवा पर्ची", and English restores "Prescriptions". |
| 2 | **Substring replacement** inside arbitrary text: every dictionary phrase longer than three characters was replaced wherever it appeared. This could alter medicine names, dosages or user-entered data containing a common word, or a long clinical sentence. | Code inspection; the substring path ran for any text without an exact match. | Removed. Exact matches only. A long sentence with no exact entry stays English (verified: "Upload a prescription for Insurance Plan 2" is unchanged). |
| 3 | **Case-insensitive fallback** could map text to an unrelated entry. | Code inspection. | Removed. |
| 4 | **Accessible names were not translated** (`aria-label`, `title`, `alt`), so a Hindi screen-reader user heard English labels. | Code inspection; the walker only visited text nodes. | Fixed. Verified in Chromium: `aria-label` and `title` on the sign-out control switch to "लॉग आउट". |
| 5 | **Opt-out was missing.** Nothing prevented translating medical identifiers or user data. | Code inspection. | Added `translate="no"` and `data-no-translate` opt-outs, which are honored (verified). Numeric and unit values such as "500 mg" and "1-0-1" are never matched. |
| 6 | **Unbounded work.** Every DOM mutation re-walked the whole body after a 50 ms debounce, and the walk's own writes triggered further mutations. | Code inspection. | Now once per animation frame, and the observer's records from our own writes are discarded. Verified idempotent in Chromium. |
| 7 | **Hydration mismatch.** The saved language was read in `useState`'s initializer, so the first client render differed from the server HTML whenever a non-English language was saved. | Code inspection. | Fixed with `useSyncExternalStore`, whose server snapshot is English. |
| 8 | **`t()` returned the raw key in English** when no fallback was given (for example `t("sign_out")`). | Code inspection. | Fixed: the English dictionary is consulted before the key is returned. |

**Recommendation.** Keep the DOM layer for now. Removing it would leave most screens in English until they are migrated, and the migration touches files outside this part. The layer is now predictable (exact match, explicit opt-out, correct update handling). The DOM layer cannot translate a string that is built from data, such as "3 medicines due today". Those need `t(key, fallback, params)` (§6).

### 4.2 Mobile

`LanguageProvider` held the language in component state only, so it reset on every launch. It now loads and saves the choice in SecureStore under `sehatmeds.language`. The choice appears after the first render (a brief English frame), which is the same behavior as on web.

`AppText` (owned by the common-components agent, not edited) calls `lookupTranslation` for text children. It benefits from the exact-match change automatically, and it still falls back to the original text on a miss.

## 5. Brand name, tagline and sentence fixes

**Product name.** "Sehat Meds" is kept in Latin script in every language, as the brief requires. The transliterated forms replaced were:

| Language | Transliteration found | Replaced with |
|---|---|---|
| Hindi, Marathi | सेहत मेद | Sehat Meds |
| Tamil | சேஹத் மேட் / சேஹத் மேடில் | Sehat Meds / Sehat Meds-இல் |
| Telugu | సేహత్ మేడ్ / సేహత్ మేడ్‌లో | Sehat Meds / Sehat Meds-లో |
| Bengali | সেহত মেদ / সেহত মেদ-এ / सेहत মেদ | Sehat Meds / Sehat Meds-এ / Sehat Meds |

Hindi "मेद" means "fat" (adipose tissue). This was a clinically and reputationally wrong reading of the product name. Native-script transliteration of the brand is a brand-owner decision and is not made here.

**Tagline.** Official tagline: "Bharat ka apna Saathi". Each language had its own rendering (for example Tamil "பாரதத்தின் மருத்துவ தோழன்", which means "Bharat's medical companion", and Marathi "भारताचा आरोग्य सोबती"), which changed the brand message. All languages now use the official tagline in Latin script. **Open decision:** whether to add a native-script rendering of the tagline, which must be approved by the brand owner.

Both the brand fixes and tagline changes were applied to the dictionaries by script and verified with a test that rejects the known bad forms and requires the official tagline.

## 6. Interpolation, plurals and locale formatting

**API (both platforms):** `t(key, fallback?, params?)`. The third argument is new and optional, so existing two-argument calls are unchanged.

- `{name}` placeholders are filled from `params`. Unknown placeholders stay visible, so a missing value shows up in review.
- `params.count` selects the plural form. Each language uses its CLDR rules (`Intl.PluralRules`), and the dictionary keys are `key_one` / `key_other`, with `key_other` used as the catch-all. Example: `t("reminder", "{count} reminders", { count })`.
- Resolution order: the language's entry, then the caller's English fallback, then the English entry, then the key.

**Formatting (`format.ts` on each platform):** `formatDate`, `formatTime`, `formatDateTime`, `formatNumber`, `formatRupees`. They use the language's locale tag, always Latin digits (`numberingSystem: "latn"`), Indian digit grouping, and treat `YYYY-MM-DD` as a local calendar date so it does not shift a day.

**Locale-sensitive code outside the owned files (for integration; not changed here):**

| File | Problem |
|---|---|
| `apps/web/src/lib/format.ts` | Hard-coded `en-IN`; output is always English. Switch to `localeTag(language)` and pass the language. |
| `apps/web/src/components/qr/qr-resolver.tsx:161` | `expires.toLocaleString()` with no locale (device default). |
| `apps/web/src/components/insurance/insurance-view.tsx:442` | `toLocaleDateString()` with no locale. |
| `apps/web/src/components/payments/payments-view.tsx:265` | `toLocaleDateString()` with no locale. |
| `apps/web/src/components/hospitals/slot-picker.tsx:151–153`, `hospital-reviews.tsx:271`, `prescriptions/version-history.tsx:8` | Fixed `en-IN`; not language-aware. |
| `apps/mobile/src/screens/PaymentsScreen.tsx:211` | `toLocaleDateString()` with no locale. |

`zoned-time.ts` (web) and `zonedTime.ts` (mobile) use `en-US` internally for timezone arithmetic, not for display. They were left unchanged.

## 7. Clinical content policy applied

1. **Do not machine-translate uncertain clinical instructions.** Where a translation drops a sentence from the English, the translation is withheld and the full English is shown. This is the rule the "fewer sentences" test enforces on every future entry.
2. **Medicine names, dosages and identifiers** are matched exactly and never substituted. Values such as "500 mg" and "1-0-1", and dates, are never translated, and user-entered values are never matched.
3. **Product name and disclaimer** ("It does not give medical advice.") are kept in every language that translates them, with the product name in Latin script.
4. **Sentence count is necessary, not sufficient.** A translation with the same sentence count can still be inaccurate. All remaining clinical and privacy sentences in Appendix B need native-speaker and clinical review before they are called authoritative.

## 8. Accessibility-related localization

- `document.documentElement.lang` is set to the locale tag on every change (for example `hi-IN`), and `dir="ltr"` is set explicitly.
- The language selector's options carry `lang` attributes, so screen readers pronounce each native name correctly. The flag emoji were removed from option text, since screen readers may announce them by name.
- The modal and selector accessible names are translated (§ accessibility report).

## 9. Screens requiring integration work (not edited)

These files render English text that is not routed through `t()`. The estimate counts lines that look like hard-coded English UI prose, so treat the numbers as an order of priority, not an exact count.

**Web (35 files flagged; 2 call `t()`), highest first:**
- `components/symptoms/symptom-checker-view.tsx` (~32 lines)
- `components/prescriptions/medication-setup-wizard.tsx` (~23)
- `components/vaccinations/vaccination-view.tsx` (~20)
- `components/family/family-tree-view.tsx` (~20)
- `components/insurance/insurance-view.tsx` (~12)
- `components/dashboard/dashboard-view.tsx` (~9)
- `components/prescriptions/prescription-detail.tsx` (~8)
- `components/health-card/card-face.tsx` and `health-card-view.tsx` (~8 and ~7). `card-face.tsx:133` hard-codes the Hindi line `सेहत मेड डिजिटल कार्ड · Bharat ka apna Saathi`. The product name there must be Latin "Sehat Meds" and the tagline the official one, the same rule applied to the dictionaries.
- `components/layout/app-shell.tsx` (uses `t("sign_out")`; the rest is English)
- `components/medications/medications-view.tsx` (uses `t()` for some labels)
- `components/prescriptions/contraindication-alerts.tsx`, `hospitals/hospital-reviews.tsx`, `appointments/appointments-view.tsx`, `health-card/access-explainer.tsx`, `app/page.tsx`

**Mobile (18 files flagged; 3 call `t()`), highest first:**
- `screens/FamilyTreeScreen.tsx` (~16)
- `screens/InsuranceScreen.tsx` (~9)
- `ui/components.tsx` (shared; ~6, owned by the common-components agent)
- `screens/ProfileScreen.tsx`, `HealthCardScreen.tsx`, `SymptomCheckerScreen.tsx`, `VaccinationScreen.tsx`, `SharingScreen.tsx`, `AuthScreens.tsx`, `AuthScreens.web.tsx`, `PrescriptionUploadScreen.tsx`, `AddScheduleScreen.tsx`
- `screens/HospitalScreen.tsx`: the review text area has an English placeholder ("Share your experience (optional)...") that is not translated.

## 10. Tests executed

| Command | Result |
|---|---|
| `npm run typecheck:web` | Pass (exit 0) |
| `npm run lint:web` | Pass (exit 0) |
| `npm run test:web` | 82 of 82 pass (26 new in `apps/web/tests/i18n.test.ts`) |
| `npm run typecheck:mobile` | Pass (exit 0) |
| `npm run lint:mobile` | Pass (exit 0) |
| `npm run test:mobile` | 142 of 142 pass (new `apps/mobile/tests/i18n.test.ts`) |

Covered by the new tests: supported-language validation (including prototype names), lookup and exact matching, fallback order, missing-key fallback, interpolation, plural selection, product-name preservation (no transliterations), official tagline, sentence completeness for every entry, critical navigation and medical labels in every language, locale formatting (Latin digits, Indian grouping, local-date parsing), persistence with blocked storage, duplicate-key detection, and language switching.

Ad hoc checks outside the repository (not shipped):
- The new DOM translator, bundled with esbuild and run in headless Chromium: text, `aria-label`, `title`, `translate="no"`, `data-no-translate`, technical values, React text updates, English restore, and idempotence all verified.
- The original translator's logic, run in the same way: stale-value bug reproduced.

**Not verified:** rendering of long translations at phone width and with large text settings; any translation's accuracy beyond the sentence-count rule; the mobile app on a device.

## 11. Files changed

Owned files:
- `apps/web/src/lib/i18n/languages.ts` (modified: brand/tagline values, withheld entries, exact lookup, constants)
- `apps/web/src/lib/i18n/language-context.tsx` (rewritten: hydration-safe store, DOM-layer scheduling, `t()` with params)
- `apps/web/src/lib/i18n/translate.ts` (new), `format.ts` (new), `storage.ts` (new), `dom-translation.ts` (new)
- `apps/web/src/components/layout/language-selector.tsx` (modified: focus ring, `lang` on options, no flags in names)
- `apps/web/tests/i18n.test.ts` (new)
- `apps/mobile/src/i18n/languages.ts` (modified), `LanguageContext.tsx` (rewritten: persistence, params), `translate.ts` (new), `format.ts` (new)
- `apps/mobile/src/ui/LanguageModal.tsx` (modified: accessibility)
- `apps/mobile/tests/i18n.test.ts` (new)

**One change outside the owned list:** `apps/mobile/package.json` gained `tests/i18n.test.ts` in the `test` script. The mobile script lists its test files explicitly, so without this line the suite would not run under `npm run test:mobile`. The integration agent should confirm this one-line change.

---

## Appendix A — Withheld translations (not shipped; English shown)

These entries were removed from the dictionaries because the translation had fewer sentences than the English. The draft text is kept here only for reviewers. **It has not been reviewed and must not be shipped as is.**

| Language | English source (key) | Platform | Draft translation (NOT SHIPPED) |
|---|---|---|---|
| Hindi | No reminders set. Reminders appear once a schedule has reminder times turned on. | mobile | कोई रिमाइंडर सेट नहीं है। |
| Hindi | You check the details against your paper copy and correct anything wrong. Your corrections are kept alongside the original reading. | mobile + web | आप कागजी प्रति से विवरण की जांच करते हैं और किसी भी गलती को सुधारते हैं। |
| Tamil | A card with your Sehat Meds ID and a QR code. The QR holds a random reference, never your medical details. | mobile + web | Sehat Meds ஐடி மற்றும் QR குறியீட்டைக் கொண்ட அட்டை. |
| Tamil | Add an image or PDF of your prescription. The file is stored privately. | mobile + web | மருந்து சீட்டின் புகைப்படம் அல்லது PDF ஐச் சேர்க்கவும். |
| Tamil | Browse listed hospitals, check open slots and book one. A slot can only be booked once. | mobile + web | பட்டியலிடப்பட்ட மருத்துவமனைகளைப் பார்த்து, முன்பதிவு செய்யுங்கள். |
| Tamil | Complete details can feed your schedule and health card. Unclear ones stay marked until you review them. | mobile + web | முழுமையான விவரங்கள் உங்கள் அட்டவணையில் சேர்க்கப்படும். |
| Tamil | Conditions and records in one timeline. Each entry shows where it came from and whether anyone has verified it. | mobile + web | அனைத்து மருத்துவ ஆவணங்களும் ஒரே காலவரிசையில் தொகுக்கப்படுகின்றன. |
| Tamil | No reminders set. Reminders appear once a schedule has reminder times turned on. | mobile + web | நினைவூட்டல்கள் எதுவும் அமைக்கப்படவில்லை. |
| Tamil | Reminders are built only from prescriptions with complete, clearly read details. You record whether you took or skipped each dose. | mobile + web | முழுமையான மருந்து சீட்டுகளிலிருந்து மட்டுமே நினைவூட்டல்கள் உருவாக்கப்படுகின்றன. |
| Tamil | Sehat Meds is a personal health-record tool. It does not give medical advice. | mobile | Sehat Meds ஒரு தனிப்பட்ட மருத்துவ பதிவு கருவி மட்டுமே. |
| Tamil | Upload a prescription, check what was read from it, and keep your medication schedule and medical history together. Sehat Meds always shows what has and hasn’t been verified. | mobile + web | மருந்து சீட்டை பதிவேற்றி, வாசிக்கப்பட்ட விவரங்களை சரிபார்த்து, உங்கள் மருந்து அட்டவணை மற்றும் மருத்துவ வரலாற்றை ஒன்றாக வைத்திருங்கள். |
| Tamil | You check the details against your paper copy and correct anything wrong. Your corrections are kept alongside the original reading. | mobile + web | காகித நகலுடன் ஒப்பிட்டு பிழைகளை நீங்கள் திருத்தலாம். |
| Telugu | A card with your Sehat Meds ID and a QR code. The QR holds a random reference, never your medical details. | mobile + web | మీ Sehat Meds ఐడీ మరియు QR కోడ్ ఉన్న సురక్షిత కార్డు. |
| Telugu | Add an image or PDF of your prescription. The file is stored privately. | mobile + web | మీ ప్రిస్క్రిప్షన్ చిత్రాన్ని లేదా PDFని సురక్షితంగా అప్‌లోడ్ చేయండి. |
| Telugu | Browse listed hospitals, check open slots and book one. A slot can only be booked once. | mobile + web | ఆసుపత్రులను పరిశీలించి, అందుబాటులో ఉన్న స్లాట్‌ను బుక్ చేసుకోండి. |
| Telugu | Complete details can feed your schedule and health card. Unclear ones stay marked until you review them. | mobile + web | పూర్తి వివరాలు మీ షెడ్యూల్ మరియు కార్డులో పొందుపరచబడతాయి. |
| Telugu | Conditions and records in one timeline. Each entry shows where it came from and whether anyone has verified it. | mobile + web | వైద్య పరిస్థితులు మరియు రికార్డులు ఒకే టైమ్‌లైన్‌లో భద్రపరచబడతాయి. |
| Telugu | No reminders set. Reminders appear once a schedule has reminder times turned on. | mobile + web | రిమైండర్‌లు ఏవీ సెట్ చేయలేదు. |
| Telugu | Reminders are built only from prescriptions with complete, clearly read details. You record whether you took or skipped each dose. | mobile + web | పూర్తిగా చదవబడిన ప్రిస్క్రిప్షన్ల నుండి మాత్రమే రిమైండర్‌లు రూపొందించబడతాయి. |
| Telugu | Upload a prescription, check what was read from it, and keep your medication schedule and medical history together. Sehat Meds always shows what has and hasn’t been verified. | mobile + web | ప్రిస్క్రిప్షన్‌ను అప్‌లోడ్ చేసి, వివరాలను తనిఖీ చేయండి మరియు మీ మందుల వేళలు & వైద్య చరిత్రను ఒకే చోట భద్రపరచండి. |
| Telugu | You check the details against your paper copy and correct anything wrong. Your corrections are kept alongside the original reading. | mobile + web | కాగితపు కాపీతో వివరాలను సరిచూసి తప్పులను సవరించవచ్చు. |
| Marathi | A card with your Sehat Meds ID and a QR code. The QR holds a random reference, never your medical details. | mobile + web | Sehat Meds आयडी आणि क्यूआर कोड असलेले डिजिटल कार्ड. |
| Marathi | Browse listed hospitals, check open slots and book one. A slot can only be booked once. | mobile + web | नोंदणीकृत रुग्णालये पहा आणि अपॉइंटमेंट बुक करा. |
| Marathi | Complete details can feed your schedule and health card. Unclear ones stay marked until you review them. | mobile + web | पूर्ण तपशील तुमच्या वेळापत्रकात आणि कार्डवर दिसतात. |
| Marathi | No reminders set. Reminders appear once a schedule has reminder times turned on. | mobile + web | कोणताही रिमाइंडर्स सेट नाही. |
| Marathi | Reminders are built only from prescriptions with complete, clearly read details. You record whether you took or skipped each dose. | mobile + web | केवळ स्पष्ट वाचलेल्या चिठ्ठ्यांवरूनच स्मरणपत्रे तयार केली जातात. |
| Marathi | Upload a prescription, check what was read from it, and keep your medication schedule and medical history together. Sehat Meds always shows what has and hasn’t been verified. | mobile + web | औषध चिठ्ठी अपलोड करा, तपासणी करा आणि औषध वेळापत्रक व वैद्यकीय इतिहास एकत्र ठेवा. |
| Marathi | You check the details against your paper copy and correct anything wrong. Your corrections are kept alongside the original reading. | mobile + web | कागदी प्रतीशी पडताळणी करून तुम्ही चुका सुधारू शकता. |
| Bengali | A card with your Sehat Meds ID and a QR code. The QR holds a random reference, never your medical details. | mobile + web | আপনার Sehat Meds আইডি এবং কিউআর কোড সম্বলিত কার্ড। |
| Bengali | Browse listed hospitals, check open slots and book one. A slot can only be booked once. | mobile + web | হাসপাতালের তালিকা দেখে অ্যাপয়েন্টমেন্ট স্লট বুক করুন। |
| Bengali | Complete details can feed your schedule and health card. Unclear ones stay marked until you review them. | mobile + web | সম্পূর্ণ তথ্য সময়সূচী ও কার্ডে যুক্ত হয়। |
| Bengali | Conditions and records in one timeline. Each entry shows where it came from and whether anyone has verified it. | mobile + web | রোগের বিবরণ ও রেকর্ডসমূহ একটি টাইমলাইনে সাজানো থাকে। |
| Bengali | No reminders set. Reminders appear once a schedule has reminder times turned on. | mobile + web | কোনো অনুস্মারক সেট করা নেই। |
| Bengali | Reminders are built only from prescriptions with complete, clearly read details. You record whether you took or skipped each dose. | mobile + web | সম্পূর্ণ প্রেসক্রিপশন থেকেই কেবলমাত্র অনুস্মারক তৈরি করা হয়। |
| Bengali | Upload a prescription, check what was read from it, and keep your medication schedule and medical history together. Sehat Meds always shows what has and hasn’t been verified. | mobile + web | প্রেসক্রিপশন আপলোড করুন, বিশদ বিবরণ যাচাই করুন এবং আপনার ওষুধের সময়সূচী ও চিকিৎসার ইতিহাস একসাথে রাখুন। |
| Bengali | You check the details against your paper copy and correct anything wrong. Your corrections are kept alongside the original reading. | mobile + web | কাগজের কপির সাথে মিলিয়ে আপনি ভুল তথ্য সংশোধন করতে পারেন। |

## Appendix B — Remaining clinical and privacy strings that need native-speaker and clinical review

Every translated entry in these languages that states a verification status, a privacy guarantee, a reminder rule or a medical limitation needs review. Priority entries:

- "Sehat Meds is a personal health-record tool. It does not give medical advice." (all languages)
- "A card with your Sehat Meds ID and a QR code. The QR holds a random reference, never your medical details." (Hindi kept, and it carries a privacy claim; Tamil, Telugu, Marathi and Bengali are withheld, see Appendix A)
- "Reminders are built only from prescriptions with complete, clearly read details." (hi only; others withheld)
- "Sehat Meds extracts the details and records how confident it is in each one."
- "Check every reading against your paper prescription" and "Check the details against your paper prescription."
- "You record your own doses", "Mark as Taken", "Skip Dose", "Device alarms active for scheduled doses" (dose-taking labels that affect adherence)
- Emergency labels such as "Emergency Care (Call 112 / 108)" (confirm wording, and confirm the emergency numbers for each locale)
