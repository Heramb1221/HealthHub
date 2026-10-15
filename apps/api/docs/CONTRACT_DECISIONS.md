# API contract decisions (backend)

Status: Milestone 0. Applies to `docs/API_CONTRACT.md` v0.1.
Owner: backend workstream. Final decisions belong to the integrator.

This note fills gaps in the contract. It does not change any endpoint path or
any field that the contract already defines.

- **Approved** items were accepted as defaults by the integrator.
- **Proposed** items are my specifics. Nothing depends on them until each is
  approved, and each is needed only from the milestone named beside it.

## A. Approved

### A1. Response envelope
- Every success response is `{ "data": <resource | array> }`.
- Error shape is exactly the contract's:
  `{ "error": { "code", "message", "requestId" } }`.
- Responses never include stack traces, SQL or Prisma details, secrets, or
  patient details.
- Every response carries an `X-Request-Id` header. The same value appears in
  `error.requestId`.

### A2. Error codes (fixed list)

| code | HTTP | meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | body, query, or params failed validation |
| `UNAUTHENTICATED` | 401 | missing, invalid, expired, or revoked credentials |
| `FORBIDDEN` | 403 | authenticated but not permitted (role, ownership, consent) |
| `NOT_FOUND` | 404 | resource missing, or hidden to avoid confirming it exists |
| `CONFLICT` | 409 | uniqueness or state conflict (for example slot already booked) |
| `PAYLOAD_TOO_LARGE` | 413 | upload over the size limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | file type not allowed |
| `RATE_LIMITED` | 429 | too many requests |
| `PROVIDER_DISABLED` | 503 | an external provider (OCR/AI) is disabled by configuration |
| `INTERNAL_ERROR` | 500 | anything unexpected; the message is always generic |

Messages are short and generic. Field-level validation detail is limited to
field names and rule names and never echoes submitted values.

### A3. Authentication
- Email and password. Passwords are hashed with argon2id.
- A short-lived access token is returned. There is no refresh token and no
  OTP in the MVP. `POST /auth/refresh` is not implemented.
- Registration always creates a `patient`. Admin and provider accounts exist
  only through seeding.
- A development-only login shortcut exists behind an env flag. It is off by
  default and the server refuses to start with it on when
  `NODE_ENV=production`. Every response it produces is labelled development
  only. Contract impact: it adds one endpoint that `API_CONTRACT.md` does not
  list, so the integrator needs to add it to the contract (see D1).

### A4. Roles
- `patient`, `admin`, `provider`.
- The role comes only from the server-side user record, never from a request
  body, header, or token claim the client can set.
- `admin` (hospital admin) grants no access to medical records.
- `provider` is seeded or demo-only in this delivery.

### A5. Consent scopes (`resourceScope`)
Small fixed enum, read-only in the MVP:
`profile:read`, `prescriptions:read`, `health_history:read`,
`medication_schedules:read`.

Rules:
- Only the patient who owns the data can create or revoke a consent for it.
- `granteeUserId` must be an existing, active `provider` user. It cannot be
  the patient, and it cannot be an `admin`.
- Revoking sets a revoked timestamp. Future access is denied immediately and
  the audit history is kept.
- Expired consents never authorize.

## B. Proposed (not yet approved; needed from the milestone shown)

### B1. Auth bodies and session revocation (Milestone 3)
- `POST /auth/register` body: `{ email, password }`. Password length 10 to 128.
  Returns `{ data: { user: { id, email, role }, accessToken, expiresAt } }`.
- `POST /auth/login` has the same body and response.
- Access token: signed JWT with a `jti`, 60 minute lifetime.
- `POST /auth/logout` revokes the session identified by the `jti`, using a
  server-side sessions table, so logout is real and not just client-side.
- Login failures return the same `UNAUTHENTICATED` response whether the email
  or the password was wrong. Login and register are rate-limited more tightly
  than other routes.

### B2. Pagination (Milestone 5)
List endpoints accept `limit` (default 20, max 100) and `cursor`. Response:
`{ data: [...], page: { limit, nextCursor } }` where `nextCursor` is
`null` on the last page.

### B3. Availability and appointment bodies (Milestone 9)
- `GET /hospitals/:hospitalId/availability` returns slots with
  `{ id, startsAt, endsAt, status }`, where `status` is `open` or `booked`.
- `POST /appointments` body: `{ slotId }`. The patient comes from the session.
  The client never sends a patient ID, a price, or a status.

