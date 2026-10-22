// The ceremony's writes, against a fresh throwaway database: rows, mirrors and the chain.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createDb, runMigrations, seed } from '@rama/db';
import { readDecisions, readSignoffs, signaturesInForce, SIGNOFFS_FILE } from '../src/records.ts';
import {
  addTurn,
  currentDecisions,
  decide,
  listDecisions,
  listSessions,
  listSignoffs,
  sign,
  startSession,
} from '../src/store.ts';

const serverUrl = process.env.DATABASE_URL;
if (!serverUrl)
  throw new Error('DATABASE_URL is not set: this test needs the Postgres from docker-compose.yml');
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const testUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
let memberId: string;
let repoDir: string;
const site = () => ({ id: 'self', repoDir });
const t = (m: number) => new Date(Date.UTC(2026, 9, 22, 10, m));

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(testUrl);
  await runMigrations(conn.db);
  memberId = (await seed(conn.db, { memberName: 'Asha Rao' })).member.id;
  repoDir = mkdtempSync(path.join(tmpdir(), 'rama-ceremony-'));
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(repoDir, { recursive: true, force: true });
});

describe('signatures', () => {
  let first: string;

  it('writes a row (audited by the database) and the same record as a line of .rama/signoffs.jsonl', async () => {
    const s = await sign(conn.db, site(), {
      person: 'Asha Rao',
      personId: memberId,
      target: { kind: 'screen', id: '/gst', commit: 'abc1234' },
      statement: 'GST this quarter shows ₹21,483.',
      at: t(1),
    });
    first = s.id;
    expect(readSignoffs(repoDir)).toEqual([s]);
    expect(await listSignoffs(conn.db, 'self')).toEqual([s]);
    const audit = await conn.sql`select table_name, row_id from audit_log where row_id = ${s.id}`;
    expect(audit).toEqual([{ table_name: 'signoffs', row_id: s.id }]);
  });

  it('supersedes along a chain: a replacement, then a withdrawal; a fork and a bare withdrawal are refused', async () => {
    const replaced = await sign(conn.db, site(), {
      person: 'Asha Rao',
      personId: memberId,
      target: { kind: 'screen', id: '/gst', commit: 'def5678' },
      statement: 'Re-signed at the new commit.',
      supersedes: first,
      at: t(2),
    });
    await expect(
      sign(conn.db, site(), {
        person: 'Asha Rao',
        personId: memberId,
        target: { kind: 'screen', id: '/gst', commit: 'def5678' },
        statement: 'x',
        supersedes: first,
        at: t(3),
      }),
    ).rejects.toThrow(/already superseded/);
    await expect(
      sign(conn.db, site(), {
        person: 'Asha Rao',
        personId: memberId,
        target: { kind: 'screen', id: '/dues', commit: 'def5678' },
        statement: 'x',
        supersedes: replaced.id,
        at: t(3),
      }),
    ).rejects.toThrow(/same screen or brick/);
    await expect(
      sign(conn.db, site(), {
        person: 'Asha Rao',
        personId: memberId,
        target: { kind: 'screen', id: '/gst', commit: 'def5678' },
        statement: 'x',
        withdrawn: true,
        at: t(3),
      }),
    ).rejects.toThrow(/must say which signature/);
    expect(signaturesInForce(readSignoffs(repoDir)).get('screen:/gst')?.id).toBe(replaced.id);
    await sign(conn.db, site(), {
      person: 'Asha Rao',
      personId: memberId,
      target: { kind: 'screen', id: '/gst', commit: 'def5678' },
      statement: 'Withdrawn: the total is wrong.',
      supersedes: replaced.id,
      withdrawn: true,
      at: t(4),
    });
    expect(signaturesInForce(readSignoffs(repoDir)).has('screen:/gst')).toBe(false);
    // The file holds exactly the rows the database holds, in order.
    expect(readSignoffs(repoDir)).toEqual(await listSignoffs(conn.db, 'self'));
    expect(readFileSync(path.join(repoDir, SIGNOFFS_FILE), 'utf8').trim().split('\n')).toHaveLength(
      3,
    );
  });

  it('mirrors nothing when the row is refused', async () => {
    const before = readFileSync(path.join(repoDir, SIGNOFFS_FILE), 'utf8');
    await expect(
      sign(conn.db, site(), {
        person: 'Nobody',
        personId: '00000000-0000-0000-0000-000000000000',
        target: { kind: 'brick', id: 'x.ts', commit: 'abc1234' },
        statement: 'x',
        at: t(5),
      }),
    ).rejects.toThrow();
    expect(readFileSync(path.join(repoDir, SIGNOFFS_FILE), 'utf8')).toBe(before);
  });
});

describe('decisions and sessions', () => {
  it('records a session with numbered turns, cards mirrored to .rama/decisions.jsonl, a supersede chain', async () => {
    const sessionId = await startSession(conn.db, 'self', {
      title: 'Kick-off',
      createdBy: memberId,
    });
    await addTurn(conn.db, 'self', sessionId, {
      speaker: 'member',
      text: 'We bill from a phone.',
      at: t(10),
      createdBy: memberId,
    });
    await addTurn(conn.db, 'self', sessionId, {
      speaker: 'Rama',
      text: 'Who signs a bill?',
      draft: true,
      at: t(11),
      createdBy: 'rama:ceremony-discovery@0.1.0',
    });
    const card = await decide(conn.db, site(), {
      title: 'Phone first',
      statement: 'Designed at 390 px.',
      bricks: ['app/page.tsx'],
      screenId: '/',
      status: 'decided',
      by: 'Asha Rao',
      at: t(12),
      sessionId,
      createdBy: memberId,
    });
    const revised = await decide(conn.db, site(), {
      title: 'Phone first',
      statement: 'Designed at 390 px, both themes.',
      bricks: ['app/page.tsx'],
      screenId: '/',
      status: 'decided',
      by: 'Asha Rao',
      at: t(13),
      sessionId,
      supersedes: card.id,
      createdBy: memberId,
    });
    await expect(
      decide(conn.db, site(), {
        title: 'x',
        statement: 'x',
        bricks: [],
        status: 'open',
        by: 'Asha Rao',
        at: t(14),
        supersedes: card.id,
        createdBy: memberId,
      }),
    ).rejects.toThrow(/already superseded/);
    expect(readDecisions(repoDir)).toEqual(await listDecisions(conn.db, 'self'));
    expect(currentDecisions(await listDecisions(conn.db, 'self')).map((d) => d.id)).toEqual([
      revised.id,
    ]);
    const [session] = await listSessions(conn.db, 'self');
    expect(session!.turns.map((x) => [x.seq, x.speaker, x.draft])).toEqual([
      [1, 'member', false],
      [2, 'Rama', true],
    ]);
  });

  it('writes no file for a refused card', async () => {
    const other = mkdtempSync(path.join(tmpdir(), 'rama-ceremony-'));
    try {
      await expect(
        decide(
          conn.db,
          { id: 'self', repoDir: other },
          {
            title: 'x',
            statement: 'x',
            bricks: [],
            status: 'open',
            by: 'x',
            at: t(20),
            sessionId: '00000000-0000-0000-0000-000000000000',
            createdBy: memberId,
          },
        ),
      ).rejects.toThrow();
      expect(existsSync(path.join(other, '.rama/decisions.jsonl'))).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});
