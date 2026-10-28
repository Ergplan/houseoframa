// Code typed in as it is written (Stage 11), from a recorded lift of the sample product: its lines in the
// file's order, never faster than a person reads a line, deleted lines falling out first, and the file
// as the commit left it once caught up.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  codeWindow,
  FALL_MS,
  lineDiff,
  READ_MS,
  typedAt,
  typingPlan,
  type FileChange,
} from './typing.ts';

/** The first change a recorded patch makes to a file: its old text and its new, from the diff. */
function fromPatch(patch: string, file: string): FileChange {
  const at = patch.indexOf(`+++ b/${file}`);
  const hunks = patch.slice(at).split('\ndiff --git')[0]!.split('\n').slice(1);
  const before: string[] = [];
  const after: string[] = [];
  for (const l of hunks) {
    if (l.startsWith('@@')) continue;
    if (l.startsWith('-')) before.push(l.slice(1));
    else if (l.startsWith('+')) after.push(l.slice(1));
    else if (l.startsWith(' ')) {
      before.push(l.slice(1));
      after.push(l.slice(1));
    }
  }
  return {
    path: file,
    before: before.length ? `${before.join('\n')}\n` : null,
    after: `${after.join('\n')}\n`,
  };
}

// The recorded build's first lift, whatever the builder called it.
const recording = path.resolve(import.meta.dirname, '../../../fixtures/sample-build');
const lift1 = readFileSync(
  path.join(
    recording,
    readdirSync(recording).find((f) => f.startsWith('0001-'))!,
  ),
  'utf8',
);

describe('the typing stream', () => {
  it('types a recorded lift’s new file line by line, in order, at no more than a line per READ_MS', () => {
    const file = [...lift1.matchAll(/^\+\+\+ b\/(features\/[^\n]+\.ts)$/gm)].map((m) => m[1]!)[0]!;
    const change = fromPatch(lift1, file);
    const plan = typingPlan(change, 0);
    expect(plan.deleted).toBe(0);
    expect(plan.lineMs).toBe(READ_MS);
    const lines = change.after!.replace(/\n$/, '').split('\n');
    expect(plan.added).toBe(lines.length);
    // Before the first line is done, it is being typed and nothing after it shows.
    const early = typedAt(plan, READ_MS / 2);
    expect(early).toHaveLength(1);
    expect(early[0]).toMatchObject({ state: 'typing', text: lines[0] });
    // A line at a time, in order; never two lines finished in less than READ_MS each.
    for (let n = 1; n <= lines.length; n++) {
      const shown = typedAt(plan, n * READ_MS).filter((l) => l.state === 'typed');
      expect(shown.map((l) => l.text)).toEqual(lines.slice(0, n));
      expect(typedAt(plan, n * READ_MS - 1).filter((l) => l.state === 'typed')).toHaveLength(n - 1);
    }
    expect(typedAt(plan, Infinity).map((l) => l.shown)).toEqual(lines);
  });

  it('goes at the builder’s pace when it is slower than a reader, and never faster', () => {
    const change = { path: 'a.ts', before: null, after: 'one\ntwo\n' };
    expect(typingPlan(change, 10_000).lineMs).toBe(5000);
    expect(typingPlan(change, 100).lineMs).toBe(READ_MS);
  });

  it('lets deleted lines fall out first, keeps what stays, then types the new', () => {
    const change = {
      path: 'a.ts',
      before: 'keep\nold one\nold two\nend\n',
      after: 'keep\nnew\nend\n',
    };
    expect(lineDiff(change.before, change.after)).toEqual([
      { op: 'keep', text: 'keep' },
      { op: 'add', text: 'new' },
      { op: 'del', text: 'old one' },
      { op: 'del', text: 'old two' },
      { op: 'keep', text: 'end' },
    ]);
    const plan = typingPlan(change);
    expect(typedAt(plan, 0).map((l) => [l.text, l.state])).toEqual([
      ['keep', 'kept'],
      ['old one', 'falling'],
      ['old two', 'falling'],
      ['end', 'kept'],
    ]);
    expect(typedAt(plan, FALL_MS).map((l) => l.text)).toEqual(['keep', 'new', 'end']);
    expect(typedAt(plan, FALL_MS)[1]).toMatchObject({ state: 'typing', shown: '' });
    expect(typedAt(plan, plan.total).map((l) => l.shown)).toEqual(['keep', 'new', 'end']);
    // A file deleted: every line falls, nothing is typed.
    const gone = typingPlan({ path: 'b.ts', before: 'x\ny\n', after: null });
    expect(typedAt(gone, Infinity)).toEqual([]);
  });

  it('gives the same frame for the same change and moment', () => {
    const plan = typingPlan(
      fromPatch(lift1, [...lift1.matchAll(/^\+\+\+ b\/([^\n]+)$/gm)][0]![1]!),
    );
    expect(JSON.stringify(typedAt(plan, 2345))).toBe(JSON.stringify(typedAt(plan, 2345)));
  });
});

describe('the window over the brick being written', () => {
  const plan = typingPlan({
    path: 'f.ts',
    before: 'a\nb\nc\n',
    after: Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'),
  });

  it('shows the rows around the line typing in, with its line number', () => {
    const at = plan.typeFrom + 12.5 * plan.lineMs; // line 13 half typed
    const w = codeWindow(typedAt(plan, at), 8);
    expect(w.lines).toHaveLength(8);
    expect(w.lines[w.active!]!.state).toBe('typing');
    expect(w.lines[w.active!]!.text).toBe('line 13');
    expect(w.from).toBe(13 - w.active!);
  });

  it('shows the deletions while they fall, and the whole of a short file', () => {
    const w = codeWindow(typedAt(plan, 0), 8);
    expect(w.lines.some((l) => l.state === 'falling')).toBe(true);
    const short = typingPlan({ path: 'g.ts', before: null, after: 'x\ny\n' });
    expect(codeWindow(typedAt(short, Infinity), 8)).toEqual({
      from: 1,
      lines: typedAt(short, Infinity),
      active: 1,
    });
  });
});
