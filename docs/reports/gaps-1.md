# Gaps 1 — after Stage 6

Date: 2026-10-24. Tag at start: `gaps-1-start` (46f4b2f). Scope: `docs/reports/gaps-1.prompt.md`, written before the work started and amended once at the user's instruction. Builder: Claude Opus 5.5 (Claude Code). Independent reviewer: OpenAI `gpt-6.1-sol` (`pnpm review gaps-1`, the new work-order mode of `scripts/review.ts`).

All six stages were built. The user asked to close the known gaps that need no input from them, then changed how members sign in during the work.

## What was done

1. **Sign-in by username and password** (the user, 2026-10-24: "no email logins, only two simple username and passwords hardcoded in the system for now").
   - The accounts are `RAMA_ACCOUNTS` in `.env`, not in the source, because CLAUDE.md rule 10 forbids committing a secret.
   - `/login` is a plain form. Passwords are compared in constant time, against every account each time. A refused sign-in pauses for half a second.
   - An account signs in as the person of that name, so the existing member keeps their sites. Sessions are unchanged.
   - Two accounts are set up on this machine: `rachit` (Rachit Agarwal, manager) and `member2` (Second Member). Their passwords are in `.env` only.
   - The email-link routes, mail sending (`nodemailer`), `login_links` (migration 0007) and `rama-member add|link` are removed. The member-invitation item of the work order fell away with them.
2. **Sealed signatures.**
   - House of Rama signs every signature record it writes with an Ed25519 key (`RAMA_SIGNING_KEY`, in `.env`). The seal is in the row (`signoffs.seal`, migration 0008) and the mirrored line alike.
   - `rama gate --public-key` counts only lines whose seal verifies. The key comes from the workflow on the base branch, which `install-gate` writes. A hand-typed line, an edited line or a forged withdrawal counts for nothing, and the gate lists it.
   - `rama-ceremony signing-key` wrote this machine's key to `.env` (not printed). EkBill's local workflow is re-pinned to 2a73cc7 with the public key.
3. **Backups copied off the box.** `BACKUP_COPY_COMMAND` runs with each night's dump. A failed copy is logged, and the local dump is kept.
4. **KNOWN-GAPS** loses its stale entries (the price table, the site-office stub, the email gaps) and says what is now true of signatures, sign-in and backups.

## Tests

- **Sign-in:** accounts parsing (malformed, a short password, a duplicate username), credentials, sessions (`packages/db/src/auth.test.ts`); the login handler (`app/api/auth/handlers.test.ts`).
- **Authorization** for every route and page, unchanged in substance, now on sessions opened directly (`app/authz.test.tsx`).
- **E2E:** the Stage 6 test signs in through the form, a wrong password first. Every earlier end-to-end test signs in.
- **Checked on the running app:** a wrong password goes back to `/login?failed=1`; `rachit` signs in as Rachit Agarwal, with the sites and the campus.
- **Seals:**
  - tampering, the wrong key, no seal, a bad key (`test/seal.test.ts`);
  - `sign()` seals the row and the line alike (`test/store.test.ts`);
  - the gate ignores typed and forged lines, and says when it checks nothing (`test/gate.test.ts`);
  - the workflow carries the key and refuses a non-base64 key (`test/workflow.test.ts`).
- **Backups:** the real script with a stand-in `pg_dump`: dated dump, retention, copy, failed copy (`tests/backup.e2e.test.ts`).
- **Watcher:** green.

## Reviewer findings

(Filled in after the reviewer runs.)

## What still needs the user

1. **The pod box** (address and access), to deploy there.
2. **The second member's** real name, if not "Second Member" (edit `RAMA_ACCOUNTS` in `.env`, then restart).
3. **Stage 4's signatures** on EkBill's three traced screens. Sign in as `rachit` and use the walkthrough. Signatures made now carry a seal.
4. **Push** Stages 4 to 6 and this work. EkBill's workflow is pinned to a commit that is not on GitHub yet.
5. **The pod light:** is "signed but not audited" blue (as built) or amber?
