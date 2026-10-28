// Settings (Stage 7), as functions of their dependencies so they are tested without a server: the keys
// (enter, remove, Test) and the GitHub account. A trainer's screen: anyone else is refused. Every answer
// is a 303 back to /settings with a plain sentence; a key's value is never echoed.
import { isSecretName, type Member, type SecretName } from '@rama/db';
import type { KeyCheck, Seats } from '@rama/model';
import { seatsFromForm } from '@rama/workbench';
import { back } from '../../../server/http';

export interface SettingsDeps {
  /** The signed-in trainer, or the refusal to send. */
  trainer: () => Promise<Member | Response>;
  setSecret: (name: SecretName, value: string, by: string) => Promise<void>;
  removeSecret: (name: SecretName) => Promise<void>;
  /** Runs the key's Test and records its light; null when there is no key to test. */
  testKey: (name: SecretName) => Promise<KeyCheck | null>;
  setOwner: (owner: string, by: string) => Promise<void>;
  /** Saves the default seats (Settings → Brains); returns why not when they cannot stand. */
  setBrains: (seats: Partial<Seats>, by: Member) => Promise<string[]>;
  /** Stage 11: an outside site's read-only database address, its rows' only source. */
  siteName: (siteId: string) => string | null;
  setSiteDatabase: (siteId: string, url: string, by: string) => Promise<void>;
  removeSiteDatabase: (siteId: string) => Promise<void>;
  /** Runs the address's Test and records its light; null when none is entered. */
  testSiteDatabase: (siteId: string) => Promise<{ ok: boolean; sentence: string } | null>;
  baseUrl: string;
}

const LABEL: Record<SecretName, string> = {
  ANTHROPIC_API_KEY: 'The Anthropic key',
  OPENAI_API_KEY: 'The OpenAI key',
  GITHUB_TOKEN: 'The GitHub token',
  GEMINI_API_KEY: 'The Gemini key',
  XAI_API_KEY: 'The Grok key',
  MOONSHOT_API_KEY: 'The Kimi key',
};

/** POST /api/settings/keys: `name` and `action` (save with `value`, remove, or test). */
export async function handleKey(form: FormData | null, deps: SettingsDeps): Promise<Response> {
  const who = await deps.trainer();
  if (who instanceof Response) return who;
  const name = String(form?.get('name') ?? '');
  const action = String(form?.get('action') ?? 'save');
  if (!isSecretName(name))
    return back(deps.baseUrl, '/settings', { ok: false, sentence: 'There is no such key.' });
  if (action === 'remove') {
    await deps.removeSecret(name);
    return back(deps.baseUrl, '/settings', { ok: true, sentence: `${LABEL[name]} is removed.` });
  }
  if (action === 'test') {
    const r = await deps.testKey(name);
    return back(
      deps.baseUrl,
      '/settings',
      r ?? {
        ok: false,
        sentence: `${LABEL[name]} is not entered yet, so there is nothing to test.`,
      },
    );
  }
  const value = String(form?.get('value') ?? '').trim();
  if (!value)
    return back(deps.baseUrl, '/settings', { ok: false, sentence: 'Paste the key first.' });
  await deps.setSecret(name, value, who.id);
  const r = await deps.testKey(name);
  return back(deps.baseUrl, '/settings', {
    ok: r?.ok ?? true,
    sentence: `${LABEL[name]} is saved. ${r?.sentence ?? ''}`.trim(),
  });
}

/** POST /api/settings/github: `owner`, the account or organisation products are created under. */
export async function handleGitHub(form: FormData | null, deps: SettingsDeps): Promise<Response> {
  const who = await deps.trainer();
  if (who instanceof Response) return who;
  const owner = String(form?.get('owner') ?? '').trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner))
    return back(deps.baseUrl, '/settings', {
      ok: false,
      sentence: 'That is not a GitHub account name: letters, digits and dashes.',
    });
  await deps.setOwner(owner, who.id);
  return back(deps.baseUrl, '/settings', {
    ok: true,
    sentence: `New products will be created under ${owner} on GitHub.`,
  });
}

/** POST /api/settings/brains: the default seats, `<seat>.vendor` and `<seat>.model` (and `builder.builder`). */
export async function handleBrains(form: FormData | null, deps: SettingsDeps): Promise<Response> {
  const who = await deps.trainer();
  if (who instanceof Response) return who;
  const problems = await deps.setBrains(form ? seatsFromForm(form) : {}, who);
  return back(
    deps.baseUrl,
    '/settings',
    problems.length
      ? { ok: false, sentence: problems.join(' ') }
      : { ok: true, sentence: 'The brains are saved: every new product starts with them.' },
  );
}

/** POST /api/settings/databases: `site` and `action` (save with `value`, remove, or test). */
export async function handleSiteDatabase(
  form: FormData | null,
  deps: SettingsDeps,
): Promise<Response> {
  const who = await deps.trainer();
  if (who instanceof Response) return who;
  const site = String(form?.get('site') ?? '');
  const name = deps.siteName(site);
  if (!name)
    return back(deps.baseUrl, '/settings', { ok: false, sentence: 'There is no such site.' });
  const action = String(form?.get('action') ?? 'save');
  if (action === 'remove') {
    await deps.removeSiteDatabase(site);
    return back(deps.baseUrl, '/settings', {
      ok: true,
      sentence: `The database of ${name} is removed: its rows are no longer read.`,
    });
  }
  if (action === 'test') {
    const r = await deps.testSiteDatabase(site);
    return back(
      deps.baseUrl,
      '/settings',
      r ?? {
        ok: false,
        sentence: `No database is entered for ${name}, so there is nothing to test.`,
      },
    );
  }
  const value = String(form?.get('value') ?? '').trim();
  if (!/^postgres(ql)?:\/\/\S+$/.test(value))
    return back(deps.baseUrl, '/settings', {
      ok: false,
      sentence: 'Paste the database address first: it starts with postgres://.',
    });
  await deps.setSiteDatabase(site, value, who.id);
  const r = await deps.testSiteDatabase(site);
  return back(deps.baseUrl, '/settings', {
    ok: r?.ok ?? true,
    sentence: `The database of ${name} is saved. ${r?.sentence ?? ''}`.trim(),
  });
}
