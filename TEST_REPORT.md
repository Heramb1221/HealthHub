# Test Report — Sehat Meds (cumulative)

Environment: Linux sandbox, Node 20+, `npm ci --ignore-scripts`; `@rolldown/binding-linux-x64-gnu@1.2.13` installed with `--no-save` only to let vitest start (lockfile/package.json untouched). No Postgres, browser, device, Clerk or Razorpay access.

## Baseline (Part 1, before changes)
typecheck contracts/api/web/mobile PASS · lint api/web/mobile PASS · mobile tests 68/68 · API tests could not run (tests dir absent from upload + rolldown binding).

## After Part 2 (executed)
| Command | Result |
|---|---|
| `npm run typecheck:api / :web / :mobile` | PASS |
| `npm run lint:api / :web / :mobile` | PASS |
| `npm run test:mobile` | 91 passed, 0 failed (was 68; +23 in `tests/auth.test.ts`) |
| `vitest run` (apps/api) | 191 passed, 290 skipped (DB integration tests need `DATABASE_URL`), 0 failed (was 186; +5 in `tests/authSchema.test.ts`) |

### What the new tests prove
- Passwords with leading/trailing/inner spaces and 150+ chars reach Clerk **byte-for-byte**; API schemas keep them unchanged; bounds behave as designed.
- Multiword and non-Latin names accepted, split without losing words, sent as first/last name.
- E.164 normalisation, ambiguous numbers rejected; email vs phone detection.
- Phone sign-up → SMS verification → session only on `complete`; chained verifications; unsupported sign-up states raise clear errors; wrong code never yields a session; new-device email code and unsupported second factors handled.
- Every API request obtains a fresh token from the async provider.

### Not tested / unverified
- Live Clerk behaviour (dashboard password rules, phone SMS delivery, client-trust): BLOCKED.
- UI rendering of new mobile auth screens on a device or emulator: NOT TESTED.
- DB-backed API tests, web build, web e2e (Playwright), API build, mobile `export:check`: NOT RUN yet.

## After Part 3 (executed)
| Command | Result |
|---|---|
| `npm run typecheck:api / :web / :mobile` | PASS |
| `npm run lint:api / :web / :mobile` | PASS |
| `vitest run` (apps/api) | 193 passed, 290 skipped (DB), 0 failed (+2 `contractStrictness.test.ts`) |
| `npm run test:mobile` | 92 passed, 0 failed (+1 `integerRangeProblem`) |
| `npm run test:web` (new; `tsx --test`) | 14 passed, 0 failed: questionnaire logic (8), insurance validation (4), history payload (1), booking payload (1) |
| `next build` (apps/web) | PASS (all 26 routes compiled) — built with the local env file, output not shipped |

Not tested: rendering in a browser/emulator (no browser in the sandbox), so the responsive fix for the symptom footer and the wizard safe-area changes are code-reviewed, not seen. Live booking and history POSTs need a database + API running; the contract tests only prove the payloads match the API schemas.

## Part 4 (executed)
Environment addition: PostgreSQL 16 installed in the sandbox, isolated database `sehatmeds_test` (harness refuses any DB not ending `_test`). This is the first time the 290 DB-backed tests ran.

**True baseline (pristine git HEAD, DB enabled): 34 failed / 440 passed.** The restored tests describe a stricter contract than the committed code in several areas.

| Command | Result |
|---|---|
| `npm run typecheck:api/web/mobile` | PASS |
| `npm run lint:api/web/mobile` | PASS |
| `vitest run` (apps/api, with DB) | **520 passed, 11 failed, 2 skipped.** No failure that was not already failing at HEAD; 23 HEAD failures fixed |
| `npm run test:web` | 17 passed |
| `npm run test:mobile` | 94 passed |
| `next build` (apps/web) | PASS |

New tests this part: `textParser` (19, real OCR output incl. garbled photo), `localOcr` (11, **real Tesseract engine**: clean, noisy photo, sideways, EXIF, corrupt/truncated/non-image, PDF, blank page, fallback chain), `scanToSave` e2e (7: real OCR → DB → correction → original byte-for-byte with Hindi file name; duplicates), `contentDisposition` (3), `geminiProvider` (3, mocked network; no real calls), PDF honesty (5), correction/booking/history contract tests, mobile `uploadProblem`.

### Still failing at HEAD and not caused by these changes (11) — owners
| Test area | Count | Part |
|---|---|---|
| patients: `/patients/me` exact fields, health-card identity fields, PATCH validation | 3 | 5 / 8 |
| schedules: second dose record for same time | 1 | 6 |
| history: stored labelled patient-reported/unverified | 1 | 8 |
| seed (demo data labelling/idempotence/slots/audit) | 4 | 8 (protected demo/hospital data: investigate, do not alter data) |
| schema: migrations on empty DB | 1 | 8 |
| auth: development-only login | 1 | 8 |

