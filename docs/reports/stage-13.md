# Stage 13 — The film

Built 2026-10-31, from tag `stage-13-start` (local; the push of the tag was refused by GitHub, as the `trail-edition` tag was before, so it is to be pushed from the VM). Built outside the VM, in a separate workspace, by Claude (Opus 5.5) at the member's word ("build the whole product please"), while the VM's Stage 12 session stood still. Its parts were committed to `main` as each worked: part 1 (`b0eba63`), part 2 (`05ab55f`), part 3 (`524b56d`, with its one red test fixed in `275a9c3`), and the closing commit with this report.

House of Rama stands outside the product. The film is what House of Rama saw while the product was built, played back to a person who does not write code; the product's own code is shown running only in Try it, and the builder's own tools are always kept apart from it.

## What was built

**The film (`/film/[siteId]`, `apps/rama/components/film`).** A product's build in seven scenes, left to right, each with at most one lit action, the voice at the foot reading every line (the browser's stand-in voice when "Read aloud" is on):

1. **The plan.** The cards in force, in the order first written, each with the name of the person who said yes.
2. **The design.** Before a single block: the product's Street in outline, read aloud in six beats, each lit on the picture — a building for each thing it does, the four floors, the ground as the database (its tables named), the outside across the water, pipes for every number, the gate and the Checker.
3. **The foundation.** The house stack laid block by block in one glass building, filmed from the ground: each file of the house stack with its plain-word name and what it is for (`packages/workbench` `foundation.ts`), the five layers lit with a running count, a scrubber, turn and zoom.
4. **The build.** Each lift as beats in the builder's own order: its words, the tools it looked with, each file typed in as it wrote it (new lines lit, a long file cut and saying so), the file's brick laid inside the glass, a green card with the file's plain English (drafted and unconfirmed until confirmed, or "Not explained yet"), the table lit in the ground when first written, then the checks. Where the checks stopped a lift, the film stops on a grey flag: what happened, what the Builder does next, "Watch the fix". Pause, Slower, Faster, Next lift, From the start. Under the code, "Ask this file a question".
5. **Try it.** The product's own code run on its own data, slowed to reading pace: each step of a figure's flow (the rows that left the table, the function they went through, the value, the screen), every value as the re-execution recorded it; a step with none says it ran dry. The drop travels the pipe on the picture.
6. **The ground.** What a database is, in five beats: the ground under the buildings, a table is a sheet, data moves only through pipes (green write, sand read), which part may change what, nothing is lost. The table rises with its columns in plain words and its real rows (read-only, from the product's own database); the matrix of the files that write it and the files that only read it comes from the Blueprint.
7. **Walk through.** The real screens as photographed, each figure marked traced or untraced, each screen's signature in force with its seal, and "Walk through and sign" to the walkthrough.

**The builder's own words (`packages/model`, `packages/workbench`).** `runAgent` now reads Claude Code's stream (`--output-format stream-json --verbose`) line by line as it works: its words between its actions and each tool it uses (`agentEvents`), with the report taken from the stream's last line (`reportOf`). The Claude Code driver passes them on; the build loop keeps them in `work/<site>/narration.jsonl` and each lift's answer and checks in `work/<site>/lifts.jsonl`. `pnpm record-build` copies the stream into a recording, and the recorded builder plays it back, so a replayed build narrates as the real one did.

**A customer alone in the chair.** A customer's home is the arena: one sentence, a name, one lit "Make it" (which starts the product in its idea room, where the plan's cards are made and said yes to), their products each opening its film, and Test drive. A customer opening a product's lakefront is taken to its film; the lakefront and its console stay the trainer's view, linked from the film. Test drive ends with "Watch the film of the build".

**The trainer is called.** When the builder cannot get past its grey flags by itself (three lifts in a row), House of Rama calls a trainer: an append-only line in `work/.calls.jsonl`, listed on the trainer's home under "Needs a trainer" and shown in the product's film; it is answered when a build of the product starts again.

**Ask the code (`packages/workbench` `ask.ts`, `POST /api/site/[siteId]/ask`).** A question about a file's lines, answered by the drafter seat (prompt `ask.v1`) from those lines alone, with the file's plain name, its plan step and its figures; the answer names only lines that were in the piece, says "The code does not say." when they do not answer, is never shown in developer words, and is kept as a turn for the trainer.

