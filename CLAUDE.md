# House of Rama — rules for every session

House of Rama makes agent-built software inspectable and signable by the people who pay for it. A repository is rendered as a building (files are bricks, layers are floors, builders are cranes). Every figure on every screen traces to its formula, its inputs, the commits that built it and the person who signed it off. Nothing merges unsigned. An auditor from a different model vendor flies the site and signs its own report.

Sections 1–4 below are copied verbatim from `docs/MASTER-PROMPT.md`. The stage plan, stage prompts and definition of done live only there. Read them from disk; never ask for them to be pasted.

## 1. Operating rules

1. Work stage by stage. Run only the stage named in the user's line (`Run Stage N of docs/MASTER-PROMPT.md`). Never start the next stage's work early.
2. Tag the commit at each stage start: `git tag stage-N-start`. Every stage ends with the watcher green, the app running, `docs/reports/stage-N.md` written, and a STOP.
3. Write tests with the code, not after: unit for every rule and state transition, integration for every route, one end-to-end per stage on a real target repository.
4. Read `.watch/status.json` before every commit. Never commit over a red check. Never skip, delete or mark a test expected-failure to get green.
5. Small commits after each working increment, with messages that say what changed and why.
6. `reference/` is read-only input. Copy with the origin noted in a comment; never import from it at runtime.
7. TypeScript everywhere. One framework per layer. No framework hopping mid-build.
8. Every external model call goes through `packages/model` with typed input and output, a versioned prompt loaded from `prompts/<name>.v<N>.md`, retries, and one row in `model_calls` per call.
9. Keep the folder layout exactly. A new folder goes into `docs/ARCHITECTURE.md` before it holds code. No `utils/`, `misc/`, `temp/`, `old/`.
10. Secrets by environment variable only, with `.env.example` committed and `.env` ignored. Never print a secret, never commit one.
11. Security deferred until Stage 6: no auth, no multi-tenancy before then. Until Stage 6 every site belongs to the single local member. Do not add auth early; do not forget it in Stage 6.
12. The quality that wins ties: **a true picture beats a complete one.** If a trace, description or verdict cannot be derived from the code, show it as untraced, unconfirmed or unknown. Never invent.
13. Living documents (`docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/KNOWN-GAPS.md`, `docs/BLUEPRINT.md`) are updated in the same commit as the code that changes them.
14. House of Rama renders itself. From Stage 2 on, `rama extract .` must succeed on this repository and the result is checked into `blueprint/self.json` and regenerated in CI.

### Independent review

Before each stage report, from Stage 1 onward, run a reviewer with a model from a different family than the builder, in a fresh context with no access to this session. It receives only three things: the stage diff (`git diff stage-N-start..HEAD`), `CLAUDE.md`, and the stage prompt. It answers a fixed checklist and nothing else: (a) every invariant upheld, citing file and line, or the violation; (b) every route added has a test; (c) every write to `signoffs`, `audits` and `decisions` is append-only and audited; (d) generated documents and `blueprint/self.json` regenerate without diff; (e) any claim in the draft stage report that the code does not support. Fix every finding and rerun the reviewer until it reports no new code defect. Findings that cannot be resolved by code (by-design behaviour, statements a diff cannot prove, decisions pending from the user) are listed in the report with a one-line rationale and do not block the stage.

## 2. Invariants

These hold in every stage and override anything else in this document. If a stage prompt conflicts, the invariant wins and the conflict is flagged in the stage report.

1. **The Blueprint is generated, never hand-edited.** `blueprint/*.json` is written only by `packages/blueprint` from a git checkout. A CI check regenerates it and fails on diff. Any human knowledge (a description, a glossary phrase) lives in `.rama/` inside the target repository as a reviewed overlay, never in the generated file.
2. **Every figure is traced or marked.** A figure shown in a Showroom either has a trail (formula, inputs, data location, build trail, sign-off) derived by `packages/trace`, or is rendered with the `untraced` state. There is no third state.
3. **Signatures are append-only and named.** `signoffs` rows and `.rama/signoffs.jsonl` entries are never updated or deleted; a reversal is a new row referencing the old one. Every row carries a person, a target (screen or brick at a commit), a timestamp, and the statement signed.
4. **Nothing merges unsigned.** The gate (`packages/ceremony/gate`) fails when any screen changed since the last signed commit has no new signature and no passing test behind its bricks. The gate runs in CI on the target repository and cannot be bypassed by configuration inside that repository.
5. **The auditor is not the builder.** `packages/audit` calls only the auditor vendor configured in `AUDITOR_VENDOR`, which must differ from `BUILDER_VENDOR`; the runner refuses to start otherwise. The auditor never writes code; it writes findings.
6. **Determinism where it counts.** Extraction, trails, the gate and the campus numbers are plain code with no model call. Model calls draft descriptions and narration only, and every drafted text is marked `unconfirmed` until a named person confirms it.
7. **One engine.** Totals shown in the campus, the inspector and the audit report come from one function per figure in `packages/blueprint/metrics`; other surfaces only display.
8. **Provenance on every row.** Every table carries `site_id`, `created_at`, `created_by` (person or `rama:<component>@<version>`), and every write to `signoffs`, `audits`, `decisions` appends to `audit_log`.

