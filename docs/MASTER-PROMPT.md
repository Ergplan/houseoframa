# House of Rama — Master Prompt

Built on trust. This document drives the build of House of Rama from an empty monorepo to the floor edition that runs on the agent pods. It is committed once; after that the agent reads it from disk, one stage per session.

## 0. How to use this prompt

- Sections 1–4 are copied verbatim into `CLAUDE.md` and are in context for every session. If the two ever differ, `CLAUDE.md` is wrong; fix it from here.
- The user's whole interface after Stage 0 is one line: `Run Stage N of docs/MASTER-PROMPT.md`. The agent reads this file, runs the stage, runs the independent reviewer, writes `docs/reports/stage-N.md`, and STOPS.
- A stage report states: what was built; what was skipped and why; deviations from the prompt; reviewer findings and their fixes; open questions, numbered; real model cost for the stage.
- The user answers open questions in one numbered message. Vague answers get vague architecture; the agent may ask once for a precise one.
- Reference inputs: `reference/weekend-prototype/` (the artifact built on 17 Oct 2026: a working single-page House of Rama over the Procurement Studio repo; its extractor, trails, discovery and audit scripts), `reference/ekbill/` (the first target, a Next.js billing app for small Indian businesses), `reference/procurementstudio/` (the second target). All read-only.

## 1. Operating rules

(See `CLAUDE.md` §1. Verbatim.)

## 2. Invariants

(See `CLAUDE.md` §2. Verbatim.)

## 3. Locked decisions

(See `CLAUDE.md` §3. Verbatim.)

## 4. Folder layout, continuous testing, living documents

(See `CLAUDE.md` §4. Verbatim.)

## 5. Plan

Sequenced by what becomes permanent earliest: the Blueprint schema and the signature record first, interface polish last. Six stages, roughly six weeks, each ending at a hard STOP.

| Stage | Name | What becomes permanent | Target |
| --- | --- | --- | --- |
| 0 | Foundation | Monorepo, watcher, CI, Postgres, `packages/shared` types | — |
| 1 | Blueprint | The Blueprint schema and extractor; `rama extract` | Procurement Studio, EkBill, self |
| 2 | The Site | The building renderer, inspector, English dependencies | Self, EkBill |
| 3 | Showroom and trails | Screen capture, figure instrumentation convention, trails | EkBill |
| 4 | Ceremony | Decisions, signatures, the merge gate, walkthrough | EkBill |
| 5 | Audit | Second-vendor auditor, report, replay | EkBill, self |
| 6 | Floor edition | Members, bookings, triptych, campus, deploy | Prototype pod |

Week 3 checkpoint (after Stage 3): EkBill rendered, traced, walked through and signed by the user. Week 6 checkpoint (after Stage 6): ten members through the prototype pod.

## 6. Stage prompts

### Stage 0 — Foundation

```
Stage 0 builds the monorepo and the safety rails. It adds no product behaviour.

Do not touch: anything under reference/.

Set up:
- pnpm workspaces per the folder layout; Node 22 pinned in .nvmrc and package.json engines.
- apps/rama: a minimal Next.js App Router app with one route (/) that renders "House of Rama · Built on trust" and the git short SHA from an env var.
- packages/shared: the Blueprint, Trail, Decision, Signoff, Finding types (see §8). Exported, documented with one line per field. docs/BLUEPRINT.md is generated from these types by scripts/gen-blueprint-doc.mjs.
- packages/db: Drizzle + Postgres 16 via docker-compose.yml. Tables: sites, people, model_calls, audit_log. Every table has site_id (nullable only on people), created_at, created_by. One migration. A seed with one site ("self") and one person (the user; name from .env).
- packages/model: one function `call({name, version, input})` that loads prompts/<name>.v<version>.md, routes to the vendor named by BUILDER_VENDOR or AUDITOR_VENDOR, retries twice, writes a model_calls row, returns typed output. Vendor adapters for anthropic and openai. A test that the runner refuses when AUDITOR_VENDOR === BUILDER_VENDOR.
- scripts/watch.mjs and .github/workflows/check.yml per CLAUDE.md §4. The watcher must be green on an empty repo.
- docs/ARCHITECTURE.md, docs/DECISIONS.md (first entry: the locked decisions, dated), docs/KNOWN-GAPS.md, docs/reports/.
- .env.example with DATABASE_URL, BUILDER_VENDOR, AUDITOR_VENDOR, ANTHROPIC_API_KEY, OPENAI_API_KEY, RAMA_MEMBER_NAME, GIT_SHA.

Tests: packages/model vendor-guard test; packages/db migration applies and seed runs; apps/rama route renders.

Done when: `pnpm install && pnpm dev` starts app, Postgres and watcher; `.watch/status.json` is ok:true; CI config is valid; the stage report is written. STOP.
```

