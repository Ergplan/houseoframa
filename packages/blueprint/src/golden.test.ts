// The weekend numbers (MASTER-PROMPT §7.1) on Procurement Studio at fac615d. The clone lives at
// reference/procurementstudio (CI clones it; see .github/workflows/check.yml). A missing clone fails.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Blueprint } from '@rama/shared';
import { extract } from './extract.ts';
import { canonicalJson } from './json.ts';
import * as m from './metrics/index.ts';

const REPO = fileURLToPath(new URL('../../../reference/procurementstudio', import.meta.url));
const COMMIT = 'fac615d';
let bp: Blueprint;

beforeAll(() => {
  if (!existsSync(REPO)) {
    throw new Error(
      `reference/procurementstudio is missing: git clone https://github.com/Ergplan/procurementstudio ${REPO}`,
    );
  }
  bp = extract(REPO, { rev: COMMIT });
});

describe('golden: Procurement Studio at fac615d (MASTER-PROMPT §7.1)', () => {
  it('files 34', () => expect(m.files(bp)).toBe(34));
  it('text lines 3,933', () => expect(m.textLines(bp)).toBe(3933));
  it('commits 6', () => expect(m.commits(bp)).toBe(6));
  it('authors 2', () => expect(m.authors(bp)).toHaveLength(2));
  it('branches 1', () => expect(m.branches(bp)).toBe(1));
  it('import edges 50 (plus the one side-effect import the weekend regex could not see)', () => {
    expect(m.importEdges(bp)).toBe(50);
    expect(m.sideEffectImports(bp)).toBe(1);
    expect(bp.edges.find((e) => e.symbols.length === 0)).toMatchObject({ from: 'app/layout.tsx', to: 'app/globals.css' });
  });
  it('env vars 13', () =>
    expect(m.envVars(bp)).toEqual([
      'OPENAI_API_KEY',
      'OPENAI_API_KEY1',
      'OPENAI_BASE_URL',
      'OPENAI_KEY',
      'OPENAI_REALTIME_MODEL',
      'OPENAI_SECRET_KEY',
      'OPENAI_TEXT_MODEL',
      'OPENAI_TRANSCRIBE_MODEL',
      'OPENAI_VOICE',
      'STUDIO_PASSWORD',
      'VERCEL',
      'VERCEL_ENV',
      'WEB_SEARCH',
    ]));
  it('tests 0', () => expect(m.tests(bp)).toBe(0));
  it('heaviest code brick lib/data.ts, 367 lines', () =>
    expect(m.heaviestCodeBrick(bp)).toMatchObject({ path: 'lib/data.ts', lines: 367 }));
  it('load-bearing lib/data.ts, 12 importers', () =>
    expect(m.loadBearing(bp, 1)).toEqual([{ path: 'lib/data.ts', count: 12 }]));
  it('most reworked README.md, 6 of 6 commits', () =>
    expect(m.mostReworked(bp, 1)).toEqual([{ path: 'README.md', count: 6 }]));
  it('demolitions: commits 3 and 6 on components/RealTalk.tsx', () =>
    expect(m.demolitions(bp).map((d) => [d.commit, d.path])).toEqual([
      [3, 'components/RealTalk.tsx'],
      [6, 'components/RealTalk.tsx'],
    ]));
  it('re-extracts byte-identically', () => expect(canonicalJson(extract(REPO, { rev: COMMIT }))).toBe(canonicalJson(bp)));
});
