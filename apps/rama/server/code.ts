// The code routes' deps on the real records (Stage 11).
import { readSiteBlueprint } from '@rama/blueprint/site';
import {
  codeView,
  confirmExplanation,
  jobStatus,
  latestJob,
  readEdits,
  siteLakefront,
} from '@rama/workbench';
import type { CodeDeps } from '../app/api/site/[siteId]/code/handler';
import { jobDb } from './jobs';

export function codeDeps(): CodeDeps {
  return {
    blueprint: (site) => readSiteBlueprint(site),
    view: (site, path, commit, href) =>
      codeView(site, path, { ...(commit ? { commit } : {}), href }),
    confirm: (site, hash, who) => jobDb((db) => confirmExplanation(db, site, hash, who)),
    edits: (siteId, since) => readEdits(siteId, since),
    building: (siteId) => {
      const j = latestJob('build', siteId);
      return Boolean(j && jobStatus(j) === 'running');
    },
    buildingOf: (site, path) => {
      const bp = readSiteBlueprint(site);
      if (!bp) return null;
      return (
        siteLakefront(site, bp).street.buildings.find((b) => b.bricks.includes(path))?.id ?? null
      );
    },
  };
}
