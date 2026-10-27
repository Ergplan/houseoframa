// What a person said, read as a command or as plain talk (Stage 10). Plain code, no model: a command is
// recognised only when the whole utterance is one, so "yes, and it should also print a bill" is talk,
// not a yes. Anything that is not a command goes into the session as a turn.

/** The six steps of the track a person can ask about by voice, in the trail's order. */
export const TRACK_STEPS = ['from', 'how', 'inputs', 'kept', 'built', 'signed'] as const;
export type TrackStep = (typeof TRACK_STEPS)[number];

/** The camera's moves a person can say (Stage 11): the same as the ring's buttons. */
export type CameraMove = 'turn-left' | 'turn-right' | 'turn-around' | 'closer' | 'further';

export type Command =
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'scrap' }
  | { kind: 'show'; building: string }
  | { kind: 'open'; screen: string }
  | { kind: 'code' }
  | { kind: 'back' }
  | { kind: 'what-if'; input: string; value: string }
  | { kind: 'board' }
  /** Stage 11: the camera, by voice. */
  | { kind: 'camera'; move: CameraMove }
  /** A track question; figure is null for "this number", the one in front of the person. */
  | { kind: 'track'; step: TrackStep; figure: string | null }
  | { kind: 'talk'; text: string };

/** Lower case, curly quotes made straight, and the punctuation a transcript adds taken off. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words that may come before or after a command without changing it.
const LEAD = /^(?:(?:ok(?:ay)?|right|so|rama|hey rama|please|now|and)\s+)+/;
const TAIL = /(?:\s+(?:please|now|rama|then))+$/;

const YES =
  /^(?:yes|yeah|yep|yup|yes yes|correct|that's right|that is right|agreed|i agree|go ahead|do it|sure)(?: (?:please|build it|yes build it|write it down|that's right|go ahead|do it|let's build it|i agree))?$/;
const NO = /^(?:no|nope|not yet|no thanks|no thank you|not like that|wait|hold on)$/;
const SCRAP = /^scrap (?:everything|it all|all of it)(?: and start (?:again|over))?$/;
const CODE = /^show me the code$/;
const BACK = /^(?:go back|back|take me back)$/;
const BOARD = /^(?:read|look at|take|scan) the board$/;
const CAMERA: [RegExp, CameraMove][] = [
  [/^turn (?:it )?(?:to the )?left$/, 'turn-left'],
  [/^turn (?:it )?(?:to the )?right$/, 'turn-right'],
  [/^turn (?:it )?around$/, 'turn-around'],
  [/^(?:closer|come closer|zoom in|go closer|nearer)$/, 'closer'],
  [/^(?:further|farther|further away|zoom out|go further|back up)$/, 'further'],
];
const SHOW = /^(?:show me|go to|take me to|let's see|let me see)\s+(.+)$/;
const OPEN = /^open\s+(.+)$/;
const WHAT_IF =
  /^what if\s+(?:the\s+)?(.+?)\s+(?:is|were|was|are|becomes|became|goes to|changes to|=)\s+(.+)$/;

// "this number", "it", "that", "this figure": the figure in front of the person.
const DEICTIC =
  /^(?:this|that|it|this one|that one|the number|this number|that number|this figure|that figure|this amount|that amount)$/;
const FIGURE = '(.+?)';
const TRACK: { step: TrackStep; re: RegExp }[] = [
  {
    step: 'from',
    re: new RegExp(
      `^where (?:does|do|did) ${FIGURE} (?:number |figure |amount )?come from$|^where is ${FIGURE} from$`,
    ),
  },
  {
    step: 'how',
    re: new RegExp(
      `^how (?:is|was|are|do you|does it) ${FIGURE} (?:worked out|calculated|computed|work out|counted|added up)$|^how do you (?:work out|calculate|get) ${FIGURE}$`,
    ),
  },
  {
    step: 'inputs',
    re: new RegExp(`^what goes into ${FIGURE}$|^what (?:are|is) ${FIGURE}(?:'s)? inputs?$`),
  },
  {
    step: 'kept',
    re: new RegExp(`^where (?:is|are) ${FIGURE} (?:kept|stored|saved)$`),
  },
  { step: 'built', re: new RegExp(`^who (?:built|made|wrote) ${FIGURE}$`) },
  { step: 'signed', re: new RegExp(`^who (?:signed|signed off|approved) ${FIGURE}$`) },
];

/** The figure a track question names, or null for "this number". */
function figureOf(phrase: string): string | null {
  // "the order amount" is a figure's name; only "this number" and the like point at the one in front.
  const p = phrase.replace(/^(?:the|a)\s+/, '').trim();
  if (!p || DEICTIC.test(phrase.trim()) || DEICTIC.test(p)) return null;
  return p;
}

const stripThe = (s: string) =>
  s
    .replace(/^(?:the|a)\s+/, '')
    .replace(/\s+(?:building|screen|page)$/, '')
    .trim();

/** Reads one utterance. The grammar is the list of Stage 10's commands and the six track questions. */
export function parseCommand(said: string): Command {
  const t = normalise(said).replace(LEAD, '').replace(TAIL, '').trim();
  if (!t) return { kind: 'talk', text: said.trim() };
  if (YES.test(t)) return { kind: 'yes' };
  if (NO.test(t)) return { kind: 'no' };
  if (SCRAP.test(t)) return { kind: 'scrap' };
  if (CODE.test(t)) return { kind: 'code' };
  if (BACK.test(t)) return { kind: 'back' };
  if (BOARD.test(t)) return { kind: 'board' };
  for (const [re, move] of CAMERA) if (re.test(t)) return { kind: 'camera', move };
  for (const { step, re } of TRACK) {
    const m = re.exec(t);
    if (m) return { kind: 'track', step, figure: figureOf(m.slice(1).find(Boolean) ?? '') };
  }
  const w = WHAT_IF.exec(t);
  if (w) return { kind: 'what-if', input: stripThe(w[1]!), value: w[2]!.trim() };
  const s = SHOW.exec(t);
  if (s && stripThe(s[1]!)) return { kind: 'show', building: stripThe(s[1]!) };
  const o = OPEN.exec(t);
  if (o && stripThe(o[1]!)) return { kind: 'open', screen: stripThe(o[1]!) };
  return { kind: 'talk', text: said.trim() };
}

/**
 * The best match for a spoken name among names on the lakefront: the same words, then one holding the
 * other. Curly quotes, case and "the" do not count. Null when none matches, or more than one equally.
 */
export function matchName<T>(spoken: string, items: T[], nameOf: (t: T) => string): T | null {
  const key = (s: string) => stripThe(normalise(s).replace(/'/g, ''));
  const k = key(spoken);
  if (!k) return null;
  const exact = items.filter((i) => key(nameOf(i)) === k);
  if (exact.length === 1) return exact[0]!;
  const holds = items.filter((i) => key(nameOf(i)).includes(k) || k.includes(key(nameOf(i))));
  return holds.length === 1 ? holds[0]! : null;
}
