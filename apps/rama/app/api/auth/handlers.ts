// Sign-in by username and password (the user's decision, 2026-10-24), as functions of their dependencies
// so they are tested without a server. The accounts come from RAMA_ACCOUNTS (packages/db/auth.ts).
import type { Account, Member } from '@rama/db';
import { SESSION_COOKIE } from '../../../server/session';

export interface AuthRouteDeps {
  check: (username: string, password: string) => Account | null;
  /** The person the account signs in as, and a new session for them. */
  signIn: (account: Account) => Promise<{ sessionToken: string; member: Member }>;
  revokeSession: (token: string) => Promise<void>;
  baseUrl: string;
  secure: boolean;
  /** A pause after a refused sign-in, to slow guessing. */
  pause: () => Promise<void>;
}

const cookie = (value: string, maxAgeSeconds: number, secure: boolean) =>
  `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;

const go = (location: string, setCookie?: string) =>
  new Response(null, {
    status: 303,
    headers: { location, ...(setCookie ? { 'set-cookie': setCookie } : {}) },
  });

/** POST /api/auth/login from the sign-in form: home with a session cookie, or back to the form. */
export async function handleLogin(form: FormData | null, deps: AuthRouteDeps): Promise<Response> {
  const username = String(form?.get('username') ?? '').trim();
  const password = String(form?.get('password') ?? '');
  const account = username && password ? deps.check(username, password) : null;
  if (!account) {
    await deps.pause();
    return go(`${deps.baseUrl}/login?failed=1`);
  }
  const { sessionToken } = await deps.signIn(account);
  return go(`${deps.baseUrl}/`, cookie(sessionToken, 30 * 86_400, deps.secure));
}

export async function handleLogout(
  token: string | undefined,
  deps: AuthRouteDeps,
): Promise<Response> {
  if (token) await deps.revokeSession(token);
  return go(`${deps.baseUrl}/login`, cookie('', 0, deps.secure));
}
