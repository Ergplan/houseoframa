import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
import { Button, Card, Chip } from '../../components/harmony/ui';
import { Shell } from '../../components/harmony/Shell';
import { requireMember, withDb } from '../../server/session';

export const dynamic = 'force-dynamic';

/** The light beside a key, as a chip with its word, and the reason in words. */
function light(v: SecretView): {
  tone: 'positive' | 'negative' | 'muted';
  word: string;
  words: string;
} {
  if (!v.set) return { tone: 'negative', word: 'Missing', words: 'Not entered yet.' };
  if (v.check)
    return v.check.ok
      ? { tone: 'positive', word: 'Works', words: v.check.sentence }
      : { tone: 'negative', word: 'Refused', words: v.check.sentence };
  if (v.source === 'environment')
    return {
      tone: 'muted',
      word: 'Not checked',
      words: 'Read from the server’s setup file. Press Test to check it.',
    };
  return { tone: 'muted', word: 'Not checked', words: 'Entered, not checked yet. Press Test.' };
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
  const tokensFile = path.join(homeDir(), 'design/harmony/tokens.json');
  const harmony = existsSync(tokensFile)
    ? (JSON.parse(readFileSync(tokensFile, 'utf8')) as {
        name: string;
        meta: { repo: string; ref: string };
      })
    : null;
  const people = readMembers();
  return (
    <Shell
      here="settings"
      member={member}
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
    >
      <h1 className="eg-h1">Settings</h1>
      <Said q={q} />

      <Card
        id="keys"
        title="Keys"
        sub={`Each key is kept encrypted on this laptop and shown only by its last four characters.${
          fromEnv
            ? ' None is entered here yet, so the keys in the server’s setup file are used. Once you enter one here, only the keys entered here are used.'
            : ''
        }`}
      >
        {keys.map((k) => {
          const l = light(k);
          return (
            <div key={k.name} className="key" data-key={k.name}>
              <div className="key-head">
                <b>{KEY_HELP[k.name].label}</b>
                <Chip tone={l.tone} className={`light ${l.tone}`}>
                  {l.word}
                </Chip>
                {k.masked ? <small>{k.masked}</small> : null}
              </div>
              <p className="eg-muted" style={{ margin: 0 }}>
                {KEY_HELP[k.name].sentence}
              </p>
              <p className={`light-words ${l.tone}`} style={{ margin: 0 }}>
                {l.words}
              </p>
              <form action="/api/settings/keys" method="post" className="rama-row">
                <input type="hidden" name="name" value={k.name} />
                <input
                  className="eg-input"
                  name="value"
                  type="password"
                  autoComplete="off"
                  placeholder={k.set ? 'Paste a new key to replace it' : 'Paste the key here'}
                  aria-label={`${KEY_HELP[k.name].label}`}
                />
                <Button type="submit" name="action" value="save">
                  Save
                </Button>
                <Button type="submit" name="action" value="test" variant="ghost" formNoValidate>
                  Test
                </Button>
                {k.source === 'settings' ? (
                  <Button type="submit" name="action" value="remove" variant="ghost" formNoValidate>
                    Remove
                  </Button>
                ) : null}
              </form>
            </div>
          );
        })}
      </Card>

      <Card
        id="github"
        title="GitHub"
        sub="Every product built here gets its own repository on GitHub, created under this account or organisation."
      >
        <p style={{ marginTop: 0 }}>
          {owner ? (
            <>
              New products are created under <b>{owner}</b>.
            </>
          ) : (
            <Chip tone="negative">No account is set yet</Chip>
          )}
        </p>
        <form action="/api/settings/github" method="post" className="rama-row">
          <input
            className="eg-input"
            name="owner"
            placeholder="Account or organisation"
            defaultValue={owner ?? ''}
          />
          <Button type="submit">Save</Button>
        </form>
      </Card>

      <Card
        id="people"
        title="People"
        sub="The people who can pick their name here. The builder adds a person to the members list."
      >
        <ul className="eg-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {people.map((p) => (
            <li key={p.name} className="rama-row">
              {p.name} <Chip>{p.role === 'trainer' ? 'Trainer' : 'Customer'}</Chip>
            </li>
          ))}
        </ul>
      </Card>

      <Card id="harmony" title="Design system">
        <p style={{ margin: 0 }}>
          {harmony ? (
            <>
              <b>{harmony.name}</b>, synced from {harmony.meta.repo} at{' '}
              <span className="eg-mono">{harmony.meta.ref.replace(/^main@/, '')}</span>.
            </>
          ) : (
            <>
              ergOS Harmony: <b>pending</b>. Its tokens have not arrived.
            </>
          )}
        </p>
      </Card>
    </Shell>
  );
}
