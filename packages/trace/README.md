# packages/trace

Screen capture of a target's built app, figure trails, and re-execution of the target's own functions (Stage 3). The convention a target follows is `docs/HOUSE-STYLE.md`.

```
rama-trace capture <site> [--no-build]   build, start (no secrets), photograph, re-execute → work/<site>/
rama-trace show <site>                    the Showroom as JSON: screens, figures, trails
```

- `config.ts`: the schemas of `.rama/screens.json`, `rama/figures.ts` (the convention) and `.rama/figures.json` (the overlay for a target not yet instrumented).
- `capture.ts`: `capture(site, blueprint, {outDir})`. Builds the app (when asked), starts it with PATH and HOME only, drives Playwright through the screens (full-page, viewport grown to the page), and records each screen's bricks (the route's import closure in the Blueprint). It finds every figure: `data-rama-figure`, the overlay's selectors, and untraced leaves matching the figure pattern. It then re-executes each traced figure and writes `capture.json` and `shots/<name>.png`. The in-page function lives in `page-figures.js`, sent to the page as text.
- `sandbox.ts`: runs the target's code in a separate Node process in its checkout (tsx's loader, the `react-server` condition, no environment beyond PATH, HOME and NODE_ENV). `sandbox-runner.mjs` is the child side.
- `trail.ts`: `buildTrail()`, plain code (Invariant 6). It produces the formula, inputs, data, build trail and sign-off (null until Stage 4), plus the shown-versus-computed check. A value that was not re-executed stays null.
- `showroom.ts`: `showroomOf(capture, blueprint)`. A figure is traced only when it has a mapping; everything else is untraced (Invariant 2). It also gives the honest rate: figures traced over figures shown.
