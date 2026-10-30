// Ask the code's deps on the real records (Stage 13).
import { execFileSync } from 'node:child_process';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { askCode, askedTurns, codeView, siteFilm, siteLakefront } from '@rama/workbench';
import { readSiteRecordName } from './film';
import type { AskDeps } from '../app/api/site/[siteId]/ask/handler';

export function askDeps(): AskDeps {
  return {
    source: (site, path, commit) => {
      try {
        return execFileSync('git', ['-C', site.repoDir, 'show', `${commit ?? 'HEAD'}:${path}`], {
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        });
      } catch {
        return null;
      }
    },
    about: (site, path) => {
      const bp = readSiteBlueprint(site);
      const lf = bp ? siteLakefront(site, bp) : null;
      const film = siteFilm(site, bp, readSiteRecordName(site), lf);
      const b = film.design.buildings.find((x) =>
        lf?.street.buildings.find((s) => s.id === x.id)?.bricks.includes(path),
      );
      const step = b ? (film.steps.find((s) => s.title.includes(b.name))?.title ?? b.name) : null;
      return { plain: b ? `a part of “${b.name}”` : null, step };
    },
    figures: (site, path, from, to) => {
      const v = codeView(site, path);
      if (!v) return [];
      return v.blocks
        .filter((b) => b.to >= from && b.from <= to)
        .flatMap((b) => b.figures.map((f) => ({ title: f.title, what: f.what })));
    },
    ask: (site, input) => askCode(site, input),
    turns: (siteId) => askedTurns(siteId),
  };
}
