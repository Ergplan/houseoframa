# Stage 11 — Glass and flow

Built 2026-10-27, from tag `stage-11-start` (which sits one commit before the stage's first commit: the lockfile fix that closed Stage 10, `609a7ab`, came after the tag was pushed, and a pushed tag is not moved).

Nothing here changes what is recorded; it changes what is seen. The stage was built in its five parts, committed after each: the journey (`859cd1e`), the camera (`b9884f9`), code written inside the glass (`df6c9b5`), the flow (`4bea3e9`), and the inside, the part added to the plan on 2026-10-28.

## What was built

**The journey (apps/rama).**

- **The tabs.** A site's pages wear the journey of a build across the top: Idea, Build, Walk through, Audit and Hand over, then a small Care tab. Each tab shows only its own actions (`components/workbench/journey.ts`, `JourneyBar`).
- **One lit action per tab.** At most one action wears Harmony's green folder, the next thing to do in that act; exactly one whenever the act has a next thing to do. When it has none (every customer screen signed, nothing to hand over yet), the bar says why, and nothing is lit.
  - Idea: Start session, then Close ideation.
  - Build: Start build, or Pause build while the builder works.
  - Walk through: the page's own Confirm and sign.
  - Audit: Call the audit.
  - Hand over: the page's own Hand over, once nothing stands in the way.
  - Care: Photograph the screens, only while they are not photographed.

  Everything else is quiet and says in one sentence why it waits. Other primaries on a site's pages were made quiet: the voice's start button, the brains form and the old console's buttons.

- **Care.** The console's long list in the sidebar is gone. Care (`/site/[siteId]/care`) holds the work buttons with their last outcome, GitHub, the agenda, the counts and the key lights.
- **The lakefront.** It takes the full width. Its Street and Building panels are one folding panel over the picture's edge, open on the chosen thing, beside the picture's own hover card. A building leads to the next ("Next building").
- Screenshots of each tab at 1920×1080 are in `docs/reports/stage-11/`.

**The camera (packages/stage `camera.ts`).**

- **One state, every draw.** One state, {level, building, orientation, scale, centre}, that every draw takes.
- **Quarter turns.** A turn rotates the Street's world before it is projected (`orientStreet`), so drawing and picking are the same code from all four sides and depth sorts as before. The lake, the bank and the jetties became areas so they turn too.
- **The Building level.** It carries its real screens on whichever face is toward the camera, laid left to right: never mirrored (`orientScene`, `facadeFaceOf`).
- **Zoom.** It is continuous within a level and hands off at 3.2 times. Closer onto a building opens it, closer at a building opens its code, and further than the whole picture falls back a level.
- **The address.** The camera is in it (`o`, `z`, `cx`, `cy`).
- **Controls.** The ring ("Turn left", "Turn right", "Seen from the front / right / back / left", "Closer", "Further"), the wheel, a drag sideways, the arrow keys, and the voice's turn left, turn right, turn around, closer and further all move the same camera. A turn fades from the last frame over 300 ms.

**Code written inside the glass (packages/workbench, packages/stage).**

- **The live tail.** While a lift runs, House of Rama looks at the product's checkout a few times a second and keeps each changed file before and after (`startTail`). Replay takes the same before and after from each commit.
- **Typing.**
  - Pace: the code level types a change in at the builder's pace, but never faster than a line per 700 ms.
  - Deletions: deleted lines fall out first.
  - Catch up: jumps to now (`typingPlan`, `typedAt`, `CodePane`).
  - Building level: the brick being written glows and grows by its line count.
- **Blocks.** The TypeScript parser splits each file into blocks: imports, types, functions or components, queries, tables, route handlers, tests (`splitBlocks`). Every line is in exactly one block, and each block is kept by its text's hash.
- **The English pane.**
  - Drafting: one call to the drafter per block not yet explained (`explain.v1`, `explainFile`). Lifts are drafted beside the build, never holding it up (`explainLift`).
  - What the drafter is given: only the block, the names it uses and the figures it serves.
  - Unconfirmed until a named person confirms it in the pane. Confirmed sentences go to `.rama/explanations.json` with an `audit_log` row (`confirmExplanation`).
  - Developer words: a sentence holding one of the glossary's banned words is not kept.
  - No drafter key: nothing new is drafted, and the build is unaffected. A block with no sentence yet says "Not explained yet"; sentences already drafted (the recorded build's, or an earlier lift's) and confirmed ones stay.
- **Figures in the code.** Each figure a block works out or shows is a way to its trail, named in the customer's words.
- **Replay.** It scrubs a file change by change, its English as recorded at that commit: a sentence drafted at a later commit is not shown at an earlier one, and the figure chips, read from today's figures file, are shown only for the file as it is now.
- **The recorded build carries its English** (`fixtures/sample-build/explanations/`, `pnpm record-explanations`), so Test drive and the tests read it without a key.

**The flow (packages/trace, packages/stage).**

- **The steps.** `flowOf` turns a figure's trail into the steps its real data takes, from the capture's mapping and re-execution only:
  - the rows leaving where they are kept (how many, and the first three in words);
  - the value the product's own function gave;
  - the formula;
  - the figure on the screen.

  A step with nothing recorded is dry and says untraced.

- **The pipes.** `buildingPipes` lays them at the Building level: from the table's part of the building, or the ground under it, along the floors to the function's part and up to the figure on the glass. An untraced step gets a dry broken pipe.
- **The water.** It moves a step a second and can be paused and stepped (`flowAt`, `drawPipes`, `FlowPanel`). "Show me the flow" is on every traced figure, and in the voice's grammar. Each step's sentence is handed to the voice as builder text (`POST voice/tell`).

**The inside (packages/stage `inside.ts`, apps/rama `InsideView`).** The Stage 2 brick building is gone from the app; `apps/rama/canvas` and the site view are removed.

- **The third level is the inside of the same building**, under the same camera: the four orientations, the zoom and the hand-offs. Zooming past the facade goes through the glass; the breadcrumb reads Street › Take an order › inside.
- **Floors and bricks.** The floors (what it shows, decides, remembers, talks to) are slabs one above the other. Each brick is a glass block on its floor, its height by its lines, laid in the order the lifts laid it.
- **Every file the old building showed stands inside.** The checks and the papers (documents, settings, pictures), which the Street does not draw, stand on two lower floors: "How it is checked", in the building of the code a check imports, and "Its papers", behind the screens.
- **Reaching every brick.** A floor can be chosen, so a brick under the floors above can be clicked. The finder opens any file by name, in whichever building it stands.
- **The lifts.** The deck replays them commit by commit; each commit opens in the panel.
- **The flow's pipes** run between the bricks: from where an input is kept, to the brick that works the figure out, to the brick that shows it.
- **Fly the audit.** The drones beam over the bricks, as they did on the old building, with the live log and the report in the panel.
- **A brick opens to its code in the side panel**: the typing view and the English pane, with the Stage 2 inspector under them, unchanged in meaning (the Trust report, a Commit, the Brick in English, Confirm). Inside, the panel is a column of its own beside the picture.

## Tests

- **Tab layout:** five acts and Care in order; one lit action per act, Sign and Hand over the page's own; each action in its own act only; no developer word on the tabs or the lit labels (`components/workbench/journey.test.tsx`).
- **Camera reducer:** turns; zoom about the pointer; hand-offs both ways; the address round trip (`packages/stage/src/camera.test.ts`).
- **Four orientations:**
  - frames are deterministic, and four turns come back to the start;
  - everything stays on its ground, and the labels are the same upright words;
  - depth sorts correctly;
  - pick finds facades, bricks and plots from every side;
  - the Building level picks its figure and bricks, and lays its screen left to right, from every side.
- **Block splitter:** every line in exactly one block, on every house-stack file and on a fixture with each kind (`packages/workbench/test/blocks.test.ts`).
- **The typing stream from a recorded lift:** lines in order, never faster than READ_MS, the builder's slower pace kept, deletions falling first, deterministic frames (`packages/stage/src/typing.test.ts`). The tail of a lift on a real checkout (`tail.test.ts`).
- **Explanations:**
  - cached by hash and asked once per block;
  - only the block, its imports and its figures sent;
  - the pane's figure (its chip, and the way to its trail) is only ever one the mapping gave; the sentence itself is the drafter's words, shown unconfirmed until a person confirms it;
  - unconfirmed until confirmed, and the overlay write audited;
  - "Not explained yet" with no drafter key;
  - no developer word kept;
  - the recorded English holds none (`explain.test.ts`, `tail.test.ts`).
- **Pipe geometry from trail fixtures:** a pipe for every step, a dry labelled one for every untraced step, from the ground when kept elsewhere, the same from every side (`packages/stage/src/pipes.test.ts`).
- **The flow sequence from a recorded re-execution:** the day's four orders become ₹113.00 step by step; dry steps say untraced; the form is the form; a step a second, held and stepped (`packages/trace/test/flow.test.ts`, `pipes.test.ts`).
- **Routes:** `GET code`, `GET typing`, `POST explain/confirm` and `POST voice/tell` (`code/handler.test.ts`, `voice/handler.test.ts`, `authz.test.tsx`).
- **The inside** (`packages/stage/src/inside.test.ts`, `apps/rama/components/lakefront/inside.walk.test.tsx`):
  - frames are deterministic;
  - every brick stands on its floor, sized by its lines, in build order;
  - the replay;
  - where checks and papers stand;
  - a chosen floor;
  - pipes for every step between the bricks, from every side, with a dry pipe for each untraced one;
  - **the walk:** every brick of the sample product and of this repository (716 files) is clicked inside its building from all four sides, and the panel shows for it the English edges, the lift that laid it, and the figures the Stage 2 inspector showed; every commit opens.

  The Stage 2, 5 and 8 end-to-end tests now click bricks, fly the audit and read the inspector inside the buildings.

- **E2e** (`tests/stage-11.e2e.test.ts`):
  - a new product, built by the recorded builder through the loop;
  - the five tabs and Care walked, with one lit action on each act that has a next thing to do, and a screenshot of each;
  - the recorded build replayed on the Street, and the Street turned twice;
  - Take an order zoomed into down to its code;
  - a change of its plan typed in, every block's English read, and one confirmed by name;
  - the flow of the day's takings watched until the real rows become ₹113.00 on the screen.

## Deviations and readings of the prompt

- **The pipes are drawn at the Building level only.** On the Street, and for a trail that crosses into another building's code, the flow is shown as its steps in words (KNOWN-GAPS). The flow of an older commit is not offered in replay: only the current commit's re-execution is kept, and water is only what was recorded.
- **"Every number" in the code is read as the figure chips.** A block that works out or shows a figure carries a chip in the customer's words, leading to the figure's trail. Other numbers in the code (a loop's bound, a test's fixture) are code, not figures, and carry no chip. The chips are shown for the file as it is now, not for a replayed commit, because the figures file is read as it is today.
- **The live typing comes from file snapshots** taken a few times a second during a lift, not from the builder's own keystrokes, so it works the same for every builder (KNOWN-GAPS).
- **The inside's place for the checks and the papers.** The plan names the four floors. The files the Street does not draw also needed a place inside, or the old building's walk could not pass, so they stand on two more floors below the four, named in plain words. A check stands with the code it imports.
- **What the old building drew that the inside does not:** the cranes and the digger during the replay, the sky's time of day, and the cables on hover (the open brick's cables are drawn). Nothing a person could read there is gone: each lift, each brick's English, edges, history and figures, and the audit's log and report are all in the panel.
- **The tag `stage-11-start` sits one commit early**, before the lockfile fix that closed Stage 10 (`609a7ab`). A pushed tag is not moved.
- **Found at the end of the stage, not by the reviewer: tests spent this laptop's drafter key.** A model call made with a test's own environment still read its key from, and wrote its row into, the laptop's database. On 2026-10-27 the watcher's Test drive test drafted 1,215 blocks this way, ₹292 in total. The cause was two bugs, both fixed:
  - `call()` now takes the key and writes the row through the environment it is given;
  - the recorded builder now puts the recorded English into the run's own work dir, so the test finds it and drafts nothing.

  The Test drive test now checks both: no model call, and every recorded sentence in its own work dir.

