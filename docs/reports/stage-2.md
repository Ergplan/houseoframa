# Stage 2 — The Site

Date: 2026-10-20. Tag at start: `stage-2-start` (cdc888d). Builder: Claude Opus 5.5 (Claude Code). Drafting model: `claude-sonnet-5-5` (builder vendor). Independent reviewer: OpenAI `gpt-6.1-sol` through `packages/model` (prompt `reviewer.v1`).

## What was built

- **The building renderer** (`apps/rama/canvas`). It is ported from `reference/weekend-prototype/house-of-rama.html` as pure functions over a Blueprint, then made data-driven.
  - `layout(blueprint)` returns the scene. Floors are the layers, bottom to top. Bricks are the files, width log-scaled by lines, between 18 and 150 px. There is a scaffold per branch and a crane per builder in order of their first commit, plus the Showroom door, the site office and the sign. It is deterministic: the same Blueprint gives the same scene to the pixel, whatever the node order. The building's width grows with the site, so EkBill's 916 bricks fit in one building; the prototype's fixed 440 px could not hold them.
  - `timeline()` makes one lift per commit. Inside a lift, bricks go in lower floors first, each with an equal slot of progress. A change is "add" in the commit that laid the brick, "demolish" when it deletes 20 or more lines (from `metrics.demolitions`), else "modify".
  - `frame(state)` holds everything visible at one instant as plain data, with `state = {blueprint, commitIndex, progress, selection, glow, audit}` plus hover, links and an animation clock. That covers bricks built or on the crane hook, the active crane, the JCB at a demolition with dust, the banner, import cables, glow, selection and audit verdicts. The sky comes from the commit timestamps, read in each commit's own time zone: day, dusk and night with sun, stars and lit windows.
  - `draw(ctx, state)` paints a frame. `pick()` finds what is under a point (only built bricks, the door after the first lift, the office).
- **The site view** (`components/site/SiteView`).
  - The canvas has a replay deck: Play/Pause, previous and next commit, Speed 1×/2×/4×, `Links` to draw the import cables of the hovered brick, and `Zoom 1:1` against fit-to-width.
  - A commit track has one stop per lift. The clock shows the replay time in the commit's zone.
  - A brick finder (path with completion) opens any brick from the keyboard.
  - The site opens on the finished building, so every brick can be inspected at once.
  - The door leads to the Showroom and the site office to Discovery. Both are stubs that say which stage fills them.
- **The inspector** (`components/inspector`). Every figure is a call into `@rama/blueprint/metrics`.
  - **Trust report:** test coverage, files, lines, commits, history span, builders, branches, import links, env vars, the heaviest code brick, the load-bearing brick, the most reworked brick, and walls knocked out.
  - **Commit (lift):** when, who, lines added and deleted, tests added, and new, renovated and knocked-out bricks.
  - **Brick:** the purpose (confirmed with who and when, an unconfirmed draft, or "No purpose recorded").
    - The reviewer paragraph names the bricks it needs by floor and how many rely on it. It warns when four or more do and no test stands behind it.
    - Size, floor and the rule that placed it, when it was laid, rework, and test state.
    - Env vars, including "names computed at run time".
    - Depends on and Used by, each edge with its English phrase and a state: confirmed, unconfirmed draft, or unknown. Unknown means "no English yet for …"; a phrase is never invented.
    - The screens it is behind, and its change history.
- **Confirm.** Every unconfirmed phrase and purpose has a Confirm control, shown only when a local member is configured (`RAMA_MEMBER_NAME`; no auth until Stage 6).
  - It posts to `POST /api/site/[siteId]/confirm` with the text as shown.
  - The handler finds the member's person id, then writes the confirmation into the target's own `.rama/glossary.json` or `.rama/purposes.json` in its checkout (path-qualified, with `confirmedBy` and `confirmedAt`), and regenerates the site's Blueprint.
  - It then appends an `audit_log` row per confirmed key. If that row cannot be written, the overlay is put back byte for byte (503).
  - A phrase that changed since it was shown is refused (409).
- **Sites** (`packages/blueprint/src/site.ts`, CLI `rama site …`).
  - `rama site add <gitUrl|path> [--id] [--name]` clones into `work/<id>/repo` and records `work/<id>/site.json` without credentials. It extracts `work/<id>/blueprint.json` and registers the site in Postgres for the local member.
  - `rama site extract|check|draft|list`. `self` is this repository and its `blueprint/self.json`; `pnpm extract:self` and `check:self` now go through `rama site`.
  - A site's Blueprint reads code, history and refs from HEAD and the `.rama/` overlays from the working copy (`overlay: 'worktree'`). So a confirmation shows without committing anything into the target, and the branches stay.
