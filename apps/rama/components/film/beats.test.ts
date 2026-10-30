// A lift's beats (Stage 13): with the builder's stream kept, its words and tools in the order it used
// them, each file typed when the builder wrote it, a file the stream never showed typed after, then the
// checks; without a stream, its words for the lift, its files, the checks.
import { describe, expect, it } from 'vitest';
import type { FilmFile, FilmLift } from '@rama/workbench';
import { actWords, liftBeats } from './beats';

const file = (path: string): FilmFile => ({
  path,
  building: null,
  layer: 'decides',
  status: 'added',
  text: 'x',
  added: [1],
  removed: 0,
  cut: false,
  at: null,
  tables: [],
});
const lift = (over: Partial<FilmLift>): FilmLift => ({
  n: 1,
  commit: 'abc',
  subject: 'Read the bill',
  at: '2026-10-31T00:00:00Z',
  said: { text: 'I wrote the reader.', source: 'builder' },
  next: null,
  checked: { ok: true, sentence: 'ok', next: null },
  files: [file('features/read/read.ts'), file('db/bills.ts')],
  tablesLit: [],
  narration: [],
  ...over,
});

describe('a lift’s beats', () => {
  it('without a kept stream: the words, each file, the checks', () => {
    expect(liftBeats(lift({}))).toEqual([
      { kind: 'say', text: 'I wrote the reader.', source: 'builder' },
      { kind: 'file', index: 0 },
      { kind: 'file', index: 1 },
      { kind: 'checked' },
    ]);
  });

  it('with the stream: words and tools in order, a file typed when written, the rest after', () => {
    const l = lift({
      narration: [
        { lift: 1, at: 10, kind: 'said', text: 'I will read the bill first.' },
        {
          lift: 1,
          at: 20,
          kind: 'tool',
          text: 'Read idea/files/bill.pdf',
          tool: 'Read',
          target: 'idea/files/bill.pdf',
        },
        {
          lift: 1,
          at: 30,
          kind: 'tool',
          text: 'Write …',
          tool: 'Write',
          target: '/work/bills/repo/features/read/read.ts',
        },
        {
          lift: 1,
          at: 40,
          kind: 'tool',
          text: 'Edit …',
          tool: 'Edit',
          target: '/work/bills/repo/features/read/read.ts',
        },
        { lift: 1, at: 50, kind: 'said', text: 'Now a test.' },
        { lift: 1, at: 60, kind: 'result', text: 'done' },
      ],
    });
    expect(liftBeats(l)).toEqual([
      { kind: 'say', text: 'I will read the bill first.', source: 'builder' },
      { kind: 'act', tool: 'Read', target: 'idea/files/bill.pdf' },
      { kind: 'file', index: 0 },
      { kind: 'say', text: 'Now a test.', source: 'builder' },
      { kind: 'say', text: 'I wrote the reader.', source: 'builder' },
      { kind: 'file', index: 1 },
      { kind: 'checked' },
    ]);
  });

  it('keeps a commit subject marked as what changed, not as the builder’s words', () => {
    expect(liftBeats(lift({ said: { text: 'Read the bill', source: 'commit' } }))[0]).toEqual({
      kind: 'say',
      text: 'Read the bill',
      source: 'commit',
    });
  });

  it('says a tool in plain words', () => {
    expect(actWords('Read', 'idea/files/bill.pdf')).toBe('read idea/files/bill.pdf');
    expect(actWords('Bash', 'npx vitest run')).toBe('ran npx vitest run');
    expect(actWords('Grep', null)).toBe('looked for');
  });
});
