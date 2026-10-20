# packages/blueprint

`extract(repoPath, opts) → Blueprint`, the metrics, and the `rama` CLI. The only writer of `blueprint/*.json` (Invariant 1). Plain code: no model call, no clock, no network inside `extract()` (Invariant 6).

```
rama extract <repoPath> [--out file] [--check file] [--rev R] [--worktree] [--exclude glob]...
                        [--repo id] [--draft-glossary [--glossary-out file] [--site id]]
rama diff <a.json> <b.json>
rama site add <gitUrl|path> [--id id] [--name name]
rama site extract <id>        # writes the site's Blueprint
rama site check <id>          # fails when the site's Blueprint has drifted
rama site draft <id> [--only glossary|purposes]
rama site list
```

- **Commit mode** (default): files come from git's object store at `--rev` (default `HEAD`); the working tree is never read. Re-extracting a commit is byte-identical (canonical JSON, sorted keys, every array sorted, `extractedAt` is the committer date).
- **Worktree mode** (`--worktree`): how this repository carries `blueprint/self.json`. Files come from the working tree. History runs through a base commit: `HEAD` when changes are pending, otherwise the parent of the last commit that touched a non-excluded path. So the file generated before a commit equals the file regenerated after it. Branches and tags are left out because they depend on the machine.
- **Overlays** in the target's `.rama/` (read from the same tree as the files, or from the working copy with `overlay: 'worktree'`): `layers.json` (floors and rules, tried before the house-stack defaults), `glossary.json` (`symbol` or `path#symbol` → `{text, confirmedBy?, confirmedAt?}`) and `purposes.json` (`path` → the same entry). An entry without both `confirmedBy` and `confirmedAt` is unconfirmed.
- **Sites** (`site.ts`): a target cloned into `work/<id>/repo`, its Blueprint in `work/<id>/blueprint.json` (HEAD's code, history and refs; the overlay from the working copy). `self` is this repository, `blueprint/self.json`. `confirmEdge` / `confirmPurpose` write a named person's confirmation into the target's `.rama/` and regenerate the Blueprint; nothing is committed or pushed.
- **`rama site draft`** drafts phrases (prompt `glossary.v1`) and one-sentence purposes (prompt `purpose.v1`) for what has none, through `packages/model` (builder vendor), unconfirmed, saved after every batch.
- **`--draft-glossary`** drafts phrases for symbols with none through `packages/model` (prompt `glossary.v1`, builder vendor), writes them unconfirmed into the overlay, and never overwrites an existing phrase.
- **Metrics** (`@rama/blueprint/metrics`): one pure function per figure. Every surface displays these and never recounts (Invariant 7).

Source map: `git.ts` (trees, history, refs), `parse.ts` (imports, exports, env via the TypeScript parser), `resolve.ts` (relative, tsconfig `paths` with `extends`, workspace packages), `layers.ts` + `glob.ts`, `screens.ts` (Next.js App Router routes and their import closure), `glossary.ts`, `files.ts`, `extract.ts`, `diff.ts`, `draft.ts`, `site.ts`, `register.ts`, `cli.ts`.
