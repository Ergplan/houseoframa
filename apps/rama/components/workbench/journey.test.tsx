// The journey of a build (Stage 11): five tabs and Care; on each tab only its own actions, exactly one
// lit (the next thing to do in that act), the rest quiet with their reasons; the glossary holds on the
// tab names and the lit actions' labels.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { bannedIn, visibleText } from '../../test/banned';
import { ACTS } from '../../app/api/site/[siteId]/act/handler';
import { journeyTab, TABS, tabHref, tabOf, type Tab } from './journey';
import { JourneyBar, type ConsoleProps } from './TrainerConsole';

const screen = (id: string, confirmed: boolean) => ({
  id,
  route: id,
  name: id,
  audience: 'customer' as const,
  state: { state: confirmed ? 'Confirmed' : 'Verified', confirmed, verified: true } as never,
});

/** A product mid-journey: built and photographed, one session held, one screen unsigned, no audit. */
const props = (over: Partial<ConsoleProps> = {}): ConsoleProps => ({
  siteId: 'chai',
  name: 'Chai Stall',
  kind: 'product',
  remote: null,
  states: {
    screens: [screen('/', true), screen('/new', false)],
    tally: { Verified: 1, Confirmed: 1, Unverified: 0 },
    counts: [],
    unsaid: 0,
    figures: { traced: 8, shown: 8 },
  },
  cards: [{ id: 'd0', title: 'Orders', status: 'decided' } as never],
  keys: null,
  jobs: [],
  captured: true,
  audited: false,
  sessions: 1,
  ...over,
});

const primaries = (html: string) => (html.match(/eg-btn--primary/g) ?? []).length;
const bar = (p: ConsoleProps, tab: Tab) => renderToStaticMarkup(<JourneyBar p={p} tab={tab} />);

describe('the journey of a build', () => {
  it('has the five acts in order, then Care, each with its own place', () => {
    expect(TABS.map((t) => t.label)).toEqual([
      'Idea',
      'Build',
      'Walk through',
      'Audit',
      'Hand over',
      'Care',
    ]);
    expect(TABS.map((t) => tabHref('chai', t.id))).toEqual([
      '/site/chai/discovery',
      '/site/chai',
      '/site/chai/walkthrough',
      '/site/chai/audit',
      '/site/chai/handover',
      '/site/chai/care',
    ]);
    expect(
      ['Site office', undefined, 'Showroom', 'Walkthrough', 'Audit', 'Handover', 'Care'].map(tabOf),
    ).toEqual(['idea', 'build', 'build', 'walk', 'audit', 'handover', 'care']);
  });

  it('lights exactly one action on each act’s tab: the next thing to do in it', () => {
    const p = props();
    expect(TABS.map((t) => [t.id, journeyTab(p, t.id).lit])).toEqual([
      ['idea', 'close-ideation'],
      ['build', 'start-build'],
      ['walk', 'sign'],
      ['audit', 'call-audit'],
      ['handover', 'hand-over'],
      ['care', null],
    ]);
    // In the bar, one green folder on the tabs whose action is the bar's; Sign and Hand over are the page's.
    for (const tab of ['idea', 'build', 'audit'] as const)
      expect(primaries(bar(p, tab)), tab).toBe(1);
    for (const tab of ['walk', 'handover', 'care'] as const)
      expect(primaries(bar(p, tab)), tab).toBe(0);
    // Before any session, Start session is the one lit on Idea; while building, Pause build on Build.
    // A product's idea room is always open, so Start session is never lit for it; an outside site's is.
    expect(journeyTab(props({ sessions: 0 }), 'idea').lit).toBe('close-ideation');
    expect(journeyTab(props({ sessions: 0, kind: 'outside' }), 'idea').lit).toBe('start-session');
    expect(journeyTab(props({ sessions: 0 }), 'idea').actions[0]!.why).toBe(
      'The idea room below is open: write or talk there.',
    );
    const running = props({
      jobs: [
        { kind: 'build', status: 'running', job: { id: 'j', kind: 'build', steps: [] } as never },
      ],
    });
    expect(journeyTab(running, 'build').lit).toBe('pause-build');
    expect(primaries(bar(running, 'build'))).toBe(1);
    // A new product, no card agreed yet: Start build stays quiet and says to agree the cards first.
    const fresh = journeyTab(props({ cards: [], sessions: 0, captured: false }), 'build');
    expect(fresh.lit).toBeNull();
    expect(fresh.actions[0]).toEqual({
      act: 'start-build',
      why: 'No decision card has a yes yet: agree the cards under Idea first.',
    });
    expect(primaries(bar(props({ cards: [] }), 'build'))).toBe(0);
    // Care lights Photograph only while the screens are not photographed.
    expect(journeyTab(props({ captured: false }), 'care').lit).toBe('photograph');
  });

  it('shows each action only in its own act, and says why when it cannot be done', () => {
    const p = props({ cards: [{ id: 'd1', title: 'Money', status: 'open' } as never] });
    const actsOf = (tab: Tab) => journeyTab(p, tab).actions.map((a) => a.act);
    expect(TABS.map((t) => [t.id, actsOf(t.id)])).toEqual([
      ['idea', ['start-session', 'close-ideation']],
      ['build', ['start-build', 'pause-build']],
      ['walk', ['sign']],
      ['audit', ['call-audit']],
      ['handover', ['hand-over']],
      ['care', ['photograph', 'refresh', 'tests']],
    ]);
    const all = TABS.flatMap((t) => actsOf(t.id));
    expect(new Set(all).size).toBe(all.length);
    const idea = bar(p, 'idea');
    expect(idea).toContain('One card is still open.');
    expect(idea).not.toContain('Start build');
    expect(bar(p, 'build')).toContain('No build is running.');
  });

  it('uses no developer word on the tabs or the lit actions', () => {
    const labels = [
      ...TABS.map((t) => t.label),
      ...TABS.flatMap((t) => {
        const lit = journeyTab(props(), t.id).lit;
        return lit && lit !== 'sign' ? [ACTS[lit].label] : [];
      }),
    ];
    expect(bannedIn(labels.join(' '))).toEqual([]);
    for (const t of TABS) expect(bannedIn(visibleText(bar(props(), t.id))), t.id).toEqual([]);
  });
});
