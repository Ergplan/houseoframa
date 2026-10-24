// Applies the migration to a fresh, throwaway database on the DATABASE_URL server, runs the seed,
// and checks the provenance columns and the append-only tables.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import {
  auditConfirmations,
  auditLog,
  audits,
  decisions,
  discoverySessions,
  discoveryTurns,
  findings,
  modelCalls,
  people,
  signoffs,
  sites,
} from './schema.ts';
import { seed, SEED_COMPONENT } from './seed.ts';

const serverUrl = process.env.DATABASE_URL;
if (!serverUrl)
  throw new Error(
    'DATABASE_URL is not set: the db tests need the Postgres from docker-compose.yml',
  );
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const testUrl = (() => {
  const u = new URL(serverUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
})();

const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(testUrl);
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

describe('packages/db', () => {
  it('applies the migration', async () => {
    await runMigrations(conn.db);
    const tables = await conn.sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' order by table_name`;
    expect(tables.map((t) => t.table_name)).toEqual([
      'audit_confirmations',
      'audit_log',
      'audits',
      'bookings',
      'checkins',
      'decisions',
      'discovery_sessions',
      'discovery_turns',
      'findings',
      'handovers',
      'model_calls',
      'people',
      'pods',
      'secrets',
      'sessions',
      'settings',
      'signoffs',
      'sites',
    ]);
  });

  it('gives every table site_id, created_at and created_by; site_id nullable only where a row may belong to no site', async () => {
    const cols = await conn.sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
      select table_name, column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and column_name in ('site_id', 'created_at', 'created_by')`;
    for (const table of [
      'sites',
      'people',
      'model_calls',
      'audit_log',
      'discovery_sessions',
      'discovery_turns',
      'decisions',
      'signoffs',
      'audits',
      'findings',
      'audit_confirmations',
      'sessions',
      'pods',
      'bookings',
      'checkins',
      'handovers',
      'secrets',
      'settings',
    ]) {
      const mine = cols.filter((c) => c.table_name === table);
      expect(mine.map((c) => c.column_name).sort(), table).toEqual([
        'created_at',
        'created_by',
        'site_id',
      ]);
      for (const c of mine) {
        // A person, a sign-in, a pod, a game-mode booking, a key and a setting belong to no site.
        const nullable =
          ['people', 'sessions', 'pods', 'bookings', 'secrets', 'settings'].includes(table) &&
          c.column_name === 'site_id';
        expect(c.is_nullable, `${table}.${c.column_name}`).toBe(nullable ? 'YES' : 'NO');
      }
    }
  });

  it('refuses to seed without a member name', async () => {
    await expect(seed(conn.db, { memberName: '  ' })).rejects.toThrow(/RAMA_MEMBER_NAME/);
  });

  it('seeds the site "self" owned by the named member, idempotently', async () => {
    const first = await seed(conn.db, { memberName: 'Test Member' });
    const second = await seed(conn.db, { memberName: 'Test Member' });
    expect(first.site).toMatchObject({
      siteId: 'self',
      memberId: first.member.id,
      createdBy: SEED_COMPONENT,
    });
    expect(second.member.id).toBe(first.member.id);
    expect(await conn.db.select().from(sites)).toHaveLength(1);
    expect(await conn.db.select().from(people)).toHaveLength(1);
  });

  it('keeps model_calls and audit_log append-only: UPDATE, DELETE and TRUNCATE fail', async () => {
    await conn.db.insert(modelCalls).values({
      siteId: 'self',
      prompt: 'echo',
      promptVersion: 1,
      promptHash: 'x',
      role: 'builder',
      vendor: 'anthropic',
      model: 'm',
      input: {},
      status: 'ok',
      attempts: 1,
      ms: 1,
      createdBy: 'rama:test@0',
    });
    await conn.db.insert(auditLog).values({
      siteId: 'self',
      tableName: 'model_calls',
      rowId: 'x',
      action: 'insert',
      payload: {},
      createdBy: 'rama:test@0',
    });
    for (const table of ['model_calls', 'audit_log']) {
      await expect(conn.sql.unsafe(`UPDATE ${table} SET created_by = 'tamper'`)).rejects.toThrow(
        /append-only/,
      );
      await expect(conn.sql.unsafe(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/);
      await expect(conn.sql.unsafe(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/append-only/);
    }
    expect(await conn.db.select().from(modelCalls)).toHaveLength(1);
    expect(await conn.db.select().from(auditLog)).toHaveLength(1);
  });

  it('keeps the ceremony tables append-only and audits every decision and signoff in the same insert', async () => {
    const [member] = await conn.db.select().from(people);
    const [session] = await conn.db
      .insert(discoverySessions)
      .values({ siteId: 'self', title: 'Kick-off', createdBy: member!.id })
      .returning();
    await conn.db.insert(discoveryTurns).values({
      siteId: 'self',
      sessionId: session!.id,
      seq: 1,
      speaker: 'member',
      text: 'We bill from a phone.',
      at: new Date('2026-10-22T10:00:00Z'),
      createdBy: member!.id,
    });
    const [card] = await conn.db
      .insert(decisions)
      .values({
        siteId: 'self',
        sessionId: session!.id,
        title: 'Phone first',
        statement: 'Every screen is designed at 390 px.',
        bricks: ['app/page.tsx'],
        status: 'decided',
        by: 'Test Member',
        at: new Date('2026-10-22T10:01:00Z'),
        createdBy: member!.id,
      })
      .returning();
    const [first] = await conn.db
      .insert(signoffs)
      .values({
        siteId: 'self',
        person: 'Test Member',
        personId: member!.id,
        targetKind: 'screen',
        targetId: '/',
        targetCommit: 'abc1234',
        statement: 'Home shows what is due.',
        at: new Date('2026-10-22T10:02:00Z'),
        createdBy: member!.id,
      })
      .returning();
    // A reversal is a new row that supersedes the old one.
    await conn.db.insert(signoffs).values({
      siteId: 'self',
      person: 'Test Member',
      personId: member!.id,
      targetKind: 'screen',
      targetId: '/',
      targetCommit: 'abc1234',
      statement: 'Withdrawn: the dues total is wrong.',
      at: new Date('2026-10-22T10:03:00Z'),
      supersedes: first!.id,
      createdBy: member!.id,
    });

    for (const table of ['discovery_sessions', 'discovery_turns', 'decisions', 'signoffs']) {
      await expect(conn.sql.unsafe(`UPDATE ${table} SET created_by = 'tamper'`)).rejects.toThrow(
        /append-only/,
      );
      await expect(conn.sql.unsafe(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/);
      await expect(conn.sql.unsafe(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/append-only/);
    }
    const audited = await conn.sql<{ table_name: string; row_id: string; created_by: string }[]>`
      select table_name, row_id, created_by from audit_log where table_name in ('decisions', 'signoffs') order by id`;
    expect(audited.map((a) => a.table_name)).toEqual(['decisions', 'signoffs', 'signoffs']);
    expect(audited[0]).toMatchObject({ row_id: card!.id, created_by: member!.id });
    expect(audited[1]!.row_id).toBe(first!.id);
    expect(await conn.db.select().from(signoffs)).toHaveLength(2);
  });

  it('keeps audits, findings and their confirmations append-only and audits every insert', async () => {
    const [call] = await conn.db.select().from(modelCalls).limit(1);
    const [audit] = await conn.db
      .insert(audits)
      .values({
        siteId: 'self',
        commit: 'abc1234',
        vendor: 'openai',
        model: 'm',
        callId: call!.id,
        inputsHash: 'h',
        at: new Date(),
        report: {},
        createdBy: 'rama:audit@0',
      })
      .returning();
    const [finding] = await conn.db
      .insert(findings)
      .values({
        siteId: 'self',
        auditId: audit!.id,
        brick: 'lib/a.ts',
        check: 'any-type',
        verdict: 'note',
        checkVerdict: 'note',
        text: 'any',
        createdBy: 'rama:audit@0',
      })
      .returning();
    const [person] = await conn.db.select().from(people).limit(1);
    const [confirmation] = await conn.db
      .insert(auditConfirmations)
      .values({
        siteId: 'self',
        auditId: audit!.id,
        person: person!.name,
        personId: person!.id,
        statement: 'read',
        at: new Date(),
        createdBy: person!.id,
      })
      .returning();
    for (const table of ['audits', 'findings', 'audit_confirmations']) {
      await expect(conn.sql.unsafe(`UPDATE ${table} SET created_by = 'tamper'`)).rejects.toThrow(
        /append-only/,
      );
      await expect(conn.sql.unsafe(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/);
      await expect(conn.sql.unsafe(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/append-only/);
    }
    const logged = await conn.sql<{ table_name: string; row_id: string }[]>`
      select table_name, row_id from audit_log where table_name in ('audits', 'findings', 'audit_confirmations') order by id`;
    expect(logged).toEqual([
      { table_name: 'audits', row_id: audit!.id },
      { table_name: 'findings', row_id: finding!.id },
      { table_name: 'audit_confirmations', row_id: confirmation!.id },
    ]);
  });
});
