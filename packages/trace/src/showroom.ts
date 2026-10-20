// The Showroom of a site: its captured screens, each figure traced or untraced (Invariant 2: there is
// no third state), and a trail for every traced figure. Read from work/<site>/capture.json and the
// site's Blueprint; nothing is computed by a model and nothing is retyped.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Blueprint, FigureRef, Trail } from '@rama/shared';
import { workDir } from '@rama/blueprint/site';
import type { Capture, CapturedScreen } from './capture.ts';
import { buildTrail } from './trail.ts';

export interface ShowroomScreen {
  name: string;
  title: string;
  route: string;
  role: string | null;
  shot: string;
  width: number;
  height: number;
  bricks: string[];
  figures: FigureRef[];
}

export interface Showroom {
  site: string;
  commit: string;
  capturedAt: string;
  screens: ShowroomScreen[];
  trails: Record<string, Trail>;
  /** Figures shown and figures traced, counted per appearance: the honest rate. */
  counts: { shown: number; traced: number };
}

export const captureDir = (siteId: string, env: NodeJS.ProcessEnv = process.env) =>
  path.join(workDir(env), siteId);

export function readCapture(siteId: string, env: NodeJS.ProcessEnv = process.env): Capture | null {
  const file = path.join(captureDir(siteId, env), 'capture.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Capture) : null;
}

/** A figure is traced only when it has a mapping (a trail can be built); everything else is untraced. */
export function showroomOf(capture: Capture, bp: Blueprint): Showroom {
  const trails: Record<string, Trail> = {};
  const screen = (s: CapturedScreen): ShowroomScreen => ({
    name: s.name,
    title: s.title,
    route: s.route,
    role: s.role,
    shot: s.shot,
    width: s.width,
    height: s.height,
    bricks: s.bricks,
    figures: s.figures.map((f) => {
      const mapping = f.origin === 'detected' ? undefined : capture.mappings[f.id];
      if (mapping && !trails[f.id]) {
        trails[f.id] = buildTrail(bp, {
          figureId: f.id,
          mapping,
          code: mapping.code,
          shown: f.value ?? f.text,
          run: capture.runs[f.id] ?? null,
        });
      }
      return { id: f.id, box: f.box, traced: Boolean(mapping), text: f.text };
    }),
  });
  const screens = capture.screens.map(screen);
  const all = screens.flatMap((s) => s.figures);
  return {
    site: capture.site,
    commit: capture.commit,
    capturedAt: capture.capturedAt,
    screens,
    trails,
    counts: { shown: all.length, traced: all.filter((f) => f.traced).length },
  };
}
