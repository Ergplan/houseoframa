# House of Rama — rules for every session

House of Rama makes agent-built software inspectable and signable by the people who pay for it. A product is rendered as a transparent isometric lakefront: one building per thing the product does, named in the customer's own words; screens are the glass facades; the database is the ground; code is the third zoom level. Every figure on every screen traces to its formula, its inputs, the table it lives in, the commits that built it and the person who signed it off. Nothing merges unsigned. An auditor from a different model vendor flies the site and signs its own report. A voice narrates and asks; it is a mouth, not a mind.

**Version 1 is for us.** Aayuda uses it on a laptop to build its first product inside it, ergPLAN. It is not a retail product yet. The design construct is `docs/POD-EDITION.md`; it wins over older wording below where they differ. Stages 0–6 and Gaps 1 are built and stand; Stages 7–12 build the Pod Edition on top of them (Stage 11, Glass and flow, added 27 Oct: the journey layout, turn and zoom, code written inside the glass with English beside every block, and the data flowing through pipes).

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
11. No passwords in version 1. Members are `members.json` in the repo (name, role: trainer | customer); a person picks their name to sign. The only environment variables are `DATABASE_URL` and the signing key the app generates. Every other secret (vendor keys, the GitHub token) is entered in the Settings screen and stored in Postgres, masked in the UI, with a green or red light and a plain sentence per key. The username-and-password sign-in from Gaps 1 is replaced in Stage 7; magic-link or password sign-in returns only with the floor edition, behind a setting.
12. The quality that wins ties: **a true picture beats a complete one.** If a trace, description or verdict cannot be derived from the code, show it as untraced, unconfirmed or unknown. Never invent.
13. Living documents (`docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/KNOWN-GAPS.md`, `docs/BLUEPRINT.md`) are updated in the same commit as the code that changes them.
14. House of Rama renders itself. From Stage 2 on, `rama extract .` must succeed on this repository and the result is checked into `blueprint/self.json` and regenerated in CI.
15. Nobody types a command. Everything a trainer or customer does is a button or a sentence. The CLI exists for engineers and CI only; the app never shows a command to a person, and a failed step is shown as a grey flag with a plain sentence and the builder's next action.
16. Testable by non-coders. A **Test drive** button runs the whole loop on the built-in sample product (idea → street → build → walkthrough → audit) with no voice and no camera, in minutes, and reports pass or fail in words. It stays green at every stage from Stage 7 on.
17. Lucid UI. The design system is ergOS Harmony: `design/harmony/tokens.json` and the bundle are the only source of colour, type, spacing and radius; the mapping of House of Rama objects to Harmony is `design/harmony/README.md` and is followed exactly. Plain words from `design/harmony/glossary.json`; no developer vocabulary at Street or Building level; every number says what it counts.

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
9. **The voice is a mouth, not a mind.** It takes inputs, asks, suggests and reads back; it writes nothing to the record. Every decision card, signature, description and figure enters through the builder from a spoken or clicked yes recorded with the person's name, or through the trainer's console. Every product fact the voice speaks is text the builder handed it; the voice never answers a product question from its own knowledge.
10. **Traced by construction.** A figure the builder writes into a product is marked and mapped at the moment it is written; the gate refuses a screen with an untraced figure. Products built inside House of Rama therefore show 100 percent traced or do not proceed. Outside products keep their partial rate and say so.
11. **Three states, no more.** A screen or building is Verified (a test exercises its behaviour and passes), Confirmed (a named person signed it in a walkthrough) or Unverified. "A test imports this file" is never shown as a state. Every count says what it counts, in the customer's unit.

## 3. Locked decisions

| Area | Decision | Why |
| --- | --- | --- |
| Repository | `github.com/Ergplan/houseoframa`, monorepo, pnpm workspaces | One history that renders itself |
| Language | TypeScript throughout, Node 22 | One language per layer; the extractor must run where the target repo runs |
| Web | Next.js (App Router) in `apps/rama` | The house stack of the targets it renders |
| Database | Postgres 16 via Drizzle ORM, migrations in `packages/db/migrations` | Schema in code is what makes traces extractable |
| Rendering | HTML Canvas, isometric, transparent buildings on a lakefront; three zoom levels (Street, Building, Brick) over one Blueprint; React for everything else | The weekend artifact proved Canvas; the lakefront is the product's face |
| Product repos | Products built inside House of Rama get their own GitHub repository, created by House of Rama under the GitHub account configured in Settings; the builder pushes to it. Outside repos are cloned read-only into `work/<site>/repo` and never pushed to | A map beside git, never a new repo system |
| House stack of targets | Next.js + TypeScript + Postgres + Drizzle; a target off this stack gets partial traces and says so | Traces need schema and queries in code |
| Seats | Four per product: builder, auditor (also reviewer), drafter, voice. Vendor and model per seat chosen in Settings → Brains and asked in discovery; builder ≠ auditor always | The customer chooses the brains; the rule keeps the audit independent |
| Builder | Claude Code is the wired builder; Codex, Gemini CLI and Antigravity are documented stubs until a customer needs one | An agent driver is engineering, not a dropdown |
| Auditor / drafter vendors | Anthropic and OpenAI native adapters plus one OpenAI-compatible adapter (Gemini, Grok, Kimi, Ollama, any compatible provider; Ollama local with no key) in `packages/model` | One protocol covers the market and a customer's own model |
| Screens | Playwright against the target's built app, captured to `work/<site>/shots` | Real UI, never mockups |
| Voice | OpenAI GPT Live (Realtime, WebRTC) in `packages/ears` is the wired voice; a second realtime vendor is an adapter. English only at launch; a mouth, not a mind (Invariant 9) | Warmth and clarity in the room; rigour stays with the builder |
| Deployment | Docker Compose (app + Postgres + watcher) on one box; Vercel later | The pod floor runs one box |
| Access, version 1 | `members.json`, no passwords; secrets in the Settings screen, stored in Postgres | We are not super coders; nothing hidden in env files (rule 11) |
| Access, floor edition | Sign-in (password or link) behind a setting, bookings, wallet; deferred | Decided when the pod floor opens |
| First product | ergPLAN, a new app built inside House of Rama from the house-stack scaffold, in its own repository | Everything the floor will do, done once by us |
| Fixtures | Procurement Studio (golden numbers, §7.1) and the built-in sample product for Test drive; EkBill is retired as a target | Deterministic tests, no private clones |
| Design system | ergOS Harmony (`design/harmony/`, synced from `Ergplan/designsystem` d00bc9a): tokens, bundle, VoiceBar, folder card | One look across House of Rama and the products it builds |

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
    stage/                   # the isometric lakefront renderer: Street and Building levels (Brick level stays in apps/rama/canvas)
    ears/                    # GPT Live voice session, transcript, the hand-off of builder text to the voice, recognised commands
    board/                   # whiteboard frames (laptop webcam now; fixed camera later), board readings, product map, drafts
    workbench/               # settings (keys, GitHub account, members), Test drive, product repos, the trainer console
  templates/house-stack/     # the scaffold every product built here starts from: figures by construction, screens file, gate in CI
  design/harmony/            # ergOS Harmony tokens and the UI glossary (plain words for every label)
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