**The renderer (`packages/stage` `film.ts`).** `drawFilm` draws the product's real Street as glass filling as it is built (bricks on their floors, the one being written glowing, a design in outline before anything stands, plots lit with their row counts, the agent at work, pipes with a drop and its words); `drawFoundation` draws the time-lapse; `pickFilm` answers what lies under a point from every side. It paints only with Harmony's tokens, at an opacity.

## Tests

- `packages/stage/src/film.test.ts`: the film and the foundation drawn with the tokens of either theme only; the same frame always the same picture; every building, table, row count, state and the agent named; the design before anything is laid; parts counted; every brick inside its building on its floor in a place of its own; picking every building and table from all four sides; pipes from a table.
- `packages/workbench/test/film.test.ts`: every file of the house-stack template has a block with a plain name and no developer words; laying order; layers of product files; the plan's cards in force in the order first written; lifts without kept words marked as the commit's; lifts with kept words, their checks and grey flags; each file's text, new lines, building, layer, tables and saved order; tables lit once; the design's writers and readers; the builder's words recovered from a job step.
- `packages/workbench/test/ask.test.ts`, `apps/rama/app/api/site/[siteId]/ask/handler.test.ts`: only the selected lines sent, only their lines named, "does not say" kept, developer words refused, empty or outside questions refused before any call, every turn kept, the route's 400, 404 and 503.
- `packages/workbench/test/calls.test.ts`: a call open until a build starts again, never edited.
- `packages/model/src/agent.test.ts`: the stream's words, tools and report; a plain report still read.
- `apps/rama/components/film/beats.test.ts`: a lift's beats with and without the stream.
- `tests/stage-13.e2e.test.ts`: a customer alone, in a real browser on the dev server: the arena; Test drive building the sample from the recording; never shown the trainer's lakefront; the plan's seven cards said yes to; the design's six beats; the foundation's blocks; the build with the builder's own words, code typed in and the grey flag where the gate stopped lift 1, then the fix; Try it with every step's value; the ground's real rows and its writers; the walk through's three screens and two sealed signatures; each scene's structure and no banned word outside the code. Screenshots of each scene are in `docs/reports/stage-13/`.

The unit suites of `@rama/app`, `@rama/stage`, `@rama/workbench`, `@rama/model` and `@rama/blueprint` pass here except `packages/blueprint/src/golden.test.ts`, which needs `reference/procurementstudio` (a private clone kept on the VM, not in this workspace). Lint, the format check, every package's type check and the self Blueprint drift check pass.

## Deviations and readings of the prompt

- **The sample is still the Chai Stall.** "Read my bill" needs a real build by Claude Code with its key, recorded; there is no builder key in the workspace this stage was built in. The film does not depend on the sample; the recording is the first step of the VM paste below.
- **The look is checked by structure, not by picture comparison.** The film draws each product's real Street, so a comparison against the reference's frames would measure the product, not the look. See KNOWN-GAPS.
- **The plan is made in the idea room**, not by a separate builder prompt; **the foundation's words live in House of Rama**, not in the product's template; **a call is shown, not emailed**. See DECISIONS and KNOWN-GAPS.
- **"Ask the code" is reached from the build's code pane**, on the file on screen, not by selecting single lines; the route takes any line range, the pane asks about the file's first 120 lines.
- **The old screens were not moved to `/trainer/...`.** They stay at their addresses, closed to a customer by sending them to the film; a trainer reaches them from "Trainer view".

## Reviewer findings

Not yet run: the reviewer is OpenAI's model, called with the key kept on the VM. It is the second line of the VM paste; its findings are to be fixed and listed here before the stage stops.

## Real model cost

None in this workspace: no vendor was called. The film plays recordings and the record; Ask the code and a live build call vendors only where their keys are set.

## Open questions

- **The building's name.** House of Rama's own Street now has a building "Watch it built, as a film" for the film's page. Confirm it, or give a better one.
- **Read my bill as the sample.** Its recording costs one real build of Claude Code (the Chai Stall’s cost ₹89 to ₹137). Shall Test drive's sample become Read my bill once recorded, as the prompt says?
- **Who is called.** Calls go to every trainer's home. Should a call name one trainer (the one who opened the product), and should it ring anything beyond the home page?
