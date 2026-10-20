# Decisions

One dated entry per decision. Newest first. Locked decisions (CLAUDE.md §3) are recorded here on the day they were taken.

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
