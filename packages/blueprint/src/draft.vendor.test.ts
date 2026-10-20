// @vendor: drafts real glossary phrases through the builder vendor and writes real model_calls rows.
// Excluded from the watcher and CI; run with `RAMA_VENDOR_TESTS=1 pnpm vitest run --project @rama/blueprint -t @vendor`.
import { afterAll, describe, expect, it } from 'vitest';
import { fixtureRepo } from '../test/fixture-repo.ts';
import { draftGlossary } from './draft.ts';
import { extract } from './extract.ts';

const repo = fixtureRepo();
afterAll(() => repo.cleanup());

describe('@vendor glossary drafting', () => {
  it('@vendor drafts unconfirmed phrases that land on the edges as unconfirmed', async () => {
    const files = {
      'lib/money.ts': '/** Formats a rupee amount in lakh and crore. */\nexport function inr(paise: number): string {\n  return String(paise / 100);\n}\n',
      'app/page.tsx': "import { inr } from '../lib/money';\nexport default function P() { return inr(100); }\n",
    };
    repo.write(files);
    repo.commit('fixture');
    const bp = extract(repo.dir);
    const drafted = await draftGlossary(bp, {}, (p) => files[p as keyof typeof files] ?? null, { siteId: 'self' });
    expect(Object.keys(drafted)).toEqual(['lib/money.ts#inr']);
    expect(drafted['lib/money.ts#inr']).not.toHaveProperty('confirmedBy');
    const edge = extract(repo.dir, { glossaryExtra: drafted }).edges[0]!;
    expect(edge.english).toMatchObject({ confirmed: false });
    console.log(`drafted: "${edge.english?.text}"`);
  }, 60_000);
});
