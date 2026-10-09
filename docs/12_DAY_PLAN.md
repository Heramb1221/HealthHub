# HealthHub 12-day plan: 9–21 October 2026

## Day 1 — 9 Oct: Lock scope and repository
- Create repo and add project documents.
- Choose package manager and monorepo layout.
- Create GitHub branches and Claude workstream instructions.
- Do not start three independent codebases without the contract.

## Day 2 — 10 Oct: Scaffold and API contract
- Scaffold API, web, and mobile apps.
- Backend publishes initial Prisma schema and API response/error shapes.
- Frontend agents build shell/navigation and typed API clients.

## Day 3 — 11 Oct: Auth and patient profile
- Implement development-safe auth and patient profile CRUD.
- Build matching web/mobile screens.
- Generate unique health ID.

## Day 4 — 12 Oct: Consent and access control
- Implement authorization middleware and patient ownership checks.
- Add QR access-session design.
- Test unauthorized access before building deeper health features.

## Day 5 — 13 Oct: Prescription upload
- Secure file upload and private storage abstraction.
- Build upload UI and processing status.
- Use synthetic fixture documents only.

## Day 6 — 14 Oct: Extraction and versioning
- Add extraction provider interface and mock fixture.
- Store extracted fields, confidence, verification status, and correction history.
- Keep external Gemini/OCR disabled until approved for the intended use.

## Day 7 — 15 Oct: Prescription detail, PDF, QR
- Build correction UI.
- Generate downloadable PDF.
- Make QR lookup protected and scoped.
- Run first full end-to-end patient flow.

## Day 8 — 16 Oct: Medication and history
- Build schedules and dose self-report.
- Add medical history.
- Gate reminders on completeness and verification rules.

## Day 9 — 17 Oct: Hospital directory and appointments
- Admin hospital CRUD and seeded demo records.
- Availability and transaction-safe booking.
- Add appointment views on web and mobile.

## Day 10 — 18 Oct: UI polish and mobile validation
- Remove dead buttons and generic placeholder UI.
- Test narrow web layouts and physical Android device if available.
- Fix keyboard, permission, and loading/error states.

## Day 11 — 19 Oct: Security and integration
- Run integration-review prompt.
- Fix P0/P1 issues.
- Verify migrations, clean setup, auth, consent, upload, QR, and booking.

## Day 12 — 20 Oct: Freeze and rehearse
- Feature freeze.
- Test from a clean clone.
- Prepare demo data, README, screenshots, and demo script.
- No major new dependencies or features.

## 21 Oct: Demo day
- Start only known-good services.
- Use synthetic data.
- Show the end-to-end core flow.
- Be explicit about prototype/mock/disabled integrations.
