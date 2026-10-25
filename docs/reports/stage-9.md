# Stage 9 — House stack

Built 2026-10-25, from tag `stage-9-start`. The "Seats and vendors" section was added to the stage prompt while the stage ran (commit 0ec64f7) and is built here too.

## Where this stage stands

The sample product is now built by the builder, not written by hand. Test drive ran in the app with the configured brains, and no command was typed:

- Claude Code built the Chai Stall from its seven decision cards on the house stack, in four lifts.
- House of Rama checked each lift by itself in 30 to 43 seconds. Lift 1 was a grey flag: the merge gate refused the first page, because no passing test stood behind `db/orders.ts`. Lift 2 was the fix.
- At the end, 8 of 8 figures were traced and came out the same when worked out again. All 3 screens were Verified before anyone signed.
- The Street named its three buildings as the cards name them.
- "Test drive" then walked and signed the two customer screens, and the OpenAI auditor signed its report: 0 defects, 13 notes, 21 clean files.

That build cost $0.94 of building (₹89). It is recorded in `fixtures/sample-build`. Test drive, `make-sample.mjs` and the tests replay it when no builder can run, through the same loop and the same checks. The hand-written sample (`fixtures/sample-product`) is retired.

## What was built

**`templates/house-stack`**, the scaffold every product starts from: Next.js + TypeScript + Drizzle, with these parts.

- Feature folders, one per building.
- `components/Figure.tsx`. `<Figure id fn args show>` calls the figure's own function with its arguments and shows that result, marking the element with the id, the arguments and the raw value. What a person reads is always what the function says.
- `rama/figures.ts` (with `rama/define.ts`) lists every figure:
  - `fn` is the function itself, brought in from its building;
  - title, what, English and inputs are plain text.

  House of Rama reads the file as written (`packages/trace` `readConvention`) and never runs it. The function's file and line come from the parser.

- **`rama/lint.ts`, the figures lint (Invariant 10).** It runs before every build (`prebuild`) and in the product's CI. It fails on any number a screen shows outside a Figure, naming the file and the line:
  - digits in text;
  - a number-typed value;
  - a template;
  - `toFixed` and the like;
  - a helper that makes text from a number, unless it says `@words`;
  - a value whose type is unknown;
  - a number in the attributes a person reads.

  It also fails a Figure whose function or show is not the one `rama/figures.ts` names, and any entry it cannot read as written. House of Rama runs its own copy after every lift, so the product's copy cannot change what is checked.

- `.rama/screens.json`, `.rama/features.json`, a build workflow, and the merge gate's workflow, pinned and keyed with House of Rama's public key when the scaffold is laid down.
- A welcome building with one traced figure and two example tests: a figure function's unit test, and a screen rendered with its figure checked.

**The build loop** (`packages/workbench` `build.ts`), started from the console's Start build:

- The builder gets the decided cards in force and the house stack, and makes one lift at a time. Each lift is one Claude Code run in the product's folder, through `packages/model` `runAgent()` with `prompts/build.v2.md`. Each run records one `model_calls` row with its cost, and the next run continues the same conversation.
- The builder has its own home, PATH and the builder seat's key, and nothing else of House of Rama's. It may edit, run the product's checks and commit. It may not reach the web, push or install.
- After every lift House of Rama, by itself (`checkLift`), and in 30 to 43 seconds a lift on the real build:
  - redraws the picture;
  - puts the product's packages in place;
  - runs the figures lint in its own process while it runs the tests;
  - builds and photographs every screen, and works every figure out again with the product's own code;
  - runs the merge gate from the house stack's own lift;
  - reads the three states.

  The console's job list refreshes itself while a build runs, and so does the Street beside it.

- A lift with a problem is a grey flag with House of Rama's sentences (the lint's, the gate's, a figure's) and "The builder fixes this in the next lift". The next lift asks the builder for exactly those fixes.
- Pause build stops before the next lift.
- The build is done when the builder says so and the product is complete: no problem, every figure traced and agreeing, every screen Verified. At most sixteen lifts; three in a row that don't get past the checks stop it.
- When the product has a place on GitHub, each good lift is pushed there.

**The sample, rebuilt.** Test drive's Idea step writes the stall's seven cards, each opened and decided by a recorded yes from "Test drive":

- the idea;
- money in paise;
- the sample day;
- the three buildings, with their screens, figures and how each is worked out;
- what it will not do.

The builder builds from them through the loop. `pnpm record-build` turns a real build into the recording: one patch per lift, plus the builder's answers from its `model_calls` rows. `make-sample.mjs` replays the recording with the same commits every time. The hand-written stall survives only as the counting rules' test data (`packages/blueprint/test/fixtures/hand-stall`).

**Seats and vendors.** A product has four seats:

- builder;
- auditor, who is also the reviewer;
- drafter;
- voice.

Each names a vendor and a model, and the builder seat also names its builder.

