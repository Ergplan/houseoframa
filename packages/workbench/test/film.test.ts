// The film (Stage 13), assembled from the record and nothing else: the plan from the decided cards in the
// order they were first written; the foundation from the house-stack commit, every file of the house stack
// with its fixed plain-word name; each lift with the builder's own words when they were kept, else the
// commit's subject marked as such; the lines each lift added, the order the builder saved the files in,
// and the tables lit; and a grey flag where the checks stopped a lift.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Blueprint, BrickNode } from '@rama/shared';
import { createProductSite, type SiteLocation } from '@rama/blueprint/site';
import { foundationFrames, layerOfPath, SHELL_BLOCKS } from '../src/foundation.ts';
import { filmOf, liftsFile, planSteps, saidFromStep, type LiftRecord } from '../src/film.ts';
import { typingFile } from '../src/tail.ts';

const HOUSE = path.resolve(import.meta.dirname, '../../../templates/house-stack');
let work: string;
let env: NodeJS.ProcessEnv;
let site: SiteLocation;
const shas: string[] = [];

const git = (args: string[]) =>
  execFileSync('git', ['-C', site.repoDir, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'House of Rama',
      GIT_AUTHOR_EMAIL: 'rama@example.com',
      GIT_COMMITTER_NAME: 'House of Rama',
      GIT_COMMITTER_EMAIL: 'rama@example.com',
    },
  }).trim();
const write = (p: string, text: string) => {
  mkdirSync(path.dirname(path.join(site.repoDir, p)), { recursive: true });
  writeFileSync(path.join(site.repoDir, p), text);
};
const commit = (subject: string) => {
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', subject]);
  const sha = git(['rev-parse', 'HEAD']);
  shas.push(sha);
  return sha;
};
const card = (o: Record<string, unknown>) =>
  appendFileSync(path.join(site.repoDir, '.rama/decisions.jsonl'), `${JSON.stringify(o)}\n`);

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-film-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  site = createProductSite({ id: 'bills', name: 'Read my bill', idea: 'Reads bills.', env }, (d) =>
    execFileSync('git', ['-C', d, 'init', '--quiet', '--initial-branch=main']),
  );
  write('package.json', '{\n  "name": "bills"\n}\n');
  write('db/schema.ts', 'export const x = 1;\n');
  write('rama/figures.ts', 'export const figures = {};\n');
  write('weird/thing.ts', 'export const y = 2;\n');
  mkdirSync(path.join(site.repoDir, '.rama'), { recursive: true });
  const at = '2026-10-30T10:00:00.000Z';
  card({
    id: 'a1',
    siteId: 'bills',
    title: 'Read the bill',
    statement: 'Pull six things off a bill.',
    bricks: [],
    status: 'open',
    by: 'Meera',
    at,
  });
  card({
    id: 'b1',
    siteId: 'bills',
    title: 'Keep it',
    statement: 'One row per bill.',
    bricks: [],
    status: 'open',
    by: 'Meera',
    at,
  });
  card({
    id: 'a2',
    siteId: 'bills',
    title: 'Read the bill',
    statement: 'Pull six things off a bill.',
    bricks: [],
    status: 'decided',
    by: 'Meera',
    at,
    supersedes: 'a1',
  });
  card({
    id: 'w1',
    siteId: 'bills',
    title: 'Dropped',
    statement: 'Never mind.',
    bricks: [],
    status: 'withdrawn',
    by: 'Meera',
    at,
  });
  commit('Start from the house stack');
  // Lift 1: the reader and the table; the checks stop it.
  write('features/read/read.ts', 'export function readBill() {\n  return 412;\n}\n');
  write('db/bills.ts', 'export const bills = "bills";\n');
  write('db/schema.ts', 'export const x = 1;\nexport const bills = 2;\n');
  commit('Read the bill: the reader and the bills table');
  // Lift 2: the fix.
  write('features/read/read.test.ts', 'it("reads 412", () => {});\n');
  commit('Put a test behind the reader');
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

