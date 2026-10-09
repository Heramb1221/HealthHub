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
