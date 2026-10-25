// The Test button beside each key in Settings (Stage 7): one harmless call that proves the key works,
// answered as a light and one plain sentence. Listing models costs nothing and asks no model anything,
// so it is not a model call (rule 8 governs those) and writes no model_calls row. GitHub's is "who am I".
import type { SecretName } from '@rama/db';
import type { Fetch } from './adapters.ts';

export interface KeyCheck {
  ok: boolean;
  /** For a person, in plain words: what happened and, when red, what to do. */
  sentence: string;
}

const WHAT: Record<
  SecretName,
  { who: string; url: string; headers: (k: string) => Record<string, string> }
> = {
  ANTHROPIC_API_KEY: {
    who: 'Anthropic',
    url: 'https://api.anthropic.com/v1/models?limit=1',
    headers: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
  },
  OPENAI_API_KEY: {
    who: 'OpenAI',
    url: 'https://api.openai.com/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
  },
  GEMINI_API_KEY: {
    who: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
  },
  XAI_API_KEY: {
    who: 'xAI',
    url: 'https://api.x.ai/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
  },
  MOONSHOT_API_KEY: {
    who: 'Moonshot',
    url: 'https://api.moonshot.ai/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
  },
  GITHUB_TOKEN: {
    who: 'GitHub',
    url: 'https://api.github.com/user',
    headers: (k) => ({
      authorization: `Bearer ${k}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'house-of-rama',
    }),
  },
};

/** What each key is for and where to get it, one sentence each, for the Settings screen. */
export const KEY_HELP: Record<SecretName, { label: string; sentence: string }> = {
  ANTHROPIC_API_KEY: {
    label: 'Anthropic key',
    sentence:
      'For any seat Anthropic holds: Claude Code building, or drafting and checking. Get one at console.anthropic.com, under API keys.',
  },
  OPENAI_API_KEY: {
    label: 'OpenAI key',
    sentence:
      'For any seat OpenAI holds: the auditor, a different company from the builder, and the voice. Get one at platform.openai.com, under API keys.',
  },
  GEMINI_API_KEY: {
    label: 'Gemini key',
    sentence:
      'For a seat Google Gemini holds, such as the auditor or the drafter. Get one at aistudio.google.com, under API keys.',
  },
  XAI_API_KEY: {
    label: 'Grok key',
    sentence: 'For a seat xAI’s Grok holds, such as the auditor. Get one at console.x.ai.',
  },
  MOONSHOT_API_KEY: {
    label: 'Kimi key',
    sentence:
      'For a seat Moonshot’s Kimi holds, such as the auditor. Get one at platform.moonshot.ai.',
  },
  GITHUB_TOKEN: {
    label: 'GitHub token',
    sentence:
      'Lets House of Rama create each product its own repository and put the work there. Make one at github.com, Settings, Developer settings, Personal access tokens, with permission to create repositories.',
  },
};

/**
 * Makes the harmless call and turns its answer into a light and a sentence. Never echoes the key.
 * `githubApi` replaces https://api.github.com (a stub's address in the end-to-end test).
 */
export async function checkKey(
  name: SecretName,
  key: string,
  f: Fetch = fetch,
  opts: { githubApi?: string } = {},
): Promise<KeyCheck> {
  const w = WHAT[name];
  const url =
    name === 'GITHUB_TOKEN' && opts.githubApi ? `${opts.githubApi.replace(/\/$/, '')}/user` : w.url;
  let res: Response;
  try {
    res = await f(url, { headers: w.headers(key), signal: AbortSignal.timeout(15_000) });
  } catch {
    return {
      ok: false,
      sentence: `Could not reach ${w.who}. Check this laptop's internet connection and try again.`,
    };
  }
  if (res.ok) {
    if (name === 'GITHUB_TOKEN') {
      const login = ((await res.json().catch(() => ({}))) as { login?: string }).login;
      return { ok: true, sentence: `GitHub knows this token as ${login ?? 'an account'}.` };
    }
    return { ok: true, sentence: `${w.who} accepted this key.` };
  }
  if (res.status === 401 || res.status === 403)
    return {
      ok: false,
      sentence: `${w.who} refused this key: it is wrong, expired or withdrawn. Paste a fresh one.`,
    };
  if (res.status === 429)
    return {
      ok: false,
      sentence: `${w.who} says this key has run out of credit or is being limited. Try later.`,
    };
  return {
    ok: false,
    sentence: `${w.who} answered with an error (${res.status}). Try again in a minute.`,
  };
}