const node = (p: string, over: Partial<BrickNode> = {}): BrickNode => ({
  path: p,
  layer: 'x',
  layerRule: 'x',
  lines: 3,
  bytes: 30,
  binary: false,
  test: false,
  exports: [],
  env: [],
  envDynamic: false,
  firstCommit: 'c',
  lastCommit: 'c',
  changes: 1,
  ...over,
});
const blueprint = () =>
  ({
    nodes: [
      node('features/read/read.ts'),
      node('db/bills.ts', { tables: [{ name: 'bills', reads: true, writes: true }] }),
      node('features/read/read.test.ts', {
        test: true,
        tables: [{ name: 'bills', reads: true, writes: false }],
      }),
      node('app/page.tsx', { tables: [{ name: 'bills', reads: true, writes: false }] }),
    ],
    tables: [
      {
        name: 'bills',
        symbol: 'bills',
        file: 'db/schema.ts',
        line: 1,
        columns: ['id', 'units'],
        fields: [
          {
            key: 'id',
            name: 'id',
            type: 'serial',
            notNull: true,
            primary: true,
            secret: false,
            unique: false,
          },
          {
            key: 'units',
            name: 'units',
            type: 'integer',
            notNull: true,
            primary: false,
            secret: false,
            unique: false,
          },
        ],
      },
    ],
  }) as unknown as Blueprint;
const owners: Record<string, string> = {
  'features/read/read.ts': 'read',
  'db/bills.ts': 'read',
  'app/page.tsx': 'show',
};
const film = () =>
  filmOf({
    site,
    name: 'Read my bill',
    idea: 'Reads bills.',
    builder: 'claude-code',
    blueprint: blueprint(),
    buildings: [
      {
        id: 'read',
        name: 'Read the bill',
        does: null,
        screens: ['/'],
        tables: [],
        services: ['the web'],
      },
      {
        id: 'show',
        name: 'Show the bill',
        does: null,
        screens: ['/bill'],
        tables: [],
        services: [],
      },
    ],
    buildingOf: (p) => owners[p] ?? null,
    env,
  });

describe('the foundation', () => {
  it('names every file of the house stack in plain words, as fixed text, never drafted', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        if (f === 'node_modules') continue;
        const full = path.join(d, f);
        if (statSync(full).isDirectory()) walk(full);
        else files.push(path.relative(HOUSE, full).split(path.sep).join('/'));
      }
    };
    walk(HOUSE);
    expect(files.filter((f) => !SHELL_BLOCKS[f])).toEqual([]);
    for (const b of Object.values(SHELL_BLOCKS)) {
      expect(b.name.length).toBeGreaterThan(3);
      expect(b.what).not.toMatch(
        /\b(repo|commit|import|schema|endpoint|function|component|async|API)\b/i,
      );
    }
  });

  it('lays the ground first and the checks last; an unknown file keeps its path and has no sentence', () => {
    const frames = foundationFrames([
      { path: '.github/workflows/rama-gate.yml', lines: 10 },
      { path: 'app/page.tsx', lines: 10 },
      { path: 'db/connect.ts', lines: 10 },
      { path: 'rama/figures.ts', lines: 10 },
      { path: 'weird/thing.ts', lines: 1 },
    ]);
    expect(frames.map((f) => f.layer)).toEqual([
      'remembers',
      'decides',
      'decides',
      'shows',
      'checks',
    ]);
    expect(frames.find((f) => f.path === 'weird/thing.ts')).toMatchObject({
      name: 'weird/thing.ts',
      what: null,
    });
    expect(frames[0]).toMatchObject({ name: 'The pipe to the ground' });
  });

  it('puts any product file on its layer', () => {
    expect(layerOfPath('features/read/read.test.ts')).toBe('checks');
    expect(layerOfPath('db/bills.ts')).toBe('remembers');
    expect(layerOfPath('lib/web.ts')).toBe('talks');
    expect(layerOfPath('app/bill/page.tsx')).toBe('shows');
    expect(layerOfPath('features/read/read.ts')).toBe('decides');
  });
});

describe('the plan', () => {
  it('is the cards in force, in the order first written, each with who said yes; withdrawn ones leave', () => {
    expect(planSteps(site.repoDir)).toEqual([
      {
        n: 1,
        title: 'Read the bill',
        statement: 'Pull six things off a bill.',
        decided: { by: 'Meera', at: '2026-10-30T10:00:00.000Z' },
      },
      { n: 2, title: 'Keep it', statement: 'One row per bill.', decided: null },
    ]);
  });
});