### B4. Dose events (Milestone 8)
`POST /medication-schedules/:scheduleId/dose-events` body:
`{ scheduledFor, status }` where `status` is `taken` or `skipped`. These are
self-reported and labelled that way in responses.

### B5. QR access sessions (Milestone 7)
- `POST /qr/access-sessions` body: `{ prescriptionId }`. Returns a random
  session reference and an expiry, never medical data.
- `GET /qr/access-sessions/:sessionId` requires an authenticated actor who
  passes the consent check. It returns only data the consent scope permits and
  writes an audit event. An expired or revoked session returns `NOT_FOUND`.

## C. Rules the implementation will follow
- Request bodies are validated with Zod at the boundary. Unknown fields are
  rejected, not ignored.
- Request bodies, uploaded file contents, tokens, and passwords are never
  logged.
- All persisted timestamps are UTC instants.
- Uncertain extraction output is stored as `needs_review` and never becomes
  an authoritative medication instruction.

## D. Items for the integrator

D1. Add the development-only login endpoint to `docs/API_CONTRACT.md` once
you confirm its path and shape.

D2. Root files are not touched by the backend workstream. Backend-local
`.gitignore` and `.env.example` live in `apps/api/`. The repository root
`.gitignore` is empty (0 bytes), so a root-level ignore for `.env*`,
`node_modules`, and upload directories should be added by you.

D3. The backend uses its own `package-lock.json` inside `apps/api/`. If you
later adopt a root workspace, that migration is a root-config change for you.

## E. Schema notes (Milestone 2)

Source: `prisma/schema.prisma` and `prisma/migrations/`.

E1. **Patient row is created at registration.** The contract has
`GET/PATCH /patients/me` but no create endpoint, so registering a patient user
also creates its `Patient` row with a generated `healthId`. Profile fields are
nullable until the patient fills them in. (Applies in Milestones 3 and 4.)

E2. **One confirmed booking per slot is enforced by the database.**
`Appointment.activeSlotId` is nullable and unique. It equals `slotId` while the
appointment is `confirmed` and is NULL after cancellation (CHECK constraint).
A duplicate booking fails with a unique violation, which the API maps to
`CONFLICT`.

E3. **Append-only tables.** Triggers block UPDATE and DELETE on `AuditEvent`,
`PrescriptionVersion`, and `PrescriptionMedication` (and TRUNCATE on
`AuditEvent`). The `originalStorageKey`, `originalFileName`,
`originalMimeType`, `originalSizeBytes`, and `originalSha256` columns of
`PrescriptionRecord` cannot change after insert. A correction is always a new
`PrescriptionVersion` row.

E4. **Record-level prescription fields are derived.** The contract's
prescription object shows `verificationStatus`, `prescriptionDate`,
`prescriberName`, and `medications` at the top level. These come from the
latest `PrescriptionVersion`. `processingStatus` is stored on the record.

E5. **Open question for Milestone 7.** The contract makes medication
`confidence` a number. The schema keeps it required (0 to 1). For a
patient-corrected field the proposal is to carry the extraction confidence
forward and let `verificationStatus` express that a correction is not
professional verification. Confirm or change before Milestone 7.

E6. **Provisional tables.** `MedicationSchedule` and `Hospital` have minimal
fields because the contract defines none. Their final shape is fixed in a
decision note before Milestones 8 and 9. `Session` supports logout
revocation (B1). Dose events, health history, and QR access sessions get their
own tables in the milestone that implements them.

E7. **Consent scopes are stored as text with a CHECK constraint**, not a
Prisma enum, so the stored value is exactly the wire string (`prescriptions:read`).

## F. Behavior implemented in Milestone 3

B1 (auth bodies, sessions) and B2 (pagination) are implemented as proposed.
The contract leaves the items below open, so each is stated here. Anything
marked "needs confirmation" is my choice, not an approved decision.

F1. **Auth responses.** `POST /auth/register` returns 201 and
`POST /auth/login` returns 200, both
`{ data: { user: { id, email, role }, accessToken, expiresAt } }`.
`POST /auth/logout` returns 200 `{ data: { revoked: true } }`.
Default token lifetime is 60 minutes (`ACCESS_TOKEN_TTL_MINUTES`).
The token carries only user id and session id. Role is read from the database
on every request.

F2. **Development-only login (resolves D1, needs confirmation).**
`POST /auth/dev-login`, body `{ email }`. The route is mounted only when
`DEV_AUTH_ENABLED=true`; otherwise it returns 404. The server refuses to start
with it enabled when `NODE_ENV=production`. It accepts only addresses ending in
`@demo.healthhub.test` and returns 401 for any other. The response sets header
`X-HealthHub-Dev-Only: true` and includes `devOnly: true` and a notice. Each use
writes an `auth.dev_login` audit event. Please add this endpoint to
`docs/API_CONTRACT.md`.

