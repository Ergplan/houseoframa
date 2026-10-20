# Stage 1 — Blueprint

Date: 2026-10-20. Tag at start: `stage-1-start` (199b823). Builder: Claude Opus 5.5 (Claude Code). Independent reviewer: OpenAI `gpt-6.1-sol` through `packages/model` (prompt `reviewer.v1`).

## What was built

- **`packages/blueprint`**: `extract(repoPath, opts) → Blueprint`, reading only git and the file tree, with no model call inside it.
  - **Files.** By default it reads a commit from git's object store (`--rev`, default `HEAD`), so the working tree never leaks in. `--worktree` reads the working tree instead; that is how this repository carries its own Blueprint (below).
  - **Nodes.** One per tracked file: path, layer, the rule that placed it, lines, bytes, binary (a NUL byte in the first 8000 bytes), test, exports, env vars read, first commit, last commit, change count. Also `envDynamic`, when a `process.env[x]` read has a name the extractor could not resolve.
  - **Layers.** From the target's `.rama/layers.json` when present (overlay rules first), else the house-stack defaults of §7.2, matched at any depth. Each brick records its rule; unmatched files show `fallback: no rule matched`.
  - **Edges.** Resolved internal imports with the imported symbols and a `typeOnly` flag. The parser (TypeScript, syntax only) sees named, default, namespace, side-effect, type-only, inline-type, re-export, dynamic `import()` and `require()` imports. The resolver handles relative paths, index files, `.js`→`.ts`, the nearest tsconfig's `paths` following relative `extends` (exact pattern first, then longest prefix), and workspace packages by `package.json` name and `exports`. Unresolvable internal-looking imports are listed in `unresolved`; external dependencies come per manifest with a dev flag.
  - **Commits.** Full history, oldest first, with per-file A/M/D/R, add/del (null for binary), the old path of a rename, and author. Plus the branches and tags whose tip is in that history.
  - **Screens.** Next.js App Router pages found under every app root: route groups dropped; private, parallel-slot and intercepting folders skipped. Each screen's bricks are the runtime import closure of the page and its layouts.
  - **Glossary.** `.rama/glossary.json` is merged into edges as `english` with `confirmed`. An edge is confirmed only when every symbol on it has a confirmed phrase.
  - **Determinism.** Canonical JSON with sorted keys, every array sorted, `extractedAt` taken from the committer date, `short` as the first 7 SHA characters, and git output formats pinned (`-z`, fixed `--format`, rename detection, no mailmap, `LC_ALL=C`). The output is a function of three things: the commit, the refs whose tip is in its history, and the repository name (`--repo`, by default the origin URL without credentials, else the directory name). The same commit extracted twice is byte-identical unless someone adds or moves a branch or tag inside that history between the runs; refs are repository state, not commit content.
- **Metrics** (`@rama/blueprint/metrics`), one pure function per figure: files, textLines, tests, commits, authors, branches, importEdges, sideEffectImports, envVars, untestedBricks, loadBearing, mostReworked, heaviestCodeBrick, demolitions, and `summary`.
- **CLI.** `rama extract <repoPath> [--out] [--check] [--rev] [--worktree] [--exclude] [--repo] [--draft-glossary [--glossary-out] [--site]]` and `rama diff <a> <b>`. `--check` prints a diff and exits 1 on drift.
- **Glossary drafting.** `--draft-glossary` drafts phrases for symbols that have none, through `packages/model` (prompt `prompts/glossary.v1.md`, builder vendor), grounded in each symbol's declaration lines. It writes them without a confirmation into the overlay and never overwrites an existing phrase. It is never silent: `extract()` itself never calls a model.
- **Shared types.** Extended additively (see Deviations). `docs/BLUEPRINT.md` is regenerated.
- **This repository.** `.rama/layers.json` places its own files. `blueprint/self.json` is checked in (`pnpm extract:self`), and `pnpm check:self` runs in the watcher and therefore CI.
- **`apps/rama`.** Only `/api/health` was added, as the stage allows.
- **CI.** Full-history checkout of the pull request's head commit, and a clone of Procurement Studio at fac615d for the golden test.

## The three Blueprints

