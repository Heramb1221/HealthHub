# Web vs backend vs mobile: contract divergences (for the integrator)

Compared on 2026-10-13: `apps/web/src/lib/api/types.ts` (main), backend note `apps/api/docs/CONTRACT_DECISIONS.md` sections A-I
(main), and `apps/mobile/src/api/types.ts`. Mobile follows the backend wherever the backend has decided. The web app's types were
written before the backend existed and are marked ASSUMED in its own source. Nothing here changes a file outside `apps/mobile`;
the web owner decides the fixes.

## Will fail against the implemented backend (web)
| Area | Web assumes | Backend implements |
|---|---|---|
| Upload (H1) | Sends `prescriptionDate`, `prescriberName` with the file | **Rejects** any field other than the `file` part and optional `sourceType` (400). Dates/prescriber come only from extraction or a later correction |
| Register (B1/F1) | Body `{fullName, email, password}` | Body `{email, password}` only; unknown fields are rejected. Name is set later via `PATCH /patients/me` |
| Lists (B2) | `{ items }` | `{ data: [...], page: { limit, nextCursor } }` |
| Profile (G2) | `conditions`, `email`, `emergencyContact.relationship`, non-null `fullName`, `displayName`, role `staff` | `existingConditions`; no email in the patient object; emergency contact is `{name, phone}` only; `fullName` is nullable until set; roles are `patient\|admin\|provider` |
| Health card (G6) | `{healthId, fullName, issuedAt, qr:{reference,url}}` | `{healthId, fullName, dateOfBirth, bloodGroup, issuer, notice, generatedAt}`. QR is a separate session (`POST /qr/access-sessions`), not part of the card |

## Not yet implemented on the backend; web and mobile disagree (needs one decision)
| Area | Web | Mobile (follows the Prisma schema + backend notes B3/B4) |
|---|---|---|
| Schedule fields | `times[]`, `active`, `strength`, `doseEvents[]` | `reminderTimes[]`, `remindersEnabled`, `isActive` (schema names) |
| Create schedule | `{prescriptionId, medicationIndex, medicationName, confirmedAgainstPaper, times, startDate, endDate}` | `{prescriptionId, medicationIndex, startDate, timezone}`; server derives name/dose/frequency |
| Hospital flag | `active` | `isActive` (schema) |
| Appointment status | `booked\|cancelled\|completed` | `confirmed\|cancelled` (schema) |
| Book appointment | `{hospitalId, slotId}` | `{slotId}` only (B3: the server derives the hospital) |
| Slots | no `status` | `status: open\|booked` (B3) |
| History entry | `{kind: condition\|prescription, description, occurredOn, source: patient_reported\|prescription_scan, relatedPrescriptionId}` | `{title, kind?, notes?, recordedAt?, source?, verificationStatus?}` |
| Add condition | `{name, diagnosedOn, notes}` | `{name, notes?}` |
| Dose event | `{id, scheduleId, scheduledFor, status, recordedAt}` | request `{scheduledFor, status}` (B4); response fields not defined |

## One idea worth deciding on
Web's schedule creation sends `confirmedAgainstPaper: true` (the patient attests they checked the medicine against the paper
prescription). That is a sensible safety step that mobile does not have. If adopted, it must be a contract field the server checks and
records, and mobile would add the same confirmation. Mobile has not adopted it unilaterally because it would change a request body.

## Suggested path
Pick the backend notes plus the Prisma schema as the single source of truth, then have web and mobile conform. Once Milestones 7-9
land on the backend, mobile will update its types in one commit. A shared `packages/contracts` (README stack list) would prevent this.
