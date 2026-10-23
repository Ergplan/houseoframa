// Sign-in by email link, against a throwaway database: one-time links, expiry, sessions, revocation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';
import {
  addMember,
  hashToken,
  issueLink,
  LINK_MINUTES,
  memberBySession,
  redeemLink,
  revokeSession,
  SESSION_DAYS,
} from './auth.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
const t0 = new Date('2026-10-23T10:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);

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

describe('members', () => {
  it('gives the local member an email, adds new members, and refuses a bad address or a second email', async () => {
    const asha = await addMember(conn.db, {
      email: ' Asha@Example.com ',
      name: 'Asha Rao',
      createdBy: 'test',
    });
    expect(asha).toMatchObject({ name: 'Asha Rao', email: 'asha@example.com', role: 'member' });
    expect(
      await addMember(conn.db, { email: 'ASHA@example.com', name: 'Someone', createdBy: 'test' }),
    ).toMatchObject({ id: asha.id });
    await expect(
      addMember(conn.db, { email: 'other@example.com', name: 'Asha Rao', createdBy: 'test' }),
    ).rejects.toThrow(/already signs in/);
    await expect(
      addMember(conn.db, { email: 'nope', name: 'X', createdBy: 'test' }),
    ).rejects.toThrow(/not an email/);
    expect(
      await addMember(conn.db, {
        email: 'ravi@example.com',
        name: 'Ravi',
        role: 'manager',
        createdBy: 'test',
      }),
    ).toMatchObject({ role: 'manager' });
  });
});

describe('links and sessions', () => {
  it('issues a link only for a member, and stores only its hash', async () => {
    expect(await issueLink(conn.db, 'stranger@example.com', t0)).toBeNull();
    const link = (await issueLink(conn.db, 'asha@example.com', t0))!;
    expect(link.member.name).toBe('Asha Rao');
    const rows = await conn.sql`select token_hash from login_links`;
    expect(rows.map((r) => r.token_hash)).toEqual([hashToken(link.token)]);
    expect(JSON.stringify(rows)).not.toContain(link.token);
  });

  it('spends a link once, before it expires, and opens a session that signs the member in until revoked or expired', async () => {
    const link = (await issueLink(conn.db, 'asha@example.com', t0))!;
    const s = (await redeemLink(conn.db, link.token, later(60_000)))!;
    expect(s.member.name).toBe('Asha Rao');
    expect(await redeemLink(conn.db, link.token, later(61_000))).toBeNull();
    expect(await memberBySession(conn.db, s.sessionToken, later(120_000))).toMatchObject({
      name: 'Asha Rao',
      role: 'member',
    });
    expect(
      await memberBySession(conn.db, s.sessionToken, later(SESSION_DAYS * 86_400_000 + 61_000)),
    ).toBeNull();
    expect(await memberBySession(conn.db, 'forged', later(120_000))).toBeNull();
    expect(await memberBySession(conn.db, undefined)).toBeNull();
    await revokeSession(conn.db, s.sessionToken, later(180_000));
    expect(await memberBySession(conn.db, s.sessionToken, later(181_000))).toBeNull();
  });

  it('refuses an expired link', async () => {
    const link = (await issueLink(conn.db, 'ravi@example.com', t0))!;
    expect(await redeemLink(conn.db, link.token, later(LINK_MINUTES * 60_000 + 1))).toBeNull();
  });

  it('lets one of two simultaneous redemptions of a link through, never both', async () => {
    const link = (await issueLink(conn.db, 'ravi@example.com', t0))!;
    const both = await Promise.all([
      redeemLink(conn.db, link.token, later(1000)),
      redeemLink(conn.db, link.token, later(1000)),
    ]);
    expect(both.filter(Boolean)).toHaveLength(1);
  });
});
