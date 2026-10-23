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
  brickHistory,
  commitBreakdown,
  commitTotals,
  demolitions,
  envVars,
  heaviestCodeBrick,
  historySpan,
  loadBearing,
  mostReworked,
  screensOf,
  screensRendering,
  signatureCoverage,
  summary,
  testCoverage,
  auditSignoffCounts,
} from '@rama/blueprint/metrics';
import { edgePhrase, floorName, reviewerParagraph } from './words';
import type { AuditView } from '@rama/audit/view';
import { DraftState } from '../audit/ConfirmReport';
import type { LogEntry } from '../../canvas/audit';

/** A screen photographed from the target's built app (Stage 3), with the bricks that render it. */
export interface CapturedScreen {
  name: string;
  title: string;
  shot: string;
  bricks: string[];
}

export type View =
  | { kind: 'report' }
  | { kind: 'commit'; index: number }
  | { kind: 'brick'; path: string }
  | { kind: 'audit' };

/** The audit replay as the inspector shows it: its log while the drones fly, its report when done. */
export interface AuditRunView {
  mode: 'off' | 'flying' | 'done';
  log: LogEntry[];
  speak: boolean;
  onSpeak: (on: boolean) => void;
  onSkip: () => void;
  onStop: () => void;
  onLight: () => void;
}

interface Props {
  siteId: string;
  blueprint: Blueprint;
  view: View;
  member: string | null;
  captured?: CapturedScreen[];
  /** Screens with a signature in force at the Blueprint's commit (Stage 4). */
  signedScreens?: string[];
  /** The site's latest audit (Stage 5), and its replay. */
  audit?: AuditView | null;
  auditRun?: AuditRunView;
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
      {view.kind === 'audit' && props.audit && props.auditRun && (
        <AuditPanel
          audit={props.audit}
          run={props.auditRun}
          building={props.blueprint.commit}
          onBrick={props.onBrick}
        />
      )}
    </aside>
  );
}