- They are chosen in **Settings → Brains** for every new product, and asked in the site office: "Which brains will build, check and speak?". The answer is stored for the product and recorded as a card decided by the person who gives it.
- **The builder and the auditor are never the same company (Invariant 5).**
  - In the form: choosing a builder takes its company off the auditor list.
  - In both routes: refused with the rule's sentence.
  - In every model call: `resolveSeat` refuses before any prompt is read or vendor called, so a stored setting cannot slip past.
- `packages/model/vendors.json` is the registry. Each vendor has a base URL, a protocol, the seats it may hold, whether it is local, and its builders.
  - Anthropic and OpenAI keep their native adapters.
  - **One OpenAI-compatible adapter** (base URL + key + model) covers Gemini, Grok, Kimi, Ollama (local, no key) and any compatible provider.
  - Settings gains the Gemini, Grok and Kimi keys, with lights.
- `model_calls.role` records the seat. Drafting (glossary phrases, purposes, discovery questions) moves from the builder's vendor to the drafter seat.
- The builders are agent drivers in `packages/workbench/src/builders`. `claude-code` is wired. `codex`, `gemini-cli` and `antigravity` are stubs with a documented interface, and each says in the console that it is not wired yet. The `recorded` builder replays a real build.
- Each product records its builder. The audit report's first line names the builder and the auditor's vendor and model.
- Test drive uses the brains configured. It builds with the builder seat when that builder is wired, keyed and on this computer, else with the recording, and audits with the auditor seat when its key is set, else with the stand-in.

**Members.** `members.json` may give a member's email: rachit@joulewise.com is now recorded for Rachit Agarwal.

## Tests

- The lint on unmarked numbers: every kind, each named by file and line; the product's own `npm run lint:figures` refuses too. Also a Figure worked out by another function, and an entry not written as plain text (`packages/workbench/test/house-stack.test.ts`).
- The scaffold builds and passes its gate: laid into an empty product, it passes every check after its first lift in under a minute, with its name and idea escaped into each file and the gate keyed (same file).
- The loop from an empty repository to a fully traced lakefront: `tests/stage-9.e2e.test.ts`, in a real browser, with nothing typed but names:
  - brains chosen in Settings (the auditor list follows the builder);
  - a new product started from an empty repository;
  - its brains answered in discovery;
  - Start build: the recorded lifts arrive one by one, each checked; Lift 1 a grey flag with its next action;
  - the Street: three buildings in the cards' words, all Verified, 8 of 8 figures traced, no developer word on the page.
- The OpenAI-compatible adapter against a stub server (address, key, body, reply, tokens, no key for Ollama, a refusal named by vendor), a call answered by a compatible seat recorded with its vendor and seat, and against Ollama when one is running (here none was, and the test checks that an absent Ollama is said plainly) (`packages/model/src/seats.test.ts`).
- The builder-is-not-auditor rule:
  - in the UI (`components/workbench/BrainsForm.test.tsx` and the e2e);
  - in both routes (Settings and discovery handler tests);
  - in the runner: refused before any prompt or vendor call, no row (`seats.test.ts`).
- A stub builder reports itself unwired: each stub by name and company, and a build with one stops at once with that sentence and touches nothing (`packages/workbench/test/builders.test.ts`).
- Test drive green, with no keys: the recording replays through the loop, and every step's sentence is checked (`packages/workbench/test/testdrive.test.ts`).
- `runAgent`: the agent's environment holds the key only, retries ask only for the answer, and one row is written with the summed cost (`packages/model/src/agent.test.ts`).
- The gate asks no test of a deleted file, only of the code left that changed (`packages/ceremony/test/gate.test.ts`).
- The console's Start build and Pause build (`act/handler.test.ts`).

## Deviations and readings of the prompt

- **The builder is driven lift by lift.** One Claude Code run per lift, rather than one long run that House of Rama watches, so each lift is checked before the next is asked for and Pause build stops cleanly between lifts.
- **The merge gate's rule changed in one place.** A file deleted since the base no longer needs a test, since none can stand behind it; the code left that changed still does. On the first real build the gate asked a test of the example file the builder had deleted, and the builder put the file back to get past it.
- **"Retire its hand-written overlay"** is read as retiring the hand-written sample product, overlay and all. Its `.rama/` files and figure list are now written by the builder from the cards. The hand-written stall is kept only as test data for the counting rules, which need a screen whose figure no test calls.
- **Test drive with a builder key builds for real** ("runs with whatever brains are configured"). On this laptop that is Claude Code at about ₹90 a run. The watcher, CI and the e2e tests replay the recording.
- **Seats are stored as settings** (`brains`, `brains:<site>`), and a product's answer is also a decision card. Discovery by voice is Stage 10's, so the question is a form in the site office for now.
- **Model names** are offered only where House of Rama has used them (Anthropic, OpenAI). For Gemini, Grok, Kimi and Ollama the person types the model's name.
- **The e2e test writes the rest of the brief's cards directly**, as decided, after the brains card is answered on screen. Discovery is Stage 10's.

## Reviewer findings

(Filled in after the independent review.)

## Real model cost

(Filled in at the end.)

## Open questions

(Filled in at the end.)
