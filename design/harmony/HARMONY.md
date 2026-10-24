ergOS Harmony is the interface language of ergOS, Joulewise's energy management platform for industrial plants that buy power from the grid and the Indian Energy Exchange. It pairs a deep Blue Charcoal ground with one signature object, a green glass folder, and keeps everything else quiet so the numbers read first.

## Principles

- **One green object per screen.** The folder card (`folder`, `folder-hi`, `folder-deep`) holds the screen's headline: today's demand, net savings, the trading log. Everything around it is charcoal or frosted glass.
- **Every number has a time and a unit.** Energy in MWh or kWh, power in kW, prices in ₹ / kWh, always with the plant and the block or date it belongs to ("Block 89 · 22:15").
- **The day is 96 blocks.** Charts, heatmaps and tracks are built on 15-minute blocks. Say "Block 37", not "slot 36".
- **Quiet glass, one glow.** Glass (`glass`, `glass-strong`, `line`) separates; only the primary button, the live dot and the now-marker glow (`glow`).

## Content

- Sentence case for everything except plant names, which are shown exactly as stored (HALDIRAM C1).
- Verb-first buttons: "Calculate savings", "Save to DB", "Set up auto-trading".
- Plain operator language: "Demand dipped below the bid", "Not purchased", "7 blocks to go". No exclamation marks, no emoji.
- Indian number grouping for rupees and counts: ₹3,91,192.06 and 2,35,373 kWh. Use `ErgOS.inr()`; compact axes use k, L and Cr (`ErgOS.compact()`).
- Exchange terms as the desk says them: IEX, DAM, RTM, T+1, DISCOM, ToD, landed tariff, benchmark.

## Colour

- Dark is the primary theme: `canvas` (Blue Charcoal `#000B1A`) with two soft aurora glows (`.eg-stage`). Light swaps the ground to `canvas` `#EEF2EC` and white surfaces; the folder stays green in both.
- Text: `ink` on `canvas`, `surface`, `surface-2` and glass; `ink-muted` for labels, units and axes; `ink-faint` only for disabled text.
- Accent: `accent` for interactive text and icons and positive values, on `accent-soft` when tinted. Text on a solid accent fill is `on-accent`, never white.
- On the folder: `on-folder` for titles and values, `on-folder-muted` for secondary lines. Body text sits on the `folder` zone; only 24px+ titles sit on the lighter `folder-hi` corner.
- Status: `positive`, `negative`, `warning`, each with its `-soft` fill and always with a word or sign (▲, −, "Deviation").
- Chart series have fixed meanings: `series-iex` (power exchange, the hero), `series-grid` (DISCOM supply), `series-solar`, `series-wind`, `series-hydro`, `series-battery`, `series-gov`, and `series-demand` for the dotted demand line. A stat tile, its sparkline, its source chip and its chart band use the same series.
- Four colour schemes ship as tokens: **Harmony** (default, one hue per source), **Volt** (chartreuse and sage), **Verdant** (one green ramp) and **Aurora** (cool with a gold sun). Put `eg-pal-volt`, `eg-pal-verdant` or `eg-pal-aurora` on a container and every chart, swatch and chip inside switches. Components read `--c-<source>`, never the raw tokens.
- Harmony Green (`harmony`) is a light, glowing green. Never set text in it on a light ground; use `accent`.

## Type

- Urbanist for display and UI (Google Fonts, weights 300 to 700), JetBrains Mono for plant and meter codes.
- Big figures are light: `display-xl` (64px / 300) for the one hero number, `metric` (32px / 300) for tiles, `display` (44px / 300) for screen headlines with one word in `accent` ("Ready to plan **tomorrow**?").
- Running UI: `title` for card titles, `heading` for item names, `body`, `label` for buttons and tabs, `caption` for metadata and axes, `overline` (uppercase, 0.08em) sparingly over metrics, `code` for IDs.
- Numbers are tabular everywhere (`font-variant-numeric: tabular-nums` is set on `body`).

## Shape, depth and space

- Radii are generous: `radius-pill` for buttons, chips, segments and the dock; `radius-md` for tiles and plant cards; `radius-lg` for glass panels and nested cards; `radius-xl` for the folder.
- Glass is `glass` + `blur-glass` + a `line` hairline + `shadow-edge` (a 1px top light). Raised things add `shadow-float`; the primary button and selected plant add `shadow-glow`.
- Spacing steps of 4: `space-4` inside cards, `space-6` card padding and grid gutters, `space-10` between screen sections.
- Layout: a 264px sidebar, then a main column. Put the folder and its supporting tiles in the first row, a plant strip next, then charts.

## Charts

