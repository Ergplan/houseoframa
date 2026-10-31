// The flow of a figure (Stage 11): its trail as the steps the real data takes, from the ground to the
// screen. Each input leaves where it is kept (a table, a file, the form), goes into the product's own
// function in its file, is worked out by the formula, and arrives on the screen as the figure. The values
// are the trail's re-execution and nothing else: a step with no value runs dry and says so, and a figure
// with no re-execution flows only as far as it reaches. Plain code, no model.
import type { Capture } from './capture.ts';
import { appearanceKeys } from './keys.ts';

export interface FlowStep {
  kind: 'source' | 'function' | 'formula' | 'screen';
  /** What the step is, in the customer's words: the input's label, the function's file, the screen. */
  label: string;
  /** The file the step stands in: the data file or the table's file, the function's file. */
  file: string | null;
  /** The table it is kept in, when it is kept in one (`orders` of `orders.cups`). */
  table: string | null;
  /** The value at this step, as recorded; null when nothing was recorded: the step is dry. */
  value: string | null;
  /** For rows leaving a table or a data file: how many, and the first few in words. */
  rows: { count: number; first: string[] } | null;
  /** The plain sentence the voice reads for the step. */
  sentence: string;
}

export interface Flow {
  figureId: string;
  key: string;
  title: string;
  steps: FlowStep[];
  /** True when every step has a value. */
  full: boolean;
}

/** A row in words: its text fields, then its numbers by name ("Masala chai, cups 2, price of cup 1500"). */
function rowWords(r: unknown): string {
  if (!r || typeof r !== 'object') return String(r);
  const o = r as Record<string, unknown>;
  const words = Object.entries(o)
    .filter(([k, v]) => k !== 'id' && typeof v === 'string' && !/^\d{4}-\d\d-\d\dT/.test(v))
    .map(([, v]) => v as string);
  const nums = Object.entries(o)
    .filter(([k, v]) => k !== 'id' && typeof v === 'number')
    .map(
      ([k, v]) =>
        `${k
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/_/g, ' ')
          .toLowerCase()} ${v}`,
    );
  return [...words, ...nums].join(', ');
}

function rowsOf(value: string | null): { count: number; first: string[] } | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as unknown;
    if (Array.isArray(v)) return { count: v.length, first: v.slice(0, 3).map(rowWords) };
    // One record (a bill read off its file, a row fetched by itself) is one row, said in words, never
    // shown to a person as the code writes it.
    if (v && typeof v === 'object') return { count: 1, first: [rowWords(v)] };
    return null;
  } catch {
    return null;
  }
}

const base = (f: string) => f.split('/').pop()!;

/** The flow of one figure on one screen, from the capture's mapping and re-execution. Null when untraced. */
export function flowOf(capture: Capture, key: string): Flow | null {
  const screen = capture.screens.find((s) => key.startsWith(`${s.name}/`));
  const figureId = key.slice((screen?.name.length ?? 0) + 1).replace(/~\d+$/, '');
  const m = capture.mappings[figureId];
  if (!screen || !m) return null;
  // The figure shown at this very appearance (the n-th of its id on the screen), as its run is keyed.
  const keys = appearanceKeys(screen.name, screen.figures);
  const shownFig = screen.figures[keys.indexOf(key)] ?? null;
  const run = capture.runs[key];
  const ran = run?.ok ? run : null;
  const title = m.title ?? figureId;
  const steps: FlowStep[] = m.inputs.map((input) => {
    const value = ran?.inputs.find((i) => i.label === input.label)?.value ?? null;
    const rows = rowsOf(value);
    const data = input.data ?? null;
    // Kept in a table: `orders.cups`, or the whole table in words, `orders table` / `the orders table`.
    const table = data
      ? (/^([a-z_][a-z0-9_]*)\.[a-z_][a-z0-9_]*$/i.exec(data)?.[1] ??
        /^(?:the )?([a-z_][a-z0-9_]*) table$/i.exec(data)?.[1] ??
        null)
      : null;
    const kept = data ?? 'a place nobody has written down';
    return {
      kind: 'source',
      label: input.label,
      file: data && /\//.test(data) ? data : null,
      table,
      value,
      rows,
      sentence:
        value === null
          ? `${input.label}: no value was recorded, so this pipe is dry (untraced).`
          : rows
            ? `${rows.count} ${rows.count === 1 ? 'row' : 'rows'} left ${kept}${rows.first.length ? `: ${rows.first.join('; ')}` : ''}.`
            : `${input.label}, ${value}, left ${kept}.`,
    };
  });
  const computed = ran
    ? (ran.text ?? (ran.value === null || ran.value === undefined ? null : String(ran.value)))
    : null;
  steps.push({
    kind: 'function',
    label: m.fn,
    file: m.file,
    table: null,
    value: computed,
    rows: null,
    sentence:
      computed === null
        ? `It was not worked out again in ${base(m.file)}, so the water stops here (untraced).`
        : `Became ${computed} in ${base(m.file)}.`,
  });
  steps.push({
    kind: 'formula',
    label: title,
    file: m.file,
    table: null,
    value: m.english ? m.english : null,
    rows: null,
    sentence: m.english
      ? `${m.english.charAt(0).toUpperCase()}${m.english.slice(1).replace(/\.$/, '')}.`
      : 'How it is worked out is untraced.',
  });
  const shown = shownFig?.text ?? null;
  steps.push({
    kind: 'screen',
    label: screen.title,
    file: null,
    table: null,
    value: computed === null ? null : shown,
    rows: null,
    sentence:
      computed === null || shown === null
        ? `On the screen “${screen.title}” it shows ${shown ?? 'nothing'}, but no water reaches it: the flow is untraced.`
        : `${shown} on the screen “${screen.title}”.`,
  });
  return { figureId, key, title, steps, full: steps.every((s) => s.value !== null) };
}
