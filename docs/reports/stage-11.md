# Stage 11 — Glass and flow

Built 2026-10-27, from tag `stage-11-start` (which sits one commit before the stage's first commit: the lockfile fix that closed Stage 10, `609a7ab`, came after the tag was pushed, and a pushed tag is not moved).

Nothing here changes what is recorded; it changes what is seen. The stage was built in its parts, committed after each: the journey (`859cd1e`), the camera (`b9884f9`), code written inside the glass (`df6c9b5`), the flow (`4bea3e9`), and the two parts added to the plan on 2026-10-28: the inside (`4cb7c4c`), and the ground, opened (`b501fc0`); then the member's answers to the open questions (28 Oct): the sample rebuilt with its orders in its own database, pipes along the Street's roads, and the end-to-end tests one at a time in the watcher.

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
- **The code is seen being written inside the building** (asked for after the inside was built). Over the brick of each file a lift changes, a glass card types the change in at the builder's pace, never faster than a line can be read. Deletions fall out first, a caret sits on the line being written, and the brick glows and grows.
  - Live, it follows the builder.
  - In the replay of the lifts, each lift's changes to the building's files type in before the next lift: up to four files a lift, the first four it changed. A file a lift deleted is not typed: the inside stands only the files the product has now.
  - Screenshot: `docs/reports/stage-11/inside-typing.png`.
- **A brick opens to its code in the side panel**: the typing view and the English pane, with the Stage 2 inspector under them, unchanged in meaning (the Trust report, a Commit, the Brick in English, Confirm). Inside, the panel is a column of its own beside the picture.

**The ground, opened (packages/blueprint, packages/workbench, packages/stage `ground.ts`, apps/rama `GroundView`).** A plot of the Street is a real Postgres table, and it opens.

- **A level of the stage.** Clicking a plot, zooming onto it, or saying "open orders" or "show me the table" (typed or spoken) dives into the ground. The table fills the stage as a glass slab under the same camera: it turns in quarter steps with the table on the face toward the camera, never mirrored, and it zooms. The breadcrumb reads Street › the ground › orders. It is not a side panel: a click on a column or a cell opens a card on the picture.
- **Its columns, from the code.** The extractor now reads each column of a Drizzle table from its definition: its name, type, key, whether it may be empty, the column it points at, and a `@secret` tag (`Table.fields`). A spread of the same file (the house stack's `...provenance()`) is opened; one from another file is named as unread. A column a figure on a screen is worked out from is marked ◆, and its card leads to that figure's flow, which plays on arrival.
- **Who reads and writes it.** A lit pipe rises from the slab to each building that writes the table and each that reads it; a click goes to that building.
- **Its rows, the real ones.** At most 50 at a time, newest first ("More rows", "Newer rows"), as the table holds them, with a count that says what it counts: "5 orders today · 60 in all".
  - **A product built here** reads from its own database. That database did not exist, though the prompt took it as there: the build loop's photographs now make one for each product, with a login of its own, its tables made as its own Drizzle describes them. The running product is handed that address and no other.
  - **An outside site** reads only from a read-only address entered in Settings → Databases of outside sites, with a green or red light and a sentence. Without one the slab shows the columns and says "Rows not connected".
  - Nothing else is ever shown: no row is invented, sampled, or copied from a fixture. The sample product, rebuilt (below), writes its sample day into its own orders table the first time it opens, so its plot opens on "4 orders today · 4 in all", each row `created_by` sample.
- **Read-only, and secrets masked.** Every read is on a connection whose transactions start read-only, inside a read-only transaction, with a time limit, never through the builder. A column marked secret, or whose name says it holds a key, is never read: the slab shows •••• or "empty".
- **The flow from a cell.** A cell of a column a figure is worked out from leads to that figure's flow, and says the water is the run recorded at this commit, not that row's own; any other column's flow is dry and says so.
- Screenshot: `docs/reports/stage-11/ground.png`.

**The member's answers (28 Oct).**

- **The sample, rebuilt with its orders in its own database, in one recorded build.** A product could not keep rows: the builder's prompt said to add no package and to run without a database. Now the house stack carries the Postgres driver (the version House of Rama already has, so a product's packages are still links and need no network) and `db/connect.ts`. The running app is handed its own database and its id; its tests and its build have neither and read the sample file, so they still need no database. The builder's prompt is `build.v3` (`build.v2` kept). The sample's cards now say the stall keeps its orders in its database and writes in the sample day the first time the table is empty. Claude Code (claude-sonnet-5-5) built it through the loop in a real Test drive (`testdrive-6`): 4 lifts, the first refused by the gate and fixed by the next, 8 of 8 figures traced, Test drive green, $1.25. `pnpm record-build` made it the recording in `fixtures/sample-build`, and `pnpm record-explanations` its English (84 calls on gpt-6.1-sol). The four rows in its database were written by the product's own code, with its `site_id` and `created_by` sample; House of Rama writes no product row.
- **Pipes along the roads when a trail crosses buildings** (`packages/stage` `flowPlaces`, `streetPipes`; `StreetView`). Each step of a flow stands where it is: an input kept in a table on its plot, the working-out on its function's building, the figure on the building that shows it. When more than one place is touched, the same steps run on the Street: along the road between two buildings, bend by bend, or, from a plot (which has no road), over the ground with one turn, on the side that passes through fewer other buildings. The water moves a step a second, with the same panel, dry and labelled pipes, and the voice told each step. A Building's flow panel says "This flow crosses the Street" and links there (`?flow=`); a flow that stays in one building says so on the Street and links back. In the rebuilt sample every figure read from the orders table crosses: the rows leave the plot. `flowOf` now also reads an input kept in "the orders table" (as the builder wrote it) as that table. Screenshot: `docs/reports/stage-11/street-flow.png`.
- **Replay flows stay dry except at the current commit** (KNOWN-GAPS).
- **The watcher runs the end-to-end tests one at a time, on their own**: after the other suites, as their own check ("vitest end-to-end, one file at a time"), never beside them.

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
  - the window over the brick being written (the rows around the line typing, with deletions falling), and the inside and the card drawn in Harmony's tokens only (`typing.test.ts`, `draw.test.ts`);
  - **the walk:** every brick of the sample product and of this repository (716 files) is clicked inside its building from all four sides, and the panel shows for it the English edges, the lift that laid it, and the figures the Stage 2 inspector showed; every commit opens.

  The Stage 2, 5 and 8 end-to-end tests now click bricks, fly the audit and read the inspector inside the buildings.

- **The ground opened:**
  - columns read from the definition: names, types, keys, the column pointed at, `@secret`, a same-file spread opened, another file's named as unread (`packages/blueprint/src/parse.test.ts`, `extract.test.ts`);
  - the slab: deterministic, as tall as its rows, the table on the face toward the camera from all four sides, every cell and column picked back from where it is drawn from all four sides, a pipe for each reader and writer, Harmony's tokens only, a secret never written (`packages/stage/src/ground.test.ts`); the camera's dive onto a plot and back (`camera.test.ts`); "open orders" and "show me the table" in words and in the voice (`words.test.ts`, `packages/ears/test/grammar.test.ts`, `conductor.test.ts`);
  - against a real Postgres server: the sandbox made from the product's own Drizzle tables, its rows kept when made again, its login refused House of Rama's tables; 50-row paging newest first; the count in the table's unit; masked secrets never sent; columns of the code the database lacks; "Rows not connected" for an outside site until Settings has an address; read-only enforced, a write through the reader refused and nothing changed (`packages/workbench/test/ground.test.ts`); Test drive's sample made its own database, holding the four orders of the sample day written by the stall itself, with its `site_id` and `created_by` sample (`testdrive.test.ts`);
  - routes: `GET ground` and `POST settings/databases` (`ground/handler.test.ts`, `settings/handlers.test.ts`); the page at `?ground=` on this repository's own tables, a key column masked, "Rows not connected" (`app/site/[siteId]/page.test.tsx`).
- **E2e** (`tests/stage-11.e2e.test.ts`):
  - a new product, built by the recorded builder through the loop;
  - the five tabs and Care walked, with one lit action on each act that has a next thing to do, and a screenshot of each;
  - the recorded build replayed on the Street, and the Street turned twice;
  - Take an order zoomed into down to its inside, and its lifts replayed with the code typed in over the bricks;
  - a change of its plan typed in, every block's English read, and one confirmed by name;
  - the flow of the day's takings watched until the real rows become ₹113.00 on the screen;
  - the same flow followed along the Street's roads from the Building's panel, step by step to ₹113.00; a flow that stays in one building says so;
  - "open orders" said on the Street opens the table: its columns from the code, "4 orders today · 4 in all", the sample day the stall wrote; then 60 orders written through the product's own login show newest first, 50 at a time, and More rows down to the sample day; the cups column is marked, its card leads to its figure's flow, and the slab turns.
- **The member's answers:** the Street's pipes, from the plot along the road bend by bend, dry and labelled steps, the same from all four sides, none for a trail in one building, a turn over the ground around a building in its way (`packages/stage/src/pipes.test.ts`); "the orders table" read as the table (`packages/trace/test/flow.test.ts`); the house stack with its database door builds and passes every check (`house-stack.test.ts`); Test drive replays the new recording, the gate's grey flag on its first lift and every sentence after it (`testdrive.test.ts`); the orders plot lit by the stall's shared code (`lakefront.test.ts`).

## Deviations and readings of the prompt

- **The pipes are drawn in a building, and along the Street's roads when the trail crosses buildings** (the member's answer). The Street's pipes run between the places the trail touches, not through the floors of each building; the Building level and the inside show those. The flow of an older commit is not offered in replay: only the current commit's re-execution is kept (the member's answer, KNOWN-GAPS).
- **"Every number" in the code is read as the figure chips.** A block that works out or shows a figure carries a chip in the customer's words, leading to the figure's trail. Other numbers in the code (a loop's bound, a test's fixture) are code, not figures, and carry no chip. The chips are shown for the file as it is now, not for a replayed commit, because the figures file is read as it is today.
- **The live typing comes from file snapshots** taken a few times a second during a lift, not from the builder's own keystrokes, so it works the same for every builder (KNOWN-GAPS).
- **The inside's place for the checks and the papers.** The plan names the four floors. The files the Street does not draw also needed a place inside, or the old building's walk could not pass, so they stand on two more floors below the four, named in plain words. A check stands with the code it imports.
- **What the old building drew that the inside does not:** the cranes and the digger during the replay, the sky's time of day, and the cables on hover (the open brick's cables are drawn). Nothing a person could read there is gone: each lift, each brick's English, edges, history and figures, and the audit's log and report are all in the panel.
- **The product's sandbox database was built here.** The prompt says rows come from "the sandbox database the build loop already runs"; there was none (products built here kept no database, and the sample reads a file). It is now made by the build loop's photographs, one per product, as above. It has no foreign keys and no migration step of its own yet, and a renamed or retyped column is not changed in it (KNOWN-GAPS).
- **The sample was rebuilt, as the member asked, and the builder's own first lift was refused.** The recording keeps it: lift 1 changed the first page and its orders reader with no test behind them, the gate refused it, and lift 2 added the tests. Test drive replays the same grey flag. The new recording's lifts and English replace the old ones in `fixtures/sample-build`; the old recording is in git history.
- **Found while taking the Street's screenshot: a picture arriving before its view was mounted.** The lakefront's pictures start loading while a view first renders; when one arrived before the view was mounted, its state update went to a view not there yet, and the dev overlay counted an issue (seen after following a flow from a Building to the Street). The arrival is now kept and counted once the view is mounted (`useImages`). It was there before this change, and only timing showed it.
- **The sample day is written by the product, not by House of Rama.** Its own code writes the four orders the first time it opens with an empty table (as its card says). House of Rama only makes the tables before the app starts and reads them read-only.
- **A cell's flow is the recorded run's.** "Show me the flow" from a cell opens the flow of the figure its column feeds, with the values recorded when the screens were photographed; a row picked on the slab is not run through the product's code on its own, and the card says so.
- **The tag `stage-11-start` sits one commit early**, before the lockfile fix that closed Stage 10 (`609a7ab`). A pushed tag is not moved.
- **Found at the end of the stage, not by the reviewer: tests spent this laptop's drafter key.** A model call made with a test's own environment still read its key from, and wrote its row into, the laptop's database. On 2026-10-27 the watcher's Test drive test drafted 1,215 blocks this way, ₹292 in total. The cause was two bugs, both fixed:
  - `call()` now takes the key and writes the row through the environment it is given;
  - the recorded builder now puts the recorded English into the run's own work dir, so the test finds it and drafts nothing.

  The Test drive test now checks both: no model call, and every recorded sentence in its own work dir.

