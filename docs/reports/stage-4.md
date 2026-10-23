# Stage 4 — Ceremony

Date: 2026-10-23. Tag at start: `stage-4-start` (b14039a). Builder: Claude Opus 5.5 (Claude Code). Drafting model: `claude-sonnet-5-5`. Independent reviewer: OpenAI `gpt-6.1-sol` through `packages/model` (prompt `reviewer.v1`).

## Before the stage

- **No stop between stages.** You said "Yes and please continue for next 12 hours" after Stage 3, so Stage 4 began without waiting for answers. It still has its own tag, tests, review and report.
- **Your five Stage 3 open questions took my recommended defaults**, recorded in DECISIONS:
  - icons stay unmarked;
  - figures stay on fixture data;
  - EkBill's overlay stays;
  - the OpenAI price stays marked third-party.
    Each is easy to change when you answer.

## What was built

- **Postgres:**
  - Four new tables: `discovery_sessions`, `discovery_turns`, `decisions` and `signoffs` (migration `0001_ceremony`).
  - All four are append-only. A trigger refuses UPDATE, DELETE and TRUNCATE.
  - Every insert into `decisions` and `signoffs` writes an `audit_log` row by trigger, in the same transaction.
  - Every row carries `site_id`, `created_at` and `created_by`.
- **`packages/ceremony`:**
  - **Records.** `.rama/decisions.jsonl` and `.rama/signoffs.jsonl` in the target mirror the committed database rows. One advisory lock per site serialises the writes: the chain check and insert, then the file write. The file only ever gets committed rows, appended. A line that could not be written is appended by the next write.
  - **Supersede chain.** A change or a reversal is a new row that supersedes the old one. A withdrawal is a row with `withdrawn: true`. A chain may not fork (checked under the lock, and refused by a unique index on `supersedes`) or change target.
  - **The gate.** `rama gate <repo> --base <commit> [--test-report <json>]`. A screen whose bricks changed since the base passes on either of two things:
    - a signature in force, made at or after the screen's last change;
    - a passing test behind every changed code brick.
      Screens at the base count too, so a removed screen or a deleted brick needs a signature. It fails whatever the screens say if a signature line that was there at the base was changed or removed. It reads nothing from the target that could switch it off.
  - **`ci/rama-gate.yml`.** The workflow a target includes. It runs on `pull_request_target`, so the copy on the base branch judges a pull request. It has a read-only token and no secrets, in two jobs on two runners. The target's tests run in one job and only produce a report. The gate job never runs target code and runs House of Rama at a pinned ref. `rama-ceremony install-gate <site>` writes it into a target's checkout.
  - **The walkthrough script.** One step per Blueprint screen, holding all its captured views. Each step has the statement to sign, built from the traced figures and the decided cards (no model), the trails, and the signature in force (current or stale).
  - **Imports.** The weekend's session and a decisions log, as reconstructed records. A corrected re-import is reconciled append-only.
  - **Rama's next question.** Drafted with prompt `discovery.v1` through `packages/model` and stored as a draft turn.
- **`packages/blueprint/metrics`:**
  - `signatureCoverage()`: signed and unsigned screens.
  - `brickMarks()`: the dot on each code brick. Red is untested and unsigned; green is signed with a test behind it; amber is signed without one.
- **`apps/rama`:**
  - **The walkthrough** (`/site/[id]/walkthrough`):
    - the real screenshot, the statement, and Read aloud (SpeechSynthesis);
    - traced figures with their re-execution state, and decision cards;
    - Confirm, Not yet, and Withdraw, as the local member.
  - **The site office** (`/site/[id]/discovery`):
    - sessions with their turns;
    - Rama's drafted question, marked as a draft;
    - typed or dictated turns;
    - decision cards recorded when the member confirms them, linked to bricks and screens.
  - **Five routes:** `sign`, `decisions`, and `discovery/sessions|turns|ask`.
  - **Signatures on the existing views:**
    - the building's dots follow `brickMarks`;
    - the Trust report gives signed and unsigned counts and links to the walkthrough;
    - a trail's sign-off section shows its screen's signature when it was made at the captured commit.
- **Sites:**
  - **Procurement Studio** was added as a site and given the weekend's session: 34 turns and 10 cards, flagged reconstructed.
  - **EkBill's `docs/DECISIONS.md`** at 4f28628 was imported as 129 reconstructed cards. The first parse got 122 cards: it missed the log's later `## 19 Oct 2026: …` sections, and one card swallowed a section. The corrected parse was reconciled, adding 7 cards and 1 superseding card. The faulty card stays in the record, superseded.

## EkBill: how to sign the five traced screens

The five traced figures are on five captured views. A signature names a Blueprint screen (a route), so they are three walkthrough steps:

| Step              | Captured views    | Traced figures                                      |
| ----------------- | ----------------- | --------------------------------------------------- |
| `/bills/[number]` | INV-042, INV-043  | bill total ₹7,316; walk-in bill total ₹5,310        |
| `/dues`           | dues              | dues ₹39,914                                        |
| `/gst`            | owner, accountant | GST ₹21,483; taxable ₹1,19,350 (each on both views) |

I have not signed anything in your name. To sign:

1. Open <http://localhost:3000/site/ekbill/walkthrough> (`pnpm dev` is running).
2. For each of the three steps, read the statement (or press Read aloud), check it against the screenshot, and press **Confirm and sign as Rachit Agarwal**.

Each signature:

- is a row in `signoffs` with an `audit_log` row;
- is a line in `work/ekbill/repo/.rama/signoffs.jsonl`;
- turns the bricks of that screen green (tested) or amber (signed only) on the building.

