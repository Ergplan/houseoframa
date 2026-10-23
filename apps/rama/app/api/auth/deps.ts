import { issueLink, redeemLink, revokeSession } from '@rama/db';
import { withDb } from '../../../server/session';
import { deliver, signInMail } from '../../../server/mail';
import type { AuthRouteDeps } from './handlers';

/** The public address of the app: RAMA_BASE_URL, else the request's own origin. */
export const authDeps = (req: Request): AuthRouteDeps => {
  const baseUrl = (process.env.RAMA_BASE_URL ?? new URL(req.url).origin).replace(/\/$/, '');
  return {
    issueLink: (email) => withDb((db) => issueLink(db, email)),
    redeemLink: (token) => withDb((db) => redeemLink(db, token)),
    revokeSession: (token) => withDb((db) => revokeSession(db, token)),
    deliver: (to, url, name) => deliver(signInMail(to, url, name)),
    baseUrl,
    secure: baseUrl.startsWith('https://'),
  };
};
