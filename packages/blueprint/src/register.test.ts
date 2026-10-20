// Registers a site in a fresh, throwaway database on the DATABASE_URL server.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb, runMigrations, seed, sites } from '@rama/db';
import { registerSite, SITE_COMPONENT } from './register.ts';

const serverUrl = process.env.DATABASE_URL;
if (!serverUrl) throw new Error('DATABASE_URL is not set: this test needs the Postgres from docker-compose.yml');
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const testUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(testUrl);
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: 'Asha Rao' });
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

describe('registerSite', () => {
  it('adds the site for the local member, once', async () => {
    const input = { siteId: 'ekbill', name: 'EkBill', repo: 'https://github.com/Ergplan/ekbill', memberName: 'Asha Rao' };
    await registerSite(input, testUrl);
    await registerSite({ ...input, name: 'renamed' }, testUrl);
    const rows = await conn.db.select().from(sites);
    const row = rows.find((r) => r.siteId === 'ekbill')!;
    expect(row).toMatchObject({ name: 'EkBill', repo: input.repo, createdBy: SITE_COMPONENT });
    expect(rows.filter((r) => r.siteId === 'ekbill')).toHaveLength(1);
  });

  it('refuses without a member name or with a person who is not seeded', async () => {
    const input = { siteId: 'x', name: 'x', repo: 'x' };
    await expect(registerSite({ ...input, memberName: '' }, testUrl)).rejects.toThrow(/RAMA_MEMBER_NAME/);
    await expect(registerSite({ ...input, memberName: 'Nobody' }, testUrl)).rejects.toThrow(/no person "Nobody"/);
  });
});
