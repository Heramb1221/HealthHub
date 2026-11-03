# Implementation Progress — Sehat Meds

| Part | Status | Notes |
|---|---|---|
| 1 Inspect and baseline | DONE (see docs/QUALITY_AUDIT.md) | web build/e2e/DB tests not yet baselined |
| 2 Auth, validation, branding | DONE in code; live Clerk checks BLOCKED | see BUG_FIX_REPORT.md A1–A6 |
| 3 Questionnaires and forms | DONE in code; visual/device checks NOT TESTED | see BUG_FIX_REPORT.md F1–F8, C1–C4 |
| 4 Prescription scan and OCR | DONE in code; handwriting/PDF reading limits documented; browser/device checks NOT TESTED | see BUG_FIX_REPORT.md P1–P8 |
| 5 Health card and prescription QR | DONE in code; physical-scan and browser/device checks NOT TESTED; mobile deep links not implemented | see BUG_FIX_REPORT.md Q1–Q10 |
| 6 Medication timers | DONE in code; real notification delivery, Google Calendar and device checks NOT TESTED; snooze not built | see BUG_FIX_REPORT.md T1–T10 |
| 7 Payments | DONE in code; real Razorpay sandbox run, browser and devices NOT TESTED; in-app mobile checkout BLOCKED | see BUG_FIX_REPORT.md R1–R9 |
| 8 Backend integrity | DONE; API suite 584/584 | see BUG_FIX_REPORT.md B1–B7 |
| 9 Web redesign | PARTIAL, merged (9A foundation: 10 files; 9B feature screens: 9 files). Most of ~40 web screens unchanged; browser/viewport checks of the merged build NOT TESTED | see docs/patch-reports/PART9A_REPORT.md, PART9B_REPORT.md |
| 10 Mobile redesign | PARTIAL, merged (shared theme/components/navigation + 20 screens; sign-in, register, verification, family tree body keep original layouts). Device checks NOT TESTED | see docs/patch-reports/PART10_REPORT.md |
| 11 i18n and a11y | PARTIAL, merged (translation layers, persistence, safe DOM translator, language controls). Hard-coded English remains in ~35 web and ~18 mobile screens; clinical strings withheld pending native review; no assistive-technology testing | see docs/patch-reports/PART11_*.md |
| 12 Testing and quality | DONE for automated gates on merged tree (see TEST_REPORT.md); browser, device, e2e, Clerk, Razorpay, notification checks NOT TESTED/BLOCKED | see TEST_REPORT.md |
| 13 Final integration and ZIP | DONE (patches merged without file overlaps, 3 integration fixes, ZIP built); NOT production-ready: manual checks outstanding | see docs/QUALITY_AUDIT.md |
| Release hardening | DONE for the automated items (Next 16.4.3, busboy fix, QR tests run, audit classified, README); 7 high audit findings remain (dev/tooling or unpatchable); NOT production-ready | see checkpoint below, docs/DEPENDENCY_AUDIT.md, TEST_REPORT.md |

## Checkpoint (release hardening, after Part 13)
- Scope: security update, busboy investigation, QR test environment, dependency audit, documentation. No redesign and no application rewrite.
- Next.js 16.4.0 -> 16.4.3 and eslint-config-next 16.4.3 (web workspace); sharp unchanged at 0.35.5. In-range security updates: body-parser 2.4.0, qs 6.17.1, ip-address 10.7.5, node-forge 1.4.2, fast-uri 3.1.9, zod 4.6.7. React, Expo, React Native, Prisma and Clerk untouched.
- Busboy: real defect (unhandled error on the per-file stream could terminate the API process on a truncated upload). Fixed in `apps/api/src/modules/prescriptions/upload.ts`; 15 regression tests added in `apps/api/tests/uploadParser.test.ts`.
- Tests: API 599/599 with a database and zbar (0 skipped), web 82/82, mobile 142/142; typecheck, lint and builds pass (see TEST_REPORT.md). Physical QR scanning is still NOT TESTED.
- Audit: 44 -> 39 findings, 0 critical, 7 high remaining (Prisma CLI chain, zod 3.25.76 and Expo tooling); see docs/DEPENDENCY_AUDIT.md.
- Lockfile: added the missing non-Windows native binary entries so the lockfile installs and tests on Linux.
- Added root README.md. Still NOT production-ready: the manual checks in MANUAL_TEST_CHECKLIST.md are outstanding.

