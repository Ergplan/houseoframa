# Stage 3 — Showroom and trails

Date: 2026-10-20. Tag at start: `stage-3-start` (e49890d). Builder: Claude Opus 5.5 (Claude Code). Drafting model: `claude-sonnet-5-5`. Independent reviewer: OpenAI `gpt-6.1-sol` through `packages/model` (prompt `reviewer.v1`).

## Before the stage: the member's Stage 2 answers (commit 3dbc4f9)

1. **EkBill's eight floors confirmed** by Rachit Agarwal on 2026-10-20 and recorded in DECISIONS.
2. **EkBill's `.rama/` stays local** until Stage 4. KNOWN-GAPS records that the EkBill team commits it when the gate lands.
3. **Drafting follows barrel files.** It now goes through `export * from` and `export { … } from` to the file that declares a symbol, up to 6 hops, test first, and a symbol no file declares is no longer sent to the model. The redraft raised EkBill from 1,038 to 1,147 of 1,300 named edges with English, and this repository to 169 of 199.
4. **`packages/model` keeps the whole reply** in `model_calls.error` when it is not valid JSON (one line plus a test). The 10 EkBill purposes that had failed were redrafted and came back first time, so EkBill now has a purpose on all 692 text bricks. Nothing failed this time, so the cause of the old failure is still not diagnosed.
5. **Price table.** `packages/model/src/prices.ts` is the one dated table: US$ per million tokens per model, the rupee rate, and sources. `pnpm cost <stage>` turns a stage's `model_calls` into rupees.
   - Claude Sonnet 5.5 is $2 / $10, from Anthropic's model table.
   - `gpt-6.1-sol` is $2 / $10 from third-party price lists that agree with each other. OpenAI's own pricing page refused automated access, so the row is marked `fromVendor: false`.
   - The rupee rate is ₹94.92 per US$, the rupee's close on 19 Oct 2026 as reported by Deccan Herald.

## What was built

- **`packages/trace`**:
  - **`capture(site, blueprint, {outDir})`** (`rama-trace capture <site>`).
    - It builds the target's app in its checkout (`npm run build`) and starts it with no secrets: PATH, HOME and NODE_ENV only, so no database URL and no vendor keys.
    - Playwright drives it through `.rama/screens.json`: route, role, steps and name.
    - Each screen is photographed full-page into `work/<site>/shots/<name>.png`, with the viewport grown to the page so fixed bars sit where the user sees them.
    - Each screen records the bricks that render it, taken from the route's import closure in the Blueprint.
    - Figures are found: traced ones by `data-rama-figure` (the convention) or the overlay's selector. Untraced ones are amounts and percentages, at the smallest element that holds one (even split across elements), elements whose whole text is a number, and (conservatively) numbers inside words, wherever no traced figure covers them. Identifiers, dates, years and times are left alone. What this misses or over-marks is in KNOWN-GAPS.
    - Every traced figure is re-executed with the target's own function.
    - The result is written to `work/<site>/capture.json`.
  - **Sandboxed re-execution.** A separate Node process runs in the target's checkout with tsx and the `react-server` condition, as EkBill's own scripts run, and no environment. It calls the convention's function with the element's `data-rama-args`, or runs an overlay harness that calls the target's own loader.
  - **`buildTrail()`**, plain code (Invariant 6). It produces:
    - the formula, in English and as code from the mapped line to where its braces close, with file and line;
    - the inputs with their re-executed values (null when not re-executed, never retyped);
    - where the data lives;
    - the build trail: the commits that touched the figure's files, newest first;
    - the sign-off, null until Stage 4;
    - the shown-versus-computed check.
  - **`showroomOf()`.** A figure is traced only when it has a mapping; every other figure is untraced (Invariant 2). It gives the honest rate: figures traced over figures shown.
- **`docs/HOUSE-STYLE.md`**, the convention:
  - mark the figure with `data-rama-figure`, `data-rama-args` and `data-rama-value`;
  - map it in the target's own `rama/figures.ts` with `{fn, file, line, inputs: [{label, source, data}]}`;
  - say how to photograph the app in `.rama/screens.json`;
  - use the `.rama/figures.json` overlay for a target not instrumented yet.
