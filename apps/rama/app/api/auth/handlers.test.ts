import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import { handleLinkRequest, handleLogout, handleVerify, type AuthRouteDeps } from './handlers';
import { tokenFromCookieHeader } from '../../../server/session';
import { deliver, signInMail } from '../../../server/mail';

const asha: Member = { id: 'p1', name: 'Asha Rao', email: 'asha@example.com', role: 'member' };
const deps = (over: Partial<AuthRouteDeps> = {}): AuthRouteDeps => ({
  issueLink: vi.fn(async (email: string) =>
    email === 'asha@example.com' ? { token: 't/1+', member: asha } : null,
  ),
  redeemLink: vi.fn(async (t: string) =>
    t === 'good' ? { sessionToken: 's1', member: asha } : null,
  ),
  revokeSession: vi.fn(async () => {}),
  deliver: vi.fn(async () => 'outbox'),
  baseUrl: 'https://rama.example',
  secure: true,
  ...over,
});

describe('POST /api/auth/link', () => {
  it('mails a member a one-time link, and answers a stranger the same way without mailing anyone', async () => {
    const d = deps();
    const known = await handleLinkRequest({ email: 'asha@example.com' }, d);
    const stranger = await handleLinkRequest({ email: 'who@example.com' }, d);
    expect([known.status, await known.json()]).toEqual([200, { ok: true }]);
    expect([stranger.status, await stranger.json()]).toEqual([200, { ok: true }]);
    expect(d.deliver).toHaveBeenCalledTimes(1);
    expect(d.deliver).toHaveBeenCalledWith(
      'asha@example.com',
      'https://rama.example/auth/verify?token=t%2F1%2B',
      'Asha Rao',
    );
    expect((await handleLinkRequest({}, d)).status).toBe(400);
  });
});

describe('GET /auth/verify', () => {
  it('sets an httpOnly, Secure, SameSite session cookie for a good link and goes home', async () => {
    const r = await handleVerify(new URL('https://rama.example/auth/verify?token=good'), deps());
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('https://rama.example/');
    expect(r.headers.get('set-cookie')).toBe(
      'rama_session=s1; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure',
    );
  });
  it('sends a used, expired or missing link back to sign in, setting nothing', async () => {
    for (const q of ['?token=used', '']) {
      const r = await handleVerify(new URL(`https://rama.example/auth/verify${q}`), deps());
      expect(r.headers.get('location')).toBe('https://rama.example/login?expired=1');
      expect(r.headers.get('set-cookie')).toBeNull();
    }
  });
  it('leaves Secure off on plain http (this machine)', async () => {
    const r = await handleVerify(
      new URL('http://localhost:3000/auth/verify?token=good'),
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

describe('the session cookie and the sign-in mail', () => {
  it('reads the session token from a Cookie header', () => {
    expect(tokenFromCookieHeader('a=1; rama_session=abc%2Fd; b=2')).toBe('abc/d');
    expect(tokenFromCookieHeader('a=1')).toBeUndefined();
    expect(tokenFromCookieHeader(null)).toBeUndefined();
  });
  it('writes the link to the outbox (the server log) when no SMTP server is configured', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(
        await deliver(
          signInMail('asha@example.com', 'https://x/auth/verify?token=t', 'Asha Rao'),
          {} as NodeJS.ProcessEnv,
        ),
      ).toBe('outbox');
      expect(log.mock.calls[0]![0]).toContain('[outbox] to asha@example.com');
      expect(log.mock.calls[0]![0]).toContain('https://x/auth/verify?token=t');
    } finally {
      log.mockRestore();
    }
  });
});
