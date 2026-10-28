// The keys of version 1 (rule 11), entered in Settings rather than an env file: each seat vendor's key
// (Anthropic, OpenAI, Gemini, Grok, Kimi) and the GitHub token. Each is stored encrypted (AES-256-GCM) with the app's own key, a random
// 32-byte key in work/.secret-key generated on first use and never committed. A value leaves this
// module only through `secretFor`, to the code that sends it to its vendor; views get `SecretView`,
// masked. While the table holds no key at all, the environment's keys are read instead, and the
// Settings screen says so.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from './client.ts';
import { homeDir } from './members.ts';
import { secrets } from './schema.ts';

export const SECRET_NAMES = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GITHUB_TOKEN',
  // The vendors a seat may name through the OpenAI-compatible adapter (Stage 9); Ollama needs none.
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'MOONSHOT_API_KEY',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
export const isSecretName = (n: string): n is SecretName =>
  (SECRET_NAMES as readonly string[]).includes(n);

/** work/.secret-key: RAMA_WORK_DIR when set, else work/ in the checkout. */
export function secretKeyFile(env: Record<string, string | undefined> = process.env): string {
  const work = env.RAMA_WORK_DIR
    ? path.resolve(env.RAMA_WORK_DIR)
    : path.join(homeDir(env), 'work');
  return path.join(work, '.secret-key');
}

/** The app's own key: read, or generated on first use (readable by this user only). */
export function appKey(file = secretKeyFile()): Buffer {
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (key.length !== 32) throw new Error(`${file} does not hold a 32-byte key`);
    return key;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
  chmodSync(file, 0o600);
  return key;
}

/** `v1:<iv>:<tag>:<data>`, base64 parts. */
export function encryptSecret(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
    .join(':');
}

export function decryptSecret(stored: string, key: Buffer): string {
  const [v, iv, tag, data] = stored.split(':');
  if (v !== 'v1' || !iv || !tag || data === undefined)
    throw new Error('a stored key is not in a format this version reads');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

/** What a view may show of a key: never its value. */
export interface SecretView {
  name: SecretName;
  set: boolean;
  /** `••••abcd` when set. */
  masked: string | null;
  /** Where the key in use comes from: Settings, or the environment while Settings holds no key. */
  source: 'settings' | 'environment' | 'none';
  check: { ok: boolean; sentence: string; at: string } | null;
  updatedBy: string | null;
}

const mask = (hint: string) => `••••${hint}`;

/** Every key, masked, and where each comes from. */
export async function listSecrets(
  db: Db,
  env: Record<string, string | undefined> = process.env,
): Promise<SecretView[]> {
  const rows = (await db.select().from(secrets)).filter((r) => isSecretName(r.name));
  const byName = new Map(rows.map((r) => [r.name, r]));
  const fromEnv = rows.length === 0;
  return SECRET_NAMES.map((name) => {
    const r = byName.get(name);
    if (r)
      return {
        name,
        set: true,
        masked: mask(r.hint),
        source: 'settings' as const,
        check:
          r.checkOk === null || !r.checkedAt
            ? null
            : { ok: r.checkOk, sentence: r.checkSentence ?? '', at: r.checkedAt.toISOString() },
        updatedBy: r.updatedBy,
      };
    const e = fromEnv ? env[name]?.trim() : undefined;
    return {
      name,
      set: Boolean(e),
      masked: e ? mask(e.slice(-4)) : null,
      source: e ? ('environment' as const) : ('none' as const),
      check: null,
      updatedBy: null,
    };
  });
}

/** Stores (or replaces) a key, encrypted. The previous Test result no longer applies and is cleared. */
export async function setSecret(
  db: Db,
  name: SecretName,
  value: string,
  by: string,
  keyFile = secretKeyFile(),
): Promise<void> {
  const v = value.trim();
  if (!v) throw new Error('an empty key is not a key');
  const row = {
    ciphertext: encryptSecret(v, appKey(keyFile)),
    hint: v.slice(-4),
    checkedAt: null,
    checkOk: null,
    checkSentence: null,
    updatedAt: new Date(),
    updatedBy: by,
  };
  await db
    .insert(secrets)
    .values({ name, ...row, createdBy: by })
    .onConflictDoUpdate({ target: secrets.name, set: row });
}

export async function removeSecret(db: Db, name: SecretName): Promise<void> {
  await db.delete(secrets).where(eq(secrets.name, name));
}

/** Records the outcome of a key's Test button: the light and its sentence. */
export async function recordSecretCheck(
  db: Db,
  name: SecretName,
  check: { ok: boolean; sentence: string },
  at = new Date(),
): Promise<void> {
  await db
    .update(secrets)
    .set({ checkOk: check.ok, checkSentence: check.sentence, checkedAt: at })
    .where(eq(secrets.name, name));
}

/**
 * A key's value, for the code that sends it to its vendor: from Settings, or from the environment
 * while Settings holds no key at all. Undefined when neither has it.
 */
export async function readSecret(
  db: Db,
  name: SecretName,
  env: Record<string, string | undefined> = process.env,
  keyFile = secretKeyFile(env),
): Promise<string | undefined> {
  const rows = (await db.select().from(secrets)).filter((r) => isSecretName(r.name));
  if (rows.length === 0) return env[name]?.trim() || undefined;
  const r = rows.find((x) => x.name === name);
  return r ? decryptSecret(r.ciphertext, appKey(keyFile)) : undefined;
}

/** readSecret on its own connection (DATABASE_URL), for callers outside a request. */
export async function secretFor(
  name: SecretName,
  env: Record<string, string | undefined> = process.env,
): Promise<string | undefined> {
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    return await readSecret(db, name, env);
  } finally {
    await close();
  }
}

