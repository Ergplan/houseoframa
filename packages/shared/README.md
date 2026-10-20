# packages/shared

Types shared across packages, exactly as MASTER-PROMPT §8 defines them: `Blueprint` and its parts, `Trail`, `Decision`, `Signoff`, `Finding`. Every field carries a one-line doc comment; `docs/BLUEPRINT.md` is generated from these comments by `scripts/gen-blueprint-doc.mjs`, and the watcher fails when the document drifts or a field is undocumented.
