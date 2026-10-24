import type { Job, JobStep } from '@rama/workbench';
import { Chip } from '../harmony/ui';

const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const mark = (s: JobStep) => (s.ok === null ? '…' : s.ok ? '✓' : '✗');

/**
 * A job's steps as Harmony's activity timeline: each step's mark, name and time, what happened in one
 * sentence, and when it failed a grey flag with what is next (rule 15).
 */
export function JobSteps({ job }: { job: Job }) {
  return (
    <ol className="eg-timeline steps" style={{ listStyle: 'none', margin: 0 }}>
      {job.steps.map((s, i) => (
        <li
          key={i}
          className={`eg-tl-item ${s.ok === null ? 'running' : s.ok ? 'pass' : 'fail'}`}
          data-step={s.name}
        >
          <span className="eg-tl-item__icon" aria-hidden>
            {mark(s)}
          </span>
          <div>
            <p className="eg-tl-item__title">
              {s.name}{' '}
              <Chip tone={s.ok === null ? 'accent' : s.ok ? 'positive' : 'muted'}>
                {s.ok === null
                  ? 'running'
                  : s.ok
                    ? `done · ${secs(s.ms)}`
                    : `not done · ${secs(s.ms)}`}
              </Chip>
            </p>
            <p className="eg-tl-item__meta">{s.sentence}</p>
            {s.next ? <p className="eg-tl-item__meta next">Next: {s.next}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
