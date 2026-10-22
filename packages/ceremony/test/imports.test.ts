import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDecisionsLog, parseWeekendSession } from '../src/imports.ts';

const weekend = readFileSync(
  new URL('../../../reference/weekend-prototype/discovery.js', import.meta.url),
  'utf8',
);

describe('the weekend session (reconstructed)', () => {
  const s = parseWeekendSession(weekend);

  it('takes every turn and card from the file, with the agenda times of 28 Sep 2026 IST', () => {
    expect(s.source).toBe('reference/weekend-prototype/discovery.js');
    expect(s.title).toMatch(/reconstructed/);
    expect(s.turns.filter((t) => t.speaker === 'agenda').map((t) => t.text)).toEqual([
      'The problem',
      'How it should open',
      'Comparing bids line by line',
      'Putting offers on one basis',
      'Seeing the machine',
      'Trusting the vendor',
      'Talking to it',
      'Shipping it',
    ]);
    expect(s.turns[1]).toMatchObject({
      speaker: 'Procurement Head',
      at: '2026-09-28T10:00:00+05:30',
    });
    for (const t of s.turns) expect(weekend.replace(/\\'/g, "'")).toContain(t.text);
  });

  it('keeps decided cards apart from the ones left open or not built', () => {
    expect(s.decisions[0]).toMatchObject({
      title: 'Scope: six capex packages, one plant',
      status: 'decided',
      bricks: ['lib/data.ts', 'components/Studio.tsx'],
    });
    const open = s.decisions.filter((d) => d.status !== 'decided');
    expect(open.map((d) => [d.title, d.status])).toEqual(
      expect.arrayContaining([['Open: who signs off an award', 'open']]),
    );
    expect(open.some((d) => d.status === 'not-built')).toBe(true);
  });

  it('refuses a file whose session is not plain data', () => {
    expect(() => parseWeekendSession('const PEOPLE = {}; const SESSION = [run()];')).toThrow(
      /not a plain literal/,
    );
  });
});

describe("a decisions log in EkBill's form", () => {
  const md = `# Decisions

## 2026-10-13 — locked stack

### Database

- Decision: **PostgreSQL 16** with pgvector, relational columns; rules in \`packages/engine/rules/gst/rates.json\`
- Why: 500 tenants need indexes
  and constraints.
- Asked by: the master prompt, accepted by the operator

### A heading with no decision line

Some prose.

## 2026-10-15 — Stage 2

### Sessions

- Decision: switcher sign-in during the build (\`apps/web/server/session.ts\`, \`not/a/file.ts\`)
- Asked by: the operator
`;
  const files = new Set(['packages/engine/rules/gst/rates.json', 'apps/web/server/session.ts']);
  const s = parseDecisionsLog(md, (p) => files.has(p));

  it('turns each dated entry into a decided card, links only real files, keeps who asked', () => {
    expect(s.decisions).toEqual([
      {
        title: 'Database',
        statement:
          '**PostgreSQL 16** with pgvector, relational columns; rules in `packages/engine/rules/gst/rates.json` Why: 500 tenants need indexes and constraints.',
        bricks: ['packages/engine/rules/gst/rates.json'],
        status: 'decided',
        by: 'the master prompt, accepted by the operator',
        at: '2026-10-13T00:00:00Z',
      },
      {
        title: 'Sessions',
        statement:
          'switcher sign-in during the build (`apps/web/server/session.ts`, `not/a/file.ts`)',
        bricks: ['apps/web/server/session.ts'],
        status: 'decided',
        by: 'the operator',
        at: '2026-10-15T00:00:00Z',
      },
    ]);
    expect(s.turns).toEqual([]);
    expect(s.title).toMatch(/reconstructed from the log/);
  });
});