| Target                                  | Commit              | Files | Text lines | Tests | Commits | Import edges (+ side-effect) | Env vars | Screens | Unresolved |
| --------------------------------------- | ------------------- | ----- | ---------- | ----- | ------- | ---------------------------- | -------- | ------- | ---------- |
| Procurement Studio                      | fac615d             | 34    | 3,933      | 0     | 6       | 50 (+1)                      | 13       | 1       | 0          |
| EkBill                                  | 8c46a81             | 916   | 144,685    | 197   | 72      | 1,300 (+4)                   | 32       | 28      | 0          |
| This repository (`blueprint/self.json`) | worktree on 199b823 | 126   | —          | —     | 4       | —                            | —        | 1       | 0          |

The self row shows what `self.json` held when this report was drafted. The file changes with every commit that changes code, so read its current numbers from the file.

**Golden numbers (§7.1).** Every one matches exactly in `packages/blueprint/src/golden.test.ts`:

- files 34, text lines 3,933, commits 6, authors 2, branches 1;
- import edges 50, env vars 13 (the same 13 names), tests 0;
- heaviest code brick lib/data.ts at 367 lines; load-bearing lib/data.ts with 12 importers; most reworked README.md, 6 of 6;
- demolitions on components/RealTalk.tsx in commits 3 and 6;
- byte-identical re-extraction.

Four of the 13 env vars (`OPENAI_API_KEY1`, `OPENAI_KEY`, `OPENAI_SECRET_KEY` and `OPENAI_API_KEY`, read in a loop) were special-cased by hand in the weekend script. The extractor now derives them from `for (const n of KEY_NAMES)` over a const array.

**EkBill.** It extracts in about 5 s. All 1,304 internal imports resolve through its `@ekbill/*` and `@/*` aliases (134 are type-only), and all 28 app routes are found. 801 of its 916 files fall through to the fallback floor, because its code lives in folders the house-stack defaults do not name. That is reported, not hidden (KNOWN-GAPS).

## Tests

135 tests in 16 files, all passing in the watcher.

- `@rama/blueprint` has 105, plus 1 opt-in `@vendor` test:
  - glob matching;
  - every default layer rule (each at the root and one level down), overlay precedence, naming, custom floors, refusals;
  - parser cases for every import form, exports, and env (dot, bracket, const, for-of, destructuring, dynamic);
  - resolver cases: relative, index, `.js`→`.ts`, alias, nested tsconfig with `extends` and pattern precedence, workspace packages, unresolved, external, no escape outside the repository;
  - one test per metric;
  - `extract()` integration on fixture git repositories: determinism, commit mode ignoring the working tree, `--rev`, history with rename/delete/binary, node fields, edges, external, screens, refs limited to the extracted history, the repository name without credentials, glossary merge confirmed/partial/unconfirmed, malformed-overlay refusal, and the worktree base rule (before a commit = after it = after a Blueprint-only commit);
  - the golden test; `diff`; drafting with a fake model (asked keys only, never confirmed, no call when nothing is missing).
- `tests/stage-1.e2e.test.ts` runs the real `rama` binary on Procurement Studio: extract, an identical second extraction (`rama diff` exits 0), an earlier commit that differs (exit 1, "commits: 5 → 6"), and `--check` passing on a fresh file and failing on a tampered one.
- `/api/health`: route test, plus a request to the real dev server in `tests/stage-0.e2e.test.ts`.

The self-drift check was verified both ways: appending one line to a source file made it fail, naming the brick and the metric, and reverting cleared it. It also passes after committing, which is the property worktree mode exists for.

## Skipped, and why

- **EkBill in CI.** Its remote needs credentials. EkBill extraction was run and checked on this machine; CI runs the golden target (public).
- **`BrickNode.purpose`** is not filled: no purpose overlay is read and none is drafted. Stage 2's brick inspector needs it; the Stage 1 prompt does not ask for it.
- **CSS `@import`, MDX imports and computed `import()`** are not edges. A computed `process.env[x]` is flagged `envDynamic`, not named.

## Deviations from the prompt

