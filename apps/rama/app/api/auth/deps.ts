import {
  accountsFrom,
  authMode,
  checkCredentials,
  ensurePerson,
  openSession,
  readMembers,
  revokeSession,
} from '@rama/db';
import { withDb } from '../../../server/session';
import type { AuthRouteDeps } from './handlers';

/** The public address of the app: RAMA_BASE_URL, else the request's own origin. */
export const authDeps = (req: Request): AuthRouteDeps => {
  const baseUrl = (process.env.RAMA_BASE_URL ?? new URL(req.url).origin).replace(/\/$/, '');
  return {
    mode: authMode(),
    members: () => readMembers(),
    pick: (entry) =>
      withDb(async (db) => {
        const member = await ensurePerson(db, entry, 'rama:app-pick@0.1.0');
        return { member, sessionToken: await openSession(db, member.id) };
      }),
    check: (username, password) => checkCredentials(accountsFrom(), username, password),
    signIn: (account) =>
      withDb(async (db) => {
        const member = await ensurePerson(db, account, 'rama:app-login@0.1.0');
        return { member, sessionToken: await openSession(db, member.id) };
      }),
    revokeSession: (token) => withDb((db) => revokeSession(db, token)),
    baseUrl,
    secure: baseUrl.startsWith('https://'),
    pause: () => new Promise((r) => setTimeout(r, 500)),
  };
};
