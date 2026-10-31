// The walkthrough script of a site: screen by screen, the person to ask, the statement to confirm and
// the trails to show. Plain code (Invariant 6): the statement is built from the decision cards about the
// screen and the traced figures on it, never drafted by a model. Each confirmation becomes a signature
// on the screen (the Blueprint route) at the commit the screens were captured from.
import type { Decision, Signoff } from '@rama/shared';
import type { Showroom } from '@rama/trace/showroom';
import { appearanceKeys } from '@rama/trace/keys';
import { signaturesInForce } from './records.ts';

export interface WalkthroughStep {
  /** The Blueprint screen (route) a confirmation signs. */
  screenId: string;
  /** The captured views of it, first one shown first. */
  views: { name: string; title: string; shot: string; route: string }[];
  person: string;
  statement: string;
  decisions: Decision[];
  figures: { key: string; title: string; shown: string | null; matches: boolean | null }[];
  /** The signature in force at the captured commit; null when the screen is not signed there. */
  signature: Signoff | null;
  /** A signature in force at another commit: the screen needs signing again for this one. */
  staleSignature: Signoff | null;
}

export function walkthrough(
  showroom: Showroom,
  decisions: Decision[],
  signoffs: Signoff[],
  person: string,
): WalkthroughStep[] {
  const inForce = signaturesInForce(signoffs);
  const byScreen = new Map<string, Showroom['screens']>();
  for (const s of showroom.screens) {
    if (!s.blueprintScreen) continue;
    byScreen.set(s.blueprintScreen, [...(byScreen.get(s.blueprintScreen) ?? []), s]);
  }
  const superseded = new Set(decisions.map((d) => d.supersedes).filter(Boolean));
  const steps: WalkthroughStep[] = [...byScreen].map(([screenId, views]) => {
    const figures = views.flatMap((v) => {
      const keys = appearanceKeys(v.name, v.figures);
      return v.figures
        .map((f, i) => ({ f, key: keys[i]! }))
        .filter(({ f }) => f.traced)
        .map(({ f, key }) => {
          const t = showroom.trails[key]!;
          return {
            key,
            title: t.title,
            // What the person reads on the screen ("₹3,003.00"), not the value behind it (300300): a
            // signature confirms what was seen.
            shown: f.text || t.result?.shown || null,
            matches: t.result?.matches ?? null,
          };
        });
    });
    const cards = decisions.filter(
      (d) => d.screenId === screenId && !superseded.has(d.id) && d.status === 'decided',
    );
    const parts = [
      ...figures.map((f) => `“${f.title}” shows ${f.shown ?? 'a value that could not be read'}.`),
      ...cards.map((d) => d.statement),
    ];
    const titles = [...new Set(views.map((v) => v.title))].join(', ');
    const statement =
      `On ${screenId} (${titles}): ` +
      (parts.length ? parts.join(' ') + ' ' : '') +
      'I have looked at this screen and it shows what I expect.';
    const sig = inForce.get(`screen:${screenId}`) ?? null;
    return {
      screenId,
      views: views.map((v) => ({ name: v.name, title: v.title, shot: v.shot, route: v.route })),
      person,
      statement,
      decisions: cards,
      figures,
      signature: sig && sig.target.commit === showroom.commit ? sig : null,
      staleSignature: sig && sig.target.commit !== showroom.commit ? sig : null,
    };
  });
  // Screens with traced figures first (they carry the most to confirm), then in capture order.
  return steps.sort((a, b) => Number(b.figures.length > 0) - Number(a.figures.length > 0));
}
