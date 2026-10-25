# Stage 8 — Lakefront

Built 2026-10-25, from tag `stage-8-start`.

## Where this stage stands

A site now opens on its Street: the transparent isometric lakefront, one building for each thing the product does, named in the owner's words. The sample product's Street names its three buildings — "See today's orders", "Take an order", "Count the day's takings" — each with one sentence on what it does, its flag in words, and its real screen on the facade. A member can say what each building does from the Street alone. `tests/stage-8.e2e.test.ts` checks this in a real browser on the real dev server. It reads every building's name and sentence from the Street, finds no developer word on the page, waits for the three facades, clicks a building to choose it and again to open it, opens a figure's trail, says "show me the code" to reach the code, and flies the audit's drones until their badges stay. It runs in the watcher and in CI.

## What was built

**The Blueprint learns the ground and the water.** The extractor (now 0.2.0) records:

- the tables defined in code: Drizzle's `pgTable`, `sqliteTable` and `mysqlTable`, with their file, line and columns, in `Blueprint.tables`;
- which files read or write each table, through a runtime import of the defining file or of a file that re-exports it. A file writes a table when it passes it to `.insert()`, `.update()` or `.delete()`; any other use as a value is a read; a use in a type only is not a use. These go in `BrickNode.tables`.
- the outside packages each file imports at run time (`BrickNode.packages`);
- the web hosts written in its strings (`BrickNode.hosts`).

Nothing is executed and no database is opened. `docs/BLUEPRINT.md` and `blueprint/self.json` are regenerated with it.

**`packages/stage`** — the lakefront, pure functions over one Blueprint, safe in the browser:

