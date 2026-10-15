# Browser tests

End-to-end checks that drive the real app in a headless browser. They test the **demo build** (typed demo adapters,
no backend) and, separately, the **live-mode client against a stubbed API**. **No test here talks to a real HealthHub API.**

## Prerequisites

- Node ≥ 20.9 and `npm ci` already run in `apps/web`
- Python 3 with `pip install playwright opencv-python-headless`, then `playwright install chromium`
- `qpdf` and `pdftotext` (poppler-utils) for the PDF checks in suite 03
- For suite 09 only: `npm install --no-save axe-core` (kept out of `package.json` on purpose)
- Linux or macOS (scripts are bash)

## Run

```bash
npm run e2e                     # build (demo) + serve + suites 01-09, stops the server afterwards
./e2e/run-demo.sh 03 06         # only some suites
SKIP_BUILD=1 ./e2e/run-demo.sh  # reuse an existing demo build in .next
npm run e2e:live                # live build + demo-code leak check + suite 10 (replaces .next, so run it last)
./e2e/run-demo.sh docs          # regenerate docs/screenshots (not a test)
```

Each suite prints `PASS`/`FAIL` per check and exits non-zero on any failure. Screenshots go to
`$SHOTS_DIR` (default: a `healthhub-e2e` folder in your temp directory). Set `BASE_URL` to run a suite against a server you started yourself.

## Suites

| # | Covers |
|---|---|
| 01 | Landing page, sign-in and sign-up, route gating, open-redirect guard |
| 02 | Dashboard (seeded, new and admin accounts), profile editing |
| 03 | Prescription list, upload checks, simulated reading, corrections and history, PDF download |
| 04 | Medication schedule (dose rules, add, edit, pause, flagged reminders) and medical history, at a fixed browser clock |
| 05 | Health card and QR (decoded from a screenshot), public scan page |
| 06 | Hospitals, slot picker, booking, the two-tab double-booking race, cancelling |
| 07 | Admin portal: role gate, hospital create, edit and deactivate, read-only open times, the admin to patient loop |
| 08 | Landing list semantics, status-badge hierarchy, page titles, keyboard focus |
| 09 | axe-core WCAG A/AA scan of every route and key states at 375px and 1280px |
| 10 | Live-mode client against a **stubbed** API: server route guard, response shapes, error envelopes, no demo UI or storage |

## What these do **not** prove

- Anything about a real backend. Request and response shapes marked `ASSUMED` in `src/lib/api/types.ts` are unverified.
- Screen-reader behaviour, forced-colours mode, 200% zoom, or real devices. axe checks structure and contrast only.
- Server-side authorization. The demo adapters refuse a patient session on admin calls, but the browser tests only prove
  the screen-level gate; the real API must enforce roles itself.