### Stage 1 — Blueprint

```
Stage 1 builds the Blueprint: the generated, machine-maintained model of a repository that everything else renders. It is the most permanent thing in the product; get the schema right.

Do not touch: apps/rama beyond a /api/health route.

packages/blueprint:
- `extract(repoPath, opts): Blueprint` reading only git and the file tree. Port reference/weekend-prototype/extract.py to TypeScript, then exceed it.
- Nodes: one per tracked file: path, layer, lines, bytes, binary, test (boolean), exports (names), env vars read, first commit, last commit, change count.
- Layers: derived from a per-target `.rama/layers.json` overlay if present, else from the house-stack defaults (foundation, data, logic, api, interface, shell). Record which rule assigned each node.
- Edges: resolved internal imports with the imported symbols; external dependencies as a separate list.
- Commits: full history (oldest first) with per-file add/del/kind (A/M/D/R) and author; branches; tags.
- Screens: routes discovered from the Next.js app/ tree (path pattern, file). No screenshots yet.
- Metrics (packages/blueprint/metrics): files, text lines, tests, commits, authors, branches, import edges, env vars, untested bricks, load-bearing (top importers), most reworked. These functions are the only source of these numbers anywhere in the product (Invariant 7).
- CLI: `rama extract <repoPath> [--out file]` and `rama diff <a.json> <b.json>`.
- Overlay: `.rama/glossary.json` in the target (symbol → English phrase, with `confirmedBy` and `confirmedAt` or absent). The extractor merges it into edges as `english` with `confirmed: boolean`. Phrases with no confirmation are marked unconfirmed (Invariant 6). Draft unconfirmed phrases with packages/model (prompt glossary.v1) only when `--draft-glossary` is passed; never silently.
- Determinism: extracting the same commit twice yields byte-identical JSON (sorted keys, stable ordering).

Run it on reference/procurementstudio (expect 34 nodes, 50 edges, 6 commits, 0 tests, 13 env vars — the weekend numbers), on reference/ekbill, and on this repository (blueprint/self.json, checked in, regenerated by the watcher and CI).

Tests: unit per layer rule, per import resolver case (alias, relative, index, type-only), per metric; a golden test on procurementstudio against the weekend numbers; determinism test; overlay merge test.

Done when: three blueprints extract; the golden numbers match; self.json is checked in and CI fails on drift; docs/BLUEPRINT.md regenerates; reviewer run; report written. STOP.
```

### Stage 2 — The Site

```
Stage 2 renders a Blueprint as a building and makes every brick inspectable in English. Port the weekend prototype's renderer from reference/weekend-prototype/house-of-rama.html into apps/rama/canvas as pure functions over a Blueprint, then make it data-driven.

Do not touch: packages/blueprint except bug fixes found while rendering (each one a test first).

apps/rama/canvas:
- layout(blueprint) → floors, bricks (x,y,w,h), scaffolds (branches), cranes (authors). Brick width log-scaled by lines. Deterministic.
- draw(ctx, state) where state = {blueprint, commitIndex, progress, selection, glow, audit}. The sky's time of day comes from the commit timestamps. JCB on any commit that deletes ≥ 20 lines from a file. Door to the Showroom; site office for Discovery (both stubs in this stage).
- Timeline replay of commits; speed; links toggle drawing import cables.

apps/rama components:
- Inspector: Trust report (metrics), Commit (lift), Brick. The Brick view shows: purpose (from overlay or unconfirmed draft), the reviewer paragraph (needs N bricks by floor; M rely on it; the warning when ≥ 4 dependants and no test), Depends on / Used by with the English phrase per edge and its confirmed/unconfirmed state, env vars, change history.
- Every unconfirmed phrase has a "Confirm" control that writes to the target's .rama/glossary.json via a local write path (work/<site>/repo) and records who confirmed. (No auth yet: the local member.)

Routes: /site/[siteId] renders the building for a site whose repo is cloned under work/. `rama site add <gitUrl|path>` clones and extracts.

Tests: layout determinism; brick picking; reviewer-paragraph wording for 0, 1, 4 dependants; confirm writes an overlay entry; e2e: open /site/self, click a brick, read its dependencies.

Done when: /site/self and /site/ekbill render from their blueprints; every brick is inspectable; House of Rama renders itself (rule 14); reviewer run; report. STOP.
```