F3. **Consent object** (not defined in the contract; needs confirmation):
`{ id, patientId, granteeUserId, resourceScope, purpose, expiresAt|null,
revokedAt|null, createdAt }`. All timestamps are ISO 8601 UTC.
- `POST /consents` returns 201 `{ data: consent }`. The patient comes from the
  session; a client-supplied `patientId` is rejected.
- `GET /consents` returns `{ data: [...], page: { limit, nextCursor } }`.
  A patient sees consents they granted. A provider sees consents granted to
  them. Admins get 403.
- `DELETE /consents/:consentId` returns 200 `{ data: consent }` with
  `revokedAt` set. Repeating it is a no-op. It also revokes any other active
  consent for the same patient, grantee, and scope, so a duplicate can never
  keep access alive. A consent that is not yours returns 404.
- Duplicate active consents are allowed rather than rejected (no 409).

F4. **Patient-data access guard** (`requirePatientAccess`). Patients may
access only their own patient row. Providers need a consent for that patient
and that exact scope that is not revoked and not expired. Admins never get
access. A non-owner denial returns 403 and writes `access.denied`; a provider
read allowed by consent writes `access.granted`. A patient reading their own
data writes nothing. A resource that does not exist returns 404.

F5. **Registration conflicts.** A taken email returns 409 `CONFLICT` with a
generic message. This does reveal that the email is registered. I accepted that
for the MVP and did not add email verification.

F6. **Health ID format.** `HH-` plus 8 characters from the Crockford base32
alphabet (no I, L, O, U), for example `HH-7K2M9QXD`. It is random and encodes
nothing about the patient.

F7. **Validation errors stay generic.** The contract's error object has no
field-level detail, so the API does not return which field failed. If the web
and mobile clients need that, it is a contract change.

F8. **Rate limits.** Global limit plus a tighter one on register, login, and
dev-login (`AUTH_RATE_LIMIT_MAX`, default 10 per window per IP). The store is
in memory, so limits are per server instance and reset on restart. Behind a
reverse proxy the client IP needs `trust proxy` configured; that is not set yet.

## G. Patient endpoints (Milestone 4)

The contract lists `GET/PATCH /patients/me`, `GET /patients/me/health-card`, and
`GET /patients/me/access-history` but defines no fields. The shapes below are my
choices and need confirmation before web and mobile code depends on them.

G1. **Access.** Patient users only. Providers and admins get 403 on all four
endpoints. The patient is always the session's own patient; no patient id is
read from the client.

G2. **Profile object** (`GET` and `PATCH` response):
`{ id, healthId, fullName, dateOfBirth, gender, bloodGroup, phone,
emergencyContact: { name, phone }, allergies[], existingConditions[],
currentMedications[], address, createdAt, updatedAt }`.
Unset values are `null` (lists are empty). `dateOfBirth` is a date only,
`YYYY-MM-DD`. Email, user id, and password data are never included.

G3. **PATCH rules.**
- Partial update. Only the fields sent change. `null` clears a nullable field.
  A list replaces the stored list. `emergencyContact` merges by sub-field.
- Any field not listed in G2's writable set is rejected with 400, including
  `healthId`, `id`, `patientId`, `userId`, `role`, `email`, and timestamps.
  An empty body is rejected.
- `gender`: `female | male | other | prefer_not_to_say`.
  `bloodGroup`: `A+ A- B+ B- AB+ AB- O+ O-`.
- `dateOfBirth`: a real calendar date from 1900-01-01 up to today.
- `phone`: 7 to 20 characters of digits, spaces, parentheses, hyphens, with an
  optional leading `+`.
- Text fields are trimmed, must not be empty, and reject control characters.
  Limits: names 120, address 300, list items 100 characters, lists 30 items.
  List duplicates (case-insensitive) are removed, keeping the first spelling.
- A real change writes a `patient.profile_updated` audit event listing field
  names only. A request that changes nothing writes no event.

G4. **`currentMedications` is a self-reported list.** It is not read from
prescriptions and must not be presented as verified or used to build dose
instructions.

G5. **Photo is not implemented.** The spec lists an optional photo, but the
contract has no photo endpoint. The `photoStorageKey` column exists and is
unused.

