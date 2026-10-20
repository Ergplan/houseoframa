'use client';
// The inspector beside the building: the Trust report (the site's figures), a Commit (one lift) and a
// Brick (one file, in English). Every figure is a call into packages/blueprint/metrics (Invariant 7);
// every drafted text shows its state, and an unconfirmed one carries a Confirm control.
// Views ported from the weekend prototype's showReport/showCommit/showBrick
// (reference/weekend-prototype/house-of-rama.html).
import { useMemo, useState } from 'react';
import type { Blueprint, ImportEdge } from '@rama/shared';
import {
  authors,
  brickFigures,
  commitTotals,
  demolitions,
  envVars,
  heaviestCodeBrick,
  historySpan,
  loadBearing,
  mostReworked,
  summary,
  testCoverage,
} from '@rama/blueprint/metrics';
import { edgePhrase, floorName, reviewerParagraph } from './words';

export type View =
  { kind: 'report' } | { kind: 'commit'; index: number } | { kind: 'brick'; path: string };

interface Props {
  siteId: string;
  blueprint: Blueprint;
  view: View;
  member: string | null;
  onBrick: (path: string) => void;
  onCommit: (index: number) => void;
  onReport: () => void;
  onConfirmed: () => void;
}

const fmtDate = (iso: string) => iso.slice(0, 10);
const fmtTime = (iso: string) =>
  `${iso.slice(0, 10)} ${iso.slice(11, 16)} (UTC${iso.length > 19 ? iso.slice(19).replace('Z', '+00:00') : ''})`;

function Lnk({ path, onBrick }: { path: string; onBrick: (p: string) => void }) {
  return (
    <button className="lnk" onClick={() => onBrick(path)}>
      {path}
    </button>
  );
}

export function Inspector(props: Props) {
  const { view } = props;
  return (
    <aside className="mon" aria-live="polite" data-view={view.kind}>
      {view.kind === 'report' && <TrustReport {...props} />}
      {view.kind === 'commit' && <CommitView {...props} index={view.index} />}
      {view.kind === 'brick' && <BrickView key={view.path} {...props} path={view.path} />}
    </aside>
  );
}

