# Button

Pill buttons in four weights; the glowing **primary** is the one thing a screen exists to do.

- `eg-btn eg-btn--primary`: green glass with a dark core and a Harmony bloom. One per view ("Calculate savings", "Set up auto-trading"). Add `eg-btn--lg` for hero calls to action.
- `eg-btn` (default): frosted glass with a hairline. Secondary actions next to a primary ("Save to DB").
- `eg-btn--solid`: ink fill. Downloads and exports that leave the app ("Download bundle (.zip)").
- `eg-btn--accent`: flat accent fill with `on-accent` text. Confirmations inside dense tools ("Place bid").
- `eg-btn--ghost`: text only. Tertiary actions, toolbars, cancel.
- Sizes: `eg-btn--sm` (34px) in card headers, default 44px, `eg-btn--lg` (58px) for hero CTAs. `eg-btn--block` fills the row.

The consumer provides a `<button>` with an optional leading icon (`<span data-icon="bolt" data-size="16">`) and a verb-first label in sentence case. Do not stack two primaries side by side; do not put a primary on the folder card (it is already green).
