# Stage 0 — Foundation

Date: 2026-10-20. Tag at start: `stage-0-start` (73a3e6b). Builder: Claude Opus 5.5 (Claude Code).

## What was built

- **Workspace.** pnpm 9.12 workspaces (`apps/*`, `packages/*`), Node 22 pinned in `.nvmrc` and `engines` (`>=22 <23`). Shared `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), ESLint 10 flat config (typescript-eslint, Next plugin on `apps/rama`), Prettier, Vitest 5 with one project per package plus `e2e`.
- **apps/rama.** Next.js 16.3.8 App Router with one route, `/`, rendering "House of Rama · Built on trust" and `commit <short SHA>` from `GIT_SHA`. When `GIT_SHA` is unset or not a SHA it says "commit unknown" rather than inventing one; `pnpm dev` fills it from git.
- **packages/shared.** `Layer`, `BrickNode`, `ImportEdge`, `Commit`, `Screen`, `FigureRef`, `Blueprint`, `Trail`, `Decision`, `Signoff`, `Finding` exactly as §8, each field with a one-line doc comment. `scripts/gen-blueprint-doc.mjs` generates `docs/BLUEPRINT.md` from them with the TypeScript compiler API, refuses undocumented fields, and has a `--check` mode used by the watcher.
- **packages/db.** Drizzle schema with `sites`, `people`, `model_calls`, `audit_log`; every table has `site_id` (nullable only on `people`), `created_at`, `created_by`. One migration, `0000_init.sql`, which also installs triggers that make `model_calls` and `audit_log` append-only. Seed creates the person named by `RAMA_MEMBER_NAME` and the site `self` owned by them; idempotent; refuses to run without a name.
- **packages/model.** `call({name, version, input, output, role, siteId, createdBy})`: vendor guard first, then `prompts/<name>.v<N>.md` (sha256 recorded), routing to `BUILDER_VENDOR` or `AUDITOR_VENDOR`, Anthropic and OpenAI adapters over `fetch`, up to three attempts (two retries) on 429/5xx/network/unparseable replies, exactly one `model_calls` row per call that reaches a vendor, output validated by a zod schema.
- **Watcher.** `scripts/watch.mjs` runs eslint → prettier → `tsc --noEmit` per package → vitest changed projects then full suite → drizzle (`drizzle-kit check` plus a probe that regenerates into a copy of the migrations and fails on any new file) → BLUEPRINT.md drift → blueprint self drift (skipped until Stage 1). Writes `.watch/status.json` and `.watch/log.txt`. `--once` for CI.
- **`pnpm dev`.** `scripts/dev.mjs`: `docker compose up -d db`, wait for readiness, migrate, seed, then the app and the watcher side by side with prefixed output.
- **CI.** `.github/workflows/check.yml`: Postgres 16 service, `pnpm install --frozen-lockfile`, migrate, seed, `watch.mjs --once`, status printed and uploaded.
- **docker-compose.yml.** `db` with a healthcheck; `app` and `watcher` added under the `stack` profile.
- **Documents.** `docs/ARCHITECTURE.md` (components, data model, critical path with real function names, routes, deployment, what changed), `docs/DECISIONS.md` (Stage 0 entry; locked decisions already dated 2026-10-19), `docs/KNOWN-GAPS.md`, generated `docs/BLUEPRINT.md`, `.env.example` with all required variables plus `ANTHROPIC_MODEL` and `OPENAI_MODEL`.

## Tests

24 tests in the watcher and CI suite, all passing. They cover:

- `packages/model/src/call.test.ts` (12): the vendor guard refuses when `AUDITOR_VENDOR === BUILDER_VENDOR` for both roles, with no prompt read, no fetch and no row; missing or unknown vendor refused; builder and auditor routing; retries twice then records one error row; recovery after an unparseable reply; no retry on 401; no retry when the reply stops at the token limit; tokens summed across attempts; no guessed model name; text format; prompt-name path escape refused.
- `packages/db/src/db.test.ts` (5): on a fresh throwaway database, the migration applies; every table has the three provenance columns, with the right nullability; the seed refuses without a name, creates `self` and the member, and is idempotent; UPDATE, DELETE and TRUNCATE fail on `model_calls` and `audit_log`.
- `apps/rama/app/page.test.tsx` (3): the route renders the name and short SHA, and "commit unknown" without one.
- `packages/shared/src/doc.test.ts` (3): every §8 type and field is documented; an undocumented field is refused; union pipes are escaped.
- `tests/stage-0.e2e.test.ts` (1): a real `next dev` serves `/` with the line and the SHA.

Watcher verified both ways. I planted a lint error, a formatting error, a type error, a failing test, an unmigrated schema column and an undocumented-type drift; each turned its check red. With the plants removed, everything was green again. A save under `packages/model/` re-ran the checks and ran `vitest changed (@rama/model)` before the full suite.

## Definition of done

| Check                              | Result                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm dev` runs app + db + watcher | Yes: Postgres up, migrations and seed applied, app on :3000 showing `commit 73a3e6b`, watcher running |
| `.watch/status.json` ok            | `ok: true`, all checks green; `blueprint self drift` is `skipped: true` until Stage 1                 |
| CI valid                           | `actionlint` 1.7.7 reports nothing; not yet run on GitHub (not pushed, see Q3)                        |
| Vendor guard test passes           | Yes                                                                                                   |
| Seed creates site "self"           | Yes, owned by the member named in `.env`                                                              |

