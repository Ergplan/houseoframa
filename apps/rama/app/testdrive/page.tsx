import Link from 'next/link';
import { jobStatus, latestJob } from '@rama/workbench';
import { JobSteps } from '../../components/workbench/JobSteps';
import { requireMember } from '../../server/session';

export const dynamic = 'force-dynamic';

const VERDICT = {
  running: 'Running…',
  passed: 'Pass: the whole loop works.',
  failed: 'Fail: a step did not work. Its flag says what is next.',
  interrupted: 'Interrupted: the app restarted during the run. Run it again.',
} as const;

/** The last Test drive (rule 16): pass or fail in words, step by step with timings. */
export default async function TestDrive() {
  await requireMember();
  const job = latestJob('testdrive', null);
  const status = job ? jobStatus(job) : null;
  const total = job ? job.steps.reduce((t, s) => t + s.ms, 0) : 0;
  const site = job?.about;
  return (
    <main className="stub workbench">
      {/* While it runs, the page reads the job again every few seconds. */}
      {status === 'running' ? <meta httpEquiv="refresh" content="3" /> : null}
      <p>
        <Link href="/">◀ Home</Link>
      </p>
      <h1>Test drive</h1>
      <p className="note">
        The whole loop on the built-in sample product, the Chai Stall: idea, street, build, tests,
        walkthrough, the three states, audit. No voice, no camera, no keys needed.
      </p>
      {!job ? (
        <p>No Test drive has run yet.</p>
      ) : (
        <>
          <p className={`verdict ${status}`} role="status" data-status={status}>
            {VERDICT[status!]}{' '}
            <small>
              Started by {job.person} at {job.startedAt.slice(11, 19)} UTC
              {status !== 'running' ? `, ${(total / 1000).toFixed(0)} seconds in all` : ''}.
            </small>
          </p>
          <JobSteps job={job} />
          {status !== 'running' && site ? (
            <p>
              <Link href={`/site/${site}`}>Look at the sample product it built</Link>
            </p>
          ) : null}
        </>
      )}
      {status !== 'running' ? (
        <form action="/api/testdrive" method="post">
          <button type="submit" className="primary big">
            {job ? 'Run it again' : 'Test drive'}
          </button>
        </form>
      ) : null}
    </main>
  );
}