function TrustReport({ blueprint: bp, onBrick }: Props) {
  const s = summary(bp);
  const cover = testCoverage(bp);
  const heavy = heaviestCodeBrick(bp);
  const hub = loadBearing(bp, 1)[0];
  const churn = mostReworked(bp, 1)[0];
  const span = historySpan(bp);
  const env = envVars(bp);
  const knocked = demolitions(bp);
  const last = bp.commits.at(-1);
  return (
    <>
      <h2>Trust report</h2>
      <p className={`big${cover.tested < cover.of ? ' red' : ''}`}>
        {cover.tested} of {cover.of} code bricks have a test behind them.
      </p>
      <p>
        Everything here was read from git, not from a plan. The building is the repository at{' '}
        {bp.commit ? <code>{bp.commit.slice(0, 7)}</code> : 'no commit'}
        {last ? `, ${fmtDate(last.at)}` : ''}
        {bp.worktree ? ', with the changes in its working tree' : ''}.
      </p>
      <div className="stat">
        <div>
          <b>{s.files}</b>
          <small>files · bricks</small>
        </div>
        <div>
          <b>{s.textLines.toLocaleString('en-IN')}</b>
          <small>lines of text</small>
        </div>
        <div>
          <b>{s.commits}</b>
          <small>commits · lifts</small>
        </div>
        <div>
          <b>{span < 120 ? `${span} min` : `${Math.round(span / 60 / 24)} days`}</b>
          <small>first to last commit</small>
        </div>
        <div>
          <b>{s.authors}</b>
          <small>builders · cranes</small>
        </div>
        <div>
          <b>{s.branches}</b>
          <small>
            {bp.worktree ? 'branches · not recorded for a working tree' : 'branches · scaffolds'}
          </small>
        </div>
        <div>
          <b>{s.importEdges}</b>
          <small>import links · cables</small>
        </div>
        <div>
          <b>{s.envVars}</b>
          <small>env vars read</small>
        </div>
      </div>
      <dl className="kv">
        <dt>Heaviest code brick</dt>
        <dd>
          {heavy ? (
            <>
              <Lnk path={heavy.path} onBrick={onBrick} /> ({heavy.lines} lines)
            </>
          ) : (
            'none'
          )}
        </dd>
        <dt>Load-bearing</dt>
        <dd>
          {hub ? (
            <>
              <Lnk path={hub.path} onBrick={onBrick} />, imported by {hub.count} files
            </>
          ) : (
            'none'
          )}
        </dd>
        <dt>Most reworked</dt>
        <dd>
          {churn ? (
            <>
              <Lnk path={churn.path} onBrick={onBrick} />, touched in {churn.count} of {s.commits}{' '}
              commits
            </>
          ) : (
            'none'
          )}
        </dd>
        <dt>Walls knocked out</dt>
        <dd>{knocked.length} (changes deleting 20 or more lines from one file)</dd>
        <dt>Builders</dt>
        <dd>{authors(bp).join(' · ') || 'none'}</dd>
        {env.length > 0 && (
          <>
            <dt>Env vars</dt>
            <dd>
              {env.map((v) => (
                <span key={v} className="pill cyan">
                  {v}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      <p className="note">
        A red dot is a code brick no test imports. Sign-off will ask for a green brick: a test that
        passed, or a named person who confirmed the behaviour on a screen.
      </p>
      <p className="note">
        Click a brick, or find it by path, to read it in English. Press Play to watch the site build
        in the order git recorded it.
      </p>
    </>
  );
}

function CommitView({ blueprint: bp, index, onBrick, onReport }: Props & { index: number }) {
  const c = bp.commits[index];
  if (!c) return null;
  const t = commitTotals(bp, c);
  const present = new Set(bp.nodes.map((n) => n.path));
  const knocked = new Set(
    demolitions(bp)
      .filter((d) => d.sha === c.sha)
      .map((d) => d.path),
  );
  const laid = c.changes.filter(
    (ch) => present.has(ch.path) && bp.nodes.find((n) => n.path === ch.path)!.firstCommit === c.sha,
  );
  const renovated = c.changes.filter(
    (ch) => present.has(ch.path) && !laid.includes(ch) && !knocked.has(ch.path),
  );
  const demolished = c.changes.filter((ch) => present.has(ch.path) && knocked.has(ch.path));
  const gone = c.changes.filter((ch) => !present.has(ch.path));
  const counts = (ch: (typeof c.changes)[number]) =>
    ch.add === null ? 'binary' : `+${ch.add}/−${ch.del}`;
  return (
    <>
      <h2>
        Lift {index + 1} of {bp.commits.length} · {c.short}
      </h2>
      <h3>{c.subject}</h3>
      <dl className="kv">
        <dt>When</dt>
        <dd>{fmtTime(c.at)}</dd>
        <dt>Builder</dt>
        <dd>{c.author}</dd>
        <dt>Lines</dt>
        <dd>
          +{t.add} / −{t.del}
        </dd>
        <dt>Tests added</dt>
        <dd>
          {t.testsAdded ? (
            <span className="pill green">{t.testsAdded}</span>
          ) : (
            <span className="pill red">none</span>
          )}
        </dd>
      </dl>
      {laid.length > 0 && (
        <>
          <p>
            <span className="pill green">{laid.length} new bricks</span>
          </p>
          {laid.map((ch) => (
            <div key={ch.path}>
              <Lnk path={ch.path} onBrick={onBrick} />
            </div>
          ))}
        </>
      )}
      {renovated.length > 0 && (
        <>
          <p>
            <span className="pill amber">{renovated.length} renovated</span>
          </p>
          {renovated.map((ch) => (
            <div key={ch.path}>
              <Lnk path={ch.path} onBrick={onBrick} /> <small>{counts(ch)}</small>
            </div>
          ))}
        </>
      )}
      {demolished.length > 0 && (
        <>
          <p>
            <span className="pill red">{demolished.length} wall knocked out</span>
          </p>
          {demolished.map((ch) => (
            <div key={ch.path}>
              <Lnk path={ch.path} onBrick={onBrick} /> <small>{counts(ch)}</small>
            </div>
          ))}
          <p className="note">
            The JCB comes out whenever a commit removes 20 or more lines from one file: that is
            where behaviour changed, and where a reviewer should look first.
          </p>
        </>
      )}
      {gone.length > 0 && (
        <p className="note">
          {gone.length} {gone.length === 1 ? 'file' : 'files'} touched here{' '}
          {gone.length === 1 ? 'is' : 'are'} no longer in the building (deleted or renamed later).
        </p>
      )}
      <button onClick={onReport}>◀ Trust report</button>
    </>
  );
}

function PhraseState({ state }: { state: 'confirmed' | 'unconfirmed' | 'none' }) {
  if (state === 'confirmed') return <span className="pill green state">confirmed</span>;
  if (state === 'unconfirmed') return <span className="pill amber state">unconfirmed draft</span>;
  return <span className="pill dim state">unknown</span>;
}

function useConfirm(siteId: string, onConfirmed: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (key: string, body: object) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/site/${encodeURIComponent(siteId)}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; missing?: string[] };
      if (!json.ok) setError(json.error ?? `confirm failed (${res.status})`);
      else {
        if (json.missing?.length)
          setNotice(`Confirmed. Still unconfirmed: no phrase yet for ${json.missing.join(', ')}.`);
        onConfirmed();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, notice, run };
}

function BrickView({
  siteId,
  blueprint: bp,
  path,
  member,
  onBrick,
  onCommit,
  onReport,
  onConfirmed,
}: Props & { path: string }) {
  const n = bp.nodes.find((x) => x.path === path);
  const figures = useMemo(() => brickFigures(bp), [bp]);
  const confirm = useConfirm(siteId, onConfirmed);
  if (!n) return null;
  const f = figures[path]!;
  const deps = bp.edges.filter((e) => e.from === path);
  const users = bp.edges.filter((e) => e.to === path);
  const history = bp.commits
    .map((c, i) => ({ c, i, ch: c.changes.find((x) => x.path === path) }))
    .filter((x) => x.ch);
  const born = history.find((h) => h.c.sha === n.firstCommit);
  const screens = bp.screens.filter((s) => s.bricks.includes(path));
  const floor = bp.layers.find((l) => l.id === n.layer);

  const confirmControl = (key: string, body: object, label: string) =>
    member ? (
      <button
        className="confirm"
        disabled={confirm.busy !== null}
        onClick={() => confirm.run(key, body)}
        aria-label={label}
      >
        {confirm.busy === key ? 'Confirming…' : 'Confirm'}
      </button>
    ) : null;

  const edgeRow = (e: ImportEdge, side: 'dep' | 'use') => {
    const other = side === 'dep' ? e.to : e.from;
    const ph = edgePhrase(e);
    const key = `${e.from}>${e.to}`;
    return (
      <div className="dep" key={key} data-edge={key}>
        <span aria-hidden>{side === 'dep' ? '↓ ' : '↑ '}</span>
        <Lnk path={other} onBrick={onBrick} />
        <div className={`en${ph.state === 'confirmed' ? ' confirmed' : ''}`}>
          {side === 'use' && ph.state !== 'none' ? 'takes ' : ''}
          {ph.text}
          <PhraseState state={ph.state} />
          {ph.state === 'confirmed' && e.english?.by && (
            <small>
              {' '}
              by {e.english.by}, {fmtDate(e.english.at ?? '')}
            </small>
          )}
          {ph.state === 'unconfirmed' &&
            confirmControl(
              key,
              { kind: 'edge', from: e.from, to: e.to, shown: e.english!.text },
              `Confirm the phrase for ${e.from} → ${e.to}`,
            )}
        </div>
      </div>
    );
  };

  return (
    <>
      <h2>Brick · {floorName(bp, n.layer)} floor</h2>
      <h3>{n.path}</h3>
      {n.purpose ? (
        <p className={`purpose${n.purpose.confirmed ? '' : ' unconfirmed'}`}>
          {n.purpose.text} <PhraseState state={n.purpose.confirmed ? 'confirmed' : 'unconfirmed'} />
          {n.purpose.confirmed && n.purpose.by && (
            <small>
              {' '}
              by {n.purpose.by}, {fmtDate(n.purpose.at ?? '')}
            </small>
          )}
          {!n.purpose.confirmed &&
            confirmControl(
              `purpose:${path}`,
              { kind: 'purpose', path, shown: n.purpose.text },
              `Confirm the purpose of ${path}`,
            )}
        </p>
      ) : (
        <p className="purpose unconfirmed">
          No purpose recorded for this brick yet. <PhraseState state="none" />
        </p>
      )}
      {!member && <p className="note">Confirming needs a local member: set RAMA_MEMBER_NAME.</p>}
      {confirm.error && <p className="error">{confirm.error}</p>}
      {confirm.notice && <p className="note">{confirm.notice}</p>}
      <div className="reviewer">
        <b>For the reviewer.</b> {reviewerParagraph(bp, path, f)}
      </div>
      <dl className="kv">
        <dt>Size</dt>
        <dd>
          {n.binary ? 'binary file' : `${n.lines} lines`} · {n.bytes.toLocaleString('en-IN')} bytes
          {n.exports.length ? ` · ${n.exports.length} exports` : ''}
        </dd>
        <dt>Floor</dt>
        <dd>
          {floor?.label ?? n.layer}
          <br />
          <small style={{ color: 'var(--dim)' }}>placed by {n.layerRule}</small>
        </dd>
        <dt>Laid</dt>
        <dd>
          {born ? (
            <>
              <button className="lnk" onClick={() => onCommit(born.i)}>
                lift {born.i + 1}
              </button>
              , {fmtTime(born.c.at)} by {born.c.author}
            </>
          ) : (
            'not in the history yet (a working-tree change)'
          )}
        </dd>
        <dt>Reworked</dt>
        <dd>
          {n.changes > 1
            ? `${n.changes - 1} time${n.changes > 2 ? 's' : ''} since laid`
            : 'never since laid'}
        </dd>
        <dt>Tested</dt>
        <dd>
          {f.tested === null ? (
            <span className="pill dim">{n.test ? 'is a test' : 'not code'}</span>
          ) : f.tested ? (
            <span className="pill green">a test imports it</span>
          ) : (
            <span className="pill red">no test found</span>
          )}
        </dd>
        {(n.env.length > 0 || n.envDynamic) && (
          <>
            <dt>Reads env</dt>
            <dd>
              {n.env.map((v) => (
                <span key={v} className="pill cyan">
                  {v}
                </span>
              ))}
              {n.envDynamic && <span className="pill dim">and names computed at run time</span>}
            </dd>
          </>
        )}
      </dl>
      {deps.length > 0 && (
        <section aria-label="Depends on">
          <p>
            <b>Depends on ({f.dependsOn})</b>{' '}
            <small style={{ color: 'var(--dim)' }}>· and what it takes from each</small>
          </p>
          {deps.map((e) => edgeRow(e, 'dep'))}
        </section>
      )}
      {users.length > 0 && (
        <section aria-label="Used by">
          <p>
            <b>Used by ({f.usedBy})</b>{' '}
            <small style={{ color: 'var(--dim)' }}>· and what each takes from it</small>
          </p>
          {users.map((e) => edgeRow(e, 'use'))}
        </section>
      )}
      {!deps.length && !users.length && (
        <p className="note">No import cables. This brick stands on its own.</p>
      )}
      {screens.length > 0 ? (
        <p>
          On {screens.length} screen{screens.length > 1 ? 's' : ''}:{' '}
          {screens.map((s) => s.route).join(', ')}
        </p>
      ) : (
        <p className="note">
          Not behind any screen the extractor found: this brick works behind the glass, or is not
          code.
        </p>
      )}
      <p className="note">
        Change history:{' '}
        {history.map((h, j) => (
          <span key={h.c.sha}>
            {j > 0 && ' · '}
            <button className="lnk" onClick={() => onCommit(h.i)}>
              {h.c.short}
            </button>{' '}
            {h.c.sha === n.firstCommit
              ? 'laid'
              : h.ch!.add === null
                ? 'binary change'
                : `+${h.ch!.add}/−${h.ch!.del}`}
          </span>
        ))}
        {!history.length && 'none in the extracted history'}
      </p>
      <button onClick={onReport}>◀ Trust report</button>
    </>
  );
}