## Reviewer findings

The reviewer (OpenAI, gpt-6.1-sol, fresh context, `pnpm review 11`) ran RUNS times; every run is in `docs/reports/stage-11.review.md`.

Fixed in code:

- **Run 1.**
  - `voice/tell` took any text from the page as a builder line. It now takes a figure and a step, and the sentence is the flow House of Rama derived.
  - The import group was never explained. It is now, and the recording was redone: 72 blocks, $0.108.
  - The tail of a build was cut at every lift, losing the cursor. It is now one growing file.
  - Replay showed sentences drafted later. A draft now carries its commit and shows only from that commit on.
  - The pane stayed on "Being written" after a replayed change had typed in.
  - The Building level did not fade over a turn.
- **Run 2.** The live typing queued a fresh plan on every poll while one was typing.
- **Run 3.**
  - Catch up left the typing marked as playing.
  - The voice's "closer" skipped the chosen building.
- **Run 4.**
  - The builder's pace was lost across polls.
  - A refused draft was asked again.
- **Run 5.**
  - Only two pipes were drawn, not one per step.
  - A figure shown twice took its first occurrence's value.
- **Run 6.** "Next building" kept the last building's camera. Each building's view is now fresh.
- **Run 7.**
  - Zoom moved the point under the pointer after a first zoom.
  - Water ran past a dry step.