### Stage 3 — Showroom and trails

```
Stage 3 photographs the real screens and makes figures on them traceable. This is the convention the house stack must follow; write it down in docs/HOUSE-STYLE.md and apply it to EkBill via an overlay, not by editing EkBill.

packages/trace:
- Capture: Playwright drives the target's built app (`pnpm build && pnpm start` in work/<site>/repo, no vendor keys) through `.rama/screens.json` (route, role, steps, name). Screenshots to work/<site>/shots; each screen records the bricks that render it (from the route's import closure in the Blueprint).
- Figure convention (docs/HOUSE-STYLE.md): a traceable figure is a DOM element with data-rama-figure="<figureId>"; the target exports `rama/figures.ts` mapping figureId → {fn, file, line, inputs: [{label, source}]}. EkBill does not have this yet, so Stage 3 ships an overlay `.rama/figures.json` for EkBill written by hand for its five headline figures (GST quarter total, dues total, a bill total, a track-record style score if present, the walk-in bill total) and marks every other figure untraced (Invariant 2).
- Trail builder: trail(figureId) → {figure, title, formula: {english, code, file, line}, inputs: [{label, value}], data: [where each input lives: table/column, file constant, browser storage], build: [commits touching the trail's files], signoff: null | Signoff}. Values come from re-executing the target's own function in a sandbox (vitest worker importing the target's module) with the captured screen's inputs; if re-execution is impossible, the trail says so and shows no value rather than a retyped one.

apps/rama:
- Showroom overlay: real screenshots, strip of screens, hotspots over traceable figures (positions from Playwright bounding boxes, stored with the capture), untraced figures outlined grey.
- Trail panel: the five sections from the weekend prototype (formula, inputs, where the data lives, build trail, review & sign-off, the last one empty until Stage 4).
- Brick inspector gains "On screen" thumbnails.

Tests: capture on ekbill produces ≥ 8 screens; each screen lists ≥ 1 brick; the five EkBill trails re-execute and match the on-screen text; an untraced figure renders in the untraced state; e2e: open Showroom, click a hotspot, read the formula.

Done when: EkBill's Showroom shows its real screens with five traced figures and the rest marked untraced; the house-style document exists; reviewer run; report. Week-3 checkpoint: the user walks EkBill end to end. STOP.
```

### Stage 4 — Ceremony

```
Stage 4 adds the people: discovery decisions, signatures, the merge gate and the walkthrough. Signatures are the second most permanent thing in the product.

packages/ceremony:
- Decisions: a session is a list of turns (speaker role, text, at) and decision cards {id, title, statement, bricks[], screenId?, status: decided|open|not-built}. Stored in `decisions` (Postgres) and mirrored to the target's `.rama/decisions.jsonl` so the record travels with the code. Cards link to bricks by path and to screens by id.
- Signoffs: `signoffs` table and `.rama/signoffs.jsonl`: {id, person, target: {kind: screen|brick, id, commit}, statement, at, supersedes?}. Append-only, enforced by a Postgres rule (no UPDATE/DELETE) and a test. Every write also appends audit_log (Invariant 8).
- Gate: `rama gate <repoPath> --base <commit>`: lists screens whose bricks changed since base; for each, requires a signoff at or after the change commit OR a passing test file among its bricks; exits non-zero with a readable list otherwise. Ships as a GitHub Actions workflow the target includes. The gate ignores configuration inside the target that would disable it (Invariant 4).
- Walkthrough script: for a site, an ordered list of screens with the person to ask, the statement to confirm (from the decision cards and figures), and the trails to show. Narrated by SpeechSynthesis in the app; each confirmation creates a signoff.

apps/rama:
- Discovery overlay (site office): run a live session: turns typed or dictated, Rama's questions drafted by packages/model (prompt discovery.v1) and marked as drafts, decision cards written at the moment the user confirms them. The reconstructed EkBill session from the weekend is imported as the first record, flagged `reconstructed`.
- Walkthrough mode: screen by screen, name called, Confirm / Not yet; signing a screen turns its bricks' red dots green when a test exists, amber-signed otherwise. The trail panel's sign-off section fills.
- Trust report shows signed/unsigned counts from packages/blueprint/metrics (one engine).

Tests: append-only enforced (UPDATE and DELETE fail); gate passes/fails on crafted fixtures (changed screen with signature, without, with test); supersede chain; e2e: run a walkthrough on EkBill, sign two screens, gate passes for those and fails for an unsigned changed screen.

Done when: the user has signed EkBill's five traced screens under their own name; the gate runs in EkBill's CI config (as an overlay in work/, not pushed); reviewer run; report. STOP.
```