## Skipped, and why

- **Independent review.** CLAUDE.md requires it from Stage 1 onward, so it was not run for Stage 0.
- **`blueprint self drift`.** No extractor exists until Stage 1. Reported as `skipped`, not as a pass.
- **e2e on a real target repository.** Stage 0 has no target. The e2e test runs on this repository's own app.
- **`stack` compose profile.** Config validated, not run end to end. `pnpm dev` is the tested path.

## Deviations from the prompt

1. **`call()` signature.** It takes `role`, `siteId`, `createdBy` and a zod `output` schema beyond `{name, version, input}`. Without them a call cannot name its vendor, its row's site and creator (Invariant 8), or have a typed output.
2. **Model variables.** `.env.example` adds `ANTHROPIC_MODEL` and `OPENAI_MODEL`. The OpenAI one has no default because I could not verify a model name (see Q1).
3. **Early append-only triggers.** `model_calls` and `audit_log` get them now, ahead of Stage 4's signoffs. Invariant 8 and rule 8 make both tables records, and doing it in the first migration is cheaper than altering later.
4. **Watcher status field.** Entries may carry `skipped: true`, beyond `{name, ok, ms, detail}`, so a skipped check is never mistaken for a passing one.
5. **Next's agent files.** `next dev` writes `apps/rama/AGENTS.md` and `CLAUDE.md` whenever it detects an agent. They are turned off with `agentRules: false`, so the only rules file is the root `CLAUDE.md`. The pointer to Next's bundled docs is kept in DECISIONS.md.
6. **TypeScript 6.0.3, not 7.** typescript-eslint supports only `<6.1`.
7. **One commit.** Stage 0 lands as one foundation commit rather than several small ones. The pieces were verified together; intermediate commits would have been commits the watcher never checked (rule 4).

## Reviewer findings

Not applicable to Stage 0 (review starts at Stage 1).

## Real model cost

- One real call, the opt-in `@vendor` test through `call()`: anthropic / `claude-sonnet-5-5`, 86 input and 13 output tokens, status ok, one `model_calls` row. No dollar figure is given because no price table is in code (KNOWN-GAPS).
- The OpenAI half, after the key was replaced, run with `OPENAI_MODEL=gpt-5-mini` set for that command only:
  - First run: `gpt-5-mini-2025-08-07`, error after 3 attempts, empty reply. The 50-token budget went entirely on hidden reasoning. The row records 58 input and 50 output tokens, the last attempt only, because tokens were not yet summed across attempts; the vendor billed about three times that.
  - Fixes: a reply cut off at the token limit now fails at once without retry (`OutputTruncatedError`); tokens are summed across attempts; the vendor test's budget is 2,000.
  - Second run: ok on the first attempt, 58 input and 78 output tokens, reply `{"echo": "foundation"}`.
  - With the chosen auditor model, `gpt-6.1-sol` (now in `.env`): ok on the first attempt, 58 input and 8 output tokens.
- The builder session's own cost is not visible from inside the session.

## Open questions

1. **OpenAI key and model.** Answered: the key was replaced and works (the first one was echoed into this session's transcript and has been replaced). The auditor and reviewer model is `gpt-6.1-sol`, the only id visible to the key containing "gpt", "sol" and "6.1"; set in `.env` and `.env.example`.
2. **EkBill clone.** Answered: `reference/ekbill` is cloned, `main` at 8c46a81, 72 commits, clean. The ease-of-use walkthrough's commit e2082a4 is in its history, 7 commits behind HEAD.
3. **Push to GitHub.** Should I push `main` and the `stage-0-start` tag to `github.com/Ergplan/houseoframa` so the CI workflow runs there? I have not pushed anything.