## Checkpoint (end of Part 13, final integration)
- Patches applied in order 9A, 9B, 10, 11 onto the baseline. The four patches touch 57 distinct files (10 + 9 + 23 + 15, including 2 new test files and 6 new i18n modules); no file was changed by more than one patch, so no merge conflicts. API, contracts and all logo/icon/hospital/vaccination data are byte-identical to the baseline.
- Integration fixes (3): web `--input` border colour `#b5c7c6` -> `#6f8886` (A11Y-12, 1.76:1 -> 3.79:1); mobile `HospitalScreen` review field gets accessibility label and translated placeholder (A11Y-16); web health-card footer product name now Latin "Sehat Meds" (was Devanagari mistransliteration). The four patch reports were copied to `docs/patch-reports/`.
- Tests: API 579 passed / 5 skipped / 0 failed + 1 unhandled busboy error (PostgreSQL 16, isolated `_test` DB); web 82/82; mobile 142/142; typecheck, lint PASS for contracts/api/web/mobile; builds PASS (see TEST_REPORT.md for the web-build retry note).
- Next action: owner runs MANUAL_TEST_CHECKLIST.md on devices/browsers with Clerk and Razorpay sandbox keys.

## Decisions from owner (Oct 2026)
- Deadline moved to 30 Oct; keep strict 13-part order.
- Restore deleted tests/docs from git only if needed: `apps/api/tests` + `apps/api/fixtures` restored (needed for backend verification). README/AGENTS.md/docs/prompts/screenshots NOT restored.
- Gemini only as a last resort for prescription extraction (Part 4): evaluate other options first.

## Checkpoint (end of Part 6)
- API: `lib/zonedTime.ts`, `modules/schedules/{service,nextDose}.ts`, `modules/calendar/{events,service,routes}.ts`, `modules/dashboard/service.ts`; tests `zonedTime`, `zonedTimeCopies`, `doseSlots` (DB), `calendarEvents`, `nextDose`.
- Web: `lib/{zoned-time,schedule,calendar,calendar-sync-message,browser-notifications}.ts`, `lib/api/{medication-schedules,calendar,types}.ts`, `components/medications/{medications-view,edit-schedule-view}.tsx`, `components/prescriptions/medication-setup-wizard.tsx`; 6 new test files.
- Mobile: `lib/{zonedTime,schedule,reminders,reminderSync,reminderSettings}.ts`, `screens/MedicationScreen.tsx`, `auth/AuthContext.tsx`, `demo/demoFetch.ts` (schedule logic only), deleted `lib/deviceAlarms.ts`; tests `zonedTime`, `schedulePlan`, `reminderSync`, updated `demo`/`lib`.
- Tests: API 567 pass / 9 fail (all failing at HEAD, all Part 8); web 56; mobile 125; typecheck + lint + next build PASS; web/mobile verified under 4 machine time zones.
- Sandbox note: long commands must stay under 300 s; the API suite takes about 2 minutes (run in the background).
- Next action: Part 7 — payments and appointment payment flow (Razorpay sandbox, missing payment options, server verification, idempotency).

