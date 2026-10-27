// The room on real records (Stage 10): a spoken yes writes the decided card in the name of the person
// who said it (their row in people, an audit_log row, a line in the product's .rama/decisions.jsonl),
// the turns are kept with their speakers, and the brains said aloud become the product's seats.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createProductSite, type SiteLocation } from '@rama/blueprint/site';
import { decide, listDecisions, listSessions, startSession } from '@rama/ceremony';
import { createDb, ensurePerson, runMigrations, sites, type Db } from '@rama/db';
import { agree, hear, startState, type RoomState } from '../src/conductor.ts';
import { readRoom, roomDeps, writeRoom } from '../src/room.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let env: NodeJS.ProcessEnv;
let site: SiteLocation;
let conn: ReturnType<typeof createDb>;
let db: Db;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(dbUrl);
  db = conn.db;
  await runMigrations(db);
  work = mkdtempSync(path.join(tmpdir(), 'rama-room-'));
  writeFileSync(
    path.join(work, 'members.json'),
    JSON.stringify([
      { name: 'Tara', role: 'trainer' },
      { name: 'Asha Rao', role: 'customer' },
    ]),
  );
  writeFileSync(path.join(work, 'pnpm-workspace.yaml'), '');
  env = {
    ...process.env,
    RAMA_HOME: work,
    RAMA_WORK_DIR: path.join(work, 'work'),
    DATABASE_URL: dbUrl,
    BUILDER_VENDOR: 'anthropic',
    AUDITOR_VENDOR: 'openai',
    OPENAI_MODEL: 'gpt-6.1-sol',
    ANTHROPIC_API_KEY: '',
    OPENAI_API_KEY: '',
  };
  site = createProductSite({ id: 'chai', name: 'Chai', idea: 'Chai.', env }, (repoDir) =>
    execFileSync('git', ['-C', repoDir, 'init', '--quiet']),
  );
  const tara = await ensurePerson(db, { name: 'Tara', role: 'trainer' }, 'rama:test@0');
  await db
    .insert(sites)
    .values({ siteId: 'chai', name: 'Chai', repo: 'chai', memberId: tara.id, createdBy: tara.id });
  await decide(
    db,
    { id: 'chai', repoDir: site.repoDir },
    {
      title: 'Money is kept in paise',
      statement: 'Every amount is kept in paise.',
      bricks: [],
      status: 'open',
      by: 'Tara',
      at: new Date(),
      createdBy: tara.id,
    },
  );
});

afterAll(async () => {
  await conn.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

describe('the room on real records', () => {
  it('records each spoken yes in the speaker’s name, and the brains said aloud', async () => {
    const tara = await ensurePerson(db, { name: 'Tara', role: 'trainer' }, 'rama:test@0');
    const sessionId = await startSession(db, 'chai', { title: 'Rehearsal', createdBy: tara.id });
    let s: RoomState = startState('chai', sessionId, ['Asha Rao', 'Tara']);
    const deps = roomDeps(db, site, () => s, { env });
    const step = async (who: string, text: string) => {
      const r = await hear(deps, s, who, text);
      s = r.state;
      writeRoom(s, env);
      return r;
    };
    await step('Asha Rao', 'A chai stall takes orders through the day.');
    await step('Asha Rao', 'Claude Code builds, OpenAI checks and OpenAI speaks.');
    const brains = await step('Asha Rao', 'Yes.');
    expect(brains.lines[0]!.text).toBe('Decided by Asha Rao: the brains.');
    expect(brains.lines[1]!.text).toMatch(/^The card “Money is kept in paise”/);
    const yes = await step('Asha Rao', 'Yes.');
    const asha = await ensurePerson(db, { name: 'Asha Rao', role: 'customer' }, 'rama:test@0');
    expect(yes.decided).toMatchObject({
      title: 'Money is kept in paise',
      status: 'decided',
      by: 'Asha Rao',
      sessionId,
    });

    const all = await listDecisions(db, 'chai');
    expect(all.map((d) => [d.title, d.status, d.by])).toEqual([
      ['Money is kept in paise', 'open', 'Tara'],
      ['The brains', 'decided', 'Asha Rao'],
      ['Money is kept in paise', 'decided', 'Asha Rao'],
    ]);
    const rows = await conn.sql`select created_by from decisions where id = ${yes.decided!.id}`;
    expect(rows[0]!.created_by).toBe(asha.id);
    const audit =
      await conn.sql`select table_name from audit_log where row_id = ${yes.decided!.id}`;
    expect(audit.map((a) => a.table_name)).toEqual(['decisions']);
    const mirror = readFileSync(path.join(site.repoDir, '.rama/decisions.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(JSON.parse(mirror.at(-1)!)).toMatchObject({
      id: yes.decided!.id,
      by: 'Asha Rao',
      status: 'decided',
    });

    // The turns, with their speakers; the room's state survives a reload.
    const turns = (await listSessions(db, 'chai')).find((x) => x.id === sessionId)!.turns;
    expect(turns.map((t) => t.speaker)).toEqual(['Asha Rao', 'Asha Rao', 'Asha Rao', 'Asha Rao']);
    expect(readRoom('chai', env)).toEqual(s);

    // Act 3 with no key for the builder: each decided card is read as it was decided.
    const r = await agree(deps, s);
    expect(r.lines.map((l) => l.text)).toEqual([
      'Here is the design: your cards, as you decided them.',
      'The brains: Claude Code (Anthropic, claude-sonnet-5-5) builds; OpenAI (gpt-6.1-sol) checks; Anthropic (claude-sonnet-5-5) drafts; OpenAI (gpt-realtime) speaks. The checker is never the builder.',
      'Money is kept in paise: Every amount is kept in paise.',
      'That is the design. Shall I build this?',
    ]);
    s = r.state;
    const signed = await step('Tara', 'Yes, build it.');
    expect(signed.decided).toMatchObject({ title: 'Yes, build it', by: 'Tara', status: 'decided' });
  });

  it('refuses a speaker who is not a member', async () => {
    const s = startState('chai', (await listSessions(db, 'chai'))[0]!.id, ['Stranger']);
    await expect(
      hear(
        roomDeps(db, site, () => s, { env }),
        s,
        'Stranger',
        'Yes',
      ),
    ).rejects.toThrow('Stranger is not in members.json');
  });
});
