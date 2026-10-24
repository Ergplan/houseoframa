import { existsSync } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  GITHUB_OWNER,
  getSetting,
  homeDir,
  listSecrets,
  readMembers,
  seesEverything,
  type SecretView,
} from '@rama/db';
import { KEY_HELP } from '@rama/model';
import { Said } from '../../components/workbench/Said';
import { requireMember, withDb } from '../../server/session';

export const dynamic = 'force-dynamic';

/** The light beside a key, with its reason in words. */
function light(v: SecretView): { tone: 'green' | 'red' | 'grey'; words: string } {
  if (!v.set) return { tone: 'red', words: 'Not entered yet.' };
  if (v.check) return { tone: v.check.ok ? 'green' : 'red', words: v.check.sentence };
  if (v.source === 'environment')
    return { tone: 'grey', words: 'Read from the server’s setup file. Press Test to check it.' };
  return { tone: 'grey', words: 'Entered, not checked yet. Press Test.' };
}

/** Settings (Stage 7): keys with lights, the GitHub account, the people, the design system. */
export default async function Settings({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await requireMember();
  if (!seesEverything(member)) notFound();
  const q = (await searchParams) ?? {};
  const { keys, owner } = await withDb(async (db) => ({
    keys: await listSecrets(db),
    owner: (await getSetting<{ owner: string }>(db, GITHUB_OWNER))?.owner ?? null,
  }));
  const fromEnv = keys.some((k) => k.source === 'environment');
  const harmony = existsSync(path.join(homeDir(), 'design/harmony/tokens.json'));
  const people = readMembers();
  return (
    <main className="stub workbench">
      <p>
        <Link href="/">◀ Home</Link>
      </p>
      <h1>Settings</h1>
      <Said q={q} />

      <section id="keys">
        <h2>Keys</h2>
        <p className="note">
          Each key is kept encrypted on this laptop and shown only by its last four characters.
          {fromEnv
            ? ' None is entered here yet, so the keys in the server’s setup file are used. Once you enter one here, only the keys entered here are used.'
            : ''}
        </p>
        {keys.map((k) => {
          const l = light(k);
          return (
            <div key={k.name} className="key" data-key={k.name}>
              <div className="key-head">
                <span className={`light ${l.tone}`} aria-hidden />
                <b>{KEY_HELP[k.name].label}</b>{' '}
                {k.masked ? <small className="mono">{k.masked}</small> : null}
              </div>
              <p className="note">{KEY_HELP[k.name].sentence}</p>
              <p className={`light-words ${l.tone}`}>{l.words}</p>
              <form action="/api/settings/keys" method="post" className="row">
                <input type="hidden" name="name" value={k.name} />
                <input
                  name="value"
                  type="password"
                  autoComplete="off"
                  placeholder={k.set ? 'Paste a new key to replace it' : 'Paste the key here'}
                  aria-label={`${KEY_HELP[k.name].label}`}
                />
                <button type="submit" name="action" value="save" className="primary">
                  Save
                </button>
                <button type="submit" name="action" value="test" formNoValidate>
                  Test
                </button>
                {k.source === 'settings' ? (
                  <button type="submit" name="action" value="remove" formNoValidate>
                    Remove
                  </button>
                ) : null}
              </form>
            </div>
          );
        })}
      </section>

      <section id="github">
        <h2>GitHub</h2>
        <p className="note">
          Every product built here gets its own repository on GitHub, created under this account or
          organisation.
        </p>
        <p>
          {owner ? (
            <>
              New products are created under <b>{owner}</b>.
            </>
          ) : (
            <span className="light-words red">No account is set yet.</span>
          )}
        </p>
        <form action="/api/settings/github" method="post" className="row">
          <input name="owner" placeholder="Account or organisation" defaultValue={owner ?? ''} />
          <button type="submit" className="primary">
            Save
          </button>
        </form>
      </section>

      <section id="people">
        <h2>People</h2>
        <p className="note">
          The people who can pick their name here. The builder adds a person to the members list.
        </p>
        <ul>
          {people.map((p) => (
            <li key={p.name}>
              {p.name} <small>{p.role === 'trainer' ? 'Trainer' : 'Customer'}</small>
            </li>
          ))}
        </ul>
      </section>

      <section id="harmony">
        <h2>Design system</h2>
        <p>
          ergOS Harmony:{' '}
          {harmony ? (
            <b>in use</b>
          ) : (
            <>
              <b>pending</b>. The screens use a placeholder palette until its colours arrive.
            </>
          )}
        </p>
      </section>
    </main>
  );
}