- **The Showroom** (`/site/[siteId]/showroom`).
  - The real screenshots, with amber hotspots on traced figures and grey dashed ones on untraced figures, positioned from Playwright's bounding boxes.
  - A strip of screens.
  - The trail panel, with the weekend prototype's five sections: formula, inputs, where the data lives, build trail, review and sign-off. Sign-off says it arrives in Stage 4.
  - The re-execution check: "matches the screen", "does not match", or "not re-executed" with the reason.
  - An untraced figure opens a panel that says why it is untraced.
  - `GET /api/site/[siteId]/shots/[name]` serves the screenshots and nothing else.
- **"On screen" thumbnails** in the Brick view: each captured screen the brick renders, linking to that screen in the Showroom.
- **EkBill's overlay**, written by hand in its working clone (`work/ekbill/repo/.rama/`). Nothing in EkBill's code was edited.
  - `screens.json`: 12 screens, including a staff and an accountant view.
  - `figures.json`: five figures with their English formulas, inputs, data locations and selectors.
  - `trails/*.mjs`: harnesses that call EkBill's own `loadGst`, `loadDues` and `loadBillView`, and format with EkBill's own `formatRupees` and `rupees`.

## EkBill's Showroom

12 screens captured from the built app at 8c46a81. Every screen has its bricks, 154–171 each, because they share the app shell. **7 of 155 figures are traced:** the five below, two of them appearing on both the owner's and the accountant's GST screen. Each appearance is checked against its own screen: an overlay harness takes no screen arguments, so it runs once per figure and its result is compared at each appearance. The other 148 (amounts, percentages, counts and numbers in words) are outlined untraced.

| Figure                                              | Screen           | Shown      | Re-executed by EkBill's own code                               | Match |
| --------------------------------------------------- | ---------------- | ---------- | -------------------------------------------------------------- | ----- |
| GST this quarter                                    | `/gst`           | ₹21,483    | `loadGst(…).gstPaise` → `rupees()` → ₹21,483                   | yes   |
| Taxable sales this quarter                          | `/gst`           | ₹ 1,19,350 | `loadGst(…).taxablePaise` → `MoneyHero` format → ₹1,19,350     | yes   |
| Dues                                                | `/dues`          | ₹ 39,914   | `loadDues(…).totalPaise` → ₹39,914                             | yes   |
| Bill total, INV-042 (Mehta Traders)                 | `/bills/INV-042` | ₹7,316     | `loadBillView(…).paper.totalPaise` (via `computeTax`) → ₹7,316 | yes   |
| Walk-in bill total, INV-043 (Deshmukh ji, no GSTIN) | `/bills/INV-043` | ₹5,310     | the same path → ₹5,310                                         | yes   |

