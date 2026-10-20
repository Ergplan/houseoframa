# Known gaps

Updated in the same commit as the code that opens or closes a gap.

- The weekend prototype hand-maps glossary phrases and figure trails; Stages 1–3 replace both with generated versions.
- The prototype audit was scripted by the builder's vendor; Stage 5 replaces it with a second-vendor auditor.
- EkBill has no `data-rama-figure` instrumentation; Stage 3 covers its five headline figures by overlay and marks the rest untraced.
- No city layout; a single building per site. Reconsider only when a site exceeds ~400 bricks.
- (Stage 0) `model_calls` records tokens, not money: no price table is in code, so cost in a stage report is given in tokens unless a price is stated by the vendor's invoice.
- (Stage 0) The `stack` compose profile (app and watcher in containers) is validated with `docker compose config` but has not been run end to end; `pnpm dev` is the tested path.
- (Stage 0) The Stage 0 e2e test runs on this repository's own app; there is no target repository in Stage 0.
- (Stage 1) EkBill places 801 of its 916 files by the fallback rule: its code lives in `packages/*/src`, `apps/web/screens`, `design/` and `tests/`, which the house-stack defaults do not name. It needs its own `.rama/layers.json`; the reference clone is read-only, so that waits for its working clone under `work/` (Stage 2).
- (Stage 1) EkBill's remote needs credentials, so CI cannot clone it: its extraction is exercised on this machine only. Procurement Studio (public) is the golden target in CI.
- (Stage 1) Imports are read from JS/TS sources only: CSS `@import`, MDX imports and `import()` with a computed path are not edges. A computed `process.env[x]` is flagged `envDynamic` rather than named.
- (Stage 1) A brick's history is its current path only: commits made under a previous name (before a rename) are not counted in `changes` or `firstCommit`.
- (Stage 1) `BrickNode.purpose` is not filled yet: no purpose overlay is read and none is drafted (Stage 2 brings the brick inspector).
