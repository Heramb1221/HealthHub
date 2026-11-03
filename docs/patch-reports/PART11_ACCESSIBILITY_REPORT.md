# PART 11 — Accessibility Report

Scope: web and mobile, against WCAG 2.2 AA where it applies to the platform. Findings are labelled by where the fix belongs:

- **Fixed here** — inside a file this part owns.
- **Remediation** — in a screen or shared file owned by another agent; the exact file and change are given in §5.

Method: static inspection of the code, targeted searches across both apps, WCAG contrast calculations from the actual design tokens, and a behavioral check of the DOM translator in headless Chromium. **No screen-reader session, no device testing and no keyboard walkthrough were run.** Results marked "verified in code" are not verified with assistive technology.

## 1. Summary

| Area | Result |
|---|---|
| Language metadata (`lang`, `dir`) | Fixed. Updates on each switch; options carry `lang`. |
| Accessible names for language controls | Fixed. Translated; flags removed from names. |
| Focus visibility (language selector) | Fixed. The old `focus:outline-none` left no focus indicator. |
| Dialog semantics and focus (mobile language modal) | Fixed. Modal flagged as modal; header role; selected state. |
| Touch targets (mobile language modal) | Fixed. Close button 44 px with hit slop; items 48 px. |
| Translated accessible names on web | Fixed in the DOM layer (`aria-label`, `title`, `alt`, `placeholder`). |
| Text colour contrast (design tokens) | All text pairs pass. |
| **Non-text contrast on web inputs** | **Fails** (`--input`). Remediation, §5. |
| Reduced motion (web) | Honored. Mobile has no motion to reduce. |
| Mobile icon-only controls without labels | Partly fixed. Remediation for listed screens, §5. |
| Mobile text input without a label | Remediation, §5 (one review field). |

## 2. Findings and status

| ID | Platform | Finding | Severity | Status | Where |
|---|---|---|---|---|---|
| A11Y-01 | Web | The language `<select>` removed its focus outline (`focus:outline-none`) with no replacement, so keyboard focus was invisible (WCAG 2.4.7). | High | **Fixed here** | `components/layout/language-selector.tsx` (focus ring on the wrapper with `focus-within`) |
| A11Y-02 | Web | Language option names carried no language, so a screen reader may read Hindi and Tamil names with the page's English pronunciation. | Medium | **Fixed here** | `language-selector.tsx` (`lang` on each `<option>`) |
| A11Y-03 | Web | Option text included flag emoji, which screen readers may announce by name (for example "Indian flag"). Flags are not language identifiers. | Low | **Fixed here** | `language-selector.tsx`, `languages.ts` (flag field kept, not rendered) |
| A11Y-04 | Web | Accessible names (`aria-label`, `title`, `alt`) stayed in English when the language changed (WCAG 3.1.1 / 4.1.2). | High | **Fixed here** | `lib/i18n/dom-translation.ts` (translates these attributes, verified in Chromium) |
| A11Y-05 | Web | Language metadata: `<html lang>` was set once on mount and never changed, and the server sets `en-IN` even when another language is chosen. | Medium | **Fixed here** | `language-context.tsx` (sets `lang` to the locale tag and `dir="ltr"` on every change) |
| A11Y-06 | Web | Hydration mismatch with a saved non-English language. Not an accessibility defect in the strict sense, but it can break the page for assistive technology. | Medium | **Fixed here** | `language-context.tsx` |
| A11Y-07 | Mobile | Language modal close button was about 28 px with no translated label ("Close language selector" hard-coded in English). | High | **Fixed here** | `ui/LanguageModal.tsx` (44 px minimum, hit slop, translated label, role `button`) |
| A11Y-08 | Mobile | Language modal did not identify itself as a modal to assistive tech; the title was not a heading. | Medium | **Fixed here** | `ui/LanguageModal.tsx` (`accessibilityViewIsModal`, heading role on the title) |
| A11Y-09 | Mobile | Language options did not expose their selected state. | Medium | **Fixed here** | `ui/LanguageModal.tsx` (role `button`, `accessibilityState.selected`, combined label "हिन्दी, Hindi") |
| A11Y-10 | Mobile | Language option height was not guaranteed by the component. Content already measures about 55 px, so this is a guaranteed minimum rather than a visible fix. | Low | **Fixed here** | `ui/LanguageModal.tsx` (minimum 48 px) |
| A11Y-11 | Mobile | Hard-coded English text in the modal ("Govt of India Bhashini Mission"). | Low | **Fixed here** | `ui/LanguageModal.tsx` (translated) |
| A11Y-12 | Web | `--input` border colour `#b5c7c6` on white is **1.76 : 1**. WCAG 1.4.11 requires 3 : 1 for input boundaries that identify the field. | High | **Remediation** | `apps/web/src/app/globals.css` (see §5) |
| A11Y-13 | Mobile | Input border `#6f8886` on white is 3.79 : 1, so it passes. | — | Pass | `ui/theme.ts` |
| A11Y-14 | Web | Hard-coded English labels inside screens: the DOM layer covers exact matches only, so any unmatched label stays English but keeps its accessible role. | Medium | **Remediation** | Screens listed in §5 |
| A11Y-15 | Mobile | Icon-only touchables may lack `accessibilityLabel`. A line-level grep finds 43 of 44 touchable lines with no accessibility prop on the same line. Many of those props sit on following lines, so this is an upper bound. Text children are read automatically; icon-only ones are not. | High | **Remediation** | Screens in §5 (manual check) |
| A11Y-16 | Mobile | Review text area in `HospitalScreen.tsx` has no accessibility label and an English-only placeholder. | Medium | **Remediation** | `screens/HospitalScreen.tsx:350` |
| A11Y-17 | Web | `.outline-none` on a heading (`symptom-checker-view.tsx:448`, `tabIndex={-1}`). Used for programmatic focus, so acceptable if focus is then visible on the heading's focus target. | Low | Check | `symptom-checker-view.tsx:447–448` |
| A11Y-18 | Web | Reduced motion. `Reveal` and route transitions use `useReducedMotion`, and `globals.css` has a `prefers-reduced-motion` block. | — | Pass (in code) | `components/motion/reveal.tsx`, `app/globals.css:122` |
| A11Y-19 | Mobile | Motion. No `Animated`, Reanimated or `LayoutAnimation` use found, so nothing needs a reduced-motion path. | — | Pass (in code) | `apps/mobile/src` |
| A11Y-20 | Web | Images have alt text (`brand.tsx`, `card-face.tsx`). The password visibility toggle has an `aria-label` that changes with state. | — | Pass (in code) | `components/layout/brand.tsx`, `components/forms/text-field.tsx` |
| A11Y-21 | Web | Skip link present in the root layout. | — | Pass (in code) | `app/layout.tsx` |
| A11Y-22 | Web | Form errors are associated and announced: 13 files use `aria-invalid`, 10 use `aria-describedby`, and 19 use live regions. | — | Pass (in code) | `components/**` |
| A11Y-23 | Mobile | Text scaling is not disabled anywhere (`allowFontScaling` not set to false; no `maxFontSizeMultiplier` cap). | — | Pass (in code) | `apps/mobile/src` |
| A11Y-24 | Mobile | Long translations and large text may clip or overlap in fixed-height rows. Not tested on a device. | Medium | Not verified | All screens; check at 200% text scale |
| A11Y-25 | Web | Long translations at phone width (320 px). Not rendered. | Medium | Not verified | Header (`language-selector`), all pages |