Contract changes made deliberately and reflected in tests: password max 128 → 256 (Part 2); prescription response gains `sourceFile {mimeType,sizeBytes}`; PDF filename `sehatmeds-…`; two limit/pagination tests now upload distinct bytes because identical re-uploads are de-duplicated.

Not tested: browser/device rendering of the new web panel and mobile card; real clinic documents; real handwriting; Gemini live calls; OCR memory use under production load.

## Part 5 (executed)
Added to the sandbox (not the repo): `zbar-tools`, `poppler-utils` so QR images are decoded by an independent program (the existing "decode the QR in the PDF" tests, previously skipped, now run and pass).

| Command | Result |
|---|---|
| typecheck / lint (api, web, mobile) | PASS |
| `vitest run` (apps/api, DB enabled) | **547 tests: 536 passed, 11 failed** (same 11 that fail at git HEAD; none new). Before this part: 520 passed |
| `npm run test:web` | 20 passed |
| `npm run test:mobile` | 96 passed |
| `next build` (apps/web) | PASS, includes `/qr/[reference]` and `/prescription/[id]` |

New tests: `emergency.integration` (8: anonymous refused, own summary only emergency fields, other patient gets the same 404 as an unknown id and an audited denial, provider access audited, admin refused, malformed ids, rate limit, card QR from configured base), `qrDecode` (3: health card / session / prescription links decode exactly with a real decoder; link holds no medical data), QR freshness and cross-patient binding (2), production `QR_LINK_BASE` rule, web `classifyQrReference` and `safeNextPath`, mobile `healthCardQrUrl`.

Contract changes reflected in tests: health card issuer/notice/field set; env test now supplies a valid production QR base.

