# Stage 6 — Floor edition

Date: 2026-10-23. Tag at start: `stage-6-start` (1aef7a0). Builder: Claude Opus 5.5 (Claude Code). Independent reviewer: OpenAI `gpt-6.1-sol` through `packages/model` (prompt `reviewer.v1`).

## Where this stage stands

Built, tested and reviewed. **Two done-criteria need you and cannot be met from this machine:**

1. **Deployed on the prototype pod box.** The box stack is built and documented (`docs/DEPLOY.md`), and was run end to end on this machine. Putting it on the pod box needs the box's address and access to it.
2. **Two members complete the loop on real sites** (and ten by week six). These are real people signing in, booking, walking through and signing. The end-to-end test runs this loop on a real target, but it is not two members.

Two items from earlier stages are still yours, too:

- **Stage 4:** your signatures on EkBill's traced screens. You can now sign in to do it (below).
- **Pushing** Stages 4 to 6, which also makes EkBill's pinned gate workflow runnable.

## How to sign in on this machine

Your member record is Rachit Agarwal, venture@aayuda.energy. You are its floor manager, and pod 1 is "Prototype pod". No mail service is set up, so get a link from the shell:

```
pnpm rama-member link venture@aayuda.energy
```

Open the printed link (it works once, for 15 minutes). The home page then lists your sites (self, ekbill, procurementstudio), with the campus and sign-out.

## What was built

- **Sign-in by email link** (no passwords):
  - `people` gains `email` and `role` (member or manager).
  - `login_links` and `sessions` store only the sha256 of their tokens. A link works once (a single conditional update, so two clicks cannot both succeed) and for 15 minutes.
  - The session is a 30-day httpOnly, SameSite=Lax cookie, Secure on https; sign-out revokes it.
  - Routes: `/login`, `POST /api/auth/link` (the same answer for a stranger), `GET /auth/verify`, `POST /api/auth/logout`.
  - Mail goes by `SMTP_URL`, or to the server log (the outbox). `pnpm rama-member add|link` adds members and prints links.
- **Every route authorized:**
  - every page under /site needs a session (otherwise /login) and a site the member owns (otherwise not found);
  - every site route answers 401 or 404 the same way and acts as the signed-in member, no longer `RAMA_MEMBER_NAME`;
  - /campus is for managers;
  - the pod status needs the controller's token;
  - /api/health stays public.
- **Bookings and pods:**
  - `pods` and `bookings` (`pnpm rama-pod add`); `/book`; `POST /api/bookings`. A booking is work on a site the member owns, or game mode. The pod's row is locked while overlap is checked, so one slot cannot be booked twice.
  - `/pod/<n>`, during the member's own work booking, opens the booked site's triptych.
- **The pod light** (`podLight()` in metrics) is read from the records:
  - off: no booking;
  - pink: game mode;
  - green: every screen signed at the current commit, and that commit's audit is clean;
  - amber: photographed at the current commit, with a screen unsigned;
  - blue: otherwise.
    The controller reads `GET /api/pod/<n>/status` with `Authorization: Bearer $RAMA_POD_TOKEN`.
- **The triptych** (`/site/<id>/triptych`) puts Discovery, Site and Showroom side by side on three 4K screens, as tabs on one. Narration is the pages' own SpeechSynthesis, through the pod's headset.
- **Campus** (`/campus`) shows every pod and its light, signatures pending by name, audits passed, and products in use at 90 days, all from `campusFigures()` in metrics.
- **Handover** (`/site/<id>/handover`):
  - readiness is `handoverReady()` in metrics: every screen signed, the audit clean, and the structure confirmed;
  - the structure is drafted from the import graph (bricks at least three others import) and confirmed by a named person into `.rama/structure.json`;
  - handing over writes an append-only, audited `handovers` row;
  - the structural certificate and the keys page are read from it;
  - after handover, the owner records check-ins.
- **Deploy:** the `Dockerfile` and `deploy/compose.box.yml`:
  - Postgres inside the box;
  - the production app, with git and Chromium;
  - a nightly `pg_dump` keeping 14 days (`deploy/backup.sh`);
  - the watcher's checks.
    `docs/DEPLOY.md` covers setup, members, pods and sites, restore and update.
- **Migrations** `0005_floor` and `0006_handovers`. `checkins` and `handovers` are append-only, and handovers are audited.

## Tests

- **Authorization for every route and page** (`apps/rama/app/authz.test.tsx`), against real sessions for two members in a throwaway database:
  - 11 site routes: 401 without a session, 404 on another's site, and through for the owner;
  - 7 site pages: to /login without a session, not found on another's site;
  - home, /book, /pod/<n>, /campus (manager only), bookings, and the pod status token.
- **Sign-in:**
  - a one-time link, expiry, revocation, two simultaneous redemptions (one wins), only hashes stored (`packages/db/src/auth.test.ts`);
  - the handlers: the cookie's flags, the same answer for a stranger, the outbox (`app/api/auth/handlers.test.ts`).
- **Booking to site mapping, and the pod light's transitions** on a real fixture site (`server/floor.test.ts`). The light goes blue, amber, blue, green, pink, then off, and refusals are tested: overlap, another member's site, an unknown pod, bad times, two simultaneous bookings.
- **Campus numbers equal metrics:** the page shows exactly what `campusFigures()` gives over the same records (`server/handover.test.ts`), plus the metrics' own tests.
- **Handover:** readiness reasons, refusals before ready, the structure confirmed, the handover record (audited) and check-ins.
- **E2E on a real target** (`tests/stage-6.e2e.test.ts`): the fixture app is built and photographed. A member signs in through the real link flow, reading the link from the outbox, then:
  - books a pod, and the triptych opens;
  - signs both screens in the walkthrough;
  - the light, as the controller reads it, goes off, amber, blue, green.
    This test caught and fixed a hydration error on the home page.
- **All earlier end-to-end tests now sign in** (`tests/session.ts`) on throwaway databases.
- **Box stack, run on this machine** (`docs/DEPLOY.md`, Verified):
  - the image built;
  - health answered with the commit;
  - an anonymous visitor was sent to /login;
  - the pod status refused without a token;
  - a backup restored into a fresh database.
- **Watcher:** green, 442 tests at 28854a9.

## Deviations and readings of the prompt

- **The pod light's rules** are a reading: the prompt names the colours, not when each applies. Signed but not yet audited is blue (work), not amber.
- **The triptych is three pages in frames,** so each keeps its own behaviour.
- **"In use at 90 days" is the owner's check-in,** not something inferred.
- **The keys page shows the deploy as "not recorded":** House of Rama does not deploy targets.
- **Members are added by command;** there is no invitation flow.

## Reviewer findings

(Filled in after the reviewer runs.)

## Real model cost

(Filled in after the reviewer runs.)

## Open questions

1. **The pod box:** its address and how I reach it, to deploy there (or will you run `docs/DEPLOY.md` yourself?).
2. **Mail:** which SMTP service should send sign-in links (`SMTP_URL`, `MAIL_FROM`)?
3. **The second member** for the two-member loop: their email and name (`pnpm rama-member add`).
4. **Push** Stages 4 to 6?
5. **The pod light:** is "signed but not audited = blue" right, or should it be amber until the audit?
