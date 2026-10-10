# HealthHub mobile (Expo + React Native + TypeScript)

Patient app for Android and iOS. It talks to the same Express API as the web app (`/api/v1`) and follows
`docs/API_CONTRACT.md`. Read `docs/MOBILE_CONTRACT_ASSUMPTIONS.md` first: the backend does not yet implement
most patient routes, and several payload shapes are assumptions awaiting confirmation.

> Prototype / MVP. Not a medical device. Use synthetic test data only. There is no demo or mock mode: if the
> API is missing or unreachable the app shows that, and no action reports success unless the server confirmed it.

## Run

```bash
cd apps/mobile
cp .env.example .env        # set EXPO_PUBLIC_API_URL (see below)
npm install
npm start                   # then press a / i, or scan the QR with Expo Go
```

`EXPO_PUBLIC_API_URL` is compiled into the app and is public. It must never hold a secret.
- iOS simulator: `http://localhost:4000/api/v1`
- Android emulator: `http://10.0.2.2:4000/api/v1`
- Physical phone: `http://<computer LAN IP>:4000/api/v1`, on the same Wi-Fi, with the API's CORS/host settings allowing it
- Release builds require `https://` (the app refuses plain http outside development).

## Checks

```bash
npm run typecheck     # tsc --noEmit
npm test              # Node built-in test runner (types stripped, no extra dependency)
npm run export:check  # Metro/Hermes bundle for android + ios into .export-check/ (delete afterwards)
```
No linter is configured in the repo yet.

## Structure

```
App.tsx, index.ts
src/config.ts            API address validation (no hidden fallback server)
src/api/                 errors.ts, http.ts (no RN imports, unit-tested), types.ts (provenance-tagged), endpoints.ts
src/auth/                SecureStore session (token + expiry + identity only), AuthContext
src/lib/                 safety.ts (review policy), status.ts, format.ts, validation.ts, schedule.ts, appointments.ts, reminders.ts
src/ui/                  theme.ts (tokens from DESIGN_SYSTEM), components.tsx, states.tsx (loading/empty/error/permission)
src/navigation/          auth stack, bottom tabs, root stack
src/screens/             one file per screen group
tests/                   http (local mock server), safety, validation, formatting, schedule
```

## Screens
Welcome / sign in / register · Dashboard · Profile (view/edit) · Prescriptions list · Upload (camera, library,
PDF) · Prescription detail (processing status with polling, source and verification state, per-medicine review
flags, editable corrections saved as a new version, version history, PDF share) · Medicines (schedule, self-reported
doses, reminder preferences, local-reminder prototype) · Medical history · Health card + protected QR + access
history · Hospital directory · Hospital detail with slot booking · My appointments (cancel).

## Safety and privacy decisions
- Tokens only in `expo-secure-store`. API data is held in memory; no medical record is written to device storage. The shared PDF is deleted from the cache after sharing.
- OCR output is never presented as verified. Low-confidence or incomplete medicines show "Needs review", get no dose line, and cannot be added to a schedule. A patient correction is labelled "Corrected by you", not clinician verification. The server remains the authority.
- Local reminders are on-device only and use generic text (no medicine names). They are labelled a prototype and are not server push.
- No role, patient id, price, status or availability is ever sent by the client; booking sends only `slotId`.
- Seeded hospitals flagged `isDemo` show a "Demo data" tag. No ratings, credentials or payments exist.

## Dependencies added beyond core Expo/React Navigation
`expo-secure-store` (token storage), `expo-image-picker` (required by design doc), `expo-document-picker` (PDF selection),
`expo-notifications` (local reminder prototype), `expo-file-system` + `expo-sharing` (authenticated PDF download and share),
`react-native-qrcode-svg` + `react-native-svg` (QR rendering). Versions come from the Expo SDK 57 table.

## Known limitations
See the final report and `docs/MOBILE_CONTRACT_ASSUMPTIONS.md`. In short: not run on a device/emulator, not tested against a real backend, `npm audit` reports transitive issues inside Expo tooling, bundle ids (`in.healthhub.mobile`) are placeholders.
