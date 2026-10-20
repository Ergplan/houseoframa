# Decisions

One dated entry per decision. Newest first. Locked decisions (CLAUDE.md §3) are recorded here on the day they were taken.

## 2026-10-20 — Stage 3: Showroom and trails

- **Re-execution runs in a separate Node process, not a vitest worker.** The stage prompt says "vitest worker importing the target's module". EkBill's screen loaders import `server-only` and are meant to run under Next's `react-server` condition, which EkBill's own scripts set with `node --conditions=react-server --import tsx`. The sandbox does the same: a child process in the target's checkout, tsx's full loader (ES modules and CommonJS), the `react-server` condition, and an environment of PATH, HOME and NODE_ENV only. It gives the same isolation as a worker (its own process, the target's own modules, no access to House of Rama's state) and no vendor keys.
- **A figure's mapping lives in the target's code (`rama/figures.ts`) and its arguments on the element (`data-rama-args`, `data-rama-value`).** Re-execution then needs no hand-written glue: the function is called with exactly what the screen used, and its raw result is compared with what the screen declared. `docs/HOUSE-STYLE.md` is the convention.
- **EkBill is traced by overlay, not by editing EkBill**, as the stage requires: `.rama/figures.json` places five figures by CSS selector, and `.rama/trails/*.mjs` harnesses call EkBill's own screen loaders (`loadGst`, `loadDues`, `loadBillView`) for the signed-out demo owner the captured screens are drawn for. They format with the components' own formatter (`formatRupees`, `rupees`). The harnesses build the viewer exactly as EkBill's `getViewer` does with no session; they never compute or retype a figure.
- **The five EkBill figures.** EkBill has no track-record score and no walk-in concept. So: GST this quarter (₹21,483), taxable sales this quarter (₹1,19,350), dues (₹39,914), a bill total (INV-042, ₹7,316, a registered customer), and a "walk-in" bill, read as EkBill's nearest case, a bill to a customer with no GST number (INV-043, Deshmukh ji, ₹5,310, B2C). The taxable figure stands in for the score.
- **Untraced figures are found, not assumed.** A leaf element whose text looks like an amount (`[₹$€£]\s?\d[\d,]*(\.\d+)?`, configurable) and that no traced figure covers is recorded untraced, as is a `data-rama-figure` with no mapping. On EkBill's 12 screens: 7 of 97 figures traced (the five, two of them on two screens), the rest outlined grey.
- **Screens are photographed with no secrets** (PATH, HOME, NODE_ENV only), so only screens a target can draw without a database or a key are captured. EkBill draws every product screen from its Stage 1 fixtures when nobody is signed in, so it needs neither.
- **Full-page screenshots grow the viewport to the page height** before the shot, so fixed bars sit where the user sees them and figure boxes are measured in the same coordinates as the image.
- **A capture is kept per site** in `work/<site>/capture.json` (gitignored) with the mapping, the formula's lines and the re-execution results, so the Showroom is built from the capture and the Blueprint alone. Trails are computed on each request by `buildTrail`, a pure function.
- **`playwright` is a dependency of `packages/trace`** (pinned 1.64.1); Chromium's system libraries are installed on the build VM and in CI.

## 2026-10-20 — Stage 2 open questions, answered by the member (Rachit Agarwal)

- **EkBill's floors confirmed** by Rachit Agarwal on 2026-10-20, as drafted: the eight floors foundation, data, logic, api, interface, design, tests, shell, with `design` and `tests` as floors of their own (`work/ekbill/repo/.rama/layers.json`).
- **EkBill's `.rama/` stays local** in `work/ekbill/repo` until Stage 4. When the merge gate lands, the EkBill team commits `.rama/` into EkBill so its CI and every fresh clone see it (KNOWN-GAPS).
- **Drafting follows `export * from`** through barrel files to the file that declares the symbol (a `packages/blueprint` change, test first), and the edges with no English are redrafted.
- **`packages/model` keeps the full reply** in `model_calls.error` when it is not valid JSON; the 10 EkBill purposes that failed are redrafted.
- **Stage reports show cost in rupees**, from one price table in code with the date it was set.
- `main` and `stage-2-start` pushed.

## 2026-10-20 — Stage 2: the Site

