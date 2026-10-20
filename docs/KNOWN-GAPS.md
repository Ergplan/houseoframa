# Known gaps

Updated in the same commit as the code that opens or closes a gap.

- The prototype audit was scripted by the builder's vendor; Stage 5 replaces it with a second-vendor auditor.
- EkBill has no `data-rama-figure` instrumentation. Its five headline figures are traced by an overlay in its working clone (`.rama/figures.json`, hand-written harnesses); the other 151 figures on its 12 captured screens are untraced (at 4f28628). Instrumenting EkBill itself (HOUSE-STYLE §1–2) is the EkBill team's work.
- No city layout; a single building per site. EkBill (916 bricks) fits in one building about 1,500 scene pixels wide; at fit-to-screen its bricks are about half size, so `Zoom 1:1` or the brick finder is the way to reach a small one.
- (Stage 0) `model_calls` records tokens, not money: no price table is in code, so cost in a stage report is given in tokens unless a price is stated by the vendor's invoice.
- (Stage 0) The `stack` compose profile (app and watcher in containers) is validated with `docker compose config` but has not been run end to end; `pnpm dev` is the tested path.
- (Stage 0) The Stage 0 e2e test runs on this repository's own app; there is no target repository in Stage 0.
- (Stage 1) EkBill's remote needs credentials, so CI cannot clone it: its extraction is exercised on this machine only. Procurement Studio (public) is the golden target in CI.
- (Stage 1) Imports are read from JS/TS sources only: CSS `@import`, MDX imports and `import()` with a computed path are not edges. A computed `process.env[x]` is flagged `envDynamic` rather than named.
- (Stage 1) A brick's history is its current path only: commits made under a previous name (before a rename) are not counted in `changes` or `firstCommit`.
- (Stage 2) EkBill's `.rama/` (layers, confirmed 2026-10-20 by Rachit Agarwal; glossary; purposes) lives only in the working clone `work/ekbill/repo`. **When the Stage 4 gate lands, the EkBill team commits `.rama/` into EkBill** so its CI and every fresh clone see it. Until then a fresh `rama site add` of EkBill starts without it.
- (Stage 2) Confirmations are written to the target's working copy only. Committing them to the target is the target team's act (House of Rama never pushes), so a fresh `rama site add` of the same repository starts without them.
- (Stage 2) The site office (Discovery) is a stub until Stage 4, and says so.
- (Stage 2) The canvas is not readable by a screen reader. Its label states the size of the site, and the brick finder and the inspector give keyboard and screen-reader access to every brick.
- (Stage 2) EkBill is not in CI (its remote needs credentials). `/site/ekbill` is exercised on this machine. The Stage 2 e2e runs on this repository and on a throwaway fixture site.
- (Stage 3) `gpt-6.1-sol`'s price in `packages/model/src/prices.ts` is taken from third-party price lists that agree with each other; OpenAI's own pricing page refused automated access. The row is marked `fromVendor: false` until checked against the vendor's page or invoice. Costs use list prices: cache discounts are not applied.
- (Stage 3) Drafting follows `export * from` and `export { … } from` (up to 6 hops); a symbol re-exported through `export default` of another module, or built at run time, is not followed and its edge stays without English.
- (Stage 3) Capture photographs only what a target draws with no secrets. EkBill's screens show its sample shop as a look (`?as=owner`; since 4f28628 a signed-out visitor is sent to `/welcome`), not a signed-in business's live data, so the traced values are the fixture's. Live-data screens need a seeded demo database that the capture can start, and that is not built.
- (Stage 3) Untraced figures are detected from text: amounts with a currency sign, percentages, bare numbers, and (conservatively) numbers inside words. Two cases fall outside it. A figure drawn as an image or in a canvas is neither traced nor counted as shown. An element holding two separate amounts in its own text is marked once, not twice. The conservative pass also marks numbers that are not figures, such as a house number in an address or a step number ("01 / KISKA BILL"), so the honest rate's denominator is slightly high.
- (Stage 3) An overlay figure's selector is checked only by its re-execution matching the screen. If EkBill changes its markup the selector may find nothing; the figure then simply does not appear on that screen and is not counted.
- (Stage 3) This repository (`self`) has no `.rama/screens.json`, so its Showroom says nothing has been captured. Instrumenting House of Rama's own Trust report per HOUSE-STYLE is not done.
- (Stage 3) EkBill's capture and trail tests (`tests/stage-3.ekbill.test.ts`) run only where its working clone exists (this machine and its watcher), not in CI. CI runs the same capture and Showroom path on a fixture target that follows the convention.
