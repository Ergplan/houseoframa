# StatTile

A glass KPI tile: label and series icon, date, one value with its unit, a 7-day sparkline and a footnote.

Markup: `<div class="eg-stat" data-series="iex|grid|solar|battery|gov|demand">` with `eg-stat__top` (label + `eg-stat__icon`), `eg-stat__date`, `eg-stat__value` (number then `<span class="eg-stat__unit">`), an optional `<div class="eg-stat__spark" data-spark="…">` drawn by `ErgOS.sparkline(el, values, {series})`, and `eg-stat__foot`.

- `data-series` tints the icon and sparkline with the matching chart series so a tile and its chart layer read as one thing.
- Values use the `metric` style (32px, light). Units are always written: MWh, kWh, kW, ₹ / kWh.
- Format rupees and big counts with `ErgOS.inr()` (Indian grouping: 2,35,373).
- Put tiles in a grid of 4 to 6; never one alone in a row. Add `eg-stat--hero` for a single larger figure.