Whitespace does not count in the comparison (the hero's ₹ is its own span). Re-executing all five takes about 2 seconds each.

**The week-3 checkpoint is yours.** Walk EkBill end to end: `pnpm dev`, open `http://localhost:3000/site/ekbill`. Replay its 72 lifts, open a brick, then the Showroom door. Click the amber outline on the GST tile and read its trail. To recapture after EkBill changes, run `pnpm rama site extract ekbill` then `pnpm rama-trace capture ekbill`.

## Tests

257 tests in 35 files, all passing in the watcher:

| Package               | Tests |
| --------------------- | ----- |
| `@rama/blueprint`     | 132   |
| `@rama/app`           | 66    |
| `@rama/trace`         | 21    |
| model                 | 17    |
| e2e                   | 10    |
| db                    | 5     |
| shared                | 3     |
| `ekbill` (local only) | 3     |

The stage's required tests:

- **Capture on EkBill produces at least 8 screens, each with at least 1 brick** (`tests/stage-3.ekbill.test.ts`). It captures into a temporary directory from EkBill's build: 12 screens, every one with bricks and a screenshot.
- **The five EkBill trails re-execute and match the on-screen text** (same file). Each is re-executed with EkBill's own function and matches.
- **An untraced figure renders in the untraced state.**
  - `apps/rama/app/site/[siteId]/showroom/page.test.tsx` checks the grey dashed hotspot, its label and the untraced panel.
  - `packages/trace/test/capture.test.ts` checks that a detected amount and a `data-rama-figure` with no mapping are both untraced.
- **e2e** (`tests/stage-3.e2e.test.ts`, real dev server, real Chromium). A fixture target that follows the convention is added as a site and captured from its running app. In the Showroom the test:
  - checks the screenshot loads;
  - checks the untraced amount is outlined untraced;
  - clicks the traced hotspot and reads the trail's formula: the English, the code and `lib/total.js:2`;
  - checks "Re-executed: matches the screen. Shown 2800, computed by the target's own code 2800."

Also tested:

- **Capture on the fixture app** (CI-safe):
  - shots and `capture.json`, and bricks from the Blueprint;
  - the role put on as `?as=staff`, and no secrets reaching the app;
  - traced figures found by attribute and by selector, untraced ones by the pattern;
  - re-execution through the convention and through a harness;
  - refusal without `.rama/screens.json`.
- **Sandbox:** calls TypeScript functions; returns BigInt as a string; runs harnesses whose output includes noise; passes no environment beyond PATH, HOME and NODE_ENV; reports the code's own failure.
- **Trail:** all five sections; no values when not re-executed; a mismatch reported. Also route matching (dynamic segments, catch-all, literal over dynamic), `codeAt` and the config schemas.
- **Screenshot route:** serves PNGs; refuses traversal, unknown sites and wrong names.
- **On screen thumbnails** in the Brick view.
- **Member-requested changes:** barrel following (2 tests), the full reply kept (1), the price table (4).

## Skipped, and why

- **Live-data screens.** Capture runs with no secrets, so EkBill's screens show its Stage 1 fixtures (the signed-out demo owner), not a signed-in business. The traced values are the fixture's (KNOWN-GAPS).
- **This repository's Showroom** says nothing has been captured. House of Rama has no `.rama/screens.json` and its own Trust report is not instrumented per HOUSE-STYLE (KNOWN-GAPS).
- **EkBill's capture tests are not in CI**: EkBill's remote is private. CI runs the same capture, re-execution and Showroom path on the fixture target.

## Deviations from the prompt

- **Re-execution runs in a sandboxed Node process, not a vitest worker** (DECISIONS). EkBill's loaders need Next's `react-server` condition (`server-only`), which EkBill's own scripts set with `node --conditions=react-server --import tsx`. The sandbox does exactly that, in its own process with no environment.
- **"A track-record style score if present"** is not present in EkBill. Taxable sales this quarter takes its place among the five.
- **"The walk-in bill total"**: EkBill has no walk-in concept. Its nearest is a bill to a customer with no GST number (B2C): INV-043, Deshmukh ji.
- **The bill totals are traced on the invoice paper**, where EkBill's `computeTax` produces them. The bill view's hero shows the fixture's carried total or the amount due, which is a different figure, and stays untraced.
- **The overlay names a figure on several screens** (`screen` may be a list), so the accountant's view of the GST screen traces the same two figures.
- **EkBill's tests run in a vitest project that exists only where EkBill's working clone does.** They are not skipped: the project is absent in CI, as EkBill's Stage 1 extraction was.
- **Member-requested work before the stage** (above) is in this stage's diff.

## Reviewer findings

Runs with `gpt-6.1-sol`, recorded in full in `docs/reports/stage-3.review.md`.

**Run 1 (at 54a9f3e): two code defects and one report claim.** All three are fixed with tests in this commit.

1. **Invariant 2 (code): detection was too narrow.** Only leaf elements holding a currency amount were found. Amounts split across elements (EkBill's hero "₹" + "39,914"), percentages and counts were on screen with neither a trail nor an untraced mark. Detection now marks:
   - the smallest element holding an amount or percentage;
   - any element whose whole text is a number, unless it is inside an amount.

   Identifiers such as phone numbers are left out. EkBill went from 97 to 127 figures shown after this fix, 7 traced. The fixture app gained a split amount, a percentage and a count to pin this.

2. **Invariant 2 (code): trails keyed by figure id.** The same figure on two screens can come from different arguments, and a later appearance showed the first one's inputs and verdict. Runs and trails are now kept per appearance (`<screen>/<figure>`). The fixture shows `order-total` on two screens, computed from different lines, each matching its own screen.
3. **Report claim.** "Every figure is found" overstated the detector. It now says what is found, and KNOWN-GAPS says what is not: numbers inside words, figures drawn as images, and two amounts in one element's own text.

Other items from run 1 do not block the stage:

- **Item (d) "cannot tell"** for the generator and drift-check wiring, which are not in this stage's diff. They ran green before every commit (`.watch/status.json`).
- **Item (e) "cannot tell"** for EkBill's captured values and the cost: EkBill's overlay and capture live in its gitignored working clone. The EkBill test re-checks them on every watcher run on this machine.

**Run 2 (at e05abd1): one code defect and one report claim.** Both are fixed with tests in this commit.

1. **Invariant 2 (code): numbers inside words.** A count such as "13 bills" still had neither a trail nor a mark. A third, conservative pass now marks the smallest element holding a number inside words. Plain dates ("22 Sept", "12/10"), years, times and letter-digit identifiers ("INV-042", a GSTIN) are left alone. It over-marks a little (a house number in an address), and KNOWN-GAPS says so. EkBill: 7 of 155 figures traced.
2. **Report claim: "each appearance re-executed".** An overlay harness runs once per figure and its result is compared at each appearance. The report and DECISIONS now say exactly that.

**Run 3 (at 72a697b): one code defect, fixed with a regression test in this commit.**

1. **Invariant 2 (code): ancestors of a traced figure were skipped.** In `<p><span data-rama-figure>₹10</span> Delivery ₹99</p>` the ₹99 was left bare. Detection now excludes only a traced figure and what is inside it. An element that holds a traced figure is judged by its text outside that figure. The fixture's "Previous order ₹15.00 incl. ₹2 packing" pins it: the traced ₹15.00 keeps its trail and the ₹2 is marked untraced. EkBill has no such element, so its count is unchanged at 7 of 155.

**Run 4 (at 5e07e88): one code defect, the same class one level up.** In `<p>Delivery ₹99 <span>Tax ₹10</span></p>` only the child was marked, because the parent was dropped when any child qualified.

Rather than patch case by case, detection now works on **residual text**. Each element is judged by its visible text that is not inside a traced figure or a figure already marked. Each pass repeats until nothing new qualifies. An element is marked wherever its own text holds a figure, at any depth, beside traced or untraced figures. The fixture's "Delivery ₹99 / Tax ₹10" pins it, and both are marked. EkBill's count is unchanged at 7 of 155.

(Run 5 below.)

## Real model cost

`pnpm cost 3`, prices set 2026-10-20 at ₹94.92 per US$:

| Purpose                                   | Model             | Calls (attempts) | Input tokens | Output tokens | Cost    |
| ----------------------------------------- | ----------------- | ---------------- | ------------ | ------------- | ------- |
| EkBill phrases, redrafted through barrels | claude-sonnet-5-5 | 8 (8)            | 61,483       | 22,316        | ₹33     |
| EkBill purposes, the 10 that had failed   | claude-sonnet-5-5 | 1 (2)            | 20,588       | 1,349         | ₹5      |
| Self phrases, redrafted                   | claude-sonnet-5-5 | 1 (1)            | 4,965        | 2,059         | ₹3      |
| **Total before review**                   |                   | **10 (11)**      | **87,036**   | **25,724**    | **₹41** |

Independent reviewer (auditor vendor):

| Run         | Model       | Input tokens | Output tokens | Cost |
| ----------- | ----------- | ------------ | ------------- | ---- |
| 1 (54a9f3e) | gpt-6.1-sol | 58,824       | 1,369         | ₹12  |
| 2 (e05abd1) | gpt-6.1-sol | 62,388       | 1,211         | ₹13  |
| 3 (72a697b) | gpt-6.1-sol | 64,493       | 1,129         | ₹13  |
| 4 (5e07e88) | gpt-6.1-sol | 65,874       | 1,138         | ₹14  |

**Stage total so far: ₹93** (`pnpm cost 3`). Further review runs are added below.

## Open questions

1. **Walk the Showroom.** This is the week-3 checkpoint, and it is yours. Do the five traced figures, and the way an untraced amount is shown, read right to you? Anything that should be traced next, in place of or beside these five?
2. **Live data.** Should a later stage capture EkBill signed in against a seeded demo database, so traced values come from rows rather than fixtures? That needs a database the capture can start, with EkBill's own seed and no real books.
3. **Instrumenting EkBill.** Should the EkBill team follow HOUSE-STYLE §1–2 (`data-rama-figure` and `rama/figures.ts` in EkBill itself), so its trails no longer depend on a hand-written overlay? If yes, the five overlay entries are the first to move.
4. **`gpt-6.1-sol`'s price** is from third-party lists, because OpenAI's page refused automated access. Can you confirm it from the OpenAI console or an invoice, so the table can be marked as from the vendor?
