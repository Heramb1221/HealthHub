# Sehat Meds — Quality Audit (Part 1 baseline)

Source of truth: uploaded `HealthHub.zip` (git HEAD `e4df12e`, plus uncommitted working-tree changes).
Status legend: PASS / PARTIAL / BLOCKED / FAIL / NOT TESTED.

## 1. Architecture (verified by inspection)
| Area | Finding |
|---|---|
| Monorepo | npm workspaces: `apps/api`, `apps/web`, `apps/mobile`, `packages/contracts` |
| API | Node >=20, Express 5, TypeScript, Prisma 7 (+`@prisma/adapter-pg`), PostgreSQL, Zod, helmet, cors, express-rate-limit, busboy, `@clerk/express`, jose, hash-wasm (argon2id), qrcode-generator |
| Web | Next.js 16 App Router, Tailwind 4, radix-ui, lucide-react, sonner, `@clerk/nextjs`, zod. **No framer-motion / GSAP installed** |
| Mobile | Expo SDK 57, RN 0.86, `@clerk/expo`, react-navigation, expo-notifications / image-picker / document-picker / secure-store, react-native-qrcode-svg |
| Contracts | `packages/contracts` (zod only; 3 source files) |
| OCR/extraction | `apps/api/src/extraction`: `mockProvider` (deterministic fixtures) and `geminiProvider`; selected by `EXTRACTION_PROVIDER` |
| Payments | Razorpay: `modules/payments` (`/config`, `/orders`, `/verify`, `/history`) |
| Translation | Dictionary-keyed by English source string: `apps/web/src/lib/i18n/languages.ts`, `apps/mobile/src/i18n/languages.ts`, API `modules/localization` (`/languages`, `/dictionary/:lang`, `/translate`) |
| Demo vs live | Web: `NEXT_PUBLIC_API_MODE=demo|live` (`src/lib/api/mode.ts`, fixtures in `src/lib/demo`). Mobile: `EXPO_PUBLIC_APP_MODE` / presence of `EXPO_PUBLIC_API_URL` (`src/demo/demoFetch.ts`) |

### API surface (20 modules)
access, appointments, audit, auth (register/login/refresh/logout/me), calendar (Google OAuth), consents, dashboard, family, history, hospitals (+admin, slots, hold/release, reviews), insurance, localization, notifications, patients (`/me`, health-card, export, terms), payments, prescriptions (upload, process, extracted-fields PATCH, versions, pdf, file, latest, contraindications, delete), qr (create/get/delete session, `/emergency/:healthId`), schedules (+dose-events), symptoms (`/questions`, `/assess`), vaccinations.
Prisma: 24 models, 15 migrations (latest `20261020000000_allow_prescription_deletion`).

### Web routes (26 pages)
Public/auth: `/`, `/sign-in`, `/sign-up`, `/qr/[reference]`.
App: dashboard, profile, family, history, vaccinations, hospitals (+`[id]`), appointments, payments, insurance, symptoms, health-card, medications (+`new`, `[scheduleId]`), prescriptions (+`new`, `[id]`), admin (+hospitals, new, `[id]`, slots).

### Mobile screens (19)
AddSchedule, Auth (+`.web` variant), Care, Dashboard, FamilyTree, HealthCard, History, Hospital, Insurance, Medication, Payments, PrescriptionDetail/List/Upload, Profile, Sharing, SymptomChecker, Vaccination.

## 2. Baseline command results (actually executed, Linux sandbox, `npm ci --ignore-scripts`)
| Check | Result |
|---|---|
| typecheck contracts / api / web / mobile | PASS (all rc=0) |
| lint api / web / mobile | PASS (all rc=0) |
| mobile tests (`tsx --test`) | PASS — 68 pass, 0 fail |
| API tests (`vitest run`) | **FAIL to start** — rolldown native binding missing (npm optional-dependency issue in this sandbox) **and** `apps/api/tests/` is absent from the upload (see D1) |
| Web production build | NOT RUN (baseline) |
| API build, mobile `export:check` | NOT RUN (baseline) |
| Web e2e (Python/Playwright, `apps/web/e2e`) | NOT RUN; Python scripts exist for 10 areas |
| Prisma DB-backed tests | NOT RUN; no isolated Postgres in sandbox yet |

Logs: `/home/claude/baseline/*.log`.

