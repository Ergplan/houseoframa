import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRepo, type FixtureRepo } from '../test/fixture-repo.ts';
import { canonicalJson } from './json.ts';
import { countLines, extract, isBinary } from './extract.ts';
import { mergeGlossary } from './glossary.ts';

let repo: FixtureRepo;
const shas: string[] = [];

beforeAll(() => {
  repo = fixtureRepo();
  repo.write({
    'package.json': JSON.stringify({
      name: 'fixture',
      dependencies: { next: '16.0.0', react: '19.0.0' },
      devDependencies: { vitest: '5.0.0' },
    }),
    'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }',
    'next.config.mjs': 'export default {};\n',
    'lib/data.ts': 'export const ROWS = [1, 2, 3];\nexport type Row = number;\n',
    'lib/calc.ts': "import { ROWS, type Row } from './data';\nexport const total = (): Row => ROWS.length;\n",
    'app/layout.tsx': "import './globals.css';\nexport default function L({ children }: { children: unknown }) { return children; }\n",
    'app/globals.css': 'body { margin: 0 }\n',
    'app/page.tsx': "import { total } from '@/lib/calc';\nexport default function P() { return total(); }\n",
    'old-name.md': 'one\ntwo\n',
    'gone.txt': Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') + '\n',
  });
  shas.push(repo.commit('first', 'Asha'));
  repo.write({
    'app/bills/[id]/page.tsx': "import type { Row } from '@/lib/data';\nexport default function B(): Row { return process.env.SHOW ? 1 : 0; }\n",
    'app/(marketing)/about/page.tsx': 'export default function A() { return null; }\n',
    'app/_private/page.tsx': 'export default function X() { return null; }\n',
    'public/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]),
    'lib/calc.test.ts': "import { total } from './calc';\ntotal();\n",
  });
  repo.git('mv', 'old-name.md', 'new-name.md');
  repo.remove('gone.txt');
  shas.push(repo.commit('second', 'Ravi'));
  repo.write({
    '.rama/glossary.json': JSON.stringify({
      ROWS: { text: 'the rows', confirmedBy: 'Asha', confirmedAt: '2026-01-05' },
      'lib/calc.ts#total': { text: 'the row count' },
    }),
  });
  shas.push(repo.commit('glossary', 'Asha'));
});

afterAll(() => repo?.cleanup());

