# The film — the designed reference for Stage 13

This folder is the specification of how House of Rama looks and behaves for a customer who sits alone with the voice. Stage 13 (`docs/MASTER-PROMPT.md`) makes the live app match it; `tests/stage-13.look.test.ts` compares the app's screens with the frames here.

Words failed for eleven stages: every stage prompt described behaviour and a reviewer checked code, and the result was the minimum geometry that passed. From here the look is a picture. Where this folder and a paragraph disagree, this folder wins.

## What is here

- `index.html` — a playable prototype of the whole film for the sample product **Read my bill**: the arena, the plan, the film (a step built by a named agent typing real code, its own words as narration, a card for every file, the building growing in sync, the ground filling), the grey flag, ask the code, the walk through. Open it in a browser; the scene dock at the top switches frames; `#film` plays the build. Keys: ← → turn, + − zoom.
- `frames/*.png` — one frame per scene at 1920×1080, captured from `index.html` by `capture.cjs`. These are the comparison targets.
- `capture.cjs` — regenerates the frames (needs Playwright; in CI the watcher's Playwright is used).

Everything is drawn with ergOS Harmony tokens only (`design/harmony/tokens.json`): Blue Charcoal ground, glass panels, one green object per screen (the lit action or the file card), Urbanist for words, JetBrains Mono for code.

## What each frame specifies

| Frame | What must match |
| --- | --- |
| `arena.png` | One sentence and a microphone in the centre; the voice greets the person by name; the dropped file as a chip; one lit button (Make it); the brains in one plain sentence, not a form. |
| `plan.png` | Numbered steps in plain words, each naming its building, appearing one by one as the voice reads them; the Street beside them as empty glass buildings with their names and empty plots; "Yes, build it" lit. |
| `film.png` | The step strip (done ✓ / now lit / to come); the lakefront filling the width; glass buildings with four floors and bricks laid inside as files are written, the one being written glowing; plots in the ground lighting up with a row count when a table is first written; the jetty across the water; the named agent standing at the building it works on; the code typing in on the right with line numbers; the file card (green folder) when a file is born; the Parts shelf with every file explained and marked unconfirmed; the Builder's own words as subtitles and in the voice bar; Pause / Slower / Faster / Next step / Replay / Catch up; the four agents with their vendors. |
| `flag.png` | The film paused on a grey flag: what happened, what the Builder will do next, who has been called and when; three actions with Wait lit; the step strip marks step 6 grey. |
| `ask.png` | The file on the left with the cited lines highlighted; the conversation on the right, the customer's question and the code's answer "from its own lines" with line chips; the third answer says "The code does not say". |
| `walk.png` | The real screen photographed, each figure with a traced chip and its one-line origin; the signatures as a list, two signed with their seals, the third with one lit "Yes, I agree"; what happens next in plain words. |

## Tolerance

Compare at 1920×1080 after fonts load. A frame passes when the layout regions (step strip, lakefront, code pane, shelf, subtitles, controls, voice bar) are in the same places within 24 px and the perceptual difference inside each region is below 12 % (SSIM over the region above 0.80). Text content differs by product and is excluded by masking the live text nodes; the structure, the colours, the proportions and the presence of every element listed above are what must match. A screenshot that passes the comparison but lacks one listed element fails the stage.

## What the prototype does not decide

- The exact narration: in the app it is the builder's own stream, so the words differ every build.
- The exact lakefront layout: `packages/stage` lays buildings out from the plan; the prototype's positions are an example.
- Timing beyond the pace floor (never faster than a line can be read).