- `resolveFeatures(bp, file)`: one building per entry of the product's `.rama/features.json` (id, name, one sentence, its screens). Each file stands in exactly one building: the one whose screens alone use it. Files the screens of several buildings use stand in "Shared by several"; code no screen uses stands in "Behind the screens". Tests, documents and settings are not drawn on the Street and are counted in a sentence. A screen the file leaves out gets a drafted building of its own. A site without the file has drafted buildings, one per screen, marked drafted (Invariant 6).
- `street(bp, features)`: the Street on a 2:1 tile grid, deterministic (the test pins positions). Buildings stand in slots with their floors and bricks; the tables are plots in the ground, lit `accent-soft` when a building reads or writes them; roads are one building using another, dotted when only a type crosses; the lake is the product's edge, and outside services are jetties across the water. A jetty is a service House of Rama knows by its package or its interface address, not a link to a web page.
- `building(feature, facades)`: the Building level. The real screenshots are on the glass front, one panel per screen, cropped to the top of the screen, with each figure outlined where the screen shows it: `accent` when traced, dashed `line-strong` when untraced. The floors show through the side: what it shows, what it decides, what it remembers, who it talks to.
- The replay: `streetTimeline`, `laid`, `craneAt` and `liftChip` ("Lift 3 · 02:00", in the commit's own zone). Bricks appear through the glass as their lift lays them, and a building rises with its floors. The crane parks at the building being built, in `harmony` with its glow. The sky follows each lift's own hour: the sun by day, the moon by night. Plots, roads and jetties appear with the files and buildings they belong to.
- The audit on the Street: `streetAuditScript` flies building by building, and `buildingVerdicts` gives the badge each building keeps (its worst verdict). The drone state, `stepAudit`, moved here from `apps/rama/canvas/audit.ts`; the code level uses the same functions.
- `drawStreet` and `drawBuilding` paint with Harmony's tokens only (`palette.ts`), read from the page's CSS custom properties so the theme is followed. A test records every colour painted and fails on any value that is not a token of the theme, in both themes.
- `pickStreet` (facade, brick through the glass, building, jetty, plot) and `pickBuilding` (figure, facade, brick), using the same shapes the drawing uses (`geometry.ts`).
- `understand(text, here, buildings)`: the words open (and a building's name), inside, show me the code, go back and street. A phrase it does not know gets a sentence back, never a guess. The voice of Stage 10 will take the same words.

**Flags (Invariant 11).** A building's flag is metrics `buildingState` over its screens' `stateOf`, the one function every surface reads:

- Confirmed, with the names, when every screen is signed;
- Verified when every screen is Verified or Confirmed;
- otherwise Unverified.

Always the word and the colour, and a sentence that says what it counts ("All 1 screen checked: 1 by a passing test"). "Shared by several" and "Behind the screens" have no screen of their own and stay Unverified, and say why.

**The app.** `/site/[siteId]` is the Street. `?b=<building>` opens a building, and `?at=code` (or a decision card's `?brick=`) is the code: the Brick canvas of Stage 2, unchanged. The breadcrumb names the level: "Home › Chai Stall › Street › Take an order › the code". The Street level has:

- the canvas, with hover sentences;
- one click to choose a building, which becomes the folder (the one green object), and a second click or "Open" to go in;
- Play the building, over Harmony's ProgressTrack with the live chip;
- Fly the audit, with Skip to the end and Put the drones away, and a log of what the auditor is doing;
- the words box;
- a card for the chosen building: what it does, its flag sentence, its screens, what it reads and writes, whom it talks to, the audit's word;
- the list of every building with its sentence, flag and badge;
- the ground in words ("orders: written by Take an order; read by …") and the water ("OpenAI, talked to by …").

The Building level has its picture, StatTiles for its traced figures, the figure list (Traced or Untraced), the floors, and the trail of an open figure in plain words. The trail is the folder there. It says how the figure is worked out, its inputs, where they are kept, whether it was worked out again by the product's own code, the lifts that built it and who signed, with "Show me the code" to the formula's file. `packages/workbench` `siteLakefront` assembles a site's lakefront from what is on record. Facades come only from a capture of the commit shown.

**Name this building.** On the Building level, a person confirms a drafted name, or writes the name and the sentence in their own words. `POST /api/site/[siteId]/features` writes it into the product's `.rama/features.json`, confirmed by them and dated, with an `audit_log` row. A drafted building is written into the file with its screens; the rest stay drafted. The sample product's names are part of its history (a seventh commit, "Name the three things the stall does, in the owner's words"). House of Rama's own `.rama/features.json` names its twelve buildings; I drafted the names as the builder, and nobody has confirmed them yet.

**Plain words (rule 17).** `apps/rama/test/banned.ts` reads the glossary's banned list and finds each word in any form ("commits", "repositories", "imported"). The site page test renders the Street and every Building of House of Rama itself and finds none. The e2e test reads the whole page, trainer console and breadcrumb included, at both levels on the sample product. To pass, the console's "Create repository" became "Create it on GitHub", and the product flags say "… is created on GitHub". The inner views (Showroom, office, walkthrough, code) now head with their own name in Harmony's title style, in place of a second wordmark; their back links say "Back to the Street".

## Tests

- New in `packages/stage` (40 tests):
  - features, including naming;
  - Street layout, pinned;
  - floors, plots, roads and jetties;
  - facades with and without a capture;
  - Building level and its determinism;
  - pick at the Street and Building levels, and nothing picked where the replay has not built;
  - replay, crane and clock;
  - the drones building by building, and the badges;
  - drawing with tokens only in both themes, one green object, flags as words, the sky.
- Other unit and integration tests:
  - metrics `buildingState`;
  - the extractor's tables, table use through re-exports, packages and hosts;
  - `siteLakefront` on the sample product (names, the plot, flags from states, facades only from a fresh capture, a broken names file);
  - the naming route's handler and its authorization;
  - the site page at all three levels with the banned-word check;
  - the banned-word finder.
- Brick-level pick is the Stage 2 `apps/rama/canvas/pick.test.ts`, unchanged.
- End to end: `tests/stage-8.e2e.test.ts`. Stage 2 and 5's e2e tests now open the code level, `?at=code`, for the Brick canvas. Stage 4's sample test finds its gate base by message instead of by counting commits, because the sample now has seven commits.

## Deviations and readings of the prompt

- **The two buildings House of Rama adds.** Code shared by the screens of several features, and code behind no screen, are not things a product does. They stand in "Shared by several" and "Behind the screens", so that each file stands in one building and the roads say who uses whom.
- **`street(blueprint, features)` and `building(feature)`** take one more argument each: the photographed screens, so a facade is the real picture (`StreetOptions.shots`, `FacadeInput[]`).
- **The banned list covers the trainer console** beside the Street. That renamed Stage 7's "Create repository" button (DECISIONS).
- **Features "written by the builder from the decision cards"**: no build loop writes them yet; that is Stage 9's. Until then a product's names are written by hand, through Name this building, or drafted from its screens.
- **The sample product's table plot is unlit**: no code of the sample reads its `orders` table yet (KNOWN-GAPS).

## Reviewer findings

Pending: the independent reviewer runs on this draft (`stage-8.review.md`).

## Real model cost

So far, one model call: the audit of the Test drive I ran in the dev app (OpenAI `gpt-6.1-sol`, ₹2). The key set on this machine made it the real auditor rather than the stand-in. The tests make no model call.

## Open questions

1. House of Rama's own building names (`.rama/features.json`) are my drafts as the builder. They want a person's words: confirm or rename them on each building with "Confirm the name".
