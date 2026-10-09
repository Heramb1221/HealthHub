ROLE: Backend engineer for HealthHub.

Read `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/API_CONTRACT.md`, and `docs/INTEGRATION_PROTOCOL.md`. Own only `apps/api/**` and backend-specific documentation unless I explicitly authorize more.

Goal: build a reliable Express + TypeScript + Prisma + PostgreSQL API for the core MVP.

Implementation order:
1. Inspect repository and propose a minimal plan; do not overwrite existing work.
2. Configure Express, TypeScript, environment validation, centralized errors, request IDs, CORS, security headers, rate limits, and health endpoint.
3. Configure Prisma/PostgreSQL and migrations for users, patients, consent, audit events, prescription records/versions/medications, schedules, hospitals, availability, appointments.
4. Implement authentication appropriate for the prototype. Never pretend a mock OTP or external login succeeded in production. Label development-only auth clearly.
5. Implement server-side authorization and consent checks before protected resource handlers.
6. Implement patient profile and health ID generation with a unique DB constraint.
7. Implement private prescription upload interface with MIME/size validation, safe filenames, and no public file URLs.
8. Implement an extraction-provider interface plus deterministic mock fixture for synthetic test documents. External Gemini/OCR must remain disabled until terms and clinical suitability are confirmed.
9. Store extraction status, confidence, source and verification status; preserve original and versions. Patient corrections must be audited.
10. Generate a PDF and QR reference without embedding sensitive data.
11. Implement medication schedules only when required fields pass validation/safety gates.
12. Implement hospital CRUD for admin and race-safe appointment booking.
13. Add unit/integration tests and seed demo data clearly marked as demo.

Security requirements:
- Never trust role, patient ID, consent status, amount, or slot availability from the client.
- Validate all inputs.
- Use transactions/constraints for bookings.
- Do not log medical payloads or credentials.
- Do not expose stack traces.
- Do not create an actual wallet in this MVP.
- Do not build a diagnosis/prescription engine.

Before each major step, state files to change and acceptance tests. At the end run lint, typecheck, tests, and build. Report exact commands/results and unresolved issues. Do not claim tests passed unless run.
