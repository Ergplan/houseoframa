# House of Rama — Master Prompt

Built on trust. This document drives the build of House of Rama. It is committed once; after that the agent reads it from disk, one stage per session. Revised 2026-10-24 after Stage 6 and Gaps 1: Stages 0–6 stand as built; Stages 7–13 build the Pod Edition (`docs/POD-EDITION.md`) on top, ending with the first real product, ergPLAN.

## 0. How to use this prompt

- Sections 1–4 are copied verbatim into `CLAUDE.md` and are in context for every session. If the two ever differ, `CLAUDE.md` is wrong; fix it from here.
- The user's whole interface after Stage 0 is one line: `Run Stage N of docs/MASTER-PROMPT.md`. The agent reads this file, runs the stage, runs the independent reviewer, writes `docs/reports/stage-N.md`, and STOPS.
- A stage report states: what was built; what was skipped and why; deviations from the prompt; reviewer findings and their fixes; open questions, numbered; real model cost for the stage.
- The user answers open questions in one numbered message. Vague answers get vague architecture; the agent may ask once for a precise one.
- Reference inputs: `reference/weekend-prototype/` (the artifact built on 17 Oct 2026), `reference/procurementstudio/` (golden fixture), `docs/POD-EDITION.md` (the product construct, 24 Oct 2026). EkBill is retired as a target after Stage 6; its reports stay. All reference input is read-only.

## 1. Operating rules

(See `CLAUDE.md` §1. Verbatim.)

## 2. Invariants

(See `CLAUDE.md` §2. Verbatim.)

## 3. Locked decisions

(See `CLAUDE.md` §3. Verbatim.)

## 4. Folder layout, continuous testing, living documents

(See `CLAUDE.md` §4. Verbatim.)

## 5. Plan — the Pod Edition, Stages 7–13

Stages 0–6 and Gaps 1 are built (foundation, Blueprint, Brick-level site, Showroom and trails, ceremony, audit, floor-edition plumbing, sealed signatures, deploy). From Stage 7 the build follows the Pod Edition construct. Sequenced by what becomes permanent earliest: the workbench that holds people and keys, then the face, then the scaffold that makes products traceable by construction, then the voice, then the glass that shows the code being written and the data flowing, then ergPLAN.

| Stage | Name | What becomes permanent | Proven on |
| --- | --- | --- | --- |
| 7 | Workbench | `members.json`, Settings with keys and the GitHub account in the UI, product repositories, Test drive, the sample product, three states and the counting rule | self, sample product |
| 8 | Lakefront | The isometric renderer: Street and Building levels, facades from capture, flags, Harmony; audit drones and replay on the lakefront | self, sample product |
| 9 | House stack | The scaffold; figures traced by construction; the build loop with automatic extract, capture and re-execution after every lift; the four seats (builder, auditor, drafter, voice) with the customer's choice of vendor | the sample product, rebuilt from the scaffold |
| 10 | Ears | GPT Live voice, transcript, the track asked by voice, decision cards by spoken yes, scrap and restart, the board | a rehearsal on the sample product |
| 11 | Glass and flow | The journey layout (one tab per act, one lit action); the camera: turn and zoom; live code written inside the glass with plain English beside every block, unconfirmed until confirmed; the pipes: the trail drawn as plumbing with real data flowing through it in slow motion; the same views in replay. Two days | the sample product, built, used and replayed |
| 12 | ergPLAN | The first real product, built entirely inside House of Rama | ergPLAN |
| 13 | The film | The customer alone in the chair with the voice: one sentence in, the plan spelled out in steps, each step built on screen by a named agent typing real code with its own words as narration, a card for every file, the building growing in sync, "ask the code" in English, the trainer called only on a grey flag; the new sample product "Read my bill"; the look matched to a designed reference | the sample product, filmed end to end |

Deferred (notes in `docs/POD-EDITION.md`): wallet, customer-owned GitHub at handover, the fixed board camera, pod lights and bookings in daily use.

## 6. Stage prompts — Stages 7–13

### Stage 7 — Workbench

```
Stage 7 makes House of Rama usable by people who are not coders, on a laptop, and amends the ceremony with the three states. After this stage nothing is typed in a terminal to use the product.

Harmony first. Before anything else in this stage, load design/harmony (tokens.json, components/bundle.css and bundle.js, Urbanist and JetBrains Mono from Google Fonts) into apps/rama, generate tokens.css from tokens.json (both themes, data-theme on html), replace the current app chrome with Harmony's Sidebar, TopBar, Button, Chip, StatTile and FolderCard per design/harmony/README.md, and keep the Brick canvas's own colours only inside the canvas. The mapping table in design/harmony/README.md is the spec; one green object per screen.

People. `members.json` at the repo root: [{name, role: trainer|customer}], read at start. The app opens with "Who are you?"; the chosen name is the person on every decision, confirmation and signature. Replace the Gaps 1 username-and-password sign-in with this picker; keep sessions and every authorization test (they now assert the picked person). Keep the password code behind a setting `AUTH_MODE=password` for the floor edition; default `members`. RAMA_ACCOUNTS leaves .env.

Settings → Keys: Anthropic key, OpenAI key, GitHub token; each with one sentence saying what it is for and where to get it, a Test button making one harmless call, and a green or red light with the reason in words. Stored in Postgres (`secrets`, encrypted at rest with the app's own key in work/.secret-key, generated on first run, never committed), masked, never logged, never written to .env. packages/model and the GitHub client read from here; .env keys are read only when the table is empty, and the UI says so.

Settings → GitHub: the account or organisation products are created under. "Create repository" creates it, installs the gate workflow with the public key, records it on the site. Settings → Harmony: shows the synced version (design/harmony/tokens.json, Ergplan/designsystem d00bc9a).

Products. A product is a site House of Rama builds (as against an outside site it only renders). "New product" asks for a name and a one-line idea and creates the site, its repository and its first decision card.

The sample product. `fixtures/sample-product/`: a tiny Next.js + Drizzle app on the house stack (~20 files, three screens: a list, a form, a total; five figures marked per HOUSE-STYLE; a screens file; two passing tests) with a git history of six or more commits produced by `scripts/make-sample.mjs`, so it is reproducible. It replaces EkBill everywhere EkBill was used in tests.

Three states and one counting rule (Invariants 11). `stateOf(screen)` in packages/blueprint/metrics returns Verified | Confirmed | Unverified with evidence: Verified needs a test that renders or calls the screen's route or its figure functions and passed in the last run; Confirmed needs a sealed signature at or after the screen's last change. Remove the "a test imports this file" signal from every surface and the trust report. `counts(site, audience)`, audience from the screens file (customer | staff | admin); every surface says "N of M <audience> screens signed".

Decision cards. A card becomes decided only by a recorded yes (a click now; spoken in Stage 10) with the person's name. "Scrap everything" starts a named draft and marks earlier cards withdrawn.

Test drive. One button on the home screen: rebuilds the sample product into work/testdrive, extracts, captures, re-executes, runs a scripted walkthrough signing as "Test drive", runs the audit checks, and shows a plain pass/fail list with timings. No voice, no camera; model calls stubbed when no key is set. Under five minutes on a laptop.

Trainer console. A left-column panel: the five-act buttons (Start session, Close ideation, Start build, Pause build, Start walkthrough, Call the audit, Hand over), greyed when not possible and saying which stage enables them; the agenda (cards, open items); the key lights; the site's state in the three words.

Tests: secrets round-trip and masking; key Test buttons against stubs; the picker drives created_by on every write; repository creation against a stub and once for real behind @vendor; stateOf for all three states; counts per audience; a grep test that "imports" never appears as a confidence word; Test drive e2e green with no keys configured.

Done when: a person with no terminal opens the app, picks their name, enters keys, creates a product with its repository, and runs Test drive to green; reviewer run; report. STOP.
```