## Reviewer findings

The reviewer (OpenAI, gpt-6.1-sol, fresh context, `pnpm review 11`) ran 17 times; every run is in `docs/reports/stage-11.review.md`. Runs 13 to 15 came after the plan's sixth part, the ground opened, was built, and runs 16 and 17 after the member's answers.

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
- **Run 9** (the first over the inside):
  - At an older lift of the replay, the inside still offered today's flow. It no longer offers one there.
  - A link to another brick of the same building kept the brick that was open. The inside is now fresh for each brick a link opens on.
- **Run 10.** When no brick of the building shows the figure, the screen step had no pipe. Every step now has its pipe, inside and at the Building level: up to the glass, dry and labelled when untraced.
- **Run 11.** A block with no English yet hid its figures' links to their trails. They are now shown whether or not the block is explained.

- **Run 13** (the first over the ground opened). The code level read a file of a product's checkout through a link to a file outside it. A file is now read only when it resolves inside the checkout.
- **Run 14.** The live tail of a lift had the same opening: a link the builder wrote to a file elsewhere would have been followed and its text typed in. The tail now reads only files inside the checkout, through the same check.

- **Run 16** (the first over the member's answers). On the Street, an input kept in the same building as its working-out had no pipe, so its dry label was missing and the water could run past it. It now has a short pipe into that building, labelled and stopping the water when it has no value.

Runs 12, 15 and 17 found no code defect; the report claims of runs 12 and 17 (the run count) are corrected, and run 15's only finding is the standing cannot-tell on (d).

Report claims corrected (runs 1, 2, 4, 5, 6, 9, 12, 14, 16 and 17): "exactly one lit action" (none when the act has no next thing to do, and the bar says why), the turn fade, "Not explained yet" with no key, once-per-block drafting, a pipe per step, what the pane names, where the pipes are drawn, how many files a replayed lift types in, the number of reviewer runs, the sample English's cost, and open questions the member had answered.

Not resolved by code:

- **(d) in every run, and (a) and (c) in most, are cannot-tell.** The generator, the drift checks, the CI wiring, and the append-only and audit guards on `signoffs`, `audits` and `decisions` stand from earlier stages, outside the diff. This stage adds no write to those three tables; the one new write that is audited (`confirmExplanation`) is in the diff, with its test.

## Real model cost

`pnpm cost 11`:

| What                                                              | Model             | Calls | Cost       |
| ----------------------------------------------------------------- | ----------------- | ----- | ---------- |
| Independent reviewer                                              | gpt-6.1-sol       | 17    | ₹686       |
| The sample rebuilt by Claude Code (Test drive `testdrive-6`)      | claude-sonnet-5-5 | 4     | ₹118       |
| Its English drafted live in that build                            | claude-sonnet-5-5 | 53    | ₹14        |
| Its audit in that Test drive                                      | gpt-6.1-sol       | 1     | ₹2         |
| Drafter calls made by tests with the laptop's key (the bug above) | claude-sonnet-5-5 | 1,215 | ₹292       |
| **Recorded total**                                                |                   |       | **₹1,113** |

The ground opened makes no model call: its columns are read from the code and its rows from the database.

The drafter rows are the leak described under Deviations. None was added after the fix (`4cb7c4c`): the watcher's later runs drafted nothing.

Not in that table:

- **The sample build's English** (`pnpm record-explanations`, gpt-6.1-sol): for the rebuilt sample, 84 calls, 45,005 input and 4,063 output tokens, $0.131 (₹12). Its rows were counted by the script and not written, so the recording carries its own cost (`fixtures/sample-build/explanations-cost.json`). The first recording's English (72 calls, ₹10) was replaced with it. A first run for the rebuilt sample on the drafter seat (Claude) stopped when one reply put words before its JSON; its calls were counted by the script and lost when it stopped, so their cost is not recorded.
- **A live build's English costs about the same per build**: one call per block a lift changes, never the same block twice.

## Open questions

- **The Anthropic account works again.** The rebuilt sample was built by Claude Code on claude-sonnet-5-5 (₹118) and drafted live on it in the same Test drive. The recording's English was drafted on OpenAI after one Claude reply came back with words before its JSON. Should the drafter seat move back to Claude?
- **The sample's New order screen still saves nothing** (its card says so). Saving an order would put the product's own writes on the ground as they happen. Is that wanted for the sample, or kept for ergPLAN?
- **The Street's pipes take one turn over the ground from a plot**, around the buildings in the way, because plots have no roads. Should the ground get paths from each plot to the buildings that use it?
