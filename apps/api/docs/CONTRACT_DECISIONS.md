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
