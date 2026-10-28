// The site as the journey of a build (Stage 11): five tabs, one per act of a session, left to right,
// and a small Care tab at the end for the work and GitHub actions. Each tab shows only its own actions,
// and exactly one action on the screen is lit (Harmony's active primary): the thing to do next in that
// act. Plain code over the console's props; the bar (JourneyBar) and the pages only display it.
import type { Act } from '../../app/api/site/[siteId]/act/handler';
import type { ConsoleProps } from './TrainerConsole';

export const TABS = [
  { id: 'idea', label: 'Idea' },
  { id: 'build', label: 'Build' },
  { id: 'walk', label: 'Walk through' },
  { id: 'audit', label: 'Audit' },
  { id: 'handover', label: 'Hand over' },
  { id: 'care', label: 'Care' },
] as const;
export type Tab = (typeof TABS)[number]['id'];

/** Where each tab lives. */
export function tabHref(siteId: string, tab: Tab): string {
  const base = `/site/${encodeURIComponent(siteId)}`;
  return {
    idea: `${base}/discovery`,
    build: base,
    walk: `${base}/walkthrough`,
    audit: `${base}/audit`,
    handover: `${base}/handover`,
    care: `${base}/care`,
  }[tab];
}

/** An action of a tab: a console act (a form), or the page's own button (sign, hand over). */
export interface TabAction {
  act: Act | 'sign';
  /** Why it cannot be done now, in one sentence; null when it can. */
  why: string | null;
  /** The page itself holds the button (Walk through's Sign, Hand over's Hand over). */
  inPage?: boolean;
}

export interface JourneyTab {
  tab: Tab;
  actions: TabAction[];
  /** The one lit action, or null when the act has nothing to do now (its sentence says why). */
  lit: Act | 'sign' | null;
}

/** The tab a page of the site belongs to. */
export function tabOf(here: string | undefined): Tab {
  switch (here) {
    case 'Site office':
      return 'idea';
    case 'Walkthrough':
      return 'walk';
    case 'Audit':
      return 'audit';
    case 'Handover':
      return 'handover';
    case 'Care':
      return 'care';
    default:
      return 'build'; // the lakefront and the Showroom
  }
}

/** The actions of one tab and the one lit among them. */
export function journeyTab(p: ConsoleProps, tab: Tab): JourneyTab {
  const product = p.kind === 'product';
  const building = p.jobs.some((j) => j.kind === 'build' && j.status === 'running');
  const open = p.cards.filter((c) => c.status === 'open' || c.status === 'not-built');
  const agreed = p.cards.filter((c) => c.status === 'decided');
  const unsigned = p.states.screens.filter((s) => s.audience === 'customer' && !s.state.confirmed);
  const openai = p.keys?.find((k) => k.name === 'OPENAI_API_KEY');
  const lit = (actions: TabAction[], want: (Act | 'sign')[]): JourneyTab => ({
    tab,
    actions,
    lit: want.find((w) => actions.some((a) => a.act === w && !a.why)) ?? null,
  });
  switch (tab) {
    case 'idea': {
      const actions: TabAction[] = [
        // A product's idea room is always open (Stage 12): people write or talk there, so a session
        // is not started by a button.
        {
          act: 'start-session',
          why: product ? 'The idea room below is open: write or talk there.' : null,
        },
        {
          act: 'close-ideation',
          why: !product
            ? 'Only a product made here has an ideation to close.'
            : open.length
              ? `${open.length === 1 ? 'One card is' : `${open.length} cards are`} still open.`
              : agreed.length
                ? null
                : 'No card is decided yet: agree them in the idea room.',
        },
      ];
      return lit(
        actions,
        product ? ['close-ideation'] : p.sessions === 0 ? ['start-session'] : ['close-ideation'],
      );
    }
    case 'build': {
      const actions: TabAction[] = [
        {
          act: 'start-build',
          why: !product
            ? 'Only a product made here is built here.'
            : building
              ? 'The builder is at work.'
              : agreed.length
                ? null
                : 'No decision card has a yes yet: agree the cards under Idea first.',
        },
        { act: 'pause-build', why: building ? null : 'No build is running.' },
      ];
      return lit(actions, building ? ['pause-build'] : ['start-build']);
    }
    case 'walk': {
      const actions: TabAction[] = [
        {
          act: 'sign',
          inPage: true,
          why: !p.captured
            ? 'Photograph the screens first, under Care.'
            : unsigned.length
              ? null
              : 'Every customer screen is signed.',
        },
      ];
      return lit(actions, ['sign']);
    }
    case 'audit': {
      const actions: TabAction[] = [
        {
          act: 'call-audit',
          why: openai?.set === false ? 'Needs the OpenAI key in Settings.' : null,
        },
      ];
      return lit(actions, ['call-audit']);
    }
    case 'handover':
      return lit([{ act: 'hand-over', why: null, inPage: true }], ['hand-over']);
    case 'care': {
      const actions: TabAction[] = [
        { act: 'photograph', why: null },
        {
          act: 'refresh',
          why:
            p.siteId === 'self' ? 'House of Rama redraws its own picture with every change.' : null,
        },
        { act: 'tests', why: null },
      ];
      return lit(actions, p.captured ? [] : ['photograph']);
    }
  }
}
