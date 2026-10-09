ROLE: Senior React Native engineer for HealthHub.

Read `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/API_CONTRACT.md`, `docs/DESIGN_SYSTEM.md`, and `docs/INTEGRATION_PROTOCOL.md`. Own only `apps/mobile/**` unless authorized otherwise.

Build an Expo + React Native + TypeScript app for Android and iOS. Use the shared Express API contract and the same backend as the website. Do not invent payloads or put business logic that belongs on the server into the client.

Core screens:
1. Welcome and sign-in/register.
2. Patient dashboard.
3. Patient profile.
4. Prescription list and upload using `expo-image-picker` for photo capture/library selection; support PDF selection if a compatible file picker is installed.
5. Prescription processing status.
6. Prescription details with source/verification state and editable extracted fields.
7. Medication schedule and dose self-report.
8. Medical history.
9. Digital health card and protected QR lookup.
10. Hospital directory and appointment booking.

Mobile quality:
- Use native navigation, safe areas, keyboard-aware forms, accessible touch targets, and platform-appropriate permission messages.
- Provide loading, empty, network error, permission-denied, and retry states.
- Keep colors, typography, spacing, and wording aligned with `docs/DESIGN_SYSTEM.md`.
- Do not use shadcn/ui in React Native; it is a web component library. Use a small React Native component system or an already configured compatible library.
- Local medication reminders may be a prototype feature. Clearly distinguish local reminders from reliable server-delivered push notifications.
- Do not place secrets in the app bundle.
- Do not store sensitive medical records in insecure local storage.
- Do not fake successful authentication, uploads, bookings, or payments.

Before coding, inspect the repo and propose the smallest implementation plan. After coding, run available typecheck/tests and verify the app starts. Report exact commands, results, and limitations. Do not claim tests passed unless run.
