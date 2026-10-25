// The trainer console's buttons (Stage 7), as one form route: each act either starts a job on the site
// (refresh, photograph, tests, audit, the build), starts a discovery session, or takes the person to the
// page where the act happens. Acts a later stage enables are refused with the sentence the console shows.
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import { back } from '../../../../../server/http';

export const ACTS = {
  'start-session': { label: 'Start session', enabledBy: null },
  'close-ideation': { label: 'Close ideation', enabledBy: 'Stage 10 (the voice and the board)' },
  'start-build': { label: 'Start build', enabledBy: null },
  'pause-build': { label: 'Pause build', enabledBy: null },
  'start-walkthrough': { label: 'Start walkthrough', enabledBy: null },
  'call-audit': { label: 'Call the audit', enabledBy: null },
  'hand-over': { label: 'Hand over', enabledBy: null },
  refresh: { label: 'Refresh the picture', enabledBy: null },
  photograph: { label: 'Photograph the screens', enabledBy: null },
  tests: { label: 'Run the tests', enabledBy: null },
} as const;
export type Act = keyof typeof ACTS;

export interface ActDeps {
  /** Starts the job of that kind on the site as the person; returns at once. */
  startJob: (
    kind: 'refresh' | 'photograph' | 'tests' | 'audit',
    site: SiteLocation,
    who: Member,
  ) => void;
  startSession: (site: SiteLocation, title: string, who: Member) => Promise<void>;
  /** Starts the build loop on a product (Stage 9). */
  startBuild: (site: SiteLocation, who: Member) => void;
  /** Asks the running build to stop after the lift in hand. */
  pauseBuild: (site: SiteLocation) => void;
  baseUrl: string;
  now: () => Date;
}

export async function handleAct(
  site: SiteLocation,
  who: Member,
  form: FormData | null,
  deps: ActDeps,
): Promise<Response> {
  const act = String(form?.get('act') ?? '') as Act;
  const page = `/site/${site.id}`;
  if (!(act in ACTS))
    return back(deps.baseUrl, page, { ok: false, sentence: 'There is no such button.' });
  const def = ACTS[act];
  if (def.enabledBy)
    return back(deps.baseUrl, page, {
      ok: false,
      sentence: `${def.label} comes with ${def.enabledBy}.`,
    });
  switch (act) {
    case 'start-walkthrough':
      return back(deps.baseUrl, `${page}/walkthrough`);
    case 'hand-over':
      return back(deps.baseUrl, `${page}/handover`);
    case 'start-build':
      if (site.kind !== 'product')
        return back(deps.baseUrl, page, {
          ok: false,
          sentence: 'Only a product made here is built here; this site is only drawn.',
        });
      deps.startBuild(site, who);
      return back(deps.baseUrl, page, {
        ok: true,
        sentence: 'Start build: the builder is at work. Each lift shows here as it is checked.',
      });
    case 'pause-build':
      deps.pauseBuild(site);
      return back(deps.baseUrl, page, {
        ok: true,
        sentence: 'Pause build: the build stops after the lift in hand.',
      });
    case 'start-session': {
      await deps.startSession(site, `Session of ${deps.now().toISOString().slice(0, 10)}`, who);
      return back(deps.baseUrl, `${page}/discovery`);
    }
    default: {
      const kind = act === 'call-audit' ? 'audit' : (act as 'refresh' | 'photograph' | 'tests');
      deps.startJob(kind, site, who);
      return back(deps.baseUrl, page, {
        ok: true,
        sentence: `${def.label}: started. This page shows its progress.`,
      });
    }
  }
}
