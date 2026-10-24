# ergOS Harmony: developer guide

This repo now holds two things the ergOS front end needs:

1. **The charting library** (`src/`, published as `energy-flow-chart` until the rename to **ergOSUI**): the supply chart with KPI cards, and two new price charts, the **Price landscape** heatmap and the **Price profile**.
2. **The ergOS Harmony design system** (`design-system/`): tokens, the `eg-` CSS component kit, the `window.ErgOS` runtime, component guidelines and the redesigned Today, Savings and mobile screens.

Both share one visual language: Blue Charcoal ground (`#000B1A`), Harmony Green (`#68E78E`) as the one accent, green glass for the screen's headline, Urbanist type, and charts with smooth bands that fade from a glowing top edge.

Read the brand book first: [`design-system/README.md`](README.md). It says which token goes where and how ergOS writes copy.

---

## Contents

1. [Run it locally](#1-run-it-locally)
2. [What is where](#2-what-is-where)
3. [Add Harmony to an ergOS page](#3-add-harmony-to-an-ergos-page)
4. [Tokens](#4-tokens)
5. [Components](#5-components)
6. [Charts](#6-charts)
7. [Price landscape and price profile](#7-price-landscape-and-price-profile)
8. [Voice bar (AI real talk)](#8-voice-bar-ai-real-talk)
9. [React and Next.js](#9-react-and-nextjs)
10. [Rules the team agrees on](#10-rules-the-team-agrees-on)
11. [Changing the design system](#11-changing-the-design-system)
12. [Releasing, and the rename to ergOSUI](#12-releasing-and-the-rename-to-ergosui)

---

## 1. Run it locally

```bash
npm ci
npm run build        # library bundles (dist/) + design-system outputs (tokens.css, tokens.js, gallery/)
npm run demo         # http://localhost:5178
```

| URL | What you see |
| --- | --- |
| `/demo/harmony.html` | The production charts in the Harmony theme with real export data, the price explorer and the voice bar. Scheme and theme switches at the top |
| `/design-system/gallery/` | Every design-system component and screen, live, in one page. Each card opens on its own |
| `/demo/` | The original chart demo (all themes) |
| `/test/browser/` | The browser test suite |

**Next.js demo app** (`apps/ergos-demo`): the redesigned screens as a clickable app (Today, Savings, Prices, Actual vs forecast, Real talk, Mobile, Brand, Design system).

```bash
npm run demo:next     # installs apps/ergos-demo and starts it on http://localhost:3000
```

It is the reference for wiring Harmony into a React/Next.js codebase: see section 9 and `apps/ergos-demo/README.md`.

Tests: `npm test` (node, 57 tests) and `npm run test:browser` (headless Chrome, 62 tests). Run both before every pull request.

## 2. What is where

```
src/                       charting library (zero dependencies)
  chart.js                 EnergyFlowChart: supply stack, ToD view, readout band, toolbar, export
  cards.js                 EnergyCards: linked KPI cards
  themes.js                themes, incl. the Harmony family: harmony · volt · verdant · aurora
  curves.js                monotone (smooth, no overshoot) and step paths
  prices.js                price matrix, trade windows, colour maps, sample year
  heatmap.js               PriceLandscape (canvas heatmap)
  priceprofile.js          PriceProfile + createPriceExplorer
  styles.js                component CSS, incl. the Harmony skin
design-system/
  tokens/tokens.json       source of truth for every design token
  tokens/tokens.css|.js    generated: never edit by hand
  harmony.css              eg- component classes
  harmony.js               window.ErgOS runtime
  harmony.d.ts             its types
  components/<Name>/       preview.html + README.md for each component and screen
  gallery/                 generated standalone pages
design-system/assets/logo/ jouleWise logo files (glass, classic 2D glass, mark, app icon, mono)
apps/ergos-demo/           Next.js demo app: every redesigned screen, clickable
docs/HARMONY.md            this guide
demo/harmony.html          the showcase page
tools/logo/                logo generator
tools/build-design-system.mjs   builds tokens.css, tokens.js and gallery/
```

## 3. Add Harmony to an ergOS page

Four tags. Order matters: tokens first, then the kit.

```html
<html lang="en" data-theme="dark">           <!-- "light" for the light theme -->
<head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="/vendor/ergos/design-system/tokens/tokens.css">
  <link rel="stylesheet" href="/vendor/ergos/design-system/harmony.css">
</head>
<body class="eg-stage">                        <!-- the aurora ground glass sits on -->
  …
  <script src="/vendor/ergos/dist/energy-flow-chart.min.js"></script>   <!-- window.EnergyFlow: production charts -->
  <script src="/vendor/ergos/design-system/harmony.js"></script>         <!-- window.ErgOS: icons, folder, voice, light charts -->
</body>
```

From npm instead:

```js
import 'energy-flow-chart/tokens.css';
import 'energy-flow-chart/harmony.css';
import { tokens } from 'energy-flow-chart/tokens';            // values in JS
import { mount, createPriceExplorer } from 'energy-flow-chart';
```

Switching theme is one attribute: `document.documentElement.dataset.theme = 'light'`. Charts mounted with `mode: 'auto'` follow it.

## 4. Tokens

Use the CSS variables, never hex values. `tokens.json` is the only place a colour is defined.

| Need | Token |
| --- | --- |
| Page ground | `--canvas` |
| Card, sidebar | `--surface`; inset wells `--surface-2` |
| Glass panel | `--glass` + `backdrop-filter: var(--blur-glass)` + `border: 1px solid var(--line)` + `box-shadow: var(--shadow-edge)` |
| Text | `--ink`; labels and units `--ink-muted` |
| Interactive green as text | `--accent` (never `--harmony` on a light ground) |
| Text on a solid accent fill | `--on-accent` |
| The green folder card | `--folder-hi`, `--folder`, `--folder-deep`; text `--on-folder`, `--on-folder-muted` |
| Status | `--positive`, `--negative`, `--warning` (+ `-soft` fills); always with a word or sign |
| Chart sources | `--c-solar`, `--c-wind`, `--c-hydro`, `--c-iex`, `--c-grid`, `--c-battery`, `--c-gov`, `--c-demand` |
| Spacing | `--space-1` … `--space-14` (4px steps) |
| Radius | `--radius-xs` 8 · `--radius-sm` 14 · `--radius-md` 20 · `--radius-lg` 28 · `--radius-xl` 36 · `--radius-pill` |
| Type | `--font-display`, `--font-sans`, `--font-mono`; or classes `eg-type-display-xl`, `eg-type-metric`, `eg-type-title`, `eg-type-body`, `eg-type-label`, `eg-type-caption`, `eg-type-overline`, `eg-type-code` |

**Colour schemes.** Components read `--c-<source>`, which default to the Harmony series tokens. Add `eg-pal-volt`, `eg-pal-verdant` or `eg-pal-aurora` to any container and every chart, swatch, chip and tile inside it switches. In JS: `ErgOS.palette(el, 'volt')`. For the library charts pass the theme name: `chart.setTheme('volt')`.

## 5. Components

Every component is plain HTML with `eg-` classes. Copy the markup from `design-system/components/<Name>/preview.html`; its `README.md` lists the variants and the do's and don'ts. Highlights:

| Component | Classes | Notes |
| --- | --- | --- |
| Button | `eg-btn` `--primary` `--accent` `--solid` `--ghost` `--sm` `--lg` `--block` | One glowing primary per view |
| Icon button | `eg-icon-btn` `--sm` `--xs` `--solid` `--accent` | Always an `aria-label` |
| Segmented control | `eg-seg` (`--sm`, `--glass`) with `button[aria-pressed]` | Views of the same data only |
| Range pills | `eg-pills` | All / Day / Week / Month |
| Chip | `eg-chip` `--accent` `--negative` `--warning` `--mono` `--time` `--solid` | State carries a word, not only a colour |
| Stat tile | `eg-stat[data-series]` | 4–6 in a grid, sparkline via `ErgOS.sparkline` |
| Folder card | `eg-folder` › `__back` `__sheets` `__front` | One per screen. `ErgOS.mount()` cuts the folder shape |
| Plant card | `eg-plant` `.is-selected` | Exactly one selected |
| Progress track | `eg-track` with `--value` | Block of the day, IEX window, landed vs benchmark |
| Activity timeline | `eg-timeline` › `eg-tl-item` › `eg-tl-card` | Trading log |
| Energy sources | `eg-source`, `eg-srcchip` | Icon + colour per source |
| Readout strip | `eg-readout` | Values at the chart cursor |
| Voice bar | `eg-voice[data-state]` | See section 8 |
| Sidebar, top bar, dock | `eg-side`, `eg-topbar`, `eg-dock` | Dock on phones, sidebar on desktop |

Icons: `ErgOS.icon(name, size)` returns an SVG string, or write `<span data-icon="solar" data-size="18"></span>` and `ErgOS.mount()` fills it. Energy icons are fixed: `solar`, `wind`, `hydro`, `exchange` (power exchange), `grid` (pylon), `battery`, `bolt` (demand), `gauge` (peak), `rupee`, `factory` (plant). `ErgOS.icons` lists them all.

Numbers: `ErgOS.inr(391192.06, 2)` → `3,91,192.06` (Indian grouping). Use it for every rupee and every large count.

## 6. Charts

Two layers, one look:

| Use | Library | Why |
| --- | --- | --- |
| Real plant data (Today, T+1, Actual vs Forecast, Savings) | `EnergyFlowChart` from this repo, `theme: 'harmony'` | Data adapters, ToD view, linked cards, pinned crosshair, CSV and PNG export, live updates, tests |
| Prototypes, marketing pages, small embedded charts | `ErgOS.supplyChart`, `trendChart`, `savingsChart`, `heatmap`, `ring`, `sparkline` | No setup, takes plain arrays |

Production supply chart in Harmony:

```js
const board = await EnergyFlow.mount('#chart', {
  url: '/api/plants/N2UP0AEV0003/energy?day=2026-10-13',
  cards: '#cards',
  theme: 'harmony',          // or volt · verdant · aurora
  mode: 'auto',              // follows <html data-theme>
  live: { series: 'demand' },
});
```

What `theme: 'harmony'` changes: the Harmony skin (pill toolbar, glass readout band, Urbanist, glass cards without the side bar), smooth monotone curves, bands that fade from their top edge, a glowing 2px line on each band's top, a dotted demand line, Harmony Green live dot and outlined time pill. Override any of it per chart: `curve: 'linear' | 'smooth' | 'step'`, `fill: 'solid' | 'gradient'`, `glow: false`.

Sources and roles. Give each series a `role` and it gets its Harmony colour:

```js
series: [
  { key: 'hydro', label: 'Hydro', role: 'hydro' },
  { key: 'wind', label: 'Wind', role: 'wind' },
  { key: 'solar', label: 'Solar', role: 'solar' },
  { key: 'market', label: 'Power exchange', role: 'market' },
  { key: 'grid', label: 'Grid', role: 'grid' },
  { key: 'demand', label: 'Demand', role: 'demand', type: 'line' },
]
```

Stack order is declaration order, bottom to top: steady sources first (hydro, wind), then solar, power exchange, and grid on top as the balancing source. Card icons for these: `solar`, `wind`, `hydro`, `exchange`, `pylon`.

Your own theme on top of Harmony:

```js
EnergyFlow.registerTheme({ name: 'ergos-print', extends: 'harmony', chart: { glow: false }, light: { accent: '#0b5d2c' } });
```

## 7. Price landscape and price profile

Data: one row per day and block from the exchange or SLDC feed.

```js
const prices = EnergyFlow.fromPriceRows(rows, {
  dateKey: 'Date', blockKey: 'Block',            // Block 1 = 00:00–00:15
  columns: { dam: 'DAM', rtm: 'RTM', gdam: 'GDAM', marginalVC: 'Marginal state VC', spareVC: 'Cheapest spare VC' },
  unit: 'auto',                                  // IEX ₹/MWh is converted to ₹/kWh automatically
});
```

Both charts linked (click a day in the heatmap to see its profile):

```js
const { landscape, profile } = EnergyFlow.createPriceExplorer({
  landscape: '#price-landscape', profile: '#price-profile', data: prices, day: '2026-07-04', theme: 'harmony',
});
```

Or on their own:

```js
new EnergyFlow.PriceLandscape(el, { data: prices, market: 'dam', domain: [0, 10], onSelect: (day) => … });
new EnergyFlow.PriceProfile(el, { data: prices, day: '2026-07-04', windows: 'auto' });
```

- **Landscape:** columns are days, rows are blocks (00:00 at the top), colour ₹0–₹10. Colour maps: `landscape` (default), `harmony`, `volt`, `verdant`, or a stop list. Hover for the price, click or Enter to select, arrow keys to move.
- **Profile:** DAM bold and glowing, RTM and GDAM thin, marginal state VC dashed, cheapest spare VC dotted. Legend chips toggle series; ‹ › or PageUp/PageDown step days.
- **Buy and sell windows.** `windows: 'auto'` shades **buy** where the exchange clears below the marginal state VC and **sell** where it clears above the cheapest spare VC (no window where no marginal unit is dispatchable). If the trading engine decides windows, pass them instead: `windows: [{ type: 'buy', from: 0, to: 24 }, …]` (block indexes, `to` exclusive), or a function `(prices, day) => windows`.
- `EnergyFlow.samplePriceYear()` is **illustrative** data for demos and tests only.

## 8. Voice bar (AI real talk)

The bar renders the conversation; your app supplies speech.

```html
<div class="eg-voice" data-state="idle" id="voice">
  <span class="eg-voice__orb"><i></i></span>
  <div class="eg-voice__body"><div class="eg-voice__text" aria-live="polite">Ask anything</div><div class="eg-voice__wave"><canvas></canvas></div></div>
  <span class="eg-voice__timer">0:00</span>
  <button class="eg-icon-btn eg-icon-btn--sm" data-voice="keyboard" aria-label="Type instead"><span data-icon="keyboard"></span></button>
  <button class="eg-voice__mic" data-voice="mic" aria-label="Start talking"><span class="i-mic" data-icon="mic" data-size="20"></span><span class="i-stop" data-icon="stop" data-size="18"></span><span class="i-spin"></span></button>
</div>
```

```js
const voice = ErgOS.voiceBar(document.getElementById('voice'), {
  live: true,                                   // waveform follows the real microphone level
  onMic: async (state, v) => {
    if (state !== 'idle') { stt.stop(); tts.cancel(); v.setState('idle'); return; }
    v.setState('listening', '');
    const question = await stt.listen({ onPartial: (t) => v.setText(t) });   // your speech-to-text
    v.setState('thinking', 'Reading blocks…');
    const answer = await ergos.ask(question, { plant: 'N2UP0AEV0003' });       // your assistant API
    v.setState('speaking', '');
    await tts.speak(answer, { onWord: (soFar) => v.setText(soFar) });         // your text-to-speech
    v.setState('idle');
  },
  onKeyboard: () => document.querySelector('.eg-ask textarea').focus(),
});
```

- States: `idle` → `listening` → `thinking` → `speaking` → `idle`. The orb, waveform, button and caption style follow `data-state`.
- In a browser prototype the Web Speech API works for both halves (`SpeechRecognition`, `speechSynthesis`); production should use the ergOS speech service.
- Captions are the transcript or the spoken answer, word for word. Answers name blocks, kW and rupees and end with what to do.
- Without `onMic` the bar plays a scripted demo, which is what the gallery shows.

## 9. React and Next.js

The library already ships React bindings (`energy-flow-chart/react`). The design system is CSS classes plus a runtime, so in React:

```jsx
// app/layout.tsx
import 'energy-flow-chart/tokens.css';
import 'energy-flow-chart/harmony.css';

export default function RootLayout({ children }) {
  return <html lang="en" data-theme="dark"><body className="eg-stage">{children}</body></html>;
}
```

```jsx
// a client component
'use client';
import { useEffect, useRef } from 'react';
import { createPriceExplorer } from 'energy-flow-chart';

export function PriceExplorer({ prices }) {
  const a = useRef(null), b = useRef(null);
  useEffect(() => {
    const ex = createPriceExplorer({ landscape: a.current, profile: b.current, data: prices, theme: 'harmony' });
    return () => ex.destroy();
  }, [prices]);
  return <><div ref={a} /><div ref={b} /></>;
}
```

For `window.ErgOS` (folder shape, icons, voice bar) load `design-system/harmony.js` once with `next/script` (`strategy="afterInteractive"`) and call `ErgOS.mount(node)` after rendering markup that uses `data-icon` or `eg-folder`. Types: reference `energy-flow-chart/design-system/harmony.d.ts`.

A complete, typed example is the demo app: `apps/ergos-demo/components/ui.tsx` (Button, Chip, Seg, StatTile, PlantCard, Track, ErgosChart), `components/blocks.tsx` (Folder, Timeline, VoiceBar), `components/Shell.tsx` (sidebar, top bar, theme switch, mobile dock) and `lib/ergos.ts` (loads `harmony.js` on the client only). Copy them into ergOS as the starting point.

Wrap repeated markup in your own small components (`<Button variant="primary">`, `<Chip tone="accent">`) that only output the `eg-` classes, so the design system stays the single source of styling.

### Logo

The jouleWise logo files are in `design-system/assets/logo/` (also exported as `energy-flow-chart/design-system/assets/logo/*`). Use `joulewise-dark.svg` on dark grounds and `joulewise-light.svg` on light grounds; swap them with the theme (`components/Logo.tsx` in the demo does this in CSS). The classic 2D glass in the original gold is for documents and print. Rules: `design-system/assets/logo/README.md`.

## 10. Rules the team agrees on

- **Tokens only.** No hex, rgb or font names in feature code. A missing colour is a token request (section 11).
- **One green object per screen** (the folder card) and **one primary button per view**.
- **Every number has a unit and a time**: MWh / kWh / kW / ₹ per kWh, plus the plant and the block or date.
- **Blocks, not slots.** Block 1 is 00:00–00:15; show block end times in readouts (Block 89 · 22:15).
- **Indian grouping** for rupees and large counts (`ErgOS.inr`).
- **State is never colour alone**: chips carry a word or sign; charts carry a legend and a readout.
- **Contrast**: text 4.5:1 in both themes (the tokens already pass; don't put `--ink-muted` on `--folder`).
- **Keyboard**: every chart is focusable and readable with the arrow keys; keep it that way.
- **Copy**: sentence case, verb-first buttons, no exclamation marks, no emoji. Plant names as stored.

## 11. Changing the design system

1. Edit `design-system/tokens/tokens.json` (or the component CSS / runtime / preview).
2. `npm run build:ds` regenerates `tokens.css`, `tokens.js` and the gallery.
3. Check the gallery in **both** themes (`/design-system/gallery/`, Switch theme).
4. `npm test` checks every colour token has both themes and a usage note.
5. Update the component's `README.md` when behaviour or variants change.

The same files are published to the **ergOS Harmony** design-system artifact on claude.ai (tokens, `harmony.css` as `components/bundle.css`, `harmony.js` as `components/bundle.js`, the `components/` folders as they are, and `dist/energy-flow-chart.min.js` as `components/lib/`). Keep the two in step when you release.

Adding a component: create `design-system/components/<Name>/preview.html` (first line `<!-- @dsCard group="…" height=N -->`, then a small document using only `eg-` classes and `ErgOS`/`EnergyFlow`) and a `README.md` whose first sentence says what it is for. Run `npm run build:ds`.

## 12. Releasing, and the rename to ergOSUI

Versioning is semver; this release is **1.3.0** (additive: existing themes and APIs are unchanged, the classic `energy` theme is still the default).

Release checklist:

1. `npm run build` and `npm test && npm run test:browser`.
2. Update `CHANGELOG.md` and the version in `package.json`.
3. Commit `dist/` and the generated `design-system/` files (consumers use them without a build).
4. Tag `vX.Y.Z` and push the tag; the CDN URL is `https://cdn.jsdelivr.net/gh/Ergplan/charting@vX.Y.Z/dist/energy-flow-chart.min.js`.

**Renaming the repo to ergOSUI.** GitHub keeps redirects from the old name, so nothing breaks on the day. Then:

1. Rename on GitHub: Settings → General → Repository name → `ergOSUI`.
2. Update remotes: `git remote set-url origin git@github.com:Ergplan/ergOSUI.git`.
3. In `package.json` change `repository.url` to `git+ssh://git@github.com/Ergplan/ergOSUI.git`. Decide the package name (suggested `@ergplan/ergos-ui`) and publish under it; keep `energy-flow-chart` as a deprecated alias for one release.
4. Replace `Ergplan/charting` in README CDN links and in the demo pages.
5. The globals `window.EnergyFlow` and `window.ErgOS` and every `efc-`/`eg-` class stay as they are, so ergOS screens need no code change.