describe('extract on a fixture repository', () => {
  it('is byte-identical when the same commit is extracted twice', () => {
    expect(canonicalJson(extract(repo.dir))).toBe(canonicalJson(extract(repo.dir)));
  });

  it('reads the commit, not the working tree', () => {
    const before = canonicalJson(extract(repo.dir));
    repo.write({ 'lib/calc.ts': 'export const changed = 1;\n', 'untracked.ts': 'x\n' });
    try {
      expect(canonicalJson(extract(repo.dir))).toBe(before);
    } finally {
      repo.git('checkout', '--', 'lib/calc.ts');
      repo.remove('untracked.ts');
    }
  });

  it('extracts an earlier commit with --rev', () => {
    const bp = extract(repo.dir, { rev: shas[0] });
    expect(bp.commit).toBe(shas[0]);
    expect(bp.commits).toHaveLength(1);
    expect(bp.nodes.map((n) => n.path)).toContain('gone.txt');
  });

  it('records the full history, oldest first, with kind, counts, renames and authors', () => {
    const bp = extract(repo.dir);
    expect(bp.commits.map((c) => [c.subject, c.author])).toEqual([
      ['first', 'Asha'],
      ['second', 'Ravi'],
      ['glossary', 'Asha'],
    ]);
    const second = bp.commits[1]!;
    expect(second.short).toBe(second.sha.slice(0, 7));
    expect(second.changes.find((c) => c.path === 'gone.txt')).toMatchObject({ kind: 'D', del: 30 });
    expect(second.changes.find((c) => c.path === 'new-name.md')).toMatchObject({ kind: 'R', from: 'old-name.md' });
    expect(second.changes.find((c) => c.path === 'public/logo.png')).toMatchObject({ kind: 'A', add: null, del: null });
    expect(bp.extractedAt).toBe('2026-01-03T10:00:03+05:30');
  });

  it('describes each brick: lines, bytes, binary, test, exports, env, history', () => {
    const bp = extract(repo.dir);
    const by = (p: string) => bp.nodes.find((n) => n.path === p)!;
    expect(by('lib/data.ts')).toMatchObject({
      lines: 2,
      binary: false,
      exports: ['ROWS', 'Row'],
      layer: 'data',
      layerRule: 'default: lib/data*, lib/history*',
      firstCommit: shas[0],
      lastCommit: shas[0],
      changes: 1,
    });
    expect(by('public/logo.png')).toMatchObject({ binary: true, lines: 0, bytes: 7, layer: 'data' });
    expect(by('lib/calc.test.ts').test).toBe(true);
    expect(by('app/bills/[id]/page.tsx').env).toEqual(['SHOW']);
    expect(by('new-name.md')).toMatchObject({ firstCommit: shas[1], changes: 1 });
  });

  it('resolves edges with symbols, type-only and side-effect imports', () => {
    const edges = extract(repo.dir).edges.map((e) => ({ from: e.from, to: e.to, symbols: e.symbols, typeOnly: e.typeOnly }));
    expect(edges).toEqual([
      { from: 'app/bills/[id]/page.tsx', to: 'lib/data.ts', symbols: ['Row'], typeOnly: true },
      { from: 'app/layout.tsx', to: 'app/globals.css', symbols: [], typeOnly: false },
      { from: 'app/page.tsx', to: 'lib/calc.ts', symbols: ['total'], typeOnly: false },
      { from: 'lib/calc.test.ts', to: 'lib/calc.ts', symbols: ['total'], typeOnly: false },
      { from: 'lib/calc.ts', to: 'lib/data.ts', symbols: ['ROWS', 'Row'], typeOnly: false },
    ]);
  });

  it('lists external dependencies per manifest with dev flags', () => {
    expect(extract(repo.dir).external).toEqual([
      { name: 'next', version: '16.0.0', dev: false, manifest: 'package.json' },
      { name: 'react', version: '19.0.0', dev: false, manifest: 'package.json' },
      { name: 'vitest', version: '5.0.0', dev: true, manifest: 'package.json' },
    ]);
  });

  it('discovers screens from the app tree: groups dropped, private folders skipped, layouts in the closure', () => {
    const screens = extract(repo.dir).screens;
    expect(screens.map((s) => [s.id, s.file])).toEqual([
      ['/', 'app/page.tsx'],
      ['/about', 'app/(marketing)/about/page.tsx'],
      ['/bills/[id]', 'app/bills/[id]/page.tsx'],
    ]);
    const home = screens[0]!;
    expect(home.name).toBe('Home');
    expect(home.bricks).toEqual(['app/globals.css', 'app/layout.tsx', 'app/page.tsx', 'lib/calc.ts', 'lib/data.ts']);
    // A type-only import renders nothing, so it is not in the closure.
    expect(screens[2]!.bricks).not.toContain('lib/data.ts');
  });

  it('merges the glossary overlay: confirmed, unconfirmed and partial phrases', () => {
    const edges = extract(repo.dir).edges;
    const e = (from: string, to: string) => edges.find((x) => x.from === from && x.to === to)!;
    // ROWS confirmed, Row has no phrase: the edge is partial, so not confirmed.
    expect(e('lib/calc.ts', 'lib/data.ts').english).toEqual({ text: 'the rows', confirmed: false });
    // A path-qualified phrase with no confirmation is a draft.
    expect(e('app/page.tsx', 'lib/calc.ts').english).toEqual({ text: 'the row count', confirmed: false });
    expect(e('app/layout.tsx', 'app/globals.css').english).toBeUndefined();
  });

  it('confirms an edge only when every symbol has a confirmed phrase', () => {
    const [edge] = mergeGlossary([{ from: 'a', to: 'b', symbols: ['X', 'Y'], typeOnly: false }], {
      X: { text: 'the x', confirmedBy: 'Asha', confirmedAt: '2026-01-02' },
      'b#Y': { text: 'the y', confirmedBy: 'Ravi', confirmedAt: '2026-01-03' },
    });
    expect(edge!.english).toEqual({ text: 'the x; the y', confirmed: true, by: 'Asha, Ravi', at: '2026-01-03' });
  });

  it('records only refs in the extracted history, so a later tag stays out of an older commit', () => {
    repo.git('tag', 'v-later', shas[2]!);
    repo.git('branch', 'side', shas[0]!);
    try {
      const old = extract(repo.dir, { rev: shas[1] });
      expect(old.tags).toEqual([]);
      expect(old.branches).toEqual(['side']);
      expect(extract(repo.dir).tags).toEqual(['v-later']);
      expect(extract(repo.dir).branches).toEqual(['main', 'side']);
    } finally {
      repo.git('tag', '-d', 'v-later');
      repo.git('branch', '-D', 'side');
    }
  });

  it('names the repository by its origin without credentials, else by its directory', () => {
    expect(extract(repo.dir).repo).toBe(repo.dir.split('/').at(-1));
    repo.git('remote', 'add', 'origin', 'https://user:secret-token@example.com/team/fixture.git');
    try {
      expect(extract(repo.dir).repo).toBe('https://example.com/team/fixture');
      expect(canonicalJson(extract(repo.dir))).not.toContain('secret-token');
    } finally {
      repo.git('remote', 'remove', 'origin');
    }
  });

  it('refuses a malformed overlay with the file name', () => {
    repo.write({ '.rama/layers.json': '{ "rules": [{ "layer": "logic" }] }' });
    repo.commit('bad overlay');
    try {
      expect(() => extract(repo.dir)).toThrow(/\.rama\/layers\.json does not match its schema/);
    } finally {
      repo.git('reset', '-q', '--hard', 'HEAD~1');
    }
  });
});

