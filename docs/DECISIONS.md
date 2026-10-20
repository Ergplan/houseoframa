# Decisions

One dated entry per decision. Newest first. Locked decisions (CLAUDE.md §3) are recorded here on the day they were taken.

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
