// A figure on a screen (docs/HOUSE-STYLE.md): it works its value out by calling the figure's own
// function with the arguments given, and shows that result. So what a person reads is always what the
// function says; it marks the element with the figure's id, the arguments and the raw value, so House of
// Rama can trace it and work it out again. rama/figures.ts is read as a type only: a screen carries the
// code of its own figures and no other.
import type { figures } from '../rama/figures';
import { SHOW } from '../rama/define';

type Figures = typeof figures;

export function Figure<K extends keyof Figures & string>(props: {
  id: K;
  /** The same function rama/figures.ts names for this id (rama/lint.ts checks). */
  fn: Figures[K]['fn'];
  args: Parameters<Figures[K]['fn']>;
  show: Figures[K]['show'];
}) {
  const value = (props.fn as (...a: unknown[]) => number)(...props.args);
  return (
    <span
      data-rama-figure={props.id}
      data-rama-args={JSON.stringify(props.args)}
      data-rama-value={String(value)}
    >
      {SHOW[props.show](value)}
    </span>
  );
}
