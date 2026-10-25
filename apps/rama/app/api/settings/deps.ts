import {
  GITHUB_OWNER,
  listSecrets,
  putSetting,
  readSecret,
  recordSecretCheck,
  removeSecret,
  setSecret,
} from '@rama/db';
import { checkKey } from '@rama/model';
import { chooseDefaultSeats } from '@rama/workbench';
import { authManager } from '../../../server/authorize';
import { authDeps } from '../../../server/auth-deps';
import { baseUrlOf } from '../../../server/http';
import { withDb } from '../../../server/session';
import type { SettingsDeps } from './handlers';

export const settingsDeps = (req: Request): SettingsDeps => ({
  trainer: () => authManager(req, authDeps()),
  setSecret: (name, value, by) => withDb((db) => setSecret(db, name, value, by)),
  removeSecret: (name) => withDb((db) => removeSecret(db, name)),
  testKey: (name) =>
    withDb(async (db) => {
      const key = await readSecret(db, name);
      if (!key) return null;
      const r = await checkKey(name, key, fetch, { githubApi: process.env.RAMA_GITHUB_API });
      // The light is kept with a key entered in Settings; one read from the environment is only shown.
      const view = (await listSecrets(db)).find((v) => v.name === name);
      if (view?.source === 'settings') await recordSecretCheck(db, name, r);
      return r;
    }),
  setOwner: (owner, by) => withDb((db) => putSetting(db, GITHUB_OWNER, { owner }, by)),
  setBrains: (seats, by) => withDb((db) => chooseDefaultSeats(db, seats, by)),
  baseUrl: baseUrlOf(req),
});