The other six steps (`/`, `/bills`, `/bills/new`, `/customers`, `/items`, `/aap`) have no traced figure. You can sign them too, or leave them.

The gate workflow is at `work/ekbill/repo/.github/workflows/rama-gate.yml`, pinned to a House of Rama commit of this stage (`rama-ceremony install-gate ekbill --ref <commit>` re-pins it). It is not committed to EkBill and not pushed: committing `.rama/` and the workflow is the EkBill team's act.

## Tests

- **Append-only.** UPDATE, DELETE and TRUNCATE on the four tables fail with `append-only` (`packages/db/src/db.test.ts`), and inserts write `audit_log`.
- **Gate on crafted fixtures** (`packages/ceremony/test/gate.test.ts`):
  - changed screens with no signature;
  - a passing test, and a failed test that does not count;
  - a signature at the change;
  - a signature before the change;
  - a replacement, then a withdrawal;
  - a rewritten signature file;
  - a removed screen and a deleted brick, which count as changes;
  - `.rama/gate.json`, `rama.config.json` and `RAMA_GATE=off`, all ignored;
  - nothing changed;
  - a bad base.
- **Supersede chain** against a real database (`test/store.test.ts`):
  - a replacement, then a withdrawal;
  - a fork, a jump to another target, and a bare withdrawal, each refused;
  - two concurrent supersessions of one signature: exactly one succeeds;
  - a fork inserted straight into the database, refused by the unique index;
  - the file equals the rows;
  - nothing is mirrored for a refused row;
  - a mirror that cannot be written: the row is recorded (`MirrorError`), and the next write appends the lost line first.
- **Imports:** the weekend session, both heading forms of a decisions log, and the reconciliation, both pure and against the database.
- **Walkthrough script:**
  - steps, statements and stale signatures (`test/walkthrough.test.ts`);
  - the page, rendered over a fixture site (`showroom/page.test.tsx`).
- **Routes:** every new route has handler tests covering 200, 400, 404, 409, 502 and 503 (`app/api/site/[siteId]/ceremony.test.ts`), plus the site office page against a throwaway database.
- **Canvas:** marks red, then amber and green after signing (`canvas/frame.test.ts`). Metrics: `signatureCoverage` and `brickMarks`.
- **Workflow** (`test/workflow.test.ts`): `pull_request_target`, a read-only token, no secrets, target code only in the tests job (no House of Rama checkout there), and the gate job running whatever the tests job did.
- **E2E on EkBill** (`tests/stage-4.ekbill.test.ts`, local), on a clone with its capture and a throwaway database:
  - a Playwright walkthrough in the real app signs `/gst` and `/dues`;
  - both land in Postgres, in `audit_log` and in `.rama/signoffs.jsonl`;
  - the gate on EkBill's real history passes `/gst` and `/dues` and fails `/bills`;
  - a rewritten signature fails the gate.
- **E2E, CI-safe** (`tests/stage-4.e2e.test.ts`): the `rama` executable exits 1 with the unsigned screen named, 0 once a signature is committed, and 2 with the usage.
- **`@vendor`:** one real drafted question (`test/discovery.vendor.test.ts`): "When you say the bill has to show GST correctly, what are the rules you follow today: which GST rate or rates do you charge, and does it change depending on the customer or the item?"
- **Watcher:** green, 317 tests at f7e3648.

## Deviations from the prompt

- **Triggers instead of a Postgres rule** for append-only. A trigger refuses with an error; a rule would drop the write silently.
- **The gate's test rule.** It requires a passing test behind every changed code brick, rather than "a passing test file among its bricks": a screen's bricks never include test files.
- **The reconstructed session.** The prompt names a "reconstructed EkBill session from the weekend", but the weekend session is about Procurement Studio, as its own text says. It went to Procurement Studio, and EkBill's first record is its own decisions log, reconstructed.
- **Signatures name Blueprint screens.** The prompt does not say what a screen's id is. A Blueprint screen with several captured views (`/gst` as owner and as accountant) is one signature.

## Reviewer findings

Run 1 at e7d17b6 found three code defects and three report claims. All are fixed, each with a test:

1. **Target code could reach the gate in CI.** An install script in a pull request could rewrite House of Rama's checkout on the same runner. Fixed: two jobs on two runners, and the gate job never runs target code.
2. **The gate saw only HEAD's screens.** A removed screen, or a brick deleted from a screen, went unseen. Fixed: screens and bricks at the base count too.
3. **Rolling back a mirror line could erase another writer's committed line.** Fixed: one advisory lock per site, and only committed rows are appended, forward.
4. **(Report)** "Mirrors are written in the same step" overstated it. Fixed: reworded to the new design.
5. **(Report)** "A chain may not fork" did not hold under concurrency. Fixed: the lock, plus a unique index on `supersedes`.
6. **(Report)** "The test step cannot fail the job" was false: `npm ci` could abort it. Fixed: the gate job runs whatever the tests job did.

## Real model cost

`pnpm cost 4` before the review: two `discovery.v1` calls (the vendor test, run twice), 808 input and 132 output tokens, ₹0.28.

## Open questions

1. **The three EkBill screens are yours to sign.** Signing them is the last done-criterion of the stage.
2. **Should a walkthrough also sign each captured view** (owner and accountant separately), or is one signature per route right?
3. **Push.** The pinned House of Rama commit has to be on GitHub before EkBill's workflow can check it out. I have not pushed Stage 4 and will ask first.
4. **Decision cards for EkBill name no screen.** Its log does not say which screen a decision is about, so the walkthrough statements hold only the traced figures. Linking cards to screens is a confirmation for a person, not something to guess.
