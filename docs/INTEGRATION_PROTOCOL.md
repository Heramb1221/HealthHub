# Parallel Claude Workstream Integration Protocol

## One source of truth
All workstreams must read:
- `AGENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/API_CONTRACT.md`
- `docs/DESIGN_SYSTEM.md`
- this file

## Workstream ownership
- Backend account: `apps/api/**`, Prisma schema/migrations, API docs and tests.
- Web account: `apps/web/**`.
- Mobile account: `apps/mobile/**`.
- Integrator (you): root config, shared contracts, dependency versions, environment setup, merges, CI, final end-to-end testing.

If using separate branches, each workstream must create a branch and PR. If Claude.ai cannot directly edit/push the repository, use it to generate patches or files, then apply them locally and commit them yourself. Do not assume the GitHub connector can write files or run builds.

## API-first handshake
1. Backend owner publishes exact request/response schemas and error shapes before web/mobile build data screens.
2. Frontend owners use typed API client functions and the contract, not invented payloads.
3. If a change is needed, propose it in a contract change note and update all consumers.
4. Keep a small mock API adapter only for isolated UI development; remove it or explicitly label demo mode before integration.

## Branching
- `main`: always intended to be runnable.
- `feat/api-*`: backend work.
- `feat/web-*`: web work.
- `feat/mobile-*`: mobile work.
- Merge one small vertical slice at a time.
- Never have two agents edit the same files simultaneously.
- Pin package manager and dependency versions; avoid broad dependency upgrades during integration.

## Integration gates
For each PR:
- Install from lockfile.
- Lint.
- Typecheck.
- Run unit tests.
- Build the affected app.
- Review authorization and sensitive-data handling for backend changes.
- Test one end-to-end flow against the real API.
- Update docs and `.env.example` if configuration changed.

## Daily check-in format
Each workstream returns:
1. Files changed.
2. Features completed.
3. Commands run and exact pass/fail results.
4. API assumptions or contract changes.
5. Known issues.
6. Next smallest task.
7. Any secrets/configuration required (names only, never values).

## Conflict policy
The integrator makes final decisions. Do not resolve conflicts by deleting the other workstream's functionality without inspection. Prefer small merges and keep `main` runnable.
