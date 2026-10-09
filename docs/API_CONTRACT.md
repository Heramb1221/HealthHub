# HealthHub API Contract

Version: 0.1
Base path: `/api/v1`
Format: JSON unless a multipart upload is explicitly specified.
Date/time: ISO 8601 timestamps with timezone; persist instants in UTC.
IDs: UUIDs in APIs; `healthId` is a separate display identifier.

## Response conventions
Success: return the resource or `{ "data": resource }` consistently across the project.
Error:
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request could not be validated",
    "requestId": "..."
  }
}
Never return stack traces, database details, secrets, or sensitive patient details in errors.

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh` only if refresh-token rotation is implemented
For local demo, clearly label any development-only login shortcut. Never present a mock OTP as production verification.

## Patient
- `GET /patients/me`
- `PATCH /patients/me`
- `GET /patients/me/health-card`
- `GET /patients/me/access-history`

## Consent
- `GET /consents`
- `POST /consents` body: `{ granteeUserId, resourceScope, purpose, expiresAt? }`
- `DELETE /consents/:consentId` revokes future access
Do not allow clients to grant permissions for a patient unless the authenticated actor is authorized to do so.

## Prescriptions
- `POST /prescriptions` multipart file upload plus metadata
- `GET /prescriptions`
- `GET /prescriptions/:prescriptionId`
- `GET /prescriptions/:prescriptionId/versions`
- `POST /prescriptions/:prescriptionId/process`
- `PATCH /prescriptions/:prescriptionId/extracted-fields` for patient corrections with audit/versioning
- `GET /prescriptions/:prescriptionId/pdf`
- `GET /prescriptions/:prescriptionId/latest` returns latest authorized version for that prescription record
File upload responses should return processing status and resource ID, not expose public storage URLs.

## QR access
- `POST /qr/access-sessions` create a short-lived scoped access session after policy/consent checks
- `GET /qr/access-sessions/:sessionId` return only permitted information
The QR contains a random reference/URL, not medical data or a long-lived bearer secret. Expiry, revocation, and audit behavior must be explicit.

## Medication and history
- `GET /medication-schedules`
- `POST /medication-schedules`
- `PATCH /medication-schedules/:scheduleId`
- `POST /medication-schedules/:scheduleId/dose-events`
- `GET /health-history`
- `POST /health-history/conditions`

## Hospitals and appointments
- `GET /hospitals`
- `GET /hospitals/:hospitalId`
- `POST /admin/hospitals`
- `PATCH /admin/hospitals/:hospitalId`
- `POST /admin/hospitals/:hospitalId/deactivate`
- `GET /hospitals/:hospitalId/availability`
- `POST /appointments`
- `GET /appointments`
- `POST /appointments/:appointmentId/cancel`
Appointment creation must validate server-side availability and use a transaction/constraint to prevent double booking.

## Payments
Payment routes are not required for the core MVP. If a sandbox is added:
- `POST /payment-orders`
- `POST /payments/webhooks/:provider`
Verify provider signatures and idempotency. Never trust client-submitted payment status or amount.

## Prescription object minimum fields
{
  "id": "uuid",
  "patientId": "uuid",
  "sourceType": "uploaded_physical",
  "processingStatus": "pending|processing|completed|failed",
  "verificationStatus": "unverified|needs_review|patient_corrected|verified_by_authorized_clinician",
  "prescriptionDate": "ISO-8601|null",
  "prescriberName": "string|null",
  "medications": [
    {
      "name": "string|null",
      "strength": "string|null",
      "dose": "string|null",
      "route": "string|null",
      "frequency": "string|null",
      "duration": "string|null",
      "instructions": "string|null",
      "confidence": 0.0
    }
  ],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}

## Change control
Any breaking contract change must update this file, backend implementation, web client, mobile client, and contract/integration tests in the same PR or coordinated set of PRs.