## 3. Locked decisions

| Area | Decision | Why |
| --- | --- | --- |
| Repository | `github.com/Ergplan/houseoframa`, monorepo, pnpm workspaces | One history that renders itself |
| Language | TypeScript throughout, Node 22 | One language per layer; the extractor must run where the target repo runs |
| Web | Next.js (App Router) in `apps/rama` | The house stack of the targets it renders |
| Database | Postgres 16 via Drizzle ORM, migrations in `packages/db/migrations` | Schema in code is what makes traces extractable |
| Rendering | HTML Canvas for the building (no game engine), React for everything else | The weekend artifact proved it; nothing heavier is needed |
| Target repos | Git only, cloned read-only into `work/<site>/repo`; House of Rama never pushes to a target | A map beside git, never a new repo system |
| House stack of targets | Next.js + TypeScript + Postgres + Drizzle; a target off this stack gets partial traces and says so | Traces need schema and queries in code |
| Builder | Claude (Claude Code) | — |
| Auditor / reviewer | OpenAI, via `packages/model` | Must be a different vendor from the builder (Invariant 5); both target repos already carry an OpenAI key |
| Screens | Playwright against the target's built app, captured to `work/<site>/shots` | Real UI, never mockups |
| Voice | Browser SpeechSynthesis for narration until a member asks for more | Narration, not specification |
| Deployment | Docker Compose (app + Postgres + watcher) on one box; Vercel later | The pod floor runs one box |
| Access, Stages 1–5 | Single local member, no auth | Deferred by rule 11 |
| Access, Stage 6 | Email magic link; a site belongs to a member; a booking opens a site | Pod floor booking tie-in |
| First target | EkBill (`reference/ekbill`, read-only); second target Procurement Studio | Real, owned, already walked through |

Not reopened unless analysis of an existing codebase shows something materially better, recorded in `docs/DECISIONS.md`.

## 4. Folder layout, continuous testing, living documents

```
house-of-rama/
  apps/rama/                 # Next.js app: site, showroom, discovery, audit, campus
    app/                     # routes
    components/              # React components (inspector, deck, overlays)
    canvas/                  # the building renderer (Canvas 2D), pure functions over a Blueprint
  packages/
    blueprint/               # git + source → Blueprint JSON; metrics; CLI `rama extract`
    trace/                   # figure trails: formula, inputs, data location, build trail
    ceremony/                # decisions, sign-offs, the merge gate, walkthrough script
    audit/                   # auditor runner, checks, report, replay script
    model/                   # the one module for model calls; prompts/ loaded by version
    db/                      # Drizzle schema, migrations, seed
    shared/                  # types shared across packages (Blueprint, Trail, Signoff)
  prompts/                   # versioned prompt files: <name>.v<N>.md
  blueprint/                 # generated: self.json (this repo) — never hand-edited
  reference/                 # read-only inputs: weekend prototype, extractor, EkBill clone
  work/                      # gitignored: cloned targets, screenshots, extracts
  docs/                      # MASTER-PROMPT, ARCHITECTURE, DECISIONS, KNOWN-GAPS, BLUEPRINT, reports/
  scripts/                   # watcher, ci, dev helpers
  tests/                     # e2e tests per stage; unit tests live beside their package
  .watch/                    # gitignored: status.json and log from the watcher
```

**Continuous testing.** `scripts/watch.mjs` runs beside the app (`pnpm dev` starts both). On every save it runs, in order: `eslint`, `prettier --check`, `tsc --noEmit` per package, `vitest` for changed packages then the full suite, `drizzle-kit check` for migration drift, and `rama extract .` compared against `blueprint/self.json`. It writes `.watch/status.json` (`{ok, checks:[{name, ok, ms, detail}], at}`) and `.watch/log.txt`. The same checks run in CI (`.github/workflows/check.yml`). End-to-end tests that call a real model vendor are tagged `@vendor` and excluded from the watcher.

**Living documents.** `docs/ARCHITECTURE.md` (components, data model table, the critical path with real function names, routes, deployment; a "what changed" list per stage). `docs/DECISIONS.md` (dated). `docs/KNOWN-GAPS.md`. `docs/BLUEPRINT.md` (the generated schema, regenerated from `packages/shared` types with a CI drift check). `docs/reports/stage-N.md` per stage.
