// Applies the migration to a fresh, throwaway database on the DATABASE_URL server, runs the seed,
// and checks the provenance columns and the append-only tables.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { auditLog, modelCalls, people, sites } from './schema.ts';
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
      'audit_log',
      'model_calls',
      'people',
      'sites',
    ]);
  });

  it('gives every table site_id, created_at and created_by; site_id nullable only on people', async () => {
    const cols = await conn.sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
      select table_name, column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and column_name in ('site_id', 'created_at', 'created_by')`;
    for (const table of ['sites', 'people', 'model_calls', 'audit_log']) {
      const mine = cols.filter((c) => c.table_name === table);
      expect(mine.map((c) => c.column_name).sort(), table).toEqual([
        'created_at',
        'created_by',
        'site_id',
      ]);
      for (const c of mine) {
        const nullable = table === 'people' && c.column_name === 'site_id';
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
});
