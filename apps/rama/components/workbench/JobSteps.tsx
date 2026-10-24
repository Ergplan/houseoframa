import type { Job, JobStep } from '@rama/workbench';

const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const mark = (s: JobStep) => (s.ok === null ? '…' : s.ok ? '✓' : '✗');

/** A job's steps: a mark, the step, how long it took, what happened, and when it failed what is next. */
export function JobSteps({ job }: { job: Job }) {
  return (
    <ol className="steps">
      {job.steps.map((s, i) => (
        <li
          key={i}
          className={s.ok === null ? 'running' : s.ok ? 'pass' : 'fail'}
          data-step={s.name}
        >
          <span className="mark" aria-hidden>
            {mark(s)}
          </span>{' '}
          <b>{s.name}</b> <small>{s.ok === null ? 'running' : secs(s.ms)}</small>
          <div>{s.sentence}</div>
          {s.next ? <div className="next">Next: {s.next}</div> : null}
        </li>
      ))}
    </ol>
  );
}
