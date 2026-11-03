# Sehat Meds (HealthHub)

An India-first patient health-record and care-navigation platform: prescription upload and reading, medication reminders, health-card and prescription QR codes, hospital directory and appointments, vaccination records, family profiles, insurance and payments.

> **Status:** release-hardened source tree. Automated checks pass (see [TEST_REPORT.md](TEST_REPORT.md)), but **production readiness has not been established**: live Clerk sign-in, Razorpay sandbox payments and webhooks, real notification delivery, Google Calendar, physical QR scanning, and browser/device checks are still manual items (see [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)).

## Architecture

npm-workspaces monorepo:

| Path | Package | Description |
|---|---|---|
| `apps/api` | `@healthhub/api` | Node.js (>= 22) / Express 5 / TypeScript REST API. Prisma 7 with `@prisma/adapter-pg` on PostgreSQL. Zod validation, helmet, CORS, rate limiting, busboy uploads, Clerk (`@clerk/express`), Razorpay payments, Google Calendar OAuth, pluggable prescription extraction (`mock` or `gemini`, chosen by `EXTRACTION_PROVIDER`; local OCR via tesseract.js). |
| `apps/web` | `web` | Next.js 16 (App Router) web portal with Tailwind 4, Clerk and a demo/live API mode (`NEXT_PUBLIC_API_MODE`). |
| `apps/mobile` | `@healthhub/mobile` | Expo SDK 57 / React Native app with Clerk, notifications, camera/document pickers and QR display. |
| `packages/contracts` | `@healthhub/contracts` | Shared Zod schemas and types. |

Typical deployment shape (from the existing guides): web on Vercel, API on Render with a managed PostgreSQL database, mobile through Expo/EAS.

## Prerequisites

- Node.js >= 22 (the API requires it; the root `engines` field is >= 20). npm 10+.
- PostgreSQL 16 for the API and for database-backed tests.
- Network access to `binaries.prisma.sh` for `prisma generate` / `prisma migrate` (the generated client is already committed in `apps/api/src/generated/prisma`).
- Optional: `zbar-tools` (`zbarimg`) to run the QR decoder tests (without it they are skipped).
- Optional: Clerk, Razorpay (sandbox), Google OAuth, Gemini and Resend credentials for live features.

## Installation

```bash
npm ci
```

`npm ci` runs the API `postinstall` (`prisma generate`), which needs network access to Prisma's binary host. If that host is unreachable, `npm ci --ignore-scripts` installs everything else.

## Environment configuration

Each app has its own example file. **Never commit real `.env` files**; copy and fill in locally or in your hosting dashboard.

```bash
cp apps/api/.env.example    apps/api/.env
cp apps/web/.env.example    apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Key settings: API `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `CLERK_SECRET_KEY`, `QR_LINK_BASE` (required, https, in production); web `NEXT_PUBLIC_API_MODE` (`demo` or `live`), `API_ORIGIN`, Clerk keys; mobile `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Every setting is described in [DEPLOYMENT_AND_ENVIRONMENT_GUIDE.md](DEPLOYMENT_AND_ENVIRONMENT_GUIDE.md).

## Local development

```bash
npm run dev:api      # API with watch mode
npm run dev:web      # Next.js dev server
npm run dev:mobile   # Expo dev server
npm run seed:demo    # demo data (requires a database)
```

Apply migrations to a local database with `npm --prefix apps/api run db:migrate:dev` (development) or `db:migrate:deploy` (deployment).

## Testing

```bash
npm run typecheck:all
npm run lint:all
npm run test:all     # API + mobile
npm run test:web
```

Database-backed API tests (the majority of the API suite, including QR sessions and authorization) are skipped unless `TEST_DATABASE_URL` is set. It must point at a database whose name ends in `_test`; the harness drops and recreates its `public` schema.

```bash
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sehat_test npm run test:api
```

QR decoder tests additionally need `zbarimg` on the `PATH`. They decode generated QR images with an independent decoder; they do not test physical-device scanning.

## Build

```bash
npm run build:api
npm run build:web
npm run build:mobile   # expo export check for android + ios
npm run build:all
```

## Deployment overview

1. Provision PostgreSQL and run `npm --prefix apps/api run db:migrate:deploy`.
2. Deploy the API with production environment variables (including an https `QR_LINK_BASE`).
3. Deploy the web app with `NEXT_PUBLIC_API_MODE=live` and `API_ORIGIN` set to the API.
4. Build the mobile app with Expo/EAS using the production Clerk publishable key.
5. Work through [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md) with sandbox keys before any release.

## Documentation

- [docs/HealthHub_Complete_Feature_Specification.md](docs/HealthHub_Complete_Feature_Specification.md): feature specification
- [docs/QUALITY_AUDIT.md](docs/QUALITY_AUDIT.md): baseline quality audit
- [docs/patch-reports/](docs/patch-reports/): redesign, i18n and accessibility reports
- [DEPLOYMENT_AND_ENVIRONMENT_GUIDE.md](DEPLOYMENT_AND_ENVIRONMENT_GUIDE.md): deployment and environment settings
- [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md), [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md): progress and report
- [TEST_REPORT.md](TEST_REPORT.md), [BUG_FIX_REPORT.md](BUG_FIX_REPORT.md), [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md): testing and fixes
