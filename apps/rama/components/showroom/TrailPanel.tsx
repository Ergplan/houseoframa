// The trail of one figure, in the five sections of the weekend prototype's trail panel
// (reference/weekend-prototype/house-of-rama.html, showTrail): formula, inputs, where the data lives,
// build trail, review and sign-off. A value that was not re-executed is shown as missing, never retyped.
import type { Trail } from '@rama/shared';

const fmtDate = (iso: string) => iso.slice(0, 10);

export function TrailPanel({ trail }: { trail: Trail }) {
  const r = trail.result;
  return (
    <div className="trail" data-figure={trail.figureId}>
      <h2>Trail · traced figure</h2>
      <h3>{trail.title}</h3>
      <p>{trail.what}</p>
      <div
        className={`check ${r?.matches ? 'ok' : r?.matches === false ? 'bad' : 'none'}`}
        aria-label="Re-execution"
      >
        {trail.reexecuted ? (
          <>
            <b>
              {r?.matches
                ? 'Re-executed: matches the screen.'
                : 'Re-executed: does not match the screen.'}
            </b>{' '}
            Shown <code>{r?.shown ?? '—'}</code>, computed by the target&apos;s own code{' '}
            <code>{r?.computed ?? '—'}</code>.
          </>
        ) : (
          <>
            <b>Not re-executed.</b> {trail.reexecutionError ?? ''} No value is shown rather than a
            retyped one.
          </>
        )}
      </div>

      <section aria-label="Formula">
        <h4>1 · Formula</h4>
        <p>{trail.formula.english}</p>
        <pre className="code">{trail.formula.code || '(the code could not be read)'}</pre>
        <p className="where">
          <code>
            {trail.formula.file}:{trail.formula.line}
          </code>
        </p>
      </section>

      <section aria-label="Inputs">
        <h4>2 · Inputs</h4>
        <dl className="kv">
          {trail.inputs.map((i) => (
            <div key={i.label} style={{ display: 'contents' }}>
              <dt>{i.label}</dt>
              <dd>
                {i.value ?? <span className="pill dim">not re-executed</span>}
                <br />
                <small>{i.source}</small>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Where the data lives">
        <h4>3 · Where the data lives</h4>
        <ul>
          {trail.data.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Build trail">
        <h4>4 · Build trail</h4>
        {trail.build.length ? (
          <ul className="build">
            {trail.build.map((b) => (
              <li key={`${b.sha}:${b.file}`}>
                <code>{b.sha.slice(0, 7)}</code> {fmtDate(b.at)} · {b.author} · {b.subject}{' '}
                <small>({b.file})</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">No commit in the extracted history touched these files.</p>
        )}
      </section>

      <section aria-label="Review and sign-off">
        <h4>5 · Review &amp; sign-off</h4>
        {trail.signoff ? (
          <p>
            Signed by {trail.signoff.person} on {fmtDate(trail.signoff.at)}:{' '}
            {trail.signoff.statement}
          </p>
        ) : (
          <p className="note">
            Not signed at this commit. A named person signs the screen in the walkthrough.
          </p>
        )}
      </section>
    </div>
  );
}

export function UntracedPanel({ text }: { text: string }) {
  return (
    <div className="trail" data-figure="untraced">
      <h2>Untraced figure</h2>
      <h3>{text}</h3>
      <p>
        This figure is on the screen, but nothing maps it to the code that computes it: no{' '}
        <code>data-rama-figure</code> with a mapping in <code>rama/figures.ts</code>, and no entry
        in <code>.rama/figures.json</code>. It is shown as untraced rather than explained by a guess
        (Invariant 2).
      </p>
    </div>
  );
}