describe('extract --worktree (a repository carrying its own Blueprint)', () => {
  let w: FixtureRepo;
  const opts = { worktree: true, exclude: ['blueprint/*.json'] };

  beforeAll(() => {
    w = fixtureRepo();
    w.write({ 'a.ts': 'export const a = 1;\n' });
    w.commit('one');
  });
  afterAll(() => w?.cleanup());

  it('generated before a commit equals regenerated after it, and after a Blueprint-only commit', () => {
    w.write({ 'b.ts': "import { a } from './a';\nexport const b = a;\n" });
    w.git('add', '-A');
    const pending = canonicalJson(extract(w.dir, opts));
    w.write({ 'blueprint/self.json': pending });
    w.commit('two, with its Blueprint');
    expect(canonicalJson(extract(w.dir, opts))).toBe(pending);
    w.write({ 'blueprint/self.json': pending + ' ' });
    w.commit('touch only the Blueprint');
    expect(canonicalJson(extract(w.dir, opts))).toBe(pending);
  });

  it('sits on HEAD while changes are pending, and leaves refs out', () => {
    w.write({ 'a.ts': 'export const a = 2;\n' });
    const head = w.git('rev-parse', 'HEAD').trim();
    const bp = extract(w.dir, opts);
    expect(bp).toMatchObject({ worktree: true, commit: head, branches: [], tags: [] });
    expect(bp.nodes.map((n) => n.path)).toEqual(['a.ts', 'b.ts']);
    w.git('checkout', '--', 'a.ts');
  });
});

describe('file helpers', () => {
  it('counts lines with and without a final newline', () => {
    expect([countLines(''), countLines('a'), countLines('a\n'), countLines('a\nb')]).toEqual([0, 1, 1, 2]);
  });
  it('treats a NUL byte in the first 8000 bytes as binary', () => {
    expect(isBinary(Buffer.from('plain text'))).toBe(false);
    expect(isBinary(Buffer.from([0x41, 0x00]))).toBe(true);
  });
});