## Checkpoint (end of Part 5)
- API: `modules/qr/emergency.ts` (new, mounted at `/qr/emergency`), `modules/qr/routes.ts` (old emergency route removed), `modules/patients/{service,routes}.ts`, `config/env.ts` (EMERGENCY_RATE_LIMIT_MAX; production QR_LINK_BASE rule), `app.ts`, `.env.example`; tests `emergency.integration`, `qrDecode`, QR freshness in `qr.integration`, `env`/`pdf`/`patients` test updates.
- Web: `components/qr/qr-resolver.tsx`, `lib/api/qr.ts`, `lib/safe-redirect.ts`, pages `(auth)/qr/[reference]`, `prescription/[id]` (new), sign-in/up pages, card face text, demo card data, medication list labels.
- Mobile: `screens/HealthCardScreen.tsx` (QR + branding), `lib/qr.ts`, `config.ts` (WEB_APP_URL), `api/types.ts`, `.env.example`; deleted unused `components/DigitalHealthCard.tsx`.
- Tests: API 536 pass / 11 fail (all failing at git HEAD) ; web 20; mobile 96; typecheck + lint + next build PASS.
- **Deployment action:** set `QR_LINK_BASE` (https) on the API before deploying or it will not start in production.
- Next action: Part 6 — medication timers and schedules (the failing dose-event test, timezone/DST, duplicate reminders, notification permission handling).

## Checkpoint (end of Part 4)
- API changed: `src/extraction/{textParser,imagePrep,localOcrProvider,chainProvider}.ts` (new), `types.ts`, `index.ts`, `geminiProvider.ts`; `src/config/env.ts`; `src/lib/contentDisposition.ts` (new); `src/modules/prescriptions/{processing,service,routes,pdf}.ts`; `src/pdf/prescriptionPdf.ts`; `.env.example`; deleted `scripts/backfill_prescriptions.ts`; deps `tesseract.js`, `@tesseract.js-data/eng`, `sharp` (+ root lockfile); fixtures `printed-prescription-{clean.png,photo.jpg}`.
- Web changed: `lib/api/{prescriptions,types}.ts`, `lib/demo/prescriptions.ts`, `components/prescriptions/{correction-form,prescription-detail,medication-setup-wizard}.tsx`, `original-document.tsx` (new).
- Mobile changed: `components/OriginalDocumentCard.tsx` (new), `screens/{PrescriptionDetailScreen,PrescriptionUploadScreen}.tsx`, `api/{endpoints,types}.ts`, `lib/validation.ts`; deleted dead `MedicationSetupWizard.tsx`.
- Tests: API 520 pass / 11 fail (all failing at HEAD, mapped to Parts 5/6/8) / 2 skip; web 17; mobile 94; typecheck + lint + next build PASS.
- Sandbox only (not in repo): PostgreSQL 16, `@rolldown/binding-linux-x64-gnu` installed with `--no-save`.
- Next action: Part 5 — health card QR and prescription QR (also install `zbar-tools`/`poppler-utils` to decode real QR codes in tests; fix the 3 failing patients/health-card tests; review the demo card's "Ministry of Health" issuer text).

## Checkpoint (end of Part 3)
- Files changed (Part 3): web `src/components/symptoms/symptom-checker-view.tsx`, `src/lib/symptoms/questionnaire.ts(new)`, `src/components/prescriptions/medication-setup-wizard.tsx`, `src/components/insurance/insurance-view.tsx`, `src/lib/validation/insurance.ts(new)`, `src/components/family/family-tree-view.tsx`, `src/lib/api/{history,appointments}.ts`, `tests/*.test.ts(new x4)`, web+root `package.json` (test scripts); mobile `src/screens/SymptomCheckerScreen.tsx`, `src/components/MedicationSetupWizard.tsx`, `src/lib/validation.ts`, `tests/lib.test.ts`; api `src/modules/insurance/routes.ts`, `tests/contractStrictness.test.ts(new)`.
- Tests executed: API 193 pass, mobile 92 pass, web 14 pass; typecheck + lint PASS; `next build` PASS.
- Remaining: browser/device verification; live-mode booking/history; forms owned by Parts 4, 6, 7, 8, 10 (see BUG_FIX_REPORT.md).
- Next action: Part 4 — prescription scanning/OCR pipeline (prefer a non-Gemini option first; Gemini only as last resort), including the auto-"confirm" wizard defect.
