// The foundation (Stage 13): the house stack's files, as the film lays them down block by block. Each
// block has a plain-word name, the layer of the architecture it belongs to, and one or two sentences on
// what it is for. The shell is the same for every product, so these sentences are fixed text written by
// House of Rama about its own scaffold: they live here, outside the product, and are never drafted by a
// model (Invariant 6). A file of the shell that this list does not know is shown with its path and
// "Not explained yet" — a true picture beats a complete one (rule 12).

/** The five layers every product built here has. The first four are the floors of every building. */
export type Layer = 'talks' | 'shows' | 'decides' | 'remembers' | 'checks';

export const LAYERS: { id: Layer; name: string; holds: string }[] = [
  { id: 'talks', name: 'Talks to', holds: 'the web, other services' },
  { id: 'shows', name: 'Shows', holds: 'the screens people see' },
  { id: 'decides', name: 'Decides', holds: 'the rules and the sums' },
  { id: 'remembers', name: 'Remembers', holds: 'the tables in the ground' },
  { id: 'checks', name: 'Checks', holds: 'tests and the gate at the door' },
];

export interface ShellBlock {
  name: string;
  layer: Layer;
  what: string;
}

/** The house stack's own files, in the order a person can follow them being laid. */
export const SHELL_BLOCKS: Record<string, ShellBlock> = {
  'package.json': {
    name: 'The list of parts',
    layer: 'checks',
    what: 'What this product is made of and how it is started, checked and built. Every product here begins with the same list, so the Checker knows what to expect.',
  },
  'tsconfig.json': {
    name: 'The language settings',
    layer: 'checks',
    what: 'Tells the code checker how strict to be. It is set to the strictest, so a mistake in a type is caught before anything runs.',
  },
  'next.config.mjs': {
    name: 'The web app’s settings',
    layer: 'shows',
    what: 'The few settings of the web app that shows the screens. Kept almost empty on purpose.',
  },
  'app/layout.tsx': {
    name: 'The frame around every screen',
    layer: 'shows',
    what: 'The page every screen sits inside. One frame, so all screens look like one product.',
  },
  'app/page.tsx': {
    name: 'The front door',
    layer: 'shows',
    what: 'The first screen a person sees. It starts as a welcome that shows one traced number; the builder replaces it with the product’s own.',
  },
  'app/page.test.tsx': {
    name: 'The first proof',
    layer: 'checks',
    what: 'Opens the front door and checks what it shows. A screen needs a passing check behind it before the gate lets it through.',
  },
  'components/Figure.tsx': {
    name: 'The glass label on a number',
    layer: 'shows',
    what: 'Every number on a screen is shown through this. It shows the result of the number’s own sum and marks it, so House of Rama can trace it and work it out again.',
  },
  'db/connect.ts': {
    name: 'The pipe to the ground',
    layer: 'remembers',
    what: 'How the product reaches its own database. There is one pipe, so every read and write goes the same way and can be seen.',
  },
  'db/schema.ts': {
    name: 'The shape of the ground',
    layer: 'remembers',
    what: 'Where the tables are described. None yet. Every table added here must carry which product a row belongs to, when it was written and by whom.',
  },
  'rama/define.ts': {
    name: 'How a number is written',
    layer: 'decides',
    what: 'The house rules for writing numbers: counts with Indian grouping, rupees from paise. One way, everywhere.',
  },
  'rama/figures.ts': {
    name: 'The register of numbers',
    layer: 'decides',
    what: 'Every number the product will ever show must be entered here with its name and its sum. A number not in the register cannot reach a screen.',
  },
  'rama/lint.ts': {
    name: 'The inspector at the door',
    layer: 'checks',
    what: 'Reads every screen before it is built and refuses one that shows a number without its glass label.',
  },
  'features/welcome/plan.ts': {
    name: 'The welcome building',
    layer: 'decides',
    what: 'A small first building that counts the buildings on the plan, so the shell shows one traced number from the start. The builder replaces it.',
  },
  'features/welcome/plan.test.ts': {
    name: 'The welcome building’s check',
    layer: 'checks',
    what: 'Checks that the welcome building counts the plan’s buildings correctly.',
  },
  'vitest.config.ts': {
    name: 'How the checks are run',
    layer: 'checks',
    what: 'Where the product’s tests are found and how they run.',
  },
  '.rama/features.json': {
    name: 'The names of the buildings',
    layer: 'checks',
    what: 'Your words for what the product does, written from the plan. The Street draws one building per name.',
  },
  '.rama/screens.json': {
    name: 'The list of screens',
    layer: 'shows',
    what: 'Each screen and how to start the app to photograph it, so every screen can be drawn on its building’s glass.',
  },
  '.rama/decisions.jsonl': {
    name: 'The decisions, as you said them',
    layer: 'checks',
    what: 'Every card you said yes to, with your name and the time. Append only: a change is a new line.',
  },
  '.github/workflows/build.yml': {
    name: 'The build on every change',
    layer: 'checks',
    what: 'Runs the inspector, the tests and the build every time the product changes.',
  },
  '.github/workflows/rama-gate.yml': {
    name: 'The merge gate',
    layer: 'checks',
    what: 'Nothing merges unless a passing check exercises it and every screen that changed is signed.',
  },
  'README.md': {
    name: 'The note on the door',
    layer: 'checks',
    what: 'What the product is and how an engineer starts it.',
  },
  '.gitignore': {
    name: 'What is never kept',
    layer: 'checks',
    what: 'Files that are made on the machine and never saved with the product.',
  },
  '.npmrc': {
    name: 'Where parts come from',
    layer: 'checks',
    what: 'How the list of parts is fetched, so every install gets the same parts.',
  },
};

/** The order the film lays the shell: the ground first, then the rules, the screens, and the checks. */
const LAYING: Layer[] = ['remembers', 'decides', 'shows', 'talks', 'checks'];

export interface FoundationFrame {
  path: string;
  name: string;
  layer: Layer;
  what: string | null;
  lines: number;
}

/**
 * The foundation's frames, in laying order: one per file of the house-stack commit. A file this module
 * does not know keeps its path as its name and has no sentence.
 */
export function foundationFrames(files: { path: string; lines: number }[]): FoundationFrame[] {
  const order = (f: FoundationFrame) => LAYING.indexOf(f.layer);
  const known = Object.keys(SHELL_BLOCKS);
  return files
    .map((f) => {
      const b = SHELL_BLOCKS[f.path];
      return b
        ? { path: f.path, name: b.name, layer: b.layer, what: b.what, lines: f.lines }
        : {
            path: f.path,
            name: f.path,
            layer: layerOfPath(f.path),
            what: null,
            lines: f.lines,
          };
    })
    .sort(
      (a, b) =>
        order(a) - order(b) ||
        (known.indexOf(a.path) + 1 || 999) - (known.indexOf(b.path) + 1 || 999) ||
        a.path.localeCompare(b.path),
    );
}

/** The layer of any product file, by where the house stack puts it. */
export function layerOfPath(p: string): Layer {
  if (/(^|\/)[^/]*\.test\.[jt]sx?$/.test(p) || /^\.github\//.test(p) || /^rama\/lint/.test(p))
    return 'checks';
  if (/^db\//.test(p) || /^data\//.test(p)) return 'remembers';
  if (/^lib\/web|(^|\/)(fetch|web|api-client)\.[jt]s$/.test(p)) return 'talks';
  if (/^app\//.test(p) || /^components\//.test(p) || /\.tsx$/.test(p)) return 'shows';
  if (/^\.rama\//.test(p) || /\.(json|md|ya?ml)$/.test(p)) return 'checks';
  return 'decides';
}
