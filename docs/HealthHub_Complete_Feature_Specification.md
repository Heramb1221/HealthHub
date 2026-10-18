# HealthHub --- Complete Final Product Feature Specification

**Market:** India first \| **Platforms:** Android, iOS, Web\
**Backend:** Node.js + Express + TypeScript \| **Database:**
PostgreSQL + Prisma\
**Web:** Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui\
**Mobile:** React Native + Expo + TypeScript \| **AI:** Gemini only
where provider terms and intended use permit\
**Constraints:** One developer, ₹0 initial budget, \~100 initial users,
intended joint ownership, demonstration target 21 October 2026.

> This is the complete intended product scope, not a promise that every
> feature can safely be production-ready by the demo date. Build the
> core MVP first. Clearly label mock, sandbox, unverified, disabled, and
> planned integrations. Never invent medical facts or fake successful
> operations.

# 1. Product principles

-   One backend and source of truth for web and mobile.
-   Modular monolith, not premature microservices.
-   Patient-controlled consent and least-privilege role-based access.
-   Preserve original medical documents and an auditable history of
    extracted/corrected data.
-   Distinguish patient-entered, AI-extracted, patient-corrected,
    clinician-verified, and externally sourced information.
-   AI must not autonomously diagnose, prescribe, or change treatment.
-   No claims of legal compliance, medical validation, official national
    health ID, or real integrations without evidence.

# PART A --- BACKEND

## 2. Backend foundation

-   Node.js, Express, TypeScript, PostgreSQL, Prisma, versioned
    migrations.
-   Modular domains and REST API under `/api/v1`.
-   Shared API types/schemas; Zod validation for untrusted input.
-   Centralized error format, request IDs, safe structured logging,
    health/readiness endpoints.
-   Environment validation, `.env.example`, separate dev/test/prod
    configuration.
-   Security headers, strict CORS, rate limits, request/file size
    limits, timeouts.
-   Pagination, sorting, filtering, search, API documentation (OpenAPI
    or equivalent).
-   Background jobs for OCR, PDF creation, reminders, notifications,
    retries and cleanup.
-   Idempotent job/callback processing.
-   Automated tests, lint, typecheck, build and CI.
-   Seed scripts with synthetic data marked as demo.
-   Never commit secrets, real patient data, prescription scans, tokens
    or keys.

## 3. Authentication and accounts

-   Register/login with supported email and/or mobile flow.
-   OTP verification when a real provider is configured; never fake
    verification in production.
-   Password hashing, reset/recovery, verification status, rate limiting
    and brute-force protection.
-   Google and Apple sign-in only when actually configured.
-   Secure sessions/tokens, expiry, refresh rotation where used, logout
    and session revocation.
-   Change phone/email with re-verification.
-   Account deactivation/deletion request with lawful retention
    exceptions.
-   Terms and privacy-notice version tracking.
-   Clear development-only auth mode separate from production.

## 4. Roles, authorization and consent

Roles: patient, authorized caregiver/family member, doctor/clinician,
hospital staff, pharmacy staff where applicable, platform admin,
background service account. - Server validates actor, patient ownership,
role, resource scope, consent, purpose and status for every protected
request. - Family relationship alone does not grant access. -
Hospital-admin access does not automatically grant access to patient
records. - Patients can grant, review, expire and revoke scoped access;
revocation blocks future access subject to legal retention
obligations. - Emergency access, if added, requires narrowly defined
policy, justification, expiry and audit. - Log sensitive record access
and changes without storing passwords, OTPs, tokens or full medical
payloads. - Support privacy notice, data
access/correction/export/deletion requests, retention policy,
incident/breach response and vendor inventory.

## 5. Patient identity and profile

-   Generate random non-meaningful ID such as `HH-7K9P-4X2M`; enforce
    uniqueness. Internal UUID is the primary key.