G6. **Health card:** `{ healthId, fullName, dateOfBirth, bloodGroup, issuer,
notice, generatedAt }`. It contains identity fields only: no allergies,
conditions, medications, phone, address, or emergency contact. `notice` states
that the health ID is a HealthHub identifier and not an official national
health ID. The QR flow is separate (`/qr/access-sessions`, Milestone 7).

G7. **Access history** (`{ data, page }`, newest first, same cursor paging as
consents). It lists events about the caller's own record: `access.granted`,
`access.denied`, `consent.created`, `consent.revoked`, and
`patient.profile_updated`. Login and registration events are not listed.
Each event is `{ id, occurredAt, action, outcome, actor, resourceType,
resourceId, details }`.
- `actor` is `{ type: "self" }`, `{ type: "provider", userId }`, or
  `{ type: "other" }`. A user id is shown only for providers. For any other
  user (another patient, an admin) no identifier is shown.
- `details` shows only these keys when present: `resourceScope`, `reason`,
  `changedFields`, `consentId`, `granteeUserId`. Request ids and everything
  else are never shown.

## H. Prescription upload and read (Milestone 5)

Endpoints implemented: `POST /prescriptions`, `GET /prescriptions`,
`GET /prescriptions/:prescriptionId`. Not yet implemented (Milestones 6 and 7):
`/process`, `/versions`, `/extracted-fields`, `/pdf`, `/latest`. Everything
below is my choice where the contract is silent and needs confirmation.

H1. **Upload request.** `multipart/form-data` with exactly one file part named
`file`. The only other accepted field is `sourceType`, and only the value
`uploaded_physical` (`clinician_issued` is not supported). Any other field,
a second file, or a differently named file part returns 400. A non-multipart
body returns 415. The contract defines no other metadata fields.

H2. **File rules.** Allowed types: JPEG, PNG, WebP, PDF. The type is decided
from the file's leading bytes. The declared content type must agree with the
detected type (`image/jpg` is accepted as JPEG), otherwise 415. Empty files
return 400. The maximum size is `UPLOAD_MAX_BYTES` (default 10 MiB); a file
over it returns 413 and nothing is stored. A file of exactly the maximum is
accepted.

H3. **Response.** 201 `{ data: prescription }` in the contract's minimum
shape, with `processingStatus: "pending"`. It contains no storage key, file
name, hash, or URL. Before any extraction runs there is no version, so the
record reads `verificationStatus: "unverified"`, `prescriptionDate: null`,
`prescriberName: null`, `medications: []`. Dates are `YYYY-MM-DD`. After
extraction these fields come from the latest version.

H4. **Storage.** Files go to private storage under a server-generated key
(`prescriptions/<patientId>/<uuid>`). No client text is part of the key. The
file name is sanitized (base name only, limited characters, 100 characters) and
kept for display only. There is no endpoint that returns the original file, and
no public route serves it. The local implementation writes files with mode 600.
If saving the record fails after the file was written, the file is removed.

H5. **Limits.** `PATIENT_PRESCRIPTION_LIMIT` (default 100) records per patient:
the next upload returns 409 `CONFLICT`. `UPLOAD_RATE_LIMIT_MAX` (default 20 per
window per IP): excess returns 429. Both are my additions for abuse protection
on a small, free-tier host.

H6. **Access.** `GET /prescriptions` is patient-only and lists the caller's own
records (same cursor paging as consents). `GET /prescriptions/:id` is allowed
for the owning patient, or for a provider with a live `prescriptions:read`
consent for that patient. Admins never get access. Provider access, allowed or
denied, and denied attempts by other patients are audited. A patient reading
their own record is not. Unknown or malformed ids return 404.

H7. **Not done.** Uploaded files are checked by type and size only. There is no
malware scan, and images and PDFs are not decoded or rendered on the server.
Originals are never served, which limits the risk, but the files are untrusted
input for any future extraction step.

## I. Extraction, versions, and latest (Milestone 6)

Endpoints: `POST /prescriptions/:id/process`, `GET /prescriptions/:id/versions`,
`GET /prescriptions/:id/latest`. Not yet implemented (Milestone 7):
`PATCH .../extracted-fields` (patient corrections) and `GET .../pdf`.
The contract is silent on most of the behavior below; everything here is my
choice and needs confirmation.

I1. **Providers.** `EXTRACTION_PROVIDER` is `disabled` (default) or `mock`.
Any other value, including `gemini`, stops the server at startup. No external
OCR or AI provider is available until its terms and clinical suitability are
confirmed. With `disabled`, `process` returns 503 `PROVIDER_DISABLED`, changes
nothing, and writes a `prescription.process_refused` audit event.

