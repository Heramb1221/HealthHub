# Mobile contract assumptions (decision note)

Status: proposal from the mobile workstream. Owner of final decisions: integrator.
Applies to `docs/API_CONTRACT.md` v0.1 and `apps/api/docs/CONTRACT_DECISIONS.md` (branch `feat/api-core`).

The backend has no auth, patient, prescription, schedule, history, QR, hospital or appointment routes yet
(only `/health`), so nothing below could be tested against a real server. The mobile types in
`src/api/types.ts` are tagged by provenance. This note lists every shape that is **not** written in the
contract or approved in backend section A. Each needs a yes/no from backend/integrator before integration.
Until then the client renders only what the server sends and never invents values.

## Used as written (no question)
- Success envelope `{ "data": ... }` and error envelope `{ error: { code, message, requestId } }` (A1). Bare resources are also accepted.
- Error codes (A2): drive friendly messages (`CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `PROVIDER_DISABLED`, `RATE_LIMITED`, ...).
- Email + password, short-lived access token, no refresh, no OTP (A3). Roles `patient|admin|provider` (A4); the app only serves `patient`.
- Prescription object minimum fields and status enums (contract).

## Proposed backend items the client already depends on (section B, unapproved)
| ID | Assumption | Screen |
|---|---|---|
| B1 | `POST /auth/register|login` body `{email,password}` → `{data:{user:{id,email,role},accessToken,expiresAt}}`; `Authorization: Bearer`; `POST /auth/logout` revokes server-side | Sign-in/up, sign-out |
| B2 | Lists: `{data:[...], page:{limit,nextCursor}}`, `?cursor=` | all lists |
| B3 | Slots `{id,startsAt,endsAt,status:'open'|'booked'}`; `POST /appointments {slotId}` | Hospitals |
| B4 | `POST .../dose-events {scheduledFor,status:'taken'|'skipped'}` | Medicines |
| B5 | `POST /qr/access-sessions {prescriptionId}` → random reference + expiry; `GET` returns permitted data only | Health card |

## New mobile assumptions (ASSUMED, please confirm or replace)
1. **Patient/profile fields** follow the Prisma `Patient` model (`fullName, dateOfBirth, gender, bloodGroup, phone, emergencyContact*, allergies[], existingConditions[], currentMedications[], address, healthId`). `PATCH /patients/me` takes a partial of the editable ones, with blank strings sent as `null`; `dateOfBirth` is sent as `YYYY-MM-DD`.
2. **`GET /patients/me/health-card`** returns identity/emergency fields only (`healthId, fullName, dateOfBirth, gender, bloodGroup, emergencyContact*, allergies`) and optionally `demo: true`.
3. **`GET /patients/me/access-history`** returns items shaped like `AuditEvent` (`id, occurredAt, action, outcome, resourceType`), with no medical values.
4. **Upload**: `POST /prescriptions` multipart with a single part named `file`; no extra metadata; the response is the prescription object (`id`, `processingStatus`).
5. **`POST /prescriptions/:id/process`** (re)starts reading and returns the prescription. The app offers it only when status is `pending` or `failed`. If the server already auto-processes on upload, the button is harmless. `PROVIDER_DISABLED` (503) is shown as "automatic reading is turned off; enter details yourself".
6. **`GET /prescriptions/:id/versions`** returns items with `id, versionNumber, kind ('extraction'|'patient_correction'), verificationStatus, changedFields[], createdAt` (names only).
7. **`PATCH /prescriptions/:id/extracted-fields`** body `{prescriptionDate|null, prescriberName|null, medications:[{name,strength,dose,route,frequency,duration,instructions}]}` replaces the extracted fields as a new version and returns the prescription. **The client sends no `confidence`** (backend note E5 applies); the server sets verification to `patient_corrected`.
8. **`GET /prescriptions/:id/pdf`** returns `application/pdf` with the bearer header (never a token in the URL).
9. **Medication schedules** follow the PROVISIONAL `MedicationSchedule` model (`medicationName, dose, frequency, startDate, endDate, reminderTimes ["HH:mm"], remindersEnabled, timezone, isActive`).
   - `POST /medication-schedules` body `{prescriptionId, medicationIndex, startDate, timezone}`. The **server** must derive name/dose/frequency from the latest stored version and refuse incomplete or ambiguous medications. The client never sends dose text. The client-side gate (`src/lib/safety.ts`, confidence ≥ 0.85 and name/strength/dose/frequency present, shared with web) is UX only.
   - `PATCH /medication-schedules/:id` body `{remindersEnabled?, reminderTimes?, isActive?}`.
   - There is no `GET` for past dose events, so "taken/skipped" is shown only for the current session, after the server accepts the POST.
10. **Health history**: `GET /health-history` items `{id, title, kind?, notes?, recordedAt?, source?, verificationStatus?}`; `POST /health-history/conditions {name, notes?}`. `source` values seen as `patient_reported|prescription|clinician`; unknown values are shown as-is.
11. **QR**: session response includes `id`, `expiresAt`, and optionally `url` or `reference`. The QR encodes `url ?? reference ?? id` (a random reference, never medical data). `GET /qr/access-sessions/:id` for the owner returns status and optionally `prescription.medications`; expired/revoked → 404.
12. **Hospitals** follow the PROVISIONAL `Hospital` model (`name, address, city, phone, specialties[], isActive, isDemo`). Inactive hospitals are hidden client-side too.
13. **Appointments**: `GET /appointments` items include `id, slotId, status ('confirmed'|'cancelled')` plus start time and hospital name either embedded (`slot.startsAt`, `hospital.name`) or flat (`startsAt`, `hospitalName`). `POST /appointments/:id/cancel` returns the updated appointment. A `CONFLICT` on booking is shown as "slot just taken".
14. **Contract gap D1**: the backend's development-only login shortcut is intentionally **not** used by mobile. The app has no demo/mock mode and fakes no success.

## Not built (outside the mobile prompt or blocked)
- Server-delivered push notifications (only a labelled local-reminder prototype exists).
- Original-file preview (the contract has no endpoint that returns the original upload).
- Consent management screens, QR scanning for providers, payments.
