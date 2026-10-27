// A site's lakefront as the app shows it: its buildings (from the product's .rama/features.json, or
// drafted from its screens), the Street laid out by packages/stage, each building's flag from its
// screens' states (metrics buildingState over siteStates, so every surface agrees), and the facades from
// the last capture. Read from what is on record; nothing is invented.
import type { Blueprint, Signoff, Trail } from '@rama/shared';
import { buildingState, type BuildingState } from '@rama/blueprint/metrics';
import type { SiteLocation } from '@rama/blueprint/site';
import { resolveFeatures, street, type FacadeInput, type Features, type Street } from '@rama/stage';
import { readFeatures } from '@rama/stage/read';
import { appearanceKeys, flowOf, readCapture, showroomOf, type Flow } from '@rama/trace';
import { siteStates, type SiteStates } from './states.ts';

export interface SiteLakefront {
  features: Features;
  street: Street;
  /** Each building's flag, by building id. */
  flags: Record<string, BuildingState>;
  /** Each building's facades, by building id: one per screen, photographed or not. */
  facades: Record<string, FacadeInput[]>;
  /** Why the features file was not used, when it is there but does not parse. */
  problem: string | null;
  /** True when every building name came from the product's features file. */
  named: boolean;
  states: SiteStates;
}

/** The address the app serves a screenshot from. */
export const shotUrl = (siteId: string, shot: string) =>
  `/api/site/${encodeURIComponent(siteId)}/shots/${encodeURIComponent(shot)}`;

export function siteLakefront(
  site: SiteLocation,
  bp: Blueprint,
  env: NodeJS.ProcessEnv = process.env,
  states: SiteStates = siteStates(site, bp, env),
): SiteLakefront {
  const { file, problem } = readFeatures(site.repoDir);
  const features = resolveFeatures(bp, file);
  const capture = readCapture(site.id, env);
  // Only a capture of this commit stands on the facades: an older picture may show a screen since changed.
  const fresh = capture && capture.commit === bp.commit ? capture : null;
  const byScreen = new Map<string, FacadeInput>();
  for (const cs of fresh?.screens ?? []) {
    if (!cs.blueprintScreen || byScreen.has(cs.blueprintScreen)) continue;
    const keys = appearanceKeys(cs.name, cs.figures);
    byScreen.set(cs.blueprintScreen, {
      screen: cs.blueprintScreen,
      title: cs.title,
      shot: shotUrl(site.id, cs.shot),
      width: cs.width,
      height: cs.height,
      figures: cs.figures.map((f, i) => ({
        key: keys[i]!,
        id: f.id,
        // As the Showroom counts it: a figure only detected by its look is never traced.
        traced: f.origin !== 'detected' && Boolean(fresh!.mappings[f.id]),
        text: f.text,
        box: f.box,
      })),
    });
  }
  const shots = Object.fromEntries([...byScreen].map(([id, f]) => [id, f.shot!]));
  const s = street(bp, features, { shots });
  const stateOf = new Map(states.screens.map((x) => [x.id, x.state]));
  const flags: Record<string, BuildingState> = {};
  const facades: Record<string, FacadeInput[]> = {};
  for (const b of s.buildings) {
    flags[b.id] = buildingState(
      b.screens.flatMap((id) => (stateOf.has(id) ? [stateOf.get(id)!] : [])),
    );
    facades[b.id] = b.screens.map(
      (id) =>
        byScreen.get(id) ?? {
          screen: id,
          title: bp.screens.find((x) => x.id === id)?.name ?? id,
          shot: null,
          width: 0,
          height: 0,
          figures: [],
        },
    );
  }
  return {
    features,
    street: s,
    flags,
    facades,
    problem,
    named: features.list.filter((f) => f.kind === 'feature').every((f) => f.source === 'file'),
    states,
  };
}

/** A figure's trail as the Building level tells it: no code and no file names; those are one level in. */
export interface PlainTrail {
  title: string;
  what: string;
  /** How it is worked out, in English. */
  english: string;
  inputs: { label: string; value: string | null }[];
  /** Where its inputs are kept. */
  kept: string[];
  /** Each lift that built it: its number on the Street's timeline, who, when, and the builder's words. */
  built: { lift: number | null; by: string; at: string; what: string }[];
  signed: { person: string; at: string } | null;
  /** Worked out again from the product's own code: what the screen showed, what came out, and whether they agree. */
  again: { shown: string | null; computed: string | null; matches: boolean | null } | null;
  /** The file that holds the formula: where "show me the code" opens. */
  file: string;
}

export function plainTrail(t: Trail, bp: Blueprint): PlainTrail {
  const lift = new Map(bp.commits.map((c, i) => [c.sha, i + 1]));
  return {
    title: t.title,
    what: t.what,
    english: t.formula.english,
    inputs: t.inputs.map((x) => ({ label: x.label, value: x.value })),
    kept: t.data,
    built: [...new Map(t.build.map((b) => [b.sha, b])).values()].map((b) => ({
      lift: lift.get(b.sha) ?? null,
      by: b.author,
      at: b.at,
      what: b.subject,
    })),
    signed: t.signoff ? { person: t.signoff.person, at: t.signoff.at } : null,
    again: t.reexecuted && t.result ? t.result : null,
    file: t.formula.file,
  };
}

/** The trails of one building's figures, by appearance key, from the capture of the commit shown. */
export function buildingTrails(
  site: SiteLocation,
  bp: Blueprint,
  keys: string[],
  signatures: Map<string, Signoff>,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, PlainTrail> {
  const capture = readCapture(site.id, env);
  if (!capture || capture.commit !== bp.commit) return {};
  const room = showroomOf(capture, bp, signatures);
  return Object.fromEntries(
    keys.filter((k) => room.trails[k]).map((k) => [k, plainTrail(room.trails[k]!, bp)]),
  );
}

/**
 * The flow of each of a building's figures (Stage 11), by appearance key: the trail as the steps the
 * real data takes, from the re-execution of the commit shown. A capture of another commit gives none:
 * its values would not be this commit's.
 */
export function buildingFlows(
  site: SiteLocation,
  bp: Blueprint,
  keys: string[],
  env: NodeJS.ProcessEnv = process.env,
): Record<string, Flow> {
  const capture = readCapture(site.id, env);
  if (!capture || capture.commit !== bp.commit) return {};
  return Object.fromEntries(
    keys.flatMap((k) => {
      const f = flowOf(capture, k);
      return f ? [[k, f]] : [];
    }),
  );
}
