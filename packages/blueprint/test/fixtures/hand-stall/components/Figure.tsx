// A traced figure, as the House of Rama house style marks one: its id, the arguments it was computed
// from and its raw value, on the element that shows it.
import type { ReactNode } from 'react';

export function Figure(props: { id: string; args: unknown[]; value: number; children: ReactNode }) {
  return (
    <span
      data-rama-figure={props.id}
      data-rama-args={JSON.stringify(props.args)}
      data-rama-value={String(props.value)}
    >
      {props.children}
    </span>
  );
}