## 3. Initial defect and risk list (prioritized)
| ID | Sev | Finding | Evidence |
|---|---|---|---|
| D0 | **Critical** | Upload contains **real secrets**: `apps/api/.env`, `apps/web/.env.local`, `apps/mobile/.env` (Clerk secret + publishable keys, Gemini key, Razorpay key secret, Google OAuth secret, Resend key, DB URL, JWT secret). They are git-ignored but present in the ZIP. | Keys listed with values masked. **Must be excluded from the deliverable and should be rotated** since the archive was shared. |
| D1 | High | Working tree is missing 74 tracked files: all 39 `apps/api/tests/**`, `README.md`, `AGENTS.md`, `docs/*` (product spec, API contract, design system, integration protocol), `prompts/*`, synthetic PDFs, screenshots. All exist in git HEAD. | `git status` shows ` D` for each |
| D2 | High | Phone login absent (no phone flow in web/mobile auth; API has none). | grep: no phone auth code |
| D3 | High | Password handling to verify: web sign-up max 128, API login/register max 128, sign-in uses Clerk; "long password / spaces" failure cause not yet located. Name field is `.trim()`'d (fine) but length/Unicode path unverified. | `validation/auth.ts`, `modules/auth/schemas.ts` |
| D4 | High | Branding: user-facing text is "Sehat Med" (~156 hits) and tagline "Bharat ka apna **Sathi**" (spelling differs from required "Saathi"); "HealthHub" remains in ~77 user-facing/API strings; `app.json` name "Sehat Med". Translation dictionaries are keyed by the exact English string, so a rename must update keys and values together. | grep counts |
| D5 | Med | Mobile Clerk exists (`@clerk/expo`, `AuthScreens.tsx`, `tokenCache.ts`) — the "missing Clerk flow" report needs reproducing before changes. | file inventory |
| D6 | Med | `EXTRACTION_PROVIDER=gemini` in local env, while the project's earlier recorded decision was no external OCR for clinical data until terms are confirmed. Needs your confirmation before I tune the Gemini path. | `.env`, project notes |
| D7 | Med | `app.json` requests `RECORD_AUDIO` on Android with no obvious need; bundle ids still `in.healthhub.mobile` (keep for compatibility). | `app.json` |
| D8 | Med | Build artifacts shipped in the upload: `apps/mobile/.export-check`, `.expo`, `apps/web/tsconfig.tsbuildinfo`. Exclude from the ZIP. | file listing |
| D9 | Low | `scripts/test_api_endpoints.ts`, `check_records.mjs`, `backfill_prescriptions.ts` are ad-hoc scripts; review before shipping. | `apps/api/scripts` |
| — | Info | Questionnaire (symptom checker), prescription pipeline, QR, schedules, payments: reported bugs **not yet reproduced** — scheduled for Parts 3–7. |

## 4. Protected-asset baseline (for the final integrity check)
SHA-256 baselines saved: `brand-assets.sha256` (logo/icons/favicons — all PNG icons are one identical file `819efce0…`), `protected-data.sha256` (hospital seed + demo hospital data, vaccination catalog, demo seed).
Protected files: `apps/api/scripts/seed_jalgaon_hospitals.ts`, `seed_15min_slots.ts`, `src/seed/demoSeed.ts`, `src/modules/vaccinations/catalog.ts`, `apps/web/src/lib/demo/{hospitals,vaccinations}.ts`, `apps/mobile/src/lib/vaccineCatalog.ts`, `apps/mobile/src/demo/demoFetch.ts`. No edits to these without an explicit reason.

## 5. Prioritized plan
Order follows the 13 parts; because the repo deadline is near, I suggest weighting effort as: Parts 2, 4, 5, 7 (correctness/security) first, redesign (9, 10) after, scoped to avoid regressions.

## Final integration audit (Part 13)

### Protected content
- `apps/api` and `packages/contracts` source: byte-identical to the baseline (diff, excluding build output).
- Every png/jpg/svg/ico/webp asset in the baseline: byte-identical.
- Hospital and vaccination data (API seed and fixtures): unchanged. Only UI components with "hospital"/"vaccin" in their name changed (HospitalScreen, VaccinationScreen, admin-hospitals-view, hospitals-view, vaccination-view), for layout and accessibility.
- No `.env` files or secrets in the tree; only `.env.example` templates.

### Integration review
- Four patches, no shared files, applied in order 9A, 9B, 10, 11. Part 11 changed only i18n modules, the language selector/modal, two tests and the mobile test script.
- Mobile `Chip` (Part 10) translates via `lookupTranslation` (Part 11 kept that export); typecheck and 142 tests pass, so no key conflict was found by automation.

### Open items
1. Redesign is partial on web (about 9 of roughly 40 feature screens touched) and mobile (sign-in, register, verification, family tree body, parts of insurance, payments, symptom checker unchanged).
2. Hard-coded English remains in about 35 web and 18 mobile files; the DOM translator covers exact matches only.
3. Clinical/safety translations withheld (34 web, 36 mobile entries) show English until reviewed.
4. Mobile icon-only controls need a hand check for `accessibilityLabel`.
5. Next.js 16.4.0 advisory notice at build; 45 npm audit findings.
6. API unhandled busboy error in the malformed-multipart test.
7. No browser, device, assistive-technology or live-credential testing was done on the merged result.

Production readiness is NOT claimed.
