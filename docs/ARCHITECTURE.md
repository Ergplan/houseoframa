# Architecture

Updated every stage with a "what changed" list.

## Components

Built:

- `apps/rama` — Next.js 16 (App Router) app. Routes `/` (product line and short SHA) and `/api/health`. Will hold Site, Showroom, Discovery, Audit, Campus.
- `packages/blueprint` (Stage 1) — `extract(repoPath, opts) → Blueprint` from git and the file tree only; `metrics` (one function per figure); `diffBlueprints`; `draftGlossary`; the `rama` CLI (`extract`, `diff`). The only writer of `blueprint/*.json`. See its README.
- `packages/shared` — the types of MASTER-PROMPT §8 (`Blueprint`, `BrickNode`, `ImportEdge`, `Commit`, `Screen`, `FigureRef`, `Trail`, `Decision`, `Signoff`, `Finding`), one doc comment per field. `docs/BLUEPRINT.md` is generated from them.
- `packages/db` — Drizzle schema, the single migration `0000_init`, migrator and seed.
- `packages/model` — `call()`, the one path to a model vendor: vendor guard, versioned prompt, Anthropic and OpenAI adapters over `fetch`, retries, one `model_calls` row per call.

Planned (folders hold only a README until their stage):

- `packages/trace` (Stage 3) — screen capture (Playwright) and figure trails.
- `packages/ceremony` (Stage 4) — decisions, signoffs (append-only), the merge gate, walkthrough script.
- `packages/audit` (Stage 5) — plain-code checks, auditor-vendor narration and report.

## Folders added

- `.rama/` (Stage 1) — this repository's own overlays as a target: `layers.json` places its files on floors. Every target keeps its reviewed human knowledge in its own `.rama/` (Invariant 1).
- `blueprint/self.json` (Stage 1) — this repository's Blueprint, written only by `pnpm extract:self`.
- `packages/blueprint/bin/` (Stage 1) — the `rama` executable (registers tsx, loads `src/cli.ts`).
- `packages/blueprint/test/` (Stage 1) — test fixtures (`fixture-repo.ts` builds throwaway git repositories with fixed dates).

## Data model

Every table carries `site_id`, `created_at`, `created_by` (Invariant 8); `site_id` is nullable only on `people`. `created_by` is a person id or `rama:<component>@<version>`.

| Table                | Purpose                                                                                                           | Append-only                                  | Since   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------- |
| `sites`              | one per target repository; primary key is `site_id`; `member_id` is the owning person                             | no                                           | Stage 0 |
| `people`             | members and reviewers; `name` unique; `site_id` optional home site                                                | no                                           | Stage 0 |
| `model_calls`        | one row per model call: prompt, version, sha256, role, vendor, model, input, output, status, attempts, tokens, ms | yes (trigger refuses UPDATE/DELETE/TRUNCATE) | Stage 0 |
| `audit_log`          | every write to the append-only ceremony tables                                                                    | yes (trigger)                                | Stage 0 |
| `decisions`          | discovery decision cards                                                                                          | yes                                          | Stage 4 |
| `signoffs`           | signatures on screens/bricks at a commit                                                                          | yes                                          | Stage 4 |
| `audits`, `findings` | auditor reports and per-brick verdicts                                                                            | yes                                          | Stage 5 |
| `bookings`           | pod bookings                                                                                                      | no                                           | Stage 6 |

## Critical path

Stage 0 and 1 (real function names):

- `pnpm dev` → `scripts/dev.mjs`: `docker compose up -d db` → `runMigrations(db)` and `seed(db, {memberName})` via `packages/db/src/cli.ts` → `next dev` (apps/rama) and `scripts/watch.mjs` side by side.
- Model calls: `call(req)` → `resolveVendors(env)` (refuses when equal, missing or unknown) → `loadPrompt(name, version)` → `ADAPTERS[vendor].complete()` up to `MAX_ATTEMPTS` = 3 → `record(row)` into `model_calls` → output validated by the request's zod schema.
- Extraction: `rama extract` → `extract()` → `readCommitTree()` or `readWorktree()` + `worktreeBase()` → `parseSource()` per code file → `Resolver.resolve()` per import → `mergeGlossary()` → `readHistory()` → `assignLayer()` per brick → `findScreens()` → `canonicalJson()`. `pnpm extract:self` writes `blueprint/self.json`; `pnpm check:self` (`--check`) fails on drift.
- Watcher: `runChecks()` → eslint, prettier, `tsc --noEmit` per package, vitest changed projects then full suite, `drizzle()` (drizzle-kit check + regenerate-into-a-copy drift probe), `gen-blueprint-doc.mjs --check`, `pnpm check:self` → `.watch/status.json`.

Intended end to end: `rama site add <repo>` → `extract()` → `blueprint/<site>.json` → `/site/[id]` renders → `capture()` → Showroom → `trail(figureId)` → walkthrough → `signoff()` → `gate()` in the target's CI → `audit()` → report → handover.

## Routes

| Route         | Renders                                                                                              | Test                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/api/health` | `{ ok: true, commit }` (`"unknown"` when `GIT_SHA` is unset)                                         | `apps/rama/app/api/health/route.test.ts`, `tests/stage-0.e2e.test.ts` |
| `/`           | "House of Rama · Built on trust" and `commit <short SHA>` ("commit unknown" when `GIT_SHA` is unset) | `apps/rama/app/page.test.tsx`, `tests/stage-0.e2e.test.ts`            |

## Continuous testing

`scripts/watch.mjs` (watch mode under `pnpm dev`; `--once` in CI) writes `.watch/status.json` and `.watch/log.txt`. CI (`.github/workflows/check.yml`) runs `watch.mjs --once` against a Postgres 16 service. Vitest projects (root `vitest.config.ts`): `@rama/shared`, `@rama/db`, `@rama/model`, `@rama/blueprint`, `@rama/app`, `e2e`. CI clones Procurement Studio at fac615d into `reference/procurementstudio` for the golden test, checks out with full history, and checks out a pull request's head commit (not the synthetic merge) so `blueprint/self.json` is checked against the history a developer has. Real-vendor tests live in `*.vendor.test.ts`, are tagged `@vendor`, and run only with `RAMA_VENDOR_TESTS=1`.

## Deployment

One box. `docker-compose.yml`: `db` (Postgres 16) always; `app` and `watcher` under the `stack` profile (`docker compose --profile stack up`). The host workflow is `pnpm dev`. Full deploy is Stage 6.

## What changed

- 2026-10-19: document created before Stage 0.
- 2026-10-20, Stage 0: monorepo wired (pnpm workspaces, Node 22, TypeScript 6.0.3); `apps/rama` with `/`; `packages/shared` types and generated `docs/BLUEPRINT.md`; `packages/db` with `sites`, `people`, `model_calls`, `audit_log`, one migration, append-only triggers, seed; `packages/model` `call()` with the vendor guard; watcher, `pnpm dev`, CI workflow; compose gains `app` and `watcher` under the `stack` profile.
- 2026-10-20, Stage 1: `packages/blueprint` (extractor, metrics, diff, glossary drafting, `rama` CLI); Blueprint schema extended (`BrickNode.envDynamic`, `ImportEdge.typeOnly`, `Commit.changes[].from`, `Blueprint.worktree`, `Blueprint.unresolved`, `external[].dev` and `.manifest`); prompt `glossary.v1`; `.rama/layers.json` for this repository; `blueprint/self.json` checked in with a watcher and CI drift check; `/api/health`; CI clones the golden target.