### Stage 5 — Audit

```
Stage 5 adds the second opinion. The auditor is a different vendor from the builder (Invariant 5) and never edits code.

packages/audit:
- Checks (plain code, no model): typecheck, build, test run and coverage per brick, silenced lint, swallowed errors, any-types, hard-coded constants in formula files, browser-storage writes, env-name fallbacks, unauthenticated long-running routes, three-or-N assumptions on sorted arrays, unsigned changed screens (from the gate), unconfirmed glossary phrases, decisions marked open or not-built.
- Verdicts: per brick pass | note | defect with the finding text and file:line; the auditor model (prompt audit.v1, via packages/model with AUDITOR_VENDOR) receives the check results and the Blueprint and returns: the narration script (floor by floor), the alterations list with agent-time and human-time estimates, the time-machine list (commit → what should have happened), and a signed report {reportId, vendor, model, at, inputsHash}. The model may not add a defect the checks did not find; it may downgrade or explain. A test asserts this.
- Report persisted to `audits` and `findings`, append-only, audit_log.

apps/rama:
- Audit mode: two drones fly the floors, beam per brick, badges stay on the building, live log, narration spoken; report panel with sign-offs confirmed/rejected, alterations, time machine, who did what; "Light the defects".
- The brick inspector shows its latest verdict.

Run on EkBill and on self. The self audit must be clean of defects before STOP (notes allowed, listed in KNOWN-GAPS).

Tests: each check on a fixture that triggers it and one that does not; the model-may-not-add-defects test; vendor guard; report hash reproducible; e2e: run the audit on ekbill and read the report.

Done when: EkBill has a signed audit report from the auditor vendor; self audit has zero defects; reviewer run; report. STOP.
```

### Stage 6 — Floor edition

```
Stage 6 turns the single-member app into the pod floor's product. Security that was deferred lands here, fully.

- Auth: email magic link (no passwords). `people` gains email; sessions table. Every route under /site, /showroom, /audit, /campus requires a session; a site belongs to a member; a member sees only their sites. Tests for every route's authorization.
- Bookings: `bookings` {pod, member, shift, starts, ends, siteId}. Opening /pod/<n> during a booking loads that site. Status for the pod light: blue (work), amber (awaiting sign-off), green (signed and audited), pink (game mode) exposed at /api/pod/<n>/status for the pod controller.
- Triptych: a layout for three 3840×2160 screens: left Discovery, centre Site, right Showroom; a single-screen fallback remains. Narration through the headset via SpeechSynthesis.
- Campus: /campus for the floor manager: every pod, its site and phase, signatures pending by name, audits passed, products in use at 90 days (a member-reported check-in, recorded). Numbers from packages/blueprint/metrics.
- Handover: on a site's final signed audit, generate the structural certificate (which bricks are load-bearing: a `.rama/structure.json` overlay confirmed by a named person) and the keys page (repo URL, deploy, how to request a change through the same ceremony). The Bharat self-edit flow itself is out of scope; the certificate is not.
- Deploy: docker-compose for one box (app, Postgres, watcher, Playwright), documented in docs/DEPLOY.md; backups of Postgres nightly.

Tests: authorization per route; booking → site mapping; pod status transitions; campus numbers equal metrics; e2e: a member books a pod, opens the triptych, signs a screen, the pod status changes.

Done when: deployed on the prototype pod box; two members (the user and one other) complete the loop on real sites; reviewer run; report. Week-6 checkpoint: ten members. STOP.
```

## 7. Reference data

### 7.1 Weekend numbers for the golden test (Procurement Studio at fac615d)