function TrustReport({ siteId, blueprint: bp, signedScreens = [], onBrick }: Props) {
  const s = summary(bp);
  const signing = signatureCoverage(bp, signedScreens);
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
      <p className={signing.unsigned ? 'red' : ''} data-signed={signing.signed}>
        {signing.signed} of {signing.of} screens signed at this commit; {signing.unsigned} unsigned.{' '}
        {signing.of > 0 && <a href={`/site/${siteId}/walkthrough`}>Walk through the screens</a>}
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
        A red dot is a code brick no test imports. On a screen a named person signed, a brick with a
        test behind it turns green, and one without turns amber: confirmed by a person, not by a
        test.
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
  const { laid, renovated, knockedOut: demolished, gone } = commitBreakdown(bp, c);
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
          {laid.map((p) => (
            <div key={p}>
              <Lnk path={p} onBrick={onBrick} />
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
  captured = [],
  audit,
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
  const history = brickHistory(bp, path);
  const born = history.laidIn === null ? null : history.entries.find((e) => e.laid)!;
  const screens = screensOf(bp, path);
  const photographed = screensRendering(captured, path);
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
      {!member && <p className="note">Confirming needs a signed-in member.</p>}
      {confirm.error && <p className="error">{confirm.error}</p>}
      {confirm.notice && <p className="note">{confirm.notice}</p>}
      <div className="reviewer">
        <b>For the reviewer.</b> {reviewerParagraph(bp, path, f)}
      </div>
      {audit && <BrickVerdict audit={audit} path={path} />}
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
              <button className="lnk" onClick={() => onCommit(born.index)}>
                lift {born.index + 1}
              </button>
              , {fmtTime(born.at)} by {born.author}
            </>
          ) : (
            'not in the history yet (a working-tree change)'
          )}
        </dd>
        <dt>Reworked</dt>
        <dd>
          {history.reworked
            ? `${history.reworked} time${history.reworked > 1 ? 's' : ''} since laid`
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
      {photographed.length > 0 && (
        <section aria-label="On screen">
          <p>
            <b>On screen ({photographed.length})</b>{' '}
            <small style={{ color: 'var(--dim)' }}>· real screens this brick helps render</small>
          </p>
          <div className="thumbs">
            {photographed.map((s) => (
              <a key={s.name} href={`/site/${siteId}/showroom?screen=${s.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a captured screenshot thumbnail */}
                <img src={`/api/site/${siteId}/shots/${s.shot}`} alt="" />
                <span>{s.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <p className="note">
        Change history:{' '}
        {history.entries.map((h, j) => (
          <span key={h.sha}>
            {j > 0 && ' · '}
            <button className="lnk" onClick={() => onCommit(h.index)}>
              {h.short}
            </button>{' '}
            {h.laid ? 'laid' : h.add === null ? 'binary change' : `+${h.add}/−${h.del}`}
          </span>
        ))}
        {!history.entries.length && 'none in the extracted history'}
      </p>
      <button onClick={onReport}>◀ Trust report</button>
    </>
  );
}

const VERDICT_WORD = { pass: 'Pass', note: 'Note', defect: 'Defect' } as const;
const VERDICT_PILL = { pass: 'green', note: 'amber', defect: 'red' } as const;

/** The brick's verdict in the site's latest audit, with the findings behind it. */
function BrickVerdict({ audit, path }: { audit: AuditView; path: string }) {
  const v = audit.verdicts[path];
  const mine = audit.findings.filter((f) => f.brick === path && f.verdict !== 'pass');
  return (
    <div className="verdict" data-verdict={v ?? 'none'}>
      <h4>
        Latest audit · {audit.commit.slice(0, 7)} ·{' '}
        {v ? (
          <span className={`pill ${VERDICT_PILL[v]}`}>{VERDICT_WORD[v]}</span>
        ) : (
          'not in that audit'
        )}
      </h4>
      {v === 'pass' && <p className="note">No check that ran found anything here.</p>}
      <ul>
        {mine.map((f, i) => (
          <li key={i}>
            <span className={`pill ${VERDICT_PILL[f.verdict]}`}>{VERDICT_WORD[f.verdict]}</span>{' '}
            {f.text}
            {f.line ? <small> (line {f.line})</small> : null}
            {f.auditorNote && (
              <small>
                {' '}
                The checks said {f.checkVerdict}; the auditor lowered it: {f.auditorNote}{' '}
                <DraftState
                  confirmations={audit.confirmations}
                  by={`${audit.report.vendor} ${audit.report.model}`}
                />
              </small>
            )}
          </li>
        ))}
      </ul>
      <p className="note">
        Signed by {audit.report.vendor} {audit.report.model} on {fmtDate(audit.report.at)}, a
        different vendor from the builder.
      </p>
    </div>
  );
}

/** The audit replay's live log while the drones fly, then the signed report. */
function AuditPanel({
  audit,
  run,
  building,
  onBrick,
}: {
  audit: AuditView;
  run: AuditRunView;
  /** The commit the building shows now: when it is not the audited one, the panel says so. */
  building: string;
  onBrick: (p: string) => void;
}) {
  const moved = building !== audit.commit && (
    <p className="note" data-moved>
      This audit is of {audit.commit.slice(0, 7)}; the building is now at {building.slice(0, 7)}.
      Bricks laid since were not audited and carry no badge.
    </p>
  );
  const head = (
    <p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={run.speak}
          onChange={(e) => run.onSpeak(e.target.checked)}
        />{' '}
        Read the narration aloud
      </label>
    </p>
  );
  if (run.mode === 'flying') {
    return (
      <>
        <h2>Audit · live</h2>
        <p className="big">Drones are flying the site.</p>
        {moved}
        <p className="note">
          The narration is the auditor&apos;s:{' '}
          <DraftState
            confirmations={audit.confirmations}
            by={`${audit.report.vendor} ${audit.report.model}`}
          />
        </p>
        {head}
        <div className="alog" data-log={run.log.length}>
          {run.log.map((l, i) =>
            l.kind === 'phase' ? (
              <div key={i} className="aph">
                {l.text}
              </div>
            ) : l.kind === 'say' ? (
              <div key={i} className="asay">
                {l.text}
              </div>
            ) : (
              <div key={i} className={`afind ${l.verdict}`}>
                <span className={`pill ${VERDICT_PILL[l.verdict]}`}>{VERDICT_WORD[l.verdict]}</span>{' '}
                <Lnk path={l.path} onBrick={onBrick} />
                <div className="en">{l.text}</div>
              </div>
            ),
          )}
        </div>
        <p>
          <button onClick={run.onSkip}>Skip to the report</button>{' '}
          <button onClick={run.onStop}>■ Stop audit</button>
        </p>
      </>
    );
  }
  const c = audit.counts;
  const confirmed = audit.signoffs.filter((s) => s.confirmed);
  const rejected = audit.signoffs.filter((s) => !s.confirmed);
  const signed = auditSignoffCounts(audit.signoffs);
  return (
    <>
      <h2>
        Audit report · {audit.commit.slice(0, 7)}
        {audit.worktree ? ' + working tree' : ''}
      </h2>
      <p className={`big${c.defects ? ' red' : ''}`} data-defects={c.defects}>
        {c.defects} defect{c.defects === 1 ? '' : 's'}, {c.notes} note{c.notes === 1 ? '' : 's'},{' '}
        {c.passes} clean brick{c.passes === 1 ? '' : 's'} of {c.bricks}.
      </p>
      <div className="stat">
        <div>
          <b>{c.defects}</b>
          <small>defects</small>
        </div>
        <div>
          <b>{c.notes}</b>
          <small>notes</small>
        </div>
        <div>
          <b>{c.passes}</b>
          <small>clean bricks</small>
        </div>
        <div>
          <b>
            {signed.confirmed} / {signed.of}
          </b>
          <small>sign-offs confirmed</small>
        </div>
      </div>
      {moved}
      {head}
      <h3>Checks</h3>
      <ul className="runs">
        {audit.runs.map((r) => (
          <li key={r.check} data-ran={r.ran}>
            <code>{r.check}</code>{' '}
            {r.ran ? `ran${r.outcome ? `: ${r.outcome}` : ''}` : `not run: ${r.detail}`}
          </li>
        ))}
      </ul>
      <h3>Sign-offs</h3>
      {audit.signoffs.length === 0 ? (
        <p>None exist, so none can be confirmed or rejected. Every screen is unsigned.</p>
      ) : (
        <ul>
          {confirmed.map((s) => (
            <li key={s.screen}>
              <span className="pill green">Confirmed</span> {s.screen}, signed by {s.person} at{' '}
              {s.commit.slice(0, 7)}
            </li>
          ))}
          {rejected.map((s) => (
            <li key={s.screen}>
              <span className="pill red">Rejected</span> {s.screen}, signed by {s.person}: defects
              in{' '}
              {s.defects.map((d) => (
                <Lnk key={d} path={d} onBrick={onBrick} />
              ))}
            </li>
          ))}
        </ul>
      )}
      <h3>
        Alterations and estimates{' '}
        <DraftState
          confirmations={audit.confirmations}
          by={`${audit.report.vendor} ${audit.report.model}`}
        />
      </h3>
      <div className="links">
        {audit.alterations.map((a, i) => (
          <div className="dep" key={i}>
            <div>{a.title}</div>
            <div className="en">
              agent {a.agentTime} · {a.humanTime} · {a.kind}
            </div>
          </div>
        ))}
      </div>
      <h3>
        Time machine · what could have gone better{' '}
        <DraftState
          confirmations={audit.confirmations}
          by={`${audit.report.vendor} ${audit.report.model}`}
        />
      </h3>
      <div className="links">
        {audit.timeMachine.map((t, i) => (
          <div className="dep" key={i}>
            <div>
              <code>{t.commit}</code> {t.what}
            </div>
            <div className="en">{t.shouldHave}</div>
          </div>
        ))}
      </div>
      <h3>Who did what</h3>
      <p>{audit.builders.join(' · ') || 'No builder recorded.'}</p>
      <p className="note">
        Signed by {audit.report.vendor} {audit.report.model}, a different vendor from the builder,
        on {fmtTime(audit.report.at)}. Report {audit.report.reportId.slice(0, 8)}; inputs hash{' '}
        <code>{audit.report.inputsHash.slice(0, 16)}…</code>. The checks are plain code; the auditor
        wrote the narration, the alterations and the time machine, and may only lower a verdict,
        with a reason.
      </p>
      <p>
        <button className="primary" onClick={run.onLight} disabled={!c.defects}>
          Light the defects
        </button>{' '}
        <button onClick={run.onStop}>◀ Trust report</button>
      </p>
    </>
  );
}
