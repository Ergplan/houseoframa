import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import { choiceProblems } from '@rama/workbench';
import {
  handleBrains,
  handleGitHub,
  handleKey,
  handleSiteDatabase,
  type SettingsDeps,
} from './handlers';

const tara: Member = { id: 't1', name: 'Tara', email: null, role: 'trainer' };
const deps = (over: Partial<SettingsDeps> = {}): SettingsDeps => ({
  trainer: async () => tara,
  setSecret: vi.fn(async () => {}),
  removeSecret: vi.fn(async () => {}),
  testKey: vi.fn(async () => ({ ok: true, sentence: 'OpenAI accepted this key.' })),
  setOwner: vi.fn(async () => {}),
  // The real rule, with nothing stored.
  setBrains: vi.fn(async (seats) => choiceProblems(seats)),
  siteName: (id) => (id === 'ekbill' ? 'EkBill' : null),
  setSiteDatabase: vi.fn(async () => {}),
  removeSiteDatabase: vi.fn(async () => {}),
  testSiteDatabase: vi.fn(async () => ({ ok: true, sentence: 'Connected: 3 tables, read only.' })),
  baseUrl: 'http://rama.test',
  ...over,
});
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const said = (r: Response) => {
  const u = new URL(r.headers.get('location')!);
  return { page: u.pathname, said: u.searchParams.get('said'), error: u.searchParams.get('error') };
};

