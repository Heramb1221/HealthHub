# Deployment and Environment Guide — Sehat Meds (in progress)

## ACTION REQUIRED before the next API deploy (Part 5)
Set **`QR_LINK_BASE`** on the API (Render) to your public web address with a trailing slash, e.g. `https://health-hub-rose.vercel.app/`. In production the API now refuses to start without it, because QR codes on health cards and prescription PDFs would otherwise point to `healthhub://` or `localhost`. Optional: `EMERGENCY_RATE_LIMIT_MAX` (default 20 lookups per window per user). Mobile: `EXPO_PUBLIC_WEB_URL` (defaults to `https://health-hub-rose.vercel.app`).

## Secrets
The uploaded archive contained real `.env` files (Clerk, Gemini, Razorpay, Google OAuth, Resend, database, JWT). They are **not** included in the deliverable. **Rotate all of those keys.** Copy each `.env.example` to `.env` / `.env.local` and fill in values locally or in Vercel/Render.

## Clerk dashboard steps (required for items A1, A2, A4)
1. User & Authentication → enable **Phone number** as an identifier (and, if wanted, "Sign-in with phone code"). Enable SMS delivery (Clerk's SMS provider; India delivery and DLT requirements apply — check Clerk's docs for your plan).
2. Password policy: check minimum/maximum length and "reject compromised passwords" — Clerk, not this app, decides whether a long or spaced password is accepted. Test one 100+ character passphrase with spaces after changing settings.
3. Name: enable first/last name collection in the sign-up form (web) so patient names are populated.
4. Mobile: Native applications must be enabled for the instance (needed by `@clerk/expo`); set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/mobile/.env`.
5. If "Client Trust"/new-device verification is on, the mobile app now handles the email/SMS code step; authenticator-app (TOTP) second factors are not supported in the mobile app and are reported with a clear message.

## Prescription reading (Part 4)
`EXTRACTION_PROVIDER` (apps/api): `disabled` (default), `mock` (synthetic fixtures only), `local`, `local_then_gemini`, `gemini`.
- **Recommended: `local`.** Reads printed prescriptions on your server (Tesseract via WASM, English data bundled by `@tesseract.js-data/eng`); images never leave the server. No API key needed. It does not read handwriting or PDFs.
- `local_then_gemini` additionally needs `GEMINI_API_KEY` and sends a document to Google **only** when the local reader found no medicines. Choose it only if that is acceptable for your patients' data.
- Resources: first request starts the OCR engine (about 2-3 s warm-up, tens of MB of data); one image takes roughly 2-8 s (sideways images are retried). Give the API instance at least 1 GB RAM for comfort; very small free instances may be too tight. `sharp` ships prebuilt binaries for Linux/macOS/Windows.
- Whatever the provider, extracted details always start as "needs review" and only become schedules after the patient reviews and confirms them.

## QR codes (Part 5)
- Every QR holds a link plus an opaque id, never medical data. Opening one always requires signing in; nothing is shown anonymously.
- Mobile apps cannot open these links directly yet (no deep-link/app-link setup). A phone camera or generic scanner opens the web page, which works on any phone. Universal/App Links need your domain's `apple-app-site-association` / `assetlinks.json` files, which are outside this repository.
- Provider "emergency" lookups of the small emergency summary need no prior patient consent (break-glass) but are audited under `emergency.profile_viewed`.

## Reminders and calendar (Part 6)
- Mobile reminders are scheduled on the phone only (about 14 days ahead, refreshed when the app opens). There is no server push service.
- Google Calendar sync is now an idempotent reconcile: it creates, updates and deletes only events it created (identified by ids starting `sehat` and a private `sehatScheduleId` property). The Google connection needs the Calendar events scope it already uses; nothing new to configure. Medicine names are left out of events unless the patient ticks the opt-in.
- Reminder times are stored as local times plus an IANA zone; the API, web and mobile each carry the same time-zone module (`zonedTime`), kept identical by a test.

## Payments (Part 7)
1. Sandbox: create Razorpay **test** keys, set `RAZORPAY_KEY_ID=rzp_test_…` and `RAZORPAY_KEY_SECRET` on the API. Pay with Razorpay's test cards/UPI on the website. No money moves.
2. Webhook (recommended): in the Razorpay dashboard add `https://<your-api>/api/v1/payments/webhook` with events `payment.captured`, `payment.failed`, `order.paid`; put the same secret in `RAZORPAY_WEBHOOK_SECRET`.
3. Fee: `APPOINTMENT_FEE_PAISE` (default 50000 = ₹500) is charged by the server.
4. **Production without keys = payments unavailable** (the app tells patients to pay at the hospital). With no keys outside production, the app uses labelled simulated test payments.
5. Going live needs live keys (`rzp_live_…`), the webhook, and your Razorpay account's KYC/activation (outside this repository).
6. The mobile app sends patients to the website to pay; an in-app checkout would need `react-native-razorpay` and an EAS development build.

(More sections will be added in later parts.)

## Parts 9-13 additions
- No new environment variables, dependencies or services were introduced by the redesign, localization or accessibility patches. The only `package.json` change is the mobile `test` script, which now also runs `tests/i18n.test.ts`.
- Build order: `npm ci` at the root, `npm run typecheck:all`, `npm run lint:all`, `npm run test:all`, `npm run test:web`, `npm run build:all`. API tests with a database need `TEST_DATABASE_URL` pointing at a database whose name ends in `_test`.
- (Superseded by the release hardening section below.) `npm run build:web` exited 1 on its first run with a Next.js security-advisory notice for Next 16.4.0 and passed on repeating; Next is now 16.4.3.
- Prisma needs network access to binaries.prisma.sh for `prisma generate`/`migrate`; the generated client is already in `apps/api/src/generated/prisma`.
- Still required from the owner before release: Clerk keys, `QR_LINK_BASE` (https), Razorpay sandbox/live keys and webhook secret, notification and Google Calendar credentials, production database. None are in this archive.

## Release hardening additions
- Next.js is 16.4.3 (web workspace). Do not downgrade below 16.4.1; the October 2026 advisories cover `use cache`, SVG image optimization (keep `sharp` >= 0.35.5) and Server Actions.
- The API refuses malformed or truncated multipart uploads with a controlled validation error. No process-level `uncaughtException` handler is configured, so any new stream consumer must attach `error` listeners.
- Node: the API requires >= 22 (`apps/api/package.json`); the root manifest allows >= 20.
- Install: `npm ci`. The API `postinstall` runs `prisma generate`, which needs access to Prisma's binary host. Where that is blocked, `npm ci --ignore-scripts` works because the generated client is committed in `apps/api/src/generated/prisma`. The lockfile now contains the Linux, macOS and Windows native binaries needed by Next SWC, Vitest (rolldown) and the lint resolver.
- Database tests: set `TEST_DATABASE_URL` to a PostgreSQL database whose name ends in `_test` (the harness recreates its `public` schema). Without it, most of the API suite is skipped. QR decoder tests need `zbarimg` (`apt install zbar-tools`).
- Remaining dependency findings and the recommended Prisma follow-up are in docs/DEPENDENCY_AUDIT.md. Re-run `npm audit` before release.
- No new environment variables or services were added. No secrets or `.env` files are in the archive.
