// The authorization rules' dependencies on the real database, for route handlers.
import { memberBySession } from '@rama/db';
import type { AuthDeps } from './authorize';
import { ownedSite, withDb } from './session';

export const authDeps = (): AuthDeps => ({
  memberBySession: (token) => withDb((db) => memberBySession(db, token)),
  ownedSite: (member, siteId) => withDb((db) => ownedSite(db, member, siteId)),
});