## 3. Contrast (WCAG 2.2, computed from the design tokens)

Values are the tokens in `apps/web/src/app/globals.css` and `apps/mobile/src/ui/theme.ts`. Text needs 4.5 : 1; UI boundaries need 3 : 1.

| Pair | Ratio | Needs | Result |
|---|---|---|---|
| Text on background (`#0d1b2e` on `#f2f7f6`) | 16.00 | 4.5 | Pass |
| Text on card (`#0d1b2e` on `#ffffff`) | 17.31 | 4.5 | Pass |
| Muted text on background (`#4c5b6b`) | 6.44 | 4.5 | Pass |
| Muted text on card | 6.96 | 4.5 | Pass |
| Muted text on neutral surface (`#e9f0ef`) | 6.03 | 4.5 | Pass |
| Primary on card (`#0a6b60`) | 6.39 | 4.5 | Pass |
| On-primary on primary | 6.39 | 4.5 | Pass |
| Destructive on card (`#b3261e`) | 6.54 | 4.5 | Pass |
| Destructive on danger surface (`#fbe9e7`) | 5.58 | 4.5 | Pass |
| Success on success surface | 6.14 | 4.5 | Pass |
| Warning on warning surface | 6.35 | 4.5 | Pass |
| Info on info surface | 6.09 | 4.5 | Pass |
| Demo on demo surface | 6.97 | 4.5 | Pass |
| Accent text on accent | 7.80 | 4.5 | Pass |
| Navy on background | 11.01 | 4.5 | Pass |
| Focus ring (`#1a7f9e`) on card | 4.59 | 3 | Pass |
| Focus ring on background | 4.24 | 3 | Pass |
| Mobile input border (`#6f8886`) on card | 3.79 | 3 | Pass |
| **Web input border (`--input` `#b5c7c6`) on card** | **1.76** | **3** | **Fail (A11Y-12)** |
| Decorative divider (`--border` `#d3e0df`) on card | 1.36 | none (decorative) | Acceptable |

