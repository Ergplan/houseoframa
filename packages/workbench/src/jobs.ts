// Work started by a button (rule 15: nobody types a command): refresh a site, photograph its screens, run
// its tests, call the audit, Test drive. A job runs in the app's own process and records each step as it
// finishes in work/.jobs/<id>.json, so a page can show progress, and a step that fails is a grey flag with
// a plain sentence and the builder's next action. One job of a kind runs per site at a time.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { workDir } from '@rama/blueprint/site';

export type JobKind = 'refresh' | 'photograph' | 'tests' | 'audit' | 'testdrive' | 'build';

export interface JobStep {
  name: string;
  /** null while the step runs. */
  ok: boolean | null;
  ms: number;
  /** What happened, in plain words. */
  sentence: string;
  /** When the step failed: what the builder does next. */
  next?: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  siteId: string | null;
  person: string;
  /** What the job made, when it made a site of its own (Test drive's sample product). */
  about?: string;
  startedAt: string;
  finishedAt: string | null;
  /** null while running. */
  ok: boolean | null;
  steps: JobStep[];
}

/** A step that fails with this error shows its sentence and next action as they are. */
export class StepError extends Error {
  override name = 'StepError';
  constructor(
    message: string,
    readonly next?: string,
  ) {
    super(message);
  }
}

/** Runs one step: its sentence on success; a thrown error ends the job with a grey flag. */
export type Step = (
  name: string,
  run: () => Promise<string> | string,
  next?: string,
) => Promise<void>;

const jobsDir = (env: NodeJS.ProcessEnv) => path.join(workDir(env), '.jobs');
const file = (id: string, env: NodeJS.ProcessEnv) => path.join(jobsDir(env), `${id}.json`);
const write = (job: Job, env: NodeJS.ProcessEnv) => {
  mkdirSync(jobsDir(env), { recursive: true });
  writeFileSync(file(job.id, env), JSON.stringify(job, null, 2) + '\n');
};

export function readJob(id: string, env: NodeJS.ProcessEnv = process.env): Job | null {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const f = file(id, env);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Job) : null;
}

/** The most recent job of a kind for a site (null site: not about one site), newest first. */
export function latestJob(
  kind: JobKind,
  siteId: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Job | null {
  const dir = jobsDir(env);
  if (!existsSync(dir)) return null;
  const jobs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Job)
    .filter((j) => j.kind === kind && j.siteId === siteId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return jobs[0] ?? null;
}

/**
 * Jobs still running in this process, by kind and site. Kept on globalThis: the app's routes and pages
 * may each load their own copy of this module, and they must see one registry.
 */
const g = globalThis as { __ramaJobs?: Map<string, Promise<Job>> };
const running = (g.__ramaJobs ??= new Map<string, Promise<Job>>());
const key = (kind: JobKind, siteId: string | null) => `${kind}:${siteId ?? ''}`;

/** How a job stands: one never finished and not running in this process was cut off by a restart. */
export function jobStatus(job: Job): 'running' | 'passed' | 'failed' | 'interrupted' {
  if (job.finishedAt) return job.ok ? 'passed' : 'failed';
  return running.has(key(job.kind, job.siteId)) ? 'running' : 'interrupted';
}

export interface StartedJob {
  job: Job;
  /** Settles when the job ends (tests await it; the app does not). */
  done: Promise<Job>;
}

/**
 * Starts a job unless one of the same kind is running for the site, in which case that one is returned.
 * `work` runs its steps through `step`; the job ends ok when every step did.
 */
export function startJob(
  input: { kind: JobKind; siteId: string | null; person: string },
  work: (step: Step, job: Job) => Promise<void>,
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): StartedJob {
  const k = key(input.kind, input.siteId);
  const already = running.get(k);
  if (already) {
    const job = latestJob(input.kind, input.siteId, env);
    if (job && job.finishedAt === null) return { job, done: already };
  }
  const job: Job = {
    id: randomUUID(),
    ...input,
    startedAt: now().toISOString(),
    finishedAt: null,
    ok: null,
    steps: [],
  };
  write(job, env);
  const step: Step = async (name, run, next) => {
    const s: JobStep = { name, ok: null, ms: 0, sentence: 'Working…' };
    job.steps.push(s);
    write(job, env);
    const t = Date.now();
    try {
      s.sentence = await run();
      s.ok = true;
    } catch (err) {
      s.ok = false;
      s.sentence = (err as Error).message || 'This step failed without saying why.';
      const n = err instanceof StepError ? err.next : next;
      if (n) s.next = n;
      throw err;
    } finally {
      s.ms = Date.now() - t;
      write(job, env);
    }
  };
  const done = (async () => {
    try {
      await work(step, job);
      job.ok = true;
    } catch (err) {
      job.ok = false;
      // A failure between steps still says what happened.
      if (job.steps.at(-1)?.ok !== false)
        job.steps.push({
          name: 'Stopped',
          ok: false,
          ms: 0,
          sentence: (err as Error)?.message || 'The work stopped without saying why.',
        });
    } finally {
      job.finishedAt = now().toISOString();
      write(job, env);
      running.delete(k);
    }
    return job;
  })();
  running.set(k, done);
  return { job, done };
}