1. **Schema additions** to §8: `BrickNode.envDynamic`, `ImportEdge.typeOnly`, `Commit.changes[].from`, `Blueprint.worktree`, `Blueprint.unresolved`, `external[].dev`, `external[].manifest`. All additive; reasons in DECISIONS.
2. **"Import edges"** counts edges that import at least one name. The weekend regex could not see side-effect imports, so with this definition the golden 50 matches, and the one side-effect edge on Procurement Studio (`app/layout.tsx → app/globals.css`) is in the Blueprint and counted separately.
3. **Heaviest brick** is the heaviest _code_ brick. §7.1 says "text brick, package-lock excluded", but app/globals.css (401 lines) is heavier than lib/data.ts (367); only the code reading gives the weekend figure.
4. **Default imports** are recorded as `default`, not the importer's local name.
5. **Layer defaults** match at any depth, and the shell rule covers all of `app/**` outside `app/api/**` (§7.2 lists only `app/layout*`, `app/page*`, `app/globals.css`).
6. **Refs are limited to the extracted history.** Only branches and tags whose tip is in the extracted history are recorded (`for-each-ref --merged`), so later tags stay out of an older commit's Blueprint. A ref added inside that history still changes the output; see Reviewer findings.
7. **`blueprint/self.json` uses worktree mode.** Its base is the commit before the code it describes, and branches and tags are left out. Its `commit` is therefore not the SHA of the commit that contains it; no file can contain its own commit's SHA.
8. **The reviewer's diff** leaves out the bodies of two generated files, `blueprint/self.json` (~100 KB) and `pnpm-lock.yaml`; the reviewer is told they changed and how they are generated and checked. Everything else in `git diff stage-1-start..HEAD` is sent verbatim.

## Reviewer findings

Two runs of `pnpm review 1` (OpenAI `gpt-6.1-sol` through `packages/model`, prompt `reviewer.v1`, auditor role). Each run is recorded verbatim in `docs/reports/stage-1.review.md`.

**Run 1, at 9a40e00.**

1. _Code defect, fixed in c3f5c8a._ Commit mode listed every branch and tag in the repository, so an older commit's Blueprint showed tags made later and changed whenever any ref was added. Refs are now limited to tips in the extracted history, with a test that a later tag stays out of an older commit.
2. _Report claim, fixed in c3f5c8a._ "Deterministic" was unconditional, and `repo` defaulted to the directory name. `repo` now defaults to the origin URL with credentials stripped (tested: a token in the URL never reaches the output), and the report states determinism precisely.
3. _Not a defect._ The reviewer cannot see the generator's body or CI execution from the diff.

**Run 2, at c3f5c8a.** No new code defect.

1. _Repeats run 1's item 1, narrowed; not resolvable by code._ A branch or tag added inside the extracted history still changes the output. Rationale: the stage requires branches and tags in the Blueprint, and refs are live repository state, so the only full fix is a schema change, moving refs out of the Blueprint (open question 4).
2. _Item (d), cannot tell._ The generator body and CI runs are outside the diff. By design of the review's inputs; the watcher runs both checks green.
3. _Item (e), cannot tell._ Test results, timings and local runs need execution evidence a diff cannot carry.

Verdicts on the other items: (b) upheld (`/api/health` has a route test and an HTTP test). (c) not applicable (no writes to `signoffs`, `audits` or `decisions` in this stage).

## Real model cost

- **Glossary drafting, one `@vendor` run:** anthropic `claude-sonnet-5-5`, 524 input and 140 output tokens, 1 attempt. The reply was "a converter from paise to rupees, returned as text": grounded in the code rather than the doc comment.
- **Reviewer, 2 runs:** openai `gpt-6.1-sol`, 55,444 + 57,422 input and 1,228 + 1,159 output tokens, 1 attempt each.
- No dollar figures: there is no price table in code (KNOWN-GAPS).

## Open questions

1. **EkBill's floors.** 801 of 916 files land on the fallback floor. Should I draft an EkBill `.rama/layers.json` for its working clone in Stage 2, for you to confirm? Or should the house-stack defaults learn monorepo folders (`packages/*/src` as logic, `tests/**`, `design/**`)? That would change the §7.2 defaults.
2. **Public repository.** `github.com/Ergplan/houseoframa` answers without credentials, so it is public. Nothing from this session has been pushed. Should it stay public?
3. **Push.** May I push `main` and the `stage-0-start` and `stage-1-start` tags, so CI runs the self-drift and golden checks on GitHub?
4. **Refs and determinism.** The stage asks for branches and tags in the Blueprint and for byte-identical re-extraction of a commit. Refs are live repository state, so both cannot hold when a ref is added inside the history. I recommend keeping refs in the Blueprint as now, because Stage 2's layout draws branches as scaffolds from it. The alternative is moving refs to a sidecar file beside the Blueprint, which would make it a pure function of the commit but changes the §8 schema. Which do you want?
