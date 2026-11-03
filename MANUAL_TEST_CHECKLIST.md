# Manual Test Checklist — Sehat Meds

Use synthetic data only. Mark each: PASS / FAIL / N/A with date and device.

## Part 2 — Authentication
- [ ] Web: sign up with a full name containing spaces (first/last fields); name shows correctly on Profile.
- [ ] Web: sign in with a 100+ character passphrase containing spaces (create it first). If Clerk rejects it, note the exact Clerk message (dashboard policy).
- [ ] Web: after enabling phone in Clerk, the sign-in screen offers a phone number; complete SMS verification.
- [ ] Mobile: sign up with email; enter the emailed code; land on Dashboard.
- [ ] Mobile: sign up with a phone number (+91…); enter the SMS code; Profile shows the phone.
- [ ] Mobile: wrong code shows "That code isn't right"; expired code offers a new one; Resend is disabled for 30 s.
- [ ] Mobile: "Sign in with an SMS code instead" works for a phone account.
- [ ] Mobile: stay signed in > 5 minutes, then open Prescriptions and download a PDF — no unexpected sign-out.
- [ ] Brand check: splash, headers, health card, PDF and notifications all read "Sehat Meds" / "Bharat ka apna Saathi".

## Part 3 — Questionnaires and forms
- [ ] Web symptom checker at 320, 375, 768, 1280 px widths: on the last question the "Submit & View Result" button is fully visible and tappable without horizontal scrolling.
- [ ] Last question unanswered: button disabled and hint shown; answered: button enabled; double-tap submits once.
- [ ] Stop the API, press "Start Guided Assessment": an error with Retry appears (no made-up questions).
- [ ] Age 121, -1, 30.5: inline error, no request sent.
- [ ] Web insurance: provider "A", policy "12", expiry before start → inline errors, focus on the first invalid field.
- [ ] Web family: empty name / age 131 → inline errors.
- [ ] Web (live mode): book an appointment from a hospital page and from Appointments → succeeds. Add a history condition → succeeds and appears.
- [ ] Mobile symptom checker: age 200 / duration 999 show inline errors.
- [ ] Mobile medication wizard: open keyboard on the last step — Save button reachable and not under the gesture bar (iPhone with home indicator, Android 3-button and gesture nav).
- [ ] Android back button closes the wizard sheet without losing the prescription.

## Part 4 — Prescription scanning (set `EXTRACTION_PROVIDER=local`; use a synthetic prescription)
- [ ] Photograph a printed prescription (good light), upload. After processing: doctor name, date and medicines match the paper; status shows "needs review".
- [ ] The review form opens automatically; the **Original prescription** panel shows the photo you sent, unchanged. "Open full size" opens it (no popup blocker).
- [ ] Rename a test photo to a Hindi/Marathi file name, upload, confirm the original still displays.
- [ ] Correct a wrong field, tick the confirmation, Save. Refresh the page, log out and back in: corrected values are still there; original photo unchanged.
- [ ] Open the record in a second tab, save in tab 1, then save in tab 2: tab 2 must be refused with a "changed since you opened it" message (no silent overwrite).
- [ ] Right after upload, no medication schedules or history entries exist until you confirm details and set up reminders.
- [ ] Take the photo sideways/upside-down and in dim light: reading may fail or be partial, but nothing is invented; you can enter details by hand.
- [ ] Try a handwritten prescription: expect an empty/low reading and manual entry (with `local_then_gemini` it may be read by Gemini).
- [ ] Double-tap Upload: only one prescription appears. Upload a PDF, a 15 MB image, a text file renamed .jpg, and an iPhone HEIC photo: each fails with a clear message and no record is created.
- [ ] Download the PDF: header says "PRESCRIPTION COPY", prescriber/facility say "Not stated on the document" when unknown, no signature/diagnosis boxes, QR present.
- [ ] Mobile: Original prescription card shows the photo (image) or opens the PDF via the share sheet; airplane mode shows a retry message.

## Part 5 — QR codes (use two phones/accounts and synthetic data; API `QR_LINK_BASE` set to your https web address)
- [ ] Web Health Card page: scan the card QR with a normal camera app. The browser opens `<your site>/qr/HH-…` (not localhost, not another domain).
- [ ] While signed out: the page asks you to sign in and brings you back after signing in. No name/allergies are visible before sign-in.
- [ ] Signed in as the card holder: emergency summary shows name, blood group, allergies, emergency contact; "Call emergency contact" dials.
- [ ] Signed in as a different patient: "This QR code can't be used" (no hint whether the ID exists).
- [ ] Signed in as a provider: summary shows; afterwards the patient's Access history lists the view.
- [ ] Scan a QR for a made-up id (`/qr/HH-00000000`) and for gibberish: both show a safe "can't be used / isn't a Sehat Meds code" page.
- [ ] Mobile Health Card screen shows the QR; scan it from the other phone: same behaviour as the web card.
- [ ] Create a share QR for a prescription (mobile). Scan as a provider with consent: shared prescription page shows "Digitized copy" and an expiry time. Without consent: "Not shared with your account". After expiry, or after "Turn off": "can't be used".
- [ ] Download a prescription PDF, print or display it, scan its QR: you land on that same prescription after sign-in (owner) and not on another record. Edit/correct the prescription, scan the OLD printed PDF again: the page shows the current corrected record.
- [ ] Try 25 quick lookups of random Health IDs as one user: you get a "Too many lookups" message.
- [ ] Production: start the API with `NODE_ENV=production` and no `QR_LINK_BASE`: it must refuse to start with a clear message.