files 34 · text lines 3,933 · commits 6 · authors 2 · branches 1 · import edges 50 · env vars 13 · tests 0 · heaviest text brick lib/data.ts (367 lines, package-lock excluded) · load-bearing lib/data.ts (12 importers) · most reworked README.md (6 of 6 commits) · demolitions: commits 3 and 6 on components/RealTalk.tsx.

### 7.2 Layer rules (house-stack default)

foundation: package manifests, tsconfig, next.config, vercel.json, .env.example, .gitignore, proxy/middleware, lib/server/**  ·  data: lib/data*, lib/history*, schema and migrations, public/**  ·  logic: lib/** not matched above  ·  api: app/api/**  ·  interface: components/**  ·  shell: app/layout*, app/page*, app/globals.css, README.

### 7.3 Audit check names (Stage 5)

typecheck, build, test-coverage-per-brick, silenced-lint, swallowed-error, any-type, magic-constant-in-formula, browser-storage-write, env-fallback, long-unauth-route, positional-assumption, unsigned-change, unconfirmed-glossary, open-decision.

## 8. Shared types (packages/shared, Stage 0)

```ts
type Layer = 'foundation' | 'data' | 'logic' | 'api' | 'interface' | 'shell' | string;
interface BrickNode { path: string; layer: Layer; layerRule: string; lines: number; bytes: number; binary: boolean; test: boolean; exports: string[]; env: string[]; firstCommit: string; lastCommit: string; changes: number; purpose?: { text: string; confirmed: boolean; by?: string; at?: string } }
interface ImportEdge { from: string; to: string; symbols: string[]; english?: { text: string; confirmed: boolean; by?: string; at?: string } }
interface Commit { sha: string; short: string; at: string; author: string; subject: string; changes: { path: string; kind: 'A'|'M'|'D'|'R'; add: number|null; del: number|null }[] }
interface Screen { id: string; name: string; route: string; file: string; bricks: string[]; shot?: string; figures?: FigureRef[] }
interface FigureRef { id: string; box: { x: number; y: number; w: number; h: number }; traced: boolean }
interface Blueprint { repo: string; commit: string; extractedAt: string; extractorVersion: string; layers: { id: Layer; label: string }[]; nodes: BrickNode[]; edges: ImportEdge[]; external: { name: string; version: string }[]; commits: Commit[]; branches: string[]; tags: string[]; screens: Screen[] }
interface Trail { figureId: string; title: string; what: string; formula: { english: string; code: string; file: string; line: number }; inputs: { label: string; value: string | null; source: string }[]; data: string[]; build: { sha: string; at: string; author: string; subject: string; file: string }[]; signoff: Signoff | null; reexecuted: boolean }
interface Decision { id: string; siteId: string; title: string; statement: string; bricks: string[]; screenId?: string; status: 'decided'|'open'|'not-built'; by: string; at: string; reconstructed?: boolean }
interface Signoff { id: string; siteId: string; person: string; target: { kind: 'screen'|'brick'; id: string; commit: string }; statement: string; at: string; supersedes?: string }
interface Finding { id: string; auditId: string; brick: string; check: string; verdict: 'pass'|'note'|'defect'; text: string; file?: string; line?: number }
```

## 9. Definition of done

| Stage | Checks before STOP |
| --- | --- |
| 0 | `pnpm dev` runs app + db + watcher; status.json ok; CI valid; vendor guard test passes; seed creates site "self" |
| 1 | Three blueprints extracted; golden numbers match §7.1 exactly; byte-identical re-extract; self.json in CI with drift check; BLUEPRINT.md regenerates; reviewer: no new code defect |
| 2 | /site/self and /site/ekbill render; every brick inspectable with English edges; confirm writes overlay; layout deterministic; reviewer |
| 3 | ≥ 8 EkBill screens captured; 5 trails re-execute and match on-screen text; untraced state renders; HOUSE-STYLE.md exists; user walks EkBill end to end; reviewer |
| 4 | Append-only enforced in DB and tested; gate fixtures pass/fail correctly; user has signed 5 screens by name; walkthrough narrates; reviewer |
| 5 | EkBill audit report signed by auditor vendor; model-cannot-add-defects test; self audit zero defects; reviewer |
| 6 | Every route authorized and tested; booking opens site; pod status API; campus numbers equal metrics; deployed on the pod box; two members complete the loop; reviewer |

Two honest numbers wherever a rate is reported: figures traced over figures shown, and screens signed over screens changed. An untraced figure correctly shown as untraced is never scored as a failure.
