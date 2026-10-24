# packages/ceremony

The people (Stage 4): discovery sessions and decision cards, named signatures, the merge gate and the walkthrough. Plain code throughout, except Rama's drafted questions (Invariant 6).

```
rama gate <repoPath> --base <commit> [--test-report <json>] [--public-key <base64>]   exit 0 pass, 1 fail, 2 usage
rama-ceremony import-session <site> <discovery.js>       the weekend's session, flagged reconstructed
rama-ceremony import-decisions <site> [--from docs/DECISIONS.md]   a decisions log as reconstructed cards
rama-ceremony install-gate <site> [--ref <houseoframa ref>]        writes .github/workflows/rama-gate.yml (with the public key)
rama-ceremony signing-key                                          prints the public key; writes a private key to .env if none
```

- `records.ts`: the `.rama/decisions.jsonl` and `.rama/signoffs.jsonl` formats (strict zod), `appendRecord()`, `syncMirror()` (appends committed rows the file lacks; never removes a line), `signaturesInForce()` and `checkChain()`: a signature supersedes one of the same target that nothing has superseded yet; a withdrawal (`withdrawn: true`) must supersede something.
- `store.ts`: the writes. `sign()` and `decide()` take the site's advisory lock, check the chain and insert one append-only row (audited by trigger). Only after the commit do they bring the target's mirror up to the committed rows, under the lock again. `startSession()`, `addTurn()`, and the readers.
- `gate.ts`: `evaluateGate()` (the rule, over plain inputs) and `runGate()` (a checkout: the Blueprints at HEAD and at the base, `changesSince()` along the first-parent chain with merge diffs and both sides of renames, the signature file at HEAD and at base). A changed screen passes on a signature in force at or after its last change, or a passing test behind every changed code brick. A signature file that lost or changed a line since the base fails the gate. Nothing in the target configures it.
- `walkthrough.ts`: `walkthrough(showroom, decisions, signoffs, person)`. It gives one step per Blueprint screen with its captured views, the statement built from traced figures and decided cards, and the signature in force (current or stale).
- `imports.ts` and `importer.ts`: the reconstructed records, read from their source files only. `importRecord()` reconciles a corrected re-import append-only (`planReimport()`).
- `discovery.ts`: `draftQuestion()`, prompt `discovery.v1` through `packages/model` (builder role). Its output is stored as a draft turn, never as a decision.
- `ci/rama-gate.yml`: the workflow a target includes. It runs on `pull_request_target` with a read-only token, no secrets, and House of Rama at a pinned ref.
- `seal.ts`: seals on signatures. `sealerFrom()` (from `RAMA_SIGNING_KEY`) signs a record's canonical JSON with Ed25519, and `verifySeal()` checks it against the public key. `sign()` seals before inserting, and the gate counts only sealed lines when given `--public-key`.
