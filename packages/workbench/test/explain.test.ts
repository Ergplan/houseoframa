// Plain English beside every block (Stage 11): one drafter call per block, kept by the block's hash so it
// is never asked twice; drafted and unconfirmed until a named person confirms it, which writes the
// product's .rama/explanations.json and an audit_log row; with no drafter key, "Not explained yet".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createProductSite, type SiteLocation } from '@rama/blueprint/site';
import { createDb, ensurePerson, runMigrations, sites, type Db, type Member } from '@rama/db';
import type { call } from '@rama/model';
import { splitBlocks } from '../src/blocks.ts';
import { confirmExplanation, explainFile, explanationsFor } from '../src/explain.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let env: NodeJS.ProcessEnv;
let site: SiteLocation;
let conn: ReturnType<typeof createDb>;
let db: Db;
let asha: Member;

const FILE = 'features/new/plan.ts';
const SOURCE = [
  "import { SHOW } from '../../rama/define';",
  '',
  '/** Cups times the price of a cup. */',
  'export function newOrderAmount(cups: number, pricePaise: number): number {',
  '  return cups * pricePaise;',
  '}',
  '',
  'export const CUPS = [1, 2, 3];',
  '',
].join('\n');

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(dbUrl);
  db = conn.db;
  await runMigrations(db);
  work = mkdtempSync(path.join(tmpdir(), 'rama-explain-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  site = createProductSite({ id: 'chai', name: 'Chai', idea: 'Chai.', env }, (d) =>
    execFileSync('git', ['-C', d, 'init', '--quiet']),
  );
  asha = await ensurePerson(db, { name: 'Asha Rao', role: 'customer' }, 'rama:test@0');
  await db
    .insert(sites)
    .values({ siteId: 'chai', name: 'Chai', repo: 'chai', memberId: asha.id, createdBy: asha.id });
});
afterAll(async () => {
  await conn.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

describe('the English pane', () => {
  it('says "Not explained yet" for every block while no drafter can be asked', async () => {
    const noKey = (async () => {
      throw new Error('ANTHROPIC_API_KEY is not set: enter the Anthropic key in Settings');
    }) as unknown as typeof call;
    const r = await explainFile(site, FILE, SOURCE, () => [], { env, call: noKey });
    expect(r).toEqual({
      drafted: 0,
      failed: 'ANTHROPIC_API_KEY is not set: enter the Anthropic key in Settings',
    });
    const blocks = splitBlocks(FILE, SOURCE);
    expect(explanationsFor(site, blocks, { env }).map((e) => e.state)).toEqual([
      'none',
      'none',
      'none',
    ]);
  });

  it('asks the drafter once per block, with only the block, its imports and its figure, and keeps it', async () => {
    const asked: Parameters<typeof call>[0][] = [];
    const drafter = (async (req: Parameters<typeof call>[0]) => {
      asked.push(req);
      const input = req.input as { name: string };
      return {
        output: {
          sentence:
            input.name === 'newOrderAmount'
              ? 'Works out what a new order costs: the cups times the price of a cup.'
              : input.name === null
                ? 'Brings in the ways a figure is written on the screen.'
                : 'Keeps the choice of one, two or three cups.',
          figure: input.name === 'newOrderAmount' ? 'New order amount' : 'Something made up',
        },
        callId: `c${asked.length}`,
        vendor: 'openai',
        model: 'gpt-6.1-sol',
        attempts: 1,
        inputTokens: 10,
        outputTokens: 10,
      };
    }) as unknown as typeof call;
    const figures = (b: { name: string | null }) =>
      b.name === 'newOrderAmount'
        ? [{ id: 'new-order-amount', title: 'New order amount', what: 'What a new order costs.' }]
        : [];
    expect(await explainFile(site, FILE, SOURCE, figures, { env, call: drafter })).toEqual({
      drafted: 3,
      failed: null,
    });
    // Every block is explained, the import group too (reviewer run 1), each once.
    expect(
      asked.map((a) => [a.name, a.version, a.role, (a.input as { name: string }).name]),
    ).toEqual([
      ['explain', 1, 'drafter', null],
      ['explain', 1, 'drafter', 'newOrderAmount'],
      ['explain', 1, 'drafter', 'CUPS'],
    ]);
    expect(asked[1]!.input).toEqual({
      file: FILE,
      kind: 'function',
      name: 'newOrderAmount',
      code: '\n/** Cups times the price of a cup. */\nexport function newOrderAmount(cups: number, pricePaise: number): number {\n  return cups * pricePaise;\n}',
      imports: [],
      figures: [
        { id: 'new-order-amount', title: 'New order amount', what: 'What a new order costs.' },
      ],
    });
    // Asked again: nothing new is drafted, by hash.
    expect(await explainFile(site, FILE, SOURCE, figures, { env, call: drafter })).toEqual({
      drafted: 0,
      failed: null,
    });
    expect(asked).toHaveLength(3);
    const blocks = splitBlocks(FILE, SOURCE);
    expect(explanationsFor(site, blocks, { env })).toEqual([
      {
        state: 'unconfirmed',
        sentence: 'Brings in the ways a figure is written on the screen.',
        figure: null,
        drafter: 'openai (gpt-6.1-sol)',
      },
      {
        state: 'unconfirmed',
        sentence: 'Works out what a new order costs: the cups times the price of a cup.',
        figure: 'New order amount',
        drafter: 'openai (gpt-6.1-sol)',
      },
      // A figure the mapping did not give is never named.
      {
        state: 'unconfirmed',
        sentence: 'Keeps the choice of one, two or three cups.',
        figure: null,
        drafter: 'openai (gpt-6.1-sol)',
      },
    ]);
  });

  it('shows a draft at a commit only when it was drafted there or before (replay)', async () => {
    const repo = site.repoDir;
    const g = (...a: string[]) =>
      execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
    const commitWith = (text: string) => {
      writeFileSync(path.join(repo, 'r.ts'), text);
      g('add', 'r.ts');
      g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', text.slice(0, 20));
      return g('rev-parse', 'HEAD');
    };
    const src = 'export const LATE = 1;\n';
    const early = commitWith('export const EARLY = 0;\n' + src);
    const late = commitWith('export const EARLY = 0;\n' + src + '// later\n');
    const one = (async () => ({
      output: { sentence: 'Keeps a number.', figure: null },
      callId: 'c',
      vendor: 'openai',
      model: 'm',
      attempts: 1,
      inputTokens: 1,
      outputTokens: 1,
    })) as unknown as typeof call;
    await explainFile(site, 'r.ts', src, () => [], { env, call: one, commit: late });
    const b = splitBlocks('r.ts', src);
    expect(explanationsFor(site, b, { env, commit: late })[0]!.state).toBe('unconfirmed');
    // Drafted after the earlier commit: at it, the same text was not explained yet.
    expect(explanationsFor(site, b, { env, commit: early })).toEqual([{ state: 'none' }]);
  });

  it('keeps no sentence in developer words', async () => {
    const src = 'export const LATER = 4;\n';
    const dev = (async () => ({
      output: { sentence: 'An endpoint constant from the repo.', figure: null },
      callId: 'c9',
      vendor: 'openai',
      model: 'm',
      attempts: 1,
      inputTokens: 1,
      outputTokens: 1,
    })) as unknown as typeof call;
    expect(await explainFile(site, 'x.ts', src, () => [], { env, call: dev })).toEqual({
      drafted: 0,
      failed: null,
    });
    expect(explanationsFor(site, splitBlocks('x.ts', src), { env })).toEqual([{ state: 'none' }]);
    // The refusal is kept: the block is not asked again.
    let asked = 0;
    const count = (async (...a: Parameters<typeof call>) => (asked++, dev(...a))) as typeof call;
    await explainFile(site, 'x.ts', src, () => [], { env, call: count });
    expect(asked).toBe(0);
  });

  it('is unconfirmed until a named person confirms it: then the overlay holds it and audit_log says so', async () => {
    const blocks = splitBlocks(FILE, SOURCE);
    const c = await confirmExplanation(db, site, blocks[1]!.hash, asha, {
      env,
      now: () => new Date('2026-10-27T10:00:00Z'),
    });
    expect(c).toMatchObject({
      path: FILE,
      name: 'newOrderAmount',
      by: 'Asha Rao',
      at: '2026-10-27T10:00:00.000Z',
    });
    const overlay = JSON.parse(
      readFileSync(path.join(site.repoDir, '.rama/explanations.json'), 'utf8'),
    );
    expect(overlay.explanations).toHaveLength(1);
    expect(explanationsFor(site, blocks, { env }).map((e) => e.state)).toEqual([
      'unconfirmed',
      'confirmed',
      'unconfirmed',
    ]);
    const rows =
      await conn.sql`select table_name, row_id, action, created_by from audit_log where row_id = ${blocks[1]!.hash}`;
    expect(rows.map((r) => ({ ...r }))).toEqual([
      {
        table_name: 'explanations',
        row_id: blocks[1]!.hash,
        action: 'confirm',
        created_by: asha.id,
      },
    ]);
    await expect(confirmExplanation(db, site, blocks[1]!.hash, asha, { env })).rejects.toThrow(
      'already confirmed',
    );
    await expect(confirmExplanation(db, site, 'b'.repeat(64), asha, { env })).rejects.toThrow(
      'no drafted sentence',
    );
  });
});
