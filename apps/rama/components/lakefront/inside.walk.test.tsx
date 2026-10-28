// The walk (Stage 11): the Stage 2 brick building is retired, and nothing that was inspectable on it
// becomes less so. Every brick of the sample product and of this repository is picked inside its
// building, as a person clicks it, and the panel shows for it what the Stage 2 inspector showed: its
// English edges (each import, each user, with its phrase and state), the lift that laid it, its figures
// (the reviewer's paragraph, from packages/blueprint/metrics); and every commit opens.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Blueprint } from '@rama/shared';
import { brickFigures, brickHistory } from '@rama/blueprint/metrics';
import {
  insidesOf,
  parseFeatures,
  pickInside,
  pointOf,
  resolveFeatures,
  street,
} from '@rama/stage';
import { stallBlueprint, stallFeatures } from '../../../../packages/stage/test/blueprint';
import { Inspector, type View } from '../inspector/Inspector';
import { edgePhrase, reviewerParagraph } from '../inspector/words';

const root = path.resolve(import.meta.dirname, '../../../..');
const read = (f: string) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const noop = () => {};
const esc = (s: string) => renderToStaticMarkup(<>{s}</>);

for (const [name, bp, features] of [
  ['the sample product', stallBlueprint(), stallFeatures],
  ['this repository', read('blueprint/self.json') as Blueprint, read('.rama/features.json')],
] as const)
  describe(`the inside of ${name}`, () => {
    const render = (view: View) =>
      renderToStaticMarkup(
        <Inspector
          siteId="walk"
          blueprint={bp}
          view={view}
          member="Asha Rao"
          onBrick={noop}
          onCommit={noop}
          onReport={noop}
          onConfirmed={noop}
        />,
      );
    const st = street(bp, resolveFeatures(bp, parseFeatures(features)), {});
    const figures = brickFigures(bp);

    it('reaches every brick by a click, and shows its English edges, its lift and its figures', () => {
      const reached: string[] = [];
      for (const s of insidesOf(bp, st.buildings)) {
        for (const x of s.bricks) {
          // Clicked where it shows, with its floor chosen; the pick says which brick that is.
          const at = pointOf(s, x.path);
          expect(at, `${x.path} in ${s.name}`).not.toBeNull();
          const hit = pickInside(s, at!, x.floor);
          const p = hit?.kind === 'brick' ? hit.path : null;
          expect(p).toBe(x.path);
          reached.push(p!);
          const html = render({ kind: 'brick', path: p! });
          expect(html).toContain(`<h3>${esc(p!)}</h3>`);
          for (const e of bp.edges.filter((x) => x.from === p || x.to === p)) {
            expect(html).toContain(`data-edge="${esc(`${e.from}>${e.to}`)}"`);
            expect(html).toContain(esc(edgePhrase(e).text));
          }
          const h = brickHistory(bp, p!);
          const born = h.laidIn === null ? null : h.entries.find((x) => x.laid)!;
          if (born) expect(html).toContain(`lift ${born.index + 1}</button>`);
          else expect(html).toContain('not in the history yet');
          expect(html).toContain(esc(reviewerParagraph(bp, p!, figures[p!]!)));
        }
      }
      expect(reached.sort()).toEqual(bp.nodes.map((n) => n.path).sort());
    });

    it('opens every commit', () => {
      bp.commits.forEach((c, i) => {
        expect(render({ kind: 'commit', index: i })).toContain(`<h3>${esc(c.subject)}</h3>`);
      });
    });
  });