-   Do not encode name, phone, DOB or other personal data in ID.
-   Patient fields: full name, DOB, gender, blood group, phone, email,
    emergency contact, allergies/reactions/severity, existing
    conditions, current medication summary, address, optional photo,
    preferred language, time zone, reminder preferences and
    verification/profile status.
-   Patients can edit demographic fields. Verified clinical source
    records must not be silently overwritten.
-   Health ID/QR can be regenerated/revoked if compromised.
-   Do not call this an official ABHA/ABDM ID without approved
    integration.

## 6. Family and caregiver data

-   Linked family profiles and family-tree relationships across
    generations.
-   Relationship, age/DOB or age at death where appropriate, conditions,
    approximate age of onset, notes, source and verification status.
-   Distinguish self-reported, caregiver-reported and clinically
    verified data.
-   Guardian/caregiver permissions; minors require appropriate guardian
    handling and legal/provider review.
-   Family links never automatically grant medical-record access.
-   Educational family-risk indicators only; no unsupported genetic
    diagnosis or risk prediction.

## 7. Prescription upload and extraction

-   Accept camera photos, gallery images and PDFs; intended support for
    English printed and handwritten prescriptions, noting handwriting
    can fail.
-   Validate file content/type, MIME/signature, size; safe filenames;
    private storage; no public file URLs.
-   Preserve original file, uploader, patient, timestamp, hash, source,
    storage reference and processing status.
-   OCR/extraction fields when present: prescriber/clinic, date, patient
    details printed on source, medicine/brand/generic,
    strength/concentration, dosage form, dose, route, frequency/timing,
    duration/start/end date, quantity/refills, instructions, explicit
    diagnosis/indication, follow-up, OCR text, per-field confidence,
    provider/model and processing version.
-   Do not invent missing fields or infer diagnosis merely from a
    medicine.
-   Automatically save extracted fields as desired, but mark them
    unverified. Low-confidence medicine name, strength, dose, route or
    frequency must be flagged and cannot silently become a definitive
    medication instruction.
-   Use an extraction-provider adapter and synthetic fixtures in
    development. Gemini remains disabled for clinical workflows until
    terms, data processing, intended-use permission and suitability are
    confirmed.

## 8. Prescription versioning, correction, PDF and QR

-   Keep original source separate from extracted structured fields.
-   Each processing run/correction creates traceable version/event
    history.
-   Patient may correct working extracted fields; record old/new values,
    actor, timestamp and reason where appropriate.
-   Patient correction is not clinician verification.
-   Distinguish uploaded physical prescription, patient-corrected
    extraction, and clinician-issued/authenticated e-prescription.
-   Never represent a scan as a newly issued or digitally signed
    prescription.
-   Prescription list/detail with date, source, prescriber, medicines,
    status, verification/confidence labels and authorized version
    history.
-   Downloadable PDF with HealthHub ID, record ID, date/source,
    verification status and QR reference.
-   Label digitized copies accurately.
-   QR contains a random reference/protected access URL, not health
    information or a permanent bearer secret.
-   QR lookup returns the latest authorized version of that specific
    prescription; older versions remain available only to authorized
    users.
-   Protect PDF download and QR lookup with authorization,
    expiry/revocation where applicable, audit and retry/error states.

## 9. Medication management

-   Schedules only from sufficiently complete and safe fields.
-   Medicine, strength, dose, route, frequency, times, duration,
    start/end date and instructions.
-   Multiple doses/day and selected weekdays where supported.
-   Patient can edit reminder preferences without silently changing
    source prescription.
-   Today/upcoming schedule and next dose where data exists.
-   Taken/skipped/missed dose events are patient-reported unless
    otherwise verified.
-   Track event time/time zone; avoid duplicate schedules on
    reprocessing.
-   Handle changed, expired, discontinued and superseded prescriptions.
-   Pause/disable reminders without deleting source prescription.
-   Distinguish local reminders from server push; permission-denied and
    disabled states.
-   Do not advise doubling a missed dose or changing treatment; refer to
    approved instructions or clinician/pharmacist.
