# Known gaps

Updated in the same commit as the code that opens or closes a gap.

- The weekend prototype hand-maps glossary phrases and figure trails; Stages 1–3 replace both with generated versions.
- The prototype audit was scripted by the builder's vendor; Stage 5 replaces it with a second-vendor auditor.
- EkBill has no `data-rama-figure` instrumentation; Stage 3 covers its five headline figures by overlay and marks the rest untraced.
- No city layout; a single building per site. Reconsider only when a site exceeds ~400 bricks.
- (Stage 0) The watcher's `blueprint self drift` check is reported as `skipped` (ok, with `skipped: true`) until Stage 1 brings `rama extract`.
- (Stage 0) `model_calls` records tokens, not money: no price table is in code, so cost in a stage report is given in tokens unless a price is stated by the vendor's invoice.
- (Stage 0) The `stack` compose profile (app and watcher in containers) is validated with `docker compose config` but has not been run end to end; `pnpm dev` is the tested path.
- (Stage 0) The Stage 0 e2e test runs on this repository's own app; there is no target repository in Stage 0.
