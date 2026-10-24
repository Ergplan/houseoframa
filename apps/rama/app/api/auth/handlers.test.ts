import { describe, expect, it, vi } from 'vitest';
import type { Account } from '@rama/db';
import { handleLogin, handleLogout, type AuthRouteDeps } from './handlers';
import { tokenFromCookieHeader } from '../../../server/session';

const asha: Account = {
  username: 'asha',
  password: 'correct horse',
  name: 'Asha Rao',
  role: 'manager',
};
const deps = (over: Partial<AuthRouteDeps> = {}): AuthRouteDeps => ({
  check: vi.fn((u: string, p: string) => (u === 'asha' && p === 'correct horse' ? asha : null)),
  signIn: vi.fn(async () => ({
    sessionToken: 's1',
    member: { id: 'p1', name: 'Asha Rao', email: null, role: 'manager' as const },
  })),
  revokeSession: vi.fn(async () => {}),
  baseUrl: 'https://rama.example',
  secure: true,
  pause: vi.fn(async () => {}),
  ...over,
});
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('POST /api/auth/login', () => {
  it('signs a right username and password in: an httpOnly, Secure, SameSite session cookie, then home', async () => {
    const d = deps();
    const r = await handleLogin(form({ username: ' asha ', password: 'correct horse' }), d);
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('https://rama.example/');
    expect(r.headers.get('set-cookie')).toBe(
      'rama_session=s1; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure',
    );
    expect(d.signIn).toHaveBeenCalledWith(asha);
    expect(d.pause).not.toHaveBeenCalled();
  });

  it('sends a wrong or missing password back to the form after a pause, setting nothing', async () => {
    for (const f of [
      form({ username: 'asha', password: 'wrong' }),
      form({ username: 'asha' }),
      null,
    ]) {
      const d = deps();
      const r = await handleLogin(f, d);
      expect(r.headers.get('location')).toBe('https://rama.example/login?failed=1');
      expect(r.headers.get('set-cookie')).toBeNull();
      expect(d.signIn).not.toHaveBeenCalled();
      expect(d.pause).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves Secure off on plain http (this machine)', async () => {
    const r = await handleLogin(
      form({ username: 'asha', password: 'correct horse' }),
      deps({ baseUrl: 'http://localhost:3000', secure: false }),
    );
    expect(r.headers.get('set-cookie')).not.toContain('Secure');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const d = deps();
    const r = await handleLogout('s1', d);
    expect(d.revokeSession).toHaveBeenCalledWith('s1');
    expect(r.headers.get('set-cookie')).toContain(
      'rama_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
    expect(r.headers.get('location')).toBe('https://rama.example/login');
  });
});

describe('the session cookie', () => {
  it('reads the session token from a Cookie header', () => {
    expect(tokenFromCookieHeader('a=1; rama_session=abc%2Fd; b=2')).toBe('abc/d');
    expect(tokenFromCookieHeader('a=1')).toBeUndefined();
    expect(tokenFromCookieHeader(null)).toBeUndefined();
  });
});
