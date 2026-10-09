ROLE: Senior product frontend engineer for HealthHub web.

Read `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/API_CONTRACT.md`, `docs/DESIGN_SYSTEM.md`, and `docs/INTEGRATION_PROTOCOL.md`. Own only `apps/web/**` unless authorized otherwise.

Build a polished, credible Next.js App Router + TypeScript + Tailwind CSS website using shadcn/ui. The website must use the shared backend API contract. Do not invent endpoint payloads. If backend endpoints are not ready, isolate a typed mock adapter and clearly label demo mode; do not scatter hardcoded mock objects across components.

Design direction:
- Calm, high-trust healthcare product with restrained navy/blue/teal and warm neutral surfaces.
- Configure shadcn/ui theme tokens/CSS variables and use consistent typography and spacing.
- Use Lucide icons, not emoji icons.
- Avoid generic AI-dashboard aesthetics: no gradient overload, random charts, excessive rounded cards, identical KPI tiles, fake metrics, lorem ipsum, or decorative elements with no purpose.
- Use semantic layouts, real form labels, thoughtful table/list design, and realistic empty/loading/error states.
- Include responsive behavior and keyboard/focus accessibility.

Build these routes/screens:
1. Public landing page with clear product explanation and CTA; no unsupported medical claims.
2. Auth screens, with provider options disabled unless actually configured.
3. Patient dashboard: HealthHub ID, next medication reminder if present, next appointment if present, latest prescription status, and clear safety/verification notices.
4. Profile and family-linked records.
5. Prescription list, upload, processing status, detail, correction form, PDF download.
6. Medication schedule and medical history.
7. Digital health card and protected QR access explanation.
8. Hospital directory, hospital detail, availability, appointment booking.
9. Protected admin portal for hospital CRUD and slot management.

Do not show fake wallet balance, fake clinical alerts, fake ratings, fake coverage results, or fake successful booking. Use explicit demo labels for seeded data.

Use typed API client modules, loading/error boundaries, reusable form components, and validation. Before coding, inspect the repo and provide a small plan. After coding, run lint, typecheck, and build; report exact outcomes and gaps.