- **Sites live under `work/`.** `rama site add <gitUrl|path> [--id] [--name]` clones the target into `work/<id>/repo` (`--no-hardlinks`, never pushed), records `work/<id>/site.json` (source and repo name without credentials) and writes `work/<id>/blueprint.json`, which is gitignored, like the clone. A private target's Blueprint therefore never enters this public repository. The site `self` is this repository: its Blueprint is the checked-in `blueprint/self.json` (rule 14), and `pnpm extract:self` / `check:self` now run `rama site extract self` / `rama site check self`, so the self options live in one place (`SELF_EXTRACT`). With `DATABASE_URL` set, `site add` also registers the site for the local member, because model calls and audit rows reference `sites`.
- **A site's Blueprint reads code, history and refs from HEAD, and `.rama/` from the working copy** (new `extract` option `overlay: 'worktree'`). A confirmation is written to the clone's overlay and shows on the next extraction without a commit, and branches stay on the scaffolds. Worktree mode would have dropped the refs, and committing into a target's clone would make House of Rama a repository system.
- **Confirm writes the confirmation path-qualified.** Confirming an edge writes `<to>#<symbol>` entries with `confirmedBy` (the local member, `RAMA_MEMBER_NAME`) and `confirmedAt` (ISO time). A bare-symbol draft is copied, not confirmed in place, so the confirmation covers exactly the file the member was looking at. The request carries the text as shown and is refused (409) unless that text equals both the site's Blueprint and the phrase the overlay produces now. Each confirmed key appends an `audit_log` row (`table_name` = the overlay file, `row_id` = the key, `created_by` = the person's id). The person is looked up first, so nothing is written when the database cannot say who confirmed (503). If the audit row cannot be written after the overlay was, the overlay is put back byte for byte and the Blueprint regenerated (503): no confirmation stands without its audit row.
- **Purposes come from `.rama/purposes.json`** (`path` → `{text, confirmedBy?, confirmedAt?}`, the glossary's entry shape). Stage 1 never filled `BrickNode.purpose` although §8 defines it. Fixed in `packages/blueprint` with a test first. Drafts come from `rama site draft <id>` (prompt `purpose.v1`, builder vendor, the first 60 lines of each text file), unconfirmed, never overwriting an entry, saved after every batch so a failed call keeps what was already paid for.
- **The metrics are browser-safe.** `isCode` moved to `files.ts`, so `@rama/blueprint/metrics` no longer pulls in the TypeScript compiler, and the inspector calls the metric functions directly (Invariant 7). New per-figure functions: `brickFigures` (depends on / used by / tested per brick), `testCoverage`, `historySpan`, `commitTotals`, `commitBreakdown` (laid, renovated, knocked out, gone: shared by the Commit view and the replay), `brickHistory`, `screensOf`, `dependenciesByFloor`.
- **Building width grows with the site.** The prototype's 440px building cannot hold EkBill's 916 bricks. The width is chosen so the building is roughly as tall as it is wide (440–2400 scene px), the canvas is drawn at scene size and scaled to fit, and `Zoom 1:1` scrolls it. Floors the target defines for itself get stable colours distinct from the house-stack ones.
- **Cranes and scaffolds are capped** at six each. Further builders share the last crane ("+N more"), and further branches are named on the last board. The figures still count them all.
- **The sky is the commit's own local time** (the offset in its timestamp), not the viewer's zone, so a replay looks the same on every machine. The clock reads `HH:MM UTC±hh:mm`.
- **"Tested" means a test brick imports it directly** (the Stage 1 definition). Tests and non-code bricks show "not applicable" rather than "no test". The reviewer's warning fires at four or more dependants with no test.
- **The site opens on the finished building** (the last lift), so every brick is inspectable at once. Play replays from the cleared site. A brick picked from a link or the finder jumps the replay to the lift that laid it, so it is never selected while invisible.
- **Every brick is reachable without the canvas**: a brick finder (path with completion) opens any brick from the keyboard.
- **Next 16 dev server serves its scripts only to its own origin** (`localhost`). The e2e browser uses `localhost` and `fetch` uses `127.0.0.1`.
- **`packages/db` builds `MIGRATIONS_DIR` with `path.join`.** The app bundler (Turbopack) takes `new URL('../migrations', import.meta.url)` for a static asset and fails to build any route that imports `@rama/db`.
- **EkBill's layers overlay is a draft** in `work/ekbill/repo/.rama/layers.json`: eight floors, with `design` and `tests` of its own. It places all 916 bricks and none falls through to the fallback rule. It awaits the member's confirmation (open question in the Stage 2 report).

## 2026-10-20 — Stage 1 open questions, answered by the member

- EkBill's floors: draft an EkBill layers overlay (`.rama/layers.json` in its working clone) in Stage 2 for the member to confirm. The §7.2 house-stack defaults stay as they are.
- `github.com/Ergplan/houseoframa` stays public.
- Push approved: `main` and the stage tags go to GitHub so CI runs the drift and golden checks there.
- Refs stay in the Blueprint (branches and tags merged into the extracted commit). Re-extraction is byte-identical for a fixed set of refs; adding a ref inside the history changes the Blueprint by design. No sidecar file.

## 2026-10-20 — Stage 1: the Blueprint

- **Schema additions** (additive; MASTER-PROMPT §8 fields unchanged): `BrickNode.envDynamic` (a read of `process.env[x]` the extractor could not name, shown rather than hidden); `ImportEdge.typeOnly` (a type-only import carries no runtime dependency, so screens' import closures skip it); `Commit.changes[].from` (old path of a rename); `Blueprint.worktree`; `Blueprint.unresolved` (internal-looking imports that match no file); `external[].dev` and `external[].manifest` (a monorepo has many manifests).
- **Edges are true; the metric is defined.** A side-effect import (`import './globals.css'`) is an edge with no symbols. The "import edges" figure counts edges that import at least one name, which is what the weekend regex measured (50 on Procurement Studio); side-effect imports are their own figure (1 there). All 51 edges are in the Blueprint.
- **Default imports are recorded as `default`**, the name actually exported, not the importer's local binding (the weekend graph used local names such as `Studio`). The glossary keys them `path#default`.
- **Heaviest brick means heaviest code brick** (JS/TS source). §7.1 calls lib/data.ts (367 lines) the heaviest "text brick, package-lock excluded", but app/globals.css has 401 lines; only the code reading matches the weekend figure.
- **Untested brick** = a non-test code brick that no test file imports directly.
- **`extractedAt` is the committer date** of the extracted commit, not the clock, so re-extraction is byte-identical. `short` is the first 7 characters of the SHA, not git's auto-abbreviation (which grows with the object count and differs between machines).
- **Commit mode reads git's object store**, never the working tree; the same commit is the same Blueprint on any machine.
- **Refs are limited to the extracted history.** Branches and tags are recorded only when their tip is in the history of the extracted commit, so a tag made on a later commit never appears in an older commit's Blueprint. Refs are repository state, not commit content: adding or moving a ref inside that history does change the output, and that is by design (found by the Stage 1 reviewer).
- **`Blueprint.repo` defaults to the origin URL** with credentials and `.git` removed (a token in a remote URL is never written), else the directory name, so the same commit in two differently named checkouts yields the same JSON.
- **This repository carries its own Blueprint through worktree mode.** A file inside a commit cannot name that commit, and history grows with every commit. So `blueprint/self.json` is the working tree on top of a base commit: `HEAD` when changes are pending, otherwise the parent of the last commit that touched a non-excluded path. The file generated before a commit then equals the file regenerated after it, and a commit touching only `blueprint/` changes nothing. Branches and tags are left out of a worktree extraction because they differ between machines (a developer's local branches, CI's checkout).
- **House-stack layer rules match at any depth**, so a monorepo app (`apps/web/app/**`) and a `src/` tree place like a root app. §7.2 names `app/layout*`, `app/page*`, `app/globals.css` for the shell; the default extends that to all of `app/**` outside `app/api/**`, because nested route files are shell too. Lockfiles count as package manifests. Unmatched files go to the shell with the rule `fallback: no rule matched`, so the fallback is visible, never silent.
- **Glossary keys** are a bare symbol or `path#symbol` (the latter wins). An edge's English joins its symbols' phrases and is confirmed only when every symbol has a confirmed phrase.
- **Drafting is separate from extraction.** `extract()` never calls a model; `--draft-glossary` drafts through `packages/model` (prompt `glossary.v1`, builder vendor), writes drafts without a confirmation into the overlay, and never overwrites an existing phrase.
- **The `rama` bin registers tsx** and loads the TypeScript source, consistent with packages being consumed as source.

## 2026-10-20 — Auditor model

- The auditor and the independent reviewer use OpenAI `gpt-6.1-sol` (`OPENAI_MODEL`), chosen by the member. It was the only model id visible to the key containing "gpt", "sol" and "6.1". First real call: ok on the first attempt.

## 2026-10-20 — Stage 0 foundation choices

- Toolchain pinned to the newest release at least two weeks old on each line: Next 16.3.8, React 19.3.0, Drizzle ORM 0.45.3 / drizzle-kit 0.31.11, postgres.js 3.4.9, Vitest 5.0.3, ESLint 10.12.0, Prettier 3.9.9, zod 4.6.5. TypeScript is 6.0.3, not 7: typescript-eslint supports `<6.1`, and the BLUEPRINT.md generator uses the compiler API.
- Packages are consumed as TypeScript source (`exports: ./src/index.ts`); no build step between packages. Scripts run with `tsx`.
- Model adapters call the vendors' HTTP APIs with `fetch` rather than SDKs: one small surface to test and to inject in tests. `call()` takes `role` (builder | auditor), `siteId`, `createdBy` and a zod `output` schema besides `{name, version, input}`, because every row needs a site and a creator and every output must be typed.
- Model per vendor comes from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`, confirmed in the vendor's model list on 2026-10-20) and `OPENAI_MODEL` (no default: an unverified model name is not guessed).
- A reply cut off at the token limit (Anthropic `stop_reason: max_tokens`, OpenAI `finish_reason: length`) fails at once with `OutputTruncatedError` and is not retried: the same budget would stop it again. Found on the first real OpenAI call, where a reasoning model spent its whole 50-token budget on hidden reasoning and returned an empty reply three times.
- `model_calls.input_tokens` and `output_tokens` are summed over every attempt that got a reply, because every attempt is billed.
- A call that is refused before reaching a vendor (vendor guard, missing model or key, bad prompt name) writes no `model_calls` row; every call that reaches a vendor writes exactly one, success or failure.
- `model_calls` and `audit_log` are append-only from the first migration (a trigger refuses UPDATE, DELETE, TRUNCATE). Drizzle cannot express triggers, so they are appended by hand to the generated `0000_init.sql`; the watcher's drift probe still checks schema against snapshot.
- `next dev` writes `apps/rama/AGENTS.md` and `CLAUDE.md` when it detects an agent. Turned off (`agentRules: false`) so project rules live only in the root `CLAUDE.md`. Its useful content, carried here: Next 16 differs from older training data; the version-matched docs are in `apps/rama/node_modules/next/dist/docs/`.

## 2026-10-19 — Locked decisions at the start of the build

- Repository: github.com/Ergplan/houseoframa, monorepo, pnpm workspaces.
- Stack: TypeScript, Next.js App Router, Postgres 16 + Drizzle, Canvas 2D for the building.
- Builder: Claude (Claude Code). Auditor and independent reviewer: OpenAI. The two must differ (Invariant 5).
- First target: EkBill. Second: Procurement Studio. House of Rama renders itself from Stage 2.
- Targets are read-only clones; House of Rama never pushes to a target and is not a repository system.
- Security deferred to Stage 6 by rule; single local member until then.
- The quality that wins ties: a true picture beats a complete one.

## 2026-10-17 — Prototype decisions (carried forward)

- The building is a renderer over a generated graph; the graph is the product.
- Floors are layers; features/screens are the unit a non-developer reviews.
- Voice narrates and reviews; text and the map hold the truth.
- One product owner accepts changes; the agent shows the cost of each.
- Sign-off is behaviour confirmed on a screen, not code.

## 2026-10-20 — Repository moved to GitHub

- Repository is now github.com/Ergplan/houseoframa (was gitlab.com/venture6/house-of-rama for one day). CI is GitHub Actions (`.github/workflows/check.yml`). The build VM signs in with `gh`.