## Part 6 — Medication schedules and reminders (synthetic data; do not rely on these for real doses)
Preconditions: a prescription whose details you reviewed and confirmed (Part 4), then reminders set for two times a day.
- [ ] Mobile: Medication tab → "Turn on reminders on this phone" → allow notifications. It says how many upcoming doses are scheduled and when the next one is.
- [ ] Set a dose time 2 minutes from now: a notification arrives that says "A dose is due" and does NOT name the medicine. Tap "Show medicine names…": the next one names it.
- [ ] Edit that schedule's times: old reminders stop, new ones arrive, none arrive twice (check after 10 minutes).
- [ ] Pause the schedule / set an end date in the past: no further reminders; reminders panel shows no upcoming doses.
- [ ] Deny notification permission in Settings: panel explains how to turn it on; no crash.
- [ ] Sign out and sign in as someone else: the first person's reminders no longer fire.
- [ ] Change the phone's time zone (or schedule zone) to another and back: times still show in the schedule's zone with a "Times are in …" note.
- [ ] Tap Taken, then try to answer the same dose Skipped from the website: refused with "already recorded as taken".
- [ ] A dose from yesterday you never answered is shown as "Not recorded" and can be answered.
- [ ] Web Medications: turn on "Alert me while open", leave the page open past a dose time: one alert, no medicine name. Close the page: no alert (as stated).
- [ ] Web: "Add a medicine" to a reviewed prescription succeeds (previously always failed).
- [ ] Web: "Sync to Google Calendar" twice in a row: still one event per time. Edit a time, sync: old event gone. Pause the schedule, sync: events removed. Toast text matches what happened.
- [ ] Export .ics and import it twice into a calendar: no duplicates. A 23:55 reminder ends at 00:10 next day.
- [ ] Daylight saving (use a test device/clock): a reminder at 08:00 stays at 08:00 local before and after the change.

## Part 7 — Payments (Razorpay TEST keys only; never use live keys here)
- [ ] Book an appointment. Payments page: status banner shows "Test payments (Razorpay sandbox)" and the appointment is listed with "Pay ₹500".
- [ ] Click Pay: the Razorpay window opens. Pay with a Razorpay test card/UPI: page shows "Paid" with a receipt; history lists it; the appointment disappears from "can pay".
- [ ] Close the Razorpay window: message says you were not charged; nothing marked paid. Click Pay again: same order is reused (check the Razorpay dashboard: one order).
- [ ] Use a Razorpay test card that fails: page shows failure, history shows "Failed", retry works.
- [ ] Block checkout.razorpay.com (ad blocker): a clear "payment window couldn't load" message, no fake success.
- [ ] Complete a payment, close the tab before the page confirms: the webhook (if configured) marks it paid; History shows it after refresh.
- [ ] Try changing the amount in browser dev tools (POST /payments/orders with `amountPaise`): refused (400).
- [ ] Mobile with gateway keys: Pay opens the website; after paying, pull down on the Payments screen to see the receipt. With no keys (development): labelled "Test only" buttons.
- [ ] Production API with no Razorpay keys: Payments page says online payment is not available; Pay buttons disabled.

## Parts 9-13 additions (all NOT TESTED unless stated)
- [ ] Web at 360, 430, 820, 1366, 1920 px: header, language selector (9A reported it overlapping the brand name at 360 px), dashboard, hospitals, prescriptions list/detail, vaccinations, appointments, payments. Check no horizontal scroll.
- [ ] Web input borders (`--input` now `#6f8886`): visible but not heavy on every form, including Clerk-adjacent pages.
- [ ] Web keyboard-only walkthrough, focus ring on the language selector, symptom checker heading focus (`symptom-checker-view.tsx:447-448`).
- [ ] Web in Hindi, Tamil, Telugu, Marathi, Bengali: text not clipped, `lang` attribute changes, saved language does not cause a hydration warning on reload.
- [ ] Mobile on a physical Android and iPhone: every screen in PART10_REPORT.md, safe areas, keyboard overlap on forms, Android back, long Indic strings in header/tab bar.
- [ ] Mobile language persists after app restart.
- [ ] VoiceOver and TalkBack on language modal, medicine screens, hospital star rating, insurance close button.
- [ ] Mobile icon-only buttons without labels (list in PART11_ACCESSIBILITY_REPORT.md section 5, item 7).
- [ ] Regression: Clerk email/phone sign-in and sign-out, prescription upload to PDF, health-card and prescription QR scan on a real phone, medication reminders on device, Razorpay sandbox payment and webhook.
- [ ] Native-speaker and clinical review of the withheld translations (PART11_TRANSLATION_REPORT.md Appendix A).
