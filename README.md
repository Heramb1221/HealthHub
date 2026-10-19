# HealthHub

HealthHub is an India-first personal health-record and care-navigation platform.

## Architecture

HealthHub is organized as a typed monorepo:
- **`apps/api`**: Node.js, Express 5, TypeScript, Prisma 7, PostgreSQL, JWT + Clerk, Google Calendar OAuth, Razorpay sandbox.
- **`apps/web`**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Lucide icons, Clerk authentication.
- **`apps/mobile`**: React Native (0.86), Expo SDK 57, TypeScript, Clerk mobile authentication.
- **`packages/contracts`**: Shared API types and Zod schemas.

---

## Quickstart

### Option A: Zero-Backend Demo Mode (Instant Evaluation)

Both Web and Mobile clients include built-in synthetic fixtures and work out of the box with zero database or backend setup:

```bash
# 1. Clone and enter repo
git clone <repo-url>
cd HealthHub

# 2. Run Web in Demo Mode
npm run dev:web
# -> Open http://localhost:3000 (pre-seeded with demo patients, prescriptions, and hospitals)

# 3. Run Mobile in Demo Mode
npm run dev:mobile
# -> Press 'i' for iOS simulator, 'a' for Android emulator, or scan QR with Expo Go
```

---

### Option B: Full Live Stack (Database + API + Clients)

#### 1. Configure Environments
Copy the template files:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Ensure `apps/web/.env.local` has:
```env
NEXT_PUBLIC_API_MODE=live
API_ORIGIN=http://localhost:4000
```

Ensure `apps/mobile/.env` has:
```env
EXPO_PUBLIC_APP_MODE=live
EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1
```

#### 2. Start PostgreSQL & Run Migrations
```bash
cd apps/api
npm install
npx prisma migrate dev
npm run seed:demo
```

#### 3. Start Development Services (from Root)
```bash
# Start API (port 4000)
npm run dev:api

# Start Web (port 3000)
npm run dev:web

# Start Mobile
npm run dev:mobile
```

---

## Root Orchestration Scripts

You can run quality gates and developer workflows from the monorepo root:

| Command | Action |
| :--- | :--- |
| `npm run typecheck:all` | Runs `tsc --noEmit` across API, Web, Mobile, and Contracts |
| `npm run lint:all` | Runs ESLint across API, Web, and Mobile |
| `npm run test:all` | Runs all unit and validation suites (API Vitest + Mobile Node Runner) |
| `npm run build:all` | Builds API bundle, Web static/prerender output, and Hermes mobile bundles |
| `npm run dev:api` | Starts backend development server on port 4000 |
| `npm run dev:web` | Starts Next.js development server on port 3000 |
| `npm run dev:mobile`| Starts Expo Metro bundler |

---

## Critical Safety Boundaries & Gating

- **Prescriptions**: Scanned/physical uploads are never claimed as newly issued or clinician-verified. Low confidence extractions are visibly marked `needs_review` / `unverified`.
- **Medication Schedules**: Only created from reviewed, sufficiently confident prescription records. Doses are self-reported.
- **Symptom Checker**: Triage advisory only with emergency red flags; never autonomously diagnoses or prescribes.
- **Payments**: Razorpay sandbox mode for appointment reservations and bill previews; no real banking transactions are simulated.
- **Zero Hallucination**: All synthetic fixtures and demo data are explicitly marked in the UI.

---

## Specification Documents
- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md): Core functional scope and boundary rules.
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md): Comprehensive REST endpoint definitions and schemas.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): Visual hierarchy, typography, colors, and components.
- [docs/INTEGRATION_PROTOCOL.md](docs/INTEGRATION_PROTOCOL.md): Multi-workstream coordination standards.
