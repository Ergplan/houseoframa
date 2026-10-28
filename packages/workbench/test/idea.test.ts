// The idea room (Stage 12) against a throwaway database and a temporary work dir: files and the
// scratchpad committed to the product in the person's name and nothing else with them, nothing put in
// while the builder is at work, the drafter asked with the room as it stands and its reply kept as a
// draft with its sources and proposed cards, and a proposed card decided only by a person's yes.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createDb, ensurePerson, runMigrations, type Member } from '@rama/db';
import { currentDecisions, listDecisions } from '@rama/ceremony';
import type { SiteLocation } from '@rama/blueprint/site';
import type { call as modelCall } from '@rama/model';
import { newProduct, type ProductDeps } from '../src/products.ts';
import {
  addIdeaFile,
  agreeCard,
  askDrafter,
  DRAFTER_SPEAKER,
  IdeaError,
  listIdeaFiles,
  MAX_FILE_BYTES,
  readIdeaFile,
  readScratchpad,
  roomTurns,
  safeFileName,
  saveScratchpad,
  splitCards,
} from '../src/idea.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
let work: string;
let env: NodeJS.ProcessEnv;
let asha: Member;
let site: SiteLocation;

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString());
  await runMigrations(conn.db);
  asha = await ensurePerson(conn.db, { name: 'Asha Rao', role: 'trainer' }, 'test');
  work = mkdtempSync(path.join(tmpdir(), 'rama-idea-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  const deps: ProductDeps = {
    github: { fetch: vi.fn() as never, api: 'https://api.github.test' },
    env,
    now: () => new Date('2026-10-28T10:00:00Z'),
  };
  ({ site } = await newProduct(
    conn.db,
    { name: 'Sunplan', idea: 'Sizes solar for a factory.', person: asha },
    deps,
  ));
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

describe('files in the room', () => {
  it('keeps a file under idea/files, committed as the person, with nothing else in the commit', () => {
    // Something else left in the checkout is not swept into the person's commit.
    writeFileSync(path.join(site.repoDir, 'stray.txt'), 'not mine');
    const f = addIdeaFile(site, {
      name: 'C:\\Users\\asha\\tariff order.pdf',
      bytes: Buffer.from('%PDF-1.4 tariff'),
      person: 'Asha Rao',
      now: new Date('2026-10-28T10:05:00Z'),
      env,
    });
    expect(f).toMatchObject({ name: 'tariff order.pdf', kind: 'pdf', addedBy: 'Asha Rao' });
    expect(git(site.repoDir, 'log', '-1', '--format=%an|%s')).toBe(
      'Asha Rao|Idea: add tariff order.pdf',
    );
    expect(git(site.repoDir, 'show', '--name-only', '--format=', 'HEAD')).toBe(
      'idea/files/tariff order.pdf',
    );
    expect(git(site.repoDir, 'status', '--porcelain')).toBe('?? stray.txt');
    rmSync(path.join(site.repoDir, 'stray.txt'));
    // A second of the same name is numbered, never overwritten.
    const again = addIdeaFile(site, {
      name: 'tariff order.pdf',
      bytes: Buffer.from('%PDF-1.4 newer'),
      person: 'Asha Rao',
      env,
    });
    expect(again.name).toBe('tariff order-2.pdf');
    expect(
      listIdeaFiles(site)
        .map((x) => x.name)
        .sort(),
    ).toEqual(['tariff order-2.pdf', 'tariff order.pdf']);
    expect(readIdeaFile(site, 'tariff order.pdf')!.toString()).toBe('%PDF-1.4 tariff');
  });

  it('refuses a file with no name, an empty one, one over 20 MB, and a name that leaves the room', () => {
    const add = (name: string, bytes: Buffer) =>
      addIdeaFile(site, { name, bytes, person: 'Asha Rao', env });
    expect(() => add('...', Buffer.from('x'))).toThrow(IdeaError);
    expect(() => add('empty.csv', Buffer.alloc(0))).toThrow(/empty/);
    expect(() => add('big.pdf', Buffer.alloc(MAX_FILE_BYTES + 1))).toThrow(/20 MB/);
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(readIdeaFile(site, '../site.json')).toBeNull();
    expect(readIdeaFile(site, 'missing.pdf')).toBeNull();
  });

  it('puts nothing in the checkout while the builder is at work', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    mkdirSync(path.join(work, '.jobs'), { recursive: true });
    writeFileSync(
      path.join(work, '.jobs', `${id}.json`),
      JSON.stringify({ id, kind: 'build', siteId: site.id, startedAt: '2099-01-01', steps: [] }),
    );
    const jobs = (globalThis as { __ramaJobs?: Map<string, unknown> }).__ramaJobs!;
    jobs.set(`build:${site.id}`, new Promise(() => {}));
    try {
      expect(() =>
        addIdeaFile(site, { name: 'a.csv', bytes: Buffer.from('a'), person: 'Asha Rao', env }),
      ).toThrow(/builder is at work/);
      expect(() => saveScratchpad(site, { text: 'x', person: 'Asha Rao', env })).toThrow(
        /builder is at work/,
      );
    } finally {
      jobs.delete(`build:${site.id}`);
      rmSync(path.join(work, '.jobs', `${id}.json`));
    }
  });
});

describe('the scratchpad', () => {
  it('is saved as the person, and a save that changes nothing makes no commit', () => {
    expect(readScratchpad(site)).toEqual({ text: '', savedBy: null, savedAt: null });
    expect(
      saveScratchpad(site, { text: 'Two shifts.\r\nMaharashtra.', person: 'Asha Rao', env }),
    ).toBe(true);
    const before = git(site.repoDir, 'rev-parse', 'HEAD');
    expect(
      saveScratchpad(site, { text: 'Two shifts.\nMaharashtra.', person: 'Asha Rao', env }),
    ).toBe(false);
    expect(git(site.repoDir, 'rev-parse', 'HEAD')).toBe(before);
    expect(readScratchpad(site)).toMatchObject({
      text: 'Two shifts.\nMaharashtra.',
      savedBy: 'Asha Rao',
    });
  });
});

