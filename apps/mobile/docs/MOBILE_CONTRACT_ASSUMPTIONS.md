# Mobile contract assumptions (decision note)

Status: proposal from the mobile workstream. Owner of final decisions: integrator.
Applies to `docs/API_CONTRACT.md` v0.1 and `apps/api/docs/CONTRACT_DECISIONS.md` (branch `feat/api-core`).

This note was started when the backend had no routes; the sections below record what has since been confirmed. Nothing has been tested against a real server. The mobile types in
`src/api/types.ts` are tagged by provenance. This note lists every shape that is **not** written in the
contract or approved in backend section A. Each needs a yes/no from backend/integrator before integration.
Until then the client renders only what the server sends and never invents values.

## Reconciliation with backend sections F-I (2026-10-13)

`main` now contains the implemented backend for auth, patients, consents and prescription upload/read/process/versions,
documented in `apps/api/docs/CONTRACT_DECISIONS.md` sections F-I. The backend marks those shapes "needs confirmation" by the
integrator, so they are treated as the working contract. Mobile was updated to match.

| Area | Status | Mobile change |
|---|---|---|
| Auth (F1), pagination (B2) | Matches | none |
| Profile object (G2/G3) | **Differed** | Emergency contact is nested `emergencyContact {name, phone}`; gender and blood group are enums (chips); phone, date-of-birth (1900..today) and list-size rules mirrored for fast feedback |
| Health card (G6) | **Differed** | Identity only (`healthId, fullName, dateOfBirth, bloodGroup, issuer, notice, generatedAt`). Removed allergies/emergency contact from the card (showing "None listed" would have implied there are none); shows the server's `notice` |
| Access history (G7) | Extended | Plain-language lines from `action`/`actor`/`details`; ids are never shown |
| Upload (H1-H3) | Matches (`file` part, 201 pending) | iOS photos requested in a compatible (JPEG) form because only JPEG/PNG/WebP/PDF are accepted |
| Process (I4/I5) | **Differed** | The call is synchronous (up to 30 s), so the client timeout for it is 45 s. `completed` records return 409 (already read) |
| Versions (I8) | Superset of what mobile reads | none |
| Consents (F3) | Matches (`{data, page}`, `DELETE` returns the consent with `revokedAt`) | New Sharing and access screen: list, revoke. Creating a consent is not offered (needs a provider user id the patient cannot know) |
| `/latest` (I6/I7) | Not used by mobile | none |

## Reconciliation with backend sections J-L (2026-10-16)

`main` now also implements corrections, PDF, QR sessions, schedules and dose events, hospitals, availability, appointments and
health history (`CONTRACT_DECISIONS.md` J-L). Mobile was changed to match; the demo server follows the same rules and the
shapes are covered by `tests/demo.test.ts`. Mobile has still **not been run against the real server**.

| Area | Mobile change |
|---|---|
| Correction (J1, K3) | Body is `{baseVersionNumber, prescriptionDate?, prescriberName?, medications?}` with a per-row `confirmed` flag ("I checked this against my paper prescription"). The response is the NEW version, so the screen re-reads the record. `baseVersionNumber` comes from `GET /prescriptions/:id/latest` (404 = 0). A 409 reloads and tells the patient it changed |
| Schedule create (K2) | Body is `{prescriptionId, versionNumber, medicationPosition, startDate, timezone}`. The UI offers it only for a version reviewed by a person (`patient_corrected` or clinician) whose row is complete and >= 0.85, and explains what to do otherwise; the server still decides |
| Schedule read (K1, K6, K7) | Medication text is shown as a copy with its source version and the server `notice`; `sourceStatus` != `current` shows a warning; reminders (including local ones) use only `remindersActive`; `recentDoseEvents` replaces session-only dose state; stop/resume via `isActive` |
| QR (J3, J6) | The code encodes `qrPayload` (random link). Owner can look it up, and turn it off (`DELETE`). The UI says a scan alone grants no access (a provider still needs consent) |
| History (L5) | `{title, notes?, diagnosedOn?}`; entries are `patient_reported`/`unverified` and cannot be edited or removed, which the form says before saving |
| Hospitals / appointments (L2-L4) | Flat appointment shape (`hospital {id,name,isDemo}`, `startsAt`, `endsAt`, `cancelledAt`); `isDemo` shown as demo data; overlaps, past slots and the 10-appointment cap come back as 409 messages |
| Access history (J4) | Plain-language lines for `qr.session_created`, `qr.session_revoked`, `prescription.corrected`, `prescription.pdf_downloaded` |
| PDF (J2) | Unchanged (bearer header, file deleted from cache after sharing). Latin-1 only on the server: other scripts print as "?" |

Differences from the Milestone-10 prompt that was attached on 2026-10-15, and why:
- **`GET /auth/me` is not used**: the backend has no such route. A stored token is trusted until the first request; a 401 clears it.
- **Register has no `fullName`**: the backend body is strictly `{email, password}`. The name is entered in Profile.
- **Google / Apple sign-in** is not implemented for live mode (the backend has no OAuth). In demo mode only, "Continue with Google/Apple (demo sandbox)" buttons sign in as a made-up person through the in-app demo API and are labelled as such. There is no demo-admin shortcut: the app serves patients only (admins are told to use the website).
- Demo credentials (`demo.patient@healthhub.test`) are synthetic and apply to the in-app demo server only.

