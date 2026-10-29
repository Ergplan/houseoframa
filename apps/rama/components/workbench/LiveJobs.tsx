'use client';
// The jobs' steps, followed in place (Stage 12). While a job runs the steps are read every two seconds
// and redrawn here; only when a step ends is the page's picture redrawn, softly, so the camera, the
// building opened and a click in progress are kept. The page reloaded itself every four seconds before.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteJob } from '../../app/api/site/[siteId]/jobs/handler';
import { JobSteps } from './JobSteps';

const ended = (jobs: SiteJob[]) =>
  jobs
    .map((j) => `${j.kind}:${j.status}:${j.job.steps.filter((s) => s.ok !== null).length}`)
    .join();

export function LiveJobs({
  siteId,
  jobs: first,
  kinds,
  fold,
}: {
  siteId: string;
  jobs: SiteJob[];
  /** The kinds shown here; null for every kind. */
  kinds: SiteJob['kind'][] | null;
  fold?: boolean;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(first);
  const seen = useRef(ended(first));
  // A server render with newer steps (after a refresh) is taken as it comes.
  useEffect(() => {
    setJobs(first);
    seen.current = ended(first);
  }, [first]);
  const running = jobs.some((j) => j.status === 'running');
  useEffect(() => {
    if (!running) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = (await (await fetch(`/api/site/${siteId}/jobs`)).json()) as {
          ok: boolean;
          jobs: SiteJob[];
        };
        if (stop || !r.ok) return;
        setJobs(r.jobs);
        const now = ended(r.jobs);
        if (now !== seen.current) {
          seen.current = now;
          router.refresh();
        }
      } catch {
        // the app is busy: the next poll reads it again
      }
      if (!stop) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, siteId, router]);

  const shown = kinds ? jobs.filter((j) => kinds.includes(j.kind)) : jobs;
  return (
    <>
      {shown.map(({ kind, job, status }) => (
        <div key={kind} className={`job ${status}`} data-job={kind}>
          {fold && status !== 'running' ? (
            <details className="job__fold">
              <summary>{job.steps.at(-1)?.sentence ?? 'Nothing has run yet.'}</summary>
              <JobSteps job={job} />
            </details>
          ) : (
            <JobSteps job={job} />
          )}
          {status === 'interrupted' ? (
            <small className="eg-muted">
              Interrupted when the app restarted; press the button again.
            </small>
          ) : null}
        </div>
      ))}
    </>
  );
}