I2. **The mock reads synthetic fixtures only.** It recognizes a file only if it
contains `HEALTHHUB-SYNTHETIC-FIXTURE:<id>` for a known fixture id, and returns
that fixture's fixed output. Any other file is refused, so the mock can never
invent medications for a real document. Its versions are stored with provider
name `mock-synthetic`. Committed demo files are in `fixtures/synthetic/`
(`clear-001`, `ambiguous-001`, `illegible-001`, `adversarial-001`) and can be
regenerated with `npm run fixtures:generate`. All drug names, doctors, doses,
and dates in them are fictional.

I3. **Safety gate.** All provider output is untrusted and passes through one
gate before storage:
- The only possible results are `unverified` and `needs_review`. A provider
  cannot set any status; `patient_corrected` and
  `verified_by_authorized_clinician` can never come from extraction.
- Even a fully confident, complete result is only `unverified`.
- `needs_review` is forced by any of: no medications; a row with confidence
  below 0.85; a row missing name, strength, dose, or frequency; reported overall
  confidence below 0.85; a date that is invalid, before 1900, or in the future;
  text cut at 200 characters; more than 30 rows.
- A confidence that is not a number from 0 to 1 counts as 0. It is never
  clamped upward.
- Control characters are removed, text is capped at 200 characters, rows with
  no readable content are dropped, and at most 30 rows are kept.
- The reason codes (never medical content) are written to the audit event.

I4. **Run states.** `pending` or `failed` can start a run. A `processing` run
older than 5 minutes (for example after a crash) can be started again. A
`completed` record returns 409, because a new version would otherwise replace
a later patient correction as the latest version. Starting a run is a single
conditional update, so of many simultaneous calls exactly one runs, and a slow
run whose claim was taken over is abandoned without writing a version.

I5. **Process response.** 200 `{ data: prescription }` with `processingStatus`
`completed` or `failed`. A failed run (unrecognized document, provider error,
malformed output, or missing original file) creates no version and writes a
`prescription.processing_failed` audit event with a reason code. Processing is
synchronous inside the request (30 second limit); a real provider would need a
background job.

I6. **Who may do what.**
- `process`: the owning patient only. A consent never grants processing.
- `versions` (history): the owning patient only. Providers are refused even
  with a consent.
- `latest`: the owning patient, or a provider with a live `prescriptions:read`
  consent. Admins never.

I7. **"Latest authorized version" (needs confirmation).** The docs do not say
what "authorized" means. I implemented: the newest version of the record, with
its `verificationStatus` always included, readable by anyone who passes the
consent check. It is not limited to verified versions. If you want `latest` to
return only verified or patient-corrected versions, that is a change here.
`latest` returns 404 before any version exists.

I8. **Version object:** `{ id, prescriptionId, versionNumber, kind,
verificationStatus, extractionProvider, extractionConfidence, prescriptionDate,
prescriberName, medications[], changedFields[], createdAt }`. Extraction
versions have `kind: "extraction"`, no `createdByUserId`, and empty
`changedFields`. `versions` pages newest first with the same cursor scheme as
other lists.

I9. **Not covered by tests.** The 30 second provider timeout path is not
exercised; waiting that long in a test was not worthwhile.

## J. Corrections, PDF, QR sessions (Milestone 7)

Endpoints: `PATCH /prescriptions/:id/extracted-fields`, `GET /prescriptions/:id/pdf`,
`POST /qr/access-sessions`, `GET /qr/access-sessions/:sessionId`, and
`DELETE /qr/access-sessions/:sessionId` (a contract addition, see J6). B5 from
section B is implemented with the changes described here. Everything below is
my choice where the contract is silent and needs confirmation.

J1. **Corrections.** Owner patient only. Body:
`{ baseVersionNumber, prescriptionDate?, prescriberName?, medications? }`.
- `baseVersionNumber` is the version the client was looking at. If it is not
  the newest version the request fails with 409 and nothing is written. Use `0`
  when no version exists yet, which lets a patient enter data by hand for an
  illegible or unprocessed document (this works once).
- Omitted fields keep their current value. `medications`, when sent, replaces
  the whole list (each row: name, strength, dose, route, frequency, duration,
  instructions; at least one must be non-empty; at most 30 rows). Dates must be
  real, from 1900-01-01 to today. Unknown fields, including any status, are
  rejected.
