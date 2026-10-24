# Stage 7 — Workbench

Built 2026-10-24, from tag `stage-7-start`.

## Where this stage stands

A person with no terminal opens the app, picks their name, enters keys in Settings, starts a product and gets its GitHub repository, and runs Test drive to green. `tests/stage-7.e2e.test.ts` does exactly that in a real browser on the real dev server, against a stub GitHub so nothing leaves the machine. Test drive itself runs the whole loop on the sample product in about a minute with no keys at all (`packages/workbench/test/testdrive.test.ts`). Both run in the watcher and in CI.

## What was built

**Harmony first.** ergOS Harmony arrived during the stage (`design/harmony/`, synced from `Ergplan/designsystem` d00bc9a), and the stage prompt now applies it first.

- `apps/rama/app/harmony-tokens.css` is generated from `tokens.json`, both themes, with a drift check in the watcher and CI. The bundle's CSS and runtime are loaded from their verbatim copies, with Urbanist and JetBrains Mono.
- The chrome is Harmony's components: the Sidebar and TopBar on every screen after "Who are you?" (the picker stands alone), `eg-btn` with one primary per view, chips for the three states and the key lights, the folder card as each screen's one green object (Test drive on the home page, the verdict on Test drive's page), and the activity timeline for a job's steps.
- On a site, the trainer console is the Sidebar, on the site's page and on its Showroom, office, walkthrough, audit and handover. At most one of its acts is primary: the one possible now. None is, when that act waits on something, such as the audit on the OpenAI key; the greyed button then says what.
- The app's older colour names are aliases of the tokens, so every remaining view follows them. The Brick canvas keeps its own colours inside the canvas, and so does the legend beneath it, which names those colours.
- Settings shows the synced version.

**People (rule 11).** `members.json` at the root, `[{name, role: trainer | customer}]`, is read at start (`packages/db/src/members.ts`). `/login` is "Who are you?": a button per person, which posts the name to `POST /api/auth/pick`. That opens a session for that person, the same sessions as before. A trainer opens every site, Settings and the campus; a customer opens their own sites. The Gaps 1 username-and-password form is kept behind `AUTH_MODE=password` for the floor edition; each mode answers 404 on the other's route. `RAMA_ACCOUNTS` is gone from `.env`. The seed and the command line give what they add to the first trainer (`ownerName`). The authorization tests now get their sessions through the picker's real handler and database, and check that what the picked person writes carries their name and person id.

**Settings → Keys.** The Anthropic key, the OpenAI key and the GitHub token, in the `secrets` table: AES-256-GCM under the app's own key, `work/.secret-key`, generated on first use with mode 600 and never committed (`packages/db/src/secrets.ts`). Each key is shown only as `••••` and its last four characters, with one sentence on what it is for and where to get it. Its Test button makes one harmless call (list the models; GitHub: who am I) and answers with a green or red light and the reason in words (`packages/model/src/keys.ts`). Saving a key tests it at once. `packages/model`'s `call()` and the GitHub client read keys from here. The environment's keys are read only while the table holds no key at all, and the screen says so.

**Settings → GitHub, Harmony, People.** The account or organisation products are created under (`settings` table). The design system shows "pending" until `design/harmony/tokens.json` exists. People lists `members.json`.

**Products.** "New product" on the home page takes a name and a one-line idea (`packages/workbench/src/products.ts`). It makes the product's site: a new git repository in `work/<id>/repo` with a README and the first commit, by the person. It records the product's first decision card, open, and installs the gate workflow with House of Rama's public key. When GitHub is set, it creates the private repository under the account and pushes the work, recording the repository on the site. When GitHub is not set, a grey flag says the product is kept on this laptop and what to do; "Create repository" on the product's console does the rest later. The token travels only in request headers and in the environment of one `git push`, as an extra header; it is never in a remote, a config file or a log, and the tests check every file of the work dir for it.

**The app's signing key.** When `RAMA_SIGNING_KEY` is unset, the app generates its own Ed25519 key in `work/.signing-key` (`appSealer`), so signing and the product gate's public key need no command.

**The sample product.** `fixtures/sample-product/` is the Chai Stall, a Next.js + Drizzle app on the house stack: 19 files, three screens (today's orders, a new order, today's total), five figures marked per HOUSE-STYLE and mapped in `rama/figures.ts`, a screens file naming each screen's audience, and two passing tests. `scripts/make-sample.mjs` replays it as six commits with fixed authors and dates, so every run gives the same SHAs. It replaces EkBill everywhere EkBill was used in tests:

- capture and re-execution: Test drive's Build step, 8 of 8 figures traced and re-computed;
- the walkthrough and the gate on real history: `tests/stage-4.sample.e2e.test.ts`;
- the real audit: `tests/stage-5.sample.vendor.e2e.test.ts`, @vendor.

The first two run in CI and the watcher, which EkBill's could not; the vendor audit runs only on request, like every @vendor test.

**Three states and one counting rule (Invariant 11).** `stateOf(screen)` in `packages/blueprint/src/metrics/states.ts` returns **Confirmed**, **Verified** or **Unverified**, with its evidence in plain words.

- Confirmed: a sealed signature at or after the screen's last change.
- Verified: in the last run, at or after the last change, a test passed that rendered the screen (imported its page and used it) or called every one of the screen's figure functions. Two things must agree. The test's code says so: read as code, with comments and strings set aside. And the run's own record shows that exactly that code ran: the page's own component, or each figure function, in that test file's worker. The record is the V8 coverage of each test file's worker, kept with the run (`TestRun.executed`). Importing a page, a call in a helper nobody calls, or a skipped test is not evidence. The figure functions are those photographed at the current commit; when the screens were photographed before the last change, no figure evidence counts until they are photographed again. A path handed to a browser is not counted, because the run cannot show the visit.
- Unverified: neither.

`testReach` reads from each test's source what it calls, renders and visits. `counts(screens, audience)` says "N of M <audience> screens signed", with the audience read from the screens file as it is now. A screen the file does not name is counted as one whose audience is not said, never as a customer's. "A test imports this file" is gone from the trust report, the brick view, the reviewer's warning and the building's dots. A brick's dot is now green only on a signed screen. The audit's per-brick test note no longer words an import as confidence. `siteStates` (workbench) assembles a site's states from its capture, last test run and sealed signatures, and the trust report and the console show them.

**Decision cards.** A card is recorded open (or not built). It becomes decided only by a recorded yes: `POST /decisions/yes` writes a new card, decided, by the person who said yes, superseding the open one. `POST /decisions` refuses `decided`. "Scrap everything" (`POST /decisions/scrap`) withdraws every card in force, each by a new card with status `withdrawn`, so the old ones are kept, and starts a session named `Draft: <name>`. The site office has the "Yes, decided" button and the scrap form.

**Test drive (rule 16).** One button on the home page starts it as a job; `/testdrive` shows the steps as they finish, each with its time and sentence, and pass or fail in words. The steps:

1. Idea: the sample built afresh as `testdrive-<n>` (earlier runs are kept, with their signature journals), and its first card decided by a recorded yes.
2. Street: drawn from its history.
3. Build: built and photographed, every figure traced and re-computed.
4. Tests: the product's own tests.
5. Walkthrough: a scripted walkthrough signing the customer screens as "Test drive".
6. Three states: two Confirmed, one Verified; "2 of 2 customer screens signed".
7. Audit: by the auditor when the OpenAI key is set, otherwise by a stand-in that adds nothing and says so.

No voice and no camera. With no keys set it needs no network either: the sample's packages are links to House of Rama's own, which is why its build uses webpack (DECISIONS). With the OpenAI key set, its audit asks the real auditor.

**Jobs and buttons (rule 15).** Refresh the picture, Photograph the screens, Run the tests and Call the audit are jobs (`packages/workbench/src/jobs.ts`, `actions.ts`), recorded step by step in `work/.jobs/`. A failed step is a grey flag with a plain sentence and the next action. A page shows a job that was cut off by a restart as interrupted. Every screen that used to show a command (no Blueprint, nothing captured, no audit, no pod) now offers a button or says who does it. `apps/rama/components/wording.test.ts` fails if a page or component ever spells out a command, or if a page, component, audit finding or workbench sentence presents a test importing a file as confidence.

**Trainer console.** A left column on every site:

- the site in the three words, the counts per audience, and figures traced over shown;
- the acts: Start session, Close ideation, Start build, Pause build, Start walkthrough, Call the audit, Hand over. They are greyed when not possible, with the reason or the stage that enables them;
- the work buttons, each with its last run's steps;
- the product's repository, or "Create repository";
- the agenda: open cards and unsigned customer screens;
- the key lights.

## Tests

- New: `packages/db/src/members.test.ts`, `secrets.test.ts` (round-trip, masking, the environment only while Settings is empty, the key file's mode, a tampered or wrongly keyed value refused), `packages/model/src/keys.test.ts` (Test buttons against stubs), `packages/blueprint/src/metrics/states.test.ts` (all three states on the sample's real history, counts per audience, "an import is not evidence"), `packages/workbench/test/products.test.ts` (stub GitHub and bare repositories), `testdrive.test.ts`, `packages/ceremony/test/seal.test.ts` (the generated key), and in the app: picker, settings, products, act and the yes/scrap handlers, the wording test, the authz additions (Settings is a trainer's; the new routes refuse without a session; a trainer opens every site; created_by is the picked person). End to end: `tests/stage-7.e2e.test.ts` and `tests/stage-4.sample.e2e.test.ts`.
- @vendor, not run: `packages/workbench/test/github.vendor.test.ts` creates one real private repository. It needs a GitHub token and owner, and leaves a repository behind, so it waits for the user.
- Retired: `tests/stage-3.ekbill.test.ts`, `tests/stage-4.ekbill.test.ts`, `tests/stage-5.vendor.ekbill.test.ts` and the `ekbill` vitest project, replaced as listed above (the stage prompt: the sample product "replaces EkBill everywhere EkBill was used in tests").

## Deviations and readings of the prompt

- **Environment variables.** Rule 11 says the only environment variables are `DATABASE_URL` and the signing key. Read as the only secrets: the non-secret switches (`BUILDER_VENDOR`, `AUDITOR_VENDOR`, the model names, `GIT_SHA`, `RAMA_POD_TOKEN`, `RAMA_BASE_URL`, `AUTH_MODE`) stay for engineers, with defaults. `RAMA_GITHUB_API` lets the end-to-end test point the GitHub client at a stub; it is unset in use.
- **Settings and the keys.** Settings and its key routes are a trainer's; a customer is refused.
- **The sample's location.** The sample product lives in `fixtures/`, a folder the stage prompt names that is not in CLAUDE.md §4's layout. It is recorded in ARCHITECTURE's folders.
- **Confirmed outranks Verified** when a screen is both (DECISIONS).
- **The merge gate's rule is unchanged** (Invariant 4): it still credits tests through imports. Bringing it onto the stricter Verified rule is in KNOWN-GAPS.
- **Test drive's audit without a key** is a stand-in, recorded as `stand-in` in `model_calls` and on the report; it is not a second vendor's opinion and is never used outside Test drive.
- **Bundler-safe paths.** `packages/trace` and `packages/ceremony/install` find their files without `import.meta.url` / `import.meta.dirname` at load, which the app's server bundle breaks. The app now runs captures and installs gates, which only the command line did before.

## Reviewer findings

Seven runs of the independent reviewer (OpenAI `gpt-6.1-sol`, fresh context; transcripts in `stage-7.review.md`). Each code defect was fixed and the reviewer rerun, until runs 6 and 7 reported none.

| Run | Code defects found                                                                                                                                                                                                                               | Fix                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A page import or a bare path string counted as evidence for Verified (Invariant 11). Test drive deleted earlier runs' checkouts, signature journals included (Invariant 3). The sample's `orders` table had no provenance columns (Invariant 8). | A render needs the page used, a visit needs a visiting call. Earlier runs are kept, and the home page lists the latest. `site_id`, `created_at` and `created_by` added.              |
| 2   | Evidence was read from raw source, comments and strings included.                                                                                                                                                                                | `codeOf` reads a test as code only.                                                                                                                                                  |
| 3   | A call in a helper nobody calls, or in a skipped test, still counted.                                                                                                                                                                            | Verified needs the run's own record of what executed: V8 coverage per test file's worker (`TestRun.executed`). Route visits are no longer counted, because the run cannot show them. |
| 4   | Any executed function of a page's module counted as a render. Audiences came from the last capture, and defaulted to customer.                                                                                                                   | A render needs the page's own component to have run. Audiences come from the screens file as it is now; an unnamed screen counts as "not said".                                      |
| 5   | Figure functions from a capture older than the current commit could make a screen Verified.                                                                                                                                                      | Figure evidence counts only from a capture at the current commit.                                                                                                                    |
| 6–7 | None (run 7 read the whole stage, the Harmony work included).                                                                                                                                                                                    | —                                                                                                                                                                                    |

Report claims the reviewer corrected:

- the vendor audit is not in CI;
- "no network" holds only without keys;
- a failed step is a grey flag (the colour is now grey, as rule 15 says).

Findings that a diff cannot settle, listed every run as not-a-defect:

- (c) The append-only and audit triggers sit outside the diff. They are unchanged since Stage 4, and `packages/db/src/db.test.ts` checks them.
- (d) The generators and drift checks are unchanged. The watcher and CI regenerate `blueprint/self.json` and `docs/BLUEPRINT.md` and fail on any difference; both were green at every commit.
- (e) Removing `RAMA_ACCOUNTS` from `.env` cannot be shown, because `.env` is not in the diff. Run times are what the tests measured (Test drive takes about 50 s a run in `testdrive.test.ts`; the e2e takes about 2 min).

## Real model cost

Seven reviewer calls: 1,145,312 input and 13,146 output tokens on `gpt-6.1-sol`, **₹230** in all (`pnpm cost 7`). Test drive made no model call: its audit used the stand-in, since no key is set in the tests. No @vendor test was run.

## Open questions

1. Should the real GitHub check (`github.vendor.test.ts`) run, and under which account? It leaves a private repository named `rama-vendor-check-<random>` behind.
2. The box at http://34.131.209.81:3389 is reachable from anywhere, and with the picker anyone there can act as anyone. Keep the box on the picker (version 1), switch it to `AUTH_MODE=password` until the floor edition, or close the port?
3. The second person in `members.json`: today Rachit Agarwal (trainer) and "Test drive" (customer, used by Test drive). Who else should be on it?