-   Keep sensitive medicine details out of lock-screen notifications by
    default.

## 10. Contraindications and safety alerts

-   Check drug--drug interactions, recorded allergy conflicts, duplicate
    ingredients/therapy, supported drug--condition contraindications and
    missing critical details.
-   Use an appropriate licensed/validated structured drug source, not
    Gemini alone.
-   Store source/version/update date, severity, rationale and related
    medication references.
-   Distinguish interaction, contraindication, precaution, duplicate
    therapy and unknown/not assessed.
-   Explain the trigger and next step; distinguish "no alert detected"
    from "confirmed safe."
-   Never independently stop/start/change medication or present an alert
    as a diagnosis.
-   Qualified clinical review is required before production use.
-   If no validated data source is configured, say the check is
    unavailable.

## 11. Medical/disease history

-   Chronological timeline for patient-entered conditions,
    prescriptions, clinician diagnoses, reports, appointments when
    integrated and relevant documents.
-   Start/end dates, ongoing/resolved status, source and verification
    status.
-   Search/filter by date, condition, source/category.
-   Corrections and audit history; authorized export.
-   Never infer a confirmed disease solely from a prescription medicine.

## 12. AI symptom checker

-   Free-text and structured symptom entry.
-   Adaptive follow-up questions for duration, onset, severity,
    associated symptoms, age and relevant authorized history.
-   Possible explanations with uncertainty; urgency guidance and
    emergency red flags.
-   Appropriate direction to emergency care or clinician where needed.
-   Clear non-diagnosis limitation and source/limitations.
-   No autonomous prescribing or changing current treatment.
-   Collect only necessary data; avoid sending identifiers/whole records
    to external AI.
-   Store sessions only according to consent and retention policy.
-   Do not enable clinical workflows until provider terms, intended use,
    clinical validation and regulatory assessment are complete; minors
    only if provider terms and safeguards permit.

## 13. Health card and QR

-   Downloadable health card (PDF/image) with HealthHub ID and QR;
    name/photo only where appropriate.
-   Patient-card QR is distinct from prescription-specific QR.
-   QR is random, revocable, scoped and time-limited where appropriate.
-   Authentication/consent or separately reviewed emergency policy
    before revealing records.
-   Audit access; no medical data in QR payload.
-   Do not claim official national health ID status.

## 14. Hospitals, providers and appointments

### Directory

-   Only admins create/edit/verify/activate/deactivate hospital records;
    patients cannot add to the authoritative directory.
-   Name, verified address/contact, website, location coordinates if
    verified, services/departments, operating hours, accessibility,
    active/verified state and last-verified date.
-   Search/filter; details page; seeded hospitals clearly marked demo.
-   No invented contact details, ratings, services or credentials.
-   Deactivated hospitals cannot accept new bookings; historical
    appointments remain accessible. \### Providers
-   Name, specialty, qualifications, registration details where
    verified, affiliation, availability, status and source.
-   No fabricated credentials. \### Booking
-   Actual available slots; server-side validation and
    transaction/constraint preventing double booking.
-   Booking reference, provider/location/time, status, instructions,
    payment status and history.
-   Confirm/cancel/reschedule/no-show/completed states and defined
    rules.
-   Notifications, time-zone correctness,
    stale-slot/network-failure/retry handling.
-   Provider/admin schedule management.
-   No fake success if booking was not persisted. \### Reviews/photos
-   Rating, written review, moderated photo uploads, report/review
    removal flow, spam/rate limiting.
-   Verified-appointment label only when verifiable.
-   Show rating count and average; do not imply rating equals clinical
    certification.

## 15. Insurance

-   Insurer and plan directory with source and last-verified timestamp.
-   Patient policy details and secure document upload.
-   Protect/mask policy number and sensitive details.
-   Policy dates, expiry, insurer contact.
-   Coverage/exclusions/waiting period/limits only when backed by
    authoritative current data.
-   Clearly informational; no guarantee of coverage or eligibility
    without authoritative insurer integration.