- **Purposes.** `.rama/purposes.json` fills `BrickNode.purpose`, which §8 defines but Stage 1 never filled (a bug, fixed test-first). `rama site draft` drafts purposes (prompt `purpose.v1`) and phrases (`glossary.v1`) through `packages/model`. The drafts are unconfirmed, never overwrite an entry, and are saved after every batch; a batch that still fails after retries is logged and skipped.
- **Routes:** `/site/[siteId]`, `/site/[siteId]/showroom` and `/site/[siteId]/discovery` (stubs), `POST /api/site/[siteId]/confirm`, and `/` now lists the sites.

## The two sites

| Site                                    | Commit              | Bricks | Floors                                    | Named import edges with English | Bricks with a purpose |
| --------------------------------------- | ------------------- | ------ | ----------------------------------------- | ------------------------------- | --------------------- |
| `self` (`blueprint/self.json`)          | worktree on 335e537 | 166    | 7 (this repository's `.rama/layers.json`) | 153 of 198                      | 151 of 166            |
| `ekbill` (`work/ekbill/blueprint.json`) | 8c46a81             | 916    | 8 (drafted overlay, below)                | 1,038 of 1,300                  | 682 of 916            |

The self row is what `self.json` held when this report was drafted; it changes with every commit.

- Every drafted text is unconfirmed until the member confirms it. None are confirmed yet; the only confirmations made this stage were in tests, on throwaway sites.
- On EkBill, 224 bricks have no purpose and none was asked for: binary or empty files such as fonts and images. A further 10 have no purpose because their batch failed (Skipped).
- Edges without English are mostly imports through barrel files (`export * from …`). The model is shown the declaration in the barrel, which does not hold the symbol, so it leaves the phrase out rather than guess (KNOWN-GAPS).

**EkBill's floors** (your answer 1). A drafted overlay, `work/ekbill/repo/.rama/layers.json`, places all 916 bricks with none on the fallback rule (Stage 1: 801). It awaits your confirmation (question 1). The floors, bottom to top:

| Floor      | Bricks | What it holds                                       |
| ---------- | ------ | --------------------------------------------------- |
| foundation | 81     | manifests, config, CI, deploy, scripts              |
| data       | 83     | `packages/db`, prompts, engine rules, `public/`     |
| logic      | 77     | engine, AI, render, copy, `apps/web/server`, worker |
| api        | 22     | API routes and `apps/web/actions`                   |
| interface  | 116    | `apps/web/screens`, `packages/ui`                   |
| design     | 130    | the design pack                                     |
| tests      | 316    | all tests, wherever they live                       |
| shell      | 91     | app routes, layout, docs                            |

## Tests

212 tests in 28 files, all passing in the watcher:

| Package           | Tests |
| ----------------- | ----- |
| `@rama/blueprint` | 125   |
| `@rama/app`       | 58    |
| e2e               | 9     |
| model             | 12    |
| db                | 5     |
| shared            | 3     |

The stage's required tests:

- **Layout determinism** (`canvas/layout.test.ts`): the same scene from the same Blueprint, from a reordered one, and from `blueprint/self.json` cloned. Also no overlapping bricks on a real repository, width bounds, untested and binary markers, cranes, scaffolds, and a target's own floor.
- **Brick picking** (`canvas/pick.test.ts`): it picks a built brick, misses one not yet laid and empty space, finds the door only after the first lift, and maps a pointer on a scaled canvas.
- **Reviewer-paragraph wording for 0, 1 and 4 dependants** (`components/inspector/words.test.ts`). The 4-dependant case is tested both with and without a test behind the brick, alongside edge phrases for side-effect, default, namespace and type-only imports.
- **Confirm writes an overlay entry** (`packages/blueprint/src/site.test.ts` and the route's `handler.test.ts`). Covered: the entry with member and time; the Blueprint showing it confirmed; a bare phrase copied path-qualified; already confirmed; a changed phrase refused; unknown edge, no phrase, no member; partial edges reporting missing symbols; restore on audit failure; 503 with nothing written when the person cannot be found.
- **e2e** (`tests/stage-2.e2e.test.ts`, real dev server, real Chromium):
  - It opens `/site/self`, clicks a brick where the deterministic layout puts it (`packages/blueprint/src/site.ts`), and reads every dependency row: path, English and state.
  - On a throwaway clone with a throwaway database, it clicks Confirm and checks four things: the inspector shows "confirmed by", the overlay file has the entry, the regenerated Blueprint is confirmed, and `audit_log` has exactly one row.
  - It also checks the stubs and a 404.

Also tested:

- `timeline`: lift order, event kinds, brick states, the clock in the commit's own zone, and bricks outside the history.
- `frame`: cleared site, hook, JCB, completion, cables, glow, verdicts and sky.
- `draw`, with a recording context.
- The inspector's three views, rendered: Confirm only on drafts and only with a member.
- The site page and stubs; the home page's site list.
- `registerSite` against a throwaway Postgres.
- The purposes overlay and `overlay: 'worktree'`; drafting purposes, including skipping a failed batch.
- The new metrics.

## Skipped, and why

- **10 EkBill files have no drafted purpose.** One batch, the one holding `packages/engine/src/customer.ts`, got a reply that is not valid JSON on all three attempts, in two separate runs. `packages/model` keeps only the first 200 characters of a bad reply, which is not enough to diagnose it. The files show "No purpose recorded".
- **Screens on the Brick view are listed by route only.** Screenshots are Stage 3, and decisions in the site office are Stage 4.
- **EkBill is not in CI** (private remote). `/site/ekbill` was exercised on this machine, including screenshots of the building and the inspector with no browser errors.

## Deviations from the prompt

- **`packages/blueprint` was touched beyond bug fixes.** The stage prompt says "Do not touch packages/blueprint except bug fixes found while rendering (each one a test first)". Each change, with its reason:
  - **Bug fix, test first:** `BrickNode.purpose` was never filled.
  - **Required by the stage:**
    - `rama site add` lives in the `rama` CLI, which is in `packages/blueprint`; hence `site.ts`, `register.ts` and the `site` subcommands.
    - "Confirm writes to the target's `.rama/`" must reach the building, hence `overlay: 'worktree'`.
    - Purposes "from an unconfirmed draft" need a drafter, hence `draftPurposes` and prompt `purpose.v1`.
  - **Required by Invariant 7:** the inspector shows per-brick and per-commit figures, hence `brickFigures`, `testCoverage`, `historySpan` and `commitTotals`. `isCode` moved to `files.ts` so the browser can import the metrics.
  - **Unchanged:** extraction itself. The Stage 1 golden test still matches §7.1 exactly.
- **`packages/db`:** `MIGRATIONS_DIR` is built with `path.join`. Turbopack failed to build any route importing `@rama/db` while it was `new URL(…, import.meta.url)`.
- **Playwright arrives in Stage 2, not Stage 3**, because the stage's e2e clicks a canvas. It is pinned at 1.64.1 and used for tests only. CI installs Chromium with its system libraries. On this VM, Chromium's system libraries were installed with `sudo playwright install-deps chromium` (apt).
- **`pnpm dev` was restarted.** The watcher started in Stage 0 was still the Stage 0 script and did not type-check `packages/blueprint` or `scripts`. The restart also makes `/api/health` report the current commit.
- **The confirming e2e runs on a throwaway fixture site, not EkBill**, so the test never writes into a real target. CI cannot clone EkBill.

## Reviewer findings

(To be filled from `docs/reports/stage-2.review.md` after the run.)

## Real model cost

From `model_calls` (tokens; there is no price table in code):

| Purpose                  | Model             | Calls (attempts) | Input tokens  | Output tokens |
| ------------------------ | ----------------- | ---------------- | ------------- | ------------- |
| Self: phrases            | claude-sonnet-5-5 | 5 (5)            | 40,511        | 16,027        |
| Self: purposes           | claude-sonnet-5-5 | 16 (16)          | 108,564       | 10,097        |
| EkBill: phrases          | claude-sonnet-5-5 | 41 (41)          | 341,337       | 93,220        |
| EkBill: purposes         | claude-sonnet-5-5 | 69 (70)          | 576,526       | 47,503        |
| EkBill: purposes, failed | claude-sonnet-5-5 | 2 (6)            | 61,764        | 4,066         |
| **Drafting total**       |                   | **133 (138)**    | **1,128,702** | **170,913**   |

Reviewer runs are added below this table.

## Open questions

1. **EkBill's floors.** Do you confirm the drafted overlay (the eight floors above, with `design` and `tests` as floors of their own), or do you want changes? If you confirm, I'll record it in DECISIONS with your name and date.
2. **Where EkBill's `.rama/` lives.** The drafted layers, glossary and purposes, and every confirmation you make, sit in the working clone under `work/ekbill/repo` (gitignored here, uncommitted there). House of Rama never pushes to a target. Should the EkBill team commit `.rama/` into EkBill, so that its CI, the gate in Stage 4 and every fresh clone see them? Or should it stay local until Stage 4?
3. **Barrel imports.** Should drafting follow `export * from` to the file that declares the symbol? That would fill most of the remaining "no English yet" edges. It is a `packages/blueprint` change, so I'd do it at the start of Stage 3 with a test first.
4. **The failing batch.** May I make `packages/model` keep the full reply when it is not valid JSON (in `model_calls.error`)? Then the 10 missing EkBill purposes can be diagnosed and redrafted. It is one line plus a test.
