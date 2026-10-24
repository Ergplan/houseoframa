# FolderCard

The signature surface of ergOS: a green glass folder with a raised tab, an S-curved shoulder and frosted sheets tucked behind it. One per screen, for the screen's headline number.

Structure (all four parts, in this order):

```html
<div class="eg-folder">
  <div class="eg-folder__back"></div>
  <div class="eg-folder__sheets"><div class="eg-sheet">…</div> ×3</div>
  <div class="eg-folder__front">
    <div class="eg-folder__head"><h2 class="eg-folder__title">Savings</h2><p class="eg-folder__sub">…</p></div>
    …content…
  </div>
</div>
```

- `ErgOS.mount()` (runs on load) cuts the front into the folder shape with `clip-path` and draws its light edge; it re-cuts on resize. Without the script the front falls back to a plain `radius-xl` card.
- Tune the shape with CSS variables on the front: `--folder-dip` (default 60px, the drop from tab to shoulder) and `--folder-tab` (default 0.42, tab width as a share of the card).
- Keep the first row of content inside `eg-folder__head` (it is limited to the tab width), so nothing sits in the clipped shoulder.
- Sheets carry three short facts behind the headline (kicker, label, bold value). They are decorative and hidden from assistive tech; repeat anything important in the front.
- Text on the folder is `on-folder` and `on-folder-muted`. Chips, tracks, timelines and rings switch to their on-folder treatment automatically inside `.eg-folder`.