### Stage 8 — Lakefront

```
Stage 8 gives House of Rama its face: the transparent isometric lakefront, in the customer's words, with code at the third zoom level. The audit's drones and the replay move onto it.

packages/stage:
- `street(blueprint, features)` lays out one building per feature. Features come from `.rama/features.json` in the product (written by the builder from the decision cards for products built here; drafted and unconfirmed for outside sites). Each building: a name in the customer's words, its screens, its bricks by floor, the tables it reads and writes. Buildings stand on the ground; tables are plots in the ground, lit when a building touches them; roads are the imports between features; the lake is the edge of the product and external services sit across the water as jetties. Deterministic.
- `building(feature)` is the second level: floors (what it shows, decides, remembers, talks to), the real screenshot on the facade, each figure with its flag and a hotspot to its trail.
- The third level is the existing Brick canvas, reached by "show me the code" or a click through the glass.
- Transparency: bricks visible through the glass as they are laid; the flag per building as a colour and the word.
- Replay: timeline and sky over the street; cranes park at the building being built; audit drones fly building by building and badges stay.
- Canvas 2D isometric: a 2:1 tile grid, depth-sorted, with pick() for buildings, facades, plots and bricks.

apps/rama: the home of a site is the Street; zoom by click or by the words open / inside / show me the code; a breadcrumb in plain words (Street › Take an order › the code). Labels and sentences from design/harmony/glossary.json; a test greps the rendered DOM at Street and Building level for the glossary's banned list. Harmony tokens, bundle and the mapping in design/harmony/README.md are applied throughout; the lakefront is drawn only with Harmony tokens.

Tests: layout determinism; pick at all three levels; banned-word test; facades appear after capture; flags follow stateOf; e2e: open the sample product, read every building's name from the Street, open one, open its code, run the audit and watch the drones.

Done when: the member can say what each building of the sample product does from the Street alone; reviewer run; report. STOP.
```

### Stage 9 — House stack

```
Stage 9 makes every product built here traceable by construction, so the honest rate is 100 percent or the build stops.

templates/house-stack: a Next.js + TypeScript + Postgres + Drizzle scaffold with feature folders (one per building), the figure convention wired in (a <Figure id> component that marks and maps), rama/figures.ts, .rama/screens.json, .rama/features.json, the gate workflow with the public key, two example tests. A lint rule: any rendered number not inside a Figure fails the build naming the file and line (Invariant 10).

The build loop (packages/workbench): "Start build" runs the builder (Claude Code, driven by House of Rama in the product's checkout) with the decision cards and the scaffold; after every commit House of Rama extracts, captures, re-executes and refreshes the lakefront by itself within a minute; a lift that fails the gate or the lint shows a grey flag with the lint's sentence and the builder's next action; Pause build stops after the current lift.

Seats and vendors (customer's choice). A product has four seats: builder, auditor (also the independent reviewer), drafter (descriptions, narration text) and voice. Each seat names a vendor and a model, chosen in Settings → Brains and asked for in discovery ("Which brains will build, check and speak?"); the answer is a decision card like any other. Rules: the builder and the auditor must be different vendors (Invariant 5, enforced in the UI: choosing a builder removes that vendor from the auditor list); every seat's key comes from Settings (rule 11), and Ollama needs a base URL and no key.
- packages/model gains one OpenAI-compatible adapter (base URL + key + model) that covers Gemini, Grok, Kimi, Ollama and any other provider that speaks that protocol, beside the native anthropic and openai adapters; a vendor registry `vendors.json` lists each vendor's base URL, protocol, which seats it may hold, and whether it is local. Every model_calls row records vendor and seat.
- Builder adapters are agent drivers in packages/workbench/builders: `claude-code` (built now) and a documented interface for `codex`, `gemini-cli` and `antigravity`, each shipped as a stub that explains in the UI that this builder is not wired yet. Products record their builder; the audit report names the builder and the auditor vendor on its first line.
- Test drive runs with whatever brains are configured and stubs when none are.

Rebuild the sample product from the scaffold by this loop, with no human command, and retire its hand-written overlay. Test drive uses this path.

Tests: the lint on an unmarked number; the scaffold builds and passes its gate; the loop from an empty repository to a fully traced lakefront; the OpenAI-compatible adapter against a stub server and against Ollama when present; the builder-is-not-auditor rule in the UI and in the runner; a stub builder reports itself unwired; Test drive green.

Done when: the sample product, built from the scaffold by the builder with no human command, shows 100 percent traced and every screen Verified; reviewer run; report. STOP.
```

### Stage 10 — Ears

```
Stage 10 puts the voice in the room, as a mouth and not a mind (Invariant 9).

packages/ears: a GPT Live (OpenAI Realtime, WebRTC) session started from the console with the key from Settings; English only. Every utterance stored as a turn with its speaker (the voice, or the picked person; push-to-talk per person is acceptable). The hand-off: the builder produces plain-English lines (prompt narrate.v1) and the voice reads them; the voice's instructions confine its own generation to questions, acknowledgements and reading back; a test tries to make it state a product fact and asserts the fact came from a builder line. Commands: yes, no, scrap everything, show me <building>, open <screen>, show me the code, go back, what if <input> is <value>. The track by voice: "where does this number come from", "how is it worked out", "what goes into it", "where is it kept", "who built it", "who signed it" map to the trail's steps and are answered from it only; untraced is answered as untraced with the figure's name. Discovery's first cards include the brains: the voice asks which vendor builds, checks and speaks, and reads the rule aloud (the checker is never the builder). Decision cards by spoken yes with the speaker's name; scrap and restart by voice; act 3 (the design explained aloud, building by building, with "what it will not do") before "Shall I build this?".

packages/board (minimal): a laptop-webcam frame on demand ("read the board"), a reading by packages/model (prompt board.v1) into boxes, arrows and labels, shown as a draft map; nothing is decided from it.

Tests: command grammar; the mouth-not-mind test; track questions from trail fixtures; spoken yes creates a decision with the right name; e2e rehearsal on the sample product with recorded audio.

Done when: the member runs acts 1 to 3 of a rehearsal on the sample product by voice, the design is explained aloud, and the first signature is a spoken yes; reviewer run; report. STOP.
```

