# Stage 5 — Audit

Date: 2026-10-23. Tag at start: `stage-5-start` (9b6d822). Builder: Claude Opus 5.5 (Claude Code). Auditor and independent reviewer: OpenAI `gpt-6.1-sol` through `packages/model` (prompts `audit.v1` and `reviewer.v1`).

## Before the stage

- **No stop after Stage 4.** You said "yes continue building for next 12 hours". Stage 4's last done-criterion is still yours: signing EkBill's traced screens (`/bills/[number]`, `/dues`, `/gst`) at <http://localhost:3000/site/ekbill/walkthrough>. Nothing has been signed in your name.
- **Nothing pushed.** Stages 4 and 5 are local commits. EkBill's gate workflow is pinned to b89acfa, which has to reach GitHub before that workflow can run.

## What was built

- **Postgres:** `audits` and `findings` (migration `0003_audit`).
  - Both are append-only: a trigger refuses UPDATE, DELETE and TRUNCATE.
  - Every insert writes `audit_log` by trigger.
  - An audit names its vendor, its model, its `model_calls` row and the sha256 of what the auditor received.
  - Every brick gets a verdict row, a pass included.
- **`packages/audit`** (CLI `rama-audit check|run|show`). It runs the 14 checks of MASTER-PROMPT §7.3 as plain code:
  - **Static checks, over the TypeScript AST:** silenced lint, swallowed errors, `any`, constants in formula files (the files of the site's traced figures), browser-storage writes, environment fallbacks, long routes with no sign-in check, and a fixed position taken from a sorted list (one read after a length check is spared). Test files are left out.
  - **The target's own scripts:** `typecheck`, `build` and `test` from its `package.json`, with the package manager its lockfile names, run with PATH and HOME only. Coverage per brick comes from the test report and the import graph. Each run records its outcome (exit code, test files passed and failed).
  - **The people's record:** screens changed since their signature or never signed, unconfirmed phrases, and decisions left open or not built.
  - A check that did not run is reported as not run, never as a pass. The scripts run only when the checkout is the audited commit.
- **The auditor:** prompt `audit.v1`, role auditor, so `AUDITOR_VENDOR`. The vendor guard refuses before any call when it would be the builder's vendor.
  - **It is given:** the check results, a Blueprint summary and the totals.
  - **It writes:** the narration (discovery, each floor, screens, verdict), the alterations with agent-time and human-time estimates, and the time machine.
  - **It may lower a verdict, with a reason.** It cannot add a finding: its reply has no field for one. `applyReply()` refuses a reply that names a finding it was not given, raises a verdict, or cites a commit outside the history, and then nothing is stored.
- **The report:** `runAudit()` writes it in one transaction. `signoffVerdicts()` confirms or rejects each signature in force by the defects on its screen, in plain code. `verifyReport()` recomputes the hash from the auditor's own `model_calls` row.
- **`apps/rama`:**
  - **Audit mode on the building:**
    - two drones fly the floors, beam over each brick, and leave a badge (green, amber, red);
    - a live log of phases, narration (read aloud on request) and findings;
    - Skip to the report, Stop.
  - **The report panel:** counts, checks run and not run with outcomes, sign-offs confirmed or rejected, alterations, time machine, who did what, and Light the defects.
  - **The Brick view** shows the brick's latest verdict, and for a lowered verdict, the auditor's reason.
  - **`/site/[siteId]/audit`:** the readable report, verified against the auditor's call on every view.
  - The replay is a pure function (`canvas/audit.ts`). Scanning is capped at 120 s at 1×, so a large site does not take minutes to fly.
- **Housekeeping:**
  - This repository gained a root `build` script (`apps/rama` into `.next-build`), so its own audit runs the build.
  - The watcher no longer dies when an end-to-end test's dist folder vanishes mid-scan (it crashed `pnpm dev` once).
  - The dev-server test helper waits for Next to exit before removing its folder (one ENOTEMPTY flake).

## The audits

| Site   | Commit                 | Defects | Notes | Clean bricks | Signed by                              | Verified |
| ------ | ---------------------- | ------- | ----- | ------------ | -------------------------------------- | -------- |
| EkBill | 4f28628                | 0       | 724   | 541 of 931   | openai `gpt-6.1-sol` (report 745fabc3) | yes      |
| self   | da776e3 + working tree | 0       | 177   | 131 of 268   | openai `gpt-6.1-sol` (report 2e7fddfc) | yes      |

**EkBill.**

- All 14 checks ran: typecheck exit 0, build exit 0, and 46 unit test files passed, none failed.
- The notes:
  - 275 code bricks that no passing test imports (its integration tests are outside its `test` script);
  - 334 drafted phrases nobody confirmed;
  - 45 swallowed errors;
  - 29 unsigned screens;
  - 21 environment fallbacks;
  - 9 silenced lint warnings;
  - 6 constants in a formula file (`apps/web/screens/gst/data.ts`);
  - 5 browser-storage writes.
- The first run found one defect: EkBill's `matchCustomer` reads `close[1]` of a sorted list. I read the code. It does so only after `close.length > 1`, so that was a false defect. The check now spares a position read after a length check, with a test.
- The first report (e01a2978) stays in the record, superseded by the later one.

**This repository** has zero defects. Its notes are in KNOWN-GAPS.

## Tests

- **Every check** fires on a fixture that triggers it and stays quiet on one that does not (`packages/audit/test/static.test.ts`, `run.test.ts`, `report.test.ts`). This includes a script that probes for a leaked `DATABASE_URL`.
- **The model may not add a defect** (`test/auditor.test.ts`): a raised verdict, an unknown finding, an alteration citing an unknown finding, an unknown commit, and a reply carrying a `findings` field are each refused. In `report.test.ts`, nothing is stored when the auditor overreaches.
- **Vendor guard:** with `AUDITOR_VENDOR` equal to `BUILDER_VENDOR`, the audit is refused before any vendor call.
- **Report hash reproducible:** the same input under any key order gives the same hash, and any change gives another. `verifyReport()` recomputes it from the stored call, and refuses a hash that does not match.
- **Append-only and audited:** `packages/db/src/db.test.ts`.
- **The app:**
  - the replay (`canvas/audit.test.ts`) and its drawing (`draw.test.ts`);
  - the inspector's live log, report and brick verdict (`Inspector.test.tsx`);
  - the report page against a throwaway database (`audit/page.test.tsx`);
  - the script and the scan budget (`test/view.test.ts`).
- **E2E, CI-safe** (`tests/stage-5.e2e.test.ts`):
  - `rama-audit check` on a crafted site finds the positional assumption without running the target or a model;
  - in a real browser, the stored audit replays: Audit, the live log, Skip, the report, the brick's verdict;
  - the report page verifies.
- **E2E on EkBill, `@vendor`** (`tests/stage-5.vendor.ekbill.test.ts`): a real audit of an EkBill copy by the auditor vendor, signed, verified, and read in the app. Passed.
- **Watcher:** green.

## Deviations from the prompt

- **Coverage per brick** is "a passing test file imports it", read from the test report and the import graph, not line coverage. Line coverage would need each target's coverage tooling.
- **Severity is a choice the prompt leaves open.** Defects are compiler errors, build failures, failing tests, long unauthenticated routes and positional assumptions. Everything else is a note.
- **Audits run from the command line**, not from the app: a run builds and tests the target for minutes. The app shows and replays the latest one.

## Reviewer findings

Run 1 at d1472a5 found six code defects. All are fixed, each with a test:

1. **The auditor's narration, alterations and time machine were shown without an unconfirmed state** (Invariant 6). Fixed: they are marked "drafted by <vendor model>; unconfirmed" until a named person confirms them. The confirmation is a new append-only, audited table `audit_confirmations`, with route `POST /api/site/[siteId]/audit/confirm` and a button on the report page.
2. **The report's totals were computed outside the metrics engine** (Invariant 7). Fixed: `auditCounts()` and `auditFloorCounts()` in `packages/blueprint/metrics`.
3. **The length guard was too broad:** any `if` mentioning the length spared the read. Fixed: only a bound that covers the position, in a branch the bound proves (or after an exit it rules out).
4. **A test command that exited non-zero, with every listed file passing, gave no finding.** Fixed: that is a defect, and an empty run is a note.
5. **The scripts could run on other code than the report names.** Fixed: the audit extracts the Blueprint from the checkout as it is, and runs the scripts only when the checkout is the audited commit.
6. **A brick newer than the audit was shown as a pass.** Fixed: it gets no badge, the replay says how many there are, and the panel says when the building has moved on.

## Real model cost

(Filled in after the reviewer runs.)

## Open questions

1. **Stage 4's signatures** are still yours to make (three walkthrough steps on EkBill).
2. **Push** Stages 4 and 5 (and with them EkBill's pinned gate)?
3. **Severity:** is "notes for everything that is not a compiler error, a failed build or test, a long open route, or a positional assumption" the line you want? EkBill would get defects if, for example, swallowed errors counted.
4. **EkBill's integration tests** need its database. Should its audit run them (with a test database it brings up), or is the unit project enough?
