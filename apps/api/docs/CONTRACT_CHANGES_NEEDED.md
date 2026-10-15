# What the integrator needs to change in `docs/API_CONTRACT.md`

The backend implements 35 of the contract's 38 endpoints, plus the additions below.
This list is everything that differs from, or is not defined by, the current contract.
Section references are to `CONTRACT_DECISIONS.md` in this folder.

## Endpoints to add to the contract
| Endpoint | Why | Section |
|---|---|---|
| `POST /auth/dev-login` | Development-only login for demo accounts; exists only when `DEV_AUTH_ENABLED=true`, never in production | F2 |
| `DELETE /qr/access-sessions/:sessionId` | The contract requires explicit QR revocation but lists no endpoint | J6 |
| `GET /health` | Liveness plus database check (not a contract endpoint) | M1/M2 |

## Endpoints in the contract that are not implemented
| Endpoint | Reason |
|---|---|
| `POST /payment-orders` | Contract: "not required for the core MVP"; no wallet or payments by design (L7) |
| `POST /payments/webhooks/:provider` | Same |

## Conventions the contract should state (all endpoints)
- Success is always `{ "data": ... }`; lists are `{ "data": [...], "page": { "limit", "nextCursor" } }` (A1, B2).
- Errors are `{ "error": { "code", "message", "requestId" } }` with the fixed code list in A2. Validation errors carry no field detail (F7).
- Timestamps are ISO 8601 UTC; dates are `YYYY-MM-DD`.
- Every response has `X-Request-Id`. Sensitive responses are `Cache-Control: private, no-store`.

## Object shapes the contract leaves undefined (defined in the note, need confirming)
| Object | Section |
|---|---|
| Auth responses, refresh semantics | F1, L1 |
| Consent | F3 |
| Patient profile, health card, access history | G |
| Prescription upload, record, versions, latest | H, I |
| Correction body (`baseVersionNumber`, `confirmed`), PDF, QR session | J, K3 |
| Medication schedule, dose event | K |
| Hospital, availability slot, appointment | L |
| Health history entry | L5 |

## Decisions still open (each is the backend's choice, awaiting yours)
1. **QR scan grants no access by itself** (J3): a provider still needs a consent.
2. **"Latest authorized version"** is the newest version, always labelled with its status (I7).
3. **Confidence for patient-entered rows** is 1 = "stated by a person" (J1, K3).
4. **Registration reveals existing emails** (F5).
5. **History entries and dose events cannot be corrected or removed** once saved (K7, L5).
6. **Only patients can book appointments;** admins manage the directory but see no records (L2, L4).
