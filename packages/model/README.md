# packages/model

The one module for external model calls (rule 8). `call({name, version, input, output, role, siteId, createdBy})`:

1. refuses unless `BUILDER_VENDOR` and `AUDITOR_VENDOR` are set, known and different (Invariant 5);
2. loads `prompts/<name>.v<version>.md` and records its sha256;
3. routes to the vendor for `role` (`builder` or `auditor`) with the model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) or `OPENAI_MODEL` (no default);
4. tries up to three times (two retries) on rate limits, server errors, network failures and replies that do not parse;
5. writes exactly one `model_calls` row, success or failure;
6. returns the output validated by the zod schema in `output`.

Tests tagged `@vendor` call a real vendor and are excluded from the watcher: `RAMA_VENDOR_TESTS=1 pnpm vitest run -t @vendor`.
