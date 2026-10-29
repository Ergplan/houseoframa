// A site's jobs as they run (Stage 12): GET jobs gives the latest job of each kind with its steps, so the
// page follows a build in place. The page reloaded itself every four seconds before, and a click on the
// picture was lost to the reload.
import type { SiteLocation } from '@rama/blueprint/site';
import type { Job, JobKind } from '@rama/workbench';

export const SITE_JOB_KINDS = ['build', 'refresh', 'photograph', 'tests', 'audit'] as const;

export interface JobsDeps {
  latest: (kind: JobKind, siteId: string) => Job | null;
  status: (job: Job) => 'running' | 'passed' | 'failed' | 'interrupted';
}

export interface SiteJob {
  kind: (typeof SITE_JOB_KINDS)[number];
  job: Job;
  status: ReturnType<JobsDeps['status']>;
}

export function siteJobs(site: SiteLocation, deps: JobsDeps): SiteJob[] {
  return SITE_JOB_KINDS.flatMap((kind) => {
    const job = deps.latest(kind, site.id);
    return job ? [{ kind, job, status: deps.status(job) }] : [];
  });
}

export function handleJobs(site: SiteLocation, deps: JobsDeps): Response {
  return Response.json({ ok: true, jobs: siteJobs(site, deps) });
}
