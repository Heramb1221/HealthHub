# HealthHub web

Next.js App Router + TypeScript + Tailwind CSS v4 + shadcn/ui-style components. Owned by the web workstream (`apps/web/**` only).

## Run

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000
npm run lint && npm run typecheck && npm run build
```

## API modes

- `NEXT_PUBLIC_API_MODE=demo` (default): typed demo adapters from `src/lib/demo`, persistent "Demo mode" banner, demo records tagged in place.
- `NEXT_PUBLIC_API_MODE=live`: calls `/api/v1/*`, proxied to `API_ORIGIN` by `next.config.ts` so the API's httpOnly session cookie stays first-party.

## Structure

- `src/lib/api`: `http.ts` (typed request, error envelope, `{ data }` unwrapping), `errors.ts`, `types.ts` (CONTRACT vs ASSUMED types), `mode.ts` (`pick(live, demo)`).
- `src/lib/prescription-safety.ts`: the single place that decides whether an extracted medication is safe to show as an instruction or schedule.
- `src/components/ui`: shadcn-style primitives bound to the theme tokens in `src/app/globals.css`.
- `src/components/feedback`, `status`, `layout`: shared loading/empty/error states, status badges, demo tag and banner, page header.
- `src/proxy.ts`: optimistic redirect for signed-out visitors only. Authorization is always enforced by the API.

Add more shadcn components with `npx shadcn@latest add <name>` (needs network access to ui.shadcn.com; `components.json` is already configured).