describe('the drafter’s cards', () => {
  it('takes the last cards block, and a block that is not a list of cards proposes nothing', () => {
    const one = '```cards\n[{"title":"Old","statement":"x"}]\n```';
    expect(
      splitCards(
        `Here.\n\n${one}\n\n\`\`\`cards\n[{"title":"Sizing","statement":"It sizes."}]\n\`\`\``,
      ),
    ).toEqual({ reply: 'Here.', cards: [{ title: 'Sizing', statement: 'It sizes.' }] });
    expect(splitCards('Hi.\n```cards\nnot json\n```')).toEqual({ reply: 'Hi.', cards: [] });
    expect(splitCards('Hi.\n```cards\n[{"title":""}]\n```').cards).toEqual([]);
    expect(splitCards('No cards.')).toEqual({ reply: 'No cards.', cards: [] });
  });
});

describe('asking the drafter', () => {
  it('sends the room as it stands with the files, and keeps its reply as a draft with sources and cards', async () => {
    addIdeaFile(site, {
      name: 'load.csv',
      bytes: Buffer.from('hour,kW\n6,480'),
      person: 'Asha Rao',
      env,
    });
    addIdeaFile(site, { name: 'board.png', bytes: Buffer.from('png'), person: 'Asha Rao', env });
    addIdeaFile(site, { name: 'plan.xlsx', bytes: Buffer.from('xlsx'), person: 'Asha Rao', env });
    const call = vi.fn(async (req: Parameters<typeof modelCall>[0]) => {
      expect(req).toMatchObject({
        name: 'idea',
        version: 1,
        role: 'drafter',
        siteId: site.id,
        format: 'text',
        webSearch: true,
        createdBy: asha.id,
      });
      expect(req.documents).toEqual([
        {
          kind: 'pdf',
          name: 'tariff order.pdf',
          base64: Buffer.from('%PDF-1.4 tariff').toString('base64'),
        },
        { kind: 'text', name: 'load.csv', text: 'hour,kW\n6,480' },
      ]);
      expect(req.images).toEqual([
        { mediaType: 'image/png', base64: Buffer.from('png').toString('base64') },
      ]);
      expect(req.input).toMatchObject({
        product: { name: 'Sunplan', idea: 'Sizes solar for a factory.' },
        scratchpad: 'Two shifts.\nMaharashtra.',
        attached: ['tariff order.pdf', 'load.csv', 'board.png'],
        notReadable: ['plan.xlsx'],
        webSearch: true,
        message: { speaker: 'Asha Rao', text: 'What does the order say about banking?' },
      });
      return {
        output:
          'It allows monthly banking.\n\n```cards\n[{"title":"Banking","statement":"Banked energy is settled monthly."}]\n```',
        callId: 'call-1',
        vendor: 'anthropic',
        model: 'claude-sonnet-5-5',
        attempts: 1,
        inputTokens: 1,
        outputTokens: 1,
        sources: [{ url: 'https://merc.gov.in/o', title: 'MERC order' }],
      } as never;
    });
    const turn = await askDrafter(
      conn.db,
      site,
      {
        person: asha,
        text: ' What does the order say about banking? ',
        files: ['tariff order.pdf', 'load.csv', 'board.png', 'plan.xlsx'],
        webSearch: true,
      },
      { call: call as never, env },
    );
    expect(call).toHaveBeenCalledOnce();
    expect(turn).toMatchObject({
      speaker: DRAFTER_SPEAKER,
      text: 'It allows monthly banking.',
      draft: true,
      meta: {
        callId: 'call-1',
        sources: [{ url: 'https://merc.gov.in/o', title: 'MERC order' }],
        cards: [{ title: 'Banking', statement: 'Banked energy is settled monthly.' }],
      },
    });
    const { turns } = await roomTurns(conn.db, site.id);
    expect(turns.map((t) => [t.speaker, t.draft, t.meta?.files ?? null])).toEqual([
      ['Asha Rao', false, ['tariff order.pdf', 'load.csv', 'board.png', 'plan.xlsx']],
      [DRAFTER_SPEAKER, true, null],
    ]);
    // Asking writes no card: only a person's yes does.
    expect(
      currentDecisions(await listDecisions(conn.db, site.id)).filter((d) => d.status === 'decided'),
    ).toEqual([]);
  });

  it('refuses an empty message and a file that is not in the room, before calling anyone', async () => {
    const call = vi.fn();
    await expect(
      askDrafter(
        conn.db,
        site,
        { person: asha, text: '  ', files: [], webSearch: false },
        { call: call as never, env },
      ),
    ).rejects.toThrow(/Write something/);
    await expect(
      askDrafter(
        conn.db,
        site,
        { person: asha, text: 'hi', files: ['nope.pdf'], webSearch: false },
        { call: call as never, env },
      ),
    ).rejects.toThrow(/not in the room/);
    expect(call).not.toHaveBeenCalled();
  });

  it('a proposed card said yes to is decided in the person’s name', async () => {
    const d = await agreeCard(conn.db, site, {
      person: asha,
      card: { title: 'Banking', statement: 'Banked energy is settled monthly.' },
    });
    expect(d).toMatchObject({ title: 'Banking', status: 'decided', by: 'Asha Rao' });
    const { sessionId } = await roomTurns(conn.db, site.id);
    expect(d.sessionId).toBe(sessionId);
  });
});