- The result is a NEW version (201, the version object) with
  `kind: "patient_correction"` and `verificationStatus: "patient_corrected"`.
  Earlier versions and the original file are never changed. This is the
  patient's own entry or confirmation. It is not verification by a clinician,
  and no endpoint can produce `verified_by_authorized_clinician`.
- Sending the current values unchanged is recorded as a version with empty
  `changedFields`, because it documents that the patient reviewed the record.
- `changedFields` lists names only: `prescriptionDate`, `prescriberName`,
  `medications.<row>.<field>`, `medications.<row>.added`,
  `medications.<row>.removed` (rows compared by position). The audit event holds
  the version numbers and these names, never values.
- **Confidence (resolves E5, needs confirmation).** A row whose text is
  unchanged keeps its previous confidence. A row the patient edited or added
  gets 1, meaning "stated by a person", not "read with certainty".
  `verificationStatus`, not confidence, says how far the data can be trusted.
- Once a patient-entered version exists, `process` returns 409, so automatic
  extraction can never become the latest version over what the patient entered.
  Corrections are refused with 409 while a (non-stale) extraction run is active.
  Corrections for one record are serialized with a row lock.

J2. **PDF.** Owner patient only; providers are refused even with a consent. A
file download, not a `{ data }` response, with `Content-Type: application/pdf`,
`Content-Disposition: attachment; filename="healthhub-prescription-<8 hex>.pdf"`
(no personal data in the name), and `Cache-Control: private, no-store`. Returns
404 until a version exists. Each download writes a
`prescription.pdf_downloaded` audit event with the version number.
- Contents: HealthHub patient ID, prescription record ID, source label,
  verification status, version, prescriber, date, and the stored medication
  fields exactly as stored, plus a QR code. Every status has a visible warning
  (needs review, unverified, corrected by patient and not clinician-verified).
  Uncertain extracted rows are marked "NEEDS CHECKING". The document never
  composes a dosing instruction, and states it is not a prescription and the
  HealthHub ID is not an official national health ID.
- The PDF's QR contains `QR_LINK_BASE` + `prescription/<record id>` and nothing
  else. It does not expire, but it is not a credential: opening it still
  requires login and consent. Please confirm the link format with the web and
  mobile code (`QR_LINK_BASE`, default `healthhub://`).
- **Limitation:** only standard Latin-1 fonts are used, so other scripts
  (for example Devanagari) are printed as "?". Names and drug names in such
  scripts need an embedded font, which is not included.

J3. **QR sessions.** Created by the owning patient for one of their
prescriptions. Response: `{ id, prescriptionId, qrPayload, expiresAt, revokedAt,
createdAt }` where `qrPayload` is `QR_LINK_BASE` + `qr/<random id>`.
- **Lifetime:** `QR_SESSION_TTL_MINUTES`, default 15, allowed 1 to 60. Creation
  is rate-limited (`QR_RATE_LIMIT_MAX`, default 30 per window per IP).
- **Reading:** any logged-in user may try. The session id alone grants nothing.
  The reader must pass the normal consent check (owner, or provider with a live
  `prescriptions:read` consent), on every read. The response is only
  `{ session: { id, expiresAt }, prescription }`: the prescription as it is now
  (latest version, with its verification status), with no profile data. Admins
  are never allowed. Responses are `Cache-Control: private, no-store`.
- **Expiry and revocation:** an unknown, expired, or revoked session returns the
  same 404, so they cannot be told apart. Revoking a consent ends provider
  access through every session at once (the consent is checked on each read).
- **Audit:** `qr.session_created`, `qr.session_revoked`, and, for provider reads,
  `access.granted` or `access.denied` with resource type `qr_session`.
- **Open product question:** a QR scan does NOT create access by itself. A
  provider still needs a consent. If you want "showing the QR" to be the
  patient's consent for that provider, that is a different model and needs a
  decision before it is built.

J4. **Access history** now also lists `prescription.corrected`,
`qr.session_created`, and `qr.session_revoked`, and may show `versionNumber`
in `details`. This extends G7.

J5. **Request logging changed.** Logs now record the route pattern
(`/api/v1/qr/access-sessions/:sessionId`) instead of the real URL. Record ids,
session ids, and query strings never appear in logs. I made this change after a
live check showed QR session ids in the request log.

J6. **Contract additions needing confirmation:** `DELETE
/qr/access-sessions/:sessionId`, because the contract requires explicit
revocation behavior but lists no endpoint for it (see also F2 for dev-login).

