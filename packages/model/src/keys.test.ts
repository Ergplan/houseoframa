// The key Test buttons (Stage 7), against stubbed vendors: a light and a plain sentence, never the key.
import { describe, expect, it, vi } from 'vitest';
import { checkKey } from './keys.ts';

const answer = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('checkKey', () => {
  it('turns a 200 into a green light, naming the GitHub account', async () => {
    const f = answer(200, { login: 'aayuda-bot' });
    expect(await checkKey('GITHUB_TOKEN', 'ghp_secret', f)).toEqual({
      ok: true,
      sentence: 'GitHub knows this token as aayuda-bot.',
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/user');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer ghp_secret');
    expect((await checkKey('OPENAI_API_KEY', 'sk-x', answer(200))).ok).toBe(true);
  });

  it('sends each vendor its own header on a harmless listing call', async () => {
    const f = answer(200);
    await checkKey('ANTHROPIC_API_KEY', 'sk-ant-x', f);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/);
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-x');
  });

  it('says in words why a key is red, and never repeats the key', async () => {
    const cases: [number | 'down', RegExp][] = [
      [401, /refused this key/],
      [403, /refused this key/],
      [429, /run out of credit/],
      [500, /error \(500\)/],
      ['down', /Could not reach OpenAI/],
    ];
    for (const [status, words] of cases) {
      const f =
        status === 'down'
          ? vi.fn(async () => Promise.reject(new TypeError('fetch failed')))
          : answer(status);
      const r = await checkKey('OPENAI_API_KEY', 'sk-very-secret', f);
      expect(r.ok).toBe(false);
      expect(r.sentence).toMatch(words);
      expect(r.sentence).not.toContain('sk-very-secret');
    }
  });
});
