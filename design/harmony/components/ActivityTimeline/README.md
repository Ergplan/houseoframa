# ActivityTimeline

The trading log: a ruler-ticked rail with round event icons, each event followed by a nested glass card with who, what, block thumbnails and a time pill.

Markup: `.eg-timeline` > `.eg-tl-item` (an `eg-tl-item__icon`, a title and meta line, then an optional `.eg-tl-card`). Inside the card: `eg-tl-card__app` icon, `eg-tl-card__title`, `eg-tl-card__who` (avatars or a chip), and `eg-tl-card__body` with `eg-thumbs` and an `eg-chip--time`.

- Thumbnails are mini block profiles: `<div class="eg-thumb__bars" data-bars="…">` drawn with `ErgOS.miniBars(el, values)`.
- Newest first. One sentence per title, written as what happened ("DAM bid cleared for 13 Oct"), numbers in the meta line.
- Place it in the folder (`eg-on-folder`) when it is the screen's story, or on a glass card when it supports a chart.
