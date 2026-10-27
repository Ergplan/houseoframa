# Stage 11 — Glass and flow

Built 2026-10-27, from tag `stage-11-start` (which sits one commit before the stage's first commit: the lockfile fix that closed Stage 10, `609a7ab`, came after the tag was pushed, and a pushed tag is not moved).

Nothing here changes what is recorded; it changes what is seen. The stage was built in its four parts, committed after each: the journey (`859cd1e`), the camera (`b9884f9`), code written inside the glass (`df6c9b5`), and the flow.

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
  - No drafter key: "Not explained yet" everywhere, and the build is unaffected.
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
  - a figure the mapping did not give is never named;
  - unconfirmed until confirmed, and the overlay write audited;
  - "Not explained yet" with no drafter key;
  - no developer word kept;
  - the recorded English holds none (`explain.test.ts`, `tail.test.ts`).
- **Pipe geometry from trail fixtures:** a pipe for every step, a dry labelled one for every untraced step, from the ground when kept elsewhere, the same from every side (`packages/stage/src/pipes.test.ts`).
- **The flow sequence from a recorded re-execution:** the day's four orders become ₹113.00 step by step; dry steps say untraced; the form is the form; a step a second, held and stepped (`packages/trace/test/flow.test.ts`, `pipes.test.ts`).
- **Routes:** `GET code`, `GET typing`, `POST explain/confirm` and `POST voice/tell` (`code/handler.test.ts`, `voice/handler.test.ts`, `authz.test.tsx`).
- **E2e** (`tests/stage-11.e2e.test.ts`):
  - a new product, built by the recorded builder through the loop;
  - the five tabs and Care walked, with one lit action on each act that has a next thing to do, and a screenshot of each;
  - the recorded build replayed on the Street, and the Street turned twice;
  - Take an order zoomed into down to its code;
  - a change of its plan typed in, every block's English read, and one confirmed by name;
  - the flow of the day's takings watched until the real rows become ₹113.00 on the screen.

## Deviations and readings of the prompt

(Filled in at the end.)

## Reviewer findings

(Filled in after the independent review.)

## Real model cost

(Filled in at the end.)

## Open questions

(Filled in at the end.)
