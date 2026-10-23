import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demolitions, summary, testCoverage } from '@rama/blueprint/metrics';
import { fixtureBlueprint } from '../../test/blueprint';
import type { AuditView } from '@rama/audit/view';
import { Inspector, type AuditRunView, type View } from './Inspector';

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

  it('offers Confirm only on unconfirmed drafts, and only to a signed-in member', () => {
    const withMember = render({ kind: 'brick', path: 'lib/calc.ts' });
    expect(withMember.match(/>Confirm</g)).toHaveLength(1);
    expect(withMember).toContain('aria-label="Confirm the phrase for app/page.tsx → lib/calc.ts"');
    const without = render({ kind: 'brick', path: 'lib/calc.ts' }, null);
    expect(without).not.toContain('>Confirm<');
    expect(without).toContain('Confirming needs a signed-in member.');
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

describe('Inspector: the audit', () => {
  const audit: AuditView = {
    report: {
      reportId: 'r1234567-0000',
      vendor: 'openai',
      model: 'gpt-x',
      at: '2026-10-23T18:00:00.000Z',
      inputsHash: 'a'.repeat(64),
      callId: 'c1',
    },
    commit: 'abc1234def',
    confirmations: [],
    counts: { defects: 1, notes: 1, passes: 3, bricks: 5 },
    runs: [
      {
        check: 'typecheck',
        ran: true,
        detail: 'npm run typecheck',
        outcome: 'exit 0, 0 compiler errors',
      },
      { check: 'build', ran: false, detail: 'no `build` script' },
    ],
    narration: [{ part: 'verdict', text: 'One defect.' }],
    alterations: [
      {
        title: 'Generalise the spread',
        agentTime: '15 min',
        humanTime: 'review 15 min',
        kind: 'defect',
        findings: ['F1'],
      },
    ],
    timeMachine: [{ commit: 'abc1234', what: 'Laid with no test.', shouldHave: 'A test then.' }],
    signoffs: [
      {
        screen: '/',
        person: 'Asha Rao',
        commit: 'abc1234def',
        confirmed: false,
        defects: ['lib/data.ts'],
      },
    ],
    builders: ['Asha Rao'],
    verdicts: { 'lib/data.ts': 'defect', 'lib/calc.ts': 'note', 'app/page.tsx': 'pass' },
    findings: [
      {
        brick: 'lib/data.ts',
        check: 'positional-assumption',
        verdict: 'defect',
        checkVerdict: 'defect',
        text: 'Takes item 2 of a sorted list.',
        file: 'lib/data.ts',
        line: 7,
        auditorNote: null,
      },
      {
        brick: 'lib/calc.ts',
        check: 'any-type',
        verdict: 'note',
        checkVerdict: 'defect',
        text: 'Typed as any.',
        file: 'lib/calc.ts',
        line: 3,
        auditorNote: 'Only in a test helper.',
      },
    ],
  };
  const run = (mode: 'flying' | 'done', log: AuditRunView['log'] = []): AuditRunView => ({
    mode,
    log,
    speak: false,
    onSpeak: noop,
    onSkip: noop,
    onStop: noop,
    onLight: noop,
  });
  const show = (view: View, r: AuditRunView) =>
    renderToStaticMarkup(
      <Inspector
        siteId="fixture"
        blueprint={bp}
        view={view}
        member="Asha Rao"
        audit={audit}
        auditRun={r}
        onBrick={noop}
        onCommit={noop}
        onReport={noop}
        onConfirmed={noop}
      />,
    );

  it('shows the live log while the drones fly: phases, narration and findings', () => {
    const html = show(
      { kind: 'audit' },
      run('flying', [
        { kind: 'phase', text: 'Logic floor' },
        { kind: 'finding', path: 'lib/data.ts', verdict: 'defect', text: 'Takes item 2.' },
        { kind: 'say', text: 'One defect.' },
      ]),
    );
    expect(html).toContain('Drones are flying the site.');
    expect(html).toContain('<div class="aph">Logic floor</div>');
    expect(html).toContain('class="afind defect"');
    expect(html).toContain('Read the narration aloud');
  });

  it('shows the signed report: counts, checks run and not run, sign-offs rejected by a defect, alterations, time machine', () => {
    const html = show({ kind: 'audit' }, run('done'));
    expect(html).toMatch(
      /1 defect(<!-- -->)?, (<!-- -->)?1(<!-- -->)? note(<!-- -->)?, (<!-- -->)?3(<!-- -->)? clean brick(<!-- -->)?s(<!-- -->)? of (<!-- -->)?5/,
    );
    expect(html).toContain('ran: exit 0, 0 compiler errors');
    expect(html).toContain('not run: no `build` script');
    expect(html).toMatch(/Rejected<\/span> \/, signed by Asha Rao: defects in/);
    expect(html).toContain('Generalise the spread');
    expect(html).toContain('A test then.');
    expect(html).toContain('Signed by openai gpt-x, a different vendor from the builder');
    expect(html).toContain('Light the defects');
    // The auditor's words are drafted text until a named person confirms them (Invariant 6).
    expect(html).toContain('data-draft="unconfirmed"');
    // The fixture building is at another commit than the audit: the panel says so.
    expect(html).toContain('data-moved');
  });

  it("puts the brick's latest verdict in the Brick view, with the auditor's reason for a lowered one", () => {
    const html = show({ kind: 'brick', path: 'lib/calc.ts' }, run('done'));
    expect(html).toContain('data-verdict="note"');
    expect(html).toContain(
      'The checks said defect; the auditor lowered it: Only in a test helper.',
    );
    const note = /Only in a test helper\.([^]*?)<\/small>/.exec(html)![1]!;
    expect(note).toContain('data-draft="unconfirmed"');
    expect(show({ kind: 'brick', path: 'app/page.tsx' }, run('done'))).toContain(
      'No check that ran found anything here.',
    );
  });
});