J7. **Known gaps.** Expired sessions are not deleted (a cleanup job is not
built). A version-number collision between simultaneous corrections is mapped
to 409 as a safeguard, but with the row lock in place it cannot be triggered, so
that mapping is untested. The simultaneous-corrections test does not truly
overlap in the database; the lock itself is verified separately by a test that
holds a conflicting lock.

## K. Medication schedules and dose events (Milestone 8)

Endpoints: `GET /medication-schedules`, `POST /medication-schedules`,
`PATCH /medication-schedules/:scheduleId`,
`POST /medication-schedules/:scheduleId/dose-events`. Patients only: providers
and admins are refused, even with a `medication_schedules:read` consent (that
scope exists but no endpoint uses it yet). The contract defines no fields, so
everything below is my choice and needs confirmation. Not built: the contract's
two health-history endpoints (see K8).

K1. **What a schedule is.** A reminder plan the patient makes from ONE medication
row of a prescription. The row's text (name, strength, dose, route, frequency,
duration, instructions) is copied and can never be edited on the schedule.
Changing a dose means correcting the prescription and making a new schedule. The
system never composes or derives a dosing instruction; it shows the record's own
words plus the patient's reminder choices. Every schedule carries a `notice`
saying it is a reminder plan, not medical advice.

K2. **Create** (`POST`, 201). Body: `{ prescriptionId, versionNumber,
medicationPosition, startDate, endDate?, reminderTimes?, remindersEnabled?,
timezone }`. It is refused with 409 unless ALL of these hold:
- the newest version has been reviewed by a person: `patient_corrected` or
  `verified_by_authorized_clinician`. `unverified` and `needs_review` are never
  enough, however confident the automatic reading;
- the row has a name, strength, dose, and frequency, each containing a letter or
  digit (so "???" does not count);
- the row's confidence is at least 0.85. For a patient-reviewed version that
  means the row was edited, added, confirmed, or read confidently and left alone;
- `versionNumber` is the newest version, so a patient can only schedule the row
  they actually saw (a stale version is refused);
- the medication does not already have an active schedule, and the patient has
  fewer than 50 active schedules. Changes are serialized per patient with a row
  lock.
Each refusal writes a `schedule.refused` audit event with a reason code
(`not_reviewed`, `incomplete`, `low_confidence`, `version_changed`, `no_version`)
and no medical content.

K3. **Change to Milestone 7 (corrections).** A medication row in a correction may
carry `confirmed: true`: "I checked this row against the original prescription".
It raises an unchanged row to confidence 1 and is recorded in `changedFields` as
`medications.<row>.confirmed`. Without it, an unreadable row the patient
re-submits unchanged would keep its low confidence and could never become
schedulable. This amends J1.

K4. **Input rules.** Dates are real dates; `startDate` from 30 days ago to 365
days ahead; `endDate` not before the start and within 10 years. `reminderTimes`
are local `HH:MM`, at most 12, de-duplicated and sorted. Reminders cannot be
enabled without at least one time. `timezone` must be an `Area/Location` IANA
name or UTC (canonicalised). Abbreviations such as IST (India, Israel, and
Ireland all use it) and legacy fixed-offset names such as EST are refused.

K5. **Update** (`PATCH`, 200). Only `reminderTimes`, `remindersEnabled`,
`timezone`, `endDate`, and `isActive` can change. Any other field, including any
medication text or `startDate`, is rejected with 400 even when sent alongside a
valid field. A request that changes nothing writes nothing. Updates write a
`schedule.updated` audit event with field names only. A stopped schedule can be
switched back on only if no other schedule is active for that medication and the
prescription still says what the schedule was made from. Someone else's schedule
returns 404.

K6. **When the prescription changes.** Each schedule reports `sourceStatus`:
`current`, `changed` (the medication differs now), or `removed`. An unrelated
edit (such as the prescriber) leaves it `current`. The schedule keeps showing the
text it was made from. `remindersActive` is the one flag clients should use to
decide whether to remind: it is true only when the schedule is active, reminders
are enabled, the source is `current`, and today (in the schedule's time zone) is
within its dates. The backend sends no notifications itself.

K7. **Dose events** (`POST .../dose-events`, 201). Body `{ scheduledFor, status }`
with `scheduledFor` an ISO instant with an offset and `status` `taken` or
`skipped`. They are self-reported and always labelled `selfReported: true`; nothing
treats them as verified. One event per schedule and time (a repeat returns 409),
and events cannot be edited or deleted (database trigger), so a mistaken entry
cannot be corrected yet. The time must fall inside the schedule's dates (in its
time zone) and no more than one hour in the future, and the schedule must be
active. The contract has no read endpoint for events, so each schedule includes
`recentDoseEvents` (last 14 days, at most 20). Dose events are not audited, to
avoid log noise; each carries its own timestamp.