-   No claims/preauthorization/insurance sales without separate scope
    and compliance review.

## 16. Payments and future wallet

### Payment gateway MVP

-   Server-created payment order for appointment.
-   Provider checkout, sandbox mode, webhook signature verification,
    idempotency, amount/currency verification and reconciliation.
-   Pending/success/failed/cancelled/refunded states, receipt/history
    and refund workflow.
-   Handle abandoned checkout, duplicate/late webhooks and network
    failure.
-   Never trust client-supplied payment status.
-   No real payments without provider onboarding and proper setup. \###
    Future stored-value wallet
-   Not in MVP. No real stored funds/transfers/withdrawals without legal
    review and suitable regulated partner.
-   If added later: auditable ledger, reconciliation, idempotency,
    limits, fraud monitoring, disputes and controls.
-   Display balance must never be source of truth.

## 17. Vaccinations

-   Vaccine, dose/sequence, administration date, provider,
    source/verification status, certificate/document, batch/lot where
    appropriate, due date if supported by authoritative schedule, and
    reminder preferences.
-   Distinguish patient-entered from verified records.
-   Do not create personalized schedules without appropriate
    authoritative guidance.

## 18. Dashboard, notifications and administration

### Dashboard

-   Patient name, HealthHub ID, profile completion.
-   Next reminder and appointment only if present.
-   Latest prescription and processing/verification status.
-   Real safety alerts only if a valid check ran.
-   Recent activity and quick actions.
-   Educational family insight only when supported by entered data.
-   Empty/loading/error/offline/retry states; no fabricated wallet
    balances, alerts or statistics. \### Notifications
-   Medication, appointment, prescription-processing, consent/access,
    payment and account-security events where enabled.
-   Preferences by category/channel, quiet hours/time zone where
    appropriate, delivery/retry status where supported.
-   SMS/email/push only when provider configured and legally
    appropriate.
-   No sensitive details in lock-screen previews by default. \###
    Admin/operations
-   Protected admin portal and server-side authorization.
-   Hospital/provider CRUD, verification and deactivation.
-   Schedule/slot management.
-   Review/photo moderation.
-   Support actions and audited changes.
-   Background-job failure/retry visibility.
-   Integration/feature-flag status without exposing secrets.
-   Admin role does not grant unrestricted health-record access.

## 19. Integrations and infrastructure

-   Private object storage for originals, reports and PDFs.
-   OCR/extraction adapter; Gemini only for permitted, reviewed use.
-   Validated drug-interaction source.
-   OTP/email provider.
-   Push notification provider.
-   Payment gateway.
-   PDF and QR generation.
-   Maps/geocoding only if selected and configured.
-   Safe error monitoring, backups/restore, job retries, secrets
    management, dependency scanning and CI.
-   No mock may be labelled as a real working integration.

# PART B --- WEBSITE

## 20. Web stack and UI quality

-   Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Lucide
    icons.
-   Responsive desktop/tablet/mobile browser layouts.
-   Typed API client and shared contracts.
-   Server components where appropriate; client components for
    interaction.
-   Protected patient/admin routes.
-   Accessible semantic HTML, labels, keyboard/focus, contrast and
    screen-reader support.
-   Consistent theme tokens, typography, spacing and states.
-   No generic AI dashboard, excessive gradients/cards, random charts,
    emoji icons, fake data or dead buttons.
-   Every data screen has loading, empty, error, retry and success
    states.
-   Mock adapter isolated and explicitly labelled.

## 21. Public and authentication pages

-   Landing page, product explanation, feature overview, sign-up/login
    CTA, contact/support, privacy/terms links, SEO/social metadata,
    not-found/error pages.
-   Registration/login, verification, resend, reset/recovery,
    Google/Apple only when configured, expired-code/network/rate-limit
    states, session-expired handling.

## 22. Patient web screens

