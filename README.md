# HealthHub

HealthHub is an India-first patient health-record and care-navigation MVP. It is being developed by one primary developer with assistance from Claude across backend, web, and mobile workstreams.

## MVP objective by 21 October 2026

Deliver a demonstrable end-to-end flow:
1. Patient signs in using the implemented development-safe authentication flow.
2. Patient creates a profile and receives a random HealthHub ID.
3. Patient uploads an English-language prescription image/PDF.
4. Backend stores the original, extracts structured fields, and records extraction/verification status.
5. Patient can review/correct extracted fields without overwriting the original source.
6. Patient can view the prescription, a generated PDF, and a protected QR lookup.
7. Patient can view medical history and medication schedules.
8. Admin can manage a small seeded hospital directory.
9. Patient can book an available demo appointment.
10. Web and mobile clients use the same API contract.

## Important safety boundary

This is an MVP, not a validated clinical decision-support system. Never present OCR output as a verified prescription, invent a diagnosis, or make the AI prescribe or alter treatment. Use synthetic/demo data during development. Do not process real patient data through external AI services until provider terms, privacy, and clinical suitability have been reviewed.

## Stack

- `apps/api`: Node.js, Express, TypeScript, Prisma, PostgreSQL
- `apps/web`: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui
- `apps/mobile`: Expo + React Native + TypeScript
- API prefix: `/api/v1`
- Shared contracts: `packages/contracts` (Zod schemas and TypeScript types, where practical)

## Repository rules

- `docs/PRODUCT_SPEC.md` is the source of truth for scope.
- `docs/API_CONTRACT.md` is the source of truth for API names and payloads.
- `docs/DESIGN_SYSTEM.md` is the source of truth for visual direction.
- `docs/INTEGRATION_PROTOCOL.md` defines how parallel workstreams coordinate.
- Do not silently change API contracts, role permissions, or database semantics. Propose changes in a short decision note first.
- Do not commit secrets, `.env` files, real patient data, real prescription scans, or API keys.
- All user-visible actions must work. Do not leave dead buttons or fake success messages.
- Any demo-only behavior must be labelled as demo data or sandbox behavior.