describe('the lifts', () => {
  it('without kept words, say what changed from the commit and say so', () => {
    const f = film();
    expect(f.foundation!.commit).toBe(shas[0]);
    expect(f.foundation!.frames.map((x) => x.path).sort()).toEqual(
      [
        '.rama/decisions.jsonl',
        'db/schema.ts',
        'package.json',
        'rama/figures.ts',
        'weird/thing.ts',
      ].sort(),
    );
    expect(f.lifts.map((l) => [l.n, l.subject, l.said])).toEqual([
      [
        1,
        'Read the bill: the reader and the bills table',
        { text: 'Read the bill: the reader and the bills table', source: 'commit' },
      ],
      [
        2,
        'Put a test behind the reader',
        { text: 'Put a test behind the reader', source: 'commit' },
      ],
    ]);
    expect(f.status).toBe('built');
  });

  it('carry the builder’s own words and the checks when the build kept them', () => {
    const rec = (r: Partial<LiftRecord>) =>
      appendFileSync(liftsFile('bills', env), `${JSON.stringify(r)}\n`);
    mkdirSync(path.dirname(liftsFile('bills', env)), { recursive: true });
    rec({
      n: 1,
      commit: shas[1],
      subject: 'x',
      said: 'I wrote the reader.',
      next: 'Tests next.',
      ok: false,
      problems: ['No passing check stands behind db/bills.ts.'],
      at: '2026-10-30T10:01:00Z',
    });
    rec({
      n: 2,
      commit: shas[2],
      subject: 'y',
      said: 'I added the test.',
      next: null,
      ok: true,
      problems: [],
      at: '2026-10-30T10:02:00Z',
    });
    const [l1, l2] = film().lifts;
    expect(l1!.said).toEqual({ text: 'I wrote the reader.', source: 'builder' });
    expect(l1!.next).toBe('Tests next.');
    expect(l1!.checked).toEqual({
      ok: false,
      sentence: 'No passing check stands behind db/bills.ts.',
      next: 'The builder fixes this in the next lift.',
    });
    expect(l2!.checked).toMatchObject({ ok: true });
  });

  it('show each file after the lift with its new lines, its building, layer and tables, in the order saved', () => {
    writeFileSync(
      typingFile('bills', env),
      [
        { at: 1900, lift: 1, path: 'db/bills.ts', before: null, after: 'x' },
        { at: 100, lift: 1, path: 'features/read/read.ts', before: null, after: 'x' },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n') + '\n',
    );
    const l1 = film().lifts[0]!;
    expect(l1.files.map((f) => f.path)).toEqual([
      'features/read/read.ts',
      'db/bills.ts',
      'db/schema.ts',
    ]);
    const reader = l1.files[0]!;
    expect(reader).toMatchObject({
      status: 'added',
      building: 'read',
      layer: 'decides',
      added: [1, 2, 3],
      at: 100,
    });
    expect(reader.text).toBe('export function readBill() {\n  return 412;\n}');
    const schema = l1.files.find((f) => f.path === 'db/schema.ts')!;
    expect(schema).toMatchObject({ status: 'changed', added: [2], building: null });
    expect(l1.files.find((f) => f.path === 'db/bills.ts')!.tables).toEqual([
      { name: 'bills', reads: true, writes: true },
    ]);
    expect(l1.tablesLit).toEqual(['bills']);
    expect(film().lifts[1]!.tablesLit).toEqual([]);
  });
});

describe('the design', () => {
  it('says which buildings write a table and which only read it, from the Blueprint', () => {
    expect(film().design.tables).toEqual([
      {
        name: 'bills',
        columns: [
          { name: 'id', type: 'serial', key: 'id', from: undefined },
          { name: 'units', type: 'integer', key: 'units', from: undefined },
        ],
        writers: ['read'],
        readers: ['show'],
        writeFiles: ['db/bills.ts'],
        readFiles: ['app/page.tsx'],
      },
    ]);
    expect(film().design.services).toEqual(['the web']);
  });
});

describe('the builder’s words in a job step', () => {
  it('are the step’s sentence without its subject and without the checks’ own sentence', () => {
    expect(
      saidFromStep(
        '“Take an order”: The screen now shows the amount. 2 screens; 4 of 4 figures traced and 4 worked out again the same; 2 of 2 screens Verified. Checked in 30 s.',
        'Take an order',
      ),
    ).toBe('The screen now shows the amount.');
    expect(saidFromStep('Something else', 'Take an order')).toBeNull();
  });
});
