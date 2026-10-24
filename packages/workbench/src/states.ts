// A site's screens in the three words (Invariant 11), from what is on record: the capture (each screen's
// figures and audience), the last test run, the tests' sources, and the signatures in force with their
// seals. Every surface that shows a screen's state reads it from here, which reads metrics stateOf.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Blueprint } from '@rama/shared';
import {
  counts,
  stateOf,
  stateTally,
  testReach,
  type Audience,
  type Counts,
  type FigureFn,
  type ScreenState,
  type StateOf,
} from '@rama/blueprint/metrics';
import type { SiteLocation } from '@rama/blueprint/site';
import { appSealer, readSignoffs, signaturesInForce, verifySeal } from '@rama/ceremony';
import { readCapture } from '@rama/trace';
import { readTestRun } from './tests.ts';

export interface ScreenWithState {
  id: string;
  route: string;
  name: string;
  audience: Audience;
  state: StateOf;
}

export interface SiteStates {
  screens: ScreenWithState[];
  tally: Record<ScreenState, number>;
  /** One per audience that has screens. */
  counts: Counts[];
  /** Figures on the captured screens: traced over shown. */
  figures: { traced: number; shown: number } | null;
}

export function siteStates(
  site: SiteLocation,
  bp: Blueprint,
  env: NodeJS.ProcessEnv = process.env,
): SiteStates {
  const capture = readCapture(site.id, env);
  const figures: Record<string, FigureFn[]> = {};
  const audience: Record<string, Audience> = {};
  for (const s of capture?.screens ?? []) {
    if (!s.blueprintScreen) continue;
    audience[s.blueprintScreen] = s.audience;
    const fns = s.figures
      .map((f) => capture!.mappings[f.id])
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((m) => ({ fn: m.fn, file: m.file }));
    figures[s.blueprintScreen] = [
      ...new Map(
        [...(figures[s.blueprintScreen] ?? []), ...fns].map((f) => [`${f.file}#${f.fn}`, f]),
      ).values(),
    ];
  }
  const read = (p: string) => {
    try {
      return readFileSync(path.join(site.repoDir, p), 'utf8');
    } catch {
      return null;
    }
  };
  const publicKey = appSealer(env).publicKey;
  const input = {
    bp,
    run: readTestRun(site.id, env),
    reach: testReach(bp, read),
    figures,
    signatures: signaturesInForce(readSignoffs(site.repoDir)),
    sealed: (s: Parameters<typeof verifySeal>[0]) => verifySeal(s, publicKey),
  };
  const screens = bp.screens.map((s) => ({
    id: s.id,
    route: s.route,
    name: s.name,
    audience: audience[s.id] ?? ('customer' as const),
    state: stateOf(s, input),
  }));
  const all = capture?.screens.flatMap((s) => s.figures) ?? [];
  return {
    screens,
    tally: stateTally(screens.map((s) => s.state)),
    counts: (['customer', 'staff', 'admin'] as const)
      .map((a) => counts(screens, a))
      .filter((c) => c.of > 0),
    figures: capture
      ? { traced: all.filter((f) => capture.mappings[f.id]).length, shown: all.length }
      : null,
  };
}