### Stage 11 — Glass and flow

```
Stage 11 makes the glass worth looking through. After using Stage 10 the trainer asked for five things: the screen must read as the journey of a build, with one lit action at a time; the building must turn and zoom under the hand; the code must be seen being written inside it, with plain English beside every block; the data must be seen flowing through the building like water, from the ground to the screen, in slow motion; and the old brick building from Stage 2 must go: the third level is the inside of the same glass building, under the same camera. Nothing here changes what is recorded; it changes what is seen. Two days; build in the order below and commit after each part.

apps/rama — the journey (first, half a day):
- The site is laid out as the journey of a build, left to right: five tabs — Idea, Build, Walk through, Audit, Hand over — matching the acts of the session. Each tab shows only its own actions and its own panels; the Work and GitHub actions sit under a small "Care" tab at the end. The trainer console's long list goes away.
- One lit action per tab: exactly one button on the screen wears the Harmony green folder (the active primary), and it is the thing to do next in that act (Start session on Idea before a session; Start build on Build; Sign on Walk through; Call the audit on Audit; Hand over on Hand over). Everything else is quiet. Disabled actions say in one sentence why, as now.
- The lakefront takes the full width between the tabs and the voice bar. The right-hand panels (Street, Buildings, the Ground, Across the water) become hover and click cards on the picture itself, and one folding side panel for the selected thing. Nothing on the screen is empty space with a dark gradient.
- Buildings are not tabs: they live together on the Street. Opening one fills the stage; the breadcrumb and "next building" move between them.
- The glossary test extends to the tab names and the primary action labels. A screenshot of each tab at 1920×1080 is kept under `docs/reports/stage-11/` for the report.

packages/stage — the camera:
- `camera` is one state object {level, orientation, scale, centre} and every draw takes it. Orientation is one of four (north, east, south, west): the isometric grid turns in quarter steps, animated over 300 ms, so lines stay crisp and the picture stays honest about depth. Free rotation is not offered. Turn by dragging sideways, by the on-screen ring, by the arrow keys, or by the words turn left / turn right / turn around (added to Stage 10's command grammar).
- Zoom is continuous within a level (wheel, pinch, + and −, the words closer / further) between the three levels' hand-off points: zoom far enough into a building and the Building level opens; far enough into a floor and the Brick level opens; zoom out and the levels fall back. The breadcrumb follows. The camera is in the URL so a view can be sent, and the voice drives the same state.
- Determinism: the same Blueprint, features and camera give the same frame; depth sorting is correct in all four orientations; pick() works in all four. Facades stay readable at every orientation: the screenshot is drawn on whichever face is toward the camera and the plain-word label never mirrors.

packages/stage and packages/workbench — code written inside the glass:
- While the builder works a lift (Stage 9's `startBuild`), House of Rama tails the builder's stream of file edits and shows them as they happen. Inside the glass at Building level the brick being written glows and grows by its line count. At Brick level the file's lines type in as the builder writes them, in JetBrains Mono from Harmony, at the builder's pace but never faster than a person could read a line; a "catch up" button jumps to now. Deleted lines fall out of the brick.
- Beside the code, the English pane: the file is split into blocks by the TypeScript parser (import group, type, function or component, query, table, route handler, test), deterministically; for every block one or two sentences in plain English say what the block does and which figure or screen it serves. The sentences are drafted by the drafter seat (prompt explain.v1, one call per changed block, cached by content hash so a block is never explained twice) and shown with the unconfirmed state until a named person confirms them in the pane; confirmed sentences are written to `.rama/explanations.json` in the product as an overlay (Invariant 1), with the confirmation in `audit_log`. A block with no sentence yet shows "Not explained yet" and nothing else. The drafter receives only the block, the names it imports and its figure mapping; the pane never says what the code does not say.
- Every number in a block that is a marked figure is a link to its trail; the pane's sentence names the figure in the customer's words from `.rama/figures`.
- Replay: the same view scrubs commit by commit after the fact, for products built here and for outside sites. In replay the typing is reconstructed from the commit diff; the pane shows the explanations recorded at that commit, or "Not explained yet".
- Cost: explanations run only when the drafter key is set; without it the pane shows "Not explained yet" everywhere and the build is unaffected. The stage report states the drafter cost of one sample-product build.

packages/stage and packages/trace — the flow (second day):
- The trail of a figure is drawn as plumbing. A vertical pipe runs from the figure on the facade down through the floors of its building into the ground, to the plot of the table the figure reads; horizontal pipes run along the floors between the bricks the trail passes through, and across the roads to another building when the trail crosses a feature. Pipes are drawn only for steps the trail has; a step the trail cannot derive is a dry, broken pipe labelled untraced (Invariant 2). The pipes' geometry comes from `packages/trace` output and the Blueprint, deterministically; no model call.
- Water: when a person asks "show me the flow" for a figure (click, the word, or the voice), the real values move through the pipes in slow motion, one step per second, pausable and steppable: the rows leaving the table (count and the first few, from the sandbox re-execution the trail already does), the intermediate value at each brick, the formula applied, the figure arriving on the facade. Each step has a plain sentence in the customer's words ("8 rows left orders · became ₹1,240 in takings.ts · GST added · ₹1,463 on the screen"), handed to the voice as builder text.
- The water is never invented. Values come only from the trail's re-execution or from a recorded real use of the product (a captured request during Photograph the screens or Test drive). A step with no value runs dry and says so. A figure whose trail is partial shows water as far as it reaches and stops.
- Replay: the flow of any figure can be shown at any commit the replay stands on, with the values of that commit's re-execution if recorded, else dry.
- Performance: the flow of the sample product's largest figure animates at 60 fps on the laptop; pipes are cached per Blueprint and camera.

packages/stage — the inside (replaces the Stage 2 brick building):
- The third level is not another picture. Zooming past the facade takes the camera through the glass into the same building: the floors (what it shows, decides, remembers, talks to) seen from inside, each brick a transparent block on its floor, sized by its lines, laid in build order, the pipes of the flow running between them. The same four orientations, the same zoom, the same camera object; the breadcrumb reads Street › Take an order › inside.
- A brick opens to its code in the side panel (the typing view and the English pane of this stage), not to a separate canvas. The inspector's content from Stage 2 (Trust report, Commit, Brick in English, Confirm) moves into that panel unchanged in meaning.
- `apps/rama/canvas` is removed in this stage once every brick, edge and commit the old building showed is reachable inside the glass; its tests move to `packages/stage`. The lakefront is the only renderer. `blueprint/self.json` and `.rama/features.json` of this repository are regenerated and the self building names stay as confirmed.
- Nothing that was inspectable becomes less so: a test walks every brick of the sample product and of this repository through the inside and asserts the same English edges, commits and figures the Stage 2 inspector showed.

packages/stage and packages/workbench — the ground, opened (with the inside):
- A plot in the ground is a real Postgres table, and it opens. Click a plot, or say "open orders" / "show me the table": the camera dives into the ground and the table blows up to fill the stage, the way a building opens: a glass slab the size of the picture, under the same camera (turn and zoom work on it), the breadcrumb reading Street › the ground › orders. It shows the table's columns (name, type, key, from the Drizzle schema, deterministically), which buildings read it and which write it (pipes light up), and its rows — the real rows, read-only, newest first, at most 50 at a time with a "more" that pages, and a row count that says what it counts ("312 orders today"). A column that a figure on a screen depends on is marked and links to that figure's flow.
- Rows come from the product's own database: for products built here, the sandbox database the build loop already runs (`packages/workbench`); for an outside site, only if a read-only `DATABASE_URL` for that product is entered in Settings, with the usual green or red light; otherwise the slab shows the columns and says "Rows not connected". No row is ever invented or sampled from fixtures in the product view.
- Reads are read-only at the connection (a Postgres role or a read-only transaction), never through the builder; a value is shown as the table holds it, in the customer's words where `.rama/glossary` names the column. Secrets in a row (a column the schema marks as secret or whose name matches the keys list) are masked.
- The same slab is where the flow starts: "show me the flow" from a row's cell follows that row to the screen when a trail reaches it, dry otherwise.

apps/rama: the camera ring and zoom controls in Harmony, with plain words from the glossary; the English pane as a Harmony panel at the Brick level and, folded, at the Building level; "Show me the flow" on every figure's hotspot and in the voice bar; the opened table is a level of the stage, not a side panel; its paging and masking controls in Harmony; the banned-word test extends to the pane and the flow sentences.

Tests: tab layout (one primary per tab, actions in their act only, glossary on tabs); camera reducer (turn, zoom, level hand-offs, URL round trip); frame determinism in four orientations; pick in four orientations; the block splitter on fixtures (every line belongs to exactly one block); the typing stream from a recorded lift (order, pace floor, deletions); explanation cache by hash; unconfirmed until confirmed, and the overlay write audited; the pane shows "Not explained yet" with no drafter key; pipe geometry from trail fixtures (every trail step has a pipe, every untraced step a dry one); the table slab (columns from schema, readers and writers, 50-row paging, count in the customer's unit, masked secrets, "Rows not connected" without a connection, read-only enforced); the flow sequence from a recorded re-execution (values in order, pause, step, dry step); banned words; e2e: open the sample product, walk the five tabs with one lit action on each, replay the recorded build, turn the Street twice, zoom into Take an order down to the code, watch it typed, read every block's English, confirm one, then ask for the flow of the day's takings and watch the real rows become the figure on the screen.

Done when: the screen reads as the journey with one lit action; the inside of a building is the third level under the same camera and the Stage 2 brick building is gone from the app; a plot opens to its real columns and rows, read-only; a person can turn and zoom the sample product with a mouse and with words, watch its code written inside the glass during Test drive, read a plain-English line beside every block (each unconfirmed until someone signs it), and watch the real data of a figure flow from the ground to the screen in slow motion, dry wherever it is untraced; reviewer run; report. STOP.
```

