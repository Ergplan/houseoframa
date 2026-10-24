// The keys in Settings (rule 11): encrypted at rest with the app's own key, masked in every view, read
// from the environment only while Settings holds none, and never written anywhere in the clear.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { secrets } from './schema.ts';
import {
  appKey,
  decryptSecret,
  encryptSecret,
  listSecrets,
  readSecret,
  recordSecretCheck,
  removeSecret,
  setSecret,
} from './secrets.ts';
import { getSetting, putSetting } from './settings.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
let work: string;
let keyFile: string;
const KEY = 'sk-test-0123456789abcdef-WXYZ';

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString());
  await runMigrations(conn.db);
  work = mkdtempSync(path.join(tmpdir(), 'rama-secrets-'));
  keyFile = path.join(work, '.secret-key');
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

describe('the app key and the cipher', () => {
  it('generates its key on first use, readable by this user only, and keeps it', () => {
    const k = appKey(keyFile);
    expect(k).toHaveLength(32);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    expect(appKey(keyFile).equals(k)).toBe(true);
  });

  it('round-trips a value; a different key or a changed byte is refused', () => {
    const k = appKey(keyFile);
    const stored = encryptSecret(KEY, k);
    expect(stored).not.toContain(KEY);
    expect(decryptSecret(stored, k)).toBe(KEY);
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
    const [v, iv, tag, data] = stored.split(':');
    const flipped = Buffer.from(data!, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'), k)).toThrow();
  });
});

describe('keys in Settings', () => {
  const env = { OPENAI_API_KEY: 'sk-from-env-1234' };

  it('reads the environment while Settings holds no key, and says so', async () => {
    expect(await readSecret(conn.db, 'OPENAI_API_KEY', env, keyFile)).toBe('sk-from-env-1234');
    const views = await listSecrets(conn.db, env);
    expect(views.find((v) => v.name === 'OPENAI_API_KEY')).toMatchObject({
      set: true,
      source: 'environment',
      masked: '••••1234',
    });
    expect(views.find((v) => v.name === 'GITHUB_TOKEN')).toMatchObject({
      set: false,
      source: 'none',
    });
  });

  it('stores a key encrypted and shows it masked; then the environment is no longer read', async () => {
    await setSecret(conn.db, 'ANTHROPIC_API_KEY', ` ${KEY} `, 'person-1', keyFile);
    const [row] = await conn.db.select().from(secrets);
    expect(row!.ciphertext).not.toContain(KEY);
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(row!.hint).toBe('WXYZ');
    expect(await readSecret(conn.db, 'ANTHROPIC_API_KEY', env, keyFile)).toBe(KEY);
    // Settings holds a key now, so the environment's OpenAI key is not read any more.
    expect(await readSecret(conn.db, 'OPENAI_API_KEY', env, keyFile)).toBeUndefined();
    const views = await listSecrets(conn.db, env);
    expect(JSON.stringify(views)).not.toContain(KEY);
    expect(views.find((v) => v.name === 'ANTHROPIC_API_KEY')).toMatchObject({
      masked: '••••WXYZ',
      source: 'settings',
      updatedBy: 'person-1',
      check: null,
    });
    expect(views.find((v) => v.name === 'OPENAI_API_KEY')).toMatchObject({
      set: false,
      source: 'none',
    });
    expect(readFileSync(keyFile, 'utf8')).not.toContain(KEY);
  });

  it("keeps a key's last Test, clears it when the key is replaced, and removes a key", async () => {
    await recordSecretCheck(conn.db, 'ANTHROPIC_API_KEY', { ok: true, sentence: 'It works.' });
    let v = (await listSecrets(conn.db)).find((x) => x.name === 'ANTHROPIC_API_KEY')!;
    expect(v.check).toMatchObject({ ok: true, sentence: 'It works.' });
    await setSecret(conn.db, 'ANTHROPIC_API_KEY', 'sk-new-key-0000', 'person-2', keyFile);
    v = (await listSecrets(conn.db)).find((x) => x.name === 'ANTHROPIC_API_KEY')!;
    expect(v).toMatchObject({ check: null, masked: '••••0000', updatedBy: 'person-2' });
    await expect(setSecret(conn.db, 'GITHUB_TOKEN', '  ', 'p', keyFile)).rejects.toThrow(/empty/);
    await removeSecret(conn.db, 'ANTHROPIC_API_KEY');
    expect(await conn.db.select().from(secrets)).toEqual([]);
  });

  it('keeps plain settings', async () => {
    expect(await getSetting(conn.db, 'github.owner')).toBeUndefined();
    await putSetting(conn.db, 'github.owner', { owner: 'Ergplan', kind: 'org' }, 'p');
    await putSetting(conn.db, 'github.owner', { owner: 'aayuda', kind: 'org' }, 'p');
    expect(await getSetting(conn.db, 'github.owner')).toEqual({ owner: 'aayuda', kind: 'org' });
  });
});
