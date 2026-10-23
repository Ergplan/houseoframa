import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDecisionsLog, parseWeekendSession, planReimport } from '../src/imports.ts';

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

describe('a decisions log whose later sections are entries themselves', () => {
  const md = `## 2026-10-16 — Stage 11

### Coverage

- Decision: vitest with v8.
- Asked by: master prompt Stage 11.

## 19 Oct 2026: the voice waits to be asked

- Context: the operator's walk.
- Decision: the voice starts only on a tap (\`apps/web/voice.ts\`).
- Consequences: one primary per screen.

## 20 Oct 2026, evening: GST by rate

- Decision: heads by rate.

## Notes without a date

- Decision: not a card, there is no date.
`;
  const s = parseDecisionsLog(md, (p) => p === 'apps/web/voice.ts');

  it('ends an entry at any section heading and reads both date forms', () => {
    expect(s.decisions.map((d) => [d.title, d.at, d.by, d.bricks])).toEqual([
      ['Coverage', '2026-10-16T00:00:00Z', 'master prompt Stage 11.', []],
      [
        'the voice waits to be asked',
        '2026-10-19T00:00:00Z',
        'not recorded',
        ['apps/web/voice.ts'],
      ],
      ['GST by rate', '2026-10-20T00:00:00Z', 'not recorded', []],
    ]);
    expect(s.decisions[1]!.statement).toBe('the voice starts only on a tap (`apps/web/voice.ts`).');
  });
});

describe('planReimport (append-only correction of an earlier import)', () => {
  const rec = (id: string, title: string, statement: string, supersedes?: string) => ({
    id,
    siteId: 's',
    title,
    statement,
    bricks: [],
    status: 'decided' as const,
    by: 'x',
    at: '2026-10-16T00:00:00.000Z',
    ...(supersedes ? { supersedes } : {}),
  });
  const imp = (title: string, statement: string) => ({
    title,
    statement,
    bricks: [],
    status: 'decided' as const,
    by: 'x',
    at: '2026-10-16T00:00:00Z',
  });

  it('leaves exact cards, supersedes changed ones, adds new ones, and reports what the import no longer has', () => {
    const recorded = [
      rec('1', 'A', 'a'),
      rec('2', 'B', 'b swallowed the next section'),
      rec('3', 'C', 'c'),
      rec('4', 'C', 'c2', '3'),
      rec('5', 'Gone', 'g'),
    ];
    const plan = planReimport(recorded, [
      imp('A', 'a'),
      imp('B', 'b'),
      imp('C', 'c2'),
      imp('D', 'd'),
    ]);
    expect(plan.unchanged).toBe(2);
    expect(plan.add).toEqual([{ ...imp('B', 'b'), supersedes: '2' }, imp('D', 'd')]);
    expect(plan.orphaned.map((d) => d.id)).toEqual(['5']);
  });
});
