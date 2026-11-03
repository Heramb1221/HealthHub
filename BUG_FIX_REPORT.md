# Bug Fix Report — Sehat Meds (cumulative)

Status legend: PASS (implemented + verified by test/inspection), PARTIAL, BLOCKED (needs external config/devices), FAIL, NOT TESTED.

## Part 2 — Authentication, validation, branding

| ID | Reported problem | Root cause found | Fix | Status |
|---|---|---|---|---|
| A1 | Long passwords fail at sign-in | **Web** sign-in/sign-up use Clerk's prebuilt `<SignIn/>`/`<SignUp/>`, which pass passwords through untouched; no app code truncates or trims them. The app's own validators capped passwords at 128 (API login, API register, web sign-up form, mobile register). Any other limit is set in the Clerk dashboard / by Clerk. | Caps raised and made explicit: register 256, API login 1024 (hasher DoS bound only); mobile sign-in has **no** client-side length check; register max 256. | PASS for app code (tests). Clerk-side limits: BLOCKED (see Deployment guide) |
| A2 | Passwords with spaces fail | No code path rewrote spaces. Same as A1. Mobile previously trimmed email only. | Test proves leading/trailing/inner spaces reach Clerk and the API schemas exactly as typed. | PASS (code) |
| A3 | Names with spaces cause problems | No regex rejected spaces/Unicode. Mobile registration collected **no name at all**, so Clerk users had no first/last name and the API created patients with `fullName = null`. Name limits were inconsistent (web 100, API 120, contracts 150). | Mobile sign-up collects a full name, split into Clerk `firstName` + `lastName` without losing words ("Mary Anne van der Berg" → "Mary" / "Anne van der Berg"); Unicode accepted; limit unified at 120 across web/API/mobile. | PASS (tests) |
| A4 | Phone login missing | Not implemented anywhere (web or mobile). | **Mobile:** sign-in accepts email or phone (E.164 normalisation, India +91 default only for unambiguous 10-digit mobiles), password sign-in or SMS code (`phone_code` first factor), phone sign-up with SMS verification, resend with 30 s cooldown, expiry handling. **Web:** Clerk's prebuilt component shows phone automatically once enabled in the dashboard (no code change possible/needed). **API:** Clerk phone number is stored on the patient at first sync. | Mobile logic PASS against a fake Clerk client; live Clerk run BLOCKED (needs phone auth enabled + SMS provider) |
| A5 | Mobile app missing Clerk flow | Email/password Clerk flow existed, but (a) the access token was fetched **once** and never refreshed — Clerk session tokens are short-lived, so protected API calls would start returning 401 and sign the user out; (b) no name, phone, resend, second-factor or new-device (client trust) handling; (c) errors were generic. | HTTP layer now awaits an async token provider and asks Clerk for a fresh token per request (also for the PDF download headers); new `src/auth/clerkFlows.ts` handles sign-in/up/verify/resend/second factor with only SDK methods that exist in `@clerk/expo` 4.13 types; friendly error mapping; never reports a session unless Clerk says `complete`. | PASS (unit tests); device run NOT TESTED |
| A6 | Branding inconsistent | "Sehat Med" (~156 places), "Bharat ka apna Sathi", "HealthHub" in user-facing text, PDF header/footer, card faces, emails, e2e/test assertions, translation dictionary keys. | Case-sensitive sweep → "Sehat Meds", "Saathi", "SEHAT MEDS"; dictionary keys and values changed together. Lowercase identifiers left alone (bundle id `in.healthhub.mobile`, scheme `healthhub`, Expo slug, storage keys, demo email domain, DB setting `healthhub.allow_prescription_deletion`). | PASS (grep: 0 remaining variants in app source) |

### Side findings (not fixed yet, tracked)
- `apps/web/src/components/auth/auth-forms.tsx` (custom sign-in/up forms using the legacy `/auth/login` API) is **unused** by the Clerk pages; kept, not deleted.
- Mobile `AuthContext` hard-codes `role: "patient"` for Clerk users and a fixed 1 h `expiresAt` — revisit in Part 8/10.
- Demo health card issuer text "Sehat Meds · Ministry of Health & Family Welfare" implies a government affiliation — to be corrected in Part 5.