### Stage 13 — The film

```
Stage 13 turns House of Rama into what the pod floor is for: a non-coder walks in alone, says what they want, and watches their application being built as a film they can stop and question. The voice is their only companion (Invariant 9 unchanged); the trainer is called only when a flag goes grey. The development is autonomous, done by the strongest frontier model the seats allow, and everything that happens is explained visually and in plain English. The trust machinery of Stages 0–12 is untouched; the film is how it is experienced. Stage 12 (ergPLAN) may continue underneath; this stage does not touch the house stack, the gate or the ceremony.

Build order and what is hidden: the film is the product's home. `/` becomes the arena for anyone whose role is customer; the trainer console, the Street-as-it-was, the site office and the campus move behind a Trainer link (role trainer in `members.json`) and are not shown to a customer. Nothing is deleted; the old screens stay reachable to a trainer at `/trainer/...`. Build in this order and commit after each: (1) the arena, the plan and the design, (2) the foundation time-lapse, (3) the film with the builder's own words, (4) the run — the product's own code firing when a bill goes in, (5) the grey flag and the trainer call, (6) ask the code, (7) the walk through and hand over, (8) the look against the frames. Test drive plays the whole film on "Read my bill" from the recording.

The design before the first block: after the plan is decided and before the foundation is laid, the voice explains the architecture on the Street as a design (`design/film/index.html#design`): the buildings (one per thing it does, glass), the four floors every building has (Remembers, Decides, Shows, Talks to), the ground as the database with its named plots, the jetty across the water, the pipes that carry every number, the gate and the Checker. Each item is read aloud and lit on the picture; "Yes, build it like this" is a decision card in the customer's name. Nothing is built until it is decided.

The run — how the product reads a bill (the heart of the film, `design/film/index.html#run`): when a bill is dropped on the finished product's screen, inside House of Rama, the product's own code is shown running, one line at a time, slowed to reading pace: the file that woke up, the line that ran (lit in the code pane), the value it produced (`units = 398 ← figure units-used`), the floor it lives on, and one English sentence per line; the drop travels the same path through the glass building — screen, reader, ground, screen — and the plot's row count goes up when the row is written. "What fired, in order" lists every line of the customer's product that ran with what it produced. The record comes from an instrumented run in the product's sandbox (the same re-execution `packages/trace` does for a figure, extended to one whole action), never from a model; a step whose value cannot be captured is shown dry and says so. Pause, Next line, Run it again. This is the product's code, and the film says so: the Builder's own actions are a separate, folded log.