-   Dashboard.
-   Profile view/edit and emergency contact.
-   Family tree, family details and consent/caregiver management.
-   Prescription list, filters, upload, progress, processing status,
    detail, confidence/verification labels, correction form, original
    file view, version history, PDF download and protected QR.
-   Medication schedule, reminder preferences and dose self-report.
-   Medical history timeline, filters/search, source labels and
    patient-entered entries.
-   Digital health card and QR regeneration/revocation if implemented.
-   Hospital directory/search/details and verified contact information.
-   Provider availability and appointment
    booking/history/cancel/reschedule.
-   Insurance directory, personal policy details and secure documents.
-   Vaccination records and documents.
-   Notification preferences, language settings, session/device
    management, consent/access history, privacy/data requests and
    logout.
-   All operations use backend persistence; no fake successful
    booking/payment/clinical alert.

## 23. Admin web portal

-   Protected admin layout/login.
-   Hospital search/list/status and create/edit/verify/deactivate.
-   Provider and availability management where authorized.
-   Appointment operations.
-   Review/photo moderation.
-   Support actions with least privilege and audit.
-   Job status/retry if implemented.
-   Integration configuration status without secrets.
-   Confirmation dialogs for destructive operations.
-   Loading/error/empty states.

# PART C --- MOBILE APP

## 24. Mobile stack and behavior

-   Expo + React Native + TypeScript, Android and iOS.
-   Same backend and API contract as website.
-   Native navigation, safe areas, keyboard-aware forms, accessible
    touch targets.
-   Secure token storage; no secrets in app bundle or sensitive records
    in insecure local storage.
-   Network/offline/retry states where appropriate.
-   Camera/gallery/file permission explanation and denied states.
-   Deep links must not bypass authorization.
-   Local reminders clearly distinguished from remote push
    notifications.
-   Respect font scaling, locale/time zone and accessibility settings.
-   Prevent duplicate submits; disable controls while processing.
-   Preserve unsaved form input after transient failures where
    reasonable.

## 25. Mobile screens

-   Welcome/splash, registration/login, OTP/email verification,
    recovery, social sign-in when configured.
-   Dashboard and patient profile.
-   Emergency contacts, allergies and conditions.
-   Family tree and access/consent management.
-   Prescription list, camera capture, gallery/PDF selection,
    preview/retake, upload progress/cancel/retry, processing status,
    detail, correction, original viewer, PDF download/share and
    verification labels.
-   Digital health card, QR display/scanning, permission-denied and
    protected access flow.
-   Medication schedule, next dose, reminder permissions/preferences and
    taken/skipped self-report.
-   Medical history timeline/search.
-   Vaccinations.
-   Hospital directory/search/details, contact/directions actions if
    configured, provider availability and appointment
    booking/history/cancel/reschedule.
-   Insurance directory, policy details and secure document upload.
-   Payment checkout only when actual provider/sandbox is configured.
-   Notifications/preferences, session/device management, privacy/data
    requests and logout.
-   Every major screen has
    loading/empty/error/offline/permission-denied/retry states.

# PART D --- CROSS-CUTTING

## 26. Security, privacy and legal dependencies

-   TLS; encryption at rest where supported; password hashing; secure
    session handling.
-   Authorization on every protected resource; consent revocation; audit
    trail.
-   Private files and short-lived authorized downloads.
-   Rate limiting, upload validation, security headers, strict CORS and
    safe errors.
-   No secrets or sensitive data in logs, URLs, QR payloads, analytics
    or notification previews.
-   Backup/restore, incident response, data retention,
    correction/export/deletion workflow and vendor assessment.
-   Assess applicable Indian data-protection rules and their
    commencement timelines.
-   Clinical review and intended-use/regulatory assessment for symptom
    checker and medication safety.
-   Prescription validity and prescriber authentication requirements.
-   Licensed/validated drug data source.
-   Gemini terms, data processing and intended-use restrictions.
-   Payment provider onboarding; legal/regulated partner before wallet.
-   Accurate hospital/insurer data and usage permissions.
-   ABDM/ABHA requirements before claiming official interoperability.
-   App-store privacy disclosures.
-   Written joint IP agreement, contribution/IP assignment, open-source
    license review and patentability review before public disclosure of
    a potentially patentable invention.
