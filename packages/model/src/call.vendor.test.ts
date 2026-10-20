// @vendor: calls real vendors and writes real model_calls rows. Excluded from the watcher and CI;
// run with `RAMA_VENDOR_TESTS=1 pnpm vitest run --project @rama/model`.
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { call } from './call.ts';

const promptsDir = fileURLToPath(new URL('../test/fixtures/prompts', import.meta.url));

describe('@vendor real vendor round trip', () => {
  for (const role of ['builder', 'auditor'] as const) {
    it(`@vendor ${role} vendor answers the echo prompt and the call is recorded`, async () => {
      const res = await call(
        {
          name: 'echo',
          version: 1,
          input: { word: 'foundation' },
          output: z.object({ echo: z.string() }),
          role,
          siteId: 'self',
          createdBy: 'rama:model-vendor-test@0.0.1',
          maxTokens: 50,
        },
        { promptsDir },
      );
      expect(res.output.echo).toBe('foundation');
      expect(res.callId).toMatch(/[0-9a-f-]{36}/);
    }, 60_000);
  }
});
