import { describe, expect, it } from 'vitest';
import { brickFigures } from '@rama/blueprint/metrics';
import { edge, fixtureBlueprint, node } from '../../test/blueprint';
import { edgePhrase, reviewerParagraph } from './words';

const para = (bp: ReturnType<typeof fixtureBlueprint>, path: string) =>
  reviewerParagraph(bp, path, brickFigures(bp)[path]!);

describe('reviewer paragraph', () => {
  it('with 0 dependants: nothing relies on it', () => {
    const bp = fixtureBlueprint();
    expect(para(bp, 'app/page.tsx')).toBe(
      'It needs 2 other bricks: 2 on the logic floor (calc, fmt). Nothing else relies on it, so it can change without side effects elsewhere.',
    );
  });

  it('with 1 dependant: felt there', () => {
    const bp = fixtureBlueprint();
    expect(para(bp, 'lib/fmt.ts')).toBe(
      'It needs 1 other brick: 1 on the data floor (data). 1 brick relies on it, so a change here is felt there.',
    );
  });

  it('with 4 dependants and no test: the warning', () => {
    const bp = fixtureBlueprint();
    for (const p of ['a', 'b', 'c']) {
      bp.nodes.push(node(`app/${p}.tsx`, 'shell'));
      bp.edges.push(edge(`app/${p}.tsx`, 'lib/fmt.ts', ['money']));
    }
    expect(para(bp, 'lib/fmt.ts')).toBe(
      'It needs 1 other brick: 1 on the data floor (data). 4 bricks rely on it, so a change here is felt in all of them. With this many dependants and no test behind it, this is one of the bricks a reviewer should ask to see verified first.',
    );
  });

  it('with 4 dependants and a test behind it: no warning', () => {
    const bp = fixtureBlueprint();
    for (const p of ['a', 'b']) {
      bp.nodes.push(node(`app/${p}.tsx`, 'shell'));
      bp.edges.push(edge(`app/${p}.tsx`, 'lib/calc.ts', ['total']));
    }
    expect(para(bp, 'lib/calc.ts')).toBe(
      'It needs 1 other brick: 1 on the data floor (data). 4 bricks rely on it, so a change here is felt in all of them.',
    );
  });

  it('needing nothing', () => {
    expect(para(fixtureBlueprint(), 'lib/data.ts')).toMatch(
      /^It needs nothing else in the repository to do its job\. 2 bricks rely on it/,
    );
  });
});

describe('edge phrase', () => {
  it('shows the English and whether a named person confirmed it', () => {
    const [toCalc, toFmt, , toData] = fixtureBlueprint().edges;
    expect(edgePhrase(toData!)).toEqual({
      text: 'the rows; the shape of a row',
      state: 'confirmed',
    });
    expect(edgePhrase(toCalc!)).toEqual({ text: 'the row count', state: 'unconfirmed' });
    expect(edgePhrase(toFmt!)).toEqual({ text: 'no English yet for money', state: 'none' });
  });

  it('says so for side-effect imports, defaults, namespaces and types, never inventing a phrase', () => {
    expect(edgePhrase(edge('a', 'b.css', []))).toEqual({
      text: 'loaded for its side effects; no names are imported',
      state: 'none',
    });
    expect(edgePhrase(edge('a', 'b', ['default', '*'])).text).toBe(
      'no English yet for its default export, everything it exports',
    );
    expect(edgePhrase(edge('a', 'b', ['Row'], { typeOnly: true })).text).toBe(
      'no English yet for Row (types only)',
    );
  });
});
