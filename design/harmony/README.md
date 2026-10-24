# ergOS Harmony in House of Rama

Synced 24 Oct 2026 from the Design System artifact (itself synced from `Ergplan/designsystem` at `d00bc9a`, v1.3.0). `tokens.json`, `HARMONY.md` (the brand book), `developer-guide.md`, the component bundle (`components/bundle.css|js`, `index.d.ts`) and the guidelines of the components House of Rama uses are copied verbatim. Fonts load from Google Fonts (Urbanist, JetBrains Mono). The full set of 30 components and the logo files stay in the source repository; clone it read-only into `reference/designsystem` when a component is missing here.

## How Harmony maps to House of Rama

Harmony is the interface language; the lakefront is drawn with its tokens and nothing else. One green object per screen is the rule that keeps the TV calm.

| House of Rama object                                               | Harmony treatment                                                                                                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The TV ground (lake, night sky, the ground the buildings stand on) | `canvas` (Blue Charcoal) with the two aurora glows (`.eg-stage`); the lake is `surface-2` with a `glass` sheen; the ground plots (tables) are `surface` with a `line` hairline, lit `accent-soft` when touched |
| A building (transparent)                                           | `glass` walls with `line` edges and `shadow-edge`; bricks inside in `ink-muted`, laid bricks `ink`; the facade is the real screenshot behind `glass-strong`                                                    |
| The one green object                                               | The selected building, or the trail panel when a figure is open: the `folder` card (`folder-hi` / `folder` / `folder-deep`, text `on-folder`). Never two at once                                               |
| Flags (Invariant 11)                                               | Verified `positive` with the word; Confirmed `accent` with the word and the name; Unverified `ink-muted` with the word. Always the word, never colour alone                                                    |
| Defect / note from the audit                                       | `negative` / `warning` with their `-soft` fills, with a sentence                                                                                                                                               |
| Roads (one building using another)                                 | `line-strong`, dotted when the import is type-only                                                                                                                                                             |
| Jetties (outside services)                                         | `series-grid` strokes across the water                                                                                                                                                                         |
| Cranes, the JCB, drones                                            | `harmony` green for the active crane and the drones' beam (the one glow, `glow`); idle cranes `ink-faint`                                                                                                      |
| Lifts on the timeline, the live chip                               | TopBar's live chip pattern: "Lift 14 · 02:10"; the track is `ProgressTrack`                                                                                                                                    |
| Figures on a facade                                                | `StatTile` for the headline figure; hotspots `accent` outline (traced) or `line-strong` dashed (untraced)                                                                                                      |
| The voice                                                          | `VoiceBar` as shipped: idle / listening / thinking / speaking; captions are the transcript or the builder's line, never a summary                                                                              |
| Trainer console                                                    | `Sidebar` (264px) with the five-act buttons as `eg-btn` (one `--primary` at a time: the act that is possible now), chips for key lights                                                                        |
| Decision cards, signatures, audit log                              | `ActivityTimeline`, newest first, one sentence per card, the person's name in the meta line                                                                                                                    |
| Numbers                                                            | `metric` for figures, tabular everywhere; Indian grouping via `ErgOS.inr()`; every number with its unit and what it counts                                                                                     |
| Type                                                               | Urbanist for everything a person reads; JetBrains Mono only at the Brick level (file paths, code)                                                                                                              |

## Rules carried over from Harmony

- Sentence case; verb-first buttons; no exclamation marks, no emoji.
- One primary button per view. Never a primary on the folder.
- Dark is the primary theme; light must read equally (every token meets 4.5:1 on the grounds named in its note).
- Motion: hover lifts 2px, the live dot pulses, drones and cranes move; nothing else. All stops under `prefers-reduced-motion`.
- Keyboard focus is the 2px `focus-ring` with a 2px gap.