## Part 3 — Questionnaires and form interactions

### Reported: "submit button missing after the final questionnaire question"
There are two multi-step question flows. The symptom questionnaire (web) did render a final button, but it was hard to reach on phones:
- Footer was one non-wrapping row: "Previous" + a very long, non-wrapping label ("Complete Assessment & View Output"). Buttons here are `shrink-0 whitespace-nowrap`. At a 375 px viewport the card leaves ~290 px while the two buttons need ~380 px, so the primary button overflowed and was clipped off-screen. (Derived from the component's styles and widths; **not reproduced in a browser** — none available here.)
- The button was also silently disabled until an answer was chosen, with no hint why.

| ID | Finding | Fix | Status |
|---|---|---|---|
| F1 | Final-step footer overflowed on narrow screens | Footer stacks on small screens (`flex-col-reverse`, full-width buttons), label wraps and is shorter ("Submit & View Result"); hint text "Choose an answer to continue" (aria-live) | PASS (logic tests); visual check NOT TESTED |
| F2 | When the questions API failed, the web app **silently substituted three hard-coded questions** (including a red-flag screen) and carried on, hiding the failure and sending answers the server's rules didn't know | Removed. A visible error with the real reason and a retry path; nothing is assessed on invented questions | PASS (code review) |
| F3 | Assessment failure: toast only | Inline error too; answers kept so the user can retry; unanswered questions jump back to the first missing one | PASS (logic tests) |
| F4 | Age field accepted anything (server rejects >120) | Validated 0–120 whole number, inline `role=alert` error, `aria-invalid`; symptom notes limited to 1000 chars to match the API | PASS (tests) |
| F5 | Question change didn't move focus; options had no pressed state | Heading receives focus on each step; options `aria-pressed`; group labelled | PASS (code review) |
| F6 | Medication-setup wizard (web): footer pinned correctly, but header said "Step 3 of 3" for any number of medicines; used `92vh` (wrong on mobile browsers with a collapsing URL bar) | Correct step label; `92dvh`; footer wraps; tighter padding on phones | PASS (code review) |
| F7 | ~~Mobile medication-setup wizard keyboard/safe-area~~ **Correction (Part 4):** that component was not mounted anywhere (dead code) and contained the unsafe auto-confirm described in Part 4, so it was deleted instead. Mobile's real reminder flow (detail screen + Add Schedule, gated by `scheduleBlock`) was already review-gated. | Deleted `MedicationSetupWizard.tsx` | PASS (typecheck/lint) |
| F8 | Mobile symptom screen sent unvalidated age/duration (server 400, generic error) | Range validation with inline errors; duplicate-submit guard; reset restores age | PASS (tests) |

### Contract defects found during the form audit (live mode only — demo mode hid them)
| ID | Defect | Impact | Fix | Status |
|---|---|---|---|---|
| C1 | **Web booked appointments with `{hospitalId, slotId}`; the API schema is `strictObject({slotId})`** | Every live booking from the hospital page and the appointments page was rejected (400) | Web client sends `{slotId}` only; test pins both sides | PASS (unit test); live booking NOT TESTED (needs DB) |
| C2 | **Web "Add condition" sent `name`; the API requires `title` (strict)** | Adding a history entry always failed in live mode | Mapped to `title`; test pins both sides | PASS (unit test); live NOT TESTED |
| C3 | Insurance form checked only "not empty"; API needs 2/3-char minimums, real dates, length caps; no date-order rule; errors by toast only | Generic server errors, no field highlighted | Mirrored validator, inline errors, focus first error; API also rejects expiry before start | PASS (tests) |
| C4 | Family-member form: errors by toast only, no field state | Poor accessibility/feedback | Inline errors with `aria-invalid`, focus the first invalid field, duplicate-submit guard | PASS (code review) |

### Form audit coverage (what was reviewed)
Web (reviewed handler, validation, in-flight state, error handling): profile, history, family, insurance, hospital reviews, vaccinations (status + custom), symptom checker, medication wizard. Mobile: insurance, family, history, vaccinations, symptom checker, medication wizard, auth. Buttons in all of these disable while pending; error and success paths surface to the user.
**Not yet audited in this part** (covered by their own parts): prescription upload/correction (Part 4), add/edit schedule (Part 6), appointment payment (Part 7), admin hospital forms and profile payload mapping (Part 8), mobile Profile/Care/AddSchedule field-level validation (Part 10).

### Findings handed to later parts (not fixed in Part 3)
- **High / Part 4+6:** Both medication wizards, on finish, silently call the prescription "correct" endpoint with the *unchanged OCR values* and `confirmed: true`, swallowing errors — OCR output becomes "patient corrected" and drives schedules with no review. Must become an explicit review-and-confirm step.
- Mobile wizard hard-codes `baseVersionNumber: 1`.
- Web stores the access token in `localStorage` (`hh_token`) and prefers it over a fresh Clerk token when both exist (Part 8).
- Mobile symptom checker has no guided follow-up questionnaire (it submits once); parity with web is a Part 10 item.
- Web wizard "connect Google Calendar" fakes a connected account when the auth URL starts with `#` (demo path) — keep labelled as demo.


## Part 4 — Prescription scanning, OCR, persistence and PDF

Method: traced upload → storage → preprocessing → OCR → structured mapping → review → persistence → PDF, then reproduced each reported symptom with real tests against a real PostgreSQL 16 and the real OCR engine (synthetic prescriptions only).

| ID | Reported / found | Root cause (verified) | Fix | Status |
|---|---|---|---|---|
| P1 | **Doctor's name incorrect** | (a) The PDF printed a hard-coded fallback **"Dr. A. Kulkarni"** whenever no prescriber was stored, and the PDF route *always* passed a fake facility **"Apollo Multi-Specialty Hospital & Diagnostics"**. (b) The Gemini prompt never said who the "prescriber" is, so patient/clinic/pharmacy lines could be returned. | PDF prints only what was read or confirmed, otherwise "Not stated on the document"; no placeholder hospital. Gemini prompt now defines the prescriber precisely (never patient, clinic, pharmacist, registration number; null if unsure; transcribe exactly). New local parser only accepts names after "Dr." that are not the patient or an organisation, merges OCR spelling variants, and returns null rather than guess. | PASS (PDF tests, parser tests, real-OCR tests) |
| P2 | **Original prescription not visible** | (a) `/prescriptions/:id/file` crashed (Node `ERR_INVALID_CHAR`) for any file name outside Latin-1 (Hindi, Marathi, Chinese…) because the name was put raw in `Content-Disposition` — **reproduced**. (b) Web opened the file with `window.open` after an `await`, which browsers treat as a popup and block. (c) Mobile had no way to show the original at all. | RFC 6266 header helper (ASCII fallback + `filename*`); web shows the original **inline** (`OriginalDocument`) with loading/error/retry and a real-link "Open full size"; mobile shows it in a card (image inline; PDF via share sheet). API response now carries `sourceFile {mimeType, sizeBytes}` (deliberately **no file name**: names can contain personal details; tests pin that). | PASS (API e2e test, header tests); on-device/browser display NOT TESTED |
| P3 | **Corrected information not saved** | The website's correction request omitted `baseVersionNumber`, which the API's strict schema requires, so **every web save was rejected (400)**. On success the web also replaced its prescription with the API's *version* record (different id), breaking later actions. Wizards swallowed errors, so it looked like nothing happened. | Web client sends the version it edited (`/latest`, loaded when the form opens), `confirmed: true` per row when the patient ticked the confirmation, and re-reads the real prescription after saving. Conflicts (409) are refused, never silently overwritten. | PASS (e2e: persists after re-read, original extraction kept, file hash unchanged; stale/missing version rejected) |
| P4 | **Unreviewed OCR became reminders** | `processPrescription` created *active, reminder-enabled* schedules and a "Dr. …" history entry straight from raw OCR (guessing reminder times). Both web wizards then "verified" the prescription on the patient's behalf and told the schedule API `confirmedAgainstPaper: true`. | Removed automatic schedule/history creation and the guessing helpers; deleted `scripts/backfill_prescriptions.ts` (bulk-created schedules from unreviewed OCR; no longer compiled). Web wizard now requires a real review (blocking notice + "Review and correct details"; after processing the page opens the review form, not reminders). Removed the dead mobile wizard. **Side effect: 23 previously failing API tests now pass.** | PASS |
| P5 | "Prescription scanning needs improvement" | No preprocessing (rotation, contrast, resolution); no local reader; extraction depended entirely on one external provider; sending medical images to Google was the only option. | New `local` provider (Tesseract/WASM, nothing leaves the server) with `sharp` preprocessing (EXIF orientation, greyscale, contrast, up/down-scaling), sideways/upside-down recovery, per-line confidence, and a conservative rule-based parser (dosage forms, strength vs dose, `1-0-1` notation kept verbatim, durations, instructions, day-first dates). **Everything it produces is capped below the review threshold and so always needs patient review.** `local_then_gemini` is opt-in and calls Gemini only if local finds no medicines (handwriting, PDFs). Gemini API key moved from the URL to a header. | PASS on synthetic printed documents; **handwriting is not supported by the local reader** (routed to review/manual entry) |
| P6 | Duplicate submissions | A double-tap/retry created two records, two stored copies, two extractions. | Same patient + identical bytes within 2 minutes returns the existing record. Mobile also guards double-press and checks type/size before uploading (HEIC explained). | PASS |
| P7 | PDF presented a patient's photo as a "Clinical Prescription" with blank signature/stamp/diagnosis boxes | Misleading: implied an issued, signed document. | Uploaded prescriptions now say **"PRESCRIPTION COPY / digitized copy – not issued, signed or authenticated through Sehat Meds"**; blank signature/diagnosis boxes only for clinician-issued prescriptions. Verification wording (needs review / corrected by patient, not clinical verification) unchanged. | PASS (5 new PDF tests). QR content/behaviour: Part 5 |
| P8 | PDF filename `sehatmed-…` vs tests `healthhub-…` | Pre-existing drift | `sehatmeds-prescription-<id>.pdf` everywhere | PASS |

Provenance / audit already present and preserved: immutable original (SHA-256, DB trigger), extraction version kept when a patient correction is added, per-field `changedFields`, audit events.

### Known limits / open items from Part 4
- **Handwritten prescriptions are not read by the local reader** (they come back empty/low-confidence and need manual entry). `local_then_gemini` covers them only if you accept sending the image to Google.
- PDFs are not read by the local reader (needs a rasteriser); with `local` they fail visibly ("couldn't read"), with `local_then_gemini` they go to Gemini.
- English OCR data only (printed Devanagari text is not read; medicine names are usually Latin script).
- OCR accuracy numbers come from synthetic prescriptions I generated, not from real clinic documents.
- The medicine-name check is a transcription, not a drug database lookup: a misread name is possible and is why review is mandatory.


## Part 5 — Health card QR and prescription QR

Method: traced generation → payload → destination → resolution → authorization for both QR types, decoded real QR images with an independent decoder (`zbar`, plus `pdftoppm` for the PDF), and tested every resolution state against a real database.

**What each QR is (after the fixes)**
| QR | Encodes | Opens | Who can see data |
|---|---|---|---|
| Health card | `<QR_LINK_BASE>qr/<Health ID>` (no name, blood group, contact or any medical data) | `/qr/<id>` on the web (sign-in required) | The card holder, or a signed-in care provider (emergency summary only, audited, rate limited) |
| Share session (time-limited) | `<QR_LINK_BASE>qr/<random UUID>` | `/qr/<uuid>` | Existing consent model; expires (default 15 min) or revoked; every read audited |
| Prescription PDF | `<QR_LINK_BASE>prescription/<prescription id>` (opaque id) | `/prescription/<id>` → `/prescriptions/<id>` (sign-in + ownership/consent) | Owner, or provider with consent |

| ID | Found | Root cause (verified) | Fix | Status |
|---|---|---|---|---|
| Q1 | **Health card QR pointed to `http://localhost:3000/...`** on every deployed card | `getHealthCard` hard-coded the URL and the web card prefers the server value | Built from `QR_LINK_BASE`. Mobile uses a tested helper that never encodes localhost, a custom scheme or a mismatched id | PASS (API test, mobile tests, real scan) |
| Q2 | **Emergency screen never worked** | Web called `/qr/emergency/:id`; the API mounted it at `/qr/access-sessions/emergency/:id` (404), and the page fetched on the server with no credentials (API requires sign-in) | Route mounted at the path the web uses; new web resolver signs the visitor in with their own credentials, with clear states for signed-out, invalid/expired/revoked, forbidden, rate-limited, offline | PASS (8 API tests); browser flow NOT TESTED |
| Q3 | **Any signed-in user could read any patient's emergency data** (name, blood group, allergies, emergency contact) by Health ID: no ownership check, no audit, no rate limit | Missing authorization on the emergency endpoint | Patient may read only their own (anyone else gets the same "not found" as an unknown ID: no probing); providers get the small emergency summary with an audit entry (break-glass); other roles refused; 20 lookups/min/user | PASS |
| Q4 | Card claimed to be an **"Authorized National Digital Health Identity Card"**, demo issuer "Ministry of Health & Family Welfare", "Valid for medical triage & emergency clinical authentication" | False official claims | Issuer "Sehat Meds"; notice "not an official national health ID" on API, web card, demo data and mobile | PASS (test) |
| Q5 | Web card printed an invented support email/domain/toll-free number (`help@sehatmed.in`, `1800-11-4477`); mobile card encoded `https://sehatmed.in/qr/…` (a domain you may not own, so scans could be captured) | Placeholders shipped as real | Removed; unused mobile `DigitalHealthCard` (with these) deleted | PASS (inspection) |
| Q6 | **Mobile health card screen had no card QR at all** (the component that drew it was unused) | Dead code | Card QR added to the screen, with an explanation of what it holds | PASS (typecheck/lint/helper tests); on-device display NOT TESTED |
| Q7 | PDF/web link mismatch: PDF QR → `/prescription/<id>`, web page is `/prescriptions/<id>`; no route for `/qr/<session>`; no deep-link handling in the mobile app | Never wired | `/prescription/<id>` redirects (UUID-validated) to the protected page; `/qr/<uuid>` shows the shared prescription (digitized-copy notice, expiry); mobile deep links NOT implemented (needs https app links + domain files) | PASS (build); mobile deep links BLOCKED/not done |
| Q8 | Production could ship unusable QR codes silently | `QR_LINK_BASE` defaulted to `healthhub://` and nothing checked it | **API refuses to start in production unless `QR_LINK_BASE` is a public https address** | PASS (tests). **Action needed before deploying** |
| Q9 | Open redirect risk: `?next=` on sign-in/sign-up | Unvalidated | Same-site paths only (`safeNextPath`, tested) | PASS |
| Q10 | Medication list said every auto-read medicine was **"In Schedule"** | Stale after Part 4 stopped auto-scheduling | "Read automatically, N% sure, check against your paper prescription" / "Checked by you" | PASS |

Verified as already correct: prescription QR in a real PDF decodes to exactly the expected link (rasterized and scanned); share sessions expire, can be revoked, need consent, are audited and hold only an opaque id; QR sessions show the *current* record (new test: after a correction the QR shows the corrected values and "patient corrected"); another patient cannot read or mint a QR for your prescription.

**Behaviour to know about**
- The prescription QR shows the prescription's *current* state; it does not carry a version number, so a printed PDF can be older than the record. The PDF prints its own version number so a mismatch is visible. (Existing tests pin the payload format, so I did not add `?v=`.)
- Health IDs still start with `HH-` (kept for compatibility with existing cards/records).
- Emergency access by providers is "break-glass": no prior patient consent is required for the small emergency summary, only sign-in as a provider, and it is audited. If you want it opt-in per patient or consent-gated, that needs a product decision and a data-model change.
- The health-card API response keeps own-card phone, gender and emergency-contact fields because the card back prints them; clinical data and address are never included (test updated to say so).


## Part 6 — Medication timers and schedules

Method: read the schedule service, the review gate and dose log on the API; both clients' slot and reminder code; the mobile notification code; the Google Calendar sync; the dashboard. Reproduced behaviour with tests, including running web and mobile tests under four different machine time zones (UTC, Los Angeles, Auckland, Kolkata) to catch device-zone assumptions.

What was already right and kept: schedules are made only from reviewed, complete rows; a schedule records which prescription version it came from and flags itself when that changes (`remindersActive=false`); dose answers are a self-reported, append-only log; reminder times are stored as local "HH:MM" plus an IANA zone.

| ID | Found | Fix | Status |
|---|---|---|---|
| T1 | **Every client computed reminder times in the device's zone**, ignoring the schedule's own zone (web `slotsForDay`/`nextReminder`, mobile `nextReminder`, `localTimeToIso`). A schedule set in one zone recorded doses at the wrong instants on a phone in another; start/end dates were compared as instants. No defined behaviour at daylight-saving changes | One tested module (`zonedTime`, identical in api/web/mobile, drift-guarded by a test): wall-clock + zone → instant. Spring-forward gap → first valid moment (dose still happens); fall-back overlap → first occurrence. Start/end are calendar days in the schedule's zone | PASS (10 unit tests per platform incl. New York, London, Sydney transitions; suites pass under 4 machine zones) |
| T2 | **Mobile local reminders were a repeating daily notification** for the union of all times: never stopped at the end date or when a schedule was paused/stopped; ignored the schedule's zone; `cancelAllScheduledNotificationsAsync` wiped **every** notification the app owns | Rewritten: one-shot notification per upcoming dose (next ~14 days, capped under the OS limit of 64), stable ids, a diff that cancels only our stale ones and adds only missing ones, re-planned automatically whenever schedules change or the app opens. Edits, pauses, end dates and repeated syncs cannot leave duplicates or stale reminders | PASS (planner + diff tests); on-device delivery NOT TESTED |
| T3 | Lock-screen privacy: an unused second module (`deviceAlarms.ts`) put medicine name and dose in notifications and installed a conflicting global handler | Deleted. Notifications say "A dose is due" by default; names only if the patient opts in (setting persisted; data payload never carries names). Web browser alerts and calendar events follow the same rule | PASS |
| T4 | **Web "Device Alarms: On" promised alarms that never fired** (it only showed one test notification) | Alerts now really fire once per due dose, tagged so two tabs don't stack, while the page is open; copy says exactly that. Permission denied/unsupported/default states handled | PASS (logic tests); browser display NOT TESTED |
| T5 | Dose log: a second answer for the same time was **silently replaced by the first** (the screen said "marked skipped", the record said "taken") and any timestamp was accepted, so a retry with a slightly different time created a second record. The web "Change" button depended on this | Same answer repeated = harmless retry; a different answer = 409. With reminder times, a dose must be one of the schedule's slots (snapped to the exact instant, schedule zone, DST-aware); wrong-zone and off-slot times are refused. "Change" removed (the log is append-only by design and by DB trigger). **Fixes the failing dose-event test** | PASS (4 new DB tests + existing) |
| T6 | Web "Add a medicine" always failed on reviewed prescriptions: it never sent the prescription version (defaulted to 1; a reviewed prescription is ≥2). Also always sent `remindersEnabled: true`, even with no times; unknown dose statuses were shown as "taken" | Client fetches the current version; reminders on only when there is a time; strict status mapping | PASS (tests); live flow NOT TESTED |
| T7 | **Google Calendar sync created new recurring events on every press and never removed any**; synced paused/off/out-of-date schedules; invented 08:00 when no time; computed event end with the server's clock (23:55 → end before start, rejected); series end written in UTC (cut off evening doses west of UTC); medicine names in pop-ups | Idempotent reconcile with deterministic event ids: create or update in place, delete events no longer wanted (time edited out, paused, finished, out of date), exact end/UNTIL in the schedule's zone, nothing invented, generic text unless opted in. Response reports created/removed/skipped/failed and the UI says so honestly | PASS (14 tests against an in-memory Google stand-in); live Google NOT TESTED |
| T8 | Web `.ics` / "Add to Google Calendar": same end-time and UNTIL bugs, first item's zone used for all, UID contained `Date.now()` (every import duplicated), commas/newlines unescaped, no line folding, paused schedules exported, edit page invented 08:00 | Fixed (zone-correct, stable UIDs, RFC 5545 escaping and folding, live reminders only) | PASS (tests) |
| T9 | Dashboard "next reminder" was the first schedule's first time, or an **invented 09:00** | Real next dose across schedules in their own zones; null when none | PASS (tests) |
| T10 | Demo layer mixed three different "today"s; 2 demo tests already failed on pristine HEAD whenever the machine was not near India's time zone | Demo now mirrors the API (schedule-zone dates, slot rule, conflict vs replay) | PASS |

Not built / limits (be aware):
- **Snooze** is not implemented (needs notification actions and a background handler).
- **Missed doses**: mobile shows unrecorded slots from yesterday and today as "Not recorded" and lets the patient answer them; the server still refuses doses more than an hour in the future. There is no automatic "you missed a dose" alert.
- Mobile reminders are local to the phone and last about two weeks without opening the app (OS limit 64). A server push service would remove that limit; none exists.
- Two reminders on the same fall-back day at the repeated hour: only the first occurrence is a valid slot.
- Prescribed instructions and patient-set reminders are kept apart in the data (`medication` vs reminder fields) and in both UIs; sources that change after reviewing switch reminders off until the patient re-confirms.


## Part 7 — Payments and the appointment payment flow

| ID | Found | Fix | Status |
|---|---|---|---|
| R1 | **"Payment options not visible" root cause:** in live mode the web returned the API's raw appointments (`status: "confirmed"`, nested `hospital`) while every screen expects `"booked"`, `hospitalId`, `hospitalName`. No appointment ever counted as booked, so the Payments page (and the Appointments and Dashboard pages) showed nothing payable | Live appointment mapping (`normalizeAppointment`); the page also now shows the gateway status up front and a "Pay ₹X" button per confirmed, unpaid, future appointment | PASS (typecheck, build); live check NOT TESTED |
| R2 | **`/payments/verify` completed a payment when no signature was sent** (success was the default; the signature check only ran if one was supplied). Anyone could mark any order paid with just its reference, even with live keys | A real order is completed only with a valid checkout signature (constant-time compare) AND Razorpay's own record of the payment (captured, same order, same amount and currency). Gateway down → 502, never a guess. "authorized" stays pending | PASS (9 DB tests with stubbed Razorpay) |
| R3 | The client chose the amount (default ₹500, any value accepted) | The server decides (`APPOINTMENT_FEE_PAISE`, default 50000); a request carrying an amount is rejected | PASS |
| R4 | Silent fallback: if Razorpay failed, a fake `order_demo_…` order was created; simulated success/failure was available on real orders; mobile confirmed orders with a fabricated `pay_demo_<time>` reference | Modes are explicit (`/payments/config`): Razorpay test/live, `simulated` (non-production, no keys, labelled "test only"), or `unavailable` (production without keys). No fake orders on gateway failure. Simulated outcomes are refused for real orders and in production | PASS |
| R5 | Expected HMAC was written to the log; signatures compared with `===` | Nothing secret-derived is logged; constant-time compare; audit events record the order and outcome only | PASS (test checks the audit log) |
| R6 | No webhook although a secret setting existed; payments completed after the browser closed were lost | `POST /payments/webhook`: HMAC of the raw body; completes a matching captured payment once, ignores amount mismatches, a late failure cannot undo a paid order | PASS |
| R7 | Double click created several orders | A recent pending order for the same appointment is reused | PASS |
| R8 | Hard-coded Razorpay test key id in the web source; a success toast fired on a client callback; no handling for a blocked checkout script | Key comes from the server only; success is shown only from the server's answer; "pending" and "failed" are distinct; blocked/offline script shows a clear message; dismissed window says nothing was charged | PASS (code); browser NOT TESTED |
| R9 | Mobile cannot take real payments (no payment SDK in the app) | With a gateway: opens the website's secure checkout and refreshes the result; simulated mode shows labelled test buttons; demo layer now has labelled simulated payment routes | PASS (code); in-app card checkout BLOCKED (needs `react-native-razorpay` plus an EAS development build) |

Limits: refunds are not implemented (a cancelled, paid appointment keeps its completed payment and needs a manual refund in the Razorpay dashboard); there is no hospital-specific fee (one server-wide fee); receipts are numbered from the order reference; the appointment record itself does not carry a "paid" flag (payment status is read from the order).


## Part 8 — Backend, database and API integrity

The audit found most areas already sound (strict Zod validation on every route, ORM-only queries, role and consent checks, audit log, CORS allow-list, global and per-route rate limits, request logs with no personal data, append-only dose log and immutable original prescriptions enforced by database triggers). Defects found are listed with the earlier parts they came from; Part 8 closed out the rest.

| ID | Found | Fix | Status |
|---|---|---|---|
| B1 | **Contract bugs between web and API**, all hidden by demo mode: booking sent an extra `hospitalId` (Part 3), history sent `name` instead of `title` (Part 3), corrections omitted `baseVersionNumber` (Part 4), schedules assumed version 1 (Part 6), appointments were never mapped (`confirmed` vs `booked`, Part 7), payments let the client set the amount and verify without proof (Part 7) | Fixed in the clients (wrapper/mapper functions) and pinned by contract tests that run the real API schemas | PASS |
| B2 | Any signed-in user could read another patient's emergency summary by Health ID (Part 5) | Ownership/role rule, audit, rate limit | PASS |
| B3 | `PATCH /patients/me` turned an empty `fullName` into a silent clear | `null` clears the name, an empty or blank string is a 400 | PASS |
| B4 | Web copied the short-lived Clerk access token into `localStorage` and a non-HttpOnly cookie, and preferred that stale copy | Fresh token per request from Clerk, nothing persisted; session lookup uses the fresh token | PASS (typecheck/lint); browser NOT TESTED |
| B5 | `QR_LINK_BASE` could silently ship unusable QR codes (Part 5); payments could silently run fake (Part 7) | Production start-up refuses a non-https link base; payments are `unavailable` in production without keys | PASS |
| B6 | Webhook signature needs the exact raw bytes | JSON parser now keeps the raw body for signature checks | PASS |
| B7 | Stale tests described older behaviour (11 failures at git HEAD): table list, profile and history field lists, demo seed size, a removed dev-login endpoint | Tests updated to the current, documented contract with comments (seed data and hospital names left untouched; `isDemo` is the demo marker). The obsolete dev-login test was removed because that endpoint no longer exists and a password-less login bypass adds risk without value | PASS |

**Result: the whole API suite passes against PostgreSQL 16: 584 tests, 0 failing (git HEAD: 34 failing).**

Not done / limits: no refunds; migrations are additive but were only exercised on an empty database (the schema test) and the test database; a hospital-specific fee does not exist; `DEV_AUTH_ENABLED` is still a recognised setting (production refuses it) although nothing uses it; the legacy password login and the unused custom sign-in forms remain (not used by the Clerk pages).

## Part 13 — integration defects
| ID | Area | Defect | Fix | Status |
|---|---|---|---|---|
| I1 | Web a11y (A11Y-12) | `--input` border `#b5c7c6` is 1.76:1 on white (WCAG 1.4.11 needs 3:1) | `apps/web/src/app/globals.css`: `--input: #6f8886` (3.79:1, same as mobile) | Fixed in code; contrast calculated, not visually checked in a browser |
| I2 | Mobile a11y (A11Y-16) | Hospital review text area had no accessibility label and an English-only placeholder | `HospitalScreen.tsx`: `accessibilityLabel` and placeholder through `lookupTranslation` (English fallback) | Fixed in code; no screen-reader check |
| I3 | Branding | `card-face.tsx` footer used the Devanagari transliteration of the product name (Part 11 found it reads as "fat") | Now "Sehat Meds डिजिटल कार्ड · Bharat ka apna Saathi" | Fixed in code |

No merge conflicts: the four patches share no files. Not fixed (needs owner decision or device work): see docs/QUALITY_AUDIT.md "Open items".