- Curves are monotone (they never overshoot the data). Areas fade from their top edge into the ground; each top edge is a 2px line with a soft glow. Demand is a dotted ink line; the future is hatched and labelled Forecast.
- Every chart has a cursor that rests on the latest block: value pills on top (dashed for the reference, solid in the source colour for the focus) and an outlined time pill at the bottom. Tick pills thin themselves to fit; they never overlap.
- `ErgOS.supplyChart` stacks sources; `ErgOS.trendChart` overlays actual against forecast; both run on `ErgOS.areaChart`. Arrow keys move the cursor.
- Production data charts come from the library in this repo, themed `harmony`: `EnergyFlowChart` (supply stack, ToD, cards, export), `PriceLandscape` (a year of prices as a heatmap, ₹0–₹10, charcoal → teal → volt) and `PriceProfile` (one day's DAM, RTM and GDAM against the marginal and spare variable cost, with buy and sell windows). Keep the heatmap domain fixed at ₹0–₹10 so plants and years compare.

## Voice

- Real talk runs through the VoiceBar: orb, captions, waveform, one mic button. States are idle, listening, thinking and speaking; captions are the transcript or the spoken answer, never a summary. Answers name blocks, kW and rupees, and end with what to do.

## Motion

- Hover lifts plant cards 2px and brightens glass; the live dot pulses every 2.2s. Nothing else moves. All of it stops under `prefers-reduced-motion`.

## Focus and contrast

- Keyboard focus is a 2px solid `focus-ring` with a 2px gap. Every text token meets 4.5:1 on the grounds named in its note, in both themes.

## Iconography

- Line icons on a 24px grid, 1.75 stroke, round caps and joins, drawn in `currentColor`: `ErgOS.icon(name, size)` or `<span data-icon="bolt" data-size="18">` (mounted automatically). The set is drawn for this system in the style of Lucide, which the current app already uses, so Lucide icons can fill gaps.
- Energy meanings are fixed: `solar` (panel and sun), `wind` (turbine), `hydro` (drop over water), `exchange` (two-way arrows, IEX), `grid` (pylon), `battery`, `bolt` = demand or power, `gauge` = peak, `rupee` = price, `factory` = plant. `apps` is the dashboard glyph; `mic`, `sparkle`, `keyboard` and `stop` belong to the voice bar.

## Logo

- The jouleWise wordmark is drawn in Harmony glass: Urbanist letters with the “o” as a glass orb. Use `assets/logo/joulewise-dark.svg` on dark grounds and `joulewise-light.svg` on light grounds; the orb (`joulewise-mark.svg`) and the app icon below 120 px.
- The classic 2D glass version (`joulewise-classic-glass*.svg`) keeps the original gold `#CEAB0E` and brown `#4D3C00` for documents, partner decks and print.
- The product name inside the app stays type: `.eg-wordmark`, “erg” in `ink` and “OS” in `accent`.
- Rules and every file: `assets/logo/README.md`.

## Building with it

- Load `tokens.css`, `components/bundle.css` and `components/bundle.js`. No framework is needed; components are HTML with `eg-` classes, and `window.ErgOS` draws the charts and cuts the folder shape.
- Set `data-theme="dark"` or `"light"` on `<html>`. Charts colour themselves from tokens and need no redraw on theme change.
- Charts: `ErgOS.supplyChart`, `ErgOS.trendChart`, `ErgOS.areaChart`, `ErgOS.savingsChart`, `ErgOS.heatmap`, `ErgOS.ring`, `ErgOS.sparkline`, `ErgOS.miniBars`; colour schemes with `ErgOS.palette(el, name)`; voice with `ErgOS.voiceBar(el, opts)`. Signatures are in `components/index.d.ts`; each component's guidelines show usage.
- `ErgOS.sample` holds the example data used in the previews (HALDIRAM C1, 13 Oct 2026 with an illustrative solar, wind and hydro mix, and the 1 to 13 Oct savings run). It is illustrative, not live data.

## Not synced

- Synced from `Ergplan/designsystem` at `d00bc9a` (main). Brought in: `tokens/tokens.json` whole, `harmony.css` → `components/bundle.css`, `harmony.js` → `components/bundle.js`, `harmony.d.ts` → `components/index.d.ts`, `dist/energy-flow-chart.min.js` v1.3.0 → `components/lib/`, all 31 `components/<Name>/` previews and guidelines verbatim (the repository's own documents; no build was run), the eight logo SVGs and `docs/HARMONY.md` as the Developer guide section.
- Not brought in: `tokens/tokens.css` and `tokens.js` (generated; this page compiles its own `tokens.css` from `tokens.json`), `gallery/` (generated standalone pages), `tools/`, `test/` and `package.json`.
- Fonts: Urbanist and JetBrains Mono load from Google Fonts in the repository, so there are no font files; `type.fonts` is empty by design.
