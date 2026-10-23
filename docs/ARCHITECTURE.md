# Architecture

Updated every stage with a "what changed" list.

## Components

Built:

- `apps/rama` — Next.js 16 (App Router) app. The Site (Stage 2): `canvas/` renders a Blueprint as a building (pure functions: `layout`, `timeline`, `frame`, `draw`, `pick`), `components/site/SiteView` runs the replay deck and the brick finder, `components/inspector/` shows the Trust report, a Commit and a Brick in English with Confirm controls. Will hold Showroom, Discovery, Audit, Campus.
- `packages/blueprint` (Stage 1) — `extract(repoPath, opts) → Blueprint` from git and the file tree only; `metrics` (one function per figure, browser-safe); `diffBlueprints`; `draftGlossary` and `draftPurposes`; `site` (Stage 2: sites under `work/`, confirmations into a target's `.rama/`); the `rama` CLI (`extract`, `diff`, `site add|extract|check|draft|list`). The only writer of `blueprint/*.json` and `work/*/blueprint.json`. See its README.
- `packages/shared` — the types of MASTER-PROMPT §8 (`Blueprint`, `BrickNode`, `ImportEdge`, `Commit`, `Screen`, `FigureRef`, `Trail`, `Decision`, `Signoff`, `Finding`), one doc comment per field. `docs/BLUEPRINT.md` is generated from them.
- `packages/db` — Drizzle schema, the single migration `0000_init`, migrator and seed.
- `packages/trace` (Stage 3) — `capture()` photographs a target's real screens from its built app (Playwright, no secrets), finds every figure (traced by `data-rama-figure` or the `.rama/figures.json` overlay, untraced otherwise), re-executes traced figures with the target's own functions in a sandboxed Node process, and `buildTrail()` / `showroomOf()` turn a capture into the Showroom. CLI `rama-trace`. Convention: `docs/HOUSE-STYLE.md`.
- `packages/ceremony` (Stage 4) — decision cards and discovery sessions, named signatures (append-only in Postgres and mirrored to the target's `.rama/decisions.jsonl` and `.rama/signoffs.jsonl`), the supersede chain, the merge gate (`rama gate <repoPath> --base <commit>`), the walkthrough script, and imports of reconstructed records. CLI `rama-ceremony`.
- `packages/model` — `call()`, the one path to a model vendor: vendor guard, versioned prompt, Anthropic and OpenAI adapters over `fetch`, retries, one `model_calls` row per call. `prices.ts` is the one dated price table (US$ per million tokens per model, the rupee rate, sources); `pnpm cost <stage>` turns a stage's `model_calls` into tokens and rupees.

Planned (folders hold only a README until their stage):

- `packages/audit` (Stage 5) — plain-code checks, auditor-vendor narration and report.

## Folders added

- `.rama/` (Stage 1) — this repository's own overlays as a target: `layers.json` places its files on floors. Every target keeps its reviewed human knowledge in its own `.rama/` (Invariant 1).
- `blueprint/self.json` (Stage 1) — this repository's Blueprint, written only by `pnpm extract:self`.
- `packages/blueprint/bin/` (Stage 1) — the `rama` executable (registers tsx, loads `src/cli.ts`).
- `packages/blueprint/test/` (Stage 1) — test fixtures (`fixture-repo.ts` builds throwaway git repositories with fixed dates).
- `apps/rama/canvas/` (Stage 2, in the locked layout) — the building renderer: pure functions over a Blueprint, ported from the weekend prototype.
- `apps/rama/components/inspector/`, `apps/rama/components/site/` (Stage 2) — the inspector views with their wording, and the site view.
- `apps/rama/test/` (Stage 2) — test fixtures for the app (`blueprint.ts`, a small hand-built Blueprint).
- `work/<site>/` (Stage 2, gitignored) — `repo/` (the read-only clone; only `.rama/` is ever written), `site.json`, `blueprint.json`.
- `packages/trace/bin/`, `packages/trace/test/` (Stage 3) — the `rama-trace` executable; test fixtures (`fixture-app.ts`, a tiny target that follows the house convention).
- `apps/rama/components/showroom/` (Stage 3) — the Showroom view and the trail panel.
- `work/<site>/capture.json`, `work/<site>/shots/` (Stage 3, gitignored) — the last capture and its screenshots.
- `docs/HOUSE-STYLE.md` (Stage 3) — the convention a house-stack target follows to make its figures traceable.
- `packages/ceremony/bin/`, `packages/ceremony/test/` (Stage 4) — the `rama-ceremony` executable; tests.
- `packages/ceremony/ci/` (Stage 4) — `rama-gate.yml`, the GitHub Actions workflow a target includes (`rama-ceremony install-gate <site>` writes it pinned to a House of Rama ref).
- `packages/audit/bin/`, `packages/audit/src/checks/`, `packages/audit/test/` (Stage 5) — the `rama-audit` executable, the checks of §7.3, tests.
- `apps/rama/components/ceremony/` (Stage 4) — the walkthrough and the site office (discovery) views.
- `tests/dev-server.ts` (Stage 2) — starts the real Next dev server for an e2e test on its own port and distDir.

## Data model

Every table carries `site_id`, `created_at`, `created_by` (Invariant 8); `site_id` is nullable only on `people`. `created_by` is a person id or `rama:<component>@<version>`.

| Table                | Purpose                                                                                                                                                      | Append-only                                  | Since   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------- |
| `sites`              | one per target repository; primary key is `site_id`; `member_id` is the owning person                                                                        | no                                           | Stage 0 |
| `people`             | members and reviewers; `name` unique; `site_id` optional home site                                                                                           | no                                           | Stage 0 |
| `model_calls`        | one row per model call: prompt, version, sha256, role, vendor, model, input, output, status, attempts, tokens, ms                                            | yes (trigger refuses UPDATE/DELETE/TRUNCATE) | Stage 0 |
| `audit_log`          | every write to the append-only ceremony tables                                                                                                               | yes (trigger)                                | Stage 0 |
| `discovery_sessions` | a discovery session in the site office; `reconstructed` and `source` when rebuilt from a record                                                              | yes (trigger)                                | Stage 4 |
| `discovery_turns`    | one turn of a session: speaker, text, `draft` for a question Rama drafted                                                                                    | yes (trigger)                                | Stage 4 |
| `decisions`          | decision cards (§8 Decision); a change is a new card with `supersedes`; every insert audited by trigger                                                      | yes (trigger)                                | Stage 4 |
| `signoffs`           | named signatures on a screen or brick at a commit (§8 Signoff); a reversal is a new row with `supersedes` (and `withdrawn`); every insert audited by trigger | yes (trigger)                                | Stage 4 |
| `audits`, `findings` | auditor reports and per-brick verdicts                                                                                                                       | yes                                          | Stage 5 |
| `bookings`           | pod bookings                                                                                                                                                 | no                                           | Stage 6 |

## Critical path

Stage 0 and 1 (real function names):

- `pnpm dev` → `scripts/dev.mjs`: `docker compose up -d db` → `runMigrations(db)` and `seed(db, {memberName})` via `packages/db/src/cli.ts` → `next dev` (apps/rama) and `scripts/watch.mjs` side by side.
- Model calls: `call(req)` → `resolveVendors(env)` (refuses when equal, missing or unknown) → `loadPrompt(name, version)` → `ADAPTERS[vendor].complete()` up to `MAX_ATTEMPTS` = 3 → `record(row)` into `model_calls` → output validated by the request's zod schema.
- Extraction: `rama extract` → `extract()` → `readCommitTree()` or `readWorktree()` + `worktreeBase()` → `parseSource()` per code file → `Resolver.resolve()` per import → `mergeGlossary()` → `readHistory()` → `assignLayer()` per brick → `findScreens()` → `canonicalJson()`. `pnpm extract:self` writes `blueprint/self.json`; `pnpm check:self` (`--check`) fails on drift.
- Watcher: `runChecks()` → eslint, prettier, `tsc --noEmit` per package, vitest changed projects then full suite, `drizzle()` (drizzle-kit check + regenerate-into-a-copy drift probe), `gen-blueprint-doc.mjs --check`, `pnpm check:self` → `.watch/status.json`.

Stage 2:

- `rama site add <src>` → `addSite()` (`git clone --no-hardlinks` into `work/<id>/repo`, `site.json`) → `writeSiteBlueprint()` → `extract(repoDir, {overlay: 'worktree'})` → `work/<id>/blueprint.json`; `registerSite()` inserts the `sites` row for the local member. `rama site draft <id>` → `draftGlossary()` + `draftPurposes()` → `call()` → unconfirmed entries in `.rama/glossary.json` and `.rama/purposes.json`, saved per batch → `writeSiteBlueprint()`.
- `/site/[siteId]` → `locateSite()` → `readSiteBlueprint()` → `<SiteView>` → each animation frame `draw(ctx, state)` → `frame(state)` → `siteModel(bp)` (`layout()` + `timeline()`, memoised per Blueprint) → paint. Click → `toScene()` → `pick()` → `<Inspector view=brick>` → `reviewerParagraph()`, `edgePhrase()`, `brickFigures()`.
- Confirm → `POST /api/site/[siteId]/confirm` → `handleConfirm()` → person id from `people` → `snapshotOverlay()` → `confirmEdge()` / `confirmPurpose()` (overlay write, `writeSiteBlueprint()`) → `audit_log` rows (on failure `restoreOverlay()`, 503) → `router.refresh()` re-reads the Blueprint.

Stage 3:

- `rama-trace capture <site>` → `readScreensConfig()` → `sh(install/build)` → `startApp()` (PATH and HOME only) → Playwright per screen: `goto` → steps → grow viewport → `collectFigures` (page-figures.js) → `screenshot` → `screenForRoute(bp, route)` for the bricks → `reexecute()` per traced figure → `runInSandbox()` (harness or `fn(...data-rama-args)`) → `work/<site>/capture.json` + `shots/`.
- `/site/[siteId]/showroom` → `readCapture()` + `readSiteBlueprint()` → `showroomOf()` → `buildTrail()` per traced figure → `<ShowroomView>` (hotspots from the captured boxes) → `<TrailPanel>` / `<UntracedPanel>`. Screenshots come from `GET /api/site/[siteId]/shots/[name]` → `shotResponse()`.
- `/site/[siteId]` passes the captured screens to the Brick view's "On screen" thumbnails.

Stage 4:

- `/site/[siteId]/walkthrough` → `readCapture()` + `readSiteBlueprint()` + `readSignoffs()` / `readDecisions()` (the target's `.rama/*.jsonl`) → `showroomOf(capture, bp, signaturesInForce())` → `walkthrough()` (one step per Blueprint screen, statement from traced figures and decided cards) → `<WalkthroughView>`; Read aloud → `speechSynthesis.speak()`; Confirm → `POST /api/site/[siteId]/sign` → `handleSign()` (captured commit must match, supersedes the signature in force) → `sign()`: a transaction holding the site's advisory lock runs `checkChain()` and inserts into `signoffs` (trigger `signoffs_audit` → `audit_log`; unique `signoffs_supersedes_once`); after the commit a second locked transaction runs `syncMirror()`, appending every committed row missing from `.rama/signoffs.jsonl` (a `MirrorError` if the file cannot be written, repaired by the next write) → `router.refresh()`.
- `/site/[siteId]` → `signaturesInForce(readSignoffs())` at the Blueprint commit → `signedScreens` → `frame()` → `brickMarks()` (red / amber / green dots); the Trust report → `signatureCoverage()`.
- `/site/[siteId]/discovery` → `listSessions()` + `listDecisions()` → `<DiscoveryView>`; `POST …/discovery/sessions|turns` → `startSession()` / `addTurn()`; `POST …/discovery/ask` → `draftQuestion()` → `call({name:'discovery', version:1, role:'builder'})` → a draft turn; `POST …/decisions` → `decide()` (row audited by trigger, mirrored to `.rama/decisions.jsonl`).
- `rama gate <repo> --base <commit> [--test-report <json>]` → (`packages/blueprint/src/cli.ts` loads `packages/ceremony/src/cli.ts`) → `runGate()`: `extract(repo)` at HEAD and at the base (screens and bricks of both count), `changesSince()` (`git log --first-parent -m --name-status -M base..HEAD`: merges with what they brought in, renames with both paths), `.rama/signoffs.jsonl` at HEAD and at base (must only grow), `passingFromReport()` → `evaluateGate()` → `formatGate()`; exit 0 / 1 / 2 (usage).
- `rama-ceremony import-session|import-decisions` → `parseWeekendSession()` / `parseDecisionsLog()` → `importRecord()` (a reconstructed session; a re-import reconciles with `planReimport()`, append-only).

Intended end to end: `rama site add <repo>` → `extract()` → `blueprint/<site>.json` → `/site/[id]` renders → `capture()` → Showroom → `trail(figureId)` → walkthrough → `signoff()` → `gate()` in the target's CI → `audit()` → report → handover.

## Routes

| Route                                        | Renders                                                                                                                                                                                          | Test                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `/site/[siteId]`                             | the building of a site (Blueprint from `work/<id>/blueprint.json`, or `blueprint/self.json` for `self`), replay deck, brick finder, inspector; 404 for an unknown site                           | `apps/rama/app/site/[siteId]/page.test.tsx`, `tests/stage-2.e2e.test.ts`                                       |
| `/site/[siteId]/showroom`                    | the site's captured screens with hotspots (traced amber, untraced grey), a strip of screens, the trail panel; `?screen=` and `?figure=` preselect; says so when nothing is captured              | `apps/rama/app/site/[siteId]/showroom/page.test.tsx`, `tests/stage-3.e2e.test.ts`, `tests/stage-2.e2e.test.ts` |
| `GET /api/site/[siteId]/shots/[name]`        | a captured screenshot (PNG); 404 for anything else                                                                                                                                               | `apps/rama/app/site/[siteId]/showroom/page.test.tsx`                                                           |
| `/site/[siteId]/discovery`                   | the site office: sessions with turns (Rama's drafts marked), decision cards with their bricks and screens, forms to add a turn, ask Rama, record a card; says so when Postgres cannot be reached | `apps/rama/app/site/[siteId]/page.test.tsx`, `tests/stage-2.e2e.test.ts`                                       |
| `/site/[siteId]/walkthrough`                 | screen by screen: screenshot, the statement to sign (read aloud), traced figures, decision cards, Confirm / Not yet / Withdraw as the local member                                               | `apps/rama/app/site/[siteId]/showroom/page.test.tsx`, `tests/stage-4.ekbill.test.ts`                           |
| `POST /api/site/[siteId]/sign`               | `{screenId, commit, statement, withdraw?}` → a signature (or withdrawal) on a screen at the captured commit, as the local member; 400/404/409/503                                                | `apps/rama/app/api/site/[siteId]/ceremony.test.ts`, `tests/stage-4.ekbill.test.ts`                             |
| `POST /api/site/[siteId]/decisions`          | `{title, statement, status, bricks?, screenId?, sessionId?, supersedes?}` → a decision card as the local member; bricks and screen must exist                                                    | `apps/rama/app/api/site/[siteId]/ceremony.test.ts`                                                             |
| `POST /api/site/[siteId]/discovery/sessions` | `{title}` → a live session                                                                                                                                                                       | `apps/rama/app/api/site/[siteId]/ceremony.test.ts`                                                             |
| `POST /api/site/[siteId]/discovery/turns`    | `{sessionId, text, speaker?}` → a turn by the member                                                                                                                                             | `apps/rama/app/api/site/[siteId]/ceremony.test.ts`                                                             |
| `POST /api/site/[siteId]/discovery/ask`      | `{sessionId}` → Rama's next question (prompt `discovery.v1`), stored as a draft turn; 502 when the model fails                                                                                   | `apps/rama/app/api/site/[siteId]/ceremony.test.ts`                                                             |
| `POST /api/site/[siteId]/confirm`            | `{kind:'edge',from,to,shown}` or `{kind:'purpose',path,shown}` → confirms as the local member; 400/404/409/503 as documented in the handler                                                      | `apps/rama/app/api/site/[siteId]/confirm/handler.test.ts`, `tests/stage-2.e2e.test.ts`                         |
| `/api/health`                                | `{ ok: true, commit }` (`"unknown"` when `GIT_SHA` is unset)                                                                                                                                     | `apps/rama/app/api/health/route.test.ts`, `tests/stage-0.e2e.test.ts`                                          |
| `/`                                          | "House of Rama · Built on trust", `commit <short SHA>` ("commit unknown" when `GIT_SHA` is unset), and the list of sites                                                                         | `apps/rama/app/page.test.tsx`, `tests/stage-0.e2e.test.ts`                                                     |

## Continuous testing

`scripts/watch.mjs` (watch mode under `pnpm dev`; `--once` in CI) writes `.watch/status.json` and `.watch/log.txt`. CI (`.github/workflows/check.yml`) runs `watch.mjs --once` against a Postgres 16 service. Vitest projects (root `vitest.config.ts`): `@rama/shared`, `@rama/db`, `@rama/model`, `@rama/blueprint`, `@rama/trace`, `@rama/app`, `e2e`, and `ekbill` where EkBill's working clone exists. CI clones Procurement Studio at fac615d into `reference/procurementstudio` for the golden test, checks out with full history, and checks out a pull request's head commit (not the synthetic merge) so `blueprint/self.json` is checked against the history a developer has. CI installs Chromium (`playwright install --with-deps chromium`) for the browser e2e tests. EkBill's tests (`tests/*.ekbill.test.ts`, project `ekbill`) are included only where `work/ekbill/site.json` exists: on this machine and in its watcher, not in CI (EkBill's remote is private). Real-vendor tests live in `*.vendor.test.ts`, are tagged `@vendor`, and run only with `RAMA_VENDOR_TESTS=1`.

## Deployment

One box. `docker-compose.yml`: `db` (Postgres 16) always; `app` and `watcher` under the `stack` profile (`docker compose --profile stack up`). The host workflow is `pnpm dev`. Full deploy is Stage 6.

## What changed

- 2026-10-19: document created before Stage 0.
- 2026-10-20, Stage 0: monorepo wired (pnpm workspaces, Node 22, TypeScript 6.0.3); `apps/rama` with `/`; `packages/shared` types and generated `docs/BLUEPRINT.md`; `packages/db` with `sites`, `people`, `model_calls`, `audit_log`, one migration, append-only triggers, seed; `packages/model` `call()` with the vendor guard; watcher, `pnpm dev`, CI workflow; compose gains `app` and `watcher` under the `stack` profile.
- 2026-10-20, Stage 1: `packages/blueprint` (extractor, metrics, diff, glossary drafting, `rama` CLI); Blueprint schema extended (`BrickNode.envDynamic`, `ImportEdge.typeOnly`, `Commit.changes[].from`, `Blueprint.worktree`, `Blueprint.unresolved`, `external[].dev` and `.manifest`); prompt `glossary.v1`; `.rama/layers.json` for this repository; `blueprint/self.json` checked in with a watcher and CI drift check; `/api/health`; CI clones the golden target.
- 2026-10-20, Stage 2: the Site. `apps/rama/canvas` (layout, timeline, frame, draw, pick), the site view with replay, links, zoom and brick finder, the inspector (Trust report, Commit, Brick with English edges and Confirm), `/site/[siteId]` with Showroom and site-office stubs, `POST /api/site/[siteId]/confirm` (overlay write + `audit_log`); `packages/blueprint` gains `site` (`rama site add|extract|check|draft|list`), `register`, the purposes overlay and `overlay: 'worktree'`, `draftPurposes` (prompt `purpose.v1`), browser-safe metrics with `brickFigures`, `testCoverage`, `historySpan`, `commitTotals`, `commitBreakdown`, `brickHistory`, `screensOf`, `dependenciesByFloor`; this repository's `.rama/glossary.json` and `.rama/purposes.json` (drafts); Playwright in CI.
- 2026-10-23, Stage 4: the ceremony. Tables `discovery_sessions`, `discovery_turns`, `decisions`, `signoffs` (append-only by trigger; decisions and signoffs audited by trigger); `packages/ceremony` (records and the supersede chain, store with `.rama/*.jsonl` mirrors, gate, walkthrough, imports, discovery drafts, CLI `rama-ceremony`, `ci/rama-gate.yml`); `rama gate`; `signatureCoverage` and `brickMarks` in metrics; walkthrough and site office pages and five ceremony routes; trails carry their screen's signature; Procurement Studio added as a site with the weekend's reconstructed session; EkBill's decisions log imported as reconstructed cards.
- 2026-10-20, Stage 3: Showroom and trails. `packages/trace` (capture, sandboxed re-execution, trails, showroom; CLI `rama-trace`); `docs/HOUSE-STYLE.md`; `/site/[siteId]/showroom` real (hotspots, strip, trail panel); `GET /api/site/[siteId]/shots/[name]`; "On screen" thumbnails in the Brick view; `Trail.result` and `Trail.reexecutionError`, `FigureRef.text` added to the shared types; EkBill's `.rama/screens.json`, `.rama/figures.json` and `.rama/trails/` in its working clone; `packages/model/src/prices.ts` and `pnpm cost`; drafting follows re-export files.
