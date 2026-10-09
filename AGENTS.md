# Instructions for AI coding agents

## First steps
1. Read `README.md`, `docs/PRODUCT_SPEC.md`, `docs/API_CONTRACT.md`, `docs/DESIGN_SYSTEM.md`, and `docs/INTEGRATION_PROTOCOL.md`.
2. Inspect the existing repository before changing files. Do not replace working code or restructure the repo without a reason.
3. Report the current state, files to be changed, assumptions, and acceptance tests before a large implementation.

## Engineering standards
- Use TypeScript for backend, web, and mobile.
- Prefer small, cohesive modules and explicit types.
- Validate all untrusted input at API boundaries with Zod or equivalent.
- Use Prisma migrations; do not make schema changes without updating documentation and migrations.
- Use centralized error handling and a consistent error response.
- Add loading, empty, success, validation, and error states to every data-driven screen.
- Use accessible labels, keyboard/focus behavior on web, and sensible touch targets on mobile.
- Use realistic seeded demo data, not hardcoded production-like patient data.
- Keep API calls in typed client/service modules, not scattered through UI components.
- Do not duplicate business logic across web and mobile.
- Never trust client-supplied role, patient ID, price, payment status, consent status, or booking availability.
- Enforce authorization on the server for every protected resource.
- Use database transactions/constraints for appointment booking and other concurrency-sensitive operations.
- Keep original prescription files and extracted versions separate. Store confidence/verification status.
- Never claim a scanned physical prescription is a newly issued, digitally signed prescription.
- Do not allow low-confidence/ambiguous extraction to become an authoritative medication instruction.
- Never allow an LLM to autonomously diagnose, prescribe, or change treatment.
- No fake integrations: if a service is not configured, show an explicit disabled/demo state.
- Do not introduce new dependencies unless necessary; explain the benefit and maintenance cost.

## UI quality / avoid generic AI output
- Follow `docs/DESIGN_SYSTEM.md`.
- Do not create a generic dashboard of identical cards, gradient blobs, excessive rounded pills, emoji icons, or random charts.
- Use a clear information hierarchy, deliberate whitespace, restrained colors, consistent spacing, and meaningful typography.
- Use Lucide icons (web: `lucide-react`; mobile: `@expo/vector-icons` or a compatible icon package already installed).
- Use shadcn/ui on Next.js only. It is not a React Native component library.
- Prefer semantic page layouts, tables, forms, timelines, and status indicators over decorative cards.
- Include realistic responsive behavior and thoughtful empty/loading/error states.
- Keep content clinically cautious and plain-language.
- Do not invent statistics, hospital details, doctor credentials, ratings, or medical claims.

## Work protocol
- Work only in the assigned workstream unless an integration task is explicitly requested.
- Before finishing, run the available lint, typecheck, tests, and build commands.
- Fix failures introduced by your changes.
- Summarize changed files, commands run, outcomes, known gaps, and next steps.
- Do not claim a test passed unless you actually ran it.
