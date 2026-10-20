# Known gaps

Updated in the same commit as the code that opens or closes a gap.

- The weekend prototype hand-maps glossary phrases and figure trails; Stages 1–3 replace both with generated versions.
- The prototype audit was scripted by the builder's vendor; Stage 5 replaces it with a second-vendor auditor.
- EkBill has no `data-rama-figure` instrumentation; Stage 3 covers its five headline figures by overlay and marks the rest untraced.
- No city layout; a single building per site. EkBill (916 bricks) fits in one building about 1,500 scene pixels wide; at fit-to-screen its bricks are about half size, so `Zoom 1:1` or the brick finder is the way to reach a small one.
- (Stage 0) `model_calls` records tokens, not money: no price table is in code, so cost in a stage report is given in tokens unless a price is stated by the vendor's invoice.
- (Stage 0) The `stack` compose profile (app and watcher in containers) is validated with `docker compose config` but has not been run end to end; `pnpm dev` is the tested path.
- (Stage 0) The Stage 0 e2e test runs on this repository's own app; there is no target repository in Stage 0.
- (Stage 1) EkBill's remote needs credentials, so CI cannot clone it: its extraction is exercised on this machine only. Procurement Studio (public) is the golden target in CI.
- (Stage 1) Imports are read from JS/TS sources only: CSS `@import`, MDX imports and `import()` with a computed path are not edges. A computed `process.env[x]` is flagged `envDynamic` rather than named.
- (Stage 1) A brick's history is its current path only: commits made under a previous name (before a rename) are not counted in `changes` or `firstCommit`.
- (Stage 2) EkBill's `.rama/` (layers, confirmed 2026-10-20 by Rachit Agarwal; glossary; purposes) lives only in the working clone `work/ekbill/repo`. **When the Stage 4 gate lands, the EkBill team commits `.rama/` into EkBill** so its CI and every fresh clone see it. Until then a fresh `rama site add` of EkBill starts without it.
- (Stage 2) Confirmations are written to the target's working copy only. Committing them to the target is the target team's act (House of Rama never pushes), so a fresh `rama site add` of the same repository starts without them.
- (Stage 2) Screens on the Brick view are listed by route only. Screenshots and the Showroom arrive in Stage 3, and the site office (Discovery) in Stage 4. Both are stubs that say so.
- (Stage 2) The canvas is not readable by a screen reader. Its label states the size of the site, and the brick finder and the inspector give keyboard and screen-reader access to every brick.
- (Stage 2) EkBill is not in CI (its remote needs credentials). `/site/ekbill` is exercised on this machine. The Stage 2 e2e runs on this repository and on a throwaway fixture site.
- (Stage 3) `gpt-6.1-sol`'s price in `packages/model/src/prices.ts` is taken from third-party price lists that agree with each other; OpenAI's own pricing page refused automated access. The row is marked `fromVendor: false` until checked against the vendor's page or invoice. Costs use list prices: cache discounts are not applied.
- (Stage 3) Drafting follows `export * from` and `export { … } from` (up to 6 hops); a symbol re-exported through `export default` of another module, or built at run time, is not followed and its edge stays without English.