Open points for the integrator: `POST /auth/dev-login` (F2) is deliberately not used by mobile; `latest` returns the newest
version regardless of verification (I7); `POST /auth/refresh` (L1) exists and mobile now calls it 2 minutes before expiry (a 401 or the 7-day limit ends the session; network errors retry until expiry).

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
1. *(Superseded by backend G2/G3, see above.)* **Patient/profile fields** follow the Prisma `Patient` model (`fullName, dateOfBirth, gender, bloodGroup, phone, emergencyContact*, allergies[], existingConditions[], currentMedications[], address, healthId`). `PATCH /patients/me` takes a partial of the editable ones, with blank strings sent as `null`; `dateOfBirth` is sent as `YYYY-MM-DD`.
2. *(Superseded by backend G6.)* **`GET /patients/me/health-card`** returns identity/emergency fields only (`healthId, fullName, dateOfBirth, gender, bloodGroup, emergencyContact*, allergies`) and optionally `demo: true`.
3. *(Superseded by backend G7.)* **`GET /patients/me/access-history`** returns items shaped like `AuditEvent` (`id, occurredAt, action, outcome, resourceType`), with no medical values.
4. *(Confirmed by backend H1.)* **Upload**: `POST /prescriptions` multipart with a single part named `file`; no extra metadata; the response is the prescription object (`id`, `processingStatus`).
5. *(Confirmed, with changes, by backend I1-I5.)* **`POST /prescriptions/:id/process`** (re)starts reading and returns the prescription. The app offers it only when status is `pending` or `failed`. If the server already auto-processes on upload, the button is harmless. `PROVIDER_DISABLED` (503) is shown as "automatic reading is turned off; enter details yourself".
6. *(Confirmed by backend I8.)* **`GET /prescriptions/:id/versions`** returns items with `id, versionNumber, kind ('extraction'|'patient_correction'), verificationStatus, changedFields[], createdAt` (names only).
7. *(Superseded by backend J1/K3, see above.)* **`PATCH /prescriptions/:id/extracted-fields`** body `{prescriptionDate|null, prescriberName|null, medications:[{name,strength,dose,route,frequency,duration,instructions}]}` replaces the extracted fields as a new version and returns the prescription. **The client sends no `confidence`** (backend note E5 applies); the server sets verification to `patient_corrected`.
8. *(Confirmed by backend J2.)* **`GET /prescriptions/:id/pdf`** returns `application/pdf` with the bearer header (never a token in the URL).
9. *(Superseded by backend K, see above.)* **Medication schedules** follow the PROVISIONAL `MedicationSchedule` model (`medicationName, dose, frequency, startDate, endDate, reminderTimes ["HH:mm"], remindersEnabled, timezone, isActive`).
   - `POST /medication-schedules` body `{prescriptionId, medicationIndex, startDate, timezone}`. The **server** must derive name/dose/frequency from the latest stored version and refuse incomplete or ambiguous medications. The client never sends dose text. The client-side gate (`src/lib/safety.ts`, confidence ≥ 0.85 and name/strength/dose/frequency present, shared with web) is UX only.
   - `PATCH /medication-schedules/:id` body `{remindersEnabled?, reminderTimes?, isActive?}`.
   - There is no `GET` for past dose events, so "taken/skipped" is shown only for the current session, after the server accepts the POST.
10. *(Superseded by backend L5.)* **Health history**: `GET /health-history` items `{id, title, kind?, notes?, recordedAt?, source?, verificationStatus?}`; `POST /health-history/conditions {name, notes?}`. `source` values seen as `patient_reported|prescription|clinician`; unknown values are shown as-is.
11. *(Superseded by backend J3.)* **QR**: session response includes `id`, `expiresAt`, and optionally `url` or `reference`. The QR encodes `url ?? reference ?? id` (a random reference, never medical data). `GET /qr/access-sessions/:id` for the owner returns status and optionally `prescription.medications`; expired/revoked → 404.
12. *(Confirmed by backend L2.)* **Hospitals** follow the PROVISIONAL `Hospital` model (`name, address, city, phone, specialties[], isActive, isDemo`). Inactive hospitals are hidden client-side too.
13. *(Superseded by backend L4.)* **Appointments**: `GET /appointments` items include `id, slotId, status ('confirmed'|'cancelled')` plus start time and hospital name either embedded (`slot.startsAt`, `hospital.name`) or flat (`startsAt`, `hospitalName`). `POST /appointments/:id/cancel` returns the updated appointment. A `CONFLICT` on booking is shown as "slot just taken".
14. **Contract gap D1**: the backend's development-only login shortcut is intentionally **not** used by mobile. Demo mode is a separate, labelled in-app API (see README); neither mode fakes a success.

## Not built (outside the mobile prompt or blocked)
- Server-delivered push notifications (only a labelled local-reminder prototype exists).
- Original-file preview (the contract has no endpoint that returns the original upload).
- Granting a consent (the patient has no way to look up a provider's user id), QR scanning for providers, payments.