- **Run 8.** The code pane kept the previous file when another file was opened. It is now fresh for each file.

Report claims corrected (runs 1, 2, 4, 5 and 6): "exactly one lit action" (none when the act has no next thing to do, and the bar says why), the turn fade, "Not explained yet" with no key, once-per-block drafting, a pipe per step, and what the pane names.

Not resolved by code:

- **(d) in every run, and (a) and (c) in most, are cannot-tell.** The generator, the drift checks, the CI wiring, and the append-only and audit guards on `signoffs`, `audits` and `decisions` stand from earlier stages, outside the diff. This stage adds no write to those three tables; the one new write that is audited (`confirmExplanation`) is in the diff, with its test.

## Real model cost

`pnpm cost 11`:

| What                                                              | Model             | Calls    | Cost      |
| ----------------------------------------------------------------- | ----------------- | -------- | --------- |
| Independent reviewer                                              | gpt-6.1-sol       | REVCALLS | REVCOST   |
| Drafter calls made by tests with the laptop's key (the bug above) | claude-sonnet-5-5 | 1,215    | ₹292      |
| **Recorded total**                                                |                   |          | **TOTAL** |

Not in that table:

- **The sample build's English** (`pnpm record-explanations`, gpt-6.1-sol): 72 calls, 38,879 input and 3,048 output tokens, $0.108 (₹10). Its rows were counted by the script and not written, so the recording carries its own cost (`fixtures/sample-build/explanations-cost.json`).
- **A live build's English costs about the same per build**: one call per block a lift changes, never the same block twice.

## Open questions

- **Pipes across the Street.** Should a trail that crosses into another building's code get pipes along the Street's roads? It is a picture-only change, with no change to the record.
- **The flow in replay.** Keeping each commit's re-execution would let replay show older flows. That needs more stored per commit. Is it worth it?
- **The Anthropic credit.** It still limits Claude Code builds. The drafter here ran on OpenAI for the recording.
- **The box is open to anyone with its address** (Stage 9's question stands).
- **This VM's memory.** The watcher's full run (several dev servers and headless browsers) took the VM near its 16 GB during the stage, and the dev app and the watcher were stopped once for it. A larger VM, or running the end-to-end tests one at a time in the watcher, would avoid it.