The Builder's actions: every action the builder takes is also kept, folded by default, as action cards in the film, in order, as it happens — Read a file, Write a file, Run the tests, Run once, Decided — with what it acted on, what came back (the output, foldable), and whose code it was: the Builder's own tool (House of Rama's, e.g. reading the customer's sample bill before any product code exists) or the customer's product. The cards come from the builder's stream (Claude Code's tool calls and results), not from the drafter, and the first cards of any film are the builder reading the customer's sample with its own tools and deciding what to read from it. When the finished product itself uses a model (the reader asks a model to pick values off a bill, say), that call goes through `packages/model` and its row in `model_calls` becomes part of the figure's trail, shown as "read by a model" with the prompt and the answer, never as a sum.

The foundation time-lapse: while the scaffold is copied and installed (Stage 9's `scaffold`), House of Rama records one frame per saved file in order, and the film plays them back from a camera on the ground beside the plot (`design/film/index.html#foundation`): each block of the house stack rises into place with its plain-word name and its file name, a card says what it is for (fixed text for the shell, in `templates/house-stack/rama/blocks.json`, since the shell is the same for every product), and the architecture panel (Talks to, Shows, Decides, Remembers, Checks) lights the layer it belongs to with a running count. A scrubber with a frame counter; the voice reads each block's sentence.

The script the film follows is `design/film/steps.html`: twelve steps, from the two questions the builder asks before anything to hand over. The builder's first act is to ask what it cannot guess and to read the sample the customer gave; the plan is read aloud and decided by yes before the foundation is laid; the first failing check (step 7) is shown as a grey flag in plain words, fixed, and shown passing.

Before code: `design/film/` holds the designed reference (frames and a scripted walkthrough of the sample film, in Harmony's tokens) made before this stage. The stage's job is to make the live app match it. Screenshot-comparison tests (`tests/stage-13.look.test.ts`) compare the app at 1920×1080 against the reference frames (`arena`, `plan`, `design`, `foundation`, `film`, `run`, `flow`, `flag`, `ask`, `walk`) with a stated tolerance; the stage does not pass on geometry alone.

The sample product becomes "Read my bill" (replacing the Chai Stall everywhere, including Test drive): it reads an electricity bill (a PDF), finds the tariff on the web, works out the charge in a calculation sheet, keeps bills and charges in a database, and shows one screen with the bill's figures traced. The web lookup is a jetty across the water. Test drive replays its recorded build; with keys set it builds for real.

The arena (apps/rama, the customer's home):
- One sentence and a microphone. The voice greets the person by the name they picked and asks what they want to make. Idea, files dropped in (a sample bill), and the brains are all taken here; the brains question is not asked of a customer: the seats default to the strongest configured in Settings → Brains, shown in one sentence ("Claude Code builds, OpenAI checks"), changeable by the trainer only.
- The plan, spelled out: the builder turns the sentence into numbered steps in plain words (prompt plan.v1 through the builder seat; drafted, read aloud by the voice, decided by a spoken or clicked yes as decision cards, as in Stage 10). Each step names what it will make, in the customer's words, and which building it belongs to. The Street appears as empty plots with the buildings' names the moment the plan is decided.

The film (packages/stage, packages/workbench, packages/ears):
- The build runs step by step, as the plan reads. For each step a named agent steps up on the stage (the Builder, the Checker, the Explainer, the Voice — figures in Harmony's palette, one per seat, each with its vendor said once in plain words), and the step's work is shown as it happens: the file being written types in on the glass, the brick grows, the building rises, the pipes connect, the plot in the ground fills.
- Narration is the builder's own words. Claude Code's text between its tool calls (what it says it is about to do and what it found) is captured from the stream, shown as subtitles under the typing and read by the voice; it is marked as the builder's narration and is never rewritten by the drafter. When the builder is silent for a step the subtitle says what changed, from the diff, in the glossary's words. Pace: never faster than a line can be read; pause, slower, faster, skip to the next step, replay a step, and "catch up" to a live build.
- A card for every file, when it is born: its plain-word name, which step and building it serves, what it does in one or two sentences (the Explainer seat, prompt explain.v1 as in Stage 11, unconfirmed until confirmed), and the figures it carries. The cards stack into the "Parts" shelf of the film, and the inside of the building shows the same cards on the bricks.
- The grey flag: when a lift fails the gate, a test, or the figures lint, the film pauses on a grey flag with one plain sentence and the builder's next action, the voice says it, and the trainer is called: the flag appears in the trainer console's "Needs a trainer" list and, if a trainer's email is in `members.json`, an email goes out. The customer can wait or go on with another step that does not depend on it. The trainer resolves it from the console; the film resumes.
- When the film ends: the walkthrough (Stage 4 ceremony) plays as the last act, the voice reading each screen and asking for the customer's yes, then the Checker's audit flies, then Hand over.

Ask the code (packages/workbench `askCode`, apps/rama):
- At any moment, paused or playing, the person clicks a block, a file, a line, a figure or a building and asks a question, typed or spoken. The answer comes from the Explainer seat (prompt ask.v1) given only: the selected code, its file's card, the plan step it serves, its trail if it carries a figure, and the question. The answer is in plain English, cites the lines it rests on (shown highlighted in the glass), and says "the code does not say" when the answer is not in what it was given. Answers are explanations, shown as such; they are never a record and never change one (Invariant 6 and 9).
- The voice can ask it: "what does this part do", "why is this here", "what happens if the bill has no units" route to askCode with the thing on screen as the selection.
- Every question and answer is kept as a turn in the session transcript with the selection, so a trainer can see what the customer asked.

The look: the reference frames of `design/film/` are the specification. The Street is a place, not a diagram: buildings read as glass with floors and light inside, facades large enough to read, the ground visibly a database (plots with their names and row counts), the lake and the jetties drawn; the inside is a room with walls of code; pipes are pipes with water moving in them. Every control in Harmony; one lit action; plain words only (the glossary test runs on every frame of the film).

Tests: plan.v1 produces numbered steps each naming a building (fixture sentences); the film's step order follows the plan; narration is only builder text or diff-derived glossary text (a test feeds a builder stream with a product fact in the drafter's output and asserts it never reaches a subtitle); pace floor; file cards unconfirmed until confirmed and audited; grey flag pauses, lists in the console, emails when configured, resumes on resolution; askCode answers cite lines and says "the code does not say" on a question outside the selection; transcript keeps questions; screenshot comparisons against the reference frames; e2e: a recorded customer session on "Read my bill" from the first sentence to Hand over with no trainer action, and one with a grey flag resolved by a trainer.

Done when: a person who cannot code sits alone, says one sentence, watches "Read my bill" built as a film with every step spoken and every file explained, asks the code three questions and gets answers from the code, signs the walkthrough by voice, and the app looks like the reference; reviewer run; report. STOP.
```

### Stage 12 — ergPLAN

```
Stage 12 is the first real product. House of Rama is used, not built; the report is the first customer story.

Create the product ergPLAN in the workbench with its repository under the configured GitHub account. Run discovery with the member as the customer and a trainer from members.json: the idea, the buildings in the customer's words, the figures each will show, what it will not do, the spoken yes. Build from the scaffold through the loop; every lift on the lakefront; the member walks and signs every customer screen; the audit runs; the keys page is produced. Anything House of Rama cannot do during this stage is a KNOWN-GAPS entry with the sentence the customer heard, fixed in a small follow-up stage before another product starts.

Done when: ergPLAN's first signed release exists in its own repository with 100 percent traced figures, every customer screen Confirmed, a signed audit, and the member's own name on the first signature; report. STOP.
```

## 5a. Plan, Stages 0–6 (built; history)

Sequenced by what becomes permanent earliest: the Blueprint schema and the signature record first, interface polish last. Six stages, roughly six weeks, each ending at a hard STOP.

| Stage | Name | What becomes permanent | Target |
| --- | --- | --- | --- |
| 0 | Foundation | Monorepo, watcher, CI, Postgres, `packages/shared` types | — |
| 1 | Blueprint | The Blueprint schema and extractor; `rama extract` | Procurement Studio, EkBill, self |
| 2 | The Site | The building renderer, inspector, English dependencies | Self, EkBill |
| 3 | Showroom and trails | Screen capture, figure instrumentation convention, trails | EkBill |
| 4 | Ceremony | Decisions, signatures, the merge gate, walkthrough | EkBill |
| 5 | Audit | Second-vendor auditor, report, replay | EkBill, self |
| 6 | Floor edition | Members, bookings, triptych, campus, deploy | Prototype pod |

Week 3 checkpoint (after Stage 3): EkBill rendered, traced, walked through and signed by the user. Week 6 checkpoint (after Stage 6): ten members through the prototype pod.

## 6a. Stage prompts 0–6 (built; not re-run)

### Stage 0 — Foundation

```
Stage 0 builds the monorepo and the safety rails. It adds no product behaviour.

Do not touch: anything under reference/.

Set up:
- pnpm workspaces per the folder layout; Node 22 pinned in .nvmrc and package.json engines.
- apps/rama: a minimal Next.js App Router app with one route (/) that renders "House of Rama · Built on trust" and the git short SHA from an env var.
- packages/shared: the Blueprint, Trail, Decision, Signoff, Finding types (see §8). Exported, documented with one line per field. docs/BLUEPRINT.md is generated from these types by scripts/gen-blueprint-doc.mjs.
- packages/db: Drizzle + Postgres 16 via docker-compose.yml. Tables: sites, people, model_calls, audit_log. Every table has site_id (nullable only on people), created_at, created_by. One migration. A seed with one site ("self") and one person (the user; name from .env).
- packages/model: one function `call({name, version, input})` that loads prompts/<name>.v<version>.md, routes to the vendor named by BUILDER_VENDOR or AUDITOR_VENDOR, retries twice, writes a model_calls row, returns typed output. Vendor adapters for anthropic and openai. A test that the runner refuses when AUDITOR_VENDOR === BUILDER_VENDOR.
- scripts/watch.mjs and .github/workflows/check.yml per CLAUDE.md §4. The watcher must be green on an empty repo.
- docs/ARCHITECTURE.md, docs/DECISIONS.md (first entry: the locked decisions, dated), docs/KNOWN-GAPS.md, docs/reports/.
- .env.example with DATABASE_URL, BUILDER_VENDOR, AUDITOR_VENDOR, ANTHROPIC_API_KEY, OPENAI_API_KEY, RAMA_MEMBER_NAME, GIT_SHA.

Tests: packages/model vendor-guard test; packages/db migration applies and seed runs; apps/rama route renders.

Done when: `pnpm install && pnpm dev` starts app, Postgres and watcher; `.watch/status.json` is ok:true; CI config is valid; the stage report is written. STOP.
```

### Stage 1 — Blueprint

```
Stage 1 builds the Blueprint: the generated, machine-maintained model of a repository that everything else renders. It is the most permanent thing in the product; get the schema right.

Do not touch: apps/rama beyond a /api/health route.

packages/blueprint:
- `extract(repoPath, opts): Blueprint` reading only git and the file tree. Port reference/weekend-prototype/extract.py to TypeScript, then exceed it.
- Nodes: one per tracked file: path, layer, lines, bytes, binary, test (boolean), exports (names), env vars read, first commit, last commit, change count.
- Layers: derived from a per-target `.rama/layers.json` overlay if present, else from the house-stack defaults (foundation, data, logic, api, interface, shell). Record which rule assigned each node.
- Edges: resolved internal imports with the imported symbols; external dependencies as a separate list.
- Commits: full history (oldest first) with per-file add/del/kind (A/M/D/R) and author; branches; tags.
- Screens: routes discovered from the Next.js app/ tree (path pattern, file). No screenshots yet.
- Metrics (packages/blueprint/metrics): files, text lines, tests, commits, authors, branches, import edges, env vars, untested bricks, load-bearing (top importers), most reworked. These functions are the only source of these numbers anywhere in the product (Invariant 7).
- CLI: `rama extract <repoPath> [--out file]` and `rama diff <a.json> <b.json>`.
- Overlay: `.rama/glossary.json` in the target (symbol → English phrase, with `confirmedBy` and `confirmedAt` or absent). The extractor merges it into edges as `english` with `confirmed: boolean`. Phrases with no confirmation are marked unconfirmed (Invariant 6). Draft unconfirmed phrases with packages/model (prompt glossary.v1) only when `--draft-glossary` is passed; never silently.
- Determinism: extracting the same commit twice yields byte-identical JSON (sorted keys, stable ordering).

Run it on reference/procurementstudio (expect 34 nodes, 50 edges, 6 commits, 0 tests, 13 env vars — the weekend numbers), on reference/ekbill, and on this repository (blueprint/self.json, checked in, regenerated by the watcher and CI).

Tests: unit per layer rule, per import resolver case (alias, relative, index, type-only), per metric; a golden test on procurementstudio against the weekend numbers; determinism test; overlay merge test.

Done when: three blueprints extract; the golden numbers match; self.json is checked in and CI fails on drift; docs/BLUEPRINT.md regenerates; reviewer run; report written. STOP.
```

### Stage 2 — The Site

```
Stage 2 renders a Blueprint as a building and makes every brick inspectable in English. Port the weekend prototype's renderer from reference/weekend-prototype/house-of-rama.html into apps/rama/canvas as pure functions over a Blueprint, then make it data-driven.

Do not touch: packages/blueprint except bug fixes found while rendering (each one a test first).

apps/rama/canvas:
- layout(blueprint) → floors, bricks (x,y,w,h), scaffolds (branches), cranes (authors). Brick width log-scaled by lines. Deterministic.
- draw(ctx, state) where state = {blueprint, commitIndex, progress, selection, glow, audit}. The sky's time of day comes from the commit timestamps. JCB on any commit that deletes ≥ 20 lines from a file. Door to the Showroom; site office for Discovery (both stubs in this stage).
- Timeline replay of commits; speed; links toggle drawing import cables.

apps/rama components:
- Inspector: Trust report (metrics), Commit (lift), Brick. The Brick view shows: purpose (from overlay or unconfirmed draft), the reviewer paragraph (needs N bricks by floor; M rely on it; the warning when ≥ 4 dependants and no test), Depends on / Used by with the English phrase per edge and its confirmed/unconfirmed state, env vars, change history.
- Every unconfirmed phrase has a "Confirm" control that writes to the target's .rama/glossary.json via a local write path (work/<site>/repo) and records who confirmed. (No auth yet: the local member.)

Routes: /site/[siteId] renders the building for a site whose repo is cloned under work/. `rama site add <gitUrl|path>` clones and extracts.

Tests: layout determinism; brick picking; reviewer-paragraph wording for 0, 1, 4 dependants; confirm writes an overlay entry; e2e: open /site/self, click a brick, read its dependencies.

Done when: /site/self and /site/ekbill render from their blueprints; every brick is inspectable; House of Rama renders itself (rule 14); reviewer run; report. STOP.
```

### Stage 3 — Showroom and trails

```
Stage 3 photographs the real screens and makes figures on them traceable. This is the convention the house stack must follow; write it down in docs/HOUSE-STYLE.md and apply it to EkBill via an overlay, not by editing EkBill.

packages/trace:
- Capture: Playwright drives the target's built app (`pnpm build && pnpm start` in work/<site>/repo, no vendor keys) through `.rama/screens.json` (route, role, steps, name). Screenshots to work/<site>/shots; each screen records the bricks that render it (from the route's import closure in the Blueprint).
- Figure convention (docs/HOUSE-STYLE.md): a traceable figure is a DOM element with data-rama-figure="<figureId>"; the target exports `rama/figures.ts` mapping figureId → {fn, file, line, inputs: [{label, source}]}. EkBill does not have this yet, so Stage 3 ships an overlay `.rama/figures.json` for EkBill written by hand for its five headline figures (GST quarter total, dues total, a bill total, a track-record style score if present, the walk-in bill total) and marks every other figure untraced (Invariant 2).
- Trail builder: trail(figureId) → {figure, title, formula: {english, code, file, line}, inputs: [{label, value}], data: [where each input lives: table/column, file constant, browser storage], build: [commits touching the trail's files], signoff: null | Signoff}. Values come from re-executing the target's own function in a sandbox (vitest worker importing the target's module) with the captured screen's inputs; if re-execution is impossible, the trail says so and shows no value rather than a retyped one.

apps/rama:
- Showroom overlay: real screenshots, strip of screens, hotspots over traceable figures (positions from Playwright bounding boxes, stored with the capture), untraced figures outlined grey.
- Trail panel: the five sections from the weekend prototype (formula, inputs, where the data lives, build trail, review & sign-off, the last one empty until Stage 4).
- Brick inspector gains "On screen" thumbnails.

Tests: capture on ekbill produces ≥ 8 screens; each screen lists ≥ 1 brick; the five EkBill trails re-execute and match the on-screen text; an untraced figure renders in the untraced state; e2e: open Showroom, click a hotspot, read the formula.

Done when: EkBill's Showroom shows its real screens with five traced figures and the rest marked untraced; the house-style document exists; reviewer run; report. Week-3 checkpoint: the user walks EkBill end to end. STOP.
```

### Stage 4 — Ceremony

```
Stage 4 adds the people: discovery decisions, signatures, the merge gate and the walkthrough. Signatures are the second most permanent thing in the product.

packages/ceremony:
- Decisions: a session is a list of turns (speaker role, text, at) and decision cards {id, title, statement, bricks[], screenId?, status: decided|open|not-built}. Stored in `decisions` (Postgres) and mirrored to the target's `.rama/decisions.jsonl` so the record travels with the code. Cards link to bricks by path and to screens by id.
- Signoffs: `signoffs` table and `.rama/signoffs.jsonl`: {id, person, target: {kind: screen|brick, id, commit}, statement, at, supersedes?}. Append-only, enforced by a Postgres rule (no UPDATE/DELETE) and a test. Every write also appends audit_log (Invariant 8).
- Gate: `rama gate <repoPath> --base <commit>`: lists screens whose bricks changed since base; for each, requires a signoff at or after the change commit OR a passing test file among its bricks; exits non-zero with a readable list otherwise. Ships as a GitHub Actions workflow the target includes. The gate ignores configuration inside the target that would disable it (Invariant 4).
- Walkthrough script: for a site, an ordered list of screens with the person to ask, the statement to confirm (from the decision cards and figures), and the trails to show. Narrated by SpeechSynthesis in the app; each confirmation creates a signoff.

apps/rama:
- Discovery overlay (site office): run a live session: turns typed or dictated, Rama's questions drafted by packages/model (prompt discovery.v1) and marked as drafts, decision cards written at the moment the user confirms them. The reconstructed EkBill session from the weekend is imported as the first record, flagged `reconstructed`.
- Walkthrough mode: screen by screen, name called, Confirm / Not yet; signing a screen turns its bricks' red dots green when a test exists, amber-signed otherwise. The trail panel's sign-off section fills.
- Trust report shows signed/unsigned counts from packages/blueprint/metrics (one engine).

Tests: append-only enforced (UPDATE and DELETE fail); gate passes/fails on crafted fixtures (changed screen with signature, without, with test); supersede chain; e2e: run a walkthrough on EkBill, sign two screens, gate passes for those and fails for an unsigned changed screen.

Done when: the user has signed EkBill's five traced screens under their own name; the gate runs in EkBill's CI config (as an overlay in work/, not pushed); reviewer run; report. STOP.
```

### Stage 5 — Audit

```
Stage 5 adds the second opinion. The auditor is a different vendor from the builder (Invariant 5) and never edits code.

packages/audit:
- Checks (plain code, no model): typecheck, build, test run and coverage per brick, silenced lint, swallowed errors, any-types, hard-coded constants in formula files, browser-storage writes, env-name fallbacks, unauthenticated long-running routes, three-or-N assumptions on sorted arrays, unsigned changed screens (from the gate), unconfirmed glossary phrases, decisions marked open or not-built.
- Verdicts: per brick pass | note | defect with the finding text and file:line; the auditor model (prompt audit.v1, via packages/model with AUDITOR_VENDOR) receives the check results and the Blueprint and returns: the narration script (floor by floor), the alterations list with agent-time and human-time estimates, the time-machine list (commit → what should have happened), and a signed report {reportId, vendor, model, at, inputsHash}. The model may not add a defect the checks did not find; it may downgrade or explain. A test asserts this.
- Report persisted to `audits` and `findings`, append-only, audit_log.

apps/rama:
- Audit mode: two drones fly the floors, beam per brick, badges stay on the building, live log, narration spoken; report panel with sign-offs confirmed/rejected, alterations, time machine, who did what; "Light the defects".
- The brick inspector shows its latest verdict.

Run on EkBill and on self. The self audit must be clean of defects before STOP (notes allowed, listed in KNOWN-GAPS).

Tests: each check on a fixture that triggers it and one that does not; the model-may-not-add-defects test; vendor guard; report hash reproducible; e2e: run the audit on ekbill and read the report.

Done when: EkBill has a signed audit report from the auditor vendor; self audit has zero defects; reviewer run; report. STOP.
```

### Stage 6 — Floor edition

```
Stage 6 turns the single-member app into the pod floor's product. Security that was deferred lands here, fully.

- Auth: email magic link (no passwords). `people` gains email; sessions table. Every route under /site, /showroom, /audit, /campus requires a session; a site belongs to a member; a member sees only their sites. Tests for every route's authorization.
- Bookings: `bookings` {pod, member, shift, starts, ends, siteId}. Opening /pod/<n> during a booking loads that site. Status for the pod light: blue (work), amber (awaiting sign-off), green (signed and audited), pink (game mode) exposed at /api/pod/<n>/status for the pod controller.
- Triptych: a layout for three 3840×2160 screens: left Discovery, centre Site, right Showroom; a single-screen fallback remains. Narration through the headset via SpeechSynthesis.
- Campus: /campus for the floor manager: every pod, its site and phase, signatures pending by name, audits passed, products in use at 90 days (a member-reported check-in, recorded). Numbers from packages/blueprint/metrics.
- Handover: on a site's final signed audit, generate the structural certificate (which bricks are load-bearing: a `.rama/structure.json` overlay confirmed by a named person) and the keys page (repo URL, deploy, how to request a change through the same ceremony). The Bharat self-edit flow itself is out of scope; the certificate is not.
- Deploy: docker-compose for one box (app, Postgres, watcher, Playwright), documented in docs/DEPLOY.md; backups of Postgres nightly.

Tests: authorization per route; booking → site mapping; pod status transitions; campus numbers equal metrics; e2e: a member books a pod, opens the triptych, signs a screen, the pod status changes.

Done when: deployed on the prototype pod box; two members (the user and one other) complete the loop on real sites; reviewer run; report. Week-6 checkpoint: ten members. STOP.
```

## 7. Reference data

### 7.1 Weekend numbers for the golden test (Procurement Studio at fac615d)

files 34 · text lines 3,933 · commits 6 · authors 2 · branches 1 · import edges 50 · env vars 13 · tests 0 · heaviest text brick lib/data.ts (367 lines, package-lock excluded) · load-bearing lib/data.ts (12 importers) · most reworked README.md (6 of 6 commits) · demolitions: commits 3 and 6 on components/RealTalk.tsx.

### 7.2 Layer rules (house-stack default)

foundation: package manifests, tsconfig, next.config, vercel.json, .env.example, .gitignore, proxy/middleware, lib/server/**  ·  data: lib/data*, lib/history*, schema and migrations, public/**  ·  logic: lib/** not matched above  ·  api: app/api/**  ·  interface: components/**  ·  shell: app/layout*, app/page*, app/globals.css, README.

### 7.3 Audit check names (Stage 5)

typecheck, build, test-coverage-per-brick, silenced-lint, swallowed-error, any-type, magic-constant-in-formula, browser-storage-write, env-fallback, long-unauth-route, positional-assumption, unsigned-change, unconfirmed-glossary, open-decision.

## 8. Shared types (packages/shared, Stage 0)

```ts
type Layer = 'foundation' | 'data' | 'logic' | 'api' | 'interface' | 'shell' | string;
interface BrickNode { path: string; layer: Layer; layerRule: string; lines: number; bytes: number; binary: boolean; test: boolean; exports: string[]; env: string[]; firstCommit: string; lastCommit: string; changes: number; purpose?: { text: string; confirmed: boolean; by?: string; at?: string } }
interface ImportEdge { from: string; to: string; symbols: string[]; english?: { text: string; confirmed: boolean; by?: string; at?: string } }
interface Commit { sha: string; short: string; at: string; author: string; subject: string; changes: { path: string; kind: 'A'|'M'|'D'|'R'; add: number|null; del: number|null }[] }
interface Screen { id: string; name: string; route: string; file: string; bricks: string[]; shot?: string; figures?: FigureRef[] }
interface FigureRef { id: string; box: { x: number; y: number; w: number; h: number }; traced: boolean }
interface Blueprint { repo: string; commit: string; extractedAt: string; extractorVersion: string; layers: { id: Layer; label: string }[]; nodes: BrickNode[]; edges: ImportEdge[]; external: { name: string; version: string }[]; commits: Commit[]; branches: string[]; tags: string[]; screens: Screen[] }
interface Trail { figureId: string; title: string; what: string; formula: { english: string; code: string; file: string; line: number }; inputs: { label: string; value: string | null; source: string }[]; data: string[]; build: { sha: string; at: string; author: string; subject: string; file: string }[]; signoff: Signoff | null; reexecuted: boolean }
interface Decision { id: string; siteId: string; title: string; statement: string; bricks: string[]; screenId?: string; status: 'decided'|'open'|'not-built'; by: string; at: string; reconstructed?: boolean }
interface Signoff { id: string; siteId: string; person: string; target: { kind: 'screen'|'brick'; id: string; commit: string }; statement: string; at: string; supersedes?: string }
interface Finding { id: string; auditId: string; brick: string; check: string; verdict: 'pass'|'note'|'defect'; text: string; file?: string; line?: number }
```

## 9. Definition of done

| Stage | Checks before STOP |
| --- | --- |
| 0–6, Gaps 1 | Done; see their reports |
| 7 | No terminal needed: name picker, keys with lights, product + repository creation, Test drive green with no keys; secrets never in logs or .env; stateOf and counts from metrics; "imports" never shown as confidence; reviewer |
| 8 | Street/Building/Brick over one Blueprint; banned-word test passes; facades and flags live; drones and replay on the lakefront; member names every building of the sample product from the Street; reviewer |
| 9 | Scaffold lint refuses an unmarked number; sample product rebuilt from the scaffold by the builder with no human command, 100% traced, all Verified; Test drive uses this path; four seats chosen in Settings and asked in discovery, builder ≠ auditor enforced, OpenAI-compatible adapter covers Gemini/Grok/Kimi/Ollama; reviewer |
| 10 | Mouth-not-mind test; track questions answered only from trails; spoken yes creates a named decision; rehearsal acts 1–3 by voice; reviewer |
| 11 | Five tabs, one lit action each, no empty stage; the inside replaces the Stage 2 canvas with nothing less inspectable; plots open to real columns and rows, read-only, never invented; four orientations and continuous zoom, deterministic frames and pick in all four; code typed inside the glass during a real lift and in replay; one English line per block, drafted by the drafter and unconfirmed until confirmed; "Not explained yet" with no key; pipes for every trail step and dry pipes for untraced; the flow animates only recorded or re-executed values; banned-word test covers the pane and the flow; reviewer |
| 13 | Reference frames matched within tolerance; plan in steps decided by yes; narration only builder or diff text; file cards unconfirmed until confirmed; grey flag calls the trainer; askCode cites lines or says the code does not say; recorded customer session end to end with no trainer; reviewer |
| 12 | ergPLAN first signed release: own repository, 100% traced, customer screens Confirmed, signed audit, member's name on signature one |

Two honest numbers wherever a rate is reported: figures traced over figures shown, and screens signed over screens changed, each with its audience named. An untraced figure correctly shown as untraced is never scored as a failure.
