import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demolitions, summary, testCoverage } from '@rama/blueprint/metrics';
import { fixtureBlueprint } from '../../test/blueprint';
import { Inspector, type View } from './Inspector';

const bp = fixtureBlueprint();
const noop = () => {};
const render = (view: View, member: string | null = 'Asha Rao') =>
  renderToStaticMarkup(
    <Inspector
      siteId="fixture"
      blueprint={bp}
      view={view}
      member={member}
      onBrick={noop}
      onCommit={noop}
      onReport={noop}
      onConfirmed={noop}
    />,
  );

describe('Inspector: Trust report', () => {
  it('shows the figures from packages/blueprint/metrics', () => {
    const html = render({ kind: 'report' });
    const cover = testCoverage(bp);
    expect(html).toContain(`${cover.tested} of ${cover.of} code bricks have a test behind them.`);
    const s = summary(bp);
    expect(html).toContain(`<b>${s.files}</b><small>files · bricks</small>`);
    expect(html).toContain(`<b>${s.importEdges}</b><small>import links · cables</small>`);
    expect(html).toContain('lib/data.ts</button> (367 lines)');
    expect(html).toContain(
      `Walls knocked out</dt><dd>${demolitions(bp).length} (changes deleting 20`,
    );
  });
});

describe('Inspector: Commit', () => {
  it('lists new, renovated and knocked-out bricks of one lift', () => {
    const html = render({ kind: 'commit', index: 1 });
    expect(html).toContain('Lift 2 of 3 · c2bbbbb');
    expect(html).toContain('2 new bricks');
    expect(html).toContain('1 wall knocked out');
    expect(html).toContain('+52 / −26');
    expect(html).toContain('Tests added</dt><dd><span class="pill green">1</span>');
  });
});

describe('Inspector: Brick', () => {
  it('shows purpose, reviewer paragraph, and each dependency in English with its state', () => {
    const html = render({ kind: 'brick', path: 'lib/calc.ts' });
    expect(html).toContain('Brick · logic floor');
    expect(html).toContain('No purpose recorded for this brick yet.');
    expect(html).toContain('For the reviewer.</b> It needs 1 other brick');
    expect(html).toContain('Depends on (1)');
    expect(html).toContain(
      'the rows; the shape of a row<span class="pill green state">confirmed</span>',
    );
    expect(html).toContain('Used by (2)');
    expect(html).toContain(
      'takes the row count<span class="pill amber state">unconfirmed draft</span>',
    );
    expect(html).toContain('no English yet for total<span class="pill dim state">unknown</span>');
    expect(html).toContain('<span class="pill cyan">RATE</span>');
    expect(html).toContain('a test imports it');
  });

  it('offers Confirm only on unconfirmed drafts, and only with a local member', () => {
    const withMember = render({ kind: 'brick', path: 'lib/calc.ts' });
    expect(withMember.match(/>Confirm</g)).toHaveLength(1);
    expect(withMember).toContain('aria-label="Confirm the phrase for app/page.tsx → lib/calc.ts"');
    const without = render({ kind: 'brick', path: 'lib/calc.ts' }, null);
    expect(without).not.toContain('>Confirm<');
    expect(without).toContain('Confirming needs a local member: set RAMA_MEMBER_NAME.');
  });

  it('shows a confirmed purpose with who and when, and binaries and tests honestly', () => {
    const data = render({ kind: 'brick', path: 'lib/data.ts' });
    expect(data).toContain(
      'The rows the app counts. <span class="pill green state">confirmed</span>',
    );
    expect(data).toContain('by Asha, 2026-01-05');
    expect(render({ kind: 'brick', path: 'public/logo.png' })).toContain('binary file');
    expect(render({ kind: 'brick', path: 'lib/calc.test.ts' })).toContain('is a test');
  });

  it('shows On screen thumbnails for the captured screens the brick renders, and none when it renders none', () => {
    const captured = [
      { name: 'home', title: 'Home', shot: 'home.png', bricks: ['lib/calc.ts', 'lib/data.ts'] },
      { name: 'bills', title: 'Bills', shot: 'bills.png', bricks: ['lib/data.ts'] },
    ];
    const html = renderToStaticMarkup(
      <Inspector
        siteId="fixture"
        blueprint={bp}
        view={{ kind: 'brick', path: 'lib/data.ts' }}
        member={null}
        captured={captured}
        onBrick={noop}
        onCommit={noop}
        onReport={noop}
        onConfirmed={noop}
      />,
    );
    expect(html).toContain('On screen (2)');
    expect(html).toContain('href="/site/fixture/showroom?screen=home"');
    expect(html).toContain('src="/api/site/fixture/shots/bills.png"');
    const none = renderToStaticMarkup(
      <Inspector
        siteId="fixture"
        blueprint={bp}
        view={{ kind: 'brick', path: 'app/page.tsx' }}
        member={null}
        captured={captured}
        onBrick={noop}
        onCommit={noop}
        onReport={noop}
        onConfirmed={noop}
      />,
    );
    expect(none).not.toContain('On screen');
  });
});
