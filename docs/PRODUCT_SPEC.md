# HealthHub Product Specification

Version: 0.1
Target demo: 21 October 2026
Market: India first
Primary developer: one person; Claude-assisted parallel workstreams

## Product purpose
Help patients maintain a structured personal health record and make prescription information, medication schedules, medical history, and healthcare navigation easier to manage.

## MVP personas
- Patient: owns a health profile and controls record sharing.
- Administrator: manages the hospital directory and demo content.
- Provider/staff roles are represented in the permission model but may be seeded/demo-only in the first delivery.
- Family caregiver access is a planned workflow; do not grant access merely because two profiles are linked.

## MVP in scope
1. Patient registration/login using a safe development flow. Production OTP/email/Google/Apple providers may be stubbed only if explicitly labelled and must not fake successful verification.
2. Patient profile: name, date of birth, gender, blood group, contact, emergency contact, allergies, existing conditions, current medications, address, photo optional.
3. Random, non-meaningful HealthHub ID with a unique database constraint.
4. QR code referencing a protected server-side access flow; QR must not embed medical data or act as a permanent bearer token.
5. Prescription upload: image/PDF, size/type validation, private storage interface, processing status.
6. Prescription extraction adapter. In development, support a mock provider for synthetic fixtures; production AI/OCR provider is configurable and disabled until reviewed.
7. Extracted prescription record with original file reference, extracted fields, confidence/status, timestamps, and correction history.
8. Patient review/correction UI. Although automatic extraction and saving is desired, uncertain medication name/strength/dose/frequency must be marked unverified and must not automatically generate a definitive dose instruction.
9. Prescription details and downloadable PDF with patient ID, prescription record ID, source/verification labels, and QR reference.
10. Medication schedules from sufficiently complete records; patient can edit reminder preferences. Dose taken/skipped status is self-reported.
11. Medical history log with source and verification status.
12. Dashboard with patient ID, next reminder, next appointment if any, and visible safety/status alerts. Do not display invented wallet balances or fake clinical alerts.
13. Admin-managed hospital directory with seeded demo hospitals clearly marked as demo data.
14. Appointment availability and booking for seeded slots; prevent double booking.
15. Next.js admin interface and responsive patient web experience.
16. React Native/Expo app for core patient workflows.

## Planned but not required to be production-functional by 21 October
- Clinically validated drug-interaction/contraindication engine.
- Patient-facing AI symptom checker.
- Real payment collection, refunds, or wallet.
- Live hospital/provider integrations and verified reviews.
- Real insurance eligibility or coverage decisions.
- ABDM integration or official national health ID claims.
- Fully validated production handwritten-prescription OCR for all handwriting styles.
- Production authentication integrations requiring paid/approved providers.

These can appear in the roadmap or be shown as clearly labelled disabled prototypes. Do not simulate a real medical or financial outcome.

## Prescription data rules
- Preserve original source file and extracted content.
- Each processing run creates a version or traceable extraction event.
- Corrections never silently rewrite the source document or erase previous values.
- Track `sourceType`, `extractionStatus`, `verificationStatus`, `confidence`, `createdAt`, `updatedAt`.
- Use explicit values such as `uploaded_physical`, `clinician_issued` only when supported, `needs_review`, `unverified`, `verified_by_authorized_clinician`.
- A patient correction is not professional verification.
- Only generate medication schedules from sufficiently complete and safe fields; ambiguous values require review.
- QR lookup must return the latest authorized version for the specific prescription record. Historical versions remain accessible only to authorized users.

## Access and privacy rules
- Patient-controlled consent and least-privilege access.
- Hospital-admin permissions do not imply access to medical records.
- Every protected API checks authorization server-side.
- Revoke future access when consent is revoked; preserve audit history.
- Use synthetic data in development and demo.
- Do not send identifiable records to Gemini or other third-party AI unless the service's terms, data processing, intended use, and consent have been reviewed.
- Never put sensitive health information in QR payloads, URLs, logs, analytics, or push notification previews.

## Acceptance criteria for demo
- `npm`/package-manager scripts are documented and work from a clean clone.
- Database migrations run from a clean database.
- One end-to-end patient journey works using the same backend for web and mobile.
- Prescription upload, extraction fixture/mock, review, persistence, and PDF/QR flow work end-to-end.
- Protected routes deny unauthorized access.
- Booking a slot twice concurrently cannot create two confirmed bookings.
- All demo data is labelled.
- No secret is committed.
- Lint/typecheck/build and critical tests pass, or remaining failures are explicitly documented.
