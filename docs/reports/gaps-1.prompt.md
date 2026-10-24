# Work order: gaps 1 (after Stage 6)

All six stages of docs/MASTER-PROMPT.md are built. The user asked to close known gaps that need no input from them. This is the scope, written before the work started; the reviewer checks the work against it and CLAUDE.md, as it checks a stage against its prompt.

1. **Stale entries in docs/KNOWN-GAPS.md.** Remove or correct entries that later stages closed: the price table exists since Stage 3, the site office is real since Stage 4, and names are authenticated in the app since Stage 6.
2. **Signatures that anyone with write access can forge in git** (KNOWN-GAPS, Stage 4).
   - House of Rama signs every signature record it writes with an Ed25519 key held by the server (`RAMA_SIGNING_KEY`, a secret).
   - The record in `.rama/signoffs.jsonl` carries the signature. The gate verifies it against a public key that the target cannot change: it is given to the gate by the workflow on the base branch (`--public-key`), never read from the target.
   - A line without a valid signature counts for nothing in the gate.
   - The private key never leaves the server, and is never printed or committed.
   - The database row and the mirrored line stay identical (Invariant 3: append-only, named).
3. ~~Members invited in the app~~ **Withdrawn 2026-10-24**: the user replaced email sign-in with two username-and-password accounts. Amended scope, by the user's instruction during this work:
   - sign-in by username and password from `RAMA_ACCOUNTS` (configured in `.env`, not in the source, per CLAUDE.md rule 10);
   - the email-link routes, mail sending and the `login_links` table removed;
   - every route still authorized, and tested.
4. **Backups copied off the box** (KNOWN-GAPS, Stage 6). After each nightly dump, `deploy/backup.sh` runs an optional `BACKUP_COPY_COMMAND` with the dump's path. A failed copy is logged and does not delete the local dump. Documented in docs/DEPLOY.md.

Every change has tests, the watcher stays green, and the living documents change in the same commit. Done when the reviewer reports no new code defect and docs/reports/gaps-1.md is written. Nothing is pushed.
