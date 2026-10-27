// The track by voice (Stage 10): each of the six questions answered from the figure's trail and from
// nothing else. A figure with no trail is untraced and is said to be, with its name; a step the trail
// does not hold is untraced too. Plain code: these sentences are builder lines the voice reads.
import type { Trail } from '@rama/shared';
import type { TrackStep } from './grammar.ts';

/** A figure in front of the person: its name and its trail, null when it is untraced. */
export interface FigureOnHand {
  /** The figure's key on its screen (screen and figure id). */
  key: string;
  /** Its name: the trail's title, or for an untraced figure the words the screen shows beside it. */
  name: string;
  /** The screen it is on, in the customer's words. */
  screen: string;
  trail: Trail | null;
}

const listed = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const day = (iso: string) => iso.slice(0, 10);

/** The answer to one track question about one figure, as one line the voice reads. */
export function answerTrack(step: TrackStep, figure: FigureOnHand): string {
  const name = `“${figure.name}”`;
  const t = figure.trail;
  if (!t)
    return `${name} is untraced: House of Rama cannot say where it comes from, how it is worked out, what goes into it, where it is kept, who built it or who signed it.`;
  switch (step) {
    case 'from':
      return `${name}, on the screen “${figure.screen}”, is worked out by the product’s own code in ${t.formula.file}, line ${t.formula.line}${t.reexecuted ? ', and worked out again by House of Rama it came out the same' : ''}${t.result?.matches === false ? ', but worked out again it did not come out the same' : ''}.`;
    case 'how':
      return t.formula.english
        ? `${name} is worked out like this: ${t.formula.english.replace(/\.$/, '')}.`
        : `How ${name} is worked out is untraced: its trail has no words for its formula.`;
    case 'inputs':
      return t.inputs.length
        ? `Into ${name} go ${listed(t.inputs.map((i) => (i.value === null ? `${i.label} (not worked out again)` : `${i.label}, ${i.value}`)))}.`
        : `What goes into ${name} is untraced: its trail lists no inputs.`;
    case 'kept':
      return t.data.length
        ? `${name} is worked out from what is kept in ${listed(t.data)}.`
        : `Where ${name} is kept is untraced: its trail names no table or file.`;
    case 'built': {
      if (!t.build.length) return `Who built ${name} is untraced: no commit touched its code.`;
      const latest = t.build[0]!;
      const changes = new Set(t.build.map((b) => b.sha)).size;
      return `${name} was built in ${changes === 1 ? 'one change' : `${changes} changes`}; the last was “${latest.subject}”, by ${latest.author}, on ${day(latest.at)}.`;
    }
    case 'signed':
      return t.signoff
        ? `The screen “${figure.screen}” was signed by ${t.signoff.person} on ${day(t.signoff.at)}: “${t.signoff.statement}”.`
        : `Nobody has signed the screen “${figure.screen}” yet.`;
  }
}
