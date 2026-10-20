# Architecture

Updated every stage with a "what changed" list. Before Stage 0 runs, this is the intended shape.

## Components
- `apps/rama` — the web app: Site (building), Showroom (real screens + trails), Discovery (site office), Audit (drones + report), Campus (floor manager). Reads Blueprints and Postgres; writes decisions and signoffs through packages/ceremony only.
- `packages/blueprint` — `extract(repo) → Blueprint`; `metrics`; CLI. The only writer of `blueprint/*.json`.
- `packages/trace` — screen capture (Playwright) and figure trails.
- `packages/ceremony` — decisions, signoffs (append-only), the merge gate, walkthrough script.
- `packages/audit` — plain-code checks, auditor-vendor narration and report.
- `packages/model` — the one module for model calls; versioned prompts in `prompts/`.
- `packages/db` — Drizzle schema and migrations.
- `packages/shared` — types (MASTER-PROMPT §8).

## Data model (intended)
| Table | Purpose | Append-only |
| --- | --- | --- |
| sites | one per target repository | no |
| people | members and reviewers | no |
| decisions | discovery decision cards | yes |
| signoffs | signatures on screens/bricks at a commit | yes |
| audits, findings | auditor reports and per-brick verdicts | yes |
| bookings | pod bookings (Stage 6) | no |
| model_calls | one row per model call | yes |
| audit_log | every write to the append-only tables | yes |

## Critical path
`rama site add <repo>` → `extract()` → `blueprint/<site>.json` → `/site/[id]` renders → `capture()` → Showroom → `trail(figureId)` → walkthrough → `signoff()` → `gate()` in the target's CI → `audit()` → report → handover.

## What changed
- 2026-10-19: document created before Stage 0.
