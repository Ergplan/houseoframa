import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscoveryView } from './DiscoveryView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const session = (reconstructed: boolean) => ({
  id: 's1',
  title: 'Kick-off',
  reconstructed,
  source: reconstructed ? 'a log' : null,
  createdAt: '2026-10-22T04:30:00.000Z',
  turns: [
    {
      id: 't0',
      seq: 1,
      speaker: 'agenda',
      text: 'The problem',
      draft: false,
      at: '2026-09-28T04:30:00.000Z',
    },
    {
      id: 't1',
      seq: 2,
      speaker: 'Asha Rao',
      text: 'We bill from a phone.',
      draft: false,
      at: '2026-09-28T04:31:00.000Z',
    },
    {
      id: 't2',
      seq: 3,
      speaker: 'Rama',
      text: 'Who signs a bill?',
      draft: true,
      at: '2026-09-28T04:32:00.000Z',
    },
  ],
});
const card = {
  id: 'd1',
  siteId: 'shop',
  sessionId: 's1',
  title: 'Phone first',
  statement: 'Designed at 390 px.',
  bricks: ['app/page.tsx'],
  screenId: '/',
  status: 'decided' as const,
  by: 'Asha Rao',
  at: '2026-10-22T04:33:00.000Z',
};
const render = (over: Partial<Parameters<typeof DiscoveryView>[0]> = {}) =>
  renderToStaticMarkup(
    <DiscoveryView
      siteId="shop"
      name="Shop"
      member="Asha Rao"
      sessions={[session(false)]}
      decisions={[card]}
      bricks={['app/page.tsx']}
      screens={['/']}
      {...over}
    />,
  );

describe('<DiscoveryView>', () => {
  it("shows turns, marks Rama's question as a draft, times in UTC, and cards with their bricks", () => {
    const html = render();
    expect(html).toContain('live record');
    expect(html).toMatch(/class="msg agent draft"/);
    expect(html).toContain('drafted by Rama, not asked until a person asks it');
    expect(html).toMatch(/2026-09-28 (<!-- -->)?04:30(<!-- -->)? UTC/);
    expect(html).toContain('data-decision="d1"');
    expect(html).toContain('href="/site/shop?brick=app%2Fpage.tsx"');
    expect(html).toContain('Record as Asha Rao');
  });

  it('flags a reconstructed session, and offers to start a live one', () => {
    const html = render({ sessions: [session(true)] });
    expect(html).toMatch(/reconstructed<\/span>/);
    expect(html).toContain('Imported from a log.');
    expect(html).toContain('Start a session');
  });

  it('records nothing without a member, and says when there is nothing recorded', () => {
    const html = render({ member: null, sessions: [], decisions: [] });
    expect(html).toContain('Sign in to record a session.');
    expect(html).not.toContain('<form');
    expect(html).toContain('No session has been held or imported');
  });
});
