# PART 10: Mobile Redesign Report

## Result

Every mobile screen in the navigation tree has been changed. The shared design layer (theme, components, navigation) is new across the whole app. Most screens also got screen-specific layout work: icon tiles, section titles, wrapping action rows, and accessibility fixes. Business logic, API calls, authentication, reminders, time zones, QR, prescription processing, and localization dictionaries were not modified.

This is a structural and visual pass, not a fully bespoke rewrite of each screen. A few screens (sign-in, register, verification, the family tree, and others marked below) keep their original layouts with only the shared-layer changes. Device verification has not been performed.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck:mobile` | PASS (exit 0) |
| `npm run lint:mobile` | PASS (exit 0, 0 errors, 0 warnings) |
| `npm run test:mobile` | PASS: 125 / 125 (same count as baseline) |
| `npm run build:mobile` (`expo export`, android + ios) | PASS |

Not verified: physical devices, Android and iOS visual parity, VoiceOver and TalkBack, camera, gallery, QR, and notification permission flows, keyboard overlap, Android back behavior, offline and retry behavior, long regional-language strings on device.

## Shared layer (applies to every screen)

- **Theme** (`src/ui/theme.ts`): type scale with a 13px floor (caption 12→13, label/small 14→15, title 24→26, heading 18→19); body line height 23→24. New tokens: `surfaceMuted`, `iconTile`, `divider`, `radius.pill`, and a shared `elevation`. Existing keys are unchanged.
- **Components** (`src/ui/components.tsx`):
  - `Button`: press feedback (scale 0.97 plus opacity), skipped when OS reduce-motion is on. Caller `style` is applied to the animated wrapper, which only affects layout props.
  - `ListRow`: optional leading `icon` in a tinted tile; pressed-state tint; decorative chevron hidden from screen readers.
  - `Chip`: 44px minimum height with hit slop; translated label; accessibility label.
  - `Card`: uses the shared elevation token.
  - New `SectionTitle` component, used for section headings across screens.
  - New `useReducedMotion` hook.
- **Navigation** (`src/navigation/RootNavigator.tsx`): header with no shadow line, 18px semibold title, minimal back-button label. Tab bar with 13px semibold labels (was 12px), a top border, and a surface background.

## Screen-by-screen checklist

| # | Screen | Status | What changed |
|---|---|---|---|
| 1 | Dashboard | Redesigned | Icons on action rows; full-pill language button with 40px+ height and hit slop; `SectionTitle` on "Next up". |
| 2 | Auth and registration | Partly redesigned | Welcome screen: brand block with icon tile, tagline in primary color. Sign-in, register, and verification use the shared layer only. Clerk logic untouched. |
| 3 | Profile | Redesigned | Identity hero card with initials, name, email and ID; `SectionTitle` on sections; icon rows for navigation. Edit and save logic untouched. |
| 4 | Health card | Redesigned (sections) | Section headings converted to `SectionTitle`. QR payload, card content, and access history unchanged. |
| 5 | QR display and workflows | Partly redesigned | Covered by the Health card screen above. QR creation, revoke and lookup logic unchanged. |
| 6 | Prescription upload | Redesigned | `SectionTitle`; "Ready to upload" card with a file-type icon tile. Camera, gallery, PDF, and upload logic unchanged. |
| 7 | Prescription list | Redesigned | Each item has a leading icon tile and chevron; status badges wrap on narrow screens. |
| 8 | Prescription detail | Redesigned (sections) | `SectionTitle` on all section headings, including the editor's medicine headings. |
| 9 | Original prescription viewer | Redesigned (heading) | `SectionTitle` on the card header. PDF and document logic unchanged. |
| 10 | Medication schedule and reminders | Redesigned | Medicine icon tile on each schedule card; dose rows wrap instead of overflowing; `SectionTitle` for reminders. Time-zone, reminder scheduling, duplicate prevention, and self-report logic unchanged. |
| 11 | Add schedule | Redesigned (sections) | `SectionTitle` on both section headings. |
| 12 | Hospital directory | Targeted fix | Star rating: 48px targets, radio role, labels, checked state. |
| 13 | Vaccination records | Targeted fix | Disclosure buttons at least 40px high; `MIN_TOUCH` import. |
| 14 | Medical history | Redesigned (section) | `SectionTitle` on the add-condition form. |
| 15 | Family health tree | Targeted fix | Member name 15px → 17px; pill padding tokenized. Full layout pass not done. |
| 16 | Insurance | Targeted fix | Close button labelled and 36px → 44px; helpline links have link role and labels; plan tag 12px → 13px; buttons inherit the 48px minimum. |
| 17 | Appointments | Redesigned (in Care) | `SectionTitle` for "Upcoming" and "Past and cancelled"; filter chips wrap. |
| 18 | Payments | Targeted fix | Start-payment button inherits the 48px minimum. Sandbox behavior unchanged. |
| 19 | Symptom checker | Targeted fix | Emergency call buttons inherit the 48px minimum; padding tokenized. |
| 20 | Care and navigation | Redesigned | Hospital rows have a map-pin icon tile; `SectionTitle` headings; chips wrap. |
| 21 | Sharing and consent | Redesigned | Scope label and status badge laid out in a header row with `SectionTitle`. Revoke logic unchanged. |
| 22 | Navigation shell | Redesigned | Header and tab bar (see shared layer). |

Other changes: `ClerkUserBadge` text 11px → 13px, labelled as one accessibility element. `OriginalDocumentCard` heading uses `SectionTitle`.

## Accessibility and touch

- Shared controls meet the 48px minimum (`Button`); chips are 44px plus hit slop.
- Icon-only controls added in this pass: insurance close button, hospital star rating. Decorative icons are hidden from screen readers in the redesigned rows.
- Motion respects reduce-motion; the hook defaults to "reduced" until the OS responds.
- Full VoiceOver and TalkBack review has not been done.

## Remaining device-specific verification

- Android and iOS layouts on physical devices, including notches and home-indicator safe areas.
- Keyboard overlap on every form (add schedule, insurance, family tree, profile, prescription correction).
- Android hardware back behavior across nested stacks.
- Camera, gallery, QR scanning, and notification permission prompts and denial paths.
- Screen-reader order and labels.
- Offline and retry states on network-backed screens.
- Long translated strings in the header, tab bar, and list-row layouts.

## Integration notes

- No API, contract, auth, reminder, QR, prescription-processing, or localization-dictionary files were changed.
- `Chip` now translates its label through `lookupTranslation`, matching the other components. Untranslated strings fall back to English. The localization agent should confirm there are no key conflicts.
- Screens still on original layouts apart from the shared layer: sign-in, register, verification, family tree body, and some Hospital, Vaccination, Insurance, Payments and Symptom checker internals. These are the next candidates for a full pass, to be coordinated with the website agent.
