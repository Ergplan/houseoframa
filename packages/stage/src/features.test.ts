import { describe, expect, it } from 'vitest';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import {
  buildingOf,
  draftFeatures,
  nameFeature,
  parseFeatures,
  resolveFeatures,
} from './features.ts';

describe('resolveFeatures', () => {
  it('gives each feature its screens and the files only it uses; shared and unused code stand apart', () => {
    const bp = stallBlueprint();
    const f = resolveFeatures(bp, parseFeatures(stallFeatures));
    expect(f.list.map((b) => [b.id, b.kind, b.bricks])).toEqual([
      ['see-orders', 'feature', ['app/page.tsx', 'db/orders.ts']],
      ['take-an-order', 'feature', ['app/new/page.tsx', 'db/save.ts', 'lib/ask.ts']],
      ['count-takings', 'feature', ['app/total/page.tsx']],
      ['shared', 'shared', ['db/schema.ts', 'lib/money.ts']],
      ['behind', 'behind', ['scripts/seed.ts']],
    ]);
    // Each file stands in one building only.
    const all = f.list.flatMap((b) => b.bricks);
    expect(new Set(all).size).toBe(all.length);
    // Tests and documents are not drawn on the Street.
    expect(f.notDrawn).toEqual(['README.md', 'lib/money.test.ts']);
    expect(f.list[2]).toMatchObject({
      screens: ['/total'],
      confirmed: { by: 'Asha', at: '2026-10-02' },
      source: 'file',
    });
    expect(f.list[0]!.confirmed).toBeNull();
    expect(buildingOf(f, 'lib/ask.ts')?.id).toBe('take-an-order');
  });

  it('drafts one unconfirmed building per screen when the product has no features file', () => {
    const bp = stallBlueprint();
    expect(draftFeatures(bp).features.map((x) => [x.id, x.name])).toEqual([
      ['home', 'Home'],
      ['new', 'New'],
      ['total', 'Total'],
    ]);
    const f = resolveFeatures(bp, null);
    expect(
      f.list.filter((b) => b.kind === 'feature').every((b) => b.source === 'draft' && !b.confirmed),
    ).toBe(true);
  });

  it('drafts a building for a screen the file leaves out, and reports a screen the product does not have', () => {
    const bp = stallBlueprint();
    const f = resolveFeatures(
      bp,
      parseFeatures({ features: [{ id: 'see', name: 'See', screens: ['/', '/gone'] }] }),
    );
    expect(f.unknownScreens).toEqual(['/gone']);
    expect(f.list.filter((b) => b.kind === 'feature').map((b) => [b.id, b.source])).toEqual([
      ['see', 'file'],
      ['new', 'draft'],
      ['total', 'draft'],
    ]);
  });

  it('refuses a file with two features of one id, or a reserved id', () => {
    expect(() =>
      parseFeatures({
        features: [
          { id: 'a', name: 'A' },
          { id: 'a', name: 'B' },
        ],
      }),
    ).toThrow(/share an id/);
    expect(() => parseFeatures({ features: [{ id: 'shared', name: 'S' }] })).toThrow(/kept/);
    expect(() => parseFeatures({ features: [{ id: 'Bad Id', name: 'S' }] })).toThrow(/schema/);
  });
});

describe('nameFeature', () => {
  const by = { person: 'Asha', at: '2026-10-25T10:00:00.000Z' };
  it('renames a building the file holds, confirmed by the person', () => {
    const bp = stallBlueprint();
    const f = nameFeature(
      bp,
      parseFeatures(stallFeatures),
      'take-an-order',
      { name: ' Take  an order ', does: 'Writes it down.' },
      by,
    );
    expect(f.features[1]).toMatchObject({
      id: 'take-an-order',
      name: 'Take an order',
      does: 'Writes it down.',
      screens: ['/new'],
      confirmedBy: 'Asha',
      confirmedAt: by.at,
    });
    expect(resolveFeatures(bp, f).list[1]!.confirmed).toEqual({ by: 'Asha', at: by.at });
  });

  it('writes a drafted building into the file with its screens; the rest stay drafted', () => {
    const bp = stallBlueprint();
    const f = nameFeature(bp, null, 'new', { name: 'Take an order', does: null }, by);
    expect(f.features).toEqual([
      {
        id: 'new',
        name: 'Take an order',
        screens: ['/new'],
        bricks: [],
        confirmedBy: 'Asha',
        confirmedAt: by.at,
      },
    ]);
    expect(
      resolveFeatures(bp, f)
        .list.filter((b) => b.kind === 'feature')
        .map((b) => [b.name, b.source]),
    ).toEqual([
      ['Take an order', 'file'],
      ['Home', 'draft'],
      ['Total', 'draft'],
    ]);
  });

  it('refuses an empty or long name, and the buildings House of Rama adds', () => {
    const bp = stallBlueprint();
    expect(() => nameFeature(bp, null, 'new', { name: '  ', does: null }, by)).toThrow(
      'A building needs a name.',
    );
    expect(() => nameFeature(bp, null, 'new', { name: 'x'.repeat(81), does: null }, by)).toThrow(
      /at most 80/,
    );
    expect(() => nameFeature(bp, null, 'shared', { name: 'Money', does: null }, by)).toThrow(
      /no such building/,
    );
  });
});