**Not tested**: scanning with a physical phone camera or app; the web resolver and mobile QR rendering in a browser/device; mobile deep links (not implemented); behaviour with a real Clerk session (the API tests use the app's own tokens).

## Part 6 (executed)
Time-zone dependence is tested by running the web and mobile suites with `TZ=UTC`, `America/Los_Angeles`, `Pacific/Auckland` and `Asia/Kolkata`; results are identical.

| Command | Result |
|---|---|
| typecheck / lint (api, web, mobile) | PASS |
| `vitest run` (apps/api, DB enabled) | **576 tests: 567 passed, 9 failed.** No new failures vs git HEAD; 25 of HEAD's 34 failures now pass |
| `npm run test:web` | 56 passed (all 4 machine zones) |
| `npm run test:mobile` | 125 passed (UTC, Los Angeles, Auckland, Kolkata) |
| `next build` (apps/web) | PASS |

New tests: `zonedTime` (10 per platform + a test that the three copies stay byte-identical), `doseSlots` DB (4), `calendarEvents` (14, in-memory Google), `nextDose` (3), web `schedule-slots` (11), `schedules` (4), `calendar-sync-message` (5), `calendar-ics` (6), mobile `schedulePlan` (13), `reminderSync` (7), updated demo/lib tests.

### Still failing at HEAD, not caused by these changes (9) — all Part 8
auth dev-login labelling (1) · history "patient-reported/unverified" labelling (1) · `/patients/me` empty-profile fields and PATCH validation of empty values (2) · migrations on an empty database (1) · demo seed (4, protected demo/hospital data: investigate without altering data).

Not tested: delivery of real notifications on iOS/Android (none were sent), real Google Calendar, browsers/devices, behaviour after days without opening the app, user-visible rendering of the new mobile dose list and reminders panel.

## Parts 7–8 (executed)
| Command | Result |
|---|---|
| `vitest run` (apps/api, PostgreSQL 16) | **584 passed, 0 failed** (includes 9 new payment tests with a stubbed Razorpay: no real calls) |
| typecheck / lint (api, web, mobile) | PASS |
| `npm run test:mobile` | 125 passed |
Not tested: a real Razorpay sandbox payment, the web checkout in a browser, webhook delivery from Razorpay.

## Parts 9-13 — merged tree (executed 2026-11-01, sandbox Linux, Node 22)
| Command | Result |
|---|---|
| `typecheck` contracts / api / web / mobile | PASS |
| `lint` api / web / mobile | PASS |
| `npm run test:web` | PASS 82/82 (baseline 56; +26 i18n) |
| `npm run test:mobile` | PASS 142/142 (baseline 125; +17 i18n) |
| `vitest run` apps/api, no database | PASS 262, 322 skipped (database-backed) |
| `vitest run` apps/api, isolated PostgreSQL 16 database `healthhub_test` | 579 passed, 5 skipped, 0 failed, **1 unhandled error** |
| `build:api` | PASS |
| `build:web` (`next build`) | **PASS on retry.** The first run on each source state compiles, type-checks and generates all 22 pages, then exits 1 with a Next.js security-advisory notice for Next 16.4.0; the identical command passes when repeated. Treat as a flag to review, not as a clean pass. |
| `build:mobile` (`expo export` android + ios) | PASS |

Notes
- The 5 API skips are the QR scan tests (no `zbar` decoder installed). The unhandled error is a busboy "Unexpected end of form" raised after the "rejects malformed multipart structure" test; API source is byte-identical to the baseline, so it is not a merge defect, but it makes vitest report an error. Not investigated further.
- `@rolldown/binding-linux-x64-gnu@1.2.13` was copied into `node_modules` (not saved) to let vitest start in the sandbox. Prisma client generation is blocked here (binaries.prisma.sh 403); the committed `src/generated/prisma` was used.
- Not re-run on the merged tree: the 4-time-zone matrix for web/mobile, `build:all` as one command, web end-to-end tests (none exist), `npm audit` remediation (45 reported).

Statuses
- Tests executed and passed: all rows above except where noted.
- Tests executed with a flag: web build retry; API unhandled error.
- Skipped: 5 API (zbar).
- Blocked: live Clerk login/phone verification, Razorpay sandbox and webhooks, real notification delivery, Google Calendar.
- Visual checks of the merged result: NOT TESTED (the 9A report records Chromium checks of landing, not-found and sign-in at 5 widths on its own tree only).
- Manual checks still required: MANUAL_TEST_CHECKLIST.md.


## Release hardening pass (executed, sandbox Linux, Node 22, PostgreSQL 16, zbar 0.23.93)
Order run: typecheck, lint, test, build, then typecheck, lint, test again. Versions after the pass: next 16.4.3, eslint-config-next 16.4.3, sharp 0.35.5 (unchanged), zod 4.6.7, body-parser 2.4.0.

| Command | Round 1 (before build) | Round 2 (after build) |
|---|---|---|
| `typecheck:all` (contracts, api, web, mobile) | PASS | PASS |
| `lint:all` (api, web, mobile) | PASS | PASS |
| `test:api` with `TEST_DATABASE_URL` and `zbarimg` | PASS 599/599, 0 skipped, 0 errors (52 files) | PASS 599/599, 0 skipped, 0 errors |
| `test:mobile` | PASS 142/142 | PASS 142/142 |
| `test:web` | PASS 82/82 | PASS 82/82 |
| `build:web` (Next 16.4.3, `.next` and SWC cache deleted first) | PASS, first run, exit 0 | not repeated |
| `build:api` | PASS | not repeated |
| `build:mobile` (`expo export` check) | PASS | not repeated |

Corrections to the Parts 9-13 section above
- The 5 skipped API tests were QR decode tests that need `zbar`; with `zbarimg` installed, all QR generation, decoding, resolution and authorization tests ran and passed (they are part of the 599). The count was 584 before the new upload tests (15 added). This does **not** test physical-device scanning.
- The unhandled busboy error is explained and fixed. Cause: busboy destroys the per-file stream with "Unexpected end of form" when a multipart body ends mid-file, and `upload.ts` had no `error` listener on that stream, so Node raised an uncaught exception. Reproduced in a plain Express app, where the process terminates. The earlier "API source is byte-identical to the baseline" note explains why it was present in the baseline too. Fix: error listener on every file stream (including discarded ones), single settlement, cleanup when the client aborts.
- Regression tests: `apps/api/tests/uploadParser.test.ts` (15 tests, no database needed). Against the original `upload.ts`, 5 of them fail (the repeated-upload test records 25 uncaught exceptions); against the fix all 15 pass. Header-only truncation and client-disconnect cases pass on both versions and act as guards.
- The first-run `next build` exit 1 (security-advisory notice for Next 16.4.0) did not recur on 16.4.3 in one clean-cache run. One run is not proof that it cannot recur.
- `@rolldown/binding-linux-x64-gnu` no longer needs to be copied into `node_modules`: the lockfile now carries all platform bindings (see docs/DEPENDENCY_AUDIT.md). A clean `npm ci --ignore-scripts` followed by the suites passed.

Environment notes
- `prisma generate` could not download engines here; it ran with `PRISMA_SCHEMA_ENGINE_BINARY` pointed at a stub and produced a client byte-identical to the one in the archive. `prisma migrate` was **not** exercised; database tests apply the migration SQL directly through `pg`.
- The PostgreSQL cluster was stopped by the sandbox once between runs, which made every database suite fail at setup; it was restarted and the suite re-run. The reported results are from the passing runs.
- During the first sandbox attempt the API suite exceeded the per-command time limit when chained with other commands; the runs reported above were executed separately.

Not re-run in this pass
- The 4-time-zone matrix for web/mobile, web end-to-end (Playwright scripts under `apps/web/e2e` need a running app and were not run), `build:all` as one command (the three builds were run separately), real Clerk, Razorpay, notification, Google Calendar and physical QR scanning checks.
- `npm audit`: 44 findings before, 39 after, 0 critical. See docs/DEPENDENCY_AUDIT.md for the classification and the remaining 7 high findings.
