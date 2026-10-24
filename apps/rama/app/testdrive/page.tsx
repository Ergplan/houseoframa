import Link from 'next/link';
import { jobStatus, latestJob } from '@rama/workbench';
import { JobSteps } from '../../components/workbench/JobSteps';
import { Button, Card, Folder } from '../../components/harmony/ui';
import { Shell } from '../../components/harmony/Shell';
import { requireMember } from '../../server/session';

export const dynamic = 'force-dynamic';

const VERDICT = {
  running: 'Running',
  passed: 'Pass',
  failed: 'Fail',
  interrupted: 'Interrupted',
} as const;
const SAID = {
  running: 'Each step appears as it finishes.',
  passed: 'The whole loop works.',
  failed: 'A step did not work. Its flag says what is next.',
  interrupted: 'The app restarted during the run. Run it again.',
} as const;

/** The last Test drive (rule 16): pass or fail in words, step by step with timings. */
export default async function TestDrive() {
  const member = await requireMember();
  const job = latestJob('testdrive', null);
  const status = job ? jobStatus(job) : null;
  const total = job ? job.steps.reduce((t, s) => t + s.ms, 0) : 0;
  const site = job?.about;
  return (
    <Shell
      here="testdrive"
      member={member}
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Test drive' }]}
    >
      {/* While it runs, the page reads the job again every few seconds. */}
      {status === 'running' ? <meta httpEquiv="refresh" content="3" /> : null}
      <h1 className="eg-h1">
        Test <em>drive</em>
      </h1>
      <p className="eg-muted" style={{ margin: 0 }}>
        The whole loop on the built-in sample product, the Chai Stall: idea, street, build, tests,
        walkthrough, the three states, audit. No voice, no camera, no keys needed.
      </p>
      {!job ? (
        <Card>
          <p style={{ margin: 0 }}>No Test drive has run yet.</p>
        </Card>
      ) : (
        <>
          <Folder
            title={
              <span className="rama-verdict" role="status" data-status={status}>
                {VERDICT[status!]}
              </span>
            }
            sub={`${SAID[status!]} Started by ${job.person} at ${job.startedAt.slice(11, 19)} UTC${
              status !== 'running' ? `, ${(total / 1000).toFixed(0)} seconds in all` : ''
            }.`}
            sheets={job.steps.slice(-3).map((s) => ({
              kicker: s.ok ? 'done' : s.ok === null ? 'running' : 'not done',
              label: s.name,
              value: `${(s.ms / 1000).toFixed(1)} s`,
            }))}
          >
            {status !== 'running' && site ? (
              <p style={{ margin: 0 }}>
                <Link href={`/site/${site}`} style={{ color: 'inherit' }}>
                  Look at the sample product it built
                </Link>
              </p>
            ) : null}
          </Folder>
          <Card title="Steps">
            <JobSteps job={job} />
          </Card>
        </>
      )}
      {status !== 'running' ? (
        <form action="/api/testdrive" method="post">
          <Button type="submit" variant="primary" size="lg">
            {job ? 'Run it again' : 'Start the Test drive'}
          </Button>
        </form>
      ) : null}
    </Shell>
  );
}