describe('POST /api/settings/keys', () => {
  it('saves a key as the trainer, tests it at once, and never repeats it', async () => {
    const d = deps();
    const r = await handleKey(form({ name: 'OPENAI_API_KEY', value: ' sk-secret-value ' }), d);
    expect(r.status).toBe(303);
    expect(d.setSecret).toHaveBeenCalledWith('OPENAI_API_KEY', 'sk-secret-value', 't1');
    expect(said(r)).toEqual({
      page: '/settings',
      said: 'The OpenAI key is saved. OpenAI accepted this key.',
      error: null,
    });
    expect(r.headers.get('location')).not.toContain('sk-secret-value');
  });

  it('a red Test comes back as an error sentence; an empty paste or unknown key is refused', async () => {
    const red = deps({
      testKey: async () => ({ ok: false, sentence: 'OpenAI refused this key.' }),
    });
    expect(said(await handleKey(form({ name: 'OPENAI_API_KEY', action: 'test' }), red)).error).toBe(
      'OpenAI refused this key.',
    );
    const d = deps({ testKey: async () => null });
    expect(said(await handleKey(form({ name: 'GITHUB_TOKEN', action: 'test' }), d)).error).toMatch(
      /not entered yet/,
    );
    expect(said(await handleKey(form({ name: 'GITHUB_TOKEN', value: ' ' }), d)).error).toBe(
      'Paste the key first.',
    );
    expect(said(await handleKey(form({ name: 'DATABASE_URL', value: 'x' }), d)).error).toBe(
      'There is no such key.',
    );
    expect(d.setSecret).not.toHaveBeenCalled();
  });

  it('removes a key', async () => {
    const d = deps();
    const r = await handleKey(form({ name: 'GITHUB_TOKEN', action: 'remove' }), d);
    expect(d.removeSecret).toHaveBeenCalledWith('GITHUB_TOKEN');
    expect(said(r).said).toBe('The GitHub token is removed.');
  });

  it('is a trainer’s: anyone else gets the refusal, and nothing is written', async () => {
    const d = deps({ trainer: async () => new Response(null, { status: 403 }) });
    expect((await handleKey(form({ name: 'GITHUB_TOKEN', value: 'x' }), d)).status).toBe(403);
    expect((await handleGitHub(form({ owner: 'aayuda' }), d)).status).toBe(403);
    expect(d.setSecret).not.toHaveBeenCalled();
    expect(d.setOwner).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/github', () => {
  it('sets the account products are created under; refuses something that is not an account name', async () => {
    const d = deps();
    expect(said(await handleGitHub(form({ owner: ' aayuda ' }), d)).said).toBe(
      'New products will be created under aayuda on GitHub.',
    );
    expect(d.setOwner).toHaveBeenCalledWith('aayuda', 't1');
    expect(said(await handleGitHub(form({ owner: 'not an/account' }), d)).error).toMatch(
      /not a GitHub account name/,
    );
  });
});

describe('POST /api/settings/brains', () => {
  const seats = (auditor: string) =>
    form({
      'builder.vendor': 'anthropic',
      'builder.builder': 'claude-code',
      'builder.model': 'claude-sonnet-5-5',
      'auditor.vendor': auditor,
      'auditor.model': auditor === 'ollama' ? 'llama4' : 'gpt-6.1-sol',
      'auditor.baseUrl': auditor === 'ollama' ? 'http://localhost:11434/v1' : '',
      'drafter.vendor': 'anthropic',
      'drafter.model': 'claude-sonnet-5-5',
      'voice.vendor': 'openai',
      'voice.model': 'gpt-realtime',
    });

  it('saves four seats as the trainer, with an auditor of another company, Ollama included', async () => {
    const d = deps();
    expect(said(await handleBrains(seats('openai'), d)).said).toBe(
      'The brains are saved: every new product starts with them.',
    );
    expect(d.setBrains).toHaveBeenCalledWith(
      expect.objectContaining({
        builder: { vendor: 'anthropic', model: 'claude-sonnet-5-5', builder: 'claude-code' },
        auditor: { vendor: 'openai', model: 'gpt-6.1-sol' },
      }),
      tara,
    );
    expect(said(await handleBrains(seats('ollama'), d)).error).toBeNull();
  });

  it('refuses an auditor from the builder’s own company, and says why (Invariant 5)', async () => {
    const r = said(await handleBrains(seats('anthropic'), deps()));
    expect(r.error).toBe(
      'The auditor cannot be Anthropic, the builder’s own vendor: the checker is never the builder (Invariant 5).',
    );
  });

  it('is a trainer’s', async () => {
    const d = deps({ trainer: async () => new Response(null, { status: 403 }) });
    expect((await handleBrains(seats('openai'), d)).status).toBe(403);
    expect(d.setBrains).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/databases (Stage 11)', () => {
  const url = 'postgres://reader:pw-secret@db.example.in:5432/ekbill';
  it('saves an outside site’s database address, tests it at once, and never repeats it', async () => {
    const d = deps();
    const r = await handleSiteDatabase(form({ site: 'ekbill', value: ` ${url} ` }), d);
    expect(d.setSiteDatabase).toHaveBeenCalledWith('ekbill', url, 't1');
    expect(said(r)).toEqual({
      page: '/settings',
      said: 'The database of EkBill is saved. Connected: 3 tables, read only.',
      error: null,
    });
    expect(r.headers.get('location')).not.toContain('pw-secret');
  });

  it('refuses what is not a database address, an unknown site, and anyone but a trainer', async () => {
    const d = deps();
    expect(
      said(await handleSiteDatabase(form({ site: 'ekbill', value: 'sk-1' }), d)).error,
    ).toMatch(/starts with postgres:\/\//);
    expect(said(await handleSiteDatabase(form({ site: 'nope', value: url }), d)).error).toBe(
      'There is no such site.',
    );
    const no = deps({ trainer: async () => new Response(null, { status: 403 }) });
    expect((await handleSiteDatabase(form({ site: 'ekbill', value: url }), no)).status).toBe(403);
    expect(d.setSiteDatabase).not.toHaveBeenCalled();
    expect(no.setSiteDatabase).not.toHaveBeenCalled();
  });

  it('tests and removes; a red test comes back as its sentence', async () => {
    const red = deps({
      testSiteDatabase: async () => ({ ok: false, sentence: 'Could not read from it: refused.' }),
    });
    expect(
      said(await handleSiteDatabase(form({ site: 'ekbill', action: 'test' }), red)).error,
    ).toBe('Could not read from it: refused.');
    const d = deps();
    const r = await handleSiteDatabase(form({ site: 'ekbill', action: 'remove' }), d);
    expect(d.removeSiteDatabase).toHaveBeenCalledWith('ekbill');
    expect(said(r).said).toMatch(/no longer read/);
  });
});
