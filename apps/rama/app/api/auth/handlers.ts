// Sign-in, as functions of their dependencies so they are tested without a server. Version 1 (rule 11):
// a person picks their name from members.json and that name is who acts. With AUTH_MODE=password (the
// floor edition) a username and password from RAMA_ACCOUNTS sign in instead; each mode refuses the other's
// route with 404, so a picker cannot be used where passwords are required.
import type { Account, AuthMode, Member, MemberEntry } from '@rama/db';
import { SESSION_COOKIE } from '../../../server/session';

export interface AuthRouteDeps {
  mode: AuthMode;
  /** The people of members.json. */
  members: () => MemberEntry[];
  /** The person of that name, and a new session for them. */
  pick: (entry: MemberEntry) => Promise<{ sessionToken: string; member: Member }>;
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

const off = () => Response.json({ ok: false, error: 'not found' }, { status: 404 });

/** POST /api/auth/pick from "Who are you?": a name in members.json is signed in, anything else is not. */
export async function handlePick(form: FormData | null, deps: AuthRouteDeps): Promise<Response> {
  if (deps.mode !== 'members') return off();
  const name = String(form?.get('name') ?? '').trim();
  const entry = deps.members().find((m) => m.name === name);
  if (!entry) return go(`${deps.baseUrl}/login?failed=1`);
  const { sessionToken } = await deps.pick(entry);
  return go(`${deps.baseUrl}/`, cookie(sessionToken, 30 * 86_400, deps.secure));
}

/** POST /api/auth/login from the password form (AUTH_MODE=password): home with a session cookie, or back. */
export async function handleLogin(form: FormData | null, deps: AuthRouteDeps): Promise<Response> {
  if (deps.mode !== 'password') return off();
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
