# HealthHub API

Express 5 + TypeScript + Prisma 7 + PostgreSQL. Authentication, patient profiles,
consent-based access, audit logging, prescriptions with versioning and a safety gate,
medication reminder schedules, health history, hospitals, and race-safe appointment
booking. All data in development and demos is synthetic.

## Quick start

```bash
cd apps/api
npm ci                                  # also generates the Prisma client
cp .env.example .env                    # then set DATABASE_URL and JWT_SECRET (openssl rand -base64 48)
npx prisma migrate deploy               # apply the migrations
DEMO_SEED_PASSWORD='choose-12+-chars' npm run seed:demo   # optional demo data
npm run dev                             # http://localhost:4000/api/v1/health
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Run with reload / compile / run the build |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` | All tests. Integration tests need `TEST_DATABASE_URL` (a database whose name ends in `_test`; it is wiped on every run) and are otherwise skipped |
| `npm run db:validate` / `db:migrate:deploy` | Validate the schema / apply migrations |
| `npm run seed:demo` | Load labelled demo data (needs `DEMO_SEED_PASSWORD`; refuses production without `ALLOW_DEMO_SEED=true`) |
| `npm run fixtures:generate` | Rebuild the synthetic prescription PDFs in `fixtures/synthetic/` |

## Verify the migrations on your machine (important)

The migrations were hand-written to match Prisma's naming because Prisma's migration
engine could not be downloaded where this was built. Before relying on them, with the
migrations applied to a fresh database:

```bash
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Exit code 0 means the database matches the schema. Check the flag with `npx prisma migrate diff --help`.
CHECK constraints and triggers live in the migrations only (Prisma does not manage them).

## Security model in one page

- **Identity:** argon2id passwords; short-lived JWT carrying only user and session ids; the role is read from the database on every request; sessions are revocable; `POST /auth/refresh` cannot extend a login past `SESSION_MAX_HOURS`.
- **Authorization is server-side and default-deny:** patients reach only their own data; providers need a live, unexpired, unrevoked consent for the exact scope; admins manage the hospital directory and never see medical records. Ownership, role, consent, and slot availability are never taken from the client.
- **Audit:** access, consent, correction, scheduling, and booking events are recorded with ids and field names only, never values. The audit log, prescription versions, health history, and dose events are append-only (database triggers).
- **Prescriptions:** the original file is stored privately and never served; extraction output passes a safety gate that can only yield `unverified` or `needs_review`; patient corrections create new versions and are never "verified". Schedules are made only from reviewed, complete, confident rows.
- **Extraction:** `EXTRACTION_PROVIDER` is `disabled` or `mock` (synthetic fixtures only). External OCR/AI such as Gemini is not available and stops the server at startup.
- **Logging:** route patterns only, never URLs, ids, query strings, bodies, tokens, or medical content.

## Know before deploying

- **Uploads are stored on local disk.** Many free hosts wipe the disk on redeploy. Use a host with a persistent volume, or implement the `PrivateFileStore` interface for a bucket.
- Behind a reverse proxy, set Express `trust proxy` so rate limits see client IPs (not done yet).
- Rate limits are in memory and per instance.
- The PDF uses standard fonts: text outside Latin-1 (for example Devanagari) prints as `?`.
- `npm audit` reports 4 high findings in the Prisma CLI's dependency chain (build-time, not request-handling).

See `docs/CONTRACT_DECISIONS.md` for every decision and `docs/CONTRACT_CHANGES_NEEDED.md` for what the contract needs.
