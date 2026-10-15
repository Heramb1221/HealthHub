# HealthHub Mobile App (Turnkey Standalone Prompt)

ROLE: Principal React Native / Expo Engineer for HealthHub Mobile.

You are working inside the standalone **HealthHub Mobile** app repository (this directory is the project root).
Do not assume any parent directory, outside backend, or external workspace exists. Everything you need is self-contained in this folder.

---

## 1. Project Overview & Current State

This repository is an **Expo SDK 57 + React Native 0.86 + TypeScript** patient app for iOS and Android.
The codebase is already ~90% implemented with clean architecture:

```
App.tsx, index.ts
src/
  api/          # http.ts, endpoints.ts, types.ts, errors.ts (Bearer token client, no RN imports)
  auth/         # AuthContext.tsx, SecureStore token storage
  config.ts     # API address validation & mode detection
  lib/          # safety.ts (OCR gate), validation.ts, format.ts, reminders.ts
  navigation/   # Auth stack, Tab navigator, Root navigator
  screens/      # 11 fully built screens:
                # - AuthScreens.tsx (Welcome, Sign In, Register)
                # - DashboardScreen.tsx (HealthHub ID, next medication, recent records)
                # - ProfileScreen.tsx (Demographics, conditions, allergies, emergency contact)
                # - PrescriptionListScreen.tsx (Status badges, search/filter)
                # - PrescriptionUploadScreen.tsx (Camera, photo library, PDF picker)
                # - PrescriptionDetailScreen.tsx (OCR review, version diffs, corrections, PDF share)
                # - MedicationScreen.tsx (Daily timeline, dose logging: taken/skipped)
                # - HistoryScreen.tsx (Chronic conditions log)
                # - HealthCardScreen.tsx (Dynamic QR code rendering & scan session history)
                # - HospitalScreen.tsx (Hospital directory, availability slot picker, booking)
                # - CareScreen.tsx (Appointment view & cancellation)
  ui/           # theme.ts (tokens), components.tsx (Button, Card, Input, Badge), states.tsx (Loading/Empty/Error)
tests/          # Unit tests (tests/http.test.ts, tests/lib.test.ts)
docs/           # MOBILE_CONTRACT_ASSUMPTIONS.md (API shapes and conventions)
```

---

## 2. Your Exact Objective

Make this standalone mobile app **100% turnkey, error-free, and instantly runnable in Expo Go (Android & iOS)** in both **Demo Mode (zero backend required)** and **Live Mode**.

Execute the following 5 tasks without asking clarifying questions:

### Task 1: Dependencies & TypeScript Clean Build
1. Run `npm install` in the project root.
2. Verify `tsconfig.json` extends `expo/tsconfig.base` without error.
3. Fix any type mismatches in `src/ui/states.tsx` (ensure `children`, `selectable`, and `AppTextProps` match `src/ui/components.tsx`).
4. Ensure `tests/` compile and run cleanly with Node's native test runner (`npm test`).

### Task 2: Implement Standalone Demo Mode (Zero Backend Required)
Testers must be able to launch the app in Expo Go immediately without having a local server running on their laptop:
1. Support `EXPO_PUBLIC_APP_MODE` (`demo` | `live`), defaulting to `demo` in development.
2. In `demo` mode:
   - Provide an in-memory mock adapter in `src/api/` returning realistic synthetic patient data:
     - **Demo Patient:** `demo.patient@healthhub.test` / `DemoPatient#1`
     - **Demo Admin:** `demo.admin@healthhub.test` / `DemoAdmin#1`
   - Include realistic seeded prescription records with at least one medicine flagged "Needs review" (confidence < 0.85).
   - Simulates prescription upload (camera/photo/PDF) with a 2-second processing timer.
   - Allows recording dose events ("taken" / "skipped"), booking open hospital slots, and generating QR codes.
3. In `live` mode:
   - Calls `EXPO_PUBLIC_API_URL` (e.g. `http://localhost:4000/api/v1`) using Bearer token authentication (`Authorization: Bearer <token>`).

### Task 3: Enable Functional Google & Apple Sign-In
In `src/screens/AuthScreens.tsx`:
1. Add prominent, branded **"Continue with Google"** and **"Continue with Apple"** buttons with icons on the Welcome and Sign-In screens.
2. Clicking either button performs an instant sandbox OAuth sign-in:
   - Google signs in as `alex.chen@healthhub.test` (Alex Chen).
   - Apple signs in as `alex.chen@privaterelay.appleid.com` (Alex Chen).
   - Saves session token in `expo-secure-store` and navigates straight into the patient dashboard.
3. Add **"Quick Demo Sign-In"** 1-tap buttons for Demo Patient and Demo Admin so testers don't need to manually type credentials.

### Task 4: API Handshake & Session Restoration
1. On app boot, if an access token exists in `expo-secure-store`:
   - In Live mode: call `GET /auth/me` to validate session freshness and retrieve the patient's name and role.
   - If 401 or invalid: clear the stored token and show Welcome/Sign-In.
2. Registration: enforce a 10-character minimum password policy to match backend security requirements, and accept optional `fullName`.
3. Pagination & Envelope: ensure `http.ts` unpacks both `{ data: [...] }` and paginated `{ data: [...], page: ... }` list responses without dropping items.

### Task 5: Clinical Safety & Device Polish
1. **Safety Gate (`src/lib/safety.ts`):** Never display unverified OCR as verified medication. Low-confidence medicines must be clearly labeled "Needs review", show no dose instructions, and block scheduling until patient-confirmed.
2. **Permissions:** Ensure camera (`expo-image-picker`) and file picker (`expo-document-picker`) have user-friendly permission prompts and handle cancellations gracefully.
3. **QR Codes:** Verify `react-native-qrcode-svg` renders the random session reference safely without displaying sensitive medical data.

---

## 3. Verification & Acceptance Gates

Before reporting completion, execute all validation commands and ensure they exit with code 0:
```bash
npm install            # clean dependency install
npm run typecheck      # tsc --noEmit must pass with 0 errors
npm test               # all unit tests must pass
npm run export:check   # Expo/Metro Hermes export bundle check must pass
```

Summarize:
1. Exact files modified/created.
2. Test and typecheck pass logs.
3. Instructions for running in Expo Go (`npm start`) with both Demo Mode and Live Mode.