-   Never claim compliance/certification without evidence.

## 27. Testing and operational readiness

-   Unit and API integration tests.
-   Clean database migration and seed tests.
-   Cross-patient authorization and consent-revocation tests.
-   Upload validation, prescription version/correction, PDF and QR
    access tests.
-   Ambiguous prescription fields cannot silently create definitive dose
    instructions.
-   Appointment concurrency/double-booking tests.
-   Payment webhook signature/idempotency tests if enabled.
-   Web lint/typecheck/build; mobile typecheck/startup and platform
    smoke tests.
-   Responsive/accessibility checks and full end-to-end patient journey.
-   Backup/restore rehearsal, safe monitoring and job retry behavior.
-   Document install, environment setup, migrations, seed data, API,
    deployment, limitations and demo.
-   Never claim a test passed unless it was run; report actual commands
    and outcomes.

# PART E --- DELIVERY GATES

## 28. Core MVP

-   Auth suitable for demo.
-   Patient profile and random HealthHub ID.
-   Consent/authorization foundation and audit logs.
-   Prescription upload, extraction adapter/fixture, confidence and
    verification status, correction/version history.
-   PDF and protected QR.
-   Medication schedule and medical history.
-   Web and mobile core patient journey.
-   Admin-managed demo hospital directory.
-   Availability and safe appointment booking.
-   Tests, setup instructions and synthetic demo data.

## 29. Expanded health features

-   Family tree and educational insights.
-   Vaccination records.
-   Production OCR integration.
-   Validated drug interaction source and reviewed rules.
-   Symptom checker after terms, clinical validation and regulatory
    assessment.
-   Reviews/photos and moderation.
-   Insurance directory and policy storage.

## 30. Commercial integrations

-   Production OTP/social authentication.
-   Real payment gateway and reconciliation.
-   Production push notifications.
-   Live hospital/provider schedules.
-   Authoritative insurer data/API integrations.
-   Future regulated wallet through an appropriate legal/partner model.
-   ABDM integration after appropriate onboarding.

These are sequencing gates, not deletion of intended features. Do not
present later-gate features as production-ready when they are mocks.

# 31. Mandatory instructions for each AI coding agent

1.  Read this specification and the shared API contract before coding.
2.  Inspect the repository; do not assume files/features exist.
3.  Work only in the assigned directory/workstream.
4.  Do not silently drop requirements or change API contracts.
5.  Propose a small plan before major changes; implement incrementally.
6.  Do not invent medical facts, provider data, ratings, coverage
    decisions or integration results.
7.  Do not fake success for actions that were not persisted.
8.  Label mock, sandbox, unverified and disabled features.
9.  Preserve original records and audit history.
10. Do not expose secrets or sensitive data.
11. Run actual lint/typecheck/tests/build and report exact outcomes.
12. Report files changed, gaps, dependencies and next steps.
13. Ask before breaking changes to architecture, schema, permissions or
    API contracts.
14. Prefer maintainable typed code over giant generated dumps.

# 32. Final product acceptance

The integrated product must demonstrate that: - Web and mobile use the
same backend. - A patient profile and unique HealthHub ID can be
created. - A synthetic prescription can be uploaded, extracted through a
fixture or approved provider, saved with confidence/verification
metadata, corrected and rendered as PDF. - Original source and history
are preserved. - QR lookup is protected and only reveals authorized
information. - Ambiguous extraction does not silently become a
definitive medication instruction. - Medical history records source and
verification status. - Admin-only hospital management works. -
Appointment booking prevents double booking. - Every protected resource
enforces server-side authorization. - All data-driven screens have
loading, empty, error and success states. - No real payment, clinical,
insurance or national-health integration is falsely represented. -
Setup, configuration, tests, limitations and demo instructions are
documented.
