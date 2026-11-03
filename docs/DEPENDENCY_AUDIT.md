# Dependency security audit — Sehat Meds

Executed with `npm audit --json` at the repository root on npm 10 (Node 22). Raw output is kept in `docs/dependency-audit/npm-audit-before.json` and `npm-audit-after.json`.

| | Critical | High | Moderate | Low | Total |
|---|---|---|---|---|---|
| Before (Next 16.4.0, original lockfile) | 0 | 9 | 33 | 2 | 44 |
| After this hardening pass | 0 | 7 | 30 | 2 | 39 |

Resolved entries: `body-parser` and `node-forge` (high), `qs`, `ip-address` and `fast-uri` (moderate).

The 44 entries come from 27 distinct advisories; most entries are propagation (a package flagged because something below it is vulnerable). `npm audit fix --force` was **not** used. npm's own `fixAvailable` hints are unreliable for this tree (several point at downgrades such as `eslint@4.0.0`), so patched versions were derived from each advisory's vulnerable range against the npm registry.

"Exploitability" below is an analysis of how the package is used in this project. It was **not** tested by attempting exploitation.

## Fixed (in-range updates, no manifest range widened beyond patch level)

| Package | Severity | Type | From → To | Why it mattered |
|---|---|---|---|---|
| `next` / `eslint-config-next` (web) | advisories GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r | direct, production | 16.4.0 → 16.4.3 | RCE and DoS advisories fixed in 16.4.1; 16.4.3 is the latest stable at the time. `sharp` was already 0.35.5 (the advisory's workaround floor). |
| `body-parser` | high | transitive via Express, production | 2.3.0 → 2.4.0 | Request-body parsing on every API route. |
| `qs` | moderate | transitive via Express/body-parser/superagent, production | 6.16.0 → 6.17.1 | Query-string parsing; required by body-parser 2.4.0. |
| `ip-address` | moderate | transitive via express-rate-limit, production | 10.7.3 → 10.7.5 | Used by the rate limiter. |
| `zod` (project copies) | high | direct (api exact `4.6.7`; web and contracts `^4.6.7`), production | 4.6.5 → 4.6.7 | Request validation in the API and web. Floor raised above the vulnerable range (< 4.6.6). The npm audit finding for `zod` remains open only because of the unpatchable 3.25.76 copy listed below. |
| `node-forge` | high | transitive via Expo CLI tooling | 1.4.0 → 1.4.2 | Build/CLI-time only. |
| `fast-uri` | moderate | transitive via Prisma dev tooling (`ajv`) | 3.1.8 → 3.1.9 | Dev-only. |

## Remaining (not fixed), with reasoning

| Finding | Severity | Direct/transitive | Prod/dev | Exploitability here | Patched version / why not applied |
|---|---|---|---|---|---|
| `prisma` → `@prisma/config` → `deepmerge-ts` (< 8) | high | `prisma` direct; others transitive | **dev** (Prisma CLI, a devDependency of the API) | Low: `deepmerge-ts` only merges this project's own `prisma.config.ts`; nothing user-controlled reaches it. | Needs a Prisma CLI update (7.10.1 reported) and a `deepmerge-ts` major (8). Deferred to avoid changing Prisma without the owner's decision. Recommended follow-up: bump `prisma`, `@prisma/client` and `@prisma/adapter-pg` together and re-run the full database suite. |
| `mysql2` (<= 3.23.0) | high | transitive via Prisma dev tooling | dev | None expected: the database is PostgreSQL; the MySQL driver is not loaded by the project. | Same Prisma update path as above. |
| `zod` 3.25.76 (hoisted at the root) | high | transitive | Appears in the dev lint chain (`eslint-plugin-react-hooks`) **and** in the non-dev tree through third-party packages | Project code does not resolve it: API, web and contracts resolve 4.6.7, and mobile source does not import zod. | No patch exists in the 3.x line; the fix is zod >= 4.6.6, a major version for those third-party consumers. Cannot be forced without risking those packages. |
| `expo`, `@expo/cli`, `expo-sharing`, `expo-splash-screen`, `@expo/config*`, `xcode` and related | high / moderate | `expo*` direct, rest transitive | Declared as dependencies of the mobile app, but the flagged code is build/prebuild tooling, not part of the shipped app bundle | Low: affects developer/CI machines running Expo tooling. | Flagged because they sit above `glob`, `uuid` and `zod` 3. npm's suggested fix is an Expo major (58); not applied, per the instruction to preserve Expo/React Native compatibility. |
| `glob` (3.0.0 – 14.0.1) | moderate | transitive | build/tooling | Requires an attacker-controlled glob pattern; none in this project. | Patch is a major bump. |
| `minimatch` (< 11.0.1) | moderate | transitive via ESLint/typescript-eslint | dev (lint) | Requires attacker-controlled patterns. | Fix is a major (11) that ESLint 10 does not yet accept. |
| `uuid` (< 11.1.1) via `xcode` | moderate | transitive | build tooling | Affects calls that pass an output buffer; not used. | Needs a newer `xcode`/Expo. |
| ESLint / typescript-eslint / `eslint-config-*` entries (about 17) | moderate | `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-*` direct | dev | None in production; propagation from `minimatch`. | Resolves when `minimatch` 11 is adopted upstream. |
| `deepmerge` (>= 4.2.0) | low | transitive via Expo config | build tooling | Prototype-pollution class issue in a build tool processing project config. | No patched release available. |
| `@expo/local-build-cache-provider` | low | transitive | build tooling | Local build cache only. | Expo update. |

## Not verified

- Whether the Expo tooling findings affect developer machines in practice was reasoned from the dependency paths, not tested.
- Production runtime dependencies were checked with `npm audit` only; no separate SCA tool or runtime scan was run.
- The stray `apps/api/package-lock.json` (a leftover per-workspace lockfile that npm ignores in a workspace install) was not audited or modified; scanners that read it may report different results.

## Lockfile portability defect found while auditing

The uploaded `package-lock.json` pinned only the Windows (`win32-x64`) native binaries for `@next/swc-*`, `@rolldown/binding-*` and `unrs-resolver`. On Linux, Vitest could not start from the lockfile and Next had to fetch its SWC binary at build time. The Next.js update regenerated the SWC and `unrs-resolver` platform entries; the 15 `@rolldown/binding-*` platform entries were added to the lockfile by hand at the already-pinned 1.2.13 using registry metadata (no version change). A clean `npm ci` followed by the full suites passes. This is a separate matter from the documented first-run `next build` exit, which was the Next 16.4.0 security-advisory notice.