K8. **Not built.** `GET /health-history` and `POST /health-history/conditions`
are in the contract but not in this milestone. A schedule for a medication taken
"as needed" gets no special handling: reminders are only what the patient sets.

K9. **Logging note.** Error log lines show the route pattern without the
`/api/v1` prefix (for example `/:scheduleId`), because the router has already
unwound by then. No ids or content appear either way.

## L. Hospitals, appointments, health history, refresh, demo seed (Milestones 9 and 10)

L1. **`POST /auth/refresh` (amends A3).** Now implemented, because the contract lists
it. There is no separate refresh token. A still-valid access token is exchanged for a
fresh one: the old session is revoked in the same step (so a token refreshes once), the
role is re-read from the database, and a deactivated user cannot refresh. Every
refreshed session keeps the ORIGINAL login time, and no token outlives
`SESSION_MAX_HOURS` (default 168, i.e. 7 days) from that login, so refreshing cannot
keep a login alive forever. No body is accepted. It shares the login rate limit.

L2. **Hospitals.** `GET /hospitals`, `GET /hospitals/:id`, and
`GET /hospitals/:id/availability` are open to any signed-in user. Only active hospitals
are visible; an admin can see inactive ones (`includeInactive=true`, which is 403 for
anyone else). Filters: `q` (name contains), `city` (equals, any case), `specialty`
(exact). `isDemo` is part of every hospital so clients can label demo data.
Admin routes (`POST /admin/hospitals`, `PATCH /admin/hospitals/:id`,
`POST /admin/hospitals/:id/deactivate`) are admin-only and audited with field names
only. A client can never set `isDemo` (admin-created hospitals are never demo) and an
admin has no access to any medical record. Deactivating stops new bookings and hides the
hospital from non-admins, but does NOT cancel existing appointments. `PATCH` accepts
`isActive` so a hospital can be reactivated (the contract has no activate endpoint).

L3. **Availability.** The contract has no slot-creation endpoint, so slots exist only
through the seed (the spec says "seeded slots"). The listing shows upcoming slots only,
each as `open` or `booked`, never who booked it. Default window is the next 14 days,
at most 31 days per request, paged.

L4. **Appointments** (patients only). `POST /appointments` takes only `{ slotId }`. The
patient comes from the session; status, price, and availability are never read from the
client. Whether a slot is free is NOT checked and then acted on: the insert claims the
slot through a unique database column, and a violation returns 409 ("no longer
available"), so simultaneous bookings cannot both succeed. Also refused with 409: past
slots, deactivated hospitals, a second appointment overlapping one the patient already
has (back-to-back is fine), and more than 10 upcoming appointments (my limits).
`GET /appointments` (own only, optional `status`) and `POST /appointments/:id/cancel`
(frees the slot; repeating it changes nothing; past appointments cannot be cancelled;
someone else's appointment is a 404). Appointments are the patient's own and are not
visible to admins or providers.

L5. **Health history.** `POST /health-history/conditions` (patient only) adds an entry
`{ title, notes?, diagnosedOn? }`, always stored as `source: patient_reported` and
`verificationStatus: unverified`. Entries cannot be edited or deleted (database trigger;
the contract has no endpoint for it, so a mistaken entry cannot be corrected yet) and a
patient is limited to 200. `GET /health-history` returns the owner's entries; a
provider must pass `?patientId=` and hold a live `health_history:read` consent
(checked and audited on every read). Admins never.

L6. **Demo seed** (`npm run seed:demo`). Needs `DEMO_SEED_PASSWORD` (12+ characters) and
refuses `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`. It creates four accounts at
`@demo.healthhub.test` (admin, provider, patient1, patient2, all sharing that password),
three hospitals flagged `isDemo` and named "(demo data)", 14 days of slots, two synthetic
prescriptions (patient1 `unverified`, patient2 `needs_review`) made through the real
upload and extraction code, a demo consent from patient1 to the provider, and one history
entry. It is idempotent, never edits or removes existing data, and every fictional name is
labelled "(synthetic)" or "(demo data)".

L7. **Not built, on purpose.** Payments (`POST /payment-orders`,
`POST /payments/webhooks/:provider`): the contract says they are not required for the core
MVP, and no wallet or payment flow was to be built. External OCR/AI (Gemini) stays
disabled.
