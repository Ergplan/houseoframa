# Decisions

One dated entry per decision. Newest first. Locked decisions (CLAUDE.md §3) are recorded here on the day they were taken.

## 2026-10-19 — Locked decisions at the start of the build
- Repository: github.com/Ergplan/houseoframa, monorepo, pnpm workspaces.
- Stack: TypeScript, Next.js App Router, Postgres 16 + Drizzle, Canvas 2D for the building.
- Builder: Claude (Claude Code). Auditor and independent reviewer: OpenAI. The two must differ (Invariant 5).
- First target: EkBill. Second: Procurement Studio. House of Rama renders itself from Stage 2.
- Targets are read-only clones; House of Rama never pushes to a target and is not a repository system.
- Security deferred to Stage 6 by rule; single local member until then.
- The quality that wins ties: a true picture beats a complete one.

## 2026-10-17 — Prototype decisions (carried forward)
- The building is a renderer over a generated graph; the graph is the product.
- Floors are layers; features/screens are the unit a non-developer reviews.
- Voice narrates and reviews; text and the map hold the truth.
- One product owner accepts changes; the agent shows the cost of each.
- Sign-off is behaviour confirmed on a screen, not code.

## 2026-10-20 — Repository moved to GitHub
- Repository is now github.com/Ergplan/houseoframa (was gitlab.com/venture6/house-of-rama for one day). CI is GitHub Actions (`.github/workflows/check.yml`). The build VM signs in with `gh`.
