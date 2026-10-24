// ergOS Harmony's components as small React wrappers that output only Harmony's `eg-` classes, so the
// design system stays the one source of styling (design/harmony/developer-guide.md §9). The mapping of
// House of Rama objects to these is design/harmony/README.md.
import Link from 'next/link';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'default' | 'solid' | 'accent' | 'ghost';

/** A pill button. One primary per view: the thing the screen exists to do. Never a primary on a folder. */
export function Button({
  variant = 'default',
  size,
  block,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: 'sm' | 'lg';
  block?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'eg-btn',
    variant !== 'default' ? `eg-btn--${variant}` : '',
    size ? `eg-btn--${size}` : '',
    block ? 'eg-btn--block' : '',
    rest.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} className={cls}>
      {children}
    </button>
  );
}

/** A link styled as a button. */
export function ButtonLink({
  href,
  variant = 'default',
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`eg-btn${variant !== 'default' ? ` eg-btn--${variant}` : ''}`}>
      {children}
    </Link>
  );
}

/** A small pill. State is carried by a word, never by colour alone. */
export function Chip({
  tone,
  children,
  ...rest
}: {
  tone?: 'accent' | 'negative' | 'warning' | 'mono' | 'solid' | 'positive' | 'muted';
  children: ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const cls =
    tone === 'positive' || tone === 'muted'
      ? `eg-chip rama-chip--${tone}`
      : `eg-chip${tone ? ` eg-chip--${tone}` : ''}`;
  return (
    <span {...rest} className={`${cls} ${rest.className ?? ''}`.trim()}>
      {children}
    </span>
  );
}

/**
 * A screen's state as a flag (Invariant 11, the README's mapping): Verified in `positive`, Confirmed in
 * `accent` with the name, Unverified in `ink-muted`. Always the word.
 */
export function StateChip({
  state,
  by,
  count,
}: {
  state: 'Verified' | 'Confirmed' | 'Unverified';
  by?: string | null;
  count?: number;
}) {
  const tone = state === 'Verified' ? 'positive' : state === 'Confirmed' ? 'accent' : 'muted';
  return (
    <Chip tone={tone} data-state={state}>
      {count !== undefined ? `${count} ` : ''}
      {state}
      {by ? ` by ${by}` : ''}
    </Chip>
  );
}

/**
 * The folder card: the one green object on a screen, for its headline. `ErgOS.mount()` cuts its shape;
 * without the script it is a plain rounded card. Sheets are decorative.
 */
export function Folder({
  title,
  sub,
  sheets = [],
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  sheets?: { kicker: string; label: string; value: string }[];
  children?: ReactNode;
}) {
  return (
    <div className="eg-folder">
      <div className="eg-folder__back" />
      <div className="eg-folder__sheets" aria-hidden>
        {sheets.slice(0, 3).map((s, i) => (
          <div key={i} className="eg-sheet">
            <span className="eg-sheet__kicker">{s.kicker}</span> {s.label} <b>{s.value}</b>
          </div>
        ))}
      </div>
      <div className="eg-folder__front">
        <div className="eg-folder__head">
          <h2 className="eg-folder__title">{title}</h2>
          {sub ? <p className="eg-folder__sub">{sub}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A glass card with an optional title. */
export function Card({
  title,
  sub,
  children,
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="eg-glass rama-card" id={id}>
      {title ? (
        <div className="eg-card__head">
          <div>
            <h2 className="eg-card__title">{title}</h2>
            {sub ? <p className="eg-card__sub">{sub}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