// A site's own database address (Stage 11): for an outside site, the read-only address its rows are
// read from, entered in Settings. Kept beside the keys, encrypted the same way, under the name
// `DATABASE_URL:<site>`; it is never one of the keys above, so it never decides where those are read.
const siteDbName = (siteId: string) => `DATABASE_URL:${siteId}`;

/** What a view may show of a database address: its host and database, never its login or password. */
export function maskDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//••••@${u.host}${u.pathname}`;
  } catch {
    return '••••';
  }
}

export interface SiteDatabaseView {
  siteId: string;
  masked: string;
  check: { ok: boolean; sentence: string; at: string } | null;
  updatedBy: string;
}

export async function setSiteDatabase(
  db: Db,
  siteId: string,
  url: string,
  by: string,
  keyFile = secretKeyFile(),
): Promise<void> {
  const v = url.trim();
  if (!/^postgres(ql)?:\/\//.test(v)) throw new Error('a database address starts with postgres://');
  const row = {
    ciphertext: encryptSecret(v, appKey(keyFile)),
    hint: maskDatabaseUrl(v),
    checkedAt: null,
    checkOk: null,
    checkSentence: null,
    updatedAt: new Date(),
    updatedBy: by,
  };
  await db
    .insert(secrets)
    .values({ name: siteDbName(siteId), ...row, createdBy: by })
    .onConflictDoUpdate({ target: secrets.name, set: row });
}

export async function removeSiteDatabase(db: Db, siteId: string): Promise<void> {
  await db.delete(secrets).where(eq(secrets.name, siteDbName(siteId)));
}

export async function recordSiteDatabaseCheck(
  db: Db,
  siteId: string,
  check: { ok: boolean; sentence: string },
  at = new Date(),
): Promise<void> {
  await db
    .update(secrets)
    .set({ checkOk: check.ok, checkSentence: check.sentence, checkedAt: at })
    .where(eq(secrets.name, siteDbName(siteId)));
}

/** Every site's database address entered in Settings, masked. */
export async function listSiteDatabases(db: Db): Promise<SiteDatabaseView[]> {
  const rows = await db.select().from(secrets);
  return rows
    .filter((r) => r.name.startsWith('DATABASE_URL:'))
    .map((r) => ({
      siteId: r.name.slice('DATABASE_URL:'.length),
      masked: r.hint,
      check:
        r.checkOk === null || !r.checkedAt
          ? null
          : { ok: r.checkOk, sentence: r.checkSentence ?? '', at: r.checkedAt.toISOString() },
      updatedBy: r.updatedBy,
    }));
}

/** A site's database address, for the read-only reader only. */
export async function readSiteDatabase(
  db: Db,
  siteId: string,
  env: Record<string, string | undefined> = process.env,
  keyFile = secretKeyFile(env),
): Promise<string | undefined> {
  const [r] = await db
    .select()
    .from(secrets)
    .where(eq(secrets.name, siteDbName(siteId)));
  return r ? decryptSecret(r.ciphertext, appKey(keyFile)) : undefined;
}