Only the web input border fails a requirement. The decorative divider is not a control boundary and is not required to meet 3 : 1.

## 4. What changed in the owned files

**Web**
- `language-selector.tsx`: visible focus ring (`focus-within`), `lang` on each option, flags removed from accessible names, invalid values rejected, BHASHINI badge left readable.
- `dom-translation.ts` (new): translates `aria-label`, `title`, `alt` and `placeholder`, and honors `translate="no"` and `data-no-translate`.
- `language-context.tsx`: `<html lang>` follows the chosen language; no hydration mismatch.

**Mobile**
- `ui/LanguageModal.tsx`: as in A11Y-07 to A11Y-11. Close control: `accessibilityRole="button"`, translated `accessibilityLabel`, 44 px minimum, hit slop of 12 px. Modal: `accessibilityViewIsModal`. Title: `accessibilityRole="header"`. Language options: role `button`, combined label, selected state, 48 px minimum.

Keyboard and focus on mobile modals are expected to be handled by React Native's `Modal`. That was not verified on a device.

## 5. Remediation checklist (outside this part's ownership)

These need the integration agent. Each item states the file, the problem and the change.

**Web**

1. `apps/web/src/app/globals.css`: `--input: #b5c7c6` → `--input: #6f8886`. This matches the mobile input border, passes at 3.79 : 1 on white, and does not change the text colours. *(A11Y-12)*
2. `apps/web/src/components/symptoms/symptom-checker-view.tsx:447–448`: confirm the heading focus target shows a visible focus state when programmatically focused. *(A11Y-17)*
3. Screens with hard-coded English (see translation report §9). Priority for accessibility: `symptom-checker-view.tsx`, `medication-setup-wizard.tsx`, `vaccination-view.tsx`, `family-tree-view.tsx`, `insurance-view.tsx`. Move `aria-label`, `title`, `placeholder` and `alt` strings through `t()` as well. The DOM layer covers exact matches, but a `t()` key is the reliable route. *(A11Y-14)*
4. `apps/web/src/app/layout.tsx`: the server-rendered `lang="en-IN"` is correct for the default language; no change is needed for hydration. The runtime keeps it current.
5. Date and number output that is not language-aware (`qr-resolver.tsx:161`, `insurance-view.tsx:442`, `payments-view.tsx:265`, and `lib/format.ts`). Accessibility impact: a screen reader reads dates in the device language. *(related to translation report §6)*

**Mobile**

6. `apps/mobile/src/screens/HospitalScreen.tsx:350`: add `accessibilityLabel` and a translated placeholder to the review text area. *(A11Y-16)*
7. Icon-only touchables without `accessibilityLabel`. Add a label (translated through `t()`) to each. Counts are file-level (touchable lines / `accessibilityLabel` lines), so they are upper bounds; check each file by hand. Start with the files that have the fewest labels:
   - `screens/InsuranceScreen.tsx` (7 touchables, 0 labels)
   - `screens/VaccinationScreen.tsx` (5, 0)
   - `screens/SymptomCheckerScreen.tsx` (3, 0)
   - `screens/HospitalScreen.tsx` (3, 0)
   - `screens/FamilyTreeScreen.tsx` (5, 2)
   - `screens/PrescriptionListScreen.tsx` (3, 1)
   - `screens/AddScheduleScreen.tsx` (3, 1)
   - `screens/DashboardScreen.tsx` (3, 2)
   - `ui/components.tsx` (shared; 7 touchables, 8 labels; check the icon-only ones)
8. Shared `ui/components.tsx` text field sets `accessibilityLabel` from the translated label, which is good. Keep it.
9. Touch target minimum: `MIN_TOUCH = 48` is defined in `ui/theme.ts`. Check the icon buttons in screens use it. *(verify on device)*
10. Text scaling: run each screen at the largest system text size and check for clipped labels in fixed-height rows (A11Y-24).

**Not checked here (needs a device or assistive-technology session)**

- VoiceOver (iOS) and TalkBack (Android) reading order and announcements on the language modal and the medicine screens.
- Keyboard-only navigation on web across every page, including the new focus ring.
- Phone-width layout (320 px) with each Indic language, which uses longer strings.

## 6. Tests

The accessibility changes are verified by static review and by the typecheck/lint/test runs in the translation report (§10). The DOM behavior (translated accessible names, opt-outs, React updates) was verified in headless Chromium with an ad hoc script that is not part of the patch. No automated accessibility test (axe, Testing Library, or a mobile equivalent) exists in the repository, and none was added, because the test setup would need dependencies outside this part's scope.
