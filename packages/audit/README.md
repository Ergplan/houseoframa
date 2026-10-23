# packages/audit

The second opinion (Stage 5). Plain-code checks find; an auditor model from a different vendor than the builder (Invariant 5) reads what they found and writes the narration, the alterations and the time machine. It never edits code, and it cannot add a finding.

```
rama-audit check <site> [--no-run]                   the checks only: no model, nothing written
rama-audit run <site> [--skip typecheck,build,test]  checks, the auditor, the signed report → audits, findings
rama-audit show <site>                               the latest report, and whether its hash verifies
```

- `findings.ts`: the check names (MASTER-PROMPT §7.3), `CheckFinding`, and verdicts per brick (the worst finding; pass when none). A check that did not run is reported as not run, never as a pass.
- `checks/static.ts`: checks that read code with the TypeScript parser and run nothing. They cover silenced lint, swallowed errors, `any`, constants in formula files, browser-storage writes, environment fallbacks, long unauthenticated routes, and positions taken from sorted lists. Test files are left out.
- `checks/run.ts`: `typecheck`, `build` and `test` are the target's own `package.json` scripts. They run with the package manager its lockfile names, in its checkout, with PATH and HOME only. Coverage per brick is read from the test report and the import graph: a brick is covered when a test file that imports it passed.
- `checks/ceremony.ts`: screens changed since their signature or never signed, unconfirmed phrases, and decisions left open or not built. All are notes.
- `auditor.ts`: `auditorInput()`, `inputsHash()` (sha256 of the canonical input), and `askAuditor()` (prompt `audit.v1`, role auditor). `applyReply()` refuses a reply that names a finding the checks did not make, raises a verdict, or cites a commit outside the history.
- `report.ts`: `runAudit()` writes `audits` and `findings` (append-only; audited by trigger), including a pass row for every clean brick. `signoffVerdicts()` confirms or rejects each signature in force by the findings on its screen. `verifyReport()` recomputes the hash from the auditor's own `model_calls` row.
- `view.ts`: browser-safe. `AuditView` and `auditScript()` give the replay the drones fly.
