// Sign-in by username and password, against a throwaway database: accounts from the environment,
// constant-time checks, a person per account, sessions that expire and are revoked.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';
import {
  accountsFrom,
  checkCredentials,
  ensurePerson,
  hashToken,
  memberBySession,
  openSession,
  revokeSession,
  SESSION_DAYS,
} from './auth.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
const t0 = new Date('2026-10-24T10:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);
const ENV = {
  RAMA_ACCOUNTS: JSON.stringify([
    { username: 'asha', password: 'correct horse', name: 'Asha Rao', role: 'manager' },
    { username: 'ravi', password: 'battery staple', name: 'Ravi' },
  ]),
};

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString());
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: 'Asha Rao' });
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

describe('accounts', () => {
  it('reads the accounts from RAMA_ACCOUNTS, members by default; none when unset', () => {
    expect(accountsFrom(ENV).map((a) => [a.username, a.name, a.role])).toEqual([
      ['asha', 'Asha Rao', 'manager'],
      ['ravi', 'Ravi', 'member'],
    ]);
    expect(accountsFrom({})).toEqual([]);
  });

  it('refuses a malformed list, a short password, or a username twice, rather than locking everyone out quietly', () => {
    expect(() => accountsFrom({ RAMA_ACCOUNTS: 'asha:pw' })).toThrow(/not JSON/);
    expect(() =>
      accountsFrom({
        RAMA_ACCOUNTS: JSON.stringify([{ username: 'a', password: 'short', name: 'A' }]),
      }),
    ).toThrow(/at least 8/);
    const twice = [
      { username: 'a', password: '12345678', name: 'A' },
      { username: 'a', password: '87654321', name: 'B' },
    ];
    expect(() => accountsFrom({ RAMA_ACCOUNTS: JSON.stringify(twice) })).toThrow(/twice/);
  });

  it('opens only with the right username and password', () => {
    const accounts = accountsFrom(ENV);
    expect(checkCredentials(accounts, 'asha', 'correct horse')?.name).toBe('Asha Rao');
    expect(checkCredentials(accounts, 'asha', 'battery staple')).toBeNull();
    expect(checkCredentials(accounts, 'ravi', 'battery staple')?.name).toBe('Ravi');
    expect(checkCredentials(accounts, 'nobody', 'correct horse')).toBeNull();
    expect(checkCredentials(accounts, '', '')).toBeNull();
  });
});

describe('people and sessions', () => {
  it('signs an account in as the person of that name (the seeded member keeps their sites), with its role', async () => {
    const asha = await ensurePerson(conn.db, { name: 'Asha Rao', role: 'manager' }, 'test');
    const [seeded] = await conn.sql`select id from people where name = 'Asha Rao'`;
    expect(asha).toMatchObject({ id: seeded!.id, role: 'manager' });
    const ravi = await ensurePerson(conn.db, { name: 'Ravi', role: 'member' }, 'test');
    expect(await ensurePerson(conn.db, { name: 'Ravi', role: 'member' }, 'test')).toMatchObject({
      id: ravi.id,
    });
  });

  it('opens a session that signs the member in until it expires or is revoked, and stores only its hash', async () => {
    const asha = await ensurePerson(conn.db, { name: 'Asha Rao', role: 'manager' }, 'test');
    const token = await openSession(conn.db, asha.id, t0);
    const rows = await conn.sql`select token_hash from sessions`;
    expect(rows.map((r) => r.token_hash)).toContain(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(await memberBySession(conn.db, token, later(60_000))).toMatchObject({
      name: 'Asha Rao',
      role: 'manager',
    });
    expect(await memberBySession(conn.db, token, later(SESSION_DAYS * 86_400_000 + 1))).toBeNull();
    expect(await memberBySession(conn.db, 'forged', later(1))).toBeNull();
    expect(await memberBySession(conn.db, undefined)).toBeNull();
    await revokeSession(conn.db, token, later(120_000));
    expect(await memberBySession(conn.db, token, later(121_000))).toBeNull();
  });
});
