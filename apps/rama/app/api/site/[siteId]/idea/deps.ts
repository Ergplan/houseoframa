import { siteRecord } from '@rama/blueprint/site';
import { readSecret } from '@rama/db';
import {
  addIdeaFile,
  agreeCard,
  askDrafter,
  pushTo,
  readIdeaFile,
  saveScratchpad,
} from '@rama/workbench';
import { withDb } from '../../../../../server/session';
import type { IdeaDeps } from './handler';

export const ideaDeps = (): IdeaDeps => ({
  addFile: (site, input) => addIdeaFile(site, input),
  saveScratchpad: (site, input) => saveScratchpad(site, input),
  ask: (site, input) => withDb((db) => askDrafter(db, site, input)),
  agree: (site, input) => withDb((db) => agreeCard(db, site, input)),
  push: async (site) => {
    const remote = siteRecord(site.id)?.remote;
    if (!remote) return null;
    try {
      const token = await withDb((db) => readSecret(db, 'GITHUB_TOKEN'));
      await pushTo(site.repoDir, `${remote}.git`, token ?? null);
      return null;
    } catch (err) {
      return `Kept here; not sent to GitHub yet: ${(err as Error).message}`;
    }
  },
  readFile: (site, name) => readIdeaFile(site, name),
});
