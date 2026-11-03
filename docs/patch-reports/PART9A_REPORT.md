# Part 9A report

## Routes and components changed
- `/` marketing header only (`components/marketing/site-chrome.tsx`). Landing content unchanged.
- Loading, error, and not-found screens (`app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`).
- Auth layout (`app/(auth)/layout.tsx`). Sign-in and sign-up pages are unchanged; Clerk renders their content.
- `components/layout/brand.tsx`.
- `components/ui/input.tsx`, `textarea.tsx`, `skeleton.tsx`.
- `app/globals.css`: additive tokens only.

Not changed: dashboard, app shell sidebar, payments, feature screens, API, auth logic, localization.

## Checks executed (final state)
- `npm run typecheck:web`: pass.
- `npm run lint:web`: pass.
- `npm run test:web`: 56 of 56 pass.
- `npm run build:web`: pass.
- Browser (Chromium, production server): landing, not-found, and sign-in at 360, 430, 820, 1366, and 1920px wide. No JavaScript errors. No horizontal overflow after the header fix. Not-found links resolve to `/` and `/dashboard`.

## Fixed during this work
- Marketing header overflowed the 360px viewport (page width 362px). Now fits at 360px.

## Known limitations
- The dashboard and app shell were not visually verified. Signed-in routes need Clerk keys, which are not available in this environment.
- Sign-in and sign-up forms are Clerk-rendered, so their inner styling is not restyled and was not checked with real credentials.
- At 360px, the language selector (localization owner) overlaps the end of the brand name. This patch does not change the selector.
- Mobile "Join" label is a copy change needing localization review.
- No motion work beyond the existing `Reveal`/`PageTransition` and shimmer was added; no new GSAP dependency was introduced.
- Scroll-reveal content is hidden in static full-page captures until scrolled; verified by scrolling.
- Not verified on real devices or Safari/Firefox.
