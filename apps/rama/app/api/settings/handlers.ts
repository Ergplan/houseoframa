// Settings (Stage 7), as functions of their dependencies so they are tested without a server: the keys
// (enter, remove, Test) and the GitHub account. A trainer's screen: anyone else is refused. Every answer
// is a 303 back to /settings with a plain sentence; a key's value is never echoed.
import { isSecretName, type Member, type SecretName } from '@rama/db';
import type { KeyCheck } from '@rama/model';
import { back } from '../../../server/http';

export interface SettingsDeps {
  /** The signed-in trainer, or the refusal to send. */
  trainer: () => Promise<Member | Response>;
  setSecret: (name: SecretName, value: string, by: string) => Promise<void>;
  removeSecret: (name: SecretName) => Promise<void>;
  /** Runs the key's Test and records its light; null when there is no key to test. */
  testKey: (name: SecretName) => Promise<KeyCheck | null>;
  setOwner: (owner: string, by: string) => Promise<void>;
  baseUrl: string;
}

const LABEL: Record<SecretName, string> = {
  ANTHROPIC_API_KEY: 'The Anthropic key',
  OPENAI_API_KEY: 'The OpenAI key',
  GITHUB_TOKEN: 'The GitHub token',
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
